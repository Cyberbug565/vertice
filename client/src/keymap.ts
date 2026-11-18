// v0.7 · Teclas configurables. Las más usadas quedan alrededor de WASD; las menos, más lejos.
export interface KeyAction { id: string; label: string; group: string; def: string }

export const KEY_ACTIONS: KeyAction[] = [
  { id: 'up', label: 'Andar hacia arriba', group: 'Movimiento', def: 'w' },
  { id: 'left', label: 'Andar a la izquierda', group: 'Movimiento', def: 'a' },
  { id: 'down', label: 'Andar hacia abajo', group: 'Movimiento', def: 's' },
  { id: 'right', label: 'Andar a la derecha', group: 'Movimiento', def: 'd' },
  { id: 'run', label: 'Correr / andar', group: 'Movimiento', def: 'shift' },
  { id: 'interact', label: 'Interactuar con lo señalado', group: 'Acción', def: 'e' },
  { id: 'wheel', label: 'Ruleta de armas (elige qué empuñas)', group: 'Acción', def: 'r' },
  { id: 'kick', label: 'Patada (empuja y desequilibra)', group: 'Acción', def: 'f' },
  { id: 'cancel', label: 'Cancelar la acción', group: 'Acción', def: 'backspace' },
  { id: 'hack', label: 'Modo hackeo (luego clic en el objetivo)', group: 'Acción', def: 'q' },
  { id: 'dodge', label: 'Esquivar (rodar hacia donde andas)', group: 'Acción', def: ' ' },
  { id: 'retreat', label: 'Retirada al refugio', group: 'Acción', def: ',' },
  { id: 'body', label: 'Salud y heridas', group: 'Acción', def: 'h' },
  { id: 'target', label: 'Señalar lo siguiente cercano', group: 'Acción', def: 'tab' },
  { id: 'dance', label: 'Bailar', group: 'Acción', def: 'b' },
  { id: 'sleep', label: 'Dormir / despertar', group: 'Acción', def: 'z' },
  { id: 'drive', label: 'Conducir / aparcar', group: 'Acción', def: 'v' },
  { id: 'inventory', label: 'Inventario', group: 'Personaje', def: 'i' },
  { id: 'character', label: 'Ficha del personaje', group: 'Personaje', def: 'c' },
  { id: 'cyber', label: 'Ciberware', group: 'Personaje', def: 'x' },
  { id: 'skills', label: 'Habilidades y perks', group: 'Personaje', def: 'k' },
  { id: 'map', label: 'Mapa de la ciudad', group: 'Mundo', def: 'm' },
  { id: 'journal', label: 'Diario', group: 'Mundo', def: 'j' },
  { id: 'search', label: 'Buscar personas (móvil)', group: 'Mundo', def: 'g' },
  { id: 'trunk', label: 'Maletero del coche', group: 'Mundo', def: 't' },
  { id: 'chat', label: 'Escribir en el chat local', group: 'Comunicación', def: 'enter' },
  { id: 'chatGlobal', label: 'Escribir en el chat global', group: 'Comunicación', def: 'y' },
  { id: 'auto', label: 'Modo automático', group: 'Menos usadas', def: 'l' },
  { id: 'jobs', label: 'Empleos', group: 'Menos usadas', def: 'o' },
  { id: 'props', label: 'Propiedades', group: 'Menos usadas', def: 'p' },
  { id: 'market', label: 'Mercado en tiempo real', group: 'Menos usadas', def: 'n' },
  { id: 'bounties', label: 'Recompensas', group: 'Menos usadas', def: 'u' },
  { id: 'factions', label: 'Facciones', group: 'Menos usadas', def: 'ñ' },
  { id: 'ambar', label: 'Rescate Ámbar', group: 'Menos usadas', def: '.' },
  { id: 'zoomIn', label: 'Acercar', group: 'Cámara', def: '+' },
  { id: 'zoomOut', label: 'Alejar', group: 'Cámara', def: '-' },
];

