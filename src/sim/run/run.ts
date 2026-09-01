import { Sim } from '../core/sim'
import { Rng } from '../core/rng'
import type { Registry } from '../data/registry'
import type { OwnedPerk } from '../core/state'
import type { ActDef, PerkDef, WaveDef, WeaponDef } from '../data/types'
import { recomputePlayer } from '../systems/stats'
import type { RunSave } from './save'
import { resolveItem, rollVariant, variantEligible } from '../data/variants'

/**
 * The run controller: everything above the arena tick. Owns the intermission
 * sequence (recap → drafts → shop → next wave), generates offers
 * deterministically, and applies player choices. Headless-capable — the UI
 * renders this state and calls the choice methods; Simulation Mode calls the
 * same methods with a policy instead of a human.
 */

export type RunPhase =
  | 'arena'
  | 'recap'
  | 'intermission' // personal screens: drafts then shop, simultaneous per player
  | 'victory'
  | 'defeat'

export interface PerkOffer {
  perkId: string
  /** 0-based tier index (White/Blue/Yellow/Green). */
  tier: number
}

export interface ShopEntry {
  weaponId: string
  /** Quality tier index — later shops stock better rolls. */
  tier: number
  price: number
  sold: boolean
}

/** An item found during the wave, unveiled at the rewards screen. */
export interface RewardEntry {
  itemId: string
  /** null = undecided; then 'kept' or 'sold'. */
  resolved: 'kept' | 'sold' | null
}

/** What one player's personal intermission currently shows. */
export interface PersonalScreen {
  /** Items found this wave (round-robin assigned), each kept or sold. */
  rewards: RewardEntry[]
  /** Draft offers for the current pending draft, or null when drafting is done. */
  draft: PerkOffer[] | null
  /** Class item grant: a free choice among signature items, or null. */
  grant: string[] | null
  shop: ShopEntry[]
  rerollPrice: number
  /** Player pressed "ready" — waiting on the others. */
  done: boolean
}

const DRAFT_OPTIONS = 3
const SHOP_STOCK = 4
const SELL_FRACTION = 0.5

export class Run {
  readonly sim: Sim
  phase: RunPhase = 'arena'
  /** Global pause: the arena freezes for everyone (menus, pad disconnect). */
  paused = false
  /** Per-player personal intermission state, indexed by player id. */
  personal = new Map<number, PersonalScreen>()
  private readonly rngRun: Rng
  private readonly act: ActDef

  /** Content available to this run (unlock gating). Null = everything. */
  private readonly pool: { weapons: Set<string>; perks: Set<string> } | null
  /** Round-robin loot pointer: items go to players in strict rotation. */
  private lootIndex = 0
  /**
   * Endless: after the act's final wave the run keeps going with generated,
   * escalating waves until everyone falls. A sandbox for extreme builds —
   * it deliberately yields no unlock progression.
   */
  readonly endless: boolean
  /** Waves beyond the authored act (generated on demand, deterministic). */
  private readonly extraWaves: WaveDef[] = []

