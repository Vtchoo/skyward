import * as THREE from 'three';

/** Plan coordinates are image pixels: longitudinal +X points toward the nose,
 * span is distance from the centerline. Heights use the side/front elevations.
 * A model unit is 1 / 0.065 source pixels; models face -Z with +Y up.
 */
export type PlanPoint = readonly [longitudinal: number, span: number];
export type Section = readonly [longitudinal: number, halfWidth: number, top: number, bottom: number];
type Surface = number | ((longitudinal: number, span: number) => number);
export const PLAN_SCALE = 0.065;
// M-Bot's cabin has a broad roof and planar side windows, rather than an arch.
const cabinProfile = [[1,0],[1,0.48],[0.64,1],[-0.64,1],[-1,0.48],[-1,0]];

export class ShipGeometry {
  readonly root = new THREE.Group();
  readonly hull = new THREE.MeshStandardMaterial({ color: 0xb0b9bc, metalness: 0.52, roughness: 0.48 });
  readonly panel = new THREE.MeshStandardMaterial({ color: 0x8b999f, metalness: 0.48, roughness: 0.55 });
  readonly dark = new THREE.MeshStandardMaterial({ color: 0x27353c, metalness: 0.45, roughness: 0.62, side: THREE.DoubleSide });
  readonly glass = new THREE.MeshStandardMaterial({ color: 0x3a5965, metalness: 0.35, roughness: 0.24 });
  readonly frame = new THREE.MeshStandardMaterial({ color: 0xc1c8c8, metalness: 0.6, roughness: 0.38 });
  readonly seamMaterial = new THREE.LineBasicMaterial({ color: 0x23333c, transparent: true, opacity: 0.62 });

  constructor(private readonly origin: number) { this.root.userData.planOrigin = origin; }

