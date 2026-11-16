// v0.7 · Panel del cuerpo: silueta fija y pequeña con el estado de cada zona.
// Verde: sana · amarillo: herida · rojo: crítica · granate tachado: perdida · cian: cromo (naranja si está dañado).
// Clic en una zona herida: curarla con lo que lleves (vendas, estimulantes, estabilizador o analgésicos).
import type { CharacterSheet } from '@vertice/shared';
import { newOpId, type Net } from '../net';
import { $ui, h } from './dom';

const SVGNS = 'http://www.w3.org/2000/svg';
const PARTS: { id: string; name: string; shape: string }[] = [
  { id: 'cabeza', name: 'Cabeza', shape: 'M50 6 a11 12 0 1 1 -0.1 0 Z' },
  { id: 'torso', name: 'Torso', shape: 'M36 31 h28 l3 40 h-34 Z' },
  { id: 'brazo_izq', name: 'Brazo izquierdo', shape: 'M25 32 h10 l-2 32 h-10 Z' },
  { id: 'brazo_der', name: 'Brazo derecho', shape: 'M65 32 h10 l2 32 h-10 Z' },
  { id: 'mano_izq', name: 'Mano izquierda', shape: 'M22 66 h10 v9 h-10 Z' },
  { id: 'mano_der', name: 'Mano derecha', shape: 'M68 66 h10 v9 h-10 Z' },
  { id: 'pierna_izq', name: 'Pierna izquierda', shape: 'M34 73 h14 l-1 45 h-12 Z' },
  { id: 'pierna_der', name: 'Pierna derecha', shape: 'M52 73 h14 l1 45 h-12 Z' },
];
const CURES: Record<string, string> = { venda: 'Venda', estim: 'Estimulante', estabilizador: 'Estabilizador', analgesicos: 'Analgésicos' };

/** Estado de una zona: para colorearla y explicarla. */
export function partState(s: CharacterSheet, id: string): { color: string; label: string; level: 'sana' | 'herida' | 'critica' | 'perdida' | 'cromo' | 'averiado' } {
  const w = s.body.wounds[id] ?? 0;
  if (s.body.lost.includes(id)) return { color: '#4a0410', label: 'Perdido: prótesis en un matasanos', level: 'perdida' };
  if (s.body.chrome?.includes(id)) {
    if (s.body.broken?.includes(id)) return { color: '#ff3040', label: `Cromo averiado (${w}): repáralo en un matasanos`, level: 'averiado' };
    return w > 0 ? { color: '#ff9a30', label: `Cromo dañado (${w}): no sangra`, level: 'cromo' } : { color: '#43f3ff', label: 'Cromo en buen estado', level: 'cromo' };
  }
  const critical = id === 'cabeza' || id === 'torso' ? 14 : 20;
  if (w >= critical) return { color: '#ff3040', label: `Herida crítica (${w})`, level: 'critica' };
  if (w > 0) return { color: '#ffd23f', label: `Herida (${w})`, level: 'herida' };
  return { color: '#5aff8a', label: 'Sana', level: 'sana' };
}

export class BodyPanel {
  readonly el = h('div', { class: 'hud body-panel', role: 'region', 'aria-label': 'Estado del cuerpo' });
  private svg = document.createElementNS(SVGNS, 'svg');
  private bleed = h('div', { class: 'bp-bleed' });
  private pop: HTMLElement | null = null;
  private last: CharacterSheet | null = null;
  constructor(private net: Net, private toast: (t: string, k?: 'info' | 'good' | 'warn' | 'bad') => void, keyLabel: () => string) {
    this.svg.setAttribute('viewBox', '0 0 100 122');
    this.svg.setAttribute('class', 'bp-svg');
    for (const p of PARTS) {
      const path = document.createElementNS(SVGNS, 'path');
      path.setAttribute('d', p.shape);
      path.setAttribute('data-part', p.id);
      path.setAttribute('tabindex', '0');
      path.setAttribute('role', 'button');
      path.addEventListener('click', (ev) => { ev.stopPropagation(); this.openPop(p.id, p.name); });
      path.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') this.openPop(p.id, p.name); });
      const title = document.createElementNS(SVGNS, 'title'); path.append(title);
      this.svg.append(path);
    }
    this.el.append(h('div', { class: 'bp-head' }, h('span', {}, 'CUERPO'), h('span', { class: 'bp-key', title: 'Mostrar u ocultar' }, keyLabel())), this.svg, this.bleed);
    document.addEventListener('pointerdown', (ev) => { if (this.pop && !this.pop.contains(ev.target as Node)) this.closePop(); });
  }
  get visible() { return this.el.style.display !== 'none'; }
  toggle(on = !this.visible) { this.el.style.display = on ? '' : 'none'; try { localStorage.setItem('vertice.bodyPanel', on ? '1' : '0'); } catch {} }
  update(s: CharacterSheet) {
    this.last = s;
    for (const path of this.svg.querySelectorAll('path')) {
      const id = path.getAttribute('data-part')!;
      const st = partState(s, id);
      path.setAttribute('fill', st.color);
      path.setAttribute('fill-opacity', st.level === 'perdida' ? '0.35' : '0.85');
      path.setAttribute('class', `bp-part lv-${st.level}`);
      path.querySelector('title')!.textContent = `${PARTS.find((p) => p.id === id)!.name}: ${st.label}`;
    }
    this.bleed.textContent = s.body.bleed > 0.05 ? `🩸 −${s.body.bleed.toFixed(1)}/s` : '';
    if (this.pop) { const id = this.pop.dataset.part!; this.openPop(id, PARTS.find((p) => p.id === id)!.name); }
  }
  private closePop() { this.pop?.remove(); this.pop = null; }
  private openPop(id: string, name: string) {
    const s = this.last;
    if (!s) return;
    this.closePop();
    const st = partState(s, id);
    const cures = s.inventory.filter((i) => CURES[i.def] && i.qty > 0);
    const canHeal = st.level === 'herida' || st.level === 'critica' || (s.body.bleed > 0.05 && st.level === 'sana');
    const pop = h('div', { class: 'bp-pop', 'data-part': id },
      h('b', {}, name), h('div', { class: 'small', style: { color: st.color } }, st.label),
      ...(canHeal ? (cures.length ? cures.map((c) => h('button', { class: 'btn small', onclick: () => { this.net.send({ t: 'treat', part: id, item: c.def, opId: newOpId() } as any); this.closePop(); } }, `${CURES[c.def]} ×${c.qty}`))
        : [h('div', { class: 'small muted' }, 'No llevas vendas ni medicinas. Cómpralas en una farmacia.')])
        : st.level === 'averiado' || (st.level === 'cromo' && (s.body.wounds[id] ?? 0) > 0) ? [h('div', { class: 'small muted' }, 'El cromo no se venda: lo repara un matasanos.')]
        : st.level === 'perdida' ? [h('div', { class: 'small muted' }, 'Un matasanos puede implantarte una prótesis.')] : [h('div', { class: 'small muted' }, 'Nada que curar.')]));
    // Fuera del panel (que recorta sus esquinas), pegado a su derecha.
    const r = this.el.getBoundingClientRect();
    pop.style.position = 'fixed'; pop.style.left = `${r.right + 6}px`; pop.style.top = `${Math.max(8, r.top)}px`;
    $ui().append(pop);
    this.pop = pop;
    if (!canHeal) setTimeout(() => { if (this.pop === pop) this.closePop(); }, 2500);
    void this.toast;
  }
}
