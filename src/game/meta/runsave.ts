// Mid-run persistence: a compact resume snapshot written at every wave boundary,
// so a page reload (or crash, or toddler on the keyboard) never loses a run.
// Meters and exact enemy positions are NOT saved — the run resumes at the top of
// the saved wave with the full loadout, levels, and pending rewards intact.

import { SAVE_SLUG } from '@game/branding';
import type { WeaponInstance } from '@game/core/items';

export type RunSave = {
  schemaVersion: number;
  slot: number;
  seed: number;
  wave: number;
  act: number;
  endless: boolean;
  players: {
    classId: string;
    level: number;
    xp: number;
    xpIntoLevel: number;
    hp: number;
    gold: number;
    bits: number;
    weapons: WeaponInstance[];
    satchel: WeaponInstance[];
    passives: string[];
    feats: string[];
    boonIds: string[];
    pendingBoons: number;
    pendingChests: number;
    pendingFeats: number;
    pendingClassItems: string[][];
  }[];
};

const key = (slot: number) => `${SAVE_SLUG}.run.${slot}`;

export function saveRun(storage: Pick<Storage, 'setItem'>, save: RunSave): void {
  try {
    storage.setItem(key(save.slot), JSON.stringify(save));
  } catch {
    /* storage full/denied — the run continues, it just won't survive a reload */
  }
}

export function loadRunSave(storage: Pick<Storage, 'getItem'>, slot: number): RunSave | null {
  try {
    const raw = storage.getItem(key(slot));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RunSave;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.players) || parsed.players.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearRunSave(storage: Pick<Storage, 'removeItem'>, slot: number): void {
  try {
    storage.removeItem(key(slot));
  } catch {
    /* nothing to clear */
  }
}
