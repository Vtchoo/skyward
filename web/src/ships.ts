
import * as THREE from 'three';
import { ShipGeometry, type PlanPoint, type Section } from './ship-geometry';

export const shipIds = ['poco', 'largo', 'scout', 'm-bot'] as const;
export type ShipId = typeof shipIds[number];
export const ships: Record<ShipId, { name: string; description: string; reference: string }> = {
  poco: { name: 'Poco', description: 'Needle nose, cranked wings, and a compact framed cockpit.', reference: '/references/ddf-ships.jpeg' },
  largo: { name: 'Largo', description: 'Broad armored shoulders, squared wings, and clustered outboard pods.', reference: '/references/ddf-ships.jpeg' },
  scout: { name: 'Scout', description: 'Slender fuselage, swept wings, and long pointed wingtip rails.', reference: '/references/ddf-ships.jpeg' },
  'm-bot': { name: 'M-Bot', description: 'Wide swept wings, forward shoulder points, and a broad enclosed cockpit.', reference: '/references/m-bot.jpeg' },
};

// Top-view pixel coordinates are recorded as [forward position, distance from
// centerline]. The faint Poco overlays on the other plans are scale comparisons,
// not parts of those airframes. No ghost/alternate wing outlines are modeled.
function interpolate(points: readonly (readonly [number, number])[], value: number) {
  const index = points.findIndex(([x]) => x >= value);
  if (index === 0) return points[0][1];
  if (index < 0) return points[points.length - 1][1];
  const a = points[index - 1], b = points[index];
  return THREE.MathUtils.lerp(a[1], b[1], (value - a[0]) / (b[0] - a[0]));
}

function wingSurface(id: ShipId, span: number) {
  const curves: Record<ShipId, readonly (readonly [number, number])[]> = {
    poco: [[0, 4], [16, 4], [30, 1], [53, -7], [65, -6], [71, -2]],
    largo: [[0, 5], [22, 5], [39, 1], [58, -5], [71, -9]],
    scout: [[0, 3], [15, 3], [34, -2], [60, 3], [68, -1]],
    'm-bot': [[0, 6], [18, 5], [33, 3], [58, 0], [82, -1]],
  };
  return interpolate(curves[id], Math.abs(span));
}

function ddfDetails(b: ShipGeometry, id: Exclude<ShipId, 'm-bot'>, cockpit: readonly Section[]) {
  const largo = id === 'largo';
  b.cockpit(cockpit, largo ? [81, 96] : id === 'poco' ? [58, 76] : [57, 74]);
  b.exhaust(largo ? 36 : 39, largo ? 11 : 8.5, largo ? 12 : 10, largo ? 12 : 11);
  b.lance(largo ? 133 : id === 'poco' ? 116 : 107, largo ? -9 : -7);
  // The little aft-pointing fences are distinct from the main wing roots.
  b.pairedPlate('aft-fence', largo ? [[13,15],[44,20],[46,14],[34,11]] : [[16,11],[51,18],[53,13],[40,9]], 0, 0.9, b.hull, 0.2);
  for (const side of [-1,1]) b.loft(`aft/spike/${side}`, [[largo ? 13 : 16,0.08,0.1,-0.1],[38,1.1,3,-3],[49,1.6,4,-4]], b.hull, side*(largo ? 14 : 11));
  const start = largo ? 187 : id === 'poco' ? 174 : 176;
  const noseHeight = (x: number) => interpolate(largo ? [[110,7],[204,3],[264,0]] : id === 'poco' ? [[102,6],[171,3],[231,0]] : [[105,5],[193,2.4],[243,0]], x);
  b.plate('nose/sensor-surround', [[start,0],[start+5,2.2],[start+26,1.2],[start+34,0],[start+26,-1.2],[start+5,-2.2]], x => noseHeight(x) + 0.25, 0.3, b.panel, 0.1);
  b.plate('nose/sensor-slot', [[start+6,0.7],[start+27,0.5],[start+30,0],[start+27,-0.5],[start+6,-0.7]], x => noseHeight(x) + 0.5, 0.25, b.dark, 0);
  const joint = largo ? 179 : id === 'poco' ? 171 : 167;
  const width = largo ? 5.8 : 5;
  b.line('nose/transverse-joint', Array.from({ length: 17 }, (_, i) => {
    const angle = Math.PI * i / 16;
    return [joint, Math.cos(angle) * width, Math.sin(angle) * noseHeight(joint) + 0.12] as const;
  }));
}

