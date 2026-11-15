// Partida: conecta red, vista y HUD. El cliente solo envía intenciones; el servidor resuelve y confirma.
import { checkChance, chanceBand, worldToScreen, type CharacterSheet, type DialogView, type JournalEntry, type ServerMsg } from '@vertice/shared';
import { content, factionName, roleById } from './content';
import { Net, newOpId } from './net';
import { GameView, type CEnt } from './render/view';
import { settings, onSettings } from './settings';
import { blip, initAudio, setAmbientActive } from './audio';
import { $ui, clearUi, fmtMoney, h } from './ui/dom';
import { Minimap, renderZoneMap } from './ui/minimap';
import { settingsPanel } from './ui/screens';

const DANGER_TXT: Record<string, string> = { protected: 'Protegida', public: 'Pública', disputed: 'Disputada (PvP)' };
const STANCES = [
  { id: 'avoid', label: 'Evitar', desc: 'Evitar: no inicia combate; si la atacan, busca la salida y usa solo consumibles preautorizados.' },
  { id: 'defend', label: 'Defender', desc: 'Defender: responde a agresiones válidas contra ti o tu grupo, busca cobertura y no persigue.' },
  { id: 'aggressive', label: 'Agresiva', desc: 'Agresiva: ataca objetivos elegibles dentro de la orden seleccionada, gastando munición y cromo autorizados.' },
] as const;

