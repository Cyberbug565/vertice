// v0.4 · Pantalla de personaje a pantalla completa: inventario con huecos de ropa y armas, ciberware sobre la silueta,
// habilidades 1–25 con barras de experiencia y árbol de perks.
import { MATRICES, RARITY_COLOR, RARITY_LABEL, type CharacterSheet } from '@vertice/shared';
import { content } from '../content';
import { newOpId, type Net } from '../net';
import { $ui, fmtMoney, h, ask } from './dom';
import { Preview } from './preview';
import { Preview3D } from '../render/chars3d';
import { settings } from '../settings';
import { blip } from '../audio';

export interface CharCtx { net: Net; toast: (t: string, k?: 'info' | 'good' | 'warn' | 'bad') => void }
type Tab = 'inv' | 'cyber' | 'skills' | 'sheet';

const RARITY: Record<string, { name: string; color: string }> = {
  comun: { name: 'Común', color: '#9a9ac0' }, 'poco-comun': { name: 'Poco común', color: '#5affc8' }, raro: { name: 'Raro', color: '#43a8ff' },
  epico: { name: 'De lujo', color: '#b46cff' }, legendario: { name: 'Legendario', color: '#ffbf00' }, mitico: { name: 'Mítico', color: '#ff2040' },
};
const SLOT_NAMES: Record<string, string> = { cabeza: 'Cabeza', cara: 'Cara', torso_ext: 'Chaqueta', torso_int: 'Camiseta', piernas: 'Piernas', pies: 'Calzado', manos: 'Guantes' };
const SLOT_ICON: Record<string, string> = { cabeza: '🧢', cara: '🕶', torso_ext: '🧥', torso_int: '👕', piernas: '👖', pies: '👟', manos: '🧤' };
const CAT_ICON: Record<string, string> = { comida: '🍜', bebida: '🥤', medicina: '💉', municion: '▮', herramienta: '🔧', chatarra: '⚙', ciberware: '🦾', equipo: '📟', contrabando: '📦', mision: '★', ropa: '🧥', arma: '🔫' };
const FILTERS: [string, string][] = [['todo', 'Todo'], ['arma', 'Armas'], ['ropa', 'Ropa'], ['consumible', 'Consumibles'], ['municion', 'Munición'], ['otros', 'Otros']];
const REGIONS: { id: string; name: string; slots: number; side: 'l' | 'r'; y: number }[] = [
  // v0.9 · Más huecos: dos ojos, dos brazos (y hombros), dos piernas, dos manos y cuatro dedos, dos oídos…
  { id: 'corteza', name: 'Corteza frontal', slots: 3, side: 'l', y: 0 }, { id: 'brazos', name: 'Brazos y hombros', slots: 4, side: 'l', y: 1 }, { id: 'esqueleto', name: 'Esqueleto y columna', slots: 3, side: 'l', y: 2 },
  { id: 'nervioso', name: 'Sistema nervioso', slots: 2, side: 'l', y: 3 }, { id: 'piernas', name: 'Piernas (izq./der.)', slots: 2, side: 'l', y: 4 },
  { id: 'so', name: 'Sistema operativo y memoria', slots: 3, side: 'r', y: 0 }, { id: 'ojos', name: 'Ojos (izq./der.)', slots: 2, side: 'r', y: 1 }, { id: 'cara', name: 'Cara y oídos', slots: 4, side: 'r', y: 2 },
  { id: 'manos', name: 'Manos y dedos', slots: 6, side: 'r', y: 3 }, { id: 'circulatorio', name: 'Circulatorio', slots: 4, side: 'r', y: 4 }, { id: 'tegumentario', name: 'Piel', slots: 3, side: 'r', y: 5 },
];

const st: { tab: Tab; filter: string; skill: string; preview: { el: HTMLElement; show: (ap: any, chrome: string[], weapon?: string) => Promise<void> | void } | null; ctx: CharCtx | null; sheet: CharacterSheet | null } = { tab: 'inv', filter: 'todo', skill: 'armas', preview: null, ctx: null, sheet: null };

export const charScreenOpen = () => !!document.getElementById('char-screen');
export function closeCharScreen() { document.getElementById('char-screen')?.remove(); hideTip(); }

export function openCharScreen(ctx: CharCtx, sheet: CharacterSheet, tab: Tab) {
  if (charScreenOpen() && st.tab === tab) { closeCharScreen(); return; }
  st.ctx = ctx; st.sheet = sheet; st.tab = tab; cyberNet = ctx.net;
  render();
}
export function refreshCharScreen(sheet: CharacterSheet) { st.sheet = sheet; if (charScreenOpen()) render(); }

function bar(cur: number, max: number, color: string, cls = 'xpbar') {
  return h('div', { class: cls }, h('i', { style: { width: `${Math.max(0, Math.min(100, (100 * cur) / Math.max(1, max)))}%`, background: color } }));
}

