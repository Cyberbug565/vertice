// Paneles de la v0.2: tienda, red de mercado, empleos, matasanos, recompensas, menú de acciones y pantalla de muerte.
import type { AmbarView, BountyView, ClinicOffer, ClinicView, CharacterSheet, DeathSummary, FactionsView, JobsView, MarketView, ShopView, TargetMenuView } from '@vertice/shared';
import { RARITY_COLOR, RARITY_LABEL } from '@vertice/shared';
import { content } from '../content';
import type { Net } from '../net';
import { newOpId } from '../net';
import { $ui, fmtMoney, h, ask } from './dom';
import { recordPanel } from './record';
import { blip } from '../audio';
import { tryClothingRoom, tryCyberRoom } from './fitting-room';
import { garmentFits } from './fitting-model';

export interface LifeCtx { sheet?: () => CharacterSheet | null; stopForPreview?: () => void; net: Net; toast: (t: string, k?: 'info' | 'good' | 'warn' | 'bad') => void }

const pct = (p: number) => (p > 0.99 && p < 1 ? `${(p * 100).toFixed(1).replace('.', ',')} %` : `${Math.round(p * 100)} %`);
const CAT: Record<string, string> = { comida: 'Comida', bebida: 'Bebida', medicina: 'Medicina', ciberware: 'Ciberware', herramienta: 'Herramientas', arma: 'Armas', ropa: 'Ropa', chatarra: 'Chatarra', mision: 'Misión', equipo: 'Equipo', contrabando: 'Contrabando' };

/** Muestra o reemplaza un panel sin alternar (para refrescos tras comprar u operar). */
export function showPanel(id: string, title: string, ...body: (Node | string | null)[]) {
  const old = document.getElementById(id);
  const scroll = old?.scrollTop ?? 0;
  for (const pid of ['journal-panel', 'sheet-panel', 'inv-panel', 'settings-panel', 'map-panel', 'shop-panel', 'market-panel', 'jobs-panel', 'clinic-panel', 'bounty-panel', 'factions-panel', 'ambar-panel', 'world-panel', 'building-panel', 'realty-panel', 'dealer-panel', 'props-panel', 'stash-panel', 'market-live-panel', 'hiring-panel', 'elevator-panel', 'auto-panel', 'search-panel', 'trunk-panel', 'underworld-panel', 'legend-panel', 'cheat-panel']) if (pid !== id) document.getElementById(pid)?.remove();
  const p = h('div', { class: 'panel', id, role: 'dialog', 'aria-label': title }, h('div', { class: 'panel-head' }, h('h2', {}, title), h('button', { class: 'btn small close', onclick: () => p.remove() }, 'Cerrar ✕')), ...body.filter(Boolean) as Node[]);
  if (old) old.replaceWith(p); else $ui().append(p);
  p.scrollTop = scroll;
  return p;
}

