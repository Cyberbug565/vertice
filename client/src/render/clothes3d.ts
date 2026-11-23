// v0.16 · Ropa, peinados y accesorios hechos a partir del propio cuerpo del kit.
//
// Antes la ropa se pintaba sobre la piel y los gorros, gafas o peinados eran cajas pensadas para la cabeza vieja, así
// que no encajaban. Ahora cada prenda se genera desde la malla del cuerpo:
//   · se eligen los vértices que cubre (manga hasta el codo, pantalón hasta el tobillo, escote, capucha…) con una función
//     de «cobertura» medida en metros sobre el cuerpo en reposo;
//   · el borde se recorta exactamente donde la cobertura vale 0 (dobladillos limpios, no a trozos de triángulo);
//   · cada vértice se separa de la piel según el corte de la prenda (ajustada, normal, holgada, abombada, acampanada);
//   · conserva los pesos de los huesos del cuerpo, así que se dobla con él al andar, correr o apuntar.
// Lo que no sale del cuerpo (visera, ala del sombrero, coleta, trenzas, moños, filtros, gafas, cuernos, faldas y faldones
// de abrigo) se modela aparte y va pegado a su hueso. Las geometrías se calculan una vez por cuerpo y prenda.
import * as THREE from 'three';
import type { Human, KitData, Landmarks } from './human3d';
import { REG, HEAD_MORPH, HEAD_UNIFORMS } from './human3d';
import { collectionHair, hairFailed, isCollectionHair, REF_HEAD_W } from './hairs3d';
import { samuraiPiece, SAMURAI_SCALE } from './samurai3d';
import { applyHairDye } from './hair-color';

export interface VI { x: number; y: number; z: number; nx: number; ny: number; nz: number; reg: number; armT: number; legT: number; bone: string; ax: number }
type Fn = (v: VI, L: Landmarks) => number;
interface Shell { key: string; cov: Fn; off: Fn; taper?: number; relax?: number }

