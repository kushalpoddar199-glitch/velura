// prng.js — mulberry32, a small, fast, deterministic PRNG.
// The Layout Engine must NEVER use Math.random(). Given the same seed,
// mulberry32 produces the exact same sequence every time, on every platform —
// this is what makes computeLayout(region, spec, rule, seed) reproducible.

/**
 * @param {number} seed  any 32-bit integer
 * @returns {() => number}  a function producing floats in [0, 1)
 */
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a — fast, deterministic, non-cryptographic string hash. */
export function fnv1aHash(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
