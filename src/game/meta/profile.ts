// Save-slot profile: unlocks, deed progress, meta currency, lifetime stats.
// Storage is injectable (localStorage in the browser, a Map in tests).
// Keys are namespaced by branding.saveSlug — deliberately NOT the game title,
// so renaming the game never orphans saves.

import branding from '@data/branding.json';

export type Profile = {
  schemaVersion: number;
  slot: number;
  unlockedItems: string[];
  unlockedClasses: string[];
  unlockedFeats: string[];
  deedProgress: Record<string, number>;
  deedsCompleted: string[];
  glimmers: number;
  emberkeys: number;
  actsCleared: number[];
  endlessUnlocked: boolean;
  townUpgrades: Record<string, number>;
  lifetime: {
    runs: number;
    wins: number;
    kills: number;
    deepestWave: number;
  };
};

export type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const SLUG = (branding as { saveSlug?: string }).saveSlug ?? 'game';

export function freshProfile(slot = 1): Profile {
  return {
    schemaVersion: 1,
    slot,
    unlockedItems: [],
    unlockedClasses: ['hero'],
    unlockedFeats: [],
    deedProgress: {},
    deedsCompleted: [],
    glimmers: 0,
    emberkeys: 0,
    actsCleared: [],
    endlessUnlocked: false,
    townUpgrades: {},
    lifetime: { runs: 0, wins: 0, kills: 0, deepestWave: 0 },
  };
}

function key(slot: number): string {
  return `${SLUG}.profile.${slot}`;
}

export function loadProfile(storage: KeyValueStorage, slot = 1): Profile {
  const raw = storage.getItem(key(slot));
  if (!raw) return freshProfile(slot);
  try {
    const parsed = JSON.parse(raw) as Profile;
    if (typeof parsed.schemaVersion !== 'number') return freshProfile(slot);
    // Future migrations dispatch on schemaVersion here.
    return { ...freshProfile(slot), ...parsed, slot };
  } catch {
    return freshProfile(slot); // corrupted → fresh (the export/import path is the backup)
  }
}

export function saveProfile(storage: KeyValueStorage, profile: Profile): void {
  storage.setItem(key(profile.slot), JSON.stringify(profile));
}

export function exportProfile(profile: Profile): string {
  return JSON.stringify(profile, null, 2);
}

export function importProfile(json: string, slot: number): Profile {
  const parsed = JSON.parse(json) as Profile;
  if (typeof parsed.schemaVersion !== 'number') throw new Error('Not a valid save file');
  return { ...freshProfile(slot), ...parsed, slot };
}
