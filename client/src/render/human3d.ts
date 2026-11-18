// v0.15 · Cuerpos humanos de Quaternius («Universal Base Characters», CC0 1.0): dos cuerpos base (masculino y femenino)
// con esqueleto de 65 huesos. Un solo cuerpo para todos (se comparte la geometría; se copia solo el esqueleto) y lo que
// cambia es la persona:
//  · la ropa se pinta encima del cuerpo por zonas (torso, mangas, pantalón, calzado), deducidas de qué hueso mueve cada
//    vértice, con los mismos tejidos del creador;
//  · el cromo convierte brazos, piernas o manos en metal con líneas de luz del color de acento;
//  · la cara se deforma un poco para cada persona (anchura de cabeza, mandíbula, nariz, barbilla, cejas, pómulos);
//  · la piel toma cualquier tono conservando el detalle de la textura.
// La animación es la del juego: los ángulos de cada articulación se pasan a los huesos, y la mano libre agarra el arma.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

export type BodyKind = 'masculino' | 'femenino';
interface RestBone { q: THREE.Quaternion; p: THREE.Vector3; m: THREE.Matrix4 }
/** v0.16 · Medidas del cuerpo en reposo (en T, metros) para cortar la ropa y colocar peinados y accesorios. */
export interface Landmarks {
  shX: number; elX: number; wrX: number; armY: number; hipY: number; legX: number; kneeY: number; ankY: number; pelvisY: number; chestY: number; neckY: number;
  headBase: number; headTop: number; eyeY: number; faceZ: number; mouthY: number; earX: number; headBackZ: number; eyeP: THREE.Vector3; eyeM: THREE.Vector3;
}
/** v0.16 · Datos de los vértices del cuerpo (para generar ropa, pelo y cromo a partir de la propia malla). */
export interface KitData {
  pos: Float32Array; nrm: Float32Array; uv: Float32Array; si: Uint16Array; sw: Float32Array; reg: Float32Array; bone: Int16Array; index: ArrayLike<number>;
  boneNames: string[]; L: Landmarks;
}
export interface Kit {
  scene: THREE.Group; bodyMat: THREE.MeshStandardMaterial; rest: Map<string, RestBone>; order: string[]; parent: Map<string, string | null>;
  headBase: number; headTop: number; eyeY: number; faceZ: number; data: KitData; kind: BodyKind;
}
interface HairKit { obj: THREE.Object3D; mat: THREE.MeshStandardMaterial; forBody: BodyKind }
let kits: { masculino: Kit; femenino: Kit; hair: Map<string, HairKit> } | null = null;
let started = false;
let version = 0;
/** Cambia cuando terminan de cargar los cuerpos (los personajes se rehacen para estrenarlos). */
export const humansVersion = () => version;
export const humansReady = () => !!kits;

/** Zona del cuerpo de cada hueso (para la ropa y el cromo). El lado +X del modelo son los huesos «_l». */
export const REG = { head: 0, neck: 1, torso: 2, pelvis: 3, uaP: 4, faP: 5, handP: 6, uaM: 7, faM: 8, handM: 9, thP: 10, caP: 11, ftP: 12, thM: 13, caM: 14, ftM: 15 } as const;
function regionOf(name: string): number {
  if (name === 'Head') return REG.head;
  if (name === 'neck_01') return REG.neck;
  if (name === 'pelvis' || name === 'root') return REG.pelvis;
  if (name.startsWith('spine') || name.startsWith('clavicle')) return REG.torso;
  const p = name.endsWith('_l');
  if (name.startsWith('upperarm')) return p ? REG.uaP : REG.uaM;
  if (name.startsWith('lowerarm')) return p ? REG.faP : REG.faM;
  if (name.startsWith('thigh')) return p ? REG.thP : REG.thM;
  if (name.startsWith('calf')) return p ? REG.caP : REG.caM;
  if (name.startsWith('foot') || name.startsWith('ball')) return p ? REG.ftP : REG.ftM;
  return p ? REG.handP : REG.handM; // mano y dedos
}

