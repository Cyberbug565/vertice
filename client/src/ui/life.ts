// Paneles de la v0.2: tienda, red de mercado, empleos, matasanos, recompensas, menú de acciones y pantalla de muerte.
import type { BountyView, ClinicOffer, ClinicView, DeathSummary, JobsView, MarketView, ShopView, TargetMenuView } from '@vertice/shared';
import type { Net } from '../net';
import { newOpId } from '../net';
import { $ui, fmtMoney, h } from './dom';
import { blip } from '../audio';

export interface LifeCtx { net: Net; toast: (t: string, k?: 'info' | 'good' | 'warn' | 'bad') => void }

const pct = (p: number) => (p > 0.99 && p < 1 ? `${(p * 100).toFixed(1).replace('.', ',')} %` : `${Math.round(p * 100)} %`);
const CAT: Record<string, string> = { comida: 'Comida', bebida: 'Bebida', medicina: 'Medicina', ciberware: 'Ciberware', herramienta: 'Herramientas', arma: 'Armas', ropa: 'Ropa', chatarra: 'Chatarra', mision: 'Misión', equipo: 'Equipo', contrabando: 'Contrabando' };

/** Muestra o reemplaza un panel sin alternar (para refrescos tras comprar u operar). */
export function showPanel(id: string, title: string, ...body: (Node | string | null)[]) {
  const old = document.getElementById(id);
  const scroll = old?.scrollTop ?? 0;
  for (const pid of ['journal-panel', 'sheet-panel', 'inv-panel', 'settings-panel', 'map-panel', 'shop-panel', 'market-panel', 'jobs-panel', 'clinic-panel', 'bounty-panel']) if (pid !== id) document.getElementById(pid)?.remove();
  const p = h('div', { class: 'panel', id, role: 'dialog', 'aria-label': title }, h('button', { class: 'btn small close', onclick: () => p.remove() }, 'Cerrar ✕'), h('h2', {}, title), ...body.filter(Boolean) as Node[]);
  if (old) old.replaceWith(p); else $ui().append(p);
  p.scrollTop = scroll;
  return p;
}

export function shopPanel(ctx: LifeCtx, v: ShopView) {
  const rows = v.items.map((it) => h('tr', {},
    h('td', {}, h('b', {}, it.name), h('div', { class: 'muted', style: { fontSize: '0.85em' } }, `${CAT[it.category] ?? it.category} · ${it.desc}`)),
    h('td', { class: 'mono' }, `${it.price} €$`, it.discount ? h('div', { class: 'cy', style: { fontSize: '0.8em' } }, `−${it.discount} %`) : '', h('div', { class: it.trend > 5 ? 'netbad' : it.trend < -5 ? 'netok' : 'muted', style: { fontSize: '0.8em' } }, it.trend > 0 ? `▲ ${it.trend} %` : it.trend < 0 ? `▼ ${-it.trend} %` : '= precio corp.')),
    h('td', { class: 'mono' }, `${it.stock} uds.`),
    h('td', {}, h('div', { class: 'row' },
      h('button', { class: 'btn small', disabled: it.price > v.money || it.stock < 1, onclick: () => { ctx.net.send({ t: 'buy', shop: v.shop, item: it.item, qty: 1, opId: newOpId() } as any); blip(); } }, 'Comprar'),
      !it.item.startsWith('cyber:') && it.stock > 0 ? h('button', { class: 'btn small danger', title: `Destreza + Sigilo + 1d10 contra la seguridad (${v.security}). Si fallas: paliza y nivel de búsqueda.`, onclick: () => { if (confirm(`Intentar robar ${it.name}. Probabilidad ${pct(it.stealChance)}. Si fallas, el vigilante te hará daño y subirá tu nivel de búsqueda. ¿Seguir?`)) ctx.net.send({ t: 'steal', shop: v.shop, item: it.item, opId: newOpId() } as any); } }, `Robar ${pct(it.stealChance)}`) : null))));
  const sell = v.sell.length ? h('table', { class: 'sheet' }, ...v.sell.map((s) => h('tr', {}, h('td', {}, s.name), h('td', { class: 'mono' }, `×${s.qty}`), h('td', { class: 'mono' }, `${s.price} €$/u`),
    h('td', {}, h('button', { class: 'btn small', onclick: () => ctx.net.send({ t: 'sell', shop: v.shop, item: s.item, qty: 1, opId: newOpId() } as any) }, 'Vender 1'))))) : h('p', { class: 'muted' }, 'Aquí no compran nada de lo que llevas.');
  showPanel('shop-panel', v.name,
    h('p', { class: 'muted' }, `Propiedad: ${v.ownerName} · Seguridad ${v.security}${v.fence ? ' · Perista: compra de todo, sin preguntas' : ''} · Tu saldo: `, h('b', { class: 'cy' }, fmtMoney(v.money))),
    h('p', { class: 'muted', style: { fontSize: '0.85em' } }, 'Precios en eurodólares fijados por la corporación de cada categoría y ajustados por las existencias de esta tienda: cuando los jugadores compran sube, cuando venden baja.'),
    h('table', { class: 'sheet' }, h('tr', {}, h('th', {}, 'Artículo'), h('th', {}, 'Precio'), h('th', {}, 'Existencias'), h('th', {}, '')), ...rows),
    h('h3', {}, 'Vender'), sell);
}

