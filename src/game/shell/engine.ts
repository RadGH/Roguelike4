// The engine shell: owns the Sim, the renderer, the input sampler, and the
// fixed-timestep accumulator loop. React mounts/unmounts this.

import { Sim, type ChestOffer, type PeddlerOffer } from '@game/core/sim';
import { resolveWeapon, TINKER_COST, nextQuality, type WeaponInstance } from '@game/core/items';
import { TICK_SECONDS } from '@game/core/constants';
import { neutralInput, type InputFrame } from '@game/core/input';
import { DeedEngine } from '@game/core/deeds';
import { loadProfile, saveProfile, type KeyValueStorage, type Profile } from '@game/meta/profile';
import { townBonuses } from '@game/meta/shop';
import { GameRenderer, takeSnapshot, type RenderSnapshot } from './renderer';
import { InputSampler } from './inputSources';
import { createDebugApi, type DebugApi } from '../debug/harness';
import { GAME_VERSION } from '@game/branding';

export class Engine {
  private sim: Sim;
  private renderer = new GameRenderer();
  private input = new InputSampler();
  private prevSnap: RenderSnapshot;
  private currSnap: RenderSnapshot;
  private accumulator = 0;
  private lastTime = 0;
  private running = false;
  private pausedByDebug = false;
  readonly debug: DebugApi;

  readonly profile: Profile;
  private profileStorage: KeyValueStorage;
  private deedEngine: DeedEngine;
  private maxGoldHeld = 0;
  private toasts: { id: number; text: string; until: number }[] = [];
  private nextToastId = 1;

  constructor(
    seed: number,
    playerCount = 1,
    storage: KeyValueStorage = window.localStorage,
    opts: { slot?: number; startAct?: number; classIds?: string[] } = {},
  ) {
    this.sim = new Sim(seed, playerCount, undefined, opts.classIds ?? []);
    if (opts.startAct && opts.startAct > 1) this.sim.setStartingAct(opts.startAct);
    this.profileStorage = storage;
    this.profile = loadProfile(storage, opts.slot ?? 1);
    this.sim.unlockedItems = new Set(this.profile.unlockedItems);
    this.sim.unlockedFeats = new Set(this.profile.unlockedFeats);
    const bonuses = townBonuses(this.profile);
    this.sim.setTownBonuses(bonuses.grants, bonuses.startBits);
    this.deedEngine = new DeedEngine(
      this.sim.registry.deeds,
      this.profile.deedProgress,
      new Set(this.profile.deedsCompleted),
      new Set(
        [...this.sim.registry.enemies.values()].filter((e) => e.archetype === 'mimic').map((e) => e.id),
      ),
    );
    this.prevSnap = takeSnapshot(this.sim);
    this.currSnap = takeSnapshot(this.sim);
    this.debug = createDebugApi(
      {
        snapshot: () => JSON.parse(JSON.stringify(this.sim.state)),
        screen: () => 'arena',
        step: (ticks: number, inputs: InputFrame[]) => {
          for (let i = 0; i < ticks; i++) this.stepOnce(inputs);
        },
        setPaused: (p: boolean) => {
          this.pausedByDebug = p;
        },
        cheat: (action: string) => {
          if (action === 'killAll') {
            for (const e of [...this.sim.state.enemies]) {
              this.sim.applyDamageToEnemy(
                e,
                { kind: 'spell', types: ['void'], multiplier: 0, flat: [0, 0], noCrit: true },
                null,
                {
                  actor: { kind: 'player', index: 0 },
                  itemId: 'debug',
                  grantedBy: 'cheat',
                  deliveryTag: 'explosion',
                  hitId: this.sim.tracker.newHitId(),
                },
                { rawOverride: 999999, noCrit: true },
              );
            }
          } else if (action === 'stopSpawns') {
            this.sim.state.spawning.queue.forEach((q) => (q.count = 0));
            this.sim.state.spawning.done = true;
          } else if (action === 'gotoBossWave') {
            this.clearIntermission();
            this.startWave(10);
          } else if (action.startsWith('grantXp:')) {
            this.sim.grantXpTo(0, Number(action.slice(8)) || 0);
          } else if (action.startsWith('grantGold:')) {
            for (const p of this.sim.state.players) p.gold += Number(action.slice(10)) || 0;
          } else if (action.startsWith('gotoWave:')) {
            this.clearIntermission();
            this.startWave(Number(action.slice(9)) || 1);
          } else if (action.startsWith('equip:')) {
            const [, weaponId, slotStr] = action.split(':');
            this.sim.replaceWeapon(0, Number(slotStr) || 0, weaponId!);
          } else if (action === 'addPlayer') {
            if (this.sim.state.players.length < 4) this.sim.addPlayer();
          } else if (action.startsWith('snuff:')) {
            const idx = Number(action.slice(6));
            const p = this.sim.state.players[idx];
            if (p) {
              p.hp = 0;
              p.alive = false;
            }
          } else if (action === 'snuffParty') {
            for (const p of this.sim.state.players) {
              p.hp = 0;
              p.alive = false;
            }
            this.runState = 'gameOver';
          }
        },
      },
      GAME_VERSION,
    );
  }

