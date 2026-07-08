// atlas-builder.js — Module 7.
// The ONLY module in the system that knows what a GPU texture atlas is.
// Takes a VariantSet (from any MaterialProvider — Material Engine stays
// completely unaware this step exists) and packs it into an AtlasDescriptor
// the Renderer can bind directly.
//
// Packing plan: 3 atlases —
//   - albedo : RGB color
//   - normal : RGB tangent-space normal
//   - orm    : packed Occlusion(R) / Roughness(G) / Metalness(B)
//
// A "GPU texture" here is a PixelBuffer — converting to a three.js
// DataTexture in the browser is a one-line wrap; Node tests use
// PixelBuffers directly, keeping this module fully Node-testable.
//
// Packing strategy: simple grid pack (ceil(sqrt(N)) columns) — sufficient
// since variant count is small and known in advance from Variant Budget
// Manager.

import { createPixelBuffer, sampleBilinear, getPixel, setPixel } from '../material/pixel-buffer.js';

function resampleIfNeeded(buf, targetW, targetH) {
  if (buf.width === targetW && buf.height === targetH) return buf;
  const out = createPixelBuffer(targetW, targetH);
  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const srcX = (x + 0.5) * (buf.width / targetW) - 0.5;
      const srcY = (y + 0.5) * (buf.height / targetH) - 0.5;
      const [r, g, b, a] = sampleBilinear(buf, srcX, srcY);
      setPixel(out, x, y, r, g, b, a);
    }
  }
  return out;
}

function packOrm(aoBuf, roughnessBuf, cellRes) {
  const ao = resampleIfNeeded(aoBuf, cellRes, cellRes);
  const rough = resampleIfNeeded(roughnessBuf, cellRes, cellRes);
  const orm = createPixelBuffer(cellRes, cellRes);
  for (let y = 0; y < cellRes; y++) {
    for (let x = 0; x < cellRes; x++) {
      const [occlusion] = getPixel(ao, x, y);
      const [roughness] = getPixel(rough, x, y);
      setPixel(orm, x, y, occlusion, roughness, 0, 255);
    }
  }
  return orm;
}

function blit(destBuf, srcBuf, offsetX, offsetY) {
  for (let y = 0; y < srcBuf.height; y++) {
    for (let x = 0; x < srcBuf.width; x++) {
      const [r, g, b, a] = getPixel(srcBuf, x, y);
      setPixel(destBuf, offsetX + x, offsetY + y, r, g, b, a);
    }
  }
}

export function buildAtlas(variantSet, requirements) {
  const variants = variantSet?.variants;
  if (!variants || variants.length === 0) {
    throw new Error('buildAtlas: variantSet must contain at least one variant');
  }

  const variantCount = variants.length;
  const cellRes = requirements?.textureResolution ?? variants[0].albedo.width;
  const cols = Math.max(1, Math.ceil(Math.sqrt(variantCount)));
  const rows = Math.max(1, Math.ceil(variantCount / cols));
  const atlasW = cols * cellRes;
  const atlasH = rows * cellRes;

  const albedoAtlas = createPixelBuffer(atlasW, atlasH);
  const normalAtlas = createPixelBuffer(atlasW, atlasH);
  const ormAtlas = createPixelBuffer(atlasW, atlasH);

  variants.forEach((variant, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const offsetX = col * cellRes;
    const offsetY = row * cellRes;

    const albedoCell = resampleIfNeeded(variant.albedo, cellRes, cellRes);
    blit(albedoAtlas, albedoCell, offsetX, offsetY);

    if (variant.normal) {
      const normalCell = resampleIfNeeded(variant.normal, cellRes, cellRes);
      blit(normalAtlas, normalCell, offsetX, offsetY);
    }

    if (variant.ao && variant.roughness) {
      const ormCell = packOrm(variant.ao, variant.roughness, cellRes);
      blit(ormAtlas, ormCell, offsetX, offsetY);
    }
  });

  const hasNormal = variants.every((v) => v.normal);
  const hasOrm = variants.every((v) => v.ao && v.roughness);

  function uvForVariant(i) {
    if (i < 0 || i >= variantCount) {
      throw new Error(`uvForVariant: index ${i} out of range [0, ${variantCount})`);
    }
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      u0: col / cols,
      v0: row / rows,
      u1: (col + 1) / cols,
      v1: (row + 1) / rows,
    };
  }

  return {
    albedo: albedoAtlas,
    normal: hasNormal ? normalAtlas : null,
    orm: hasOrm ? ormAtlas : null,
    cols,
    rows,
    variantCount,
    uvForVariant,
  };
}
