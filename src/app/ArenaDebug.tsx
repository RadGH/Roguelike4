import { useEffect, useRef } from 'react'
import { Application, Container, Graphics } from 'pixi.js'
import { Sim, TICK_DT } from '../sim/core/sim'
import { loadContent } from '../sim/data/loadContent'
import { toScreen } from '../render/iso'

/**
 * Debug arena: the real sim rendered with gameplay-critical primitives only.
 * This is not placeholder art — bold flat shapes on the ground plane are the
 * permanent art direction for everything the player must react to.
 */
export function ArenaDebug(): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let destroyed = false
    const app = new Application()
    const keys = new Set<string>()

    const onKeyDown = (e: KeyboardEvent): void => { keys.add(e.key.toLowerCase()) }
    const onKeyUp = (e: KeyboardEvent): void => { keys.delete(e.key.toLowerCase()) }

    void app.init({ resizeTo: host, background: 0x1a1a22, antialias: true }).then(() => {
      if (destroyed) return
      host.appendChild(app.canvas)

      const registry = loadContent()
      const sim = new Sim(registry, { seed: Date.now() >>> 0, playerCount: 1 })
      sim.equipWeapon(0, 'practice-wand')
      sim.equipWeapon(0, 'practice-sword')
      const act = registry.act('act1')
      sim.startWave(act.waves, 1)

      const world = new Container()
      app.stage.addChild(world)
      const gGround = new Graphics()
      const gCritical = new Graphics()
      world.addChild(gGround, gCritical)

      window.addEventListener('keydown', onKeyDown)
      window.addEventListener('keyup', onKeyUp)

      let acc = 0
      app.ticker.add((t) => {
        // Input → move intent (keyboard now; first gamepad's left stick too).
        let mx = 0
        let my = 0
        if (keys.has('a') || keys.has('arrowleft')) mx -= 1
        if (keys.has('d') || keys.has('arrowright')) mx += 1
        if (keys.has('w') || keys.has('arrowup')) my -= 1
        if (keys.has('s') || keys.has('arrowdown')) my += 1
        const pads = navigator.getGamepads?.() ?? []
        const pad = pads.find((p) => p && p.connected)
        if (pad && (Math.abs(pad.axes[0]) > 0.2 || Math.abs(pad.axes[1]) > 0.2)) {
          mx = pad.axes[0]
          my = pad.axes[1]
        }
        // Screen-relative input mapped onto the iso ground plane.
        sim.setMoveIntent(0, my + mx, my - mx)

        // Fixed-step sim; render interpolation comes later.
        acc += t.deltaMS / 1000
        while (acc >= TICK_DT) {
          sim.tick()
          acc -= TICK_DT
          if (sim.waveSettled && sim.state.wave.number < sim.lastWaveNumber) {
            sim.startWave(act.waves, sim.state.wave.number + 1)
          }
        }

        // Camera: center on player 1 for now.
        const p0 = sim.state.players[0]
        const c = toScreen(p0.x, p0.y)
        world.x = app.screen.width / 2 - c.sx
        world.y = app.screen.height / 2 - c.sy

        // ---- draw ----
        gGround.clear()
        gCritical.clear()

        // Arena bounds on the ground plane.
        const { arenaW: aw, arenaH: ah } = sim.state
        const corners = [
          toScreen(-aw / 2, -ah / 2), toScreen(aw / 2, -ah / 2),
          toScreen(aw / 2, ah / 2), toScreen(-aw / 2, ah / 2),
        ]
        gGround.poly(corners.flatMap((k) => [k.sx, k.sy])).fill(0x24242e).stroke({ width: 2, color: 0x3a3a48 })

        // Pickups (reserved pickup hue).
        for (const pk of sim.state.pickups) {
          const s = toScreen(pk.x, pk.y)
          gCritical.circle(s.sx, s.sy, 5).fill(pk.kind === 'gold' ? 0xffd34d : 0x7ee3ff)
        }

        // Enemies: ground marker + body, outlined for overlap survival.
        for (const e of sim.state.enemies) {
          const def = registry.enemy(e.defId)
          const s = toScreen(e.x, e.y)
          const r = def.radius * 32
          gGround.ellipse(s.sx, s.sy, r + 3, (r + 3) / 2).fill({ color: 0x000000, alpha: 0.35 })
          const color =
            def.archetype === 'swarm' ? 0xd94f4f :
            def.archetype === 'chaser' ? 0xe08a3a :
            def.archetype === 'ranged' ? 0xb44fd9 : 0x4fd97a
          gCritical.circle(s.sx, s.sy - r / 2, r).fill(color).stroke({ width: 2, color: 0x000000 })
        }

        // Projectiles: plain bright circles, permanently.
        for (const pr of sim.state.projectiles) {
          const s = toScreen(pr.x, pr.y)
          gCritical.circle(s.sx, s.sy - 8, 4).fill(0xffffff).stroke({ width: 1, color: 0x000000 })
        }

        // Player: marker + body in the local-player reserved hue.
        for (const p of sim.state.players) {
          const s = toScreen(p.x, p.y)
          gGround.ellipse(s.sx, s.sy, 14, 7).fill({ color: 0x000000, alpha: 0.4 })
          gCritical.circle(s.sx, s.sy - 10, 11).fill(0x4da6ff).stroke({ width: 2.5, color: 0xffffff })
          // Health bar above (debug HUD; real HUD comes with M1).
          const w = 30
          gCritical.rect(s.sx - w / 2, s.sy - 34, w, 4).fill(0x000000)
          gCritical.rect(s.sx - w / 2, s.sy - 34, (w * p.health) / p.maxHealth, 4).fill(0x6dff6d)
        }
      })
    })

    return () => {
      destroyed = true
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      app.destroy(true, { children: true })
    }
  }, [])

  return <div ref={hostRef} style={{ position: 'fixed', inset: 0 }} data-testid="arena" />
}