  private disposed = false;

  async mount(el: HTMLElement): Promise<void> {
    await this.renderer.init(el);
    if (this.disposed || !this.renderer.isReady) return;
    this.renderer.buildArena(this.sim.state.arena.width, this.sim.state.arena.height, this.sim.state.act);
    this.input.attach(el);
    this.input.playerScreenPos = (i) => this.renderer.playerScreenPos(i, this.currSnap);
    this.startWave(this.sim.firstWaveOfCurrentAct());
    window.addEventListener('gamepadconnected', this.onPadConnected);
    window.addEventListener('gamepaddisconnected', this.onPadDisconnected);
    this.running = true;
    this.lastTime = performance.now();
    this.renderer.app.ticker.add(() => this.frame());
  }

  private startWave(n: number): void {
    this.sim.startWaveNumber(n);
  }

  // ---- intermission (between waves) — per-player panels ----

  private intermissionActive = false;
  private boonChoices = new Map<number, string[]>();
  private featChoices = new Map<number, string[]>();
  private chestChoices = new Map<number, ChestOffer[]>();
  private pendingEquip = new Map<number, WeaponInstance>();
  private classEquipPending = new Set<number>();
  private peddlerStock = new Map<number, (PeddlerOffer & { sold?: boolean })[]>();
  private peddlerEquipPending = new Set<number>();
  private rerollsUsed = new Map<number, number>();

  /** Display info for a weapon instance: quality/variant label + effective numbers. */
  private instanceInfo(inst: WeaponInstance) {
    const r = resolveWeapon(this.sim.registry, inst);
    const base = this.weaponInfo(inst.itemId);
    const effects = r.effects.map((e) => e.kind).join(', ');
    return {
      id: inst.itemId,
      name: `${r.label ? r.label + ' ' : ''}${base.name}`,
      desc:
        `${r.hands}H ${r.kind} · ${Math.round(r.multiplier * 100)}% ${r.types.join('/')}` +
        (effects ? ` · ${effects}` : ''),
      kind: 'weapon' as const,
    };
  }

  private weaponInfo(id: string) {
    const name = id
      .split('-')
      .map((s) => (s ? s[0]!.toUpperCase() + s.slice(1) : s))
      .join(' ');
    const passive = this.sim.registry.passives.get(id);
    if (passive) return { id, name, desc: passive.desc, kind: 'passive' as const };
    const w = this.sim.registry.weapons.get(id);
    if (!w) return { id, name, desc: '', kind: 'weapon' as const };
    const effects = w.effects.map((e) => e.kind).join(', ');
    return {
      id,
      name,
      desc:
        `${w.hands}H ${w.kind} · ${Math.round(w.damage.multiplier * 100)}% ${w.damage.types.join('/')}` +
        (effects ? ` · ${effects}` : ''),
      kind: 'weapon' as const,
    };
  }

