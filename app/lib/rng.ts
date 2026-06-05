// ---------------------------------------------------------------------------
// Tiny seeded PRNG. Deterministic output keeps server- and client-rendered
// mock data identical (no hydration mismatch).
// ---------------------------------------------------------------------------

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  /** float in [0, 1) */
  next: () => number;
  /** integer in [min, max] */
  int: (min: number, max: number) => number;
  /** float in [min, max) */
  float: (min: number, max: number) => number;
  /** pick a random element */
  pick: <T>(arr: T[]) => T;
  /** true with probability p */
  chance: (p: number) => boolean;
}

export function seeded(seed: number): Rng {
  const r = mulberry32(seed);
  return {
    next: r,
    int: (min, max) => Math.floor(r() * (max - min + 1)) + min,
    float: (min, max) => r() * (max - min) + min,
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    chance: (p) => r() < p,
  };
}

/** Stable 32-bit hash of a string — handy for per-entity deterministic seeds. */
export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
