import { describe, expect, it } from 'vitest';
import { Sim } from './sim';
import { neutralInput } from './input';
import { TICK_RATE } from './constants';

function damageBossTo(sim: Sim, instance: number, hpFrac: number) {
  const boss = sim.getEnemyByInstance(instance)!;
  const targetHp = boss.maxHp * hpFrac;
  const amount = boss.hp - targetHp;
  if (amount <= 0) return;
  sim.applyDamageToEnemy(
    boss,
    { kind: 'spell', types: ['void'], multiplier: 0, flat: [0, 0], noCrit: true },
    null,
    {
      actor: { kind: 'player', index: 0 },
      itemId: 'test',
      grantedBy: null,
      deliveryTag: 'projectile',
      hitId: sim.tracker.newHitId(),
    },
    // Void ignores resists; boss armor still applies — overshoot generously then clamp
    { rawOverride: amount, noCrit: true },
  );
  // armor mitigation means we may not reach the target exactly; force for phase tests
  const b = sim.getEnemyByInstance(instance);
  if (b && b.alive && b.hp > targetHp) b.hp = targetHp;
}

describe('Mopsy boss', () => {
  it('spawns via wave 10 data and reports bossSpawned', () => {
    const sim = new Sim(3, 1);
    sim.startWaveNumber(10);
    let spawned = false;
    for (let t = 0; t < TICK_RATE * 2 && !spawned; t++) {
      const evs = sim.tick([neutralInput()]);
      if (evs.some((e) => e.type === 'bossSpawned' && e.defId === 'mopsy')) spawned = true;
    }
    expect(spawned).toBe(true);
  });

  it('changes phases at hp thresholds and summons in phase 2', () => {
    const sim = new Sim(3, 1);
    const boss = sim.spawnEnemy('mopsy', 20, 10);
    sim.state.phase = 'fighting';
    // Phase 0 at full hp
    sim.tick([neutralInput()]);
    expect(boss.boss!.phaseIdx).toBe(0);
    // Drop below 66% → phase 1 (summon)
    damageBossTo(sim, boss.instance, 0.6);
    let sawPhase1 = false;
    for (let t = 0; t < TICK_RATE && !sawPhase1; t++) {
      const evs = sim.tick([neutralInput()]);
      if (evs.some((e) => e.type === 'bossPhase' && e.phase === 1)) sawPhase1 = true;
    }
    expect(sawPhase1).toBe(true);
    // Summons appear
    let sawSummon = false;
    for (let t = 0; t < TICK_RATE * 8 && !sawSummon; t++) {
      sim.tick([neutralInput()]);
      if (sim.state.enemies.some((e) => e.defId === 'snuffling')) sawSummon = true;
    }
    expect(sawSummon).toBe(true);
    // Drop below 33% → phase 2 (frenzy)
    damageBossTo(sim, boss.instance, 0.2);
    let sawPhase2 = false;
    for (let t = 0; t < TICK_RATE && !sawPhase2; t++) {
      const evs = sim.tick([neutralInput()]);
      if (evs.some((e) => e.type === 'bossPhase' && e.phase === 2)) sawPhase2 = true;
    }
    expect(sawPhase2).toBe(true);
  });

  it('hop telegraphs, then lands with a shockwave that can hurt', () => {
    const sim = new Sim(9, 1);
    const p = sim.state.players[0]!;
    sim.spawnEnemy('mopsy', p.x + 5, p.y);
    sim.state.phase = 'fighting';
    let sawTelegraph = false;
    let tookDamage = false;
    for (let t = 0; t < TICK_RATE * 15 && !(tookDamage && sawTelegraph); t++) {
      const evs = sim.tick([neutralInput()]);
      if (evs.some((e) => e.type === 'chargeTelegraph')) sawTelegraph = true;
      if ((sim.tracker.damageTakenByPlayer.get(0) ?? 0) > 0) tookDamage = true;
    }
    expect(sawTelegraph).toBe(true);
    expect(tookDamage).toBe(true); // shockwave, spore ring, or contact — the boss threatens
  });
});

describe('weapon management', () => {
  it('rollWeaponChoices excludes equipped weapons and has no dupes', () => {
    const sim = new Sim(3, 1);
    const choices = sim.rollWeaponChoices(0, 3);
    expect(new Set(choices).size).toBe(choices.length);
    for (const id of choices) {
      expect(['shortsword', 'sling']).not.toContain(id);
    }
  });

  it('replaceWeapon swaps the slot and recomputes stats', () => {
    const sim = new Sim(3, 1);
    const p = sim.state.players[0]!;
    const before = p.stats.meleeDamage ?? 0;
    sim.replaceWeapon(0, 0, 'candlestick'); // shortsword (+3 melee) → candlestick (+2 fire)
    expect(p.weapons[0]!.itemId).toBe('candlestick');
    expect(p.stats.meleeDamage ?? 0).toBeLessThan(before);
    expect(p.stats.fireDamage ?? 0).toBeGreaterThan(0);
  });
});