  private boonCount(playerIndex: number): number {
    const p = this.sim.state.players[playerIndex]!;
    return this.sim.hasMod(p, 'boonChoices5') ? 5 : 4;
  }

  /** Advance one player's intermission pipeline: class items → chests → boons. */
  private refreshIntermissionOffers(playerIndex: number): void {
    const p = this.sim.state.players[playerIndex]!;
    if (p.pendingClassItems.length > 0) return; // class choice panel shows first
    if (p.pendingChests > 0) {
      if (!this.chestChoices.has(playerIndex)) {
        this.chestChoices.set(playerIndex, this.sim.rollChestChoices(playerIndex, 3));
      }
    } else {
      this.chestChoices.delete(playerIndex);
      if (!this.classEquipPending.has(playerIndex)) this.pendingEquip.delete(playerIndex);
      if (p.pendingFeats > 0) {
        if (!this.featChoices.has(playerIndex)) {
          this.featChoices.set(playerIndex, this.sim.rollFeatChoices(playerIndex, 4));
        }
      } else if (p.pendingBoons > 0) {
        this.featChoices.delete(playerIndex);
        if (!this.boonChoices.has(playerIndex)) {
          this.boonChoices.set(playerIndex, this.sim.rollBoonChoices(this.boonCount(playerIndex)));
        }
      } else {
        this.featChoices.delete(playerIndex);
        this.boonChoices.delete(playerIndex);
      }
    }
  }

  chooseClassItem(playerIndex: number, weaponId: string): void {
    if (!this.intermissionActive) return;
    const p = this.sim.state.players[playerIndex];
    const options = p?.pendingClassItems[0];
    if (!p || !options?.includes(weaponId)) return;
    if (this.sim.equipWeapon(playerIndex, weaponId)) {
      p.pendingClassItems.shift();
      this.refreshIntermissionOffers(playerIndex);
    } else {
      // Hands full — pick something to replace
      this.pendingEquip.set(playerIndex, {
        itemId: weaponId,
        quality: 'standard',
        variant: null,
        holo: false,
        seedTag: 0,
      });
      this.classEquipPending.add(playerIndex);
    }
  }

  private openIntermission(): void {
    this.intermissionActive = true;
    for (const p of this.sim.state.players) {
      this.refreshIntermissionOffers(p.index);
      if (this.sim.peddlerVisiting()) {
        this.peddlerStock.set(p.index, this.sim.rollPeddlerStock(p.index));
      }
    }
  }

  private clearIntermission(): void {
    this.intermissionActive = false;
    this.boonChoices.clear();
    this.featChoices.clear();
    this.chestChoices.clear();
    this.pendingEquip.clear();
    this.classEquipPending.clear();
    this.peddlerStock.clear();
    this.peddlerEquipPending.clear();
    this.rerollsUsed.clear();
  }

  /** Chest reroll fee: grows with each reroll this intermission (gold sink). */
  rerollCost(playerIndex: number): number {
    const bal = this.sim.registry.balance.peddler;
    return bal.rerollCostBase + bal.rerollCostGrowth * (this.rerollsUsed.get(playerIndex) ?? 0);
  }

  /** Pay gold to re-roll the current chest offers. */
  rerollChest(playerIndex: number): void {
    if (!this.intermissionActive || !this.chestChoices.has(playerIndex)) return;
    if (this.pendingEquip.has(playerIndex)) return; // finish the equip decision first
    if (!this.sim.spendGold(playerIndex, this.rerollCost(playerIndex))) return;
    this.rerollsUsed.set(playerIndex, (this.rerollsUsed.get(playerIndex) ?? 0) + 1);
    this.chestChoices.set(playerIndex, this.sim.rollChestChoices(playerIndex, 3));
  }

