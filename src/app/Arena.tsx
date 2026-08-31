import { useEffect, useRef, useState } from 'react'
import { Application, Container, Graphics, Sprite, Text } from 'pixi.js'
import { TICK_DT, TICK_RATE } from '../sim/core/sim'
import type { Run } from '../sim/run/run'
import { toScreen } from '../render/iso'
import { loadCriticalTextures, type CriticalTextures } from '../render/sprites'
import { sound } from '../render/audio'

/**
 * The arena canvas. Renders the run's sim with gameplay-critical primitives —
 * bold flat shapes on the ground plane, permanently (two-layer art rule).
 *
 * Readability debug views (dev tool): F1 normal · F2 markers-only · F3 silhouette.
 */
type DebugView = 'normal' | 'markers' | 'silhouette'

/**
 * Runtime readability tuning (art-doc requirement): gameplay-critical visuals
 * expose live-adjustable parameters so problems get tuned, not redrawn.
 * From the console: __tuning.enemyScale = 1.3, etc. Not a player feature.
 */
const tuning = {
  enemyScale: 1,
  playerScale: 1,
  markerAlpha: 0.35,
  outlineBoost: 0,
  telegraphAlpha: 1,
}
declare global { interface Window { __tuning?: typeof tuning } }
if (typeof window !== 'undefined') window.__tuning = tuning

