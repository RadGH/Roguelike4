import { describe, expect, it } from 'vitest';
import {
  exportProfile,
  freshProfile,
  importProfile,
  loadProfile,
  saveProfile,
  type KeyValueStorage,
} from './profile';

function memStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

describe('profile store', () => {
  it('fresh profile has hero unlocked and nothing else', () => {
    const p = freshProfile();
    expect(p.unlockedClasses).toEqual(['hero']);
    expect(p.unlockedItems).toEqual([]);
    expect(p.glimmers).toBe(0);
  });

  it('save/load roundtrip preserves everything', () => {
    const s = memStorage();
    const p = freshProfile(2);
    p.unlockedItems.push('fireball');
    p.deedProgress['burn-kills-25'] = 7;
    p.deedsCompleted.push('fire-kill-1');
    p.glimmers = 12;
    saveProfile(s, p);
    const loaded = loadProfile(s, 2);
    expect(loaded).toEqual(p);
  });

  it('separate slots are independent', () => {
    const s = memStorage();
    const p1 = freshProfile(1);
    p1.glimmers = 5;
    saveProfile(s, p1);
    const p2 = loadProfile(s, 2);
    expect(p2.glimmers).toBe(0);
  });

  it('corrupted storage falls back to a fresh profile', () => {
    const s = memStorage();
    s.setItem('everflame.profile.1', '{not json');
    expect(loadProfile(s, 1).glimmers).toBe(0);
  });

  it('export/import moves a profile between slots', () => {
    const p = freshProfile(1);
    p.glimmers = 99;
    const json = exportProfile(p);
    const imported = importProfile(json, 3);
    expect(imported.glimmers).toBe(99);
    expect(imported.slot).toBe(3);
  });

  it('import rejects garbage', () => {
    expect(() => importProfile('{"hello": true}', 1)).toThrow();
  });
});
