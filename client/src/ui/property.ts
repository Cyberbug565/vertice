// v0.4 · Paneles de viviendas, inmobiliaria, concesionarios, propiedades, alijo, mercado en tiempo real y análisis de objetivos.
import type { BuildingView, DealerView, MarketLiveView, PropsView, RealtyView, ScanView, StashView } from '@vertice/shared';
import { content } from '../content';
import { newOpId, type Net } from '../net';
import { $ui, fmtMoney, h, ask } from './dom';
import { showPanel } from './life';
import { blip } from '../audio';

export interface PropCtx { net: Net; toast: (t: string, k?: 'info' | 'good' | 'warn' | 'bad') => void; money: () => number }
const SIZE: Record<string, string> = { estudio: 'Estudio', piso: 'Piso', loft: 'Loft', atico: 'Ático', villa: 'Villa' };
const CLASS: Record<string, string> = { moto: 'Moto', economico: 'Económico', utilitario: 'Utilitario', deportivo: 'Deportivo', todoterreno: 'Todoterreno', lujo: 'Lujo', blindado: 'Blindado', hiper: 'Hiperdeportivo' };
const SIZE_COLOR: Record<string, string> = { estudio: '#9a9ac0', piso: '#5affc8', loft: '#43a8ff', atico: '#b46cff', villa: '#ffbf00' };

