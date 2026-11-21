import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CYBER_MODELS, pairedRegion } from '../../shared/src/cyber-models';
import { implantEntries, fitImplant } from '../src/render/implants3d';
import type { KitData } from '../src/render/human3d';
import { GARMENTS } from '../../shared/src/garments';
import { bindGarment } from '../src/render/garment-skinning';

const base = resolve(import.meta.dirname, '../public/models');
// Las pruebas de rig no necesitan decodificar las texturas. Cargan geometría,
// índices, pesos, matrices y jerarquías reales mediante el importador del juego.
async function load(path: string): Promise<GLTF> {
  const raw = readFileSync(path);
  const glb = raw.readUInt32LE(0) === 0x46546c67;
  const length = glb ? raw.readUInt32LE(12) : 0;
  const doc = JSON.parse(glb ? raw.toString('utf8', 20, 20 + length) : raw.toString('utf8'));
  for (const buffer of doc.buffers) {
    const bytes = glb && !buffer.uri ? raw.subarray(28 + length, 28 + length + buffer.byteLength) : readFileSync(resolve(dirname(path), buffer.uri));
    buffer.uri = 'data:application/octet-stream;base64,' + bytes.toString('base64');
  }
  doc.images = []; doc.textures = [];
  doc.materials = doc.materials?.map((m: { name?: string }) => ({ name: m.name }));
  return new Promise((done, fail) => new GLTFLoader().parse(JSON.stringify(doc), '', done, fail));
}
function meshes(scene: THREE.Object3D): THREE.SkinnedMesh[] {
  const result: THREE.SkinnedMesh[] = [];
  scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) result.push(o as THREE.SkinnedMesh); });
  return result;
}
const bodies = new Map<string, THREE.SkinnedMesh>();
beforeAll(async () => {
  vi.stubGlobal('ProgressEvent', class { constructor(public type: string, public init: unknown) {} });
  for (const [kind, file] of [['masculino', 'Male'], ['femenino', 'Female']]) {
    const g = await load(resolve(base, `humanos/Superhero_${file}_FullBody.gltf`));
    g.scene.updateMatrixWorld(true);
    bodies.set(kind, meshes(g.scene).find((m) => (m.material as THREE.Material).name.includes('Superhero'))!);
  }
});

