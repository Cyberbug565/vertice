// Each model is shared by everyone using the same body. A download contains its two anatomical sides.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CYBER_MODELS, cyberSide, type CyberModel, type EntitySpawn } from '@vertice/shared';
import { bindGarment } from './garment-skinning';
import { HEAD_MORPH, HEAD_UNIFORMS, REG, type BodyKind, type KitData } from './human3d';

type Parts = Record<string, CyberModel>;
const sources = new Map<string, Map<string, THREE.SkinnedMesh> | null>();
const modelRevisions = new Map<CyberModel, number>();
const attempts = new Map<string, number>();
let revision = 0;
export const implantsVersion = () => revision;
export function implantEntries(scene: THREE.Object3D) {
  const entries = new Map<string, THREE.SkinnedMesh>();
  scene.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (m.isSkinnedMesh && typeof m.userData.implant === 'string') entries.set(m.userData.implant, m);
  });
  return entries;
}

export function npcImplants(s: EntitySpawn): Parts {
  const models: Parts = {};
  const heavy = s.npcType === 'hierro' || (s.level ?? 0) >= 20;
  for (const p of s.chrome ?? []) {
    if (p.startsWith('brazo_'))
      models[p] = heavy
        ? 'asedio'
        : s.npcType === 'police'
          ? 'vigia'
          : (['circuito', 'servo', 'correo-brazo', 'bio'] as const)[s.id % 4];
    if (p.startsWith('pierna_'))
      models[p] = heavy ? 'titan' : (['protesis', 'corredor', 'correo-pierna'] as const)[s.id % 3];
    if (p === 'ojos') models[s.id % 2 ? 'ojo_der' : 'ojo_izq'] = 'optico';
    if (p === 'cabeza') models[heavy ? 'cabeza' : 'mandibula'] = heavy ? 'yelmo' : 'mordaza';
  }
  return models;
}

/** Sólo hay que rehacer la persona que lleve un modelo cuyo estado haya cambiado. */
export function wearerImplantRevision(s: EntitySpawn) {
  const models =
    s.appearance?.chromeModels ?? (s.kind === 'npc' && s.chrome?.length ? npcImplants(s) : undefined);
  let stamp = 0;
  for (const id of Object.values(models ?? {})) stamp = Math.max(stamp, modelRevisions.get(id) ?? 0);
  return stamp;
}

export function loadedImplants(models: Parts | undefined, kind: BodyKind, lost: Set<string>) {
  const ready = new Map<string, THREE.SkinnedMesh>();
  for (const [part, id] of Object.entries(models ?? {})) {
    const region = CYBER_MODELS[id];
    if (!region || lost.has(part)) continue;
    const side = cyberSide(part);
    if (side && (region === 'mano' || region === 'antebrazo') && lost.has('brazo_' + side)) continue;
    const key = kind + '/' + id;
    if (!sources.has(key)) {
      sources.set(key, null);
      new GLTFLoader()
        .loadAsync('/models/cromo/' + key + '.glb')
        .then((g) => {
          sources.set(key, implantEntries(g.scene));
          attempts.delete(key);
          modelRevisions.set(id, ++revision);
        })
        .catch((err) => {
          console.warn('[ciberware]', key, err);
          const count = (attempts.get(key) ?? 0) + 1;
          attempts.set(key, count);
          if (count < 3)
            setTimeout(() => {
              sources.delete(key);
              modelRevisions.set(id, ++revision);
            }, 5000 * count);
        });
    }
    const mesh = sources.get(key)?.get(side ? id + '_' + side : id);
    if (mesh) ready.set(part, mesh);
  }
  return ready;
}

export const implantRegions = (part: string): number[] => {
  const left = cyberSide(part) === 'izq';
  if (part.startsWith('brazo_')) return left ? [REG.uaP, REG.faP, REG.handP] : [REG.uaM, REG.faM, REG.handM];
  if (part.startsWith('pierna_')) return left ? [REG.thP, REG.caP, REG.ftP] : [REG.thM, REG.caM, REG.ftM];
  if (part.startsWith('mano_')) return [left ? REG.handP : REG.handM];
  return part === 'cabeza' ? [REG.head] : [];
};

