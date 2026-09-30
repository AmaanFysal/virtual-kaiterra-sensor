// Seeded randomness (docs/03). sfc32 seeded by xmur3, ported from virtual-care-home
// (packages/sim-engine/src/rng.ts) so both repos draw the same way. Every error component
// of every parameter gets its own stream, so switching one component on never shifts another.

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number;
  chance(p: number): boolean;
  /** Uniform in [min, max). */
  uniform(min: number, max: number): number;
  /** Standard normal (Box-Muller; uses exactly two uniforms per call). */
  normal(): number;
}

/** xmur3 string hash; returns a generator of 32-bit seeds. */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export function createRng(seed: string): Rng {
  const seedGen = xmur3(seed);
  let a = seedGen();
  let b = seedGen();
  let c = seedGen();
  let d = seedGen();

  const next = (): number => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 15; i++) next();

  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    uniform: (min, max) => min + next() * (max - min),
    normal: () => {
      const u1 = 1 - next(); // (0, 1], so log is finite
      const u2 = next();
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    },
  };
}

/** A named stream under a device seed: `${seed}/${part}/${part}...`. */
export function stream(seed: string, ...parts: string[]): Rng {
  return createRng([seed, ...parts].join("/"));
}

/** Stable 32-bit FNV-1a hash as 8 hex chars. */
export function hashString(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