function render() {
  const s = st.sheet!, ctx = st.ctx!;
  const old = document.getElementById('char-screen');
  const scroll = old?.querySelector('.cs-body')?.scrollTop ?? 0;
  const xpIn = s.xp - s.xpLevelStart, xpNeed = s.xpNext - s.xpLevelStart;
  const tabBtn = (id: Tab, label: string, badge?: number) => h('button', { class: `cs-tab${st.tab === id ? ' on' : ''}`, onclick: () => { st.tab = id; render(); } }, label, badge ? h('span', { class: 'cs-badge' }, String(badge)) : null);
  const head = h('div', { class: 'cs-head' },
    h('div', { class: 'cs-level' }, h('div', { class: 'cs-lvnum' }, String(s.level)), h('div', {}, h('div', { class: 'cs-lvlabel' }, 'NIVEL'), bar(xpIn, xpNeed, 'var(--xp)'), h('div', { class: 'mono small muted' }, `${xpIn}/${xpNeed} XP`))),
    h('div', { class: 'cs-cred' }, h('div', { class: 'cs-lvlabel' }, 'REP. CALLE'), h('b', {}, String(s.streetRep))),
    h('nav', { class: 'cs-tabs' }, tabBtn('inv', 'Inventario'), tabBtn('cyber', 'Ciberware'), tabBtn('skills', 'Habilidades', s.skillPoints + s.perkPoints), tabBtn('sheet', 'Ficha')),
    h('div', { class: 'cs-money' }, h('span', { class: 'mono' }, fmtMoney(s.money)), h('span', { class: `mono small ${s.encumbrance !== 'normal' ? 'netbad' : 'muted'}` }, `Carga ${s.carry}/${s.carryMax} kg`)),
    h('button', { class: 'btn small', onclick: closeCharScreen, title: 'Cerrar (Esc)' }, '✕'));
  const body = h('div', { class: 'cs-body' });
  if (st.tab === 'inv') body.append(invTab(s, ctx));
  else if (st.tab === 'cyber') body.append(cyberTab(s));
  else if (st.tab === 'skills') body.append(skillsTab(s, ctx));
  else body.append(sheetTab(s));
  const scr = h('div', { class: 'cs', id: 'char-screen', role: 'dialog', 'aria-label': 'Personaje' }, head, body);
  if (old) old.replaceWith(scr); else $ui().append(scr);
  body.scrollTop = scroll;
}

// ---------------------------------------------------------------- inventario
function itemCard(id: string, qty?: number) {
  const d = content.items.find((i) => i.id === id);
  if (!d) return h('div', {}, id);
  const r = RARITY[d.rarity ?? 'comun'];
  const lines: (Node | string)[] = [];
  if (d.weapon) {
    const w = d.weapon;
    lines.push(h('div', { class: 'mono' }, `Daño ${w.damage[0]}–${w.damage[1]} · ${w.kind === 'melee' ? `cuerpo a cuerpo (${w.range} m)` : `alcance ${w.range} m`}`), h('div', { class: 'mono' }, `Cadencia ${w.cooldown} s · precisión ${w.accuracy >= 0 ? '+' : ''}${w.accuracy}`));
    if (w.ammo) lines.push(h('div', {}, `Munición: ${content.items.find((i) => i.id === w.ammo)?.name}`));
    if (w.traits?.length) lines.push(h('div', { class: 'row', style: { gap: '4px' } }, ...w.traits.map((t) => h('span', { class: 'chip trait' }, t))));
    lines.push(h('div', { class: 'muted' }, w.nonlethal === 'solo' ? 'Solo no letal' : w.nonlethal === 'opcional' ? 'Letal o KO' : 'Letal'));
  }
  if (d.wear) {
    const m = d.wear.mods;
    lines.push(h('div', {}, `Hueco: ${SLOT_NAMES[d.wear.slot]}`));
    if (d.armor) lines.push(h('div', { class: 'mono' }, `Blindaje +${d.armor}`));
    for (const [k, v] of Object.entries(m.skills ?? {})) lines.push(h('div', { class: 'good' }, `+${v} ${content.skills.find((x) => x.id === k)?.name ?? k}`));
    if (m.carry) lines.push(h('div', { class: 'good' }, `+${m.carry} kg de carga`));
    if (m.speed) lines.push(h('div', { class: 'good' }, `+${Math.round(m.speed * 100)} % de velocidad`));
    if (m.needs) lines.push(h('div', { class: 'good' }, `Necesidades −${Math.round(m.needs * 100)} %`));
  } else if (d.armor) lines.push(h('div', { class: 'mono' }, `Blindaje ${d.armor}`));
  if (d.consumable) lines.push(h('div', {}, [d.consumable.hunger ? `Hambre ${d.consumable.hunger}` : '', d.consumable.thirst ? `Sed ${d.consumable.thirst}` : '', d.consumable.amount ? `+${d.consumable.amount} ${d.consumable.restore === 'hp' ? 'salud' : 'aguante'}` : ''].filter(Boolean).join(' · ')));
  return h('div', { class: 'cs-card', style: { borderColor: r.color } },
    h('div', { class: 'cs-card-rar', style: { color: r.color } }, r.name.toUpperCase()), h('b', {}, d.name), h('p', { class: 'muted' }, d.desc), ...lines,
    h('div', { class: 'row small muted', style: { justifyContent: 'space-between' } }, h('span', {}, `${d.weight} kg${qty && qty > 1 ? ` · ×${qty}` : ''}`), d.price ? h('span', { class: 'mono' }, `~${fmtMoney(d.price)}`) : ''));
}
function iconOf(id: string) {
  const d = content.items.find((i) => i.id === id);
  if (!d) return '•';
  if (d.weapon) return d.weapon.kind === 'melee' ? '🗡' : '🔫';
  if (d.wear) return SLOT_ICON[d.wear.slot];
  return CAT_ICON[d.category] ?? '•';
}
function tile(id: string, qty: number, opts: { equipped?: boolean; onClick?: () => void; label?: string } = {}) {
  const d = content.items.find((i) => i.id === id);
  const r = RARITY[d?.rarity ?? 'comun'];
  const t = h('button', { class: `cs-tile${opts.equipped ? ' on' : ''}`, style: { borderColor: r.color, boxShadow: `inset 0 -3px 0 ${r.color}55` }, onclick: opts.onClick },
    h('span', { class: 'cs-ico' }, iconOf(id)), h('span', { class: 'cs-tname' }, opts.label ?? d?.name ?? id), qty > 1 ? h('span', { class: 'cs-qty' }, `×${qty}`) : null, opts.equipped ? h('span', { class: 'cs-eq' }, 'E') : null);
  t.addEventListener('mouseenter', () => showTip(t, itemCard(id, qty)));
  t.addEventListener('mouseleave', hideTip);
  return t;
}
let tipEl: HTMLElement | null = null;
function showTip(anchor: HTMLElement, card: HTMLElement) {
  hideTip();
  const r = anchor.getBoundingClientRect();
  tipEl = h('div', { class: 'cs-tip' }, card);
  $ui().append(tipEl);
  const tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
  tipEl.style.left = `${Math.min(window.innerWidth - tw - 8, r.right + 8 > window.innerWidth - tw ? r.left - tw - 8 : r.right + 8)}px`;
  tipEl.style.top = `${Math.max(8, Math.min(window.innerHeight - th - 8, r.top))}px`;
}
function hideTip() { tipEl?.remove(); tipEl = null; }