export function marketPanel(_ctx: LifeCtx, v: MarketView) {
  showPanel('market-panel', 'Red de mercado de Ciudad Vértice',
    h('p', { class: 'muted' }, `Las corporaciones fijan el margen de cada categoría. Próxima revisión de márgenes en ~${v.nextPolicyInMin} min.`),
    h('div', { class: 'grid2' }, ...v.corps.map((c) => h('div', { class: 'choice' }, h('h4', {}, c.name), h('p', {}, c.motto), h('p', {}, `Controla: ${c.categories.map((x) => CAT[x] ?? x).join(', ')}`),
      h('p', { class: 'mono' }, `Margen ×${c.markup.toFixed(2)} `, h('span', { class: c.trend > 0 ? 'netbad' : c.trend < 0 ? 'netok' : 'muted' }, c.trend > 0 ? `▲ ${c.trend} %` : c.trend < 0 ? `▼ ${-c.trend} %` : '='))))),
    h('h3', {}, 'Boletín'), v.bulletin.length ? h('ul', {}, ...v.bulletin.slice(0, 8).map((b) => h('li', {}, b.text))) : h('p', { class: 'muted' }, 'Sin novedades todavía.'),
    h('h3', {}, 'Precios por tienda'),
    h('table', { class: 'sheet' }, h('tr', {}, h('th', {}, 'Artículo'), h('th', {}, 'Base'), h('th', {}, 'Dónde (precio · existencias)')),
      ...v.table.map((r) => h('tr', {}, h('td', {}, r.name, h('div', { class: 'muted', style: { fontSize: '0.8em' } }, CAT[r.category] ?? r.category)), h('td', { class: 'mono' }, `${r.base}`),
        h('td', { style: { fontSize: '0.85em' } }, r.prices.sort((a, b) => a.price - b.price).map((p) => `${p.shopName}: ${p.price} €$ (${p.stock})`).join(' · '))))));
}

