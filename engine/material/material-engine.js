// material-engine.js — Module 5.
// Velura's core IP. Exposes ONLY provider selection — zero knowledge of
// texture atlases or GPU rendering (that's the Atlas Builder, Module 7).

import { createProceduralProvider } from './providers/procedural-provider.js';

const REGISTRY = Object.freeze({
  'procedural': createProceduralProvider,
});

export function getMaterialProvider(name = 'procedural') {
  const factory = REGISTRY[name];
  if (!factory) {
    throw new Error(
      `getMaterialProvider: unknown or not-yet-implemented provider "${name}". ` +
      `Available: ${Object.keys(REGISTRY).join(', ')}`
    );
  }
  return factory();
}

export function listAvailableProviders() {
  return Object.keys(REGISTRY);
}