function invTab(s: CharacterSheet, ctx: CharCtx) {
  const net = ctx.net;
  const inv = new Map(s.inventory.map((i) => [i.def, i.qty]));
  // Armas
  const weapons = h('div', { class: 'cs-col' }, h('h3', {}, 'Armas'),
    h('div', { class: 'cs-grid small' }, ...s.weapons.map((w) => tile(w.id, 1, { equipped: s.weapon?.id === w.id, onClick: () => { net.send({ t: 'equip', item: s.weapon?.id === w.id ? null : w.id } as any); blip('step'); } })),
      s.weapons.length ? null : h('p', { class: 'muted' }, 'Sin armas: puños.')),
    s.weapon ? h('div', { class: 'cs-weapon' }, h('b', {}, s.weapon.name), h('div', { class: 'mono small' }, `Daño ${s.weapon.damage[0]}–${s.weapon.damage[1]} · ${s.weapon.kind === 'melee' ? 'cuerpo a cuerpo' : `${s.weapon.range} m`}${s.weapon.ammo ? ` · ${s.weapon.ammoName}: ${s.weapon.ammoCount}` : ''}`)) : null,
    h('h3', {}, 'Ropa'),
    h('div', { class: 'cs-slots' }, ...Object.keys(SLOT_NAMES).map((slot) => {
      const id = s.wear[slot];
      const box = h('button', { class: `cs-slot${st.filter === `slot:${slot}` ? ' sel' : ''}`, onclick: () => { st.filter = st.filter === `slot:${slot}` ? 'todo' : `slot:${slot}`; render(); }, title: `Ver prendas para: ${SLOT_NAMES[slot]}` },
        h('span', { class: 'cs-slotname' }, SLOT_NAMES[slot]),
        id ? h('span', { class: 'cs-ico', style: { color: RARITY[content.items.find((i) => i.id === id)?.rarity ?? 'comun'].color } }, SLOT_ICON[slot]) : h('span', { class: 'cs-ico muted' }, '＋'),
        h('span', { class: 'cs-tname' }, id ? content.items.find((i) => i.id === id)?.name ?? id : 'Vacío'));
      if (id) { box.addEventListener('mouseenter', () => showTip(box, itemCard(id))); box.addEventListener('mouseleave', hideTip); }
      return box;
    })));
  // Vista previa del personaje: una sola aplicación Pixi que se reutiliza (destruirla afectaría al render del mundo).
  // v0.13 · En 3D (gira y respira), con el arma que empuñas; si no se puede, la 2D.
  if (!st.preview) { try { st.preview = settings.chars3d ? new Preview3D(300, 420, 'cs-preview preview3d') : new Preview(300, 420, 'cs-preview'); } catch { st.preview = new Preview(300, 420, 'cs-preview'); } }
  void st.preview.show(s.look, s.chrome, s.weapon?.id);
  const center = h('div', { class: 'cs-center' }, st.preview.el,
    h('div', { class: 'cs-stats' },
      stat('Blindaje', String(s.armor)), stat('Velocidad', `×${s.speedMult}`), stat('Esquiva', `${s.dodge} %`), stat('Salud', `${Math.round(s.hp)}/${s.hpMax}`)));
  // Mochila
  const match = (id: string) => {
    const d = content.items.find((i) => i.id === id);
    if (!d) return false;
    const f = st.filter;
    if (f.startsWith('slot:')) return d.wear?.slot === f.slice(5);
    if (f === 'todo') return true;
    if (f === 'arma') return !!d.weapon;
    if (f === 'ropa') return !!d.wear;
    if (f === 'consumible') return !!d.consumable;
    if (f === 'municion') return d.category === 'municion';
    return !d.weapon && !d.wear && !d.consumable && d.category !== 'municion';
  };
  const items = [...inv].filter(([id, q]) => q > 0 && match(id)).sort((a, b) => (content.items.find((i) => i.id === a[0])?.category ?? '').localeCompare(content.items.find((i) => i.id === b[0])?.category ?? ''));
  const act = (id: string) => {
    const d = content.items.find((i) => i.id === id)!;
    if (d.wear) { const on = s.wear[d.wear.slot] === id; net.send({ t: 'wear', slot: d.wear.slot, item: on ? null : id } as any); ctx.toast(on ? `Te quitas ${d.name}.` : `Te pones ${d.name}.`, 'info'); }
    else if (d.weapon) net.send({ t: 'equip', item: s.weapon?.id === id ? null : id } as any);
    else if (d.consumable) net.send({ t: 'useItem', item: id, opId: newOpId() } as any);
    else ctx.toast(`${d.name}: no se puede usar directamente.`, 'info');
    blip('step');
  };
  const bag = h('div', { class: 'cs-col cs-bag' },
    h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('h3', {}, 'Mochila'), h('span', { class: 'muted small' }, 'Clic: usar, equipar o poner/quitar')),
    h('div', { class: 'row cs-filters' }, ...FILTERS.map(([id, label]) => h('button', { class: `chip${st.filter === id ? ' on' : ''}`, onclick: () => { st.filter = id; render(); } }, label)),
      st.filter.startsWith('slot:') ? h('button', { class: 'chip on', onclick: () => { st.filter = 'todo'; render(); } }, `${SLOT_NAMES[st.filter.slice(5)]} ✕`) : null),
    h('div', { class: 'cs-grid' }, ...items.map(([id, q]) => { const d = content.items.find((i) => i.id === id)!; return tile(id, q, { equipped: (d.wear && s.wear[d.wear.slot] === id) || s.weapon?.id === id, onClick: () => act(id) }); })),
    items.length ? null : h('p', { class: 'muted' }, 'Nada que mostrar con este filtro.'));
  return h('div', { class: 'cs-inv' }, weapons, center, bag);
}
const stat = (k: string, v: string) => h('div', { class: 'cs-stat' }, h('span', { class: 'muted small' }, k), h('b', { class: 'mono' }, v));

