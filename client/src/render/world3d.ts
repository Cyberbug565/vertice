// v0.39 · Lo que hace falta para mirar la ciudad desde cerca (cámaras en tercera y primera persona): en la vista cenital el
// suelo, el mobiliario y los muros de los interiores los pinta Pixi en 2D isométrico; aquí se levantan en 3D a partir de la
// misma definición de la zona. Unidades: 1 = una loseta; x y z del mundo 3D son x e y de la rejilla.
import * as THREE from 'three';
import { GROUND_TYPES, buildZoneGrid, edgeDirection, type ZoneDef, type ZoneGrid } from '@vertice/shared';
import { GROUND } from './art';

/** Altura de los muros de los interiores (una persona mide ~1,5). */
export const WALL_H = 2.7;
/** Suelos con baldosas o tablones: se les marca la junta de cada loseta. */
const JOINTED = new Set(['sidewalk', 'tile', 'plaza', 'market', 'metal', 'deck', 'wood', 'bridge']);

function stairHeight(step: number, up: boolean) { return up ? (step+1)*.17 : .16+(6-step)*.055; }
export function stairRise(z: ZoneDef, x: number,y: number) {
  if(z.kind!=='interior')return 0;
  for(const door of z.doors) {
    if(door.signIcon!=='subir'&&door.signIcon!=='bajar')continue;
    const dx=x-door.at[0]-.5,dy=y-door.at[1]-.5;
    const [nx,ny]=edgeDirection(z,door.at)??[0,-1];
    const t=1+dx*nx+dy*ny;
    if(Math.abs(dx*ny-dy*nx)>=.56||t<0||t>=1.68)continue;
    return stairHeight(Math.min(6,Math.floor(t/.24)),door.signIcon==='subir');
  }
  return 0;
}

export interface Scene3D { group: THREE.Group; grid: ZoneGrid; heights: Float32Array; setCut(cut: boolean): void; dispose(): void }
const grids = new WeakMap<ZoneDef, ZoneGrid>();
export function sceneGrid(zone: ZoneDef) {
  let grid = grids.get(zone);
  if (!grid) { grid = buildZoneGrid(zone); grids.set(zone, grid); }
  return grid;
}