export function shopPanel(ctx: LifeCtx, v: ShopView) {
  const sheet = ctx.sheet?.();
  const rows = v.items.map((it) => {
    const d = content.items.find(x => x.id === it.item);
    const implant = it.item.startsWith('cyber:') ? content.cyberware.find(x => x.id === it.item.slice(6)) : undefined;
    const fits = sheet && d && garmentFits(sheet, d);
    return h('tr', {},
      h('td', {}, h('b', {}, it.name), h('div', { class: 'muted', style: { fontSize: '0.85em' } }, `${CAT[it.category] ?? it.category} · ${it.desc}`)),
      h('td', { class: 'mono' }, `${it.price} €$`, it.discount ? h('div', { class: 'cy', style: { fontSize: '0.8em' } }, `−${it.discount} %`) : '', h('div', { class: it.trend > 5 ? 'netbad' : it.trend < -5 ? 'netok' : 'muted', style: { fontSize: '0.8em' } }, it.trend > 0 ? `▲ ${it.trend} %` : it.trend < 0 ? `▼ ${-it.trend} %` : '= precio corp.')),
      h('td', { class: 'mono' }, `${it.stock} uds.`),
      h('td', {}, h('div', { class: 'row' },
        sheet && d?.wear ? h('button', { class: 'btn small', disabled: !fits, title: fits ? undefined : 'Prenda para el otro cuerpo',
          onclick: () => { ctx.stopForPreview?.(); tryClothingRoom(sheet, d); } }, 'Probar') : null,
        sheet && implant ? h('button', { class: 'btn small', onclick: () => { ctx.stopForPreview?.(); tryCyberRoom(sheet, implant); } }, 'Simular') : null,
        h('button', { class: 'btn small', disabled: it.price > v.money || it.stock < 1, onclick: () => { ctx.net.send({ t: 'buy', shop: v.shop, item: it.item, qty: 1, opId: newOpId() } as any); blip(); } }, 'Comprar'),
        v.bar && it.category === 'bebida' ? h('button', { class: 'btn small primary', disabled: !it.owned, 'data-bar-drink': it.item,
          'aria-label': `Beber ${it.name}`, onclick: () => ctx.net.send({ t: 'useItem', item: it.item, opId: newOpId() }) }, 'Beber') : null,
        !it.item.startsWith('cyber:') && it.stock > 0 ? h('button', { class: 'btn small danger', title: `Destreza + Sigilo + 1d10 contra la seguridad (${v.security}). Si fallas: paliza y nivel de búsqueda.`, onclick: () => { ask(`Intentar robar ${it.name}. Probabilidad ${pct(it.stealChance)}. Si fallas, el vigilante te hará daño y subirá tu nivel de búsqueda. ¿Seguir?`, () => { ctx.net.send({ t: 'steal', shop: v.shop, item: it.item, opId: newOpId() } as any); }); } }, `Robar ${pct(it.stealChance)}`) : null)));
  });
  const sell = v.sell.length ? h('table', { class: 'sheet' }, ...v.sell.map((s) => h('tr', {}, h('td', {}, s.name), h('td', { class: 'mono' }, `×${s.qty}`), h('td', { class: 'mono' }, `${s.price} €$/u`),
    h('td', {}, h('button', { class: 'btn small', onclick: () => ctx.net.send({ t: 'sell', shop: v.shop, item: s.item, qty: 1, opId: newOpId() } as any) }, 'Vender 1'))))) : h('p', { class: 'muted' }, 'Aquí no compran nada de lo que llevas.');
  showPanel('shop-panel', v.name,
    h('p', { class: 'muted' }, `Propiedad: ${v.ownerName} · Seguridad ${v.security}${v.fence ? ' · Perista: compra de todo, sin preguntas' : ''} · Tu saldo: `, h('b', { class: 'cy' }, fmtMoney(v.money))),
    h('p', { class: 'muted', style: { fontSize: '0.85em' } }, v.bar ? 'Compra una bebida y pulsa Beber para tomarla en el local. También puedes llevártela en el inventario.' : 'Precios en eurodólares fijados por la corporación de cada categoría y ajustados por las existencias de esta tienda: cuando los jugadores compran sube, cuando venden baja.'),
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
      h('button', { class: 'btn small', onclick: () => { ask('Cambiar de oficio reinicia tu rango a 0. ¿Seguir?', () => { ctx.net.send({ t: 'profession', profession: sel.value, opId: newOpId() } as any); }, { danger: true }); } }, 'Cambiar')),
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
  const sheet = ctx.sheet?.();
  const confirmOp = (o: ClinicOffer) => {
    const side = h('select', { 'aria-label': 'Lado del implante' }, ...(o.sides ?? []).map((s) => h('option', { value: s }, s === 'izq' ? 'Izquierdo' : 'Derecho'))) as HTMLSelectElement;
    const ov = h('div', { class: 'overlay' }, h('div', { class: 'reward', role: 'dialog' },
      h('h2', {}, `${o.action === 'install' ? 'Instalar' : 'Retirar'} ${o.name}`),
      o.sides?.length ? h('label', {}, 'Lado del implante ', side) : null,
      h('p', {}, `Peligrosidad: `, h('b', { class: o.danger === 'Baja' ? 'netok' : o.danger === 'Moderada' ? 'netmid' : 'netbad' }, o.danger)),
      h('ul', {},
        h('li', {}, 'Probabilidad de sobrevivir: ', h('b', {}, pct(o.survival))),
        h('li', {}, 'Probabilidad de que salga limpia: ', h('b', {}, pct(o.clean))),
        o.theft ? h('li', { class: 'netbad' }, `Riesgo de que te roben mientras estás sedado: ${pct(o.theft)}`) : null,
        h('li', {}, `Precio: ${fmtMoney(o.price)}`),
        h('li', {}, `Humanidad tras la operación: ${o.humanityAfter} · Capacidad de cromo: ${o.capacityAfter}/${v.chromeCapacity}`)),
      o.warning ? h('p', { class: 'netbad' }, `⚠ ${o.warning}`) : null,
      h('p', { class: 'muted' }, 'Si mueres en la mesa, pierdes este personaje para siempre.'),
      h('div', { class: 'row' }, h('button', { class: 'btn danger', onclick: () => { ov.remove(); ctx.net.send({ t: 'clinicDo', doc: v.doc, action: o.action, source: o.source, ref: o.ref, side: side.value || undefined, opId: newOpId() } as any); } }, 'Operar'),
        h('button', { class: 'btn', onclick: () => ov.remove() }, 'Cancelar'))));
    $ui().append(ov);
  };
  const row = (o: ClinicOffer) => {
    const implant = content.cyberware.find(x => x.id === o.def);
    return h('tr', {},
      h('td', {}, h('b', { style: { color: RARITY_COLOR[o.rarity ?? 'comun'] } }, o.name), ` · ${RARITY_LABEL[o.rarity ?? 'comun']}${o.part ? (o.part.endsWith('izq') ? ' · izq.' : ' · der.') : ''} · grado ${['I', 'II', 'III', 'IV', 'V'][o.grade - 1]}`, o.line === 'taller' ? h('span', { class: 'netbad' }, ' · sin licencia') : o.line === 'certificado' ? h('span', { class: 'netok' }, ' · certificado') : '',
        o.stolen ? h('span', { class: 'netbad' }, ' · robado') : '',
        h('div', { class: 'muted', style: { fontSize: '0.82em' } }, `${o.family} · ranura ${o.slot} · ${o.desc} · capacidad ${o.capacity}, Humanidad −${o.humanity}`)),
      h('td', { class: 'mono' }, fmtMoney(o.price)),
      h('td', { class: 'mono' }, h('span', { class: o.survival > 0.97 ? 'netok' : o.survival > 0.9 ? 'netmid' : 'netbad' }, pct(o.survival)), h('div', { class: 'muted' }, o.danger)),
      h('td', {}, h('div', { class: 'row wrap' },
        sheet && implant ? h('button', { class: 'btn small', onclick: () => { ctx.stopForPreview?.(); tryCyberRoom(sheet, implant, o); } }, 'Simular') : null,
        o.blocked ? h('span', { class: 'muted', style: { fontSize: '0.8em' } }, o.blocked) : h('button', { class: 'btn small', onclick: () => confirmOp(o) }, o.action === 'install' ? 'Instalar…' : 'Retirar…'))));
  };
  const groups: [string, ClinicOffer[]][] = [
    ['Gama certificada', v.offers.filter((o) => o.source === 'stock' && o.line === 'certificado')],
    ['Catálogo general', v.offers.filter((o) => o.source === 'stock' && !o.line)],
    ['Modificaciones sin licencia', v.offers.filter((o) => o.source === 'stock' && o.line === 'taller')],
    ['Bajo el mostrador (robado)', v.offers.filter((o) => o.source === 'stolen')],
    ['Traído por ti', v.offers.filter((o) => o.source === 'inventory')],
    ['Instalado (retirada)', v.offers.filter((o) => o.source === 'installed')],
  ];
  showPanel('clinic-panel', v.name,
    h('p', {}, `Calidad ${'★'.repeat(v.skill)}${'☆'.repeat(5 - v.skill)} · ${v.morality} · `, h('b', { class: v.dangerLabel.startsWith('Peligroso') ? 'netbad' : v.dangerLabel === 'De confianza' ? 'netok' : 'netmid' }, v.dangerLabel)),
    h('p', { class: 'muted' }, v.desc),
    h('p', { class: 'mono' }, `Saldo ${fmtMoney(v.money)} · Humanidad ${v.humanity}/${v.humanityMax} · Cromo ${v.chromeUsed}/${v.chromeCapacity} · Reputación con su gente ${v.rep}`),
    v.chromeUsed > v.chromeCapacity ? h('p', { class: 'netbad' }, `⚠ Llevas más cromo del que tu cuerpo aguanta (${v.chromeUsed}/${v.chromeCapacity}). Cuanto más te pases y más tiempo, más cerca estarás de la ciberpsicosis.`) : null,
    v.heal ? h('div', { class: 'fcard', style: { borderTopColor: '#ff3040' } }, h('b', {}, '🩹 Curar heridas'),
      h('div', { class: 'small' }, `${v.heal.wounds ? `Te saca las balas, sutura los cortes, desinfecta, venda y te da antibióticos (${v.heal.wounds} herida${v.heal.wounds === 1 ? '' : 's'}). Luego tienen que cerrar con el tiempo y descanso.` : ''}${v.heal.amputations ? ` Te falta ${v.heal.amputations === 1 ? 'un miembro' : `${v.heal.amputations} miembros`}: no se regenera; cómprale una prótesis (brazo, mano o pierna) y te la implanta.` : ''}`),
      v.heal.wounds ? h('button', { class: 'btn small primary', disabled: v.money < v.heal.price, onclick: () => ctx.net.send({ t: 'clinicHeal', doc: v.doc, opId: newOpId() } as any) }, `Curar · ${fmtMoney(v.heal.price)}`) : null) : null,
    v.repair ? h('div', { class: 'fcard', style: { borderTopColor: '#43f3ff' } }, h('b', {}, '🔧 Reparar cromo dañado'),
      h('div', { class: 'small' }, `Partes: ${v.repair.parts.map((k) => k.replace('_', ' ')).join(', ')}. Los miembros robóticos no sangran, pero dañados fallan (puntería y velocidad).`),
      h('button', { class: 'btn small primary', disabled: v.money < v.repair.price, onclick: () => ctx.net.send({ t: 'repairChrome', doc: v.doc, opId: newOpId() } as any) }, `Reparar · ${fmtMoney(v.repair.price)}`)) : null,
    ...groups.filter(([, l]) => l.length).flatMap(([t, l]) => [h('h3', {}, t), h('table', { class: 'sheet' }, h('tr', {}, h('th', {}, 'Implante'), h('th', {}, 'Precio'), h('th', {}, 'Supervivencia'), h('th', {}, '')), ...l.map(row))]));
}

