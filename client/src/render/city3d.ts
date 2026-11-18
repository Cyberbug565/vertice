// v0.14 · Ciudad en 3D con los edificios de Kenney «City Kit Commercial» (CC0 1.0, www.kenney.nl).
// Cada manzana del mapa se rellena con varios edificios del kit (los bajos y medianos en rejilla, las torres con un
// rascacielos ajustado a su planta), teñidos con el color de la manzana para darles aire de neón. Se dibujan con
// instancias agrupadas por modelo y por trozo de mapa (así la tarjeta solo pinta lo que ve) y se pueden atenuar uno a
// uno cuando tapan al jugador. Ocupan ~3,5 MB y se cargan una sola vez.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { hashString, seededRng, type ZoneDef } from '@vertice/shared';
import { NeonBuilder, neonClock, neonNight, shape, SHAPES } from './neon3d';

const LOW = ['building-a', 'building-b', 'building-c', 'building-d', 'building-e', 'building-h', 'building-k'];
const MID = ['building-f', 'building-g', 'building-i', 'building-j', 'building-l', 'building-m', 'building-n'];
const SKY = ['building-skyscraper-a', 'building-skyscraper-b', 'building-skyscraper-c', 'building-skyscraper-d', 'building-skyscraper-e'];
/** Versiones ligeras (unos 200 vértices) para el interior de las manzanas, que casi no se ve. */
const LOD = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'i', 'j', 'k', 'l', 'm'].map((k) => `low-detail-building-${k}`);
const CHUNK = 48;
/** v0.16 · Escala de los módulos del kit con la que una puerta (≈0,3 del modelo) mide ~1,5 personas. */
const DOOR_S = 5.2;

/** `wall`: caja de las paredes de verdad (vértices entre el 20 % y el 85 % de la altura, sin toldos ni remates), para
 *  pegar el neón a la fachada y no al borde de la manzana. */
interface KModel { geo: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial; fx: number; fz: number; my: number; cx: number; cz: number; wall: { x0: number; x1: number; z0: number; z1: number } }
let loading: Promise<Map<string, KModel>> | null = null;
/** Carga (una vez) los modelos del kit; la geometría queda con el suelo en y = 0 y centrada. */
function loadKit(): Promise<Map<string, KModel>> {
  if (loading) return loading;
  const loader = new GLTFLoader();
  loading = Promise.all([...LOW, ...MID, ...SKY, ...LOD].map((name) => loader.loadAsync(`/models/kenney/${name}.glb`).then((g) => {
    let mesh: THREE.Mesh | null = null;
    g.scene.updateMatrixWorld(true);
    g.scene.traverse((o) => { if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh; });
    if (!mesh) throw new Error(`sin malla en ${name}`);
    const m = mesh as THREE.Mesh;
    const geo = (m.geometry as THREE.BufferGeometry).clone().applyMatrix4(m.matrixWorld);
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
    if (mat.map) { mat.map.magFilter = THREE.NearestFilter; mat.map.anisotropy = 4; }
    litWindows(mat);
    const pos = geo.getAttribute('position'); const wall = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
    const ylo = bb.min.y + (bb.max.y - bb.min.y) * 0.2, yhi = bb.min.y + (bb.max.y - bb.min.y) * 0.85;
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y < ylo || y > yhi) continue; const x = pos.getX(i), z = pos.getZ(i); wall.x0 = Math.min(wall.x0, x); wall.x1 = Math.max(wall.x1, x); wall.z0 = Math.min(wall.z0, z); wall.z1 = Math.max(wall.z1, z); }
    if (!Number.isFinite(wall.x0)) Object.assign(wall, { x0: bb.min.x, x1: bb.max.x, z0: bb.min.z, z1: bb.max.z });
    return [name, { wall, geo, mat, fx: bb.max.x - bb.min.x, fz: bb.max.z - bb.min.z, my: bb.max.y - bb.min.y, cx: (bb.max.x + bb.min.x) / 2, cz: (bb.max.z + bb.min.z) / 2 }] as const;
  }))).then((list) => new Map(list));
  return loading;
}

