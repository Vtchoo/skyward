import * as THREE from 'three';
import { PerlinNoise } from './terrain-noise';

export const PLANET_RADIUS = 600_000;
export const SURFACE_GRAVITY = 9.81;
export const PLANET_SEED = 'detritus-desert-01';
export const MAX_TERRAIN_LEVEL = 14;
const CELLS = 10;

export class DesertSurface {
  private readonly noise: PerlinNoise;
  constructor(readonly seed = PLANET_SEED) { this.noise = new PerlinNoise(seed); }
  height(direction: THREE.Vector3): number {
    const length = direction.length(), scale = PLANET_RADIUS / length;
    const x = direction.x * scale + 13829, y = direction.y * scale - 7311, z = direction.z * scale + 21913;
    const n = (frequency: number) => this.noise.sample(x * frequency, y * frequency, z * frequency);
    // Most of the surface remains gently rolling plain. A broad noise mask
    // concentrates the taller layered hills in occasional belts.
    const mask = THREE.MathUtils.smoothstep(n(1 / 18000), -0.05, 0.45);
    let hills = 0, frequency = 1 / 4500, amplitude = 1, weight = 0;
    for (let octave = 0; octave < 5; octave++) {
      hills += n(frequency) * amplitude; weight += amplitude;
      frequency *= 2; amplitude *= 0.46;
    }
    return 55 + n(1 / 11000) * 22 + n(1 / 650) * 3 + mask * mask * (130 + hills / weight * 330);
  }
  gravity(radius: number): number { return SURFACE_GRAVITY * (PLANET_RADIUS / radius) ** 2; }
  sandTone(direction: THREE.Vector3): number {
    const scale=PLANET_RADIUS/direction.length();
    const x=direction.x*scale+713, y=direction.y*scale-919, z=direction.z*scale+337;
    return this.noise.sample(x/180,y/180,z/180)*0.16+this.noise.sample(x/1500,y/1500,z/1500)*0.13;
  }
  normal(direction: THREE.Vector3): THREE.Vector3 {
    const up = direction.clone().normalize();
    const east = new THREE.Vector3(0,0,1).cross(up);
    if (east.lengthSq() < 0.01) east.set(1,0,0).cross(up);
    east.normalize(); const north = up.clone().cross(east).normalize();
    const p = up.clone().multiplyScalar(PLANET_RADIUS);
    const dhE = (this.height(p.clone().addScaledVector(east, 4)) - this.height(p.clone().addScaledVector(east, -4))) / 8;
    const dhN = (this.height(p.clone().addScaledVector(north, 4)) - this.height(p.clone().addScaledVector(north, -4))) / 8;
    return up.addScaledVector(east, -dhE).addScaledVector(north, -dhN).normalize();
  }
}

// Four children per spherical face quadrant. Coordinates are shared exactly
// along face edges; every square cell is rendered as two indexed triangles.
export function faceDirection(face: number, u: number, v: number): THREE.Vector3 {
  const axes = [[1,v,-u],[-1,v,u],[u,1,-v],[u,-1,v],[u,v,1],[-u,v,-1]];
  return new THREE.Vector3(...axes[face] as [number,number,number]).normalize();
}

class Patch {
  readonly center: THREE.Vector3;
  readonly size: number;
  mesh?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  children?: Patch[];
  constructor(readonly face: number, readonly u: number, readonly v: number, readonly half: number, readonly level: number) {
    this.center = faceDirection(face,u,v).multiplyScalar(PLANET_RADIUS);
    this.size = half * PLANET_RADIUS * 2;
  }
}

