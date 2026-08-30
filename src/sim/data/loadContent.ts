import { Registry } from './registry'
import type { ActDef, ActiveDef, ClassDef, EnemyDef, ItemDef, PerkDef, UnlockDef, WeaponDef } from './types'
import enemiesAct1 from '../../content/enemies/act1.json'
import weaponsStarter from '../../content/weapons/starter.json'
import act1 from '../../content/acts/act1.json'
import perksCore from '../../content/perks/core.json'
import classesCore from '../../content/classes/core.json'
import unlocksCore from '../../content/unlocks/core.json'
import itemsCore from '../../content/items/core.json'
import activesCore from '../../content/actives/core.json'

/** Build a registry with all shipped content. One call, one source of truth. */
export function loadContent(): Registry {
  const registry = new Registry()
  registry.registerEnemies(enemiesAct1 as EnemyDef[])
  registry.registerWeapons(weaponsStarter as WeaponDef[])
  registry.registerActs([act1 as ActDef])
  registry.registerPerks(perksCore as PerkDef[])
  registry.registerClasses(classesCore as ClassDef[])
  registry.registerUnlocks(unlocksCore as UnlockDef[])
  registry.registerItems(itemsCore as ItemDef[])
  registry.registerActives(activesCore as ActiveDef[])
  return registry
}
