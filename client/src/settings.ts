// Ajustes de accesibilidad y rendimiento, persistidos por navegador.
export interface Settings {
  quality: 'low' | 'high'; fpsCap: 0 | 30 | 60; resScale: number; reduceFlashes: boolean; reduceMotion: boolean;
  textSize: 'normal' | 'large' | 'xl'; showNames: boolean; music: number; ambient: number; sfx: number; ui: number;
}
const DEFAULTS: Settings = { quality: 'high', fpsCap: 60, resScale: 1, reduceFlashes: false, reduceMotion: false, textSize: 'normal', showNames: true, music: 0.5, ambient: 0.4, sfx: 0.7, ui: 0.5 };
const KEY = 'vertice.settings.v1';

function load(): Settings {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return { ...DEFAULTS }; }
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
export function applyDom() { document.documentElement.dataset.text = settings.textSize; }
applyDom();
