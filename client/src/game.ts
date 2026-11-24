// Partida: conecta red, vista y HUD. El cliente solo envía intenciones; el servidor resuelve y confirma.
import { installedSight, Atlas, prisonZone, facingToIdx, checkChance, chanceBand, worldToScreen, type CharacterSheet, type ScanInfo, type DossierView, type DanceId, type DialogView, type JournalEntry, type PrisonView, type ServerMsg } from '@vertice/shared';
import { content, factionName, roleById, zoneDef } from './content';
import { Net, newOpId } from './net';
import { GameView, type CEnt } from './render/view';
import { settings, onSettings, hud, saveSettings } from './settings';
import { CAM_NAMES, type CamMode } from './render/chars3d';
import { audioScene, blip, initAudio, setAmbientActive } from './audio';
import * as sfx from './sfx';
import { stealthBar, weaponWheel } from './ui/stealth';
import { closeDanceMenus, danceWheel, substanceReadout, worldActions } from './ui/nightlife';
import { jobBrief, underworldPanel, undergroundStanding, updateDeliveryClock } from './ui/underworld';
import { casinoPanel } from './ui/casino';
import { closeFittingRoom, fittingRoomOpen } from './ui/fitting-room';
import { bankPanel, prisonPanel } from './ui/prison';
import './ui/prison.css';
import { $ui, clearUi, fmtMoney, h, ask } from './ui/dom';
import { Minimap } from './ui/minimap';
import { openAtlas } from './ui/atlas-panel';
import { settingsPanel } from './ui/screens';
import { charScreenOpen, closeCharScreen, openCharScreen, refreshCharScreen, setDossier } from './ui/charscreen';
import { autoPanel, elevatorPanel, hiringPanel } from './ui/work';
import { searchPanel, trunkPanel } from './ui/intel';
import { actionFor, keyOf, keymap } from './keymap';
import { BodyPanel } from './ui/body';
import { keysPanel, pauseMenu } from './ui/pause';
import { cheatPanel, legendPanel } from './ui/legends';
import { buildingPanel, dealerPanel, marketLivePanel, propsPanel, realtyPanel, ringPrompt, scanCard, stashPanel, type PropCtx } from './ui/property';
import { lootPanel } from './ui/loot';
import { closeRecordPanel, recordPanel } from './ui/record';
/** v0.13 · Gestos que no son bailes (sentado, manos arriba…): no cuentan como «estás bailando». */
const isDance = (m: string) => !['nausea', 'sentado', 'manos-arriba', 'telefono', 'fumar', 'gesto'].includes(m);
import { ambarPanel, bountyPanel, clinicPanel, deathScreen, factionsPanel, jobsPanel, marketPanel, shopPanel, targetMenu, type LifeCtx } from './ui/life';

const DANGER_TXT: Record<string, string> = { protected: 'Segura (verde)', public: 'Vigilada (amarilla)', disputed: 'Peligrosa (roja)', lawless: 'Sin ley (negra)' };
const STANCES = [
  { id: 'avoid', label: 'Evitar', desc: 'Evitar: no inicia combate; si la atacan, busca la salida y usa solo consumibles preautorizados.' },
  { id: 'defend', label: 'Defender', desc: 'Defender: responde a agresiones válidas contra ti o tu grupo, busca cobertura y no persigue.' },
  { id: 'aggressive', label: 'Agresiva', desc: 'Agresiva: ataca objetivos elegibles dentro de la orden seleccionada, gastando munición y cromo autorizados.' },
] as const;

const opticalDefs = new Map(content.cyberware.filter(d => d.effects.sight).map(d => [d.id,d]));
const ABIL_ICON: Record<string, string> = { kairos: '⏩', onda: '🌊', proyeccion: '👻', 'tiempo-bala': '⏱', invisible: '👻', curar: '💉', pulso: '💥', esprint: '💨', carga: '🚀', senuelo: '🎭', torbellino: '🌀', 'disparo-cargado': '🎯', 'pico-ram': '🧠', 'onda-ko': '⚡', marcar: '📡', escudo: '🛡', salto: '🦘' };
const BUFF_NAME: Record<string, string> = { 'tiempo-bala': '⏱ Tiempo bala', invisible: '👻 Invisible', curar: '💉 Curando', esprint: '💨 Esprint', senuelo: '🎭 Señuelo', carga: '🚀 Carga', 'disparo-cargado': '🎯 Cargado', marcar: '📡 Objetivos marcados', escudo: '🛡 Escudo' };

