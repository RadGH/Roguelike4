// Perf stress: 4 players, deep endless wave, packed arena — measures sim tick cost.
// Run: npx tsx --tsconfig tsconfig.app.json scripts/bench.ts
import { Sim } from '../src/game/core/sim';
import { botInput } from '../src/game/sim/runner';
import { TICK_RATE } from '../src/game/core/constants';

const sim = new Sim(1234, 4, undefined, ['mage', 'hunter', 'necromancer', 'stormcaller']);
for (const id of sim.registry.feats.keys()) sim.unlockedFeats.add(id);
sim.startEndlessWave(55); // heavy scaling, big spawn counts
// pre-warm: let the arena fill up
for (let i = 0; i < TICK_RATE * 20; i++) {
  sim.tick(sim.state.players.map((p) => botInput(sim, p.index, 'kite')));
}
const alive = sim.state.enemies.filter((e) => e.alive).length;
const projectiles = sim.state.projectiles.filter((p) => p.active).length;
const t0 = performance.now();
const MEASURE = TICK_RATE * 30; // 30 sim-seconds
for (let i = 0; i < MEASURE; i++) {
  sim.tick(sim.state.players.map((p) => botInput(sim, p.index, 'kite')));
}
const ms = performance.now() - t0;
const perTick = ms / MEASURE;
console.log(`entities at start: ${alive} enemies, ${projectiles} projectiles, ${sim.state.pets.length} pets`);
console.log(`${MEASURE} ticks in ${ms.toFixed(0)}ms → ${perTick.toFixed(3)}ms/tick (budget: 33.3ms @ 30Hz)`);
console.log(`headroom: ${(33.33 / perTick).toFixed(0)}x realtime`);