// ---------------------------------------------------------------- ciberware
/** Nombre del hueco en las regiones con lados (ojo izq./der., mano y dedos…). */
function sideLabel(region: string, i: number) {
  const L: Record<string, string[]> = { ojos: ['Ojo izq.', 'Ojo der.'], piernas: ['Pierna izq.', 'Pierna der.'], brazos: ['Brazo izq.', 'Brazo der.', 'Hombro izq.', 'Hombro der.'],
    manos: ['Mano izq.', 'Mano der.', 'Dedos izq.', 'Dedos izq.', 'Dedos der.', 'Dedos der.'], cara: ['Oído izq.', 'Oído der.', 'Cara', 'Cara'] };
  return L[region]?.[i] ?? '';
}
function cyberTab(s: CharacterSheet) {
  const installed = s.cyber.filter((c) => c.location === 'installed');
  const box = (r: (typeof REGIONS)[number]) => {
    const list = installed.filter((c) => c.region === r.id);
    const slots = Math.max(r.slots, list.length);
    return h('div', { class: `cy-box ${r.side}`, style: { gridRow: String(r.y + 1) } },
      h('div', { class: 'cy-title' }, r.name.toUpperCase()),
      h('div', { class: 'cy-slots' }, ...Array.from({ length: slots }, (_, i) => {
        const c = list[i];
        if (!c) return h('div', { class: 'cy-slot empty', title: 'Hueco libre: instálalo en un matasanos' }, h('span', { class: 'cy-side' }, sideLabel(r.id, i)));
        const rc = RARITY_COLOR[c.rarity ?? 'comun'];
        const el = h('div', { class: `cy-slot g${c.grade} r-${c.rarity ?? 'comun'}`, style: { borderColor: rc } }, h('span', { class: 'cs-ico' }, c.ability ? '⚡' : '🦾'), h('span', { class: 'cy-name', style: { color: rc } }, c.name));
        el.addEventListener('mouseenter', () => showTip(el, h('div', { class: 'cs-card', style: { borderColor: rc } },
          h('div', { class: 'cs-card-rar', style: { color: rc } }, `${(RARITY_LABEL[c.rarity ?? 'comun'] ?? '').toUpperCase()} · ${c.family.toUpperCase()} · GRADO ${['I', 'II', 'III', 'IV', 'V'][c.grade - 1]}`), h('b', {}, c.name), h('p', { class: 'muted' }, c.desc),
          h('div', { class: 'mono' }, `Capacidad ${c.capacity} · Humanidad −${c.humanity}`), c.part ? h('div', {}, `Lado: ${c.part.endsWith('izq') ? 'izquierdo' : 'derecho'}`) : null,
          c.ability ? h('div', { class: 'good' }, `Habilidad activa: ${c.ability} (teclas 1–4)`) : null, c.unique || (c as any).passive ? h('div', { class: 'good' }, 'Capacidad pasiva especial') : null,
          c.stolen ? h('div', { class: 'netbad' }, 'Procedencia: robado') : null)));
        el.addEventListener('mouseleave', hideTip);
        return el;
      })));
  };
  const body = h('div', { class: 'cy-figure' }, silhouette(s.chrome));
  const left = REGIONS.filter((r) => r.side === 'l').map(box), right = REGIONS.filter((r) => r.side === 'r').map(box);
  const inBag = s.cyber.filter((c) => c.location === 'inventory');
  return h('div', { class: 'cy-layout' },
    h('div', { class: 'cy-meter' }, h('div', { class: 'cy-mlabel' }, 'CAPACIDAD'), h('div', { class: 'cy-vbar' }, h('i', { style: { height: `${(100 * s.chromeUsed) / Math.max(1, s.chromeCapacity)}%` } })), h('b', { class: 'mono' }, `${s.chromeUsed}/${s.chromeCapacity}`)),
    h('div', { class: 'cy-col' }, ...left), body, h('div', { class: 'cy-col' }, ...right),
    h('div', { class: 'cy-meter hum' }, h('div', { class: 'cy-mlabel' }, 'HUMANIDAD'), h('div', { class: 'cy-vbar' }, h('i', { style: { height: `${(100 * s.humanity) / Math.max(1, s.humanityMax)}%` } })), h('b', { class: 'mono' }, `${s.humanity}/${s.humanityMax}`)),
    h('div', { class: 'cy-foot muted small' }, inBag.length ? h('span', {}, 'En la mochila sin instalar: ', ...inBag.map((c, i) => h('span', { style: { color: RARITY_COLOR[c.rarity ?? 'comun'] } }, `${i ? ', ' : ''}${c.name}`)), '. ') : '', 'Los implantes se instalan y se retiran en un matasanos. Los mejores no se anuncian: pregunta en la calle.'),
    matricesBlock(s));
}
/** v0.8 · Zócalo de matrices: ranuras, matrices puestas (las míticas bloqueadas no salen) y las que llevas en la mochila. */
let cyberNet: Net | null = null;
function matricesBlock(s: CharacterSheet) {
  const m = s.matrices;
  const bag = s.inventory.filter((i) => MATRICES[i.def] && i.qty > 0 && !(MATRICES[i.def].rarity === 'mitico' && m.equipped.includes(i.def)));
  if (!m.socket && !bag.length) return h('div', { class: 'mx-box muted small' }, 'Sin zócalo de matrices. Los matasanos de grado IV o más lo instalan (ocupa la ranura «zócalo»).');
  const card = (id: string, on: boolean) => { const d = MATRICES[id]; const rc = RARITY_COLOR[d.rarity]; return h('div', { class: `mx-card${on ? ' on' : ''}`, style: { borderColor: rc } },
    h('div', { class: 'mono small', style: { color: rc } }, `${RARITY_LABEL[d.rarity].toUpperCase()} · ${d.chrome ? `${d.chrome} de cromo` : 'sin coste de cromo'}${d.locked ? ' · NO SE QUITA' : ''}`),
    h('b', {}, d.name), h('p', { class: 'small muted' }, d.desc),
    on ? (d.locked ? h('span', { class: 'small', style: { color: rc } }, 'Anclada hasta la muerte') : h('button', { class: 'btn small', onclick: () => cyberNet?.send({ t: 'matrix', action: 'remove', item: id } as any) }, 'Quitar'))
      : h('button', { class: 'btn small primary', disabled: !m.socket || m.equipped.length >= m.slots, onclick: () => { const go = () => cyberNet?.send({ t: 'matrix', action: 'equip', item: id } as any); if (!d.locked) go(); else ask(`${d.name} no se podrá quitar nunca. ¿Insertarla?`, go, { danger: true, ok: 'Insertar' }); } }, 'Insertar')); };
  return h('div', { class: 'mx-box' },
    h('div', { class: 'cy-title' }, `ZÓCALO DE MATRICES · ${m.socket ? `${m.equipped.length}/${m.slots} ranuras` : 'no instalado'}`),
    h('div', { class: 'mx-grid' }, ...m.equipped.map((id) => card(id, true)), ...Array.from({ length: Math.max(0, m.slots - m.equipped.length) }, () => h('div', { class: 'mx-card empty' }, 'Ranura libre')), ...bag.map((i) => card(i.def, false))));
}
/** Silueta humana estilizada con las partes cromadas resaltadas. */
function silhouette(chrome: string[]) {
  const on = (p: string) => (chrome.includes(p) ? 'cy-part on' : 'cy-part');
  const svg = `<svg viewBox="0 0 200 420" class="cy-svg" aria-label="Silueta con ciberware">
    <defs><linearGradient id="cyg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ff3fa4" stop-opacity=".55"/><stop offset="1" stop-color="#43f3ff" stop-opacity=".25"/></linearGradient></defs>
    <g fill="url(#cyg)" stroke="#ff8ac8" stroke-width="1.2">
      <ellipse class="${on('cabeza')}" cx="100" cy="42" rx="24" ry="30"/>
      <rect class="${on('ojos')}" x="84" y="36" width="32" height="8" rx="3"/>
      <path class="${on('torso')}" d="M70 80 Q100 70 130 80 L138 150 Q132 205 118 225 L82 225 Q68 205 62 150 Z"/>
      <path class="${on('brazo_der')}" d="M60 86 L44 150 L36 218 L46 222 L58 158 L72 104 Z"/>
      <path class="${on('brazo_izq')}" d="M140 86 L156 150 L164 218 L154 222 L142 158 L128 104 Z"/>
      <path class="${on('pierna_der')}" d="M82 226 L76 320 L78 404 L94 404 L96 320 L100 230 Z"/>
      <path class="${on('pierna_izq')}" d="M118 226 L124 320 L122 404 L106 404 L104 320 L100 230 Z"/>
    </g>
    <g stroke="#43f3ff" stroke-opacity=".35" fill="none"><path d="M100 80 V225 M70 120 H130 M75 160 H125"/></g>
  </svg>`;
  const d = h('div', { class: 'cy-sil' });
  d.innerHTML = svg;
  return d;
}

