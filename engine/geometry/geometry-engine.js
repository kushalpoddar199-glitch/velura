// geometry-engine.js — Module 2.
// Converts a raw, possibly noisy floor polygon into a mathematically sound
// BuildableFloorRegion, and provides the ONE clipping primitive the Layout
// Engine is allowed to use. The Layout Engine must never perform polygon
// boolean operations itself — this file is where all of that lives.
//
// Isomorphic: pure JS + martinez-polygon-clipping, no WebXR, no three.js.

import * as martinez from 'martinez-polygon-clipping';

const DEFAULT_SIMPLIFY_TOLERANCE_M = 0.03; // 3cm — removes plane-detection jitter

// ---------------------------------------------------------------
// Low-level polygon math
// ---------------------------------------------------------------

/** Shoelace formula. `points` open (no repeated closing vertex). */
export function polygonArea(points) {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    area += a.x * b.z - b.x * a.z;
  }
  return Math.abs(area / 2);
}

function signedArea(points) {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    area += a.x * b.z - b.x * a.z;
  }
  return area / 2;
}

function isCCW(points) {
  return signedArea(points) > 0;
}

function ensureWinding(points, ccw) {
  const currentlyCCW = isCCW(points);
  return currentlyCCW === ccw ? points.slice() : points.slice().reverse();
}

function computeBounds(points) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  return { minX, maxX, minZ, maxZ };
}

/** Standard segment intersection test (excludes shared endpoints). */
function segmentsIntersect(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.z - p3.z) - (p2.z - p1.z) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-12) return false; // parallel
  const t = ((p3.x - p1.x) * (p4.z - p3.z) - (p3.z - p1.z) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.z - p1.z) - (p3.z - p1.z) * (p2.x - p1.x)) / d;
  const eps = 1e-9;
  return t > eps && t < 1 - eps && u > eps && u < 1 - eps;
}

/** O(n^2) self-intersection check — fine at floor-polygon vertex counts. */
export function selfIntersects(points) {
  const n = points.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a1 = points[i], a2 = points[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (j === i) continue;
      const isAdjacent = j === i || (j + 1) % n === i || (i + 1) % n === j;
      if (isAdjacent) continue;
      const b1 = points[j], b2 = points[(j + 1) % n];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

/**
 * Douglas-Peucker simplification. Treats the ring as a closed loop by
 * re-anchoring at the point farthest from the centroid before simplifying,
 * so the closing edge isn't arbitrarily distorted.
 */
export function simplify(points, toleranceM = DEFAULT_SIMPLIFY_TOLERANCE_M) {
  if (points.length <= 3) return points.slice();

  function perpendicularDistance(pt, lineStart, lineEnd) {
    const dx = lineEnd.x - lineStart.x;
    const dz = lineEnd.z - lineStart.z;
    const len = Math.hypot(dx, dz);
    if (len === 0) return Math.hypot(pt.x - lineStart.x, pt.z - lineStart.z);
    const t = ((pt.x - lineStart.x) * dx + (pt.z - lineStart.z) * dz) / (len * len);
    const projX = lineStart.x + t * dx;
    const projZ = lineStart.z + t * dz;
    return Math.hypot(pt.x - projX, pt.z - projZ);
  }

  function dpRecursive(pts, tolerance) {
    if (pts.length <= 2) return pts;
    let maxDist = 0, maxIndex = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const dist = perpendicularDistance(pts[i], pts[0], pts[pts.length - 1]);
      if (dist > maxDist) { maxDist = dist; maxIndex = i; }
    }
    if (maxDist > tolerance) {
      const left = dpRecursive(pts.slice(0, maxIndex + 1), tolerance);
      const right = dpRecursive(pts.slice(maxIndex), tolerance);
      return left.slice(0, -1).concat(right);
    }
    return [pts[0], pts[pts.length - 1]];
  }

  const open = points.concat([points[0]]);
  const result = dpRecursive(open, toleranceM);
  result.pop();
  return result.length >= 3 ? result : points.slice();
}

// ---------------------------------------------------------------
// martinez-polygon-clipping adapters
// ---------------------------------------------------------------

function toRing(points) {
  const coords = points.map((p) => [p.x, p.z]);
  const first = coords[0], last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) coords.push(first);
  return coords;
}