  /** Buy from the Wandering Peddler. Weapons follow the normal equip/replace flow. */
  buyPeddler(playerIndex: number, offerIndex: number): void {
    if (!this.intermissionActive) return;
    const stock = this.peddlerStock.get(playerIndex);
    const offer = stock?.[offerIndex];
    if (!offer || offer.sold) return;
    if (this.pendingEquip.has(playerIndex)) return; // one equip decision at a time
    if (!this.sim.spendGold(playerIndex, offer.price)) return;
    offer.sold = true;
    if (offer.kind === 'snack') {
      this.sim.eatSnack(playerIndex);
    } else if (offer.kind === 'passive') {
      this.sim.addPassive(playerIndex, offer.id);
    } else if (!this.sim.equipWeapon(playerIndex, offer.inst)) {
      // Hands full — route through the standard replace picker
      this.pendingEquip.set(playerIndex, offer.inst);
      this.peddlerEquipPending.add(playerIndex);
    }
  }

  chooseChestOffer(playerIndex: number, offerIndex: number): void {
    const offer = this.chestChoices.get(playerIndex)?.[offerIndex];
    if (!this.intermissionActive || !offer) return;
    // Passives always fit; weapons equip straight away when hands are free.
    if (offer.kind === 'passive') {
      this.sim.addPassive(playerIndex, offer.id);
      this.finishChest(playerIndex);
    } else if (this.sim.equipWeapon(playerIndex, offer.inst)) {
      this.finishChest(playerIndex);
    } else {
      this.pendingEquip.set(playerIndex, offer.inst);
    }
  }

  /** Salvage the whole chest for Bits (tinkering material). */
  salvageForBits(playerIndex: number): void {
    if (!this.intermissionActive || !this.chestChoices.has(playerIndex)) return;
    const p = this.sim.state.players[playerIndex]!;
    p.bits += 2;
    this.finishChest(playerIndex);
  }

  tinker(playerIndex: number, slotIndex: number): void {
    if (!this.intermissionActive) return;
    this.sim.tinker(playerIndex, slotIndex);
  }

  cancelEquip(playerIndex: number): void {
    // A canceled Peddler purchase is refunded — nobody pays for air
    if (this.peddlerEquipPending.has(playerIndex)) {
      const inst = this.pendingEquip.get(playerIndex);
      const stock = this.peddlerStock.get(playerIndex);
      const entry = stock?.find((o) => o.kind === 'weapon' && o.sold && o.inst === inst);
      if (entry) {
        entry.sold = false;
        this.sim.state.players[playerIndex]!.gold += entry.price;
      }
      this.peddlerEquipPending.delete(playerIndex);
    }
    this.pendingEquip.delete(playerIndex);
    this.classEquipPending.delete(playerIndex);
  }

  equipReplace(playerIndex: number, slotIndex: number): void {
    const weaponId = this.pendingEquip.get(playerIndex);
    if (!this.intermissionActive || !weaponId) return;
    this.sim.replaceWeapon(playerIndex, slotIndex, weaponId);
    if (this.peddlerEquipPending.has(playerIndex)) {
      this.peddlerEquipPending.delete(playerIndex);
      this.pendingEquip.delete(playerIndex);
      this.refreshIntermissionOffers(playerIndex);
    } else if (this.classEquipPending.has(playerIndex)) {
      this.classEquipPending.delete(playerIndex);
      this.pendingEquip.delete(playerIndex);
      this.sim.state.players[playerIndex]!.pendingClassItems.shift();
      this.refreshIntermissionOffers(playerIndex);
    } else {
      this.finishChest(playerIndex);
    }
  }

  private finishChest(playerIndex: number): void {
    const p = this.sim.state.players[playerIndex]!;
    p.pendingChests = Math.max(0, p.pendingChests - 1);
    this.chestChoices.delete(playerIndex);
    this.pendingEquip.delete(playerIndex);
    this.refreshIntermissionOffers(playerIndex);
  }

