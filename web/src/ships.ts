import * as THREE from 'three';

export const shipIds = ['poco', 'largo', 'scout', 'm-bot'] as const;
export type ShipId = typeof shipIds[number];
export const ships: Record<ShipId, { name: string; description: string; reference: string }> = {
  poco: { name: 'Poco', description: 'Long needle nose. Compact, cranked wings and raised outer panels.', reference: '/references/ddf-ships.jpeg' },
  largo: { name: 'Largo', description: 'Long needle nose. Broad engine section and squared outer wings.', reference: '/references/ddf-ships.jpeg' },
  scout: { name: 'Scout', description: 'Long needle nose. Swept, angular wings and a narrow central hull.', reference: '/references/ddf-ships.jpeg' },
  'm-bot': { name: 'M-Bot', description: 'Short central hull. Broad swept wings and paired forward shoulders.', reference: '/references/m-bot.jpeg' },
};

type Point = readonly [number, number];
const scale = 0.065;

/** Coordinates are traced from the supplied top views, in source-image pixels.
 * Source +X is forward; model -Z is forward, +Y is up.
 * Heights and cross sections are reconstructed from the side/front drawings.
 */
export function createShip(id: ShipId): THREE.Group {
  const group = new THREE.Group();
  const center = id === 'm-bot' ? 105 : id === 'poco' ? 115 : 130;
  const cy = id === 'poco' ? 135 : id === 'largo' ? 389 : id === 'scout' ? 637 : 163;
  const shell = new THREE.MeshStandardMaterial({ color: 0xa8b3b8, roughness: 0.46, metalness: 0.64 });
  const wingMaterial = new THREE.MeshStandardMaterial({ color: 0x87979f, roughness: 0.56, metalness: 0.58 });
  const inset = new THREE.MeshStandardMaterial({ color: 0x34434c, roughness: 0.65, metalness: 0.65 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x172e3b, roughness: 0.17, metalness: 0.82 });
  const trim = new THREE.LineBasicMaterial({ color: 0x263943, transparent: true, opacity: 0.75 });

  function wingHeight(lateral: number): number {
    const distance = Math.abs(lateral);
    // Front elevations: gull-wing Poco, drooped Largo shoulders, shallow Scout dihedral.
    if (id === 'poco') return distance < 2.7 ? -distance * 0.11 : -0.297 + (distance - 2.7) * 0.31;
    if (id === 'largo') return -Math.min(distance, 3) * 0.1;
    if (id === 'scout') return distance < 2 ? -distance * 0.06 : -0.12 + (distance - 2) * 0.13;
    return Math.max(0, 1 - distance / 4.5) * 0.16;
  }

  function position(x: number, y: number, height: number): THREE.Vector3 {
    return new THREE.Vector3((cy - y) * scale, height, (center - x) * scale);
  }
  function edges(mesh: THREE.Mesh) {
    const lines = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 28), trim);
    mesh.add(lines);
  }
  function plate(points: readonly Point[], height: number, thickness: number, material: THREE.Material = wingMaterial) {
    const shape = new THREE.Shape();
    points.forEach(([x, y], i) => {
      const px = (cy - y) * scale, py = (x - center) * scale;
      if (i === 0) shape.moveTo(px, py); else shape.lineTo(px, py);
    });
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, steps: 1 });
    geometry.rotateX(-Math.PI / 2);
    const vertices = geometry.getAttribute('position');
    for (let i = 0; i < vertices.count; i++) vertices.setY(i, vertices.getY(i) + wingHeight(vertices.getX(i)));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = height;
    group.add(mesh); edges(mesh);
    return mesh;
  }
  function paired(points: readonly Point[], height: number, thickness: number, material?: THREE.Material) {
    for (const side of [-1, 1]) plate(points.map(([x, y]) => [x, cy + (y - cy) * side] as Point), height, thickness, material);
  }
  function seam(points: readonly Point[], height: number, mirror = true) {
    for (const side of mirror ? [-1, 1] : [1]) {
      const geometry = new THREE.BufferGeometry().setFromPoints(points.map(([x, y]) => {
        const point = position(x, cy + (y - cy) * side, height);
        point.y += wingHeight(point.x);
        return point;
      }));
      group.add(new THREE.Line(geometry, trim));
    }
  }
  function body(stations: readonly (readonly [number, number, number])[], material: THREE.Material = shell, base = 0) {
    // Octagonal sections preserve the faceted plan and low profile of the drawings.
    const vertices: number[] = [], indices: number[] = [];
    for (const [x, halfWidth, height] of stations) {
      for (const [widthFactor, heightFactor] of [[-1,0],[-0.75,0.65],[-0.4,1],[0.4,1],[0.75,0.65],[1,0],[0.65,-0.45],[-0.65,-0.45]]) {
        const v = position(x, cy - halfWidth * widthFactor, base + height * heightFactor);
        vertices.push(v.x, v.y, v.z);
      }
    }
    for (let s = 0; s < stations.length - 1; s++) for (let j = 0; j < 8; j++) {
      const a = s * 8 + j, b = s * 8 + (j + 1) % 8, c = a + 8, d = b + 8;
      indices.push(a, b, c, b, d, c);
    }
    for (let j = 1; j < 7; j++) {
      indices.push(0, j + 1, j);
      const end = (stations.length - 1) * 8;
      indices.push(end, end + j, end + j + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material); group.add(mesh); edges(mesh);
  }
  function engine(x: number, offset: number, radius: number, length: number) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.12, length, 12), inset);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.copy(position(x, cy - offset, 0)); group.add(mesh); edges(mesh);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.78, 0.045, 5, 16), shell);
    ring.position.copy(mesh.position); ring.position.z += length / 2 + 0.01; group.add(ring);
  }

  if (id === 'poco') {
    paired([[43,124],[18,124],[44,112],[59,106],[47,94],[38,69],[64,65],[71,83],[68,91],[82,108],[126,100],[101,115],[90,124]], -0.08, 0.16);
    paired([[38,69],[64,65],[71,83],[48,88]], 0.08, 0.17, shell);
    paired([[48,90],[70,85],[68,91],[82,108],[59,106]], 0.02, 0.12, shell);
    body([[18,8,0.12],[43,10,0.3],[53,15,0.45],[83,15,0.42],[101,10,0.25],[181,3.5,0.09],[231,0.25,0.02]]);
    body([[48,5,0.06],[57,8,0.4],[74,7,0.48],[93,1,0.03]], glass, 0.35);
    for (const offset of [-7, 7]) engine(30, offset, 0.23, 1.4);
    seam([[47,75],[66,71]], 0.27); seam([[51,91],[69,87]], 0.23);
    seam([[60,109],[77,112],[103,105]], 0.13);
    seam([[101,125],[119,128],[181,132]], 0.28);
  } else if (id === 'largo') {
    paired([[31,378],[13,376],[38,367],[41,351],[43,322],[69,320],[77,342],[85,358],[117,365],[102,376]], -0.05, 0.25);
    paired([[43,322],[69,320],[76,342],[40,346]], 0.14, 0.2, shell);
    paired([[42,351],[77,348],[85,358],[113,364],[98,370],[44,367]], 0.15, 0.18, shell);
    paired([[31,370],[43,364],[72,363],[78,373],[68,381],[32,381]], 0.24, 0.44, shell);
    body([[14,8,0.18],[34,11,0.4],[50,18,0.59],[86,17,0.53],[110,11,0.28],[204,3,0.12],[264,0.25,0.02]]);
    body([[66,6,0.05],[75,8,0.48],[91,7,0.4],[107,1.5,0.03]], glass, 0.5);
    for (const offset of [-13, 13]) engine(33, offset, 0.38, 1.8);
    for (const offset of [-17, 17]) {
      const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 12), inset);
      hatch.position.copy(position(57, cy - offset, 0.7 + wingHeight(offset * scale)));
      group.add(hatch);
    }
    seam([[50,326],[52,340],[73,338]], 0.36); seam([[46,348],[77,347]], 0.36);
    seam([[48,355],[82,354],[93,362]], 0.35); seam([[116,380],[145,383],[205,387]], 0.3);
  } else if (id === 'scout') {
    paired([[28,629],[13,627],[47,615],[32,601],[10,578],[31,574],[65,604],[102,623],[78,629]], -0.08, 0.15);
    paired([[10,578],[31,574],[65,604],[51,607],[32,601]], 0.06, 0.12, shell);
    paired([[35,611],[57,605],[86,615],[102,623],[51,619]], 0.02, 0.14, shell);
    body([[15,6,0.12],[42,8,0.3],[54,13,0.35],[82,12,0.3],[103,8,0.2],[193,2.6,0.08],[243,0.2,0.01]]);
    body([[49,4,0.04],[58,6,0.33],[72,5.5,0.31],[88,1,0.02]], glass, 0.29);
    engine(30, 0, 0.34, 1.9);
    seam([[19,580],[37,602],[59,609]], 0.2); seam([[28,578],[50,600],[65,604]], 0.2);
    seam([[53,621],[69,623],[94,624]], 0.2); seam([[102,630],[135,633],[194,635]], 0.21);
  } else {
    paired([[18,151],[57,143],[41,124],[17,83],[55,91],[96,110],[136,112],[164,118],[195,131],[168,144],[154,151]], -0.04, 0.23);
    paired([[17,83],[55,91],[96,110],[74,117],[46,105]], 0.1, 0.16, shell);
    paired([[59,139],[70,117],[98,112],[136,115],[161,124],[195,131],[165,143],[151,146],[112,143],[103,153]], 0.15, 0.38, shell);
    body([[18,8,0.15],[45,11,0.4],[60,17,0.68],[103,16,0.78],[132,17,0.65],[164,9,0.3],[169,0.4,0.05]]);
    body([[105,8,0.08],[119,12,0.8],[144,12,0.78],[163,7,0.05]], glass, 0.65);
    const canopyFrame = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      position(132, cy - 12, 0.65), position(132, cy - 9, 1.16), position(132, cy - 4.8, 1.44),
      position(132, cy + 4.8, 1.44), position(132, cy + 9, 1.16), position(132, cy + 12, 0.65),
    ]), new THREE.LineBasicMaterial({ color: 0xa8b3b8 }));
    group.add(canopyFrame);
    // Rear drive and paired shoulder recesses are visible in the supplied plans.
    engine(30, 0, 0.48, 1.8);
    paired([[79,123],[99,120],[93,126],[78,128]], 0.55, 0.04, inset);
    paired([[107,117],[113,118],[112,121],[105,120]], 0.55, 0.02, inset);
    paired([[137,122],[144,124],[143,127],[137,126]], 0.55, 0.02, inset);
    seam([[26,89],[51,98],[75,115]], 0.28); seam([[36,111],[60,115],[70,125]], 0.28);
    seam([[65,141],[73,121],[96,116]], 0.57); seam([[110,146],[150,146],[161,140]], 0.57);
    seam([[57,154],[101,154]], 0.64);
  }
  // Underside light-lance mounting shown in the DDF side elevations.
  if (id !== 'm-bot') {
    const turret = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 6), inset);
    turret.position.set(0, -0.29, 2); group.add(turret);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6), inset);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, -0.3, 1.65); group.add(barrel);
  }
  group.name = ships[id].name;
  return group;
}
