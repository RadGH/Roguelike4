import type { ActDef, EnemyDef, WeaponDef } from './types'

/**
 * Content registry: one source of truth for definitions, shared by the game,
 * the headless simulator, and the companion website. Content JSON is imported
 * and registered at startup; the sim only ever reads from here by id.
 */
export class Registry {
  readonly enemies = new Map<string, EnemyDef>()
  readonly weapons = new Map<string, WeaponDef>()
  readonly acts = new Map<string, ActDef>()

  registerEnemies(defs: EnemyDef[]): void {
    for (const d of defs) {
      if (this.enemies.has(d.id)) throw new Error(`duplicate enemy id: ${d.id}`)
      this.enemies.set(d.id, d)
    }
  }

  registerWeapons(defs: WeaponDef[]): void {
    for (const d of defs) {
      if (this.weapons.has(d.id)) throw new Error(`duplicate weapon id: ${d.id}`)
      this.weapons.set(d.id, d)
    }
  }

  registerActs(defs: ActDef[]): void {
    for (const d of defs) {
      if (this.acts.has(d.id)) throw new Error(`duplicate act id: ${d.id}`)
      this.acts.set(d.id, d)
    }
  }

  enemy(id: string): EnemyDef {
    const d = this.enemies.get(id)
    if (!d) throw new Error(`unknown enemy: ${id}`)
    return d
  }

  weapon(id: string): WeaponDef {
    const d = this.weapons.get(id)
    if (!d) throw new Error(`unknown weapon: ${id}`)
    return d
  }

  act(id: string): ActDef {
    const d = this.acts.get(id)
    if (!d) throw new Error(`unknown act: ${id}`)
    return d
  }
}
