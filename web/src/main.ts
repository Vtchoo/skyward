
import * as THREE from 'three';
import { openShipSelect } from './ship-select';
import { openFlight } from './flight';
import './style.css';
import './flight.css';

document.querySelector('#app')!.innerHTML = `
  <div id="hangar" aria-hidden="true"></div>
  <header>╱╲ &nbsp; DEFIANT DEFENSE FORCE <span>HANGAR · STANDBY</span></header>
  <main><p class="eyebrow">DETRITUS / FLIGHT OPERATIONS</p><h1>SKYWARD</h1><p class="tagline">Claim the stars.</p>
  <nav aria-label="Main menu"><button id="flight"><span>01</span> Free flight <b>↗</b></button><button disabled><span>02</span> Multiplayer (soon)</button></nav>
  <p id="notice" role="status"></p></main>
  <footer><span>● &nbsp; SINGLEPLAYER</span><span>UNOFFICIAL FAN PROJECT</span><span>PRE-ALPHA / 0.1</span></footer>`;
let closeSelection: (() => void) | undefined;
let closeFlight: (() => void) | undefined;
function selectShip() {
  if(closeSelection || closeFlight) return;
  closeSelection = openShipSelect(() => { closeSelection?.(); closeSelection = undefined; }, id=>{
    closeSelection?.(); closeSelection=undefined;
    closeFlight=openFlight(id,()=>{closeFlight?.(); closeFlight=undefined; selectShip();});
  });
}
document.querySelector('#flight')!.addEventListener('click',selectShip);

try {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.querySelector('#hangar')!.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101b25);
  scene.fog = new THREE.Fog(0x101b25, 30, 85);
  const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 120);
  camera.position.set(-12, 6, 20);
  const target = new THREE.Vector3(1, 3, -12);
  scene.add(new THREE.HemisphereLight(0xadcfe5, 0x161c25, 2));
  const metal = new THREE.MeshStandardMaterial({color: 0x34434e, metalness: 0.7, roughness: 0.5});
  const dark = new THREE.MeshStandardMaterial({color: 0x18242e, metalness: 0.5, roughness: 0.65});
  const glow = new THREE.MeshBasicMaterial({color: 0xb5e5ff});
  const amber = new THREE.MeshBasicMaterial({color: 0xda9b59});
  function box(w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = scene) {
    const object = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);
    object.position.set(x,y,z); parent.add(object); return object;
  }
  box(52,.3,90,metal,0,-.2,-20);
  box(1,20,80,dark,-26,10,-20); box(1,20,80,dark,26,10,-20);
  box(52,1,80,dark,0,20,-20); box(52,20,1,dark,0,10,-59);
  for(let i=0;i<7;i++) {
    const z=10-i*10;
    box(1,20,1,metal,-25,10,z); box(1,20,1,metal,25,10,z); box(50,.7,1,metal,0,19,z);
    box(14,.08,.3,glow,9,18.5,z);
    for(const x of [-7,16]) box(.14,.02,6,amber,x,0,z);
    const light = new THREE.PointLight(0xb0dbff,100,30,2); light.position.set(9,14,z); scene.add(light);
  }
  for(let i=0;i<12;i++) box(50,.02,.04,dark,0,-.03,12-i*6);
  box(20,12,.1,metal,4,6,-58); box(.15,12,.2,amber,4,6,-57.8);
  const light=new THREE.PointLight(0xd4eaff,650,35,2); light.position.set(5,10,-5); scene.add(light);
  const warm=new THREE.PointLight(0xff954f,120,25,2); warm.position.set(18,4,-20); scene.add(warm);
  for(let i=0;i<5;i++) {box(2.6,2.2,2.6,metal,19+i%2*3,1.1,-24-i*4); box(2.65,.15,2.65,amber,19+i%2*3,1.9,-24-i*4);}
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  renderer.setAnimationLoop(time=>{if(closeSelection || closeFlight) return; if(!motion.matches) camera.position.x=-12+Math.sin(time*.0001)*.35; camera.lookAt(target); renderer.render(scene,camera);});
  window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight);});
} catch {
  document.querySelector('#notice')!.textContent='The 3D hangar requires WebGL, which is unavailable in this browser.';
}