const cases = (['masculino', 'femenino'] as const).flatMap((body) => GARMENTS.filter((g) => g.sex === 'u' || g.sex === (body === 'masculino' ? 'm' : 'f')).map((g) => ({ body, id: g.id })));
describe('prendas de la release ropa', () => {
  it.each(cases)('$body / $id: pesos, cobertura y animación con el esqueleto del cuerpo', async ({ body: kind, id }) => {
    const body = bodies.get(kind)!;
    const original = body.skeleton.bones.map((b) => b.quaternion.clone());
    const g = await load(resolve(base, `prendas/${kind}/${id}.glb`));
    const meta = JSON.parse(g.scene.userData.vt_meta);
    expect(meta.body).toBe(kind); expect(meta.id).toBe(id);
    const mask = Buffer.from(g.scene.userData.vt_hide, 'base64');
    expect(mask.length).toBe(Math.ceil(body.geometry.getAttribute('position').count / 8));
    const garments = meshes(g.scene); expect(garments.length).toBeGreaterThan(0);
    const names = new Map(body.skeleton.bones.map((b) => [b.name, b]));
    const attached: THREE.SkinnedMesh[] = [];
    for (const source of garments) {
      const sw = source.geometry.getAttribute('skinWeight'), si = source.geometry.getAttribute('skinIndex');
      for (let v = 0; v < sw.count; v++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) {
          const weight = sw.getComponent(v, k); expect(Number.isFinite(weight) && weight >= 0).toBe(true);
          expect(si.getComponent(v, k)).toBeLessThan(source.skeleton.bones.length); sum += weight;
        }
        expect(sum).toBeCloseTo(1, 4);
      }
      const bound = bindGarment(source, body); body.parent!.add(bound); attached.push(bound);
      expect(bound.skeleton).toBe(body.skeleton);
    }
    // Reposo, zancada, golpe y giro de cuello; incluyen el codo y los dedos.
    for (const phase of [0, .45, 1.1, 1.8]) {
      for (let i = 0; i < body.skeleton.bones.length; i++) body.skeleton.bones[i].quaternion.copy(original[i]);
      for (const [name, x, y, z] of [['upperarm_l', phase, 0, -.6], ['lowerarm_l', phase * .7, 0, 0], ['thigh_l', phase * .5, 0, 0], ['thigh_r', -phase * .4, 0, 0], ['Head', 0, phase * .4, 0], ['index_01_l', 0, 0, phase * .6]] as const) {
        names.get(name)!.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)));
      }
      for (const source of garments) for (const b of source.skeleton.bones) b.quaternion.copy(names.get(b.name)!.quaternion);
      body.parent!.updateWorldMatrix(true, true); g.scene.updateMatrixWorld(true);
      for (let m = 0; m < garments.length; m++) {
        const source = garments[m], bound = attached[m], pos = source.geometry.getAttribute('position');
        for (let v = 0; v < pos.count; v += Math.max(1, Math.floor(pos.count / 16))) {
          const expected = source.applyBoneTransform(v, new THREE.Vector3().fromBufferAttribute(pos, v));
          const actual = bound.applyBoneTransform(v, new THREE.Vector3().fromBufferAttribute(bound.geometry.getAttribute('position'), v));
          expect(actual.distanceTo(expected)).toBeLessThan(1e-4);
        }
      }
    }
    for (let i = 0; i < body.skeleton.bones.length; i++) body.skeleton.bones[i].quaternion.copy(original[i]);
    for (const m of attached) m.removeFromParent();
  });

  it('remapea un orden de huesos diferente y rechaza huesos ajenos', () => {
    const root = new THREE.Bone(); root.name = 'root';
    const hand = new THREE.Bone(); hand.name = 'hand_l'; hand.position.x = 1; root.add(hand); root.updateMatrixWorld(true);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([1, 0, 0], 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0], 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0], 4));
    const body = new THREE.SkinnedMesh(geo); body.bind(new THREE.Skeleton([root, hand]));
    const source = new THREE.SkinnedMesh(geo); source.bind(new THREE.Skeleton([hand, root]));
    const fitted = bindGarment(source, body);
    expect(fitted.geometry.getAttribute('skinIndex').getX(0)).toBe(1);
    expect(geo.getAttribute('skinIndex').getX(0)).toBe(0);
    expect(bindGarment(source, body).geometry).toBe(fitted.geometry);
    hand.name = 'alien';
    const other = new THREE.Bone(); other.name = 'root';
    body.bind(new THREE.Skeleton([other]));
    expect(() => bindGarment(source, body)).toThrow('Falta el hueso');
  });
});