function poco() {
  const b = new ShipGeometry(124);
  const wing = (_x: number, span: number) => wingSurface('poco', span);
  b.loft('fuselage', [[32,7,4,-4],[43,10,6,-6.5],[54,12.5,8,-8],[73,12.5,8,-8],[91,11.5,7,-7],[104,10,6,-6],[171,5,3,-3],[215,1.3,1,-1],[231,0.08,0.1,-0.1]]);
  for (const side of [-1,1]) b.rootFairing(`wing/root-fairing/${side}`,side,[[43,12],[49,23],[93,23],[95,12]],6.5,-6.5,[101,8,-8]);
  for (const side of [-1,1]) b.grilledWedge(`wing/intake-wedge/${side}`,side);
  b.pairedPlate('wing/outer-panel', [[39,65],[61,68],[70,48],[81,36],[53,32],[47,45]], wing, 1.3);
  b.pairedPlate('wing/tip-rail', [[36,65],[65,70],[60,66],[38,62]], wing, 1.6, b.hull, 0.25);
  for (const side of [-1,1]) {
    b.loft(`wing/tip-fairing/${side}`, [[35,0.6,-2,-5],[39,1.8,-1,-5],[60,1.5,-1.5,-5],[66,0.15,-2.5,-3.5]], b.hull, side*67);
  }
  for (let i = 0; i < 3; i++) {
    const span = 32 + i * 4.1;
    b.pairedPlate(`wing/louver/${i}`, [[37,span],[88-i*5,span+4],[82-i*5,span+6],[40,span+2]], (_x,s) => wingSurface('poco',s)+1.6, 1.1, i === 1 ? b.panel : b.hull, 0.2);
  }
  b.panelLine('wing/leading-seam', [[43,62],[49,45],[58,39]], wing);
  b.panelLine('wing/trailing-seam', [[59,65],[65,49],[74,41]], wing);
  b.panelLine('wing/cross-seams', [[42,56],[63,58]], wing);
  b.panelLine('wing/spear-seams', [[66,25],[69,31],[89,32],[87,25]], 6);
  b.panelLine('wing/root-seam', [[48,16],[82,17],[97,14]], 6.5);
  for (const side of [-1,1]) b.hatch(`wing/root-fastener/${side}`, 55, side*20, 5.4, 1.2);
  ddfDetails(b, 'poco', [[48,1.5,8,6.5],[53,6.5,12,6.5],[59,7.5,13,7],[75,7,12.8,7],[88,4.5,10,6],[97,0.5,6.5,5.5]]);
  b.acclivityRing(78,-12,13);
  return b.root;
}