/** v0.15 · Altura de las megatorras del centro (Cénit), o 0 si el edificio no lo es. La usan también las fachadas 2D
 *  invisibles que deciden cuándo atenuar un edificio, para que cuadren con el volumen 3D. */
export function megaHeight(z: ZoneDef, b: ZoneDef['buildings'][number]): number {
  const c = (z as any).districts?.find((d: { id: string }) => d.id === 'cenit')?.rect as [number, number, number, number] | undefined;
  if (!c || z.kind !== 'exterior') return 0;
  const [x, y, w, h] = b.rect, mx = x + w / 2, my = y + h / 2, H = b.height * 1.35;
  if (mx < c[0] || mx >= c[0] + c[2] || my < c[1] || my >= c[1] + c[3] || H < 12 || Math.min(w, h) < 3) return 0;
  const r = seededRng(hashString(b.id) + 991);
  return Math.min(170, Math.max(H * 1.6, 42 + r() * 40));
}
/** v0.15 · Cuánto es de noche (0–1): enciende las ventanas. */
const cityNight = { value: 0 };
export function setCityNight(k: number) { cityNight.value = k; neonNight.value = k; }
/** Ventanas encendidas de noche: los cristales azules de la textura del kit brillan en cálido (o en azul frío), cada
 *  ventana a su aire (unas sí y otras no), según su posición en el mundo. */
function litWindows(m: THREE.Material) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = cityNight;
    sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  vWP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`);
    sh.fragmentShader = 'varying vec3 vWP;\nuniform float uNight;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
#ifdef USE_MAP
  if (uNight > 0.01) {
    vec3 tx = texture2D(map, vMapUv).rgb;
    float win = smoothstep(0.25, 0.36, tx.b - tx.r);
    vec3 cell = floor(vWP * vec3(1.1, 0.74, 1.1));
    float rr = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    vec3 wc = rr > 0.82 ? vec3(0.35, 0.8, 1.0) : rr > 0.74 ? vec3(1.0, 0.35, 0.85) : vec3(1.0, 0.76, 0.42);
    totalEmissiveRadiance += win * step(0.42, rr) * uNight * wc * 1.5;
  }
#endif`);
  };
  m.customProgramCacheKey = () => 'vt-ventanas-1';
}
/** Avanza el neón (una vez por fotograma). */
export function tickNeon(t: number) { neonClock.value = t; }

