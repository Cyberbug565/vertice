import * as THREE from 'three';
import { cyberSide } from '@vertice/shared';

export interface BoneFit {
  bone: THREE.Bone;
  scale: number;
  align: THREE.Quaternion;
}
type BoneMap = Map<string, BoneFit>;

const fitted = new WeakMap<THREE.BufferGeometry, Map<string, THREE.BufferGeometry>>();
const trimmed = new WeakMap<THREE.BufferGeometry, Map<string, THREE.BufferGeometry>>();

function limb(name: string) {
  const tail = name.endsWith('_l') ? '_izq' : '_der';
  if (/^(upperarm|lowerarm)/.test(name)) return 'brazo' + tail;
  if (/^(hand|index|middle|ring|pinky|thumb)/.test(name)) return 'mano' + tail;
  if (/^(thigh|calf|foot|ball)/.test(name)) return 'pierna' + tail;
  return name === 'Head' ? 'cabeza' : '';
}

function withoutLimbs(mesh: THREE.SkinnedMesh, parts: Set<string>, mapped: BoneMap) {
  const geo = mesh.geometry,
    key = [...parts].sort().join(',');
  let variants = trimmed.get(geo);
  if (!variants) {
    variants = new Map();
    trimmed.set(geo, variants);
  }
  const hit = variants.get(key);
  if (hit) return hit;
  const byName = new Map([...mapped].map(([name, info]) => [info.bone.name, limb(name)]));
  const removed = mesh.skeleton.bones.map((bone) => {
    // Fingers and face bones not individually present in the motion library inherit their parent region.
    let node: THREE.Object3D | null = bone;
    while (node && !byName.has(node.name)) node = node.parent;
    return !!node && parts.has(byName.get(node.name)!);
  });
  const joints = geo.getAttribute('skinIndex'),
    weights = geo.getAttribute('skinWeight');
  const gone = new Uint8Array(joints.count);
  for (let i = 0; i < gone.length; i++) {
    let cut = 0;
    for (let k = 0; k < 4; k++) if (removed[joints.getComponent(i, k)]) cut += weights.getComponent(i, k);
    gone[i] = cut >= 0.55 ? 1 : 0;
  }
  const kept: number[] = [],
    index = geo.index;
  for (let i = 0; i < (index?.count ?? gone.length); i += 3) {
    const a = index?.getX(i) ?? i,
      b = index?.getX(i + 1) ?? i + 1,
      c = index?.getX(i + 2) ?? i + 2;
    if (gone[a] + gone[b] + gone[c] < 2) kept.push(a, b, c);
  }
  const out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(geo.attributes)) out.setAttribute(name, attr);
  out.setIndex(kept);
  variants.set(key, out);
  return out;
}

