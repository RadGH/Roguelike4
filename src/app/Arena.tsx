import { useEffect, useRef } from 'react'
import { Application, Container, Graphics, Text } from 'pixi.js'
import { TICK_DT, TICK_RATE } from '../sim/core/sim'
import type { Run } from '../sim/run/run'
import { toScreen } from '../render/iso'

/**
 * The arena canvas. Renders the run's sim with gameplay-critical primitives —
 * bold flat shapes on the ground plane, permanently (two-layer art rule).
 *
 * Readability debug views (dev tool): F1 normal · F2 markers-only · F3 silhouette.
 */
type DebugView = 'normal' | 'markers' | 'silhouette'

export function Arena({ run }: { run: Run }): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const runRef = useRef(run)
  runRef.current = run

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let destroyed = false
    const app = new Application()
    const keys = new Set<string>()
    let view: DebugView = 'normal'

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'F1') { view = 'normal'; e.preventDefault(); return }
      if (e.key === 'F2') { view = 'markers'; e.preventDefault(); return }
      if (e.key === 'F3') { view = 'silhouette'; e.preventDefault(); return }
      keys.add(e.key.toLowerCase())
    }
    const onKeyUp = (e: KeyboardEvent): void => { keys.delete(e.key.toLowerCase()) }

    void app.init({ resizeTo: host, background: 0x1a1a22, antialias: true }).then(() => {
      if (destroyed) return
      host.appendChild(app.canvas)

      const world = new Container()
      app.stage.addChild(world)
      const gGround = new Graphics()
      const gTelegraph = new Graphics()
      const gCritical = new Graphics()
      world.addChild(gGround, gTelegraph, gCritical)

      const hud = new Text({
        text: '',
        style: { fill: 0xffffff, fontSize: 15, fontFamily: 'monospace' },
      })
      hud.position.set(12, 10)
      app.stage.addChild(hud)

      window.addEventListener('keydown', onKeyDown)
      window.addEventListener('keyup', onKeyUp)

      let acc = 0
      app.ticker.add((t) => {
        const currentRun = runRef.current
        const sim = currentRun.sim
        const registry = currentRun.registry

        // Input → move intent (keyboard; first connected gamepad's left stick).
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
        sim.setMoveIntent(0, my + mx, my - mx)

        // Fixed-step run tick (run.tick only advances during the arena phase).
        acc += t.deltaMS / 1000
        while (acc >= TICK_DT) {
          currentRun.tick()
          acc -= TICK_DT
        }

        // Camera: center on player 1 for now (zoom-to-fit arrives with co-op).
        const p0 = sim.state.players[0]
        const c = toScreen(p0.x, p0.y)
        world.x = app.screen.width / 2 - c.sx
        world.y = app.screen.height / 2 - c.sy

        // ---- draw ----
        gGround.clear()
        gTelegraph.clear()
        gCritical.clear()

        const silho = view === 'silhouette'
        const markersOnly = view === 'markers'

        const { arenaW: aw, arenaH: ah } = sim.state
        const corners = [
          toScreen(-aw / 2, -ah / 2), toScreen(aw / 2, -ah / 2),
          toScreen(aw / 2, ah / 2), toScreen(-aw / 2, ah / 2),
        ]
        gGround.poly(corners.flatMap((k) => [k.sx, k.sy])).fill(0x24242e).stroke({ width: 2, color: 0x3a3a48 })

        for (const tg of sim.state.telegraphs) {
          const s = toScreen(tg.x, tg.y)
          const r = tg.radius * 32
          const progress = 1 - tg.timeLeft / tg.window
          gTelegraph.ellipse(s.sx, s.sy, r, r / 2).fill({ color: 0xd93a3a, alpha: 0.18 + progress * 0.3 })
          gTelegraph.ellipse(s.sx, s.sy, r * progress, (r * progress) / 2)
            .fill({ color: 0xd93a3a, alpha: 0.35 })
          gTelegraph.ellipse(s.sx, s.sy, r, r / 2).stroke({ width: 2, color: 0xd93a3a })
        }

        if (!markersOnly) {
          for (const pk of sim.state.pickups) {
            const s = toScreen(pk.x, pk.y)
            gCritical.circle(s.sx, s.sy, 5).fill(silho ? 0x000000 : pk.kind === 'gold' ? 0xffd34d : 0x7ee3ff)
          }
        }

        for (const e of sim.state.enemies) {
          const def = registry.enemy(e.defId)
          const s = toScreen(e.x, e.y)
          const r = def.radius * 32
          gGround.ellipse(s.sx, s.sy, r + 3, (r + 3) / 2).fill({ color: 0x000000, alpha: 0.35 })
          if (markersOnly) continue
          const color = silho ? 0x000000 :
            def.archetype === 'swarm' ? 0xd94f4f :
            def.archetype === 'chaser' ? 0xe08a3a :
            def.archetype === 'ranged' ? 0xb44fd9 : 0x4fd97a
          gCritical.circle(s.sx, s.sy - r / 2, r).fill(color).stroke({ width: 2, color: silho ? 0xffffff : 0x000000 })
        }

        if (!markersOnly) {
          for (const pr of sim.state.projectiles) {
            const s = toScreen(pr.x, pr.y)
            gCritical.circle(s.sx, s.sy - 8, 4).fill(silho ? 0x000000 : 0xffffff).stroke({ width: 1, color: silho ? 0xffffff : 0x000000 })
          }
        }

        for (const p of sim.state.players) {
          const s = toScreen(p.x, p.y)
          gGround.ellipse(s.sx, s.sy, 14, 7).fill({ color: 0x000000, alpha: 0.4 })
          if (markersOnly) continue
          gCritical.circle(s.sx, s.sy - 10, 11).fill(silho ? 0x000000 : 0x4da6ff).stroke({ width: 2.5, color: 0xffffff })

          p.weapons.forEach((w, i) => {
            const def = registry.weapon(w.defId)
            const side = i % 2 === 0 ? 1 : -1
            const baseX = s.sx + side * 22
            const baseY = s.sy - 18 - Math.floor(i / 2) * 12
            let angle = side === 1 ? -0.5 : Math.PI + 0.5
            const target = sim.state.enemies.find((e) => e.id === w.targetId)
            if (target) {
              const ts = toScreen(target.x, target.y)
              angle = Math.atan2(ts.sy - baseY, ts.sx - baseX)
            }
            const sinceFired = (sim.state.tick - w.firedTick) / TICK_RATE
            const isMelee = !def.projectileSpeed
            const lunge = isMelee && sinceFired < 0.18 ? (1 - sinceFired / 0.18) * 14 : 0
            const wx = baseX + Math.cos(angle) * lunge
            const wy = baseY + Math.sin(angle) * lunge
            const len = 16
            const color = silho ? 0x000000 : isMelee ? 0xd9d9e0 : 0x9fe0ff
            gCritical.moveTo(wx, wy).lineTo(wx + Math.cos(angle) * len, wy + Math.sin(angle) * len)
              .stroke({ width: 4, color })
            gCritical.circle(wx, wy, 3.5).fill(color)
          })

          const bw = 30
          gCritical.rect(s.sx - bw / 2, s.sy - 38, bw, 4).fill(0x000000)
          gCritical.rect(s.sx - bw / 2, s.sy - 38, (bw * p.health) / p.maxHealth, 4).fill(0x6dff6d)
        }

        const enemiesLeft =
          sim.state.enemies.length +
          sim.state.wave.pendingSpawns.reduce((a, g) => a + g.remaining, 0) +
          sim.state.wave.deferred.length
        hud.text =
          `Wave ${sim.state.wave.number}/${sim.lastWaveNumber}   Enemies ${enemiesLeft}\n` +
          `HP ${Math.ceil(p0.health)}/${p0.maxHealth}   Lv ${p0.level}` +
          `   XP ${Math.floor(p0.xp)}   Gold ${p0.gold}` +
          (view !== 'normal' ? `\n[debug view: ${view} — F1 normal]` : '')
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