// ---------------------------------------------------------------- habilidades y perks
function skillsTab(s: CharacterSheet, ctx: CharCtx) {
  const net = ctx.net;
  const cards = s.skillProg.map((sk) => {
    const cur = sk.xp - sk.from, need = sk.to - sk.from;
    const max = sk.level >= 25;
    const perksHere = content.perks.filter((p) => p.skill === sk.id);
    const owned = perksHere.filter((p) => s.perks.includes(p.id)).length;
    return h('div', { class: `sk${st.skill === sk.id ? ' sel' : ''}${max ? ' max' : ''}`, onclick: () => { st.skill = sk.id; render(); } },
      h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('b', {}, sk.name), h('span', { class: 'muted small' }, sk.attr)),
      h('div', { class: 'row', style: { justifyContent: 'space-between', alignItems: 'baseline' } }, h('span', { class: 'sk-lv' }, String(sk.level), h('small', {}, '/25')), h('span', { class: 'mono small' }, `+${sk.bonus} a tiradas`)),
      bar(max ? 1 : cur, max ? 1 : need, max ? 'linear-gradient(90deg,#ffbf00,#ff3fa4)' : 'var(--xp)'),
      h('div', { class: 'row small', style: { justifyContent: 'space-between' } }, h('span', { class: 'mono muted' }, max ? 'DOMINIO' : `${cur}/${need} XP`), h('span', { class: 'muted' }, `perks ${owned}/${perksHere.length}`),
        s.skillPoints > 0 && sk.level < 20 ? h('button', { class: 'btn small primary', title: 'Invertir un punto de habilidad', onclick: (ev: Event) => { ev.stopPropagation(); net.send({ t: 'skillUp', skill: sk.id, opId: newOpId() } as any); blip('good'); } }, '+') : null));
  });
  const branch = st.skill;
  const perks = content.perks.filter((p) => p.skill === branch || (branch === 'general' && p.skill === 'general'));
  const skLv = (id: string) => s.skillProg.find((x) => x.id === id)?.level ?? 1;
  const why = (p: (typeof perks)[number]) => {
    if (s.perks.includes(p.id)) return null;
    if (s.level < p.requires.level) return `Nivel ${p.requires.level}`;
    for (const [k, v] of Object.entries(p.requires.skills)) if (skLv(k) < v) return `${content.skills.find((x) => x.id === k)?.name ?? k} ${v}`;
    for (const k of p.requires.perks) if (!s.perks.includes(k)) return `Antes: ${content.perks.find((x) => x.id === k)?.name}`;
    if (s.perkPoints < p.cost) return `${p.cost} punto(s)`;
    return '';
  };
  const tiers = [1, 2, 3, 4, 5].map((t) => h('div', { class: 'pk-tier' }, h('div', { class: 'pk-tl' }, t === 5 ? 'NV 25' : `T${t}`),
    ...perks.filter((p) => p.tier === t).map((p) => {
      const w = why(p);
      const ownedP = s.perks.includes(p.id);
      const cls = ownedP ? 'owned' : w === '' ? 'ready' : 'locked';
      const reqs = [...Object.entries(p.requires.skills).map(([k, v]) => `${content.skills.find((x) => x.id === k)?.name ?? k} ${v}`), p.requires.level > 1 ? `nivel ${p.requires.level}` : ''].filter(Boolean).join(' · ');
      return h('button', { class: `pk ${cls}${t === 5 ? ' cap' : ''}`, disabled: cls === 'locked', title: w || p.desc, onclick: () => { if (cls === 'ready') ask(`¿Comprar «${p.name}» por ${p.cost} punto(s) de perk?\n\n${p.desc}`, () => { net.send({ t: 'perkBuy', perk: p.id, opId: newOpId() } as any); blip('good'); }, { ok: 'Comprar' }); } },
        h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('b', {}, p.name), h('span', { class: 'chip' }, ownedP ? '✔' : `${p.cost} pt`)),
        h('div', { class: 'small' }, p.desc), h('div', { class: 'small muted' }, reqs ? `Requiere: ${reqs}` : 'Sin requisitos'), w ? h('div', { class: 'small netbad' }, `Falta: ${w}`) : null);
    })));
  return h('div', { class: 'skills' },
    h('div', { class: 'sk-head' },
      h('div', { class: 'pts' }, h('b', {}, String(s.skillPoints)), ' puntos de habilidad'), h('div', { class: 'pts perk' }, h('b', {}, String(s.perkPoints)), ' puntos de perk'),
      h('p', { class: 'muted small' }, 'Las habilidades (1–25) suben al usarlas: disparar sube Armas, hackear sube Interfaz, andar sube Atletismo… Cada nivel cuesta más. Con puntos solo se llega al 20: el 25 hay que ganárselo. Al llegar a 10, 15, 20 y 25 en una habilidad ganas un punto de perk.')),
    h('div', { class: 'sk-grid' }, ...cards, h('div', { class: `sk gen${branch === 'general' ? ' sel' : ''}`, onclick: () => { st.skill = 'general'; render(); } }, h('b', {}, 'Perks generales'), h('p', { class: 'small muted' }, 'Mejoras que dependen de tu nivel de personaje.'))),
    h('h3', {}, `Árbol de perks · ${branch === 'general' ? 'General' : content.skills.find((x) => x.id === branch)?.name}`),
    h('div', { class: 'pk-tree' }, ...tiers));
}

