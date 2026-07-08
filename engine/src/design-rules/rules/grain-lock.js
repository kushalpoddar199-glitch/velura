// grain-lock.js — Grain Lock: every slab is forced to an identical fixed
// rotation (default: none), so vein/grain direction never varies across
// the floor. Distinct from Straight Lay in intent (explicit grain-alignment
// guarantee for the Material Engine to key off of) even though the
// resulting geometry is currently the same.

export function grainLock({ rotationY = 0 } = {}) {
  return {
    name: 'grain-lock',
    computeOffset: () => ({ dx: 0, dz: 0, rotationY }),
    computeSlot: (row, col) => `grainlock-${row}-${col}`,
  };
}
