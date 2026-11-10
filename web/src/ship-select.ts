
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createShip, shipIds, ships, type ShipId } from './ships';

// Relative gameplay tuning, not canonical specifications from the books.
const profiles: Record<ShipId, readonly number[]> = {
  poco: [72, 74, 62, 65], largo: [52, 48, 92, 84],
  scout: [94, 92, 38, 50], 'm-bot': [90, 88, 80, 94],
};
const statLabels = ['Speed', 'Mobility', 'Durability', 'Energy'];

export function openShipSelect(onBack: () => void): () => void {
  const screen = document.createElement('section');
  screen.className = 'ship-screen';
  screen.setAttribute('aria-label', 'Select your ship');
  screen.dataset.busy = 'false';
  screen.innerHTML = `
    <div class="ship-canvas" aria-label="Ship in hangar"></div><div class="hangar-shade" aria-hidden="true"></div>
    <div class="selection-heading"><button class="back-button">← Main menu</button><div><p class="eyebrow">FREE FLIGHT / AIRCRAFT SELECTION</p><h2>Select your ship</h2></div><span class="hangar-id">DDF / HANGAR 01</span></div>
    <aside class="ship-stats" aria-label="Ship stats"><p class="eyebrow">FLIGHT PROFILE</p><div class="stats-rows">${statLabels.map((label, i) => `<div class="stat-row"><div><span>${label}</span><output data-stat-value="${i}"></output></div><div class="stat-track" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="100"><span data-stat-bar="${i}"></span></div></div>`).join('')}</div><p class="stats-note">PROVISIONAL GAME STATS</p></aside>
    <button class="ship-arrow previous-ship" aria-label="Previous ship">‹</button><button class="ship-arrow next-ship" aria-label="Next ship">›</button>
    <div class="ship-identity"><p class="airframe-index"></p><h3 id="ship-name" aria-live="polite"></h3><p id="ship-description"></p><div class="ship-dots" role="group" aria-label="Ships">${shipIds.map(id => `<button data-ship="${id}" aria-label="Select ${ships[id].name}" aria-pressed="false"><span></span></button>`).join('')}</div></div>
    <div class="selection-bottom"><div class="preview-toolbar" aria-label="Preview views"><button data-view="perspective" aria-pressed="true">Perspective</button><button data-view="top" aria-pressed="false">Top</button><button data-view="side" aria-pressed="false">Side</button><button data-view="front" aria-pressed="false">Front</button></div><p class="orbit-hint">Drag to orbit · Scroll to zoom</p><button class="reference-button">View design reference ↗</button></div>
    <dialog class="reference-dialog"><div><h3>Design reference</h3><button class="close-reference" aria-label="Close design reference">✕</button></div><img alt="Original ship design sheet supplied for modeling"></dialog>`;
  const app = document.querySelector('#app')!;
  app.append(screen); app.classList.add('selecting');
  const canvasHost = screen.querySelector<HTMLDivElement>('.ship-canvas')!;
  const reference = screen.querySelector<HTMLDialogElement>('dialog')!;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101921);
  scene.fog = new THREE.Fog(0x101921, 40, 105);
  const perspective = new THREE.PerspectiveCamera(38, 1, 0.1, 160);
  const orthographic = new THREE.OrthographicCamera(-12, 12, 12, -12, 0.1, 160);
  let camera: THREE.Camera = perspective;
  let renderer: THREE.WebGLRenderer | undefined;
  let controls: OrbitControls | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let model: THREE.Group | undefined;
  let outgoing: THREE.Group | undefined;
  let selected: ShipId = 'poco';
  let activeView = 'perspective';
  let animation: { start: number; direction: number; right: THREE.Vector3 } | undefined;
  const arrows = [...screen.querySelectorAll<HTMLButtonElement>('.ship-arrow')];

  function dispose(object: THREE.Object3D) {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    object.traverse(child => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        geometries.add(child.geometry);
        for (const material of Array.isArray(child.material) ? child.material : [child.material]) materials.add(material);
      }
    });
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
    object.removeFromParent();
  }
  function setBusy(busy: boolean) {
    screen.dataset.busy = String(busy);
    arrows.forEach(button => { button.disabled = busy; });
    screen.querySelectorAll<HTMLButtonElement>('[data-ship]').forEach(button => { button.disabled = busy; });
  }
  function finishTransition() {
    if (outgoing) { dispose(outgoing); outgoing = undefined; }
    model?.position.set(0, 0, 0); animation = undefined; setBusy(false);
  }
  function resize() {
    const { width, height } = canvasHost.getBoundingClientRect();
    if (!width || !height || !renderer) return;
    renderer.setSize(width, height);
    perspective.aspect = width / height;
    // Keep the complete airframe visible between the arrows on narrow screens.
    perspective.fov = width < 700 ? 52 : 38;
    const fitDistance = Math.max(26.8, 22 / (2 * Math.tan(THREE.MathUtils.degToRad(perspective.fov / 2)) * perspective.aspect));
    perspective.position.setLength(fitDistance);
    perspective.updateProjectionMatrix();
    const halfHeight = Math.max(11, 10 / (width / height));
    orthographic.left = -halfHeight * width / height; orthographic.right = halfHeight * width / height;
    orthographic.top = halfHeight; orthographic.bottom = -halfHeight; orthographic.updateProjectionMatrix();
  }
  function view(name: string) {
    if (animation) finishTransition();
    activeView = name;
    if (name === 'perspective') {
      camera = perspective; perspective.up.set(0, 1, 0); perspective.position.set(16, 8, -20); perspective.lookAt(0, 0, 0);
      if (controls) { controls.enabled = true; controls.target.set(0, 0, 0); controls.update(); }
      resize();
    } else {
      camera = orthographic; orthographic.up.set(0, name === 'top' ? 0 : 1, name === 'top' ? -1 : 0);
      orthographic.position.set(name === 'side' ? 30 : 0, name === 'top' ? 30 : 0, name === 'front' ? -30 : 0);
      orthographic.lookAt(0, 0, 0); if (controls) controls.enabled = false;
    }
    camera.updateMatrixWorld();
    screen.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === name)));
    screen.querySelector('.orbit-hint')!.textContent = name === 'perspective' ? 'Drag to orbit · Scroll to zoom' : `Orthographic ${name} view`;
  }
  function select(id: ShipId, direction = 1, animate = true) {
    if (animation || (id === selected && model)) return;
    selected = id;
    screen.querySelectorAll<HTMLButtonElement>('[data-ship]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.ship === id)));
    screen.querySelector('#ship-name')!.textContent = ships[id].name;
    screen.querySelector('#ship-description')!.textContent = ships[id].description;
    screen.querySelector('.airframe-index')!.textContent = `AIRFRAME 0${shipIds.indexOf(id) + 1} / 0${shipIds.length}`;
    profiles[id].forEach((value, i) => {
      screen.querySelector(`[data-stat-value="${i}"]`)!.textContent = String(value);
      const bar = screen.querySelector<HTMLElement>(`[data-stat-bar="${i}"]`)!;
      bar.style.width = `${value}%`; bar.parentElement!.setAttribute('aria-valuenow', String(value));
    });
    reference.querySelector('img')!.src = ships[id].reference;
    outgoing = model;
    model = new THREE.Group();
    const airframe = createShip(id);
    const center = new THREE.Box3().setFromObject(airframe).getCenter(new THREE.Vector3());
    airframe.position.sub(center); model.add(airframe); scene.add(model);
    if (animate && outgoing && renderer && !motion.matches) {
      camera.updateMatrixWorld();
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      model.position.copy(right).multiplyScalar(direction * 42);
      animation = { start: performance.now(), direction, right }; setBusy(true);
    } else finishTransition();
  }
  function cycle(direction: number) {
    if (animation) return;
    const index = (shipIds.indexOf(selected) + direction + shipIds.length) % shipIds.length;
    select(shipIds[index], direction);
  }
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    canvasHost.append(renderer.domElement);
    controls = new OrbitControls(perspective, renderer.domElement);
    controls.enableDamping = true; controls.minDistance = 19; controls.maxDistance = 75; controls.enablePan = false;
    controls.maxPolarAngle = Math.PI / 2 - 0.025;
    const steel = new THREE.MeshStandardMaterial({ color: 0x25333d, metalness: 0.65, roughness: 0.55 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x131e28, metalness: 0.4, roughness: 0.8 });
    const lamp = new THREE.MeshBasicMaterial({ color: 0xcbeeff });
    const amber = new THREE.MeshBasicMaterial({ color: 0xb77d43 });
    function box(w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z); mesh.receiveShadow = true; scene.add(mesh); return mesh;
    }
    const floor = new THREE.MeshStandardMaterial({ color: 0x303b43, metalness: 0.4, roughness: 0.57 });
    box(120, 0.2, 120, floor, 0, -1.65, 0);
    box(1, 24, 95, dark, -32, 10, -20); box(1, 24, 95, dark, 32, 10, -20);
    box(65, 24, 1, dark, 0, 10, 35); box(65, 1, 95, dark, 0, 22, -12);
    for (let i = 0; i < 8; i++) {
      const z = -45 + i * 11;
      box(1.2, 24, 1.2, steel, -31, 10, z); box(1.2, 24, 1.2, steel, 31, 10, z);
      box(62, 0.8, 1.2, steel, 0, 21, z);
      for (const x of [-15, 15]) box(13, 0.08, 0.35, lamp, x, 20.4, z);
      box(64, 0.015, 0.045, dark, 0, -1.54, z);
    }
    // Segmented maintenance-bay door behind the airframe.
    for (let i = 0; i < 9; i++) box(27, 1.15, 0.2, steel, 0, i * 1.25 - 0.9, 34.3);
    for (const x of [-14, 14]) { box(0.14, 13, 0.2, lamp, x, 4.7, 34); box(0.12, 0.025, 40, amber, x, -1.53, 4); }
    box(28, 0.025, 0.12, amber, 0, -1.53, 18);
    const grid = new THREE.GridHelper(120, 24, 0x53616a, 0x35424c); grid.position.y = -1.53; scene.add(grid);
    for (const x of [-24, 24]) for (let i = 0; i < 3; i++) {
      box(3.5, 2.5, 3.5, steel, x, -0.3, 21 + i * 4);
      box(3.55, 0.13, 3.55, amber, x, 0.6, 21 + i * 4);
    }
    scene.add(new THREE.HemisphereLight(0xc4dcf1, 0x657078, 2.2));
    const key = new THREE.SpotLight(0xe8f3ff, 3600, 65, 0.68, 0.7, 2);
    key.position.set(0, 18, -6); key.target.position.set(0, -1, 0); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0003;
    scene.add(key, key.target);
    const rim = new THREE.DirectionalLight(0x97c6ee, 2); rim.position.set(-8, 5, 12); scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffdab0, 1.5); fill.position.set(12, 6, -5); scene.add(fill);
    resizeObserver = new ResizeObserver(resize); resizeObserver.observe(canvasHost); resize();
    renderer.setAnimationLoop(() => {
      if (motion.matches && animation) finishTransition();
      if (animation && model) {
        const progress = Math.min(1, (performance.now() - animation.start) / 800);
        const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
        model.position.copy(animation.right).multiplyScalar(animation.direction * 42 * (1 - eased));
        outgoing?.position.copy(animation.right).multiplyScalar(-animation.direction * 42 * eased);
        if (progress === 1) finishTransition();
      }
      if (controls?.enabled && !animation) controls.update();
      renderer!.render(scene, camera);
    });
  } catch {
    renderer?.dispose(); renderer = undefined;
    canvasHost.innerHTML = '<p class="preview-error">The hangar preview requires WebGL. Ship selection and design references remain available.</p>';
  }
  select(selected, 1, false); view(activeView);
  function enableShadows() { model?.traverse(child => { if (child instanceof THREE.Mesh) child.castShadow = !child.userData.noShadow; }); }
  enableShadows();
  screen.querySelector('.previous-ship')!.addEventListener('click', () => { cycle(-1); enableShadows(); });
  screen.querySelector('.next-ship')!.addEventListener('click', () => { cycle(1); enableShadows(); });
  screen.querySelectorAll<HTMLButtonElement>('[data-ship]').forEach(button => button.addEventListener('click', () => {
    const id = button.dataset.ship as ShipId; select(id, shipIds.indexOf(id) >= shipIds.indexOf(selected) ? 1 : -1); enableShadows();
  }));
  screen.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => button.addEventListener('click', () => view(button.dataset.view!)));
  screen.querySelector('.reference-button')!.addEventListener('click', () => reference.showModal());
  screen.querySelector('.close-reference')!.addEventListener('click', () => reference.close());
  reference.addEventListener('click', event => { if (event.target === reference) reference.close(); });
  screen.querySelector('.back-button')!.addEventListener('click', onBack);
  function keyboard(event: KeyboardEvent) {
    if (reference.open || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); cycle(event.key === 'ArrowLeft' ? -1 : 1); enableShadows(); }
    if (event.key === 'Escape') onBack();
  }
  window.addEventListener('keydown', keyboard);
  screen.querySelector<HTMLButtonElement>('.back-button')!.focus();
  return () => {
    window.removeEventListener('keydown', keyboard); resizeObserver?.disconnect(); renderer?.setAnimationLoop(null); controls?.dispose();
    if (outgoing) dispose(outgoing); dispose(scene); renderer?.dispose();
    screen.remove(); app.classList.remove('selecting'); document.querySelector<HTMLButtonElement>('#flight')!.focus();
  };
}
