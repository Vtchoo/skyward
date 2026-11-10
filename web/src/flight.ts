import * as THREE from 'three';
import { createShip, ships, type ShipId } from './ships';
import { DesertPlanet, PLANET_RADIUS, SURFACE_GRAVITY } from './planet';
import { FlightPhysics, neutralInput } from './flight-physics';

export function openFlight(id: ShipId, onExit: () => void): () => void {
  const screen=document.createElement('section'); screen.className='flight-screen'; screen.setAttribute('aria-label','Free flight');
  screen.innerHTML=`<div class="flight-canvas"></div>
    <div class="flight-top"><div><p class="eyebrow">DDF / FREE FLIGHT</p><strong>${ships[id].name}</strong><span>DESERT SURFACE · 600 KM RADIUS</span></div><div class="flight-actions"><button class="flight-controls">Controls</button><button class="flight-pause">Pause / Esc</button></div></div>
    <div class="flight-heading"><span>HDG</span> <output data-flight="heading">000</output><div>˙ &nbsp; ˙ &nbsp; ˙ &nbsp; ▾ &nbsp; ˙ &nbsp; ˙ &nbsp; ˙</div></div>
    <div class="flight-reticle" aria-hidden="true"><span></span><i></i></div>
    <div class="flight-speed"><small>AIRSPEED</small><output data-flight="speed">0</output><span>KM/H</span><small>THROTTLE <b data-flight="throttle">0%</b></small></div>
    <div class="flight-altitude"><small>RADAR ALT</small><output data-flight="altitude">180</output><span>METERS AGL</span><small>V/S <b data-flight="climb">0</b> M/S</small></div>
    <div class="flight-bottom"><div><strong data-flight="ring">ACCLIVITY / HOVER</strong><span data-flight="status">STATIONARY FLIGHT</span></div><p>W / S throttle &middot; A / D yaw &middot; Mouse pitch / roll<br>Shift / Ctrl rise / descend &middot; Space brake &middot; B boost &middot; H ring &middot; C camera &middot; V terrain</p><span data-flight="terrain"></span></div>
    <div class="flight-warning" role="status"></div>
    <div class="flight-pause-overlay" hidden><div>
      <div class="pause-home"><p class="eyebrow">FLIGHT PAUSED</p><h2>Take a breath.</h2><p>W / S &middot; increase / reduce throttle<br>A / D &middot; yaw left / right<br><span class="mouse-pitch-help"></span><br>Mouse left / right &middot; roll left / right<br>Shift / Ctrl &middot; vertical thrust up / down<br>Space &middot; airbrake &middot; B &middot; boost<br>H &middot; acclivity ring &middot; C &middot; camera &middot; V &middot; terrain</p><button class="flight-resume">Resume flight</button><button class="pause-controls">Controls</button><button class="flight-reset">Reset position</button><button class="flight-exit">Return to hangar</button></div>
      <div class="controls-panel" role="region" aria-label="Controls" hidden><p class="eyebrow">FLIGHT SETTINGS</p><h2>Controls</h2><p>W / S &middot; increase / reduce throttle<br>A / D &middot; yaw left / right<br>Mouse left / right &middot; roll left / right<br>Shift / Ctrl &middot; vertical thrust up / down<br>Space &middot; airbrake &middot; B &middot; boost</p><label class="invert-pitch"><input type="checkbox" name="invert-pitch"> Invert mouse pitch</label><p class="pitch-description"></p><p>Move the mouse over the flight view to steer. Click the terrain to capture the mouse. Esc releases it and pauses.</p><button class="controls-back">Back</button></div>
    </div></div>`;
  document.querySelector('#app')!.append(screen);
  const host=screen.querySelector<HTMLDivElement>('.flight-canvas')!;
  const renderer=new THREE.WebGLRenderer({antialias:true,logarithmicDepthBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5)); renderer.toneMapping=THREE.ACESFilmicToneMapping;
  host.append(renderer.domElement);
  const scene=new THREE.Scene(); scene.background=new THREE.Color(0xaac0c7); scene.fog=new THREE.FogExp2(0xaac0c7,0.000037);
  const camera=new THREE.PerspectiveCamera(62,1,0.15,1_800_000);
  scene.add(new THREE.HemisphereLight(0xdbe9f2,0xb69063,2));
  const sun=new THREE.DirectionalLight(0xffe5ba,3.3); sun.position.set(-0.6,0.8,-0.5); scene.add(sun);
  const skyMaterial=new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,depthTest:false,
    uniforms:{up:{value:new THREE.Vector3(0,1,0)},sunDirection:{value:sun.position.clone().normalize()},horizon:{value:new THREE.Color(0xaac0c7)},zenith:{value:new THREE.Color(0x537e9f)}},
    vertexShader:'varying vec3 direction; void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`varying vec3 direction; uniform vec3 up; uniform vec3 sunDirection; uniform vec3 horizon; uniform vec3 zenith;
      void main(){vec3 d=normalize(direction);float h=max(0.0,dot(d,up));vec3 color=mix(horizon,zenith,smoothstep(0.0,0.8,h));
      float sun=max(0.0,dot(d,sunDirection));color+=vec3(1.0,0.8,0.5)*(pow(sun,160.0)*0.1+smoothstep(0.9997,0.99995,sun)*2.0);
      gl_FragColor=vec4(color,1.0);
      #include <colorspace_fragment>
      }`,
  });
  const sky=new THREE.Mesh(new THREE.SphereGeometry(1,24,16),skyMaterial); sky.scale.setScalar(1_500_000); sky.renderOrder=-100; sky.frustumCulled=false; scene.add(sky);
  const planet=new DesertPlanet(); scene.add(planet.group);
  const physics=new FlightPhysics(planet.surface,id);
  const ship=createShip(id); scene.add(ship);
  const keys=new Set<string>(); let paused=false, cockpit=false, wireframe=false, last=0, accumulator=0, hudTime=0, disposed=false;
  const cameraAbsolute=physics.position.clone().add(new THREE.Vector3(0,9,30));
  const cameraUp=new THREE.Vector3(0,1,0);
  const pauseOverlay=screen.querySelector<HTMLElement>('.flight-pause-overlay')!;
  const pauseHome=screen.querySelector<HTMLElement>('.pause-home')!;
  const controlsPanel=screen.querySelector<HTMLElement>('.controls-panel')!;
  const invertCheckbox=screen.querySelector<HTMLInputElement>('[name="invert-pitch"]')!;
  let invertPitch=false, mouseX=0, mouseY=0;
  try { invertPitch=localStorage.getItem('skyward.invertMousePitch')==='true'; } catch { /* Settings remain usable without storage. */ }
  function updatePitchSetting() {
    invertCheckbox.checked=invertPitch;
    screen.querySelector('.mouse-pitch-help')!.textContent=invertPitch ? 'Mouse up / down - pitch up / down' : 'Mouse up / down - pitch down / up';
    screen.querySelector('.pitch-description')!.textContent=invertPitch ? 'Mouse up pitches up; mouse down pitches down.' : 'Mouse up pitches down; mouse down pitches up.';
    screen.dataset.invertPitch=String(invertPitch);
  }
  updatePitchSetting();
  invertCheckbox.addEventListener('change',()=>{
    invertPitch=invertCheckbox.checked; updatePitchSetting();
    try { localStorage.setItem('skyward.invertMousePitch',String(invertPitch)); } catch { /* Session preference still applies. */ }
  });
  function pause(value:boolean) {
    paused=value; keys.clear(); mouseX=0; mouseY=0; accumulator=0; screen.dataset.paused=String(value); pauseOverlay.hidden=!value;
    pauseHome.hidden=false; controlsPanel.hidden=true;
    if(value && document.pointerLockElement===renderer.domElement) document.exitPointerLock();
    if(value) screen.querySelector<HTMLButtonElement>('.flight-resume')!.focus();
  }
  function resize() { camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); }
  function keydown(event:KeyboardEvent) {
    if(event.repeat) return;
    if(event.code==='Escape'||event.code==='KeyP') { pause(!paused); return; }
    if(paused) return;
    if(['KeyW','KeyS','KeyA','KeyD','Space','ControlLeft','ControlRight','ShiftLeft','ShiftRight'].includes(event.code)) event.preventDefault();
    if(event.code==='KeyH') physics.ringEnabled=!physics.ringEnabled;
    if(event.code==='KeyC') cockpit=!cockpit;
    if(event.code==='KeyV') { wireframe=!wireframe; planet.wireframe=wireframe; }
    keys.add(event.code);
  }
  const keyup=(event:KeyboardEvent)=>{ keys.delete(event.code); };
  const mousemove=(event:MouseEvent)=>{
    if(paused || (document.pointerLockElement!==renderer.domElement && event.target!==renderer.domElement)) return;
    mouseX+=event.movementX; mouseY+=event.movementY;
  };
  const lockChange=()=>{mouseX=0;mouseY=0;if(!document.pointerLockElement && !paused) pause(true);};
  renderer.domElement.addEventListener('click',()=>{
    if(!paused) { try { renderer.domElement.requestPointerLock()?.catch(()=>{}); } catch { /* Uncaptured mouse steering remains available. */ } }
  });
  const blur=()=>pause(true);
  const visibility=()=>{ if(document.hidden) pause(true); };
  window.addEventListener('keydown',keydown); window.addEventListener('keyup',keyup); window.addEventListener('blur',blur);
  window.addEventListener('resize',resize); document.addEventListener('visibilitychange',visibility); resize();
  document.addEventListener('mousemove',mousemove); document.addEventListener('pointerlockchange',lockChange);
  const openControls=()=>{pause(true);pauseHome.hidden=true;controlsPanel.hidden=false;invertCheckbox.focus();};
  screen.querySelector('.flight-controls')!.addEventListener('click',openControls);
  screen.querySelector('.pause-controls')!.addEventListener('click',openControls);
  screen.querySelector('.controls-back')!.addEventListener('click',()=>{pauseHome.hidden=false;controlsPanel.hidden=true;screen.querySelector<HTMLButtonElement>('.flight-resume')!.focus();});
  screen.querySelector('.flight-pause')!.addEventListener('click',()=>pause(true));
  screen.querySelector('.flight-resume')!.addEventListener('click',()=>pause(false));
  screen.querySelector('.flight-reset')!.addEventListener('click',()=>{physics.reset();cameraAbsolute.copy(physics.position).add(new THREE.Vector3(0,9,30));pause(false);});
  screen.querySelector('.flight-exit')!.addEventListener('click',onExit);
  const value=(code:string)=>keys.has(code)?1:0;
  const output=(name:string,text:string)=>{screen.querySelector(`[data-flight="${name}"]`)!.textContent=text;};
  renderer.setAnimationLoop((time:number)=>{
    if(disposed) return;
    const dt=last ? Math.min((time-last)/1000,0.1) : 0; last=time;
    if(!paused) {
      const input=neutralInput();
      const mouseScale=1/(Math.max(accumulator+dt,1/120)*700);
      input.pitch=THREE.MathUtils.clamp(mouseY*mouseScale*(invertPitch ? -1 : 1),-1,1);
      input.roll=THREE.MathUtils.clamp(-mouseX*mouseScale,-1,1);
      if(accumulator+dt>=1/120) {mouseX=0;mouseY=0;}
      input.yaw=value('KeyA')-value('KeyD'); input.throttle=value('KeyW')-value('KeyS');
      input.vertical=Math.min(1,value('ShiftLeft')+value('ShiftRight'))-Math.min(1,value('ControlLeft')+value('ControlRight'));
      input.boost=keys.has('KeyB'); input.brake=keys.has('Space');
      Object.assign(screen.dataset,{inputPitch:String(input.pitch),inputRoll:String(input.roll),inputYaw:String(input.yaw),inputVertical:String(input.vertical)});
      accumulator+=dt;
      while(accumulator>=1/120) { physics.step(1/120,input); accumulator-=1/120; }
    }
    const up=physics.position.clone().normalize(), forward=new THREE.Vector3(0,0,-1).applyQuaternion(physics.orientation);
    skyMaterial.uniforms.up.value.copy(up);
    const shipUp=new THREE.Vector3(0,1,0).applyQuaternion(physics.orientation);
    ship.position.set(0,0,0); ship.quaternion.copy(physics.orientation); ship.visible=!cockpit;
    ship.traverse(object=>{
      if(object.name.startsWith('acclivity/glow')||object.name==='acclivity/emitter'||object.name==='acclivity/light') object.visible=physics.ringEnabled;
    });
    const target=physics.position.clone().addScaledVector(forward,cockpit ? 8 : -32).addScaledVector(up,cockpit ? 1.8 : 9);
    if(cockpit) cameraAbsolute.copy(target); else cameraAbsolute.lerp(target,1-Math.exp(-dt*5));
    // Keep the camera above the same analytic terrain used by the simulation.
    const minimumRadius=PLANET_RADIUS+planet.surface.height(cameraAbsolute)+2;
    if(cameraAbsolute.length()<minimumRadius) cameraAbsolute.setLength(minimumRadius);
    camera.position.copy(cameraAbsolute).sub(physics.position);
    sky.position.copy(camera.position);
    cameraUp.lerp(cockpit ? shipUp : up,1-Math.exp(-dt*4)).normalize(); camera.up.copy(cameraUp);
    camera.lookAt(forward.clone().multiplyScalar(cockpit ? 200 : 65).addScaledVector(up,2));
    camera.fov=62+Math.min(10,physics.speed/50); camera.updateProjectionMatrix();
    planet.update(physics.position);
    hudTime+=dt;
    if(hudTime>0.1 || !screen.dataset.ready) {
      hudTime=0; const speed=physics.speed, altitude=physics.altitude;
      output('speed',String(Math.round(speed*3.6))); output('altitude',String(Math.round(altitude)));
      output('throttle',`${Math.round(physics.throttle*100)}%`); output('climb',physics.verticalSpeed.toFixed(1));
      const north=new THREE.Vector3(0,0,-1).projectOnPlane(up).normalize();
      const east=north.clone().cross(up).normalize();
      const heading=(THREE.MathUtils.radToDeg(Math.atan2(forward.dot(east),forward.dot(north)))+360)%360;
      output('heading',String(Math.round(heading)%360).padStart(3,'0'));
      output('ring',physics.ringEnabled ? `ACCLIVITY / ${speed<3?'HOVER':'ACTIVE'}` : 'ACCLIVITY / OFF');
      output('status',physics.grounded?'SURFACE CONTACT':speed<3?'STATIONARY FLIGHT':keys.has('KeyB')?'BOOST':'FREE FLIGHT');
      output('terrain',`${planet.stats.patches} QUADRANTS · LOD ${planet.stats.deepestLevel} · ${Math.round(planet.stats.triangles/1000)}K TRIANGLES`);
      screen.querySelector('.flight-warning')!.textContent=physics.grounded?'SURFACE CONTACT — SHIFT TO ASCEND':altitude<40 && physics.verticalSpeed < -3?'PULL UP — TERRAIN':'';
      // Numeric telemetry doubles as a browser integration-test interface.
      Object.assign(screen.dataset,{ready:'true',speed:String(speed),altitude:String(altitude),ring:String(physics.ringEnabled),lod:String(planet.stats.deepestLevel),terrainPending:String(planet.stats.pending),radius:String(PLANET_RADIUS),gravity:String(SURFACE_GRAVITY)});
    }
    renderer.render(scene,camera);
  });
  return ()=>{
    disposed=true; renderer.setAnimationLoop(null);
    window.removeEventListener('keydown',keydown); window.removeEventListener('keyup',keyup); window.removeEventListener('blur',blur);
    window.removeEventListener('resize',resize); document.removeEventListener('visibilitychange',visibility);
    document.removeEventListener('mousemove',mousemove); document.removeEventListener('pointerlockchange',lockChange);
    if(document.pointerLockElement===renderer.domElement) document.exitPointerLock();
    planet.dispose();
    sky.geometry.dispose(); skyMaterial.dispose();
    const materials=new Set<THREE.Material>();
    ship.traverse(object=>{if(object instanceof THREE.Mesh || object instanceof THREE.Line) {object.geometry.dispose(); for(const material of Array.isArray(object.material)?object.material:[object.material]) materials.add(material);}});
    materials.forEach(material=>material.dispose()); renderer.dispose(); renderer.forceContextLoss(); screen.remove();
  };
}