  chooseFeat(playerIndex: number, featId: string): void {
    if (!this.intermissionActive || !this.featChoices.get(playerIndex)?.includes(featId)) return;
    this.sim.applyFeat(playerIndex, featId);
    this.featChoices.delete(playerIndex);
    this.refreshIntermissionOffers(playerIndex);
  }

  chooseBoon(playerIndex: number, boonId: string): void {
    if (!this.intermissionActive || !this.boonChoices.get(playerIndex)?.includes(boonId)) return;
    this.sim.applyBoon(playerIndex, boonId);
    const p = this.sim.state.players[playerIndex]!;
    if (p.pendingBoons > 0)
      this.boonChoices.set(playerIndex, this.sim.rollBoonChoices(this.boonCount(playerIndex)));
    else this.boonChoices.delete(playerIndex);
  }

  intermission() {
    if (!this.intermissionActive) return null;
    const shared = this.sim.state.players[0]!;
    return {
      wave: this.sim.state.wave,
      lastWaveOfAct: !this.sim.hasNextWave(),
      gold: shared.gold, // mirrored — same for everyone
      allDone: this.sim.state.players.every(
        (p) =>
          p.pendingBoons === 0 &&
          p.pendingChests === 0 &&
          p.pendingFeats === 0 &&
          p.pendingClassItems.length === 0,
      ),
      panels: this.sim.state.players.map((p) => {
        const chest = this.chestChoices.get(p.index);
        const equip = this.pendingEquip.get(p.index);
        const boons = this.boonChoices.get(p.index);
        const classOptions = p.pendingClassItems[0];
        return {
          player: p.index,
          classId: p.classId,
          className: this.sim.registry.classes.get(p.classId)?.name ?? p.classId,
          level: p.level,
          classChoice:
            classOptions && !this.classEquipPending.has(p.index)
              ? { options: classOptions.map((id) => this.weaponInfo(id)) }
              : null,
          classEquip: this.classEquipPending.has(p.index)
            ? {
                pendingEquip: this.instanceInfo(this.pendingEquip.get(p.index)!),
                currentWeapons: p.weapons.map((w, slot) => ({ slot, ...this.instanceInfo(w) })),
              }
            : null,
          kills: this.sim.tracker.killsByPlayer.get(p.index) ?? 0,
          damageTaken: Math.round(this.sim.tracker.damageTakenByPlayer.get(p.index) ?? 0),
          pendingBoons: p.pendingBoons,
          pendingChests: p.pendingChests,
          done:
            p.pendingBoons === 0 &&
            p.pendingChests === 0 &&
            p.pendingFeats === 0 &&
            p.pendingClassItems.length === 0,
          chest: chest
            ? {
                choices: chest.map((offer, idx) =>
                  offer.kind === 'passive'
                    ? { idx, ...this.weaponInfo(offer.id) }
                    : { idx, ...this.instanceInfo(offer.inst) },
                ),
                pendingEquip: equip ? this.instanceInfo(equip) : null,
                currentWeapons: p.weapons.map((w, slot) => ({ slot, ...this.instanceInfo(w) })),
              }
            : null,
          bits: p.bits,
          tinker: p.weapons.map((w, slot) => {
            const next = nextQuality(w.quality);
            return {
              slot,
              name: this.instanceInfo(w).name,
              next,
              cost: next ? TINKER_COST[w.quality] : null,
              affordable: next ? p.bits >= TINKER_COST[w.quality] : false,
            };
          }),
          featChoices:
            this.featChoices.get(p.index)?.map((id) => {
              const f = this.sim.registry.feats.get(id)!;
              return { id, name: f.name, desc: f.desc };
            }) ?? null,
          boonChoices:
            boons?.map((id) => {
              const b = this.sim.registry.boons.get(id)!;
              return { id, name: b.name, desc: b.desc };
            }) ?? null,
          rerollCost: chest ? this.rerollCost(p.index) : null,
          gold: p.gold,
          peddler:
            this.peddlerStock.get(p.index)?.map((o, idx) => ({
              idx,
              sold: !!o.sold,
              price: o.price,
              ...(o.kind === 'snack'
                ? { id: 'wax-snack', name: 'Wax Snack', desc: 'Heals to full. Tastes like birthdays.', kind: 'snack' as const }
                : o.kind === 'passive'
                  ? this.weaponInfo(o.id)
                  : this.instanceInfo(o.inst)),
            })) ?? null,
        };
      }),
    };
  }

