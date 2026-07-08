// bookmatch.js — Bookmatch: pairs adjacent slabs within a row, tagging one
// as "left" and its neighbor as "right" via patternSlot. The RIGHT partner
// gets rotationY = PI so the Material Engine / Renderer can mirror its vein
// pattern against the LEFT partner, producing the classic symmetric
// butterfly veining real bookmatched marble is prized for.
//
// This is the ONLY place mirroring happens in the whole system — per the
// architecture, Material Engine never mirrors as a general variation
// strategy. Bookmatch is a Design Rule Engine feature, requested explicitly
// via patternSlot, applied only to the pairs this rule tags.

export function bookmatch() {
  return {
    name: 'bookmatch',
    computeOffset: (row, col) => ({
      dx: 0,
      dz: 0,
      rotationY: (col % 2 === 1) ? Math.PI : 0,
    }),
    computeSlot: (row, col) => {
      const pairIndex = Math.floor(col / 2);
      const side = (col % 2 === 1) ? 'right' : 'left';
      return `bookmatch-pair-${row}-${pairIndex}-${side}`;
    },
  };
}
