// v0.17 · Superarmadura experimental «Tormenta»: el modelo «Ophiel» que dejó el dueño en la release «armaduras»
// (escultura de 27 millones de polígonos reducida a ~150 000 en Blender y separada por partes del cuerpo). Mide unas
// dos veces lo que una persona, con alas y halo; el piloto va dentro. Negra con detalles y filos de azul neón.
// No tiene esqueleto: cada parte (cabeza, torso, brazos, antebrazos, muslos, espinillas, pies, alas) cuelga de su
// articulación y se mueve con la misma pose del juego que la persona. Se descarga solo cuando alguien la lleva puesta.
// El archivo no va en el repositorio (licencia sin confirmar): lo baja `tools/fetch-assets.mjs` desde la release.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const URL_MODEL = '/models/extra/tormenta.glb';
let parts: Map<string, THREE.BufferGeometry> | null = null;
let loading = false, failed = false, version = 0;
export const tormentaVersion = () => version;
/** Empieza a cargarla (una vez). `onLoaded` se llama al terminar. */
export function loadTormenta(onLoaded: () => void) {
  if (loading || parts || failed) return;
  loading = true;
  new GLTFLoader().loadAsync(URL_MODEL).then((g) => {
    const m = new Map<string, THREE.BufferGeometry>();
    g.scene.updateMatrixWorld(true);
    g.scene.traverse((o) => { const me = o as THREE.Mesh; if (me.isMesh) { const geo = me.geometry.clone().applyMatrix4(me.matrixWorld); geo.computeVertexNormals(); m.set(me.name || o.parent?.name || '', geo); } });
    // (Blender exporta el nodo con el nombre de la parte; la malla puede llevar el del material.)
    g.scene.traverse((o) => { const me = o as THREE.Mesh; if (me.isMesh && o.name && !m.has(o.name)) m.set(o.name, me.geometry); });
    parts = m; version++; onLoaded();
  }).catch((err) => { failed = true; console.warn('[tormenta] no se pudo cargar el modelo', err); });
}
export const tormentaReady = () => !!parts;

/** Pivotes de las articulaciones en el espacio del modelo (metros del modelo, +Y arriba, mira a +Z). */
const PIV: Record<string, [number, number, number]> = {
  pelvis: [0, -0.32, -0.05], spine: [0, -0.15, -0.05], neck: [0, 0.93, -0.05],
  shL: [0.42, 0.86, -0.08], elL: [0.55, 0.42, -0.08], shR: [-0.42, 0.86, -0.08], elR: [-0.55, 0.42, -0.08],
  hipL: [0.2, -0.45, -0.05], knL: [0.27, -1.14, -0.05], anL: [0.3, -1.62, -0.05],
  hipR: [-0.2, -0.45, -0.05], knR: [-0.27, -1.14, -0.05], anR: [-0.3, -1.62, -0.05],
};
const FEET_Y = -2.15, SCALE = 1.05;

