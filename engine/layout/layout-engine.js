// layout-engine.js — Module 3.
// Pure placement math: given a buildable region and a slab spec, decide
// where every slab goes. No renderer, no WebXR, no DOM, no three.js,
// no unseeded randomness. All geometry clipping is delegated to the
// Geometry Engine — this file never touches polygon booleans itself.

import { clipRectToRegion, polygonArea } from '../geometry/geometry-engine.js';
import { mulberry32, fnv1aHash } from './prng.js';

const MM_TO_M = 1 / 1000;

function regionFingerprint(region) {
  const b = region.bounds;
  return fnv1aHash(
    `${b.minX.toFixed(4)}|${b.maxX.toFixed(4)}|${b.minZ.toFixed(4)}|${b.maxZ.toFixed(4)}|` +
    `${region.outer.length}|${region.holes.length}|${region.areaM2.toFixed(4)}`
  );
}

export function computeLayout(region, spec, rule, seed) {
  if (!region || !region.outer || region.outer.length < 3) {
    throw new Error('computeLayout: region must be a valid BuildableFloorRegion');
  }
  if (!spec || !spec.widthMM || !spec.heightMM) {
    throw new Error('computeLayout: spec must specify widthMM and heightMM');
  }
  if (!rule || typeof rule.computeOffset !== 'function' || typeof rule.computeSlot !== 'function') {
    throw new Error('computeLayout: rule must implement computeOffset and computeSlot');
  }

  const widthM = spec.widthMM * MM_TO_M;
  const depthM = spec.heightMM * MM_TO_M;
  const groutM = (spec.groutMM ?? 0) * MM_TO_M;
  const fullSlabAreaM2 = widthM * depthM;

  const rng = mulberry32(seed >>> 0);
  const regionHash = regionFingerprint(region);

  const stepX = widthM + groutM;
  const stepZ = depthM + groutM;
  const { minX, maxX, minZ, maxZ } = region.bounds;

  const margin = Math.max(widthM, depthM);
  const maxCols = Math.ceil((maxX - minX + margin) / stepX) + 1;
  const maxRows = Math.ceil((maxZ - minZ + margin) / stepZ) + 1;

  const placements = [];
  for (let row = 0; row < maxRows; row++) {
    const z = minZ + row * stepZ;
    for (let col = 0; col < maxCols; col++) {
      const x = minX + col * stepX;
      const offset = rule.computeOffset(row, col);
      const cx = x + widthM / 2 + (offset.dx ?? 0);
      const cz = z + depthM / 2 + (offset.dz ?? 0);
      const rotationY = offset.rotationY ?? 0;

      const clipped = clipRectToRegion(
        { cx, cz, width: widthM, depth: depthM, rotationY },
        region
      );
      if (!clipped) continue;

      const clippedAreaM2 = polygonArea(clipped);
      if (clippedAreaM2 < 1e-4) continue;

      const isCut = clippedAreaM2 < fullSlabAreaM2 * (1 - 1e-4);
      const patternSlot = rule.computeSlot(row, col);
      const id = `slab-${fnv1aHash(`${seed}|${row}|${col}|${regionHash}`).toString(16)}`;
      const variantId = Math.floor(rng() * 0xffffffff);

      placements.push({
        id,
        slabId: id,
        variantId,
        transform: {
          position: { x: cx, y: region.y ?? 0, z: cz },
          rotationY,
          scale: { x: 1, y: 1, z: 1 },
        },
        geometry: {
          widthM,
          depthM,
          isCut,
          cutPolygon: isCut ? clipped : undefined,
        },
        metadata: {
          row,
          col,
          patternSlot,
          isBookmatchPair: patternSlot.includes('bookmatch'),
          pairId: patternSlot.includes('bookmatch') ? patternSlot : undefined,
        },
      });
    }
  }

  const fullSlabs = placements.filter((p) => !p.geometry.isCut).length;
  const cutSlabs = placements.length - fullSlabs;
  const coveredAreaM2 = placements.reduce(
    (sum, p) => sum + (p.geometry.isCut ? polygonArea(p.geometry.cutPolygon) : fullSlabAreaM2),
    0
  );
  const materialAreaM2 = placements.length * fullSlabAreaM2;
  const wasteAreaM2 = Math.max(0, materialAreaM2 - coveredAreaM2);
  const wastePercent = materialAreaM2 > 0 ? (wasteAreaM2 / materialAreaM2) * 100 : 0;
  const estimatedCost = materialAreaM2 * (spec.pricePerM2 ?? 0);
  const rows = placements.length ? Math.max(...placements.map((p) => p.metadata.row)) + 1 : 0;
  const cols = placements.length ? Math.max(...placements.map((p) => p.metadata.col)) + 1 : 0;

  return {
    placements,
    metrics: {
      floorAreaM2: region.areaM2,
      slabCount: placements.length,
      fullSlabs,
      cutSlabs,
      coveredAreaM2,
      materialAreaM2,
      wasteAreaM2,
      wastePercent,
      estimatedCost,
      rows,
      cols,
      pattern: rule.name ?? 'unknown',
    },
    spec,
  };
}
