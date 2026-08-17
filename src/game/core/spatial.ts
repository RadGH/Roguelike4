// Spatial hash grid for broad-phase queries (never O(n·m) brute force — predecessor scar).
// Rebuilt each tick from live entities; queries return candidates within a radius.

export type SpatialEntry = { id: number; x: number; y: number; r: number };

export class SpatialHash {
  private cells = new Map<number, SpatialEntry[]>();
  constructor(private cellSize = 4) {}

  private key(cx: number, cy: number): number {
    // Interleave into one int; grid coords fit comfortably in 16 bits signed.
    return ((cx & 0xffff) << 16) | (cy & 0xffff);
  }

  clear(): void {
    this.cells.clear();
  }

  insert(e: SpatialEntry): void {
    const minX = Math.floor((e.x - e.r) / this.cellSize);
    const maxX = Math.floor((e.x + e.r) / this.cellSize);
    const minY = Math.floor((e.y - e.r) / this.cellSize);
    const maxY = Math.floor((e.y + e.r) / this.cellSize);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const k = this.key(cx, cy);
        let bucket = this.cells.get(k);
        if (!bucket) {
          bucket = [];
          this.cells.set(k, bucket);
        }
        bucket.push(e);
      }
    }
  }

  /** Collect entries whose cells overlap the query circle. Caller does exact tests. */
  query(x: number, y: number, radius: number, out: SpatialEntry[] = []): SpatialEntry[] {
    out.length = 0;
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minY = Math.floor((y - radius) / this.cellSize);
    const maxY = Math.floor((y + radius) / this.cellSize);
    const seen = new Set<number>();
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const bucket = this.cells.get(this.key(cx, cy));
        if (!bucket) continue;
        for (const e of bucket) {
          if (!seen.has(e.id)) {
            seen.add(e.id);
            out.push(e);
          }
        }
      }
    }
    return out;
  }
}
