// v0.16 · Neón de verdad para los edificios 3D. Antes eran barras sueltas colocadas en el borde de la manzana (y como los
// modelos no llenan la manzana, flotaban en el aire). Ahora cada pieza se construye sobre las paredes reales del modelo
// que hay debajo y es un tubo curvo con tres capas:
//   · el tubo encendido (núcleo casi blanco con el color en los bordes),
//   · un halo que lo envuelve y se difumina hacia fuera,
//   · la luz que el tubo echa sobre la pared que tiene detrás.
// Formas: aristas y cornisas que siguen el edificio, marcos de escaparate con esquinas redondeadas, arcos, anillos,
// ondas, rayos, flechas, galones y «letras» de trazos. Todo va fusionado por trozos de mapa (pocas llamadas de dibujo),
// gira de color o late en la tarjeta, y se atenúa por edificio con una textura de estados.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const time = { value: 0 };
const night = { value: 0 };
export const neonClock = time;
export const neonNight = night;

type V = THREE.Vector3;
interface Piece { core: THREE.BufferGeometry[]; glow: THREE.BufferGeometry[] }

/** Atributos comunes de cada pieza: color, edificio, fase y tipo (0 tubo, 1 halo, 2 luz en la pared). */
function tag(g: THREE.BufferGeometry, color: THREE.Color, b: number, ph: number, kind: number) {
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3), ab = new Float32Array(n), ap = new Float32Array(n), ak = new Float32Array(n);
  for (let i = 0; i < n; i++) { col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b; ab[i] = b; ap[i] = ph; ak[i] = kind; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aB', new THREE.BufferAttribute(ab, 1));
  g.setAttribute('aPh', new THREE.BufferAttribute(ap, 1));
  g.setAttribute('aK', new THREE.BufferAttribute(ak, 1));
  if (g.index) return g.toNonIndexed();
  return g;
}

export class NeonBuilder {
  private chunks = new Map<string, Piece>();
  constructor(private chunk = 48, private withGlow = true) {}
  private bucket(p: V) {
    const k = `${Math.floor(p.x / this.chunk)},${Math.floor(p.z / this.chunk)}`;
    return this.chunks.get(k) ?? this.chunks.set(k, { core: [], glow: [] }).get(k)!;
  }
  /** Tubo por una lista de puntos (en el mundo). `smooth` lo curva (Catmull-Rom); si no, sigue los puntos tal cual. */
  tube(pts: V[], o: { color: THREE.Color; b: number; ph: number; r?: number; closed?: boolean; smooth?: boolean; halo?: number }) {
    if (pts.length < 2) return;
    const r = o.r ?? 0.05;
    let len = 0; for (let i = 1; i < pts.length; i++) len += pts[i].distanceTo(pts[i - 1]);
    const curve = o.smooth
      ? new THREE.CatmullRomCurve3(pts, !!o.closed, 'centripetal')
      : new PolyCurve(o.closed ? [...pts, pts[0]] : pts);
    const seg = pts.length === 2 && !o.closed ? 1 :
      Math.max(4, Math.min(160, Math.round(len * (o.smooth ? 7 : 1.2)) + (o.smooth ? 0 : pts.length * 2)));
    const P = this.bucket(pts[0]);
    P.core.push(tag(new THREE.TubeGeometry(curve, seg, r, 6, !!o.closed && !!o.smooth), o.color, o.b, o.ph, 0));
    if (this.withGlow) P.glow.push(tag(new THREE.TubeGeometry(curve, seg, r * (o.halo ?? 4.2), 7, !!o.closed && !!o.smooth), o.color, o.b, o.ph, 1));
  }
  /** Luz del neón sobre la pared: un rectángulo en el plano de la fachada con degradado redondo. */
  spill(center: V, normal: V, w: number, h: number, o: { color: THREE.Color; b: number; ph: number }) {
    if (!this.withGlow) return;
    const g = new THREE.PlaneGeometry(w, h);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
    g.applyQuaternion(q); g.translate(center.x + normal.x * 0.03, center.y, center.z + normal.z * 0.03);
    this.bucket(center).glow.push(tag(g, o.color, o.b, o.ph, 2));
  }
  /** Fusiona todo y devuelve las mallas (núcleo opaco + brillo aditivo) y la textura de estados por edificio. */
  build(nBuildings: number, quality: 'low' | 'high') {
    const N = Math.max(1, nBuildings);
    const data = new Uint8Array(N * 4).fill(255);
    const fade = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat);
    fade.needsUpdate = true;
    const core = coreMaterial(fade, N), glow = glowMaterial(fade, N);
    const meshes: THREE.Mesh[] = [];
    for (const p of this.chunks.values()) {
      if (p.core.length) { const g = mergeGeometries(p.core, false); if (g) { const m = new THREE.Mesh(g, core); g.computeBoundingSphere(); meshes.push(m); } }
      if (quality === 'high' && p.glow.length) { const g = mergeGeometries(p.glow, false); if (g) { const m = new THREE.Mesh(g, glow); m.renderOrder = 2; g.computeBoundingSphere(); meshes.push(m); } }
      for (const g of [...p.core, ...p.glow]) g.dispose();
    }
    this.chunks.clear();
    return {
      meshes, materials: [core, glow], texture: fade,
      /** 0 = oculto, 1 = fantasma (atenuado), 2 = normal. */
      setFade(i: number, mode: 0 | 1 | 2) { data[i * 4] = mode === 2 ? 255 : mode === 1 ? 70 : 0; fade.needsUpdate = true; },
    };
  }
}

