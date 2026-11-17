// v0.14 · Armas de fuego con modelos del pack de armas low-poly de Quaternius (CC0 1.0). Se cargan una vez (≈2 MB) y se
// copian para cada personaje. Vienen en milímetros con el cañón hacia +X y la parte de arriba hacia +Y; aquí se pasan a
// metros y al sistema de las armas del juego (cañón hacia +Y, miras hacia +Z, empuñadura en el origen). Mientras cargan,
// o si un arma no tiene modelo (táser, ballesta, lanzagranadas, cañón sónico, rotativa), se usa el modelo procedural.
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

/** Qué modelo del pack lleva cada arma del juego (y qué accesorio). */
const MAP: Record<string, { file: string; acc?: string }> = {
  'pistola-ligera': { file: 'Pistol_1' }, 'pistola-compacta': { file: 'Pistol_5' }, 'pistola-silenciada': { file: 'Pistol_2', acc: 'accesorios/Silencer_1' },
  'pistola-inteligente': { file: 'Pistol_4' }, 'pistola-plasma': { file: 'Pistol_6' }, 'pistola-agujas': { file: 'Pistol_3' },
  'revolver-pesado': { file: 'Revolver_3' }, 'revolver-riel': { file: 'Revolver_5' },
  subfusil: { file: 'SubmachineGun_1' }, 'smg-inteligente': { file: 'SubmachineGun_3' }, 'subfusil-compacto': { file: 'SubmachineGun_4' },
  'rifle-asalto': { file: 'AssaultRifle_1' }, carabina: { file: 'AssaultRifle_3' }, 'rifle-pulsos': { file: 'AssaultRifle2_1' },
  'rifle-precision': { file: 'SniperRifle_6' }, 'francotirador-inteligente': { file: 'SniperRifle_2' }, 'rifle-dardos': { file: 'SniperRifle_4' },
  'rifle-riel': { file: 'Bullpup_1' }, 'escopeta-corta': { file: 'Shotgun_SawedOff' }, 'escopeta-bombeo': { file: 'Shotgun_3' },
  'escopeta-tecnologica': { file: 'Shotgun_1' }, 'ametralladora-ligera': { file: 'AssaultRifle_2', acc: 'accesorios/Bipod' },
};
const cache = new Map<string, THREE.Object3D>();
/** Longitud real (m) por tipo: el pack es estilizado (una pistola mide casi lo que un subfusil), así que se ajusta. */
const LENGTH: [RegExp, number][] = [[/Shotgun_SawedOff/, 0.55], [/Pistol/, 0.21], [/Revolver/, 0.3], [/SubmachineGun/, 0.5], [/Bullpup/, 0.78], [/Sniper/, 1.2], [/Shotgun/, 1.0], [/AssaultRifle/, 0.92]];
let version = 0;
let started = false;
/** Cambia cuando termina de cargar algo (los personajes se reconstruyen para estrenar el modelo). */
export const gunsVersion = () => version;

/** Pasa el modelo a metros y al sistema de las armas del juego, con materiales que se vean bien con nuestra luz. */
function normalize(src: THREE.Object3D): THREE.Object3D {
  const holder = new THREE.Group();
  const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)); // x→y, y→z, z→x
  src.applyMatrix4(new THREE.Matrix4().multiplyMatrices(basis, new THREE.Matrix4().makeScale(0.001, 0.001, 0.001)));
  const mats = new Map<THREE.Material, THREE.Material>();
  const conv = (m: THREE.Material) => {
    let out = mats.get(m);
    if (!out) {
      const name = (m.name ?? '').toLowerCase();
      const c = ((m as any).color as THREE.Color | undefined)?.clone() ?? new THREE.Color(0.1, 0.1, 0.1);
      // Los colores del pack vienen muy oscuros (exportados en lineal): se aclaran.
      c.multiplyScalar(name.includes('glass') ? 6 : 3.4);
      out = name.includes('glass') ? new THREE.MeshStandardMaterial({ color: 0x4ad8ff, metalness: 0.2, roughness: 0.05, emissive: 0x0a3a50 })
        : new THREE.MeshStandardMaterial({ color: c, metalness: /metal|black|grey|dark/.test(name) ? 0.7 : 0.15, roughness: /wood|green/.test(name) ? 0.75 : 0.42 });
      mats.set(m, out);
    }
    return out;
  };
  src.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.material = Array.isArray(m.material) ? m.material.map(conv) : conv(m.material); m.castShadow = false; } });
  holder.add(src);
  return holder;
}

/** Empieza a cargar los modelos (una sola vez). `onLoaded` se llama cada vez que termina uno. */
export function loadGuns(onLoaded: () => void) {
  if (started) return; started = true;
  const loader = new FBXLoader();
  const files = new Set<string>();
  for (const v of Object.values(MAP)) { files.add(v.file); if (v.acc) files.add(v.acc); }
  for (const f of files) loader.loadAsync(`/models/armas/${f}.fbx`).then((obj) => { cache.set(f, normalize(obj)); version++; onLoaded(); }).catch((err) => console.warn('[armas 3D]', f, err));
}

/** Copia del modelo del arma lista para la mano (o null si no hay o aún no ha cargado). */
export function gunModel(id: string): THREE.Object3D | null {
  const def = MAP[id];
  const base = def ? cache.get(def.file) : undefined;
  if (!def || !base) return null;
  const g = base.clone(true);
  const len = new THREE.Box3().setFromObject(base).getSize(new THREE.Vector3()).y;
  const want = LENGTH.find(([re]) => re.test(def.file))?.[1] ?? 0.5;
  g.scale.setScalar(want / Math.max(0.01, len));
  if (def.acc) {
    const acc = cache.get(def.acc);
    if (acc) {
      const box = new THREE.Box3().setFromObject(base);
      const a = acc.clone(true); // (en el sistema del arma sin escalar: hereda la escala del arma)
      // Silenciador en la boca del cañón; bípode bajo el guardamanos.
      if (def.acc.includes('Silencer')) a.position.set(0, box.max.y - 0.005, (box.max.z + box.min.z) / 2 + 0.012);
      else a.position.set(0, box.max.y * 0.7, box.min.z + 0.02);
      g.add(a);
    }
  }
  return g;
}