/** Carga (una vez) los dos cuerpos y los peinados del kit. */
export function loadHumans(onLoaded: () => void) {
  if (started) return; started = true;
  const L = new GLTFLoader();
  const base = '/models/humanos/';
  const body = async (file: string, kind: BodyKind): Promise<Kit> => {
    const g = await L.loadAsync(base + file);
    const scene = g.scene as THREE.Group;
    scene.updateMatrixWorld(true);
    let bodyMesh: THREE.SkinnedMesh | null = null;
    scene.traverse((o) => { const m = o as THREE.SkinnedMesh; if (m.isSkinnedMesh && (m.material as THREE.Material).name.includes('Superhero')) bodyMesh = m; });
    if (!bodyMesh) throw new Error('sin cuerpo en ' + file);
    const bm = bodyMesh as THREE.SkinnedMesh;
    // Zona de cada vértice según el hueso que más lo mueve.
    const geo = bm.geometry, si = geo.getAttribute('skinIndex'), sw = geo.getAttribute('skinWeight');
    const reg = new Float32Array(si.count);
    const names = bm.skeleton.bones.map((b) => b.name);
    for (let v = 0; v < si.count; v++) {
      let best = 0, bw = -1;
      for (let k = 0; k < 4; k++) { const w = sw.getComponent(v, k); if (w > bw) { bw = w; best = si.getComponent(v, k); } }
      reg[v] = regionOf(names[best] ?? 'spine_01');
    }
    geo.setAttribute('aRegion', new THREE.BufferAttribute(reg, 1));
    const rest = new Map<string, RestBone>(), order: string[] = [], parent = new Map<string, string | null>();
    for (const b of bm.skeleton.bones) {
      b.updateWorldMatrix(true, false);
      rest.set(b.name, { q: b.getWorldQuaternion(new THREE.Quaternion()), p: b.getWorldPosition(new THREE.Vector3()), m: b.matrixWorld.clone() });
      order.push(b.name); parent.set(b.name, (b.parent as THREE.Bone)?.isBone ? b.parent!.name : null);
    }
    const bodyMat = bm.material as THREE.MeshStandardMaterial;
    for (const t of [bodyMat.map, bodyMat.normalMap]) if (t) { t.anisotropy = 8; t.needsUpdate = true; }
    const head = rest.get('Head')!.p;
    const bb = new THREE.Box3().setFromBufferAttribute(geo.getAttribute('position') as THREE.BufferAttribute);
    const eyeY = kind === 'masculino' ? 1.7 : 1.656, faceZ = kind === 'masculino' ? 0.1 : 0.095;
    // v0.16 · Copia de los vértices (normales soldadas: los vértices duplicados por las costuras de la textura comparten
    // normal, así la ropa que sale de ellos no se abre), hueso dominante y medidas del cuerpo.
    const pa = geo.getAttribute('position'), na = geo.getAttribute('normal'), ua = geo.getAttribute('uv');
    const n = pa.count, pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2), siA = new Uint16Array(n * 4), swA = new Float32Array(n * 4), bone = new Int16Array(n);
    const weld = new Map<string, number[]>();
    for (let v = 0; v < n; v++) {
      pos[v * 3] = pa.getX(v); pos[v * 3 + 1] = pa.getY(v); pos[v * 3 + 2] = pa.getZ(v);
      uv[v * 2] = ua.getX(v); uv[v * 2 + 1] = ua.getY(v);
      let best = 0, bw = -1;
      for (let k = 0; k < 4; k++) { siA[v * 4 + k] = si.getComponent(v, k); const w = sw.getComponent(v, k); swA[v * 4 + k] = w; if (w > bw) { bw = w; best = si.getComponent(v, k); } }
      bone[v] = best;
      const key = `${Math.round(pos[v * 3] * 4000)},${Math.round(pos[v * 3 + 1] * 4000)},${Math.round(pos[v * 3 + 2] * 4000)}`;
      (weld.get(key) ?? weld.set(key, []).get(key)!).push(v);
    }
    for (const vs of weld.values()) {
      let x = 0, y = 0, z = 0;
      for (const v of vs) { x += na.getX(v); y += na.getY(v); z += na.getZ(v); }
      const l = Math.hypot(x, y, z) || 1;
      for (const v of vs) { nrm[v * 3] = x / l; nrm[v * 3 + 1] = y / l; nrm[v * 3 + 2] = z / l; }
    }
    const R = (nm: string) => rest.get(nm)!.p;
    let earX = 0.07, backZ = -0.1;
    for (let v = 0; v < n; v++) if (reg[v] === REG.head) { const y = pos[v * 3 + 1]; if (Math.abs(y - (eyeY - 0.015)) < 0.02) earX = Math.max(earX, Math.abs(pos[v * 3])); if (y > eyeY) backZ = Math.min(backZ, pos[v * 3 + 2]); }
    // Centro de cada ojo (malla de los ojos).
    const eyeP = new THREE.Vector3(0.032, eyeY, faceZ - 0.01), eyeM = new THREE.Vector3(-0.032, eyeY, faceZ - 0.01);
    scene.traverse((o) => {
      const m = o as THREE.SkinnedMesh; if (!m.isMesh || !(m.material as THREE.Material).name.includes('Eyes')) return;
      const p = m.geometry.getAttribute('position'); const a = new THREE.Vector3(), b = new THREE.Vector3(); let ca = 0, cb = 0;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i); if (x > 0) { a.x += x; a.y += p.getY(i); a.z += p.getZ(i); ca++; } else { b.x += x; b.y += p.getY(i); b.z += p.getZ(i); cb++; } }
      if (ca) eyeP.copy(a.multiplyScalar(1 / ca)); if (cb) eyeM.copy(b.multiplyScalar(1 / cb));
    });
    const LM: Landmarks = { shX: R('upperarm_l').x, elX: R('lowerarm_l').x, wrX: R('hand_l').x, armY: R('upperarm_l').y, hipY: R('thigh_l').y, legX: R('thigh_l').x, kneeY: R('calf_l').y, ankY: R('foot_l').y,
      pelvisY: R('pelvis').y, chestY: R('spine_03').y, neckY: R('neck_01').y, headBase: head.y, headTop: bb.max.y, eyeY, faceZ, mouthY: eyeY - 0.07, earX, headBackZ: backZ, eyeP, eyeM };
    const data: KitData = { pos, nrm, uv, si: siA, sw: swA, reg, bone, index: geo.index ? geo.index.array : Array.from({ length: n }, (_, i) => i), boneNames: names, L: LM };
    return { scene, bodyMat, rest, order, parent, headBase: head.y, headTop: bb.max.y, eyeY, faceZ, data, kind };
  };
  const hair = async (name: string, forBody: BodyKind): Promise<[string, HairKit]> => {
    const g = await L.loadAsync(base + name + '.gltf');
    const obj = g.scene;
    // Dos peinados vienen en centímetros y con el eje Z hacia arriba: se ponen como los demás.
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    if (box.max.y < 1) { obj.rotation.x = -Math.PI / 2; obj.updateMatrixWorld(true); }
    let mat: THREE.MeshStandardMaterial | null = null;
    obj.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) mat = m.material as THREE.MeshStandardMaterial; });
    return [name, { obj, mat: mat!, forBody }];
  };
  Promise.all([body('Superhero_Male_FullBody.gltf', 'masculino'), body('Superhero_Female_FullBody.gltf', 'femenino'),
    Promise.all([hair('Hair_Long', 'femenino'), hair('Hair_Buns', 'femenino'), hair('Hair_BuzzedFemale', 'femenino'), hair('Hair_Buzzed', 'masculino'), hair('Hair_SimpleParted', 'masculino'), hair('Hair_Beard', 'masculino')])])
    .then(([m, f, hs]) => { kits = { masculino: m, femenino: f, hair: new Map(hs) }; version++; onLoaded(); })
    .catch((err) => console.warn('[cuerpos 3D]', err));
}