/** Curva que sigue una línea quebrada (para cornisas y aristas rectas, sin redondear de más). */
class PolyCurve extends THREE.Curve<THREE.Vector3> {
  private acc: number[] = [0];
  constructor(private pts: V[]) {
    super();
    for (let i = 1; i < pts.length; i++) this.acc.push(this.acc[i - 1] + pts[i].distanceTo(pts[i - 1]));
  }
  getPoint(t: number, out = new THREE.Vector3()) {
    const L = this.acc[this.acc.length - 1] * Math.min(1, Math.max(0, t));
    let i = 1; while (i < this.acc.length - 1 && this.acc[i] < L) i++;
    const a = this.acc[i - 1], b = this.acc[i];
    return out.copy(this.pts[i - 1]).lerp(this.pts[i], b > a ? (L - a) / (b - a) : 0);
  }
}

const COMMON_VS = `
attribute vec3 color; attribute float aB; attribute float aPh; attribute float aK;
uniform sampler2D uFade; uniform float uN;
varying vec3 vC; varying float vPh; varying float vK; varying float vF; varying vec3 vNv; varying vec2 vUv;
void main() {
  vF = texture2D(uFade, vec2((aB + 0.5) / uN, 0.5)).r;
  vC = color; vPh = aPh; vK = aK; vUv = uv;
  vNv = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  if (vF < 0.01) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
/** Color vivo: algo más de la mitad gira de tono despacio, el resto late; algunos tubos parpadean como si fallaran. */
const COLOR_FN = `
uniform float uTime; uniform float uNight;
vec3 neonColor(vec3 c0, float ph) {
  float ang = uTime * 0.3 + ph * 6.2831;
  vec3 kk = vec3(0.57735);
  vec3 hue = c0 * cos(ang) + cross(kk, c0) * sin(ang) + kk * dot(kk, c0) * (1.0 - cos(ang));
  float pulse = 0.8 + 0.2 * sin(uTime * 1.9 + ph * 40.0);
  vec3 c = mix(c0 * pulse, max(hue, 0.0), step(0.45, ph));
  // Parpadeo de tubo gastado (pocos) y encendido escalonado al anochecer.
  if (fract(ph * 13.0) > 0.92 && fract(uTime * 1.3 + ph * 7.0) > 0.88) c *= 0.15;
  return c;
}`;
function coreMaterial(fade: THREE.Texture, N: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uFade: { value: fade }, uN: { value: N }, uTime: time, uNight: night },
    vertexShader: COMMON_VS,
    fragmentShader: `${COLOR_FN}
varying vec3 vC; varying float vPh; varying float vK; varying float vF; varying vec3 vNv; varying vec2 vUv;
void main() {
  vec3 c = neonColor(vC, vPh);
  // Centro del tubo casi blanco, borde del color: así se lee como gas encendido y no como plástico.
  float facing = abs(vNv.z);
  vec3 col = mix(c * 0.9, mix(c, vec3(1.0), 0.55), smoothstep(0.35, 0.95, facing));
  col *= 0.85 + 0.6 * uNight;
  if (vF < 0.5) col *= 0.15;
  gl_FragColor = vec4(col, 1.0);
}`,
    toneMapped: false,
  });
}
function glowMaterial(fade: THREE.Texture, N: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uFade: { value: fade }, uN: { value: N }, uTime: time, uNight: night },
    vertexShader: COMMON_VS,
    fragmentShader: `${COLOR_FN}