  continueToNextWave(): void {
    if (!this.intermissionActive) return;
    const allDone = this.sim.state.players.every(
      (p) =>
        p.pendingBoons === 0 &&
        p.pendingChests === 0 &&
        p.pendingFeats === 0 &&
        p.pendingClassItems.length === 0,
    );
    if (!allDone) return; // resolve every player's rewards first
    this.clearIntermission();
    if (this.sim.state.endless) this.sim.startEndlessWave(this.sim.state.wave + 1);
    else if (this.sim.hasNextWave()) this.startWave(this.sim.state.wave + 1);
    // No next wave: runState is already 'victory' — nothing to start.
  }

  /** Small HUD summary for the React overlay (polled at low frequency). */
  hud() {
    const p = this.sim.state.players[0]!;
    const bossEnemy = this.sim.state.enemies.find((e) => e.alive && e.boss);
    const bossDef = bossEnemy ? this.sim.registry.enemies.get(bossEnemy.defId) : null;
    return {
      boss:
        bossEnemy && bossDef
          ? {
              name: bossDef.name ?? bossEnemy.defId,
              hpFrac: Math.max(0, bossEnemy.hp) / bossEnemy.maxHp,
              phase: bossEnemy.boss!.phaseIdx,
              notches: (bossDef.bossPhases ?? []).map((ph) => ph.until).filter((u) => u > 0),
            }
          : null,
      gold: p.gold, // mirrored — one value for the party
      wave: this.sim.state.wave,
      act: this.sim.state.act,
      endless: this.sim.state.endless,
      cleared: this.sim.state.phase === 'cleared',
      runState: this.runState,
      continueOption: this.continueOption,
      paused: this.userPaused,
      disconnectedPads: [...this.disconnectedPads],
      glimmers: this.profile.glimmers,
      toasts: this.toasts.filter((t) => t.until > performance.now()).map((t) => ({ id: t.id, text: t.text })),
      enemies: this.sim.aliveEnemyCount(),
      combo: this.sim.state.combo.count,
      players: this.sim.state.players.map((pl) => ({
        index: pl.index,
        hp: Math.ceil(pl.hp),
        maxHp: Math.ceil(pl.stats.maxHp ?? 10),
        level: pl.level,
        alive: pl.alive,
        chests: pl.pendingChests,
        kills: this.sim.tracker.killsByPlayer.get(pl.index) ?? 0,
        reviveFrac: pl.alive
          ? 0
          : Math.min(1, pl.reviveProgress / this.sim.registry.balance.coop.reviveHoldSeconds),
      })),
    };
  }

