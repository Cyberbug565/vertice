// v0.17 · Peinados de la release «pelos»: una colección de 105 peinados (cada uno en su archivo, normalizados sobre una
// misma cabeza de referencia: arriba de la cabeza en y = 0, centrados, de 17,6 cm de ancho) y un pelo realista de
// hombre. Se descargan solo cuando alguien los lleva y se colocan sobre la cabeza del cuerpo del kit (escala según la
// anchura de su cabeza). Los archivos no van en el repositorio: los baja `tools/fetch-assets.mjs` desde la release.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const cache = new Map<string, THREE.BufferGeometry | null>();
const failed = new Set<string>();
/** ¿No se pudo descargar? (entonces se pone un peinado normal en su lugar). */
export const hairFailed = (id: string) => failed.has(id);
let version = 0;
export const hairsVersion = () => version;
export const isCollectionHair = (id: string) => /^pelo-(real-)?\d{3}$/.test(id);
/** Anchura de la cabeza de referencia de la colección (m). */
export const REF_HEAD_W = 0.176;

/** Geometría del peinado si ya está; si no, la pide (y devuelve null mientras llega). */
export function collectionHair(id: string): THREE.BufferGeometry | null {
  if (cache.has(id)) return cache.get(id) ?? null;
  cache.set(id, null);
  new GLTFLoader().loadAsync(`/models/extra/pelos/${id}.glb`).then((g) => {
    const parts: THREE.BufferGeometry[] = [];
    g.scene.updateMatrixWorld(true);
    g.scene.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const geometry = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(mesh.matrixWorld);
      if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
      for (const name of Object.keys(geometry.attributes)) if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
      parts.push(geometry);
    });
    const geo = parts.length > 1 ? mergeGeometries(parts) : parts[0];
    if (!geo) { failed.add(id); version++; return; }
    if (parts.length > 1) parts.forEach(g => g.dispose());
    cache.set(id, geo); version++;
  }).catch((err) => { failed.add(id); version++; console.warn('[pelos]', id, err); });
  return null;
}
