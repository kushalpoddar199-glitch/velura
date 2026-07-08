// straight.js — Straight Lay: the baseline grid, no offset, no rotation.
export function straightLay() {
  return {
    name: 'straight',
    computeOffset: () => ({ dx: 0, dz: 0, rotationY: 0 }),
    computeSlot: (row, col) => `straight-${row}-${col}`,
  };
}
