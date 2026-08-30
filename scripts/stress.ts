import { Sim, DENSITY_CAP, TICK_RATE } from '../src/sim/core/sim'
import { loadContent } from '../src/sim/data/loadContent'
import type { WaveDef } from '../src/sim/data/types'

/**
 * Sim-side stress benchmark: worst-case entity load (density cap of flocking
 * swarm enemies, 4 players, a stack of pets) measured in ticks per second.
 * The renderer has its own budget; this proves the simulation itself holds.
 * Usage: npm run stress
 */
const registry = loadContent()
const sim = new Sim(registry, { seed: 1, playerCount: 4 })
for (const p of sim.state.players) {
  p.maxHealth = 1000000
  p.health = 1000000
  sim.equipWeapon(p.id, 'practice-sword')
  sim.equipWeapon(p.id, 'practice-wand')
  p.items.push('turret-kit', 'summon-wolf', 'raven-pair')
}

const flood: WaveDef[] = [{
  wave: 1,
  groups: [
    { at: 0, enemy: 'nibbler', count: 300, spacing: 0 },
    { at: 0, enemy: 'scurrier', count: 60, spacing: 0 },
    { at: 0, enemy: 'spitter', count: 40, spacing: 0 },
  ],
}]
sim.startWave(flood, 1)
for (let i = 0; i < 60; i++) sim.tick() // let the field fill to the cap

console.log(`enemies on field: ${sim.state.enemies.length} (cap ${DENSITY_CAP})`)
console.log(`pets on field: ${sim.state.pets.length}`)

const TICKS = 3000
const start = performance.now()
for (let i = 0; i < TICKS; i++) sim.tick()
const elapsed = performance.now() - start
const perTick = elapsed / TICKS
console.log(`${TICKS} ticks in ${elapsed.toFixed(0)}ms — ${perTick.toFixed(3)}ms/tick`)
console.log(`headroom: game needs ${(1000 / TICK_RATE).toFixed(1)}ms/tick; ` +
  `sim uses ${((perTick * TICK_RATE) / 10).toFixed(1)}% of frame budget`)
if (perTick > 4) {
  console.error('WARNING: sim tick above 4ms at worst case — optimize before content grows')
  process.exit(1)
}
