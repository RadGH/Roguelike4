/**
 * Device-to-player assignment. Any device can drive any player slot — two
 * pads and no keyboard is a legal couch. `null` means Auto: the legacy
 * layout (P1 keyboard, pads fill the remaining slots in order), which keeps
 * working for anyone who never opens the assignment dialog.
 */

export type Device =
  | { kind: 'keyboard' }
  | { kind: 'pad'; index: number }

export type InputMap = (Device | null)[]

const KEY = 'input-map'
export const MAX_SLOTS = 4

export function loadInputMap(): InputMap {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return [null, null, null, null]
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [null, null, null, null]
    return Array.from({ length: MAX_SLOTS }, (_, i) => {
      const d = parsed[i] as Device | null | undefined
      if (d && d.kind === 'keyboard') return { kind: 'keyboard' as const }
      if (d && d.kind === 'pad' && typeof d.index === 'number') return { kind: 'pad' as const, index: d.index }
      return null
    })
  } catch {
    return [null, null, null, null]
  }
}

export function storeInputMap(map: InputMap): void {
  localStorage.setItem(KEY, JSON.stringify(map))
}

export function deviceLabel(d: Device | null): string {
  if (!d) return 'Auto'
  return d.kind === 'keyboard' ? 'Keyboard' : `Controller ${d.index + 1}`
}

/**
 * Resolve which device drives each player this frame. Explicit assignments
 * win; Auto slots fall back to the legacy layout using whatever devices are
 * not explicitly claimed by another slot.
 */
export function resolveDevices(
  map: InputMap,
  playerCount: number,
  pads: Gamepad[],
): { keyboard: boolean; pad: Gamepad | null }[] {
  const claimedPads = new Set<number>()
  let keyboardClaimed = false
  for (let i = 0; i < playerCount; i++) {
    const d = map[i]
    if (d?.kind === 'pad') claimedPads.add(d.index)
    if (d?.kind === 'keyboard') keyboardClaimed = true
  }
  const freePads = pads.filter((g) => !claimedPads.has(g.index))
  let nextFree = 0
  return Array.from({ length: playerCount }, (_, i) => {
    const d = map[i]
    if (d?.kind === 'keyboard') {
      // Solo keyboard player also gets the first free pad, like the old default.
      return { keyboard: true, pad: playerCount === 1 ? freePads[0] ?? null : null }
    }
    if (d?.kind === 'pad') {
      return { keyboard: false, pad: pads.find((g) => g.index === d.index) ?? null }
    }
    // Auto: player 1 gets the keyboard unless someone else claimed it.
    if (i === 0 && !keyboardClaimed) {
      return { keyboard: true, pad: playerCount === 1 ? freePads[0] ?? null : null }
    }
    return { keyboard: false, pad: freePads[nextFree++] ?? null }
  })
}
