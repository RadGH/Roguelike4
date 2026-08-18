// Item instances: a weapon in hand is {base id + quality + variant}, resolved
// deterministically into effective numbers. No RNG at resolve time — variant
// details derive from a seedTag rolled once at drop time, so the same instance
// always resolves identically (replay- and sim-safe).

import type { Grant, WeaponDef } from '../data/schemas';
import type { DamageType, StatId } from '../data/stats';
import type { Registry } from '../data/registry';

export type Quality = 'rusty' | 'standard' | 'fine' | 'superb' | 'masterwork';
export type VariantKind = 'corrupted' | 'cursed' | 'relic' | null;

export type WeaponInstance = {
  itemId: string;
  quality: Quality;
  variant: VariantKind;
  holo: boolean;
  seedTag: number; // deterministic source for variant details
};

export const QUALITY_MULT: Record<Quality, number> = {
  rusty: 0.8,
  standard: 1.0,
  fine: 1.15,
  superb: 1.3,
  masterwork: 1.5,
};

export const QUALITY_LABEL: Record<Quality, string> = {
  rusty: 'Rusty',
  standard: '',
  fine: 'Fine',
  superb: 'Superb',
  masterwork: 'Masterwork',
};

export const QUALITY_ORDER: Quality[] = ['rusty', 'standard', 'fine', 'superb', 'masterwork'];

/** Bits cost to move INTO the next tier. */
export const TINKER_COST: Record<Quality, number> = {
  rusty: 1, // rusty → standard
  standard: 2,
  fine: 3,
  superb: 5,
  masterwork: Infinity,
};

export function nextQuality(q: Quality): Quality | null {
  const i = QUALITY_ORDER.indexOf(q);
  return i >= 0 && i < QUALITY_ORDER.length - 1 ? QUALITY_ORDER[i + 1]! : null;
}

// Corruption: deterministic per-type remap — collectible, not noise. Physical
// weapons become SPELLS of the mapped school (a Corrupted Shortsword casts fire).
const TYPE_REMAP: Record<DamageType, DamageType> = {
  melee: 'fire',
  ranged: 'arcane',
  fire: 'ice',
  ice: 'lightning',
  lightning: 'arcane',
  poison: 'fire',
  arcane: 'poison',
  void: 'void',
  pet: 'pet',
};

const STAT_REMAP: Partial<Record<StatId, StatId>> = {
  meleeDamage: 'fireDamage',
  rangedDamage: 'arcaneDamage',
  fireDamage: 'iceDamage',
  iceDamage: 'lightningDamage',
  lightningDamage: 'arcaneDamage',
  poisonDamage: 'fireDamage',
  arcaneDamage: 'poisonDamage',
};

const CURSE_RIDERS: Grant[] = [
  { stat: 'maxHp', flat: -2 },
  { stat: 'moveSpeed', flat: -0.08 },
  { stat: 'dodge', flat: -0.02 },
  { stat: 'xpGain', flat: -0.1 },
];

const RELIC_EXTRAS: Grant[] = [
  { stat: 'critChance', flat: 0.03 },
  { stat: 'moveSpeed', flat: 0.05 },
  { stat: 'maxHp', flat: 3 },
  { stat: 'cooldownRate', flat: 0.06 },
  { stat: 'area', flat: 0.08 },
  { stat: 'dodge', flat: 0.02 },
  { stat: 'pickupRadius', pct: 0.15 },
];

export type ResolvedWeapon = {
  id: string;
  kind: 'attack' | 'spell';
  types: DamageType[];
  multiplier: number;
  flat: [number, number];
  grants: Grant[];
  effects: WeaponDef['effects'];
  delivery: WeaponDef['delivery'];
  hands: number;
  tags: string[];
  label: string; // display prefix parts, e.g. "✨ Corrupted Fine"
};

function scaleGrant(g: Grant, mult: number): Grant {
  return {
    stat: g.stat,
    ...(g.flat !== undefined ? { flat: g.flat * mult } : {}),
    ...(g.pct !== undefined ? { pct: g.pct * mult } : {}),
    ...(g.mult !== undefined ? { mult: g.mult } : {}),
  };
}

export function resolveWeapon(reg: Registry, inst: WeaponInstance): ResolvedWeapon {
  const base = reg.weapons.get(inst.itemId);
  if (!base) throw new Error(`Unknown weapon "${inst.itemId}"`);
  const power = QUALITY_MULT[inst.quality] * (inst.holo ? 1.05 : 1);

  let kind = base.kind;
  let types = [...base.damage.types];
  let grants = base.grants.map((g) => scaleGrant(g, power));
  const labelParts: string[] = [];

  if (inst.holo) labelParts.push('✨');
  if (inst.variant === 'corrupted') {
    labelParts.push('Corrupted');
    types = types.map((t) => TYPE_REMAP[t]);
    if (types.some((t) => !['melee', 'ranged'].includes(t))) kind = 'spell';
    grants = grants.map((g) => ({ ...g, stat: STAT_REMAP[g.stat] ?? g.stat }));
  } else if (inst.variant === 'cursed') {
    labelParts.push('Cursed');
    if (grants.length > 0) {
      const idx = inst.seedTag % grants.length;
      grants[idx] = scaleGrant(grants[idx]!, 1.5);
    }
    grants.push(CURSE_RIDERS[inst.seedTag % CURSE_RIDERS.length]!);
  } else if (inst.variant === 'relic') {
    labelParts.push('Relic');
    const extraCount = 1 + (inst.seedTag % 2);
    for (let i = 0; i < extraCount; i++) {
      grants.push(RELIC_EXTRAS[(inst.seedTag + i * 3) % RELIC_EXTRAS.length]!);
    }
  }
  const qLabel = QUALITY_LABEL[inst.quality];
  if (qLabel) labelParts.push(qLabel);

  return {
    id: inst.itemId,
    kind,
    types,
    multiplier: base.damage.multiplier * power,
    flat: [base.damage.flat[0] * power, base.damage.flat[1] * power],
    grants,
    effects: base.effects,
    delivery: base.delivery,
    hands: base.hands,
    tags: base.tags,
    label: labelParts.join(' '),
  };
}

export function standardInstance(itemId: string): WeaponInstance {
  return { itemId, quality: 'standard', variant: null, holo: false, seedTag: 0 };
}

export function rustyInstance(itemId: string): WeaponInstance {
  return { itemId, quality: 'rusty', variant: null, holo: false, seedTag: 0 };
}