export function jobsPanel(ctx: LifeCtx, v: JobsView, filter: { mine: boolean } = { mine: true }) {
  const prof = v.professions.find((p) => p.id === v.profession);
  const list = v.jobs.filter((j) => !filter.mine || j.available || j.profession === v.profession).sort((a, b) => Number(b.available) - Number(a.available) || a.minRank - b.minRank);
  const sel = h('select', { 'aria-label': 'Cambiar de oficio' }, ...v.professions.map((p) => h('option', { value: p.id, selected: p.id === v.profession }, `${p.name} (${p.kind})`)));
  showPanel('jobs-panel', 'Bolsa de empleo',
    h('p', {}, `Oficio: `, h('b', {}, prof?.name ?? v.profession), ` · rango ${v.rank} (${v.xp} XP de oficio) · Ventaja: ${prof?.perk ?? '—'}`),
    v.activeJob ? h('div', { class: 'choice' }, h('b', {}, `Empleo aceptado: ${v.jobs.find((j) => j.id === v.activeJob)?.title}`), ' — ',
      h('button', { class: 'btn small primary', onclick: () => ctx.net.send({ t: 'jobStart' } as any) }, 'Empezar turno'), ' ',
      h('button', { class: 'btn small', onclick: () => ctx.net.send({ t: 'jobQuit' } as any) }, 'Dejarlo')) : null,
    h('div', { class: 'row' }, h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: filter.mine, onchange: (e: any) => jobsPanel(ctx, v, { mine: e.target.checked }) }), 'Solo mi oficio y trabajos libres'),
      h('span', { class: 'muted' }, ' · Cambiar de oficio (reinicia el rango, 1 vez al día): '), sel,
      h('button', { class: 'btn small', onclick: () => { if (confirm('Cambiar de oficio reinicia tu rango a 0. ¿Seguir?')) ctx.net.send({ t: 'profession', profession: sel.value, opId: newOpId() } as any); } }, 'Cambiar')),
    h('p', { class: 'muted', style: { fontSize: '0.85em' } }, `${v.jobs.length} empleos en ${v.professions.length} oficios. Al aceptar uno, ve a su puesto y empieza el turno: tu personaje trabaja solo y cobras al terminar. Trabajar da hambre, sed y sueño al doble de ritmo.`),
    h('table', { class: 'sheet' }, h('tr', {}, h('th', {}, 'Empleo'), h('th', {}, 'Lugar'), h('th', {}, 'Paga'), h('th', {}, 'Éxito'), h('th', {}, '')),
      ...list.map((j) => h('tr', {},
        h('td', {}, h('b', {}, j.title), j.legal ? '' : h('span', { class: 'netbad' }, ' · ilegal'), h('div', { class: 'muted', style: { fontSize: '0.82em' } }, `${j.professionName} · ${j.employer} · ${j.desc}${j.risk ? ` · riesgo ${pct(j.risk)}` : ''}${j.minRank ? ` · rango ${j.minRank}+` : ''}`)),
        h('td', { style: { fontSize: '0.85em' } }, `${j.place} (${j.zoneName})`),
        h('td', { class: 'mono' }, `${j.pay} €$`, h('div', { class: 'muted' }, `${j.seconds} s`)),
        h('td', { class: 'mono' }, pct(j.chance)),
        h('td', {}, j.available ? h('button', { class: 'btn small', onclick: () => ctx.net.send({ t: 'jobAccept', job: j.id } as any) }, v.activeJob === j.id ? 'Aceptado' : 'Aceptar') : h('span', { class: 'muted', style: { fontSize: '0.8em' } }, j.reason ?? '')))),
    ));
}

