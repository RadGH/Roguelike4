import { Registry } from './registry'
import type { ActDef, EnemyDef, WeaponDef } from './types'
import enemiesAct1 from '../../content/enemies/act1.json'
import weaponsStarter from '../../content/weapons/starter.json'
import act1 from '../../content/acts/act1.json'

/** Build a registry with all shipped content. One call, one source of truth. */
export function loadContent(): Registry {
  const registry = new Registry()
  registry.registerEnemies(enemiesAct1 as EnemyDef[])
  registry.registerWeapons(weaponsStarter as WeaponDef[])
  registry.registerActs([act1 as ActDef])
  return registry
}
