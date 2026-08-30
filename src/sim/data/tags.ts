/**
 * The tag vocabulary. Deliberately small — tags are read on quarter-screen
 * panels under time pressure, and the design treats ~22 as the practical
 * ceiling. Do not add a tag carried by only one thing.
 */
export const TAGS = [
  // Damage type
  'Melee', 'Ranged', 'Magic', 'Void', 'Pets',
  // Element (flavor + effects, NOT damage types)
  'Fire', 'Ice', 'Lightning', 'Poison',
  // Delivery
  'Area', 'Projectile', 'Chain', 'Aura', 'Trap',
  // Weapon class
  'Light', 'Heavy', 'Shield',
  // Theme (no inherent mechanics — exists for affinity/restriction)
  'Nature', 'Technology', 'Occult',
  // Function
  'Summon', 'Healing', 'Utility', 'Movement', 'Luck',
] as const

export type Tag = (typeof TAGS)[number]

export function isTag(s: string): s is Tag {
  return (TAGS as readonly string[]).includes(s)
}

/** Damage types are a closed set; elements are tags, not damage types. */
export const DAMAGE_TYPES = ['Melee', 'Ranged', 'Magic', 'Void', 'Pet'] as const
export type DamageType = (typeof DAMAGE_TYPES)[number]
