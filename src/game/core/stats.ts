// Stat sheets: built from base stats + modifier grants, recomputed from state
// (never incrementally mutated — predecessor buff double-apply scar).
// Stacking: (base + Σflat) × (1 + Σpct) × Πmult

import type { Grant } from '../data/schemas';
import type { StatId } from '../data/stats';

export type StatSheet = Partial<Record<StatId, number>>;

export function buildStats(base: StatSheet, grantSets: readonly (readonly Grant[])[]): StatSheet {
  const flat: StatSheet = {};
  const pct: StatSheet = {};
  const mult: StatSheet = {};
  for (const grants of grantSets) {
    for (const g of grants) {
      if (g.flat) flat[g.stat] = (flat[g.stat] ?? 0) + g.flat;
      if (g.pct) pct[g.stat] = (pct[g.stat] ?? 0) + g.pct;
      if (g.mult) mult[g.stat] = (mult[g.stat] ?? 1) * g.mult;
    }
  }
  const out: StatSheet = {};
  const keys = new Set<StatId>([
    ...(Object.keys(base) as StatId[]),
    ...(Object.keys(flat) as StatId[]),
    ...(Object.keys(pct) as StatId[]),
    ...(Object.keys(mult) as StatId[]),
  ]);
  for (const k of keys) {
    out[k] = ((base[k] ?? 0) + (flat[k] ?? 0)) * (1 + (pct[k] ?? 0)) * (mult[k] ?? 1);
  }
  return out;
}

export function stat(sheet: StatSheet, id: StatId): number {
  return sheet[id] ?? 0;
}
