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
  price: number
  sold: boolean
}

/** What one player's personal intermission currently shows. */
export interface PersonalScreen {
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
  /** Per-player personal intermission state, indexed by player id. */
  personal = new Map<number, PersonalScreen>()
  private readonly rngRun: Rng
  private readonly act: ActDef

  constructor(
    readonly registry: Registry,
    opts: { seed: number; playerCount: number; actId: string; save?: RunSave },
  ) {
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
        for (const weaponId of ps.weapons) this.sim.equipWeapon(ps.id, weaponId)
        recomputePlayer(p, registry)
        p.health = Math.min(ps.health, p.maxHealth)
      }
      this.sim.tracker.restore(opts.save.tracker)
      this.sim.startWave(this.act.waves, opts.save.nextWave)
      return
    }

    // Starting kit until classes arrive: one wand. (Loadout screens are M2+.)
    for (const p of this.sim.state.players) {
      this.sim.equipWeapon(p.id, 'practice-wand')
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
        gold: p.gold,
        xp: p.xp,
        level: p.level,
        pendingDrafts: p.pendingDrafts,
        health: Math.max(1, Math.round(p.health)),
        perks: p.perks.map((o) => ({ ...o })),
        weapons: p.weapons.map((w) => w.defId),
      })),
      tracker: this.sim.tracker.snapshot(),
    }
  }

  static resume(registry: Registry, save: RunSave): Run {
    return new Run(registry, {
      seed: save.seed,
      playerCount: save.playerCount,
      actId: save.actId,
      save,
    })
  }

  /** Advance the arena; call once per fixed tick while in the arena phase. */
  tick(): void {
    if (this.phase !== 'arena') return
    this.sim.tick()

    if (this.sim.state.players.every((p) => !p.alive)) {
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
        draft: p.pendingDrafts > 0 ? this.rollDraft(p.perks) : null,
        shop: this.rollShop(),
        rerollPrice: 10,
        done: false,
      })
    }
  }

  private rollDraft(owned: OwnedPerk[]): PerkOffer[] {
    const all = [...this.registry.perks.values()]
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
    const stock: ShopEntry[] = []
    for (let i = 0; i < SHOP_STOCK; i++) {
      const w = this.rngRun.pick(weapons)
      stock.push({ weaponId: w.id, price: this.priceFor(w), sold: false })
    }
    return stock
  }

  private priceFor(w: WeaponDef): number {
    // Prices drift up slightly across the act so income keeps mattering.
    const waveScale = 1 + (this.sim.state.wave.number - 1) * 0.1
    return Math.round(w.price * waveScale)
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
    this.sim.equipWeapon(playerId, entry.weaponId)
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
    const refund = Math.round(this.registry.weapon(old.defId).price * SELL_FRACTION)
    if (p.gold + refund < entry.price) return 'poor'
    p.weapons.splice(slotIndex, 1)
    p.gold += refund - entry.price
    entry.sold = true
    this.sim.equipWeapon(playerId, entry.weaponId)
    return 'ok'
  }

  /** Sell an equipped weapon for half its base price. */
  sellWeapon(playerId: number, slotIndex: number): void {
    const p = this.sim.player(playerId)
    if (this.phase !== 'intermission') return
    const inst = p.weapons[slotIndex]
    if (!inst) return
    const def = this.registry.weapon(inst.defId)
    p.weapons.splice(slotIndex, 1)
    p.gold += Math.round(def.price * SELL_FRACTION)
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
    // Drafts are mandatory: a banked level-up must be spent before readying.
    if (screen.draft) return
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
    // Everyone returns at the wave boundary (the wave-clear backstop).
    for (const p of this.sim.state.players) {
      if (!p.alive) {
        p.alive = true
        p.health = Math.round(p.maxHealth / 2)
      }
    }
    this.phase = 'arena'
    this.sim.startWave(this.act.waves, next)
  }

  weaponSlots(_playerId: number): number {
    return 2 // class trait later; Student baseline for now
  }

  /** Convenience for UIs and sim policies. */
  perkDef(id: string): PerkDef {
    return this.registry.perk(id)
  }
}