export function spark(values: number[], w = 120, hgt = 30, color?: string) {
  if (values.length < 2) return h('span', { class: 'muted small' }, '—');
  const mn = Math.min(...values), mx = Math.max(...values), rng = mx - mn || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(hgt - 2 - ((v - mn) / rng) * (hgt - 4)).toFixed(1)}`).join(' ');
  const up = values[values.length - 1] >= values[0];
  const c = color ?? (up ? '#5affc8' : '#ff5a5a');
  const el = h('span', { class: 'spark' });
  el.innerHTML = `<svg width="${w}" height="${hgt}" viewBox="0 0 ${w} ${hgt}"><polyline points="${pts}" fill="none" stroke="${c}" stroke-width="1.6"/><polyline points="0,${hgt} ${pts} ${w},${hgt}" fill="${c}" fill-opacity=".12" stroke="none"/></svg>`;
  return el;
}
const chg = (n: number) => h('span', { class: n > 0.05 ? 'netok' : n < -0.05 ? 'netbad' : 'muted' }, n > 0 ? `▲ ${n.toFixed(1)} %` : n < 0 ? `▼ ${(-n).toFixed(1)} %` : '= 0 %');

// ---------------------------------------------------------------- viviendas
export function buildingPanel(ctx: PropCtx, v: BuildingView) {
  const units = v.units.map((u) => h('div', { class: 'fcard', style: { borderTopColor: SIZE_COLOR[u.size] } },
    h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('b', {}, u.name), h('span', { class: 'chip' }, SIZE[u.size])),
    h('div', { class: 'mono' }, u.owner ? (u.mine ? 'Es tuya' : `Dueño: ${u.owner}`) : fmtMoney(u.price)),
    h('div', { class: 'row' },
      !u.owner ? h('button', { class: 'btn small primary', disabled: ctx.money() < u.price, title: ctx.money() < u.price ? 'No te llega el dinero' : '', onclick: () => { ask(`¿Comprar ${u.name} por ${fmtMoney(u.price)}?`, () => { ctx.net.send({ t: 'house', action: 'buy', house: u.id, opId: newOpId() } as any); setTimeout(() => ctx.net.send({ t: 'house', action: 'view', building: v.building } as any), 400); }); } }, 'Comprar') : null,
      u.allowed ? h('button', { class: 'btn small', onclick: () => { ctx.net.send({ t: 'house', action: 'enter', house: u.id } as any); document.getElementById('building-panel')?.remove(); } }, 'Entrar') : null,
      u.owner && !u.allowed ? h('button', { class: 'btn small', onclick: () => ctx.net.send({ t: 'house', action: 'ring', house: u.id } as any) }, '🔔 Llamar al timbre') : null)));
  showPanel('building-panel', v.name, h('p', { class: 'muted' }, `${v.zone}. Las viviendas son zona protegida: dentro nadie puede atacarte, la cama es perfecta y hay un alijo para guardar cosas. Solo entra quien autorice el dueño.`),
    h('div', { class: 'cards' }, ...units));
}
export function realtyPanel(ctx: PropCtx, v: RealtyView) {
  const zones = [...new Set(content.houses.map((x) => x.zone))];
  const zn = (id: string) => content.zones.find((z) => z.id === id)?.name ?? id;
  showPanel('realty-panel', 'Inmobiliaria · viviendas en venta',
    h('p', { class: 'muted' }, 'Puedes comprar desde aquí cualquier vivienda libre de la ciudad. El precio sigue al índice inmobiliario de cada distrito (sube cuando se compra y baja cuando se vende).'),
    h('div', { class: 'row' }, h('button', { class: 'chip', onclick: () => ctx.net.send({ t: 'house', action: 'realty' } as any) }, 'Todas'),
      ...zones.map((z) => h('button', { class: 'chip', onclick: () => ctx.net.send({ t: 'house', action: 'realty', filter: z } as any) }, `${zn(z)} · ×${(v.index[z] ?? 1).toFixed(2)}`)),
      ...Object.keys(SIZE).map((sz) => h('button', { class: 'chip', style: { color: SIZE_COLOR[sz] }, onclick: () => ctx.net.send({ t: 'house', action: 'realty', filter: sz } as any) }, SIZE[sz]))),
    h('table', { class: 'sheet' }, h('tr', {}, h('th', {}, 'Vivienda'), h('th', {}, 'Distrito'), h('th', {}, 'Tipo'), h('th', {}, 'Precio'), h('th', {}, '')),
      ...v.houses.map((x) => h('tr', {}, h('td', {}, x.name), h('td', {}, x.zoneName), h('td', { style: { color: SIZE_COLOR[x.size] } }, SIZE[x.size]), h('td', { class: 'mono' }, fmtMoney(x.price)),
        h('td', {}, h('button', { class: 'btn small primary', disabled: ctx.money() < x.price, onclick: () => { ask(`¿Comprar ${x.name} por ${fmtMoney(x.price)}?`, () => { ctx.net.send({ t: 'house', action: 'buy', house: x.id, opId: newOpId() } as any); }); } }, 'Comprar'))))),
    v.houses.length ? null : h('p', { class: 'muted' }, 'No queda nada en venta con ese filtro.'));
}
export function stashPanel(ctx: PropCtx, v: StashView) {
  const row = (it: { def: string; name: string; qty: number }, dir: 'stashIn' | 'stashOut') => h('tr', {}, h('td', {}, it.name), h('td', { class: 'mono' }, `×${it.qty}`),
    h('td', {}, h('button', { class: 'btn small', onclick: () => ctx.net.send({ t: 'house', action: dir, house: v.house, item: it.def, qty: 1 } as any) }, dir === 'stashIn' ? 'Guardar 1' : 'Sacar 1'),
      it.qty > 1 ? h('button', { class: 'btn small', onclick: () => ctx.net.send({ t: 'house', action: dir, house: v.house, item: it.def, qty: it.qty } as any) }, 'Todo') : null));
  showPanel('stash-panel', `Alijo · ${v.name}`, h('p', { class: 'muted' }, 'Lo que guardes aquí no pesa ni te lo pueden robar en la calle. Si mueres o vendes la casa, se pierde.'),
    h('div', { class: 'grid2' },
      h('div', {}, h('h3', {}, 'En el alijo'), v.items.length ? h('table', { class: 'sheet' }, ...v.items.map((i) => row(i, 'stashOut'))) : h('p', { class: 'muted' }, 'Vacío.')),
      h('div', {}, h('h3', {}, 'En tu mochila'), h('table', { class: 'sheet' }, ...v.inventory.map((i) => row(i, 'stashIn'))))));
}

// ---------------------------------------------------------------- coches
export function dealerPanel(ctx: PropCtx, v: DealerView) {
  const cars = v.cars.map((c) => h('div', { class: 'fcard car', style: { borderTopColor: c.color } },
    h('div', { class: 'carpaint', style: { background: `linear-gradient(135deg, ${c.color}, #101018)` } }, h('span', {}, CLASS[c.class])),
    h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('b', {}, `${c.maker} ${c.name}`)),
    h('div', { class: 'small muted' }, c.desc),
    h('div', { class: 'carstats' }, cstat('Velocidad', c.speed / 5, `×${c.speed}`), cstat('Maletero', c.trunk / 400, `${c.trunk} kg`), cstat('Blindaje', c.armor / 7, String(c.armor)), cstat('Plazas', c.seats / 8, String(c.seats))),
    h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('b', { class: 'mono' }, fmtMoney(c.price)),
      h('button', { class: 'btn small primary', disabled: ctx.money() < c.price, onclick: () => { ask(`¿Comprar ${c.maker} ${c.name} por ${fmtMoney(c.price)}?`, () => { ctx.net.send({ t: 'car', action: 'buy', dealer: v.dealer, car: c.id, opId: newOpId() } as any); }); } }, 'Comprar'))));
  showPanel('dealer-panel', v.name, h('p', { class: 'muted' }, `${v.desc} Los precios siguen al índice de vehículos del mercado.`),
    v.owned.length ? h('p', {}, `Tu garaje: ${v.owned.map((o) => o.name).join(', ')}`) : null,
    h('div', { class: 'cards' }, ...cars));
}
const cstat = (k: string, f: number, v: string) => h('div', { class: 'cstat' }, h('span', { class: 'small muted' }, k), h('div', { class: 'xpbar thin' }, h('i', { style: { width: `${Math.min(100, f * 100)}%`, background: '#43f3ff' } })), h('span', { class: 'mono small' }, v));

