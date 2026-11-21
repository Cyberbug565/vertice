import { fitCartoonImplants, type BoneFit } from './cartoon-implants';
// v0.21 · Personajes cartoon de pocos polígonos: «Vocations and Uniforms» (17 oficios, CC BY-SA, en el repositorio) y
// «Medieval 3D People» (14 personajes de CraftPix; se descargan de la release «moveset» con tools/fetch-assets.mjs y no van
// en el repositorio). Cada uno tiene su propio esqueleto: se les traslada en cada fotograma la pose del esqueleto del kit
// (que sigue moviéndose con todo el sistema del juego: andar, correr, golpes, animaciones de la librería…), hueso a hueso
// y en el espacio del mundo, corrigiendo la diferencia de pose de reposo (T o A) con la dirección de cada hueso.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CARTOON_MODELS } from '@vertice/shared';

type Src = { scene: THREE.Object3D; map: THREE.Texture | null };
const cache = new Map<string, Src | null>();
const failed = new Set<string>();
let version = 0;
export const cartoonVersion = () => version;
export const cartoonFailed = (id: string) => failed.has(id);
let vocPalette: THREE.Texture | null = null, medPalette: THREE.Texture | null = null;
const texLoader = new THREE.TextureLoader();
const palette = (url: string, flipY: boolean) => { const t = texLoader.load(url); t.colorSpace = THREE.SRGBColorSpace; t.flipY = flipY; t.magFilter = THREE.NearestFilter; return t; };

function load(id: string) {
  if (cache.has(id)) return;
  cache.set(id, null);
  const def = CARTOON_MODELS.find((m) => m.id === id);
  if (!def) { failed.add(id); return; }
  const done = (scene: THREE.Object3D, map: THREE.Texture) => { cache.set(id, { scene, map }); version++; };
  const fail = (err: unknown) => { failed.add(id); version++; console.warn('[cartoon]', id, err); };
  if (def.pack === 'voc') {
    vocPalette ??= palette('/models/cartoon/paleta.png', false);
    new GLTFLoader().loadAsync(`/models/cartoon/${id}.glb`).then((g) => done(g.scene, vocPalette!)).catch(fail);
  } else {
    medPalette ??= palette('/models/extra/medieval/people_texture_map.png', true);
    new FBXLoader().loadAsync(`/models/extra/medieval/${def.file}.fbx`).then((g) => done(g, medPalette!)).catch(fail);
  }
}

/** Huesos equivalentes (nombre del kit → nombre en el modelo) y el hueso «hijo» que marca su dirección. */
const CHAIN: [string, string | null][] = [
  ['pelvis', 'spine_01'], ['spine_01', 'spine_02'], ['spine_02', 'spine_03'], ['spine_03', 'neck_01'], ['neck_01', 'Head'], ['Head', null],
  ...(['l', 'r'] as const).flatMap((s) => [
    [`clavicle_${s}`, `upperarm_${s}`], [`upperarm_${s}`, `lowerarm_${s}`], [`lowerarm_${s}`, `hand_${s}`], [`hand_${s}`, `index_01_${s}`],
    [`index_01_${s}`, `index_02_${s}`], [`index_02_${s}`, `index_03_${s}`], [`index_03_${s}`, null],
    [`thumb_01_${s}`, `thumb_02_${s}`], [`thumb_02_${s}`, `thumb_03_${s}`], [`thumb_03_${s}`, null],
    [`pinky_01_${s}`, `pinky_02_${s}`], [`pinky_02_${s}`, `pinky_03_${s}`], [`pinky_03_${s}`, null],
    [`thigh_${s}`, `calf_${s}`], [`calf_${s}`, `foot_${s}`], [`foot_${s}`, `ball_${s}`], [`ball_${s}`, null],
  ] as [string, string | null][]),
];
const VOC: Record<string, string> = { pelvis: 'pelvis', spine_01: 'spine1', spine_02: 'spine2', spine_03: 'spine3', neck_01: 'spine4', Head: 'head' };
function targetName(kit: string, pack: 'voc' | 'med'): string {
  if (pack === 'voc') {
    if (VOC[kit]) return VOC[kit];
    const side = kit.endsWith('_l') ? 'L' : 'R';
    const base = kit.slice(0, -2);
    const map: Record<string, string> = { clavicle: 'shoulder', upperarm: 'upper_arm', lowerarm: 'forearm', hand: 'hand', thigh: 'thigh', calf: 'shin', foot: 'foot', ball: 'toe' };
    if (map[base]) return `${map[base]}${side}`; // (el cargador quita los puntos: «upper_arm.L» → «upper_armL»)
    const f = /^(index|thumb|pinky)_0(\d)$/.exec(base);
    if (f) return `${f[1] === 'thumb' ? 'thumb' : `f_${f[1]}`}0${f[2]}${side}`;
    return '';
  }
  // Medieval (nombres de Unreal): los mismos que el kit con mayúscula; el meñique no existe (se usa el anular).
  return kit.replace(/pinky/, 'ring');
}

