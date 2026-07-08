// device-profiles.js — static, known hardware budgets. NOT runtime VRAM
// probing (WebGL exposes unreliable VRAM introspection cross-platform).
//
// IMPORTANT: these are conservative launch-tuning defaults, not measured
// silicon specs from Meta/Apple documentation — real numbers should replace
// these after on-device profiling. Porting to a new device is one new row
// here; nothing else in the system changes.

export const DEVICE_PROFILES = Object.freeze({
  quest3s: Object.freeze({
    vramMB: 512,
    maxDrawCalls: 150,
    maxVariants: 16,
    maxTextureResolution: 2048,
  }),
  visionPro: Object.freeze({
    vramMB: 1024,
    maxDrawCalls: 300,
    maxVariants: 24,
    maxTextureResolution: 4096,
  }),
  desktop: Object.freeze({
    vramMB: 4096,
    maxDrawCalls: 1000,
    maxVariants: 32,
    maxTextureResolution: 4096,
  }),
});

export function getDeviceProfile(name) {
  const profile = DEVICE_PROFILES[name];
  if (!profile) {
    throw new Error(
      `getDeviceProfile: unknown device "${name}". Known devices: ${Object.keys(DEVICE_PROFILES).join(', ')}`
    );
  }
  return profile;
}
