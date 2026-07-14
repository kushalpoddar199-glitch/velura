class DesignRuleEngine {
  constructor() {
    this.rules = new Map();
  }
  register(name, rule) {
    this.rules.set(name, rule);
  }
  compute(name, polygon, slabSpec, config, prng) {
    const rule = this.rules.get(name);
    if (!rule) {
      throw new Error(`[DesignRuleEngine] Unknown pattern: "${name}". ` +
        `Registered: ${Array.from(this.rules.keys()).join(', ')}`);
    }
    return rule.compute(polygon, slabSpec, config, prng);
  }
  listPatterns() {
    return Array.from(this.rules.keys());
  }
}

export const designRuleEngine = new DesignRuleEngine();
