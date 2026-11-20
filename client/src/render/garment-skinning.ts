import * as THREE from 'three';

// Una geometría es compartida por todos los NPC; solo se remapea si el orden de
// los huesos del archivo difiere del del cuerpo. No se copia una malla por NPC.
const remapped = new WeakMap<THREE.BufferGeometry, Map<string, THREE.BufferGeometry>>();
const nearMatrix = (a: THREE.Matrix4, b: THREE.Matrix4) => a.elements.every((v, i) => Math.abs(v - b.elements[i]) < 1e-4);

/** Une una prenda en reposo UBC al mismo esqueleto que anima la piel. */
export function bindGarment(source: THREE.SkinnedMesh, body: THREE.SkinnedMesh): THREE.SkinnedMesh {
  const indices = source.geometry.getAttribute('skinIndex');
  if (!indices || !source.geometry.getAttribute('skinWeight')) throw new Error('Prenda sin pesos');
  const target = new Map(body.skeleton.bones.map((b, i) => [b.name, i]));
  const mapping = source.skeleton.bones.map((bone, i) => {
    const index = target.get(bone.name);
    if (index === undefined) throw new Error(`Falta el hueso ${bone.name}`);
    if (!nearMatrix(source.skeleton.boneInverses[i], body.skeleton.boneInverses[index])) throw new Error(`Reposo incompatible: ${bone.name}`);
    return index;
  });
  if (!nearMatrix(source.bindMatrix, body.bindMatrix)) throw new Error('Espacio de reposo incompatible');
  let geometry = source.geometry;
  if (mapping.some((index, i) => index !== i)) {
    const key = mapping.join(',');
    let entries = remapped.get(geometry);
    if (!entries) { entries = new Map(); remapped.set(geometry, entries); }
    let mapped = entries.get(key);
    if (!mapped) {
      // Comparte posiciones, UV, normales e índices; el único atributo distinto
      // es el índice del hueso. La caché pertenece a la geometría del recurso.
      mapped = new THREE.BufferGeometry(); mapped.setIndex(geometry.index);
      for (const [name, attribute] of Object.entries(geometry.attributes)) mapped.setAttribute(name, attribute);
      mapped.groups = geometry.groups.map((g) => ({ ...g }));
      const skinIndex = new Uint16Array(indices.count * 4);
      for (let v = 0; v < indices.count; v++) for (let k = 0; k < 4; k++) {
        const index = mapping[indices.getComponent(v, k)];
        if (index === undefined) throw new Error('Índice de hueso inválido');
        skinIndex[v * 4 + k] = index;
      }
      mapped.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
      mapped.boundingBox = geometry.boundingBox; mapped.boundingSphere = geometry.boundingSphere;
      entries.set(key, mapped);
    }
    geometry = mapped;
  }
  const mesh = new THREE.SkinnedMesh(geometry, source.material);
  mesh.name = source.name;
  mesh.position.copy(body.position); mesh.quaternion.copy(body.quaternion); mesh.scale.copy(body.scale);
  mesh.bind(body.skeleton, body.bindMatrix);
  mesh.frustumCulled = false;
  return mesh;
}
