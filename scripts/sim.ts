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
const wavesArg = argOf('waves', '');
const policy = argOf('policy', 'kite') as 'kite' | 'brawl';
const seedBase = Number(argOf('seed', '1000'));
const players = Number(argOf('players', '1'));
const act = Number(argOf('act', '1'));
const campaign = args.includes('--campaign');
// --waves is absolute; without it the runner sweeps the chosen act's 10 waves
// (or all 40 with --campaign)
const untilWave = wavesArg ? Number(wavesArg) : undefined;

const reg = loadRegistry();
const classIds = only ? [only] : [...reg.classes.keys()];

console.log(
  `Sweep: ${runs} runs/class · act ${act} · ${players}p · waves ${untilWave ?? 'act'} · policy=${policy} · seedBase=${seedBase}\n`,
);
console.log(
  'class'.padEnd(14) +
    'clear%'.padStart(8) +
    'stall%'.padStart(8) +
    'avgWave'.padStart(9) +
    'avgLvl'.padStart(8) +
    'avgKills'.padStart(10) +
    'avgDmg'.padStart(10),
);

const GUARDRAIL = 0.6; // post-calibration target (human-representative pilots)
// v0 bot pilots: depth benchmark until human calibration (relative to the act's first wave)
const V0_WAVE_TARGET = (act - 1) * 10 + 6.5;
let failures = 0;
let v0failures = 0;
for (const classId of classIds) {
  const r = runBatch(classId, runs, seedBase, { untilWave, policy, players, act, campaign });
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
  if (r.avgWave < V0_WAVE_TARGET) v0failures++;
}
console.log(
  `\nv0 benchmark (bot pilots): every class avgWave ≥ ${V0_WAVE_TARGET} — ${v0failures === 0 ? 'PASS ✅' : `${v0failures} class(es) below ⚠️`}`,
);
console.log(
  `Full guardrail (post-calibration): ≥${GUARDRAIL * 100}% clear — ${failures === 0 ? 'PASS ✅' : `${failures} class(es) below (expected until human calibration)`}`,
);
console.log('(v0 bot policies are estimates, not human play — see design 13-simulation.md honesty clause)');
