// renderer.js — Module 8.
//
// ============================================================================
// REQUIRES ON-DEVICE VALIDATION. NOT covered by `npm test`.
// This file imports three.js and creates real GPU resources (InstancedMesh,
// DataTexture, ShaderMaterial). None of that can execute meaningfully in
// Node — there is no WebGL context here. Correctness of this file is only
// knowable by loading it in a browser (Quest Browser on the 3S, or any
// WebGL2 desktop browser) and looking at the result.
//
// Everything this file DOES NOT do is deliberate: it never computes instance
// transforms, never resolves atlas UVs, never groups placements by
// dimension — all of that is instance-builder.js (Module 8's pure half,
// fully Node-tested). This file only turns already-correct data into GPU
// draw calls.
// ============================================================================

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { buildRenderGroups } from './instance-builder.js';
import { vertexShaderSource, fragmentShaderSource, UNIFORM_LAYOUT } from './shaders/slab-shader.js';

function pixelBufferToDataTexture(buf) {
  const tex = new THREE.DataTexture(buf.data, buf.width, buf.height, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.flipY = true;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

function buildShaderMaterial(atlasDescriptor) {
  return new THREE.ShaderMaterial({
    uniforms: {
      albedoAtlas: { value: pixelBufferToDataTexture(atlasDescriptor.albedo) },
      normalAtlas: { value: pixelBufferToDataTexture(atlasDescriptor.normal) },
      ormAtlas: { value: pixelBufferToDataTexture(atlasDescriptor.orm) },
      lightDirection: { value: new THREE.Vector3(...UNIFORM_LAYOUT.lightDirection.default) },
    },
    vertexShader: vertexShaderSource,
    fragmentShader: fragmentShaderSource,
  });
}

export function render(layoutResult, atlasDescriptor, scene) {
  const groups = buildRenderGroups(layoutResult, atlasDescriptor);
  const material = buildShaderMaterial(atlasDescriptor);
  const meshes = [];

  for (const group of groups) {
    const geometry = new THREE.BoxGeometry(group.widthM, 0.02, group.depthM);

    const mesh = new THREE.InstancedMesh(geometry, material, group.count);
    mesh.instanceMatrix = new THREE.InstancedBufferAttribute(group.matrices, 16);
    mesh.instanceMatrix.needsUpdate = true;

    geometry.setAttribute(
      'atlasUV',
      new THREE.InstancedBufferAttribute(group.atlasUVs, 4)
    );

    scene.add(mesh);
    meshes.push({ mesh, geometry });
  }

  function dispose() {
    for (const { mesh, geometry } of meshes) {
      scene.remove(mesh);
      geometry.dispose();
    }
    material.dispose();
    material.uniforms.albedoAtlas.value.dispose();
    material.uniforms.normalAtlas.value.dispose();
    material.uniforms.ormAtlas.value.dispose();
  }

  function update(newLayoutResult) {
    dispose();
    return render(newLayoutResult, atlasDescriptor, scene);
  }

  return { dispose, update };
}