/** Suelo: una textura con un píxel por trozo de loseta (y las franjas de los pasos de cebra), más un mapa de juntas. */
function ground(z: ZoneDef, grid: ZoneGrid, own: { dispose(): void }[]) {
  const w = z.width, h = z.height;
  const P = Math.max(2, Math.min(16, Math.floor(4096 / Math.max(w, h)))); // píxeles por loseta
  const cv = document.createElement('canvas'); cv.width = w * P; cv.height = h * P;
  const g = cv.getContext('2d')!;
  const joints = new Uint8Array(w * h);
  const colors = GROUND_TYPES.map(type => GROUND[type] ?? 0x202028);
  const joined = GROUND_TYPES.map(type => Number(JOINTED.has(type)) * 255);
  const tiles = document.createElement('canvas'); tiles.width = w; tiles.height = h;
  const tileCtx = tiles.getContext('2d')!;
  const pixels = tileCtx.createImageData(w,h);
  for (let i = 0; i < w * h; i++) {
    const type = grid.ground[i], col = colors[type];
    const v = .92 + ((Math.imul(i ^ (i >>> 7), 1597334677) >>> 24) / 255) * .14;
    pixels.data[i*4] = ((col >> 16) & 255) * v;
    pixels.data[i*4+1] = ((col >> 8) & 255) * v;
    pixels.data[i*4+2] = (col & 255) * v;
    pixels.data[i*4+3] = 255;
    joints[i] = joined[type];
  }
  tileCtx.putImageData(pixels, 0, 0);
  g.imageSmoothingEnabled = false;
  g.drawImage(tiles, 0, 0, cv.width, cv.height);
  // Pasos de cebra: franjas paralelas a la calzada.
  g.fillStyle = 'rgba(240,240,255,0.88)';
  for (const r of z.ground) if (r.type === 'crosswalk') {
    const [x0, y0, rw, rh] = r.rect, roadInX = rh >= rw;
    if (roadInX) for (let yy = y0; yy < y0 + rh; yy++) for (let i = 0; i < 3; i++) g.fillRect(x0 * P, (yy + 0.12 + i * 0.3) * P, rw * P, Math.max(1, 0.16 * P));
    else for (let xx = x0; xx < x0 + rw; xx++) for (let i = 0; i < 3; i++) g.fillRect((xx + 0.12 + i * 0.3) * P, y0 * P, Math.max(1, 0.16 * P), rh * P);
  }
  const map = new THREE.CanvasTexture(cv);
  map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8; map.generateMipmaps = true;
  map.minFilter = THREE.LinearMipmapLinearFilter; map.magFilter = THREE.LinearFilter;
  const jointTex = new THREE.DataTexture(joints, w, h, THREE.RedFormat);
  jointTex.magFilter = jointTex.minFilter = THREE.NearestFilter; jointTex.needsUpdate = true;
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.92, metalness: 0.04 });
  // Detalle de cerca: grano fino y juntas entre losetas (solo en aceras, plazas y suelos de baldosa).
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uJoint = { value: jointTex }; sh.uniforms.uSize = { value: new THREE.Vector2(w, h) };
    sh.vertexShader = 'varying vec3 vGW;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vGW = transformed;');
    sh.fragmentShader = 'varying vec3 vGW;\nuniform sampler2D uJoint;\nuniform vec2 uSize;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      vec2 gp = vGW.xz;
      float jn = texture2D(uJoint, (floor(gp) + 0.5) / uSize).r;
      vec2 fr = abs(fract(gp) - 0.5);
      float edge = smoothstep(0.46, 0.5, max(fr.x, fr.y)) * jn;
      float grain = fract(sin(dot(floor(gp * 9.0), vec2(12.9898, 78.233))) * 43758.5453);
      diffuseColor.rgb *= (0.94 + 0.08 * grain) * (1.0 - 0.28 * edge);`);
  };
  mat.customProgramCacheKey = () => 'vt-suelo-3d-1';
  const geo = new THREE.PlaneGeometry(w, h); geo.rotateX(-Math.PI / 2); geo.translate(w / 2, 0, h / 2);
  const mesh = new THREE.Mesh(geo, mat); mesh.name = 'suelo3d'; mesh.receiveShadow = false;
  own.push(map, jointTex, mat, geo);
  return mesh;
}

/** Mobiliario y objetos como volúmenes sencillos: [ancho, alto, color, brillo arriba]. */
const PROP: Record<string, [number, number, number, number?]> = {
  lamp: [0.12, 4.3, 0x24242c, 0xfff0c8], busstop: [0.9, 1.6, 0x3a4a5a], billboard: [0.9, 3.2, 0x2a2a34, 0xff3fa4], palm: [0.3, 3, 0x3a5a2a],
  plant: [0.5, 1, 0x2f6a3a], stall: [0.9, 1.4, 0x6a4a3a], tent: [0.9, 1.3, 0x5a3a5a], bench: [0.8, 0.45, 0x5a4636], hydrant: [0.25, 0.6, 0xb02020],
  vending: [0.7, 1.6, 0x2a3a6a, 0x43f3ff], antenna: [0.12, 3, 0x6a6a70], crane: [0.5, 6, 0xc8a020], column: [0.5, 2.5, 0x6a6a78], screen: [0.6, 2, 0x1a1a22, 0x43f3ff],
  planter: [0.8, 0.6, 0x4a4a52], trash: [0.5, 0.7, 0x2a3a2a], car: [0.9, 0.75, 0x3a3a48], wreck: [0.9, 0.6, 0x5a3a2a], dumpster: [0.9, 0.8, 0x2a4a3a],
  kiosk: [0.9, 1.4, 0x4a3a5a, 0xffbf00], crate: [0.6, 0.5, 0x7a5a38], barrel: [0.5, 0.7, 0x5a3a2a], jersey: [0.9, 0.6, 0x8a8a90], shelf: [0.9, 1.5, 0x5a4a3a],
  locker: [0.7, 1.6, 0x4a5a6a], fridge: [0.8, 1.5, 0xc8ccd8], arcade: [0.7, 1.4, 0x3a1a4a, 0xff3fa4], smokestack: [0.8, 3, 0x4a4040], monolith: [0.9, 4.5, 0x101018, 0x43f3ff],
  codewall: [0.9, 2.4, 0x07142a, 0x43f3ff], neonstrip: [0.15, 2.2, 0x1a1a22, 0xff3fa4], holo: [0.3, 1.8, 0x1a2a3a, 0x43f3ff],
};
const OBJ_COLOR: Record<string, number> = { vending: 0x2a3a6a, atm: 0x2a4a5a, terminal: 0x1a2a3a, computer: 0x22222a, bed: 0x5a4a6a, shop: 0x6a5a3a, marketterm: 0x2a3a5a, generator: 0x5a5a3a, crates: 0x7a5a38, trash: 0x2a3a2a };

export function buildScene3D(z: ZoneDef, cityActive: boolean, buildingH: number): Scene3D {
  const group = new THREE.Group(); group.name = 'escena-cercana';
  const own: { dispose(): void }[] = [];
  const grid = sceneGrid(z);
  group.add(ground(z, grid, own));
  // Altura de lo que hay en cada loseta (para que la cámara no atraviese nada).
  const heights = new Float32Array(z.width * z.height);
  const boxes: { x: number; y: number; w: number; d: number; h: number; c: number; y0?: number }[] = [];
  const cutWalls: typeof boxes = [];
  const rims: typeof boxes = [];
  const ceiling: typeof boxes = [];
  const glows: { x: number; y: number; w: number; d: number; h: number; c: number; y0: number }[] = [];
  const mark = (x: number, y: number, w: number, d: number, h: number) => {
    for (let yy = Math.floor(y); yy < Math.ceil(y + d); yy++) for (let xx = Math.floor(x); xx < Math.ceil(x + w); xx++)
      if (xx >= 0 && yy >= 0 && xx < z.width && yy < z.height) heights[yy * z.width + xx] = Math.max(heights[yy * z.width + xx], h);
  };
  for (const p of z.props) {
    if (z.kind === 'interior' && ['table','desk','shelf','bed','sofa','locker','fridge','bench','plant','planter','screen'].includes(p.type)) {
      const [x,y] = p.at, tint = p.color ? parseInt(p.color.slice(1),16) : undefined;
      const part = (dx: number, dy: number, w: number, d: number, y0: number, h: number, c: number) => boxes.push({ x: x+dx, y:y+dy, w,d,y0,h,c });
      const trim = 0x394555, light = 0xa8bdc5;
      if (p.type === 'shelf' || p.type === 'locker' || p.type === 'fridge') {
        part(.10,.13,.8,.68,0,1.85,tint ?? trim);
        part(.12,.11,.76,.022,.22,1.45,p.type === 'fridge' ? 0x546575 : 0x243140);
        for (let i=0;i<4;i++) {
          part(.11,.05,.78,.55,.34+i*.4,.044,light);
          if (p.type === 'shelf') for (let j=0;j<4;j++) part(.16+j*.174,.16,.125,.21,.39+i*.4,.14,[0xca8a48,0x527f91,0xa8b4ba,0x69394b][(i+j)%4]);
        }
        if (p.type !== 'shelf') part(.72,.07,.035,.05,1.13,.23,light);
        mark(x,y,1,1,1.85);
      } else if (p.type === 'plant' || p.type === 'planter') {
        part(.23,.2,.54,.55,0,.42,0x596670);
        for (let i=0;i<5;i++) part(.29+(i%3)*.14,.29+(i%2)*.24,.14,.14,.39,.35+(i%3)*.18,[0x316447,0x4b7359,0x547b41][i%3]);
      } else if (p.type === 'sofa' || p.type === 'bed') {
        part(.07,.12,.87,.75,0,.22,0x333a45); part(.09,.15,.83,.69,.22,.26,tint ?? 0x597780);
        part(.09,.67,.83,.17,.46,.32,tint ?? 0x46616d);
        if(p.type==='bed') part(.50,.6,.30,.23,.46,.09,light);
        else for (const xx of [.07,.84]) part(xx,.12,.11,.7,.34,.27,0x384959);
        mark(x,y,1,1,.78);
      } else if (p.type === 'screen') {
        part(.17,.48,.66,.065,1.32,.43,trim);
        glows.push({ x:x+.21,y:y+.46,w:.58,d:.018,h:.35,c:tint ?? 0x46cfff,y0:1.36 });
      } else {
        const end = p.type === 'bench' ? .49 : .85;
        for (const [dx,dy] of [[.13,.2],[.77,.2],[.13,.70],[.77,.70]]) part(dx,dy,.07,.07,0,end,trim);
        part(.10,.15,.82,.66,end,.08,tint ?? 0x758894);
        if (p.type==='desk') {
          part(.3,.51,.38,.06,.97,.27,trim);
          glows.push({ x:x+.33,y:y+.57,w:.31,d:.018,h:.21,c:0x59b8e2,y0:1 });
        }
        mark(x,y,1,1,end+.08);
      }
      continue;
    }
    const t = PROP[p.type]; if (!t) continue;
    const [s, hh, c, glow] = t, x = p.at[0] + 0.5 - s / 2, y = p.at[1] + 0.5 - s / 2;
    boxes.push({ x, y, w: s, d: s, h: hh, c });
    if (glow) glows.push(p.type === 'lamp' ? { x: x - 0.12, y: y - 0.12, w: 0.36, d: 0.36, h: 0.1, c: glow, y0: hh - 0.05 } : { x: x - 0.01, y: y - 0.01, w: s + 0.02, d: s + 0.02, h: hh * 0.35, c: glow, y0: hh * 0.45 });
    if (s >= 0.4) mark(x, y, s, s, hh);
  }
  for (const o of z.objects) if (OBJ_COLOR[o.kind] !== undefined) { boxes.push({ x: o.at[0] + 0.2, y: o.at[1] + 0.2, w: 0.6, d: 0.6, h: o.kind === 'bed' ? 0.55 : 1.5, c: OBJ_COLOR[o.kind] }); }
  for (const bl of z.blocks) { const h = bl.type === 'fence' ? 1.1 : bl.height; boxes.push({ x: bl.rect[0], y: bl.rect[1], w: bl.rect[2], d: bl.rect[3], h, c: bl.type === 'fence' ? 0x5a5a66 : 0x3a3a46 }); mark(bl.rect[0], bl.rect[1], bl.rect[2], bl.rect[3], h); }
  // Edificios: si no hay modelos 3D (o en interiores), prismas; si los hay, solo su altura para la cámara.
  z.buildings.forEach((b) => { const h = b.height * buildingH; if (!cityActive) boxes.push({ x: b.rect[0], y: b.rect[1], w: b.rect[2], d: b.rect[3], h, c: 0x2c2c3a }); mark(b.rect[0], b.rect[1], b.rect[2], b.rect[3], h); });
  if (z.kind === 'interior') {
    const W = z.width, H = z.height, col = parseInt((z.wallColor ?? '#394657').slice(1),16);
    const perimeter = (ax: number, ay: number, dx: number, dy: number, count: number, front: boolean) => {
      const segments = front ? cutWalls : boxes;
      const overlaps = z.doors.filter(d => edgeDirection(z, d.at)?.join(',') === [dy === 0 ? 0 : ax === 0 ? -1 : 1, dx === 0 ? 0 : ay === 0 ? -1 : 1].join(','));
      const openings = overlaps.map(d => (dx ? d.at[0] : d.at[1])+.5).sort((a,b)=>a-b);
      const slab = (from: number,to: number,h: number,y0=0) => {
        if (to <= from) return;
        const b = { x:ax+dx*from-.08*dy,y:ay+dy*from-.08*dx,w:dx?(to-from):.16,d:dy?(to-from):.16,h,y0,c:col };
        segments.push(b);
        if(front && y0===0) rims.push({ ...b, h:.27 });
      };
      let prev = 0;
      for(const at of openings) {
        slab(prev, at-.51, WALL_H);
        slab(at-.51,at+.51,WALL_H-1.96,1.96);
        prev=at+.51;
      }
      slab(prev,count,WALL_H);
    };
    perimeter(0,0,1,0,W,false); perimeter(0,H,1,0,W,true);
    perimeter(0,0,0,1,H,false); perimeter(W,0,0,1,H,true);
    for(let x=0;x<W;x++) {
      if(!grid.walk[x]) heights[x]=WALL_H;
      const i=(H-1)*W+x; if(!grid.walk[i]) heights[i]=WALL_H;
    }
    for(let y=0;y<H;y++) {
      const i=y*W; if(!grid.walk[i]) heights[i]=WALL_H;
      if(!grid.walk[i+W-1]) heights[i+W-1]=WALL_H;
    }
    for(const d of z.doors) if(d.signIcon==='subir'||d.signIcon==='bajar') {
      const [x,y]=d.at, normal=edgeDirection(z,d.at)??[0,-1], up=d.signIcon==='subir';
      for(let i=0;i<7;i++){
        const k=(i+.5)*.24, h=stairHeight(i,up);
        const cx=x+.5+normal[0]*(k-1.0), cy=y+.5+normal[1]*(k-1.0);
        const w=normal[0] ? .24 : 1.13, d=normal[1] ? .24 : 1.13;
        boxes.push({ x:cx-w/2,y:cy-d/2,w,d,h,c:0x627185 });
        glows.push({ x:cx-w/2+.04,y:cy-d/2+.04,w:w-.08,d:d-.08,h:.023,y0:h,c:i%2?0x5989ac:0x6ecde6 });
      }
    }
    // El techo es un forjado interior, con carriles de luz que siguen cada pasillo.
    ceiling.push({x:0,y:0,w:W,d:H,h:.16,y0:WALL_H+.02,c:col});
    for (let x=2;x<W-1;x+=4) ceiling.push({x,y:1,w:.14,d:H-2,h:.06,y0:WALL_H-.02,c:0xc4d9eb});
  }
  const unit = new THREE.BoxGeometry(1, 1, 1); own.push(unit);
  const inst = (list: typeof boxes, mat: THREE.Material) => {
    if (!list.length) return;
    const m = new THREE.InstancedMesh(unit, mat, list.length), o = new THREE.Object3D(), col = new THREE.Color();
    list.forEach((b, i) => { o.position.set(b.x + b.w / 2, (b.y0 ?? 0) + b.h / 2, b.y + b.d / 2); o.scale.set(b.w, b.h, b.d); o.updateMatrix(); m.setMatrixAt(i, o.matrix); m.setColorAt(i, col.setHex(b.c)); });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere(); group.add(m); own.push(m,mat); return m;
  };
  inst(boxes, new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.2 }));
  inst(glows, new THREE.MeshBasicMaterial({ toneMapped: false }));
  const fronts = inst(cutWalls,new THREE.MeshStandardMaterial({roughness:.78}));
  const lips = inst(rims,new THREE.MeshStandardMaterial({roughness:.8}));
  const slab = inst(ceiling,new THREE.MeshStandardMaterial({roughness:.82}));
  return { group, grid, heights, setCut(cut: boolean) {
    if(fronts) fronts.visible=!cut;
    if(lips) lips.visible=cut;
    if(slab) slab.visible=!cut;
  }, dispose: () => { for (const d of own) d.dispose(); } };
}

/** Cielo: degradado de día o de noche (en los interiores, un techo oscuro). */
export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uTop; uniform vec3 uHorizon; varying vec3 vD; void main(){ float k = smoothstep(-0.05, 0.6, vD.y); gl_FragColor = vec4(mix(uHorizon, uTop, k), 1.0); }',
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), mat); // (se escala a la distancia de dibujado)
  mesh.renderOrder = -10; mesh.frustumCulled = false; mesh.name = 'cielo';
  // v0.40 · El horizonte es la boina de contaminación: de día, una calima parda; de noche, una niebla morada teñida de neón.
  // La niebla de la distancia de dibujado usa este mismo color, así que lo lejano se funde con el cielo.
  const day = { top: new THREE.Color(0x5a86c0), hor: new THREE.Color(0xa69c8c) }, night = { top: new THREE.Color(0x05060e), hor: new THREE.Color(0x3a2040) };
  const indoor = new THREE.Color(0x0c0b12);
  return {
    mesh,
    set(daylight: number, interior: boolean) {
      if (interior) { mat.uniforms.uTop.value.copy(indoor); mat.uniforms.uHorizon.value.copy(indoor); return indoor; }
      mat.uniforms.uTop.value.copy(night.top).lerp(day.top, daylight);
      mat.uniforms.uHorizon.value.copy(night.hor).lerp(day.hor, daylight);
      return mat.uniforms.uHorizon.value as THREE.Color;
    },
  };
}
