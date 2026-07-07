// velura-xr.js — Velura mixed-reality slab placement for Meta Quest
// launch() must be called from a click/tap handler (browser rule for XR).

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

let active = null;

async function supported() {
  if (!navigator.xr) return false;
  return navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
}

async function launch({ albedo, width = 2.4, depth = 1.6, name = 'slab' } = {}) {
  if (active) return active.session;
  if (!albedo) throw new Error('VeluraXR.launch: albedo texture URL is required');

  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;top:0;left:0;right:0;padding:14px;text-align:center;' +
    'color:#fff;font:14px system-ui;z-index:9999;pointer-events:none;' +
    'text-shadow:0 1px 3px rgba(0,0,0,.6);';
  overlay.textContent = 'Point at the floor — pull trigger to place ' + name;
  document.body.appendChild(overlay);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(devicePixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.xr.enabled = true;
  renderer.domElement.style.cssText = 'position:fixed;inset:0;z-index:9998;';
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.01, 40);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x887766, 2.2));
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(0.5, 2, 0.5);
  scene.add(dir);

  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.08, 0.10, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  const session = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay'],
    domOverlay: { root: overlay },
  });
  renderer.xr.setReferenceSpaceType('local');
  await renderer.xr.setSession(session);

  let slabTemplate = null;
  new THREE.TextureLoader().loadAsync(albedo).then(function (tex) {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    slabTemplate = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.02, depth),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.25, metalness: 0 })
    );
  }).catch(function (e) {
    console.error('VeluraXR: texture failed to load', albedo, e);
    overlay.textContent = 'Texture failed to load — check the image URL / CORS';
  });

  const controller = renderer.xr.getController(0);
  controller.addEventListener('select', function () {
    if (!reticle.visible || !slabTemplate) return;
    const slab = slabTemplate.clone();
    reticle.matrix.decompose(slab.position, slab.quaternion, new THREE.Vector3());
    scene.add(slab);
  });
  scene.add(controller);

  let hitTestSource = null;
  session.requestReferenceSpace('viewer').then(function (space) {
    session.requestHitTestSource({ space: space }).then(function (src) {
      hitTestSource = src;
    });
  });

  renderer.setAnimationLoop(function (_, frame) {
    if (frame && hitTestSource) {
      const hits = frame.getHitTestResults(hitTestSource);
      if (hits.length > 0) {
        reticle.visible = true;
        reticle.matrix.fromArray(
          hits[0].getPose(renderer.xr.getReferenceSpace()).transform.matrix
        );
      } else {
        reticle.visible = false;
      }
    }
    renderer.render(scene, camera);
  });

  session.addEventListener('end', function () {
    renderer.setAnimationLoop(null);
    renderer.domElement.remove();
    renderer.dispose();
    overlay.remove();
    active = null;
  });

  active = { session: session };
  return session;
}

window.VeluraXR = {
  supported: supported,
  launch: launch,
  end: function () { if (active) active.session.end(); },
};
export default window.VeluraXR;
