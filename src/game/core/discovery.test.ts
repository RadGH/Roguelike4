import { describe, it, expect } from 'vitest';
import { Sim } from './sim';
import { neutralInput } from './input';

describe('discovery rescues', () => {
  it('a cage can appear on mid-act waves and holding interact frees the prisoner', () => {
    // Seed-hunt: find a seed where Bumble's cage spawns in act 1
    let sim: Sim | null = null;
    for (let seed = 1; seed < 40 && !sim; seed++) {
      const s = new Sim(seed, 1);
      for (let w = 1; w <= 8; w++) {
        s.startWaveNumber(w);
        if (s.state.cages.length > 0) {
          sim = s;
          break;
        }
      }
    }
    expect(sim).toBeTruthy();
    const cage = sim!.state.cages[0]!;
    expect(cage.discoveryId).toBe('bumble');
    // teleport the player next to the cage and hold interact
    const p = sim!.state.players[0]!;
    p.x = cage.x + 1;
    p.y = cage.y;
    p.iframeTimer = 99999;
    let rescued = false;
    for (let i = 0; i < 90 && !rescued; i++) {
      const evs = sim!.tick([{ ...neutralInput(), interact: true }]);
      rescued = evs.some((e) => e.type === 'npcRescued' && e.discoveryId === 'bumble');
    }
    expect(rescued).toBe(true);
    expect(sim!.discoveredNpcs.has('bumble')).toBe(true);
  });

  it('rescued NPCs never cage again on that account', () => {
    for (let seed = 1; seed < 40; seed++) {
      const s = new Sim(seed, 1);
      s.discoveredNpcs.add('bumble');
      for (let w = 1; w <= 10; w++) s.startWaveNumber(w);
      expect(s.state.cages.length).toBe(0);
    }
  });
});