export interface ClothingFit {
  mask: ArrayLike<number> | null;
  sleeve: number;
  trouser: number;
  shoes: boolean;
  gloves: boolean;
  outfit: boolean;
  back?: boolean;
}

export function coveredByClothes(d: KitData, i: number, fit: ClothingFit) {
  if (fit.mask?.[i]) return true;
  const reg = d.reg[i],
    L = d.L;
  if (reg === REG.handP || reg === REG.handM) return fit.gloves;
  if (reg === REG.ftP || reg === REG.ftM) return fit.shoes || fit.outfit;
  if (reg === REG.uaP || reg === REG.uaM || reg === REG.faP || reg === REG.faM)
    return fit.outfit || (fit.sleeve > 0 && (Math.abs(d.pos[i * 3]) - L.shX) / (L.wrX - L.shX) < fit.sleeve);
  if (reg === REG.thP || reg === REG.thM || reg === REG.caP || reg === REG.caM)
    return fit.outfit || (fit.trouser > 0 && (L.hipY - d.pos[i * 3 + 1]) / (L.hipY - L.ankY) < fit.trouser);
  return (
    reg === REG.torso &&
    (fit.outfit || (!!fit.back && d.pos[i * 3 + 2] < 0 && d.pos[i * 3 + 1] > L.pelvisY + 0.06))
  );
}

/** The exported offset pushes covered metal just inside the body surface. The garment retains its original cut and weights. */
export function fitImplant(
  source: THREE.SkinnedMesh,
  body: THREE.SkinnedMesh,
  data: KitData,
  fit: ClothingFit,
  omitHand?: number,
) {
  const mesh = bindGarment(source, body),
    original = mesh.geometry;
  const map = original.getAttribute('_vtbody'),
    delta = original.getAttribute('_vtfit');
  const pos = original.getAttribute('position');
  let fitted: THREE.BufferAttribute | undefined;
  for (let i = 0; i < pos.count; i++) {
    if (!coveredByClothes(data, map.getX(i), fit)) continue;
    fitted ??= new THREE.Float32BufferAttribute(new Float32Array(pos.count * 3), 3).copyArray(pos.array);
    fitted.setXYZ(i, pos.getX(i) + delta.getX(i), pos.getY(i) + delta.getY(i), pos.getZ(i) + delta.getZ(i));
  }
  if (fitted || omitHand !== undefined) {
    const g = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(original.attributes)) g.setAttribute(k, a);
    if (fitted) g.setAttribute('position', fitted);
    g.setIndex(original.index);
    if (omitHand !== undefined && original.index) {
      const kept: number[] = [];
      for (let t = 0; t < original.index.count; t += 3) {
        const tri = [original.index.getX(t), original.index.getX(t + 1), original.index.getX(t + 2)];
        if (tri.filter((v) => data.reg[map.getX(v)] === omitHand).length < 2) kept.push(...tri);
      }
      g.setIndex(kept);
    }
    mesh.geometry = g;
    mesh.userData.implantGeometry = true;
  }
  const mat = (source.material as THREE.MeshStandardMaterial).clone();
  mat.userData.implantMaterial = true;
  mesh.material = mat;
  return mesh;
}

export function attachImplants(
  ready: Map<string, THREE.SkinnedMesh>,
  body: THREE.SkinnedMesh,
  data: KitData,
  fit: ClothingFit,
  lost: Set<string>,
) {
  const result: THREE.Material[] = [];
  for (const [part, source] of ready) {
    const side = cyberSide(part),
      hand = 'mano_' + side;
    const omit =
      part.startsWith('brazo_') && (ready.has(hand) || lost.has(hand)) ? implantRegions(hand)[0] : undefined;
    const mesh = fitImplant(source, body, data, fit, omit);
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (['mandibula', 'cabeza', 'ojo_der', 'ojo_izq'].includes(part)) {
      const uniforms = (body.material as THREE.Material).userData.face;
      if (uniforms) {
        mat.onBeforeCompile = (shader) => {
          Object.assign(shader.uniforms, uniforms);
          shader.vertexShader =
            HEAD_UNIFORMS +
            shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + HEAD_MORPH);
        };
        mat.customProgramCacheKey = () => 'vt-implante-facial';
      }
    }
    body.parent!.add(mesh);
    mesh.updateMatrixWorld(true);
    result.push(mat);
  }
  return result;
}
