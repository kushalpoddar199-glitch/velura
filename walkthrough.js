import * as THREE from 'three';

const TILE = 0.60;   // real tile size in metres; keep in sync with ar.html
const EYE  = 1.6;    // eye height
const H    = 3.0;    // ceiling height
const W = 10, D = 7; // apartment footprint in metres

export function startWalkthrough(firstImage) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.cssText = 'position:fixed;inset:0;touch-action:none';
  document.body.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1714);
  scene.add(new THREE.HemisphereLight(0xfff6e8, 0x8a7f70, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 0.6);
  sun.position.set(4, 8, 2);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 50);
  camera.rotation.order = 'YXZ';
  camera.position.set(1.5, EYE, 1.2); // start in the foyer

  // Marble floor: unlit, so the photo's true colour shows
  const floorMat = new THREE.MeshBasicMaterial();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), floorMat);
  floor.position.set(W / 2, 0, D / 2);
  scene.add(floor);

  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D).rotateX(Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0xf4f1ea })
  );
  ceil.position.set(W / 2, H, D / 2);
  scene.add(ceil);

  const wallMat = new THREE.MeshLambertMaterial({ color: 0xece6da });
  const walls = [];
  function wall(x1, z1, x2, z2) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, H, 0.12), wallMat);
    m.position.set((x1 + x2) / 2, H / 2, (z1 + z2) / 2);
    m.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
    scene.add(m);
    walls.push(m);
  }
  wall(0, 0, W, 0); wall(0, D, W, D); wall(0, 0, 0, D); wall(W, 0, W, D); // outer
  wall(3, 0, 3, 1);   wall(3, 2.2, 3, 3);   // foyer to living (door gap)
  wall(0, 3, 1, 3);   wall(2.2, 3, 3, 3);   // foyer to dining (door gap)

  const box = (w, h, d, x, z, color) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
    m.position.set(x, h / 2, z);
    scene.add(m);
  };
  box(2.2, 0.8, 0.9, 7.0, 6.3, 0x6b5d4f);  // sofa
  box(1.2, 0.4, 0.6, 7.0, 4.8, 0x2b2622);  // coffee table
  box(1.8, 0.75, 0.9, 1.5, 5.0, 0x3a2f27); // dining table

  // Controls: drag to look, tap the floor to walk there
  let yaw = -Math.PI / 2, pitch = 0, down = null, target = null;
  const el = renderer.domElement;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  el.addEventListener('pointerdown', e => {
    down = { x: e.clientX, y: e.clientY, moved: 0 };
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', e => {
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    down.moved += Math.abs(dx) + Math.abs(dy);
    yaw += dx * 0.005;
    pitch = Math.max(-1.2, Math.min(1.2, pitch + dy * 0.005));
    down.x = e.clientX; down.y = e.clientY;
  });
  el.addEventListener('pointerup', e => {
    if (down && down.moved < 10) walkTo(e.clientX, e.clientY);
    down = null;
  });

  function walkTo(sx, sy) {
    ndc.set((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(floor)[0];
    if (!hit) return;
    const from = new THREE.Vector3(camera.position.x, 1.0, camera.position.z);
    const to   = new THREE.Vector3(hit.point.x, 1.0, hit.point.z);
    const dir  = to.clone().sub(from);
    let dist   = dir.length();
    dir.normalize();
    ray.set(from, dir);
    ray.far = dist;
    const block = ray.intersectObjects(walls)[0];
    ray.far = Infinity;
    if (block) dist = Math.max(0, block.distance - 0.4); // stop before walls
    if (dist < 0.1) return;
    target = from.add(dir.multiplyScalar(dist));
  }

  const loader = new THREE.TextureLoader();
  function setStone(url) {
    loader.load(url, tex => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(W / TILE, D / TILE);
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      if (floorMat.map) floorMat.map.dispose();
      floorMat.map = tex;
      floorMat.needsUpdate = true;
    });
  }
  setStone(firstImage);

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    if (target) {
      const p = camera.position;
      const dx = target.x - p.x, dz = target.z - p.z;
      const d = Math.hypot(dx, dz);
      const step = 1.8 * dt; // walking speed, m/s
      if (d <= step) { p.x = target.x; p.z = target.z; target = null; }
      else { p.x += dx / d * step; p.z += dz / d * step; }
    }
    camera.rotation.set(pitch, yaw, 0);
    renderer.render(scene, camera);
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  return { setStone };
}