  constructor(
    readonly registry: Registry,
    opts: {
      seed: number
      playerCount: number
      actId: string
      classIds?: string[]
      /** Unlocked content ids; anything absent never appears in this run. */
      unlocked?: { weapons: string[]; perks: string[] }
      endless?: boolean
      save?: RunSave
    },
  ) {
    this.pool = opts.unlocked
      ? { weapons: new Set(opts.unlocked.weapons), perks: new Set(opts.unlocked.perks) }
      : null
    this.endless = opts.endless ?? false
    this.sim = new Sim(registry, opts)
    this.rngRun = new Rng(opts.seed ^ 0x5eed).fork('run')
    this.act = registry.act(opts.actId)

    if (opts.save) {
      // Resume: rebuild every player's run-state, then start the next wave.
      for (const ps of opts.save.players) {
        const p = this.sim.player(ps.id)
        p.gold = ps.gold
        p.xp = ps.xp
        p.level = ps.level
        p.pendingDrafts = ps.pendingDrafts
        p.grantsClaimed = ps.grantsClaimed ?? 0
        p.perks = ps.perks.map((o) => ({ ...o }))
        p.items = [...(ps.items ?? [])]
        const savedActives = [
          ...(Array.isArray(ps.equipment) ? ps.equipment : ps.equipment ? [ps.equipment] : []),
          ...(Array.isArray(ps.movement) ? ps.movement : ps.movement ? [ps.movement] : []),
        ]
        for (const activeId of savedActives) this.sim.equipActive(ps.id, activeId)
        for (const w of ps.weapons) this.sim.equipWeapon(ps.id, w.defId, w.tier ?? 0)
        recomputePlayer(p, registry)
        p.health = Math.min(ps.health, p.maxHealth)
      }
      this.lootIndex = opts.save.lootIndex ?? 0
      this.sim.tracker.restore(opts.save.tracker)
      this.sim.startWave(this.act.waves, opts.save.nextWave)
      return
    }

    // Each class defines its starting kit — including slot items, which are
    // ordinary content the class simply begins with (findable, swappable).
    for (const p of this.sim.state.players) {
      const cls = registry.class(p.classId)
      for (const weaponId of cls.startingWeapons) {
        this.sim.equipWeapon(p.id, weaponId)
      }
      if (cls.startingEquipment) this.sim.equipActive(p.id, cls.startingEquipment)
      if (cls.startingMovement) this.sim.equipActive(p.id, cls.startingMovement)
      if (cls.startingItems) {
        p.items.push(...cls.startingItems)
        recomputePlayer(p, registry)
      }
    }
    this.sim.startWave(this.act.waves, 1)
  }

  /**
   * Snapshot the run for save-after-every-wave. Call at recap/intermission —
   * the resumed run begins at the NEXT wave with everyone alive.
   * `freshSeed` reseeds the resumed portion (the sim owns no clock).
   */
  serialize(freshSeed: number): RunSave {
    return {
      version: 1,
      actId: this.act.id,
      playerCount: this.sim.state.players.length,
      seed: freshSeed,
      nextWave: this.sim.state.wave.number + 1,
      players: this.sim.state.players.map((p) => ({
        id: p.id,
        classId: p.classId,
        gold: p.gold,
        xp: p.xp,
        level: p.level,
        pendingDrafts: p.pendingDrafts,
        grantsClaimed: p.grantsClaimed,
        health: Math.max(1, Math.round(p.health)),
        perks: p.perks.map((o) => ({ ...o })),
        items: [...p.items],
        equipment: p.equipment.map((slot) => slot.defId),
        movement: p.movement.map((slot) => slot.defId),
        weapons: p.weapons.map((w) => ({ defId: w.defId, tier: w.tier })),
      })),
      lootIndex: this.lootIndex,
      tracker: this.sim.tracker.snapshot(),
    }
  }

  static resume(
    registry: Registry,
    save: RunSave,
    unlocked?: { weapons: string[]; perks: string[] },
  ): Run {
    return new Run(registry, {
      seed: save.seed,
      playerCount: save.playerCount,
      actId: save.actId,
      classIds: save.players.map((p) => p.classId ?? 'student'),
      unlocked,
      save,
    })
  }

  /** Advance the arena; call once per fixed tick while in the arena phase. */
  tick(): void {
    if (this.phase !== 'arena' || this.paused) return
    this.sim.tick()

    // The run ends only when nobody is left standing — a single survivor
    // keeps it alive, and everyone else returns at the next wave clear.
    if (this.sim.activePlayers().length === 0) {
      this.phase = 'defeat'
      return
    }
    if (this.sim.waveSettled) {
      this.phase = 'recap'
    }
  }