export function propsPanel(ctx: PropCtx, v: PropsView) {
  const houses = v.houses.map((x) => h('div', { class: 'fcard', style: { borderTopColor: SIZE_COLOR[x.size] } },
    h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('b', {}, x.name), h('span', { class: 'chip' }, SIZE[x.size])),
    h('div', { class: 'small' }, `${x.zoneName} · pagaste ${fmtMoney(x.paid)} · vale ahora ${fmtMoney(Math.round(x.value / 0.7))}`),
    h('div', { class: 'small' }, h('b', {}, 'Pueden entrar: '), x.permits.length ? x.permits.map((n) => h('span', { class: 'chip' }, n, ' ', h('button', { class: 'linkbtn', title: 'Quitar permiso', onclick: () => ctx.net.send({ t: 'house', action: 'revoke', house: x.id, name: n } as any) }, '✕'))) : h('span', { class: 'muted' }, 'solo tú')),
    h('form', { class: 'row', onsubmit: (e: Event) => { e.preventDefault(); const i = (e.target as HTMLFormElement).querySelector('input')!; if (i.value.trim()) ctx.net.send({ t: 'house', action: 'permit', house: x.id, name: i.value.trim() } as any); i.value = ''; } },
      h('input', { placeholder: 'Nombre del personaje', maxLength: 20, style: { flex: '1' } }), h('button', { class: 'btn small', type: 'submit' }, 'Dar permiso')),
    h('button', { class: 'btn small danger', onclick: () => { ask(`¿Vender ${x.name} por ${fmtMoney(x.value)} (70 % del valor)? Lo que haya en el alijo se pierde.`, () => { ctx.net.send({ t: 'house', action: 'sell', house: x.id, opId: newOpId() } as any); }, { danger: true }); } }, `Vender (${fmtMoney(x.value)})`)));
  const cars = v.cars.map((c) => h('div', { class: 'fcard', style: { borderTopColor: content.cars.find((k) => k.id === c.car)?.color ?? '#43f3ff' } },
    h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('b', {}, c.name), h('span', { class: 'chip' }, CLASS[c.class])),
    h('div', { class: 'small' }, `Velocidad ×${c.speed} · vale ${fmtMoney(c.value)}`),
    h('div', { class: 'row' }, v.driving === c.id ? h('button', { class: 'btn small', onclick: () => ctx.net.send({ t: 'car', action: 'park' } as any) }, 'Aparcar') : h('button', { class: 'btn small primary', onclick: () => ctx.net.send({ t: 'car', action: 'drive', car: c.id } as any) }, 'Conducir'),
      h('button', { class: 'btn small danger', onclick: () => { ask(`¿Vender ${c.name} por ${fmtMoney(c.value)}?`, () => { ctx.net.send({ t: 'car', action: 'sell', car: c.id, opId: newOpId() } as any); }, { danger: true }); } }, 'Vender'))));
  showPanel('props-panel', 'Propiedades',
    h('h3', {}, `Viviendas (${v.houses.length})`), houses.length ? h('div', { class: 'cards' }, ...houses) : h('p', { class: 'muted' }, 'No tienes casa. Busca un «Portal» en cualquier edificio o visita la Inmobiliaria Kaiten (Colinas Doradas).'),
    h('h3', {}, `Vehículos (${v.cars.length})`), cars.length ? h('div', { class: 'cards' }, ...cars) : h('p', { class: 'muted' }, 'No tienes vehículo. Hay concesionarios en Ferro, Cénit, Colinas, Neón Rojo, Forja, El Arrabal y El Yermo.'));
}

