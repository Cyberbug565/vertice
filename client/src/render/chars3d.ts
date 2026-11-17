// v0.11 · Personajes en 3D (Three.js) dentro de la vista isométrica: modelos articulados con volumen, ropa y piel con las
// texturas detalladas (tejidos y tatuajes), cara pintada, peinados, complementos, cromo metálico con luces, armas en la mano,
// a la espalda y en la cadera, y animación procedural (andar, correr, respirar, golpear, apuntar, bloquear, patada, rodar,
// bailar, caer). Se dibujan en un lienzo WebGL propio con una cámara ortográfica que reproduce exactamente la proyección 2:1
// del juego, y los edificios (y el mobiliario grande) se añaden como volúmenes invisibles que tapan a quien está detrás.
import * as THREE from 'three';
import type { Appearance, EntitySpawn, ZoneDef } from '@vertice/shared';
import { content } from '../content';
import { fabricCanvas, skinCanvas } from './textures';
import { dancePose } from './dance';

/** Altura del juego: 32 px por unidad (la proyección real daría 39,2): comprimimos el eje vertical igual. */
const Y_SQUASH = 32 / (45.2548 * Math.cos(Math.PI / 6));
const PX_PER_UNIT = 45.2548; // 32 / cos 45°
/** Escala del modelo: un humano de 1,80 m mide 0,9 unidades (los personajes se ven más pequeños que antes). */
const M = 0.9 / 1.8;
export const BUILDING_H = 1.35;

export interface Ent3D {
  x: number; y: number; moving: boolean; s: EntitySpawn; attackAt?: number; attackKind?: string; rollAt?: number; kickAt?: number;
  samples: { x: number; y: number; t: number }[]; lookAt?: { x: number; y: number; until: number };
}

const hex = (s?: string, d = '#888888') => new THREE.Color(s && /^#[0-9a-f]{6}$/i.test(s) ? s : d);
const SLEEVELESS = new Set(['top', 'chaleco', 'tirantes', 'arnes']);
const SHORT = new Set(['camiseta', 'camisa']);
const COAT = new Set(['gabardina', 'abrigo', 'chubasquero', 'haori']);
const FACE_COVER = new Set(['mascara', 'mascara-gas', 'bandana-cara', 'mascara-demonio']);

// Geometrías compartidas (se escalan por pieza).
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1),
  taper: new THREE.CylinderGeometry(0.42, 0.5, 1, 10, 1), // más estrecho arriba
  chest: new THREE.CylinderGeometry(0.5, 0.4, 1, 8, 1),   // más ancho arriba (pecho)
  sphere: new THREE.SphereGeometry(0.5, 12, 10),
  cone: new THREE.ConeGeometry(0.5, 1, 10, 1, true),
  disc: new THREE.CircleGeometry(0.5, 16),
};
const texCache = new Map<HTMLCanvasElement, THREE.CanvasTexture>();
function tex(cv: HTMLCanvasElement) {
  let t = texCache.get(cv);
  if (!t) { t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; texCache.set(cv, t); }
  return t;
}
const lam = (o: THREE.MeshLambertMaterialParameters) => new THREE.MeshLambertMaterial(o);

