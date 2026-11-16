// Partida: conecta red, vista y HUD. El cliente solo envía intenciones; el servidor resuelve y confirma.
import { checkChance, chanceBand, worldToScreen, type CharacterSheet, type DanceId, type DialogView, type JournalEntry, type ServerMsg } from '@vertice/shared';
import { content, factionName, roleById, zoneDef } from './content';
import { Net, newOpId } from './net';
import { GameView, type CEnt } from './render/view';
import { settings, onSettings } from './settings';
import { audioScene, blip, initAudio, setAmbientActive } from './audio';
import { closeDanceMenus, danceWheel, substanceReadout, worldActions } from './ui/nightlife';
import { jobBrief, underworldPanel, undergroundStanding, updateDeliveryClock } from './ui/underworld';
import { $ui, clearUi, fmtMoney, h } from './ui/dom';
import { Minimap, renderZoneMap } from './ui/minimap';
import { settingsPanel } from './ui/screens';
import { charScreenOpen, closeCharScreen, openCharScreen, refreshCharScreen } from './ui/charscreen';
import { autoPanel, elevatorPanel, hiringPanel } from './ui/work';
import { searchPanel, trunkPanel } from './ui/intel';
import { buildingPanel, dealerPanel, marketLivePanel, propsPanel, realtyPanel, ringPrompt, scanCard, stashPanel, type PropCtx } from './ui/property';
import { ambarPanel, bountyPanel, clinicPanel, deathScreen, factionsPanel, jobsPanel, marketPanel, shopPanel, targetMenu, worldMapPanel, type LifeCtx } from './ui/life';

const DANGER_TXT: Record<string, string> = { protected: 'Segura (verde)', public: 'Vigilada (amarilla)', disputed: 'Peligrosa (roja)', lawless: 'Sin ley (negra)' };
const STANCES = [
  { id: 'avoid', label: 'Evitar', desc: 'Evitar: no inicia combate; si la atacan, busca la salida y usa solo consumibles preautorizados.' },
  { id: 'defend', label: 'Defender', desc: 'Defender: responde a agresiones válidas contra ti o tu grupo, busca cobertura y no persigue.' },
  { id: 'aggressive', label: 'Agresiva', desc: 'Agresiva: ataca objetivos elegibles dentro de la orden seleccionada, gastando munición y cromo autorizados.' },
] as const;

const ABIL_ICON: Record<string, string> = { 'tiempo-bala': '⏱', invisible: '👻', curar: '💉', pulso: '💥', esprint: '💨', carga: '🚀', senuelo: '🎭', torbellino: '🌀', 'disparo-cargado': '🎯', 'pico-ram': '🧠' };
const BUFF_NAME: Record<string, string> = { 'tiempo-bala': '⏱ Tiempo bala', invisible: '👻 Invisible', curar: '💉 Curando', esprint: '💨 Esprint', senuelo: '🎭 Señuelo', carga: '🚀 Carga', 'disparo-cargado': '🎯 Cargado' };

