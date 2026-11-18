// v0.17 · Superarmadura experimental «Tormenta»: el modelo «Ophiel» que dejó el dueño en la release «armaduras»
// (escultura de 27 millones de polígonos reducida a ~150 000 en Blender y separada por partes del cuerpo). Mide unas
// dos veces lo que una persona, con alas y halo; el piloto va dentro. Negra con detalles y filos de azul neón.
// No tiene esqueleto: cada parte (cabeza, torso, brazos, antebrazos, muslos, espinillas, pies, alas) cuelga de su
// articulación y se mueve con la misma pose del juego que la persona. Se descarga solo cuando alguien la lleva puesta.
// El archivo no va en el repositorio (licencia sin confirmar): lo baja `tools/fetch-assets.mjs` desde la release.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

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
/** ¿Se intentó descargar y no está? (entonces se monta la versión de placas, sin esperar). */
export const tormentaFailed = () => failed;

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
/** Monta la armadura. Pies en y = 0, mirando a +Z, de unos 3,5 m. v0.19: si el modelo de la release no está (o aún
 *  se descarga), se monta una Tormenta de placas con las mismas articulaciones: la armadura SIEMPRE sustituye al piloto. */
export function buildTormenta(neon = '#2fb8ff'): Tormenta {
  if (!parts) return buildPlated(neon);
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

// ------------------------------------------------------------------------------------------------ v0.19 · de placas
/** Tormenta hecha de placas (sin el modelo de la release): coraza negra con filos azul neón, núcleo de fusión en el
 *  pecho, casco con visor, hombreras, brazos y piernas blindados. Mismas articulaciones y tamaño que el modelo. */
function buildPlated(neon: string): Tormenta {
  const accent = new THREE.Color(neon), pulse = { value: 0 };
  const plate = armorMat(accent, pulse);
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1d24, metalness: 0.8, roughness: 0.45 });
  const glow = new THREE.MeshBasicMaterial({ color: accent.clone().multiplyScalar(1.7), toneMapped: false });
  const root = new THREE.Group(); root.scale.setScalar(SCALE); root.position.y = -FEET_Y * SCALE;
  const V = (k: string) => new THREE.Vector3(...PIV[k]);
  const joint = (parent: THREE.Object3D, pk: string | null, k: string) => { const g = new THREE.Group(); g.position.copy(V(k)).sub(pk ? V(pk) : new THREE.Vector3()); parent.add(g); return g; };
  const geos = new Map<string, THREE.BufferGeometry>();
  const box = (w: number, h: number, d: number, r = 0.05) => { const k = `${w}|${h}|${d}|${r}`; let g = geos.get(k); if (!g) { g = new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.1, h / 2.1, d / 2.1)); geos.set(k, g); } return g; };
  /** Pieza con su caja (centro relativo al pivote del grupo) y, si se pide, una franja de neón delante. */
  const piece = (g: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material = plate, neonStrip = false) => {
    const me = new THREE.Mesh(box(w, h, d), m); me.position.set(x, y, z); me.frustumCulled = false; g.add(me);
    if (neonStrip) { const st = new THREE.Mesh(box(w * 0.18, h * 0.7, 0.02, 0.008), glow); st.position.set(x, y, z + d / 2 + 0.004); g.add(st); }
    return me;
  };
  const pelvis = joint(root, null, 'pelvis');
  piece(pelvis, 0.66, 0.4, 0.44, 0, -0.1, 0); piece(pelvis, 0.3, 0.24, 0.12, 0, -0.16, 0.22, dark);
  const spine = joint(pelvis, 'pelvis', 'spine');
  // Coraza: pecho ancho, abdomen por placas y espalda con mochila del reactor.
  piece(spine, 1.0, 0.76, 0.6, 0, 0.72, 0); piece(spine, 0.72, 0.42, 0.5, 0, 0.28, 0); piece(spine, 0.6, 0.3, 0.44, 0, 0.0, 0, dark);
  for (const sx of [-1, 1]) piece(spine, 0.34, 0.32, 0.08, sx * 0.26, 0.8, 0.31, plate, true);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 28), glow); core.rotation.x = Math.PI / 2; core.position.set(0, 0.74, 0.31); spine.add(core);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 10, 32), dark); ring.position.set(0, 0.74, 0.32); spine.add(ring);
  piece(spine, 0.66, 0.66, 0.3, 0, 0.72, -0.42, dark);
  for (const sx of [-1, 1]) { const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.4, 16), dark); ex.position.set(sx * 0.2, 0.95, -0.58); spine.add(ex); const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16), glow); fl.position.set(sx * 0.2, 1.16, -0.58); spine.add(fl); }
  const neck = joint(spine, 'spine', 'neck');
  // Casco: cráneo blindado con visor de neón y cresta.
  piece(neck, 0.4, 0.42, 0.44, 0, 0.2, 0.02); piece(neck, 0.32, 0.07, 0.04, 0, 0.22, 0.25, glow); piece(neck, 0.06, 0.2, 0.36, 0, 0.44, -0.02, dark);
  piece(neck, 0.3, 0.12, 0.3, 0, 0.0, 0.0, dark);
  const arm = (side: number, shK: string, elK: string) => {
    const sh = joint(spine, 'spine', shK);
    piece(sh, 0.42, 0.3, 0.46, side * 0.06, 0.06, 0); // hombrera
    piece(sh, 0.24, 0.42, 0.26, side * 0.04, -0.22, 0, plate, true);
    const el = joint(sh, shK, elK);
    piece(el, 0.28, 0.44, 0.3, 0, -0.24, 0.02, plate, true); piece(el, 0.24, 0.16, 0.26, 0, -0.52, 0.04, dark);
    for (let i = 0; i < 3; i++) piece(el, 0.05, 0.12, 0.06, (i - 1) * 0.07, -0.66, 0.1, dark, false);
    return { sh, el };
  };
  const A = arm(1, 'shL', 'elL'), B = arm(-1, 'shR', 'elR');
  const leg = (side: number, hipK: string, knK: string, anK: string) => {
    const hip = joint(pelvis, 'pelvis', hipK);
    piece(hip, 0.34, 0.72, 0.38, side * 0.02, -0.33, 0, plate, true);
    const kn = joint(hip, hipK, knK);
    piece(kn, 0.22, 0.2, 0.2, 0, 0.0, 0.14, dark); piece(kn, 0.3, 0.56, 0.34, 0, -0.26, 0, plate, true);
    const an = joint(kn, knK, anK);
    piece(an, 0.32, 0.38, 0.36, 0, -0.17, 0); piece(an, 0.36, 0.2, 0.58, 0, -0.43, 0.1); piece(an, 0.32, 0.04, 0.52, 0, -0.52, 0.1, glow);
    return { hip, kn };
  };
  const L = leg(1, 'hipL', 'knL', 'anL'), R = leg(-1, 'hipR', 'knR', 'anR');
  return { root, mats: [plate, dark, glow], pulse, pelvis, spine, neck, halo: null, shL: A.sh, elL: A.el, shR: B.sh, elR: B.el, hipL: L.hip, knL: L.kn, hipR: R.hip, knR: R.kn, wingL: null, wingR: null };
}
