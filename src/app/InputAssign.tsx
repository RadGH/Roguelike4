import { useEffect, useState } from 'react'
import {
  deviceLabel, MAX_SLOTS, resolveDevices, storeInputMap,
  type Device, type InputMap,
} from './inputMap'

/**
 * Controller assignment, console-style: each player slot shows its device;
 * "Assign by press" arms a slot so the next button press (any pad) or key
 * (the keyboard) claims it. Cycling by click works too. A live dot marks
 * devices currently sending input, so "which pad is this?" answers itself.
 */
export function InputAssign({
  map, playerCount, onChange, onClose,
}: {
  map: InputMap
  playerCount: number
  onChange: (map: InputMap) => void
  onClose: () => void
}): React.JSX.Element {
  const [arming, setArming] = useState<number | null>(null)
  const [activeDevices, setActiveDevices] = useState<string[]>([])
  const [padCount, setPadCount] = useState(0)

  // Poll devices: liveness dots + press-to-claim.
  useEffect(() => {
    let raf = 0
    let keyActive = 0
    const onKey = (): void => {
      keyActive = performance.now()
      if (arming !== null) {
        claim(arming, { kind: 'keyboard' })
      }
    }
    window.addEventListener('keydown', onKey)
    const tick = (): void => {
      const pads = (navigator.getGamepads?.() ?? []).filter((g): g is Gamepad => !!g && g.connected)
      setPadCount(pads.length)
      const active: string[] = []
      if (performance.now() - keyActive < 400) active.push('keyboard')
      for (const g of pads) {
        const pressed = g.buttons.some((b) => b.pressed) ||
          Math.abs(g.axes[0] ?? 0) > 0.4 || Math.abs(g.axes[1] ?? 0) > 0.4
        if (pressed) {
          active.push(`pad${g.index}`)
          if (arming !== null && g.buttons.some((b) => b.pressed)) {
            claim(arming, { kind: 'pad', index: g.index })
          }
        }
      }
      setActiveDevices(active)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
    }
  }, [arming, map]) // claim() reads map; re-arm the poller when either changes

  const claim = (slot: number, device: Device): void => {
    const next: InputMap = map.map((d, i) => {
      // A device belongs to one slot: claiming it releases it elsewhere.
      if (d && device.kind === d.kind &&
        (d.kind === 'keyboard' || (d as { index?: number }).index === (device as { index?: number }).index)) {
        return i === slot ? d : null
      }
      return i === slot ? device : d
    })
    next[slot] = device
    storeInputMap(next)
    onChange(next)
    setArming(null)
  }

  const cycle = (slot: number): void => {
    const options: (Device | null)[] = [
      null,
      { kind: 'keyboard' },
      ...Array.from({ length: Math.max(padCount, 1) }, (_, i) => ({ kind: 'pad' as const, index: i })),
    ]
    const cur = map[slot]
    const curIdx = options.findIndex((o) =>
      (o === null && cur === null) ||
      (o?.kind === 'keyboard' && cur?.kind === 'keyboard') ||
      (o?.kind === 'pad' && cur?.kind === 'pad' && o.index === cur.index))
    const nextDevice = options[(curIdx + 1) % options.length]
    const next: InputMap = [...map]
    next[slot] = nextDevice
    // Release the device from any other slot that held it.
    for (let i = 0; i < next.length; i++) {
      if (i === slot || !next[i] || !nextDevice) continue
      const d = next[i] as Device
      if (d.kind === nextDevice.kind &&
        (d.kind === 'keyboard' || (d as { index?: number }).index === (nextDevice as { index?: number }).index)) {
        next[i] = null
      }
    }
    storeInputMap(next)
    onChange(next)
  }

  // What each slot resolves to right now (shows what Auto means today).
  const pads = (navigator.getGamepads?.() ?? []).filter((g): g is Gamepad => !!g && g.connected)
  const resolved = resolveDevices(map, MAX_SLOTS, pads)

  return (
    <div className="panel" data-testid="input-assign">
      <h3>Controllers</h3>
      <div className="hint">
        Click a slot to cycle its device, or use “assign by press” and press any
        button on the device you want. Slots beyond the player count are ignored.
      </div>
      {Array.from({ length: MAX_SLOTS }, (_, i) => {
        const d = map[i]
        const r = resolved[i]
        const liveKey = d?.kind === 'keyboard' || (d === null && r.keyboard)
        const liveId = d?.kind === 'pad' ? `pad${d.index}` : r.pad ? `pad${r.pad.index}` : ''
        const live = (liveKey && activeDevices.includes('keyboard')) ||
          (liveId !== '' && activeDevices.includes(liveId))
        return (
          <div className="assign-row" key={i} style={i >= playerCount ? { opacity: 0.45 } : undefined}>
            <span className="assign-slot">P{i + 1}</span>
            <button onClick={() => cycle(i)}>
              {deviceLabel(d)}
              {d === null && (r.keyboard ? ' (keyboard)' : r.pad ? ` (controller ${r.pad.index + 1})` : ' (none)')}
            </button>
            <button onClick={() => setArming(arming === i ? null : i)}>
              {arming === i ? 'Press any button…' : 'Assign by press'}
            </button>
            <span className="assign-live" style={{ opacity: live ? 1 : 0.15 }}>●</span>
          </div>
        )
      })}
      <div className="hint">{padCount} controller{padCount === 1 ? '' : 's'} connected.</div>
      <button onClick={onClose}>Done</button>
    </div>
  )
}