export function bountyPanel(ctx: LifeCtx, v: BountyView) {
  const tsel = h('select', { 'aria-label': 'Objetivo' }, ...v.targets.map((t) => h('option', { value: `${t.kind}|${t.id}` }, t.name)), h('option', { value: 'player|__otro' }, 'Otro jugador (escribe su nombre)…'));
  const other = h('input', { placeholder: 'Nombre del personaje', maxLength: 20 });
  const amount = h('input', { type: 'number', min: 100, step: 50, value: 200, style: { width: '7em' } });
  const reason = h('input', { placeholder: 'Motivo (visible para todos)', maxLength: 120, style: { width: '18em' } });
  const alive = h('input', { type: 'checkbox' }) as HTMLInputElement;
  showPanel('bounty-panel', 'Recompensas',
    h('p', { class: 'muted' }, 'Cualquiera puede poner precio a la cabeza de un jugador o de un fugitivo. El dinero queda retenido hasta que alguien lo cobre; si el objetivo muere sin que nadie cobre, se te devuelve. Cobrar una recompensa no es delito. En zonas protegidas no se puede atacar.'),
    h('table', { class: 'sheet' }, h('tr', {}, h('th', {}, 'Objetivo'), h('th', {}, 'Recompensa'), h('th', {}, 'Anunciante y motivo'), h('th', {}, 'Último lugar')),
      ...v.active.map((b) => h('tr', { style: b.onMe ? { background: 'rgba(176,16,48,0.25)' } : {} }, h('td', {}, h('b', {}, b.targetName), b.kind === 'npc' ? ' (fugitivo)' : '', b.onMe ? h('span', { class: 'netbad' }, ' · ¡eres tú!') : '', b.mine ? h('span', { class: 'cy' }, ' · la tuya') : ''),
        h('td', { class: 'mono' }, `${b.amount} €$`, b.aliveOnly ? h('div', { class: 'chip', style: { background: '#2a6a3a' } }, 'VIVO') : h('div', { class: 'chip', style: { background: '#6a1a2a' } }, 'VIVO O MUERTO')), h('td', { style: { fontSize: '0.85em' } }, `${b.poster}: ${b.reason}`), h('td', { class: 'muted' }, b.zone ?? (b.online === false ? 'desconectado' : '—'))))),
    h('h3', {}, 'Poner una recompensa'),
    h('div', { class: 'row' }, tsel, other, amount, reason,
      h('button', { class: 'btn primary', onclick: () => {
        const [kind, id] = tsel.value.split('|');
        const target = id === '__otro' ? other.value.trim() : kind === 'player' ? id : id;
        if (!target) return ctx.toast('Elige un objetivo.', 'warn');
        ctx.net.send({ t: 'bountyPlace', kind, target, amount: Number(amount.value), reason: reason.value.trim() || 'Sin motivo declarado', aliveOnly: alive.checked, opId: newOpId() } as any);
      } }, 'Publicar')),
    h('label', { class: 'row' }, alive, 'Lo quiero VIVO (solo cobra quien lo deje KO; si muere, se te devuelve el dinero)'),
    h('p', { class: 'muted' }, `Tu saldo: ${fmtMoney(v.money)}`));
}