// ------------------------------------------------------------------------------------------------ material
const BASE_SKIN = new THREE.Color().setRGB(0.39, 0.18, 0.083); // color medio (lineal) de la piel de las texturas
export interface Look {
  skin: string; top: THREE.Texture | null; pants: THREE.Texture | null; shoe: string; accent: string; cover: number[];
  /** v0.16 · 15 rasgos: anchura, mandíbula, nariz (largo), barbilla, cejas, pómulos, nariz (ancho), frente, labios, orejas,
   *  barbilla (ancho), altura de cejas, puente de la nariz, mofletes, largo de cabeza. */
  face: number[];
  /** Tatuaje corporal (lienzo transparente) y zonas donde va (por región del cuerpo, 0/1). */
  tattoo?: HTMLCanvasElement | null; tattooZones?: number[];
  /** Calcomanía de la cara (maquillaje, cicatrices, tatuaje facial, pecas), en el rectángulo de la cara de la textura. */
  decal?: HTMLCanvasElement | null;
}
const NO_TEX = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); NO_TEX.needsUpdate = true;
const canvasTex = (c: HTMLCanvasElement | null | undefined, repeat: boolean) => {
  if (!c) return NO_TEX;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};
/** Rectángulo de la cara en la textura del cuerpo (u y v de 0 a FACE_UV). Igual en los dos cuerpos. */
export const FACE_UV = 0.37;
/** v0.16 · Deformación de la cabeza de cada persona (la comparten el cuerpo y lo que va pegado a la cabeza: pelo,
 *  gorros, máscaras). Usa uFace…uFace4 y uHead; deforma `transformed` a partir de su posición en reposo. */
