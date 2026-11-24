// Ajustes de accesibilidad y rendimiento, persistidos por navegador.
export interface Settings {
  quality: 'low' | 'high'; fpsCap: 0 | 30 | 60; resScale: number; reduceFlashes: boolean; reduceMotion: boolean;
  textSize: 'normal' | 'large' | 'xl'; showNames: boolean; music: number; ambient: number; sfx: number; ui: number;
  /** v0.11 · Personajes en 3D (si no, la figura 2D de antes). */
  chars3d: boolean;
  /** v0.22 · Desnudos explícitos (si no, sin ropa interior se ve la de serie). */
  nudity: boolean;
  /** v0.38 · Qué se ve en pantalla (Ajustes → Interfaz en pantalla). */
  hud: HudPrefs;
  /** v0.39 · Cámara elegida (cenital, tercera o primera persona). */
  camera: 'cenital' | 'tercera' | 'primera';
  /** v0.40 · Distancia de dibujado de las cámaras cercanas, en losetas (≈ metros). */
  drawDist: number;
}
export interface HudPrefs {
  scan: boolean; hints: boolean; help: boolean; labels: boolean; panels: boolean; stats: boolean; needs: boolean; minimap: boolean; stealth: boolean;
  place: boolean; file: boolean; net: boolean; chatLocal: boolean; chatGlobal: boolean; body: boolean; weapon: boolean; abilities: boolean; xp: boolean; toasts: boolean;
}
/** Elementos del HUD que se pueden ocultar, con su nombre y si vienen encendidos (los de texto largo, apagados). */
export const HUD_ITEMS: { id: keyof HudPrefs; name: string; group: string; on: boolean }[] = [
  { id: 'scan', name: 'Datos de la gente al pasar el ratón (según tu Interfaz)', group: 'Información', on: true },
  { id: 'hints', name: 'Pistas de controles al pasar el ratón', group: 'Información', on: false },
  { id: 'help', name: 'Línea de ayuda de controles (abajo)', group: 'Información', on: false },
  { id: 'toasts', name: 'Avisos emergentes', group: 'Información', on: true },
  { id: 'xp', name: 'Experiencia ganada al usar habilidades', group: 'Información', on: true },
  { id: 'stats', name: 'Detalles del personaje (oficio, suerte, carga)', group: 'Personaje', on: false },
  { id: 'needs', name: 'Hambre, sed y sueño', group: 'Personaje', on: true },
  { id: 'body', name: 'Panel de salud del cuerpo', group: 'Personaje', on: true },
  { id: 'weapon', name: 'Arma equipada y munición', group: 'Personaje', on: true },
  { id: 'abilities', name: 'Habilidades activas del cromo', group: 'Personaje', on: true },
  { id: 'minimap', name: 'Minimapa', group: 'Mundo', on: true },
  { id: 'stealth', name: 'Barra de sigilo', group: 'Mundo', on: true },
  { id: 'place', name: 'Barrio, peligro, hora y turno', group: 'Mundo', on: true },
  { id: 'file', name: 'Tu expediente (PCV y precio por tu cabeza)', group: 'Mundo', on: true },
  { id: 'net', name: 'Datos de red y rendimiento (ms, FPS)', group: 'Mundo', on: false },
  { id: 'labels', name: 'Rótulos en los botones de acción', group: 'Barra inferior', on: false },
  { id: 'panels', name: 'Fila de paneles (inventario, mapa, mercado…)', group: 'Barra inferior', on: true },
  { id: 'chatLocal', name: 'Chat local', group: 'Chat', on: true },
  { id: 'chatGlobal', name: 'Chat global', group: 'Chat', on: true },
];
const HUD_DEFAULTS = Object.fromEntries(HUD_ITEMS.map((i) => [i.id, i.on])) as unknown as HudPrefs;
const DEFAULTS: Settings = { quality: 'high', fpsCap: 60, resScale: 1, reduceFlashes: false, reduceMotion: false, textSize: 'normal', showNames: true, music: 0.5, ambient: 0.4, sfx: 0.7, ui: 0.5, chars3d: true, nudity: true, hud: { ...HUD_DEFAULTS }, camera: 'cenital', drawDist: 120 };
const KEY = 'vertice.settings.v1';

function load(): Settings {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return { ...DEFAULTS, ...v, hud: { ...HUD_DEFAULTS, ...(v.hud ?? {}) } }; } catch { return { ...DEFAULTS, hud: { ...HUD_DEFAULTS } }; }
}
export const settings: Settings = load();
const listeners: (() => void)[] = [];
export function onSettings(fn: () => void) { listeners.push(fn); }
export function saveSettings(patch: Partial<Settings>) {
  Object.assign(settings, patch);
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {}
  applyDom();
  for (const l of listeners) l();
}
export function applyDom() {
  document.documentElement.dataset.text = settings.textSize;
  // v0.38 · Lo que está apagado se oculta por CSS (html[data-hide~="…"]).
  document.documentElement.dataset.hide = HUD_ITEMS.filter((i) => !settings.hud[i.id]).map((i) => i.id).join(' ');
}
/** Atajo para el código del HUD. */
export const hud = new Proxy({} as HudPrefs, { get: (_t, k) => settings.hud[k as keyof HudPrefs] });
applyDom();
