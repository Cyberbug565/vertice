// Utilidad mínima para construir DOM accesible sin dependencias.
type Child = Node | string | number | null | undefined | false;
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k in el && k !== 'list') (el as any)[k] = v;
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
export const $ui = () => document.getElementById('ui')!;
export function clearUi() { $ui().replaceChildren(); }
export function fmtMoney(n: number) { return `${n.toLocaleString('es-ES')} €$`; }

/**
 * v0.13 · Confirmación dentro del juego (sustituye al `confirm()` del navegador, que rompía la inmersión).
 * Muestra una ventana con el estilo del HUD; Intro acepta y Esc cancela. Llama a `then` solo si se acepta.
 */
export function ask(text: string, then: () => void, opts: { ok?: string; cancel?: string; danger?: boolean; title?: string } = {}) {
  document.getElementById('ask-modal')?.remove();
  const close = (yes: boolean) => { ov.remove(); window.removeEventListener('keydown', key, true); if (yes) then(); };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); }
    else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); close(true); }
  };
  const [first, ...rest] = text.split('\n\n');
  const okBtn = h('button', { class: `btn ${opts.danger ? 'danger' : 'primary'}`, onclick: () => close(true) }, opts.ok ?? 'Aceptar');
  const ov = h('div', { class: 'ask-overlay', id: 'ask-modal', role: 'dialog', 'aria-modal': 'true', onclick: (e: MouseEvent) => { if (e.target === ov) close(false); } },
    h('div', { class: `ask-box${opts.danger ? ' danger' : ''}` },
      h('div', { class: 'ask-title' }, opts.title ?? (opts.danger ? '⚠ CONFIRMAR' : '◆ CONFIRMAR')),
      h('p', { class: 'ask-text' }, first), ...rest.map((r) => h('p', { class: 'ask-sub' }, r)),
      h('div', { class: 'ask-btns' }, h('button', { class: 'btn', onclick: () => close(false) }, opts.cancel ?? 'Cancelar'), okBtn)));
  $ui().append(ov);
  window.addEventListener('keydown', key, true);
  setTimeout(() => okBtn.focus(), 30);
}
