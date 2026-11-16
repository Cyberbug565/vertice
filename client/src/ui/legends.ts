// v0.8 · Panel de una leyenda (confianza, encargo actual y recompensa) y menú de trucos de la cuenta de pruebas.
import type { LegendView } from '@vertice/shared';
import type { Net } from '../net';
import { $ui, h } from './dom';
import { showPanel } from './life';

export function legendPanel(net: Net, v: LegendView) {
  const bar = h('div', { class: 'xpbar' }, h('i', { style: { width: `${v.trust}%`, background: v.color } }));
  showPanel('legend-panel', v.name,
    h('div', { class: 'legend-head', style: { borderColor: v.color } },
      h('div', { class: 'mono small', style: { color: v.color } }, `${v.role.toUpperCase()} · LEYENDA DE VÉRTICE`),
      h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('span', {}, 'Confianza'), h('b', { class: 'mono' }, `${v.trust}/100`)), bar,
      h('div', { class: 'small muted' }, `Encargo ${Math.min(v.step + 1, v.steps)} de ${v.steps} · Al final: ${v.final}`)),
    v.done ? h('p', { style: { color: v.color } }, '★ Has terminado todos sus encargos. Te considera de los suyos.')
      : v.mission ? h('div', { class: 'fcard', style: { borderTopColor: v.color } },
        h('h3', { style: { color: v.color, margin: '0 0 4px' } }, v.mission.title),
        h('p', {}, v.mission.desc),
        v.active ? h('div', { class: 'mono' }, `Progreso: ${v.mission.progress}`) : null,
        h('div', { class: 'small' }, `Recompensa: ${v.reward}`),
        v.active ? h('span', { class: 'chip' }, 'En curso') : h('button', { class: 'btn primary', onclick: () => net.send({ t: 'legend', legend: v.id, action: 'accept' } as any) }, 'Aceptar el encargo')) : null);
}

/** Menú de trucos (cuenta de pruebas): dinero, nivel, curar, dios, objetos, PNJ, jefes, viajes, hora y ciberpsicosis. */
export function cheatPanel(net: Net, info: { items: { id: string; name: string; kind: string }[]; npcs: string[]; places: { id: string; name: string }[] }) {
  const cmd = (c: string, arg?: string, n?: number) => net.send({ t: 'cheat', cmd: c, arg, n } as any);
  const b = (label: string, fn: () => void, cls = '') => h('button', { class: `btn small ${cls}`, onclick: fn }, label);
  const filter = h('input', { type: 'search', placeholder: 'Buscar objeto o implante…', 'aria-label': 'Buscar objeto' }) as HTMLInputElement;
  const qty = h('input', { type: 'number', value: '1', min: '1', max: '999', style: { width: '5em' }, 'aria-label': 'Cantidad' }) as HTMLInputElement;
  const list = h('div', { class: 'cheat-list' });
  const renderList = () => {
    const q = filter.value.trim().toLowerCase();
    list.replaceChildren(...info.items.filter((i) => !q || i.name.toLowerCase().includes(q) || i.id.includes(q)).slice(0, 60).map((i) =>
      h('div', { class: 'cheat-row' }, h('span', {}, i.name, h('small', { class: 'muted' }, ` · ${i.kind}`)),
        i.id.startsWith('cyber:') ? h('span', {}, b('Dar', () => cmd('item', i.id)), b('Instalar', () => cmd('item', `install:${i.id.slice(6)}`))) : b('Dar', () => cmd('item', i.id, Number(qty.value) || 1)))));
  };
  filter.addEventListener('input', renderList);
  filter.addEventListener('keydown', (e) => e.stopPropagation());
  renderList();
  const npcSel = h('select', { 'aria-label': 'PNJ' }, ...info.npcs.map((n) => h('option', { value: n }, n))) as HTMLSelectElement;
  const placeSel = h('select', { 'aria-label': 'Lugar' }, ...info.places.map((p) => h('option', { value: p.id }, p.name))) as HTMLSelectElement;
  const num = h('input', { type: 'number', value: '12', style: { width: '5em' }, 'aria-label': 'Valor' }) as HTMLInputElement;
  showPanel('cheat-panel', '🛠 Menú de trucos',
    h('p', { class: 'muted small' }, 'Cuenta de pruebas. Nada de esto existe para los jugadores normales.'),
    h('div', { class: 'row' }, b('Desbloquear todo', () => cmd('unlock'), 'primary'), b('+100.000 €$', () => cmd('money', undefined, 100000)), b('Nivel máximo', () => cmd('level', undefined, 30)), b('Habilidades 25', () => cmd('skills')),
      b('Curar todo', () => cmd('heal')), b('Modo dios', () => cmd('god')), b('RAM al máximo', () => cmd('ram')), b('Limpiar búsqueda', () => cmd('wanted')), b('Matar a los de alrededor', () => cmd('killall'), 'danger')),
    h('h3', {}, 'Aparecer PNJ'), h('div', { class: 'row' }, npcSel, b('Aparecer', () => cmd('spawn', npcSel.value))),
    h('h3', {}, 'Viajar'), h('div', { class: 'row' }, placeSel, b('Ir', () => cmd('tp', placeSel.value))),
    h('h3', {}, 'Leyendas (activar el encargo final)'), h('div', { class: 'row' }, b('Iris', () => cmd('legend', 'iris')), b('Sable', () => cmd('legend', 'sable')), b('Teo', () => cmd('legend', 'teo'))),
    h('h3', {}, 'Hora y ciberpsicosis'), h('div', { class: 'row' }, num, b('Poner hora', () => cmd('hour', undefined, Number(num.value))), b('Ciberpsicosis = valor', () => cmd('psyche', undefined, Number(num.value))), b('Forzar episodio', () => cmd('episode', undefined, Math.max(45, Number(num.value))))),
    h('h3', {}, 'Objetos e implantes'), h('div', { class: 'row' }, filter, qty), list);
  void $ui;
}
