// v0.11 · Personajes en 3D (Three.js) dentro de la vista isométrica: modelos articulados con volumen, ropa y piel con las
// texturas detalladas (tejidos y tatuajes), cara pintada, peinados, complementos, cromo metálico con luces, armas en la mano,
// a la espalda y en la cadera, y animación procedural (andar, correr, respirar, golpear, apuntar, bloquear, patada, rodar,
// bailar, caer). Se dibujan en un lienzo WebGL propio con una cámara ortográfica que reproduce exactamente la proyección 2:1
// del juego, y los edificios (y el mobiliario grande) se añaden como volúmenes invisibles que tapan a quien está detrás.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { hashString, seededRng, type Appearance, type EntitySpawn, type ZoneDef } from '@vertice/shared';
import { content } from '../content';
import { fabricCanvas, skinCanvas } from './textures';
import { dancePose } from './dance';
import { City3D } from './city3d';
import { gunModel, gunsVersion, loadGuns } from './guns3d';

/** Altura del juego: 32 px por unidad (la proyección real daría 39,2): comprimimos el eje vertical igual. */
const Y_SQUASH = 32 / (45.2548 * Math.cos(Math.PI / 6));
const PX_PER_UNIT = 45.2548; // 32 / cos 45°
/** Escala del modelo: un humano de 1,80 m mide 0,9 unidades (los personajes se ven más pequeños que antes). */
const M = 0.9 / 1.8;
export const BUILDING_H = 1.35;

export interface Ent3D {
  x: number; y: number; moving: boolean; s: EntitySpawn; attackAt?: number; attackKind?: string; rollAt?: number; kickAt?: number;
  samples: { x: number; y: number; t: number }[]; lookAt?: { x: number; y: number; until: number }; flags?: number;
  /** v0.12 · Fantasma (compañeros de las matrices): translúcido, flota y se tiñe del color de su matriz. */
  ghost?: { color: number; alpha: number; float: number };
}

const hex = (s?: string, d = '#888888') => new THREE.Color(s && /^#[0-9a-f]{6}$/i.test(s) ? s : d);
const SLEEVELESS = new Set(['top', 'chaleco', 'tirantes', 'arnes']);
const SHORT = new Set(['camiseta', 'camisa']);
const COAT = new Set(['gabardina', 'abrigo', 'chubasquero', 'haori']);
const FACE_COVER = new Set(['mascara', 'mascara-gas', 'bandana-cara', 'mascara-demonio']);

// Geometrías compartidas (se escalan por pieza).
/** Perfil de torno (radio a lo largo de la altura, de abajo arriba) para músculos con forma: muslo, gemelo, brazo. */
const lathe = (prof: [number, number][], seg = 32) => { const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg); g.computeVertexNormals(); return g; };
// v0.12 · Geometrías con más polígonos: cajas redondeadas, músculos con perfil anatómico y esferas más finas.
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  rbox: new RoundedBoxGeometry(1, 1, 1, 5, 0.18),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 28, 2),
  taper: new THREE.CylinderGeometry(0.42, 0.5, 1, 28, 2), // más estrecho arriba
  chest: new THREE.CylinderGeometry(0.5, 0.4, 1, 32, 3),  // más ancho arriba (pecho)
  sphere: new THREE.SphereGeometry(0.5, 32, 24),
  cone: new THREE.ConeGeometry(0.5, 1, 24, 2, true),
  disc: new THREE.CircleGeometry(0.5, 24),
  // Muslo y brazo: anchos arriba y estrechos en la rodilla/codo. Gemelo y antebrazo: abultados en el tercio superior.
  thigh: lathe([[0.001, -0.5], [0.34, -0.49], [0.4, -0.38], [0.47, -0.1], [0.5, 0.18], [0.49, 0.4], [0.42, 0.5], [0.001, 0.5]]),
  calf: lathe([[0.001, -0.5], [0.3, -0.49], [0.33, -0.3], [0.45, 0.05], [0.5, 0.22], [0.44, 0.45], [0.38, 0.5], [0.001, 0.5]]),
  torsoL: lathe([[0.001, -0.5], [0.42, -0.5], [0.46, -0.3], [0.44, -0.05], [0.48, 0.2], [0.5, 0.38], [0.44, 0.5], [0.001, 0.5]], 36),
  finger: new THREE.CapsuleGeometry(0.5, 1, 4, 10),
};
const texCache = new Map<HTMLCanvasElement, THREE.CanvasTexture>();
function tex(cv: HTMLCanvasElement) {
  let t = texCache.get(cv);
  if (!t) { t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; texCache.set(cv, t); }
  return t;
}
// v0.12 · Material con sombreado físico (luz especular suave en tela y piel) en vez de Lambert plano.
const lam = (o: THREE.MeshLambertMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0, ...(o as any) });