function fromRing(ring) {
  const pts = ring.map(([x, z]) => ({ x, z }));
  const first = pts[0], last = pts[pts.length - 1];
  if (Math.abs(first.x - last.x) < 1e-9 && Math.abs(first.z - last.z) < 1e-9) {
    pts.pop();
  }
  return pts;
}

function regionToMartinezPolygon(region) {
  return [toRing(region.outer), ...region.holes.map(toRing)];
}

function repairSelfIntersection(points) {
  const ring = [toRing(points)];
  const result = martinez.union(ring, ring);
  if (!result || result.length === 0) return points;

  let best = null, bestArea = -1;
  for (const poly of result) {
    const outerPts = fromRing(poly[0]);
    const area = polygonArea(outerPts);
    if (area > bestArea) { bestArea = area; best = outerPts; }
  }
  return best || points;
}

// ---------------------------------------------------------------
// Public API
// ---------------------------------------------------------------

export function buildRegion(floorPolygon, holes = [], options = {}) {
  const tolerance = options.simplifyToleranceM ?? DEFAULT_SIMPLIFY_TOLERANCE_M;

  if (!floorPolygon || !Array.isArray(floorPolygon.points) || floorPolygon.points.length < 3) {
    throw new Error('buildRegion: floorPolygon must have at least 3 points');
  }

  let outer = simplify(floorPolygon.points, tolerance);
  if (selfIntersects(outer)) {
    outer = repairSelfIntersection(outer);
  }
  outer = ensureWinding(outer, true);

  const cleanHoles = [];
  for (const rawHole of holes) {
    if (!rawHole || rawHole.length < 3) continue;
    const simplifiedHole = simplify(rawHole, tolerance);
    const clipped = martinez.intersection(
      [toRing(outer)],
      [toRing(simplifiedHole)]
    );
    if (!clipped || clipped.length === 0) continue;
    for (const poly of clipped) {
      const pts = fromRing(poly[0]);
      if (pts.length >= 3 && polygonArea(pts) > 1e-6) {
        cleanHoles.push(ensureWinding(pts, false));
      }
    }
  }

  let netAreaM2 = polygonArea(outer);
  if (cleanHoles.length > 0) {
    let holesUnion = [toRing(cleanHoles[0])];
    for (let i = 1; i < cleanHoles.length; i++) {
      holesUnion = martinez.union(holesUnion, [toRing(cleanHoles[i])]);
      holesUnion = holesUnion.map((poly) => poly[0]);
    }
    const diffResult = martinez.diff([toRing(outer)], holesUnion);
    netAreaM2 = diffResult.reduce((sum, poly) => {
      const outerArea = polygonArea(fromRing(poly[0]));
      const innerArea = poly.slice(1).reduce((s, ring) => s + polygonArea(fromRing(ring)), 0);
      return sum + (outerArea - innerArea);
    }, 0);
  }

  return {
    outer,
    holes: cleanHoles,
    areaM2: netAreaM2,
    bounds: computeBounds(outer),
  };
}

export function clipRectToRegion(rect, region) {
  const { cx, cz, width, depth, rotationY = 0 } = rect;
  const hw = width / 2, hd = depth / 2;
  const cos = Math.cos(rotationY), sin = Math.sin(rotationY);
  const localCorners = [
    { x: -hw, z: -hd }, { x: hw, z: -hd }, { x: hw, z: hd }, { x: -hw, z: hd },
  ];
  const rectPoints = localCorners.map((p) => ({
    x: cx + p.x * cos - p.z * sin,
    z: cz + p.x * sin + p.z * cos,
  }));

  const regionPoly = regionToMartinezPolygon(region);
  const rectPoly = [toRing(rectPoints)];

  let result;
  try {
    result = martinez.intersection(regionPoly, rectPoly);
  } catch {
    return null;
  }
  if (!result || result.length === 0) return null;

  let best = null, bestArea = -1;
  for (const poly of result) {
    const pts = fromRing(poly[0]);
    const area = polygonArea(pts);
    if (area > bestArea) { bestArea = area; best = pts; }
  }
  return bestArea > 1e-6 ? best : null;
}
