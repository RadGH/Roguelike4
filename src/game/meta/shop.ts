// Town shop logic — pure functions over the profile, unit-testable, UI-agnostic.

import shopsJson from '@data/shops.json';
import type { Profile } from './profile';
import type { Grant } from '../data/schemas';

export type UpgradeDef = {
  id: string;
  name: string;
  desc: string;
  maxLevel: number;
  basePrice: number;
  pricePerLevel: number;
};

export const SHOPS = shopsJson as {
  schemaVersion: number;
  flick: { blurb: string; classes: { id: string; price: number }[] };
  cinder: { blurb: string; items: { id: string; price: number }[] };
  mayor: { blurb: string; upgrades: UpgradeDef[] };
};

export function upgradeLevel(profile: Profile, upgradeId: string): number {
  return profile.townUpgrades?.[upgradeId] ?? 0;
}

export function upgradePrice(def: UpgradeDef, currentLevel: number): number {
  return def.basePrice + def.pricePerLevel * currentLevel;
}

export type BuyResult = { ok: true } | { ok: false; reason: 'owned' | 'maxed' | 'poor' };

export function buyClass(profile: Profile, classId: string, price: number): BuyResult {
  if (profile.unlockedClasses.includes(classId)) return { ok: false, reason: 'owned' };
  if (profile.glimmers < price) return { ok: false, reason: 'poor' };
  profile.glimmers -= price;
  profile.unlockedClasses.push(classId);
  return { ok: true };
}

export function buyItem(profile: Profile, itemId: string, price: number): BuyResult {
  if (profile.unlockedItems.includes(itemId)) return { ok: false, reason: 'owned' };
  if (profile.glimmers < price) return { ok: false, reason: 'poor' };
  profile.glimmers -= price;
  profile.unlockedItems.push(itemId);
  return { ok: true };
}

export function buyUpgrade(profile: Profile, def: UpgradeDef): BuyResult {
  const level = upgradeLevel(profile, def.id);
  if (level >= def.maxLevel) return { ok: false, reason: 'maxed' };
  const price = upgradePrice(def, level);
  if (profile.glimmers < price) return { ok: false, reason: 'poor' };
  profile.glimmers -= price;
  profile.townUpgrades = { ...(profile.townUpgrades ?? {}), [def.id]: level + 1 };
  return { ok: true };
}

/** Convert purchased upgrades into run-start bonuses. */
export function townBonuses(profile: Profile): { grants: Grant[]; startBits: number } {
  const lvl = (id: string) => upgradeLevel(profile, id);
  const grants: Grant[] = [];
  if (lvl('startHp') > 0) grants.push({ stat: 'maxHp', flat: lvl('startHp') });
  if (lvl('startDamage') > 0) {
    for (const stat of [
      'meleeDamage',
      'rangedDamage',
      'fireDamage',
      'lightningDamage',
      'iceDamage',
      'poisonDamage',
      'arcaneDamage',
    ] as const) {
      grants.push({ stat, flat: lvl('startDamage') });
    }
  }
  if (lvl('startPickup') > 0) grants.push({ stat: 'pickupRadius', pct: 0.05 * lvl('startPickup') });
  return { grants, startBits: lvl('startBits') * 2 };
}
