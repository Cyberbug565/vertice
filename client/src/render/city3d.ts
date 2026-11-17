// v0.14 · Ciudad en 3D con los edificios de Kenney «City Kit Commercial» (CC0 1.0, www.kenney.nl).
// Cada manzana del mapa se rellena con varios edificios del kit (los bajos y medianos en rejilla, las torres con un
// rascacielos ajustado a su planta), teñidos con el color de la manzana para darles aire de neón. Se dibujan con
// instancias agrupadas por modelo y por trozo de mapa (así la tarjeta solo pinta lo que ve) y se pueden atenuar uno a
// uno cuando tapan al jugador. Ocupan ~3,5 MB y se cargan una sola vez.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { hashString, seededRng, type ZoneDef } from '@vertice/shared';

const LOW = ['building-a', 'building-b', 'building-c', 'building-d', 'building-e', 'building-h', 'building-k'];
const MID = ['building-f', 'building-g', 'building-i', 'building-j', 'building-l', 'building-m', 'building-n'];
const SKY = ['building-skyscraper-a', 'building-skyscraper-b', 'building-skyscraper-c', 'building-skyscraper-d', 'building-skyscraper-e'];
/** Versiones ligeras (unos 200 vértices) para el interior de las manzanas, que casi no se ve. */
const LOD = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'i', 'j', 'k', 'l', 'm'].map((k) => `low-detail-building-${k}`);
const CHUNK = 48;

