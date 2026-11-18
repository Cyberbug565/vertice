// v0.21 · Animaciones de la Universal Animation Library 2 de Quaternius (CC0), hechas para el mismo esqueleto que los
// cuerpos del kit (UBC, 65 huesos). Se usan encima del movimiento procedural del juego: puñetazos, tajos con arma,
// bloqueo, reacción al recibir un golpe, levantarse del suelo y gestos de la vida en la calle (hablar por teléfono,
// cruzarse de brazos, negar, asentir…). Solo se toman las rotaciones de los huesos (así sirven para cuerpos de cualquier
// proporción); andando, solo la parte de arriba (las piernas siguen al paso).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

interface Track { bone: string; interp: THREE.Interpolant; upper: boolean }
interface Clip { dur: number; tracks: Track[] }
let clips: Map<string, Clip> | null = null;
let loading = false;
const UPPER = /^(spine_0[123]|neck_01|Head|clavicle_|upperarm_|lowerarm_|hand_|index_|middle_|ring_|pinky_|thumb_)/;

/** Carga las animaciones (una vez, en segundo plano). Mientras no estén, el juego usa solo el movimiento procedural. */
export function loadAnims() {
  if (clips || loading) return;
  loading = true;
  new GLTFLoader().loadAsync('/models/anim/ual2.glb').then((g) => {
    const m = new Map<string, Clip>();
    for (const c of g.animations) {
      const tracks: Track[] = [];
      for (const t of c.tracks) {
        const [bone, prop] = t.name.split('.');
        if (prop !== 'quaternion' || bone === 'root') continue;
        tracks.push({ bone, interp: t.createInterpolant(), upper: UPPER.test(bone) });
      }
      m.set(c.name, { dur: c.duration, tracks });
    }
    clips = m;
  }).catch((err) => console.warn('[animaciones] no se pudieron cargar', err));
}
export const animsReady = () => !!clips;
export const clipDur = (name: string) => clips?.get(name)?.dur ?? 0;

const q = new THREE.Quaternion();
/**
 * Pone los huesos en la pose del clip en el instante `t` (s), mezclada con la pose que ya tienen (peso `w`).
 * `upperOnly`: solo tronco, cabeza y brazos. `loop`: el clip se repite. Devuelve false si el clip no está.
 */
export function sampleClip(bones: Map<string, THREE.Bone>, name: string, t: number, w: number, upperOnly = false, loop = false): boolean {
  const c = clips?.get(name);
  if (!c || w <= 0.001) return !!c;
  const tt = loop ? ((t % c.dur) + c.dur) % c.dur : Math.max(0, Math.min(t, c.dur - 1e-3));
  for (const tr of c.tracks) {
    if (upperOnly && !tr.upper) continue;
    const b = bones.get(tr.bone);
    if (!b || b.scale.x < 0.01) continue; // (miembro perdido)
    q.fromArray(tr.interp.evaluate(tt) as unknown as number[]);
    if (w >= 0.999) b.quaternion.copy(q); else b.quaternion.slerp(q, w);
  }
  return true;
}