export function clinicPanel(ctx: LifeCtx, v: ClinicView) {
  const confirmOp = (o: ClinicOffer) => {
    const ov = h('div', { class: 'overlay' }, h('div', { class: 'reward', role: 'dialog' },
      h('h2', {}, `${o.action === 'install' ? 'Instalar' : 'Retirar'} ${o.name}`),
      h('p', {}, `Peligrosidad: `, h('b', { class: o.danger === 'Baja' ? 'netok' : o.danger === 'Moderada' ? 'netmid' : 'netbad' }, o.danger)),
      h('ul', {},
        h('li', {}, 'Probabilidad de sobrevivir: ', h('b', {}, pct(o.survival))),
        h('li', {}, 'Probabilidad de que salga limpia: ', h('b', {}, pct(o.clean))),
        o.theft ? h('li', { class: 'netbad' }, `Riesgo de que te roben mientras estás sedado: ${pct(o.theft)}`) : null,
        h('li', {}, `Precio: ${fmtMoney(o.price)}`),
        h('li', {}, `Humanidad tras la operación: ${o.humanityAfter} · Capacidad de cromo: ${o.capacityAfter}/${v.chromeCapacity}`)),
      h('p', { class: 'muted' }, 'Si mueres en la mesa, pierdes este personaje para siempre.'),
      h('div', { class: 'row' }, h('button', { class: 'btn danger', onclick: () => { ov.remove(); ctx.net.send({ t: 'clinicDo', doc: v.doc, action: o.action, source: o.source, ref: o.ref, opId: newOpId() } as any); } }, 'Operar'),
        h('button', { class: 'btn', onclick: () => ov.remove() }, 'Cancelar'))));
    $ui().append(ov);
  };
  const row = (o: ClinicOffer) => h('tr', {},
    h('td', {}, h('b', {}, o.name), ` · grado ${['I', 'II', 'III', 'IV', 'V'][o.grade - 1]}`, o.stolen ? h('span', { class: 'netbad' }, ' · robado') : '',
      h('div', { class: 'muted', style: { fontSize: '0.82em' } }, `${o.family} · ranura ${o.slot} · ${o.desc} · capacidad ${o.capacity}, Humanidad −${o.humanity}`)),
    h('td', { class: 'mono' }, fmtMoney(o.price)),
    h('td', { class: 'mono' }, h('span', { class: o.survival > 0.97 ? 'netok' : o.survival > 0.9 ? 'netmid' : 'netbad' }, pct(o.survival)), h('div', { class: 'muted' }, o.danger)),
    h('td', {}, o.blocked ? h('span', { class: 'muted', style: { fontSize: '0.8em' } }, o.blocked) : h('button', { class: 'btn small', onclick: () => confirmOp(o) }, o.action === 'install' ? 'Instalar…' : 'Retirar…')));
  const groups: [string, ClinicOffer[]][] = [
    ['Catálogo (procedencia verificada)', v.offers.filter((o) => o.source === 'stock')],
    ['Bajo el mostrador (robado)', v.offers.filter((o) => o.source === 'stolen')],
    ['Traído por ti', v.offers.filter((o) => o.source === 'inventory')],
    ['Instalado (retirada)', v.offers.filter((o) => o.source === 'installed')],
  ];
  showPanel('clinic-panel', v.name,
    h('p', {}, `Calidad ${'★'.repeat(v.skill)}${'☆'.repeat(5 - v.skill)} · ${v.morality} · `, h('b', { class: v.dangerLabel.startsWith('Peligroso') ? 'netbad' : v.dangerLabel === 'De confianza' ? 'netok' : 'netmid' }, v.dangerLabel)),
    h('p', { class: 'muted' }, v.desc),
    h('p', { class: 'mono' }, `Saldo ${fmtMoney(v.money)} · Humanidad ${v.humanity}/${v.humanityMax} · Cromo ${v.chromeUsed}/${v.chromeCapacity} · Reputación con su gente ${v.rep}`),
    ...groups.filter(([, l]) => l.length).flatMap(([t, l]) => [h('h3', {}, t), h('table', { class: 'sheet' }, h('tr', {}, h('th', {}, 'Implante'), h('th', {}, 'Precio'), h('th', {}, 'Supervivencia'), h('th', {}, '')), ...l.map(row))]));
}