const ARM = new Set<number>([REG.uaP, REG.faP, REG.handP, REG.uaM, REG.faM, REG.handM]);
const HANDS = new Set<number>([REG.handP, REG.handM]);
const LEG = new Set<number>([REG.thP, REG.caP, REG.thM, REG.caM]);
const FEET = new Set<number>([REG.ftP, REG.ftM]);
const TRUNK = new Set<number>([REG.torso, REG.pelvis, REG.neck]);
const sat = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------------------------------------ generador
const geoCache = new Map<string, THREE.BufferGeometry>();
function vinfo(d: KitData, i: number, v: VI) {
  const L = d.L;
  v.x = d.pos[i * 3]; v.y = d.pos[i * 3 + 1]; v.z = d.pos[i * 3 + 2];
  v.nx = d.nrm[i * 3]; v.ny = d.nrm[i * 3 + 1]; v.nz = d.nrm[i * 3 + 2];
  v.reg = d.reg[i]; v.bone = d.boneNames[d.bone[i]] ?? '';
  v.ax = Math.abs(v.x);
  v.armT = ARM.has(v.reg) ? (v.ax - L.shX) / (L.wrX - L.shX) : -1;
  v.legT = LEG.has(v.reg) || FEET.has(v.reg) ? (L.hipY - v.y) / (L.hipY - L.ankY) : -1;
  return v;
}
/** Prenda a partir del cuerpo: recorta por cobertura ≥ 0 y separa de la piel. Sin índices (pocos miles de vértices). */
function shell(d: KitData, kind: string, sp: Shell): THREE.BufferGeometry {
  const ck = `${kind}|${sp.key}`;
  const hit = geoCache.get(ck); if (hit) return hit;
  const n = d.pos.length / 3, L = d.L;
  const c = new Float32Array(n), P = new Float32Array(n * 3);
  const v = {} as VI;
  for (let i = 0; i < n; i++) {
    vinfo(d, i, v);
    c[i] = sp.cov(v, L);
    // Pelo: se pega a la piel en el borde y tiene algo de volumen irregular (no es un casco liso).
    const o = c[i] > -0.25 ? sp.off(v, L) * (sp.taper ? (0.08 + 0.92 * smooth(0, sp.taper, c[i])) * (1 + 0.22 * Math.sin(v.x * 170) * Math.sin(v.z * 150) * Math.sin(v.y * 130)) : 1) : 0;
    P[i * 3] = v.x + v.nx * o; P[i * 3 + 1] = v.y + v.ny * o; P[i * 3 + 2] = v.z + v.nz * o;
  }
  // Prendas holgadas: la tela no marca cada músculo; se relaja la forma (media con los vecinos) unas cuantas veces.
  if (sp.relax) {
    const nb = neighbours(d);
    const tmp = new Float32Array(P.length);
    for (let it = 0; it < sp.relax; it++) {
      tmp.set(P);
      for (let i = 0; i < n; i++) {
        if (c[i] < -0.05) continue;
        const ns = nb[i]; if (!ns.length) continue;
        let x = 0, y = 0, z = 0; for (const j of ns) { x += tmp[j * 3]; y += tmp[j * 3 + 1]; z += tmp[j * 3 + 2]; }
        const k = 0.5 / ns.length;
        P[i * 3] = tmp[i * 3] * 0.5 + x * k; P[i * 3 + 1] = tmp[i * 3 + 1] * 0.5 + y * k; P[i * 3 + 2] = tmp[i * 3 + 2] * 0.5 + z * k;
      }
    }
  }
  const oP: number[] = [], oN: number[] = [], oU: number[] = [], oSI: number[] = [], oSW: number[] = [], oH: number[] = [], oI: number[] = [];
  type R = { i: number; j: number; t: number };
  // Vértices compartidos: cada vértice del cuerpo y cada punto de corte de una arista se emite una sola vez (indexado).
  const ids = new Map<number, number>();
  const emit = (r: R) => {
    const a = Math.min(r.i, r.j), b = Math.max(r.i, r.j), t = r.i <= r.j ? r.t : 1 - r.t;
    const key = a === b ? a : n + a * n + b;
    const hit = ids.get(key); if (hit !== undefined) { oI.push(hit); return; }
    const i = a, j = b, s = 1 - t;
    oP.push(P[i * 3] * s + P[j * 3] * t, P[i * 3 + 1] * s + P[j * 3 + 1] * t, P[i * 3 + 2] * s + P[j * 3 + 2] * t);
    oN.push(d.nrm[i * 3] * s + d.nrm[j * 3] * t, d.nrm[i * 3 + 1] * s + d.nrm[j * 3 + 1] * t, d.nrm[i * 3 + 2] * s + d.nrm[j * 3 + 2] * t);
    oU.push(d.uv[i * 2] * s + d.uv[j * 2] * t, d.uv[i * 2 + 1] * s + d.uv[j * 2 + 1] * t);
    const k = t < 0.5 ? i : j;
    for (let q = 0; q < 4; q++) { oSI.push(d.si[k * 4 + q]); oSW.push(d.sw[k * 4 + q]); }
    oH.push(Math.min(0.05, Math.max(0, c[i] * s + c[j] * t)));
    const id = oH.length - 1; ids.set(key, id); oI.push(id);
  };
  const idx = d.index;
  for (let f = 0; f < idx.length; f += 3) {
    const a = idx[f], b = idx[f + 1], cc = idx[f + 2];
    const ca = c[a], cb = c[b], cv = c[cc];
    if (ca < 0 && cb < 0 && cv < 0) continue;
    const tri = [a, b, cc];
    const poly: R[] = [];
    for (let e = 0; e < 3; e++) {
      const S = tri[e], E = tri[(e + 1) % 3], cs = c[S], ce = c[E];
      const cross = (): R => ({ i: S, j: E, t: cs / (cs - ce) });
      if (ce >= 0) { if (cs < 0) poly.push(cross()); poly.push({ i: E, j: E, t: 0 }); }
      else if (cs >= 0) poly.push(cross());
    }
    for (let k = 1; k + 1 < poly.length; k++) { emit(poly[0]); emit(poly[k]); emit(poly[k + 1]); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(oP, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(oN, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(oU, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(oSI, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(oSW, 4));
  g.setAttribute('aHem', new THREE.Float32BufferAttribute(oH, 1));
  g.setIndex(oI);
  geoCache.set(ck, g);
  return g;
}
/** Vecinos de cada vértice (soldando los duplicados de las costuras), calculados una vez por cuerpo. */
const nbCache = new WeakMap<KitData, number[][]>();
function neighbours(d: KitData): number[][] {
  const hit = nbCache.get(d); if (hit) return hit;
  const n = d.pos.length / 3, id = new Int32Array(n), keys = new Map<string, number>(), groups: number[][] = [];
  for (let i = 0; i < n; i++) { const k = `${Math.round(d.pos[i * 3] * 4000)},${Math.round(d.pos[i * 3 + 1] * 4000)},${Math.round(d.pos[i * 3 + 2] * 4000)}`; let g = keys.get(k); if (g === undefined) { g = groups.length; keys.set(k, g); groups.push([]); } id[i] = g; groups[g].push(i); }
  const gn = groups.map(() => new Set<number>());
  for (let f = 0; f < d.index.length; f += 3) for (let e = 0; e < 3; e++) { const a = id[d.index[f + e]], b = id[d.index[f + (e + 1) % 3]]; gn[a].add(b); gn[b].add(a); }
  const out: number[][] = new Array(n);
  for (let i = 0; i < n; i++) out[i] = [...gn[id[i]]].map((g) => groups[g][0]);
  nbCache.set(d, out);
  return out;
}
/** Pieza rígida pegada a un hueso (en el espacio del cuerpo en reposo). */
function rigid(d: KitData, g: THREE.BufferGeometry, bone: string, w2?: { bone: string; f: (p: THREE.Vector3) => number }) {
  const gg = g.index ? g.toNonIndexed() : g;
  const n = gg.getAttribute('position').count;
  const b = Math.max(0, d.boneNames.indexOf(bone)), b2 = w2 ? Math.max(0, d.boneNames.indexOf(w2.bone)) : 0;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), hem = new Float32Array(n).fill(0.05);
  const p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const t = w2 ? sat(w2.f(p.fromBufferAttribute(gg.getAttribute('position'), i))) : 0;
    si[i * 4] = b; sw[i * 4] = 1 - t; si[i * 4 + 1] = b2; sw[i * 4 + 1] = t;
  }
  gg.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  gg.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  gg.setAttribute('aHem', new THREE.BufferAttribute(hem, 1));
  if (!gg.getAttribute('uv')) gg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (!gg.getAttribute('normal')) gg.computeVertexNormals();
  return gg;
}
/** Tubo por puntos (para coletas, trenzas, rastas, cables). Radio por tramo. */
function tubeGeo(pts: THREE.Vector3[], r0: number, r1: number, seg = 24, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const g = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  const pos = g.getAttribute('position'), nor = g.getAttribute('normal');
  // Afinar: TubeGeometry tiene radio 1; se reescala hacia el centro de la curva en cada anillo.
  for (let s = 0; s <= seg; s++) {
    const c = curve.getPointAt(s / seg), r = r0 + (r1 - r0) * (s / seg);
    for (let k = 0; k <= radial; k++) {
      const i = s * (radial + 1) + k;
      pos.setXYZ(i, c.x + nor.getX(i) * r, c.y + nor.getY(i) * r, c.z + nor.getZ(i) * r);
    }
  }
  return g;
}

// ------------------------------------------------------------------------------------------------ material de tela
export interface ClothLook { color: string; pattern: HTMLCanvasElement | null; accent: string; rough?: number; metal?: number; detail?: string; trim?: number; sole?: string; soleY?: number; glass?: boolean; emissive?: number; hair?: number; tint?: string; face?: Record<string, { value: unknown }>;
  /** v0.18 · Confección: [cierre (1 cremallera, 2 botones), x del cierre, alto del puño elástico, bolsillos (1 de parche, 2 canguro)] y alturas del cuerpo [pelvis, pecho, axila, cuello]. */
  cut?: [number, number, number, number]; lm?: [number, number, number, number];
  /** Abertura delantera recortada con precisión en el sombreado: [media anchura, profundidad del escote en V]. */
  open?: [number, number] }
const NO = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); NO.needsUpdate = true;
export function clothMat(o: ClothLook): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: o.rough ?? 0.82, metalness: o.metal ?? 0, side: THREE.DoubleSide, transparent: !!o.glass, opacity: o.glass ? 0.78 : 1 });
  let tex: THREE.Texture = NO;
  if (o.pattern) { const t = new THREE.CanvasTexture(o.pattern); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; tex = t; m.userData.owned = [t]; }
  const detail = ({ cremallera: 1, led: 2, reflectante: 3, tachuelas: 4, placas: 5, parches: 6, cinturon: 7 } as Record<string, number>)[o.detail ?? ''] ?? 0;
  const u = {
    uPat: { value: tex }, uTint: { value: new THREE.Color(o.pattern ? '#ffffff' : o.color) }, uAccent: { value: new THREE.Color(o.accent) },
    uDetail: { value: detail }, uTrim: { value: o.trim ?? 0 }, uSole: { value: new THREE.Vector4(o.soleY ?? -1, ...new THREE.Color(o.sole ?? '#18181c').toArray()) },
    uEm: { value: o.emissive ?? 0 }, uHair: { value: o.hair ?? 0 },
    uCut: { value: new THREE.Vector4(...(o.cut ?? [0, 0, 0, 0])) }, uOpen: { value: new THREE.Vector2(...(o.open ?? [0, 0])) }, uLm: { value: new THREE.Vector4(...(o.lm ?? [0, 0, 0, 0])) },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    if (o.face) Object.assign(sh.uniforms, o.face);
    sh.vertexShader = 'attribute float aHem;\nvarying float vHem;\nvarying vec3 vRP;\nvarying vec3 vRN;\n' + (o.face ? HEAD_UNIFORMS : '') + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vHem = aHem; vRP = position; vRN = normal;' + (o.face ? `\n if (position.y > uHead.x - 0.03) {\n${HEAD_MORPH}\n }` : ''));
    sh.fragmentShader = 'varying float vHem;\nvarying vec3 vRP;\nvarying vec3 vRN;\nuniform sampler2D uPat;\nuniform vec3 uTint;\nuniform vec3 uAccent;\nuniform float uDetail;\nuniform float uTrim;\nuniform vec4 uSole;\nuniform float uEm;\nuniform float uHair;\nuniform vec4 uCut;\nuniform vec4 uLm;\nuniform vec2 uOpen;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `
        // Tejido proyectado en tres planos sobre el cuerpo en reposo: sin costuras de textura ni estiramientos.
        vec3 bw = pow(abs(normalize(vRN)), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
        float sc = 3.2;
        vec3 tx = texture2D(uPat, vRP.zy * sc).rgb * bw.x + texture2D(uPat, vRP.xz * sc).rgb * bw.y + texture2D(uPat, vRP.xy * sc).rgb * bw.z;
        diffuseColor.rgb = tx * uTint;
        if (uHair > 0.5) {
          // Pelo: mechones finos (variación a lo largo de la cabeza) y algo más claro en lo alto.
          float st = sin(dot(vRP, vec3(1150.0, 260.0, 930.0))) * 0.5 + 0.5;
          diffuseColor.rgb *= (0.72 + 0.4 * st) * (0.85 + 0.3 * smoothstep(-0.2, 0.9, vRN.y));
          if (uHair > 1.5) diffuseColor.rgb *= 0.55 + 0.45 * step(0.55, fract(dot(vRP, vec3(2400.0, 1800.0, 2100.0)))); // rapado: puntitos
          // Mechones: franjas finas alrededor de la cabeza y puntas desiguales en el borde (no un casco liso).
          float ang = atan(vRP.x, vRP.z);
          float strand = fract(sin(floor(ang * 140.0) * 43.17) * 4375.5);
          diffuseColor.rgb *= 0.78 + 0.32 * strand;
        }
        float hemBand = 1.0 - smoothstep(0.003, 0.011, vHem);
        diffuseColor.rgb *= 1.0 - 0.28 * hemBand;
        if (uSole.x > 0.0 && vRP.y < uSole.x) diffuseColor.rgb = uSole.yzw;
        // v0.18 · Abertura delantera limpia (recta y con solapas en V hacia el cuello) y su vista más oscura.
        if (uOpen.x > 0.0 && vRP.z > 0.0 && vRP.y > uLm.x - 0.2 && vRP.y < uLm.w + 0.05) {
          float ox = uOpen.x + max(0.0, vRP.y - (uLm.w - uOpen.y - 0.02)) * 0.55;
          float ax = abs(vRP.x);
          if (ax < ox) discard;
          if (ax < ox + 0.012) diffuseColor.rgb *= 0.62;
          else if (ax < ox + 0.015) diffuseColor.rgb *= 1.15;
        }
        // v0.18 · Confección: puños y bajo elásticos, cremallera o botones, bolsillos y costuras.
        if (uCut.z > 0.0 && vHem < uCut.z) diffuseColor.rgb *= 0.72 + 0.2 * step(0.5, fract((vRP.x + vRP.z) * 320.0 + vRP.y * 40.0));
        bool trunkFront = vRP.z > 0.0 && vRP.y > uLm.x - 0.14 && vRP.y < uLm.w + 0.02 && abs(vRP.x) < 0.2;
        if (uCut.x > 0.5 && trunkFront) {
          float zx = abs(vRP.x - uCut.y);
          if (uCut.x < 1.5) { if (zx < 0.0042) diffuseColor.rgb = mix(vec3(0.16), vec3(0.74, 0.76, 0.8), step(0.45, fract(vRP.y * 260.0))); else if (zx < 0.0075) diffuseColor.rgb *= 0.55; }
          else { float by = fract(vRP.y * 11.0); if (zx < 0.006 && by < 0.16) diffuseColor.rgb = vec3(0.08); else if (zx < 0.0025) diffuseColor.rgb *= 0.7; }
        }
        if (uCut.w > 0.5 && vRP.z > 0.0) {
          float px = abs(vRP.x), py = vRP.y - uLm.x;
          if (uCut.w < 1.5) {
            // Bolsillos de parche a los lados (y su solapa).
            float inx = step(0.045, px) * step(px, 0.12), iny = step(-0.02, py) * step(py, 0.075);
            float edge = inx * iny * (1.0 - step(0.006, min(min(px - 0.045, 0.12 - px), min(py + 0.02, 0.075 - py))));
            float flap = inx * step(abs(py - 0.06), 0.003);
            diffuseColor.rgb *= 1.0 - 0.45 * max(edge, flap);
          } else {
            // Bolsillo canguro de sudadera.
            float w = 0.1 - (py) * 0.25;
            float inside = step(px, w) * step(-0.03, py) * step(py, 0.09);
            float edge = inside * (1.0 - step(0.006, min(w - px, min(py + 0.03, 0.09 - py))));
            diffuseColor.rgb *= 1.0 - 0.4 * edge;
          }
        }
        // Costuras laterales y de los hombros (líneas algo más oscuras).
        if (uLm.x != 0.0 && vRP.y > uLm.x - 0.12 && vRP.y < uLm.z + 0.02) diffuseColor.rgb *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, 0.05, abs(normalize(vRN).z))) * step(0.6, abs(normalize(vRN).x));
        if (uDetail > 0.5 && uDetail < 1.5 && abs(vRP.x) < 0.005 && vRP.z > 0.0) diffuseColor.rgb = vec3(0.7, 0.72, 0.76);
        if (uDetail > 6.5 && abs(vRP.y - 0.98) < 0.022) diffuseColor.rgb = vec3(0.06);
        if (!gl_FrontFacing) diffuseColor.rgb *= 0.35;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float hb = 1.0 - smoothstep(0.003, 0.009, vHem);
        totalEmissiveRadiance += uAccent * (uTrim * hb + uEm);
        if (uDetail > 1.5 && uDetail < 2.5) totalEmissiveRadiance += uAccent * (1.0 - smoothstep(0.003, 0.006, abs(abs(vRP.x) - 0.07))) * step(0.0, vRP.z) * step(vRP.y, 1.45);
        if (uDetail > 2.5 && uDetail < 3.5) { float rb = step(abs(fract(vRP.y * 6.0) - 0.5), 0.05); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85), rb); totalEmissiveRadiance += vec3(0.12) * rb; }`);
  };
  m.customProgramCacheKey = () => `vt-tela-3-${o.face ? 'c' : 's'}`;
  return m;
}

// ------------------------------------------------------------------------------------------------ catálogo
interface TopCut { sleeve: number; hem: number; neck: number; vDepth: number; off: number; bell: number; puff: number; drape: number; tight?: boolean; collar?: number; hood?: boolean; turtle?: boolean;
  /** v0.18 · Abierta por delante (media anchura en m), cierre (cremallera/botones y su x), puño elástico y bolsillos. */
  open?: number; close?: 'zip' | 'botones'; closeX?: number; rib?: number; pockets?: 'parche' | 'canguro' }
/** Cortes de las prendas de arriba (manga en fracción del brazo: 0,45 corta, 1 hasta la muñeca; dobladillo en metros
 *  respecto a la cadera; holgura en metros). */
const TOP: Record<string, TopCut> = {
  camiseta: { sleeve: 0.42, hem: -0.06, neck: -0.015, vDepth: 0.01, off: 0.008, bell: 0.012, puff: 0, drape: 0.006 },
  camisa: { sleeve: 1.0, hem: -0.08, neck: -0.012, vDepth: 0.05, off: 0.009, bell: 0.004, puff: 0, drape: 0.008, collar: 0.03 , close: 'botones' },
  tirantes: { sleeve: -1, hem: -0.04, neck: -0.06, vDepth: 0.04, off: 0.005, bell: 0, puff: 0, drape: 0.004, tight: true },
  top: { sleeve: -1, hem: 0.2, neck: -0.12, vDepth: 0.02, off: 0.004, bell: 0, puff: 0, drape: 0, tight: true },
  sudadera: { sleeve: 1.02, hem: -0.09, neck: 0.0, vDepth: 0, off: 0.026, bell: 0.0, puff: 0.012, drape: 0.02, hood: true , rib: 0.035, pockets: 'canguro' },
  chaqueta: { sleeve: 1.0, hem: -0.07, neck: -0.01, vDepth: 0.09, off: 0.022, bell: 0.006, puff: 0.004, drape: 0.012, collar: 0.035 , open: 0.04, rib: 0, pockets: 'parche' },
  bomber: { sleeve: 1.0, hem: -0.02, neck: 0.0, vDepth: 0.03, off: 0.034, bell: 0.0, puff: 0.022, drape: 0.01, collar: 0.02 , close: 'zip', rib: 0.04, pockets: 'parche' },
  biker: { sleeve: 1.0, hem: -0.03, neck: 0.0, vDepth: 0.07, off: 0.01, bell: 0, puff: 0, drape: 0.004, tight: true, collar: 0.03 , close: 'zip', closeX: 0.035, pockets: 'parche' },
  blazer: { sleeve: 1.0, hem: -0.13, neck: -0.01, vDepth: 0.14, off: 0.018, bell: 0.003, puff: 0.004, drape: 0.01, collar: 0.04 , open: 0.045, pockets: 'parche' },
  traje: { sleeve: 1.0, hem: -0.12, neck: -0.01, vDepth: 0.12, off: 0.016, bell: 0.003, puff: 0.004, drape: 0.008, collar: 0.04 , open: 0.035, pockets: 'parche' },
  chaleco: { sleeve: -1, hem: -0.06, neck: -0.01, vDepth: 0.13, off: 0.016, bell: 0, puff: 0.008, drape: 0.01 , close: 'botones', pockets: 'parche' },
  gabardina: { sleeve: 1.0, hem: -0.1, neck: 0.0, vDepth: 0.1, off: 0.022, bell: 0.012, puff: 0.006, drape: 0.02, collar: 0.05 , open: 0.03, pockets: 'parche' },
  abrigo: { sleeve: 1.02, hem: -0.1, neck: 0.02, vDepth: 0.05, off: 0.026, bell: 0.01, puff: 0.012, drape: 0.024, collar: 0.05, turtle: true , close: 'botones', closeX: 0.03, pockets: 'parche' },
  haori: { sleeve: 0.85, hem: -0.1, neck: -0.01, vDepth: 0.16, off: 0.02, bell: 0.07, puff: 0, drape: 0.02 },
  poncho: { sleeve: 0.55, hem: -0.03, neck: 0.0, vDepth: 0.0, off: 0.05, bell: 0.06, puff: 0.02, drape: 0.06 },
  cortavientos: { sleeve: 1.0, hem: -0.06, neck: 0.02, vDepth: 0, off: 0.024, bell: 0.006, puff: 0.016, drape: 0.02, turtle: true , close: 'zip', rib: 0.02 },
  chubasquero: { sleeve: 1.02, hem: -0.11, neck: 0.0, vDepth: 0, off: 0.026, bell: 0.01, puff: 0.012, drape: 0.026, hood: true , close: 'zip', pockets: 'parche' },
  armadura: { sleeve: 0.35, hem: -0.03, neck: 0.01, vDepth: 0, off: 0.028, bell: 0, puff: 0.012, drape: 0.004, turtle: true },
  mono: { sleeve: 1.0, hem: -9, neck: 0.0, vDepth: 0.05, off: 0.012, bell: 0.004, puff: 0.004, drape: 0.01, collar: 0.03 , close: 'zip' },
  arnes: { sleeve: -1, hem: 0, neck: 0, vDepth: 0, off: 0, bell: 0, puff: 0, drape: 0 },
};
/** Faldones (de la cintura hacia abajo): largo en metros, vuelo y abierto por delante. */
const TAILS: Record<string, { len: number; flare: number; open: number }> = {
  gabardina: { len: 0.62, flare: 0.1, open: 0.5 }, abrigo: { len: 0.55, flare: 0.08, open: 0.35 }, haori: { len: 0.5, flare: 0.08, open: 0.7 },
  chubasquero: { len: 0.24, flare: 0.07, open: 0 }, poncho: { len: 0.2, flare: 0.14, open: 0 }, blazer: { len: 0.12, flare: 0.03, open: 0.6 }, traje: { len: 0.1, flare: 0.03, open: 0.6 },
};
interface LegCut { len: number; off: number; flare: number; waist: number }
const LEGS: Record<string, LegCut> = {
  pantalon: { len: 0.99, off: 0.012, flare: 0.006, waist: 0.05 }, vaqueros: { len: 0.99, off: 0.01, flare: 0.004, waist: 0.04 },
  cargo: { len: 0.97, off: 0.024, flare: 0.022, waist: 0.04 }, tactico: { len: 0.97, off: 0.018, flare: 0.012, waist: 0.05 },
  leggins: { len: 1.0, off: 0.006, flare: 0, waist: 0.06 }, shorts: { len: 0.32, off: 0.014, flare: 0.02, waist: 0.04 }, bermudas: { len: 0.55, off: 0.018, flare: 0.02, waist: 0.04 },
};
const SHOES: Record<string, { top: number; off: number; soleY: number; sole: string; platform?: number }> = {
  zapatillas: { top: 0.965, off: 0.011, soleY: 0.035, sole: '#eef0f4' }, deportivas: { top: 0.965, off: 0.011, soleY: 0.035, sole: '#eef0f4' },
  botas: { top: 0.86, off: 0.012, soleY: 0.03, sole: '#141418' }, 'botas-altas': { top: 0.66, off: 0.01, soleY: 0.03, sole: '#141418' },
  'botas-tacticas': { top: 0.8, off: 0.016, soleY: 0.04, sole: '#202018' }, tacones: { top: 0.985, off: 0.006, soleY: 0.02, sole: '#100a0a' },
  mocasines: { top: 0.985, off: 0.008, soleY: 0.02, sole: '#2a1a10' }, zapatos: { top: 0.985, off: 0.008, soleY: 0.02, sole: '#141418' },
  plataformas: { top: 0.93, off: 0.012, soleY: 0.06, sole: '#101014', platform: 0.045 },
};

/** Línea del escote (altura en la que acaba la prenda por arriba en cada punto). */
const neckLine = (cut: TopCut, v: VI, L: Landmarks) => L.neckY + 0.02 + cut.neck - cut.vDepth * sat(1 - v.ax / 0.07) * (v.z > 0 ? 1 : 0) + (cut.turtle ? 0.05 : 0);
function topShell(name: string, cut: TopCut, layer: number): Shell {
  return {
    key: `top:${name}:${layer}`, relax: cut.tight ? 1 : cut.off + cut.puff >= 0.02 ? 6 : 3,
    cov: (v, L) => {
      if (v.reg === REG.head) return -1;
      if (ARM.has(v.reg)) { if (cut.sleeve < 0) return -1; return (cut.sleeve - v.armT) * (L.wrX - L.shX); }
      if (LEG.has(v.reg) || FEET.has(v.reg)) return cut.hem < -1 ? 0.99 - v.legT : -1;
      const hemY = cut.hem < -1 ? -10 : cut.hem > 0 ? L.pelvisY + cut.hem : L.pelvisY + 0.065 + Math.max(cut.hem, -0.08) * 0.25; // v0.18: bajo recto a la altura del cinturón (sin pico en la entrepierna)
      let c = Math.min(v.y - hemY, neckLine(cut, v, L) - v.y);
      // Abierta por delante: se ve la prenda de dentro de arriba abajo.
      if (cut.open && v.z > 0) c = Math.min(c, v.ax - cut.open * 0.4);
      // Sin mangas: la sisa se abre un poco por debajo del hombro.
      if (cut.sleeve < 0 && v.ax > L.shX - 0.04) c = Math.min(c, (L.armY - 0.06) - v.y + (L.shX - v.ax) * 2);
      return c;
    },
    off: (v, L) => {
      let o = cut.off + layer * 0.006;
      if (ARM.has(v.reg)) o += cut.bell * Math.max(0, v.armT - 0.35) + cut.puff * 0.7 * Math.sin(Math.PI * sat(v.armT));
      else o += cut.puff + cut.drape * sat((L.chestY - v.y) / (L.chestY - L.pelvisY + 0.05));
      if (cut.tight) o *= 0.8;
      return o;
    },
  };
}
function legShell(name: string, cut: LegCut): Shell {
  return {
    key: `legs:${name}`, relax: cut.off >= 0.015 ? 4 : 1,
    cov: (v, L) => {
      if (LEG.has(v.reg)) return (cut.len - v.legT) * (L.hipY - L.ankY);
      if (FEET.has(v.reg)) return cut.len >= 0.99 ? (cut.len - v.legT) * (L.hipY - L.ankY) : -1;
      if (TRUNK.has(v.reg)) return L.pelvisY + cut.waist - v.y;
      return -1;
    },
    off: (v) => cut.off + cut.flare * sat(v.legT),
  };
}
function shoeShell(name: string): Shell {
  const sc = SHOES[name] ?? SHOES.botas;
  return {
    key: `shoe:${name}`,
    cov: (v, L) => { if (FEET.has(v.reg)) return 0.05; if (LEG.has(v.reg) && v.legT > 0.5) return (v.legT - sc.top) * (L.hipY - L.ankY); return -1; },
    off: (v) => sc.off + (sc.platform && v.ny < -0.5 ? sc.platform : 0) + (v.ny < -0.6 ? 0.006 : 0),
  };
}
const gloveShell = (fingerless: boolean): Shell => ({
  key: `glove:${fingerless}`,
  cov: (v, L) => {
    if (!HANDS.has(v.reg) && !(ARM.has(v.reg) && v.armT > 0.9)) return -1;
    if (fingerless && /_0[23]_|_02|_03/.test(v.bone) && !/thumb_01/.test(v.bone)) return -1;
    return (v.armT - 0.93) * (L.wrX - L.shX);
  },
  off: () => 0.004,
});
/** Cabeza: funciones en torno a los ojos y la cara. */
const front = (v: VI, L: Landmarks) => smooth(-0.02, L.faceZ - 0.03, v.z);
const isHead = (v: VI) => v.reg === REG.head;
const HEADWEAR: Record<string, Shell> = {
  gorro: { key: 'gorro', cov: (v, L) => isHead(v) ? v.y - (L.eyeY + 0.042 - 0.045 * (1 - front(v, L))) : -1, off: (v, L) => 0.013 + 0.012 * sat((v.y - L.eyeY) / 0.13) },
  gorra: { key: 'gorra', cov: (v, L) => isHead(v) ? v.y - (L.eyeY + 0.052 - 0.03 * (1 - front(v, L))) : -1, off: () => 0.01 },
  boina: { key: 'boina', cov: (v, L) => isHead(v) ? v.y - (L.eyeY + 0.06 - 0.02 * (1 - front(v, L))) : -1, off: (v, L) => 0.012 + 0.03 * sat((v.y - L.eyeY - 0.06) / 0.06) * (0.6 + 0.4 * Math.sign(-v.x)) },
  bandana: { key: 'bandana', cov: (v, L) => isHead(v) ? Math.min(v.y - (L.eyeY + 0.036), (L.eyeY + 0.07) - v.y) : -1, off: () => 0.006 },
  'diadema-led': { key: 'diadema', cov: (v, L) => isHead(v) ? Math.min(v.y - (L.eyeY + 0.075), (L.eyeY + 0.088) - v.y) : -1, off: () => 0.008 },
  casco: { key: 'casco', cov: (v, L) => { if (!isHead(v)) return -1; const open = v.y < L.eyeY + 0.034 && v.z > L.faceZ - 0.05 ? (L.faceZ - 0.05) - v.z : 1; return Math.min(v.y - (L.eyeY - 0.075), open); }, off: () => 0.032 },
  'casco-moto': { key: 'casco-moto', cov: (v, L) => (isHead(v) || (v.reg === REG.neck && v.y > L.neckY + 0.02)) ? v.y - (L.headBase - 0.04) : -1, off: () => 0.045 },
  capucha: {
    key: 'capucha',
    cov: (v, L) => {
      if (!isHead(v) && !(v.reg === REG.neck) && !(v.reg === REG.torso && v.y > L.armY - 0.01 && v.z < 0.03)) return -1;
      if (v.z > 0) { const e = (v.x / 0.068) ** 2 + ((v.y - L.eyeY + 0.025) / 0.088) ** 2; if (e < 1) return (e - 1) * 0.05; }
      return 0.05;
    },
    off: (v, L) => 0.03 + 0.03 * sat((v.y - L.eyeY) / 0.1) * sat(-v.z / 0.08) + (v.reg !== REG.head ? 0.02 : 0),
  },
};
const FACEWEAR: Record<string, Shell> = {
  mascara: { key: 'mascara', cov: (v, L) => isHead(v) ? Math.min((L.eyeY - 0.03) - v.y, v.z - (L.faceZ - 0.075)) : -1, off: () => 0.007 },
  'mascara-gas': { key: 'mascara-gas', cov: (v, L) => isHead(v) ? Math.min((L.eyeY + 0.035) - v.y, v.z - (L.faceZ - 0.07), v.y - (L.mouthY - 0.05)) : -1, off: () => 0.01 },
  'bandana-cara': { key: 'bandana-cara', cov: (v, L) => (isHead(v) || v.reg === REG.neck) ? Math.min((L.eyeY - 0.028) - v.y, v.z - (L.faceZ - 0.08)) : -1, off: (v, L) => 0.01 + 0.012 * sat((L.mouthY - v.y) / 0.06) },
  'mascara-demonio': { key: 'mascara-demonio', cov: (v, L) => isHead(v) ? Math.min(v.z - (L.faceZ - 0.06), v.y - (L.mouthY - 0.055)) : -1, off: () => 0.012 },
  visor: { key: 'visor', cov: (v, L) => isHead(v) ? Math.min(0.022 - Math.abs(v.y - L.eyeY), v.z - (L.faceZ - 0.065)) : -1, off: () => 0.016 },
  'visor-tactico': { key: 'visor-t', cov: (v, L) => isHead(v) ? Math.min(0.028 - Math.abs(v.y - L.eyeY - 0.003), v.z - (L.faceZ - 0.08)) : -1, off: () => 0.018 },
};
/** Peinados hechos con la propia cabeza: línea del pelo, volumen y forma. */
function hairShell(style: string): Shell | null { const sh = hairShell0(style); if (sh) sh.taper = style.startsWith('afro') || style === 'rizos' ? 0.07 : 0.03; return sh; }
function hairShell0(style: string): Shell | null {
  const line = (v: VI, L: Landmarks, frontY: number, backY: number) => frontY + (backY - frontY) * (1 - front(v, L));
  const scalp = (v: VI, L: Landmarks, frontY = L.eyeY + 0.048) => isHead(v) || (v.reg === REG.neck && v.z < 0) ? v.y - line(v, L, frontY, L.headBase + 0.03) : -1;
  const spikes = (v: VI) => Math.max(0, Math.sin(v.x * 140) * Math.sin(v.z * 140)) ** 2;
  switch (style) {
    case 'calvo': return null;
    case 'rapado': return { key: 'h:rapado', cov: (v, L) => scalp(v, L), off: () => 0.0025 };
    case 'corto': case 'lobo': return { key: `h:${style}`, cov: (v, L) => scalp(v, L), off: (v, L) => 0.008 + 0.012 * sat((v.y - L.eyeY) / 0.12) + (style === 'lobo' ? 0.01 * sat((L.eyeY - v.y) / 0.08) : 0) };
    case 'flequillo': case 'pixie': return { key: `h:${style}`, cov: (v, L) => scalp(v, L, L.eyeY + (style === 'pixie' ? 0.03 : 0.018)), off: (v, L) => 0.009 + 0.01 * sat((v.y - L.eyeY) / 0.12) };
    case 'asimetrico': return { key: 'h:asim', cov: (v, L) => scalp(v, L, L.eyeY + (v.x > 0 ? 0.01 : 0.05)), off: (v, L) => 0.01 + 0.012 * sat((v.y - L.eyeY) / 0.12) + (v.x > 0 ? 0.006 : 0) };
    case 'pompadour': return { key: 'h:pomp', cov: (v, L) => scalp(v, L), off: (v, L) => 0.008 + 0.045 * sat((v.y - L.eyeY - 0.05) / 0.07) * front(v, L) + 0.006 };
    case 'undercut': return { key: 'h:under', cov: (v, L) => isHead(v) ? v.y - (L.eyeY + 0.075) : -1, off: (v, L) => 0.02 + 0.015 * front(v, L) };
    case 'puntas': case 'erizo': return { key: `h:${style}`, cov: (v, L) => scalp(v, L), off: (v, L) => 0.01 + (style === 'erizo' ? 0.05 : 0.03) * spikes(v) * sat((v.y - L.eyeY) / 0.08) };
    case 'cresta': case 'mohicano': return { key: `h:${style}`, cov: (v, L) => isHead(v) || (v.reg === REG.neck && v.z < 0) ? Math.min(v.y - (L.eyeY + 0.03), 0.022 - v.ax) : -1, off: (v, L) => (style === 'mohicano' ? 0.075 : 0.04) * sat((v.y - L.eyeY - 0.03) / 0.05) + 0.004 };
    case 'afro': case 'afro-corto': case 'rizos': return { key: `h:${style}`, cov: (v, L) => scalp(v, L, L.eyeY + 0.045), off: (v, L) => (style === 'afro' ? 0.075 : style === 'afro-corto' ? 0.035 : 0.026) * (0.55 + 0.45 * sat((v.y - L.eyeY + 0.04) / 0.12)) + (style === 'rizos' ? 0.012 * spikes(v) : 0) };
    case 'bob': case 'media-melena': return { key: `h:${style}`, cov: (v, L) => isHead(v) || v.reg === REG.neck ? v.y - line(v, L, L.eyeY + 0.035, (style === 'bob' ? L.mouthY : L.neckY - 0.02)) + (v.ax > 0.05 && v.z < L.faceZ - 0.04 ? 0.05 : 0) : -1, off: (v, L) => 0.02 + 0.022 * sat((L.eyeY - v.y) / 0.09) };
    case 'mullet': return { key: 'h:mullet', cov: (v, L) => scalp(v, L), off: (v, L) => 0.012 + 0.012 * sat((v.y - L.eyeY) / 0.10) };
    default: return { key: 'h:base', cov: (v, L) => scalp(v, L), off: () => 0.007 }; // base para coletas, trenzas, moños y largos
  }
}
/** Vello facial con la propia cara (cuando no hay barba del kit para ese cuerpo o estilo). */
function facialShell(style: string): Shell | null {
  const lipsOut = (v: VI, L: Landmarks) => (v.ax < 0.024 && Math.abs(v.y - L.mouthY) < 0.011 ? -1 : 1);
  switch (style) {
    case 'bigote': return { key: 'f:bigote', cov: (v, L) => isHead(v) ? Math.min(0.034 - v.ax, v.y - (L.mouthY + 0.004), (L.mouthY + 0.022) - v.y, v.z - (L.faceZ - 0.03)) : -1, off: () => 0.004 };
    case 'perilla': return { key: 'f:perilla', cov: (v, L) => isHead(v) ? Math.min(0.026 - v.ax, (L.mouthY - 0.012) - v.y, v.y - (L.mouthY - 0.055), v.z - (L.faceZ - 0.045)) : -1, off: () => 0.005 };
    case 'candado': return { key: 'f:candado', cov: (v, L) => isHead(v) ? Math.min(0.036 - v.ax, (L.mouthY + 0.022) - v.y, v.y - (L.mouthY - 0.055), v.z - (L.faceZ - 0.04)) * lipsOut(v, L) : -1, off: () => 0.004 };
    case 'patillas': return { key: 'f:patillas', cov: (v, L) => isHead(v) ? Math.min(v.ax - 0.058, (L.eyeY + 0.005) - v.y, v.y - (L.eyeY - 0.05), v.z + 0.01) : -1, off: () => 0.003 };
    case 'barba': case 'barba-larga': return { key: `f:${style}`, cov: (v, L) => isHead(v) ? Math.min((L.eyeY - 0.04) - v.y, v.z + 0.005) * lipsOut(v, L) : -1, off: (v, L) => 0.006 + (style === 'barba-larga' ? 0.02 * sat((L.mouthY - 0.03 - v.y) / 0.04) : 0) };
    default: return null;
  }
}

// ------------------------------------------------------------------------------------------------ vestir
export interface Outfit {
  top: string; topColor: string; topPattern: HTMLCanvasElement | null; detail: string; shirtColor: string; inner: string;
  legs: string; legColor: string; legPattern: HTMLCanvasElement | null;
  shoes: string; shoeColor: string; gloves: string; gloveColor: string;
  head: string; headColor: string; face: string; hair: string; hairColor: string; hairDye?: string; hairTint?: string; facial: string; accent: string; accent2: string;
  kitHair: boolean; kitBeard: boolean; accessory: string;
}
/** Viste a la persona: devuelve las mallas (ya unidas al esqueleto) y sus materiales. */
export function dress(h: Human, o: Outfit): THREE.Material[] {
  const d = h.kit.data, L = d.L, kind = h.kind;
  const body = h.bodyMesh;
  const mats: THREE.Material[] = [];
  const add = (g: THREE.BufferGeometry, m: THREE.Material) => {
    const mesh = new THREE.SkinnedMesh(g, m);
    mesh.position.copy(body.position); mesh.quaternion.copy(body.quaternion); mesh.scale.copy(body.scale);
    body.parent!.add(mesh); mesh.updateMatrixWorld(true);
    mesh.bind(body.skeleton, body.bindMatrix);
    mesh.frustumCulled = false;
    if (!mats.includes(m)) mats.push(m);
    return mesh;
  };
  const face = (body.material as THREE.Material).userData.face as ClothLook['face'];
  const mat = (l: ClothLook) => clothMat(l);
  const headMat = (l: ClothLook) => clothMat({ ...l, face });
  const accent = o.accent2 || o.accent;
  const lm: [number, number, number, number] = [L.pelvisY, L.chestY, L.armY, L.neckY];
  const fabricRough = (p: string) => (/cuero|serpiente|latex/.test(p) ? 0.38 : /seda|holografico|lentejuelas|reflectante/.test(p) ? 0.3 : /kevlar|carbono|tactico/.test(p) ? 0.6 : 0.85);
  // v0.21 · Con un atuendo completo (jornalero, explorador) no hay pantalón, calzado ni prenda de arriba aparte.
  const fullOutfit = o.top === 'atuendo-campesino' || o.top === 'atuendo-explorador';
  // v0.22 · Partes al aire (se ha quitado esa ropa o la tapa una prenda 3D): no se dibuja ropa de serie ahí.
  const noLegs = o.legs === 'ninguno', noShoes = o.shoes === 'descalzo', noTop = o.top === 'ninguno';
  // Pantalón / falda.
  const lc = LEGS[o.legs] ?? (o.legs.startsWith('falda') ? null : LEGS.pantalon);
  if (fullOutfit || noLegs) { /* (lo pone outfit3d.ts / va al aire) */ } else if (lc) add(shell(d, kind, legShell(o.legs, lc)), mat({ color: o.legColor, pattern: o.legPattern, accent, rough: 0.85, detail: o.legs === 'tactico' || o.legs === 'cargo' ? 'cinturon' : '' }));
  else add(skirt(d, o.legs === 'falda-larga' ? 0.62 : 0.3, 0.07, 0, L.pelvisY + 0.06), mat({ color: o.legColor, pattern: o.legPattern, accent, rough: 0.8 }));
  // Calzado.
  const sc = SHOES[o.shoes] ?? SHOES.botas;
  if (fullOutfit || noShoes) { /* calzado del atuendo / descalzo */ } else if (o.shoes === 'grebas-flotantes') {
    // v0.17 · Grebas con sandalias flotantes del samurái (modelo de la release).
    for (const [file, side] of [['bota-izq', 'l'], ['bota-der', 'r']] as const) {
      const p = samuraiPiece(file); if (!p) continue;
      add(samuraiBoot(d, kind, file, side, p.geo), p.mat);
    }
  } else add(shell(d, kind, shoeShell(o.shoes)), mat({ color: o.shoeColor, pattern: null, accent, rough: o.shoes === 'mocasines' || o.shoes === 'tacones' || o.shoes === 'zapatos' ? 0.35 : 0.6, sole: sc.sole, soleY: sc.soleY, trim: o.shoes === 'zapatillas' ? 0.6 : 0 }));
  // Prenda de dentro (si la de fuera es abierta o sin mangas) y prenda de fuera.
  const cut = TOP[o.top] ?? TOP.chaqueta;
  // Debajo solo asoma una camiseta si la prenda de fuera es abierta (chaqueta, blazer, chaleco…); no con tops y tirantes.
  const open = (cut.vDepth > 0.06 && !cut.tight) || o.top === 'chaleco' || !!cut.open;
  if (o.top !== 'arnes' && o.top !== 'exo-tormenta' && !fullOutfit && !noTop) {
    if (open && o.inner && o.inner !== o.top && TOP[o.inner]) add(shell(d, kind, topShell(o.inner, { ...TOP[o.inner], vDepth: Math.min(TOP[o.inner].vDepth, 0.02), open: 0 }, 0)), mat({ color: o.shirtColor, pattern: null, accent, rough: 0.85, lm, cut: TOP[o.inner].close === 'botones' ? [2, 0, 0, 0] : undefined }));
    const tm = mat({ color: o.topColor, pattern: o.topPattern, accent, rough: fabricRough(o.detail + o.topColor), detail: o.detail, lm, open: cut.open ? [cut.open, cut.vDepth] : undefined,
      cut: [cut.close === 'zip' && o.detail !== 'cremallera' ? 1 : cut.close === 'botones' ? 2 : 0, cut.closeX ?? 0, cut.rib ?? 0, cut.pockets === 'parche' ? 1 : cut.pockets === 'canguro' ? 2 : 0], trim: o.detail === 'led' ? 1.2 : o.top === 'cortavientos' ? 0.5 : 0, metal: o.top === 'armadura' ? 0.4 : 0 });
    add(shell(d, kind, topShell(o.top, cut, 1)), tm);
    const tl = TAILS[o.top];
    if (tl) add(skirt(d, tl.len, tl.flare, tl.open, L.pelvisY + 0.02, cut.off + 0.012), tm);
    if (cut.collar) add(collar(d, cut.collar, cut.off + 0.01), tm);
    if (cut.hood && !o.head) add(hoodBack(d), tm);
  } else if (o.top === 'arnes') {
    const am = mat({ color: '#15151a', pattern: null, accent, rough: 0.4, metal: 0.3 });
    for (const s of [-1, 1]) add(strap(d, s), am);
  }
  // Guantes.
  if (o.gloves) add(shell(d, kind, gloveShell(o.gloves === 'sin-dedos')), mat({ color: o.gloveColor, pattern: null, accent, rough: o.gloves === 'tacticos' ? 0.7 : 0.4, trim: o.gloves === 'led' ? 1 : 0 }));
  // Peinado (si no lo tapa un casco) y vello facial.
  const covered = o.head === 'casco' || o.head === 'casco-moto' || o.head === 'casco-oni';
  const hairM = () => {
    const material = headMat({ color: o.hairColor, pattern: null, accent, rough: 0.56, hair: o.hair === 'rapado' ? 2 : 1 });
    const depth = /largo|melena|coleta|ondas|rastas|trenza|mullet|lobo/.test(o.hair) || isCollectionHair(o.hair) ? .29 : .12;
    applyHairDye(material, o.hairDye, o.hairTint, L.headTop + .018, depth);
    return material;
  };
  if (!covered && !o.kitHair && isCollectionHair(o.hair)) {
    // v0.17 · Peinado de la colección (modelo de verdad), encajado en la cabeza de este cuerpo.
    const g = collectionHair(o.hair);
    if (g && o.head !== 'capucha' && o.head !== 'gorro') {
      // v0.18 · Base de pelo pegada al cráneo (del color del pelo) para que nunca asome el cuero cabelludo entre mechones.
      const base = hairShell('rapado');
      if (base) add(shell(d, kind, { ...base, key: 'h:capbase', off: () => 0.004 }), hairM());
      add(fittedHair(d, kind, o.hair, g), hairM());
    }
    else if (!g && hairFailed(o.hair)) { const hs = hairShell('corto'); if (hs) add(shell(d, kind, hs), hairM()); }
  } else if (!covered && !o.kitHair) {
    const hatTrim = !!o.head && !['bandana', 'diadema-led'].includes(o.head);
    const hair = proceduralHair(d, kind, o.hair, hatTrim);
    if (hair.length) {
      const material = hairM();
      for (const g of hair) add(g, material);
    }
  }
  if (!o.kitBeard) { const fs = facialShell(o.facial); if (fs) add(shell(d, kind, fs), headMat({ color: o.hairColor, pattern: null, accent, rough: 0.7, hair: 1 })); }
  // Prenda de cabeza.
  const hc = o.headColor || '#2a2a34';
  if (o.head === 'casco-oni') {
    // v0.17 · Kabuto oni de neón del samurái (modelo de la release), centrado en la cabeza.
    const p = samuraiPiece('casco');
    if (p) add(samuraiHelmet(d, kind, p.geo), p.mat);
  } else if (o.head && HEADWEAR[o.head]) {
    const em = o.head === 'diadema-led';
    const hm = headMat({ color: em ? accent : hc, pattern: null, accent, rough: o.head.startsWith('casco') ? 0.3 : 0.85, metal: o.head.startsWith('casco') ? 0.2 : 0, emissive: em ? 1.4 : 0 });
    add(shell(d, kind, HEADWEAR[o.head]), hm);
    if (o.head === 'gorra') add(rigid(d, visorGeo(L), 'Head'), hm);
    if (o.head === 'casco-moto' || o.head === 'casco') add(shell(d, kind, { key: `cv:${o.head}`, cov: (v, LL) => isHead(v) ? Math.min(0.03 - Math.abs(v.y - LL.eyeY - 0.004), v.z - (LL.faceZ - 0.06)) : -1, off: () => (o.head === 'casco' ? 0.03 : 0.05) }), headMat({ color: '#0a1a28', pattern: null, accent, rough: 0.08, metal: 0.6, glass: true, emissive: 0.15 }));
  } else if (o.head === 'sombrero') {
    const hm = mat({ color: hc, pattern: null, accent, rough: 0.8 });
    add(rigid(d, hatGeo(L), 'Head'), hm);
  }
  // Cara: máscaras, visores y gafas.
  const f = o.face || (['gafas', 'visor', 'mascara'].includes(o.accessory) ? o.accessory : '');
  if (FACEWEAR[f]) {
    const glass = f.startsWith('visor');
    const fm = headMat({ color: f === 'mascara-demonio' ? '#a8101c' : glass ? accent : f === 'bandana-cara' ? hc : '#1c1c24', pattern: null, accent, rough: glass ? 0.1 : 0.6, glass, emissive: glass ? 0.6 : 0 });
    add(shell(d, kind, FACEWEAR[f]), fm);
    if (f === 'mascara-gas') { const mm = mat({ color: '#3a3e46', pattern: null, accent, rough: 0.4, metal: 0.6 }); for (const s of [-1, 1]) add(rigid(d, filterGeo(L, s), 'Head'), mm); }
    if (f === 'mascara-demonio') { const hm = mat({ color: '#e8e0d0', pattern: null, accent, rough: 0.5 }); for (const s of [-1, 1]) add(rigid(d, hornGeo(L, s), 'Head'), hm); }
  } else if (f === 'gafas' || f === 'gafas-sol' || f === 'monoculo') {
    const frame = mat({ color: '#101014', pattern: null, accent, rough: 0.3, metal: 0.5 });
    const lens = mat({ color: f === 'gafas' ? '#9ad8ff' : '#06080c', pattern: null, accent, rough: 0.05, metal: 0.3, glass: true, emissive: f === 'monoculo' ? 0.8 : 0 });
    const [fr, ln] = glassesGeo(L, f === 'monoculo');
    add(rigid(d, fr, 'Head'), frame); add(rigid(d, ln, 'Head'), lens);
  }
  if (o.accessory === 'auriculares' && !covered) add(rigid(d, phonesGeo(L), 'Head'), mat({ color: '#1a1a20', pattern: null, accent, rough: 0.4, trim: 0, emissive: 0 }));
  return mats;
}

// ------------------------------------------------------------------------------------------------ piezas aparte
/** Falda o faldones: cono desde la cintura que sigue a las piernas (mitad cadera, mitad muslo de su lado). */
function skirt(d: KitData, len: number, flare: number, openFront: number, y0: number, extra = 0.012): THREE.BufferGeometry {
  const L = d.L;
  // Contorno de la cadera a esa altura (del propio cuerpo).
  let rx = 0.12, zf = 0.08, zb = -0.08;
  for (let i = 0; i < d.reg.length; i++) {
    if (d.reg[i] !== REG.pelvis && d.reg[i] !== REG.thP && d.reg[i] !== REG.thM) continue;
    const y = d.pos[i * 3 + 1]; if (Math.abs(y - (L.hipY - 0.02)) > 0.04) continue;
    rx = Math.max(rx, Math.abs(d.pos[i * 3])); zf = Math.max(zf, d.pos[i * 3 + 2]); zb = Math.min(zb, d.pos[i * 3 + 2]);
  }
  const zc = (zf + zb) / 2, rz = (zf - zb) / 2;
  const seg = 36, rows = 8;
  const pos: number[] = [], idx: number[] = [], si: number[] = [], sw: number[] = [], hem: number[] = [];
  const bP = d.boneNames.indexOf('pelvis'), bL = d.boneNames.indexOf('thigh_l'), bR = d.boneNames.indexOf('thigh_r');
  const a0 = openFront > 0 ? Math.PI / 2 + openFront / 2 : 0, a1 = openFront > 0 ? Math.PI / 2 + Math.PI * 2 - openFront / 2 : Math.PI * 2;
  for (let r = 0; r <= rows; r++) {
    const t = r / rows, y = y0 - len * t;
    const grow = extra + flare * t + (y0 - y > 0.0 ? 0.006 : 0);
    for (let k = 0; k <= seg; k++) {
      const a = a0 + (a1 - a0) * (k / seg);
      const x = Math.cos(a) * (rx + grow), z = zc + Math.sin(a) * (rz + grow);
      pos.push(x, y, z);
      const side = x > 0 ? bL : bR, wl = sat(t * 1.4) * 0.55 * sat(Math.abs(x) / 0.05);
      si.push(bP, side, 0, 0); sw.push(1 - wl, wl, 0, 0);
      hem.push(Math.min(0.05, (1 - t) * len, openFront > 0 ? Math.min(k, seg - k) * 0.01 : 0.05));
    }
  }
  for (let r = 0; r < rows; r++) for (let k = 0; k < seg; k++) { const a = r * (seg + 1) + k, b = a + seg + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setAttribute('aHem', new THREE.Float32BufferAttribute(hem, 1));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  return g;
}
/** Cuello de chaqueta o abrigo: una banda levantada alrededor del cuello, abierta por delante. */
function collar(d: KitData, hgt: number, off: number) {
  const L = d.L;
  // Contorno del cuello medido en el propio cuerpo.
  let rx = 0.04, zf = 0.03, zb = -0.04, nN = 0;
  for (let i = 0; i < d.reg.length; i++) {
    if (d.reg[i] !== REG.neck && d.reg[i] !== REG.torso) continue;
    const y = d.pos[i * 3 + 1]; if (Math.abs(y - (L.neckY + 0.015)) > 0.012) continue;
    const x = Math.abs(d.pos[i * 3]); if (x > 0.09) continue;
    rx = Math.max(rx, x); zf = Math.max(zf, d.pos[i * 3 + 2]); zb = Math.min(zb, d.pos[i * 3 + 2]); nN++;
  }
  const rz = (zf - zb) / 2, zc = (zf + zb) / 2, r = (rx + rz) / 2 + Math.min(off, 0.012) + 0.006;
  const g = new THREE.CylinderGeometry(r, r * 0.94, hgt, 24, 1, true, Math.PI * 0.62, Math.PI * 1.76);
  g.scale(rx / ((rx + rz) / 2), 1, rz / ((rx + rz) / 2));
  g.translate(0, L.neckY + 0.005 + hgt / 2, zc);
  return rigid(d, g, 'spine_03', { bone: 'neck_01', f: (p) => (p.y - L.neckY) / (hgt + 0.02) });
}
function hoodBack(d: KitData) {
  const L = d.L;
  const g = new THREE.SphereGeometry(0.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(1, 0.45, 0.75); g.translate(0, L.armY + 0.03, -0.1);
  return rigid(d, g, 'spine_03');
}
function strap(d: KitData, s: number) {
  const L = d.L;
  const pts = [new THREE.Vector3(s * 0.11, L.armY + 0.02, 0.07), new THREE.Vector3(-s * 0.02, L.chestY, 0.125), new THREE.Vector3(-s * 0.13, L.pelvisY + 0.12, 0.1), new THREE.Vector3(-s * 0.15, L.pelvisY + 0.12, -0.06), new THREE.Vector3(s * 0.05, L.chestY + 0.05, -0.12), new THREE.Vector3(s * 0.11, L.armY + 0.02, -0.06)];
  return rigid(d, tubeGeo(pts, 0.012, 0.012, 48, 6), 'spine_03');
}
function visorGeo(L: Landmarks) {
  const g = new THREE.CylinderGeometry(0.1, 0.1, 0.008, 24, 1, false, -Math.PI * 0.42, Math.PI * 0.84);
  g.scale(1, 1, 0.9); g.rotateX(0.12); g.translate(0, L.eyeY + 0.05, L.faceZ - 0.01);
  return g;
}
function hatGeo(L: Landmarks) {
  const brim = new THREE.CylinderGeometry(0.17, 0.17, 0.008, 32); brim.translate(0, L.eyeY + 0.06, -0.015);
  const crown = new THREE.CylinderGeometry(0.085, 0.095, 0.1, 24); crown.translate(0, L.eyeY + 0.11, -0.015);
  const band = new THREE.CylinderGeometry(0.097, 0.097, 0.018, 24, 1, true); band.translate(0, L.eyeY + 0.072, -0.015);
  return mergeSimple([brim, crown, band]);
}
function filterGeo(L: Landmarks, s: number) {
  const g = new THREE.CylinderGeometry(0.022, 0.026, 0.04, 16); g.rotateX(Math.PI / 2); g.rotateY(s * 0.6); g.translate(s * 0.035, L.mouthY - 0.012, L.faceZ + 0.015);
  return g;
}
function hornGeo(L: Landmarks, s: number) {
  const g = new THREE.ConeGeometry(0.016, 0.08, 10); g.rotateZ(-s * 0.4); g.translate(s * 0.05, L.eyeY + 0.12, 0.02);
  return g;
}
function glassesGeo(L: Landmarks, mono: boolean): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const frames: THREE.BufferGeometry[] = [], lenses: THREE.BufferGeometry[] = [];
  const eyes = mono ? [L.eyeP] : [L.eyeP, L.eyeM];
  for (const e of eyes) {
    const ring = new THREE.TorusGeometry(0.019, 0.0028, 6, 24); ring.translate(e.x, e.y, e.z + 0.025); frames.push(ring);
    const lens = new THREE.CircleGeometry(0.0185, 24); lens.translate(e.x, e.y, e.z + 0.024); lenses.push(lens);
  }
  if (!mono) {
    const bridge = new THREE.CylinderGeometry(0.002, 0.002, Math.abs(L.eyeP.x - L.eyeM.x) - 0.036, 6); bridge.rotateZ(Math.PI / 2); bridge.translate(0, L.eyeP.y + 0.006, L.eyeP.z + 0.026); frames.push(bridge);
    for (const s of [-1, 1]) { const arm = new THREE.BoxGeometry(0.003, 0.004, 0.11); arm.translate(s * (Math.abs(L.eyeP.x) + 0.02), L.eyeP.y + 0.004, L.eyeP.z - 0.03); frames.push(arm); }
  }
  return [mergeSimple(frames), mergeSimple(lenses)];
}
function phonesGeo(L: Landmarks) {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) { const c = new THREE.CylinderGeometry(0.032, 0.032, 0.022, 20); c.rotateZ(Math.PI / 2); c.translate(s * (L.earX + 0.01), L.eyeY - 0.015, -0.005); parts.push(c); }
  const band = new THREE.TorusGeometry(L.earX + 0.012, 0.006, 6, 24, Math.PI); band.translate(0, L.eyeY - 0.015, -0.005); parts.push(band);
  return mergeSimple(parts);
}
export function proceduralHair(d: KitData, kind: string, style: string, underHat = false): THREE.BufferGeometry[] {
  const cap = hairShell(style);
  if (!cap || underHat && ['rapado', 'corto', 'undercut', 'pixie'].includes(style)) return [];
  return [shell(d, kind, cap), ...(underHat ? [] : hairstyleVolumes(d, style))];
}

/** Mechones con sección y caída, compartidos por todos los personajes del mismo cuerpo. */
const hairVolumes = new WeakMap<KitData, Map<string, THREE.BufferGeometry[]>>();
function hairstyleVolumes(d: KitData, style: string): THREE.BufferGeometry[] {
  let cache = hairVolumes.get(d);
  if (!cache) { cache = new Map(); hairVolumes.set(d, cache); }
  const previous = cache.get(style);
  if (previous) return previous;
  const L = d.L, raw: THREE.BufferGeometry[] = [], falling: THREE.BufferGeometry[] = [];
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const back = L.headBackZ - .004, crown = L.headTop;
  const lock = (points: THREE.Vector3[], r: number, tip: number, long = false) =>
    (long ? falling : raw).push(tubeGeo(points, r, tip, 18, 7));
  const ball = (x: number, y: number, z: number, r: number, sy = 1, sz = 1) => {
    const g = new THREE.SphereGeometry(r, 12, 9);
    g.scale(1, sy, sz); g.translate(x, y, z); raw.push(g);
  };
  const braid = (x: number, len: number) => {
    const path = new THREE.CatmullRomCurve3([V(x * .8, crown - .055, back * .65), V(x, L.eyeY - .01, back),
      V(x * 1.17, L.eyeY - len * .65, back - .046), V(x * .95, L.eyeY - len, back - .015)]);
    for (let n = 0; n < 3; n++) {
      const points = Array.from({ length: 22 }, (_, i) => {
        const t = i / 21, p = path.getPoint(t), phase = n * 2.094 + t * Math.PI * 8;
        return p.add(V(.008 * Math.cos(phase), 0, .008 * Math.sin(phase)));
      });
      lock(points, .013, .004, true);
    }
  };
  if (['coleta', 'coleta-alta', 'coleta-baja'].includes(style)) {
    const y = L.eyeY + (style === 'coleta-alta' ? .078 : style === 'coleta-baja' ? -.04 : .015);
    for (let i = -2; i <= 2; i++) lock([V(i * .005, y, back + .01), V(i * .012, y - .04, back - .047),
      V(i * .007, y - .16, back - .063), V(i * .001, y - .28 - .012 * i, back - .033)], .016, .0024, true);
  }
  if (style === 'trenza-larga' || style === 'trenzas') {
    const points = style === 'trenzas' ? [-L.earX * .88, L.earX * .88] : [0];
    for (const x of points) braid(x, style === 'trenza-larga' ? .36 : .295);
  }
  if (style === 'trenzas-pegadas') for (let i = 0; i < 7; i++) {
    const x = -.057 + i * .019;
    lock([V(x, L.eyeY + .055, L.faceZ - .005), V(x, crown + .004 - .25 * Math.abs(x), .011),
      V(x, L.eyeY + .045, back), V(x * .65, L.headBase + .027, back + .013)], .006, .004);
  }
  if (style === 'rastas') for (let i = 0; i < 12; i++) {
    const a = Math.PI * (.07 + .86 * i / 11), x = Math.cos(a) * (L.earX + .012), z = -Math.sin(a) * .087;
    lock([V(x * .78, crown - .046, z * .69), V(x, L.eyeY - .013, z - .015),
      V(x * 1.15, L.eyeY - .11, z - .021), V(x * 1.05, L.eyeY - .185 - (i % 3) * .022, z - .036)], .011, .005, true);
  }
  const fallLength: Record<string, number> = { bob: .152, 'media-melena': .219, lobo: .175, mullet: .185, ondas: .225 };
  const len = fallLength[style];
  if (len) for (let i = 0; i < 11; i++) {
    const a = Math.PI * (.055 + .89 * i / 10), x = Math.cos(a) * (L.earX + .009), z = -Math.sin(a) * .101;
    const stagger = style === 'bob' ? .004 * (i % 2) : .016 * (i % 3);
    const wave = style === 'ondas' ? .017 : .009;
    lock([V(x * .73, crown - .049, z * .55), V(x, L.eyeY + .01, z - .014),
      V(x + Math.cos(i) * wave, L.eyeY - len * .38, z - .028),
      V(x * .92 - Math.cos(i) * wave * .4, L.eyeY - len + .044 + stagger, z - .009)], .021, style === 'bob' ? .008 : .0035, true);
  }
  if (['flequillo', 'asimetrico', 'pixie', 'pompadour', 'undercut'].includes(style)) for (let i = 0; i < 6; i++) {
    const x = -.061 + .020 * i, sweep = style === 'pixie' ? .018 : .028;
    const y = style === 'pompadour' ? .048 : style === 'undercut' ? .028 : .016;
    const end = style === 'flequillo' ? .026 : style === 'asimetrico' ? .032 + (5 - i) * .006 : .063;
    lock([V(x, crown - .008 - .19 * Math.abs(x), -.025), V(x + sweep * .4, crown + y - .22 * Math.abs(x), .053),
      V(x + sweep, L.eyeY + end + .032, L.faceZ + .013), V(x + sweep, L.eyeY + end, L.faceZ + .009)], .013, .0025);
  }
  if (['afro', 'afro-corto', 'rizos'].includes(style)) {
    const r = style === 'afro' ? .029 : style === 'afro-corto' ? .021 : .016;
    for (let i = 0; i < 31; i++) {
      const phi = 2.39996 * i, y = .23 + .76 * (i / 30), ring = Math.sqrt(1 - y*y);
      ball(.108 * Math.cos(phi) * ring, L.eyeY + (.123 + r) * y, -.023 + .098 * Math.sin(phi) * ring, r * (.82 + (i % 4) * .07), 1.07);
    }
  }
  if (style === 'moño' || style === 'samurai') ball(0, crown + .012, back * .72, .036, .8, 1.04);
  if (style === 'dos-moños') for (const s of [-1, 1]) ball(s*.063, crown + .008, -.032, .034, 1.08);
  const out: THREE.BufferGeometry[] = [];
  if (raw.length) out.push(rigid(d, mergeSimple(raw), 'Head'));
  if (falling.length) out.push(rigid(d, mergeSimple(falling), 'Head',
    { bone: 'neck_01', f: point => .26 * smooth(L.eyeY - .09, L.eyeY - .33, point.y) }));
  raw.concat(falling).forEach(g => g.dispose());
  cache.set(style, out);
  return out;
}
/** Piezas del samurái colocadas en este cuerpo (una vez por cuerpo). */
function samuraiHelmet(d: KitData, kind: string, g: THREE.BufferGeometry) {
  const key = `${kind}|casco-oni`; const hit = fitCache.get(key); if (hit) return hit;
  const L = d.L, k = SAMURAI_SCALE * (L.headTop / 1.81) * 0.92;
  const geo = g.clone(); geo.scale(k, k, k); geo.translate(0, L.eyeY + 0.012, (L.faceZ + L.headBackZ) / 2 + 0.005);
  const out = rigid(d, geo, 'Head', { bone: 'neck_01', f: (p) => (p.y < L.headBase - 0.02 ? 1 : 0) });
  fitCache.set(key, out); return out;
}
function samuraiBoot(d: KitData, kind: string, file: string, side: 'l' | 'r', g: THREE.BufferGeometry) {
  const key = `${kind}|${file}`; const hit = fitCache.get(key); if (hit) return hit;
  const L = d.L, k = SAMURAI_SCALE * (L.headTop / 1.81) * 0.98;
  const x = (side === 'l' ? 1 : -1) * L.legX;
  const geo = g.clone(); geo.scale(k, k, k); geo.translate(x, 0, 0.035);
  const out = rigid(d, geo, `calf_${side}`, { bone: `foot_${side}`, f: (p) => (p.y < L.ankY + 0.015 ? 1 : 0) });
  fitCache.set(key, out); return out;
}
/** Peinado de la colección colocado sobre la cabeza del kit (escala por la anchura de la cabeza), una vez por cuerpo. */
const fitCache = new Map<string, THREE.BufferGeometry>();
function fittedHair(d: KitData, kind: string, id: string, g: THREE.BufferGeometry) {
  const key = `${kind}|${id}`;
  const hit = fitCache.get(key); if (hit) return hit;
  const L = d.L, k = (2 * L.earX * 1.01) / REF_HEAD_W;
  const geo = g.clone();
  geo.scale(k, k, k);
  geo.translate(0, L.headTop + 0.006 * k, (L.faceZ + L.headBackZ) / 2 - 0.004);
  const out = rigid(d, geo, 'Head');
  fitCache.set(key, out);
  return out;
}
/** Une geometrías simples (posición, normal y uv) sin índices. */
function mergeSimple(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const P: number[] = [], N: number[] = [], U: number[] = [];
  for (const g0 of gs) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const p = g.getAttribute('position'), n = g.getAttribute('normal'), u = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) { P.push(p.getX(i), p.getY(i), p.getZ(i)); N.push(n.getX(i), n.getY(i), n.getZ(i)); U.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0); }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); out.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  return out;
}
export { TOP, LEGS, shell, rigid, tubeGeo, mergeSimple, ARM, LEG, FEET, HANDS, TRUNK, sat, smooth };
export type { Shell };
