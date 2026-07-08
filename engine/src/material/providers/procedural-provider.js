// procedural-provider.js — Module 5, V1 MaterialProvider implementation.
//
// Turns one MasterMaterial into N distinct variants that stay visually
// in-family. The algorithm, precisely:
//   1. Domain-warp the sampling coordinates with layered value noise (fbm2D)
//      — NOT rotation or mirroring — so veins bend organically per variant.
//   2. Anisotropic stretch along the master's grainAxis, so displacement
//      respects the direction the vein naturally runs.
//   3. Luminance drift, clamped to the master's own histogram bounds — this
//      is the "family coherence" guarantee: every variant's brightness stays
//      within the range the original scan actually exhibits.
//   4. Height is derived from the warped albedo's luminance (cheap, standard
//      technique). Normal is derived from height via a Sobel filter. AO is
//      derived from height-gradient magnitude (edge darkening near veins).
//      Roughness is a base value plus small per-pixel noise.
// Every channel is populated for every variant from V1 onward — see
// architecture doc, "PBR channels from V1" — so the Renderer's shader never
// has to branch on channel availability.
//
// IMPORTANT — CPU vs GPU: this is a pure CPU implementation so it's
// Node-testable with zero dependencies (architecture Principle #3). The
// production runtime bakes the identical algorithm as a GLSL fragment
// shader for real-time GPU execution (Atlas Builder, a later module); the
// math here is written to port 1:1 — same noise function, same warp logic,
// same clamping — so CPU-tested behavior and GPU-rendered behavior agree.
// Never rotation/mirroring as the variation mechanism — that's reserved
// exclusively for the Design Rule Engine's explicit Bookmatch feature.

import {
  createPixelBuffer, sampleBilinear, luminance, computeLuminanceHistogram,
} from '../pixel-buffer.js';
import { fbm2D } from '../noise.js';
import { mulberry32, fnv1aHash } from '../../layout/prng.js';

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function warpAndDrift(master, width, height, seed, grainAxis, histogram) {
  const rng = mulberry32(seed);
  const stretchFactor = 0.9 + rng() * 0.2;
  const brightnessBias = (rng() - 0.5) * 16;
  const warpAmpPx = Math.max(width, height) * 0.05;
  const noiseSeed = seed;

  const axisLen = Math.hypot(grainAxis.x, grainAxis.z) || 1;
  const ax = grainAxis.x / axisLen, az = grainAxis.z / axisLen;
  const px = -az, pz = ax;

  const albedo = createPixelBuffer(width, height);
  const heightBuf = createPixelBuffer(width, height);

  const srcW = master.albedo.width, srcH = master.albedo.height;
  const scaleU = srcW / width, scaleV = srcH / height;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const along = x * ax + y * az;
      const across = x * px + y * pz;
      const stretchedAlong = along * stretchFactor;
      const sx = stretchedAlong * ax + across * px;
      const sy = stretchedAlong * az + across * pz;

      const wx = (fbm2D(sx * 0.02, sy * 0.02, noiseSeed, 3) - 0.5) * 2;
      const wy = (fbm2D(sx * 0.02 + 50, sy * 0.02 + 50, noiseSeed, 3) - 0.5) * 2;

      const sampleX = (sx + wx * warpAmpPx) * scaleU;
      const sampleY = (sy + wy * warpAmpPx) * scaleV;

      const [r, g, b, a] = sampleBilinear(master.albedo, sampleX, sampleY);
      const l = luminance(r, g, b);

      const targetL = clamp(l + brightnessBias, histogram.min, histogram.max);
      const scale = l > 0.001 ? targetL / l : 1;

      const rr = clamp(r * scale, 0, 255);
      const gg = clamp(g * scale, 0, 255);
      const bb = clamp(b * scale, 0, 255);

      const i = (y * width + x) * 4;
      albedo.data[i] = rr; albedo.data[i + 1] = gg; albedo.data[i + 2] = bb; albedo.data[i + 3] = a;
      const hVal = luminance(rr, gg, bb);
      heightBuf.data[i] = hVal; heightBuf.data[i + 1] = hVal; heightBuf.data[i + 2] = hVal; heightBuf.data[i + 3] = 255;
    }
  }

  return { albedo, height: heightBuf };
}

