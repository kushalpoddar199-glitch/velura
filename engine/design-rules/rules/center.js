// center.js — Center Layout: tags cells by concentric "ring" distance from
// a configurable center cell, for medallion-style or center-out visual
// treatments. Geometry stays a standard grid in V1 (no offset) — the ring
// tagging is metadata the Material Engine can key off of; true center-out
// placement ordering is a future Layout Engine extension.

export function centerLayout({ centerRow = 0, centerCol = 0 } = {}) {
  return {
    name: 'center',
    computeOffset: () => ({ dx: 0, dz: 0, rotationY: 0 }),
    computeSlot: (row, col) => {
      const ring = Math.max(Math.abs(row - centerRow), Math.abs(col - centerCol));
      return `center-ring${ring}-${row}-${col}`;
    },
  };
}