  /** Leave the recap; builds every player's personal screens. */
  proceedFromRecap(): void {
    if (this.phase !== 'recap') return
    this.phase = 'intermission'
    this.personal.clear()
    for (const p of this.sim.state.players) {
      const cls = this.registry.class(p.classId)
      const nextGrant = cls.grants?.[p.grantsClaimed]
      this.personal.set(p.id, {
        rewards: [],
        draft: p.pendingDrafts > 0 ? this.rollDraft(p.perks) : null,
        grant: nextGrant && p.level >= nextGrant.level ? [...nextGrant.options] : null,
        shop: this.rollShop(p.id),
        rerollPrice: cls.freeReroll ? 0 : 10,
        done: false,
      })
    }
    // Unveil the wave's chests: items go to players round-robin, no scramble.
    // Most chests hold passives; some hold slot items (equipment/movement).
    const items = [...this.registry.items.values()]
    const actives = [...this.registry.actives.values()]
    const players = this.sim.state.players
    for (let i = 0; i < this.sim.state.wave.chestsDropped && items.length > 0; i++) {
      const receiver = players[this.lootIndex % players.length]
      this.lootIndex++
      const cls = this.registry.class(receiver.classId)
      // Class equip restrictions (the Beastmaster shuns Technology): barred
      // items never even appear for that player.
      const banned = cls.cannotEquipTags ?? []
      const pool = banned.length === 0 ? items
        : items.filter((it) => !it.tags.some((t) => (banned as string[]).includes(t)))
      const rollActive = actives.length > 0 && this.rngRun.chance(0.25)
      let id: string
      if (rollActive || pool.length === 0) {
        id = this.rngRun.pick(actives).id
      } else {
        // Drop weights: most items are 1; rarities like the Crystal Ball
        // roll well under that.
        const base = this.rngRun.weighted(pool, (it) => it.weight ?? 1)
        // The Gambler's luck: corrupt rewards appear far more often for them.
        const bias = cls.corruptBias ?? 1
        let variant = variantEligible(base) ? rollVariant(this.rngRun.next()) : null
        if (!variant && bias > 1 && variantEligible(base) &&
            this.rngRun.chance(Math.min(0.3, 0.07 * (bias - 1)))) {
          variant = 'corrupt'
        }
        // The Curator's eye: relics surface for them far more often.
        const rBias = cls.relicBias ?? 1
        if (!variant && rBias > 1 && variantEligible(base) &&
            this.rngRun.chance(Math.min(0.25, 0.05 * (rBias - 1)))) {
          variant = 'relic'
        }
        id = variant ? `${variant}:${base.id}` : base.id
      }
      this.personal.get(receiver.id)?.rewards.push({ itemId: id, resolved: null })
    }
  }

  /** Is a reward id a slot item rather than a passive? */
  isActive(id: string): boolean {
    return this.registry.actives.has(id)
  }

  /** Claim a class item grant: free, guaranteed identity, chosen not given. */
  pickGrant(playerId: number, index: number): void {
    const screen = this.personal.get(playerId)
    const p = this.sim.player(playerId)
    if (!screen?.grant || this.phase !== 'intermission') return
    const id = screen.grant[index]
    if (!id) return
    if (this.isActive(id)) {
      this.sim.equipActive(playerId, id)
    } else {
      p.items.push(id)
      recomputePlayer(p, this.registry)
    }
    p.grantsClaimed++
    screen.grant = null
  }

  /** Resolve a reward: keep it (equip the passive) or sell it for gold. */
  resolveReward(playerId: number, index: number, choice: 'kept' | 'sold'): void {
    const screen = this.personal.get(playerId)
    const p = this.sim.player(playerId)
    if (!screen || this.phase !== 'intermission') return
    const entry = screen.rewards[index]
    if (!entry || entry.resolved) return
    entry.resolved = choice
    if (this.isActive(entry.itemId)) {
      const def = this.registry.active(entry.itemId)
      if (choice === 'kept') {
        // Slots are exclusive: a replaced item is sold automatically. A class
        // with no slot of this kind gets the gold instead of a dead pickup.
        const result = this.sim.equipActive(playerId, def.id)
        if (!result.ok) {
          p.gold += Math.round(def.price * SELL_FRACTION)
        } else if (result.replaced) {
          p.gold += Math.round(this.registry.active(result.replaced).price * SELL_FRACTION)
        }
      } else {
        p.gold += Math.round(def.price * SELL_FRACTION)
      }
      return
    }
    if (choice === 'kept') {
      p.items.push(entry.itemId)
      recomputePlayer(p, this.registry)
    } else {
      p.gold += Math.round(resolveItem(this.registry, entry.itemId).price * SELL_FRACTION)
    }
  }