/** Material de las placas: negro metálico con filo de luz azul neón (más fuerte en los bordes de cada pieza). */
function armorMat(accent: THREE.Color, pulse: { value: number }) {
  const m = new THREE.MeshStandardMaterial({ color: 0x08090c, metalness: 0.92, roughness: 0.28 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNeon = { value: accent }; sh.uniforms.uPulse = pulse;
    sh.fragmentShader = 'uniform vec3 uNeon;\nuniform float uPulse;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float rim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 3.0);
      totalEmissiveRadiance += uNeon * rim * (0.55 + 0.35 * uPulse);`);
  };
  m.customProgramCacheKey = () => 'vt-tormenta-placa-1';
  return m;
}

export interface Tormenta {
  root: THREE.Group; mats: THREE.Material[]; pulse: { value: number };
  pelvis: THREE.Group; spine: THREE.Group; neck: THREE.Group; halo: THREE.Object3D | null;
  shL: THREE.Group; elL: THREE.Group; shR: THREE.Group; elR: THREE.Group;
  hipL: THREE.Group; knL: THREE.Group; hipR: THREE.Group; knR: THREE.Group; wingL: THREE.Object3D | null; wingR: THREE.Object3D | null;
}
/** Monta la armadura (necesita el modelo cargado). Pies en y = 0, mirando a +Z, de unos 3,5 m. */
export function buildTormenta(neon = '#2fb8ff'): Tormenta | null {
  if (!parts) return null;
  const accent = new THREE.Color(neon), pulse = { value: 0 };
  const plate = armorMat(accent, pulse);
  const glow = new THREE.MeshBasicMaterial({ color: accent.clone().multiplyScalar(1.7), toneMapped: false });
  const root = new THREE.Group(); root.scale.setScalar(SCALE); root.position.y = -FEET_Y * SCALE;
  const V = (k: string) => new THREE.Vector3(...PIV[k]);
  // Grupo con pivote en `k`, colgado de `parent` (cuyo pivote es `pk`).
  const joint = (parent: THREE.Object3D, pk: string | null, k: string) => { const g = new THREE.Group(); g.position.copy(V(k)).sub(pk ? V(pk) : new THREE.Vector3()); parent.add(g); return g; };
  const put = (g: THREE.Object3D, k: string, name: string) => {
    for (const [n, mat] of [[name, plate], [name + '_g', glow]] as const) {
      const geo = parts!.get(n); if (!geo) continue;
      const me = new THREE.Mesh(geo, n === 'halo' ? glow : mat); me.position.copy(V(k)).negate(); me.frustumCulled = false; g.add(me);
      if (n === 'halo' || n.startsWith('wing')) return me;
    }
    return null;
  };
  const pelvis = joint(root, null, 'pelvis'); put(pelvis, 'pelvis', 'pelvis');
  const spine = joint(pelvis, 'pelvis', 'spine'); put(spine, 'spine', 'torso');
  const wingL = put(spine, 'spine', 'wingL'), wingR = put(spine, 'spine', 'wingR');
  const neck = joint(spine, 'spine', 'neck'); put(neck, 'neck', 'head'); const halo = put(neck, 'neck', 'halo');
  const shL = joint(spine, 'spine', 'shL'); put(shL, 'shL', 'uaL'); const elL = joint(shL, 'shL', 'elL'); put(elL, 'elL', 'faL');
  const shR = joint(spine, 'spine', 'shR'); put(shR, 'shR', 'uaR'); const elR = joint(shR, 'shR', 'elR'); put(elR, 'elR', 'faR');
  const hipL = joint(pelvis, 'pelvis', 'hipL'); put(hipL, 'hipL', 'thL'); const knL = joint(hipL, 'hipL', 'knL'); put(knL, 'knL', 'shL'); const anL = joint(knL, 'knL', 'anL'); put(anL, 'anL', 'ftL');
  const hipR = joint(pelvis, 'pelvis', 'hipR'); put(hipR, 'hipR', 'thR'); const knR = joint(hipR, 'hipR', 'knR'); put(knR, 'knR', 'shR'); const anR = joint(knR, 'knR', 'anR'); put(anR, 'anR', 'ftR');
  // Halo: además de brillar, gira despacio sobre su centro (se recoloca su pivote).
  if (halo) { const bb = new THREE.Box3().setFromObject(halo); const c = bb.getCenter(new THREE.Vector3()); const hg = new THREE.Group(); hg.position.copy(c); neck.add(hg); halo.position.sub(c); hg.add(halo); }
  return { root, mats: [plate, glow], pulse, pelvis, spine, neck, halo: halo?.parent ?? null, shL, elL, shR, elR, hipL, knL, hipR, knR, wingL, wingR };
}

/** Pose del juego (mismos proxies que la persona) + vida propia: halo que gira, alas que respiran, neón que late. */
export function poseTormenta(m: Tormenta, p: { hips: THREE.Object3D; spine: THREE.Object3D; neck: THREE.Object3D; shP: THREE.Object3D; elP: THREE.Object3D; shM: THREE.Object3D; elM: THREE.Object3D; thP: THREE.Object3D; knP: THREE.Object3D; thM: THREE.Object3D; knM: THREE.Object3D }, t: number) {
  m.pelvis.rotation.set(p.hips.rotation.x, p.hips.rotation.y, p.hips.rotation.z);
  m.spine.rotation.set(p.spine.rotation.x, p.spine.rotation.y, 0);
  m.neck.rotation.set(p.neck.rotation.x, p.neck.rotation.y, 0);
  m.shL.rotation.set(p.shP.rotation.x, 0, p.shP.rotation.z); m.elL.rotation.set(p.elP.rotation.x, 0, 0);
  m.shR.rotation.set(p.shM.rotation.x, 0, p.shM.rotation.z); m.elR.rotation.set(p.elM.rotation.x, 0, 0);
  m.hipL.rotation.set(p.thP.rotation.x, 0, 0); m.knL.rotation.set(p.knP.rotation.x, 0, 0);
  m.hipR.rotation.set(p.thM.rotation.x, 0, 0); m.knR.rotation.set(p.knM.rotation.x, 0, 0);
  if (m.halo) m.halo.rotation.y = t * 0.6;
  const breathe = Math.sin(t * 1.3) * 0.05;
  if (m.wingL) m.wingL.rotation.y = breathe; if (m.wingR) m.wingR.rotation.y = -breathe;
  m.pulse.value = 0.5 + 0.5 * Math.sin(t * 2.2);
}