const GROUPS: Record<string, { label: string; color: string }> = { social: { label: 'Social', color: '#43f3ff' }, ayuda: { label: 'Ayuda', color: '#5affc8' }, combate: { label: 'Combate', color: '#ff3040' }, red: { label: 'Red (hackeo)', color: '#b46cff' } };
/** Zona del cuerpo a la que apuntas (se recuerda entre menús). */
let aimPart: string = 'torso';
const PARTS: [string, string, string][] = [['torso', 'Torso', 'Sin penalización · daño normal'], ['cabeza', 'Cabeza', '−4 a acertar · daño ×2 · golpes contundentes: KO'], ['brazos', 'Brazos', '−2 · daño ×0,7 · puede perder el brazo'], ['manos', 'Manos', '−3 · daño ×0,5 · puede hacerle soltar el arma'], ['piernas', 'Piernas', '−2 · daño ×0,75 · puede perder la pierna (y no podrá correr)']];
export function targetMenu(ctx: LifeCtx, v: TargetMenuView, at: { x: number; y: number }, onInteract?: (id: string) => void) {
  document.getElementById('target-menu')?.remove();
  const combat = v.options.some((o) => ['attack', 'knockout', 'aim'].includes(o.id));
  const partRow = combat ? h('div', { class: 'ctx-parts', role: 'radiogroup', 'aria-label': 'Zona del cuerpo' }, h('span', { class: 'muted', style: { fontSize: '0.78em' } }, 'Apuntar a:'),
    ...PARTS.map(([id, label, tip]) => h('button', { class: `chip-btn${aimPart === id ? ' on' : ''}`, title: tip, role: 'radio', 'aria-checked': String(aimPart === id), onclick: (ev: Event) => { aimPart = id; (ev.currentTarget as HTMLElement).parentElement!.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === ev.currentTarget)); } }, label))) : null;
  const groups = ['social', 'ayuda', 'combate', 'red'].map((g) => [g, v.options.filter((o) => o.group === g)] as const).filter(([, l]) => l.length);
  const m = h('div', { class: 'ctx-menu', id: 'target-menu', role: 'menu', style: { left: `${Math.min(window.innerWidth - 330, at.x + 12)}px`, top: `${Math.max(10, Math.min(window.innerHeight - 420, at.y - 40))}px`, borderColor: v.color ?? 'var(--line)' } },
    h('div', { class: 'ctx-head', style: { background: `linear-gradient(90deg, ${v.color ?? '#3a1440'}55, transparent)` } }, h('div', {}, h('b', {}, v.name), v.subtitle ? h('div', { class: 'muted', style: { fontSize: '0.8em' } }, v.subtitle) : null), h('button', { class: 'btn small', onclick: () => m.remove() }, '✕')),
    ...(groups.length ? groups.map(([g, list]) => h('div', { class: 'ctx-group' }, h('div', { class: 'ctx-glabel', style: { color: GROUPS[g].color } }, GROUPS[g].label), g === 'combate' ? partRow : null,
      ...list.map((o) => h('button', { class: `ctx-opt${o.danger ? ' danger' : ''}`, role: 'menuitem', disabled: !!o.disabled, style: { borderLeftColor: GROUPS[g].color }, title: o.disabled ?? o.detail ?? '', onclick: () => {
        if (o.kind === 'interact') onInteract?.(o.id);
        else if (o.kind === 'hack') ctx.net.send({ t: 'hack', target: v.target, hack: o.id.slice(5), opId: newOpId() } as any);
        else if (o.id.startsWith('extract:')) ctx.net.send({ t: 'hostile', target: v.target, action: 'extract', chrome: o.id.slice(8), opId: newOpId(), remote: true } as any);
        else if (o.id === 'rescue') ctx.net.send({ t: 'rescue', target: v.target, opId: newOpId() } as any);
        else if (o.id === 'drop') ctx.net.send({ t: 'drop' } as any);
        else if (o.id === 'bribe') ctx.net.send({ t: 'bribe', opId: newOpId() } as any);
        else if (['attack', 'knockout', 'aim', 'claim'].includes(o.id)) ctx.net.send({ t: 'hostile', target: v.target, action: o.id, opId: newOpId(), part: aimPart, remote: true } as any);
        else ctx.net.send({ t: 'hostile', target: v.target, action: o.id, opId: newOpId(), remote: true } as any);
        m.remove(); blip();
      } }, h('span', {}, o.label), o.chance !== undefined ? h('span', { class: 'ctx-chance', style: { color: o.chance >= 0.7 ? 'var(--green)' : o.chance >= 0.4 ? 'var(--yellow)' : 'var(--red)' } }, pct(o.chance)) : null,
        h('div', { class: 'ctx-detail' }, o.disabled ?? o.detail ?? ''))))) : [h('p', { class: 'muted' }, 'No hay acciones posibles.')]));
  $ui().append(m);
  const close = (e: MouseEvent) => { if (!m.contains(e.target as Node)) { m.remove(); window.removeEventListener('mousedown', close, true); } };
  setTimeout(() => window.addEventListener('mousedown', close, true), 50);
}

