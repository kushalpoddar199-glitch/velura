// slab-shader.js — isolated GPU shader for Module 8 (Renderer).
//
// ============================================================================
// REQUIRES ON-DEVICE VALIDATION.
// GLSL compilation, texture sampling correctness, and visual output CANNOT
// be verified in Node — there is no GPU/WebGL context in this environment.
// This file is syntactically complete and documented, but "does it compile
// and look right" is only knowable by loading it in Quest Browser (or any
// WebGL2 browser) via renderer.js. Treat this as unverified until then.
// ============================================================================
//
// Contract this shader expects from the Renderer (renderer.js):
//
//   PER-INSTANCE ATTRIBUTE (via THREE.InstancedBufferAttribute, itemSize 4):
//     atlasUV : vec4(u0, v0, u1, v1) — the atlas cell rect for this slab's
//               assigned material variant, from AtlasDescriptor.uvForVariant().
//
//   BUILT-IN (three.js supplies automatically for any InstancedMesh,
//   declared explicitly here rather than relying on shader-chunk macros,
//   for portability across three.js versions):
//     attribute mat4 instanceMatrix;
//
//   UNIFORMS:
//     sampler2D albedoAtlas   — AtlasDescriptor.albedo, as a DataTexture
//     sampler2D normalAtlas   — AtlasDescriptor.normal
//     sampler2D ormAtlas      — AtlasDescriptor.orm (R=occlusion, G=roughness, B=metalness)
//     vec3      lightDirection — world-space, placeholder single directional light
//
// V1 LIGHTING SCOPE (documented, not hidden): this is a simplified single-
// direction Lambert term reading the normal map as an object-space normal
// directly — correct only because slabs are flat, Y-up, axis-aligned boxes
// before instance rotation. It is NOT a full tangent-space TBN transform and
// NOT a full metallic-roughness BRDF. Upgrading to proper PBR is a known
// extension point — swap this ShaderMaterial for MeshPhysicalMaterial +
// onBeforeCompile once three.js's standard lighting pipeline needs to be
// integrated. The architecture does not need to change for that upgrade;
// only this file does.

export const ATTRIBUTE_LAYOUT = Object.freeze({
  atlasUV: { itemSize: 4, description: 'u0,v0,u1,v1 — atlas cell rect for this instance' },
});

export const UNIFORM_LAYOUT = Object.freeze({
  albedoAtlas: { type: 'sampler2D', source: 'AtlasDescriptor.albedo' },
  normalAtlas: { type: 'sampler2D', source: 'AtlasDescriptor.normal' },
  ormAtlas: { type: 'sampler2D', source: 'AtlasDescriptor.orm' },
  lightDirection: { type: 'vec3', default: [0.4, 1.0, 0.3] },
});

export const vertexShaderSource = /* glsl */ `
attribute vec4 atlasUV;
attribute mat4 instanceMatrix;

varying vec2 vUv;
varying vec3 vNormalObjectSpace;

void main() {
  vUv = mix(atlasUV.xy, atlasUV.zw, uv);
  vNormalObjectSpace = normal;
  vec4 worldPosition = instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * worldPosition;
}
`;

export const fragmentShaderSource = /* glsl */ `
precision mediump float;

uniform sampler2D albedoAtlas;
uniform sampler2D normalAtlas;
uniform sampler2D ormAtlas;
uniform vec3 lightDirection;

varying vec2 vUv;
varying vec3 vNormalObjectSpace;

void main() {
  vec3 albedo = texture2D(albedoAtlas, vUv).rgb;
  vec3 orm = texture2D(ormAtlas, vUv).rgb;

  vec3 n = normalize(vNormalObjectSpace);
  float ndotl = max(dot(n, normalize(lightDirection)), 0.15);

  vec3 color = albedo * ndotl * orm.r;
  gl_FragColor = vec4(color, 1.0);
}
`;