interface Pair { src: THREE.Bone; dst: THREE.Bone; offset: THREE.Quaternion }
export interface Cartoon { root: THREE.Object3D; update: () => void; mats: THREE.Material[] }

/**
 * Monta el personaje cartoon `id` sobre el cuerpo del kit `kitRoot` (cuyos huesos están en reposo) y devuelve la función
 * que copia la pose en cada fotograma; null mientras se descarga (o si no está: entonces se ve el cuerpo del kit).
 */
export function buildCartoon(id: string, kitRoot: THREE.Object3D, kitBones: Map<string, THREE.Bone>, implants = new Map<string, THREE.SkinnedMesh>(), lost = new Set<string>(), kind = 'masculino'): Cartoon | null {
  load(id);
  const src = cache.get(id);
  const def = CARTOON_MODELS.find((m) => m.id === id);
  if (!src || !def) return null;
  return mountCartoon(def, src, kitRoot, kitBones, implants, lost, kind);
}

export function mountCartoon(def: (typeof CARTOON_MODELS)[number], src: Src, kitRoot: THREE.Object3D, kitBones: Map<string, THREE.Bone>, implants: Map<string, THREE.SkinnedMesh>, lost: Set<string>, kind: string): Cartoon | null {
  const root = new THREE.Group();
  const model = cloneSkinned(src.scene);
  const mats: THREE.Material[] = [];
  model.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isMesh) return;
    m.frustumCulled = false; m.castShadow = false;
    const mat = new THREE.MeshLambertMaterial({ map: src.map, color: 0xffffff });
    m.material = mat; mats.push(mat);
  });
  root.add(model);
  kitRoot.add(root);
  const bones = new Map<string, THREE.Bone>();
  model.traverse((o) => { if ((o as THREE.Bone).isBone) bones.set(o.name.replace(/[.\s]/g, ''), o as THREE.Bone); });
  const B = (kit: string) => bones.get(targetName(kit, def.pack)) ?? bones.get(targetName(kit, def.pack).toLowerCase()) ?? [...bones.entries()].find(([n]) => n.toLowerCase() === targetName(kit, def.pack).toLowerCase())?.[1];
  // Escala: la cadera a la misma altura que la del kit (piernas iguales; la cabeza grande del estilo cartoon se queda).
  kitRoot.updateMatrixWorld(true);
  const kp = kitBones.get('pelvis')!, dp = B('pelvis');
  if (!dp) { kitRoot.remove(root); return null; }
  const wpos = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
  const inv = new THREE.Matrix4().copy(kitRoot.matrixWorld).invert();
  const local = (o: THREE.Object3D) => wpos(o).applyMatrix4(inv);
  // Orientación: el modelo mira a +Z como el kit (si su mano izquierda queda al otro lado, se gira media vuelta).
  root.updateMatrixWorld(true);
  const hl = B('hand_l'), khl = kitBones.get('hand_l')!;
  if (hl && Math.sign(local(hl).x - local(dp).x) !== Math.sign(local(khl).x - local(kp).x)) root.rotation.y = Math.PI;
  root.updateMatrixWorld(true);
  const foot = (o: THREE.Object3D | undefined) => (o ? local(o).y : 0);
  const kitHip = local(kp).y - Math.min(foot(kitBones.get('foot_l')), foot(kitBones.get('foot_r'))) + 0.06;
  const dstHip = local(dp).y - Math.min(foot(B('foot_l')), foot(B('foot_r'))) + 0.06;
  const s = kitHip / Math.max(0.05, dstHip);
  root.scale.multiplyScalar(s);
  root.updateMatrixWorld(true);
  root.position.y += local(kitBones.get('foot_l')!).y - local(B('foot_l') ?? dp).y;
  root.updateMatrixWorld(true);
  // Desfases de reposo: rotación del mundo de cada hueso del kit → la de su equivalente, con la dirección alineada.
  const pairs: Pair[] = [];
  const qW = (o: THREE.Object3D) => o.getWorldQuaternion(new THREE.Quaternion());
  const align = new Map<string, THREE.Quaternion>();
  const fit = new Map<string, BoneFit>();
  for (const [k, child] of CHAIN) {
    const sb = kitBones.get(k), db = B(k);
    if (!sb || !db) continue;
    let al = align.get(kitParentChain(k)) ?? new THREE.Quaternion();
    const sc = child ? kitBones.get(child) : undefined, dc = child ? B(child) : undefined;
    if (sc && dc) {
      const sd = wpos(sc).sub(wpos(sb)).normalize(), dd = wpos(dc).sub(wpos(db)).normalize();
      if (sd.lengthSq() > 0.5 && dd.lengthSq() > 0.5) al = new THREE.Quaternion().setFromUnitVectors(dd, sd);
    }
    align.set(k, al);
    if (implants.size || lost.size) {
      const ratio = sc && dc ? wpos(dc).distanceTo(wpos(db)) / Math.max(.0001, wpos(sc).distanceTo(wpos(sb))) : fit.get(kitParentChain(k))?.scale ?? 1;
      fit.set(k, { bone: db, align: al, scale: Math.min(2.3, Math.max(.35, ratio)) });
    }
    const off = qW(sb).invert().multiply(al).multiply(qW(db));
    pairs.push({ src: sb, dst: db, offset: off });
  }
  // Orden de padres a hijos (para encadenar las rotaciones del mundo).
  pairs.sort((a, b) => depth(a.dst) - depth(b.dst));
  const tq = new THREE.Quaternion(), pq = new THREE.Quaternion();
  const update = () => {
    kitRoot.updateMatrixWorld(true);
    for (const p of pairs) {
      p.src.getWorldQuaternion(tq).multiply(p.offset);
      p.dst.parent!.getWorldQuaternion(pq);
      p.dst.quaternion.copy(pq.invert().multiply(tq));
      p.dst.updateMatrixWorld(true);
    }
  };
  if (implants.size || lost.size) mats.push(...fitCartoonImplants(def.id, kind, root, kitRoot, kitBones, fit, implants, lost));
  return { root, update, mats };
}
const KIT_PARENT: Record<string, string> = { spine_01: 'pelvis', spine_02: 'spine_01', spine_03: 'spine_02', neck_01: 'spine_03', Head: 'neck_01' };
function kitParentChain(k: string): string {
  if (KIT_PARENT[k]) return KIT_PARENT[k];
  const s = k.slice(-1);
  if (/^(index|thumb|pinky)_0[23]/.test(k)) return k.replace(/_0(\d)_/, (_m, d) => `_0${Number(d) - 1}_`);
  if (/^(index|thumb|pinky)_01/.test(k)) return `hand_${s}`;
  const up: Record<string, string> = { upperarm: `clavicle_${s}`, lowerarm: `upperarm_${s}`, hand: `lowerarm_${s}`, calf: `thigh_${s}`, foot: `calf_${s}`, ball: `foot_${s}` };
  return up[k.slice(0, -2)] ?? 'pelvis';
}
function depth(o: THREE.Object3D) { let d = 0; for (let p = o.parent; p; p = p.parent) d++; return d; }
