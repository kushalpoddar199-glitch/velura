// instance-builder.js — pure CPU-side prep for Module 8 (Renderer).
//
// Deliberately has ZERO dependency on three.js or any GPU API. Its job is
// entirely data transformation:
//   LayoutResult.placements + AtlasDescriptor
//     -> one RenderGroup per unique slab dimension, each holding a flat
//        Float32Array of 4x4 instance matrices and a flat Float32Array of
//        per-instance atlas UV rects.
//
// This is what "one shared BoxGeometry per unique slab dimension, one
// InstancedMesh per group" actually needs at the data level. renderer.js
// (three.js-dependent, GPU-touching) consumes RenderGroup output directly —
// it never recomputes transforms or UV math itself.
//
// The 4x4 matrices are hand-composed (translation * Y-rotation * scale) in
// the exact column-major element order three.js's Matrix4 uses, so the
// output Float32Array can be assigned straight into
// `instancedMesh.instanceMatrix.array` with no conversion step, without
// this module ever importing three.js.

export function composeMatrix(position, rotationY, scale) {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  const { x: sx, y: sy, z: sz } = scale;
  const { x: tx, y: ty, z: tz } = position;
  const nz = (v) => (v === 0 ? 0 : v);

  return [
    nz(c * sx), 0, nz(-s * sx), 0,
    0, sy, 0, 0,
    nz(s * sz), 0, nz(c * sz), 0,
    tx, ty, tz, 1,
  ];
}

function dimensionKey(widthM, depthM) {
  return `${widthM.toFixed(4)}x${depthM.toFixed(4)}`;
}

export function buildRenderGroups(layoutResult, atlasDescriptor) {
  if (!layoutResult || !Array.isArray(layoutResult.placements)) {
    throw new Error('buildRenderGroups: layoutResult.placements must be an array');
  }
  if (!atlasDescriptor || typeof atlasDescriptor.uvForVariant !== 'function') {
    throw new Error('buildRenderGroups: atlasDescriptor.uvForVariant must be a function');
  }

  const buckets = new Map();
  for (const placement of layoutResult.placements) {
    const key = dimensionKey(placement.geometry.widthM, placement.geometry.depthM);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(placement);
  }

  const groups = [];
  for (const placements of buckets.values()) {
    const count = placements.length;
    const matrices = new Float32Array(16 * count);
    const atlasUVs = new Float32Array(4 * count);
    const placementIds = new Array(count);

    placements.forEach((p, i) => {
      const m = composeMatrix(p.transform.position, p.transform.rotationY, p.transform.scale);
      matrices.set(m, i * 16);

      const variantIndex = ((p.variantId % atlasDescriptor.variantCount) + atlasDescriptor.variantCount)
        % atlasDescriptor.variantCount;
      const uv = atlasDescriptor.uvForVariant(variantIndex);
      atlasUVs[i * 4 + 0] = uv.u0;
      atlasUVs[i * 4 + 1] = uv.v0;
      atlasUVs[i * 4 + 2] = uv.u1;
      atlasUVs[i * 4 + 3] = uv.v1;

      placementIds[i] = p.id;
    });

    groups.push({
      widthM: placements[0].geometry.widthM,
      depthM: placements[0].geometry.depthM,
      count,
      matrices,
      atlasUVs,
      placementIds,
    });
  }

  return groups;
}
