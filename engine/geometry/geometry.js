export function polygonArea(poly) {
  let area = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
  }
  return Math.abs(area) * 0.5;
}

export function computeBoundingBox(poly) {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function isPointInPolygon(point, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function clipPolygon(subject, clipper) {
  if (subject.length < 3) return [];

  let output = subject;

  for (let i = 0; i < clipper.length; i++) {
    const j = (i + 1) % clipper.length;
    const edge = { a: clipper[i], b: clipper[j] };

    const input = output;
    output = [];
    if (input.length === 0) break;

    for (let k = 0; k < input.length; k++) {
      const l = (k + 1) % input.length;
      const current = input[k];
      const next = input[l];

      const currIn = isInside(current, edge);
      const nextIn = isInside(next, edge);

      if (currIn && nextIn) {
        output.push(next);
      } else if (currIn && !nextIn) {
        const inter = computeIntersection(current, next, edge);
        if (inter) output.push(inter);
      } else if (!currIn && nextIn) {
        const inter = computeIntersection(current, next, edge);
        if (inter) output.push(inter);
        output.push(next);
      }
    }
  }

  return output;
}

function isInside(point, edge) {
  const cross = (edge.b.x - edge.a.x) * (point.y - edge.a.y) -
                (edge.b.y - edge.a.y) * (point.x - edge.a.x);
  return cross >= -1e-9;
}

function computeIntersection(a, b, edge) {
  const dx1 = b.x - a.x;
  const dy1 = b.y - a.y;
  const dx2 = edge.b.x - edge.a.x;
  const dy2 = edge.b.y - edge.a.y;

  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-10) return null;

  const t = ((edge.a.x - a.x) * dy2 - (edge.a.y - a.y) * dx2) / denom;
  return {
    x: a.x + t * dx1,
    y: a.y + t * dy1
  };
}

export function getRectangleCorners(center, width, height, rotation) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const hw = width * 0.5;
  const hh = height * 0.5;

  const local = [
    { x: -hw, y: -hh },
    { x:  hw, y: -hh },
    { x:  hw, y:  hh },
    { x: -hw, y:  hh }
  ];

  return local.map(p => ({
    x: center.x + (p.x * cos - p.y * sin),
    y: center.y + (p.x * sin + p.y * cos)
  }));
}

export function polygonBounds(poly) {
  if (poly.length === 0) return null;
  return computeBoundingBox(poly);
}