  private rollDraft(owned: OwnedPerk[]): PerkOffer[] {
    const all = [...this.registry.perks.values()]
      .filter((perk) => !this.pool || this.pool.perks.has(perk.id))
    // Prefer offering distinct perks; duplicates allowed once the pool thins.
    const pool = all.length >= DRAFT_OPTIONS ? this.rngRun.shuffle(all.slice()) : all
    void owned
    const offers: PerkOffer[] = []
    for (let i = 0; i < DRAFT_OPTIONS && i < pool.length; i++) {
      offers.push({ perkId: pool[i].id, tier: this.rollTier() })
    }
    return offers
  }

  /** Tier odds: common white, rare green. */
  private rollTier(): number {
    const r = this.rngRun.next()
    if (r < 0.55) return 0
    if (r < 0.85) return 1
    if (r < 0.97) return 2
    return 3
  }

  private rollShop(playerId: number): ShopEntry[] {
    const p = this.sim.player(playerId)
    const cls = this.registry.class(p.classId)
    const banned = cls.cannotEquipTags ?? []
    const weapons = [...this.registry.weapons.values()]
      .filter((w) => !this.pool || this.pool.weapons.has(w.id))
      .filter((w) => !w.tags.some((t) => (banned as string[]).includes(t)))
    // Build-weighted stock: lean toward tags the player already uses, so a
    // build develops rather than happens. A nudge, never a filter — every
    // weapon keeps a base weight, and the shop stays the pivot mechanism.
    const ownedTags = new Set<string>()
    for (const w of p.weapons) {
      for (const t of this.registry.weapon(w.defId).tags) ownedTags.add(t)
    }
    const stock: ShopEntry[] = []
    for (let i = 0; i < SHOP_STOCK; i++) {
      const w = this.rngRun.weighted(weapons, (weapon) => {
        const overlap = weapon.tags.filter((t) => ownedTags.has(t)).length
        return 1 + overlap * 0.4
      })
      const tier = this.rollWeaponTier()
      stock.push({ weaponId: w.id, tier, price: this.priceFor(w, tier, playerId), sold: false })
    }
    // The Merchant's stock always includes something worth buying: if no
    // entry reached the guaranteed tier, promote the first one to it.
    const floor = cls.shopGuaranteedTier
    if (floor !== undefined && stock.length > 0 && !stock.some((e) => e.tier >= floor)) {
      const e = stock[0]
      e.tier = floor
      e.price = this.priceFor(this.registry.weapon(e.weaponId), floor, playerId)
    }
    return stock
  }

  /** Tier odds improve with the wave: late shops sell real upgrades. */
  private rollWeaponTier(): number {
    const wave = this.sim.state.wave.number
    const r = this.rngRun.next()
    if (wave <= 2) return r < 0.9 ? 0 : 1
    if (wave <= 5) return r < 0.55 ? 0 : r < 0.9 ? 1 : 2
    if (wave <= 8) return r < 0.25 ? 0 : r < 0.65 ? 1 : r < 0.92 ? 2 : 3
    return r < 0.1 ? 0 : r < 0.45 ? 1 : r < 0.8 ? 2 : 3
  }

  /** Public quote (what would this weapon cost this player right now?). */
  priceQuote(playerId: number, weaponId: string, tier: number): number {
    return this.priceFor(this.registry.weapon(weaponId), tier, playerId)
  }

  private priceFor(w: WeaponDef, tier: number, playerId: number): number {
    // Prices drift up slightly across the act so income keeps mattering.
    const waveScale = 1 + (this.sim.state.wave.number - 1) * 0.1
    const tierScale = 1 + tier * 0.7
    // Personal price modifier (the Looter pays more).
    const cls = this.registry.class(this.sim.player(playerId).classId)
    const classScale = 1 + (cls.shopPricePct ?? 0) / 100
    return Math.round(w.price * waveScale * tierScale * classScale)
  }