/** Cara pintada a mano en un lienzo: ojos con pupila y brillo, cejas, nariz, boca, vello facial, maquillaje, cicatrices y tatuajes. */
function faceCanvas(a: Required<Appearance>, chromeEyes: boolean, seed = 1) {
  const W = 96, H = 112, RES = 2;
  const cv = document.createElement('canvas'); cv.width = W * RES; cv.height = H * RES;
  const c = cv.getContext('2d')!;
  c.scale(RES, RES); // v0.14 · el doble de resolución
  // v0.14 · Un solo cuerpo base y caras únicas: cada persona tiene sus proporciones (sale de su nombre, siempre igual).
  const r = seededRng(seed);
  const eg = 20 + (r() - 0.5) * 7, eyY = H * (0.5 + (r() - 0.5) * 0.05), ew = 10 * (0.82 + r() * 0.34), eh = 6 * (0.78 + r() * 0.44), tilt = (r() - 0.5) * 0.28, iris = 5 * (0.85 + r() * 0.3);
  const browDy = (r() - 0.5) * 6, browTilt = (r() - 0.5) * 0.3, browLen = 24 * (0.82 + r() * 0.34);
  const noseTop = 0.52 + (r() - 0.5) * 0.04, noseBot = 0.68 + (r() - 0.5) * 0.06, nwk = 0.82 + r() * 0.4;
  const mw = 13 * (0.8 + r() * 0.42), mdy = (r() - 0.5) * 0.04 * H;
  const freckles = r() < 0.16, mole = r() < 0.28 ? [W * (0.25 + r() * 0.5), H * (0.55 + r() * 0.3)] : null, lines = r() < 0.22, lashes = r() < 0.45;
  const skin = a.skin, hair = a.hair, accent = a.accent;
  c.fillStyle = skin; c.fillRect(0, 0, W, H);
  // Volumen: mejillas y sombra bajo la frente.
  const g = c.createRadialGradient(W / 2, H * 0.55, 10, W / 2, H * 0.55, W * 0.7);
  g.addColorStop(0, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0.22)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.fillStyle = 'rgba(200,80,80,0.10)'; c.beginPath(); c.ellipse(W * 0.25, H * 0.66, 10, 6, 0, 0, 7); c.ellipse(W * 0.75, H * 0.66, 10, 6, 0, 0, 7); c.fill();
  // Cejas.
  const bw = a.brows === 'finas' ? 2 : a.brows === 'gruesas' ? 6 : 4;
  c.fillStyle = shadeCss(hair, 0.9);
  for (const sx of [-1, 1]) { c.save(); c.translate(W / 2 + sx * eg, H * 0.40 + browDy); c.rotate(sx * (browTilt + (a.brows === 'arqueadas' ? -0.18 : 0))); c.fillRect(-browLen / 2, -bw / 2, browLen, bw); c.restore(); }
  // Ojos.
  const eye = chromeEyes ? accent : a.eyes || '#3a2a1a';
  for (const sx of [-1, 1]) {
    const ex = W / 2 + sx * eg, ey = eyY;
    c.fillStyle = '#f2f2f2'; c.beginPath(); c.ellipse(ex, ey, ew, eh, sx * tilt, 0, 7); c.fill();
    c.fillStyle = eye; c.beginPath(); c.arc(ex + 1, ey, iris, 0, 7); c.fill();
    c.fillStyle = '#060608'; c.beginPath(); c.arc(ex + 1, ey, iris * 0.48, 0, 7); c.fill();
    if (lashes) { c.strokeStyle = '#0a0a0a'; c.lineWidth = 1; for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(ex + k * ew * 0.35, ey - eh * 0.9); c.lineTo(ex + k * ew * 0.42, ey - eh * 1.3); c.stroke(); } }
    c.fillStyle = '#ffffff'; c.fillRect(ex + 2, ey - 3, 2, 2);
    c.strokeStyle = shadeCss(skin, 0.45); c.lineWidth = 2; c.beginPath(); c.ellipse(ex, ey, ew, eh, sx * tilt, Math.PI, 0); c.stroke();
    if (chromeEyes) { c.fillStyle = hexA(accent, 0.35); c.fillRect(ex - 13, ey - 8, 26, 16); }
    if (a.makeup === 'delineado') { c.strokeStyle = '#101010'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(ex - 11, ey - 2); c.lineTo(ex + 13, ey - 4); c.stroke(); }
    if (a.makeup === 'neon') { c.fillStyle = a.makeupColor || '#ff3fa4'; c.fillRect(ex - 10, ey + 8, 20, 3); }
  }
  if (a.makeup === 'pintura') { c.fillStyle = hexA(a.makeupColor || '#ff3fa4', 0.7); c.fillRect(0, H * 0.46, W, 8); }
  // Nariz.
  c.fillStyle = shadeCss(skin, 0.72);
  const nw = (a.nose === 'ancha' ? 14 : a.nose === 'pequena' ? 6 : a.nose === 'chata' ? 12 : 9) * nwk;
  c.beginPath(); c.moveTo(W / 2, H * noseTop); c.lineTo(W / 2 + nw / 2, H * noseBot); c.lineTo(W / 2 - nw / 2, H * noseBot); c.closePath(); c.fill();
  c.fillStyle = shadeCss(skin, 0.5); c.fillRect(W / 2 - nw / 2, H * noseBot, nw, 2);
  // Boca.
  const lip = a.makeup === 'labios' ? (a.makeupColor || '#c01040') : shadeCss(skin, 0.52);
  c.strokeStyle = lip; c.fillStyle = lip; c.lineWidth = a.mouth === 'labios-gruesos' ? 5 : a.mouth === 'fina' ? 2 : 3;
  c.beginPath();
  c.save(); c.translate(0, mdy);
  if (a.mouth === 'sonrisa') { c.moveTo(W / 2 - mw - 1, H * 0.78); c.quadraticCurveTo(W / 2, H * 0.86, W / 2 + mw + 1, H * 0.78); }
  else if (a.mouth === 'seria') { c.moveTo(W / 2 - mw, H * 0.81); c.quadraticCurveTo(W / 2, H * 0.77, W / 2 + mw, H * 0.81); }
  else if (a.mouth === 'mueca') { c.moveTo(W / 2 - mw, H * 0.8); c.lineTo(W / 2 + 2, H * 0.8); c.quadraticCurveTo(W / 2 + 10, H * 0.79, W / 2 + mw + 1, H * 0.75); }
  else { c.moveTo(W / 2 - mw, H * 0.8); c.lineTo(W / 2 + mw, H * 0.8); }
  c.stroke(); c.restore();
  // Rasgos propios: pecas, un lunar, arrugas de expresión.
  if (freckles) { c.fillStyle = shadeCss(skin, 0.7); for (let k = 0; k < 14; k++) { c.beginPath(); c.arc(W / 2 + (k % 2 ? 1 : -1) * (14 + r() * 16), H * (0.56 + r() * 0.1), 0.9, 0, 7); c.fill(); } }
  if (mole) { c.fillStyle = shadeCss(skin, 0.35); c.beginPath(); c.arc(mole[0], mole[1], 1.4, 0, 7); c.fill(); }
  if (lines) { c.strokeStyle = shadeCss(skin, 0.7); c.lineWidth = 1; c.beginPath(); c.moveTo(W * 0.32, H * 0.2); c.lineTo(W * 0.68, H * 0.2); c.moveTo(W * 0.35, H * 0.25); c.lineTo(W * 0.65, H * 0.25); c.moveTo(W / 2 - mw - 2, H * 0.66); c.quadraticCurveTo(W / 2 - mw - 6, H * 0.74, W / 2 - mw - 3, H * 0.8); c.moveTo(W / 2 + mw + 2, H * 0.66); c.quadraticCurveTo(W / 2 + mw + 6, H * 0.74, W / 2 + mw + 3, H * 0.8); c.stroke(); }
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
  handR: THREE.Group; coat: THREE.Object3D[]; shadow: THREE.Mesh; key: string; heading: number; phase: number; lie: number; big: boolean; ranged: boolean; mats: THREE.Material[]; ghostMats?: THREE.Material[];
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
  private sun = new THREE.DirectionalLight(0xfff4e8, 3.1);
  private hemi = new THREE.HemisphereLight(0xe4ecff, 0x6a5e70, 2.9);
  private rim = new THREE.DirectionalLight(0x9ab8ff, 1.6);
  ok = true;
  /** v0.14 · Edificios 3D (kit CC0 de Kenney). Se crea al entrar en la primera zona. */
  city: City3D | null = null;
  quality: 'low' | 'high' = 'high';
  /** Se llama cuando los edificios 3D terminan de cargar (la vista reconstruye la zona). */
  onCityReady: (() => void) | null = null;

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
    loadGuns(() => {}); // v0.14 · modelos de armas de fuego (los personajes se rehacen solos al cambiar la versión)
  }

  /** Sin tocar el tamaño del lienzo (lo gestiona Pixi): solo la zona de dibujo. */
  // Ojo: setPixelRatio/setSize de Three redimensionan el lienzo compartido con Pixi; aquí solo se guarda el viewport en píxeles reales.
  private vpW = 1; private vpH = 1;
  setSize(w: number, h: number, res: number) { this.vpW = Math.round(w * res); this.vpH = Math.round(h * res); }

  /** Volúmenes invisibles que tapan: edificios, muros y mobiliario grande. */
  setZone(z: ZoneDef): boolean {
    for (const r of this.rigs.values()) this.disposeRig(r);
    this.rigs.clear();
    this.occl.clear(); this.bOccl = [];
    if (!this.city) { this.city = new City3D(); this.city.onReady = () => this.onCityReady?.(); this.world.add(this.city.group); }
    const city = this.city.build(z, this.quality);
    const box = (x: number, y: number, w: number, d: number, h: number, y0 = 0) => { const m = new THREE.Mesh(G.box, this.occMat); m.scale.set(w, h, d); m.position.set(x + w / 2, y0 + h / 2, y + d / 2); m.renderOrder = -1; this.occl.add(m); return m; };
    // Con los edificios en 3D, ellos mismos tapan; si no, cajas invisibles con su volumen.
    for (const b of z.buildings) this.bOccl.push(city ? null : box(b.rect[0], b.rect[1], b.rect[2], b.rect[3], b.height * BUILDING_H));
    if (city) {
      // Lo que se dibuja en 2D delante de una fachada (farolas, marquesinas, cajeros, máquinas, pasarelas…) necesita su
      // volumen invisible para que el edificio 3D no se pinte por encima.
      const tall: Record<string, [number, number]> = { lamp: [0.18, 4.3], busstop: [0.9, 1.6], billboard: [0.9, 3.2], palm: [0.4, 3], plant: [0.5, 1], stall: [0.9, 1.6], tent: [0.9, 1.4], bench: [0.8, 0.6], hydrant: [0.3, 0.6], vending: [0.7, 1.6], antenna: [0.2, 3], crane: [0.6, 6], column: [0.5, 2.5], screen: [0.6, 2], planter: [0.8, 0.7], trash: [0.5, 0.7] };
      for (const p of z.props) { const t = tall[p.type]; if (t) box(p.at[0] + 0.5 - t[0] / 2 + (p.type === 'lamp' ? 0.0 : 0), p.at[1] + 0.5 - t[0] / 2, t[0], t[0], t[1]); }
      for (const o of z.objects) box(o.at[0] + 0.2, o.at[1] + 0.2, 0.6, 0.6, o.kind === 'camera' ? 3 : 1.6);
      for (const d of z.doors) box(d.at[0] + 0.1, d.at[1] + 0.1, 0.8, 0.8, 1.4);
      for (const sb of z.skybridges ?? []) { const [ax, ay] = sb.from, [bx, by] = sb.to; const hz = ay === by; box(Math.min(ax, bx), Math.min(ay, by), hz ? Math.abs(bx - ax) : 1, hz ? 1 : Math.abs(by - ay), 0.8, sb.z * BUILDING_H); }
    }
    for (const bl of z.blocks) box(bl.rect[0], bl.rect[1], bl.rect[2], bl.rect[3], bl.type === 'fence' ? 1.1 : bl.height);
    // Solo lo macizo tapa (una marquesina de cristal o un puesto abierto no).
    const H: Record<string, number> = { car: 0.75, wreck: 0.65, dumpster: 0.8, kiosk: 1.4, crate: 0.5, barrel: 0.7, jersey: 0.65, shelf: 1.5, locker: 1.6, fridge: 1.5, arcade: 1.4, smokestack: 3, monolith: 4.5, codewall: 2.4 };
    for (const p of z.props) if (H[p.type] && p.blocking !== false) box(p.at[0] + 0.15, p.at[1] + 0.15, 0.7, 0.7, H[p.type]);
    return city;
  }
  /** Los edificios atenuados (los que tapan al jugador) dejan de tapar a los personajes. */
  setBuildingFaded(i: number, faded: boolean, alpha = 1) {
    if (this.city?.active) { this.city.setFaded(i, !faded ? 0 : alpha < 0.12 ? 2 : 1); return; }
    const m = this.bOccl[i]; if (m) m.visible = !faded;
  }

  private disposeRig(r: Rig) { this.world.remove(r.root); for (const m of r.mats) m.dispose(); for (const m of r.ghostMats ?? []) m.dispose(); }
  /** Convierte un modelo en fantasma: cada material pasa a translúcido, sin escribir profundidad y con brillo propio. */
  private ghostify(r: Rig, color: number) {
    const tint = new THREE.Color(color);
    const out: THREE.Material[] = [];
    const conv = (m: THREE.Material) => {
      const c = (m as any).clone() as THREE.Material & { color?: THREE.Color; emissive?: THREE.Color };
      c.transparent = true; c.depthWrite = false; (c as any).opacity = 0.6;
      if (c.color) c.color.lerp(tint, 0.35);
      if (c.emissive) c.emissive = tint.clone().multiplyScalar(0.55);
      out.push(c); return c;
    };
    r.root.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; m.material = Array.isArray(m.material) ? m.material.map(conv) : conv(m.material); });
    r.shadow.visible = false;
    r.ghostMats = out;
  }
  private after: { g: THREE.Object3D; t0: number; life: number; mat: THREE.MeshBasicMaterial }[] = [];
  /** v0.12 · Imagen residual de Kairós: copia la pose actual del modelo, teñida del color del cromo, y se desvanece. */
  afterimage(id: number, color: number, life: number) {
    const r = this.rigs.get(id);
    if (!r || this.after.length > 40) return;
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
    const g = r.root.clone(true);
    g.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; if (m.geometry === G.disc || m.geometry.type === 'RingGeometry') m.visible = false; else m.material = mat; });
    this.world.add(g);
    this.after.push({ g, t0: performance.now(), life, mat });
  }

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
    const wf = B === 'delgado' ? 0.86 : B === 'robusto' ? 1.18 : B === 'corpulento' ? 1.32 : B === 'atletico' ? 1.06 : B === 'musculoso' ? 1.14 : B === 'esbelto' ? 0.9 : B === 'fornido' ? 1.2 : B === 'curvilineo' ? 1.02 : 1;
    const hf = B === 'bajo' ? 0.9 : B === 'alto' ? 1.08 : B === 'esbelto' ? 1.06 : B === 'fornido' ? 0.93 : 1;
    const shoulders = B === 'atletico' ? 1.14 : B === 'musculoso' ? 1.3 : B === 'curvilineo' ? 0.92 : wf;
    // v0.13 · Grosor de brazos y piernas y anchura de cadera según el cuerpo.
    const limb = B === 'musculoso' ? 1.2 : B === 'fornido' ? 1.12 : B === 'esbelto' ? 0.9 : 1;
    const hipW = B === 'curvilineo' ? 1.2 : B === 'musculoso' ? 0.95 : 1;
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
      // Las cajas con volumen se redondean (las tiras finas de luz, cremalleras y similares se quedan como cajas).
      const g2 = geo === G.box && Math.min(sx, sy, sz) >= 0.035 ? G.rbox : geo;
      const m = new THREE.Mesh(g2, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); parent.add(m); return m;
    };
    const group = (parent: THREE.Object3D, x: number, y: number, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

    const root = new THREE.Group();
    const body = group(root, 0, 0, 0);
    body.scale.set(M * wf, M * hf / Y_SQUASH, M * wf);
    // ---- piernas
    const hipY = 0.92;
    const hips = group(body, 0, hipY);
    const pelvis = part(hips, G.box, pantsM, 0.38 * hipW, 0.2, 0.24 * (hipW > 1 ? 1.08 : 1), 0, 0.04);
    void pelvis;
    const lw = a.legwear || 'pantalon';
    const bare = lw === 'shorts' || lw === 'falda' || lw === 'bermudas' || lw === 'falda-larga';
    const legFor = (side: -1 | 1) => {
      const key = side < 0 ? 'pierna_izq' : 'pierna_der';
      const thigh = group(hips, side * 0.1 * hipW, 0);
      if (lost.has(key)) { part(thigh, G.cyl, mk(lam({ color: 0x8a0a12 })), 0.12, 0.04, 0.12, 0, -0.02); return { thigh, knee: group(thigh, 0, -0.42) }; }
      const isChrome = chrome.has(key);
      const thighMat = isChrome ? metalM : lw === 'shorts' || lw === 'bermudas' ? pantsM : bare ? skinM('leg', 3, 6) : pantsM;
      part(thigh, G.thigh, thighMat, 0.21 * limb * (hipW > 1 ? 1.1 : 1), 0.46, 0.22 * limb, 0, -0.21);
      const knee = group(thigh, 0, -0.42);
      const shinMat = isChrome ? metalM : bare || lw === 'bermudas' ? skinM('leg', 3, 6) : pantsM;
      part(knee, G.sphere, shinMat, 0.15, 0.13, 0.15, 0, -0.01); part(knee, G.calf, shinMat, 0.16 * limb, 0.44, 0.17 * limb, 0, -0.22);
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
      part(sh, G.thigh, upper, 0.13 * limb, 0.31, 0.135 * limb, 0, -0.15);
      if (a.top === 'armadura') part(sh, G.box, metalDarkM, 0.13, 0.08, 0.13, 0, 0.0);
      const el = group(sh, 0, -0.3);
      const fore = isChrome ? metalM : sleeveless || short ? skinM(side > 0 ? 'armR' : 'armL', 2.5, 6) : sleeveM;
      part(el, G.sphere, fore, 0.1, 0.09, 0.1, 0, -0.005); part(el, G.calf, fore, 0.11 * limb, 0.28, 0.115 * limb, 0, -0.135);
      if (isChrome) { part(el, G.sphere, metalDarkM, 0.09, 0.09, 0.09); part(el, G.box, glowM, 0.015, 0.22, 0.015, 0.035, -0.13, 0.03); }
      if (!sleeveless && !short && !isChrome) part(el, G.cyl, mk(lam({ color: hex(a.jacket).multiplyScalar(0.6) })), 0.085, 0.03, 0.085, 0, -0.25);
      const hand = group(el, 0, -0.29);
      if (!lost.has(side < 0 ? 'mano_izq' : 'mano_der')) {
        const hm = isChrome ? metalM : plainSkin;
        part(hand, G.box, hm, 0.08, 0.075, 0.045, 0, -0.03); // palma
        // Cuatro dedos algo flexionados y el pulgar (el cromo lleva articulaciones oscuras).
        for (let f = 0; f < 4; f++) { const fg = part(hand, G.finger, hm, 0.017, 0.028, 0.017, -0.027 + f * 0.018, -0.085 + Math.abs(f - 1.5) * 0.004, 0.006); fg.rotation.x = 0.35; }
        part(hand, G.finger, hm, 0.019, 0.026, 0.019, side * -0.045, -0.04, 0.02).rotation.z = side * -0.6;
        if (isChrome) part(hand, G.box, metalDarkM, 0.082, 0.012, 0.047, 0, -0.065);
      }
      return { sh, el, hand };
    };
    const AL = armFor(-1), AR = armFor(1);
    // ---- cabeza
    const neck = group(chest, 0, 0.32);
    part(neck, G.cyl, tatOn('neck') ? skinM('neck', 2, 2) : plainSkin, 0.12, 0.1, 0.12, 0, 0.04);
    const head = group(neck, 0, 0.21);
    const [fw0, fh0] = a.faceShape === 'ancha' || a.faceShape === 'redonda' ? [0.24, 0.26] : a.faceShape === 'alargada' || a.faceShape === 'afilada' || a.faceShape === 'diamante' ? [0.205, 0.29] : a.faceShape === 'cuadrada' ? [0.235, 0.265] : a.faceShape === 'triangular' || a.faceShape === 'corazon' ? [0.225, 0.275] : [0.22, 0.27];
    const faceSeed = hashString(`${s.name ?? ''}#${s.kind === 'player' ? '' : s.id}`) || 1;
    // v0.14 · Misma base para todos; la cabeza varía un poco con cada persona.
    const hv = seededRng(faceSeed * 7 + 3); const fw = fw0 * (0.95 + hv() * 0.1), fh = fh0 * (0.96 + hv() * 0.08); const chromeStyle = Math.floor(hv() * 3);
    const face = mk(lam({ map: tex(faceCanvas(a, chrome.has('ojos'), faceSeed)) }));
    const skinHead = plainSkin;
    const hairCover = !['calvo', 'rapado'].includes(a.hairStyle);
    const headMats = [skinHead, skinHead, hairCover ? hairM : skinHead, skinHead, face, hairCover ? hairM : skinHead];
    part(head, G.box, headMats, fw, fh, 0.24, 0, 0);
    part(head, G.box, plainSkin, fw * (a.faceShape === 'cuadrada' || a.faceShape === 'triangular' ? 0.95 : a.faceShape === 'corazon' || a.faceShape === 'diamante' || a.faceShape === 'afilada' ? 0.6 : 0.8), 0.05, 0.16, 0, -fh / 2 - 0.01, 0.01); // mandíbula
    if (a.faceShape === 'diamante' || a.faceShape === 'angulosa') for (const sx of [-1, 1]) part(head, G.sphere, plainSkin, 0.05, 0.05, 0.08, sx * (fw / 2 - 0.01), -0.01, 0.07); // pómulos
    for (const sx of [-1, 1]) part(head, G.sphere, plainSkin, 0.025, 0.065, 0.045, sx * (fw / 2 + 0.005), 0, -0.01); // orejas
    part(head, G.sphere, plainSkin, a.nose === 'ancha' || a.nose === 'chata' ? 0.05 : a.nose === 'pequena' || a.nose === 'respingona' ? 0.03 : 0.036, a.nose === 'aguilena' ? 0.065 : 0.055, a.nose === 'chata' ? 0.03 : a.nose === 'aguilena' ? 0.055 : 0.045, a.nose === 'rota' ? 0.008 : 0, a.nose === 'respingona' ? -0.012 : -0.02, 0.122).rotation.z = a.nose === 'rota' ? 0.25 : 0; // nariz
    // Cromo en la cabeza: tres estilos según la persona (placa lateral, placa de mandíbula o conectores en la sien y la frente).
    if (chrome.has('cabeza')) {
      if (chromeStyle === 0) { part(head, G.box, metalM, 0.02, 0.1, 0.1, -fw / 2 - 0.012, 0.02, -0.02); part(head, G.sphere, glowM, 0.025, 0.025, 0.025, -fw / 2 - 0.02, 0.02, 0.02); }
      else if (chromeStyle === 1) { part(head, G.box, metalM, fw * 0.55, 0.05, 0.05, fw * 0.15, -fh / 2 + 0.02, 0.1).rotation.z = -0.15; part(head, G.box, glowM, fw * 0.4, 0.008, 0.008, fw * 0.15, -fh / 2 + 0.03, 0.127); }
      else { for (const sx of [-1, 1]) { part(head, G.cyl, metalDarkM, 0.03, 0.02, 0.03, sx * (fw / 2 + 0.005), 0.05, 0.03).rotation.z = Math.PI / 2; part(head, G.sphere, glowM, 0.012, 0.012, 0.012, sx * (fw / 2 + 0.016), 0.05, 0.03); } for (let k = -1; k <= 1; k++) part(head, G.sphere, glowM, 0.01, 0.01, 0.01, k * 0.03, fh / 2 - 0.04, 0.122); }
    }
    if (chrome.has('ojos')) part(head, G.box, mk(new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.6 })), fw * 0.9, 0.03, 0.01, 0, 0.0, 0.123);
    // Pelo.
    const hs = a.hairStyle, covered = a.headwear === 'casco' || a.headwear === 'casco-moto';
    if (!covered) {
      const cap = () => part(head, G.box, hairM, fw + 0.02, 0.06, 0.26, 0, fh / 2, -0.005);
      if (!['calvo', 'rapado', 'mohicano', 'samurai', 'trenzas-pegadas'].includes(hs)) cap();
      if (hs === 'samurai' || hs === 'trenzas-pegadas') part(head, G.box, mk(lam({ color: hex(a.hair), transparent: true, opacity: 0.5 })), fw + 0.004, 0.02, 0.215, 0, fh / 2);
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
      // v0.13 · Peinados nuevos.
      if (hs === 'mullet') { part(head, G.box, hairM, fw + 0.02, 0.07, 0.26, 0, fh / 2 - 0.005, -0.005); part(head, G.box, hairM, fw * 0.9, 0.3, 0.06, 0, -0.12, -0.13); }
      if (hs === 'trenzas-pegadas') for (let i = 0; i < 5; i++) part(head, G.cyl, hairM, 0.03, 0.27, 0.03, -0.08 + i * 0.04, fh / 2 + 0.012, -0.01).rotation.x = Math.PI / 2;
      if (hs === 'coleta-baja') part(head, G.cyl, hairM, 0.055, 0.3, 0.055, 0, -0.17, -0.15).rotation.x = 0.15;
      if (hs === 'ondas') { part(head, G.box, hairM, fw + 0.05, 0.36, 0.06, 0, -0.07, -0.11); for (let i = 0; i < 6; i++) part(head, G.sphere, hairM, 0.06, 0.1, 0.12, (i % 2 ? 1 : -1) * (fw / 2 - 0.005), -0.03 - Math.floor(i / 2) * 0.09, -0.06); }
      if (hs === 'samurai') { part(head, G.sphere, hairM, 0.09, 0.08, 0.09, 0, fh / 2 + 0.05, -0.04); part(head, G.cyl, hairM, 0.03, 0.1, 0.03, 0, fh / 2 + 0.03, -0.11).rotation.x = 1.1; }
      if (hs === 'pixie') { part(head, G.box, hairM, fw * 0.8, 0.05, 0.05, 0.03, fh / 2 - 0.02, 0.1).rotation.z = -0.25; }
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
    const bigFam = (f: string, id: string) => ['Rifle', 'Escopeta', 'Ametralladora', 'Especial', 'Arco', 'Subfusil'].includes(f) || ['bate', 'katana-termica', 'katana', 'lanza-electrica', 'hacha-plasma', 'hacha-bomberos', 'espada-monofilamento', 'martillo-neumatico', 'mazo', 'machete', 'tuberia'].includes(id);
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

  /**
   * v0.12 · Modelos de armas a escala real (en metros × 0,75), uno por arma. Se modelan con el cañón/hoja hacia +Y,
   * la parte de arriba (miras) hacia +Z y la empuñadura en el origen; el envoltorio las orienta para la mano.
   */
  private weaponMesh(id: string, fam: string, kind: string, mk: <T extends THREE.Material>(m: T) => T, glow: THREE.Material) {
    const outer = new THREE.Group();
    const g = new THREE.Group(); g.scale.setScalar(0.75);
    // Las de fuego se giran media vuelta en Y: así, tras el giro de la mano, las miras quedan arriba.
    if (kind === 'ranged') g.rotation.y = Math.PI;
    outer.add(g);
    const std = (color: number, metal: number, rough: number, emissive = 0) => mk(new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, emissive }));
    const gm = std(0x1a1c22, 0.7, 0.38), poly = std(0x2a2c32, 0.1, 0.8), steel = std(0xd0d6e2, 0.95, 0.18), dark = std(0x0e0f12, 0.6, 0.5);
    const wood = std(0x6a4428, 0, 0.7), wood2 = std(0x4a2e1a, 0, 0.75), red = std(0xb01818, 0.2, 0.5), yellow = std(0xd8b020, 0.1, 0.6), wrap = std(0x1a1420, 0, 0.9);
    const techCol = /plasma|termica/.test(id) ? 0xff6a20 : /riel/.test(id) ? 0x43a8ff : /inteligente|smg-int/.test(id) ? 0x5aff8a : /pulsos|electrica|aturdidora|taser|monofil|agujas|sonico|emp/.test(id) ? 0x43f3ff : -1;
    const tglow = techCol >= 0 ? mk(new THREE.MeshBasicMaterial({ color: techCol })) : glow;
    const lens = mk(new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.85 }));
    const B = (m: THREE.Material, w: number, l: number, h: number, x: number, y: number, z: number, rx = 0) => { const o = new THREE.Mesh(Math.min(w, l, h) > 0.02 ? G.rbox : G.box, m); o.scale.set(w, l, h); o.position.set(x, y, z); o.rotation.x = rx; g.add(o); return o; };
    const C = (m: THREE.Material, r: number, l: number, x: number, y: number, z: number, r2 = r) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, l, 14), m); o.position.set(x, y, z); g.add(o); return o; }; // a lo largo de Y
    const CZ = (m: THREE.Material, r: number, l: number, x: number, y: number, z: number) => { const o = C(m, r, l, x, y, z); o.rotation.x = Math.PI / 2; return o; }; // vertical (Z)
    const CX = (m: THREE.Material, r: number, l: number, x: number, y: number, z: number) => { const o = C(m, r, l, x, y, z); o.rotation.z = Math.PI / 2; return o; }; // transversal (X)
    // Piezas comunes de las armas de fuego.
    const grip = (m: THREE.Material, len = 0.11, ang = 0.32) => B(m, 0.03, 0.045, len, 0, -0.012, -len / 2 + 0.01, -ang);
    const trigger = () => { B(dark, 0.006, 0.05, 0.004, 0, 0.03, -0.028); B(dark, 0.004, 0.006, 0.02, 0, 0.03, -0.02); };
    const redDot = (y: number, z: number) => { B(dark, 0.024, 0.05, 0.03, 0, y, z); B(lens, 0.016, 0.004, 0.018, 0, y + 0.026, z + 0.002); };
    const scope = (y: number, z: number, len: number, r: number) => { C(dark, r, len, 0, y, z); C(dark, r * 1.25, 0.04, 0, y + len / 2, z); C(dark, r * 1.15, 0.035, 0, y - len / 2, z); B(lens, r * 1.6, 0.003, r * 1.6, 0, y + len / 2 + 0.021, z); B(dark, 0.02, 0.02, 0.03, 0, y - len * 0.25, z - r - 0.01); B(dark, 0.02, 0.02, 0.03, 0, y + len * 0.25, z - r - 0.01); };
    const mag = (m: THREE.Material, y: number, len: number, curve = 0) => { const o = B(m, 0.026, 0.045, len, 0, y, -len / 2 - 0.02); o.rotation.x = curve; return o; };
    const stock = (m: THREE.Material, len: number, drop = 0.02) => { B(m, 0.035, len, 0.06, 0, -len / 2 - 0.05, -drop); B(m, 0.03, 0.02, 0.1, 0, -len - 0.05, -drop - 0.015); };
    // v0.14 · Si hay modelo del pack de armas, ese (con el brillo de su tecnología encima); si no, el procedural.
    const fb = kind === 'ranged' ? gunModel(id) : null;
    if (fb) {
      const bb = new THREE.Box3().setFromObject(fb), L = bb.max.y - bb.min.y; // (antes de colgarlo: medidas en su propio sistema)
      g.add(fb);
      if (techCol >= 0) {
        B(tglow, 0.006, L * 0.55, 0.005, 0, bb.min.y + L * 0.55, bb.max.z + 0.003);
        if (/plasma|pulsos|riel/.test(id)) for (let i = 0; i < 3; i++) B(tglow, (bb.max.x - bb.min.x) + 0.004, 0.006, 0.006, 0, bb.min.y + L * (0.45 + i * 0.12), (bb.max.z + bb.min.z) / 2);
      }
      void fam;
      return outer;
    }
    if (kind === 'ranged') switch (id) {
      case 'pistola-ligera': case 'pistola-compacta': case 'pistola-silenciada': case 'pistola-inteligente': case 'pistola-agujas': case 'pistola-plasma': {
        const L = id === 'pistola-compacta' ? 0.15 : 0.19;
        B(id === 'pistola-plasma' ? poly : gm, 0.028, L, 0.034, 0, L / 2 - 0.035, 0.022); // corredera
        B(poly, 0.026, L * 0.85, 0.022, 0, L * 0.42 - 0.035, -0.004); // armazón
        grip(poly); trigger(); B(dark, 0.006, 0.006, 0.008, 0, L - 0.04, 0.043); // mira
        for (let i = 0; i < 4; i++) B(dark, 0.029, 0.004, 0.02, 0, -0.02 + i * 0.008, 0.026); // estrías
        if (id === 'pistola-silenciada') C(dark, 0.017, 0.16, 0, L - 0.035 + 0.08, 0.02);
        if (id === 'pistola-inteligente') { B(tglow, 0.03, L * 0.7, 0.004, 0, L * 0.4 - 0.035, 0.04); redDot(0.04, 0.055); }
        if (id === 'pistola-agujas') { C(steel, 0.006, 0.12, 0, L + 0.02, 0.02); C(tglow, 0.012, 0.06, 0, 0.03, 0.05); }
        if (id === 'pistola-plasma') { for (let i = 0; i < 3; i++) C(tglow, 0.022, 0.008, 0, 0.03 + i * 0.04, 0.022); C(gm, 0.02, 0.06, 0, L - 0.01, 0.022); }
        break;
      }
      case 'revolver-pesado': case 'revolver-riel': {
        C(gm, 0.012, 0.17, 0, 0.13, 0.025); B(gm, 0.02, 0.17, 0.012, 0, 0.13, 0.04); // cañón y costilla
        C(steel, 0.024, 0.05, 0, 0.025, 0.018); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; C(dark, 0.005, 0.052, Math.cos(a) * 0.014, 0.025, 0.018 + Math.sin(a) * 0.014); }
        B(gm, 0.024, 0.06, 0.04, 0, -0.01, 0.01); grip(wood, 0.1, 0.45); trigger(); B(gm, 0.008, 0.014, 0.012, 0, -0.035, 0.035); // martillo
        if (id === 'revolver-riel') { B(tglow, 0.004, 0.16, 0.006, 0.014, 0.13, 0.03); B(tglow, 0.004, 0.16, 0.006, -0.014, 0.13, 0.03); }
        break;
      }
      case 'taser': { B(yellow, 0.03, 0.13, 0.04, 0, 0.04, 0.018); B(dark, 0.03, 0.03, 0.035, 0, 0.11, 0.02); B(tglow, 0.006, 0.006, 0.006, 0.008, 0.127, 0.03); B(tglow, 0.006, 0.006, 0.006, -0.008, 0.127, 0.03); grip(poly, 0.09); trigger(); break; }
      case 'subfusil': case 'smg-inteligente': case 'subfusil-compacto': {
        const L = id === 'subfusil-compacto' ? 0.24 : 0.3;
        B(gm, 0.036, L, 0.05, 0, L / 2 - 0.05, 0.02); C(dark, 0.009, 0.08, 0, L - 0.01, 0.025); grip(poly, 0.1); trigger();
        mag(gm, 0.07, 0.15); B(poly, 0.03, 0.05, 0.04, 0, L - 0.09, -0.012); // empuñadura delantera
        if (id === 'subfusil-compacto') { B(steel, 0.008, 0.16, 0.008, 0.014, -0.12, 0.02); B(steel, 0.008, 0.16, 0.008, -0.014, -0.12, 0.02); B(gm, 0.034, 0.012, 0.06, 0, -0.2, 0.0); }
        else stock(poly, 0.16);
        if (id === 'smg-inteligente') { B(tglow, 0.038, L * 0.6, 0.005, 0, L * 0.35, 0.047); redDot(0.06, 0.07); } else redDot(0.04, 0.065);
        break;
      }
      case 'rifle-asalto': case 'carabina': case 'rifle-pulsos': {
        const woodish = id === 'carabina';
        B(woodish ? wood : gm, 0.04, 0.3, 0.06, 0, 0.1, 0.02); // cajón
        C(dark, 0.011, 0.36, 0, 0.42, 0.03); B(woodish ? wood : poly, 0.042, 0.22, 0.05, 0, 0.33, 0.022); // cañón y guardamanos
        B(dark, 0.006, 0.01, 0.03, 0, 0.58, 0.05); // punto de mira
        grip(woodish ? wood2 : poly); trigger();
        if (!woodish) { mag(gm, 0.16, 0.17, 0.25); B(dark, 0.02, 0.26, 0.012, 0, 0.12, 0.056); redDot(0.1, 0.075); }
        else { mag(gm, 0.14, 0.09); B(steel, 0.008, 0.03, 0.03, 0.022, 0.07, 0.035); }
        stock(woodish ? wood : poly, 0.24, woodish ? 0.03 : 0.01);
        if (id === 'rifle-pulsos') { for (let i = 0; i < 4; i++) C(tglow, 0.03, 0.01, 0, 0.27 + i * 0.05, 0.022); B(tglow, 0.008, 0.06, 0.06, 0.024, 0.06, 0.02); }
        break;
      }
      case 'rifle-precision': case 'francotirador-inteligente': case 'rifle-dardos': {
        B(id === 'rifle-precision' ? wood : poly, 0.042, 0.42, 0.06, 0, 0.1, 0.012); // culata y caja de una pieza
        C(dark, 0.012, 0.52, 0, 0.56, 0.03); C(dark, 0.016, 0.06, 0, 0.84, 0.03); // cañón largo y freno
        grip(id === 'rifle-precision' ? wood2 : poly, 0.1); trigger(); stock(id === 'rifle-precision' ? wood : poly, 0.26, 0.02);
        B(steel, 0.008, 0.012, 0.012, 0.03, -0.0, 0.04); C(steel, 0.008, 0.02, 0.04, 0.0, 0.04); // cerrojo
        scope(0.12, 0.085, 0.3, 0.02);
        if (id !== 'rifle-dardos') { const l1 = B(dark, 0.006, 0.006, 0.16, 0.02, 0.45, -0.07); l1.rotation.y = 0.3; const l2 = B(dark, 0.006, 0.006, 0.16, -0.02, 0.45, -0.07); l2.rotation.y = -0.3; } // bípode
        if (id === 'rifle-dardos') C(steel, 0.016, 0.12, 0, 0.3, -0.01);
        if (id === 'francotirador-inteligente') B(tglow, 0.044, 0.3, 0.005, 0, 0.1, 0.044);
        break;
      }
      case 'rifle-riel': {
        B(gm, 0.05, 0.36, 0.07, 0, 0.12, 0.02); B(tglow, 0.008, 0.6, 0.012, 0.018, 0.5, 0.035); B(tglow, 0.008, 0.6, 0.012, -0.018, 0.5, 0.035);
        B(gm, 0.012, 0.6, 0.012, 0.018, 0.5, 0.05); B(gm, 0.012, 0.6, 0.012, -0.018, 0.5, 0.05); B(dark, 0.06, 0.08, 0.05, 0, 0.0, 0.04);
        grip(poly); trigger(); stock(gm, 0.22); scope(0.14, 0.09, 0.22, 0.018);
        break;
      }
      case 'escopeta-corta': {
        C(gm, 0.014, 0.32, 0.013, 0.2, 0.03); C(gm, 0.014, 0.32, -0.013, 0.2, 0.03); B(wood, 0.04, 0.14, 0.03, 0, 0.14, 0.012);
        B(steel, 0.036, 0.07, 0.05, 0, 0.0, 0.025); grip(wood2, 0.11, 0.6); trigger(); break;
      }
      case 'escopeta-bombeo': case 'escopeta-tecnologica': {
        C(gm, 0.014, 0.5, 0, 0.36, 0.035); C(dark, 0.012, 0.42, 0, 0.32, 0.008); // cañón y depósito tubular
        B(id === 'escopeta-bombeo' ? wood : poly, 0.04, 0.12, 0.04, 0, 0.3, 0.008); // corredera
        B(gm, 0.04, 0.2, 0.06, 0, 0.04, 0.025); grip(id === 'escopeta-bombeo' ? wood2 : poly); trigger(); stock(id === 'escopeta-bombeo' ? wood : poly, 0.26, 0.03);
        if (id === 'escopeta-tecnologica') { CX(gm, 0.05, 0.05, 0, 0.1, -0.04); B(tglow, 0.044, 0.18, 0.005, 0, 0.06, 0.057); }
        break;
      }
      case 'ballesta-carbono': {
        B(dark, 0.035, 0.5, 0.05, 0, 0.1, 0.01); stock(dark, 0.18); grip(poly); trigger(); scope(0.06, 0.06, 0.16, 0.014);
        const limb = (sx: number) => { const o = B(gm, 0.26, 0.016, 0.02, sx * 0.13, 0.33, 0.02); o.rotation.z = sx * 0.2; };
        limb(1); limb(-1); B(steel, 0.5, 0.003, 0.003, 0, 0.27, 0.025); B(steel, 0.006, 0.34, 0.006, 0, 0.2, 0.04); // cuerda y virote
        break;
      }
      case 'ametralladora-rotativa': {
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; C(dark, 0.009, 0.45, Math.cos(a) * 0.028, 0.42, 0.03 + Math.sin(a) * 0.028); }
        C(gm, 0.045, 0.06, 0, 0.22, 0.03); C(gm, 0.04, 0.03, 0, 0.6, 0.03); B(gm, 0.08, 0.24, 0.1, 0, 0.06, 0.02);
        B(std(0x3a4a2a, 0.2, 0.7), 0.1, 0.12, 0.1, 0.07, 0.04, -0.06); B(gm, 0.02, 0.1, 0.02, 0, 0.12, 0.09); grip(poly); trigger();
        break;
      }
      case 'ametralladora-ligera': {
        B(gm, 0.05, 0.36, 0.07, 0, 0.1, 0.02); C(dark, 0.013, 0.42, 0, 0.48, 0.03); B(poly, 0.05, 0.16, 0.05, 0, 0.36, 0.02);
        B(std(0x3a4a2a, 0.2, 0.7), 0.08, 0.1, 0.09, 0.0, 0.06, -0.06); B(gm, 0.012, 0.12, 0.05, 0, 0.12, 0.08); // caja y asa
        grip(poly); trigger(); stock(poly, 0.22);
        const l1 = B(dark, 0.008, 0.008, 0.2, 0.03, 0.56, -0.08); l1.rotation.y = 0.35; const l2 = B(dark, 0.008, 0.008, 0.2, -0.03, 0.56, -0.08); l2.rotation.y = -0.35;
        break;
      }
      case 'canon-sonico': { B(gm, 0.07, 0.24, 0.08, 0, 0.06, 0.02); const bell = C(poly, 0.03, 0.16, 0, 0.27, 0.03, 0.08); void bell; C(tglow, 0.07, 0.01, 0, 0.35, 0.03); for (let i = 0; i < 3; i++) C(tglow, 0.042, 0.008, 0, 0.0 + i * 0.05, 0.03); grip(poly); trigger(); break; }
      case 'lanzagranadas-emp': { C(gm, 0.045, 0.5, 0, 0.25, 0.04); CX(poly, 0.06, 0.07, 0, 0.06, -0.01); C(tglow, 0.05, 0.01, 0, 0.48, 0.04); B(dark, 0.03, 0.06, 0.05, 0, 0.3, -0.03); grip(poly); trigger(); stock(poly, 0.18); break; }
      default: { B(gm, 0.04, 0.4, 0.06, 0, 0.15, 0.02); C(dark, 0.011, 0.25, 0, 0.45, 0.03); grip(poly); trigger(); }
    } else switch (id) {
      case 'navaja': case 'cuchillo-combate': {
        const L = id === 'navaja' ? 0.09 : 0.17;
        C(id === 'navaja' ? steel : wrap, 0.012, 0.11, 0, 0, 0); if (id !== 'navaja') B(steel, 0.05, 0.008, 0.016, 0, 0.06, 0);
        B(steel, 0.004, L, 0.026, 0, 0.065 + L / 2, 0.002); B(steel, 0.003, 0.03, 0.012, 0, 0.065 + L, 0.006).rotation.x = 0.5;
        if (id !== 'navaja') for (let i = 0; i < 5; i++) B(steel, 0.005, 0.008, 0.006, 0, 0.08 + i * 0.016, 0.016);
        break;
      }
      case 'machete': { C(wrap, 0.014, 0.14, 0, 0, 0); B(steel, 0.004, 0.45, 0.05, 0, 0.3, 0.006); B(steel, 0.004, 0.06, 0.06, 0, 0.5, 0.012); break; }
      case 'katana': case 'katana-termica': {
        C(wrap, 0.014, 0.26, 0, 0, 0); for (let i = 0; i < 6; i++) B(std(0xd8d0c0, 0, 0.8), 0.03, 0.006, 0.03, 0, -0.1 + i * 0.04, 0); // tsuka
        CZ(gm, 0.04, 0.008, 0, 0.135, 0); // tsuba
        // Hoja ligeramente curva en tres tramos con filo (térmica: filo incandescente).
        const edge = id === 'katana-termica' ? tglow : steel;
        for (let i = 0; i < 3; i++) { const seg = B(steel, 0.004, 0.24, 0.03, 0, 0.26 + i * 0.235, 0.004 + i * i * 0.006); seg.rotation.x = -0.035 * i; B(edge, 0.002, 0.24, 0.006, 0, 0.26 + i * 0.235, -0.012 + i * i * 0.006).rotation.x = -0.035 * i; }
        break;
      }
      case 'espada-monofilamento': { C(gm, 0.016, 0.22, 0, 0, 0); CZ(dark, 0.03, 0.01, 0, 0.12, 0); B(tglow, 0.003, 0.75, 0.004, 0, 0.5, 0); break; }
      case 'lanza-electrica': { C(gm, 0.014, 1.5, 0, 0.45, 0); C(steel, 0.0, 0.16, 0, 1.28, 0, 0.022); C(tglow, 0.02, 0.03, 0, 1.18, 0); C(wrap, 0.017, 0.2, 0, 0, 0); break; }
      case 'hacha-plasma': case 'hacha-bomberos': {
        C(id === 'hacha-bomberos' ? wood : gm, 0.016, 0.75, 0, 0.3, 0);
        const head = id === 'hacha-bomberos' ? red : gm; B(head, 0.03, 0.06, 0.14, 0, 0.63, 0.05); B(steel, 0.02, 0.07, 0.04, 0, 0.63, 0.13);
        if (id === 'hacha-bomberos') { const pk = C(head, 0.012, 0.12, 0, 0.63, -0.06, 0.002); pk.rotation.x = Math.PI / 2; } else B(tglow, 0.022, 0.07, 0.008, 0, 0.63, 0.15);
        break;
      }
      case 'bate': { C(steel, 0.016, 0.8, 0, 0.3, 0, 0.034); CZ(steel, 0.022, 0.012, 0, -0.1, 0).rotation.x = 0; C(wrap, 0.018, 0.16, 0, -0.02, 0); break; }
      case 'tuberia': { C(std(0x6a6a72, 0.6, 0.6), 0.02, 0.62, 0, 0.24, 0); C(std(0x5a5a62, 0.6, 0.6), 0.026, 0.06, 0, 0.55, 0); const el = C(std(0x5a5a62, 0.6, 0.6), 0.02, 0.1, 0, 0.6, 0.04); el.rotation.x = Math.PI / 2; break; }
      case 'porra-electrica': { C(dark, 0.016, 0.5, 0, 0.2, 0); C(tglow, 0.018, 0.04, 0, 0.45, 0); C(wrap, 0.018, 0.14, 0, 0, 0); break; }
      case 'tonfa-aturdidora': { C(dark, 0.017, 0.55, 0, 0.22, 0); const hd = C(wrap, 0.016, 0.12, 0, 0.0, 0.06); hd.rotation.x = Math.PI / 2; C(tglow, 0.019, 0.03, 0, 0.47, 0); break; }
      case 'nunchakus': { C(wood, 0.016, 0.3, 0, 0.12, 0); const o = C(wood, 0.016, 0.3, 0, 0.42, 0.08); o.rotation.x = -0.6; for (let i = 0; i < 4; i++) B(steel, 0.01, 0.014, 0.01, 0, 0.29 + i * 0.012, 0.02 + i * 0.014); break; }
      case 'martillo-neumatico': case 'mazo': {
        C(id === 'mazo' ? wood : gm, 0.02, 0.85, 0, 0.32, 0); B(gm, 0.1, 0.12, 0.2, 0, 0.75, 0.0);
        if (id === 'martillo-neumatico') { CZ(steel, 0.02, 0.06, 0.06, 0.75, 0.04); CZ(steel, 0.02, 0.06, -0.06, 0.75, 0.04); B(tglow, 0.102, 0.02, 0.02, 0, 0.75, 0.1); }
        break;
      }
      case 'punos-choque': { B(steel, 0.09, 0.025, 0.03, 0, -0.06, 0.03); for (let i = 0; i < 4; i++) B(tglow, 0.008, 0.008, 0.008, -0.03 + i * 0.02, -0.06, 0.05); break; }
      default: { C(wrap, 0.015, 0.14, 0, 0, 0); B(steel, 0.006, 0.4, 0.035, 0, 0.27, 0); }
    }
    void fam;
    return outer;
  }

  // ================================================================ animación y dibujo
  /** Sincroniza los modelos con las entidades visibles y dibuja el fotograma. */
  render(ents: Iterable<Ent3D>, opts: { W: number; H: number; zoom: number; worldX: number; worldY: number; meId: number; guarding: boolean; now: number; dt: number; serverNow: number; hidden: (e: Ent3D) => boolean }) {
    const seen = new Set<number>();
    for (const e of ents) {
      const s = e.s;
      if ((s.kind !== 'player' && s.kind !== 'npc') || opts.hidden(e)) continue;
      seen.add(s.id);
      const key = JSON.stringify([s.appearance, s.chrome, s.lost, s.weapon, s.carry, s.kind, e.ghost?.color, (s.weapon || s.carry?.length) ? gunsVersion() : 0]);
      let r = this.rigs.get(s.id);
      if (!r || r.key !== key) { if (r) this.disposeRig(r); r = this.build(e); r.key = key; this.rigs.set(s.id, r); if (e.ghost) this.ghostify(r, e.ghost.color); }
      this.animate(r, e, opts);
      if (e.ghost && r.ghostMats) {
        // Flota a un palmo del suelo, se mece y parpadea un poco (más cuanto menos visible está).
        r.root.position.y = e.ghost.float;
        const flick = e.ghost.alpha < 1 ? (Math.random() < 0.25 ? 0.4 : 1) : 1;
        for (const m of r.ghostMats) (m as any).opacity = 0.62 * e.ghost.alpha * flick;
        r.root.visible = e.ghost.alpha > 0.02;
      }
    }
    // Imágenes residuales de Kairós: se desvanecen y desaparecen.
    const tnow = performance.now();
    for (let i = this.after.length - 1; i >= 0; i--) {
      const a = this.after[i], k = (tnow - a.t0) / a.life;
      if (k >= 1) { this.world.remove(a.g); a.mat.dispose(); this.after.splice(i, 1); } else a.mat.opacity = 0.5 * (1 - k);
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
    else if (e.flags !== undefined && s.id !== o.meId) { const a = ((e.flags >> 1) & 7) * Math.PI / 4; want = Math.atan2(Math.cos(a), Math.sin(a)); } // quieto: hacia donde dice el servidor
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
    // v0.13 · Gestos de la vida en la calle: sentado, manos arriba, al teléfono, fumando y gesticulando al hablar.
    let sitDrop = 0;
    const g = s.emote && !moving && !s.vehicle ? s.emote.move : '';
    const gt = s.emote ? Math.max(0, o.serverNow - s.emote.at) / 1000 : 0;
    if (g === 'sentado') { thL = thR = -1.45; knL = knR = 1.45; shL = shR = -0.45; elL = elR = -0.7; spineX = 0.12; sitDrop = 0.44; }
    else if (g === 'manos-arriba') { shL = shR = -2.85; shLz = -0.25; shRz = 0.25; elL = elR = -0.35; spineX = -0.05; neckX = 0.1; }
    else if (g === 'telefono') { shR = -0.35; shRz = 0.35; elR = -2.35; neckX = 0.12; }
    else if (g === 'fumar') { const k = (gt % 7) < 1.6 ? Math.sin(((gt % 7) / 1.6) * Math.PI) : 0; shR = -0.35 - 0.35 * k; shRz = 0.3; elR = -1.2 - 1.0 * k; shL = 0.05; shLz = -0.2; elL = -1.6; }
    else if (g === 'gesto') { const a = Math.sin(gt * 2.4), b2 = Math.sin(gt * 1.7 + 1); shL = -0.45 + a * 0.3; elL = -1.0 + b2 * 0.4; shR = -0.4 - b2 * 0.3; elR = -1.1 + a * 0.35; spineY = a * 0.08; neckX = b2 * 0.06; }
    // Baile.
    if (s.emote && !moving && !s.vehicle && !['sentado', 'manos-arriba', 'telefono', 'fumar', 'gesto'].includes(s.emote.move)) {
      const age = Math.max(0, o.serverNow - s.emote.at) / 1000;
      const pose = dancePose(s.emote.move, age);
      thL = pose.left * 0.8; thR = pose.right * 0.8; shL = -pose.back; shR = -pose.front; spineY = pose.lean; r.body.position.x = pose.sway * 0.01;
      r.root.rotation.y = r.heading + (pose.turn !== undefined ? (pose.turn < 0 ? Math.PI : 0) : 0);
    } else r.body.position.x = 0;
    // Tumbado (derribado, muerto o durmiendo).
    const lying = s.state === 'downed' || s.state === 'sleeping' || !!s.dead;
    r.lie += ((lying ? 1 : 0) - r.lie) * Math.min(1, dt * 5);
    const roll = e.rollAt ? now - e.rollAt : 1e9;
    const ROLL = 420;
    if (roll < ROLL) {
      // v0.12 · Voltereta agachada hacia delante que gira sobre el centro del cuerpo (antes giraba sobre los pies y
      // parecía que se tumbaba): piernas y brazos recogidos y cuerpo bajo durante todo el giro.
      const k = roll / ROLL, th = k * Math.PI * 2, hc = 0.34 / Y_SQUASH;
      const tuck = Math.sin(k * Math.PI);
      r.body.rotation.x = th;
      r.body.position.y = hc * (1 - Math.cos(th)) - tuck * 0.18 + 0.02;
      r.body.position.z = -hc * Math.sin(th);
      thL = thR = 1.5 * tuck + 0.2; knL = knR = 2.0 * tuck; shL = shR = -1.2 * tuck; elL = elR = -1.6 * tuck; spineX = 0.5 * tuck; neckX = 0.5 * tuck;
    } else {
      r.body.rotation.x = -r.lie * Math.PI / 2;
      r.body.position.y = r.lie * 0.06 + bob * M - sitDrop * M / Y_SQUASH; r.body.position.z = 0;
    }
    if (lying && roll >= ROLL) { thL = 0.1; thR = -0.05; knL = 0.2; knR = 0.1; shL = -0.3; shR = 0.4; elL = -0.2; elR = -0.3; spineX = 0; neckX = 0.2; }
    // v0.12 · Mezcla suave entre posturas (andar → apuntar → golpear…): cada articulación se acerca a su objetivo en vez
    // de saltar. Los golpes, patadas y volteretas van más rápido para que sigan teniendo pegada.
    const snappy = since < 340 || kickT < 320 || roll < ROLL;
    const kk = Math.min(1, dt * (snappy ? 30 : 14));
    const to = (o3: THREE.Euler, ax: 'x' | 'y' | 'z', v: number) => { o3[ax] += (v - o3[ax]) * kk; };
    to(r.thighL.rotation, 'x', -thL); to(r.thighR.rotation, 'x', -thR); to(r.kneeL.rotation, 'x', knL); to(r.kneeR.rotation, 'x', knR);
    to(r.shoulderL.rotation, 'x', shL); to(r.shoulderL.rotation, 'z', shLz); to(r.shoulderR.rotation, 'x', shR); to(r.shoulderR.rotation, 'z', shRz);
    to(r.elbowL.rotation, 'x', elL); to(r.elbowR.rotation, 'x', elR);
    to(r.spine.rotation, 'x', spineX); to(r.spine.rotation, 'y', spineY); to(r.neck.rotation, 'x', neckX);
    // Cadera que acompaña la zancada, peso que cambia de pierna en reposo y cabeza que compensa el giro del tronco.
    to(r.hips.rotation, 'y', moving ? -sw * (run ? 0.18 : 0.12) : Math.sin(r.phase * 0.35) * 0.04);
    to(r.hips.rotation, 'z', moving ? Math.cos(r.phase) * 0.035 : Math.sin(r.phase * 0.35) * 0.025);
    to(r.neck.rotation, 'y', -spineY * 0.6);
    for (const [i, c] of r.coat.entries()) c.rotation.x = i === 2 ? Math.max(0, Math.abs(sw) * 0.25) : -Math.max(0, (i ? thR : thL)) * 0.6;
    // Invisible (camuflaje): casi transparente para los demás.
    const invis = !!s.buffs?.includes('invisible') || !!s.buffs?.includes('escondido');
    r.root.visible = !invis || (s.id === o.meId && !s.buffs?.includes('escondido'));
    r.shadow.visible = !lying;
  }

  dispose() { for (const r of this.rigs.values()) this.disposeRig(r); this.rigs.clear(); }
}

