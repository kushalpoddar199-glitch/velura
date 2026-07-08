// random.js — Random (seeded): deterministic per-cell rotation variation
// using mulberry32 keyed by (seed, row, col) — NOT Math.random(). Reuses
// the same PRNG utility as the Layout Engine; this is a shared low-level
// utility import, not a dependency on Layout Engine's logic, so it doesn't
// violate the "engines never call each other" boundary.

import { mulberry32, fnv1aHash } from '../../layout/prng.js';

export function randomPattern({ seed = 0 } = {}) {
  return {
    name: 'random',
    computeOffset: (row, col) => {
      const cellSeed = fnv1aHash(`${seed}|${row}|${col}`);
      const rng = mulberry32(cellSeed);
      const rotationY = rng() < 0.5 ? 0 : Math.PI;
      return { dx: 0, dz: 0, rotationY };
    },
    computeSlot: (row, col) => `random-${row}-${col}`,
  };
}