const KEY = 'vertice.keys.v1';
function load(): Record<string, string> {
  const out: Record<string, string> = Object.fromEntries(KEY_ACTIONS.map((a) => [a.id, a.def]));
  try { Object.assign(out, JSON.parse(localStorage.getItem(KEY) ?? '{}')); } catch {}
  // v0.9 · R pasa a ser el modo hackeo; la retirada se mueve a la coma (solo si no la habías cambiado tú).
  for (const a of KEY_ACTIONS) if (out[a.id] === undefined) out[a.id] = a.def;
  if (out.retreat === 'r' && out.hack === 'r') out.retreat = ',';
  if (out.cancel === 'q' && out.kick === 'q') out.cancel = 'backspace';
  // v0.10 · Hackeo en Q, ruleta de armas en R, patada en F, cuerpo en H y facciones en Ñ (solo si seguían las de antes).
  if (out.hack === 'r' && (out.kick === 'q' || out.kick === 'f')) { out.hack = 'q'; out.wheel = 'r'; out.kick = 'f'; if (out.body === 'f') out.body = 'h'; if (out.factions === 'h') out.factions = 'ñ'; }
  // v0.12 · E siempre interactúa (puertas, PNJ, objetos) y ninguna tecla puede tener dos acciones: si una configuración
  // antigua repetía tecla, se queda con ella la acción cuya tecla por defecto es esa y las demás vuelven a la suya (si está libre).
  let migrated = false;
  try { migrated = localStorage.getItem(KEY + '.v12') === '1'; } catch {}
  if (!migrated) {
    if (out.interact !== 'e') { for (const [a, k] of Object.entries(out)) if (k === 'e' && a !== 'interact') out[a] = ''; out.interact = 'e'; }
    try { localStorage.setItem(KEY + '.v12', '1'); } catch {}
  }
  const defOf = Object.fromEntries(KEY_ACTIONS.map((a) => [a.id, a.def]));
  const taken = new Map<string, string>();
  for (const a of KEY_ACTIONS) { const k = out[a.id]; if (k && k === a.def) taken.set(k, a.id); }
  for (const a of KEY_ACTIONS) {
    const k = out[a.id]; if (!k || taken.get(k) === a.id) continue;
    if (!taken.has(k)) { taken.set(k, a.id); continue; }
    out[a.id] = !taken.has(defOf[a.id]) ? defOf[a.id] : '';
    if (out[a.id]) taken.set(out[a.id], a.id);
  }
  for (const k of Object.keys(out)) if (!(k in defOf)) delete out[k];
  return out;
}
/** Teclas fijas que no se pueden asignar (habilidades 1–4, Esc y Control para el golpe fuerte). */
export const RESERVED_KEYS = new Set(['1', '2', '3', '4', 'escape', 'control']);
export const keymap: Record<string, string> = load();
export function setKey(action: string, key: string) {
  if (RESERVED_KEYS.has(key)) return;
  // Una tecla solo puede tener una acción: la que la tenía se queda sin asignar.
  for (const [a, k] of Object.entries(keymap)) if (k === key && a !== action) keymap[a] = '';
  keymap[action] = key;
  try { localStorage.setItem(KEY, JSON.stringify(keymap)); } catch {}
}
export function resetKeys() {
  for (const a of KEY_ACTIONS) keymap[a.id] = a.def;
  try { localStorage.removeItem(KEY); } catch {}
}
/** Acción asociada a una tecla pulsada (en minúsculas, como KeyboardEvent.key). */
export function actionFor(key: string): string | undefined {
  const k = key === '=' ? '+' : key;
  return Object.entries(keymap).find(([, v]) => v && v === k)?.[0];
}
/** Nombre legible de una tecla para la interfaz. */
export function keyLabel(k: string) {
  const map: Record<string, string> = { backspace: 'Retroceso', ',': ',', shift: 'Mayús', enter: 'Intro', tab: 'Tab', ' ': 'Espacio', arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', escape: 'Esc', '.': '.', '': '—' };
  return map[k] ?? k.toUpperCase();
}
export const keyOf = (action: string) => keyLabel(keymap[action] ?? '');
