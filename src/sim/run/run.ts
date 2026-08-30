import { Sim } from '../core/sim'
import { Rng } from '../core/rng'
import type { Registry } from '../data/registry'
import type { OwnedPerk } from '../core/state'
import type { ActDef, PerkDef, WeaponDef } from '../data/types'
import { recomputePlayer } from '../systems/stats'
import type { RunSave } from './save'

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
  shop: ShopEntry[]
  rerollPrice: number
  /** Player pressed "ready" — waiting on the others. */
  done: boolean
}

const DRAFT_OPTIONS = 3
const SHOP_STOCK = 3
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

  constructor(
    readonly registry: Registry,
    opts: {
      seed: number
      playerCount: number
      actId: string
      classIds?: string[]
      /** Unlocked content ids; anything absent never appears in this run. */
      unlocked?: { weapons: string[]; perks: string[] }
      save?: RunSave
    },
  ) {
    this.pool = opts.unlocked
      ? { weapons: new Set(opts.unlocked.weapons), perks: new Set(opts.unlocked.perks) }
      : null
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
        p.perks = ps.perks.map((o) => ({ ...o }))
        p.items = [...(ps.items ?? [])]
        if (ps.equipment) this.sim.equipActive(ps.id, ps.equipment)
        if (ps.movement) this.sim.equipActive(ps.id, ps.movement)
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
        health: Math.max(1, Math.round(p.health)),
        perks: p.perks.map((o) => ({ ...o })),
        items: [...p.items],
        equipment: p.equipment?.defId ?? null,
        movement: p.movement?.defId ?? null,
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
      this.personal.set(p.id, {
        rewards: [],
        draft: p.pendingDrafts > 0 ? this.rollDraft(p.perks) : null,
        shop: this.rollShop(),
        rerollPrice: 10,
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
      const rollActive = actives.length > 0 && this.rngRun.chance(0.25)
      const id = rollActive ? this.rngRun.pick(actives).id : this.rngRun.pick(items).id
      this.personal.get(receiver.id)?.rewards.push({ itemId: id, resolved: null })
    }
  }

  /** Is a reward id a slot item rather than a passive? */
  isActive(id: string): boolean {
    return this.registry.actives.has(id)
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
        // Slots are exclusive: the replaced item is sold automatically.
        const old = def.slot === 'equipment' ? p.equipment : p.movement
        if (old) {
          p.gold += Math.round(this.registry.active(old.defId).price * SELL_FRACTION)
        }
        this.sim.equipActive(playerId, def.id)
      } else {
        p.gold += Math.round(def.price * SELL_FRACTION)
      }
      return
    }
    if (choice === 'kept') {
      p.items.push(entry.itemId)
      recomputePlayer(p, this.registry)
    } else {
      p.gold += Math.round(this.registry.item(entry.itemId).price * SELL_FRACTION)
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

  private rollShop(): ShopEntry[] {
    const weapons = [...this.registry.weapons.values()]
      .filter((w) => !this.pool || this.pool.weapons.has(w.id))
    const stock: ShopEntry[] = []
    for (let i = 0; i < SHOP_STOCK; i++) {
      const w = this.rngRun.pick(weapons)
      const tier = this.rollWeaponTier()
      stock.push({ weaponId: w.id, tier, price: this.priceFor(w, tier), sold: false })
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

  private priceFor(w: WeaponDef, tier: number): number {
    // Prices drift up slightly across the act so income keeps mattering.
    const waveScale = 1 + (this.sim.state.wave.number - 1) * 0.1
    const tierScale = 1 + tier * 0.7
    return Math.round(w.price * waveScale * tierScale)
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
  }

  reroll(playerId: number): void {
    const screen = this.personal.get(playerId)
    const p = this.sim.player(playerId)
    if (!screen || this.phase !== 'intermission') return
    if (p.gold < screen.rerollPrice) return
    p.gold -= screen.rerollPrice
    screen.shop = this.rollShop()
    screen.rerollPrice = Math.round(screen.rerollPrice * 1.5)
  }

  /** Player is done shopping. When everyone is done, the next wave starts. */
  setReady(playerId: number): void {
    const screen = this.personal.get(playerId)
    if (!screen || this.phase !== 'intermission') return
    // Rewards and drafts are mandatory decisions before readying.
    if (screen.draft) return
    if (screen.rewards.some((r) => !r.resolved)) return
    screen.done = true
    if ([...this.personal.values()].every((s) => s.done)) {
      this.advanceWave()
    }
  }

  private advanceWave(): void {
    const next = this.sim.state.wave.number + 1
    if (next > this.sim.lastWaveNumber) {
      this.phase = 'victory'
      return
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
    this.sim.startWave(this.act.waves, next)
  }

  weaponSlots(playerId: number): number {
    return this.registry.class(this.sim.player(playerId).classId).weaponSlots
  }

  /** Convenience for UIs and sim policies. */
  perkDef(id: string): PerkDef {
    return this.registry.perk(id)
  }
}
