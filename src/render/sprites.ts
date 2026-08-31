import { Assets, Texture } from 'pixi.js'
import playerUrl from '../../art/critical/player.svg'
import swarmUrl from '../../art/critical/swarm.svg'
import chaserUrl from '../../art/critical/chaser.svg'
import rangedUrl from '../../art/critical/ranged.svg'
import chargerUrl from '../../art/critical/charger.svg'
import exploderUrl from '../../art/critical/exploder.svg'
import flyerUrl from '../../art/critical/flyer.svg'
import blockerUrl from '../../art/critical/blocker.svg'
import burrowerUrl from '../../art/critical/burrower.svg'
import spawnerUrl from '../../art/critical/spawner.svg'
import retaliatorUrl from '../../art/critical/retaliator.svg'
import kingslimeUrl from '../../art/critical/kingslime.svg'
import goldUrl from '../../art/critical/gold.svg'
import xpUrl from '../../art/critical/xp.svg'
import wolfUrl from '../../art/critical/wolf.svg'
import ravenUrl from '../../art/critical/raven.svg'
import turretUrl from '../../art/critical/turret.svg'
import squireUrl from '../../art/critical/squire.svg'
import grasperUrl from '../../art/critical/grasper.svg'
import beaconUrl from '../../art/critical/beacon.svg'
import reflectorUrl from '../../art/critical/reflector.svg'
import wardenUrl from '../../art/critical/warden.svg'

/**
 * Gameplay-critical sprite textures, rasterized from the SVG files in
 * art/critical/. The art rules still hold: these are bold flat shapes with
 * hard outlines — the silhouette family IS the archetype, and detail beyond
 * that is forbidden on this layer.
 */

const ARCHETYPE_URL: Record<string, string> = {
  swarm: swarmUrl,
  chaser: chaserUrl,
  ranged: rangedUrl,
  charger: chargerUrl,
  exploder: exploderUrl,
  flyer: flyerUrl,
  blocker: blockerUrl,
  burrower: burrowerUrl,
  spawner: spawnerUrl,
  retaliator: retaliatorUrl,
}

/** Species overrides on top of the archetype body plan. */
const ENEMY_URL_OVERRIDE: Record<string, string> = {
  'kingslime-t1': kingslimeUrl,
  'kingslime-t2': kingslimeUrl,
  grasper: grasperUrl,
  beacon: beaconUrl,
  reflector: reflectorUrl,
  warden: wardenUrl,
}

const PET_URL: Record<string, string> = {
  wolf: wolfUrl,
  raven: ravenUrl,
  squire: squireUrl,
  'minigun-turret': turretUrl,
}

export interface CriticalTextures {
  player: Texture
  gold: Texture
  xp: Texture
  enemy: (defId: string, archetype: string) => Texture | null
  pet: (defId: string) => Texture | null
}

export async function loadCriticalTextures(): Promise<CriticalTextures> {
  const urls = [
    playerUrl, goldUrl, xpUrl,
    ...Object.values(ARCHETYPE_URL),
    ...Object.values(PET_URL),
    ...Object.values(ENEMY_URL_OVERRIDE),
  ]
  await Assets.load(urls.map((src) => ({ src, data: { resolution: 2 } })))
  const get = (url: string): Texture => Assets.get<Texture>(url)
  return {
    player: get(playerUrl),
    gold: get(goldUrl),
    xp: get(xpUrl),
    enemy: (defId, archetype) => {
      const url = ENEMY_URL_OVERRIDE[defId] ?? ARCHETYPE_URL[archetype]
      return url ? get(url) : null
    },
    pet: (defId) => {
      const url = PET_URL[defId]
      return url ? get(url) : null
    },
  }
}