export const HEAD_MORPH = `        vec3 p = transformed;
        float hb = uHead.x, ht = uHead.y, fz = uHead.z, ey = uHead.w, mouthY = uHead.w - 0.07;
        float t = clamp((p.y - hb) / (ht - hb), 0.0, 1.0);
        transformed.x *= 1.0 + uFace.x * t;
        transformed.x *= 1.0 + uFace.y * clamp((mouthY + 0.02 - p.y) / 0.08, 0.0, 1.0);
        float front = smoothstep(fz - 0.06, fz - 0.005, p.z);
        float nose = exp(-p.x * p.x / 0.0006) * front * clamp(1.0 - abs(p.y - (ey - 0.035)) / 0.035, 0.0, 1.0);
        transformed.z += uFace.z * 0.014 * nose;
        transformed.x *= 1.0 + uFace2.z * nose;
        transformed.y -= uFace.w * 0.014 * clamp((mouthY - 0.02 - p.y) / 0.05, 0.0, 1.0) * front;
        transformed.z += uFace2.x * 0.006 * front * clamp(1.0 - abs(p.y - (ey + 0.022)) / 0.012, 0.0, 1.0);
        transformed.x += sign(p.x) * uFace2.y * 0.006 * front * clamp(1.0 - abs(p.y - (ey - 0.025)) / 0.02, 0.0, 1.0) * smoothstep(0.03, 0.055, abs(p.x));
        // v0.16 · Más rasgos: frente, labios, orejas, ancho de barbilla, altura de cejas, puente de la nariz, mofletes y largo.
        transformed.z += uFace3.x * 0.008 * front * smoothstep(ey + 0.02, ey + 0.08, p.y);
        transformed.z += uFace3.y * 0.005 * exp(-p.x * p.x / 0.0005) * exp(-(p.y - mouthY) * (p.y - mouthY) / 0.00012) * front;
        float ear = smoothstep(0.058, 0.072, abs(p.x)) * clamp(1.0 - abs(p.y - (ey - 0.015)) / 0.035, 0.0, 1.0) * step(p.z, 0.04);
        transformed.x += sign(p.x) * uFace3.z * 0.009 * ear; transformed.y += uFace3.z * 0.004 * ear;
        transformed.x *= 1.0 + uFace3.w * 0.22 * clamp((mouthY - 0.03 - p.y) / 0.04, 0.0, 1.0);
        transformed.y += uFace4.x * 0.004 * front * clamp(1.0 - abs(p.y - (ey + 0.022)) / 0.012, 0.0, 1.0);
        transformed.z += uFace4.y * 0.006 * exp(-p.x * p.x / 0.0003) * front * clamp(1.0 - abs(p.y - (ey - 0.005)) / 0.02, 0.0, 1.0);
        float cheek = front * smoothstep(0.025, 0.05, abs(p.x)) * clamp(1.0 - abs(p.y - (ey - 0.045)) / 0.03, 0.0, 1.0);
        transformed.z += uFace4.z * 0.007 * cheek; transformed.x += sign(p.x) * uFace4.z * 0.005 * cheek;
        transformed.y += uFace4.w * 0.022 * t * t;
`;
export const HEAD_UNIFORMS = 'uniform vec4 uFace;\nuniform vec4 uFace2;\nuniform vec4 uFace3;\nuniform vec4 uFace4;\nuniform vec4 uHead;\n';
/** Material del cuerpo para una persona: piel teñida, ropa por zonas, cromo con líneas de luz y cara propia. */
function bodyMaterial(kit: Kit, look: Look): THREE.MeshStandardMaterial {
  const m = kit.bodyMat.clone();
  const skin = new THREE.Color(look.skin);
  const tint = new THREE.Vector3(Math.min(8, skin.r / BASE_SKIN.r), Math.min(8, skin.g / BASE_SKIN.g), Math.min(8, skin.b / BASE_SKIN.b));
  const uniforms = {
    uSkin: { value: tint }, uTop: { value: look.top }, uPants: { value: look.pants }, uShoe: { value: new THREE.Color(look.shoe) },
    uMetal: { value: new THREE.Color(0xb8c0cc) }, uAccent: { value: new THREE.Color(look.accent) }, uCover: { value: look.cover },
    uFace: { value: new THREE.Vector4(look.face[0], look.face[1], look.face[2], look.face[3]) }, uFace2: { value: new THREE.Vector4(look.face[4], look.face[5], look.face[6], 0) },
    uFace3: { value: new THREE.Vector4(look.face[7] ?? 0, look.face[8] ?? 0, look.face[9] ?? 0, look.face[10] ?? 0) }, uFace4: { value: new THREE.Vector4(look.face[11] ?? 0, look.face[12] ?? 0, look.face[13] ?? 0, look.face[14] ?? 0) },
    uHead: { value: new THREE.Vector4(kit.headBase, kit.headTop, kit.faceZ, kit.eyeY) },
    uTat: { value: canvasTex(look.tattoo, true) }, uTatZ: { value: look.tattooZones ?? new Array(16).fill(0) },
    uDecal: { value: canvasTex(look.decal, false) }, uDecalOn: { value: look.decal ? 1 : 0 },
    uArm: { value: new THREE.Vector4(kit.data.L.shX, kit.data.L.armY, kit.data.L.legX, kit.data.L.hipY) },
  };
  m.userData.face = { uFace: uniforms.uFace, uFace2: uniforms.uFace2, uFace3: uniforms.uFace3, uFace4: uniforms.uFace4, uHead: uniforms.uHead };
  if (look.tattoo || look.decal) m.userData.owned = [uniforms.uTat.value, uniforms.uDecal.value].filter((t) => t !== NO_TEX);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = 'attribute float aRegion;\nvarying float vRegion;\nvarying vec3 vRP;\nuniform vec4 uFace;\nuniform vec4 uFace2;\nuniform vec4 uFace3;\nuniform vec4 uFace4;\nuniform vec4 uHead;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vRegion = aRegion; vRP = position;
      if (aRegion < 0.5) {
${HEAD_MORPH}
      }`);
    sh.fragmentShader = 'varying float vRegion;\nvarying vec3 vRP;\nuniform sampler2D uTat;\nuniform float uTatZ[16];\nuniform sampler2D uDecal;\nuniform float uDecalOn;\nuniform vec4 uArm;\nuniform vec3 uSkin;\nuniform sampler2D uTop;\nuniform sampler2D uPants;\nuniform vec3 uShoe;\nuniform vec3 uMetal;\nuniform vec3 uAccent;\nuniform float uCover[16];\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        int rg = int(vRegion + 0.5);
        float cov = 0.0;
        for (int i = 0; i < 16; i++) { if (i == rg) cov = uCover[i]; }
        // 0 piel · 1 tela de arriba · 2 pantalón · 3 calzado · 4 cromo · 5 sustituido por una pieza robótica
        if (cov > 4.5) discard;
        if (cov < 0.5) {
          diffuseColor.rgb *= uSkin;
          // v0.16 · Tatuaje proyectado sobre la piel según la zona (cilindro en brazos, piernas y cuello; plano en el tronco).
          float tz = 0.0; for (int i = 0; i < 16; i++) { if (i == rg) tz = uTatZ[i]; }
          if (tz > 0.5) {
            vec2 tuv;
            if (rg >= 4 && rg <= 9) tuv = vec2(atan(vRP.z, vRP.y - uArm.y) / 6.2831 * 2.0, abs(vRP.x) * 3.2);
            else if (rg >= 10) tuv = vec2(atan(vRP.z, vRP.x - sign(vRP.x) * uArm.z) / 6.2831 * 2.0, vRP.y * 2.6);
            else if (rg == 1) tuv = vec2(atan(vRP.z, vRP.x) / 6.2831 * 3.0, vRP.y * 7.0);
            else tuv = vec2(vRP.x * 3.0 + 0.5, vRP.y * 3.0);
            vec4 tt = texture2D(uTat, tuv);
            diffuseColor.rgb = mix(diffuseColor.rgb, tt.rgb, tt.a * 0.9);
          }
          if (uDecalOn > 0.5 && rg == 0 && vMapUv.x < ${FACE_UV.toFixed(3)} && vMapUv.y < ${FACE_UV.toFixed(3)}) {
            vec4 dc = texture2D(uDecal, vMapUv / ${FACE_UV.toFixed(3)});
            diffuseColor.rgb = mix(diffuseColor.rgb, dc.rgb, dc.a);
          }
        }
        else if (cov < 1.5) diffuseColor.rgb = texture2D(uTop, vMapUv * 6.0).rgb * (0.75 + 0.25 * diffuseColor.r / 0.4);
        else if (cov < 2.5) diffuseColor.rgb = texture2D(uPants, vMapUv * 6.0).rgb * (0.75 + 0.25 * diffuseColor.r / 0.4);
        else if (cov < 3.5) diffuseColor.rgb = uShoe;
        else diffuseColor.rgb = uMetal * (0.7 + 0.3 * diffuseColor.r / 0.4);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n if (cov > 3.5) roughnessFactor = 0.28; else if (cov > 0.5) roughnessFactor = 0.82;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = cov > 3.5 ? 0.85 : 0.0;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n if (cov > 3.5) totalEmissiveRadiance += uAccent * step(0.93, fract(vMapUv.y * 22.0)) * 0.9;');
  };
  m.customProgramCacheKey = () => 'vt-humano-2';
  return m;
}

// ------------------------------------------------------------------------------------------------ persona
export interface Human {
  root: THREE.Object3D; mats: THREE.Material[]; kind: BodyKind;
  /** v0.16 · Malla del cuerpo de esta persona (la ropa se une a su esqueleto). */
  bodyMesh: THREE.SkinnedMesh;
  /** Contenedores con ejes del mundo (en reposo) para colgar cosas: cabeza, pecho, cadera y manos. */
  head: THREE.Group; headBind: THREE.Group; chest: THREE.Group; hips: THREE.Group; handP: THREE.Group; handM: THREE.Group;
  bones: Map<string, THREE.Bone>; kit: Kit;
  /** Cuelga un contenedor (ejes del mundo en reposo) de un hueso, con origen en P (espacio del cuerpo en reposo). */
  attach: (boneName: string, P: THREE.Vector3, extraQ?: THREE.Quaternion) => THREE.Group;
}
export interface HumanOpts { kind: BodyKind; look: Look; hair: string; hairColor: string; beard: boolean; eyes: string; lost: Set<string> }
const qDownP = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0.08, -1, 0).normalize());
const qDownM = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(-0.08, -1, 0).normalize());

export function makeHuman(o: HumanOpts): Human | null {
  if (!kits) return null;
  const kit = kits[o.kind];
  const root = cloneSkinned(kit.scene) as THREE.Object3D;
  const mats: THREE.Material[] = [];
  const bones = new Map<string, THREE.Bone>();
  let bodyMesh: THREE.SkinnedMesh | null = null;
  root.traverse((x) => {
    if ((x as THREE.Bone).isBone) bones.set(x.name, x as THREE.Bone);
    const m = x as THREE.SkinnedMesh;
    if (!m.isMesh) return;
    m.frustumCulled = false; // (los huesos se mueven: la caja de reposo no sirve para recortar)
    const name = (m.material as THREE.Material).name;
    if (name.includes('Superhero')) { const bm = bodyMaterial(kit, o.look); m.material = bm; mats.push(bm); bodyMesh = m as THREE.SkinnedMesh; }
    else if (name.includes('Eyes')) { const em = (m.material as THREE.MeshStandardMaterial).clone(); em.color = new THREE.Color(1, 1, 1).lerp(new THREE.Color(o.eyes), 0.55).multiplyScalar(1.15); m.material = em; mats.push(em); }
    else { const hm = (m.material as THREE.MeshStandardMaterial).clone(); hm.color = new THREE.Color(o.hairColor).multiplyScalar(1.6); m.material = hm; mats.push(hm); } // cejas
  });
  // Miembros perdidos: el hueso se encoge (desaparece el brazo o la pierna entera).
  for (const [part, bone] of [['brazo_der', 'upperarm_l'], ['brazo_izq', 'upperarm_r'], ['pierna_der', 'thigh_l'], ['pierna_izq', 'thigh_r'], ['mano_der', 'hand_l'], ['mano_izq', 'hand_r']] as const) {
    if (o.lost.has(part)) bones.get(bone)?.scale.setScalar(0.0001);
  }
  // Contenedor con ejes del mundo en reposo, colgado de un hueso, con su origen en el punto P (en el espacio del cuerpo).
  const attach = (boneName: string, P: THREE.Vector3, extraQ?: THREE.Quaternion) => {
    const b = bones.get(boneName)!, r = kit.rest.get(boneName)!;
    const g = new THREE.Group();
    const inv = r.m.clone().invert();
    g.position.copy(P.clone().applyMatrix4(inv));
    const wq = extraQ ? extraQ.clone().multiply(r.q) : r.q.clone();
    g.quaternion.copy(wq.invert());
    b.add(g);
    return g;
  };
  const hp = kit.rest.get('Head')!.p;
  const head = attach('Head', new THREE.Vector3(0, (kit.headBase + kit.headTop) / 2 + 0.005, hp.z - 0.005));
  head.scale.setScalar(0.8); // los accesorios del juego se hicieron para una cabeza algo mayor
  const headBind = new THREE.Group();
  { const r = kit.rest.get('Head')!; const inv = r.m.clone().invert(); inv.decompose(headBind.position, headBind.quaternion, headBind.scale); bones.get('Head')!.add(headBind); }
  const chest = attach('spine_03', kit.rest.get('spine_03')!.p.clone().add(new THREE.Vector3(0, -0.07, 0)));
  const hips = attach('pelvis', kit.rest.get('pelvis')!.p.clone().add(new THREE.Vector3(0, -0.03, 0)));
  const handP = attach('hand_l', kit.rest.get('hand_l')!.p, qDownP);
  const handM = attach('hand_r', kit.rest.get('hand_r')!.p, qDownM);
  // Peinado del kit (si toca) y barba.
  const addHair = (name: string) => {
    const h = kits!.hair.get(name); if (!h) return;
    const c = h.obj.clone(true);
    const hm = h.mat.clone(); hm.color = new THREE.Color(o.hairColor).multiplyScalar(1.7); mats.push(hm);
    // v0.16 · El pelo del kit sigue la forma de la cabeza de esta persona (si no, la coronilla asomaba).
    const fu = (bodyMesh?.material as THREE.Material | undefined)?.userData.face;
    if (fu) {
      hm.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, fu); sh.vertexShader = HEAD_UNIFORMS + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n{\n${HEAD_MORPH}\n}`); };
      hm.customProgramCacheKey = () => 'vt-pelo-kit-1';
    }
    c.traverse((x) => { const m = x as THREE.Mesh; if (m.isMesh) { m.material = hm; m.frustumCulled = false; } });
    // Si el peinado es del otro cuerpo, se sube o baja a la altura de esta cabeza.
    if (h.forBody !== o.kind) c.position.y += o.kind === 'masculino' ? 0.043 : -0.043;
    headBind.add(c);
  };
  if (o.hair) addHair(o.kind === 'femenino' && o.hair === 'Hair_Buzzed' ? 'Hair_BuzzedFemale' : o.hair);
  if (o.beard && o.kind === 'masculino') addHair('Hair_Beard');
  return { root, mats, kind: o.kind, head, headBind, chest, hips, handP, handM, bones, kit, attach, bodyMesh: bodyMesh! };
}