varying vec3 vC; varying float vPh; varying float vK; varying float vF; varying vec3 vNv; varying vec2 vUv;
void main() {
  vec3 c = neonColor(vC, vPh);
  float a;
  if (vK < 1.5) { float f = abs(vNv.z); a = pow(f, 2.2) * 0.42; }        // halo: fuerte junto al tubo, se apaga hacia fuera
  else { float d = length((vUv - 0.5) * 2.0); a = pow(max(0.0, 1.0 - d), 2.0) * 0.38; } // luz sobre la pared
  a *= 0.45 + 0.85 * uNight;
  if (vF < 0.5) a *= 0.08;
  gl_FragColor = vec4(c * a, 1.0);
}`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  });
}

// ------------------------------------------------------------------------------------------------ formas
/** Formas para letreros, en 2D (u a lo ancho, v hacia arriba, de 0 a 1). Varias líneas por forma. */
export function shape(kind: string, rnd: () => number): { pts: [number, number][]; closed?: boolean; smooth?: boolean }[] {
  const circle = (cx: number, cy: number, r: number, a0 = 0, a1 = Math.PI * 2, n = 28) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as [number, number]; });
  switch (kind) {
    case 'arco': return [{ pts: circle(0.5, 0.1, 0.42, 0.15, Math.PI - 0.15), smooth: true }, { pts: circle(0.5, 0.1, 0.3, 0.3, Math.PI - 0.3), smooth: true }];
    case 'anillo': return [{ pts: circle(0.5, 0.5, 0.42, 0, Math.PI * 2, 32).slice(0, -1), closed: true, smooth: true }, { pts: [[0.3, 0.5], [0.45, 0.65], [0.55, 0.35], [0.7, 0.5]], smooth: true }];
    case 'onda': { const n = 4 + Math.floor(rnd() * 3); return [{ pts: Array.from({ length: n * 6 + 1 }, (_, i) => [i / (n * 6), 0.5 + Math.sin((i / 6) * Math.PI) * 0.32] as [number, number]), smooth: true }]; }
    case 'rayo': return [{ pts: [[0.6, 1], [0.3, 0.55], [0.55, 0.55], [0.35, 0]] }];
    case 'flecha': return [{ pts: [[0.5, 1], [0.5, 0.15]] }, { pts: [[0.25, 0.4], [0.5, 0.05], [0.75, 0.4]] }];
    case 'galones': return [0, 1, 2].map((i) => ({ pts: [[0.1 + i * 0.28, 0.1], [0.3 + i * 0.28, 0.5], [0.1 + i * 0.28, 0.9]] as [number, number][] }));
    case 'corazon': return [{ pts: [[0.5, 0.1], [0.15, 0.5], [0.18, 0.82], [0.35, 0.92], [0.5, 0.75], [0.65, 0.92], [0.82, 0.82], [0.85, 0.5]], closed: true, smooth: true }];
    case 'ojo': return [{ pts: [[0, 0.5], [0.25, 0.85], [0.5, 0.95], [0.75, 0.85], [1, 0.5], [0.75, 0.15], [0.5, 0.05], [0.25, 0.15]], closed: true, smooth: true }, { pts: circle(0.5, 0.5, 0.17, 0, Math.PI * 2, 18).slice(0, -1), closed: true, smooth: true }];
    default: {
      // «Letras» de trazos: un rótulo inventado de 3–4 caracteres hechos con 2–3 trazos cada uno.
      const out: { pts: [number, number][]; smooth?: boolean }[] = [];
      const n = 3 + Math.floor(rnd() * 2);
      for (let c = 0; c < n; c++) {
        const x0 = c / n + 0.03, w = 1 / n - 0.08;
        const strokes = 2 + Math.floor(rnd() * 2);
        for (let s = 0; s < strokes; s++) {
          const t = rnd();
          if (t < 0.3) out.push({ pts: [[x0 + rnd() * w, 0.05], [x0 + rnd() * w, 0.95]] });
          else if (t < 0.55) out.push({ pts: [[x0, 0.2 + rnd() * 0.6], [x0 + w, 0.2 + rnd() * 0.6]] });
          else if (t < 0.8) out.push({ pts: circle(x0 + w / 2, 0.5, w / 2, rnd() * 3, rnd() * 3 + 2.5, 12), smooth: true });
          else out.push({ pts: [[x0, 0.95], [x0 + w / 2, 0.05], [x0 + w, 0.95]] });
        }
      }
      return out;
    }
  }
}
export const SHAPES = ['arco', 'anillo', 'onda', 'rayo', 'flecha', 'galones', 'corazon', 'ojo', 'letras'];
