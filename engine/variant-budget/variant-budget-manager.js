// variant-budget-manager.js — Module 6.
// Decides affordable material variety BEFORE the Material Engine generates
// anything. Three independent factors feed the decision:
//
//  1. slabCount  -> variantCount, via SQRT growth (diminishing returns),
//     not linear. Explicitly NOT `ceil(slabCount * 0.6)`.
//  2. floorAreaM2 / slabCount -> average slab size -> textureResolution,
//     via a target texel density (texels per metre).
//  3. deviceProfile (static table) -> hard ceilings on variantCount,
//     textureResolution, and a VRAM budget. targetFPS applies a
//     conservative resolution safety margin at high frame-rate targets.

const STANDARD_RESOLUTIONS = [256, 512, 1024, 2048, 4096];
const TEXTURES_PER_VARIANT = 3; // albedo, normal, packed ORM — matches Atlas Builder's plan
const BYTES_PER_TEXEL_RGBA8 = 4;
const ATLAS_BUDGET_FRACTION = 0.5;

function roundToStandardResolution(desired, maxAllowed) {
  let best = STANDARD_RESOLUTIONS[0];
  for (const size of STANDARD_RESOLUTIONS) {
    if (size <= maxAllowed && size <= desired) best = size;
  }
  return best;
}

export function computeBudget({ slabCount, floorAreaM2, deviceProfile, targetFPS = 90 }) {
  if (!deviceProfile) throw new Error('computeBudget: deviceProfile is required');
  if (slabCount == null || slabCount < 0) throw new Error('computeBudget: slabCount must be >= 0');
  if (floorAreaM2 == null || floorAreaM2 < 0) throw new Error('computeBudget: floorAreaM2 must be >= 0');

  const rawVariantCount = 4 + Math.sqrt(Math.max(slabCount, 1)) * 1.5;
  const variantCount = Math.max(
    4,
    Math.min(deviceProfile.maxVariants, Math.round(rawVariantCount))
  );

  const avgSlabAreaM2 = slabCount > 0 ? floorAreaM2 / slabCount : floorAreaM2;
  const avgSlabSideM = Math.sqrt(Math.max(avgSlabAreaM2, 0.01));
  const TEXEL_DENSITY_PER_METRE = 350;
  let desiredResolution = avgSlabSideM * TEXEL_DENSITY_PER_METRE;

  const fpsMargin = targetFPS >= 90 ? 0.75 : 1.0;
  desiredResolution *= fpsMargin;

  const vramBudgetBytes = deviceProfile.vramMB * 1024 * 1024 * ATLAS_BUDGET_FRACTION;
  const bytesPerTexelAllVariants = variantCount * TEXTURES_PER_VARIANT * BYTES_PER_TEXEL_RGBA8;
  const maxResolutionForVRAM = Math.sqrt(vramBudgetBytes / bytesPerTexelAllVariants);

  const cappedResolution = Math.min(
    desiredResolution,
    maxResolutionForVRAM,
    deviceProfile.maxTextureResolution
  );
  const textureResolution = roundToStandardResolution(cappedResolution, deviceProfile.maxTextureResolution);

  const actualBytesUsed = variantCount * TEXTURES_PER_VARIANT * textureResolution * textureResolution * BYTES_PER_TEXEL_RGBA8;
  const utilization = actualBytesUsed / vramBudgetBytes;
  const shaderComplexity = utilization < 0.3 ? 'high' : utilization < 0.7 ? 'medium' : 'low';

  return { variantCount, textureResolution, shaderComplexity };
}
