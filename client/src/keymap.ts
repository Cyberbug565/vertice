// v0.7 · Teclas configurables. Las más usadas quedan alrededor de WASD; las menos, más lejos.
export interface KeyAction { id: string; label: string; group: string; def: string }

export const KEY_ACTIONS: KeyAction[] = [
  { id: 'up', label: 'Andar hacia arriba', group: 'Movimiento', def: 'w' },
  { id: 'left', label: 'Andar a la izquierda', group: 'Movimiento', def: 'a' },
  { id: 'down', label: 'Andar hacia abajo', group: 'Movimiento', def: 's' },
  { id: 'right', label: 'Andar a la derecha', group: 'Movimiento', def: 'd' },
  { id: 'run', label: 'Correr / andar', group: 'Movimiento', def: 'shift' },
  { id: 'interact', label: 'Interactuar con lo señalado', group: 'Acción', def: 'e' },
  { id: 'kick', label: 'Patada (empuja y desequilibra)', group: 'Acción', def: 'q' },
  { id: 'cancel', label: 'Cancelar la acción', group: 'Acción', def: 'backspace' },
  { id: 'hack', label: 'Modo hackeo (luego clic en el objetivo)', group: 'Acción', def: 'r' },
  { id: 'dodge', label: 'Esquivar (rodar hacia donde andas)', group: 'Acción', def: ' ' },
  { id: 'retreat', label: 'Retirada al refugio', group: 'Acción', def: ',' },
  { id: 'body', label: 'Panel del cuerpo (heridas)', group: 'Acción', def: 'f' },
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
  { id: 'factions', label: 'Facciones', group: 'Menos usadas', def: 'h' },
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
  return out;
}
export const keymap: Record<string, string> = load();
export function setKey(action: string, key: string) {
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
