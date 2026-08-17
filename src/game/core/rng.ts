// Deterministic RNG: mulberry32 streams derived from a single run seed.
// Gameplay code may ONLY roll from a named stream — Math.random is forbidden in core.

export type RngStream = {
  next(): number; // [0, 1)
  int(minInclusive: number, maxInclusive: number): number;
  chance(probability: number): boolean;
  pick<T>(arr: readonly T[]): T;
};

export type RngStreamName = 'combat' | 'drops' | 'waves' | 'variants' | 'cosmetic';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeStream(seed: number): RngStream {
  const next = mulberry32(seed);
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (arr) => {
      if (arr.length === 0) throw new Error('rng.pick on empty array');
      return arr[Math.floor(next() * arr.length)]!;
    },
  };
}

export type Rng = Record<RngStreamName, RngStream> & { readonly runSeed: number };

export function createRng(runSeed: number): Rng {
  const stream = (name: RngStreamName) =>
    makeStream((runSeed ^ hashString(name)) >>> 0);
  return {
    runSeed,
    combat: stream('combat'),
    drops: stream('drops'),
    waves: stream('waves'),
    variants: stream('variants'),
    cosmetic: stream('cosmetic'),
  };
}