/**
 * v0.13 · Vista previa 3D para el creador de personaje y la ficha: el mismo modelo que en la calle, en su propio lienzo,
 * con cámara en perspectiva que gira despacio (o arrastrando con el ratón), respirando y con gestos de vez en cuando.
 */
export class Preview3D {
  el: HTMLDivElement; private canvas: HTMLCanvasElement; private c3d: any; private cam: THREE.PerspectiveCamera;
  private ent: Ent3D; private raf = 0; private angle = 0.55; private drag: { x: number; a: number } | null = null; private last = performance.now(); private idleSpin = true;
  constructor(private w = 260, private h = 340, cls = 'preview preview3d') {
    this.el = document.createElement('div'); this.el.className = cls;
    this.canvas = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`; this.canvas.style.height = `${h}px`; this.canvas.style.cursor = 'grab'; this.canvas.title = 'Arrastra para girar';
    this.el.append(this.canvas);
    const gl = (this.canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true }) ?? this.canvas.getContext('webgl', { antialias: true, alpha: true })) as WebGL2RenderingContext;
    if (!gl) throw new Error('sin WebGL');
    this.c3d = new Chars3D(this.canvas, gl);
    this.c3d.renderer.setClearColor(0x000000, 0);
    this.cam = new THREE.PerspectiveCamera(26, w / h, 0.05, 40);
    this.ent = { x: 0, y: 0, moving: false, samples: [], s: { id: 1, kind: 'player', name: '', appearance: {}, chrome: [], interactive: false } as any };
    this.canvas.addEventListener('pointerdown', (e) => { this.drag = { x: e.clientX, a: this.angle }; this.idleSpin = false; this.canvas.setPointerCapture(e.pointerId); this.canvas.style.cursor = 'grabbing'; });
    this.canvas.addEventListener('pointermove', (e) => { if (this.drag) this.angle = this.drag.a + (e.clientX - this.drag.x) * 0.012; });
    this.canvas.addEventListener('pointerup', () => { this.drag = null; this.canvas.style.cursor = 'grab'; });
    const loop = () => { this.raf = requestAnimationFrame(loop); this.frame(); };
    this.raf = requestAnimationFrame(loop);
  }
  /** Cambia el aspecto (se reconstruye el modelo al momento). */
  async show(ap: any, chrome: string[], weapon?: string) { this.ent.s = { ...this.ent.s, appearance: { ...ap }, chrome: [...chrome], weapon } as any; }
  private frame() {
    // Solo dibuja mientras está en pantalla (y a unos 30 fps): fuera del paso del aspecto no gasta nada.
    const now = performance.now();
    if (!this.el.isConnected || now - this.last < 30) return;
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    // Se balancea de tres cuartos a tres cuartos (enseña la cara y los costados) hasta que lo giras tú.
    if (this.idleSpin && !this.drag) this.angle = 0.25 + Math.sin(now / 2600) * 0.85;
    const c = this.c3d;
    const s = this.ent.s;
    const key = JSON.stringify([s.appearance, s.chrome, s.weapon, gunsVersion()]);
    let r = c.rigs.get(1);
    if (!r || r.key !== key) { if (r) c.disposeRig(r); r = c.build(this.ent); r.key = key; c.rigs.set(1, r); r.shadow.material.opacity = 0.5; r.root.traverse((o: any) => { if (o.geometry?.type === 'RingGeometry') o.visible = false; }); }
    // Un gesto cada pocos segundos para que se vea vivo.
    const t = (now / 1000) % 14;
    s.emote = t > 9 && t < 12.5 ? { move: 'gesto', at: Date.now() - (t - 9) * 1000 } : undefined;
    c.animate(r, this.ent, { meId: 1, guarding: false, now, dt, serverNow: Date.now() });
    r.root.rotation.y = this.angle;
    const d = 3.1, ty = 0.46;
    this.cam.position.set(0, ty + 0.3, d);
    this.cam.lookAt(0, ty, 0);
    const R = c.renderer as THREE.WebGLRenderer;
    R.setViewport(0, 0, this.canvas.width, this.canvas.height);
    R.clear(true, true, true);
    R.render(c.scene, this.cam);
  }
  destroy() { cancelAnimationFrame(this.raf); try { this.c3d.dispose(); (this.c3d.renderer as THREE.WebGLRenderer).dispose(); (this.c3d.renderer as THREE.WebGLRenderer).forceContextLoss(); } catch { /* nada */ } }
}