interface KModel { geo: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial; fx: number; fz: number; my: number; cx: number; cz: number }
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
    return [name, { geo, mat, fx: bb.max.x - bb.min.x, fz: bb.max.z - bb.min.z, my: bb.max.y - bb.min.y, cx: (bb.max.x + bb.min.x) / 2, cz: (bb.max.z + bb.min.z) / 2 }] as const;
  }))).then((list) => new Map(list));
  return loading;
}

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

  constructor() {
    loadKit().then((kit) => { this.kit = kit; if (this.zone) this.build(this.zone); this.onReady?.(); }).catch((err) => console.warn('[ciudad 3D]', err));
  }

  /** Construye la ciudad de la zona (solo exteriores). Devuelve si los edificios van en 3D. */
  build(z: ZoneDef, quality: 'low' | 'high' = 'high'): boolean {
    this.clear();
    this.zone = z;
    if (!this.kit || z.kind !== 'exterior' || !z.buildings.length) { this.active = false; return false; }
    const groups = new Map<string, { model: string; items: { m: THREE.Matrix4; c: THREE.Color; b: number }[] }>();
    const add = (b: number, model: string, x: number, y: number, w: number, d: number, Hgoal: number, rot: number, tint: THREE.Color, maxStretch: number) => {
      const k = this.kit!.get(model)!;
      const turned = rot !== 0;
      const fx = turned ? k.fz : k.fx, fz = turned ? k.fx : k.fz;
      const s = Math.min(w / fx, d / fz) * 0.96;
      const sy = s * Math.min(maxStretch, Math.max(0.6, Hgoal / (k.my * s)));
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
      // Centro del modelo (rotado y escalado) sobre el centro de la celda.
      const off = new THREE.Vector3(-k.cx * s, 0, -k.cz * s).applyQuaternion(q);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x + w / 2 + off.x, 0, y + d / 2 + off.z), q, new THREE.Vector3(s, sy, s));
      const key = `${model}|${Math.floor((x + w / 2) / CHUNK)},${Math.floor((y + d / 2) / CHUNK)}`;
      const g = groups.get(key) ?? groups.set(key, { model, items: [] }).get(key)!;
      g.items.push({ m, c: tint, b });
    };
    const white = new THREE.Color(1, 1, 1);
    z.buildings.forEach((b, bi) => {
      const [x0, y0, w, h] = b.rect;
      const H = b.height * 1.35;
      const rng = seededRng(hashString(b.id));
      // Tinte de la manzana: su color mezclado con blanco (el kit es casi blanco y así toma el tono del barrio).
      const base = new THREE.Color(b.color ?? '#8a8aa0');
      const tint = base.clone().lerp(white, 0.22 + rng() * 0.14);
      const rot = () => (rng() < 0.5 ? 0 : Math.PI / 2); // de cara a la calle que ve la cámara (+z o +x)
      if (H >= 16) {
        // Torres: uno o varios rascacielos a lo largo del lado largo, estirados hasta su altura (con tope).
        const n = Math.max(1, Math.min(4, Math.round(Math.max(w, h) / Math.max(1, Math.min(w, h)))));
        for (let i = 0; i < n; i++) {
          const cw = w >= h ? w / n : w, ch = w >= h ? h : h / n;
          const cx = w >= h ? x0 + i * cw : x0, cy = w >= h ? y0 : y0 + i * ch;
          add(bi, SKY[Math.floor(rng() * SKY.length)], cx, cy, cw, ch, H * (0.85 + rng() * 0.15), 0, tint, 3.2);
        }
      } else {
        // Bajos y medianos: rejilla de edificios del kit de unas 2,5 casillas, de alturas variadas.
        const cols = Math.max(1, Math.round(w / 2.5)), rows = Math.max(1, Math.round(h / 2.5));
        const cw = w / cols, ch = h / rows;
        const pool = H < 9 ? LOW : MID;
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
          const t2 = tint.clone().multiplyScalar(0.92 + rng() * 0.16);
          // Solo las celdas de los lados que ve la cámara (+x y +y) llevan el modelo detallado.
          const front = quality === 'high' && (i === cols - 1 || j === rows - 1);
          const model = front ? pool[Math.floor(rng() * pool.length)] : LOD[Math.floor(rng() * LOD.length)];
          add(bi, model, x0 + i * cw, y0 + j * ch, cw, ch, H * (0.7 + rng() * 0.45), front ? rot() : 0, t2, front ? 1.9 : 3.5);
        }
      }
    });
    this.cells = z.buildings.map(() => []);
    this.state = z.buildings.map(() => 0);
    // Neón: tira vertical en la esquina que ve la cámara y borde del tejado, del color del rótulo de la manzana.
    const neon: { m: THREE.Matrix4; c: THREE.Color; b: number }[] = [];
    z.buildings.forEach((b, bi) => {
      const H = b.height * 1.35;
      if (H < 7) return;
      const [x0, y0, w, h] = b.rect, x1 = x0 + w, y1 = y0 + h;
      const c = new THREE.Color(b.signColor ?? b.color ?? '#43f3ff').multiplyScalar(1.3);
      const tall = H * (H >= 16 ? 0.85 : 0.6);
      const put = (x: number, y: number, z0: number, sx: number, sy: number, sz: number) => neon.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(x, z0, y), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz)), c, b: bi });
      put(x1 - 0.12, y1 - 0.12, tall / 2, 0.08, tall, 0.08);
      if (hashString(b.id) % 2 === 0) { put(x0 + w / 2, y1 - 0.12, tall, w * 0.9, 0.08, 0.08); put(x1 - 0.12, y0 + h / 2, tall, 0.08, 0.08, h * 0.9); }
    });
    if (neon.length) {
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const mat = new THREE.MeshBasicMaterial({ toneMapped: false }); this.owned.push(mat);
      const gmat = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.25 }); this.owned.push(gmat);
      const solid = new THREE.InstancedMesh(geo, mat, neon.length), ghost = new THREE.InstancedMesh(geo, gmat, neon.length);
      neon.forEach((it, i) => { solid.setMatrixAt(i, it.m); solid.setColorAt(i, it.c); ghost.setMatrixAt(i, ZERO); ghost.setColorAt(i, it.c); this.cells[it.b].push({ solid, ghost, i, m: it.m }); });
      solid.computeBoundingSphere(); ghost.boundingSphere = solid.boundingSphere!.clone();
      this.group.add(solid, ghost);
    }
    for (const g of groups.values()) {
      const k = this.kit.get(g.model)!;
      const solidMat = k.mat;
      const ghostMat = k.mat.clone(); ghostMat.transparent = true; ghostMat.opacity = 0.2; this.owned.push(ghostMat); // escribe profundidad: el fantasma se tapa a sí mismo (sin efecto rayos X)
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

  /** 0 = normal, 1 = translúcido (tapa al jugador), 2 = oculto (cámara muy cerca). */
  setFaded(i: number, mode: 0 | 1 | 2) {
    if (!this.active || this.state[i] === mode) return;
    this.state[i] = mode;
    for (const c of this.cells[i] ?? []) {
      c.solid.setMatrixAt(c.i, mode === 0 ? c.m : ZERO);
      c.ghost.setMatrixAt(c.i, mode === 1 ? c.m : ZERO);
      c.solid.instanceMatrix.needsUpdate = true; c.ghost.instanceMatrix.needsUpdate = true;
    }
  }

  clear() {
    for (const o of [...this.group.children]) { this.group.remove(o); (o as THREE.InstancedMesh).dispose?.(); }
    for (const m of this.owned) m.dispose();
    this.owned = []; this.cells = []; this.state = []; this.active = false;
  }
}