// ---------------------------------------------------------------- mercado en tiempo real
let liveTab: 'indices' | 'precios' | 'vivienda' | 'coches' = 'indices';
export function marketLivePanel(ctx: PropCtx, v: MarketLiveView, onClose: () => void) {
  const tabs = h('div', { class: 'row' }, ...([['indices', 'Índices'], ['precios', 'Precios que más se mueven'], ['vivienda', 'Vivienda'], ['coches', 'Vehículos']] as const).map(([id, label]) =>
    h('button', { class: `chip${liveTab === id ? ' on' : ''}`, onclick: () => { liveTab = id; marketLivePanel(ctx, v, onClose); } }, label)));
  let body: HTMLElement;
  if (liveTab === 'indices') body = h('div', { class: 'cards' }, ...v.indices.map((i) => h('div', { class: 'fcard idx' },
    h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('b', {}, i.name), chg(i.change)), h('div', { class: 'row', style: { justifyContent: 'space-between', alignItems: 'flex-end' } }, h('span', { class: 'mono big' }, `×${i.value.toFixed(3)}`), spark(i.history)))));
  else if (liveTab === 'precios') body = h('table', { class: 'sheet' }, h('tr', {}, h('th', {}, 'Producto · tienda'), h('th', {}, 'Precio'), h('th', {}, 'Base'), h('th', {}, 'Cambio'), h('th', {}, 'Evolución')),
    ...v.items.map((i) => h('tr', {}, h('td', {}, i.name), h('td', { class: 'mono' }, fmtMoney(Math.round(i.price))), h('td', { class: 'mono muted' }, fmtMoney(i.base)), h('td', {}, chg(i.change)), h('td', {}, spark(i.history, 100, 22)))));
  else if (liveTab === 'vivienda') body = h('table', { class: 'sheet' }, h('tr', {}, h('th', {}, 'Distrito'), h('th', {}, 'Índice'), h('th', {}, 'En venta'), h('th', {}, 'Desde')),
    ...v.housing.map((x) => h('tr', {}, h('td', {}, x.name), h('td', { class: 'mono' }, `×${x.index.toFixed(3)}`), h('td', { class: 'mono' }, String(x.forSale)), h('td', { class: 'mono' }, x.cheapest ? fmtMoney(x.cheapest) : '—'))));
  else body = h('table', { class: 'sheet' }, h('tr', {}, h('th', {}, 'Modelo'), h('th', {}, 'Clase'), h('th', {}, 'Precio de referencia')),
    ...v.cars.map((x) => h('tr', {}, h('td', {}, x.name), h('td', {}, CLASS[x.class]), h('td', { class: 'mono' }, fmtMoney(x.price)))));
  const p = showPanel('market-live-panel', '📈 Mercado en tiempo real',
    h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('span', { class: 'muted small' }, `Actualizado ${new Date(v.at).toLocaleTimeString('es-ES')} · se refresca solo cada 2 s`), h('span', { class: 'live-dot' }, '● EN VIVO')),
    tabs, body,
    h('h3', {}, 'Últimas operaciones y decisiones corporativas'), h('ul', { class: 'ticker' }, ...v.trades.map((t) => h('li', {}, h('span', { class: 'mono muted' }, new Date(t.at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })), ' ', t.text))));
  p.querySelector('.close')?.addEventListener('click', onClose);
}

