import { useEffect, useRef } from 'react'
import { Application, Container, Graphics, Text } from 'pixi.js'
import { Sim, TICK_DT, TICK_RATE } from '../sim/core/sim'
import { loadContent } from '../sim/data/loadContent'
import { toScreen } from '../render/iso'

/**
 * Debug arena: the real sim rendered with gameplay-critical primitives only.
 * Bold flat shapes on the ground plane are the permanent art direction for
 * everything the player must react to — this is not placeholder art.
 *
 * Readability debug modes (dev tool, not a player feature):
 *   F1 — normal · F2 — ground markers only · F3 — silhouette view
 */
type DebugView = 'normal' | 'markers' | 'silhouette'

export function ArenaDebug(): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)

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

      const registry = loadContent()
      const sim = new Sim(registry, { seed: Date.now() >>> 0, playerCount: 1 })
      sim.equipWeapon(0, 'practice-wand')
      sim.equipWeapon(0, 'practice-sword')
      const act = registry.act('act1')
      sim.startWave(act.waves, 1)

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

        // Fixed-step sim; loop waves for now (intermission screens come next).
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
        gTelegraph.clear()
        gCritical.clear()

        const silho = view === 'silhouette'
        const markersOnly = view === 'markers'

        // Arena bounds on the ground plane.
        const { arenaW: aw, arenaH: ah } = sim.state
        const corners = [
          toScreen(-aw / 2, -ah / 2), toScreen(aw / 2, -ah / 2),
          toScreen(aw / 2, ah / 2), toScreen(-aw / 2, ah / 2),
        ]
        gGround.poly(corners.flatMap((k) => [k.sx, k.sy])).fill(0x24242e).stroke({ width: 2, color: 0x3a3a48 })

        // Telegraphed danger zones: floor plane only, urgency ramps with time.
        for (const tg of sim.state.telegraphs) {
          const s = toScreen(tg.x, tg.y)
          const r = tg.radius * 32
          const progress = 1 - tg.timeLeft / tg.window
          gTelegraph.ellipse(s.sx, s.sy, r, r / 2).fill({ color: 0xd93a3a, alpha: 0.18 + progress * 0.3 })
          gTelegraph.ellipse(s.sx, s.sy, r * progress, (r * progress) / 2)
            .fill({ color: 0xd93a3a, alpha: 0.35 })
          gTelegraph.ellipse(s.sx, s.sy, r, r / 2).stroke({ width: 2, color: 0xd93a3a })
        }

        // Pickups (reserved pickup hue).
        if (!markersOnly) {
          for (const pk of sim.state.pickups) {
            const s = toScreen(pk.x, pk.y)
            gCritical.circle(s.sx, s.sy, 5).fill(silho ? 0x000000 : pk.kind === 'gold' ? 0xffd34d : 0x7ee3ff)
          }
        }

        // Enemies: ground marker + body, outlined for overlap survival.
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

        // Projectiles: plain bright circles, permanently.
        if (!markersOnly) {
          for (const pr of sim.state.projectiles) {
            const s = toScreen(pr.x, pr.y)
            gCritical.circle(s.sx, s.sy - 8, 4).fill(silho ? 0x000000 : 0xffffff).stroke({ width: 1, color: silho ? 0xffffff : 0x000000 })
          }
        }

        // Players: marker + body in the local-player reserved hue, plus weapons.
        for (const p of sim.state.players) {
          const s = toScreen(p.x, p.y)
          gGround.ellipse(s.sx, s.sy, 14, 7).fill({ color: 0x000000, alpha: 0.4 })
          if (markersOnly) continue
          gCritical.circle(s.sx, s.sy - 10, 11).fill(silho ? 0x000000 : 0x4da6ff).stroke({ width: 2.5, color: 0xffffff })

          // Weapons hover beside their owner and rotate to show their aim.
          p.weapons.forEach((w, i) => {
            const def = registry.weapon(w.defId)
            const side = i % 2 === 0 ? 1 : -1
            const baseX = s.sx + side * 22
            const baseY = s.sy - 18 - Math.floor(i / 2) * 12
            // Aim at the current target; idle weapons rest at a diagonal.
            let angle = side === 1 ? -0.5 : Math.PI + 0.5
            const target = sim.state.enemies.find((e) => e.id === w.targetId)
            if (target) {
              const ts = toScreen(target.x, target.y)
              angle = Math.atan2(ts.sy - baseY, ts.sx - baseX)
            }
            // Melee lunge: a brief thrust along the aim right after firing.
            const sinceFired = (sim.state.tick - w.firedTick) / TICK_RATE
            const isMelee = !def.projectileSpeed
            const lunge = isMelee && sinceFired < 0.18 ? (1 - sinceFired / 0.18) * 14 : 0
            const wx = baseX + Math.cos(angle) * lunge
            const wy = baseY + Math.sin(angle) * lunge
            const len = 16
            const tipX = wx + Math.cos(angle) * len
            const tipY = wy + Math.sin(angle) * len
            const color = silho ? 0x000000 : isMelee ? 0xd9d9e0 : 0x9fe0ff
            gCritical.moveTo(wx, wy).lineTo(tipX, tipY).stroke({ width: 4, color })
            gCritical.circle(wx, wy, 3.5).fill(color)
          })

          // Health bar above (debug HUD; the real per-player HUD is richer).
          const bw = 30
          gCritical.rect(s.sx - bw / 2, s.sy - 38, bw, 4).fill(0x000000)
          gCritical.rect(s.sx - bw / 2, s.sy - 38, (bw * p.health) / p.maxHealth, 4).fill(0x6dff6d)
        }

        // Shared HUD: wave state + player 1 vitals, whole numbers only.
        const enemiesLeft =
          sim.state.enemies.length +
          sim.state.wave.pendingSpawns.reduce((a, g) => a + g.remaining, 0) +
          sim.state.wave.deferred.length
        hud.text =
          `Wave ${sim.state.wave.number}   Enemies ${enemiesLeft}\n` +
          `HP ${Math.ceil(p0.health)}/${p0.maxHealth}   Lv ${p0.level}` +
          `   XP ${Math.floor(p0.xp)}   Gold ${p0.gold}` +
          (p0.pendingDrafts > 0 ? `   Drafts +${p0.pendingDrafts}` : '') +
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
