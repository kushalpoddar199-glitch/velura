// running-bond.js — Running Bond: classic brick offset. Every other row is
// shifted by a fraction of the slab width (0.5 = half-brick, the default;
// 0.33 gives a one-third offset, etc.).
//
// computeOffset must stay a pure function of (row, col) per the PatternRule
// contract, so widthM and bondRatio are captured in this closure at rule
// creation — not passed in per-call.

export function runningBond({ widthM, bondRatio = 0.5 } = {}) {
  if (!widthM) throw new Error('runningBond requires { widthM } — the slab width in metres');
  return {
    name: 'running-bond',
    computeOffset: (row) => ({
      dx: (row % 2 === 1) ? widthM * bondRatio : 0,
      dz: 0,
      rotationY: 0,
    }),
    computeSlot: (row, col) => `running-bond-${row}-${col}`,
  };
}