/** Cara pintada a mano en un lienzo: ojos con pupila y brillo, cejas, nariz, boca, vello facial, maquillaje, cicatrices y tatuajes. */
function faceCanvas(a: Required<Appearance>, chromeEyes: boolean) {
  const W = 96, H = 112;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!;
  const skin = a.skin, hair = a.hair, accent = a.accent;
  c.fillStyle = skin; c.fillRect(0, 0, W, H);
  // Volumen: mejillas y sombra bajo la frente.
  const g = c.createRadialGradient(W / 2, H * 0.55, 10, W / 2, H * 0.55, W * 0.7);
  g.addColorStop(0, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0.22)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.fillStyle = 'rgba(200,80,80,0.10)'; c.beginPath(); c.ellipse(W * 0.25, H * 0.66, 10, 6, 0, 0, 7); c.ellipse(W * 0.75, H * 0.66, 10, 6, 0, 0, 7); c.fill();
  // Cejas.
  const bw = a.brows === 'finas' ? 2 : a.brows === 'gruesas' ? 6 : 4;
  c.fillStyle = shadeCss(hair, 0.9);
  for (const sx of [-1, 1]) { c.save(); c.translate(W / 2 + sx * 20, H * 0.40); if (a.brows === 'arqueadas') c.rotate(sx * -0.18); c.fillRect(-12, -bw / 2, 24, bw); c.restore(); }
  // Ojos.
  const eye = chromeEyes ? accent : a.eyes || '#3a2a1a';
  for (const sx of [-1, 1]) {
    const ex = W / 2 + sx * 20, ey = H * 0.5;
    c.fillStyle = '#f2f2f2'; c.beginPath(); c.ellipse(ex, ey, 10, 6, 0, 0, 7); c.fill();
    c.fillStyle = eye; c.beginPath(); c.arc(ex + 1, ey, 5, 0, 7); c.fill();
    c.fillStyle = '#060608'; c.beginPath(); c.arc(ex + 1, ey, 2.4, 0, 7); c.fill();
    c.fillStyle = '#ffffff'; c.fillRect(ex + 2, ey - 3, 2, 2);
    c.strokeStyle = shadeCss(skin, 0.45); c.lineWidth = 2; c.beginPath(); c.ellipse(ex, ey, 10, 6, 0, Math.PI, 0); c.stroke();
    if (chromeEyes) { c.fillStyle = hexA(accent, 0.35); c.fillRect(ex - 13, ey - 8, 26, 16); }
    if (a.makeup === 'delineado') { c.strokeStyle = '#101010'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(ex - 11, ey - 2); c.lineTo(ex + 13, ey - 4); c.stroke(); }
    if (a.makeup === 'neon') { c.fillStyle = a.makeupColor || '#ff3fa4'; c.fillRect(ex - 10, ey + 8, 20, 3); }
  }
  if (a.makeup === 'pintura') { c.fillStyle = hexA(a.makeupColor || '#ff3fa4', 0.7); c.fillRect(0, H * 0.46, W, 8); }
  // Nariz.
  c.fillStyle = shadeCss(skin, 0.72);
  const nw = a.nose === 'ancha' ? 14 : a.nose === 'pequena' ? 6 : a.nose === 'chata' ? 12 : 9;
  c.beginPath(); c.moveTo(W / 2, H * 0.52); c.lineTo(W / 2 + nw / 2, H * 0.68); c.lineTo(W / 2 - nw / 2, H * 0.68); c.closePath(); c.fill();
  c.fillStyle = shadeCss(skin, 0.5); c.fillRect(W / 2 - nw / 2, H * 0.68, nw, 2);
  // Boca.
  const lip = a.makeup === 'labios' ? (a.makeupColor || '#c01040') : shadeCss(skin, 0.52);
  c.strokeStyle = lip; c.fillStyle = lip; c.lineWidth = a.mouth === 'labios-gruesos' ? 5 : a.mouth === 'fina' ? 2 : 3;
  c.beginPath();
  if (a.mouth === 'sonrisa') { c.moveTo(W / 2 - 14, H * 0.78); c.quadraticCurveTo(W / 2, H * 0.86, W / 2 + 14, H * 0.78); }
  else if (a.mouth === 'seria') { c.moveTo(W / 2 - 13, H * 0.81); c.quadraticCurveTo(W / 2, H * 0.77, W / 2 + 13, H * 0.81); }
  else { c.moveTo(W / 2 - 13, H * 0.8); c.lineTo(W / 2 + 13, H * 0.8); }
  c.stroke();
  // Vello facial.
  c.fillStyle = hair;
  const f = a.facial;
  if (f === 'barba' || f === 'barba-larga') { c.fillRect(6, H * 0.7, W - 12, H * 0.3); c.fillStyle = skin; c.fillRect(W / 2 - 12, H * 0.76, 24, 7); c.fillStyle = hair; }
  if (f === 'bigote' || f === 'candado' || f === 'barba' || f === 'barba-larga') c.fillRect(W / 2 - 17, H * 0.71, 34, 5);
  if (f === 'perilla' || f === 'candado') c.fillRect(W / 2 - 8, H * 0.84, 16, 12);
  if (f === 'patillas') { c.fillRect(0, H * 0.35, 8, H * 0.4); c.fillRect(W - 8, H * 0.35, 8, H * 0.4); }
  // Cicatrices, tatuaje facial y piercings.
  c.strokeStyle = shadeCss(skin, 0.6); c.lineWidth = 2;
  if (a.scar === 'mejilla') { c.beginPath(); c.moveTo(W * 0.68, H * 0.58); c.lineTo(W * 0.82, H * 0.74); c.stroke(); }
  if (a.scar === 'ojo') { c.beginPath(); c.moveTo(W * 0.7, H * 0.32); c.lineTo(W * 0.74, H * 0.64); c.stroke(); }
  if (a.scar === 'frente') { c.beginPath(); c.moveTo(W * 0.3, H * 0.22); c.lineTo(W * 0.62, H * 0.26); c.stroke(); }
  const ft = a.faceTattoo && a.faceTattoo !== 'ninguno' ? a.faceTattoo : a.tattoo ? 'linea' : '';
  const tc = a.tattoo || '#1a1a2a';
  c.fillStyle = tc; c.strokeStyle = tc; c.lineWidth = 2;
  if (ft === 'linea') { c.beginPath(); c.moveTo(W * 0.12, H * 0.42); c.lineTo(W * 0.22, H * 0.7); c.stroke(); }
  if (ft === 'lagrimas') for (const yy of [0.6, 0.68]) { c.beginPath(); c.moveTo(W * 0.72, H * yy); c.lineTo(W * 0.75, H * yy + 6); c.lineTo(W * 0.69, H * yy + 6); c.fill(); }
  if (ft === 'codigo') { c.font = 'bold 9px monospace'; for (let i = 0; i < 4; i++) c.fillText(i % 2 ? '01' : '10', 4, H * 0.42 + i * 9); }
  if (ft === 'puntos') for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(W * 0.62 + i * 7, H * 0.28, 2, 0, 7); c.fill(); }
  if (ft === 'barras') for (let i = 0; i < 7; i++) c.fillRect(6 + i * 3, H * 0.44, 1 + (i % 2), 18);
  if (ft === 'circuito') { c.beginPath(); c.moveTo(8, H * 0.3); c.lineTo(16, H * 0.42); c.lineTo(16, H * 0.66); c.stroke(); c.beginPath(); c.arc(16, H * 0.66, 3, 0, 7); c.fill(); }
  if (ft === 'rayas') for (let i = 0; i < 3; i++) c.fillRect(W * 0.66, H * 0.58 + i * 6, 20, 2);
  if (ft === 'luna') { c.beginPath(); c.arc(16, H * 0.24, 6, 0, 7); c.fill(); c.fillStyle = skin; c.beginPath(); c.arc(19, H * 0.22, 5, 0, 7); c.fill(); }
  if (ft === 'tribal') { c.beginPath(); c.moveTo(4, H * 0.3); c.lineTo(18, H * 0.42); c.lineTo(10, H * 0.55); c.lineTo(20, H * 0.68); c.lineTo(4, H * 0.6); c.fill(); }
  c.fillStyle = '#d8dce8';
  if (a.piercing === 'nariz') { c.beginPath(); c.arc(W / 2 + 6, H * 0.66, 2, 0, 7); c.fill(); }
  if (a.piercing === 'septum') { c.strokeStyle = '#d8dce8'; c.beginPath(); c.arc(W / 2, H * 0.71, 3, 0, Math.PI); c.stroke(); }
  if (a.piercing === 'ceja') { c.beginPath(); c.arc(W / 2 + 30, H * 0.38, 2, 0, 7); c.fill(); }
  if (a.piercing === 'labio') { c.beginPath(); c.arc(W / 2 + 8, H * 0.83, 2, 0, 7); c.fill(); }
  return cv;
}
function shadeCss(hexStr: string, f: number) { const n = parseInt((hexStr || '#888888').slice(1), 16); const k = (v: number) => Math.max(0, Math.min(255, Math.round(v * f))); return `rgb(${k((n >> 16) & 255)},${k((n >> 8) & 255)},${k(n & 255)})`; }
function hexA(hexStr: string, a: number) { const n = parseInt((hexStr || '#888888').slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }

/** Un personaje: jerarquía de articulaciones (cadera, rodillas, columna, hombros, codos, cuello) y sus piezas. */
interface Rig {
  root: THREE.Group; body: THREE.Group; hips: THREE.Group; spine: THREE.Group; chest: THREE.Group; neck: THREE.Group;
  thighL: THREE.Group; thighR: THREE.Group; kneeL: THREE.Group; kneeR: THREE.Group; shoulderL: THREE.Group; shoulderR: THREE.Group; elbowL: THREE.Group; elbowR: THREE.Group;
  handR: THREE.Group; coat: THREE.Object3D[]; shadow: THREE.Mesh; key: string; heading: number; phase: number; lie: number; big: boolean; ranged: boolean; mats: THREE.Material[];
  lastX: number; lastY: number; speed: number;
}

export class Chars3D {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private world = new THREE.Group();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000);
  private rigs = new Map<number, Rig>();
  private occl = new THREE.Group();
  private bOccl: (THREE.Mesh | null)[] = [];
  private occMat = new THREE.MeshBasicMaterial({ colorWrite: false });
  private sun = new THREE.DirectionalLight(0xfff4e8, 2.6);
  private hemi = new THREE.HemisphereLight(0xdde6ff, 0x5a4e60, 2.4);
  private rim = new THREE.DirectionalLight(0x9ab8ff, 1.0);
  ok = true;

  /** Comparte el lienzo y el contexto WebGL de Pixi (patrón oficial para mezclar Pixi y Three: sin copias entre contextos). */
  constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext | WebGLRenderingContext) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, context: gl as WebGL2RenderingContext, antialias: false });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.world.scale.y = Y_SQUASH;
    this.scene.add(this.world, this.hemi, this.sun, this.rim);
    this.sun.position.set(2, 8, 5); // luz principal desde arriba y de cara a la cámara
    this.rim.position.set(-6, 4, -6); // contraluz frío: separa la silueta del fondo
    this.world.add(this.occl);
  }

  /** Sin tocar el tamaño del lienzo (lo gestiona Pixi): solo la zona de dibujo. */
  // Ojo: setPixelRatio/setSize de Three redimensionan el lienzo compartido con Pixi; aquí solo se guarda el viewport en píxeles reales.
  private vpW = 1; private vpH = 1;
  setSize(w: number, h: number, res: number) { this.vpW = Math.round(w * res); this.vpH = Math.round(h * res); }

  /** Volúmenes invisibles que tapan: edificios, muros y mobiliario grande. */
  setZone(z: ZoneDef) {
    for (const r of this.rigs.values()) this.disposeRig(r);
    this.rigs.clear();
    this.occl.clear(); this.bOccl = [];
    const box = (x: number, y: number, w: number, d: number, h: number) => { const m = new THREE.Mesh(G.box, this.occMat); m.scale.set(w, h, d); m.position.set(x + w / 2, h / 2, y + d / 2); m.renderOrder = -1; this.occl.add(m); return m; };
    for (const b of z.buildings) this.bOccl.push(box(b.rect[0], b.rect[1], b.rect[2], b.rect[3], b.height * BUILDING_H));
    for (const bl of z.blocks) box(bl.rect[0], bl.rect[1], bl.rect[2], bl.rect[3], bl.type === 'fence' ? 1.1 : bl.height);
    // Solo lo macizo tapa (una marquesina de cristal o un puesto abierto no).
    const H: Record<string, number> = { car: 0.75, wreck: 0.65, dumpster: 0.8, kiosk: 1.4, crate: 0.5, barrel: 0.7, jersey: 0.65, shelf: 1.5, locker: 1.6, fridge: 1.5, arcade: 1.4, smokestack: 3, monolith: 4.5, codewall: 2.4 };
    for (const p of z.props) if (H[p.type] && p.blocking !== false) box(p.at[0] + 0.15, p.at[1] + 0.15, 0.7, 0.7, H[p.type]);
  }
  /** Los edificios atenuados (los que tapan al jugador) dejan de tapar a los personajes. */
  setBuildingFaded(i: number, faded: boolean) { const m = this.bOccl[i]; if (m) m.visible = !faded; }

  private disposeRig(r: Rig) { this.world.remove(r.root); for (const m of r.mats) m.dispose(); }

  // ================================================================ construcción del modelo
  private build(e: Ent3D): Rig {
    const s = e.s;
    const a = { skin: '#c89070', hair: '#222222', jacket: '#40506a', accent: '#43f3ff', eyes: '#3a2a1a', pants: '#1a1a24', build: 'medio', hairStyle: 'corto', top: 'chaqueta', facial: 'ninguno', accessory: 'ninguno', tattoo: '',
      faceShape: 'ovalada', brows: 'normales', makeup: 'ninguno', makeupColor: '#ff3fa4', piercing: 'ninguno', scar: 'ninguna', bodyTattoo: 'ninguno', shirt: '', shoes: '#101018',
      headwear: '', headColor: '', eyewear: '', legwear: 'pantalon', rarityGlow: '', tattooZone: 'brazos', tattooInk: '#14141e', faceTattoo: 'ninguno', topPattern: 'liso', pantsPattern: 'liso',
      shoeStyle: 'botas', topDetail: 'ninguno', accent2: '', nose: 'recta', mouth: 'neutra', outer: '', ...(s.appearance ?? {}) } as Required<Appearance>;
    const chrome = new Set(s.chrome ?? []), lost = new Set(s.lost ?? []);
    const mats: THREE.Material[] = [];
    const mk = <T extends THREE.Material>(m: T) => { mats.push(m); return m; };
    const B = a.build;
    const wf = B === 'delgado' ? 0.86 : B === 'robusto' ? 1.18 : B === 'corpulento' ? 1.32 : B === 'atletico' ? 1.06 : 1;
    const hf = B === 'bajo' ? 0.9 : B === 'alto' ? 1.08 : 1;
    const shoulders = B === 'atletico' ? 1.14 : wf;
    // Materiales.
    const tz = a.tattooZone || 'brazos', tst = a.bodyTattoo && a.bodyTattoo !== 'ninguno' ? a.bodyTattoo : '';
    const tatOn = (part: string) => !!tst && (tz === 'todo' || (part === 'armR' && (tz === 'brazos' || tz === 'brazo')) || (part === 'armL' && tz === 'brazos') || (part === 'leg' && tz === 'piernas') || (part === 'neck' && tz === 'cuello') || (part === 'chest' && tz === 'pecho'));
    const skinM = (part: string, wu: number, hu: number) => mk(lam({ map: tex(skinCanvas(a.skin, tatOn(part) ? tst : 'ninguno', a.tattooInk || '#14141e', a.accent, wu, hu, part)) }));
    const plainSkin = mk(lam({ color: hex(a.skin) }));
    const cloth = (base: string, pattern: string, wu = 6, hu = 8) => mk(lam({ map: tex(fabricCanvas(pattern || 'liso', base, a.accent, wu, hu)) }));
    const jacketM = cloth(a.jacket, a.topPattern, 8, 10);
    const sleeveM = cloth(a.jacket, a.topPattern, 4, 8);
    const shirtM = cloth(a.shirt || '#2a2a3a', 'liso', 6, 6);
    const pantsM = cloth(a.pants, a.pantsPattern, 4, 9);
    const shoeM = mk(lam({ color: hex(a.shoes, '#101018') }));
    const soleM = mk(lam({ color: a.shoeStyle === 'zapatillas' ? 0xf0f0f4 : 0x18181c }));
    const hairM = mk(lam({ color: hex(a.hair) }));
    const accent = hex(a.accent);
    const metalM = mk(new THREE.MeshStandardMaterial({ color: 0xb8c0cc, metalness: 0.85, roughness: 0.32 }));
    const metalDarkM = mk(new THREE.MeshStandardMaterial({ color: 0x4a505c, metalness: 0.8, roughness: 0.45 }));
    const glowM = mk(new THREE.MeshBasicMaterial({ color: accent }));
    const beltM = mk(lam({ color: 0x15151a }));
    const goldM = mk(new THREE.MeshStandardMaterial({ color: 0xc8ccd8, metalness: 0.9, roughness: 0.25 }));
    const part = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], sx: number, sy: number, sz: number, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); parent.add(m); return m;
    };
    const group = (parent: THREE.Object3D, x: number, y: number, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

    const root = new THREE.Group();
    const body = group(root, 0, 0, 0);
    body.scale.set(M * wf, M * hf / Y_SQUASH, M * wf);
    // ---- piernas
    const hipY = 0.92;
    const hips = group(body, 0, hipY);
    const pelvis = part(hips, G.box, pantsM, 0.38, 0.2, 0.24, 0, 0.04);
    void pelvis;
    const lw = a.legwear || 'pantalon';
    const bare = lw === 'shorts' || lw === 'falda' || lw === 'bermudas' || lw === 'falda-larga';
    const legFor = (side: -1 | 1) => {
      const key = side < 0 ? 'pierna_izq' : 'pierna_der';
      const thigh = group(hips, side * 0.1, 0);
      if (lost.has(key)) { part(thigh, G.cyl, mk(lam({ color: 0x8a0a12 })), 0.12, 0.04, 0.12, 0, -0.02); return { thigh, knee: group(thigh, 0, -0.42) }; }
      const isChrome = chrome.has(key);
      const thighMat = isChrome ? metalM : lw === 'shorts' || lw === 'bermudas' ? pantsM : bare ? skinM('leg', 3, 6) : pantsM;
      part(thigh, G.taper, thighMat, 0.2, 0.44, 0.21, 0, -0.21);
      const knee = group(thigh, 0, -0.42);
      const shinMat = isChrome ? metalM : bare || lw === 'bermudas' ? skinM('leg', 3, 6) : pantsM;
      part(knee, G.taper, shinMat, 0.15, 0.44, 0.16, 0, -0.22);
      if (isChrome) { part(knee, G.sphere, metalDarkM, 0.13, 0.13, 0.13); part(knee, G.box, glowM, 0.02, 0.3, 0.02, 0.05, -0.22, 0.04); }
      if (lw === 'tactico') part(knee, G.box, beltM, 0.13, 0.1, 0.06, 0, -0.03, 0.06);
      // Pie y calzado.
      const st = a.shoeStyle || 'botas';
      const shaft = st === 'botas-altas' ? 0.3 : st === 'botas' ? 0.14 : st === 'botas-tacticas' ? 0.2 : 0;
      if (shaft) part(knee, G.cyl, shoeM, 0.16, shaft, 0.17, 0, -0.44 + shaft / 2);
      const foot = group(knee, 0, -0.44);
      part(foot, G.box, shoeM, 0.13, 0.1, st === 'tacones' ? 0.22 : 0.28, 0, -0.01, 0.05);
      part(foot, G.box, soleM, 0.135, st === 'plataformas' ? 0.06 : 0.03, st === 'tacones' ? 0.22 : 0.29, 0, -0.06, 0.05);
      if (st === 'zapatillas') part(foot, G.box, glowM, 0.116, 0.015, 0.12, 0, 0.0, 0.05);
      return { thigh, knee };
    };
    const L = legFor(-1), R = legFor(1);
    // Faldas y abrigos largos.
    const coat: THREE.Object3D[] = [];
    if (lw === 'falda' || lw === 'falda-larga') { const sk = part(hips, G.cone, pantsM, 0.42, lw === 'falda' ? 0.32 : 0.7, 0.36, 0, lw === 'falda' ? -0.12 : -0.3); (sk.material as THREE.Material).side = THREE.DoubleSide; }
    if (COAT.has(a.top)) for (const [x, z, rz] of [[-0.11, 0.07, 1], [0.11, 0.07, 1], [0, -0.1, 0]] as [number, number, number][]) {
      const pv = group(hips, x, 0.02, z);
      part(pv, G.box, jacketM, rz ? 0.2 : 0.36, a.top === 'abrigo' || a.top === 'haori' ? 0.62 : 0.5, 0.04, 0, a.top === 'abrigo' || a.top === 'haori' ? -0.3 : -0.24);
      coat.push(pv);
    }
    // ---- tronco
    const spine = group(hips, 0, 0.12);
    const exposed = a.top === 'top' || a.top === 'arnes';
    part(spine, G.box, exposed ? skinM('chest', 5, 4) : jacketM, 0.35 * (B === 'corpulento' ? 1.12 : 1), 0.24, 0.23 * (B === 'corpulento' ? 1.25 : 1), 0, 0.1);
    const chest = group(spine, 0, 0.2);
    const chestMat = exposed || a.top === 'tirantes' ? skinM('chest', 5, 5) : jacketM;
    part(chest, G.chest, chestMat, 0.5 * shoulders / wf, 0.34, 0.28, 0, 0.15).rotation.y = Math.PI / 8;
    if (a.top === 'tirantes') part(chest, G.chest, jacketM, 0.4, 0.26, 0.245, 0, 0.12).rotation.y = Math.PI / 8;
    if (a.top === 'top') part(chest, G.chest, cloth(a.shirt || a.accent, a.topPattern), 0.42, 0.18, 0.245, 0, 0.2).rotation.y = Math.PI / 8;
    if (a.top === 'arnes') { part(chest, G.box, beltM, 0.04, 0.4, 0.26, 0, 0.13).rotation.z = 0.7; part(chest, G.box, beltM, 0.04, 0.4, 0.26, 0, 0.13).rotation.z = -0.7; }
    if (['chaqueta', 'gabardina', 'abrigo', 'bomber', 'biker', 'blazer'].includes(a.top)) { part(chest, G.box, shirtM, 0.1, 0.18, 0.02, 0, 0.2, 0.125); part(chest, G.box, mk(lam({ color: hex(a.accent2 || a.jacket).multiplyScalar(0.7) })), 0.05, 0.16, 0.02, -0.07, 0.22, 0.126).rotation.z = 0.35; part(chest, G.box, mk(lam({ color: hex(a.jacket).multiplyScalar(0.7) })), 0.05, 0.16, 0.02, 0.07, 0.22, 0.126).rotation.z = -0.35; }
    if (a.top === 'armadura' || a.topDetail === 'placas') { part(chest, G.box, metalDarkM, 0.36, 0.22, 0.06, 0, 0.16, 0.12); part(chest, G.box, glowM, 0.2, 0.012, 0.01, 0, 0.12, 0.155); }
    if (a.top === 'poncho') part(chest, G.cone, cloth(a.jacket, a.topPattern), 0.7, 0.42, 0.5, 0, 0.12);
    if (a.top === 'sudadera' || a.top === 'chubasquero' || a.headwear === 'capucha') part(chest, G.box, a.headwear === 'capucha' ? mk(lam({ color: hex(a.headColor || a.jacket) })) : jacketM, 0.26, 0.12, 0.08, 0, 0.32, -0.12);
    if (a.topDetail === 'cremallera') part(chest, G.box, goldM, 0.012, 0.32, 0.01, 0.01, 0.14, 0.123);
    if (a.topDetail === 'led') { for (const x of [-0.17, 0.17]) part(chest, G.box, glowM, 0.012, 0.3, 0.012, x, 0.15, 0.11); part(spine, G.box, glowM, 0.32, 0.012, 0.2, 0, 0.0); }
    if (a.topDetail === 'reflectante') for (const y of [0.06, 0.18]) part(chest, G.box, mk(lam({ color: 0xe8f0ff, emissive: 0x404858 })), 0.42, 0.02, 0.25, 0, y);
    if (a.topDetail === 'cuello-pelo') part(chest, G.box, mk(lam({ color: 0xd8ccb8 })), 0.36, 0.06, 0.22, 0, 0.32);
    if (a.topDetail === 'tachuelas') for (let i = 0; i < 6; i++) part(chest, G.sphere, goldM, 0.02, 0.02, 0.02, -0.18 + i * 0.07, 0.31, 0.06);
    if (a.topDetail === 'parches') part(chest, G.box, mk(lam({ color: hex(a.accent2 || a.accent) })), 0.07, 0.06, 0.01, -0.1, 0.22, 0.123);
    if (a.topDetail === 'cinturon' || !bare) { part(hips, G.box, beltM, 0.35, 0.035, 0.21, 0, 0.12); part(hips, G.box, goldM, 0.04, 0.03, 0.01, 0, 0.12, 0.106); }
    if (chrome.has('torso')) { part(chest, G.box, metalM, 0.3, 0.2, 0.03, 0, 0.14, 0.12); part(chest, G.cyl, glowM, 0.06, 0.02, 0.06, 0, 0.15, 0.14).rotation.x = Math.PI / 2; }
    // ---- brazos
    const sleeveless = SLEEVELESS.has(a.top), short = SHORT.has(a.top);
    const armFor = (side: -1 | 1) => {
      const key = side < 0 ? 'brazo_izq' : 'brazo_der';
      const sh = group(chest, side * 0.29 * shoulders / wf, 0.27);
      if (lost.has(key)) { part(sh, G.sphere, mk(lam({ color: 0x8a0a12 })), 0.08, 0.06, 0.08, 0, -0.03); return { sh, el: group(sh, 0, -0.3), hand: group(sh, 0, -0.55) }; }
      const isChrome = chrome.has(key);
      const upper = isChrome ? metalM : sleeveless ? skinM(side > 0 ? 'armR' : 'armL', 2.5, 6) : sleeveM;
      part(sh, G.sphere, isChrome ? metalDarkM : upper, 0.14, 0.14, 0.14, 0, -0.01);
      part(sh, G.taper, upper, 0.125, 0.3, 0.13, 0, -0.15);
      if (a.top === 'armadura') part(sh, G.box, metalDarkM, 0.13, 0.08, 0.13, 0, 0.0);
      const el = group(sh, 0, -0.3);
      const fore = isChrome ? metalM : sleeveless || short ? skinM(side > 0 ? 'armR' : 'armL', 2.5, 6) : sleeveM;
      part(el, G.taper, fore, 0.105, 0.27, 0.11, 0, -0.135);
      if (isChrome) { part(el, G.sphere, metalDarkM, 0.09, 0.09, 0.09); part(el, G.box, glowM, 0.015, 0.22, 0.015, 0.035, -0.13, 0.03); }
      if (!sleeveless && !short && !isChrome) part(el, G.cyl, mk(lam({ color: hex(a.jacket).multiplyScalar(0.6) })), 0.085, 0.03, 0.085, 0, -0.25);
      const hand = group(el, 0, -0.29);
      if (!lost.has(side < 0 ? 'mano_izq' : 'mano_der')) {
        part(hand, G.box, isChrome ? metalM : plainSkin, 0.085, 0.1, 0.05, 0, -0.035);
        part(hand, G.box, isChrome ? metalM : plainSkin, 0.025, 0.05, 0.03, side * -0.04, -0.02, 0.02);
      }
      return { sh, el, hand };
    };
    const AL = armFor(-1), AR = armFor(1);
    // ---- cabeza
    const neck = group(chest, 0, 0.32);
    part(neck, G.cyl, tatOn('neck') ? skinM('neck', 2, 2) : plainSkin, 0.12, 0.1, 0.12, 0, 0.04);
    const head = group(neck, 0, 0.21);
    const [fw, fh] = a.faceShape === 'ancha' || a.faceShape === 'redonda' ? [0.24, 0.26] : a.faceShape === 'alargada' || a.faceShape === 'afilada' ? [0.205, 0.29] : [0.22, 0.27];
    const face = mk(lam({ map: tex(faceCanvas(a, chrome.has('ojos'))) }));
    const skinHead = plainSkin;
    const hairCover = !['calvo', 'rapado'].includes(a.hairStyle);
    const headMats = [skinHead, skinHead, hairCover ? hairM : skinHead, skinHead, face, hairCover ? hairM : skinHead];
    part(head, G.box, headMats, fw, fh, 0.24, 0, 0);
    part(head, G.box, plainSkin, fw * 0.8, 0.05, 0.16, 0, -fh / 2 - 0.01, 0.01); // mandíbula
    for (const sx of [-1, 1]) part(head, G.box, plainSkin, 0.02, 0.06, 0.04, sx * (fw / 2 + 0.01), 0, -0.01); // orejas
    part(head, G.box, plainSkin, 0.035, 0.05, 0.04, 0, -0.02, 0.13); // nariz
    if (chrome.has('cabeza')) { part(head, G.box, metalM, 0.02, 0.1, 0.1, -fw / 2 - 0.012, 0.02, -0.02); part(head, G.sphere, glowM, 0.025, 0.025, 0.025, -fw / 2 - 0.02, 0.02, 0.02); }
    if (chrome.has('ojos')) part(head, G.box, mk(new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.6 })), fw * 0.9, 0.03, 0.01, 0, 0.0, 0.123);
    // Pelo.
    const hs = a.hairStyle, covered = a.headwear === 'casco' || a.headwear === 'casco-moto';
    if (!covered) {
      const cap = () => part(head, G.box, hairM, fw + 0.02, 0.06, 0.26, 0, fh / 2, -0.005);
      if (!['calvo', 'rapado', 'mohicano'].includes(hs)) cap();
      if (['corto', 'flequillo', 'asimetrico', 'undercut', 'puntas', 'erizo', 'lobo', 'pompadour', 'cresta', 'bob', 'media-melena', 'largo', 'melena', 'coleta', 'coleta-alta', 'trenzas', 'trenza-larga', 'moño', 'dos-moños', 'rizos', 'rastas'].includes(hs)) part(head, G.box, hairM, fw + 0.02, fh * 0.75, 0.04, 0, fh * 0.1, -0.13);
      if (hs === 'rapado') part(head, G.box, mk(lam({ color: hex(a.hair), transparent: true, opacity: 0.55 })), fw + 0.004, 0.02, 0.215, 0, fh / 2);
      if (hs === 'mohicano' || hs === 'cresta') part(head, G.box, hairM, 0.04, hs === 'mohicano' ? 0.14 : 0.09, 0.2, 0, fh / 2 + 0.05);
      if (hs === 'flequillo' || hs === 'asimetrico') part(head, G.box, hairM, fw * 0.7, 0.07, 0.03, 0.03, fh / 2 - 0.03, 0.105);
      if (hs === 'pompadour') part(head, G.box, hairM, fw * 0.9, 0.08, 0.12, 0, fh / 2 + 0.04, 0.05);
      if (hs === 'puntas' || hs === 'erizo') for (let i = 0; i < 5; i++) part(head, G.cone, hairM, 0.05, 0.09, 0.05, -0.08 + i * 0.04, fh / 2 + 0.06, -0.02 + (i % 2) * 0.04);
      if (hs === 'afro' || hs === 'afro-corto') part(head, G.sphere, hairM, hs === 'afro' ? 0.36 : 0.27, hs === 'afro' ? 0.34 : 0.25, hs === 'afro' ? 0.36 : 0.27, 0, fh / 2 - 0.02, -0.03);
      if (['largo', 'melena', 'media-melena', 'bob'].includes(hs)) part(head, G.box, hairM, fw + 0.05, hs === 'bob' ? 0.22 : hs === 'media-melena' ? 0.3 : 0.42, 0.06, 0, hs === 'bob' ? -0.02 : -0.1, -0.11);
      if (hs === 'melena' || hs === 'bob') for (const sx of [-1, 1]) part(head, G.box, hairM, 0.035, 0.2, 0.18, sx * (fw / 2 + 0.02), -0.02, 0);
      if (hs === 'coleta' || hs === 'coleta-alta') part(head, G.cyl, hairM, 0.06, 0.26, 0.06, 0, hs === 'coleta' ? -0.05 : 0.05, -0.15).rotation.x = 0.4;
      if (hs === 'moño') part(head, G.sphere, hairM, 0.1, 0.1, 0.1, 0, fh / 2 + 0.04, -0.06);
      if (hs === 'dos-moños') for (const sx of [-1, 1]) part(head, G.sphere, hairM, 0.08, 0.08, 0.08, sx * 0.07, fh / 2 + 0.04, -0.02);
      if (hs === 'trenzas' || hs === 'trenza-larga') for (const sx of hs === 'trenzas' ? [-1, 1] : [0]) part(head, G.cyl, hairM, 0.045, 0.34, 0.045, sx * 0.09, -0.15, -0.1);
      if (hs === 'rastas') for (let i = 0; i < 6; i++) part(head, G.cyl, hairM, 0.03, 0.3, 0.03, -0.09 + i * 0.036, -0.12, -0.11 + (i % 2) * 0.02);
      if (hs === 'rizos') for (let i = 0; i < 6; i++) part(head, G.sphere, hairM, 0.07, 0.07, 0.07, -0.08 + (i % 3) * 0.08, fh / 2 + 0.01, -0.05 + Math.floor(i / 3) * 0.08);
    }
    if (a.facial === 'barba-larga') part(head, G.box, hairM, fw * 0.8, 0.12, 0.06, 0, -fh / 2 - 0.05, 0.08);
    // Prendas de cabeza y cara.
    const hc = hex(a.headColor || a.accent).multiplyScalar(a.headColor ? 1 : 0.6);
    const hcM = mk(lam({ color: hc }));
    const hw = a.headwear || (['gorra', 'capucha'].includes(a.accessory) ? a.accessory : '');
    const ew = a.eyewear || (['gafas', 'visor', 'mascara'].includes(a.accessory) ? a.accessory : '');
    if (hw === 'gorra') { part(head, G.box, hcM, fw + 0.03, 0.07, 0.23, 0, fh / 2 + 0.02); part(head, G.box, hcM, fw * 0.9, 0.015, 0.1, 0, fh / 2 - 0.01, 0.15); }
    if (hw === 'gorro') part(head, G.box, cloth(a.headColor || '#3a3a44', 'punto', 3, 2), fw + 0.03, 0.1, 0.23, 0, fh / 2 + 0.01);
    if (hw === 'boina') part(head, G.sphere, hcM, fw + 0.08, 0.06, 0.26, -0.02, fh / 2 + 0.02);
    if (hw === 'casco') part(head, G.sphere, hcM, fw + 0.07, fh + 0.06, 0.28, 0, 0.03);
    if (hw === 'casco-moto') { part(head, G.sphere, hcM, fw + 0.09, fh + 0.1, 0.29, 0, 0.0); part(head, G.box, mk(new THREE.MeshStandardMaterial({ color: 0x0a1018, metalness: 0.6, roughness: 0.15 })), fw * 0.95, 0.08, 0.02, 0, 0.01, 0.14); }
    if (hw === 'sombrero') { part(head, G.cyl, hcM, 0.36, 0.015, 0.36, 0, fh / 2 + 0.01); part(head, G.cyl, hcM, fw + 0.02, 0.1, 0.22, 0, fh / 2 + 0.06); }
    if (hw === 'bandana') part(head, G.box, hcM, fw + 0.025, 0.04, 0.225, 0, fh / 2 - 0.03);
    if (hw === 'capucha') part(head, G.box, hcM, fw + 0.06, fh + 0.06, 0.25, 0, 0.02, -0.02);
    if (hw === 'diadema-led') part(head, G.box, glowM, fw + 0.03, 0.02, 0.02, 0, fh / 2 + 0.01, 0.04);
    if (ew === 'gafas' || ew === 'gafas-sol') for (const sx of [-1, 1]) part(head, G.box, mk(lam({ color: 0x080808 })), 0.07, 0.04, 0.01, sx * 0.045, 0.01, 0.124);
    if (ew === 'visor' || ew === 'visor-tactico') part(head, G.box, mk(new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.8 })), fw + 0.01, 0.05, 0.02, 0, 0.01, 0.126);
    if (ew === 'monoculo') part(head, G.cyl, glowM, 0.04, 0.01, 0.04, 0.045, 0.01, 0.11).rotation.x = Math.PI / 2;
    if (FACE_COVER.has(ew) || ew === 'mascara') {
      const col = ew === 'mascara-demonio' ? 0xb01020 : ew === 'bandana-cara' ? hc.getHex() : 0x202028;
      part(head, G.box, mk(lam({ color: col })), fw + 0.01, ew === 'mascara-demonio' ? fh : 0.1, 0.04, 0, ew === 'mascara-demonio' ? 0 : -0.06, 0.1);
      if (ew === 'mascara-gas') part(head, G.cyl, metalDarkM, 0.06, 0.05, 0.06, 0, -0.07, 0.14).rotation.x = Math.PI / 2;
      if (ew === 'mascara-demonio') for (const sx of [-1, 1]) part(head, G.cone, mk(lam({ color: 0xe8e0d0 })), 0.04, 0.09, 0.04, sx * 0.07, fh / 2 + 0.03, 0.06);
    }
    if (a.accessory === 'auriculares' && !hw) for (const sx of [-1, 1]) part(head, G.cyl, mk(lam({ color: 0x202028 })), 0.06, 0.03, 0.06, sx * (fw / 2 + 0.02), 0.01, 0).rotation.z = Math.PI / 2;
    // ---- armas: en la mano y las que lleva encima
    const handR = group(AR.hand, 0, -0.05, 0.02);
    const wi = s.weapon ? content.items.find((i) => i.id === s.weapon) : undefined;
    const bigFam = (f: string, id: string) => ['Rifle', 'Escopeta', 'Ametralladora', 'Especial', 'Arco', 'Subfusil'].includes(f) || ['bate', 'katana-termica', 'lanza-electrica', 'hacha-plasma', 'espada-monofilamento', 'martillo-neumatico', 'machete'].includes(id);
    let big = false, ranged = false;
    if (wi?.weapon && wi.weapon.family !== 'Implante') {
      const w = this.weaponMesh(wi.id, wi.weapon.family, wi.weapon.kind, mk, glowM);
      // En la mano: las de fuego apuntan hacia delante; las de cuerpo a cuerpo, hacia arriba.
      if (wi.weapon.kind === 'ranged') { w.rotation.x = Math.PI; w.position.set(0, -0.02, 0.02); } else { w.rotation.x = 1.2; w.position.set(0, 0, 0.0); }
      handR.add(w);
      big = bigFam(wi.weapon.family, wi.id); ranged = wi.weapon.kind === 'ranged';
    }
    let back = 0, hip = 0;
    for (const id of s.carry ?? []) {
      const ci = content.items.find((i) => i.id === id);
      if (!ci?.weapon) continue;
      const w = this.weaponMesh(ci.id, ci.weapon.family, ci.weapon.kind, mk, glowM);
      if (bigFam(ci.weapon.family, ci.id)) { if (ci.weapon.kind === 'ranged') { w.position.set(0.04 - back * 0.08, 0.14, -0.15); w.rotation.set(0, 0, 2.4); } else { w.position.set(0.12 - back * 0.06, 0.4, -0.15); w.rotation.set(Math.PI, 0, -0.45); } chest.add(w); back++; }
      else { w.position.set(hip % 2 ? -0.2 : 0.2, 0.0, 0.02); w.rotation.set(Math.PI, 0, 0); w.scale.multiplyScalar(0.85); hips.add(w); part(hips, G.box, mk(lam({ color: 0x3a2a1c })), 0.05, 0.12, 0.06, hip % 2 ? -0.2 : 0.2, -0.04, 0.02); hip++; }
    }
    if (back) { part(chest, G.box, mk(lam({ color: 0x3a2a1c })), 0.04, 0.42, 0.25, 0, 0.13).rotation.z = -0.75; }
    // ---- sombra bajo los pies
    const shadow = new THREE.Mesh(G.disc, mk(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })));
    shadow.rotation.x = -Math.PI / 2; shadow.scale.set(0.5, 0.36, 1); shadow.position.y = 0.01; root.add(shadow);
    if (s.kind === 'player') { const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.32, 24), mk(new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.8, depthWrite: false }))); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.012; root.add(ring); }
    this.world.add(root);
    return { root, body, hips, spine, chest, neck, thighL: L.thigh, thighR: R.thigh, kneeL: L.knee, kneeR: R.knee, shoulderL: AL.sh, shoulderR: AR.sh, elbowL: AL.el, elbowR: AR.el, handR, coat,
      shadow, key: '', heading: Math.PI / 4, phase: Math.random() * 6, lie: 0, big, ranged, mats, lastX: e.x, lastY: e.y, speed: 0 };
  }

  /** Armas sencillas con volumen: pistolas, fusiles, escopetas, hojas y contundentes. Mira hacia +Y (se rota en la mano). */
  private weaponMesh(id: string, fam: string, kind: string, mk: <T extends THREE.Material>(m: T) => T, glow: THREE.Material) {
    const g = new THREE.Group();
    const gun = mk(new THREE.MeshStandardMaterial({ color: 0x1c1e26, metalness: 0.6, roughness: 0.45 }));
    const gun2 = mk(new THREE.MeshStandardMaterial({ color: 0x3a3e4a, metalness: 0.5, roughness: 0.5 }));
    const wood = mk(new THREE.MeshLambertMaterial({ color: 0x6a4a30 }));
    const steel = mk(new THREE.MeshStandardMaterial({ color: 0xd8dce8, metalness: 0.9, roughness: 0.2 }));
    const hot = /termica|plasma/.test(id) ? mk(new THREE.MeshBasicMaterial({ color: 0xff6a20 })) : /electrica|monofilamento|taser/.test(id) ? mk(new THREE.MeshBasicMaterial({ color: 0x43c8ff })) : null;
    const b = (mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number) => { const m = new THREE.Mesh(G.box, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); g.add(m); };
    if (kind === 'ranged') {
      if (/Pistola|Revólver|Táser/.test(fam)) { b(gun2, 0.03, 0.08, 0.035, 0, 0.0, -0.02); b(gun, 0.032, 0.14, 0.045, 0, 0.06, 0.01); b(glow, 0.01, 0.05, 0.01, 0, 0.07, 0.035); }
      else if (fam === 'Subfusil') { b(gun2, 0.03, 0.08, 0.035, 0, 0, -0.02); b(gun, 0.04, 0.26, 0.06, 0, 0.1, 0.01); b(gun2, 0.03, 0.08, 0.03, 0, 0.06, -0.06); b(glow, 0.01, 0.1, 0.01, 0, 0.1, 0.045); }
      else if (fam === 'Escopeta') { b(wood, 0.04, 0.16, 0.05, 0, -0.1, 0); b(gun, 0.045, 0.5, 0.05, 0, 0.18, 0.01); b(wood, 0.04, 0.12, 0.04, 0, 0.16, -0.03); }
      else if (fam === 'Arco') { b(gun, 0.02, 0.6, 0.02, 0, 0.1, 0.05); b(steel, 0.01, 0.4, 0.01, 0, 0.1, 0.0); }
      else { b(gun2, 0.04, 0.16, 0.06, 0, -0.1, 0); b(gun, 0.045, 0.56, 0.06, 0, 0.2, 0.01); b(gun2, 0.035, 0.1, 0.035, 0, 0.08, -0.06); b(glow, 0.012, 0.18, 0.012, 0, 0.18, 0.045); if (/precision|francotirador/.test(id)) b(gun2, 0.03, 0.14, 0.03, 0, 0.18, 0.06); }
    } else {
      if (/katana|espada|machete|hoja|cuchillo|navaja/.test(id) || fam === 'Hoja' || fam === 'Cuchillo') { const long = !/cuchillo|navaja/.test(id) && fam !== 'Cuchillo'; b(gun, 0.03, 0.12, 0.03, 0, 0.0, 0); b(steel, 0.08, 0.02, 0.03, 0, 0.07, 0); b(hot ?? steel, 0.015, long ? 0.62 : 0.2, 0.04, 0, long ? 0.39 : 0.18, 0); }
      else if (/bate|martillo|hacha|tuberia|porra|nunchaku/.test(id)) { b(wood, 0.04, 0.55, 0.04, 0, 0.25, 0); if (/martillo|hacha/.test(id)) b(hot ?? steel, 0.1, 0.08, 0.04, 0.04, 0.5, 0); }
      else b(hot ?? steel, 0.03, 0.3, 0.03, 0, 0.12, 0);
    }
    return g;
  }

  // ================================================================ animación y dibujo
  /** Sincroniza los modelos con las entidades visibles y dibuja el fotograma. */
  render(ents: Iterable<Ent3D>, opts: { W: number; H: number; zoom: number; worldX: number; worldY: number; meId: number; guarding: boolean; now: number; dt: number; serverNow: number; hidden: (e: Ent3D) => boolean }) {
    const seen = new Set<number>();
    for (const e of ents) {
      const s = e.s;
      if ((s.kind !== 'player' && s.kind !== 'npc') || opts.hidden(e)) continue;
      seen.add(s.id);
      const key = JSON.stringify([s.appearance, s.chrome, s.lost, s.weapon, s.carry, s.kind]);
      let r = this.rigs.get(s.id);
      if (!r || r.key !== key) { if (r) this.disposeRig(r); r = this.build(e); r.key = key; this.rigs.set(s.id, r); }
      this.animate(r, e, opts);
    }
    for (const [id, r] of this.rigs) if (!seen.has(id)) { this.disposeRig(r); this.rigs.delete(id); }
    // Cámara: el centro de la pantalla corresponde al mismo punto del suelo que en la vista 2D.
    const z = opts.zoom;
    const lx = (opts.W / 2 - opts.worldX) / z, ly = (opts.H / 2 - opts.worldY) / z; // píxeles del mundo sin cámara
    const tx = (lx / 32 + ly / 16) / 2, ty = (ly / 16 - lx / 32) / 2;            // inversa de worldToScreen
    const c = Math.cos(Math.PI / 6), sn = Math.sin(Math.PI / 6);
    const target = new THREE.Vector3(tx, 0, ty);
    const d = new THREE.Vector3(-c / Math.SQRT2, -sn, -c / Math.SQRT2);
    this.camera.position.copy(target).addScaledVector(d, -1500);
    this.camera.up.set(0, 1, 0); this.camera.lookAt(target);
    const hw = opts.W / 2 / (PX_PER_UNIT * z), hh = opts.H / 2 / (PX_PER_UNIT * z);
    this.camera.left = -hw; this.camera.right = hw; this.camera.top = hh; this.camera.bottom = -hh;
    this.camera.updateProjectionMatrix();
    const gl = this.renderer.getContext();
    const vp = gl.getParameter(gl.VIEWPORT) as Int32Array; // Pixi guarda su viewport en caché: hay que devolverlo tal cual
    this.renderer.resetState();
    this.renderer.setViewport(0, 0, this.vpW, this.vpH);
    this.renderer.clearDepth();
    this.renderer.render(this.scene, this.camera);
    this.renderer.resetState();
    gl.viewport(vp[0], vp[1], vp[2], vp[3]);
  }

  private animate(r: Rig, e: Ent3D, o: { meId: number; guarding: boolean; now: number; dt: number; serverNow: number }) {
    const s = e.s, now = o.now, dt = Math.min(0.1, o.dt);
    r.root.position.set(e.x, 0, e.y);
    // Velocidad y orientación: hacia donde se mueve (giro suave), o hacia su objetivo cuando ataca.
    const dx = e.x - r.lastX, dy = e.y - r.lastY; r.lastX = e.x; r.lastY = e.y;
    const sp = Math.hypot(dx, dy) / Math.max(0.001, dt);
    r.speed += (sp - r.speed) * Math.min(1, dt * 8);
    let want = r.heading;
    if (e.lookAt && now < e.lookAt.until) want = Math.atan2(e.lookAt.x - e.x, e.lookAt.y - e.y);
    else if (Math.hypot(dx, dy) > 0.0015) want = Math.atan2(dx, dy);
    let diff = want - r.heading; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
    r.heading += diff * Math.min(1, dt * 12);
    r.root.rotation.y = r.heading;
    const moving = e.moving || r.speed > 0.25;
    const run = moving && (s.buffs?.includes('corriendo') || r.speed > 3.2);
    r.phase += dt * (moving ? (run ? 11 : 7.5) : 1.6);
    const sw = moving ? Math.sin(r.phase) : 0, amp = run ? 0.8 : 0.5;
    const bob = moving ? Math.abs(Math.cos(r.phase)) * (run ? 0.05 : 0.025) : Math.sin(r.phase) * 0.006;
    // Postura base.
    let thL = sw * amp, thR = -sw * amp, knL = Math.max(0, -Math.cos(r.phase)) * (run ? 1.2 : 0.7) * (moving ? 1 : 0), knR = Math.max(0, Math.cos(r.phase)) * (run ? 1.2 : 0.7) * (moving ? 1 : 0);
    let shL = sw * amp * 0.8, shR = -sw * amp * 0.8, elL = moving ? -0.35 - (run ? 0.6 : 0) : -0.12, elR = moving ? -0.35 - (run ? 0.6 : 0) : -0.12;
    let shLz = -0.06, shRz = 0.06, spineX = run ? 0.18 : moving ? 0.05 : 0, spineY = moving ? sw * 0.08 : 0, neckX = 0;
    r.chest.scale.setScalar(1 + (moving ? 0 : Math.sin(r.phase * 1.4) * 0.012)); // respiración
    // Armas: postura de combate o de apuntar.
    const guard = s.id === o.meId ? o.guarding : !!s.buffs?.includes('guardia');
    const since = e.attackAt ? now - e.attackAt : 1e9;
    if (r.ranged) { shR = -1.25 + sw * 0.05; elR = -0.2; if (r.big) { shL = -1.1; shLz = 0.45; elL = -0.6; } }
    if (guard) { if (r.ranged) { shR = -1.55; elR = 0; if (r.big) { shL = -1.45; shLz = 0.5; elL = -0.3; } } else { shR = -1.3; elR = -1.4; shL = -1.2; elL = -1.5; } }
    if (since < 340 && (e.attackKind === 'hit' || e.attackKind === 'heavy')) { const k = since / (e.attackKind === 'heavy' ? 440 : 340); shR = k < 0.35 ? -2.6 : -2.6 + (k - 0.35) * 4.2; elR = -0.4; spineY = (k < 0.35 ? -0.4 : 0.35); if (r.big) { shL = shR + 0.2; } }
    else if (since < 300 && e.attackKind === 'shot') { shR = -1.6; elR = 0; spineX -= 0.06; }
    const kickT = e.kickAt ? now - e.kickAt : 1e9;
    if (kickT < 320) { const k = Math.sin((kickT / 320) * Math.PI); thR = -1.5 * k; knR = 0.2; spineX = -0.2 * k; }
    // Baile.
    if (s.emote && !moving && !s.vehicle) {
      const age = Math.max(0, o.serverNow - s.emote.at) / 1000;
      const pose = dancePose(s.emote.move, age);
      thL = pose.left * 0.8; thR = pose.right * 0.8; shL = -pose.back; shR = -pose.front; spineY = pose.lean; r.body.position.x = pose.sway * 0.01;
      r.root.rotation.y = r.heading + (pose.turn !== undefined ? (pose.turn < 0 ? Math.PI : 0) : 0);
    } else r.body.position.x = 0;
    // Tumbado (derribado, muerto o durmiendo).
    const lying = s.state === 'downed' || s.state === 'sleeping' || !!s.dead;
    r.lie += ((lying ? 1 : 0) - r.lie) * Math.min(1, dt * 5);
    const roll = e.rollAt ? now - e.rollAt : 1e9;
    r.body.rotation.x = roll < 380 ? (roll / 380) * Math.PI * 2 : -r.lie * Math.PI / 2;
    r.body.position.y = (roll < 380 ? Math.sin((roll / 380) * Math.PI) * 0.12 : 0) + r.lie * 0.06 + bob * M;
    if (lying) { thL = 0.1; thR = -0.05; knL = 0.2; knR = 0.1; shL = -0.3; shR = 0.4; elL = -0.2; elR = -0.3; spineX = 0; neckX = 0.2; }
    r.thighL.rotation.x = -thL; r.thighR.rotation.x = -thR; r.kneeL.rotation.x = knL; r.kneeR.rotation.x = knR;
    r.shoulderL.rotation.set(shL, 0, shLz); r.shoulderR.rotation.set(shR, 0, shRz);
    r.elbowL.rotation.x = elL; r.elbowR.rotation.x = elR;
    r.spine.rotation.set(spineX, spineY, 0); r.neck.rotation.x = neckX;
    for (const [i, c] of r.coat.entries()) c.rotation.x = i === 2 ? Math.max(0, Math.abs(sw) * 0.25) : -Math.max(0, (i ? thR : thL)) * 0.6;
    // Invisible (camuflaje): casi transparente para los demás.
    const invis = !!s.buffs?.includes('invisible');
    r.root.visible = !invis || s.id === o.meId;
    r.shadow.visible = !lying;
  }

  dispose() { for (const r of this.rigs.values()) this.disposeRig(r); this.rigs.clear(); }
}