// ---------------------------------------------------------------- análisis de objetivos
export function scanCard(v: ScanView) {
  document.getElementById('scan-card')?.remove();
  const pct = (a: number, b: number) => `${Math.max(0, Math.min(100, (100 * a) / Math.max(1, b)))}%`;
  const threatCol = v.threat === 'Muy peligroso' ? '#ff3040' : v.threat === 'Peligroso' ? '#ff8a3d' : v.threat === 'Inofensivo' ? '#5affc8' : '#ffd23f';
  const card = h('div', { class: 'scan', id: 'scan-card', style: { borderColor: v.factionColor ?? '#43f3ff' } },
    h('div', { class: 'scan-head' }, h('div', {}, h('div', { class: 'scan-kicker' }, v.deep ? 'ANÁLISIS PROFUNDO' : 'ESCANEO'), h('b', {}, v.name), h('div', { class: 'small muted' }, v.title)),
      h('div', { class: 'scan-lv' }, h('span', {}, 'NV'), h('b', {}, String(v.level))), h('button', { class: 'btn small', onclick: () => card.remove() }, '✕')),
    h('div', { class: 'row small', style: { justifyContent: 'space-between' } }, h('span', { style: { color: threatCol } }, `▲ ${v.threat}`), v.faction ? h('span', { style: { color: v.factionColor } }, v.faction) : null, v.bounty ? h('span', { class: 'netbad' }, `Recompensa ${fmtMoney(v.bounty)}`) : null),
    h('div', { class: 'small' }, `Salud ${v.hp}/${v.hpMax}`), h('div', { class: 'bar' }, h('i', { style: { width: pct(v.hp, v.hpMax), background: '#ff3040' } })),
    v.attributes ? h('div', { class: 'scan-attrs' }, ...Object.entries(v.attributes).map(([k, n]) => h('div', {}, h('span', { class: 'muted small' }, k), h('div', { class: 'xpbar thin' }, h('i', { style: { width: `${n * 10}%`, background: '#43f3ff' } })), h('b', { class: 'mono small' }, String(n))))) : null,
    v.skills ? h('div', { class: 'small' }, h('b', {}, 'Habilidades: '), v.skills.map((s) => `${s.name} ${s.level}`).join(' · ')) : null,
    v.weapon ? h('div', { class: 'small' }, h('b', {}, 'Arma: '), v.weapon, v.armor !== undefined ? ` · blindaje ${v.armor}` : '') : null,
    v.chrome?.length ? h('div', { class: 'small' }, h('b', {}, 'Cromo: '), v.chrome.join(', ')) : null,
    v.money ? h('div', { class: 'small muted' }, `Lleva ${v.money}${v.wanted ? ` · búsqueda ${v.wanted}` : ''}`) : null,
    v.rep !== undefined ? h('div', { class: 'small muted' }, `Tu relación con su facción: ${v.rep}`) : null,
    v.deep ? null : h('div', { class: 'small muted' }, 'Con Interfaz 6 y «Análisis profundo» verás atributos, habilidades y cromo.'));
  $ui().append(card);
  blip('step');
}

/** Alguien llama al timbre de una de tus casas. */
export function ringPrompt(ctx: PropCtx, house: string, houseName: string, from: string, fromId: number) {
  const box = h('div', { class: 'ring' }, h('b', {}, '🔔 Timbre'), h('p', {}, `${from} llama a tu puerta (${houseName}).`),
    h('div', { class: 'row' },
      h('button', { class: 'btn small primary', onclick: () => { ctx.net.send({ t: 'house', action: 'answer', house, who: fromId, allow: true } as any); box.remove(); } }, 'Abrir'),
      h('button', { class: 'btn small', onclick: () => { ctx.net.send({ t: 'house', action: 'answer', house, who: fromId, allow: false } as any); box.remove(); } }, 'No abrir')));
  $ui().append(box);
  setTimeout(() => box.remove(), 30000);
  blip('good');
}