export function factionsPanel(_ctx: LifeCtx, v: FactionsView) {
  const kinds: Record<string, string> = { gang: 'Banda', corp: 'Corporación', authority: 'Autoridad', service: 'Servicio', contact: 'Contacto', neighborhood: 'Vecinos' };
  const order = ['gang', 'corp', 'authority', 'service', 'contact', 'neighborhood'];
  const list = [...v.factions].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  showPanel('factions-panel', 'Facciones de Ciudad Vértice',
    h('p', { class: 'muted' }, 'Tu relación con cada facción cambia con lo que haces. Ayudar o atacar a una facción afecta también, a la mitad, a sus aliados y enemigos. Por debajo de su umbral de hostilidad, sus miembros te atacarán en su territorio.'),
    h('div', { class: 'cards' }, ...list.map((f) => {
      const pctRep = Math.max(0, Math.min(100, (f.rep + 100) / 2));
      return h('div', { class: 'fcard', style: { borderTopColor: f.color } },
        h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('b', { style: { color: f.color } }, f.name), h('span', { class: 'chip', style: { background: f.color + '33', color: f.color } }, kinds[f.kind] ?? f.kind)),
        f.archetype ? h('div', { class: 'muted', style: { fontSize: '0.82em' } }, f.archetype) : null,
        h('p', { style: { fontSize: '0.86em', margin: '6px 0' } }, f.desc),
        h('div', { class: 'repbar' }, h('i', { style: { width: `${pctRep}%`, background: f.rep >= 20 ? 'var(--green)' : f.rep > -30 ? 'var(--yellow)' : 'var(--red)' } })),
        h('div', { class: 'row', style: { justifyContent: 'space-between', fontSize: '0.82em' } }, h('span', {}, `Tu relación: ${f.rep > 0 ? '+' : ''}${f.rep}`), h('b', {}, f.standing)),
        f.territory.length ? h('div', { style: { fontSize: '0.8em' } }, '📍 ', f.territory.join(', ')) : null,
        f.allies.length ? h('div', { style: { fontSize: '0.8em', color: 'var(--green)' } }, '🤝 ', f.allies.join(', ')) : null,
        f.enemies.length ? h('div', { style: { fontSize: '0.8em', color: 'var(--red)' } }, '⚔ ', f.enemies.join(', ')) : null);
    })));
}

