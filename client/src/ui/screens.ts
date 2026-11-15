// Pantallas fuera del juego: acceso, menú principal, creación de personaje, ajustes y memorial.
import { ATTRIBUTE_IDS, RULES, carryCapacity, chromeCapacity, humanityBase, maxHp, maxStamina, walkSpeed, type Attributes } from '@vertice/shared';
import { api, setToken } from '../api';
import { content } from '../content';
import { settings, saveSettings } from '../settings';
import { blip, initAudio } from '../audio';
import { $ui, clearUi, fmtMoney, h } from './dom';

export function loginScreen(onDone: () => void) {
  clearUi();
  const err = h('div', { class: 'error', role: 'alert' });
  const user = h('input', { id: 'username', autocomplete: 'username', placeholder: 'usuario', maxLength: 24 });
  const pass = h('input', { id: 'password', type: 'password', autocomplete: 'current-password', placeholder: 'contraseña (mín. 6)' });
  const go = async (mode: 'login' | 'register') => {
    initAudio();
    err.textContent = '';
    try {
      const r = await api<{ token: string }>(`/api/${mode}`, { username: user.value.trim(), password: pass.value });
      setToken(r.token);
      blip('good');
      onDone();
    } catch (e: any) { err.textContent = e.message; blip('bad'); }
  };
  const form = h('form', { class: 'col', onsubmit: (e: Event) => { e.preventDefault(); void go('login'); } },
    h('label', { for: 'username' }, 'Usuario'), user, h('label', { for: 'password' }, 'Contraseña'), pass, err,
    h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'submit', id: 'btn-login' }, 'Entrar'), h('button', { class: 'btn', type: 'button', id: 'btn-register', onclick: () => go('register') }, 'Crear cuenta')));
  $ui().append(h('div', { class: 'screen' }, h('div', { class: 'card narrow' },
    h('h1', { class: 'logo neon' }, 'VÉRTICE'), h('p', { class: 'muted' }, 'Ciudad Vértice · Distrito Ferro. Edición de universo original. Alfa del hito 1.'), form)));
  user.focus();
}

export async function mainMenu(opts: { onEnter: () => void; onCreate: () => void; onLogout: () => void }) {
  clearUi();
  let me: any, cities: any[] = [];
  try { [me, cities] = await Promise.all([api('/api/me'), api<any[]>('/api/cities')]); }
  catch (e: any) { if (e.status === 401) { setToken(null); return opts.onLogout(); } throw e; }
  const ch = me.character;
  const city = h('select', { id: 'city', 'aria-label': 'Ciudad lógica' }, ...cities.map((c) => h('option', { value: c.id }, `${c.name} — ${c.players} conectados (objetivo ${c.capacityTarget})`)));
  const body = h('div', { class: 'col' },
    h('h1', { class: 'logo neon' }, 'VÉRTICE'),
    h('p', { class: 'muted' }, `Cuenta: ${me.account.username}`),
    ch ? h('div', { class: 'choice' }, h('h4', {}, ch.name), h('p', {}, `${content.roles.find((r) => r.id === ch.role)?.name} · nivel ${ch.level} · ${fmtMoney(Number(ch.money))} · ${content.zones.find((z) => z.id === ch.zone_id)?.name ?? ch.zone_id}`))
      : h('p', {}, 'No tienes ningún personaje vivo. Cada personaje tiene una sola vida.'),
    h('label', { for: 'city' }, 'Ciudad lógica'), city,
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', id: 'btn-enter', disabled: !ch, onclick: opts.onEnter }, 'Entrar al mundo'),
      h('button', { class: 'btn', id: 'btn-create', disabled: !!ch, onclick: opts.onCreate, title: ch ? 'Solo una vida activa por cuenta en la alfa' : '' }, 'Crear personaje'),
      h('button', { class: 'btn', onclick: () => settingsPanel() }, 'Ajustes'),
      h('button', { class: 'btn', onclick: () => memorialPanel(me.memorial) }, 'Memorial'),
      h('button', { class: 'btn', onclick: () => { setToken(null); opts.onLogout(); } }, 'Salir')),
  );
  $ui().append(h('div', { class: 'screen' }, h('div', { class: 'card narrow' }, body)));
}