export function Arena({ run }: { run: Run }): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const runRef = useRef(run)
  runRef.current = run
  // Touch: a drag anywhere on the arena is a virtual stick for player 1.
  const touchVec = useRef({ x: 0, y: 0 })
  const touchOrigin = useRef<{ x: number; y: number; id: number } | null>(null)
  const [stickPos, setStickPos] = useState<{ x: number; y: number } | null>(null)
  const touchCapable = typeof window !== 'undefined' &&
    (('ontouchstart' in window) || window.matchMedia?.('(pointer: coarse)').matches ||
      window.location.search.includes('touch'))

  const onPointerDown = (e: React.PointerEvent): void => {
    if (e.pointerType !== 'touch') return
    touchOrigin.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    setStickPos({ x: e.clientX, y: e.clientY })
  }
  const onPointerMove = (e: React.PointerEvent): void => {
    const origin = touchOrigin.current
    if (!origin || e.pointerId !== origin.id) return
    const dx = (e.clientX - origin.x) / 45
    const dy = (e.clientY - origin.y) / 45
    const len = Math.hypot(dx, dy) || 1
    const clampLen = Math.min(1, len)
    touchVec.current = { x: (dx / len) * clampLen, y: (dy / len) * clampLen }
  }
  const onPointerEnd = (e: React.PointerEvent): void => {
    if (touchOrigin.current && e.pointerId === touchOrigin.current.id) {
      touchOrigin.current = null
      touchVec.current = { x: 0, y: 0 }
      setStickPos(null)
    }
  }

  const touchVecRef = touchVec

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

    void app.init({ resizeTo: host, background: 0x1a1a22, antialias: true }).then(async () => {
      if (destroyed) return
      host.appendChild(app.canvas)

      let textures: CriticalTextures | null = null
      try {
        textures = await loadCriticalTextures()
      } catch {
        textures = null // primitive-shape fallback keeps the game playable
      }
      if (destroyed) return

      const world = new Container()
      app.stage.addChild(world)
      const gGround = new Graphics()
      const gTelegraph = new Graphics()
      const spriteLayer = new Container()
      const gCritical = new Graphics()
      world.addChild(gGround, gTelegraph, spriteLayer, gCritical)

      // One pooled sprite per live entity, keyed by a stable string id.
      const pool = new Map<string, Sprite>()
      const seen = new Set<string>()
      const sprite = (key: string, tex: import('pixi.js').Texture): Sprite => {
        let sp = pool.get(key)
        if (!sp) {
          sp = new Sprite(tex)
          sp.anchor.set(0.5, 0.8) // feet near the ground marker
          pool.set(key, sp)
          spriteLayer.addChild(sp)
        }
        if (sp.texture !== tex) sp.texture = tex
        seen.add(key)
        return sp
      }
      const sweepPool = (): void => {
        for (const [key, sp] of pool) {
          if (!seen.has(key)) {
            spriteLayer.removeChild(sp)
            sp.destroy()
            pool.delete(key)
          }
        }
        seen.clear()
      }

      const hud = new Text({
        text: '',
        style: { fill: 0xffffff, fontSize: 15, fontFamily: 'monospace' },
      })
      hud.position.set(12, 10)
      app.stage.addChild(hud)

      window.addEventListener('keydown', onKeyDown)
      window.addEventListener('keyup', onKeyUp)

      let acc = 0
      const audioPrev = {
        gold: -1, level: -1, cleared: true,
        health: new Map<number, number>(), downed: new Map<number, boolean>(),
        lastGoldAt: 0, lastHurtAt: 0,
      }
      let prevStart = false
      let prevPadCount = 0
      const prevA: boolean[] = []
      const prevB: boolean[] = []
      let camScale = 1
      let camX = 0
      let camY = 0
      let camInit = false
      app.ticker.add((t) => {
        const currentRun = runRef.current
        const sim = currentRun.sim
        const registry = currentRun.registry
        const playerCount = sim.state.players.length

        // Input assignment: player 1 owns the keyboard. With one player a
        // gamepad also drives them; with more, pads map to players in order.
        const pads = (navigator.getGamepads?.() ?? []).filter((p) => p && p.connected)

        // Any pad's Start button toggles pause; losing a pad mid-fight pauses.
        let startPressed = false
        for (const pad of pads) {
          if (pad?.buttons[9]?.pressed) startPressed = true
        }
        if (startPressed && !prevStart && currentRun.phase === 'arena') {
          currentRun.paused = !currentRun.paused
        }
        prevStart = startPressed
        if (pads.length < prevPadCount && playerCount > 1 && currentRun.phase === 'arena') {
          currentRun.paused = true
        }
        prevPadCount = pads.length
        for (const p of sim.state.players) {
          let mx = 0
          let my = 0
          if (p.id === 0) {
            if (keys.has('a') || keys.has('arrowleft')) mx -= 1
            if (keys.has('d') || keys.has('arrowright')) mx += 1
            if (keys.has('w') || keys.has('arrowup')) my -= 1
            if (keys.has('s') || keys.has('arrowdown')) my += 1
            // Virtual stick (touch) overrides keys while active.
            const tv = touchVecRef.current
            if (tv.x !== 0 || tv.y !== 0) {
              mx = tv.x
              my = tv.y
            }
          }
          const pad = playerCount === 1
            ? pads[0]
            : p.id === 0 ? null : pads[p.id - 1]
          if (pad && (Math.abs(pad.axes[0]) > 0.2 || Math.abs(pad.axes[1]) > 0.2)) {
            mx = pad.axes[0]
            my = pad.axes[1]
          }
          // Screen-relative input mapped onto the iso ground plane.
          sim.setMoveIntent(p.id, my + mx, my - mx)

          // The two-button budget: A = equipment, B = movement item.
          // Keyboard (P1): Space = A, Shift = B. Pads: buttons 0 and 1.
          let aDown = false
          let bDown = false
          if (p.id === 0) {
            if (keys.has(' ')) aDown = true
            if (keys.has('shift')) bDown = true
          }
          if (pad) {
            if (pad.buttons[0]?.pressed) aDown = true
            if (pad.buttons[1]?.pressed) bDown = true
          }
          // Buttons act only in the live arena — menus own A/B elsewhere.
          const inArena = currentRun.phase === 'arena' && !currentRun.paused
          if (inArena && aDown && !prevA[p.id] && sim.useEquipment(p.id)) sound.useActive()
          if (inArena && bDown && !prevB[p.id] && sim.useMovement(p.id)) sound.useActive()
          prevA[p.id] = aDown
          prevB[p.id] = bDown
        }

        // Fixed-step run tick (run.tick only advances during the arena phase).
        acc += t.deltaMS / 1000
        while (acc >= TICK_DT) {
          currentRun.tick()
          acc -= TICK_DT
        }

        // Audio cues from state diffs: sparse, informational only.
        {
          const p0 = sim.state.players[0]
          const nowMs = performance.now()
          if (audioPrev.gold >= 0 && p0.gold > audioPrev.gold && nowMs - audioPrev.lastGoldAt > 120) {
            sound.gold()
            audioPrev.lastGoldAt = nowMs
          }
          audioPrev.gold = p0.gold
          if (audioPrev.level >= 0 && p0.level > audioPrev.level) sound.levelUp()
          audioPrev.level = p0.level
          const cleared = sim.state.wave.cleared
          if (cleared && !audioPrev.cleared && currentRun.phase !== 'victory') sound.waveClear()
          audioPrev.cleared = cleared
          for (const pl of sim.state.players) {
            const prevHp = audioPrev.health.get(pl.id)
            if (prevHp !== undefined && pl.health < prevHp - 0.5 && nowMs - audioPrev.lastHurtAt > 300) {
              sound.hurt()
              audioPrev.lastHurtAt = nowMs
            }
            audioPrev.health.set(pl.id, pl.health)
            const wasDowned = audioPrev.downed.get(pl.id) ?? false
            if (pl.downed && !wasDowned) sound.down()
            if (!pl.downed && wasDowned && pl.alive) sound.revive()
            audioPrev.downed.set(pl.id, pl.downed)
          }
        }

        // Camera: one shared view that zooms out to keep everyone framed —
        // and every nearby threat. Zooming in so far that the horde sits
        // off-screen would fail the "what is about to hurt me" question.
        const framed = sim.state.players.filter((p) => p.alive)
        const anchors = framed.length > 0 ? framed : sim.state.players
        const worldPts: { x: number; y: number }[] = [...anchors]
        for (const e of sim.state.enemies) {
          for (const p of anchors) {
            const dx = e.x - p.x
            const dy = e.y - p.y
            if (dx * dx + dy * dy < 81) { // threats within 9 units stay framed
              worldPts.push(e)
              break
            }
          }
        }
        const pts = worldPts.map((p) => toScreen(p.x, p.y))
        let minX = pts[0].sx, maxX = pts[0].sx, minY = pts[0].sy, maxY = pts[0].sy
        for (const pt of pts) {
          minX = Math.min(minX, pt.sx); maxX = Math.max(maxX, pt.sx)
          minY = Math.min(minY, pt.sy); maxY = Math.max(maxY, pt.sy)
        }
        // Zoom in tight when players are together (solo plays close), out to
        // keep everyone framed — the min-size rules are judged at the low end.
        const pad2 = 260
        const targetScale = Math.min(
          1.8,
          app.screen.width / (maxX - minX + pad2 * 2),
          app.screen.height / (maxY - minY + pad2 * 2),
        )
        const targetX = app.screen.width / 2 - ((minX + maxX) / 2) * targetScale
        const targetY = app.screen.height / 2 - ((minY + maxY) / 2) * targetScale
        if (!camInit) {
          camScale = targetScale; camX = targetX; camY = targetY; camInit = true
        } else {
          camScale += (targetScale - camScale) * 0.08
          camX += (targetX - camX) * 0.12
          camY += (targetY - camY) * 0.12
        }
        world.scale.set(camScale)
        world.x = camX
        world.y = camY

        // ---- draw ----
        gGround.clear()
        gTelegraph.clear()
        gCritical.clear()

        const silho = view === 'silhouette'
        const markersOnly = view === 'markers'
        const oracleSight = sim.state.players.some(
          (p) => registry.classes.get(p.classId)?.revealsInfo,
        )

        const { arenaW: aw, arenaH: ah } = sim.state
        const corners = [
          toScreen(-aw / 2, -ah / 2), toScreen(aw / 2, -ah / 2),
          toScreen(aw / 2, ah / 2), toScreen(-aw / 2, ah / 2),
        ]
        gGround.poly(corners.flatMap((k) => [k.sx, k.sy])).fill(0x24242e).stroke({ width: 2, color: 0x3a3a48 })

        // Lingering ground hazards: webbing (slows) and damage pools.
        for (const pool of sim.state.pools) {
          const s = toScreen(pool.x, pool.y)
          const r = pool.radius * 32
          const color = pool.dps > 0 ? 0x9acd32 : 0xcfcfe8
          gTelegraph.ellipse(s.sx, s.sy, r, r / 2).fill({ color, alpha: 0.22 })
          gTelegraph.ellipse(s.sx, s.sy, r, r / 2).stroke({ width: 1.5, color })
        }

        for (const tg of sim.state.telegraphs) {
          const s = toScreen(tg.x, tg.y)
          const r = tg.radius * 32
          const progress = 1 - tg.timeLeft / tg.window
          gTelegraph.ellipse(s.sx, s.sy, r, r / 2).fill({ color: 0xd93a3a, alpha: (0.18 + progress * 0.3) * tuning.telegraphAlpha })
          gTelegraph.ellipse(s.sx, s.sy, r * progress, (r * progress) / 2)
            .fill({ color: 0xd93a3a, alpha: 0.35 })
          gTelegraph.ellipse(s.sx, s.sy, r, r / 2).stroke({ width: 2, color: 0xd93a3a })
        }

        if (!markersOnly) {
          for (const pk of sim.state.pickups) {
            const s = toScreen(pk.x, pk.y)
            if (textures) {
              const sp = sprite(`pk${pk.id}`, pk.kind === 'gold' ? textures.gold : textures.xp)
              sp.position.set(s.sx, s.sy + 4)
              sp.width = 12
              sp.height = 12
              sp.tint = silho ? 0x000000 : 0xffffff
            } else {
              gCritical.circle(s.sx, s.sy, 5).fill(silho ? 0x000000 : pk.kind === 'gold' ? 0xffd34d : 0x7ee3ff)
            }
          }
        }

        for (const e of sim.state.enemies) {
          const def = registry.enemy(e.defId)
          const s = toScreen(e.x, e.y)
          const r = sim.radiusOf(e) * 32
          gGround.ellipse(s.sx, s.sy, r + 3, (r + 3) / 2).fill({ color: 0x000000, alpha: tuning.markerAlpha })
          // Burrowed enemies exist only as a moving ground disturbance.
          if (!sim.isTargetable(e)) {
            gGround.ellipse(s.sx, s.sy, r + 5, (r + 5) / 2).stroke({ width: 2, color: 0xb08a5a })
            continue
          }
          if (markersOnly) continue
          const lift = def.archetype === 'flyer' ? 22 : 0
          const tex = textures?.enemy(e.defId, def.archetype) ?? null
          if (tex) {
            const sp = sprite(`e${e.id}`, tex)
            const size = Math.max(20, r * 2.8) * tuning.enemyScale
            sp.position.set(s.sx, s.sy - lift + 4)
            sp.height = size
            sp.width = size
            // Facing follows horizontal velocity (art faces right).
            sp.scale.x = (e.vx < -0.1 ? -1 : 1) * Math.abs(sp.scale.x)
            // Effect tint: burning glows warm, chilled reads cold.
            sp.tint = silho ? 0x000000 :
              e.burnTtl > 0 ? 0xffb08a :
              e.chillTtl > 0 ? 0xa8d8ff : 0xffffff
          } else {
            // Primitive fallback keeps the reserved palette meaning intact.
            const ARCHETYPE_COLOR: Record<string, number> = {
              swarm: 0xd94f4f, chaser: 0xe08a3a, ranged: 0xb44fd9,
              charger: 0xff7043, exploder: 0x9acd32, flyer: 0x5ad9d9,
              blocker: 0x4fd97a, burrower: 0xb08a5a, spawner: 0xd94fb0,
              retaliator: 0x8a9ab0,
            }
            const color = silho ? 0x000000 : (ARCHETYPE_COLOR[def.archetype] ?? 0x4fd97a)
            gCritical.circle(s.sx, s.sy - lift - r / 2, r).fill(color).stroke({ width: 2, color: silho ? 0xffffff : 0x000000 })
          }
          // Charger windup: a bright pulse announces the committed charge.
          if (e.mode === 2) {
            gCritical.circle(s.sx, s.sy - lift - r / 2, r + 5).stroke({ width: 3, color: 0xffffff })
          }
          // Flyers stay visually tied to their true ground position.
          if (def.archetype === 'flyer') {
            gCritical.moveTo(s.sx, s.sy).lineTo(s.sx, s.sy - lift).stroke({ width: 1, color: 0x5ad9d9 })
          }
          // Elite ring: resistant elites read as armored.
          if (e.elite === 'resistant') {
            gCritical.ellipse(s.sx, s.sy, r + 6, (r + 6) / 2).stroke({ width: 2, color: 0xf2f2f2 })
          }
          // Shocked: a crackling yellow ring — this target takes extra damage.
          if (e.shockTtl > 0) {
            gCritical.ellipse(s.sx, s.sy, r + 9, (r + 9) / 2).stroke({ width: 2, color: 0xffe95a })
          }
          // The Oracle sees every enemy's health, plainly.
          if (oracleSight && e.health < e.maxHealth) {
            const bw = Math.max(16, r * 1.5)
            gCritical.rect(s.sx - bw / 2, s.sy - lift - r - 8, bw, 3).fill(0x000000)
            gCritical.rect(s.sx - bw / 2, s.sy - lift - r - 8, (bw * e.health) / e.maxHealth, 3).fill(0xffd34d)
          }
        }

        if (!markersOnly) {
          for (const pr of sim.state.projectiles) {
            const s = toScreen(pr.x, pr.y)
            gCritical.circle(s.sx, s.sy - 8, 4).fill(silho ? 0x000000 : 0xffffff).stroke({ width: 1, color: silho ? 0xffffff : 0x000000 })
          }
        }

        // Pets: allied entities wear the ally-blue ground ring. Mortal pets
        // waiting to respawn are not drawn at all.
        for (const pet of sim.state.pets) {
          if (pet.respawnLeft > 0) continue
          const def = registry.pet(pet.defId)
          const s = toScreen(pet.x, pet.y)
          const r = def.radius * 32
          gGround.ellipse(s.sx, s.sy, r + 3, (r + 3) / 2).fill({ color: 0x000000, alpha: 0.3 })
          gGround.ellipse(s.sx, s.sy, r + 5, (r + 5) / 2).stroke({ width: 1.5, color: 0x4da6ff })
          if (markersOnly) continue
          const tex = textures?.pet(pet.defId) ?? null
          if (tex) {
            const sp = sprite(`pet${pet.id}`, tex)
            const size = Math.max(18, r * 2.6)
            sp.position.set(s.sx, s.sy + 4)
            sp.height = size
            sp.width = size
            sp.scale.x = (pet.vx < -0.1 ? -1 : 1) * Math.abs(sp.scale.x)
            sp.tint = silho ? 0x000000 : 0xffffff
          } else {
            gCritical.circle(s.sx, s.sy - r / 2, r).fill(silho ? 0x000000 : 0x7d8fa8)
              .stroke({ width: 2, color: 0x4da6ff })
          }
          // Mortal pets carry a slim health bar only while hurt.
          if (registry.pet(pet.defId).mortal && pet.health < pet.maxHealth) {
            const bw = 22
            gCritical.rect(s.sx - bw / 2, s.sy - 30, bw, 3).fill(0x000000)
            gCritical.rect(s.sx - bw / 2, s.sy - 30, (bw * pet.health) / pet.maxHealth, 3).fill(0x4da6ff)
          }
        }

        // Reserved identity rings: each player finds themselves by ring colour.
        const PLAYER_COLORS = [0x4da6ff, 0xf5f5f5, 0xff6de3, 0xffd34d]
        for (const p of sim.state.players) {
          if (!p.alive) continue // dead players return at wave clear
          const s = toScreen(p.x, p.y)
          const ring = PLAYER_COLORS[p.id % PLAYER_COLORS.length]
          gGround.ellipse(s.sx, s.sy, 14, 7).fill({ color: 0x000000, alpha: 0.4 })
          gGround.ellipse(s.sx, s.sy, 16, 8).stroke({ width: 2, color: ring })
          if (markersOnly) continue

          const drawBody = (tint: number): void => {
            if (textures) {
              const sp = sprite(`p${p.id}`, textures.player)
              sp.position.set(s.sx, s.sy + 4)
              sp.height = 40 * tuning.playerScale
              sp.width = 40 * tuning.playerScale
              sp.scale.x = (p.moveX < -0.05 ? -1 : 1) * Math.abs(sp.scale.x)
              sp.tint = tint
            } else {
              gCritical.circle(s.sx, s.sy - 10, 11).fill(tint === 0xffffff ? 0x3d7fbf : tint).stroke({ width: 2.5, color: ring })
            }
          }

          if (p.downed) {
            // Downed: grey body, shrinking bleed-out ring, revive progress bar.
            drawBody(0x55555f)
            const frac = Math.max(0, p.bleedOut / 15)
            gCritical.circle(s.sx, s.sy - 12, 17).stroke({ width: 2, color: 0xd93a3a })
            gCritical.rect(s.sx - 15, s.sy - 40, 30 * frac, 3).fill(0xd93a3a)
            if (p.reviveProgress > 0) {
              gCritical.rect(s.sx - 15, s.sy - 46, 30 * (p.reviveProgress / 3), 4).fill(0x6dff6d)
            }
            continue
          }

          drawBody(silho ? 0x000000 : 0xffffff)

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
        const bossPieces = sim.state.enemies.filter((e) => e.defId.startsWith('kingslime'))
        const playerLines = sim.state.players.map((p) => {
          const status = !p.alive ? 'returning next wave' : p.downed ? 'DOWN — rescue!' :
            `HP ${Math.ceil(p.health)}/${p.maxHealth}`
          const slot = (label: string, s2: typeof p.equipment): string => {
            if (!s2) return ''
            const name = registry.active(s2.defId).name
            return `  ${label}:${name}${s2.cdLeft > 0 ? ` ${Math.ceil(s2.cdLeft)}s` : ' ✓'}`
          }
          return `P${p.id + 1}  ${status}  Lv ${p.level}  Gold ${p.gold}` +
            slot('A', p.equipment) + slot('B', p.movement)
        })
        const waveLabel = currentRun.endless && sim.state.wave.number > 10
          ? `Endless ${sim.state.wave.number}`
          : `Wave ${sim.state.wave.number}/${sim.lastWaveNumber}`
        hud.text =
          `${waveLabel}   Enemies ${enemiesLeft}\n` +
          playerLines.join('\n') +
          (bossPieces.length > 0 ? `\nKing Slime — ${bossPieces.length} piece${bossPieces.length > 1 ? 's' : ''}` : '') +
          (view !== 'normal' ? `\n[debug view: ${view} — F1 normal]` : '')

        sweepPool()
      })
    })

    return () => {
      destroyed = true
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      app.destroy(true, { children: true })
    }
  }, [])

  return (
    <>
      <div
        ref={hostRef}
        style={{ position: 'fixed', inset: 0, touchAction: 'none' }}
        data-testid="arena"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      />
      {touchCapable && (
        <>
          {stickPos && (
            <div
              className="touch-stick"
              style={{ left: stickPos.x - 40, top: stickPos.y - 40, width: 80, height: 80 }}
            />
          )}
          <button
            className="touch-btn touch-a"
            data-testid="touch-a"
            onPointerDown={(e) => { e.stopPropagation(); runRef.current.sim.useEquipment(0) }}
          >
            A
          </button>
          <button
            className="touch-btn touch-b"
            data-testid="touch-b"
            onPointerDown={(e) => { e.stopPropagation(); runRef.current.sim.useMovement(0) }}
          >
            B
          </button>
        </>
      )}
    </>
  )
}
