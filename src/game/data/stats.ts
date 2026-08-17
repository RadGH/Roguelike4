// THE stat registry — single source of truth for every stat key that can appear in
// data (class mods, item grants, affixes, boons). Unknown keys fail validation loudly
// at load time. (Predecessor lesson: a silent skip stranded 37 authored affixes.)

export const STAT_IDS = [
  // pools & sustain
  'maxHp',
  'hpRegen',
  'lifestealPhys',
  'lifestealMagic',
  // damage stats (weapons scale off these)
  'meleeDamage',
  'rangedDamage',
  'petDamage',
  'fireDamage',
  'lightningDamage',
  'iceDamage',
  'poisonDamage',
  'arcaneDamage',
  'voidDamage',
  // offense modifiers
  'critChance', // 0..1
  'critDamage', // additive over base 0.5
  'area', // % as multiplier delta (0 = 100%)
  'projectileSpeed',
  'cooldownRate',
  'duration',
  // defense
  'armor',
  'dodge', // 0..1, cap 0.6
  'blockPhys',
  'blockSpell',
  'resistAll',
  'resistFire',
  'resistLightning',
  'resistIce',
  'resistPoison',
  'resistArcane',
  'flatReduction',
  // mobility & utility
  'moveSpeed', // % delta (0 = 100%)
  'pickupRadius',
  'goldGain',
  'xpGain',
] as const;

export type StatId = (typeof STAT_IDS)[number];

export const DAMAGE_TYPES = [
  'melee',
  'ranged',
  'pet',
  'fire',
  'lightning',
  'ice',
  'poison',
  'arcane',
  'void',
] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

/** Which stat a damage type scales from. */
export const DAMAGE_STAT: Record<DamageType, StatId> = {
  melee: 'meleeDamage',
  ranged: 'rangedDamage',
  pet: 'petDamage',
  fire: 'fireDamage',
  lightning: 'lightningDamage',
  ice: 'iceDamage',
  poison: 'poisonDamage',
  arcane: 'arcaneDamage',
  void: 'voidDamage',
};

export const RESIST_STAT: Partial<Record<DamageType, StatId>> = {
  fire: 'resistFire',
  lightning: 'resistLightning',
  ice: 'resistIce',
  poison: 'resistPoison',
  arcane: 'resistArcane',
};

export function isStatId(s: string): s is StatId {
  return (STAT_IDS as readonly string[]).includes(s);
}
