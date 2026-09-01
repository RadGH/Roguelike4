/**
 * World-to-screen projection. Top-down: the sim's flat ground plane maps
 * straight onto the screen, so rooms read as plain rectangles. (The earlier
 * 2:1 isometric diamond was dropped by playtest request — the diagonal
 * rotation made rooms harder to read for no gameplay benefit.)
 * The ground marker is the authoritative visual for position — sprites are
 * decoration attached to it.
 */
export const ISO_SCALE = 32

export function toScreen(x: number, y: number): { sx: number; sy: number } {
  return {
    sx: x * ISO_SCALE,
    sy: y * ISO_SCALE,
  }
}
