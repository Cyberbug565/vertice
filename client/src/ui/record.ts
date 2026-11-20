import type { CharacterRecord } from '@vertice/shared';
import { api } from '../api';
import { $ui, fmtMoney, h } from './dom';

const date = (s: string) => new Date(s).toLocaleString('es-ES');
const duration = (s: number) => `${Math.floor(s / 3600)} h ${Math.floor(s % 3600 / 60)} min`;
const stat = (label: string, value: string | number) => h('div', { class: 'record-stat' }, h('dt', {}, label), h('dd', {}, String(value)));
const section = (label: string, content: HTMLElement, count?: number) => h('details', { class: 'record-section', 'data-section': label }, h('summary', {}, label, count !== undefined ? h('span', { class: 'badge' }, String(count)) : null), content);
const list = (rows: string[]) => rows.length ? h('ul', { class: 'record-list' }, ...rows.map((s) => h('li', {}, s))) : h('p', { class: 'muted small' }, 'Sin registros todavía.');
let closeCurrent: (() => void) | undefined;
export const closeRecordPanel = () => closeCurrent?.();

/** La ficha viva y el memorial muestran exactamente el mismo expediente. */
export function recordPanel(charId: string, snapshot?: CharacterRecord) {
  closeRecordPanel();
  let timer: number | undefined, loading = false, closed = false;
  const title = h('h2', {}, snapshot ? `Memorial · ${snapshot.name}` : 'Expediente del personaje');
  const updated = h('span', { class: 'small muted', 'aria-live': 'polite' });
  const error = h('p', { class: 'error', role: 'alert' });
  const body = h('div', { class: 'record-body' }, h('p', { class: 'muted' }, 'Cargando expediente…'));
  const close = () => { closed = true; clearInterval(timer); ov.remove(); window.removeEventListener('keydown', key, true); if (closeCurrent === close) closeCurrent = undefined; };
  const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  const ov = h('div', { class: 'overlay record-overlay', id: 'record-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': snapshot ? 'Memorial · expediente' : 'Expediente del personaje', onclick: (e: Event) => { if (e.target === ov) close(); } },
    h('div', { class: 'record-shell' }, h('div', { class: 'record-head' }, h('div', {}, h('span', { class: 'eyebrow' }, snapshot ? 'ARCHIVO DE VIDAS' : 'CIUDAD VÉRTICE · REGISTRO PERSONAL'), title, updated), h('button', { class: 'btn small', onclick: close, 'aria-label': 'Cerrar expediente' }, 'Cerrar ✕')), error, body));
  const render = (r: CharacterRecord) => {
    const open = new Set([...body.querySelectorAll('details[open]')].map((d) => d.getAttribute('data-section')));
    const scroll = body.scrollTop;
    title.textContent = `${r.status === 'dead' ? 'Memorial' : 'Expediente'} · ${r.name}`;
    updated.textContent = r.status === 'dead' ? `Archivo definitivo · ${date(r.diedAt ?? r.recordedAt)}` : `Actualizado ${new Date(r.recordedAt).toLocaleTimeString('es-ES')} · actualización automática`;
    const s = r.stats;
    body.replaceChildren(
      h('div', { class: 'record-identity' }, h('div', {}, h('span', { class: `badge ${r.status === 'dead' ? 'netbad' : 'netok'}` }, r.status === 'dead' ? 'FALLECIDO/A' : r.status === 'downed' ? 'DERRIBADO/A' : 'CON VIDA'), h('h3', {}, `${r.role} · nivel ${r.level}`), h('p', { class: 'muted' }, `${r.origin} · ${r.place}`)),
        h('div', { class: 'record-work' }, h('span', { class: 'eyebrow' }, r.status === 'dead' ? 'ÚLTIMO EMPLEO' : 'TRABAJO ACTUAL'), h('strong', {}, r.profession), h('span', {}, r.currentJob), h('small', { class: 'muted' }, `Rango profesional ${r.professionRank}`))),
      r.cause ? h('p', { class: 'record-cause' }, `Causa de muerte: ${r.cause}`) : '',
      h('dl', { class: 'record-stats' }, stat('Personas asesinadas', s.kills), stat('Droga vendida', `${s.drugsSold} unidades`), stat('Dinero ganado', fmtMoney(s.moneyEarned)), stat('Tiempo jugado', duration(r.secondsPlayed)), stat('Tiempo de vida', duration(r.secondsAlive)), stat('Trabajos realizados', s.jobsCompleted), stat('Ciberware conseguido', s.cyberwareAcquired), stat('Encargos completados', s.contractsCompleted), stat('Dinero actual', fmtMoney(r.money)), stat('Dinero gastado', fmtMoney(s.moneySpent)), stat('Facturación de droga', fmtMoney(s.drugRevenue)), stat('Entregas a bandas', s.gangDeliveries)),
      h('p', { class: 'muted small' }, `Vida iniciada: ${date(r.createdAt)} · Tiempo de vida incluye el tiempo desconectado; tiempo jugado cuenta la presencia en el mundo.`),
      section('Personas asesinadas', list(r.victims.map((v) => `${v.name} · ${v.kind === 'player' ? 'Jugador' : 'PNJ'} · ${v.place} · ${v.cause} · ${date(v.at)}`)), s.kills),
      section('Ventas de droga', list(r.drugSales.map((v) => `${v.name}: ${v.qty} unidades · ${fmtMoney(v.revenue)}`)), s.drugsSold),
      section('Historial de trabajos', list(r.jobs.map((j) => `${j.name}: ${j.count} trabajos · ${fmtMoney(j.earnings)}`)), s.jobsCompleted),
      section('Ciberware conseguido', list(r.cyberware.map((i) => `${i.name} · ${i.location === 'installed' ? 'Instalado' : i.location === 'inventory' ? 'En inventario' : i.location === 'traspasado' ? 'Traspasado' : i.location === 'shop' ? 'Vendido' : 'Perdido'} · ${date(i.acquiredAt)}`)), s.cyberwareAcquired),
      section('Habilidades y reputación', list([...r.skills.map((s) => `${s.name} · nivel ${s.level}`), ...r.reputation.map((s) => `${s.name}: ${s.value} de reputación`)])),
      section('Equipo y posesiones', list([...r.inventory.map((i) => `${i.qty} × ${i.name}`), ...r.equipment.map((i) => `Equipado: ${i.name}`), ...r.properties.houses.map((n) => `Vivienda: ${n}`), ...r.properties.cars.map((n) => `Vehículo: ${n}`)])),
      section('Encargos', list(r.contracts.map((c) => `${c.name}${c.outcome ? ` · ${c.outcome}` : ''}`)), s.contractsCompleted),
      h('p', { class: 'muted small' }, `Registro detallado de actividad desde ${date(r.historySince)}.`));
    for (const d of body.querySelectorAll('details')) d.open = open.has(d.getAttribute('data-section'));
    body.scrollTop = scroll;
  };
  const refresh = async () => {
    if (!ov.isConnected || closed) { clearInterval(timer); return; }
    if (loading) return; loading = true;
    try { const r = await api<CharacterRecord>(`/api/characters/${charId}/record`); if (!closed) { error.textContent = ''; render(r); if (r.status === 'dead') clearInterval(timer); } }
    catch (e: any) { if (!closed) error.textContent = e.message; }
    finally { loading = false; }
  };
  closeCurrent = close; $ui().append(ov); window.addEventListener('keydown', key, true);
  if (snapshot) render(snapshot); else { void refresh(); timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 5000); }
}
