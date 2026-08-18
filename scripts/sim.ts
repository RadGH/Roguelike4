// Balance sweep CLI: npm run sim -- [--runs 30] [--class hero] [--waves 10] [--policy kite]
// Runs the headless driver (the real game core) and prints the guardrail report.

import { runBatch } from '../src/game/sim/runner';
import { loadRegistry } from '../src/game/data/registry';

const args = process.argv.slice(2);
function argOf(name: string, fallback: string): string {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
}

const runs = Number(argOf('runs', '30'));
const only = argOf('class', '');
const untilWave = Number(argOf('waves', '10'));
const policy = argOf('policy', 'kite') as 'kite' | 'brawl';
const seedBase = Number(argOf('seed', '1000'));

const reg = loadRegistry();
const classIds = only ? [only] : [...reg.classes.keys()];

console.log(`Sweep: ${runs} runs/class · waves 1-${untilWave} · policy=${policy} · seedBase=${seedBase}\n`);
console.log(
  'class'.padEnd(14) +
    'clear%'.padStart(8) +
    'stall%'.padStart(8) +
    'avgWave'.padStart(9) +
    'avgLvl'.padStart(8) +
    'avgKills'.padStart(10) +
    'avgDmg'.padStart(10),
);

const GUARDRAIL = 0.6;
let failures = 0;
for (const classId of classIds) {
  const r = runBatch(classId, runs, seedBase, { untilWave, policy });
  const flag = r.clearRate < GUARDRAIL ? '  ⚠️' : '';
  console.log(
    classId.padEnd(14) +
      `${Math.round(r.clearRate * 100)}%`.padStart(8) +
      `${Math.round(r.stallRate * 100)}%`.padStart(8) +
      r.avgWave.toFixed(1).padStart(9) +
      r.avgLevel.toFixed(1).padStart(8) +
      r.avgKills.toFixed(0).padStart(10) +
      r.avgDamage.toFixed(0).padStart(10) +
      flag,
  );
  if (r.clearRate < GUARDRAIL) failures++;
}
console.log(
  `\nGuardrail: every class ≥${GUARDRAIL * 100}% Act-1 clear rate — ${failures === 0 ? 'PASS ✅' : `${failures} class(es) below target ⚠️`}`,
);
console.log('(v0 bot policies are estimates, not human play — see design 13-simulation.md honesty clause)');
