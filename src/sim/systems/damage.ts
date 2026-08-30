import type { DamageType } from '../data/tags'

/**
 * Defensive stats and the one damage-application path. Order of operations:
 * dodge (attacks only) → block → armor (diminishing) → flat reduction →
 * percent resistance. Void skips resistance entirely — it can be dodged and
 * blocked but never resisted or reduced by resistance.
 */

export interface Defenses {
  /** Percentage armor with diminishing returns: reduction = armor/(armor+K). */
  armor: number
  /** Flat amount subtracted per hit (after armor). */
  flatReduction: number
  /** 0..1 percent resistance applied last. Never applies to Void. */
  resist: number
  /** 0..1 chance to avoid an *attack* entirely. Not hazards. */
  dodge: number
  /** Flat block from shields, applied before armor. */
  block: number
}

export const ARMOR_K = 50 // armor 50 = 50% reduction; 100 = 66%; diminishing forever

export interface DamageResult {
  /** Damage actually applied after mitigation. */
  taken: number
  dodged: boolean
  /** Total amount mitigated by defenses (for attribution). */
  mitigated: number
}

export function emptyDefenses(): Defenses {
  return { armor: 0, flatReduction: 0, resist: 0, dodge: 0, block: 0 }
}

/**
 * Resolve incoming damage against defenses.
 * `isAttack` distinguishes attacks (dodgeable) from hazards/effects (not).
 * `dodgeRoll` is supplied by the caller from the seeded RNG so this stays pure.
 */
export function resolveDamage(
  amount: number,
  type: DamageType,
  d: Defenses,
  isAttack: boolean,
  dodgeRoll: number,
): DamageResult {
  if (isAttack && d.dodge > 0 && dodgeRoll < d.dodge) {
    return { taken: 0, dodged: true, mitigated: amount }
  }
  let dmg = amount
  if (isAttack && d.block > 0) dmg = Math.max(0, dmg - d.block)
  if (d.armor > 0) dmg *= 1 - d.armor / (d.armor + ARMOR_K)
  if (d.flatReduction > 0) dmg = Math.max(0, dmg - d.flatReduction)
  if (type !== 'Void' && d.resist > 0) dmg *= 1 - Math.min(0.9, d.resist)
  dmg = Math.max(0, dmg)
  return { taken: dmg, dodged: false, mitigated: amount - dmg }
}

/** XP required to go from `level` to `level + 1`. Coarse, whole-number curve. */
export function xpForLevel(level: number): number {
  return 10 + (level - 1) * 8
}