export function bountyPanel(ctx: LifeCtx, v: BountyView) {
  const tsel = h('select', { 'aria-label': 'Objetivo' }, ...v.targets.map((t) => h('option', { value: `${t.kind}|${t.id}` }, t.name)), h('option', { value: 'player|__otro' }, 'Otro jugador (escribe su nombre)…'));
  const other = h('input', { placeholder: 'Nombre del personaje', maxLength: 20 });
  const amount = h('input', { type: 'number', min: 100, step: 50, value: 200, style: { width: '7em' } });
  const reason = h('input', { placeholder: 'Motivo (visible para todos)', maxLength: 120, style: { width: '18em' } });
  showPanel('bounty-panel', 'Recompensas',
    h('p', { class: 'muted' }, 'Cualquiera puede poner precio a la cabeza de un jugador o de un fugitivo. El dinero queda retenido hasta que alguien lo cobre; si el objetivo muere sin que nadie cobre, se te devuelve. Cobrar una recompensa no es delito. En zonas protegidas no se puede atacar.'),
    h('table', { class: 'sheet' }, h('tr', {}, h('th', {}, 'Objetivo'), h('th', {}, 'Recompensa'), h('th', {}, 'Anunciante y motivo'), h('th', {}, 'Último lugar')),
      ...v.active.map((b) => h('tr', { style: b.onMe ? { background: 'rgba(176,16,48,0.25)' } : {} }, h('td', {}, h('b', {}, b.targetName), b.kind === 'npc' ? ' (fugitivo)' : '', b.onMe ? h('span', { class: 'netbad' }, ' · ¡eres tú!') : '', b.mine ? h('span', { class: 'cy' }, ' · la tuya') : ''),
        h('td', { class: 'mono' }, `${b.amount} €$`), h('td', { style: { fontSize: '0.85em' } }, `${b.poster}: ${b.reason}`), h('td', { class: 'muted' }, b.zone ?? (b.online === false ? 'desconectado' : '—'))))),
    h('h3', {}, 'Poner una recompensa'),
    h('div', { class: 'row' }, tsel, other, amount, reason,
      h('button', { class: 'btn primary', onclick: () => {
        const [kind, id] = tsel.value.split('|');
        const target = id === '__otro' ? other.value.trim() : kind === 'player' ? id : id;
        if (!target) return ctx.toast('Elige un objetivo.', 'warn');
        ctx.net.send({ t: 'bountyPlace', kind, target, amount: Number(amount.value), reason: reason.value.trim() || 'Sin motivo declarado', opId: newOpId() } as any);
      } }, 'Publicar')),
    h('p', { class: 'muted' }, `Tu saldo: ${fmtMoney(v.money)}`));
}

export function targetMenu(ctx: LifeCtx, v: TargetMenuView, at: { x: number; y: number }) {
  document.getElementById('target-menu')?.remove();
  const m = h('div', { class: 'hud', id: 'target-menu', role: 'menu', style: { position: 'fixed', left: `${Math.min(window.innerWidth - 300, at.x + 12)}px`, top: `${Math.min(window.innerHeight - 220, at.y)}px`, width: '290px', zIndex: '30' } },
    h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('b', {}, v.name), h('button', { class: 'btn small', onclick: () => m.remove() }, '✕')),
    ...(v.options.length ? v.options.map((o) => h('div', { style: { marginTop: '6px' } },
      h('button', { class: 'btn small', disabled: !!o.disabled, style: { width: '100%', textAlign: 'left' }, onclick: () => {
        ctx.net.send(o.id === 'rescue' ? { t: 'rescue', target: v.target, opId: newOpId() } as any : { t: 'hostile', target: v.target, action: o.id, opId: newOpId() } as any);
        m.remove(); blip();
      } }, `${o.label}${o.chance !== undefined ? ` · ${pct(o.chance)}` : ''}`),
      h('div', { class: 'muted', style: { fontSize: '0.8em' } }, o.disabled ?? o.detail ?? ''))) : [h('p', { class: 'muted' }, 'No hay acciones posibles.')]));
  $ui().append(m);
  setTimeout(() => m.remove(), 12000);
}

export function deathScreen(s: DeathSummary, onNew: () => void) {
  const ov = h('div', { class: 'overlay', style: { background: 'rgba(40,0,10,0.85)' } }, h('div', { class: 'reward', style: { borderColor: 'var(--red)' } },
    h('h2', { style: { color: 'var(--red)' } }, `${s.name} ha muerto`),
    h('p', {}, s.cause),
    h('ul', {}, h('li', {}, `${s.role} · ${s.profession} · nivel ${s.level}`), h('li', {}, `Lugar: ${s.place}`), h('li', {}, `Sobrevivió ${s.minutesAlive} min reales`),
      h('li', {}, `Turnos de trabajo: ${s.jobs} · encargos completados: ${s.contracts}`), h('li', {}, `Dinero perdido: ${fmtMoney(s.money)}`)),
    h('p', { class: 'muted' }, 'Una sola vida: su nivel, implantes, equipo y dinero se pierden. Tu cuenta conserva ajustes y el memorial.'),
    h('button', { class: 'btn primary', onclick: () => { ov.remove(); onNew(); } }, 'Volver al menú y empezar otra vida')));
  $ui().append(ov);
}
