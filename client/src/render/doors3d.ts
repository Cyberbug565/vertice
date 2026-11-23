// v0.36 · Puertas de verdad en las fachadas. Son las puertas de los edificios del kit CC0 de Kenney «City Kit Commercial»
// (la de un portal, de building-c, y la doble de cristal de una tienda, de building-a), recortadas con
// tools/puertas/extraer.py en marco y hojas. Cada puerta del juego se encaja en el muro del edificio que tiene al lado
// (se busca la pared con un rayo contra el edificio 3D), mirando a la calle, y sus hojas giran hacia dentro cuando
// alguien se acerca y se cierran detrás.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type DoorKind = 'portal' | 'tienda';
interface Leaf { geo: THREE.BufferGeometry; hinge: number; side: 1 | -1 }
interface Model { frame: THREE.BufferGeometry; leaves: Leaf[]; mat: THREE.Material }
/** Escala del kit en el juego (la misma con la que se ponían sus edificios: la puerta mide ~1,6 casillas de alto). */
export const DOOR_SCALE = 5.2;
const OPEN = 1.35; // radianes que gira una hoja abierta (~77°)

let models: Map<DoorKind, Model> | null = null;
let loading: Promise<void> | null = null;
function load(onReady: () => void) {
  if (models) return;
  loading ??= Promise.all((['portal', 'tienda'] as const).map((k) => new GLTFLoader().loadAsync(`/models/puertas/puerta-${k}.glb`).then((g) => {
    let frame: THREE.BufferGeometry | null = null; let mat: THREE.Material | null = null; const leaves: Leaf[] = [];
    g.scene.updateMatrixWorld(true);
    g.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const geo = (m.geometry as THREE.BufferGeometry).clone().applyMatrix4(m.matrixWorld);
      mat ??= m.material as THREE.Material;
      const name = (m.name || m.parent?.name || '').toLowerCase();
      const extras = (m.userData.vt_bisagra ?? m.parent?.userData.vt_bisagra) as number | undefined;
      if (name.startsWith('hoja')) leaves.push({ geo, hinge: extras ?? 0, side: name.includes('-d') ? -1 : 1 });
      else frame = geo;
    });
    const std = mat as unknown as THREE.MeshStandardMaterial;
    if (std?.map) { std.map.magFilter = THREE.NearestFilter; std.map.colorSpace = THREE.SRGBColorSpace; }
    return [k, { frame: frame!, leaves, mat: mat! }] as const;
  }))).then((list) => { models = new Map(list); onReady(); }).catch((err) => console.warn('[puertas 3D]', err));
}

interface Placed { root: THREE.Group; pivots: { p: THREE.Object3D; side: 1 | -1 }[]; k: number }

export class Doors3D {
  readonly group = new THREE.Group();
  private doors = new Map<number, Placed>();
  private pending: { id: number; kind: DoorKind; x: number; z: number; dirX: number; dirZ: number; y0: number }[] = [];
  /** Se llama cuando terminan de cargar los modelos (para colocar las puertas que esperaban). */
  onReady: (() => void) | null = null;
  constructor() { this.group.name = 'puertas'; }

  /** Pone (o mueve) la puerta `id` con el umbral en (x, z) del mundo 3D y la cara hacia la calle (-dir). */
  set(id: number, kind: DoorKind, x: number, z: number, dirX: number, dirZ: number, y0 = 0) {
    this.remove(id);
    if (!models) { this.pending.push({ id, kind, x, z, dirX, dirZ, y0 }); load(() => { const p = this.pending; this.pending = []; for (const d of p) this.set(d.id, d.kind, d.x, d.z, d.dirX, d.dirZ, d.y0); this.onReady?.(); }); return; }
    const m = models.get(kind)!;
    const root = new THREE.Group();
    root.position.set(x, y0, z);
    // El modelo mira a -Z (la calle) y se mete en el muro hacia +Z: +Z del modelo = hacia dentro del edificio.
    root.rotation.y = Math.atan2(dirX, dirZ);
    root.scale.setScalar(DOOR_SCALE);
    const frame = new THREE.Mesh(m.frame, m.mat); root.add(frame);
    const pivots: Placed['pivots'] = [];
    for (const lf of m.leaves) {
      const p = new THREE.Object3D(); p.position.x = lf.hinge; root.add(p);
      const leaf = new THREE.Mesh(lf.geo, m.mat); leaf.position.x = -lf.hinge; p.add(leaf);
      pivots.push({ p, side: lf.side });
    }
    root.traverse((o) => { o.matrixAutoUpdate = true; });
    this.group.add(root);
    this.doors.set(id, { root, pivots, k: 0 });
  }
  remove(id: number) {
    this.pending = this.pending.filter((d) => d.id !== id);
    const d = this.doors.get(id);
    if (!d) return;
    this.group.remove(d.root);
    this.doors.delete(id);
  }
  clear() { for (const id of [...this.doors.keys()]) this.remove(id); this.pending = []; }
  has(id: number) { return this.doors.has(id) || this.pending.some((d) => d.id === id); }
  /** Abre (k = 1) o cierra (k = 0) la puerta: las hojas giran sobre su bisagra hacia dentro. */
  setOpen(id: number, k: number) {
    const d = this.doors.get(id);
    if (!d || d.k === k) return;
    d.k = k;
    const e = k * k * (3 - 2 * k);
    for (const { p, side } of d.pivots) p.rotation.y = -side * OPEN * e;
  }
}