function largo() {
  const b = new ShipGeometry(137);
  const wing = (_x: number, span: number) => wingSurface('largo', span);
  b.loft('fuselage', [[30,8,5,-5],[43,12,8,-8],[58,14.5,9,-10],[82,14.5,9,-9],[103,12,8,-7.5],[115,10.5,7,-7],[179,5.8,4.5,-4.5],[213,3.2,2.8,-2.8],[264,0.08,0.1,-0.1]]);
  for (const side of [-1,1]) b.rootFairing(`wing/root-fairing/${side}`,side,[[39,14],[44,27],[99,24],[103,13]],4.8,-4.8,[109,6,-6]);
  for (const side of [-1,1]) b.grilledWedge(`wing/intake-wedge/${side}`,side,{
    outline:[[39,27],[42,39],[82,40],[109,24]], roof:[6,2], floor:[-6,-4], bars:9,
  });
  b.pairedPlate('wing/outer-panel', [[44,65],[69,67],[74,49],[80,41],[45,39]], wing, 1.8);
  b.pairedPlate('wing/pod-cradle', [[43,43],[43,65],[77,65],[79,43]], (_x,s)=>wingSurface('largo',s)-1, 3, b.panel, 0.5);
  b.pairedPlate('wing/tip-rail', [[42,67],[80,68],[88,65],[77,63],[44,64]], wing, 2, b.hull, 0.35);
  for (let i = 0; i < 3; i++) {
    const span = 32 + i * 3.7;
    b.pairedPlate(`wing/root-rib/${i}`, [[34,span],[87-i*2,span+3],[84-i*2,span+4.5],[36,span+1.5]], (_x,s) => wingSurface('largo',s)+2.3, 1.4, b.hull, 0.3);
  }
  for (const side of [-1,1]) {
    b.hatch(`shoulder/access/${side}`, 58, side*20, 3.9, 2.3);
    // The three outboard bodies have broad cylindrical barrels, with their
    // upper halves embedded in the wing rather than hanging as little spheres.
    for (let i = 0; i < 3; i++) {
      const span = 45 + i*9;
      const elevation = wingSurface('largo',span)-0.8;
      b.loft(`outboard-pod/${side}/${i}`, [[40,2,elevation+2,elevation-2],[46,3.3,elevation+3.3,elevation-3.3],[75,3.3,elevation+3.3,elevation-3.3],[81,2.5,elevation+2.5,elevation-2.5],[88,0.2,elevation+0.3,elevation-0.3]], b.panel, side*span);
      for (const station of [49,74]) b.line(`outboard-pod/collar/${side}/${i}/${station}`,Array.from({length:25},(_,j)=>{
        const angle=j*Math.PI/12;
        return [station,side*span+Math.cos(angle)*3.4,elevation+Math.sin(angle)*3.4] as const;
      }),0.35,b.hull);
    }
  }
  b.hatch('dorsal/access', 59, 0, 9.3, 5);
  b.panelLine('wing/outer-frame', [[49,63],[49,45],[71,45],[67,62]], wing);
  b.panelLine('wing/cross-seam', [[47,54],[71,54]], wing);
  b.panelLine('wing/root-seam', [[83,27],[83,18],[95,15]], (_x,s) => wingSurface('largo',s)+2);
  ddfDetails(b, 'largo', [[74,2,9.5,8],[79,7.5,15.5,8],[86,8.2,16.5,8],[96,8,16,7.5],[107,4,11,7],[115,0.5,8,7]]);
  b.acclivityRing(82,-15,16);
  return b.root;
}

function scout() {
  const b = new ShipGeometry(126);
  const wing = (_x: number, span: number) => wingSurface('scout', span);
  b.loft('fuselage', [[33,6,4,-4],[47,9,6,-6],[59,10.5,7,-7],[77,10.5,7,-7],[92,9,5.5,-6],[105,8,5,-5],[167,5,3,-3],[193,3.6,2.4,-2.4],[243,0.08,0.1,-0.1]]);
  for (const side of [-1,1]) b.rootFairing(`wing/root-fairing/${side}`,side,[[43,11],[49,24],[93,22],[101,10]],4,-4.8,[101,5,-6]);
  for (const side of [-1,1]) b.grilledWedge(`wing/intake-wedge/${side}`,side,{
    outline:[[32,22],[24,35],[80,35],[101,22]], roof:[5,0], floor:[-6,-3], bars:8,
  });
  b.pairedPlate('wing/swept-panel', [[12,57],[29,60],[63,35],[82,29],[47,30],[31,44]], wing, 1.3);
  b.pairedPlate('wing/tip-rail', [[9,59],[61,66],[53,62],[13,55]], wing, 1.4, b.hull, 0.2);
  for (let i = 0; i < 3; i++) {
    const span = 27 + i*4;
    b.pairedPlate(`wing/root-rib/${i}`, [[22,span],[83,span+5],[78,span+7],[25,span+2]], (_x,s) => wingSurface('scout',s)+1.5, 1.1, b.hull, 0.25);
  }
  b.panelLine('wing/leading-frame', [[20,56],[37,41],[57,34]], wing);
  b.panelLine('wing/trailing-frame', [[28,58],[46,43],[66,35]], wing);
  b.panelLine('wing/cross-seam', [[30,47],[43,48]], wing);
  b.panelLine('wing/root-seam', [[48,15],[77,18],[87,16]], (_x,s) => wingSurface('scout',s)+1.6);
  for (const side of [-1,1]) b.hatch(`wing/root-fastener/${side}`, 54, side*20, 2.9, 1.2);
  ddfDetails(b, 'scout', [[47,1,6.5,5.5],[52,5.5,10,5.5],[59,6,11,6],[74,5.5,10.5,6],[85,3,8.5,5.5],[92,0.5,6,5]]);
  b.acclivityRing(73,-11,11);
  return b.root;
}

