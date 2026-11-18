// v0.7 · Panel del cuerpo: silueta fija y pequeña con el estado de cada zona.
// v0.18 · «Cada tiro cuenta»: ventana de salud al estilo de los juegos de supervivencia. A la izquierda, la silueta con
// cada zona coloreada por su peor herida, las vendas dibujadas encima y gotas donde sangra. A la derecha, el estado
// general, el dolor y la lista de heridas por zona (tipo, si sangra, bala alojada, vendada, infectada y cuánto le
// queda para curar). Clic (o clic derecho) en una herida: menú de tratamiento con lo que lleves encima.
import { PART_NAMES, TREATMENTS, WOUND_INFO, treatmentsFor, woundStatus, type CharacterSheet, type TreatmentId, type Wound } from '@vertice/shared';
import { newOpId, type Net } from '../net';
import { $ui, h } from './dom';

const SVGNS = 'http://www.w3.org/2000/svg';
/** Silueta de frente (la derecha del personaje queda a la izquierda de la imagen). */
const RIGHT: Record<string, string> = {
  brazo_der: 'M34 50 Q25 53 23 64 L17 106 L28 108 L35 70 L38 58 Z',
  mano_der: 'M17 108 L28 110 L28 122 Q26 131 19 130 Q14 126 15 118 Z',
  pierna_der: 'M40 121 L59 121 L58 150 L57 178 L57 228 L60 236 L44 237 L45 226 L42 178 L40 150 Z',
};
const mirror = (d: string) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_m, x, y) => `${120 - Number(x)} ${y}`);
const SHAPES: Record<string, string> = {
  cabeza: 'M60 4 Q74 4 74 21 Q74 33 66 37 L54 37 Q46 33 46 21 Q46 4 60 4 Z',
  torso: 'M53 37 L67 37 L69 42 Q83 44 86 52 L81 92 Q79 106 80 121 L40 121 Q41 106 39 92 L34 52 Q37 44 51 42 Z',
  ...RIGHT,
  brazo_izq: mirror(RIGHT.brazo_der), mano_izq: mirror(RIGHT.mano_der), pierna_izq: mirror(RIGHT.pierna_der),
};
const CENTER: Record<string, [number, number]> = {
  cabeza: [60, 20], torso: [60, 80], brazo_der: [27, 82], brazo_izq: [93, 82], mano_der: [22, 120], mano_izq: [98, 120], pierna_der: [50, 180], pierna_izq: [70, 180],
};
const ORDER = ['cabeza', 'torso', 'brazo_der', 'brazo_izq', 'mano_der', 'mano_izq', 'pierna_der', 'pierna_izq'];
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const SEVERITY: Record<Wound['kind'], number> = { contusion: 1, rasguno: 1, quemadura: 2, corte: 2, bala: 3, 'corte-profundo': 3, amputacion: 4 };