interface Cell { solid: THREE.InstancedMesh; ghost: THREE.InstancedMesh; i: number; m: THREE.Matrix4 }
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class City3D {
  readonly group = new THREE.Group();
  kit: Map<string, KModel> | null = null;
  active = false;
  /** Se llama cuando el kit termina de cargar (para reconstruir la zona actual). */
  onReady: (() => void) | null = null;
  private cells: Cell[][] = [];
  private state: number[] = [];
  private owned: THREE.Material[] = [];
  private zone: ZoneDef | null = null;
  private neonFade: ((i: number, mode: 0 | 1 | 2) => void) | null = null;
  private neonTex: THREE.Texture | null = null;

  constructor() {
    loadKit().then((kit) => { this.kit = kit; if (this.zone) this.build(this.zone); this.onReady?.(); }).catch((err) => console.warn('[ciudad 3D]', err));
  }

  /** Construye la ciudad de la zona (solo exteriores). Devuelve si los edificios van en 3D. */
  build(z: ZoneDef, quality: 'low' | 'high' = 'high'): boolean {
    this.clear();
    this.zone = z;
    if (!this.kit || z.kind !== 'exterior' || !z.buildings.length) { this.active = false; return false; }
    const groups = new Map<string, { model: string; items: { m: THREE.Matrix4; c: THREE.Color; b: number }[] }>();
    /** Módulos colocados (para el neón): modelo, matriz, escalas, base y qué fachadas ve la cámara. */
    const placed: { b: number; k: KModel; m: THREE.Matrix4; s: number; sy: number; y0: number; front: boolean; mega: boolean; last: boolean; fx: boolean; fz: boolean }[] = [];
    const add = (b: number, model: string, x: number, y: number, w: number, d: number, Hgoal: number, rot: number, tint: THREE.Color, maxStretch: number, y0 = 0, minStretch = 0.6) => {
      const k = this.kit!.get(model)!;
      const turned = rot !== 0;
      const fx = turned ? k.fz : k.fx, fz = turned ? k.fx : k.fz;
      const s = Math.min(w / fx, d / fz) * 0.96;
      const sy = s * Math.min(maxStretch, Math.max(minStretch, Hgoal / (k.my * s)));
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
      // Centro del modelo (rotado y escalado) sobre el centro de la celda.
      const off = new THREE.Vector3(-k.cx * s, 0, -k.cz * s).applyQuaternion(q);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x + w / 2 + off.x, y0, y + d / 2 + off.z), q, new THREE.Vector3(s, sy, s));
      const key = `${model}|${Math.floor((x + w / 2) / CHUNK)},${Math.floor((y + d / 2) / CHUNK)}`;
      const g = groups.get(key) ?? groups.set(key, { model, items: [] }).get(key)!;
      g.items.push({ m, c: tint, b });
      placed.push({ b, k, m, s, sy, y0, front: minStretch >= 0.85 || maxStretch >= 3.2, mega: false, last: false, fx: true, fz: true });
      return k.my * sy; // altura real que ha quedado
    };
    const white = new THREE.Color(1, 1, 1);
    const heights: number[] = z.buildings.map((b) => b.height * 1.35);
    z.buildings.forEach((b, bi) => {
      const [x0, y0, w, h] = b.rect;
      const H = b.height * 1.35;
      const rng = seededRng(hashString(b.id));
      // Tinte de la manzana: su color mezclado con blanco (el kit es casi blanco y así toma el tono del barrio).
      const base = new THREE.Color(b.color ?? '#8a8aa0');
      const tint = base.clone().lerp(white, 0.22 + rng() * 0.14);
      const rot = () => (rng() < 0.5 ? 0 : Math.PI / 2); // de cara a la calle que ve la cámara (+z o +x)
      // v0.15 · Centro (Cénit): megatorres modernas y escalonadas, mucho más altas, con corona de neón y aguja.
      const Ht = megaHeight(z, b);
      if (Ht) {
        const parts = Ht > 90 ? 3 : 2;
        let y = 0, ix = x0, iy = y0, iw = w, ih = h;
        for (let p = 0; p < parts; p++) {
          const seg = p === parts - 1 ? Ht - y : Ht * (p === 0 ? 0.5 : 0.3);
          const got = add(bi, SKY[Math.floor(rng() * SKY.length)], ix, iy, iw, ih, seg, 0, tint.clone().multiplyScalar(0.85 + 0.1 * p), 4, y);
          y += Math.min(seg, got);
          Object.assign(placed[placed.length - 1], { mega: true, last: p === parts - 1 });
          // Retranqueo: cada tramo es más estrecho que el anterior.
          const k = 0.72; ix += (iw * (1 - k)) / 2; iy += (ih * (1 - k)) / 2; iw *= k; ih *= k;
        }
        heights[bi] = y;
      } else if (H >= 16) {
        // Torres: uno o varios rascacielos a lo largo del lado largo, estirados hasta su altura (con tope).
        const n = Math.max(1, Math.min(4, Math.round(Math.max(w, h) / Math.max(6.5, Math.min(w, h)))));
        for (let i = 0; i < n; i++) {
          const cw = w >= h ? w / n : w, ch = w >= h ? h : h / n;
          const cx = w >= h ? x0 + i * cw : x0, cy = w >= h ? y0 : y0 + i * ch;
          add(bi, SKY[Math.floor(rng() * SKY.length)], cx, cy, cw, ch, H * (0.85 + rng() * 0.15), 0, tint, 3.2);
        }
      } else {
        // v0.16 · Bajos y medianos a escala de las personas: cada módulo del kit se pone a una escala fija (DOOR_S) con
        // la que su puerta mide algo más que una persona, así que una manzana lleva pocos módulos grandes (antes eran
        // muchos de 2,5 casillas con puertas de la mitad de la altura de un transeúnte). De los modelos se elige el que
        // mejor encaja en la celda y en la altura de la manzana, y casi no se estira (para no deformar puertas).
        const cols = Math.max(1, Math.round(w / DOOR_S)), rows = Math.max(1, Math.round(h / DOOR_S));
        const cw = w / cols, ch = h / rows;
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
          const t2 = tint.clone().multiplyScalar(0.92 + rng() * 0.16);
          // Solo las celdas de los lados que ve la cámara (+x y +y) llevan el modelo detallado.
          const front = quality === 'high' && (i === cols - 1 || j === rows - 1);
          const Hgoal = H * (0.75 + rng() * 0.4);
          const r0 = front ? rot() : 0;
          const score = (name: string) => {
            const k = this.kit!.get(name)!; const t = r0 !== 0;
            const sc = Math.min(cw / (t ? k.fz : k.fx), ch / (t ? k.fx : k.fz)) * 0.96;
            return Math.abs(Math.log(sc / DOOR_S)) * 2 + Math.abs(Math.log((k.my * sc) / Hgoal)) + rng() * 0.25;
          };
          const pool = front ? [...LOW, ...MID] : LOD;
          const model = pool.map((n) => [n, score(n)] as const).sort((a, b) => a[1] - b[1])[0][0];
          add(bi, model, x0 + i * cw, y0 + j * ch, cw, ch, Hgoal, r0, t2, front ? 1.3 : 3.5, 0, front ? 0.85 : 0.6);
          Object.assign(placed[placed.length - 1], { front, fx: i === cols - 1, fz: j === rows - 1 });
        }
      }
    });
    this.cells = z.buildings.map(() => []);
    this.state = z.buildings.map(() => 0);
    // v0.16 · Neón pegado a las paredes reales de cada módulo (ver neon3d.ts).
    const nb = new NeonBuilder(CHUNK);
    for (const it of placed) if (it.front) this.decorate(nb, z, it);
    const neon = nb.build(z.buildings.length, quality);
    for (const m of neon.meshes) this.group.add(m);
    this.owned.push(...neon.materials); this.neonTex = neon.texture; this.neonFade = neon.setFade;
    for (const g of groups.values()) {
      const k = this.kit.get(g.model)!;
      const solidMat = k.mat;
      const ghostMat = k.mat.clone(); litWindows(ghostMat); ghostMat.transparent = true; ghostMat.opacity = 0.2; this.owned.push(ghostMat); // escribe profundidad: el fantasma se tapa a sí mismo (sin efecto rayos X)
      const solid = new THREE.InstancedMesh(k.geo, solidMat, g.items.length);
      const ghost = new THREE.InstancedMesh(k.geo, ghostMat, g.items.length);
      g.items.forEach((it, i) => { solid.setMatrixAt(i, it.m); solid.setColorAt(i, it.c); ghost.setMatrixAt(i, ZERO); ghost.setColorAt(i, it.c); this.cells[it.b].push({ solid, ghost, i, m: it.m }); });
      for (const im of [solid, ghost]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.computeBoundingSphere(); }
      // La esfera del fantasma se calcula con las matrices de verdad (vacías no servirían para recortar).
      ghost.boundingSphere = solid.boundingSphere!.clone();
      this.group.add(solid, ghost);
    }
    this.active = true;
    return true;
  }

  /** Neón de un módulo: aristas y cornisa que siguen sus paredes, marco del escaparate, letrero con forma y, en las torres,
   *  coronas, franjas y aguja con baliza. Cada pieza va a 5–6 cm de la pared, nunca en el aire. */
  private decorate(nb: NeonBuilder, z: ZoneDef, it: { b: number; k: KModel; m: THREE.Matrix4; s: number; sy: number; y0: number; mega: boolean; last: boolean; fx: boolean; fz: boolean }) {
    const bdef = z.buildings[it.b];
    const rnd = seededRng(hashString(bdef.id) * 7 + Math.round(it.m.elements[12] * 13 + it.m.elements[14] * 7 + it.y0));
    const V3 = (x: number, y: number, zz: number) => new THREE.Vector3(x, y, zz);
    const w = it.k.wall;
    const cs = [V3(w.x0, 0, w.z0), V3(w.x1, 0, w.z0), V3(w.x0, 0, w.z1), V3(w.x1, 0, w.z1)].map((p) => p.applyMatrix4(it.m));
    const X0 = Math.min(...cs.map((p) => p.x)), X1 = Math.max(...cs.map((p) => p.x)), Z0 = Math.min(...cs.map((p) => p.z)), Z1 = Math.max(...cs.map((p) => p.z));
    const base = it.y0, top = it.y0 + it.k.my * it.sy * 0.97, floor = 0.42 * it.s * (it.sy / it.s);
    const PAL = ['#ff2bd6', '#43f3ff', '#ffd23f', '#7a5cff', '#39ff9a', '#ff5a3c', '#ff7ad9', '#5ad1ff'];
    const pick = () => new THREE.Color(PAL[Math.floor(rnd() * PAL.length)]).multiplyScalar(1.35);
    const c1 = new THREE.Color(bdef.signColor ?? bdef.color ?? '#43f3ff').multiplyScalar(1.4), c2 = pick();
    const e = 0.055; // separación de la pared
    const T = (pts: THREE.Vector3[], color: THREE.Color, o: { closed?: boolean; smooth?: boolean; r?: number } = {}) => nb.tube(pts, { color, b: it.b, ph: rnd(), ...o });
    // Fachadas que ve la cámara: +z (de X0 a X1) y +x (de Z1 a Z0).
    const faces: { o: THREE.Vector3; u: THREE.Vector3; len: number; n: THREE.Vector3 }[] = [];
    if (it.fz) faces.push({ o: V3(X0, 0, Z1 + e), u: V3(1, 0, 0), len: X1 - X0, n: V3(0, 0, 1) });
    if (it.fx) faces.push({ o: V3(X1 + e, 0, Z1), u: V3(0, 0, -1), len: Z1 - Z0, n: V3(1, 0, 0) });
    const onFace = (f: typeof faces[number], u: number, v: number) => f.o.clone().addScaledVector(f.u, u).setY(base + v);
    const tower = it.k.my * it.sy > 14 || it.mega;
    // Aristas verticales en las esquinas que ve la cámara.
    if (tower || rnd() < 0.55) {
      const from = base + floor * (tower ? 0.1 : 0.95), to = top - 0.1;
      T([V3(X1 + e, from, Z1 + e), V3(X1 + e, to, Z1 + e)], c1, { r: tower ? 0.07 : 0.05 });
      if (tower) { T([V3(X0 - e, from, Z1 + e), V3(X0 - e, to, Z1 + e)], c2); T([V3(X1 + e, from, Z0 - e), V3(X1 + e, to, Z0 - e)], c2); }
    }
    // Cornisa: sigue el borde del tejado por las fachadas visibles (o la rodea entera en las torres, como una corona).
    if (tower) {
      for (const dy of it.mega ? [0.12, 1.7] : [0.12]) {
        const y = top - dy, rr = 0.25;
        const ring: THREE.Vector3[] = [];
        for (const [cx, cz, a0] of [[X1 - rr, Z1 - rr, 0], [X0 + rr, Z1 - rr, Math.PI / 2], [X0 + rr, Z0 + rr, Math.PI], [X1 - rr, Z0 + rr, Math.PI * 1.5]] as const)
          for (let k = 0; k <= 4; k++) { const a = a0 + (k / 4) * (Math.PI / 2); ring.push(V3(cx + Math.cos(a) * (rr + e), y, cz + Math.sin(a) * (rr + e))); }
        T(ring, dy > 1 ? c2 : c1, { closed: true, r: 0.075 });
      }
      // Franjas verticales por la fachada (la mitad de las torres).
      if (rnd() < 0.5) for (const f of faces) for (const u of [0.33, 0.67]) T([onFace(f, f.len * u, floor), onFace(f, f.len * u, top - base - 1.0)], c2, { r: 0.04 });
      if (it.last) {
        // Aguja con baliza roja.
        const cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2, sh = 6 + rnd() * 10;
        T([V3(cx, top, cz), V3(cx, top + sh, cz)], new THREE.Color(0.8, 0.85, 0.95), { r: 0.06 });
        T([V3(cx - 0.2, top + sh + 0.2, cz), V3(cx + 0.2, top + sh + 0.2, cz)], new THREE.Color(2.4, 0.12, 0.08), { r: 0.22 });
      }
    } else if (rnd() < 0.5) {
      const y = top - 0.1;
      const pts: THREE.Vector3[] = [];
      if (it.fz) pts.push(V3(X0, y, Z1 + e), V3(X1 + e, y, Z1 + e));
      if (it.fx) { if (!pts.length) pts.push(V3(X1 + e, y, Z1 + e)); pts.push(V3(X1 + e, y, Z0)); }
      if (pts.length >= 2) T(pts, c1, { r: 0.045 });
    }
    // Marco del escaparate en la planta baja, con esquinas redondeadas y su luz en la pared.
    for (const f of faces) {
      if (f.len < 2 || rnd() > 0.55) continue;
      const u0 = f.len * 0.12, u1 = f.len * 0.88, v0 = 0.14, v1 = Math.min(floor * 0.92, 2.6), rr = 0.22;
      const pts: THREE.Vector3[] = [];
      for (const [cu, cv, a0] of [[u1 - rr, v0 + rr, -Math.PI / 2], [u1 - rr, v1 - rr, 0], [u0 + rr, v1 - rr, Math.PI / 2], [u0 + rr, v0 + rr, Math.PI]] as const)
        for (let k = 0; k <= 3; k++) { const a = a0 + (k / 3) * (Math.PI / 2); pts.push(onFace(f, cu + Math.cos(a) * rr, cv + Math.sin(a) * rr)); }
      const col = rnd() < 0.5 ? c1 : c2;
      T(pts, col, { closed: true, r: 0.04 });
      nb.spill(onFace(f, f.len / 2, (v0 + v1) / 2), f.n, (u1 - u0) * 1.25, (v1 - v0) * 1.5, { color: col, b: it.b, ph: rnd() });
    }
    // Letrero con forma en la fachada, por encima de la planta baja.
    const room = top - base - floor * 1.15 - 0.4;
    if (!tower && room > 0.9 && faces.length && rnd() < 0.7) {
      const f = faces[Math.floor(rnd() * faces.length)];
      const kind = SHAPES[Math.floor(rnd() * SHAPES.length)];
      const sw = Math.min(f.len * 0.7, kind === 'letras' || kind === 'onda' || kind === 'galones' ? 3.4 : 1.9), sh = Math.min(room, kind === 'letras' ? 1.0 : kind === 'onda' ? 0.8 : 1.7);
      const u0 = (f.len - sw) * (0.2 + rnd() * 0.6), v0 = floor * 1.15 + (room - sh) * rnd();
      const col = rnd() < 0.6 ? c2 : c1;
      for (const line of shape(kind, rnd)) T(line.pts.map(([u, v]) => onFace(f, u0 + u * sw, v0 + v * sh)), col, { closed: line.closed, smooth: line.smooth, r: 0.045 });
      nb.spill(onFace(f, u0 + sw / 2, v0 + sh / 2), f.n, sw * 1.6, sh * 1.8, { color: col, b: it.b, ph: rnd() });
    }
  }

  /** 0 = normal, 1 = translúcido (tapa al jugador), 2 = oculto (cámara muy cerca). */
  setFaded(i: number, mode: 0 | 1 | 2) {
    if (!this.active || this.state[i] === mode) return;
    this.state[i] = mode;
    this.neonFade?.(i, mode === 0 ? 2 : 0); // v0.19: el neón de un edificio transparente se apaga (si no, llena la pantalla de rayas)
    for (const c of this.cells[i] ?? []) {
      c.solid.setMatrixAt(c.i, mode === 0 ? c.m : ZERO);
      c.ghost.setMatrixAt(c.i, mode === 1 ? c.m : ZERO);
      c.solid.instanceMatrix.needsUpdate = true; c.ghost.instanceMatrix.needsUpdate = true;
    }
  }

  clear() {
    for (const o of [...this.group.children]) { this.group.remove(o); (o as THREE.InstancedMesh).dispose?.(); }
    for (const m of this.owned) m.dispose();
    this.neonTex?.dispose(); this.neonTex = null; this.neonFade = null;
    this.owned = []; this.cells = []; this.state = []; this.active = false;
  }
}
