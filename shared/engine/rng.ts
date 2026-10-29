/**
 * Deterministic pseudo-random number generator (Mulberry32).
 * Enables seeded deterministic replays and reproducible unit tests.
 */

export interface RNG {
  next(): number; // [0, 1)
  nextInt(min: number, max: number): number; // [min, max] inclusive
  shuffle<T>(array: T[]): T[];
  choice<T>(array: T[]): T;
  getSeed(): number;
}

export function createRNG(seed: number): RNG {
  let s = Math.floor(seed) >>> 0;

  function next(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function nextInt(min: number, max: number): number {
    const r = next();
    return Math.floor(r * (max - min + 1)) + min;
  }

  function shuffle<T>(array: T[]): T[] {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      const temp = copy[i];
      copy[i] = copy[j];
      copy[j] = temp;
    }
    return copy;
  }

  function choice<T>(array: T[]): T {
    if (array.length === 0) {
      throw new Error('Cannot pick from empty array');
    }
    const idx = Math.floor(next() * array.length);
    return array[idx];
  }

  return {
    next,
    nextInt,
    shuffle,
    choice,
    getSeed: () => seed,
  };
}