describe('implantes visibles', () => {
  for (const kind of ['masculino', 'femenino']) {
    it.each(Object.entries(CYBER_MODELS))(`${kind} · %s se une a sus huesos anatómicos`, async (id, region) => {
      const body = bodies.get(kind)!;
      body.parent!.updateWorldMatrix(true, true);
      const g = await load(resolve(base, `cromo/${kind}/${id}.glb`));
      g.scene.updateMatrixWorld(true);
      const entries = implantEntries(g.scene);
      const sides = pairedRegion(region) ? ['izq', 'der'] : [''];
      expect(entries.size).toBe(sides.length);
      for (const side of sides) {
        const mesh = entries.get(side ? id + '_' + side : id)!;
        const joined = bindGarment(mesh, body);
        const geo = joined.geometry,
          weights = geo.getAttribute('skinWeight'),
          joints = geo.getAttribute('skinIndex');
        const position = geo.getAttribute('position'),
          near = geo.getAttribute('_vtbody'),
          fit = geo.getAttribute('_vtfit');
        const count = body.geometry.getAttribute('position').count;
        let sumX = 0,
          wrong = 0,
          biggest = 0,
          sumError = 0,
          invalid = 0;
        for (let v = 0; v < position.count; v++) {
          let total = 0;
          sumX += position.getX(v);
          for (let k = 0; k < 4; k++) {
            const weight = weights.getComponent(v, k);
            total += weight;
            const bone = body.skeleton.bones[joints.getComponent(v, k)];
            if (!bone) invalid++;
            if (side && region !== 'ojo' && weight > 0.0001 && bone.name.endsWith(side === 'izq' ? '_r' : '_l'))
              wrong++;
          }
          if (!Number.isFinite(position.getY(v)) || near.getX(v) < 0 || near.getX(v) >= count) invalid++;
          sumError = Math.max(sumError, Math.abs(total - 1));
          biggest = Math.max(biggest, Math.abs(fit.getZ(v)), Math.abs(fit.getX(v)), Math.abs(fit.getY(v)));
        }
        expect(invalid).toBe(0);
        expect(wrong).toBe(0);
        expect(sumError).toBeLessThan(0.0001);
        expect(biggest).toBeLessThan(0.112);
        if (side) expect(Math.sign(sumX)).toBe(side === 'izq' ? 1 : -1);
        const point = Math.floor(position.count / 2);
        const bind = new THREE.Vector3().fromBufferAttribute(position, point);
        expect(joined.applyBoneTransform(point, bind.clone()).distanceTo(bind)).toBeLessThan(0.0001);
      }
    });
  }

  it('remete el cromo solo bajo tela y deja libres los vértices descubiertos', async () => {
    const body = bodies.get('masculino')!;
    const src = implantEntries((await load(resolve(base, 'cromo/masculino/servo.glb'))).scene).get('servo_der')!;
    const pos = src.geometry.getAttribute('position'),
      delta = src.geometry.getAttribute('_vtfit'),
      map = src.geometry.getAttribute('_vtbody');
    const n = body.geometry.getAttribute('position').count;
    const data = { reg: new Float32Array(n), L: {} } as KitData;
    const mask = Float32Array.from({ length: n }, (_, i) => i % 2);
    const fitted = fitImplant(src, body, data, {
      mask,
      sleeve: 0,
      trouser: 0,
      shoes: false,
      gloves: false,
      outfit: false,
    });
    const result = fitted.geometry.getAttribute('position');
    let changed = 0,
      uncovered = 0;
    for (let i = 0; i < pos.count; i++) {
      const expected = new THREE.Vector3().fromBufferAttribute(pos, i);
      if (mask[map.getX(i)]) expected.add(new THREE.Vector3().fromBufferAttribute(delta, i));
      else uncovered++;
      const got = new THREE.Vector3().fromBufferAttribute(result, i);
      if (got.distanceTo(new THREE.Vector3().fromBufferAttribute(pos, i)) > 0.001) changed++;
      if (got.distanceTo(expected) > 0.00001) throw new Error('Deformación incorrecta en ' + i);
    }
    expect(changed).toBeGreaterThan(40);
    expect(uncovered).toBeGreaterThan(40);
    expect(src.geometry.getAttribute('position')).toBe(pos);
  });
});

it('acopla un brazo a un NPC de uniforme, elimina la extremidad original y sigue el codo del NPC', async () => {
  const { mountCartoon } = await import('../src/render/cartoon3d');
  const { CARTOON_MODELS } = await import('@vertice/shared');
  const kit = await load(resolve(base, 'humanos/Superhero_Male_FullBody.gltf'));
  const native = await load(resolve(base, 'cartoon/policia.glb'));
  const body = meshes(kit.scene).find((m) => (m.material as THREE.Material).name.includes('Superhero'))!;
  const bones = new Map(body.skeleton.bones.map((b) => [b.name, b]));
  const arm = implantEntries((await load(resolve(base, 'cromo/masculino/servo.glb'))).scene).get('servo_der')!;
  const initial = meshes(native.scene).reduce(
    (sum, m) => sum + (m.geometry.index?.count ?? m.geometry.getAttribute('position').count),
    0,
  );
  const npc = mountCartoon(
    CARTOON_MODELS.find((m) => m.id === 'policia')!,
    { scene: native.scene, map: null },
    kit.scene,
    bones,
    new Map([['brazo_der', arm]]),
    new Set(),
    'masculino',
  )!;
  const all = meshes(npc.root),
    implant = all.find((m) => m.name === arm.name)!;
  expect(implant).toBeDefined();
  expect(
    all.filter((m) => m !== implant).reduce((sum, m) => sum + (m.geometry.index?.count ?? 0), 0),
  ).toBeLessThan(initial);
  npc.update();
  const p = implant.geometry.getAttribute('position');
  const sample = (i: number) =>
    implant
      .applyBoneTransform(i, new THREE.Vector3().fromBufferAttribute(p, i))
      .applyMatrix4(implant.matrixWorld);
  const samples = Array.from({ length: 20 }, (_, i) => Math.floor((i * p.count) / 20));
  const initialPoints = samples.map(sample);
  expect(initialPoints.every((pt) => Number.isFinite(pt.x) && pt.length() < 3)).toBe(true);
  bones.get('lowerarm_r')!.rotateZ(0.85);
  npc.update();
  expect(Math.max(...samples.map((v, i) => sample(v).distanceTo(initialPoints[i])))).toBeGreaterThan(0.045);
});