// ---------------------------------------------------------------- ficha
function sheetTab(s: CharacterSheet) {
  const role = content.roles.find((r) => r.id === s.role);
  return h('div', { class: 'sheet-tab' },
    h('div', { class: 'cards' },
      h('div', { class: 'fcard', style: { borderTopColor: role?.accent ?? '#43f3ff' } }, h('b', {}, `${s.name}`), h('div', {}, `${role?.name} · ${content.origins.find((o) => o.id === s.origin)?.name}`), h('div', { class: 'small muted' }, `${role?.ability}: ${role?.abilityDesc}`)),
      h('div', { class: 'fcard', style: { borderTopColor: '#5affc8' } }, h('b', {}, 'Oficio'), h('div', {}, `${s.professionName} · rango ${s.professionRank}`), h('div', { class: 'small muted' }, `Búsqueda ${s.wanted}`)),
      h('div', { class: 'fcard', style: { borderTopColor: '#b46cff' } }, h('b', {}, `Red · rango ${s.net.rank}`), bar(s.net.xp, s.net.xpNext, '#b46cff'), h('div', { class: 'small muted' }, s.net.canHack ? `RAM ${s.net.ram}/${s.net.ramMax}` : 'Sin cyberdeck')),
      h('div', { class: 'fcard', style: { borderTopColor: '#ffbf00' } }, h('b', {}, 'Propiedades'), h('div', {}, `${s.houses.length} vivienda(s) · ${s.cars.length} vehículo(s)`), h('div', { class: 'small muted' }, 'Tecla P para gestionarlas'))),
    h('h3', {}, 'Atributos'),
    h('div', { class: 'attr-grid' }, ...content.attributes.map((a) => h('div', { class: 'cs-stat' }, h('span', { class: 'muted small' }, a.name), h('b', { class: 'mono' }, String(s.attributes[a.id]), s.attributes[a.id] !== s.baseAttributes[a.id] ? h('small', { class: 'good' }, ` (${s.baseAttributes[a.id]})`) : '')))),
    h('h3', {}, 'Magnitudes'),
    h('div', { class: 'attr-grid' }, stat('Salud', `${Math.round(s.hp)}/${s.hpMax}`), stat('Aguante', `${Math.round(s.stamina)}/${s.staminaMax}`), stat('Suerte', `${s.luck}/${s.luckMax}`), stat('Humanidad', `${s.humanity}/${s.humanityMax}`), stat('Blindaje', String(s.armor)), stat('Esquiva', `${s.dodge} %`), stat('Velocidad', `×${s.speedMult}`), stat('Carga', `${s.carry}/${s.carryMax} kg`)),
    h('h3', {}, 'Necesidades'),
    h('div', { class: 'attr-grid' }, stat('Hambre', `${s.needs.hunger}`), stat('Sed', `${s.needs.thirst}`), stat('Sueño', `${s.needs.fatigue}`), stat('Ritmo', `×${s.needsMult.hunger.toFixed(2)}`)),
    h('h3', {}, 'Cuerpo y heridas'), bodyBlock(s),
    h('h3', {}, 'Armas encima'),
    h('div', { class: 'attr-grid' }, stat('Largas', `${s.weaponSlots.grande}/${s.weaponSlots.maxGrande}`), stat('Cortas', `${s.weaponSlots.pequena}/${s.weaponSlots.maxPequena}`), stat('Tiro seguro', `${s.aim.range} m`), stat('Apuntar', `${s.aim.time} s`)),
    s.bio ? h('div', { class: 'fcard', style: { borderTopColor: s.bio.done ? '#5affc8' : '#ffd23f', marginTop: '8px' } }, h('b', {}, `Objetivo vital: ${s.bio.objectiveName}`), h('div', {}, s.bio.done ? '✔ Cumplido (+2 puntos de perk)' : s.bio.progress)) : null,
    s.psychosis ? h('div', { class: 'fcard', style: { borderTopColor: '#ff2020', marginTop: '8px' } }, h('b', { style: { color: 'var(--red)' } }, `🧠 ${s.psychosis}`), h('div', {}, s.psychosis === 'Ciberpsicosis' ? 'Pierdes el control: disparas y atacas sin querer. Quítate cromo en un matasanos y descansa.' : 'Insultas y empujas a la gente sin motivo. Llevas más cromo del que aguantas.')) : null,
    s.chromeDebuff ? h('div', { class: 'fcard', style: { borderTopColor: '#ff9a30', marginTop: '8px' } }, h('b', {}, 'Rechazo del cromo'), h('div', {}, `Capacidad de cromo −${s.chromeDebuff.amount} durante ${s.chromeDebuff.minutes} min.`)) : null,
    s.identified ? h('div', { class: 'fcard', style: { borderTopColor: '#ff3040', marginTop: '8px' } }, h('b', { style: { color: 'var(--red)' } }, '📷 Identificado/a por las cámaras'), h('div', {}, `${s.identified.crime} en ${s.identified.district}. Tu ficha es pública: la PCV puede ir a por ti con fuego real.`)) : null,
    s.uniques.length ? h('p', { class: 'small' }, h('b', {}, 'Efectos únicos activos: '), s.uniques.join(', ')) : null);
}

