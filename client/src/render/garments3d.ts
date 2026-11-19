// v0.22 · Prendas 3D de la release «ropa» (chaquetas, camisetas, monos, pantalones, faldas, botas, guantes, cascos,
// máscaras y accesorios), ajustadas con Blender a cada uno de los dos cuerpos del kit: cada GLB trae el esqueleto del
// cuerpo, la prenda atada a sus huesos y qué vértices del cuerpo tapa (esos no se dibujan, así la piel nunca atraviesa
// la tela y donde la prenda no llega se ve el cuerpo). Cada capa se separa un poco de la de debajo (la chaqueta va por
// encima de la camiseta) empujando sus vértices hacia fuera.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { garmentById } from '@vertice/shared';

type Kind = 'masculino' | 'femenino';
interface Src { scene: THREE.Object3D; bits: Uint8Array | null }
const cache = new Map<string, Src | null>();
const failed = new Set<string>();
let version = 0;
export const garmentsVersion = () => version;

const url = (id: string, kind: Kind) => `${garmentById(id)?.extra ? '/models/extra/prendas' : '/models/prendas'}/${kind}/${id}.glb`;
function load(id: string, kind: Kind) {
  const key = `${kind}/${id}`;
  if (cache.has(key)) return;
  cache.set(key, null);
  new GLTFLoader().loadAsync(url(id, kind)).then((g) => {
    const b64 = (g.scene.userData as { vt_hide?: string }).vt_hide;
    let bits: Uint8Array | null = null;
    if (b64) { const s = atob(b64); bits = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) bits[i] = s.charCodeAt(i); }
    cache.set(key, { scene: g.scene, bits }); version++;
  }).catch((err) => { failed.add(key); version++; console.warn('[prenda]', key, err); });
}
const src = (id: string, kind: Kind) => { load(id, kind); return cache.get(`${kind}/${id}`) ?? null; };
/** Las prendas que ya se pueden poner (las demás se están descargando o no existen para ese cuerpo). */
export const garmentsLoaded = (ids: string[], kind: Kind) => ids.filter((id) => !!src(id, kind));
export const garmentFailed = (id: string, kind: Kind) => failed.has(`${kind}/${id}`);

/** Vértices del cuerpo tapados por alguna de las prendas (1 = no se dibuja). */
export function hideMask(ids: string[], kind: Kind, n: number): Float32Array | null {
  let out: Float32Array | null = null;
  for (const id of ids) {
    const s = src(id, kind);
    if (!s?.bits) continue;
    out ??= new Float32Array(n);
    for (let v = 0; v < n; v++) if (s.bits[v >> 3] & (0x80 >> (v & 7))) out[v] = 1;
  }
  return out;
}

/** Viste las prendas sobre el cuerpo `body` (malla con el esqueleto del kit). Devuelve sus materiales. */
export function attachGarments(ids: string[], kind: Kind, body: THREE.SkinnedMesh, bones: Map<string, THREE.Bone>): THREE.Material[] {
  const mats: THREE.Material[] = [];
  for (const id of ids) {
    const s = src(id, kind), def = garmentById(id);
    if (!s || !def) continue;
    const layer = def.layer * 0.0035;
    cloneSkinned(s.scene).traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      const skel = new THREE.Skeleton(m.skeleton.bones.map((b) => bones.get(b.name) ?? b), m.skeleton.boneInverses);
      const mat = (m.material as THREE.MeshStandardMaterial).clone();
      mat.side = THREE.DoubleSide; mat.metalness = Math.min(mat.metalness, 0.3);
      if (layer > 0) {
        mat.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n transformed += objectNormal * ${layer.toFixed(4)};`); };
        mat.customProgramCacheKey = () => `vt-prenda-${def.layer}`;
      }
      const mesh = new THREE.SkinnedMesh(m.geometry, mat);
      mesh.position.copy(body.position); mesh.quaternion.copy(body.quaternion); mesh.scale.copy(body.scale);
      body.parent!.add(mesh); mesh.updateMatrixWorld(true);
      mesh.bind(skel, body.bindMatrix);
      mesh.frustumCulled = false;
      mats.push(mat);
    });
  }
  return mats;
}