export async function startGame(token: string, onExit0: (reason?: string) => void, characterId?: string) {
  const timers: number[] = [];
  const eventScope = new AbortController();
  let combatMusicUntil = 0;
  let localDance: DanceId | null = null;
  let exited = false;
  const onExit = (reason?: string) => { if (exited) return; exited = true; closeFittingRoom(); closeRecordPanel(); closeCharScreen(); eventScope.abort(); audioScene(null); window.removeEventListener('keydown', keys); for (const t of timers) clearInterval(t); net.close(); try { view.app.destroy(true); } catch {} onExit0(reason); };
  clearUi();
  initAudio();
  const resumeOnGesture = () => initAudio();
  document.addEventListener('pointerdown', resumeOnGesture, { once: true, capture: true, signal: eventScope.signal });
  document.addEventListener('keydown', resumeOnGesture, { once: true, capture: true, signal: eventScope.signal });
  const view = new GameView();
  const net = new Net(token, characterId);
  const st = {
    sheet: null as CharacterSheet | null, journal: [] as JournalEntry[], dialog: null as DialogView | null, facts: {} as Record<string, unknown>,
    zone: '', sector: '', danger: 'public', action: '', destination: '', cityHourMs: 60000, cityEpoch: 0, luck: 0,
    pending: new Map<number, (m: Extract<ServerMsg, { t: 'ack' }>) => void>(), muted: new Set<number>(),
  };
  const refreshScore = () => {
    const room = zoneDef(st.zone);
    if (!room) return;
    const indoor = room.kind === 'interior';
    const hour = ((((Date.now() + net.clockOffset) / st.cityHourMs + st.cityEpoch) % 24) + 24) % 24;
    const night = hour >= 21 || hour < 6;
    const theme = Date.now() < combatMusicUntil ? 'accion' : room.nightlife?.music ?? (indoor ? 'chill' : st.danger === 'lawless' ? 'yermo' : night ? 'noche' : 'calle');
    audioScene(theme, indoor);
  };
  view.serverTime = () => Date.now() + net.clockOffset;
  const cityHour = () => ((((Date.now() + net.clockOffset) / st.cityHourMs + st.cityEpoch) % 24) + 24) % 24;
  const gameEl = document.getElementById('game')!;
  gameEl.replaceChildren();
  try { await view.init(gameEl, cityHour); }
  catch (err) { eventScope.abort(); try { view.app.destroy(true); } catch {} throw err; }

  // ---------------------------------------------------------------- HUD
  const hpBar = h('i', { style: { background: 'var(--red)' } }), stBar = h('i', { style: { background: 'var(--green)' } });
  const needBar = (color: string) => h('i', { style: { background: color } });
  const hgBar = needBar('#ff8a3d'), thBar = needBar('#43a8ff'), ftBar = needBar('#b46cff');
  const needsEl = h('div', { class: 'hud-needs', style: { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 6px', alignItems: 'center', fontSize: '0.8em', margin: '2px 0 4px' } },
    h('span', {}, 'Hambre'), h('div', { class: 'bar', style: { margin: 0 }, role: 'meter', 'aria-label': 'Hambre' }, hgBar),
    h('span', {}, 'Sed'), h('div', { class: 'bar', style: { margin: 0 }, role: 'meter', 'aria-label': 'Sed' }, thBar),
    h('span', {}, 'Sueño'), h('div', { class: 'bar', style: { margin: 0 }, role: 'meter', 'aria-label': 'Sueño' }, ftBar));
  const statusEl = h('div', { style: { fontSize: '0.85em', minHeight: '1.2em' }, 'aria-live': 'polite' });
  const psycheEl = h('div', { class: 'psyche-meter', style: { display: 'none' } });
  const substancesEl = h('div', { class: 'substance-readout', 'aria-label': 'Estado de consumo' });
  const nameEl = h('div', {}), moneyEl = h('div', { class: 'mono' }), statsEl = h('div', { class: 'muted hud-stats', style: { fontSize: '0.85em' } });
  const hpTxt = h('span', { class: 'mono' }), stTxt = h('span', { class: 'mono' });
  const xpFill = h('i', { style: { background: 'var(--xp)' } }), xpTxt = h('span', { class: 'mono small' });
  const xpEl = h('div', { class: 'hud-xp', title: 'Experiencia de nivel' }, h('div', { class: 'xpbar' }, xpFill), xpTxt);
  const tl = h('div', { class: 'hud hud-tl', 'aria-label': 'Estado del personaje' }, nameEl, xpEl,
    h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('span', {}, 'Salud'), hpTxt), h('div', { class: 'bar', role: 'meter', 'aria-label': 'Salud' }, hpBar),
    h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('span', {}, 'Aguante'), stTxt), h('div', { class: 'bar', role: 'meter', 'aria-label': 'Aguante' }, stBar),
    needsEl, psycheEl, statusEl, substancesEl, moneyEl, statsEl);
  const mm = h('canvas', { id: 'minimap', title: 'Mapa grande (M)', onclick: () => bigMap() }) as HTMLCanvasElement;
  const atlas = new Atlas();
  const minimap = new Minimap(mm,atlas);
  const sectorEl = h('div', { class: 'hud-place', style: { fontWeight: '600', marginTop: '4px' } }), dangerEl = h('span', { class: 'badge' }), clockEl = h('span', { class: 'mono' }), netEl = h('span', { class: 'mono' });
  // Reloj de la ciudad (un día dura 1 h 30 min reales) y turno del puesto de trabajo.
  const phaseEl = h('span', { class: 'phase' }), shiftEl = h('div', { class: 'shift hud-place' });
  const clockBox = h('div', { class: 'clockbox' }, h('span', { class: 'clock mono' }, clockEl), phaseEl);
  // Destino marcado: chip con el nombre y botón para desmarcarlo.
  const goalEl = h('div', { class: 'goalchip', style: { display: 'none' } });
  const streetGoal = h('div', { id: 'underworld-goal' });
  const sbar = stealthBar();
  // v0.38 · Tu expediente en el HUD (lo que sabe la PCV, el precio por tu cabeza…), con más detalle cuanta más Interfaz.
  const fileEl = h('div', { class: 'hud-file', id: 'hud-file', title: 'Tu expediente (Personaje → Interfaz)', onclick: () => charScreen('net') });
  const renderFile = (v: DossierView) => {
    const bits: (HTMLElement | string)[] = [];
    const tag = (t: string, cls = '') => h('span', { class: `ftag ${cls}` }, t);
    if (!v.wanted && !v.bounty && !v.bountyApprox) bits.push(tag('PCV: limpio', 'ok'));
    else if (v.tier < 1) bits.push(tag('PCV: te busca', 'bad'));
    else bits.push(tag(`★ ${v.wantedLevel ?? 0}`, v.wanted ? 'bad' : ''), tag(v.bounty ? fmtMoney(v.bounty) : v.bountyApprox ? `~ ${v.bountyApprox}` : 'sin precio', v.bounty || v.bountyApprox ? 'bad' : ''));
    if (v.description?.matches) bits.push(tag(`Testigos: tu ropa ${v.description.minutes}′`, 'warn'));
    if (v.decayMin && v.wanted) bits.push(tag(`olvida ~${v.decayMin}′`));
    if (v.hunters?.length) bits.push(tag(`${v.hunters.length} cazándote`, 'bad'));
    if (v.offers.length) bits.push(tag(`📱 ${v.offers.length} oferta`, 'good'));
    if (v.retainer) bits.push(tag(`a sueldo: ${v.retainer.factionName}`, 'good'));
    fileEl.replaceChildren(h('span', { class: 'flabel' }, 'EXPEDIENTE'), ...bits);
  };
  setInterval(() => { if (net.status === 'online' && hud.file) net.send({ t: 'dossier', seq: 0, action: 'view' } as any); }, 8000);
  const tr = h('div', { class: 'hud hud-tr' }, mm, sbar.el, fileEl, goalEl, streetGoal, sectorEl, h('div', { class: 'row hud-place', style: { justifyContent: 'space-between', marginTop: '4px' } }, h('span', {}, 'Peligro ', dangerEl), clockBox), shiftEl, h('div', { class: 'muted hud-net', style: { fontSize: '0.8em' } }, 'Red: ', netEl));
  const actionEl = h('div', { class: 'actionline', 'aria-live': 'polite', id: 'action' });
  const progress = h('div', { class: 'progress', style: { display: 'none' } }, h('i'));
  const stanceSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Postura' });
  const renderStance = () => stanceSeg.replaceChildren(...STANCES.map((s) => h('button', { 'aria-pressed': String(st.sheet?.stance === s.id), title: s.desc, onclick: () => { net.send({ t: 'stance', stance: s.id } as any); blip(); } }, s.label)));
  // v0.7: barra inferior compacta. Arriba, las acciones; abajo, los paneles como iconos con su tecla (cambia en Esc → Teclas).
  const ib = (icon: string, label: string, action: string, fn: () => void, id?: string, extra = '') => h('button', { class: `ibtn ${extra}`, id, onclick: fn, title: `${label} (${keyOf(action)})`, 'aria-label': label },
    h('span', { class: 'ico' }, icon), h('span', { class: 'lbl' }, label), h('span', { class: 'kbd' }, keyOf(action)));
  const toolbarA = h('div', { class: 'toolbar actions' }), toolbarB = h('div', { class: 'toolbar panels' });
  const renderToolbar = () => {
    toolbarA.replaceChildren(
      ib('✋', 'Cancelar', 'cancel', () => stop(), 'btn-stop'), ib('🏃', 'Retirada', 'retreat', () => retreat(), 'btn-retreat', 'danger'), stanceSeg,
      ib('👟', 'Correr', 'run', () => toggleRun(), 'btn-run'), ib('💃', 'Bailar', 'dance', () => openDances(), 'btn-dance'), ib('💤', 'Dormir', 'sleep', () => toggleSleep(), 'btn-sleep'),
      ib('🤖', 'Auto', 'auto', () => toggleAuto(), 'btn-auto'));
    toolbarB.replaceChildren(
      ib('🧍', 'Personaje', 'character', () => charScreen('sheet'), 'btn-sheet', 'mini'), ib('🎒', 'Inventario', 'inventory', () => charScreen('inv'), 'btn-inv', 'mini'),
      ib('🦾', 'Cromo', 'cyber', () => charScreen('cyber'), undefined, 'mini'), ib('⭐', 'Habilidades', 'skills', () => charScreen('skills'), 'btn-skills', 'mini'),
      ib('🫀', 'Salud', 'body', () => bodyPanel.toggle(), 'btn-body', 'mini'), ib('🗺', 'Mapa', 'map', () => mapPanel(), undefined, 'mini'), ib('📓', 'Diario', 'journal', () => journalPanel(), 'btn-journal', 'mini'),
      ib('📱', 'Buscar', 'search', () => searchPanel({ net }, 'phone'), undefined, 'mini'), ib('🚗', 'Conducir', 'drive', () => toggleDrive(), 'btn-drive', 'mini'), ib('🧳', 'Maletero', 'trunk', () => net.send({ t: 'trunk', action: 'view' } as any), undefined, 'mini'),
      ib('💼', 'Empleos', 'jobs', () => net.send({ t: 'jobs' } as any), undefined, 'mini'), ib('🏠', 'Propiedades', 'props', () => net.send({ t: 'props' } as any), undefined, 'mini'),
      ib('📈', 'Mercado', 'market', () => marketLive(true), undefined, 'mini'), ib('🎯', 'Recompensas', 'bounties', () => net.send({ t: 'bounties' } as any), undefined, 'mini'),
      ib('⚑', 'Facciones', 'factions', () => net.send({ t: 'factions' } as any), undefined, 'mini'), ib('✚', 'Ámbar', 'ambar', () => net.send({ t: 'ambar' } as any), undefined, 'mini'),
      h('button', { class: 'ibtn mini', title: 'Menú (Esc)', 'aria-label': 'Menú', onclick: () => openPause() }, h('span', { class: 'ico' }, '☰'), h('span', { class: 'lbl' }, 'Menú'), h('span', { class: 'kbd' }, 'Esc')));
  };
  const bottom = h('div', { class: 'hud hud-bottom' }, actionEl, progress, toolbarA, toolbarB);
  // Panel del cuerpo (siempre a mano mientras peleas).
  const bodyPanel = new BodyPanel(net, (t, k) => toast(t, k), () => keyOf('body'));
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
  const chatIn = h('input', { id: 'chat-input', placeholder: `Chat local (${keyOf('chat')})…`, maxLength: 200, 'aria-label': 'Chat local' }) as HTMLInputElement;
  chatIn.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { const t = chatIn.value.trim(); if (t) net.send({ t: 'chat', channel: 'local', text: t } as any); chatIn.value = ''; chatIn.blur(); }
    if (e.key === 'Escape') chatIn.blur();
  });
  const chat = h('div', { class: 'chat' }, h('div', { class: 'chat-tag' }, 'LOCAL · lo oyen los de cerca'), chatLog, chatIn);
  // Chat global, a la derecha: lo lee toda la ciudad.
  const globalLog = h('div', { class: 'log', 'aria-live': 'polite' });
  const globalIn = h('input', { id: 'chat-global-input', placeholder: `Chat global (${keyOf('chatGlobal')})…`, maxLength: 200, 'aria-label': 'Chat global' }) as HTMLInputElement;
  globalIn.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { const t = globalIn.value.trim(); if (t) net.send({ t: 'chat', channel: 'global', text: t } as any); globalIn.value = ''; globalIn.blur(); }
    if (e.key === 'Escape') globalIn.blur();
  });
  const globalChat = h('div', { class: 'chat chat-global' }, h('div', { class: 'chat-tag' }, 'GLOBAL · toda la ciudad'), globalLog, globalIn);
  const tooltip = h('div', { class: 'tooltip', style: { display: 'none' } });
  const dialogEl = h('div', { class: 'dialog', id: 'dialog', role: 'dialog', style: { display: 'none' } });
  const ctxOverlay = h('div', { class: 'overlay', style: { display: 'none' } }, h('div', { class: 'reward' }, h('h2', {}, 'Recuperando gráficos…'), h('p', {}, 'El contexto gráfico se ha perdido. La simulación sigue en el servidor.')));
  $ui().append(tl, tr, bottom, weaponEl, abilityEl, xpPops, toasts, chat, globalChat, bodyPanel.el, tooltip, dialogEl, ctxOverlay);
  queueMicrotask(() => renderToolbar());

  const toast = (text: string, kind: 'info' | 'good' | 'warn' | 'bad' = 'info') => {
    const t = h('div', { class: `toast ${kind}` }, text);
    toasts.append(t);
    while (toasts.children.length > 5) toasts.firstChild!.remove();
    setTimeout(() => t.remove(), kind === 'bad' || kind === 'warn' ? 7000 : 5000);
    if (kind === 'good') blip('good'); else if (kind === 'bad') blip('bad');
  };
  const setAction = (text: string, duration?: number) => {
    st.action = text;
    actionEl.classList.toggle('is-help', !text && !st.destination);
    actionEl.textContent = text ? `Acción: ${text}${st.destination ? ` · Destino: ${st.destination}` : ''}` : st.destination ? `Destino: ${st.destination}` : `${[keyOf('up'), keyOf('left'), keyOf('down'), keyOf('right')].join('')} para andar · ${keyOf('interact')} o clic: interactuar · clic der. + clic: atacar (Ctrl: fuerte) · ${keyOf('wheel')}: armas · ${keyOf('hack')}: hackear · ${keyOf('dodge')}: esquivar · ${keyOf('kick')}: patada`;
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
    view.sight = installedSight(s.cyber, opticalDefs);
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
    view.driving = !!s.driving;
    if (view.driving) view.guarding = false;
    view.setMyAttributes(s.attributes as any, s.substances.speed);
    bodyPanel.update(s);
    // v0.8: compañeros de las matrices, síntomas de ciberpsicosis y medidor de estabilidad mental.
    view.setCompanions(s.matrices.equipped);
    view.psyche = s.psyche.level;
    for (const [cls, on] of [['psy1', s.psyche.level >= 15], ['psy2', s.psyche.level >= 45], ['psy3', s.psyche.level >= 70]] as const) document.body.classList.toggle(cls, on);
    psycheEl.style.display = s.psyche.level >= 15 || s.psyche.episode ? '' : 'none';
    psycheEl.replaceChildren(h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('span', {}, '🧠 Estabilidad mental'), h('b', { class: 'mono' }, `${100 - s.psyche.level}%`)),
      h('div', { class: 'bar psy' }, h('i', { style: { width: `${100 - s.psyche.level}%`, background: s.psyche.level >= 70 ? 'var(--red)' : s.psyche.level >= 45 ? 'var(--orange)' : 'var(--yellow)' } })),
      s.psyche.episode ? h('div', { class: 'small', style: { color: 'var(--red)' } }, `${s.psyche.episode.grave ? 'Ciberpsicosis grave' : 'Episodio de ciberpsicosis'}: quedan ${s.psyche.episode.days} días de juego`) : '');
    document.body.classList.toggle('psicosis', s.psychosis === 'Ciberpsicosis');
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
  let prisonContext:PrisonView|undefined;
  const prisonBadge=h('button',{class:'btn small penal-badge',hidden:true,onclick:()=>net.send({t:'penal',action:'estado',opId:newOpId()})},'Expediente de Las Salinas');
  $ui().append(prisonBadge);
  let casino:ReturnType<typeof casinoPanel>|undefined;
  const closePanels = () => { closeFittingRoom(); closeDanceMenus(); for (const id of ['casino-panel', 'penal-panel', 'bank-panel', 'journal-panel', 'sheet-panel', 'inv-panel', 'settings-panel', 'map-panel', 'shop-panel', 'market-panel', 'jobs-panel', 'clinic-panel', 'bounty-panel', 'target-menu', 'factions-panel', 'ambar-panel', 'world-panel', 'building-panel', 'realty-panel', 'dealer-panel', 'props-panel', 'stash-panel', 'market-live-panel', 'hiring-panel', 'elevator-panel', 'auto-panel', 'underworld-panel']) document.getElementById(id)?.remove(); };
  const toggleSleep = () => net.send({ t: st.sheet?.sleeping ? 'wake' : 'sleep' } as any);
  const panel = (id: string, title: string, ...body: (Node | string)[]) => {
    const was = document.getElementById(id); closePanels(); if (was) return;
    const p = h('div', { class: 'panel', id, role: 'dialog', 'aria-label': title }, h('div', { class: 'panel-head' }, h('h2', {}, title), h('button', { class: 'btn small close', onclick: () => p.remove() }, 'Cerrar ✕')), ...body);
    $ui().append(p); tooltip.style.display = 'none';
  };
  const journalPanel = () => {
    const u = st.sheet?.underworld;
    const category = { principal: 'Principal', secundaria: 'Secundaria', terciaria: 'Encargo breve', evento: 'Suceso' };
    const status = { lead: 'Pista', active: 'En curso', completed: 'Completada', abandoned: 'Abandonada' };
    panel('journal-panel', 'Diario de encargos',
      ...(u && (u.rep > 0 || u.membership) ? [h('h3', {}, 'Bajos fondos'), undergroundStanding(u)] : []),
      ...(u?.job ? [jobBrief(u.job, net)] : []),
    ...(st.journal.length ? st.journal.map((j) => h('div', { class: 'choice', style: { marginBottom: '8px' } },
      h('h4', {}, j.title, h('span', { class: 'chip' }, `${category[j.category ?? 'principal']} · ${status[j.state]}`)),
      h('p', {}, j.lead ?? j.summary),
      j.outcomeText ? h('p', {}, j.outcomeText) : j.outcome === 'fixer' ? h('p', {}, 'Nadia controla el generador.') :
        j.outcome === 'market' ? h('p', {}, 'La asociación del mercado controla el generador.') : null,
      j.shared ? h('p', {}, `Participantes: ${j.participants}`) : null,
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
  const bigMap = () => mapPanel(true);

  // ---------------------------------------------------------------- órdenes
  const stop = () => { net.send({ t: 'stop' } as any); view.cancelPrediction(); st.destination = ''; setAction(''); };
  const retreat = () => {
    const seq = net.send({ t: 'retreat' } as any);
    st.pending.set(seq, (a) => { if (a.ok && a.path) { view.confirmPath(a.path); st.destination = a.info ?? 'Refugio'; setAction('Retirándose'); } else toast(a.reason ?? 'Sin retirada posible', 'warn'); });
  };
  // v0.7 · Ratón: el suelo ya no mueve (se anda con WASD). Clic izquierdo en una persona (o en ti) abre su menú;
  // en una puerta u objeto, interactúa. Con el clic derecho mantenido (apuntar o bloquear), clic izquierdo en alguien = atacar.
  let aimPart: string = 'torso';
  // v0.9 · Gritos al morir y ambiente de tráfico y sirenas.
  view.onDied = (e) => { const d = Math.hypot(e.x - view.me.x, e.y - view.me.y); if (d < 30) sfx.voice('muerte', (e.s.id * 2654435761) % 2 === 0, d, ((e.x - view.me.x) - (e.y - view.me.y)) / 12); };
  timers.push(window.setInterval(() => {
    const z = zoneDef(st.zone);
    if (!z || z.kind !== 'exterior' || z.cyber) return;
    const r = Math.random();
    if (r < 0.07) sfx.carPass(4 + Math.random() * 14, Math.random() * 2 - 1, Math.random() < 0.3);
    else if (r < 0.08) sfx.horn(6 + Math.random() * 20, Math.random() * 2 - 1);
    const cop = [...view.ents.values()].find((e) => (e.s.npcType === 'police' || e.s.npcType === 'hierro') && !e.s.dead && Math.hypot(e.x - view.me.x, e.y - view.me.y) < 30);
    if (cop && (st.sheet?.wanted ?? 0) >= 1) sfx.siren(Math.hypot(cop.x - view.me.x, cop.y - view.me.y), ((cop.x - view.me.x) - (cop.y - view.me.y)) / 12);
  }, 1000));
  let wheelRef: { pickHovered: () => void; close: () => void } | null = null;
  // Ruleta: al soltar la tecla se elige el arma señalada (si la mantienes pulsada); Esc la cierra.
  window.addEventListener('keyup', (ev) => { if (wheelRef && actionFor(ev.key.toLowerCase()) === 'wheel' && document.getElementById('weapon-wheel') && (ev.timeStamp - wheelOpenedAt) > 250) { wheelRef.pickHovered(); wheelRef = null; } }, { signal: eventScope.signal });
  let wheelOpenedAt = 0;
  window.addEventListener('keydown', (ev) => { if (actionFor(ev.key.toLowerCase()) === 'wheel' && !ev.repeat) wheelOpenedAt = ev.timeStamp; }, { signal: eventScope.signal, capture: true });
  let ctrlHeld = false;
  window.addEventListener('keydown', (ev) => { if (ev.key === 'Control') ctrlHeld = true; }, { signal: eventScope.signal });
  window.addEventListener('keyup', (ev) => { if (ev.key === 'Control') ctrlHeld = false; }, { signal: eventScope.signal });
  window.addEventListener('blur', () => { ctrlHeld = false; }, { signal: eventScope.signal });
  /** v0.9 · Esquivar (Espacio) y patada (Q) al objetivo señalado o al enemigo más cercano. */
  let lastSteerDir = { dx: 1, dy: 0 };
  // v0.12 · Mismas reglas que el servidor antes de predecir: recuperación de 0,9 s y aguante suficiente. Si el servidor
  // la rechaza igualmente, el personaje vuelve suavemente a su posición confirmada.
  let dodgeReadyAt = 0;
  const dodge = () => {
    const now = performance.now();
    if (now < dodgeReadyAt) return;
    if (st.sheet?.sleeping || (st.sheet && st.sheet.stamina < 5)) { toast('Sin aguante para esquivar.', 'warn'); return; }
    const d = view.steer.dx || view.steer.dy ? view.steer : lastSteerDir;
    dodgeReadyAt = now + 950;
    const seq = net.send({ t: 'dodge', dx: d.dx, dy: d.dy } as any);
    st.pending.set(seq, (a) => { if (!a.ok) { toast(a.reason ?? 'No puedes esquivar', 'warn'); view.resyncMe(); } });
    view.dash(d.dx, d.dy);
  };
  const kick = () => {
    const isPerson = (x: CEnt) => (x.s.kind === 'npc' || x.s.kind === 'player') && x.s.id !== view.meId && !x.s.dead && x.s.state !== 'downed' && x.s.npcType !== 'essential';
    let t = view.hovered && isPerson(view.hovered) && Math.hypot(view.hovered.x - view.me.x, view.hovered.y - view.me.y) < 2.4 ? view.hovered : null;
    if (!t) t = [...view.ents.values()].filter((x) => isPerson(x) && Math.hypot(x.x - view.me.x, x.y - view.me.y) < 2.2).sort((p1, p2) => Math.hypot(p1.x - view.me.x, p1.y - view.me.y) - Math.hypot(p2.x - view.me.x, p2.y - view.me.y))[0] ?? null;
    if (!t) { toast('No hay nadie a tiro de patada.', 'info'); return; }
    const seq = net.send({ t: 'hostile', target: t.s.id, action: 'kick', opId: newOpId(), remote: true } as any);
    st.pending.set(seq, (a) => { if (!a.ok) toast(a.reason ?? 'No puedes', 'warn'); });
  };
  // v0.9 · Modo hackeo: R y luego clic sobre una persona, cámara, cajero o terminal → panel de hackeo.
  let hackMode = false;
  const hackBadge = h('div', { class: 'hack-badge', style: { display: 'none' } }, h('b', {}, '⌁ MODO HACKEO'), h('span', {}, ` · clic en un objetivo · ${keyOf('hack')} o Esc para salir`));
  $ui().append(hackBadge);
  const setHackMode = (on: boolean) => {
    hackMode = on;
    document.body.classList.toggle('hack-mode', on);
    hackBadge.style.display = on ? '' : 'none';
    if (on) { document.getElementById('target-menu')?.remove(); blip('ui'); }
  };
  // v0.20 · Cuerpo a cuerpo (o con las manos vacías): con el clic derecho mantenido, el clic izquierdo lanza el golpe hacia
  // el cursor tanto si hay alguien como si no. El movimiento se ve al momento; el servidor decide si alcanza a alguien.
  const meleeSwing = (tx: number, ty: number) => {
    const dx = tx - view.me.x, dy = ty - view.me.y;
    if (!view.swing(ctrlHeld, (st.sheet?.weapon?.cooldown ?? 1) * 1000 * (ctrlHeld ? 1.8 : 1))) return;
    const seq = net.send({ t: 'swing', dx: dx || 1, dy, heavy: ctrlHeld, opId: newOpId() } as any);
    st.pending.set(seq, (a) => { if (!a.ok && a.reason) toast(a.reason, 'warn'); });
  };
  const melee = () => st.sheet?.weapon?.kind !== 'ranged';
  view.onGroundClick = (x?: number, y?: number) => {
    if (view.guarding && melee() && !hackMode && x !== undefined && y !== undefined) { meleeSwing(x, y); return; }
    if (hackMode) { setHackMode(false); return; }
    closeDanceMenus();
    document.getElementById('underworld-panel')?.remove();
    document.getElementById('target-menu')?.remove();
  };
  view.onEntityClick = (e: CEnt) => {
    closeDanceMenus();
    if (hackMode) {
      setHackMode(false);
      if (e.s.id === view.meId) return;
      const seq = net.send({ t: 'hackMenu', target: e.s.id } as any);
      st.pending.set(seq, (a) => { if (!a.ok) toast(a.reason ?? 'Nada que hackear', 'warn'); });
      return;
    }
    const person = e.s.kind === 'player' || e.s.kind === 'npc';
    if (e.s.id === view.meId) { selfMenu(); return; }
    // (En guardia, el clic golpea aunque caiga sobre tu propio personaje: hacia donde esté el cursor.)
    if (view.guarding && melee()) { if (e.s.id === view.meId) meleeSwing(view.cursor.x + (view.cursor.x === view.me.x ? 1 : 0), view.cursor.y); else meleeSwing(e.x, e.y); return; }
    if (person && view.guarding) {
      // v0.9 · Ctrl + clic: golpe fuerte (cuerpo a cuerpo) o ráfaga (a distancia).
      const lethal = st.sheet?.weapon?.nonlethal !== 'solo';
      const seq = net.send({ t: 'hostile', target: e.s.id, action: ctrlHeld ? 'heavy' : lethal ? 'attack' : 'knockout', opId: newOpId(), part: aimPart, remote: true } as any);
      st.pending.set(seq, (a) => { if (!a.ok) toast(a.reason ?? 'No puedes', 'warn'); });
      return;
    }
    if (person && e.s.kind === 'player' || (person && e.s.npcType && e.s.npcType !== 'essential') || (person && e.s.dead)) { net.send({ t: 'menu', target: e.s.id } as any); return; }
    const go = () => {
      const seq = net.send({ t: 'interact', target: e.s.id, remote: true } as any);
      st.pending.set(seq, (a) => { if (!a.ok) { toast(a.reason ?? 'No disponible', 'warn'); st.destination = ''; } });
    };
    if (e.s.kind === 'door' && e.s.danger === 'disputed') ask(`${e.s.name} lleva a una zona peligrosa (roja). ¿Cruzar?`, go, { danger: true, ok: 'Cruzar' }); else go();
  };
  /** Menú propio (clic izquierdo sobre tu personaje). */
  const selfMenu = () => {
    document.getElementById('target-menu')?.remove();
    const me = view.ents.get(view.meId);
    const sp = me ? view.world.toGlobal(worldToScreen(me.x, me.y)) : { x: 400, y: 300 };
    const item = (label: string, key: string, fn: () => void) => h('button', { class: 'ctx-opt', onclick: () => { m.remove(); fn(); } }, h('span', {}, label), h('span', { class: 'kbd' }, keyOf(key)));
    const m = h('div', { class: 'ctx-menu', id: 'target-menu', role: 'menu', style: { left: `${Math.min(window.innerWidth - 300, sp.x + 14)}px`, top: `${Math.max(10, sp.y - 120)}px` } },
      h('div', { class: 'ctx-head' }, h('b', {}, st.sheet?.name ?? 'Tú'), h('button', { class: 'btn small', onclick: () => m.remove() }, '✕')),
      h('div', { class: 'ctx-group' },
        item('💃 Bailar', 'dance', () => openDances()), item('🫀 Salud y heridas', 'body', () => bodyPanel.toggle(true)), item('🎒 Inventario', 'inventory', () => charScreen('inv')), item('📑 Expediente personal', 'character', () => { if (st.sheet) recordPanel(st.sheet.id); }),
        item(st.sheet?.sleeping ? '☀ Despertar' : '💤 Dormir aquí', 'sleep', () => toggleSleep()), item('🏃 Retirada al refugio', 'retreat', () => retreat())),
      h('div', { class: 'ctx-group' }, h('div', { class: 'ctx-glabel' }, 'Al atacar con clic derecho, apunta a:'),
        h('div', { class: 'ctx-parts' }, ...['torso', 'cabeza', 'brazos', 'manos', 'piernas'].map((pp) => h('button', { class: `chip-btn${aimPart === pp ? ' on' : ''}`, onclick: (ev: Event) => { aimPart = pp; (ev.currentTarget as HTMLElement).parentElement!.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === ev.currentTarget)); } }, pp)))));
    $ui().append(m);
    const close = (ev: MouseEvent) => { if (!m.contains(ev.target as Node)) { m.remove(); window.removeEventListener('mousedown', close, true); } };
    setTimeout(() => window.addEventListener('mousedown', close, true), 50);
  };
  // Clic derecho mantenido: apuntar (armas a distancia) o bloquear (cuerpo a cuerpo). Se ve una retícula junto al cursor.
  const reticle = h('div', { class: 'reticle', style: { display: 'none' } }, h('i'));
  $ui().append(reticle);
  const aimFacing=()=>facingToIdx(view.cursor.x-view.me.x,view.cursor.y-view.me.y);
  let guardFacing=-1, lastFacingAt=0;
  view.onGuard = (on) => {
    guardFacing=on?aimFacing():-1;
    net.send({t:'guard',on,facing:on?guardFacing:undefined} as any);
    guardSince = on ? performance.now() : 0;
    reticle.style.display = on ? '' : 'none';
    if (on) document.getElementById('target-menu')?.remove();
  };
  let guardSince = 0;
  timers.push(window.setInterval(() => {
    if (!view.guarding) return;
    const facing=aimFacing();
    if(facing!==guardFacing && performance.now()-lastFacingAt>=125){
      guardFacing=facing;lastFacingAt=performance.now();net.send({t:'guard',on:true,facing} as any);
    }
    const ranged = st.sheet?.weapon?.kind === 'ranged';
    const aimT = (st.sheet?.aim.time ?? 1.5) * 1000;
    const k = Math.min(1, (performance.now() - guardSince) / aimT);
    const t = view.hovered && (view.hovered.s.kind === 'npc' || view.hovered.s.kind === 'player') && view.hovered.s.id !== view.meId ? view.hovered : null;
    const d = t ? Math.hypot(t.x - view.me.x, t.y - view.me.y) : Infinity;
    const safe = ranged && k >= 1 && d <= (st.sheet?.aim.range ?? 0);
    const inRange = d <= (st.sheet?.weapon?.range ?? 1.5);
    reticle.className = `reticle ${ranged ? 'aim' : 'block'}${safe ? ' safe' : inRange ? ' range' : ''}`;
    reticle.style.left = `${view.cursor.sx}px`; reticle.style.top = `${view.cursor.sy}px`;
    (reticle.firstChild as HTMLElement).style.setProperty('--k', String(ranged ? k : 1));
    reticle.title = ranged ? (safe ? 'Tiro seguro' : k < 1 ? 'Apuntando…' : 'Fuera de tiro seguro') : 'Bloqueando';
  }, 50));
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
  void worldActions;
  // La etiqueta flotante solo tiene sentido sobre el mapa: se oculta al pasar por encima de la interfaz.
  $ui().addEventListener('pointerover', (ev) => { if (ev.target !== $ui()) tooltip.style.display = 'none'; });
  // v0.38 · Lo que sabes de quien señalas depende de tu Interfaz: se pide al servidor (que decide qué capas ves).
  const scans = new Map<number, { info: ScanInfo; at: number }>();
  let hovered: { e: NonNullable<Parameters<typeof view.onHover>[0]>; sx: number; sy: number } | null = null;
  const ATT: Record<string, string> = { hostil: '#ff4050', recelosa: '#ffb040', neutral: '#c8c8d8', amistosa: '#5aff8a' };
  const scanLines = (i: ScanInfo) => {
    const out: (HTMLElement | string)[] = [];
    const chip = (t: string, color?: string) => h('span', { class: 'scan-chip', style: color ? { color, borderColor: color } : {} }, t);
    const head: HTMLElement[] = [];
    if (i.kind) head.push(chip(i.kind === 'jugador' ? '◉ PERSONA' : '◌ PNJ', i.kind === 'jugador' ? '#43f3ff' : '#9a9ac0'));
    if (i.level !== undefined) head.push(chip(`Nv ${i.level}`)); else if (i.levelApprox) head.push(chip(i.levelApprox));
    if (i.attitude) head.push(chip(i.attitude, ATT[i.attitude]));
    if (i.wanted) head.push(chip(`★ buscado ${i.wanted}`, '#ff4050'));
    if (head.length) out.push(h('div', { class: 'scan-row' }, ...head));
    const line = (k: string, v?: string | number | false | null) => { if (v !== undefined && v !== null && v !== false && v !== '') out.push(h('div', { class: 'scan-line' }, h('span', { class: 'muted' }, k + ' '), String(v))); };
    line('', [...new Set([i.title, i.faction].filter(Boolean))].join(' · '));
    line('Salud', i.hpPct !== undefined ? `${i.hpPct}%` : undefined);
    line('Arma', i.armed); if (i.bleeding) line('', 'Sangra');
    line('Recompensa', i.bounty ? fmtMoney(i.bounty) : undefined);
    line('Pagan', i.bountyBy?.join(', '));
    line('Antecedentes', i.record?.length ? i.record.slice(0, 2).join(' · ') : undefined);
    line('Cromo', i.chrome?.length ? (i.chrome.length > 3 ? `${i.chrome.slice(0, 3).join(', ')} +${i.chrome.length - 3}` : i.chrome.join(', ')) : undefined);
    line('Destaca en', i.skills?.join(', '));
    line('Lleva', i.money); if (i.debt) line('', 'Debe dinero a los Kuro');
    line('RAM', i.ram); line('Humanidad', i.humanity); if (i.psycho) line('', '⚠ Riesgo de ciberpsicosis');
    if (i.tier < 5) out.push(h('div', { class: 'scan-more' }, `Interfaz ${['3', '6', '10', '15', '20'][i.tier]}: más datos`));
    return out;
  };
  view.onHover = (e, sx, sy) => {
    hovered = e ? { e, sx, sy } : null;
    if (!e) { tooltip.style.display = 'none'; return; }
    const person = e.s.kind === 'player' || e.s.kind === 'npc';
    const sc = person ? scans.get(e.s.id) : undefined;
    if (person && (!sc || Date.now() - sc.at > 2500)) { if (sc) sc.at = Date.now(); else scans.set(e.s.id, { info: { id: e.s.id, tier: 0, name: e.s.name }, at: Date.now() - 2000 }); net.send({ t: 'look', target: e.s.id } as any); }
    const hint = hackMode ? (e.s.id === view.meId ? 'Modo hackeo: elige a otro' : 'Clic: ver hackeos posibles') : e.s.id === view.meId ? 'Clic: tu menú' : e.s.kind === 'door' ? `Clic o ${keyOf('interact')}: entrar · Zona ${DANGER_TXT[e.s.danger ?? 'public']}` : e.s.kind === 'object' ? `Clic o ${keyOf('interact')}: usar` : view.guarding ? `Clic: ¡atacar! · Ctrl+clic: golpe fuerte o ráfaga · ${keyOf('kick')}: patada · ${keyOf('dodge')}: esquivar` : `Clic: menú (a distancia) · clic derecho mantenido + clic: atacar · ${keyOf('hack')} + clic: hackear`;
    const info = sc && sc.info.tier >= 0 && sc.info.name === e.s.name ? sc.info : undefined;
    tooltip.replaceChildren(h('b', {}, e.s.name), !info?.title && e.s.title ? ` · ${e.s.title}` : '', e.s.label ? h('div', { class: 'muted' }, e.s.label) : '', ...(info && hud.scan ? scanLines(info) : []), hud.hints ? h('div', { class: 'cy' }, hint) : '');
    tooltip.style.display = 'block'; tooltip.style.left = `${sx + 14}px`; tooltip.style.top = `${sy + 14}px`;
  };
  view.onContextLost = (lost) => { ctxOverlay.style.display = lost ? 'flex' : 'none'; };

  // Tab y Espacio solo actúan sobre el mundo si el foco no está en un control del HUD (para no romper la navegación por teclado).
  const onWorld = () => { const a = document.activeElement; return !a || a === document.body || a.tagName === 'CANVAS'; };
  // v0.7 · Teclado configurable (Esc → Teclas). WASD o flechas para andar.
  const held = new Set<string>();
  const MOVE: Record<string, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const ARROWS: Record<string, string> = { arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right' };
  let lastSteer = { dx: 0, dy: 0 }, lastSteerAt = 0;
  const pushSteer = (force = false) => {
    let sx = 0, sy = 0;
    for (const a of held) { const v = MOVE[a]; if (v) { sx += v[0]; sy += v[1]; } }
    // Pantalla → mundo isométrico: arriba = (−1,−1), derecha = (1,−1). (v0.9: W y S iban al revés.)
    let dx = sx + sy, dy = sy - sx;
    // v0.39 · Con la cámara cercana, W va hacia donde mira la cámara y A/D de lado.
    if (view.near && (sx || sy)) { const f = view.camForward(); dx = -sy * f.x - sx * f.y; dy = -sy * f.y + sx * f.x; }
    else if (sx || sy) [dx,dy]=view.isoMove(dx,dy);
    const len = Math.hypot(dx, dy); if (len) { dx /= len; dy /= len; }
    view.steer = { dx, dy };
    if (dx || dy) lastSteerDir = { dx, dy };
    const changed = dx !== lastSteer.dx || dy !== lastSteer.dy;
    if (changed || force || ((dx || dy) && performance.now() - lastSteerAt > 450)) {
      if (changed && (dx || dy)) { closeDanceMenus(); if (st.dialog) net.send({ t: 'closeDialog' } as any); view.cancelPrediction(); st.destination = ''; }
      net.send({ t: 'steer', dx, dy } as any); lastSteer = { dx, dy }; lastSteerAt = performance.now();
    }
  };
  timers.push(window.setInterval(() => { if (view.steer.dx || view.steer.dy) pushSteer(); }, 200));
  // v0.12/v0.13 · Qué hace la E ahora mismo: salir del escondite, meter el cadáver que llevas en un contenedor, lo señalado
  // con el ratón, lo más cercano (puerta, objeto, persona o cuerpo) o el contenedor de al lado (rebuscar / esconderte).
  let lootTarget = -1;
  const sendC = (action: 'body' | 'search' | 'hide' | 'out') => { const seq = net.send({ t: 'container', action } as any); st.pending.set(seq, (a) => { if (!a.ok) toast(a.reason ?? 'No puedes', 'warn'); }); };
  const containerMenu = (c: NonNullable<ReturnType<typeof view.nearestContainer>>) => {
    document.getElementById('target-menu')?.remove();
    const sp = view.world.toGlobal(worldToScreen(c.x + 0.5, c.y + 0.5));
    const opt = (label: string, detail: string, fn: () => void) => h('button', { class: 'ctx-opt', onclick: () => { m.remove(); fn(); } }, h('span', {}, label), h('small', { class: 'muted' }, detail));
    const m = h('div', { class: 'ctx-menu', id: 'target-menu', role: 'menu', style: { left: `${Math.min(window.innerWidth - 300, sp.x + 14)}px`, top: `${Math.max(10, sp.y - 100)}px` } },
      h('div', { class: 'ctx-head' }, h('b', {}, c.name[0].toUpperCase() + c.name.slice(1)), h('button', { class: 'btn small', onclick: () => m.remove() }, '✕')),
      h('div', { class: 'ctx-group' },
        c.junk ? opt('🗑 Rebuscar', 'Chatarra, comida, a veces munición', () => sendC('search')) : null,
        c.hide ? opt('🫥 Esconderte dentro', 'Nadie te ve mientras sigas dentro', () => sendC('hide')) : null));
    $ui().append(m);
    const close = (ev: MouseEvent) => { if (!m.contains(ev.target as Node)) { m.remove(); window.removeEventListener('mousedown', close, true); } };
    setTimeout(() => window.addEventListener('mousedown', close, true), 50);
  };
  const eAction = (): { label: string; run: () => void } | null => {
    if (!onWorld() || st.dialog) return null;
    if (st.sheet?.buffs?.escondido) return { label: 'Salir del escondite', run: () => sendC('out') };
    const box = view.nearestContainer();
    if (st.sheet?.carrying && box) return { label: `Meter el cuerpo en ${box.name}`, run: () => sendC('body') };
    const tgt = view.hovered && view.hovered.s.id !== view.meId ? view.hovered : view.nearestInteractable();
    const td = tgt ? Math.hypot(tgt.x - view.me.x, tgt.y - view.me.y) : Infinity;
    if (tgt && (!box || td <= box.d + 0.3 || tgt === view.hovered)) {
      const verb = tgt.s.kind === 'door' ? 'Entrar · ' : tgt.s.kind === 'object' ? 'Usar · ' : tgt.s.dead ? 'Registrar a ' : tgt.s.state === 'downed' ? 'Ver a ' : 'Hablar con ';
      return { label: `${verb}${tgt.s.name ?? ''}`, run: () => { const g = view.guarding; view.guarding = false; view.onEntityClick(tgt); view.guarding = g; } };
    }
    if (box && (box.junk || box.hide)) return { label: `${box.junk ? 'Rebuscar' : 'Abrir'} ${box.name}`, run: () => containerMenu(box) };
    return null;
  };
  const ePrompt = h('div', { class: 'e-prompt', style: { display: 'none', pointerEvents: 'none' } });
  $ui().append(ePrompt);
  timers.push(window.setInterval(() => {
    // El panel de saqueo se cierra si te alejas del cuerpo.
    if (lootTarget >= 0) { const lp = document.getElementById('loot-panel'); const t = view.ents.get(lootTarget); if (!lp) lootTarget = -1; else if (!t || Math.hypot(t.x - view.me.x, t.y - view.me.y) > 3.2) { lp.remove(); lootTarget = -1; } }
    const act = eAction();
    if (!act) { ePrompt.style.display = 'none'; return; }
    ePrompt.textContent = '';
    ePrompt.append(h('span', { class: 'kbd' }, keyOf('interact')), ` ${act.label}`);
    ePrompt.style.display = '';
    // v0.39 · Con la cámara cercana, el aviso va en el centro, un poco por debajo de la mirilla.
    if (view.near) { ePrompt.style.left = `${Math.round(window.innerWidth / 2)}px`; ePrompt.style.top = `${Math.round(window.innerHeight * 0.6)}px`; }
    else { const sp = view.world.toGlobal(worldToScreen(view.me.x, view.me.y)); ePrompt.style.left = `${Math.round(sp.x)}px`; ePrompt.style.top = `${Math.round(sp.y - 95 * view.zoom)}px`; }
  }, 150));
  window.addEventListener('blur', () => { held.clear(); pushSteer(true); }, { signal: eventScope.signal });
  window.addEventListener('keyup', (e) => {
    const a = ARROWS[e.key.toLowerCase()] ?? actionFor(e.key.toLowerCase());
    if (a && MOVE[a] && held.delete(a)) pushSteer();
  }, { signal: eventScope.signal });
  // v0.39 · Cámaras: cenital → tercera persona → primera persona (tecla configurable, F5 por defecto). Se recuerda la última.
  const CAMS: CamMode[] = ['cenital', 'tercera', 'primera'];
  const camHint = h('div', { class: 'cam-hint', style: { display: 'none' } });
  const crosshair = h('div', { class: 'crosshair', style: { display: 'none' } });
  $ui().append(camHint, crosshair);
  let camHintT = 0;
  const applyCamera = (m: CamMode, announce: boolean) => {
    const got = view.setCamMode(m);
    net.send({ t: 'camera', mode: got } as any);
    crosshair.style.display = got === 'primera' ? '' : 'none';
    document.documentElement.dataset.cam = got;
    if (announce) {
      camHint.replaceChildren(h('b', {}, `Cámara: ${CAM_NAMES[got]}`), got === 'cenital' ? '' : h('div', { class: 'small' }, `Arrastra con el ratón para mirar · W hacia donde miras${got === 'tercera' ? ' · rueda: distancia' : ''} · ${keyOf('camera')}: cambiar`));
      camHint.style.display = ''; clearTimeout(camHintT); camHintT = window.setTimeout(() => { camHint.style.display = 'none'; }, 3500);
    }
    held.size && pushSteer(true);
  };
  const cycleCamera = () => {
    if (!settings.chars3d) { toast('Las cámaras cercanas necesitan los personajes en 3D (Ajustes).', 'warn'); return; }
    const next = CAMS[(CAMS.indexOf(view.camMode) + 1) % CAMS.length];
    saveSettings({ camera: next }); applyCamera(next, true); blip('ui');
  };
  queueMicrotask(() => applyCamera(settings.camera ?? 'cenital', false));
  const openPause = () => pauseMenu({ onSettings: () => settingsPanel(() => view.applySettings()), onLogout: () => onExit('logout'), onCharacters: () => onExit(), onKeysChanged: () => { renderToolbar(); chatIn.placeholder = `Chat local (${keyOf('chat')})…`; globalIn.placeholder = `Chat global (${keyOf('chatGlobal')})…`; } });
  const keys = (e: KeyboardEvent) => {
    if (fittingRoomOpen()) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (document.getElementById('keys-panel') || document.getElementById('pause-menu') || document.getElementById('ask-modal')) return;
    const k = e.key.toLowerCase();
    if (document.getElementById('dance-wheel')) return;
    if (k === 'escape') {
      if (document.getElementById('weapon-wheel')) { document.getElementById('weapon-wheel')!.remove(); wheelRef = null; return; }
      if (hackMode) { setHackMode(false); return; }
      if (closeFittingRoom() || closeDanceMenus()) return;
      if (document.getElementById('loot-panel')) { document.getElementById('loot-panel')!.remove(); return; }
      if (charScreenOpen()) closeCharScreen(); else if (document.getElementById('scan-card')) document.getElementById('scan-card')!.remove();
      else if (document.getElementById('target-menu')) document.getElementById('target-menu')!.remove();
      else if (document.querySelector('.panel')) closePanels(); else if (st.dialog) net.send({ t: 'closeDialog' } as any); else openPause();
      return;
    }
    if ((k === 'º' || k === '`' || k === 'f10' || k === 'dead') && st.sheet?.admin) { e.preventDefault(); net.send({ t: 'cheat', cmd: 'info' } as any); return; }
    const a = ARROWS[k] ?? actionFor(k);
    if (a && MOVE[a]) { e.preventDefault(); if (!held.has(a)) { held.add(a); pushSteer(); } return; }
    if (e.repeat) return;
    if (!st.dialog && /^[1-4]$/.test(k) && st.sheet?.abilities[Number(k) - 1]) { net.send({ t: 'ability', id: st.sheet.abilities[Number(k) - 1].id } as any); return; }
    if (st.dialog && /^[1-9]$/.test(k)) { document.getElementById(`opt-${st.dialog.options[Number(k) - 1]?.id}`)?.click(); return; }
    switch (a) {
      case 'run': toggleRun(); break;
      case 'hack': if (onWorld()) setHackMode(!hackMode); break;
      case 'wheel': if (onWorld() && st.sheet) { e.preventDefault(); if (document.getElementById('weapon-wheel')) { wheelRef?.pickHovered(); wheelRef = null; } else wheelRef = weaponWheel(st.sheet, (item) => { net.send({ t: 'equip', item } as any); blip('ui'); toast(item ? `Empuñas: ${content.items.find((i) => i.id === item)?.name ?? item}.` : 'Guardas el arma: manos vacías.', 'info'); }); } break;
      case 'dodge': if (onWorld()) { e.preventDefault(); dodge(); } break;
      case 'kick': if (onWorld()) kick(); break;
      case 'interact': if (onWorld() && !st.dialog) {
        e.preventDefault();
        const act = eAction();
        if (act) act.run();
      } break;
      case 'cancel': stop(); break;
      case 'retreat': retreat(); break;
      case 'body': bodyPanel.toggle(); break;
      case 'dance': openDances(); break;
      case 'sleep': toggleSleep(); break;
      case 'drive': toggleDrive(); break;
      case 'inventory': charScreen('inv'); break;
      case 'character': charScreen('sheet'); break;
      case 'cyber': charScreen('cyber'); break;
      case 'skills': charScreen('skills'); break;
      case 'map': mapPanel(); break;
      case 'journal': journalPanel(); break;
      case 'search': searchPanel({ net }, 'phone'); break;
      case 'trunk': net.send({ t: 'trunk', action: 'view' } as any); break;
      case 'chat': e.preventDefault(); chatIn.focus(); break;
      case 'chatGlobal': e.preventDefault(); globalIn.focus(); break;
      case 'auto': toggleAuto(); break;
      case 'jobs': net.send({ t: 'jobs' } as any); break;
      case 'props': net.send({ t: 'props' } as any); break;
      case 'market': marketLive(true); break;
      case 'bounties': net.send({ t: 'bounties' } as any); break;
      case 'factions': net.send({ t: 'factions' } as any); break;
      case 'ambar': net.send({ t: 'ambar' } as any); break;
      case 'camera': { e.preventDefault(); cycleCamera(); break; }
      case 'zoomIn': view.setZoom(view.zoom * 1.1); break;
      case 'zoomOut': view.setZoom(view.zoom / 1.1); break;
      case 'target': if (onWorld()) {
        // Selección accesible: recorre las entidades interactivas cercanas por distancia.
        e.preventDefault();
        const near = [...view.ents.values()].filter((x) => x.s.interactive && x.s.id !== view.meId && Math.hypot(x.x - view.me.x, x.y - view.me.y) < 14)
          .sort((p1, p2) => Math.hypot(p1.x - view.me.x, p1.y - view.me.y) - Math.hypot(p2.x - view.me.x, p2.y - view.me.y));
        if (!near.length) { toast('No hay nada cerca con lo que interactuar.'); break; }
        const idx = near.indexOf(view.hovered as CEnt);
        const next = near[(idx + (e.shiftKey ? near.length - 1 : 1)) % near.length];
        view.hovered = next;
        const sp = view.world.toGlobal(worldToScreen(next.x, next.y));
        view.onHover(next, sp.x, sp.y);
      } break;
    }
  };
  window.addEventListener('keydown', keys);
  onSettings(() => renderSheet());
  function charScreen(tab: 'inv' | 'cyber' | 'skills' | 'sheet' | 'net') { if (!st.sheet) return; closePanels(); tooltip.style.display = 'none'; openCharScreen({ net, toast }, st.sheet, tab); }
  function toggleRun() { if (st.sheet) { net.send({ t: 'run', on: !st.sheet.running } as any); toast(st.sheet.running ? 'Andas.' : 'Corres: más rápido, pero gastas aguante.', 'info'); } }
  function toggleAuto() { if (!st.sheet) return; if (st.sheet.auto.on) net.send({ t: 'auto', on: false } as any); else autoPanel(st.sheet.auto.personality, (personality) => net.send({ t: 'auto', on: true, personality } as any)); }
  function toggleDrive() { if (!st.sheet) return; if (st.sheet.driving) net.send({ t: 'car', action: 'park' } as any); else if (!st.sheet.cars.length) toast('No tienes coche: cómpralo en un concesionario (mira el mapa).', 'warn'); else net.send({ t: 'car', action: 'drive' } as any); }
  function mapPanel(local = false) {
    openAtlas({ current:st.zone, local, atlas, position:()=>view.me, level:st.sheet?.skillProg.find(s=>s.id==='interfaz')?.level ?? 1,
      hasCar:!!st.sheet?.cars.length, goal:minimap.goal,
      travel:zone=>net.send({t:'car',action:'travel',zone} as any),
      goto:(x,y)=>net.send({t:'goto',kind:'place',zone:st.zone,x,y} as any),
      hack:()=>{const seq=net.send({t:'mapHack'} as any); st.pending.set(seq,a=>toast(a.ok?'Plano municipal descifrado.':a.reason??'No se pudo descifrar.',a.ok?'good':'warn'));} });
  }
  let liveOn = false, livePending = false;
  function marketLive(on: boolean) { if (on && liveOn && document.getElementById('market-live-panel')) { closePanels(); marketLive(false); return; } liveOn = on; livePending = on; net.send({ t: 'marketLive', on } as any); }
  const pctx: PropCtx = { net, toast, money: () => st.sheet?.money ?? 0 };
  timers.push(window.setInterval(() => { if (st.sheet?.abilities.length) renderAbilities(st.sheet, false); }, 1000));

  // ---------------------------------------------------------------- red
  net.onPositions = (p) => view.positions(p.ents);
  const life: LifeCtx = { net, toast, sheet: () => st.sheet, stopForPreview: () => { held.clear(); pushSteer(true); } };
  net.onStatus = (s, detail) => {
    if (s === 'online') document.getElementById('reconnect-panel')?.remove();
    if (s === 'offline') {
      if (detail === 'auth' || detail === 'no_character') return onExit(detail);
      toast(detail ?? 'Desconectado', 'bad');
      $ui().append(h('div', { class: 'overlay' }, h('div', { class: 'reward' }, h('h2', {}, 'Sesión cerrada'), h('p', {}, detail ?? ''), h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Volver a conectar'))));
    }
    if (s === 'reconnecting') {
      toast(detail ?? 'Reconectando…', 'warn');
      if (!document.getElementById('reconnect-panel')) $ui().append(h('div', { class: 'reconnect-panel', id: 'reconnect-panel', role: 'status' }, h('b', {}, 'Conexión interrumpida'), h('p', {}, 'Intentando recuperar tu personaje. El servidor debe seguir encendido.'), h('button', { class: 'btn small', onclick: () => onExit() }, 'Volver a mis personajes')));
    }
  };
  net.onMsg = (m) => {
    switch (m.t) {
      case 'atlas': atlas.apply(m.map,m.reset); minimap.refresh(); document.dispatchEvent(new Event('vertice-atlas')); break;
      case 'welcome':
        if (view.camMode !== 'cenital') net.send({ t: 'camera', mode: view.camMode } as any); // (la conexión es nueva)
        atlas.apply({cells:[],places:[],unlocked:false},true);
        localDance = null;
        view.meId = m.you; st.sheet = m.sheet; st.journal = m.journal; st.facts = m.facts; st.cityHourMs = m.cityHourMs; st.cityEpoch = m.cityEpoch;
        st.zone = m.zone; st.sector = m.sector; st.danger = m.danger;
        view.setZone(m.zone, m.x, m.y); minimap.setZone(zoneDef(m.zone)!); view.setFacts(m.facts);
        document.body.classList.toggle('cyber-zone', !!zoneDef(m.zone)?.cyber);
        renderSheet(); renderLocation(); setAction(''); refreshScore();
        break;
      case 'possess':
        // Proyección de Eco: pasas a controlar al fantasma (o vuelves a tu cuerpo).
        view.meId = m.you; view.ghostMode = m.ghost; st.zone = m.zone;
        view.setZone(m.zone, m.x, m.y); minimap.setZone(zoneDef(m.zone)!); view.setFacts(st.facts);
        document.body.classList.toggle('ghost-mode', m.ghost);
        document.body.classList.toggle('cyber-zone', !!zoneDef(m.zone)?.cyber);
        if (st.sheet) view.setCompanions(st.sheet.matrices.equipped);
        renderLocation(); setAction('');
        break;
      case 'legend': if (m.open || document.getElementById('legend-panel')) legendPanel(net, m.view); break;
      case 'cheatInfo': cheatPanel(net, m); break;
      case 'zone':
        closeFittingRoom();
        casino?.root.remove();
        prisonContext=undefined;
        document.getElementById('penal-panel')?.remove();
        document.getElementById('bank-panel')?.remove();
        localDance = null;
        closeDanceMenus();
        document.getElementById('shop-panel')?.remove();
        document.getElementById('underworld-panel')?.remove();
        st.zone = m.zone; st.sector = m.sector; st.danger = m.danger; st.dialog = null; renderDialog();
        document.body.classList.toggle('cyber-zone', !!zoneDef(m.zone)?.cyber);
        view.setZone(m.zone, m.x, m.y, m.crossing, m.facing); minimap.setZone(zoneDef(m.zone)!); view.setFacts(st.facts);
        st.destination = ''; renderLocation(); setAction(''); refreshScore(); blip('step');
        // v0.35 · Cruzar una puerta es instantáneo: sin cartel de «Entras en…» (el nombre sale en la barra de lugar). Solo se avisa si el sitio es peligroso.
        if (m.danger === 'disputed' || m.danger === 'lawless') toast(`${zoneDef(m.zone)?.name} · zona ${DANGER_TXT[m.danger]}`, 'warn');
        break;
      case 'spawn':
        for (const e of m.e) {
          view.upsert(e);
          if (e.id === view.meId && e.emote && isDance(e.emote.move)) localDance = e.emote.move as any;
        }
        break;
      case 'despawn': for (const id of m.ids) view.remove(id); break;
      case 'label':
        if (m.id === view.meId && m.emote !== undefined) localDance = m.emote && isDance(m.emote.move) ? m.emote.move as any : null;
        view.setLabel(m.id, m.label, m.bounty, m.state, m.chrome, m.hpPct, m.carried, { appearance: m.appearance, vehicle: m.vehicle, level: m.level, buffs: m.buffs, lost: m.lost, bleeding: m.bleeding, weapon: m.weapon, dead: m.dead, emote: m.emote, carry: m.carry }); break;
      case 'factions': factionsPanel(life, m.view); break;
      case 'underworld': underworldPanel(net, m.view); break;
      case 'ambar': ambarPanel(life, m.view); break;
      case 'lootView': {
        // v0.13 · Panel de saqueo del cuerpo.
        const tgt = m.target;
        lootPanel(m, (x) => { const seq = net.send({ t: 'loot', target: tgt, kind: x.kind, id: x.id } as any); st.pending.set(seq, (a) => { if (!a.ok) toast(a.reason ?? 'No puedes', 'warn'); else blip('ui'); }); });
        lootTarget = tgt;
        break;
      }
      case 'blood': view.setBlood(m.spots, !!m.reset); break;
      case 'motion': {const e=view.ents.get(m.id);if(e)e.cue={id:m.cue,at:performance.now()};break;}
      case 'speech': { view.say(m.id, m.text); const e = view.ents.get(m.id); if (e) chatLog.append(h('div', {}, h('span', { class: 'who' }, e.s.name), `: ${m.text}`)); chatLog.scrollTop = chatLog.scrollHeight; break; }
      case 'stealth': sbar.render(m.view); view.setObservers(m.view.observers, m.view.suspicion); break;
      case 'noise': view.noiseRing(m.x, m.y, m.r); break;
      case 'fx': {
        if (m.kind === 'alarm') { view.alarm(); sfx.alarm(); break; }
        // v0.9 · Sonido espacial de cada acción de combate.
        const at = (id: number) => { const e = view.ents.get(id); if (!e) return { d: 0, p: 0, e }; return { d: Math.hypot(e.x - view.me.x, e.y - view.me.y), p: ((e.x - view.me.x) - (e.y - view.me.y)) / 12, e }; };
        const src = at(m.from), dst = at(m.to);
        const high = (id: number) => (id * 2654435761) % 2 === 0;
        const person = dst.e && (dst.e.s.kind === 'npc' || dst.e.s.kind === 'player');
        const wi = m.weapon ? content.items.find((i) => i.id === m.weapon) : undefined;
        const fam = wi?.weapon?.family ?? '';
        if (m.kind === 'shot') { sfx.gunshot(sfx.gunKind(fam, m.weapon ?? ''), src.d, src.p, m.burst ?? 1); if (m.hit !== false && person) { sfx.impact(dst.e!.s.chrome?.length && Math.random() < 0.35 ? 'cromo' : 'bala', dst.d, dst.p); if (Math.random() < 0.55) sfx.voice(m.crit || m.sever ? 'grito' : 'quejido', high(m.to), dst.d, dst.p); } }
        else if (m.kind === 'hit' || m.kind === 'heavy') { sfx.swing(src.d, src.p, m.kind === 'heavy'); if (m.hit !== false && person) { sfx.impact(/Hoja|Cuchillo|Implante/.test(fam) ? 'filo' : 'puño', dst.d, dst.p, m.kind === 'heavy'); if (Math.random() < 0.6) sfx.voice(m.crit || m.sever ? 'grito' : 'quejido', high(m.to), dst.d, dst.p); } }
        else if (m.kind === 'kick') { sfx.whoosh(src.d, src.p); if (m.hit !== false) { sfx.kick(dst.d, dst.p); sfx.voice('quejido', high(m.to), dst.d, dst.p); } }
        else if (m.kind === 'dodge') sfx.whoosh(src.d, src.p);
        else if (m.kind === 'wave') sfx.wave(!!m.ko, src.d, src.p);
        else if (m.kind === 'hack') sfx.hackChirp(src.d, src.p);
        else if (m.kind === 'ko' && person) sfx.voice('grito', high(m.to), dst.d, dst.p);
        view.fx(m.kind, m.from, m.to, { jump:m.jump, dx:m.dx, dy:m.dy, part: m.part, weapon: m.weapon, hit: m.hit, sever: m.sever, crit: m.crit, burst: m.burst, x: m.x, y: m.y, r: m.r, ko: m.ko });
        if (m.from === view.meId || m.to === view.meId) { combatMusicUntil = Date.now() + 11_000; refreshScore(); }
        break;
      }
      case 'penal': {
        const v=m.view, s=v.state;
        prisonBadge.hidden=!(s||prisonZone(st.zone));
        const next=!m.open&&!v.target&&!v.hidden&&prisonContext?.target?{...v,target:prisonContext.target,actions:prisonContext.actions,detail:prisonContext.detail}:v;
        if(m.open||document.getElementById('penal-panel'))prisonPanel(net,next);
        prisonContext=next;
        break;
      }
      case 'bank': bankPanel(net,m); break;
      case 'casino':
        if(m.view.zone!==st.zone)break;
        if(casino?.root.isConnected&&casino.table===m.view.table)casino.receive(m.view,m.seq);
        else if(m.open)casino=casinoPanel(net,m.view);
        break;
      case 'shop': shopPanel(life, m.view); break;
      case 'market': marketPanel(life, m.view); break;
      case 'jobs': jobsPanel(life, m.view); break;
      case 'clinic': clinicPanel(life, m.view); break;
      case 'bounties': bountyPanel(life, m.view); break;
      case 'targetMenu': { const e = view.ents.get(m.view.target); const sp = e ? view.world.toGlobal(worldToScreen(e.x, e.y)) : { x: 400, y: 300 }; targetMenu(life, m.view, sp, (id) => { if (id === 'banco') net.send({ t:'bank', action:'view', target:m.view.target, opId:newOpId() }); else if (id === 'talk' && e?.s.kind === 'npc' && (e.s.npcType === 'essential' || !e.s.npcType)) net.send({ t: 'interact', target: m.view.target, remote: true } as any); else if (id === 'talk') net.send({ t: 'hostile', target: m.view.target, action: 'talk', opId: newOpId(), remote: true } as any); else net.send({ t: 'interact', target: m.view.target, remote: true } as any); }); break; }
      case 'death': {
        closeFittingRoom();
        net.close();audioScene(null);
        const memorial=()=>{casino?.root.remove();sfx.voice('muerte',false,0,0);deathScreen(m.summary,()=>onExit('dead'));};
        if(casino?.root.isConnected&&m.summary.cause.includes('Ruleta rusa')&&!settings.reduceMotion)window.setTimeout(memorial,1850);
        else memorial();
        break;
      }
      case 'ack': {
        if(casino?.ack(m.seq,m.ok,m.reason))break; const cb = st.pending.get(m.seq); st.pending.delete(m.seq); if (cb) cb(m); else if (!m.ok && m.reason) toast(m.reason, 'warn'); else if (m.ok && m.path && m.seq === 0) view.confirmPath(m.path); if (m.info && m.ok && !cb) toast(m.info); break; }
      case 'dialog': st.dialog = m.view; st.luck = 0; st.destination = ''; setAction(''); renderDialog(); break;
      case 'dialogClose': st.dialog = null; renderDialog(); break;
      case 'searchResults': searchPanel({ net }, m.device, m.results); break;
      case 'lookInfo': { scans.set(m.info.id, { info: m.info, at: Date.now() }); if (scans.size > 300) scans.delete(scans.keys().next().value!); const hv = hovered; if (hv && hv.e.s.id === m.info.id) view.onHover(hv.e, hv.sx, hv.sy); break; }
      case 'dossier': setDossier(m.view); renderFile(m.view); break;
      case 'trunk': trunkPanel({ net }, m.view); break;
      case 'gotoTarget': {
        minimap.goal = m.target ? { x: m.target.x, y: m.target.y, zone: m.target.zone } : null; view.goal = minimap.goal;
        goalEl.style.display = m.target ? '' : 'none';
        if (m.target) goalEl.replaceChildren(h('span', {}, '🎯 ', m.target.label), h('button', { class: 'btn small', title: 'Desmarcar destino', 'aria-label': 'Desmarcar destino', onclick: () => net.send({ t: 'goto', kind: 'cancel' } as any) }, '✕'));
        break;
      }
      case 'sheet': st.sheet = m.sheet; view.thermal = m.sheet.uniques.includes('vision-termica') || 'marcar' in (m.sheet.buffs ?? {}); view.combat = { range: m.sheet.weapon?.range ?? 1.5, aim: m.sheet.aim?.range ?? 0, ranged: m.sheet.weapon?.kind === 'ranged' }; renderSheet(); break;
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
      case 'chat': {
        if (st.muted.has(m.fromId)) break;
        const log = m.channel === 'global' ? globalLog : chatLog;
        log.append(h('div', {}, h('span', { class: 'who', title: 'Clic para silenciar', onclick: () => { st.muted.add(m.fromId); toast(`Has silenciado a ${m.from}.`); } }, m.from), `: ${m.text}`));
        while (log.children.length > 80) log.firstChild!.remove();
        log.scrollTop = log.scrollHeight;
        // Chat local: bocadillo encima del personaje que habla.
        if (m.channel !== 'global') view.say(m.fromId, m.text);
        break;
      }
      case 'selfSpeed': view.setSpeed(m.v, m.tuning); break;
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
  timers.push(window.setInterval(() => minimap.draw(view.me, [...view.ents.values()].filter((e) => e.s.id !== view.meId && e.view.visible).map((e) => ({ x: e.x, y: e.y, kind: e.s.kind }))), 250));
  document.addEventListener('visibilitychange', () => setAmbientActive(!document.hidden), { signal: eventScope.signal });

  // Ganchos de depuración para pruebas automatizadas en navegador.
  (window as any).__vt = {
    st, view, net,
    me: () => ({ id: view.meId, x: view.me.x, y: view.me.y, zone: st.zone }),
    entities: () => [...view.ents.values()].map((e) => ({ id: e.s.id, name: e.s.name, kind: e.s.kind, x: e.x, y: e.y })),
    screenOf: (x: number, y: number, z = 0) => view.screenOf(x, y, z),
    camera: (m?: CamMode) => (m ? applyCamera(m, false) : view.camMode),
    drawDist: (d: number) => saveSettings({ drawDist: d }),
  };
}
