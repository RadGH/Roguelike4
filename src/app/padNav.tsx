import { useEffect, useRef } from 'react'

/**
 * Gamepad menu navigation, the uniform two-button scheme: up/down moves
 * focus, A activates. It works on any panel by walking the panel's enabled
 * buttons in DOM order, so every menu is navigated identically and new
 * screens inherit pad support for free.
 *
 * `padIndex` — which gamepad drives this panel; -1 means "any pad" (global
 * screens); null disables the hook (keyboard/mouse only).
 */
export function usePadNav(
  panelRef: React.RefObject<HTMLElement | null>,
  padIndex: number | null,
): void {
  const focusIdx = useRef(0)
  const prev = useRef({ up: false, down: false, a: false })

  useEffect(() => {
    if (padIndex === null) return
    const id = setInterval(() => {
      const panel = panelRef.current
      if (!panel) return
      const pads = (navigator.getGamepads?.() ?? []).filter((p) => p && p.connected)
      const pad = padIndex === -1 ? pads[0] : pads[padIndex]
      if (!pad) return

      const buttons = [...panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
      if (buttons.length === 0) return

      const axisY = pad.axes[1] ?? 0
      const up = (pad.buttons[12]?.pressed ?? false) || axisY < -0.5
      const down = (pad.buttons[13]?.pressed ?? false) || axisY > 0.5
      const a = pad.buttons[0]?.pressed ?? false

      if (up && !prev.current.up) {
        focusIdx.current = (focusIdx.current - 1 + buttons.length) % buttons.length
      }
      if (down && !prev.current.down) {
        focusIdx.current = (focusIdx.current + 1) % buttons.length
      }
      focusIdx.current = Math.min(focusIdx.current, buttons.length - 1)

      buttons.forEach((b, i) => b.classList.toggle('pad-focus', i === focusIdx.current))
      const focused = buttons[focusIdx.current]
      focused?.scrollIntoView({ block: 'nearest' })

      if (a && !prev.current.a) focused?.click()

      prev.current = { up, down, a }
    }, 80)
    return () => clearInterval(id)
  }, [panelRef, padIndex])
}

/** The arena/menu pad assignment rule, shared with the arena input code. */
export function padIndexForPlayer(playerId: number, playerCount: number): number | null {
  if (playerCount === 1) return 0 // solo: any first pad drives P1
  return playerId === 0 ? null : playerId - 1 // P1 keyboard; others pads in order
}

/** A panel whose buttons are pad-navigable. Drop-in replacement for a div. */
export function PadPanel({ padIndex, className, children, ...rest }: {
  padIndex: number | null
  className?: string
  children: React.ReactNode
} & React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  usePadNav(ref, padIndex)
  return <div ref={ref} className={className} {...rest}>{children}</div>
}
