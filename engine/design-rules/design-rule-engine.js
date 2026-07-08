// design-rule-engine.js — Module 4.
// Owns installation style as data. The Layout Engine never knows about
// design styles — it only ever sees the opaque PatternRule this module
// hands back: { name, computeOffset(row,col), computeSlot(row,col) }.
//
// Adding a new pattern (Herringbone, Versailles, Chevron, ...) means adding
// one file to rules/ and one line in the registry below. Nothing in the
// Layout Engine changes.

import { straightLay } from './rules/straight.js';
import { runningBond } from './rules/running-bond.js';
import { bookmatch } from './rules/bookmatch.js';
import { endMatch } from './rules/end-match.js';
import { grainLock } from './rules/grain-lock.js';
import { randomPattern } from './rules/random.js';
import { borderLayout } from './rules/border.js';
import { centerLayout } from './rules/center.js';

const REGISTRY = Object.freeze({
  'straight': straightLay,
  'running-bond': runningBond,
  'bookmatch': bookmatch,
  'end-match': endMatch,
  'grain-lock': grainLock,
  'random': randomPattern,
  'border': borderLayout,
  'center': centerLayout,
});

export function getPatternRule(name, options = {}) {
  const factory = REGISTRY[name];
  if (!factory) {
    throw new Error(
      `getPatternRule: unknown pattern "${name}". Known patterns: ${Object.keys(REGISTRY).join(', ')}`
    );
  }
  return factory(options);
}

export function listAvailablePatterns() {
  return Object.keys(REGISTRY);
}