// ------------------------------------------------------------------------------------------------ pose
const tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion(), qx = new THREE.Quaternion();
const eul = (o: THREE.Object3D) => new THREE.Quaternion().setFromEuler(o.rotation);
const rx = (a: number) => qx.clone().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a);
const rz = (a: number) => qx.clone().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);
export interface PoseIn {
  hips: THREE.Object3D; spine: THREE.Object3D; chest: THREE.Object3D; neck: THREE.Object3D;
  thighP: THREE.Object3D; kneeP: THREE.Object3D; thighM: THREE.Object3D; kneeM: THREE.Object3D;
  shP: THREE.Object3D; elP: THREE.Object3D; shM: THREE.Object3D; elM: THREE.Object3D;
  gripP: number; gripM: number;
}
/** Pasa la pose del juego (ángulos por articulación, con los ejes del mundo) a los huesos del esqueleto. */
export function poseHuman(h: Human, p: PoseIn) {
  const k = h.kit, D = new Map<string, THREE.Quaternion>(), W = new Map<string, THREE.Quaternion>();
  const Dp = eul(p.hips), Ds = Dp.clone().multiply(eul(p.spine)), Dn = Ds.clone().multiply(eul(p.neck));
  const armP = Ds.clone().multiply(eul(p.shP)), armM = Ds.clone().multiply(eul(p.shM));
  const foreP = armP.clone().multiply(rx(p.elP.rotation.x)), foreM = armM.clone().multiply(rx(p.elM.rotation.x));
  const legP = Dp.clone().multiply(rx(p.thighP.rotation.x)), legM = Dp.clone().multiply(rx(p.thighM.rotation.x));
  const curlP = rz(-1.1 * p.gripP), curlM = rz(1.1 * p.gripM);
  for (const name of k.order) {
    const par = k.parent.get(name) ?? null;
    let d: THREE.Quaternion;
    switch (name) {
      case 'pelvis': d = Dp; break;
      case 'spine_01': case 'spine_02': case 'spine_03': d = Ds; break;
      case 'neck_01': case 'Head': d = Dn; break;
      case 'upperarm_l': d = armP.clone().multiply(qDownP); break;
      case 'lowerarm_l': case 'hand_l': d = foreP.clone().multiply(qDownP); break;
      case 'upperarm_r': d = armM.clone().multiply(qDownM); break;
      case 'lowerarm_r': case 'hand_r': d = foreM.clone().multiply(qDownM); break;
      case 'thigh_l': d = legP; break;
      case 'calf_l': case 'foot_l': case 'ball_l': case 'ball_leaf_l': d = legP.clone().multiply(rx(p.kneeP.rotation.x)); break;
      case 'thigh_r': d = legM; break;
      case 'calf_r': case 'foot_r': case 'ball_r': case 'ball_leaf_r': d = legM.clone().multiply(rx(p.kneeM.rotation.x)); break;
      default: {
        // Dedos: se cierran sobre la palma (agarre del arma) en el marco del brazo colgando.
        const m = /^(index|middle|ring|pinky|thumb)_0([123])_([lr])$/.exec(name);
        if (m) {
          const side = m[3] === 'l', seg = Number(m[2]), thumb = m[1] === 'thumb';
          const fore = side ? foreP : foreM, down = side ? qDownP : qDownM, c = side ? curlP : curlM;
          let acc = new THREE.Quaternion();
          for (let i = 0; i < seg; i++) acc = acc.multiply(thumb ? new THREE.Quaternion().slerp(c, 0.5) : c);
          d = fore.clone().multiply(acc).multiply(down);
        } else d = par ? D.get(par)! : new THREE.Quaternion();
      }
    }
    D.set(name, d);
    const r = k.rest.get(name)!;
    const w = d.clone().multiply(r.q); W.set(name, w);
    const pw = par ? W.get(par)! : new THREE.Quaternion();
    h.bones.get(name)!.quaternion.copy(tmpQ.copy(pw).invert().multiply(w));
  }
  const sp = h.bones.get('spine_03'); if (sp) sp.scale.setScalar(p.chest.scale.x);
  return W;
}

