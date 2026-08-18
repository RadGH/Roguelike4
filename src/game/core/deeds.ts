// The deed engine: evaluates unlock requirements against the tracker + sim event
// streams. Pure core code — the live game, tests, and the simulator all use it.
// Progress is a plain serializable object owned by the profile.

import type { DeedDef } from '../data/schemas';
import type { TrackerEvent } from './tracker';
import type { SimEvent } from './sim';

export type DeedProgress = Record<string, number>;

export type DeedCompletion = {
  deedId: string;
  unlocks: DeedDef['unlocks'];
  glimmerBonus: number;
};

export class DeedEngine {
  constructor(
    private deeds: Map<string, DeedDef>,
    /** live view of progress; caller persists it */
    readonly progress: DeedProgress,
    readonly completed: Set<string>,
  ) {}

  /** Feed one tick's events. Returns any deeds completed this tick. */
  processTick(
    trackerEvents: readonly TrackerEvent[],
    simEvents: readonly SimEvent[],
    ctx: { maxGoldHeld: number },
  ): DeedCompletion[] {
    const out: DeedCompletion[] = [];
    // Precompute explosion multikill counts: kills sharing a hitId with explosion tag
    let explosionKills: Map<number, number> | null = null;
    const getExplosionKills = () => {
      if (!explosionKills) {
        explosionKills = new Map();
        for (const ev of trackerEvents) {
          if (ev.type === 'kill' && ev.source.deliveryTag === 'explosion') {
            explosionKills.set(ev.source.hitId, (explosionKills.get(ev.source.hitId) ?? 0) + 1);
          }
        }
      }
      return explosionKills;
    };

    for (const deed of this.deeds.values()) {
      if (this.completed.has(deed.id)) continue;
      let gained = 0;
      let absolute: number | null = null;
      const m = deed.match;
      switch (m.event) {
        case 'killWithType':
          for (const ev of trackerEvents) {
            if (ev.type === 'kill' && ev.source.actor.kind !== 'enemy' && ev.types.includes(m.type)) gained++;
          }
          break;
        case 'burnKill':
          for (const ev of trackerEvents) {
            if (ev.type === 'kill' && ev.source.grantedBy === 'burn') gained++;
          }
          break;
        case 'damageOfType':
          for (const ev of trackerEvents) {
            if (
              ev.type === 'damage' &&
              (ev.source.actor.kind === 'player' || ev.source.actor.kind === 'pet') &&
              ev.types.includes(m.type)
            ) {
              gained += ev.amount;
            }
          }
          break;
        case 'magicDamage': {
          const schools = ['fire', 'lightning', 'ice', 'poison', 'arcane'];
          for (const ev of trackerEvents) {
            if (
              ev.type === 'damage' &&
              (ev.source.actor.kind === 'player' || ev.source.actor.kind === 'pet') &&
              ev.types.some((t) => schools.includes(t))
            ) {
              gained += ev.amount;
            }
          }
          break;
        }
        case 'lifestealHealed':
          for (const ev of trackerEvents) {
            if (ev.type === 'heal' && ev.source.grantedBy === 'lifesteal') gained += ev.amount;
          }
          break;
        case 'lowHpWaveClear':
          for (const ev of simEvents) {
            if (ev.type === 'lowHpWaveClear') absolute = deed.target;
          }
          break;
        case 'explosionMultikill': {
          for (const [, count] of getExplosionKills()) {
            if (count >= deed.target) absolute = count;
          }
          break;
        }
        case 'goldHeld':
          absolute = ctx.maxGoldHeld;
          break;
        case 'dashThrough':
          for (const ev of simEvents) if (ev.type === 'dashThroughEnemy') gained++;
          break;
      }

      let value = this.progress[deed.id] ?? 0;
      if (absolute !== null) value = Math.max(value, absolute);
      if (gained > 0) value += gained;
      if (value !== (this.progress[deed.id] ?? 0)) this.progress[deed.id] = value;

      if (value >= deed.target) {
        this.completed.add(deed.id);
        out.push({ deedId: deed.id, unlocks: deed.unlocks, glimmerBonus: deed.glimmerBonus });
      }
    }
    return out;
  }
}