const PART_LABEL: Record<string, string> = { cabeza: 'Cabeza', torso: 'Torso', brazo_izq: 'Brazo izq.', brazo_der: 'Brazo der.', mano_izq: 'Mano izq.', mano_der: 'Mano der.', pierna_izq: 'Pierna izq.', pierna_der: 'Pierna der.' };
/** Silueta con el estado de cada zona: sana, herida, grave o perdida (se recupera con una prótesis en un matasanos). */
function bodyBlock(s: CharacterSheet) {
  const st = (k: string) => (s.body.lost.includes(k) ? 'perdido' : (s.body.wounds[k] ?? 0) >= 20 ? 'grave' : (s.body.wounds[k] ?? 0) > 0 ? 'herido' : 'sano');
  const col: Record<string, string> = { sano: '#5affc8', herido: '#ffd23f', grave: '#ff6a30', perdido: '#ff3040' };
  return h('div', {},
    h('div', { class: 'attr-grid' }, ...Object.keys(PART_LABEL).map((k) => h('div', { class: 'cs-stat' }, h('span', { class: 'muted small' }, PART_LABEL[k]), h('b', { style: { color: col[st(k)] } }, st(k))))),
    s.body.bleed > 0.05 ? h('p', { style: { color: 'var(--red)' } }, `🩸 Hemorragia: −${s.body.bleed.toFixed(1)} de salud por segundo. Usa una venda o un estimulante, o busca un médico.`) : h('p', { class: 'small muted' }, 'Sin hemorragias.'),
    s.body.lost.length ? h('p', { class: 'small' }, 'Has perdido: ', s.body.lost.map((k) => PART_LABEL[k] ?? k).join(', '), '. Un matasanos puede implantarte una prótesis (brazo o pierna).') : null);
}
