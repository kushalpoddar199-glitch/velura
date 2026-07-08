// end-match.js — End Match: like Bookmatch, but pairs slabs end-to-end
// along the depth (row) direction instead of side-by-side (column)
// direction — used when vein continuity along the length of a run matters
// more than across it (e.g. a long hallway).

export function endMatch() {
  return {
    name: 'end-match',
    computeOffset: (row) => ({
      dx: 0,
      dz: 0,
      rotationY: (row % 2 === 1) ? Math.PI : 0,
    }),
    computeSlot: (row, col) => {
      const pairIndex = Math.floor(row / 2);
      const side = (row % 2 === 1) ? 'bottom' : 'top';
      return `endmatch-pair-${pairIndex}-${col}-${side}`;
    },
  };
}
