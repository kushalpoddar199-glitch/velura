// velura-xr.js — Velura mixed-reality auto floor-tiling for Meta Quest
// Flow: Scanning room -> Floor found -> (trigger) -> Calculating layout -> Entire floor tiled

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

let active = null;

async function supported() {
  if (!navigator.xr) return false;
  return navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
}

function pointInPolygon(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1];
    const xj = poly[j][0], zj = poly[j][1];
    const intersect = ((zi > z) !== (zj > z)) &&
      (x < (xj - xi) * (z - zi) / (zj - zi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function polygonArea(poly) {
  let area = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    area += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  }
  return Math.abs(area / 2);
}

async function launch({ albedo, width = 2.4, depth = 1.6, grout = 0.02, name = 'slab' } = {}) {
  if (active) return active.session;
  if (!albedo) throw new Error('VeluraXR.launch: albedo texture URL is required');

  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;top:0;left:0;right:0;padding:14px;text-align:center;' +
    'color:#fff;font:14px system-ui;z-index:9999;pointer-events:none;' +
    'text-shadow:0 1px 3px rgba(0,0,0,.6);';
  const setStatus = (text) => { overlay.textContent = text; };
  setStatus('Scanning room…');
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
    optionalFeatures: ['dom-overlay', 'plane-detection'],
    domOverlay: { root: overlay },
  });
  renderer.xr.setReferenceSpaceType('local');
  await renderer.xr.setSession(session);

  const planeDetectionOn = session.enabledFeatures?.includes('plane-detection') ?? false;

  let slabMaterial = null;
  new THREE.TextureLoader().loadAsync(albedo).then((tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    slabMaterial = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.25, metalness: 0 });
  }).catch((e) => {
    console.error('VeluraXR: texture failed to load', albedo, e);
    setStatus('Texture failed to load — check the image URL / CORS');
  });

  const STATE = { SCANNING: 0, FLOOR_FOUND: 1, TILED: 2 };
  let state = STATE.SCANNING;
  let floorPlane = null;
  let floorPose = null;

  function tileFloor() {
    if (!floorPlane || !floorPose || !slabMaterial) return;
    state = STATE.TILED;
    setStatus('Calculating layout…');
    reticle.visible = false;

    const poly2d = floorPlane.polygon.map(p => [p.x, p.z]);
    const area = polygonArea(poly2d);
    if (area < 0.5) { setStatus('Floor too small — try a bigger open area'); return; }

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    poly2d.forEach(([x, z]) => {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    });

    const planeMatrix = new THREE.Matrix4().fromArray(floorPose.transform.matrix);
    const step = { x: width + grout, z: depth + grout };
    const tiles = [];

    for (let x = minX + width / 2; x <= maxX; x += step.x) {
      for (let z = minZ + depth / 2; z <= maxZ; z += step.z) {
        const hw = width / 2, hd = depth / 2;
        const corners = [
          [x - hw, z - hd], [x + hw, z - hd], [x - hw, z + hd], [x + hw, z + hd],
        ];
        const allIn = corners.every(([cx, cz]) => pointInPolygon(cx, cz, poly2d));
        if (allIn) tiles.push({ x, z });
      }
    }

    if (tiles.length === 0) { setStatus('Could not fit a slab — try a larger floor area'); return; }

    const cx0 = (minX + maxX) / 2, cz0 = (minZ + maxZ) / 2;
    tiles.forEach(({ x, z }) => {
      const dist = Math.hypot(x - cx0, z - cz0);
      const slab = new THREE.Mesh(new THREE.BoxGeometry(width, 0.02, depth), slabMaterial);
      slab.scale.set(0.001, 0.001, 0.001);
      const local = new THREE.Matrix4().makeTranslation(x, 0, z);
      const world = planeMatrix.clone().multiply(local);
      world.decompose(slab.position, slab.quaternion, new THREE.Vector3());
      scene.add(slab);
      setTimeout(() => {
        const start = performance.now();
        const dur = 260;
        function grow(t) {
          const p = Math.min(1, (t - start) / dur);
          const s = p < 1 ? p : 1;
          slab.scale.set(s, s, s);
          if (p < 1) requestAnimationFrame(grow);
        }
        requestAnimationFrame(grow);
      }, dist * 120);
    });

    setStatus(`Entire floor tiled — ${tiles.length} slab${tiles.length > 1 ? 's' : ''} of ${name}`);
  }

  const controller = renderer.xr.getController(0);
  controller.addEventListener('select', () => {
    if (state === STATE.FLOOR_FOUND) {
      tileFloor();
    } else if (state === STATE.SCANNING && reticle.visible && slabMaterial) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(width, 0.02, depth), slabMaterial);
      reticle.matrix.decompose(slab.position, slab.quaternion, new THREE.Vector3());
      scene.add(slab);
      setStatus(`Placed ${name} — plane detection unavailable, tap again for more`);
    }
  });
  scene.add(controller);

  let hitTestSource = null;
  session.requestReferenceSpace('viewer').then((space) =>
    session.requestHitTestSource({ space }).then((src) => { hitTestSource = src; })
  );

  renderer.setAnimationLoop((_, frame) => {
    if (frame) {
      const refSpace = renderer.xr.getReferenceSpace();

      if (state === STATE.SCANNING && hitTestSource) {
        const hits = frame.getHitTestResults(hitTestSource);
        if (hits.length > 0) {
          reticle.visible = true;
          reticle.matrix.fromArray(hits[0].getPose(refSpace).transform.matrix);
        } else {
          reticle.visible = false;
        }
      }

      if (planeDetectionOn && frame.detectedPlanes && state !== STATE.TILED) {
        let best = null, bestArea = 0, bestY = Infinity;
        frame.detectedPlanes.forEach((plane) => {
          if (plane.orientation !== 'horizontal') return;
          const pose = frame.getPose(plane.planeSpace, refSpace);
          if (!pose) return;
          const poly2d = plane.polygon.map(p => [p.x, p.z]);
          const area = polygonArea(poly2d);
          if (area > 0.5 && (area > bestArea || pose.transform.position.y < bestY - 0.05)) {
            best = plane; bestArea = area; bestY = pose.transform.position.y;
          }
        });
        if (best) {
          floorPlane = best;
          floorPose = frame.getPose(best.planeSpace, refSpace);
          if (state === STATE.SCANNING) {
            state = STATE.FLOOR_FOUND;
            setStatus(`Floor found ✓ — pull trigger to tile it with ${name}`);
          } else if (state === STATE.FLOOR_FOUND) {
            floorPose = frame.getPose(best.planeSpace, refSpace);
          }
        }
      }
    }
    renderer.render(scene, camera);
  });

  session.addEventListener('end', () => {
    renderer.setAnimationLoop(null);
    renderer.domElement.remove();
    renderer.dispose();
    overlay.remove();
    active = null;
  });

  active = { session };
  return session;
}

window.VeluraXR = {
  supported,
  launch,
  end: () => active && active.session.end(),
};
export default window.VeluraXR;
