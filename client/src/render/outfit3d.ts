// v0.21 · Atuendos completos de «Modular Character Outfits – Fantasy» de Quaternius (CC0): jornalero y explorador, en
// versión de hombre y de mujer. Están hechos para el mismo esqueleto que los cuerpos del kit, así que cada pieza se ata
// a los huesos de la persona por su nombre y se mueve con ella sin deformarse.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

const cache = new Map<string, THREE.Object3D | null>();
let version = 0;
export const outfitVersion = () => version;
export const isOutfit = (top: string) => top === 'atuendo-campesino' || top === 'atuendo-explorador';

/** Viste el atuendo `top` sobre el cuerpo `body` (malla con esqueleto del kit). Devuelve sus mallas o null si aún se descarga. */
export function buildOutfit(top: string, kind: 'masculino' | 'femenino', body: THREE.SkinnedMesh, bones: Map<string, THREE.Bone>): THREE.SkinnedMesh[] | null {
  const key = `${kind}-${top.replace('atuendo-', '')}`;
  if (!cache.has(key)) {
    cache.set(key, null);
    new GLTFLoader().loadAsync(`/models/atuendos/${key}.glb`).then((g) => { cache.set(key, g.scene); version++; }).catch((err) => console.warn('[atuendo]', key, err));
  }
  const src = cache.get(key);
  if (!src) return null;
  const out: THREE.SkinnedMesh[] = [];
  cloneSkinned(src).traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    // El mismo esqueleto (por nombre) que la persona: los huesos del kit en lugar de los del archivo.
    const skel = new THREE.Skeleton(m.skeleton.bones.map((b) => bones.get(b.name) ?? b), m.skeleton.boneInverses);
    const mesh = new THREE.SkinnedMesh(m.geometry, (m.material as THREE.Material).clone());
    mesh.position.copy(body.position); mesh.quaternion.copy(body.quaternion); mesh.scale.copy(body.scale);
    body.parent!.add(mesh); mesh.updateMatrixWorld(true);
    mesh.bind(skel, body.bindMatrix);
    mesh.frustumCulled = false;
    out.push(mesh);
  });
  return out;
}