type Level = 'sana' | 'leve' | 'herida' | 'critica' | 'infectada' | 'perdida' | 'cromo' | 'averiado';
/** Estado de una zona: para colorearla y explicarla. */
export function partState(s: CharacterSheet, id: string): { color: string; label: string; level: Level; bandaged: boolean; bleeding: boolean } {
  const list = (s.body.list ?? []).filter((w) => w.part === id);
  const bandaged = list.some((w) => w.bandaged && w.kind !== 'amputacion');
  const bleeding = list.some((w) => w.bleed > 0.01);
  if (s.body.lost.includes(id)) return { color: '#3a0710', label: 'Amputado: un matasanos tiene que implantarte el miembro', level: 'perdida', bandaged: list.some((w) => w.bandaged), bleeding };
  if (s.body.chrome?.includes(id)) {
    const w = s.body.wounds[id] ?? 0;
    if (s.body.broken?.includes(id)) return { color: '#ff3040', label: `Cromo averiado (${w}): repáralo en un matasanos`, level: 'averiado', bandaged: false, bleeding: false };
    return w > 0 ? { color: '#ff9a30', label: `Cromo dañado (${w}): no sangra`, level: 'cromo', bandaged: false, bleeding: false } : { color: '#43f3ff', label: 'Cromo en buen estado', level: 'cromo', bandaged: false, bleeding: false };
  }
  if (!list.length) return { color: '#5aff8a', label: 'Sana', level: 'sana', bandaged, bleeding };
  const worst = Math.max(...list.map((w) => SEVERITY[w.kind]));
  const names = list.map((w) => WOUND_INFO[w.kind].name.toLowerCase()).join(', ');
  if (list.some((w) => w.infection >= 0.5)) return { color: '#9bd13a', label: `Infectada: ${names}`, level: 'infectada', bandaged, bleeding };
  if (worst >= 3 || bleeding && !bandaged && list.some((w) => w.bleed >= 0.2)) return { color: '#ff3040', label: cap(names), level: 'critica', bandaged, bleeding };
  if (worst >= 2) return { color: '#ff8a30', label: cap(names), level: 'herida', bandaged, bleeding };
  return { color: '#ffd23f', label: cap(names), level: 'leve', bandaged, bleeding };
}

function silhouette(cls: string, onPart: (id: string) => void) {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 120 240');
  svg.setAttribute('class', cls);
  const defs = document.createElementNS(SVGNS, 'defs');
  defs.innerHTML = `<pattern id="${cls}-venda" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="5" height="5" fill="#f2efe6"/><line x1="0" y1="0" x2="0" y2="5" stroke="#c9c2b0" stroke-width="1.6"/></pattern>`;
  svg.append(defs);
  for (const id of ORDER) {
    const g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('data-part', id);
    const path = document.createElementNS(SVGNS, 'path');
    path.setAttribute('d', SHAPES[id]);
    path.setAttribute('class', 'bp-part');
    path.setAttribute('tabindex', '0');
    path.setAttribute('role', 'button');
    path.addEventListener('click', (ev) => { ev.stopPropagation(); onPart(id); });
    path.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') onPart(id); });
    const title = document.createElementNS(SVGNS, 'title'); path.append(title);
    // Venda: la misma forma con trama de gasa, un poco recogida (no tapa toda la zona).
    const band = document.createElementNS(SVGNS, 'path');
    band.setAttribute('d', SHAPES[id]);
    band.setAttribute('class', 'bp-band');
    band.setAttribute('fill', `url(#${cls}-venda)`);
    const [cx, cy] = CENTER[id];
    band.setAttribute('transform', `translate(${cx} ${cy}) scale(${id === 'torso' ? '0.92 0.38' : id === 'cabeza' ? '1.02 0.3' : id.startsWith('pierna') ? '0.98 0.18' : id.startsWith('mano') ? '1.05 0.6' : '1.02 0.3'}) translate(${-cx} ${-cy})`);
    const drop = document.createElementNS(SVGNS, 'path');
    drop.setAttribute('d', `M${cx + 8} ${cy + 4} q-3.5 5 0 7.5 q3.5 -2.5 0 -7.5 Z`);
    drop.setAttribute('class', 'bp-drop');
    g.append(path, band, drop);
    svg.append(g);
  }
  return svg;
}
function paint(svg: SVGSVGElement, s: CharacterSheet, selected?: string | null) {
  for (const g of svg.querySelectorAll('g[data-part]')) {
    const id = g.getAttribute('data-part')!;
    const st = partState(s, id);
    const path = g.querySelector('.bp-part') as SVGPathElement;
    path.setAttribute('fill', st.color);
    path.setAttribute('fill-opacity', st.level === 'perdida' ? '0.3' : st.level === 'sana' ? '0.55' : '0.9');
    path.setAttribute('class', `bp-part lv-${st.level}${selected === id ? ' sel' : ''}`);
    path.querySelector('title')!.textContent = `${cap(PART_NAMES[id as keyof typeof PART_NAMES])}: ${st.label}`;
    (g.querySelector('.bp-band') as SVGElement).style.display = st.bandaged ? '' : 'none';
    (g.querySelector('.bp-drop') as SVGElement).style.display = st.bleeding ? '' : 'none';
  }
}
const bar = (frac: number, color: string, label: string) =>
  h('div', { class: 'hp-bar', title: label }, h('div', { class: 'hp-fill', style: { width: `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`, background: color } }), h('span', {}, label));