  /** Perk pick for the player's current draft. */
  pickPerk(playerId: number, index: number): void {
    const screen = this.personal.get(playerId)
    const p = this.sim.player(playerId)
    if (!screen?.draft || this.phase !== 'intermission') return
    const offer = screen.draft[index]
    if (!offer) return
    p.perks.push({ perkId: offer.perkId, tier: offer.tier })
    p.pendingDrafts--
    recomputePlayer(p, this.registry)
    screen.draft = p.pendingDrafts > 0 ? this.rollDraft(p.perks) : null
  }

  buyWeapon(playerId: number, index: number): 'ok' | 'poor' | 'full' | 'invalid' {
    const screen = this.personal.get(playerId)
    const p = this.sim.player(playerId)
    if (!screen || this.phase !== 'intermission') return 'invalid'
    const entry = screen.shop[index]
    if (!entry || entry.sold) return 'invalid'
    if (p.gold < entry.price) return 'poor'
    if (p.weapons.length >= this.weaponSlots(playerId)) return 'full'
    p.gold -= entry.price
    entry.sold = true
    this.sim.equipWeapon(playerId, entry.weaponId, entry.tier)
    return 'ok'
  }

  /**
   * Buy a shop weapon while slots are full by replacing an equipped one.
   * The replaced weapon is sold for half — the equip prompt's backing logic.
   */
  buyReplacing(playerId: number, shopIndex: number, slotIndex: number): 'ok' | 'poor' | 'invalid' {
    const screen = this.personal.get(playerId)
    const p = this.sim.player(playerId)
    if (!screen || this.phase !== 'intermission') return 'invalid'
    const entry = screen.shop[shopIndex]
    const old = p.weapons[slotIndex]
    if (!entry || entry.sold || !old) return 'invalid'
    const refund = this.sellValue(old.defId, old.tier)
    if (p.gold + refund < entry.price) return 'poor'
    p.weapons.splice(slotIndex, 1)
    p.gold += refund - entry.price
    entry.sold = true
    this.sim.equipWeapon(playerId, entry.weaponId, entry.tier)
    return 'ok'
  }

  sellValue(weaponDefId: string, tier: number): number {
    const def = this.registry.weapon(weaponDefId)
    return Math.round(def.price * (1 + tier * 0.7) * SELL_FRACTION)
  }

  /** Sell an equipped weapon for half its base price. */
  sellWeapon(playerId: number, slotIndex: number): void {
    const p = this.sim.player(playerId)
    if (this.phase !== 'intermission') return
    const inst = p.weapons[slotIndex]
    if (!inst) return
    p.weapons.splice(slotIndex, 1)
    p.gold += this.sellValue(inst.defId, inst.tier)
    recomputePlayer(p, this.registry)
  }

  reroll(playerId: number): void {
    const screen = this.personal.get(playerId)
    const p = this.sim.player(playerId)
    if (!screen || this.phase !== 'intermission') return
    if (p.gold < screen.rerollPrice) return
    p.gold -= screen.rerollPrice
    screen.shop = this.rollShop(playerId)
    screen.rerollPrice = screen.rerollPrice === 0 ? 15 : Math.round(screen.rerollPrice * 1.5)
  }

  /** Player is done shopping. When everyone is done, the next wave starts. */
  setReady(playerId: number): void {
    const screen = this.personal.get(playerId)
    if (!screen || this.phase !== 'intermission') return
    // Rewards, drafts, and grants are mandatory decisions before readying.
    if (screen.draft) return
    if (screen.grant) return
    if (screen.rewards.some((r) => !r.resolved)) return
    screen.done = true
    if ([...this.personal.values()].every((s) => s.done)) {
      this.advanceWave()
    }
  }