function mbot() {
  const b = new ShipGeometry(106);
  const wing = (_x: number, span: number) => wingSurface('m-bot',span);
  b.loft('fuselage', [[24,8,3,-4],[43,12,6,-6],[58,17,8,-8],[88,17,10,-9],[111,17,10,-8],[146,16,8,-7],[164,11,5,-4],[171,1,1,-1]], b.hull, 0, false, true);
  b.loft('dorsal/rising-deck', [[52,12,8,4],[68,15,14,5],[93,15,18.5,6],[105,12,18,7],[114,8,13,6]], b.hull);
  b.exhaust(35,10,12,24);
  b.pairedPlate('stern/pointed-fence', [[17,11],[43,15],[49,12],[35,9]], 1, 1.1, b.hull, 0.2);
  b.pairedPlate('wing/swept-panel', [[17,80],[54,72],[97,52],[98,33],[65,22],[46,45]], wing, 1.4);
  b.pairedPlate('wing/root-web', [[20,11],[56,20],[67,30],[70,38],[94,44],[120,25],[108,16],[56,12]], wing, 1.8, b.hull);
  const shoulderOutline: PlanPoint[]=[[57,24],[70,46],[98,51],[134,48],[163,43],[195,32],[168,20],[155,16],[113,19],[102,10]];
  const shoulderRoof=(x:number,s:number)=>{
    const crest=Math.min(180,145+(40-Math.abs(s))*2.8);
    // Spread the descent over a longer chord and ease both ends, replacing
    // the steep ten-pixel face with a continuous aerodynamic shoulder.
    const rampStart=crest-20, rampEnd=Math.min(190,crest+20);
    const descent=THREE.MathUtils.smoothstep(x,rampStart,rampEnd);
    return THREE.MathUtils.lerp(interpolate([[57,3],[95,7]],x),0.1,descent);
  };
  const shoulderFloor=(x:number)=>interpolate([[57,0],[95,-4],[165,-3],[195,-0.1]],x);
  for(const side of [-1,1]) {
    const shoulder=b.sculptedPanel(`shoulder/pointed-fairing/${side}`,shoulderOutline.map(([x,s])=>[x,s*side]),shoulderRoof,shoulderFloor);
    for(const span of [40,34]) b.incineratorSlot(`incinerator/${side}/${span}`,shoulder,side*span,2.5,2.2);
  }
  b.cockpit([[104,7,10,7],[112,14,18,8],[124,16,20,8],[146,16,20,7],[159,12,17,6],[166,6,9,5]], [115,145,164], true);
  b.hatch('dorsal/coupling', 102, 0, 18.7, 3.6);
  b.pairedPlate('shoulder/recess', [[106,30],[110,36],[116,35],[113,31]], (x,s) => shoulderRoof(x,s)+0.2, 0.25, b.dark, 0.25);
  b.panelLine('wing/leading-frame', [[26,76],[52,66],[77,51]], wing);
  b.panelLine('wing/cross-seam', [[34,56],[68,55]], wing);
  b.panelLine('wing/trailing-frame', [[37,48],[58,44],[68,35]], wing);
  b.panelLine('shoulder/outer-seam', [[72,42],[97,47],[134,44],[164,38]], shoulderRoof);
  b.panelLine('rear/deck-seam', [[58,13],[89,13],[99,11]], x => interpolate([[58,10],[89,18],[104,17]],x));
  b.pairedPlate('rear/lateral-recess', [[56,17],[87,17],[91,15],[58,15]], 1, 0.7, b.dark, 0.3);
  for(const side of [-1,1]) b.sideRecess(`rear/side-intake/${side}`,[[56,-3],[59,0],[104,0],[111,-2],[109,-5],[59,-5]],side*17.2);
  for (const x of [63,78,93]) for (const side of [-1,1]) b.hatch(`rear/deck-fastener/${x}/${side}`, x, side*12, 8.7, 0.65);
  // Small ventral assembly visible under the center hull in both elevations.
  b.loft('ventral/fairing', [[84,3,-9,-12],[106,5,-9,-14],[133,3,-7,-11]], b.panel);
  b.acclivityRing(101,-16,14);
  return b.root;
}

export function createShip(id: ShipId): THREE.Group {
  const builders: Record<ShipId, () => THREE.Group> = { poco, largo, scout, 'm-bot': mbot };
  const model = builders[id](); model.name = ships[id].name; return model;
}