function memorialPanel(list: any[]) {
  const close = () => ov.remove();
  const ov = h('div', { class: 'overlay', onclick: (e: Event) => e.target === ov && close() }, h('div', { class: 'reward' },
    h('h2', {}, 'Memorial'),
    list.length ? h('ul', {}, ...list.map((m) => h('li', {}, `${m.summary.name} — ${m.summary.cause}`))) : h('p', { class: 'muted' }, 'Aún no ha caído nadie. Los personajes fallecidos se recordarán aquí, sin traspasar recursos.'),
    h('button', { class: 'btn', onclick: close }, 'Cerrar')));
  $ui().append(ov);
}

const SKIN = ['#f0c8a8', '#e0b48c', '#c89070', '#b07a5a', '#8a5a3c', '#6a4028'];
const HAIR = ['#1a1a1a', '#5a3a2a', '#d9d9e3', '#b46cff', '#43f3ff', '#ff4fa0', '#ffd23f'];
const JACKET = ['#2f6b4f', '#40506a', '#6b2140', '#7a5b2a', '#3a3a4a', '#5a4b6e', '#2b4a6a', '#8a2a2a'];
const ACCENT = ['#43f3ff', '#ff4fa0', '#ffd23f', '#7dff7a', '#ff8a3d', '#b46cff'];

