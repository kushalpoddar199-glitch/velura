import { createPRNG } from './prng.js';
import { designRuleEngine } from '../design-rules/design-rule-engine.js';
import { StraightLayRule } from '../design-rules/design-rules/straight-lay.js';
import { RunningBondRule } from '../design-rules/design-rules/running-bond.js';

designRuleEngine.register(StraightLayRule.name, StraightLayRule);
designRuleEngine.register(RunningBondRule.name, RunningBondRule);

export function computeLayout(floorPolygon, slabSpec, patternConfig, seed) {
  if (!floorPolygon || floorPolygon.length < 3) {
    throw new Error('[LayoutEngine] Invalid floorPolygon: must have >= 3 vertices');
  }
  if (!slabSpec || slabSpec.width <= 0 || slabSpec.height <= 0) {
    throw new Error('[LayoutEngine] Invalid slabSpec: width and height must be > 0');
  }
  if (!patternConfig || !patternConfig.pattern) {
    throw new Error('[LayoutEngine] patternConfig.pattern is required');
  }

  const prng = createPRNG(seed);
  const configWithSeed = { ...patternConfig, _seed: seed };

  const result = designRuleEngine.compute(
    patternConfig.pattern, floorPolygon, slabSpec, configWithSeed, prng
  );

  validateLayoutResult(result, floorPolygon);
  return result;
}

function validateLayoutResult(result, floorPolygon) {
  if (result.wasteArea < -1e-6) {
    throw new Error(`[LayoutEngine] Invariant violated: wasteArea < 0 (${result.wasteArea})`);
  }
  if (result.placedArea > result.floorArea + 1e-4) {
    throw new Error(
      `[LayoutEngine] Invariant violated: placedArea (${result.placedArea}) > floorArea (${result.floorArea})`
    );
  }
  for (const p of result.placements) {
    if (!p.bounds) throw new Error(`[LayoutEngine] Placement ${p.id} missing bounds`);
  }
  const expectedCount = result.fullSlabCount + result.cutSlabCount;
  if (expectedCount !== result.placements.length) {
    throw new Error(
      `[LayoutEngine] Count mismatch: full+cut=${expectedCount}, placements=${result.placements.length}`
    );
  }
}

export { designRuleEngine };