export function ambarPanel(ctx: LifeCtx, v: AmbarView) {
  showPanel('ambar-panel', 'Rescate Ámbar · suscripciones',
    h('p', {}, 'Si caes herido de muerte, un equipo armado de Ámbar acude a estabilizarte… solo si eres cliente y estás en su zona de cobertura. Nadie más vendrá a por ti.'),
    v.active ? h('div', { class: 'fcard', style: { borderTopColor: '#ffbf00' } }, h('b', {}, `Plan activo: ${v.active.name}`), h('div', {}, `Rescates restantes: ${v.active.usesLeft} · caduca en ${v.active.expiresInMin} min reales`)) : h('p', { class: 'netbad' }, 'No tienes suscripción activa.'),
    h('div', { class: 'cards' }, ...v.plans.map((pl) => h('div', { class: 'fcard', style: { borderTopColor: pl.color } },
      h('h3', { style: { color: pl.color, margin: '0 0 4px' } }, pl.name), h('p', { style: { fontSize: '0.88em' } }, pl.desc),
      h('ul', { style: { fontSize: '0.85em', paddingLeft: '1.1em' } }, h('li', {}, `Llegada: ~${pl.arrival} s`), h('li', {}, `Rescates: ${pl.uses >= 99 ? 'ilimitados' : pl.uses}`), h('li', {}, `Te dejan al ${Math.round(pl.revive * 100)} % de salud`), h('li', {}, `Cobertura: ${pl.zones.join(', ')}`), h('li', {}, `Duración: ${pl.days} días de juego`)),
      h('button', { class: 'btn primary', disabled: v.money < pl.price, onclick: () => { ask(`Contratar ${pl.name} por ${pl.price} €$?`, () => { ctx.net.send({ t: 'ambar', plan: pl.id, opId: newOpId() } as any); }); } }, `Contratar · ${fmtMoney(pl.price)}`)))),
    h('p', { class: 'muted' }, `Tu saldo: ${fmtMoney(v.money)}`));
}

