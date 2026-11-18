// v0.17 · Prendas sacadas del samurái cibernético de la release «armaduras» (modelo de una pieza, sin esqueleto):
// el kabuto con máscara oni y penacho, y las grebas con sandalias flotantes. En Blender se separaron del resto (las
// espadas y el cuerpo se descartan), se giraron de cara y se centraron (el casco en el centro de la cabeza; cada bota en
// su suela). Aquí se escalan a la proporción del cuerpo del kit y van pegadas a sus huesos (casco → cabeza; bota →
// espinilla y pie). Los archivos los baja `tools/fetch-assets.mjs` desde la release (no van en el repositorio).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const SAMURAI_SCALE = 2.14; // del samurái (0,84 m hasta la coronilla) a una persona del kit
const cache = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material } | null>();
let version = 0;
export const samuraiVersion = () => version;
/** Pieza ya cargada (o null mientras llega). Nombres: casco, bota-izq, bota-der. */
export function samuraiPiece(name: string) {
  if (cache.has(name)) return cache.get(name) ?? null;
  cache.set(name, null);
  new GLTFLoader().loadAsync(`/models/extra/samurai/${name}.glb`).then((g) => {
    let out: { geo: THREE.BufferGeometry; mat: THREE.Material } | null = null;
    g.scene.updateMatrixWorld(true);
    g.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !out) out = { geo: m.geometry.clone().applyMatrix4(m.matrixWorld), mat: m.material as THREE.Material }; });
    if (out) { cache.set(name, out); version++; }
  }).catch((err) => console.warn('[samurái]', name, err));
  return null;
}
