// v0.39 · Lo que hace falta para mirar la ciudad desde cerca (cámaras en tercera y primera persona): en la vista cenital el
// suelo, el mobiliario y los muros de los interiores los pinta Pixi en 2D isométrico; aquí se levantan en 3D a partir de la
// misma definición de la zona. Unidades: 1 = una loseta; x y z del mundo 3D son x e y de la rejilla.
import * as THREE from 'three';
import { GROUND_TYPES, buildZoneGrid, hashString, type ZoneDef, type ZoneGrid } from '@vertice/shared';
import { GROUND } from './art';

/** Altura de los muros de los interiores (una persona mide ~1,5). */
export const WALL_H = 2.7;
/** Suelos con baldosas o tablones: se les marca la junta de cada loseta. */
const JOINTED = new Set(['sidewalk', 'tile', 'plaza', 'market', 'metal', 'deck', 'wood', 'bridge']);

export interface Scene3D { group: THREE.Group; grid: ZoneGrid; heights: Float32Array; dispose(): void }

/** Suelo: una textura con un píxel por trozo de loseta (y las franjas de los pasos de cebra), más un mapa de juntas. */
function ground(z: ZoneDef, grid: ZoneGrid, own: { dispose(): void }[]) {
  const w = z.width, h = z.height;
  const P = Math.max(2, Math.min(16, Math.floor(4096 / Math.max(w, h)))); // píxeles por loseta
  const cv = document.createElement('canvas'); cv.width = w * P; cv.height = h * P;
  const g = cv.getContext('2d')!;
  const joints = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const type = GROUND_TYPES[grid.ground[y * w + x]];
    const v = 0.92 + ((hashString(`${x},${y}`) % 1000) / 1000) * 0.14;
    const c = GROUND[type] ?? 0x202028;
    const r = Math.min(255, ((c >> 16) & 255) * v), gg = Math.min(255, ((c >> 8) & 255) * v), b = Math.min(255, (c & 255) * v);
    g.fillStyle = `rgb(${r | 0},${gg | 0},${b | 0})`; g.fillRect(x * P, y * P, P, P);
    if (JOINTED.has(type)) joints[y * w + x] = 255;
  }
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
    sh.vertexShader = 'varying vec3 vGW;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
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
  const grid = buildZoneGrid(z);
  group.add(ground(z, grid, own));
  // Altura de lo que hay en cada loseta (para que la cámara no atraviese nada).
  const heights = new Float32Array(z.width * z.height);
  const boxes: { x: number; y: number; w: number; d: number; h: number; c: number; y0?: number }[] = [];
  const glows: { x: number; y: number; w: number; d: number; h: number; c: number; y0: number }[] = [];
  const mark = (x: number, y: number, w: number, d: number, h: number) => {
    for (let yy = Math.floor(y); yy < Math.ceil(y + d); yy++) for (let xx = Math.floor(x); xx < Math.ceil(x + w); xx++)
      if (xx >= 0 && yy >= 0 && xx < z.width && yy < z.height) heights[yy * z.width + xx] = Math.max(heights[yy * z.width + xx], h);
  };
  for (const p of z.props) {
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
  // Interiores: muros en cada casilla que no se pisa (y no tiene otra cosa) y linda con suelo transitable.
  if (z.kind !== 'exterior') {
    const W = z.width, H = z.height, walk = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && grid.walk[y * W + x] === 1;
    const used = new Uint8Array(W * H);
    for (const o of z.objects) used[o.at[1] * W + o.at[0]] = 1;
    for (const p of z.props) used[p.at[1] * W + p.at[0]] = 1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (grid.walk[i] || used[i] || heights[i] > 0 || grid.buildingAt[i] >= 0) continue;
      if (!(walk(x - 1, y) || walk(x + 1, y) || walk(x, y - 1) || walk(x, y + 1) || walk(x - 1, y - 1) || walk(x + 1, y + 1) || walk(x - 1, y + 1) || walk(x + 1, y - 1))) continue;
      boxes.push({ x, y, w: 1, d: 1, h: WALL_H, c: (x + y) % 7 === 0 ? 0x3a3448 : 0x2e2a3a }); heights[i] = WALL_H;
    }
  }
  const unit = new THREE.BoxGeometry(1, 1, 1); own.push(unit);
  const inst = (list: typeof boxes, mat: THREE.Material) => {
    if (!list.length) return;
    const m = new THREE.InstancedMesh(unit, mat, list.length), o = new THREE.Object3D(), col = new THREE.Color();
    list.forEach((b, i) => { o.position.set(b.x + b.w / 2, (b.y0 ?? 0) + b.h / 2, b.y + b.d / 2); o.scale.set(b.w, b.h, b.d); o.updateMatrix(); m.setMatrixAt(i, o.matrix); m.setColorAt(i, col.setHex(b.c)); });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere(); group.add(m); own.push(mat);
  };
  inst(boxes, new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.2 }));
  inst(glows, new THREE.MeshBasicMaterial({ toneMapped: false }));
  return { group, grid, heights, dispose: () => { for (const d of own) d.dispose(); } };
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