export async function startGame(token: string, onExit0: (reason?: string) => void) {
  const timers: number[] = [];
  const eventScope = new AbortController();
  let combatMusicUntil = 0;
  let localDance: DanceId | null = null;
  let exited = false;
  const onExit = (reason?: string) => { if (exited) return; exited = true; eventScope.abort(); audioScene(null); window.removeEventListener('keydown', keys); for (const t of timers) clearInterval(t); net.close(); try { view.app.destroy(true); } catch {} onExit0(reason); };
  clearUi();
  initAudio();
  const resumeOnGesture = () => initAudio();
  document.addEventListener('pointerdown', resumeOnGesture, { once: true, capture: true, signal: eventScope.signal });
  document.addEventListener('keydown', resumeOnGesture, { once: true, capture: true, signal: eventScope.signal });
  const view = new GameView();
  const net = new Net(token);
  const st = {
    sheet: null as CharacterSheet | null, journal: [] as JournalEntry[], dialog: null as DialogView | null, facts: {} as Record<string, unknown>,
    zone: '', sector: '', danger: 'public', action: '', destination: '', cityHourMs: 60000, cityEpoch: 0, luck: 0,
    pending: new Map<number, (m: Extract<ServerMsg, { t: 'ack' }>) => void>(), muted: new Set<number>(),
  };
  const refreshScore = () => {
    const room = zoneDef(st.zone);
    if (!room) return;
    const indoor = room.kind === 'interior';
    const theme = Date.now() < combatMusicUntil ? 'accion' : room.nightlife?.music ?? (indoor ? 'chill' : st.danger === 'lawless' ? 'yermo' : 'calle');
    audioScene(theme, indoor);
  };
  view.serverTime = () => Date.now() + net.clockOffset;
  const cityHour = () => ((((Date.now() + net.clockOffset) / st.cityHourMs + st.cityEpoch) % 24) + 24) % 24;
  const gameEl = document.getElementById('game')!;
  gameEl.replaceChildren();
  await view.init(gameEl, cityHour);

  // ---------------------------------------------------------------- HUD
  const hpBar = h('i', { style: { background: 'var(--red)' } }), stBar = h('i', { style: { background: 'var(--green)' } });
  const needBar = (color: string) => h('i', { style: { background: color } });
  const hgBar = needBar('#ff8a3d'), thBar = needBar('#43a8ff'), ftBar = needBar('#b46cff');
  const needsEl = h('div', { style: { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 6px', alignItems: 'center', fontSize: '0.8em', margin: '2px 0 4px' } },
    h('span', {}, 'Hambre'), h('div', { class: 'bar', style: { margin: 0 }, role: 'meter', 'aria-label': 'Hambre' }, hgBar),
    h('span', {}, 'Sed'), h('div', { class: 'bar', style: { margin: 0 }, role: 'meter', 'aria-label': 'Sed' }, thBar),
    h('span', {}, 'Sueño'), h('div', { class: 'bar', style: { margin: 0 }, role: 'meter', 'aria-label': 'Sueño' }, ftBar));
  const statusEl = h('div', { style: { fontSize: '0.85em', minHeight: '1.2em' }, 'aria-live': 'polite' });
  const substancesEl = h('div', { class: 'substance-readout', 'aria-label': 'Estado de consumo' });
  const nameEl = h('div', {}), moneyEl = h('div', { class: 'mono' }), statsEl = h('div', { class: 'muted', style: { fontSize: '0.85em' } });
  const hpTxt = h('span', { class: 'mono' }), stTxt = h('span', { class: 'mono' });
  const xpFill = h('i', { style: { background: 'var(--xp)' } }), xpTxt = h('span', { class: 'mono small' });
  const xpEl = h('div', { class: 'hud-xp', title: 'Experiencia de nivel' }, h('div', { class: 'xpbar' }, xpFill), xpTxt);
  const tl = h('div', { class: 'hud hud-tl', 'aria-label': 'Estado del personaje' }, nameEl, xpEl,
    h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('span', {}, 'Salud'), hpTxt), h('div', { class: 'bar', role: 'meter', 'aria-label': 'Salud' }, hpBar),
    h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('span', {}, 'Aguante'), stTxt), h('div', { class: 'bar', role: 'meter', 'aria-label': 'Aguante' }, stBar),
    needsEl, statusEl, substancesEl, moneyEl, statsEl);
  const mm = h('canvas', { id: 'minimap', title: 'Mapa grande (M)', onclick: () => bigMap() }) as HTMLCanvasElement;
  const minimap = new Minimap(mm);
  const sectorEl = h('div', { style: { fontWeight: '600', marginTop: '4px' } }), dangerEl = h('span', { class: 'badge' }), clockEl = h('span', { class: 'mono' }), netEl = h('span', { class: 'mono' });
  // Reloj de la ciudad (un día dura 1 h 30 min reales) y turno del puesto de trabajo.
  const phaseEl = h('span', { class: 'phase' }), shiftEl = h('div', { class: 'shift' });
  const clockBox = h('div', { class: 'clockbox' }, h('span', { class: 'clock mono' }, clockEl), phaseEl);
  // Destino marcado: chip con el nombre y botón para desmarcarlo.
  const goalEl = h('div', { class: 'goalchip', style: { display: 'none' } });
  const streetGoal = h('div', { id: 'underworld-goal' });
  const tr = h('div', { class: 'hud hud-tr' }, mm, goalEl, streetGoal, sectorEl, h('div', { class: 'row', style: { justifyContent: 'space-between', marginTop: '4px' } }, h('span', {}, 'Peligro ', dangerEl), clockBox), shiftEl, h('div', { class: 'muted', style: { fontSize: '0.8em' } }, 'Red: ', netEl));
  const actionEl = h('div', { class: 'actionline', 'aria-live': 'polite', id: 'action' });
  const progress = h('div', { class: 'progress', style: { display: 'none' } }, h('i'));
  const stanceSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Postura' });
  const renderStance = () => stanceSeg.replaceChildren(...STANCES.map((s) => h('button', { 'aria-pressed': String(st.sheet?.stance === s.id), title: s.desc, onclick: () => { net.send({ t: 'stance', stance: s.id } as any); blip(); } }, s.label)));
  const ib = (icon: string, label: string, key: string, fn: () => void, id?: string, extra = '') => h('button', { class: `ibtn ${extra}`, id, onclick: fn, title: `${label} (${key})` }, h('span', { class: 'ico' }, icon), h('span', { class: 'lbl' }, label));
  const bottom = h('div', { class: 'hud hud-bottom' }, actionEl, progress,
    h('div', { class: 'toolbar' },
      ib('✋', 'Cancelar', 'S', () => stop(), 'btn-stop'), ib('🏃', 'Retirada', 'R', () => retreat(), 'btn-retreat', 'danger'), stanceSeg,
      ib('👟', 'Correr', 'Mayús', () => toggleRun(), 'btn-run'), ib('🤖', 'Automático', 'A', () => toggleAuto(), 'btn-auto'),
      ib('💤', 'Dormir', 'Z', () => toggleSleep(), 'btn-sleep')),
    h('div', { class: 'toolbar' },
      ib('📓', 'Diario', 'J', () => journalPanel(), 'btn-journal'), ib('🧍', 'Personaje', 'C', () => charScreen('sheet'), 'btn-sheet'), ib('🎒', 'Inventario', 'I', () => charScreen('inv'), 'btn-inv'),
      ib('🦾', 'Cromo', 'X', () => charScreen('cyber')), ib('⭐', 'Habilidades', 'H', () => charScreen('skills'), 'btn-skills'),
      ib('🗺', 'Mapa', 'M', () => mapPanel()), ib('⚑', 'Facciones', 'F', () => net.send({ t: 'factions' } as any)),
      ib('🏠', 'Propiedades', 'P', () => net.send({ t: 'props' } as any)), ib('🚗', 'Conducir', 'V', () => toggleDrive(), 'btn-drive'),
      ib('💼', 'Empleos', 'O', () => net.send({ t: 'jobs' } as any)), ib('📈', 'Mercado', 'K', () => marketLive(true)), ib('🎯', 'Recompensas', 'B', () => net.send({ t: 'bounties' } as any)),
      ib('📱', 'Buscar', 'G', () => searchPanel({ net }, 'phone')), ib('🧳', 'Maletero', 'T', () => net.send({ t: 'trunk', action: 'view' } as any)),
      ib('✚', 'Ámbar', 'U', () => net.send({ t: 'ambar' } as any)), ib('⚙', 'Ajustes', 'Esc', () => settingsPanel(() => view.applySettings()))));
  // Arma equipada, munición y RAM del deck.
  const weaponEl = h('div', { class: 'hud hud-weapon' });
  // Habilidades de los implantes (teclas 1–4) y avisos de experiencia de habilidad (barras azules).
  const abilityEl = h('div', { class: 'hud-abilities' });
  const xpPops = h('div', { class: 'xp-pops', 'aria-live': 'polite' });
  const readyAt = new Map<string, number>();
  const renderAbilities = (s: CharacterSheet, fromSheet = true) => {
    if (fromSheet) for (const a of s.abilities) readyAt.set(a.id, Date.now() + a.readyIn * 1000);
    abilityEl.replaceChildren(...s.abilities.slice(0, 4).map((a, i) => {
      const left = Math.ceil(((readyAt.get(a.id) ?? 0) - Date.now()) / 1000);
      const ready = left <= 0;
      const b = h('button', { class: `abil${ready ? ' ready' : ''}`, title: `${a.name} (${i + 1}) · recarga ${a.cooldown} s`, onclick: () => net.send({ t: 'ability', id: a.id } as any) },
        h('span', { class: 'abil-key' }, String(i + 1)), h('span', { class: 'abil-ico' }, ABIL_ICON[a.kind] ?? '⚡'), h('span', { class: 'abil-name' }, a.name), ready ? null : h('span', { class: 'abil-cd' }, `${left}s`));
      return b;
    }), ...Object.entries(s.buffs).filter(([k]) => !k.endsWith('PerSec')).map(([k, v]) => h('span', { class: 'buff' }, `${BUFF_NAME[k] ?? k} ${v}s`)));
  };
  // Turno: cuánto falta para empezar o terminar y botón para ir a trabajar.
  const renderShift = (hr: number) => {
    const p = st.sheet?.post;
    if (!p) { shiftEl.replaceChildren(); return; }
    const [a, b] = p.shift;
    const on = a <= b ? hr >= a && hr < b : hr >= a || hr < b;
    const until = (t: number) => { let d = t - hr; if (d < 0) d += 24; return `${Math.floor(d)} h ${String(Math.floor((d % 1) * 60)).padStart(2, '0')} min`; };
    shiftEl.replaceChildren(h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('b', { class: 'small' }, `💼 ${p.name.split(' · ')[0]}`), h('span', { class: 'mono small' }, `${String(a).padStart(2, '0')}–${String(b % 24).padStart(2, '0')} h`)),
      h('div', { class: `small ${on ? (p.worked ? 'muted' : 'netok') : 'muted'}` }, on ? (p.worked ? 'Turno ya trabajado' : `¡Estás en horario! Termina en ${until(b)}`) : `Empieza en ${until(a)} · ${p.place}`),
      on && !p.worked ? h('button', { class: 'btn small primary', onclick: () => net.send({ t: 'post', action: 'work' } as any) }, 'Trabajar turno') : '');
  };
  const xpPop = (m: Extract<ServerMsg, { t: 'skillxp' }>) => {
    const key = `pop-${m.skill}`;
    let el = document.getElementById(key);
    const cur = m.xp - m.from, need = Math.max(1, m.to - m.from);
    const body = [h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('b', {}, m.name), h('span', { class: 'mono' }, `${m.up ? '▲ ' : ''}Nv ${m.level} · +${m.gain}`)),
      h('div', { class: 'xpbar' }, h('i', { style: { width: `${Math.min(100, (100 * cur) / need)}%`, background: 'var(--xp)' } })), h('div', { class: 'mono small muted' }, `${cur}/${need} XP`)];
    if (el) el.replaceChildren(...body); else { el = h('div', { class: `xp-pop${m.up ? ' up' : ''}`, id: key }, ...body); xpPops.append(el); }
    if (m.up) el.classList.add('up');
    clearTimeout((el as any)._t); (el as any)._t = setTimeout(() => el!.remove(), 3500);
    while (xpPops.children.length > 4) xpPops.firstChild!.remove();
  };
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
  $ui().append(tl, tr, bottom, weaponEl, abilityEl, xpPops, toasts, chat, tooltip, dialogEl, ctxOverlay);

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
    nameEl.replaceChildren(h('b', {}, s.name), ` · ${roleById(s.role)?.name ?? s.role} · `, h('span', { class: 'lvchip' }, `Nv ${s.level}`), s.skillPoints + s.perkPoints ? h('span', { class: 'ptschip', title: 'Puntos sin gastar (H)' }, `+${s.skillPoints + s.perkPoints}`) : '');
    const xi = s.xp - s.xpLevelStart, xn = Math.max(1, s.xpNext - s.xpLevelStart);
    xpFill.style.width = `${Math.min(100, (100 * xi) / xn)}%`; xpTxt.textContent = `${xi}/${xn} XP`;
    view.showLevels = s.uniques.includes('lector');
    renderAbilities(s);
    refreshCharScreen(s);
    hpBar.style.width = `${(100 * s.hp) / s.hpMax}%`; stBar.style.width = `${(100 * s.stamina) / s.staminaMax}%`;
    hpTxt.textContent = `${s.hp}/${s.hpMax}`; stTxt.textContent = `${s.stamina}/${s.staminaMax}`;
    moneyEl.textContent = `${fmtMoney(s.money)} · Rep. calle ${s.streetRep}`;
    statsEl.textContent = `${s.professionName} (rango ${s.professionRank}) · Suerte ${s.luck}/${s.luckMax} · Carga ${s.carry}/${s.carryMax} kg${s.driving ? ' · 🚗 al volante' : ''}`;
    const w = s.weapon;
    weaponEl.replaceChildren(...([
      h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('b', {}, w ? w.name : 'Puños'), h('span', { class: 'muted' }, w ? `${w.family} · ${w.kind === 'melee' ? 'cuerpo a cuerpo' : `${w.range} m`}` : 'cuerpo a cuerpo')),
      h('div', { class: 'mono', style: { fontSize: '0.85em' } }, w ? `Daño ${w.damage[0]}–${w.damage[1]} · cadencia ${w.cooldown}s${w.ammo ? ` · ${w.ammoName}: ${w.ammoCount}` : ''}` : 'Daño 3–7', s.armor ? ` · blindaje ${s.armor}` : ''),
      s.net.canHack ? h('div', {}, h('div', { class: 'row', style: { justifyContent: 'space-between', fontSize: '0.8em' } }, h('span', { style: { color: '#b46cff' } }, `RAM · red rango ${s.net.rank}`), h('span', { class: 'mono' }, `${s.net.ram}/${s.net.ramMax}`)),
        h('div', { class: 'bar', style: { margin: '2px 0' } }, h('i', { style: { width: `${(100 * s.net.ram) / Math.max(1, s.net.ramMax)}%`, background: '#b46cff' } }))) : null,
      s.encumbrance !== 'normal' ? h('div', { class: 'netbad', style: { fontSize: '0.8em' } }, s.encumbrance === 'sobrecargado' ? '⚠ Sobrecargado: muy lento y torpe' : '⚠ Cargado: más lento') : null,
      s.ambar ? h('div', { style: { fontSize: '0.8em', color: '#ffbf00' } }, `✚ ${s.ambar.name} · ${s.ambar.usesLeft} rescates`) : null,
    ] as (Node | null)[]).filter((x): x is Node => !!x));
    hgBar.style.width = `${s.needs.hunger}%`; thBar.style.width = `${s.needs.thirst}%`; ftBar.style.width = `${s.needs.fatigue}%`;
    for (const [b, v] of [[hgBar, s.needs.hunger], [thBar, s.needs.thirst], [ftBar, s.needs.fatigue]] as [HTMLElement, number][]) b.style.filter = v >= 80 ? 'saturate(2) brightness(1.3)' : '';
    const st2: (string | HTMLElement)[] = [];
    if (s.status === 'downed') st2.push(h('b', { class: 'netbad' }, `DERRIBADO · ${s.downedLeft} s`));
    if (s.sleeping) st2.push(h('span', { class: 'cy' }, `Durmiendo (${Math.round(s.sleeping.quality * 100)} %) `));
    if (s.wanted >= 1) st2.push(h('span', { class: 'netbad' }, ` Buscado ${'★'.repeat(Math.min(5, Math.floor(s.wanted)))}`));
    if (s.activeJob) st2.push(h('span', { class: 'netmid' }, ' · empleo aceptado'));
    if (!s.autoNeeds) st2.push(h('span', { class: 'muted' }, ' · autonomía apagada'));
    statusEl.replaceChildren(...st2);
    substancesEl.replaceChildren(...substanceReadout(s.substances));
    streetGoal.replaceChildren(...(s.underworld.job ? [jobBrief(s.underworld.job, net, true)] : []));
    updateDeliveryClock(view.serverTime());
    const inv = new Map(s.inventory.map((i) => [i.def, i.qty]));
    for (const b of document.querySelectorAll<HTMLButtonElement>('[data-bar-drink]')) b.disabled = s.substances.sick || !inv.get(b.dataset.barDrink ?? '');
    if (s.substances.sick) view.cancelPrediction();
    document.getElementById('btn-run')?.setAttribute('aria-pressed', String(s.running));
    document.getElementById('btn-auto')?.setAttribute('aria-pressed', String(s.auto.on));
    renderShift(cityHour());
    const sb = document.getElementById('btn-sleep'); if (sb) { sb.querySelector('.ico')!.textContent = s.sleeping ? '☀' : '💤'; sb.querySelector('.lbl')!.textContent = s.sleeping ? 'Despertar' : 'Dormir'; }
    renderStance();
    view.setMyAttributes(s.attributes as any, s.substances.speed);
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
  const closePanels = () => { closeDanceMenus(); for (const id of ['journal-panel', 'sheet-panel', 'inv-panel', 'settings-panel', 'map-panel', 'shop-panel', 'market-panel', 'jobs-panel', 'clinic-panel', 'bounty-panel', 'target-menu', 'factions-panel', 'ambar-panel', 'world-panel', 'building-panel', 'realty-panel', 'dealer-panel', 'props-panel', 'stash-panel', 'market-live-panel', 'hiring-panel', 'elevator-panel', 'auto-panel', 'underworld-panel']) document.getElementById(id)?.remove(); };
  const toggleSleep = () => net.send({ t: st.sheet?.sleeping ? 'wake' : 'sleep' } as any);
  const panel = (id: string, title: string, ...body: (Node | string)[]) => {
    const was = document.getElementById(id); closePanels(); if (was) return;
    const p = h('div', { class: 'panel', id, role: 'dialog', 'aria-label': title }, h('div', { class: 'panel-head' }, h('h2', {}, title), h('button', { class: 'btn small close', onclick: () => p.remove() }, 'Cerrar ✕')), ...body);
    $ui().append(p); tooltip.style.display = 'none';
  };
  const journalPanel = () => {
    const u = st.sheet?.underworld;
    panel('journal-panel', 'Diario de encargos',
      ...(u && (u.rep > 0 || u.membership) ? [h('h3', {}, 'Bajos fondos'), undergroundStanding(u)] : []),
      ...(u?.job ? [jobBrief(u.job, net)] : []),
    ...(st.journal.length ? st.journal.map((j) => h('div', { class: 'choice', style: { marginBottom: '8px' } },
      h('h4', {}, `${j.title} — ${j.state === 'active' ? 'activo' : j.state === 'completed' ? `completado (${j.outcome === 'fixer' ? 'control para Nadia' : 'control para el mercado'})` : 'abandonado'}`),
      h('p', {}, j.summary), h('p', {}, `Participantes en la instancia compartida: ${j.participants}`),
      h('ul', {}, ...j.objectives.map((o) => h('li', { class: o.done ? 'obj-done' : 'obj-todo' }, `${o.done ? '✔' : '○'} ${o.text}`)))))
      : [h('p', {}, 'Para buscar encargos de la ciudad, habla con Reme en el vestíbulo o con Nadia en el bar El Relé.')]));
    updateDeliveryClock(view.serverTime());
  };
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
        row('Capacidad de cromo', `${s.chromeUsed}/${s.chromeCapacity}`, '18 + 2×TECH + BODY'), row('Carga', `${s.carry}/${s.carryMax} kg${s.encumbrance !== 'normal' ? ` (${s.encumbrance})` : ''}`, '20 + 6×BODY; los cuerpos cargados suman 70 kg'), row('Blindaje', String(s.armor), 'Ropa y placas subdérmicas: restan daño'),
        row('RAM', s.net.canHack ? `${s.net.ram}/${s.net.ramMax}` : '—', s.net.canHack ? 'Se regenera sola; los quickhacks la gastan' : 'Requiere un cyberdeck instalado')),
      h('h3', {}, 'Rama de red (netrunner)'),
      h('div', { class: 'fcard', style: { borderTopColor: '#b46cff' } },
        h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('b', {}, `Rango de red ${s.net.rank}`), h('span', { class: 'chip' }, s.net.canHack ? 'Deck activo' : 'Sin deck')),
        h('div', { class: 'repbar' }, h('i', { style: { width: `${Math.min(100, (100 * s.net.xp) / Math.max(1, s.net.xpNext))}%`, background: '#b46cff' } })),
        h('div', { class: 'muted', style: { fontSize: '0.85em' } }, `${s.net.xp}/${s.net.xpNext} XP de red. Cada rango sube la probabilidad de éxito, acorta la subida del hack, abarata la RAM y reduce el rastreo. Clic derecho sobre personas, cajeros o tiendas para hackear.`)),
      h('h3', {}, 'Cromo visible por partes'),
      h('div', { class: 'row' }, ...([['cabeza', 'Cabeza'], ['ojos', 'Ojos'], ['torso', 'Cuerpo'], ['brazo_izq', 'Brazo izq.'], ['brazo_der', 'Brazo der.'], ['pierna_izq', 'Pierna izq.'], ['pierna_der', 'Pierna der.']] as const).map(([k, n]) =>
        h('span', { class: `chip${s.chrome.includes(k) ? ' good' : ''}` }, `${s.chrome.includes(k) ? '⚙' : '○'} ${n}`))),
      h('h3', {}, 'Habilidades'), h('p', { class: 'mono' }, Object.entries(s.skills).filter(([, v]) => v > 0).map(([k, v]) => `${content.skills.find((x) => x.id === k)?.name ?? k} ${v}`).join(' · ')),
      h('h3', {}, 'Necesidades'),
      h('p', {}, `Hambre ${s.needs.hunger} · Sed ${s.needs.thirst} · Sueño ${s.needs.fatigue} (0 = satisfecho, 100 = crítico). Ritmo por implantes: hambre ×${s.needsMult.hunger.toFixed(2)}, sed ×${s.needsMult.thirst.toFixed(2)}, sueño ×${s.needsMult.fatigue.toFixed(2)}.`),
      h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: s.autoNeeds, onchange: (e: any) => net.send({ t: 'autonomy', autoNeeds: e.target.checked } as any) }), 'Autonomía: comer, beber y comprar comida solo cuando haga falta'),
      h('h3', {}, 'Oficio y riesgo'),
      h('p', {}, `${s.professionName} · rango ${s.professionRank} · ${s.professionXp} XP de oficio · nivel de búsqueda ${s.wanted}`),
      h('p', { class: 'muted' }, `Bonificaciones: enfrentamiento +${s.bonuses.confront}, defensa +${s.bonuses.defense}, robo +${s.bonuses.steal}, supervivencia quirúrgica +${s.bonuses.surgery} %`),
      h('h3', {}, `Ciberware · ${s.chromeUsed}/${s.chromeCapacity} de capacidad · Humanidad ${s.humanity}/${s.humanityMax}`),
      s.cyber.length ? h('table', { class: 'sheet' }, ...s.cyber.map((c) => h('tr', {}, h('td', {}, h('b', {}, c.name), ` · grado ${['I', 'II', 'III', 'IV', 'V'][c.grade - 1]}${c.stolen ? ' · robado' : ''}`), h('td', {}, `${c.location === 'installed' ? 'Instalado' : 'En la mochila'} · ranura ${c.slot}`),
        h('td', { class: 'muted' }, `${c.desc} Capacidad ${c.capacity}, Humanidad −${c.humanity}. ${c.family}.`)))) : h('p', { class: 'muted' }, 'Sin implantes. Los matasanos instalan y retiran cromo: Doc Sato, Mama Iruka, El Carnicero, Ruiz, la Clínica Okami y el Dr. Vex.'),
      h('h3', {}, 'Reputación'), h('p', {}, `Callejera: ${s.streetRep}`), h('ul', {}, ...Object.entries(s.reputation).map(([k, v]) => h('li', {}, `${factionName(k)}: ${v > 0 ? '+' : ''}${v}`))));
  };
  const row = (a: string, b: string, c: string) => h('tr', {}, h('td', {}, a), h('td', { class: 'mono' }, b), h('td', { class: 'muted' }, c));
  const plusOne = (id: string) => ({ BODY: '+5 salud, +4 aguante, +6 kg, +1 cromo', WILL: '+3 salud, +2 aguante, umbral de inestabilidad +2', TECH: '+2 capacidad de cromo, +1 en reparaciones', MOVE: '+0,12 m/s de marcha', EMP: '+10 Humanidad base', LUCK: '+1 a la reserva de Suerte', COOL: '+1 en negociación e intimidación', INT: '+1 en Interfaz e investigación', REF: '+1 en armas a distancia', DEX: '+1 en sigilo y cuerpo a cuerpo' } as Record<string, string>)[id] ?? '';
  const inventoryPanel = () => {
    const s = st.sheet!;
    const weapons = s.weapons.map((wp) => {
      const def = content.items.find((d) => d.id === wp.id)!; const w = def.weapon!;
      const on = s.weapon?.id === wp.id;
      return h('div', { class: `fcard${on ? ' on' : ''}`, style: { borderTopColor: w.kind === 'melee' ? '#ff8a3d' : '#43f3ff' } },
        h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('b', {}, def.name), h('span', { class: 'chip' }, wp.integrated ? 'Implante' : w.family)),
        h('div', { class: 'mono', style: { fontSize: '0.82em' } }, `Daño ${w.damage[0]}–${w.damage[1]} · ${w.kind === 'melee' ? 'cuerpo a cuerpo' : `alcance ${w.range} m`} · cadencia ${w.cooldown}s · precisión ${w.accuracy >= 0 ? '+' : ''}${w.accuracy}`),
        h('div', { style: { fontSize: '0.8em' } }, `${w.nonlethal === 'solo' ? 'Solo no letal' : w.nonlethal === 'opcional' ? 'Letal o KO' : w.kind === 'melee' ? 'Letal o KO' : 'Letal (KO con culatazo)'}${w.ammo ? ` · munición: ${content.items.find((i) => i.id === w.ammo)?.name} (${s.inventory.find((i) => i.def === w.ammo)?.qty ?? 0})` : ''} · ${w.tech}`),
        h('button', { class: 'btn small', disabled: on, onclick: () => net.send({ t: 'equip', item: wp.id } as any) }, on ? 'Equipada' : 'Equipar'));
    });
    panel('inv-panel', 'Inventario', h('p', {}, `Carga ${s.carry}/${s.carryMax} kg${s.encumbrance !== 'normal' ? ` · ${s.encumbrance}` : ''} · Blindaje ${s.armor} · ${fmtMoney(s.money)}`),
      h('h3', {}, 'Armas'), weapons.length ? h('div', { class: 'cards' }, ...weapons) : h('p', { class: 'muted' }, 'Sin armas: luchas con los puños.'),
      s.weapon ? h('button', { class: 'btn small', onclick: () => net.send({ t: 'equip', item: null } as any) }, 'Guardar el arma (puños)') : '',
      h('h3', {}, 'Mochila'),
      h('table', { class: 'sheet' }, ...s.inventory.map((it) => {
        const def = content.items.find((d) => d.id === it.def);
        return h('tr', {}, h('td', {}, h('b', {}, it.name)), h('td', {}, `×${it.qty}`), h('td', { class: 'muted' }, def?.desc ?? ''),
          h('td', { class: 'mono' }, `${((def?.weight ?? 0) * it.qty).toFixed(1)} kg`),
          h('td', {}, def?.consumable ? h('button', { class: 'btn small', onclick: () => net.send({ t: 'useItem', item: it.def, opId: newOpId() } as any) }, 'Usar') : ''));
      })));
  };
  const bigMap = () => {
    const z = zoneDef(st.zone)!;
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
    closeDanceMenus();
    document.getElementById('underworld-panel')?.remove();
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
    closeDanceMenus();
    if (e.s.kind === 'door' && e.s.danger === 'disputed' && !confirm(`${e.s.name} lleva a una zona disputada con PvP letal. ¿Cruzar?`)) return;
    const seq = net.send({ t: 'interact', target: e.s.id } as any);
    st.destination = e.s.name;
    setAction(e.s.kind === 'door' ? 'Yendo a la puerta' : `Yendo hacia ${e.s.name}`);
    st.pending.set(seq, (a) => {
      if (a.ok && a.path) view.confirmPath(a.path);
      else if (!a.ok) { toast(a.reason ?? 'No disponible', 'warn'); st.destination = ''; setAction(''); }
    });
  };
  const openDances = () => {
    closePanels();
    danceWheel(localDance, (move) => {
      const previous = localDance;
      localDance = move;
      const seq = net.send({ t: 'dance', move });
      st.pending.set(seq, (a) => {
        if (!a.ok) { localDance = previous; toast(a.reason ?? 'Ahora no puedes bailar.', 'warn'); return; }
        view.cancelPrediction();
        st.destination = '';
        setAction('');
      });
    });
  };
  view.onRightClick = (x, y) => {
    closeDanceMenus();
    if (view.hovered && view.hovered.s.id !== view.meId) net.send({ t: 'menu', target: view.hovered.s.id } as any);
    else {
      document.getElementById('target-menu')?.remove();
      worldActions(x, y, openDances, stop);
    }
  };
  // La etiqueta flotante solo tiene sentido sobre el mapa: se oculta al pasar por encima de la interfaz.
  $ui().addEventListener('pointerover', (ev) => { if (ev.target !== $ui()) tooltip.style.display = 'none'; });
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
    if (document.getElementById('dance-wheel')) return;
    if (k === 'escape' && closeDanceMenus()) return;
    if (k === 'y') { openDances(); return; }
    if (k === 'escape') { if (charScreenOpen()) closeCharScreen(); else if (document.getElementById('scan-card')) document.getElementById('scan-card')!.remove(); else if (document.querySelector('.panel')) closePanels(); else if (st.dialog) net.send({ t: 'closeDialog' } as any); else stop(); }
    else if (k === 's') stop();
    else if (k === 'r') retreat();
    else if (k === 'j') journalPanel();
    else if (k === 'c') charScreen('sheet');
    else if (k === 'i') charScreen('inv');
    else if (k === 'x') charScreen('cyber');
    else if (k === 'h') charScreen('skills');
    else if (k === 'p') net.send({ t: 'props' } as any);
    else if (k === 'v') toggleDrive();
    else if (k === 'shift') toggleRun();
    else if (k === 'a') toggleAuto();
    else if (k === 'm') mapPanel();
    else if (!st.dialog && /^[1-4]$/.test(k) && st.sheet?.abilities[Number(k) - 1]) net.send({ t: 'ability', id: st.sheet.abilities[Number(k) - 1].id } as any);
    else if (k === 'f') net.send({ t: 'factions' } as any);
    else if (k === 'u') net.send({ t: 'ambar' } as any);
    else if (k === 'z') toggleSleep();
    else if (k === 'o') net.send({ t: 'jobs' } as any);
    else if (k === 'k') marketLive(true);
    else if (k === 'b') net.send({ t: 'bounties' } as any);
    else if (k === 'g') searchPanel({ net }, 'phone');
    else if (k === 't') net.send({ t: 'trunk', action: 'view' } as any);
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
  function charScreen(tab: 'inv' | 'cyber' | 'skills' | 'sheet') { if (!st.sheet) return; closePanels(); tooltip.style.display = 'none'; openCharScreen({ net, toast }, st.sheet, tab); }
  function toggleRun() { if (st.sheet) { net.send({ t: 'run', on: !st.sheet.running } as any); toast(st.sheet.running ? 'Andas.' : 'Corres: más rápido, pero gastas aguante.', 'info'); } }
  function toggleAuto() { if (!st.sheet) return; if (st.sheet.auto.on) net.send({ t: 'auto', on: false } as any); else autoPanel(st.sheet.auto.personality, (personality) => net.send({ t: 'auto', on: true, personality } as any)); }
  function toggleDrive() { if (!st.sheet) return; if (st.sheet.driving) net.send({ t: 'car', action: 'park' } as any); else if (!st.sheet.cars.length) toast('No tienes coche: cómpralo en un concesionario (mira el mapa).', 'warn'); else net.send({ t: 'car', action: 'drive' } as any); }
  function mapPanel() { worldMapPanel(st.zone, { discovered: st.sheet?.discovered ?? [], hasCar: (st.sheet?.cars.length ?? 0) > 0, travel: (zone) => net.send({ t: 'car', action: 'travel', zone } as any), me: { x: view.me.x, y: view.me.y }, goal: minimap.goal, goto: (x, y) => net.send({ t: 'goto', kind: 'place', x, y } as any) }); }
  let liveOn = false, livePending = false;
  function marketLive(on: boolean) { if (on && liveOn && document.getElementById('market-live-panel')) { closePanels(); marketLive(false); return; } liveOn = on; livePending = on; net.send({ t: 'marketLive', on } as any); }
  const pctx: PropCtx = { net, toast, money: () => st.sheet?.money ?? 0 };
  timers.push(window.setInterval(() => { if (st.sheet?.abilities.length) renderAbilities(st.sheet, false); }, 1000));

  // ---------------------------------------------------------------- red
  net.onPositions = (p) => view.positions(p.ents);
  const life: LifeCtx = { net, toast };
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
        localDance = null;
        view.meId = m.you; st.sheet = m.sheet; st.journal = m.journal; st.facts = m.facts; st.cityHourMs = m.cityHourMs; st.cityEpoch = m.cityEpoch;
        st.zone = m.zone; st.sector = m.sector; st.danger = m.danger;
        view.setZone(m.zone, m.x, m.y); minimap.setZone(zoneDef(m.zone)!); view.setFacts(m.facts);
        renderSheet(); renderLocation(); setAction(''); refreshScore();
        break;
      case 'zone':
        localDance = null;
        closeDanceMenus();
        document.getElementById('shop-panel')?.remove();
        document.getElementById('underworld-panel')?.remove();
        st.zone = m.zone; st.sector = m.sector; st.danger = m.danger; st.dialog = null; renderDialog();
        view.setZone(m.zone, m.x, m.y); minimap.setZone(zoneDef(m.zone)!); view.setFacts(st.facts);
        st.destination = ''; renderLocation(); setAction(''); refreshScore(); blip('step');
        toast(`Entras en ${zoneDef(m.zone)?.name} · zona ${DANGER_TXT[m.danger]}`, 'info');
        break;
      case 'spawn':
        for (const e of m.e) {
          view.upsert(e);
          if (e.id === view.meId && e.emote && e.emote.move !== 'nausea') localDance = e.emote.move;
        }
        break;
      case 'despawn': for (const id of m.ids) view.remove(id); break;
      case 'label':
        if (m.id === view.meId && m.emote !== undefined) localDance = m.emote && m.emote.move !== 'nausea' ? m.emote.move : null;
        view.setLabel(m.id, m.label, m.bounty, m.state, m.chrome, m.hpPct, m.carried, { appearance: m.appearance, vehicle: m.vehicle, level: m.level, buffs: m.buffs, lost: m.lost, bleeding: m.bleeding, weapon: m.weapon, dead: m.dead, emote: m.emote }); break;
      case 'factions': factionsPanel(life, m.view); break;
      case 'underworld': underworldPanel(net, m.view); break;
      case 'ambar': ambarPanel(life, m.view); break;
      case 'speech': { view.say(m.id, m.text); const e = view.ents.get(m.id); if (e) chatLog.append(h('div', {}, h('span', { class: 'who' }, e.s.name), `: ${m.text}`)); chatLog.scrollTop = chatLog.scrollHeight; break; }
      case 'fx':
        view.fx(m.kind, m.from, m.to, { part: m.part, weapon: m.weapon, hit: m.hit, sever: m.sever, crit: m.crit });
        if (m.kind === 'shot') blip('step');
        if (m.from === view.meId || m.to === view.meId) { combatMusicUntil = Date.now() + 11_000; refreshScore(); }
        break;
      case 'shop': shopPanel(life, m.view); break;
      case 'market': marketPanel(life, m.view); break;
      case 'jobs': jobsPanel(life, m.view); break;
      case 'clinic': clinicPanel(life, m.view); break;
      case 'bounties': bountyPanel(life, m.view); break;
      case 'targetMenu': { const e = view.ents.get(m.view.target); const sp = e ? view.world.toGlobal(worldToScreen(e.x, e.y)) : { x: 400, y: 300 }; targetMenu(life, m.view, sp, (id) => { if (id === 'talk' && e?.s.kind === 'npc' && (e.s.npcType === 'essential' || !e.s.npcType)) net.send({ t: 'interact', target: m.view.target } as any); else if (id === 'talk') net.send({ t: 'hostile', target: m.view.target, action: 'talk', opId: newOpId() } as any); else net.send({ t: 'interact', target: m.view.target } as any); }); break; }
      case 'death': net.close(); audioScene(null); deathScreen(m.summary, () => onExit('dead')); break;
      case 'ack': { const cb = st.pending.get(m.seq); st.pending.delete(m.seq); if (cb) cb(m); else if (!m.ok && m.reason) toast(m.reason, 'warn'); else if (m.ok && m.path && m.seq === 0) view.confirmPath(m.path); if (m.info && m.ok && !cb) toast(m.info); break; }
      case 'dialog': st.dialog = m.view; st.luck = 0; st.destination = ''; setAction(''); renderDialog(); break;
      case 'dialogClose': st.dialog = null; renderDialog(); break;
      case 'searchResults': searchPanel({ net }, m.device, m.results); break;
      case 'trunk': trunkPanel({ net }, m.view); break;
      case 'gotoTarget': {
        minimap.goal = m.target ? { x: m.target.x, y: m.target.y, zone: m.target.zone } : null; view.goal = minimap.goal;
        goalEl.style.display = m.target ? '' : 'none';
        if (m.target) goalEl.replaceChildren(h('span', {}, '🎯 ', m.target.label), h('button', { class: 'btn small', title: 'Desmarcar destino', 'aria-label': 'Desmarcar destino', onclick: () => net.send({ t: 'goto', kind: 'cancel' } as any) }, '✕'));
        break;
      }
      case 'sheet': st.sheet = m.sheet; view.combat = { range: m.sheet.weapon?.range ?? 1.5, aim: m.sheet.aim?.range ?? 0, ranged: m.sheet.weapon?.kind === 'ranged' }; renderSheet(); break;
      case 'skillxp': xpPop(m); break;
      case 'building': buildingPanel(pctx, m.view); break;
      case 'realty': realtyPanel(pctx, m.view); break;
      case 'dealer': dealerPanel(pctx, m.view); break;
      case 'props': propsPanel(pctx, m.view); break;
      case 'stash': stashPanel(pctx, m.view); break;
      case 'marketLive': {
        if (!liveOn) break;
        // Si el panel se cerró (Escape u otro panel), se deja de recibir el mercado en vivo.
        if (!livePending && !document.getElementById('market-live-panel')) { marketLive(false); break; }
        livePending = false; marketLivePanel(pctx, m.view, () => marketLive(false)); break;
      }
      case 'scan': scanCard(m.view); break;
      case 'ring': ringPrompt(pctx, m.house, m.houseName, m.from, m.fromId); break;
      case 'hiring': hiringPanel(net, m.view); break;
      case 'elevator': elevatorPanel(net, m.view); break;
      case 'journal': st.journal = m.journal; if (document.getElementById('journal-panel')) { closePanels(); journalPanel(); } break;
      case 'notice': toast(m.text, m.kind); break;
      case 'reward': {
        const ov = h('div', { class: 'overlay', id: 'reward' }, h('div', { class: 'reward', role: 'dialog' }, h('h2', {}, m.title), h('ul', {}, ...m.lines.map((l) => h('li', {}, l))),
          h('button', { class: 'btn primary', onclick: () => ov.remove() }, 'Continuar')));
        $ui().append(ov); blip('good');
        break;
      }
      case 'action': if (m.text) setAction(m.text, m.duration); else { st.destination = ''; setAction(''); } break;
      case 'sector': st.sector = m.sector; st.danger = m.danger; renderLocation(); refreshScore(); break;
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
  timers.push(window.setInterval(() => {
    const hr = cityHour();
    clockEl.textContent = `${String(Math.floor(hr)).padStart(2, '0')}:${String(Math.floor((hr % 1) * 60)).padStart(2, '0')}`;
    const ph = view.dayPhase(hr);
    phaseEl.textContent = `${ph === 'día' ? '☀' : ph === 'noche' ? '🌙' : ph === 'amanecer' ? '🌅' : '🌇'} ${ph}`;
    renderShift(hr);
    if (combatMusicUntil && Date.now() >= combatMusicUntil) { combatMusicUntil = 0; refreshScore(); }
    updateDeliveryClock(view.serverTime());
    const kbs = (net.bytesIn - lastBytes) / 1024; lastBytes = net.bytesIn;
    const cls = net.status !== 'online' ? 'netbad' : net.rtt > 200 ? 'netmid' : 'netok';
    netEl.className = `mono ${cls}`;
    netEl.textContent = net.status === 'online' ? `${Math.round(net.rtt)} ms · ${kbs.toFixed(1)} KiB/s · ${Math.round(view.app.ticker.FPS)} FPS · CPU ${view.frameMs.toFixed(1)} ms` : net.status;
  }, 1000));
  timers.push(window.setInterval(() => minimap.draw(view.me, [...view.ents.values()].filter((e) => e.s.id !== view.meId).map((e) => ({ x: e.x, y: e.y, kind: e.s.kind }))), 250));
  document.addEventListener('visibilitychange', () => setAmbientActive(!document.hidden), { signal: eventScope.signal });

  // Ganchos de depuración para pruebas automatizadas en navegador.
  (window as any).__vt = {
    st, view, net,
    me: () => ({ id: view.meId, x: view.me.x, y: view.me.y, zone: st.zone }),
    entities: () => [...view.ents.values()].map((e) => ({ id: e.s.id, name: e.s.name, kind: e.s.kind, x: e.x, y: e.y })),
    screenOf: (x: number, y: number) => { const p = view.world.toGlobal(worldToScreen(x, y)); return { x: p.x, y: p.y }; },
  };
}