/** Mapa global: distritos de la megápolis colocados como en un mapa de juego. */


export function deathScreen(s: DeathSummary, onNew: () => void) {
  const ov = h('div', { class: 'overlay', style: { background: 'rgba(40,0,10,0.85)' } }, h('div', { class: 'reward', style: { borderColor: 'var(--red)' } },
    h('h2', { style: { color: 'var(--red)' } }, `${s.name} ha muerto`),
    h('p', {}, s.cause),
    h('ul', {}, h('li', {}, `${s.role} · ${s.profession} · nivel ${s.level}`), h('li', {}, `Lugar: ${s.place}`), h('li', {}, `Sobrevivió ${s.minutesAlive} min reales`),
      h('li', {}, `Turnos de trabajo: ${s.jobs} · encargos completados: ${s.contracts}`), h('li', {}, `Dinero perdido: ${fmtMoney(s.money)}`)),
    h('p', { class: 'muted' }, 'Una sola vida: su nivel, implantes, equipo y dinero se pierden. Tu cuenta conserva ajustes y el memorial.'),
    s.record ? h('button', { class: 'btn', onclick: () => recordPanel(s.record!.id, s.record) }, 'Ver expediente completo') : null,
    h('button', { class: 'btn primary', onclick: () => { ov.remove(); onNew(); } }, 'Volver a mis personajes')));
  $ui().append(ov);
}