  /** playing → gameOver (party snuffed) | victory (act's last wave cleared) */
  runState: 'playing' | 'gameOver' | 'victory' = 'playing';
  private joinRequests = 0;
  /** User-facing pause (Esc/Start). Distinct from the debug pause. */
  userPaused = false;
  private disconnectedPads = new Set<number>();
  private onPadConnected = (e: Event) => {
    const idx = (e as GamepadEvent).gamepad?.index ?? -1;
    if (this.disconnectedPads.has(idx)) {
      this.disconnectedPads.delete(idx); // reconnect — stay paused, resume manually
      return;
    }
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean).length : 0;
    if (pads > this.sim.state.players.length && this.sim.state.players.length < 4) {
      this.joinRequests++;
    }
  };
  private onPadDisconnected = (e: Event) => {
    const idx = (e as GamepadEvent).gamepad?.index ?? -1;
    if (idx >= 0 && idx < this.sim.state.players.length && this.runState === 'playing') {
      this.disconnectedPads.add(idx);
      this.userPaused = true; // auto-pause: someone's controller died
    }
  };

  togglePause(): void {
    if (this.runState !== 'playing') return;
    this.userPaused = !this.userPaused;
  }

  quitToTitleRequested: (() => void) | null = null;

  private stepOnce(inputs: readonly InputFrame[]): void {
    this.prevSnap = this.currSnap;
    const trackerStart = this.sim.tracker.events.length;
    const events = this.sim.tick(inputs);
    for (const ev of events) {
      if (ev.type === 'damageNumber' && this.renderer.isReady) {
        this.renderer.spawnDamageNumber(ev.x, ev.y, ev.amount, ev.crit, ev.onPlayer);
      } else if (ev.type === 'secondWick') {
        this.pushToast(`🕯️ P${ev.player + 1}'s Second Wick catches! Not today, dark.`);
      } else if (ev.type === 'runOver') {
        this.runState = 'gameOver';
        this.recordRunEnd(false);
      } else if (ev.type === 'waveCleared' && !this.sim.hasNextWave()) {
        this.runState = 'victory';
        this.recordActClear(this.sim.state.act);
      }
    }

    // Deeds: evaluate this tick's event slice
    this.maxGoldHeld = Math.max(this.maxGoldHeld, this.sim.state.players[0]?.gold ?? 0);
    const completions = this.deedEngine.processTick(
      this.sim.tracker.events.slice(trackerStart),
      events,
      { maxGoldHeld: this.maxGoldHeld },
    );
    if (completions.length > 0) {
      for (const c of completions) {
        this.profile.glimmers += c.glimmerBonus;
        for (const u of c.unlocks) {
          if (u.type === 'weapon' && !this.profile.unlockedItems.includes(u.id)) {
            this.profile.unlockedItems.push(u.id);
            this.sim.unlockedItems.add(u.id);
            this.pushToast(`✨ Unlocked: ${this.weaponInfo(u.id).name}!`);
          } else if (u.type === 'class' && !this.profile.unlockedClasses.includes(u.id)) {
            this.profile.unlockedClasses.push(u.id);
            this.pushToast(`✨ New class unlocked: ${u.id}!`);
          } else if (u.type === 'feat' && !this.profile.unlockedFeats.includes(u.id)) {
            this.profile.unlockedFeats.push(u.id);
            this.sim.unlockedFeats.add(u.id);
            const featName = this.sim.registry.feats.get(u.id)?.name ?? u.id;
            this.pushToast(`⭐ New feat unlocked: ${featName}!`);
          }
        }
      }
      this.persistProfile();
    }
    this.currSnap = takeSnapshot(this.sim);
  }

  private pushToast(text: string): void {
    this.toasts.push({ id: this.nextToastId++, text, until: performance.now() + 4500 });
  }

  /** Set when a victory screen is showing: can this run press on? */
  continueOption: 'nextAct' | 'endless' | null = null;

  private recordActClear(act: number): void {
    const wasCleared = this.profile.actsCleared.includes(act);
    if (!wasCleared) {
      this.profile.actsCleared.push(act);
      this.profile.emberkeys++;
      this.profile.glimmers += 15; // first-clear bounty
      this.pushToast(`🔑 Emberkey earned — Act ${act} beacon relit!`);
      if (act === 4) {
        this.profile.endlessUnlocked = true;
        this.pushToast('🌒 Endless mode unlocked (from your next run onward)');
      }
    } else {
      this.profile.glimmers += 8; // repeat-clear bounty
    }
    // Continue rules (design): first-time clears end the run; a re-cleared act lets
    // the party press on. Endless entry likewise requires it was unlocked BEFORE.
    if (act < 4) this.continueOption = wasCleared ? 'nextAct' : null;
    else this.continueOption = wasCleared && this.profile.endlessUnlocked ? 'endless' : null;
    this.persistProfile();
  }

  continueRun(): void {
    if (this.runState !== 'victory' || !this.continueOption) return;
    if (this.continueOption === 'nextAct') {
      this.sim.advanceAct();
      this.renderer.setActTheme(this.sim.state.act);
    } else {
      this.sim.startEndlessWave(41);
    }
    this.continueOption = null;
    this.runState = 'playing';
    this.clearIntermission();
  }

  private recordRunEnd(won: boolean): void {
    this.profile.lifetime.runs++;
    if (won) this.profile.lifetime.wins++;
    this.profile.lifetime.kills += [...this.sim.tracker.killsByPlayer.values()].reduce((a, b) => a + b, 0);
    this.profile.lifetime.deepestWave = Math.max(this.profile.lifetime.deepestWave, this.sim.state.wave);
    this.persistProfile();
  }

  /** Victory-screen exit: the run ends here (stats recorded once). */
  finishRun(): void {
    this.recordRunEnd(this.sim.state.act === 4 && this.runState === 'victory');
  }

  private persistProfile(): void {
    this.profile.deedsCompleted = [...this.deedEngine.completed];
    saveProfile(this.profileStorage, this.profile);
  }

  /** Damage-meter drill-down for the recap panels. */
  meters(playerIndex = 0) {
    const items = this.sim.tracker.byPlayerItem.get(playerIndex);
    const rows = items
      ? [...items.entries()]
          .map(([itemId, agg]) => ({
            itemId,
            name: this.weaponInfo(itemId).name,
            total: Math.round(agg.total),
            hits: agg.hits,
            crits: agg.crits,
            max: Math.round(agg.max),
          }))
          .sort((a, b) => b.total - a.total)
      : [];
    const grandTotal = rows.reduce((a, r) => a + r.total, 0) || 1;
    return {
      rows: rows.map((r) => ({ ...r, share: r.total / grandTotal })),
      damageTaken: Math.round(this.sim.tracker.damageTakenByPlayer.get(playerIndex) ?? 0),
      dodgeSaves: this.sim.tracker.dodgeSavesByPlayer.get(playerIndex) ?? 0,
      kills: this.sim.tracker.killsByPlayer.get(playerIndex) ?? 0,
    };
  }

  private frame(): void {
    if (!this.running) return;
    const now = performance.now();
    let elapsed = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (elapsed > 0.25) elapsed = 0.25; // tab-back clamp

    // Pause toggle from any device (Esc / Start)
    if (this.input.consumePause()) this.togglePause();

    if (!this.pausedByDebug && !this.userPaused) {
      this.accumulator += elapsed;
      while (this.accumulator >= TICK_SECONDS) {
        const frames = this.input.sample(this.sim.state.players.length);
        this.stepOnce(frames.length ? frames : [neutralInput()]);
        this.accumulator -= TICK_SECONDS;
      }
      // Wave cleared → open the intermission (chests → boons → continue). The sim
      // keeps running so players can stroll and vacuum leftover pickups.
      if (this.sim.state.phase === 'cleared' && !this.intermissionActive && this.runState === 'playing') {
        // Hot-join lands at the wave boundary
        while (this.joinRequests > 0 && this.sim.state.players.length < 4) {
          this.sim.addPlayer();
          this.joinRequests--;
        }
        this.joinRequests = 0;
        this.openIntermission();
      }
    }
    const alpha = this.pausedByDebug ? 1 : this.accumulator / TICK_SECONDS;
    this.renderer.render(this.prevSnap, this.currSnap, alpha);
  }

  dispose(): void {
    this.disposed = true;
    this.running = false;
    window.removeEventListener('gamepadconnected', this.onPadConnected);
    window.removeEventListener('gamepaddisconnected', this.onPadDisconnected);
    this.input.dispose();
    this.renderer.dispose();
  }
}