/** Map the UBC bind pose into the native avatar's rest bones before sharing its live skeleton. */
export function fitCartoonImplants(
  id: string,
  kind: string,
  root: THREE.Object3D,
  kit: THREE.Object3D,
  kitBones: Map<string, THREE.Bone>,
  mapped: BoneMap,
  ready: Map<string, THREE.SkinnedMesh>,
  lost: Set<string>,
) {
  const mats: THREE.Material[] = [],
    native: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) native.push(o as THREE.SkinnedMesh);
  });
  const target = native.sort((a, b) => b.skeleton.bones.length - a.skeleton.bones.length)[0];
  if (!target || (!ready.size && !lost.size)) return mats;
  const removed = new Set(lost);
  for (const part of [...ready.keys(), ...lost]) {
    if (/^(brazo_|pierna_|mano_|cabeza$)/.test(part)) removed.add(part);
    if (part.startsWith('brazo_')) removed.add('mano_' + cyberSide(part));
  }
  const indices = new Map(target.skeleton.bones.map((b, i) => [b.name, i]));
  const kitInv = kit.matrixWorld.clone().invert();
  const tmp = new THREE.Vector3();
  // Head size varies considerably between cartoon models; measure its native mesh for facial pieces.
  const headBox = new THREE.Box3();
  const head = mapped.get('Head')?.bone;
  if (head && [...ready.keys()].some((p) => /^(cabeza|mandibula|ojo_)/.test(p))) {
    for (const m of native) {
      const joint = m.skeleton.bones.indexOf(head);
      const ji = m.geometry.getAttribute('skinIndex'),
        w = m.geometry.getAttribute('skinWeight'),
        pos = m.geometry.getAttribute('position');
      const toKit = kitInv.clone().multiply(m.matrixWorld);
      for (let i = 0; i < pos.count; i++)
        if ([0, 1, 2, 3].some((k) => ji.getComponent(i, k) === joint && w.getComponent(i, k) > 0.55))
          headBox.expandByPoint(tmp.fromBufferAttribute(pos, i).applyMatrix4(toKit));
    }
  }
  if (removed.size) for (const m of native) m.geometry = withoutLimbs(m, removed, mapped);
  for (const [part, src] of ready) {
    const geo = src.geometry;
    let cache = fitted.get(geo);
    if (!cache) {
      cache = new Map();
      fitted.set(geo, cache);
    }
    const hand = 'mano_' + cyberSide(part);
    const cutHand = part.startsWith('brazo_') && (ready.has(hand) || lost.has(hand));
    const key = [id, kind, part, cutHand].join('/');
    let out = cache.get(key);
    if (!out) {
      const pos = geo.getAttribute('position'),
        ji = geo.getAttribute('skinIndex'),
        w = geo.getAttribute('skinWeight');
      const maps = src.skeleton.bones.map((b) => {
        let k: THREE.Object3D | null | undefined = kitBones.get(b.name);
        while (k && (!mapped.has(k.name) || !indices.has(mapped.get(k.name)!.bone.name))) k = k.parent;
        if (!k) return { ix: 0, matrix: new THREE.Matrix4() };
        const rec = mapped.get(k.name)!,
          ix = indices.get(rec.bone.name)!;
        const from = k.getWorldPosition(new THREE.Vector3()),
          to = rec.bone.getWorldPosition(new THREE.Vector3());
        const targetLocal = target.bindMatrix
          .clone()
          .invert()
          .multiply(target.skeleton.boneInverses[ix].clone().invert())
          .multiply(rec.bone.matrixWorld.clone().invert());
        const matrix = targetLocal
          .multiply(new THREE.Matrix4().makeTranslation(to))
          .multiply(new THREE.Matrix4().makeRotationFromQuaternion(rec.align.clone().invert()))
          .multiply(new THREE.Matrix4().makeScale(rec.scale, rec.scale, rec.scale))
          .multiply(new THREE.Matrix4().makeTranslation(from.negate()))
          .multiply(kit.matrixWorld);
        return { ix, matrix };
      });
      const vertices = new Float32Array(pos.count * 3),
        joints = new Uint16Array(pos.count * 4),
        omit = new Uint8Array(pos.count);
      const a = new THREE.Vector3(),
        sum = new THREE.Vector3(),
        size = headBox.getSize(new THREE.Vector3()),
        center = headBox.getCenter(new THREE.Vector3());
      const facial = head && !headBox.isEmpty() && /^(cabeza|mandibula|ojo_)/.test(part);
      const faceMatrix = facial
        ? target.bindMatrix
            .clone()
            .invert()
            .multiply(target.skeleton.boneInverses[indices.get(head.name)!].clone().invert())
            .multiply(head.matrixWorld.clone().invert())
            .multiply(kit.matrixWorld)
        : undefined;
      for (let i = 0; i < pos.count; i++) {
        sum.set(0, 0, 0);
        let handWeight = 0;
        for (let k = 0; k < 4; k++) {
          const j = ji.getComponent(i, k),
            info = maps[j],
            weight = w.getComponent(i, k);
          joints[i * 4 + k] = info.ix;
          if (!weight) continue;
          if (limb(src.skeleton.bones[j].name) === hand) handWeight += weight;
          a.fromBufferAttribute(pos, i);
          if (faceMatrix) {
            // Fit the visor and the eye to this head's width, chin and face plane.
            const top = kind === 'masculino' ? 1.81 : 1.767;
            a.set(
              center.x + (a.x / 0.182) * size.x,
              headBox.max.y + ((a.y - top) / 0.234) * size.y,
              center.z + ((a.z - 0.005) / 0.211) * size.z,
            );
            a.applyMatrix4(faceMatrix);
          } else a.applyMatrix4(info.matrix);
          sum.addScaledVector(a, weight);
        }
        sum.toArray(vertices, i * 3);
        omit[i] = cutHand && handWeight > 0.5 ? 1 : 0;
      }
      out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      out.setAttribute('color', geo.getAttribute('color'));
      out.setAttribute('skinWeight', w);
      out.setAttribute('skinIndex', new THREE.BufferAttribute(joints, 4));
      if (cutHand && geo.index) {
        const kept: number[] = [];
        for (let j = 0; j < geo.index.count; j += 3) {
          const a = geo.index.getX(j),
            b = geo.index.getX(j + 1),
            c = geo.index.getX(j + 2);
          if (omit[a] + omit[b] + omit[c] < 2) kept.push(a, b, c);
        }
        out.setIndex(kept);
      } else out.setIndex(geo.index);
      out.computeVertexNormals();
      cache.set(key, out);
    }
    const mat = (src.material as THREE.MeshStandardMaterial).clone();
    mat.userData.implantMaterial = true;
    mats.push(mat);
    const m = new THREE.SkinnedMesh(out, mat);
    m.name = src.name;
    m.position.copy(target.position);
    m.quaternion.copy(target.quaternion);
    m.scale.copy(target.scale);
    m.bind(target.skeleton, target.bindMatrix);
    m.frustumCulled = false;
    target.parent!.add(m);
  }
  return mats;
}