export class DesertPlanet {
  readonly group = new THREE.Group();
  readonly surface: DesertSurface;
  readonly stats = { patches: 0, triangles: 0, deepestLevel: 0, pending: 0 };
  private readonly roots = Array.from({length:6},(_,i)=>new Patch(i,0,0,1,0));
  private readonly material = new THREE.MeshStandardMaterial({ vertexColors:true, roughness:1, metalness:0 });
  private budget = 0;
  constructor(seed = PLANET_SEED) {
    this.surface = new DesertSurface(seed);
    this.group.name = 'desert-planet';
    // Coarse whole-planet coverage exists before any nearby subdivisions load.
    for (const patch of this.roots) this.build(patch);
  }
  set wireframe(value: boolean) { this.material.wireframe = value; }
  private build(patch: Patch) {
    const positions:number[] = [], normals:number[] = [], colors:number[] = [], indices:number[] = [];
    const color = new THREE.Color(), normal = new THREE.Vector3();
    for(let y=0;y<=CELLS;y++) for(let x=0;x<=CELLS;x++) {
      const direction = faceDirection(patch.face,patch.u-patch.half+x/CELLS*patch.half*2,patch.v-patch.half+y/CELLS*patch.half*2);
      const height = this.surface.height(direction);
      const position = direction.clone().multiplyScalar(PLANET_RADIUS+height).sub(patch.center);
      positions.push(position.x,position.y,position.z);
      normal.copy(patch.level >= 7 ? this.surface.normal(direction) : direction);
      normals.push(normal.x,normal.y,normal.z);
      const tint = THREE.MathUtils.clamp((height-20)/300,0,1);
      color.set(0xc7a271).lerp(new THREE.Color(0x8c765a),tint*0.65);
      color.multiplyScalar(1+this.surface.sandTone(direction));
      colors.push(color.r,color.g,color.b);
    }
    const stride=CELLS+1;
    for(let y=0;y<CELLS;y++) for(let x=0;x<CELLS;x++) {
      const a=y*stride+x,b=a+1,c=a+stride,d=c+1;
      indices.push(a,c,b,b,c,d);
    }
    // Skirts overlap coarser neighbors, hiding T-junction cracks at any LOD.
    const edge = [
      ...Array.from({length:CELLS},(_,i)=>i),
      ...Array.from({length:CELLS},(_,i)=>i*stride+CELLS),
      ...Array.from({length:CELLS},(_,i)=>CELLS*stride+CELLS-i),
      ...Array.from({length:CELLS},(_,i)=>(CELLS-i)*stride),
    ];
    const skirtDepth = Math.max(5, Math.min(1200,patch.size*0.025));
    for(let i=0;i<edge.length;i++) {
      const a=edge[i], b=edge[(i+1)%edge.length], start=positions.length/3;
      for(const index of [a,b]) {
        const point=new THREE.Vector3().fromArray(positions,index*3).add(patch.center);
        point.addScaledVector(point.clone().normalize(),-skirtDepth).sub(patch.center);
        positions.push(point.x,point.y,point.z);
        normals.push(...normals.slice(index*3,index*3+3)); colors.push(...colors.slice(index*3,index*3+3));
      }
      indices.push(a,start,b,b,start,start+1);
    }
    // The face mappings have consistent winding, checked against a radial normal.
    const a=new THREE.Vector3().fromArray(positions,indices[0]*3), b=new THREE.Vector3().fromArray(positions,indices[1]*3), c=new THREE.Vector3().fromArray(positions,indices[2]*3);
    if(b.sub(a).cross(c.sub(a)).dot(a.clone().add(patch.center))<0) for(let i=0;i<indices.length;i+=3) [indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    geometry.setIndex(indices); geometry.computeBoundingSphere();
    patch.mesh = new THREE.Mesh(geometry,this.material);
    patch.mesh.name=`quadrant/${patch.face}/${patch.level}/${patch.u}/${patch.v}`;
    this.group.add(patch.mesh);
  }
  private release(patch: Patch) {
    if(patch.children) for(const child of patch.children) this.release(child);
    patch.mesh?.geometry.dispose(); patch.mesh?.removeFromParent();
    patch.mesh=undefined; patch.children=undefined;
  }
  update(observer: THREE.Vector3, buildBudget = 6) {
    this.budget=buildBudget;
    this.stats.patches=0; this.stats.triangles=0; this.stats.deepestLevel=0; this.stats.pending=0;
    const visit=(patch:Patch, allowed:boolean)=>{
      if(!patch.mesh) {
        if(this.budget>0) { this.build(patch); this.budget--; }
        else { this.stats.pending++; return; }
      }
      patch.mesh!.position.copy(patch.center).sub(observer);
      const distance=observer.distanceTo(patch.center);
      // Hysteresis avoids repeated split/merge near a quadrant boundary.
      const split=patch.level<MAX_TERRAIN_LEVEL && distance<patch.size*(patch.children ? 2.35 : 1.85);
      if(split && !patch.children) patch.children=[[-1,-1],[1,-1],[-1,1],[1,1]].map(([x,y])=>new Patch(patch.face,patch.u+x*patch.half/2,patch.v+y*patch.half/2,patch.half/2,patch.level+1));
      if(!split && patch.children) { for(const child of patch.children) this.release(child); patch.children=undefined; }
      const children=patch.children?.slice().sort((a,b)=>observer.distanceToSquared(a.center)-observer.distanceToSquared(b.center));
      if(children) {
        // Load siblings before switching visibility; a parent covers missing children.
        for(const child of children) if(!child.mesh && this.budget>0) { this.build(child); this.budget--; }
        const ready=children.every(child=>child.mesh);
        patch.mesh!.visible=allowed && !ready;
        for(const child of children) visit(child,allowed && ready);
      } else patch.mesh!.visible=allowed;
      if(patch.mesh!.visible) {
        this.stats.patches++; this.stats.triangles+=patch.mesh!.geometry.index!.count/3;
        this.stats.deepestLevel=Math.max(this.stats.deepestLevel,patch.level);
      }
    };
    for(const patch of this.roots.slice().sort((a,b)=>observer.distanceToSquared(a.center)-observer.distanceToSquared(b.center))) visit(patch,true);
  }
  dispose() { for(const root of this.roots) this.release(root); this.material.dispose(); }
}
