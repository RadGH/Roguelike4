/**
 * Isometric projection (2:1). The sim lives on a flat ground plane; the
 * renderer projects it. The ground marker is the authoritative visual for
 * position — sprites are decoration attached to it.
 */
export const ISO_SCALE = 32

export function toScreen(x: number, y: number): { sx: number; sy: number } {
  return {
    sx: (x - y) * ISO_SCALE,
    sy: ((x + y) * ISO_SCALE) / 2,
  }
}