  point(longitudinal: number, span: number, height: number): THREE.Vector3 {
    return new THREE.Vector3(span * PLAN_SCALE, height * PLAN_SCALE, (this.origin - longitudinal) * PLAN_SCALE);
  }

  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true;
    this.root.add(mesh); return mesh;
  }

  /** Beveled aerodynamic panel, rather than a stack of box-like slabs. */
  plate(name: string, outline: readonly PlanPoint[], height: Surface, thickness = 1.2, material: THREE.Material = this.panel, bevel = 0.45, taper?: (longitudinal: number, span: number) => number) {
    const shape = new THREE.Shape(outline.map(([longitudinal, span]) => new THREE.Vector2(span * PLAN_SCALE, (longitudinal - this.origin) * PLAN_SCALE)));
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: thickness * PLAN_SCALE, steps: 1, bevelEnabled: bevel > 0,
      bevelSize: bevel * PLAN_SCALE, bevelThickness: bevel * PLAN_SCALE * 0.5, bevelSegments: 2,
    });
    geometry.rotateX(-Math.PI / 2);
    const vertices = geometry.getAttribute('position');
    for (let i = 0; i < vertices.count; i++) {
      const longitudinal = this.origin - vertices.getZ(i) / PLAN_SCALE;
      const span = vertices.getX(i) / PLAN_SCALE;
      const elevation = typeof height === 'number' ? height : height(longitudinal, span);
      vertices.setY(i, (vertices.getY(i) - thickness / 2 * PLAN_SCALE) * (taper?.(longitudinal,span) ?? 1) + elevation * PLAN_SCALE);
    }
    geometry.computeVertexNormals();
    return this.mesh(geometry, material, name);
  }

  pairedPlate(name: string, outline: readonly PlanPoint[], height: Surface, thickness = 1.2, material?: THREE.Material, bevel = 0.45, taper?: (longitudinal: number, span: number) => number) {
    for (const side of [-1, 1]) this.plate(`${name}/${side}`, outline.map(([x, span]) => [x, span * side]), height, thickness, material, bevel, taper);
  }

  /** Rounded fuselage/pod with independently traced top and bottom profiles. */
  loft(name: string, sections: readonly Section[], material: THREE.Material = this.hull, offset = 0, canopy = false, angular = false) {
    const segments = canopy ? 20 : 32;
    const profile = angular ? canopy
      ? cabinProfile
      : [[1,0],[0.85,0.7],[0.45,1],[-0.45,1],[-0.85,0.7],[-1,0],[-0.82,-0.7],[-0.4,-1],[0.4,-1],[0.82,-0.7]]
      : undefined;
    const count = profile?.length ?? (canopy ? segments + 1 : segments);
    const positions: number[] = [], indices: number[] = [];
    for (const [longitudinal, width, top, bottom] of sections) {
      for (let j = 0; j < count; j++) {
        const angle = canopy ? Math.PI * j / segments : Math.PI * 2 * j / segments;
        const sine = profile ? profile[j][1] : Math.sin(angle);
        const height = canopy ? bottom + (top - bottom) * sine : (top + bottom) / 2 + (top - bottom) / 2 * sine;
        const p = this.point(longitudinal, offset + (profile ? profile[j][0] : Math.cos(angle)) * width, height);
        positions.push(p.x, p.y, p.z);
      }
    }
    for (let station = 0; station < sections.length - 1; station++) {
      for (let j = 0; j < count; j++) {
        const a = station * count + j, b = station * count + (j + 1) % count;
        const c = a + count, d = b + count;
        indices.push(a, c, b, b, c, d);
      }
    }
    for (let j = 1; j < count - 1; j++) {
      indices.push(0, j, j + 1);
      const end = (sections.length - 1) * count;
      indices.push(end, end + j + 1, end + j);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    if (angular && canopy) {
      const panes = geometry.toNonIndexed();
      panes.computeVertexNormals(); geometry.dispose();
      return this.mesh(panes, material, name);
    }
    return this.mesh(geometry, material, name);
  }

  line(name: string, points: readonly (readonly [number, number, number])[], tube = 0, material: THREE.Material = this.frame, straight = false) {
    const vectors = points.map(([x, span, y]) => this.point(x, span, y));
    if (tube) {
      const path = straight ? new THREE.CurvePath<THREE.Vector3>() : new THREE.CatmullRomCurve3(vectors, false, 'centripetal');
      if (path instanceof THREE.CurvePath) {
        for (let i=1;i<vectors.length;i++) path.add(new THREE.LineCurve3(vectors[i-1],vectors[i]));
      }
      return this.mesh(new THREE.TubeGeometry(path, Math.max(8, points.length * 5), tube * PLAN_SCALE, 5, false), material, name);
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(vectors), this.seamMaterial);
    line.name = name; this.root.add(line); return line;
  }

  panelLine(name: string, points: readonly PlanPoint[], height: Surface, mirrored = true) {
    // Project seams onto the finished curved surface, so they cannot hover above
    // a fairing or disappear below a wing's changing dihedral.
    this.root.updateMatrixWorld(true);
    const surfaces = this.root.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh);
    const ray = new THREE.Raycaster(); ray.ray.direction.set(0,-1,0);
    for (const side of mirrored ? [-1, 1] : [1]) {
      let segment: THREE.Vector3[] = [];
      let part = 0;
      const flush = () => {
        if(segment.length > 1) {
          const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(segment),this.seamMaterial);
          line.name=`${name}/${side}/${part++}`; this.root.add(line);
        }
        segment=[];
      };
      for(let i=0;i<points.length-1;i++) {
        const a=points[i], b=points[i+1];
        const steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/4));
        for(let j=0;j<=steps;j++) {
          const t=j/steps, x=THREE.MathUtils.lerp(a[0],b[0],t), span=THREE.MathUtils.lerp(a[1],b[1],t)*side;
          ray.ray.origin.copy(this.point(x,span,100));
          const hit=ray.intersectObjects(surfaces,false)[0];
          const expected=typeof height==='number'?height:height(x,span);
          if(hit && Math.abs(hit.point.y-expected*PLAN_SCALE)<12*PLAN_SCALE) {
            const point=hit.point.clone(); point.y+=0.012; segment.push(point);
          } else flush();
        }
      }
      flush();
    }
  }

  cockpit(sections: readonly Section[], frameStations: readonly number[], angular = false) {
    this.loft('cockpit/glazing', sections, this.glass, 0, true, angular);
    for (const side of [-1, 1]) this.line(`cockpit/sill/${side}`, sections.map(([x, width, , bottom]) => [x, width * side, bottom]), 0.65);
    if (angular) for (const side of [-1,1]) {
      for (const [u,v] of [[0.64,1],[1,0.48]]) {
        this.line(`cockpit/pane-edge/${side}/${u}`, sections.map(([x,width,top,bottom]) =>
          [x,side*width*u,bottom+(top-bottom)*v+0.1]), 0.38, this.frame, true);
      }
    }
    for (const x of frameStations) {
      const index = sections.findIndex(section => section[0] >= x);
      if (index < 0) continue;
      const a = sections[Math.max(0, index - 1)], b = sections[index];
      const t = b[0] === a[0] ? 0 : (x - a[0]) / (b[0] - a[0]);
      const width = THREE.MathUtils.lerp(a[1], b[1], t);
      const top = THREE.MathUtils.lerp(a[2], b[2], t), bottom = THREE.MathUtils.lerp(a[3], b[3], t);
      const arch = angular ? cabinProfile : Array.from({ length:17 }, (_, i) => [Math.cos(Math.PI*i/16),Math.sin(Math.PI*i/16)]);
      this.line(`cockpit/frame/${x}`, arch.map(([u,v]) => {
        return [x, u * width, bottom + (top - bottom) * v + 0.15] as const;
      }), 0.55, this.frame, angular);
    }
  }

  hatch(name: string, x: number, span: number, height: number, radius: number) {
    const plate = this.mesh(new THREE.CylinderGeometry(radius * PLAN_SCALE, radius * PLAN_SCALE, 0.45 * PLAN_SCALE, 24), this.panel, name);
    plate.position.copy(this.point(x, span, height));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(radius * PLAN_SCALE, 0.3 * PLAN_SCALE, 5, 24), this.dark);
    rim.rotation.x = Math.PI / 2; rim.position.copy(plate.position); rim.position.y += 0.25 * PLAN_SCALE;
    this.root.add(rim);
  }

  intake(name: string, x: number, span: number, height: number, width: number, openingHeight: number) {
    const sill = height-openingHeight/2-0.25;
    this.loft(`${name}/mount`, [[x-6,width*0.35,sill-0.5,sill-3],[x-4,width*0.55,sill,sill-3],[x,width*0.55,sill,sill-3],[x+2,width*0.35,sill-2,sill-3]],this.hull,span,false,true);
    const corners = [[-0.5,-0.25],[-0.4,-0.5],[0.4,-0.5],[0.5,-0.25],[0.5,0.25],[0.4,0.5],[-0.4,0.5],[-0.5,0.25]];
    this.duct(name, corners.map(([u,v]) => this.point(x,span+u*width,height+v*openingHeight)), new THREE.Vector3(0,0,-1), 4, 0.55);
  }

  /** Hollow wing-root wedge with a swept, grilled front face. */
  grilledWedge(name: string, side: number, profile?: {
    outline: [PlanPoint,PlanPoint,PlanPoint,PlanPoint];
    roof: [number,number]; floor: [number,number]; bars: number;
  }) {
    const outline = profile?.outline ?? [[43,23],[50,39],[125,40],[101,23]] as const;
    const inner = outline[3], outer = outline[2];
    const fraction = (span: number) => (span-inner[1])/(outer[1]-inner[1]);
    const roof = (span: number) => THREE.MathUtils.lerp(profile?.roof[0] ?? 8,profile?.roof[1] ?? 0.5,fraction(span));
    const floor = (span: number) => THREE.MathUtils.lerp(profile?.floor[0] ?? -8,profile?.floor[1] ?? -4,fraction(span));
    // Keep the entrance fixed, narrowing and flattening the aft section so
    // the housing's outer wall, roof, and underside converge toward the rear.
    const shellPoint = ([x,s]: PlanPoint, index: number, upper: boolean) => {
      const rear = index < 2;
      const span = rear ? inner[1]+(s-inner[1])*0.75 : s;
      const middle = (roof(s)+floor(s))/2;
      const height = upper ? roof(s) : floor(s);
      return this.point(x,span*side,middle+(height-middle)*(rear ? 0.65 : 1));
    };
    const top = outline.map((p,i) => shellPoint(p,i,true));
    const bottom = outline.map((p,i) => shellPoint(p,i,false));
    const vertices: number[] = [];
    const quad = (a: THREE.Vector3,b: THREE.Vector3,c: THREE.Vector3,d: THREE.Vector3) => {
      for(const p of [a,b,c,a,c,d]) vertices.push(p.x,p.y,p.z);
    };
    quad(...top as [THREE.Vector3,THREE.Vector3,THREE.Vector3,THREE.Vector3]);
    quad(...bottom as [THREE.Vector3,THREE.Vector3,THREE.Vector3,THREE.Vector3]);
    // Leave the swept leading face open; the tunnel below supplies its walls.
    for(const i of [0,1,3]) { const j=(i+1)%4; quad(top[i],bottom[i],bottom[j],top[j]); }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    geometry.computeVertexNormals();
    const shell = this.hull.clone(); shell.side=THREE.DoubleSide;
    this.mesh(geometry,shell,`${name}/shell`);
    const edge = (t: number, upper: boolean, inset = 0) => {
      const span=THREE.MathUtils.lerp(inner[1],outer[1],t), x=THREE.MathUtils.lerp(inner[0],outer[0],t)-inset;
      return this.point(x,span*side,upper ? roof(span)-0.65 : floor(span)+0.65);
    };
    this.duct(`${name}/opening`,[edge(0.03,false),edge(0.97,false),edge(0.97,true),edge(0.03,true)],new THREE.Vector3(0,0,-1),8,0.55);
    const bars=profile?.bars ?? 11;
    for(let i=1;i<=bars;i++) {
      const t=i/(bars+1), a=edge(t,false,1.1), b=edge(t,true,1.1);
      const bar = this.mesh(new THREE.BoxGeometry(0.55*PLAN_SCALE,b.y-a.y,1.1*PLAN_SCALE),this.panel,`${name}/grille/${i}`);
      bar.position.copy(a).lerp(b,0.5);
    }
  }

  /** An open lip, tapered tunnel, and back wall. No face spans the mouth. */
  private duct(name: string, mouth: THREE.Vector3[], outward: THREE.Vector3, depth: number, lip: number) {
    const center = mouth.reduce((sum,p) => sum.add(p),new THREE.Vector3()).divideScalar(mouth.length);
    const outer = mouth.map(p => p.clone().add(p.clone().sub(center).normalize().multiplyScalar(lip*PLAN_SCALE)));
    const back = mouth.map(p => p.clone().sub(center).multiplyScalar(0.8).add(center).addScaledVector(outward,-depth*PLAN_SCALE));
    const base = outer.map(p => p.clone().addScaledVector(outward,-depth*PLAN_SCALE));
    const band = (suffix: string, a: THREE.Vector3[], b: THREE.Vector3[], material: THREE.Material) => {
      const vertices: number[] = [];
      for (let i=0;i<a.length;i++) {
        const j=(i+1)%a.length;
        for (const p of [a[i],a[j],b[i],a[j],b[j],b[i]]) vertices.push(p.x,p.y,p.z);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
      geometry.computeVertexNormals();
      const surface = material.clone(); surface.side=THREE.DoubleSide;
      this.mesh(geometry,surface,`${name}/${suffix}`);
    };
    band('lip',outer,mouth,this.hull);
    band('housing',base,outer,this.panel);
    band('tunnel',mouth,back,this.panel);
    const vertices: number[] = [];
    for(let i=1;i<back.length-1;i++) for(const p of [back[0],back[i],back[i+1]]) vertices.push(p.x,p.y,p.z);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    geometry.computeVertexNormals(); this.mesh(geometry,this.dark,`${name}/back`);
  }

  ovalPort(name: string, x: number, span: number, height: number, length: number, width: number) {
    this.root.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(this.point(x,span,100), new THREE.Vector3(0,-1,0));
    const surface = ray.intersectObjects(this.root.children,false)[0];
    const normal = surface?.face?.normal.clone() ?? new THREE.Vector3(0,1,0);
    if (surface) normal.transformDirection(surface.object.matrixWorld);
    const center = surface?.point ?? this.point(x,span,height);
    for (const [size,lift,material] of [[1,0,this.panel],[0.72,0.15,this.dark]] as const) {
      const geometry = new THREE.CircleGeometry(1,24); geometry.rotateX(-Math.PI/2);
      const patch = this.mesh(geometry,material,name);
      patch.scale.set(width/2*PLAN_SCALE*size,1,length/2*PLAN_SCALE*size);
      patch.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),normal);
      patch.position.copy(center).addScaledVector(normal,(lift+0.15)*PLAN_SCALE);
    }
  }

  sideRecess(name: string, outline: readonly (readonly [longitudinal: number, height: number])[], span: number) {
    const side = Math.sign(span);
    this.duct(name,outline.map(([x,y]) => this.point(x,span+side*2.8,y)),new THREE.Vector3(side,0,0),2.8,0.5);
  }

  /** Recessed, ribbed rectangular stern visible in all four top views. */
  exhaust(x: number, width: number, height: number, length: number) {
    const housing = this.mesh(new THREE.BoxGeometry(width * 2 * PLAN_SCALE, height * PLAN_SCALE, length * PLAN_SCALE), this.panel, 'drive/housing');
    housing.position.copy(this.point(x, 0, -0.5));
    const opening = this.mesh(new THREE.BoxGeometry((width * 2 - 2) * PLAN_SCALE, (height - 1.5) * PLAN_SCALE, 0.3 * PLAN_SCALE), this.dark, 'drive/recess');
    opening.position.copy(this.point(x - length / 2 - 0.2, 0, -0.5));
    for (let i = -3; i <= 3; i++) {
      const rib = this.mesh(new THREE.BoxGeometry(0.5 * PLAN_SCALE, (height - 1.8) * PLAN_SCALE, 0.7 * PLAN_SCALE), this.hull, `drive/rib/${i}`);
      rib.position.copy(this.point(x - length / 2 - 0.45, i * (width - 1) / 3.6, -0.5));
    }
  }

  lance(x: number, height: number) {
    const turret = this.mesh(new THREE.SphereGeometry(2.2 * PLAN_SCALE, 16, 10), this.dark, 'light-lance/turret');
    turret.scale.set(1, 0.65, 1.3); turret.position.copy(this.point(x, 0, height));
    const barrel = this.mesh(new THREE.CylinderGeometry(0.45 * PLAN_SCALE, 0.6 * PLAN_SCALE, 7 * PLAN_SCALE, 8), this.panel, 'light-lance/barrel');
    barrel.rotation.x = Math.PI / 2; barrel.position.copy(this.point(x + 3.4, 0, height));
  }
}