function overall(s: CharacterSheet) {
  const f = s.hp / Math.max(1, s.hpMax);
  return f >= 0.9 ? 'Bien' : f >= 0.7 ? 'Algo tocado' : f >= 0.45 ? 'Herido' : f >= 0.2 ? 'Grave' : 'Crítico';
}
function remaining(w: Wound) {
  if (w.kind === 'amputacion') return 'no cura: implante en un matasanos';
  const h0 = Math.max(0, (1 - w.heal) * w.hours);
  const blocked = w.bullet ? 'no cura con la bala dentro' : w.kind === 'corte-profundo' && !w.sutured ? 'no cierra sin sutura' : w.infection >= 0.5 ? 'no cura infectada' : !w.bandaged && w.kind !== 'rasguno' && w.kind !== 'contusion' ? 'sin vendar no cura' : '';
  if (blocked) return blocked;
  return h0 >= 24 ? `≈ ${Math.ceil(h0 / 24)} día${h0 >= 48 ? 's' : ''} de juego` : `≈ ${Math.ceil(h0)} h de juego`;
}

export class BodyPanel {
  readonly el = h('div', { class: 'hud body-panel', role: 'region', 'aria-label': 'Estado del cuerpo' });
  private svg: SVGSVGElement;
  private bleed = h('div', { class: 'bp-bleed' });
  private win: HTMLElement | null = null;
  private winSvg: SVGSVGElement | null = null;
  private winBody: HTMLElement | null = null;
  private menu: HTMLElement | null = null;
  private selected: string | null = null;
  private last: CharacterSheet | null = null;
  constructor(private net: Net, private toast: (t: string, k?: 'info' | 'good' | 'warn' | 'bad') => void, keyLabel: () => string) {
    this.svg = silhouette('bp-svg', (id) => { this.selected = id; this.open(); });
    this.el.append(h('div', { class: 'bp-head' }, h('span', {}, 'SALUD'), h('span', { class: 'bp-key', title: 'Abrir la ventana de salud' }, keyLabel())), this.svg, this.bleed);
    this.el.addEventListener('click', () => this.open());
    document.addEventListener('pointerdown', (ev) => { if (this.menu && !this.menu.contains(ev.target as Node)) this.closeMenu(); });
  }
  get visible() { this.sync(); return !!this.win; }
  /** Si otra parte del HUD cerró la ventana (Esc), se olvida. */
  private sync() { if (this.win && !this.win.isConnected) { this.win = null; this.winSvg = null; this.winBody = null; } }
  /** La tecla de salud (H) abre o cierra la ventana; la silueta pequeña se queda siempre en el HUD. */
  toggle(on = !this.visible) { if (on) this.open(); else this.close(); }
  update(s: CharacterSheet) {
    this.last = s;
    paint(this.svg, s);
    const list = s.body.list ?? [];
    this.bleed.textContent = s.body.bleed > 0.01 ? `🩸 −${s.body.bleed.toFixed(2)}/s` : list.some((w) => w.infection >= 0.5) ? '☣ infección' : list.length ? `${list.length} herida${list.length === 1 ? '' : 's'}` : '';
    this.el.classList.toggle('bleeding', s.body.bleed > 0.01);
    this.sync();
    if (this.win) this.render();
  }
  private close() { this.closeMenu(); this.win?.remove(); this.win = null; this.winSvg = null; this.winBody = null; }
  private open() {
    if (!this.last) return;
    this.sync();
    if (!this.win) {
      this.winSvg = silhouette('hp-svg', (id) => { this.selected = this.selected === id ? null : id; this.render(); });
      this.winBody = h('div', { class: 'hp-side' });
      this.win = h('div', { class: 'panel health-panel', id: 'panel-health', role: 'dialog', 'aria-label': 'Salud' },
        h('div', { class: 'panel-head' }, h('h2', {}, 'Salud'), h('button', { class: 'btn small close', onclick: () => this.close() }, 'Cerrar ✕')),
        h('div', { class: 'hp-grid' }, h('div', { class: 'hp-fig' }, this.winSvg, h('div', { class: 'small muted' }, 'Clic en una zona para ver sus heridas')), this.winBody));
      $ui().append(this.win);
    }
    this.render();
  }
  private count(item: string) { return this.last?.inventory.find((i) => i.def === item)?.qty ?? 0; }
  private render() {
    const s = this.last;
    if (!s || !this.win || !this.winSvg || !this.winBody) return;
    paint(this.winSvg, s, this.selected);
    const list = s.body.list ?? [];
    const pain = s.body.pain ?? 0;
    const temp = s.body.tempHp ?? 0;
    const parts = ORDER.filter((p) => (!this.selected || this.selected === p) && (list.some((w) => w.part === p) || s.body.lost.includes(p) || (s.body.chrome?.includes(p) && (s.body.wounds[p] ?? 0) > 0)));
    const infected = list.some((w) => w.infection >= 0.5);
    const rows: Node[] = [];
    for (const p of parts) {
      const st = partState(s, p);
      rows.push(h('div', { class: 'hp-part-head' }, h('b', { style: { color: st.color } }, cap(PART_NAMES[p as keyof typeof PART_NAMES])), h('span', { class: 'small muted' }, st.level === 'cromo' || st.level === 'averiado' ? st.label : '')));
      for (const w of list.filter((x) => x.part === p)) rows.push(this.woundRow(w));
    }
    const actions: Node[] = [];
    if (infected) actions.push(h('button', { class: 'btn small', disabled: this.count('antibioticos') < 1, onclick: () => this.useItem('antibioticos') }, `💊 Antibióticos ×${this.count('antibioticos')}`));
    if (list.some((w) => w.bleed > 0.01)) actions.push(h('button', { class: 'btn small', disabled: this.count('estabilizador') < 1, title: 'Corta la hemorragia de todas las heridas a la vez', onclick: () => this.useItem('estabilizador') }, `🩹 Estabilizador ×${this.count('estabilizador')}`));
    actions.push(h('button', { class: 'btn small', disabled: this.count('estim') < 1, title: 'No cura: da salud durante unos minutos', onclick: () => this.useItem('estim') }, `💉 Estimulante ×${this.count('estim')}`));
    this.winBody.replaceChildren(
      h('div', { class: 'hp-stat' }, h('span', {}, 'Estado general'), h('b', {}, overall(s))),
      bar(s.hp / Math.max(1, s.hpMax), s.hp / s.hpMax < 0.3 ? '#ff3040' : '#5aff8a', `Salud ${Math.round(s.hp)}/${s.hpMax}${temp ? ` (+${temp} temporal, ${s.body.tempHpS ?? 0} s)` : ''}`),
      h('div', { class: 'hp-stat' }, h('span', {}, 'Dolor'), h('b', {}, pain >= 70 ? 'Insoportable' : pain >= 40 ? 'Fuerte' : pain >= 15 ? 'Moderado' : pain > 0 ? 'Leve' : 'Ninguno')),
      bar(pain / 100, '#ff8a30', `${pain} %`),
      h('div', { class: 'hp-stat' }, h('span', {}, 'Hemorragia'), h('b', { style: { color: s.body.bleed > 0.01 ? '#ff3040' : '' } }, s.body.bleed > 0.01 ? `−${s.body.bleed.toFixed(2)} salud/s` : 'No')),
      h('div', { class: 'small muted hp-note' }, list.length ? 'La salud no se recupera sola: cura las heridas y luego descansa (dormir) para recuperarla.' : s.hp < s.hpMax ? 'Sin heridas: duerme para recuperar la salud.' : 'Sin heridas.'),
      h('div', { class: 'row hp-actions' }, ...actions),
      h('h3', {}, this.selected ? `Heridas · ${PART_NAMES[this.selected as keyof typeof PART_NAMES]}` : 'Heridas'),
      rows.length ? h('div', { class: 'hp-list' }, ...rows) : h('div', { class: 'small muted' }, this.selected ? 'Esta zona está sana.' : 'No tienes heridas.'),
      h('div', { class: 'small muted hp-note' }, 'Clic derecho (o clic) en una herida: menú de tratamiento. Vendas, sutura, desinfectante y antibióticos en la farmacia; las pinzas no se gastan.'));
  }
  private woundRow(w: Wound) {
    const status = woundStatus(w);
    const healing = w.kind !== 'amputacion';
    const row = h('div', { class: `hp-wound${w.infection >= 0.5 ? ' inf' : ''}${w.bleed > 0.01 ? ' bleed' : ''}`, tabindex: 0, role: 'button' },
      h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('b', {}, WOUND_INFO[w.kind].name), h('span', { class: 'small' }, status.join(' · ') || (w.kind === 'contusion' ? 'cura sola' : ''))),
      healing ? bar(w.heal, '#43f3ff', `Curación ${Math.round(w.heal * 100)} % · ${remaining(w)}`) : h('div', { class: 'small', style: { color: '#ff3040' } }, remaining(w)),
      w.infection >= 0.05 ? bar(w.infection, '#9bd13a', `Infección ${Math.round(w.infection * 100)} %`) : null,
      h('div', { class: 'row hp-treat' }, ...treatmentsFor(w).map((t) => this.treatBtn(w, t))));
    const menu = (ev: MouseEvent) => { ev.preventDefault(); ev.stopPropagation(); this.openMenu(w, ev.clientX, ev.clientY); };
    row.addEventListener('contextmenu', menu);
    row.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { const r = row.getBoundingClientRect(); this.openMenu(w, r.left + 20, r.top + 20); } });
    return row;
  }
  private treatBtn(w: Wound, t: TreatmentId) {
    const item = TREATMENTS[t].item, n = this.count(item);
    return h('button', { class: 'btn small', disabled: n < 1, title: n < 1 ? `Necesitas ${item}` : '', onclick: (ev: Event) => { ev.stopPropagation(); this.treat(w, t); } }, `${TREATMENTS[t].label}${item === 'pinzas' ? '' : ` ×${n}`}`);
  }
  private openMenu(w: Wound, x: number, y: number) {
    this.closeMenu();
    const opts = treatmentsFor(w);
    const m = h('div', { class: 'bp-pop hp-menu' }, h('b', {}, `${WOUND_INFO[w.kind].name} · ${PART_NAMES[w.part]}`), h('div', { class: 'small muted' }, WOUND_INFO[w.kind].needs),
      ...(opts.length ? opts.map((t) => this.treatBtn(w, t)) : [h('div', { class: 'small muted' }, w.kind === 'contusion' ? 'No necesita tratamiento.' : 'Nada más que hacer: deja que cure.')]));
    m.style.left = `${Math.min(x, innerWidth - 200)}px`; m.style.top = `${Math.min(y, innerHeight - 180)}px`;
    $ui().append(m);
    this.menu = m;
  }
  private closeMenu() { this.menu?.remove(); this.menu = null; }
  private treat(w: Wound, action: TreatmentId) {
    this.closeMenu();
    this.net.send({ t: 'treat', wound: w.id, action, opId: newOpId() } as any);
  }
  private useItem(item: string) {
    if (this.count(item) < 1) { this.toast('No te quedan.', 'warn'); return; }
    this.net.send({ t: 'useItem', item, opId: newOpId() } as any);
  }
}
