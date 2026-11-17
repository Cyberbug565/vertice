// v0.13 · Panel de saqueo: el inventario de un cuerpo en pequeño (ciberware, armas y objetos), con «Coger» y «Cogerlo todo».
import { content } from '../content';
import { h, $ui, fmtMoney } from './dom';

export interface LootView {
  target: number; name: string; dead: boolean; money: number;
  items: { id: string; name: string; qty: number; kind: string; weight: number; blocked?: string }[];
  chrome: { id: string; name: string; grade: number; region?: string; need: number; blocked?: string }[];
}
const RCOL: Record<string, string> = { comun: '#c8c8d8', 'poco-comun': '#5aff8a', raro: '#43a8ff', epico: '#b46cff', legendario: '#ffb020', mitico: '#ff3fa4' };
const ICON: Record<string, string> = { arma: '🔫', ropa: '🧥', comida: '🍜', bebida: '🥤', medicina: '💉', municion: '▮', herramienta: '🔧', chatarra: '⚙', contrabando: '📦', equipo: '📟' };
const GRADE = ['I', 'II', 'III', 'IV', 'V'];

export function lootPanel(v: LootView, send: (m: { kind: 'money' | 'item' | 'chrome' | 'all'; id?: string }) => void) {
  document.getElementById('loot-panel')?.remove();
  const tile = (icon: string, name: string, color: string, qty: string, sub: string, onTake: () => void, blocked?: string) =>
    h('button', { class: `cs-tile loot-tile${blocked ? ' blocked' : ''}`, style: { borderColor: color }, title: blocked ?? `Coger ${name}`, disabled: !!blocked, onclick: onTake },
      h('span', { class: 'cs-ico', style: { color } }, icon), h('span', { class: 'cs-tname' }, name), sub ? h('span', { class: 'loot-sub' }, sub) : null, qty ? h('span', { class: 'cs-qty' }, qty) : null);
  const weapons = v.items.filter((i) => i.kind === 'arma');
  const rest = v.items.filter((i) => i.kind !== 'arma');
  const itemTile = (i: LootView['items'][number]) => {
    const d = content.items.find((x) => x.id === i.id);
    return tile(ICON[i.kind] ?? '•', i.name, RCOL[d?.rarity ?? 'comun'] ?? '#c8c8d8', i.qty > 1 ? `×${i.qty}` : '', `${(i.weight * i.qty).toFixed(1)} kg`, () => send({ kind: 'item', id: i.id }), i.blocked);
  };
  const empty = !v.money && !v.items.length && !v.chrome.length;
  const panel = h('div', { class: 'loot-mini', id: 'loot-panel', role: 'dialog', 'aria-label': `Registro de ${v.name}` },
    h('div', { class: 'loot-head' },
      h('div', {}, h('b', {}, v.name), h('span', { class: 'loot-state' }, v.dead ? ' · cadáver' : ' · inconsciente')),
      h('button', { class: 'btn small', onclick: () => panel.remove(), title: 'Cerrar (Esc)' }, '✕')),
    empty ? h('p', { class: 'muted loot-empty' }, 'No le queda nada encima.') : null,
    v.money ? h('div', { class: 'loot-money' }, h('span', {}, '💳 ', fmtMoney(v.money)), h('button', { class: 'btn small', onclick: () => send({ kind: 'money' }) }, 'Coger')) : null,
    v.chrome.length ? h('h3', {}, 'Ciberware') : null,
    v.chrome.length ? h('div', { class: 'cs-grid small' }, ...v.chrome.map((c) => tile('🦾', c.name, '#ff5aa0', '', `Grado ${GRADE[c.grade - 1]} · Rep. ${c.need}`, () => send({ kind: 'chrome', id: c.id }), c.blocked))) : null,
    weapons.length ? h('h3', {}, 'Armas') : null,
    weapons.length ? h('div', { class: 'cs-grid small' }, ...weapons.map(itemTile)) : null,
    rest.length ? h('h3', {}, 'Inventario') : null,
    rest.length ? h('div', { class: 'cs-grid small' }, ...rest.map(itemTile)) : null,
    h('div', { class: 'loot-foot' },
      h('span', { class: 'muted' }, 'Clic en una casilla para cogerla.'),
      !empty ? h('button', { class: 'btn primary small', onclick: () => send({ kind: 'all' }) }, 'Cogerlo todo') : null));
  $ui().append(panel);
  return panel;
}