/** La mano libre (lado −X) va al guardamanos del arma: cinemática inversa de dos huesos (brazo y antebrazo). */
export function supportHand(h: Human, W: Map<string, THREE.Quaternion>, marker: THREE.Object3D) {
  const k = h.kit;
  h.root.updateMatrixWorld(true);
  const T = h.root.worldToLocal(marker.getWorldPosition(new THREE.Vector3()));
  const rU = k.rest.get('upperarm_r')!, rL = k.rest.get('lowerarm_r')!, rH = k.rest.get('hand_r')!;
  const S = h.bones.get('upperarm_r')!.getWorldPosition(new THREE.Vector3()); h.root.worldToLocal(S);
  const a = rU.p.distanceTo(rL.p), b = rL.p.distanceTo(rH.p);
  // La muñeca se queda un palmo antes del punto: así es la palma la que cierra sobre el guardamanos.
  const toT = T.clone().sub(S); let d = toT.length() - 0.06;
  if (d < 1e-4) return;
  d = Math.min(d, a + b - 0.002); toT.setLength(d);
  const cosA = THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  const dir = toT.clone().normalize();
  const pole = new THREE.Vector3(-0.5, -1, -0.4);
  const n = new THREE.Vector3().crossVectors(dir, pole).normalize();
  const bend = new THREE.Vector3().crossVectors(n, dir).normalize();
  const E = S.clone().addScaledVector(dir, a * cosA).addScaledVector(bend, a * sinA);
  const Tn = S.clone().add(toT);
  const restU = rL.p.clone().sub(rU.p).normalize(), restL = rH.p.clone().sub(rL.p).normalize();
  const qU = new THREE.Quaternion().setFromUnitVectors(restU, E.clone().sub(S).normalize());
  const qL = new THREE.Quaternion().setFromUnitVectors(restL, Tn.clone().sub(E).normalize());
  const wU = qU.clone().multiply(rU.q), wL = qL.clone().multiply(rL.q), wH = qL.clone().multiply(rH.q);
  const wClav = W.get('clavicle_r') ?? new THREE.Quaternion();
  h.bones.get('upperarm_r')!.quaternion.copy(tmpQ.copy(wClav).invert().multiply(wU));
  h.bones.get('lowerarm_r')!.quaternion.copy(tmpQ2.copy(wU).invert().multiply(wL));
  h.bones.get('hand_r')!.quaternion.copy(tmpQ.copy(wL).invert().multiply(wH));
}
