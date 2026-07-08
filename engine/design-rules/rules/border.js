// border.js — Border Layout: tags perimeter cells distinctly from field
// cells, so the Material Engine / Renderer can apply a contrasting border
// stone or trim treatment.
//
// V1 limitation (documented, not hidden): computeSlot only knows (row, col),
// not the total grid extent — that's only known once Layout Engine finishes
// iterating. So this V1 implementation tags the near-origin border (row/col
// below borderDepth) accurately, and approximates the far border using an
// optional estimatedMaxRow/estimatedMaxCol hint if supplied. A precise
// far-edge border requires a second Layout Engine pass — a known extension
// point, not built in V1.

export function borderLayout({ borderDepth = 1, estimatedMaxRow = null, estimatedMaxCol = null } = {}) {
  function isBorder(row, col) {
    if (row < borderDepth || col < borderDepth) return true;
    if (estimatedMaxRow != null && row >= estimatedMaxRow - borderDepth) return true;
    if (estimatedMaxCol != null && col >= estimatedMaxCol - borderDepth) return true;
    return false;
  }
  return {
    name: 'border',
    computeOffset: () => ({ dx: 0, dz: 0, rotationY: 0 }),
    computeSlot: (row, col) => (isBorder(row, col) ? `border-${row}-${col}` : `field-${row}-${col}`),
  };
}
