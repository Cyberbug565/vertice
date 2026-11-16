// v0.6 · Buscador de personas (ordenador del piso o móvil), maletero del coche y destino marcado.
import type { SearchResult, TrunkView } from '@vertice/shared';
import type { Net } from '../net';
import { fmtMoney, h } from './dom';
import { showPanel } from './life';

export interface IntelCtx { net: Net }

let lastResults: { device: 'phone' | 'computer'; results: SearchResult[] } = { device: 'phone', results: [] };

/** Buscador: en el ordenador da la posición exacta y sigue a la persona unos minutos; con el móvil, solo el distrito. */
export function searchPanel(ctx: IntelCtx, device: 'phone' | 'computer', results?: SearchResult[]) {
  if (results) lastResults = { device, results };
  const list = results ?? (lastResults.device === device ? lastResults.results : []);
  const input = h('input', { type: 'search', placeholder: 'Nombre (mín. 2 letras)', maxlength: '24', 'aria-label': 'Nombre a buscar', style: { flex: '1' } }) as HTMLInputElement;
  const go = () => { const q = input.value.trim(); if (q.length >= 2) ctx.net.send({ t: 'searchPeople', query: q, device } as any); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } e.stopPropagation(); });
  const card = (r: SearchResult) => h('div', { class: 'fcard', style: { borderTopColor: r.bounty ? '#ff3040' : r.kind === 'player' ? '#43f3ff' : '#ffd23f' } },
    h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('b', {}, r.name), h('span', { class: 'chip' }, r.kind === 'player' ? (r.online ? '● en línea' : '○ desconectado/a') : 'PNJ')),
    h('div', { class: 'small muted' }, `Nivel ${r.level} · ${r.title}${r.faction ? ` · ${r.faction}` : ''}`),
    r.bounty ? h('div', { style: { color: 'var(--red)' } }, `Recompensa: ${fmtMoney(r.bounty)}`) : null,
    r.record.length ? h('div', { class: 'small' }, '📁 Antecedentes públicos: ', r.record.join(' · ')) : h('div', { class: 'small muted' }, 'Sin antecedentes públicos.'),
    r.location ? h('div', { class: 'small' }, r.location.precise ? '📍 Posición exacta: ' : '📶 Zona aproximada: ', h('b', {}, r.location.place)) : h('div', { class: 'small muted' }, 'Ubicación desconocida.'),
    r.location ? h('button', { class: 'btn small primary', onclick: () => { ctx.net.send({ t: 'goto', kind: 'person', key: r.key } as any); document.getElementById('search-panel')?.remove(); } }, r.location.precise ? '🎯 Marcar como objetivo (te lleva hasta él/ella)' : '🎯 Ir a la zona aproximada') : null);
  showPanel('search-panel', device === 'computer' ? '💻 Ordenador · buscar personas' : '📱 Móvil · buscar personas',
    h('p', { class: 'muted' }, device === 'computer'
      ? 'Conexión rápida a las bases de datos de la ciudad: antecedentes, recompensas y posición exacta (con seguimiento en vivo unos minutos).'
      : 'Con el móvil tarda más y solo triangula el distrito aproximado. Para una posición exacta, usa el ordenador de tu piso. También sirven los soplos de la calle.'),
    h('div', { class: 'row' }, input, h('button', { class: 'btn primary', onclick: go }, 'Buscar')),
    list.length ? h('div', { class: 'cards' }, ...list.map(card)) : h('p', { class: 'muted' }, 'Escribe un nombre: jugadores, fugitivos y personas conocidas de la ciudad.'));
  setTimeout(() => input.focus(), 30);
}

/** Maletero: guarda armas y objetos (hasta su capacidad en kg). Las armas que no caben encima, aquí o en tu piso franco. */
export function trunkPanel(ctx: IntelCtx, v: TrunkView) {
  const row = (it: { def: string; name: string; qty: number }, dir: 'in' | 'out') => h('tr', {}, h('td', {}, it.name), h('td', { class: 'mono' }, `×${it.qty}`),
    h('td', {}, h('button', { class: 'btn small', onclick: () => ctx.net.send({ t: 'trunk', action: dir, item: it.def, qty: 1 } as any) }, dir === 'in' ? 'Guardar 1' : 'Sacar 1'),
      it.qty > 1 ? h('button', { class: 'btn small', onclick: () => ctx.net.send({ t: 'trunk', action: dir, item: it.def, qty: it.qty } as any) }, 'Todo') : null));
  const pct = Math.min(100, (v.used / Math.max(1, v.capacity)) * 100);
  showPanel('trunk-panel', `Maletero · ${v.name}`,
    h('p', { class: 'muted' }, 'Solo puedes llevar encima 2 armas largas y 3 cortas. El resto, en el maletero o en el alijo de tu casa.'),
    h('div', { class: 'xpbar' }, h('i', { style: { width: `${pct}%`, background: pct > 90 ? 'var(--red)' : '#43f3ff' } })),
    h('div', { class: 'small mono' }, `${v.used} / ${v.capacity} kg`),
    h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => { ctx.net.send({ t: 'car', action: 'drive', car: v.car } as any); document.getElementById('trunk-panel')?.remove(); } }, '🚗 Conducir')),
    h('div', { class: 'grid2' },
      h('div', {}, h('h3', {}, 'En el maletero'), v.items.length ? h('table', { class: 'sheet' }, ...v.items.map((i) => row(i, 'out'))) : h('p', { class: 'muted' }, 'Vacío.')),
      h('div', {}, h('h3', {}, 'Lo que llevas'), h('table', { class: 'sheet' }, ...v.inventory.map((i) => row(i, 'in'))))));
}
