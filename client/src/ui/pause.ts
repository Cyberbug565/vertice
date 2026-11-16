// v0.7 · Menú de pausa (Esc): continuar, ajustes, teclas y cerrar sesión; y editor de teclas.
import { KEY_ACTIONS, keyLabel, keymap, resetKeys, setKey } from '../keymap';
import { $ui, h } from './dom';

export function pauseMenu(opts: { onSettings: () => void; onLogout: () => void; onKeysChanged: () => void }) {
  document.getElementById('pause-menu')?.remove();
  const close = () => ov.remove();
  const ov = h('div', { class: 'overlay pause', id: 'pause-menu', role: 'dialog', 'aria-label': 'Menú' },
    h('div', { class: 'pause-card' },
      h('div', { class: 'pause-title' }, h('span', { class: 'glitch', 'data-text': 'VÉRTICE' }, 'VÉRTICE'), h('small', {}, 'MENÚ')),
      h('button', { class: 'pbtn', autofocus: true, onclick: close }, '▶ Continuar'),
      h('button', { class: 'pbtn', onclick: () => { close(); opts.onSettings(); } }, '⚙ Ajustes'),
      h('button', { class: 'pbtn', onclick: () => { close(); keysPanel(opts.onKeysChanged); } }, '⌨ Teclas'),
      h('button', { class: 'pbtn danger', onclick: () => { if (confirm('¿Cerrar sesión? Tu personaje se queda donde está (si estás en la calle, unos segundos).')) { close(); opts.onLogout(); } } }, '⏻ Cerrar sesión')));
  ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  ov.addEventListener('pointerdown', (e) => { if (e.target === ov) close(); });
  $ui().append(ov);
  (ov.querySelector('.pbtn') as HTMLElement)?.focus();
}

export function keysPanel(onChanged: () => void) {
  document.getElementById('keys-panel')?.remove();
  let waiting: string | null = null;
  const list = h('div', { class: 'keys-list' });
  const render = () => {
    const groups = [...new Set(KEY_ACTIONS.map((a) => a.group))];
    list.replaceChildren(...groups.map((g) => h('div', { class: 'keys-group' }, h('h4', {}, g),
      ...KEY_ACTIONS.filter((a) => a.group === g).map((a) => h('div', { class: 'keys-row' }, h('span', {}, a.label),
        h('button', { class: `keycap${waiting === a.id ? ' wait' : ''}`, 'aria-label': `Cambiar tecla de ${a.label}`, onclick: () => { waiting = a.id; render(); } }, waiting === a.id ? 'Pulsa una tecla…' : keyLabel(keymap[a.id] ?? '')))))));
  };
  const onKey = (e: KeyboardEvent) => {
    if (!waiting) return;
    e.preventDefault(); e.stopPropagation();
    const k = e.key.toLowerCase();
    if (k !== 'escape') { setKey(waiting, k === '=' ? '+' : k); onChanged(); }
    waiting = null; render();
  };
  window.addEventListener('keydown', onKey, true);
  const ov = h('div', { class: 'overlay pause', id: 'keys-panel', role: 'dialog', 'aria-label': 'Teclas' },
    h('div', { class: 'pause-card wide' },
      h('div', { class: 'pause-title' }, h('span', {}, 'TECLAS'), h('small', {}, 'Haz clic en una tecla y pulsa la nueva. Esc cancela.')),
      h('p', { class: 'muted small' }, 'Ratón: clic izquierdo sobre una persona (o sobre ti) abre su menú; sobre una puerta u objeto, interactúa. Mantén el clic derecho para apuntar (armas a distancia) o bloquear (cuerpo a cuerpo); con él pulsado, clic izquierdo sobre alguien = atacar. Las flechas también mueven. 1–4: implantes.'),
      list,
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { resetKeys(); onChanged(); render(); } }, 'Restablecer'), h('button', { class: 'btn primary', onclick: () => { window.removeEventListener('keydown', onKey, true); ov.remove(); } }, 'Hecho'))));
  render();
  $ui().append(ov);
}