export async function startGame(token: string, onExit: (reason?: string) => void) {
  clearUi();
  initAudio();
  const view = new GameView();
  const net = new Net(token);
  const st = {
    sheet: null as CharacterSheet | null, journal: [] as JournalEntry[], dialog: null as DialogView | null, facts: {} as Record<string, unknown>,
    zone: '', sector: '', danger: 'public', action: '', destination: '', cityHourMs: 60000, cityEpoch: 0, luck: 0,
    pending: new Map<number, (m: Extract<ServerMsg, { t: 'ack' }>) => void>(), muted: new Set<number>(),
  };
  const cityHour = () => ((((Date.now() + net.clockOffset) / st.cityHourMs + st.cityEpoch) % 24) + 24) % 24;
  const gameEl = document.getElementById('game')!;
  gameEl.replaceChildren();
  await view.init(gameEl, cityHour);

  // ---------------------------------------------------------------- HUD
  const hpBar = h('i', { style: { background: 'var(--red)' } }), stBar = h('i', { style: { background: 'var(--green)' } });
  const nameEl = h('div', {}), moneyEl = h('div', { class: 'mono' }), statsEl = h('div', { class: 'muted', style: { fontSize: '0.85em' } });
  const hpTxt = h('span', { class: 'mono' }), stTxt = h('span', { class: 'mono' });
  const tl = h('div', { class: 'hud hud-tl', 'aria-label': 'Estado del personaje' }, nameEl,
    h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('span', {}, 'Salud'), hpTxt), h('div', { class: 'bar', role: 'meter', 'aria-label': 'Salud' }, hpBar),
    h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('span', {}, 'Aguante'), stTxt), h('div', { class: 'bar', role: 'meter', 'aria-label': 'Aguante' }, stBar),
    moneyEl, statsEl);
  const mm = h('canvas', { id: 'minimap', title: 'Mapa grande (M)', onclick: () => bigMap() }) as HTMLCanvasElement;
  const minimap = new Minimap(mm);
  const sectorEl = h('div', { style: { fontWeight: '600', marginTop: '4px' } }), dangerEl = h('span', { class: 'badge' }), clockEl = h('span', { class: 'mono' }), netEl = h('span', { class: 'mono' });
  const tr = h('div', { class: 'hud hud-tr' }, mm, sectorEl, h('div', { class: 'row', style: { justifyContent: 'space-between', marginTop: '4px' } }, h('span', {}, 'Peligro ', dangerEl), clockEl), h('div', { class: 'muted', style: { fontSize: '0.8em' } }, 'Red: ', netEl));
  const actionEl = h('div', { class: 'actionline', 'aria-live': 'polite', id: 'action' });
  const progress = h('div', { class: 'progress', style: { display: 'none' } }, h('i'));
  const stanceSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Postura' });
  const renderStance = () => stanceSeg.replaceChildren(...STANCES.map((s) => h('button', { 'aria-pressed': String(st.sheet?.stance === s.id), title: s.desc, onclick: () => { net.send({ t: 'stance', stance: s.id } as any); blip(); } }, s.label)));
  const bottom = h('div', { class: 'hud hud-bottom' }, actionEl, progress, h('div', { class: 'toolbar' },
    h('button', { class: 'btn', id: 'btn-stop', onclick: () => stop(), title: 'Cancelar la orden actual (S o clic derecho)' }, 'Cancelar ', h('kbd', {}, 'S')),
    h('button', { class: 'btn danger', id: 'btn-retreat', onclick: () => retreat(), title: 'Ir al refugio protegido alcanzable más cercano' }, 'Retirada ', h('kbd', {}, 'R')),
    stanceSeg,
    h('button', { class: 'btn', id: 'btn-journal', onclick: () => journalPanel() }, 'Diario ', h('kbd', {}, 'J')),
    h('button', { class: 'btn', id: 'btn-sheet', onclick: () => sheetPanel() }, 'Ficha ', h('kbd', {}, 'C')),
    h('button', { class: 'btn', onclick: () => inventoryPanel() }, 'Inventario ', h('kbd', {}, 'I')),
    h('button', { class: 'btn', onclick: () => settingsPanel(() => view.applySettings()) }, 'Ajustes')));
  const toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
  const chatLog = h('div', { class: 'log', 'aria-live': 'polite' });
  const chatIn = h('input', { id: 'chat-input', placeholder: 'Chat local (Enter)…', maxLength: 200 }) as HTMLInputElement;
  chatIn.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { const t = chatIn.value.trim(); if (t) net.send({ t: 'chat', channel: 'local', text: t } as any); chatIn.value = ''; chatIn.blur(); }
    if (e.key === 'Escape') chatIn.blur();
  });
  const chat = h('div', { class: 'chat' }, chatLog, chatIn);
  const tooltip = h('div', { class: 'tooltip', style: { display: 'none' } });
  const dialogEl = h('div', { class: 'dialog', id: 'dialog', role: 'dialog', style: { display: 'none' } });
  const ctxOverlay = h('div', { class: 'overlay', style: { display: 'none' } }, h('div', { class: 'reward' }, h('h2', {}, 'Recuperando gráficos…'), h('p', {}, 'El contexto gráfico se ha perdido. La simulación sigue en el servidor.')));
  $ui().append(tl, tr, bottom, toasts, chat, tooltip, dialogEl, ctxOverlay);

  const toast = (text: string, kind: 'info' | 'good' | 'warn' | 'bad' = 'info') => {
    const t = h('div', { class: `toast ${kind}` }, text);
    toasts.append(t);
    while (toasts.children.length > 5) toasts.firstChild!.remove();
    setTimeout(() => t.remove(), kind === 'bad' || kind === 'warn' ? 7000 : 5000);
    if (kind === 'good') blip('good'); else if (kind === 'bad') blip('bad');
  };
  const setAction = (text: string, duration?: number) => {
    st.action = text;
    actionEl.textContent = text ? `Acción: ${text}${st.destination ? ` · Destino: ${st.destination}` : ''}` : st.destination ? `Destino: ${st.destination}` : 'Haz clic en el suelo para moverte, o en una persona, puerta u objeto para interactuar.';
    const bar = progress.firstChild as HTMLElement;
    if (duration) {
      progress.style.display = 'block';
      bar.style.transition = 'none'; bar.style.width = '0%';
      requestAnimationFrame(() => { bar.style.transition = `width ${duration}s linear`; bar.style.width = '100%'; });
    } else progress.style.display = 'none';
  };
  const renderSheet = () => {
    const s = st.sheet; if (!s) return;
    nameEl.replaceChildren(h('b', {}, s.name), ` · ${roleById(s.role)?.name ?? s.role} · nivel ${s.level}`);
    hpBar.style.width = `${(100 * s.hp) / s.hpMax}%`; stBar.style.width = `${(100 * s.stamina) / s.staminaMax}%`;
    hpTxt.textContent = `${s.hp}/${s.hpMax}`; stTxt.textContent = `${s.stamina}/${s.staminaMax}`;
    moneyEl.textContent = `${fmtMoney(s.money)} · Rep. calle ${s.streetRep}`;
    statsEl.textContent = `Suerte ${s.luck}/${s.luckMax} · XP ${s.xp}/${s.xpNext} · Carga ${s.carry}/${s.carryMax} kg`;
    renderStance();
    view.setMyAttributes(s.attributes as any);
  };
  const renderLocation = () => {
    sectorEl.textContent = st.sector;
    dangerEl.textContent = DANGER_TXT[st.danger] ?? st.danger;
    dangerEl.className = `badge d-${st.danger}`;
  };

  // ---------------------------------------------------------------- diálogo
  const renderDialog = () => {
    const d = st.dialog;
    if (!d) { dialogEl.style.display = 'none'; return; }
    dialogEl.style.display = 'block';
    dialogEl.replaceChildren(
      h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('h3', {}, d.speaker, d.title ? h('span', { class: 'muted', style: { fontWeight: '400', fontSize: '0.8em' } }, ` · ${d.title}`) : null),
        h('button', { class: 'btn small', onclick: () => net.send({ t: 'closeDialog' } as any), 'aria-label': 'Cerrar diálogo' }, 'Esc')),
      h('div', { class: 'text' }, d.text),
      h('div', { class: 'opts' }, ...d.options.map((o, i) => {
        let checkEl: HTMLElement | null = null;
        if (o.check) {
          const c = o.check;
          const luck = Math.min(st.luck, c.maxLuck);
          const p = checkChance(c.attrValue, c.skillValue, c.dv, luck, c.bonus);
          checkEl = h('div', { class: 'check' },
            h('span', {}, `Tirada: ${c.label}`),
            h('span', {}, 'Probabilidad ', h('span', { class: 'chance' }, `${Math.round(p * 100)} %`), ` (${chanceBand(p)})`),
            c.previous ? h('span', { style: { color: 'var(--yellow)' } }, 'Ya tiraste: se usará el resultado registrado') : h('span', { class: 'row' }, 'Suerte ',
              h('button', { class: 'btn small', 'aria-label': 'Menos Suerte', onclick: (e: Event) => { e.stopPropagation(); st.luck = Math.max(0, luck - 1); renderDialog(); } }, '−'),
              h('b', { class: 'mono' }, String(luck)),
              h('button', { class: 'btn small', 'aria-label': 'Más Suerte', onclick: (e: Event) => { e.stopPropagation(); st.luck = Math.min(c.maxLuck, luck + 1); renderDialog(); } }, '+'),
              h('span', { class: 'muted' }, `(tienes ${c.luckAvailable}, máx. ${c.maxLuck} por tirada; se cobra al comprometer)`)),
            h('span', { class: 'muted' }, `Si falla: ${c.failText ?? 'hay consecuencias'}`));
        }
        return h('button', { class: 'opt', id: `opt-${o.id}`, disabled: !!o.disabled, title: o.disabled ?? '', onclick: () => {
          net.send({ t: 'choose', dialog: d.dialog, option: o.id, luck: o.check ? Math.min(st.luck, o.check.maxLuck) : 0, opId: newOpId() } as any);
          st.luck = 0; blip();
        } }, h('span', { class: 'muted' }, `${i + 1}. `), o.text, o.disabled ? h('div', { class: 'check', style: { color: 'var(--red)' } }, o.disabled) : null, checkEl);
      })));
  };

  // ---------------------------------------------------------------- paneles
  const closePanels = () => { for (const id of ['journal-panel', 'sheet-panel', 'inv-panel', 'settings-panel', 'map-panel']) document.getElementById(id)?.remove(); };
  const panel = (id: string, title: string, ...body: (Node | string)[]) => {
    const was = document.getElementById(id); closePanels(); if (was) return;
    const p = h('div', { class: 'panel', id, role: 'dialog', 'aria-label': title }, h('button', { class: 'btn small close', onclick: () => p.remove() }, 'Cerrar ✕'), h('h2', {}, title), ...body);
    $ui().append(p);
  };
  const journalPanel = () => panel('journal-panel', 'Diario de encargos',
    ...(st.journal.length ? st.journal.map((j) => h('div', { class: 'choice', style: { marginBottom: '8px' } },
      h('h4', {}, `${j.title} — ${j.state === 'active' ? 'activo' : j.state === 'completed' ? `completado (${j.outcome === 'fixer' ? 'control para Nadia' : 'control para el mercado'})` : 'abandonado'}`),
      h('p', {}, j.summary), h('p', {}, `Participantes en la instancia compartida: ${j.participants}`),
      h('ul', {}, ...j.objectives.map((o) => h('li', { class: o.done ? 'obj-done' : 'obj-todo' }, `${o.done ? '✔' : '○'} ${o.text}`)))))
      : [h('p', {}, 'Aún no tienes encargos. Pregunta a Reme en el vestíbulo o busca a Nadia en el bar El Relé.')]));
  const sheetPanel = () => {
    const s = st.sheet!; const role = roleById(s.role)!;
    panel('sheet-panel', `Ficha · ${s.name}`,
      h('p', {}, `${role.name} (rango ${s.roleRank}) · ${content.origins.find((o) => o.id === s.origin)?.name} · nivel ${s.level} · XP ${s.xp}/${s.xpNext}`),
      h('p', {}, h('b', {}, role.ability), `: ${role.abilityDesc}`),
      h('table', { class: 'sheet' }, h('tr', {}, h('th', {}, 'Atributo'), h('th', {}, 'Base'), h('th', {}, 'Efectivo'), h('th', {}, 'Cuándo interviene'), h('th', {}, 'Qué daría +1')),
        ...content.attributes.map((a) => h('tr', {}, h('td', {}, h('b', {}, a.id), ` ${a.name}`), h('td', {}, String(s.attributes[a.id])), h('td', {}, String(s.attributes[a.id])), h('td', {}, a.example), h('td', { class: 'muted' }, plusOne(a.id))))),
      h('h3', {}, 'Magnitudes'),
      h('table', { class: 'sheet' },
        row('Salud', `${s.hp}/${s.hpMax}`, '25 + 5×BODY + 3×WILL'), row('Aguante', `${s.stamina}/${s.staminaMax}`, '40 + 4×BODY + 2×WILL'),
        row('Suerte', `${s.luck}/${s.luckMax}`, 'Se gasta en tiradas elegidas; se recarga al descansar'), row('Humanidad', `${s.humanity}/${s.humanityMax}`, '10×EMP; el cromo instalado reduce el máximo (hito 2)'),
        row('Capacidad de cromo', `${s.chromeUsed}/${s.chromeCapacity}`, '18 + 2×TECH + BODY'), row('Carga', `${s.carry}/${s.carryMax} kg`, '20 + 6×BODY'), row('RAM', '—', 'Requiere cyberdeck (hito 2)')),
      h('h3', {}, 'Habilidades'), h('p', { class: 'mono' }, Object.entries(s.skills).filter(([, v]) => v > 0).map(([k, v]) => `${content.skills.find((x) => x.id === k)?.name ?? k} ${v}`).join(' · ')),
      h('h3', {}, 'Reputación'), h('p', {}, `Callejera: ${s.streetRep}`), h('ul', {}, ...Object.entries(s.reputation).map(([k, v]) => h('li', {}, `${factionName(k)}: ${v > 0 ? '+' : ''}${v}`))));
  };
  const row = (a: string, b: string, c: string) => h('tr', {}, h('td', {}, a), h('td', { class: 'mono' }, b), h('td', { class: 'muted' }, c));
  const plusOne = (id: string) => ({ BODY: '+5 salud, +4 aguante, +6 kg, +1 cromo', WILL: '+3 salud, +2 aguante, umbral de inestabilidad +2', TECH: '+2 capacidad de cromo, +1 en reparaciones', MOVE: '+0,12 m/s de marcha', EMP: '+10 Humanidad base', LUCK: '+1 a la reserva de Suerte', COOL: '+1 en negociación e intimidación', INT: '+1 en Interfaz e investigación', REF: '+1 en armas a distancia', DEX: '+1 en sigilo y cuerpo a cuerpo' } as Record<string, string>)[id] ?? '';
  const inventoryPanel = () => {
    const s = st.sheet!;
    panel('inv-panel', 'Inventario', h('p', {}, `Carga ${s.carry}/${s.carryMax} kg · ${fmtMoney(s.money)}`),
      h('table', { class: 'sheet' }, ...s.inventory.map((it) => {
        const def = content.items.find((d) => d.id === it.def);
        return h('tr', {}, h('td', {}, h('b', {}, it.name)), h('td', {}, `×${it.qty}`), h('td', { class: 'muted' }, def?.desc ?? ''),
          h('td', {}, def?.consumable ? h('button', { class: 'btn small', onclick: () => net.send({ t: 'useItem', item: it.def, opId: newOpId() } as any) }, 'Usar') : ''));
      })));
  };
  const bigMap = () => {
    const z = content.zones.find((z) => z.id === st.zone)!;
    const c = h('canvas', { style: { maxWidth: '100%', display: 'block', margin: '0 auto' } }) as HTMLCanvasElement;
    const pr = renderZoneMap(z, c, z.kind === 'interior' ? 24 : 6).project;
    const ctx = c.getContext('2d')!;
    ctx.font = '12px system-ui'; ctx.textAlign = 'center';
    for (const b of z.buildings) if (b.name) { const p = pr(b.rect[0] + b.rect[2] / 2, b.rect[1] + b.rect[3] / 2); ctx.fillStyle = '#fff'; ctx.fillText(b.name, p.x, p.y); }
    for (const d of z.doors) { const p = pr(d.at[0] + 0.5, d.at[1] + 0.5); ctx.fillStyle = '#5affc8'; ctx.fillRect(p.x - 3, p.y - 3, 6, 6); ctx.fillText(`🚪 ${d.name}`, p.x, p.y - 6); }
    const me = view.me; const mp = pr(me.x, me.y); ctx.fillStyle = '#ff3fa4'; ctx.beginPath(); ctx.arc(mp.x, mp.y, 6, 0, 7); ctx.fill();
    panel('map-panel', `Mapa · ${z.name} (planta baja)`, c, h('p', { class: 'muted' }, 'Verde: puertas a interiores protegidos. Rosa: tú. Los recorridos de transporte llegan en hitos posteriores.'));
  };

  // ---------------------------------------------------------------- órdenes
  const stop = () => { net.send({ t: 'stop' } as any); view.cancelPrediction(); st.destination = ''; setAction(''); };
  const retreat = () => {
    const seq = net.send({ t: 'retreat' } as any);
    st.pending.set(seq, (a) => { if (a.ok && a.path) { view.confirmPath(a.path); st.destination = a.info ?? 'Refugio'; setAction('Retirándose'); } else toast(a.reason ?? 'Sin retirada posible', 'warn'); });
  };
  view.onGroundClick = (x, y) => {
    if (st.dialog) net.send({ t: 'closeDialog' } as any);
    const predicted = view.predictMove(x, y);
    if (!predicted) { toast('Destino inaccesible: ahí hay un edificio, agua u obstáculo.', 'warn'); return; }
    const seq = net.send({ t: 'move', x, y } as any);
    const end = predicted[predicted.length - 1];
    st.destination = `(${end[0].toFixed(0)}, ${end[1].toFixed(0)})`;
    setAction('Caminando');
    st.pending.set(seq, (a) => {
      if (a.ok && a.path) view.confirmPath(a.path);
      else { view.cancelPrediction(); st.destination = ''; setAction(''); toast(`Orden rechazada: ${a.reason}`, 'warn'); }
    });
  };
  view.onEntityClick = (e: CEnt) => {
    if (e.s.kind === 'door' && e.s.danger === 'disputed' && !confirm(`${e.s.name} lleva a una zona disputada con PvP letal. ¿Cruzar?`)) return;
    const seq = net.send({ t: 'interact', target: e.s.id } as any);
    st.destination = e.s.name;
    setAction(e.s.kind === 'door' ? 'Yendo a la puerta' : `Yendo hacia ${e.s.name}`);
    st.pending.set(seq, (a) => {
      if (a.ok && a.path) view.confirmPath(a.path);
      else if (!a.ok) { toast(a.reason ?? 'No disponible', 'warn'); st.destination = ''; setAction(''); }
    });
  };
  view.onRightClick = stop;
  view.onHover = (e, sx, sy) => {
    if (!e) { tooltip.style.display = 'none'; return; }
    const hint = e.s.kind === 'door' ? `Clic: entrar · Zona ${DANGER_TXT[e.s.danger ?? 'public']}` : e.s.kind === 'player' ? 'Otra persona · usa el chat local' : e.s.kind === 'object' ? 'Clic: examinar' : 'Clic: hablar';
    tooltip.replaceChildren(h('b', {}, e.s.name), e.s.title ? ` · ${e.s.title}` : '', e.s.label ? h('div', { class: 'muted' }, e.s.label) : '', h('div', { class: 'cy' }, hint));
    tooltip.style.display = 'block'; tooltip.style.left = `${sx + 14}px`; tooltip.style.top = `${sy + 14}px`;
  };
  view.onContextLost = (lost) => { ctxOverlay.style.display = lost ? 'flex' : 'none'; };

  // Tab y Espacio solo actúan sobre el mundo si el foco no está en un control del HUD (para no romper la navegación por teclado).
  const onWorld = () => { const a = document.activeElement; return !a || a === document.body || a.tagName === 'CANVAS'; };
  const keys = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { if (document.querySelector('.panel')) closePanels(); else if (st.dialog) net.send({ t: 'closeDialog' } as any); else stop(); }
    else if (k === 's') stop();
    else if (k === 'r') retreat();
    else if (k === 'j') journalPanel();
    else if (k === 'c') sheetPanel();
    else if (k === 'i') inventoryPanel();
    else if (k === 'm') bigMap();
    else if (k === 'enter') { e.preventDefault(); chatIn.focus(); }
    else if (k === 'tab' && onWorld()) {
      // Selección accesible: recorre las entidades interactivas cercanas por distancia.
      e.preventDefault();
      const near = [...view.ents.values()].filter((x) => x.s.interactive && x.s.id !== view.meId && Math.hypot(x.x - view.me.x, x.y - view.me.y) < 14)
        .sort((a, b) => Math.hypot(a.x - view.me.x, a.y - view.me.y) - Math.hypot(b.x - view.me.x, b.y - view.me.y));
      if (!near.length) { toast('No hay nada cerca con lo que interactuar.'); return; }
      const idx = near.indexOf(view.hovered as CEnt);
      const next = near[(idx + (e.shiftKey ? near.length - 1 : 1)) % near.length];
      view.hovered = next;
      const sp = view.world.toGlobal(worldToScreen(next.x, next.y));
      view.onHover(next, sp.x, sp.y);
    }
    else if ((k === 'e' || k === ' ') && onWorld() && view.hovered && !st.dialog) { e.preventDefault(); view.onEntityClick(view.hovered); }
    else if (k === '+' || k === '=') view.setZoom(view.zoom * 1.1);
    else if (k === '-') view.setZoom(view.zoom / 1.1);
    else if (st.dialog && /^[1-9]$/.test(k)) document.getElementById(`opt-${st.dialog.options[Number(k) - 1]?.id}`)?.click();
  };
  window.addEventListener('keydown', keys);
  onSettings(() => renderSheet());

  // ---------------------------------------------------------------- red
  net.onPositions = (p) => view.positions(p.ents);
  net.onStatus = (s, detail) => {
    if (s === 'offline') {
      if (detail === 'auth' || detail === 'no_character') return onExit(detail);
      toast(detail ?? 'Desconectado', 'bad');
      $ui().append(h('div', { class: 'overlay' }, h('div', { class: 'reward' }, h('h2', {}, 'Sesión cerrada'), h('p', {}, detail ?? ''), h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Volver a conectar'))));
    }
    if (s === 'reconnecting') toast(detail ?? 'Reconectando…', 'warn');
  };
  net.onMsg = (m) => {
    switch (m.t) {
      case 'welcome':
        view.meId = m.you; st.sheet = m.sheet; st.journal = m.journal; st.facts = m.facts; st.cityHourMs = m.cityHourMs; st.cityEpoch = m.cityEpoch;
        st.zone = m.zone; st.sector = m.sector; st.danger = m.danger;
        view.setZone(m.zone, m.x, m.y); minimap.setZone(content.zones.find((z) => z.id === m.zone)!); view.setFacts(m.facts);
        renderSheet(); renderLocation(); setAction('');
        break;
      case 'zone':
        st.zone = m.zone; st.sector = m.sector; st.danger = m.danger; st.dialog = null; renderDialog();
        view.setZone(m.zone, m.x, m.y); minimap.setZone(content.zones.find((z) => z.id === m.zone)!); view.setFacts(st.facts);
        st.destination = ''; renderLocation(); setAction(''); blip('step');
        toast(`Entras en ${content.zones.find((z) => z.id === m.zone)?.name} · zona ${DANGER_TXT[m.danger]}`, 'info');
        break;
      case 'spawn': for (const e of m.e) view.upsert(e); break;
      case 'despawn': for (const id of m.ids) view.remove(id); break;
      case 'label': view.setLabel(m.id, m.label); break;
      case 'ack': { const cb = st.pending.get(m.seq); st.pending.delete(m.seq); if (cb) cb(m); else if (!m.ok && m.reason) toast(m.reason, 'warn'); else if (m.ok && m.path && m.seq === 0) view.confirmPath(m.path); if (m.info && m.ok && !cb) toast(m.info); break; }
      case 'dialog': st.dialog = m.view; st.luck = 0; st.destination = ''; setAction(''); renderDialog(); break;
      case 'dialogClose': st.dialog = null; renderDialog(); break;
      case 'sheet': st.sheet = m.sheet; renderSheet(); break;
      case 'journal': st.journal = m.journal; if (document.getElementById('journal-panel')) { closePanels(); journalPanel(); } break;
      case 'notice': toast(m.text, m.kind); break;
      case 'reward': {
        const ov = h('div', { class: 'overlay', id: 'reward' }, h('div', { class: 'reward', role: 'dialog' }, h('h2', {}, m.title), h('ul', {}, ...m.lines.map((l) => h('li', {}, l))),
          h('button', { class: 'btn primary', onclick: () => ov.remove() }, 'Continuar')));
        $ui().append(ov); blip('good');
        break;
      }
      case 'action': if (m.text) setAction(m.text, m.duration); else { st.destination = ''; setAction(''); } break;
      case 'sector': st.sector = m.sector; st.danger = m.danger; renderLocation(); break;
      case 'facts': {
        if (m.facts.lumen_power === true && st.facts.lumen_power !== true) toast('El Mercado Lumen vuelve a tener luz.', 'good');
        st.facts = m.facts; view.setFacts(m.facts); break;
      }
      case 'chat': if (st.muted.has(m.fromId)) break;
        chatLog.append(h('div', {}, h('span', { class: 'who', title: 'Clic para silenciar', onclick: () => { st.muted.add(m.fromId); toast(`Has silenciado a ${m.from}.`); } }, m.from), `: ${m.text}`));
        chatLog.scrollTop = chatLog.scrollHeight; break;
      case 'kicked': break;
      case 'error': if (m.reason === 'mensaje_invalido') toast('El servidor rechazó un mensaje mal formado.', 'bad'); break;
    }
  };
  net.connect();

  // Indicadores periódicos: reloj, red, minimapa.
  let lastBytes = 0;
  setInterval(() => {
    const hr = cityHour();
    clockEl.textContent = `${String(Math.floor(hr)).padStart(2, '0')}:${String(Math.floor((hr % 1) * 60)).padStart(2, '0')}`;
    const kbs = (net.bytesIn - lastBytes) / 1024; lastBytes = net.bytesIn;
    const cls = net.status !== 'online' ? 'netbad' : net.rtt > 200 ? 'netmid' : 'netok';
    netEl.className = `mono ${cls}`;
    netEl.textContent = net.status === 'online' ? `${Math.round(net.rtt)} ms · ${kbs.toFixed(1)} KiB/s · ${Math.round(view.app.ticker.FPS)} FPS · CPU ${view.frameMs.toFixed(1)} ms` : net.status;
  }, 1000);
  setInterval(() => minimap.draw(view.me, [...view.ents.values()].filter((e) => e.s.id !== view.meId).map((e) => ({ x: e.x, y: e.y, kind: e.s.kind }))), 250);
  document.addEventListener('visibilitychange', () => setAmbientActive(!document.hidden));

  // Ganchos de depuración para pruebas automatizadas en navegador.
  (window as any).__vt = {
    st, view, net,
    me: () => ({ id: view.meId, x: view.me.x, y: view.me.y, zone: st.zone }),
    entities: () => [...view.ents.values()].map((e) => ({ id: e.s.id, name: e.s.name, kind: e.s.kind, x: e.x, y: e.y })),
    screenOf: (x: number, y: number) => { const p = view.world.toGlobal(worldToScreen(x, y)); return { x: p.x, y: p.y }; },
  };
}