  private advanceWave(): void {
    const next = this.sim.state.wave.number + 1
    if (next > this.sim.lastWaveNumber) {
      if (!this.endless) {
        this.phase = 'victory'
        return
      }
      this.extraWaves.push(this.buildEndlessWave(next))
    }
    // Everyone returns at the wave boundary (the wave-clear backstop),
    // and survivors recover a third of their health so a scraped-through
    // wave is a setback rather than a death spiral.
    for (const p of this.sim.state.players) {
      if (!p.alive || p.downed) {
        p.alive = true
        p.downed = false
        p.bleedOut = 0
        p.reviveProgress = 0
        p.health = Math.round(p.maxHealth / 2)
      } else {
        p.health = Math.min(p.maxHealth, Math.round(p.health + p.maxHealth * 0.34))
      }
    }
    this.phase = 'arena'
    this.sim.startWave([...this.act.waves, ...this.extraWaves], next)
  }

  /**
   * Generated endless waves: random pressure drawn from everything the game
   * has, escalating in volume and elite share, with a boss every fifth wave.
   * Deterministic from the run seed.
   */
  private buildEndlessWave(n: number): WaveDef {
    const depth = n - this.act.waves.length // grows from 1 past the authored act
    const scale = 1 + depth * 0.15
    const pool = [...this.registry.enemies.values()]
      .filter((e) => !e.boss && e.speed > 0)
    const groups: WaveDef['groups'] = []
    const groupCount = 4 + Math.min(3, Math.floor(depth / 3))
    let at = 1
    for (let g = 0; g < groupCount; g++) {
      const enemy = this.rngRun.pick(pool)
      const baseCount = enemy.radius < 0.3 ? 12 : enemy.radius > 0.7 ? 2 : 4
      groups.push({
        at,
        enemy: enemy.id,
        count: Math.max(1, Math.round(baseCount * scale)),
        spacing: enemy.radius < 0.3 ? 0.25 : 1.5,
        elite: this.rngRun.chance(Math.min(0.5, 0.1 + depth * 0.04))
          ? (this.rngRun.chance(0.5) ? 'enlarged' : 'resistant')
          : undefined,
      })
      at += 8 + this.rngRun.int(0, 6)
    }
    if (n % 5 === 0) {
      const bosses = [...this.registry.enemies.values()]
        .filter((e) => e.boss && (e.splitTo || e.spawnId))
      if (bosses.length > 0) {
        groups.push({ at: at + 4, enemy: this.rngRun.pick(bosses).id, count: 1 })
      }
    }
    return { wave: n, groups }
  }

  weaponSlots(playerId: number): number {
    return this.registry.class(this.sim.player(playerId).classId).weaponSlots
  }

  /** Convenience for UIs and sim policies. */
  perkDef(id: string): PerkDef {
    return this.registry.perk(id)
  }

  get actId(): string {
    return this.act.id
  }

  /**
   * Hot-join mid-run: the newcomer gets their class's starting kit and half
   * health, and shares the run from the next moment on. Capped at four.
   */
  joinPlayer(classId = 'student'): boolean {
    if (this.sim.state.players.length >= 4) return false
    if (this.phase === 'victory' || this.phase === 'defeat') return false
    const p = this.sim.addPlayerMidRun(classId)
    const cls = this.registry.class(classId)
    for (const weaponId of cls.startingWeapons) this.sim.equipWeapon(p.id, weaponId)
    if (cls.startingEquipment) this.sim.equipActive(p.id, cls.startingEquipment)
    if (cls.startingMovement) this.sim.equipActive(p.id, cls.startingMovement)
    if (cls.startingItems) {
      p.items.push(...cls.startingItems)
      recomputePlayer(p, this.registry)
    }
    // If they join during an intermission, give them their screens too.
    if (this.phase === 'intermission') {
      this.personal.set(p.id, {
        rewards: [],
        draft: null,
        grant: null,
        shop: [],
        rerollPrice: 10,
        done: true,
      })
    }
    return true
  }

  /** Effective item definition, variant-aware. UIs should use this. */
  itemDef(id: string): ReturnType<typeof resolveItem> {
    return resolveItem(this.registry, id)
  }
}
