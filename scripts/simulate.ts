import { formatReport, simulateBatch } from '../src/sim/meta/simulate'

/**
 * Balance batch runner. Usage:
 *   npm run simulate -- --runs 100 --players 1 --skill 0.6 --seed 1000 --class student
 */
function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const runs = Number(arg('runs', '60'))
const players = Number(arg('players', '1'))
const skill = Number(arg('skill', '0.6'))
const seed = Number(arg('seed', '1000'))
const cls = arg('class', 'student')

const started = Date.now()
const report = simulateBatch({
  runs,
  players,
  skill,
  seed,
  classIds: Array.from({ length: players }, () => cls),
})
console.log(formatReport(report))
console.log(`\n(${((Date.now() - started) / 1000).toFixed(1)}s wall clock)`)