function deriveNormal(heightBuf) {
  const { width, height } = heightBuf;
  const normal = createPixelBuffer(width, height);
  const strength = 2.0;
  const hAt = (x, y) => {
    const xi = ((x % width) + width) % width;
    const yi = ((y % height) + height) % height;
    return heightBuf.data[(yi * width + xi) * 4];
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (hAt(x + 1, y) - hAt(x - 1, y)) / 255 * strength;
      const dy = (hAt(x, y + 1) - hAt(x, y - 1)) / 255 * strength;
      let nx = -dx, ny = -dy, nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      const i = (y * width + x) * 4;
      normal.data[i] = clamp((nx * 0.5 + 0.5) * 255, 0, 255);
      normal.data[i + 1] = clamp((ny * 0.5 + 0.5) * 255, 0, 255);
      normal.data[i + 2] = clamp((nz * 0.5 + 0.5) * 255, 0, 255);
      normal.data[i + 3] = 255;
    }
  }
  return normal;
}

function deriveAO(heightBuf) {
  const { width, height } = heightBuf;
  const ao = createPixelBuffer(width, height);
  const hAt = (x, y) => {
    const xi = ((x % width) + width) % width;
    const yi = ((y % height) + height) % height;
    return heightBuf.data[(yi * width + xi) * 4];
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx = hAt(x + 1, y) - hAt(x - 1, y);
      const gy = hAt(x, y + 1) - hAt(x, y - 1);
      const gradMag = Math.hypot(gx, gy);
      const occlusion = clamp(255 - gradMag * 1.5, 175, 255);
      const i = (y * width + x) * 4;
      ao.data[i] = occlusion; ao.data[i + 1] = occlusion; ao.data[i + 2] = occlusion; ao.data[i + 3] = 255;
    }
  }
  return ao;
}

function deriveRoughness(width, height, seed, baseRoughness = 0.35) {
  const rough = createPixelBuffer(width, height);
  const noiseSeed = seed + 9999;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const n = fbm2D(x * 0.08, y * 0.08, noiseSeed, 2);
      const r = clamp((baseRoughness + (n - 0.5) * 0.1) * 255, 0, 255);
      const i = (y * width + x) * 4;
      rough.data[i] = r; rough.data[i + 1] = r; rough.data[i + 2] = r; rough.data[i + 3] = 255;
    }
  }
  return rough;
}

export async function proceduralGenerateMaterialVariants(masterMaterial, requirements) {
  if (!masterMaterial || !masterMaterial.albedo) {
    throw new Error('proceduralGenerateMaterialVariants: masterMaterial.albedo is required');
  }
  const count = requirements?.variantCount ?? 4;
  const resolution = requirements?.textureResolution ?? masterMaterial.albedo.width;
  const grainAxis = masterMaterial.metadata?.grainAxis ?? { x: 1, z: 0 };
  const baseSeed = masterMaterial.metadata?.seed ?? 0;
  const sourceId = masterMaterial.metadata?.sourceId ?? 'unknown';

  const histogram = computeLuminanceHistogram(masterMaterial.albedo);

  const variants = [];
  for (let i = 0; i < count; i++) {
    const variantSeed = fnv1aHash(`${baseSeed}|${sourceId}|variant|${i}`);
    const { albedo, height } = warpAndDrift(
      masterMaterial, resolution, resolution, variantSeed, grainAxis, histogram
    );
    const normal = deriveNormal(height);
    const ao = deriveAO(height);
    const roughness = deriveRoughness(resolution, resolution, variantSeed);

    variants.push({
      id: i,
      albedo,
      normal,
      roughness,
      ao,
      height,
      metadata: { grainAxis, seed: variantSeed },
    });
  }

  return {
    variants,
    metadata: { sourceId, baseSeed, resolution, histogram },
  };
}

export function createProceduralProvider() {
  return { generateMaterialVariants: proceduralGenerateMaterialVariants };
}