export function creationScreen(onDone: () => void, onCancel: () => void) {
  clearUi();
  const st = { step: 0, name: '', origin: 'callejero', role: 'solo', appearance: { skin: SKIN[2], hair: HAIR[0], jacket: JACKET[1], accent: ACCENT[0] },
    attributes: { INT: 6, REF: 6, DEX: 5, TECH: 6, COOL: 6, WILL: 5, LUCK: 5, MOVE: 5, BODY: 5, EMP: 6 } as Attributes };
  const STEPS = ['Identidad', 'Origen', 'Rol', 'Atributos', 'Revisión'];
  const card = h('div', { class: 'card' });
  $ui().append(h('div', { class: 'screen' }, card));
  const spent = () => ATTRIBUTE_IDS.reduce((s, k) => s + st.attributes[k], 0);
  const err = h('div', { class: 'error', role: 'alert' });

  const swatchRow = (label: string, key: keyof typeof st.appearance, colors: string[]) => h('div', { class: 'col' }, h('span', {}, label),
    h('div', { class: 'swatches', role: 'group', 'aria-label': label }, ...colors.map((c) => h('button', { class: 'swatch', style: { background: c }, 'aria-label': `${label} ${c}`, 'aria-pressed': String(st.appearance[key] === c), onclick: () => { st.appearance[key] = c; render(); } }))));

  const render = () => {
    const nav = h('div', { class: 'row', style: { marginTop: '16px' } },
      h('button', { class: 'btn', onclick: () => (st.step === 0 ? onCancel() : (st.step--, render())) }, st.step === 0 ? 'Cancelar' : 'Atrás'),
      st.step < 4 ? h('button', { class: 'btn primary', id: 'btn-next', onclick: () => { const e = validate(); if (e) { err.textContent = e; return; } err.textContent = ''; st.step++; render(); } }, 'Siguiente')
        : h('button', { class: 'btn primary', id: 'btn-create-final', onclick: submit }, 'Crear y entrar'));
    let body: HTMLElement;
    if (st.step === 0) {
      const name = h('input', { id: 'char-name', value: st.name, maxLength: 20, placeholder: 'Nombre del personaje', oninput: (e: any) => (st.name = e.target.value) });
      body = h('div', { class: 'col' }, h('label', { for: 'char-name' }, 'Nombre (3–20 caracteres, único entre los vivos)'), name,
        swatchRow('Piel', 'skin', SKIN), swatchRow('Pelo', 'hair', HAIR), swatchRow('Chaqueta', 'jacket', JACKET), swatchRow('Cromo y acentos', 'accent', ACCENT),
        h('p', { class: 'muted' }, 'La ropa y el cromo se superponen como capas sobre el mismo cuerpo.'));
      setTimeout(() => name.focus());
    } else if (st.step === 1) {
      body = h('div', { class: 'grid2' }, ...content.origins.map((o) => h('button', { class: 'choice', 'aria-pressed': String(st.origin === o.id), onclick: () => { st.origin = o.id; render(); } },
        h('h4', {}, o.name), h('p', {}, o.desc), h('p', {}, `Contacto inicial: ${o.contact}`), h('p', {}, `Fondos: ${fmtMoney(o.startMoney)}`))));
      body = h('div', { class: 'col' }, h('p', { class: 'muted' }, 'El origen cambia tus contactos y opciones de diálogo. Es independiente del rol (puedes ser de origen nómada sin ser Nómada).'), body);
    } else if (st.step === 2) {
      body = h('div', { class: 'grid2' }, ...content.roles.map((r) => h('button', { class: 'choice', id: `role-${r.id}`, 'aria-pressed': String(st.role === r.id), onclick: () => { st.role = r.id; render(); }, style: { borderLeft: `4px solid ${r.accent}` } },
        h('h4', {}, `${r.name} · ${r.ability}`), h('p', {}, r.abilityDesc), h('p', {}, `Ingresos: ${r.income}`), h('p', {}, `Primer trabajo: ${r.firstJob}`), h('p', {}, `En grupo: ${r.groupContribution}`),
        r.m1Option ? h('p', { style: { color: 'var(--yellow)' } }, `Disponible ya en Ferro: ${r.m1Option}`) : h('p', {}, 'En el hito 1 resuelve el encargo por la ruta común (pagar o trabajar).'))));
    } else if (st.step === 3) {
      const a = st.attributes;
      const left = RULES.creationPoints - spent();
      body = h('div', { class: 'col' },
        h('p', {}, `Reparte ${RULES.creationPoints} puntos (cada atributo entre ${RULES.attrMin} y ${RULES.attrMax}). Restantes: `, h('b', { class: left === 0 ? 'cy' : 'neon', id: 'points-left' }, String(left))),
        ...content.attributes.map((d) => h('div', { class: 'attr' },
          h('span', {}, h('b', {}, d.id), ' ', h('small', {}, d.name)),
          h('button', { class: 'btn small', 'aria-label': `Bajar ${d.name}`, disabled: a[d.id] <= RULES.attrMin, onclick: () => { a[d.id]--; render(); } }, '−'),
          h('span', { class: 'v' }, String(a[d.id])),
          h('button', { class: 'btn small', 'aria-label': `Subir ${d.name}`, disabled: a[d.id] >= RULES.attrMax || left <= 0, onclick: () => { a[d.id]++; render(); } }, '+'),
          h('small', {}, `${d.represents}. ${d.effect}. Ej.: ${d.example}`))),
        h('p', { class: 'mono' }, `Salud ${maxHp(a)} (25 + 5×BODY + 3×WILL) · Aguante ${maxStamina(a)} · Carga ${carryCapacity(a)} kg · Capacidad de cromo ${chromeCapacity(a)} (18 + 2×TECH + BODY) · Humanidad ${humanityBase(a.EMP)} (10×EMP) · Marcha ${walkSpeed(a).toFixed(2)} m/s`));
    } else {
      const r = content.roles.find((x) => x.id === st.role)!, o = content.origins.find((x) => x.id === st.origin)!;
      body = h('div', { class: 'col' }, h('h3', {}, st.name || '(sin nombre)'), h('p', {}, `${o.name} · ${r.name} (${r.ability})`),
        h('p', { class: 'mono' }, ATTRIBUTE_IDS.map((k) => `${k} ${st.attributes[k]}`).join(' · ')),
        h('p', {}, `Empiezas en el vestíbulo del Bloque 9 (zona protegida) con ${fmtMoney(o.startMoney)}, agente personal, chaqueta, navaja y unos fideos.`),
        h('p', { class: 'muted' }, 'Recuerda: una sola vida. Si tu personaje muere, se pierde su progreso; la cuenta conserva ajustes, amigos y el memorial.'));
    }
    card.replaceChildren(h('h2', {}, 'Crear personaje'), h('div', { class: 'steps' }, ...STEPS.map((s, i) => h('span', { class: i === st.step ? 'on' : '' }, `${i + 1}. ${s}`))), body, err, nav);
  };
  const validate = (): string | null => {
    if (st.step === 0 && !/^[\p{L}0-9 _'.-]{3,20}$/u.test(st.name.trim())) return 'El nombre debe tener entre 3 y 20 caracteres.';
    if (st.step === 3 && spent() !== RULES.creationPoints) return `Te faltan o sobran puntos: llevas ${spent()} de ${RULES.creationPoints}.`;
    return null;
  };
  const submit = async () => {
    try { await api('/api/characters', { name: st.name.trim(), origin: st.origin, role: st.role, attributes: st.attributes, appearance: st.appearance }); blip('good'); onDone(); }
    catch (e: any) { err.textContent = e.message; blip('bad'); }
  };
  render();
}

export function settingsPanel(onChange?: () => void) {
  document.getElementById('settings-panel')?.remove();
  const s = settings;
  const set = (patch: Partial<typeof settings>) => { saveSettings(patch); onChange?.(); };
  const range = (id: keyof typeof settings, label: string) => h('label', { class: 'row' }, h('span', { style: { width: '9em' } }, label),
    h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: String(s[id]), oninput: (e: any) => set({ [id]: Number(e.target.value) } as any) }));
  const panel = h('div', { class: 'panel', id: 'settings-panel', role: 'dialog', 'aria-label': 'Ajustes' },
    h('button', { class: 'btn small close', onclick: () => panel.remove() }, 'Cerrar ✕'),
    h('h2', {}, 'Ajustes'),
    h('div', { class: 'col' },
      h('label', { class: 'row' }, h('span', { style: { width: '9em' } }, 'Calidad'), h('select', { onchange: (e: any) => set({ quality: e.target.value }) }, h('option', { value: 'low', selected: s.quality === 'low' }, 'Baja (sin lluvia ni brillos)'), h('option', { value: 'high', selected: s.quality === 'high' }, 'Alta'))),
      h('label', { class: 'row' }, h('span', { style: { width: '9em' } }, 'Límite de FPS'), h('select', { onchange: (e: any) => set({ fpsCap: Number(e.target.value) as any }) }, ...[30, 60, 0].map((v) => h('option', { value: v, selected: s.fpsCap === v }, v ? String(v) : 'Sin límite')))),
      h('label', { class: 'row' }, h('span', { style: { width: '9em' } }, 'Escala de resolución'), h('select', { onchange: (e: any) => set({ resScale: Number(e.target.value) }) }, ...[0.5, 0.75, 1].map((v) => h('option', { value: v, selected: s.resScale === v }, `${Math.round(v * 100)} %`)))),
      h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: s.reduceFlashes, onchange: (e: any) => set({ reduceFlashes: e.target.checked }) }), 'Reducir destellos'),
      h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: s.reduceMotion, onchange: (e: any) => set({ reduceMotion: e.target.checked }) }), 'Reducir movimiento (cámara fija al personaje, sin lluvia ni balanceo)'),
      h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: s.showNames, onchange: (e: any) => set({ showNames: e.target.checked }) }), 'Mostrar nombres de jugadores'),
      h('label', { class: 'row' }, h('span', { style: { width: '9em' } }, 'Tamaño de texto'), h('select', { onchange: (e: any) => set({ textSize: e.target.value }) }, h('option', { value: 'normal', selected: s.textSize === 'normal' }, 'Normal'), h('option', { value: 'large', selected: s.textSize === 'large' }, 'Grande'), h('option', { value: 'xl', selected: s.textSize === 'xl' }, 'Muy grande'))),
      range('music', 'Música'), range('ambient', 'Ambiente'), range('sfx', 'Efectos'), range('ui', 'Interfaz'),
      h('p', { class: 'muted' }, 'Controles: clic izquierdo para moverte o interactuar · clic derecho o S para cancelar · Tab/Mayús+Tab seleccionar lo cercano · E o Espacio interactuar · R retirada · J diario · C ficha · I inventario · M mapa · Enter chat · rueda o +/− zoom.')));
  $ui().append(panel);
}
