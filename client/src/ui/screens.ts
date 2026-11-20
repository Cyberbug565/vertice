// Pantallas fuera del juego: acceso, menú principal, creación de personaje, ajustes y memorial.
import { ATTRIBUTE_IDS, RULES, carryCapacity, chromeCapacity, humanityBase, maxHp, maxStamina, walkSpeed, type Attributes, type AccountRoster } from '@vertice/shared';
import { api, setToken } from '../api';
import { content, zoneDef } from '../content';
import { settings, saveSettings } from '../settings';
import { blip, initAudio } from '../audio';
import { $ui, clearUi, fmtMoney, h } from './dom';
import { CARTOON_MODELS, HAIR_COLLECTION, FABRICS, FACE_TATTOOS, SHOE_STYLES, TATTOO_ZONES, TOP_DETAILS, MOUTHS, NOSES, CHILDHOODS, CREATION_SKILL_MAX, CREATION_SKILL_POINTS, EVENTS, OBJECTIVES, ACCESSORIES, BODIES, BODY_TATTOOS, BROWS, BUILDS, CHROME_PARTS, EYE_COLORS, FACE_SHAPES, FACIALS, HAIR_STYLES, LABELS, MAKEUPS, PIERCINGS, SCARS, TOPS } from '@vertice/shared';
import { Preview } from './preview';
import { Preview3D } from '../render/chars3d';
import { recordPanel } from './record';

/** v0.17 · ¿Están las miniaturas de la colección de peinados? (si no, no se ofrece la colección). */
let hairSheetOk = false;
if (typeof Image !== 'undefined') { const im = new Image(); im.onload = () => { hairSheetOk = true; }; im.src = '/models/extra/pelos/pelos-miniaturas.png'; }

export function loginScreen(onDone: () => void) {
  clearUi();
  const err = h('div', { class: 'error', role: 'alert' });
  const user = h('input', { id: 'username', autocomplete: 'username', placeholder: 'usuario', maxLength: 24 });
  const pass = h('input', { id: 'password', type: 'password', autocomplete: 'current-password', placeholder: 'contraseña (mín. 6)' });
  const mode = h('p', { class: 'eyebrow', role: 'status' });
  void api<{ mode?: string }>('/api/content-version').then((r) => { mode.textContent = r.mode === 'local' ? 'MODO LOCAL · CUENTAS Y PARTIDAS DE PRUEBA' : 'SERVIDOR DE VÉRTICE'; }).catch(() => { mode.textContent = 'SERVIDOR NO DISPONIBLE'; });
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
    h('h1', { class: 'logo neon' }, 'VÉRTICE'), mode, h('p', { class: 'muted' }, 'Ciudad Vértice · Alfa v0.23. Cada cuenta conserva sus personajes y su memorial.'), form)));
  user.focus();
}

export async function mainMenu(opts: { onEnter: (characterId: string) => void; onCreate: () => void; onLogout: () => void }) {
  clearUi();
  $ui().append(h('div', { class: 'screen' }, h('p', { class: 'muted', role: 'status' }, 'Recuperando tus personajes…')));
  let me: AccountRoster, cities: any[] = [];
  try { [me, cities] = await Promise.all([api<AccountRoster>('/api/me'), api<any[]>('/api/cities')]); }
  catch (e: any) {
    if (e.status === 401) { setToken(null); return opts.onLogout(); }
    clearUi();
    $ui().append(h('div', { class: 'screen' }, h('div', { class: 'card narrow' }, h('h1', {}, 'No se pudo conectar'), h('p', { class: 'error', role: 'alert' }, e.message),
      h('p', { class: 'muted' }, 'Comprueba que el servidor siga encendido y que estés usando su enlace actual.'), h('button', { class: 'btn primary', onclick: () => void mainMenu(opts) }, 'Reintentar'), h('button', { class: 'btn', onclick: () => { setToken(null); opts.onLogout(); } }, 'Volver al acceso'))));
    return;
  }
  clearUi();
  let selected = me.character?.id ?? me.characters[0]?.id;
  const error = h('p', { class: 'error', role: 'alert' });
  const cards = h('div', { class: 'character-roster', role: 'group', 'aria-label': 'Tus personajes' });
  const enter = h('button', { class: 'btn primary', id: 'btn-enter', disabled: !selected, onclick: async () => {
    if (!selected) return; enter.disabled = true; error.textContent = '';
    try { await api('/api/characters/select', { id: selected }); opts.onEnter(selected); }
    catch (e: any) { error.textContent = e.message; enter.disabled = false; }
  } }, 'Continuar personaje');
  const renderRoster = () => {
    cards.replaceChildren(...me.characters.map((ch) => h('div', { class: `roster-card${selected === ch.id ? ' selected' : ''}` },
      h('button', { class: 'roster-pick', 'aria-pressed': String(selected === ch.id), onclick: () => { selected = ch.id; renderRoster(); } },
        h('span', { class: 'eyebrow' }, ch.status === 'downed' ? 'DERRIBADO/A' : 'CON VIDA'), h('strong', {}, ch.name), h('span', {}, `${content.roles.find((r) => r.id === ch.role)?.name} · nivel ${ch.level}`),
        h('small', { class: 'muted' }, `${content.professions.find((r) => r.id === ch.profession)?.name} · ${fmtMoney(ch.money)}`), h('small', { class: 'muted' }, zoneDef(ch.zone_id)?.name ?? ch.zone_id)),
      h('button', { class: 'btn small', onclick: () => recordPanel(ch.id), 'aria-label': `Ver expediente de ${ch.name}` }, 'Ver expediente'))));
    enter.textContent = selected ? `Continuar con ${me.characters.find((ch) => ch.id === selected)?.name}` : 'Continuar personaje';
  };
  renderRoster();
  const city = h('select', { id: 'city', 'aria-label': 'Ciudad lógica' }, ...cities.map((c) => h('option', { value: c.id }, `${c.name} — ${c.players} conectados (objetivo ${c.capacityTarget})`)));
  const body = h('div', { class: 'col' },
    h('h1', { class: 'logo neon' }, 'VÉRTICE'),
    h('p', { class: 'muted' }, `Cuenta: ${me.account.username}`),
    h('h2', {}, 'Tus personajes'),
    me.characters.length ? h('p', { class: 'muted' }, 'Continúa una vida existente o crea un personaje nuevo. Cada uno conserva su propio progreso.') : h('p', {}, 'Crea tu primer personaje para entrar en la ciudad.'), cards, error,
    h('label', { for: 'city' }, 'Ciudad lógica'), city,
    h('div', { class: 'row' },
      enter,
      h('button', { class: 'btn', id: 'btn-create', onclick: opts.onCreate }, 'Crear personaje nuevo'),
      h('button', { class: 'btn', onclick: () => settingsPanel() }, 'Ajustes'),
      h('button', { class: 'btn', id: 'btn-memorial', onclick: () => memorialPanel(me.memorial) }, `Memorial (${me.memorial.length})`),
      h('button', { class: 'btn', onclick: () => { setToken(null); opts.onLogout(); } }, 'Salir')),
  );
  $ui().append(h('div', { class: 'screen' }, h('div', { class: 'card account-menu' }, body)));
}

function memorialPanel(list: any[]) {
  const close = () => ov.remove();
  const ov = h('div', { class: 'overlay', onclick: (e: Event) => e.target === ov && close() }, h('div', { class: 'reward' },
    h('h2', {}, 'Memorial'),
    list.length ? h('div', { class: 'memorial-list' }, ...list.map((m) => h('div', { class: 'roster-card' }, h('h3', {}, m.summary.name), h('p', {}, `${m.summary.role} · nivel ${m.summary.level}`), h('p', { class: 'muted' }, m.summary.cause), h('button', { class: 'btn', onclick: () => recordPanel(m.character_id, m.summary.record) }, 'Ver vida completa')))) : h('p', { class: 'muted' }, 'Aún no ha caído nadie. Los personajes fallecidos se recordarán aquí, sin traspasar recursos.'),
    h('button', { class: 'btn', onclick: close }, 'Cerrar')));
  $ui().append(ov);
}

// v0.14 · Más tonos de piel (de muy clara a muy oscura) y pieles sintéticas de los modificados (cromo pálido, gris azulado, lila, menta).
const SKIN = ['#f6dcc8', '#f0c8a8', '#e8bc96', '#e0b48c', '#d0a078', '#c89070', '#b88060', '#b07a5a', '#9a6848', '#8a5a3c', '#744a30', '#6a4028', '#5a3420', '#46281a', '#c8ccd8', '#8a9ab0', '#c8a8d8', '#9ad8c8'];
const HAIR = ['#1a1a1a', '#5a3a2a', '#d9d9e3', '#b46cff', '#43f3ff', '#ff4fa0', '#ffd23f'];
const JACKET = ['#2f6b4f', '#40506a', '#6b2140', '#7a5b2a', '#3a3a4a', '#5a4b6e', '#2b4a6a', '#8a2a2a'];
// Color del cromo (luces, implantes y estela del Kairós).
const ACCENT = ['#43f3ff', '#ff4fa0', '#ffd23f', '#7dff7a', '#ff8a3d', '#b46cff', '#ff2040', '#ffffff', '#3a6bff', '#00ffa8', '#ff00ff', '#c0ff00', '#ffb020', '#8a8aff', '#ff6a6a', '#2affff'];
const PANTS = ['#1a1a24', '#2a2a3a', '#3a2a1a', '#24384a', '#4a1a2a', '#5a5a64', '#1a3a2a'];
const TATTOO = ['', '#43f3ff', '#ff4fa0', '#ffd23f', '#7dff7a', '#1a1a1a'];
const INK = ['#14141e', '#1a2a6a', '#6a1010', '#0a4a2a', '#43f3ff', '#ff3fa4'];
const SHIRT = ['#e8e8f0', '#1a1a1a', '#2a2a3a', '#a82020', '#2a6aa8', '#3a8a4a', '#ff3fa4', '#ffd23f'];
const SHOES = ['#101018', '#e8e8f0', '#5a3a1a', '#a82020', '#43f3ff', '#3a3a3a'];
const MAKEUP_COL = ['#ff3fa4', '#43f3ff', '#ffd23f', '#b46cff', '#a82020', '#1a1a1a'];
const pick = <T,>(l: readonly T[]) => l[Math.floor(Math.random() * l.length)];

export function creationScreen(onDone: (id: string) => void, onCancel: () => void) {
  clearUi();
  const st = { step: 0, name: '', origin: 'callejero', role: 'solo', profession: 'vagabundo', previewChrome: false,
    appearance: { skin: SKIN[2], hair: HAIR[0], jacket: JACKET[1], accent: ACCENT[0], eyes: EYE_COLORS[0] as string, pants: PANTS[0], body: 'masculino', build: 'medio', hairStyle: 'corto', top: 'chaqueta', facial: 'ninguno', accessory: 'ninguno', tattoo: '',
      faceShape: 'ovalada', nose: 'recta', mouth: 'neutra', brows: 'normales', makeup: 'ninguno', makeupColor: MAKEUP_COL[0], piercing: 'ninguno', scar: 'ninguna', bodyTattoo: 'ninguno', shirt: SHIRT[0], shoes: SHOES[0],
      tattooZone: 'brazos', tattooInk: INK[0], faceTattoo: 'ninguno', topPattern: 'liso', pantsPattern: 'liso', shoeStyle: 'botas', topDetail: 'ninguno', model: '' },
    attributes: { INT: 6, REF: 6, DEX: 5, TECH: 6, COOL: 6, WILL: 5, LUCK: 5, MOVE: 5, BODY: 5, EMP: 6 } as Attributes,
    bio: { objective: 'rico', childhood: 'calle', event: 'traicion' }, skillPoints: {} as Record<string, number> };
  const STEPS = ['Identidad', 'Aspecto', 'Origen', 'Historia', 'Rol', 'Oficio', 'Atributos', 'Habilidades', 'Revisión'];
  const S = (n: string) => STEPS.indexOf(n);
  const skillBudget = () => CREATION_SKILL_POINTS + (st.bio.objective === 'maestria' ? 2 : 0) + (st.bio.event === 'deuda' ? 2 : 0);
  const skillSpent = () => Object.values(st.skillPoints).reduce((a, b) => a + b, 0);
  const bioBonus = (k: string) => [OBJECTIVES, CHILDHOODS, EVENTS].reduce((acc, list) => acc + (((list as readonly any[]).find((o) => o.id === (list === OBJECTIVES ? st.bio.objective : list === CHILDHOODS ? st.bio.childhood : st.bio.event))?.skills ?? {})[k] ?? 0), 0);
  const bioMoney = () => [OBJECTIVES.find((o) => o.id === st.bio.objective), CHILDHOODS.find((o) => o.id === st.bio.childhood), EVENTS.find((o) => o.id === st.bio.event)].reduce((a, o) => a + ((o as any)?.money ?? 0), 0);
  const LAST = STEPS.length - 1;
  // v0.13 · Vista previa 3D (el mismo modelo que en la calle, girando); si el navegador no puede, la 2D de siempre.
  let preview: { el: HTMLElement; show: (ap: any, chrome: string[]) => Promise<void> | void; destroy: () => void };
  try { preview = settings.chars3d ? new Preview3D(240, 300) : new Preview(); } catch { preview = new Preview(); }
  const leave = (fn: () => void) => () => { preview.destroy(); fn(); };
  onCancel = leave(onCancel);
  const card = h('div', { class: 'card' });
  $ui().append(h('div', { class: 'screen' }, card));
  const spent = () => ATTRIBUTE_IDS.reduce((s, k) => s + st.attributes[k], 0);
  const err = h('div', { class: 'error', role: 'alert' });

  const swatchRow = (label: string, key: keyof typeof st.appearance, colors: string[]) => h('div', { class: 'col' }, h('span', {}, label),
    h('div', { class: 'swatches', role: 'group', 'aria-label': label }, ...colors.map((c) => h('button', { class: `swatch${c ? '' : ' none'}`, style: { background: c || 'transparent' }, title: c ? c : 'Sin tatuaje', 'aria-label': `${label} ${c || 'ninguno'}`, 'aria-pressed': String(st.appearance[key] === c), onclick: () => { (st.appearance as any)[key] = c; render(); } }))));
  const optRow = (label: string, key: keyof typeof st.appearance, opts: readonly string[]) => h('div', { class: 'col' }, h('span', {}, label),
    h('div', { class: 'seg wrap', role: 'group', 'aria-label': label }, ...opts.map((o) => h('button', { class: 'segbtn', 'aria-pressed': String(st.appearance[key] === o), onclick: () => { (st.appearance as any)[key] = o; render(); } }, LABELS[o] ?? o))));
  // v0.17 · Peinados de la colección (modelos 3D de la release): una cuadrícula de miniaturas. Si los recursos no
  // están descargados en el servidor, la fila no aparece.
  const hairCollectionRow = () => {
    if (!hairSheetOk) return null;
    const S = 44;
    return h('div', { class: 'col' }, h('span', {}, 'Peinados de la colección'),
      h('div', { class: 'hair-grid', role: 'group', 'aria-label': 'Peinados de la colección', style: { display: 'flex', flexWrap: 'wrap', gap: '4px', maxHeight: '200px', overflowY: 'auto' } },
        ...HAIR_COLLECTION.map((id, i) => {
          const real = id.startsWith('pelo-real');
          return h('button', { class: 'segbtn hair-thumb', title: real ? 'Pelo realista' : `Peinado nº ${i + 1}`, 'aria-label': real ? 'Pelo realista' : `Peinado de la colección ${i + 1}`, 'aria-pressed': String(st.appearance.hairStyle === id),
            style: real ? { width: `${S}px`, height: `${S}px`, padding: '0', fontSize: '10px' } : { width: `${S}px`, height: `${S}px`, padding: '0', backgroundImage: 'url(/models/extra/pelos/pelos-miniaturas.png)', backgroundSize: `${15 * S}px ${7 * S}px`, backgroundPosition: `-${(i % 15) * S}px -${Math.floor(i / 15) * S}px` },
            onclick: () => { st.appearance.hairStyle = id; render(); } }, real ? 'Real' : '');
        })));
  };
  const randomize = () => {
    Object.assign(st.appearance, { skin: pick(SKIN), hair: pick(HAIR), jacket: pick(JACKET), accent: pick(ACCENT), eyes: pick(EYE_COLORS), pants: pick(PANTS),
      body: pick(BODIES), build: pick(BUILDS), hairStyle: pick(HAIR_STYLES), top: pick(TOPS.filter((t) => t !== 'exo-tormenta')), facial: pick(FACIALS), accessory: pick(ACCESSORIES), tattoo: pick(TATTOO),
      faceShape: pick(FACE_SHAPES), nose: pick(NOSES), mouth: pick(MOUTHS), brows: pick(BROWS), makeup: pick(MAKEUPS), makeupColor: pick(MAKEUP_COL), piercing: pick(PIERCINGS), scar: pick(SCARS), bodyTattoo: pick(BODY_TATTOOS), shirt: pick(SHIRT), shoes: pick(SHOES),
      tattooZone: pick(TATTOO_ZONES), tattooInk: pick(INK), faceTattoo: pick(FACE_TATTOOS), topPattern: pick(FABRICS), pantsPattern: pick(FABRICS), shoeStyle: pick(SHOE_STYLES), topDetail: pick(TOP_DETAILS) });
    render();
  };

  const render = () => {
    const nav = h('div', { class: 'row', style: { marginTop: '16px' } },
      h('button', { class: 'btn', onclick: () => (st.step === 0 ? onCancel() : (st.step--, render())) }, st.step === 0 ? 'Cancelar' : 'Atrás'),
      st.step < LAST ? h('button', { class: 'btn primary', id: 'btn-next', onclick: () => { const e = validate(); if (e) { err.textContent = e; return; } err.textContent = ''; st.step++; render(); } }, 'Siguiente')
        : h('button', { class: 'btn primary', id: 'btn-create-final', onclick: submit }, 'Crear y entrar'));
    let body: HTMLElement;
    if (st.step === 0) {
      const name = h('input', { id: 'char-name', value: st.name, maxLength: 20, placeholder: 'Nombre del personaje', oninput: (e: any) => (st.name = e.target.value) });
      body = h('div', { class: 'col' }, h('label', { for: 'char-name' }, 'Nombre (3–20 caracteres, único entre los vivos)'), name,
        h('p', { class: 'muted' }, 'En el siguiente paso eliges su aspecto: complexión, peinado, ojos, ropa, accesorios y tatuajes.'));
      setTimeout(() => name.focus());
    } else if (st.step === 1) {
      void preview.show(st.appearance, st.previewChrome ? [...CHROME_PARTS] : []);
      const controls = h('div', { class: 'col appearance-controls' },
        // v0.21 · Modelo: el cuerpo personalizable del kit o un personaje cartoon de pocos polígonos (ropa propia).
        h('h4', { class: 'creator-sec' }, 'Modelo'),
        h('div', { class: 'col' }, h('span', {}, 'Personaje'),
          h('div', { class: 'seg wrap', role: 'group', 'aria-label': 'Modelo de personaje' },
            h('button', { class: 'segbtn', 'aria-pressed': String(!st.appearance.model), onclick: () => { st.appearance.model = ''; render(); } }, 'Personalizable'),
            ...CARTOON_MODELS.map((m) => h('button', { class: 'segbtn', title: m.pack === 'med' ? 'Pack medieval (se descarga con los recursos extra)' : 'Estilo cartoon', 'aria-pressed': String(st.appearance.model === m.id),
              onclick: () => { st.appearance.model = m.id; st.appearance.body = m.gender === 'f' ? 'femenino' : 'masculino'; render(); } }, `${m.name}${m.gender === 'f' && !/a$|Enfermera|Magnate/.test(m.name) ? ' (f)' : ''}`)))),
        st.appearance.model ? h('p', { class: 'muted small' }, 'Los personajes cartoon llevan su propia ropa y pelo: lo de abajo solo cuenta para el cuerpo personalizable.') : null,
        h('h4', { class: 'creator-sec' }, 'Cuerpo y cara'),
        optRow('Cuerpo base', 'body', BODIES), optRow('Complexión', 'build', BUILDS), swatchRow('Piel', 'skin', SKIN), optRow('Forma de la cara', 'faceShape', FACE_SHAPES), optRow('Nariz', 'nose', NOSES), optRow('Boca', 'mouth', MOUTHS), swatchRow('Ojos', 'eyes', [...EYE_COLORS]), optRow('Cejas', 'brows', BROWS),
        h('h4', { class: 'creator-sec' }, 'Pelo'),
        optRow('Peinado', 'hairStyle', HAIR_STYLES), hairCollectionRow(), swatchRow('Color de pelo', 'hair', HAIR), optRow('Vello facial', 'facial', FACIALS),
        h('h4', { class: 'creator-sec' }, 'Detalles'),
        optRow('Maquillaje', 'makeup', MAKEUPS), swatchRow('Color del maquillaje', 'makeupColor', MAKEUP_COL), optRow('Piercing', 'piercing', PIERCINGS), optRow('Cicatriz', 'scar', SCARS),
        h('h4', { class: 'creator-sec' }, 'Tatuajes'),
        optRow('Diseño', 'bodyTattoo', BODY_TATTOOS), optRow('Dónde', 'tattooZone', TATTOO_ZONES), swatchRow('Tinta', 'tattooInk', INK),
        optRow('Tatuaje facial', 'faceTattoo', FACE_TATTOOS), swatchRow('Color del tatuaje facial', 'tattoo', TATTOO),
        h('h4', { class: 'creator-sec' }, 'Ropa de partida'),
        optRow('Prenda', 'top', TOPS.filter((t) => t !== 'exo-tormenta')), optRow('Tejido de la prenda', 'topPattern', FABRICS), optRow('Detalle', 'topDetail', TOP_DETAILS), swatchRow('Color de la prenda', 'jacket', JACKET), swatchRow('Camiseta', 'shirt', SHIRT),
        swatchRow('Pantalón', 'pants', PANTS), optRow('Tejido del pantalón', 'pantsPattern', FABRICS), optRow('Calzado', 'shoeStyle', SHOE_STYLES), swatchRow('Color del calzado', 'shoes', SHOES),
        optRow('Accesorio', 'accessory', ACCESSORIES), swatchRow('Acento (luces y cromo)', 'accent', ACCENT),
        h('p', { class: 'muted small' }, 'En el juego podrás cambiarte de ropa: chaquetas, camisetas, pantalones, calzado, gorros y gafas, algunas con mejoras.'));
      body = h('div', { class: 'creator' },
        h('div', { class: 'col preview-col' }, preview.el,
          h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: randomize }, '🎲 Aleatorio'),
            h('button', { class: 'btn small', 'aria-pressed': String(st.previewChrome), onclick: () => { st.previewChrome = !st.previewChrome; render(); } }, st.previewChrome ? 'Quitar cromo' : 'Probar cromo')),
          h('p', { class: 'muted small' }, 'El cromo se ve por partes: cabeza, ojos, torso, brazos y piernas. Empiezas sin implantes; los verás aparecer al operarte.')),
        controls);
    } else if (st.step === S('Origen')) {
      body = h('div', { class: 'grid2' }, ...content.origins.map((o) => h('button', { class: 'choice', 'aria-pressed': String(st.origin === o.id), onclick: () => { st.origin = o.id; render(); } },
        h('h4', {}, o.name), h('p', {}, o.desc), h('p', {}, `Contacto inicial: ${o.contact}`), h('p', {}, `Fondos: ${fmtMoney(o.startMoney)}`))));
      body = h('div', { class: 'col' }, h('p', { class: 'muted' }, 'El origen cambia tus contactos y opciones de diálogo. Es independiente del rol (puedes ser de origen nómada sin ser Nómada).'), body);
    } else if (st.step === S('Historia')) {
      const group = (title: string, key: 'objective' | 'childhood' | 'event', list: readonly any[], hint: string) => h('div', { class: 'col' }, h('h4', { class: 'creator-sec' }, title), h('p', { class: 'muted small' }, hint),
        h('div', { class: 'grid2' }, ...list.map((o) => h('button', { class: 'choice', id: `bio-${key}-${o.id}`, 'aria-pressed': String(st.bio[key] === o.id), onclick: () => { st.bio[key] = o.id; render(); } },
          h('h4', {}, o.name), h('p', {}, o.desc),
          h('p', { style: { color: 'var(--yellow)' } }, o.bonus ?? ([...Object.entries(o.skills ?? {}).map(([k, v]) => `+${v} ${content.skills.find((x) => x.id === k)?.name ?? k}`), o.money ? `${o.money > 0 ? '+' : ''}${o.money} €$` : '', o.points ? `+${o.points} puntos de habilidad` : ''].filter(Boolean).join(' · ') || '—'))))));
      body = h('div', { class: 'col' },
        h('p', { class: 'muted' }, 'Tu historia: qué te mueve, de dónde vienes y qué te marcó. Da habilidades y dinero de partida, y un objetivo vital que, al cumplirlo, te premia con +2 puntos de perk.'),
        group('Objetivo vital', 'objective', OBJECTIVES, 'La meta de tu vida en Vértice (se sigue en tu ficha).'),
        group('Infancia', 'childhood', CHILDHOODS, 'Dónde y cómo creciste.'),
        group('Giro vital', 'event', EVENTS, 'Lo que te cambió.'));
    } else if (st.step === S('Habilidades')) {
      const left = skillBudget() - skillSpent();
      body = h('div', { class: 'col' },
        h('p', {}, `Reparte ${skillBudget()} puntos de habilidad (máximo ${CREATION_SKILL_MAX} por habilidad). Se suman a lo que te dan el rol y tu historia. Restantes: `, h('b', { class: left === 0 ? 'cy' : 'neon', id: 'skill-points-left' }, String(left))),
        h('div', { class: 'grid2' }, ...content.skills.map((sk) => {
          const v = st.skillPoints[sk.id] ?? 0, bonus = bioBonus(sk.id);
          return h('div', { class: 'attr' },
            h('span', {}, h('b', {}, sk.name), bonus ? h('small', { class: 'good' }, ` +${bonus} historia`) : ''),
            h('button', { class: 'btn small', 'aria-label': `Bajar ${sk.name}`, disabled: v <= 0, onclick: () => { st.skillPoints[sk.id] = v - 1; render(); } }, '−'),
            h('span', { class: 'v' }, String(v)),
            h('button', { class: 'btn small', 'aria-label': `Subir ${sk.name}`, disabled: v >= CREATION_SKILL_MAX || left <= 0, onclick: () => { st.skillPoints[sk.id] = v + 1; render(); } }, '+'));
        })),
        h('p', { class: 'muted small' }, 'Las habilidades suben hasta 25 usándolas. No hace falta gastar todos los puntos, pero los que no gastes se pierden.'));
    } else if (st.step === S('Rol')) {
      body = h('div', { class: 'grid2' }, ...content.roles.map((r) => h('button', { class: 'choice', id: `role-${r.id}`, 'aria-pressed': String(st.role === r.id), onclick: () => { st.role = r.id; render(); }, style: { borderLeft: `4px solid ${r.accent}` } },
        h('h4', {}, `${r.name} · ${r.ability}`), h('p', {}, r.abilityDesc), h('p', {}, `Ingresos: ${r.income}`), h('p', {}, `Primer trabajo: ${r.firstJob}`), h('p', {}, `En grupo: ${r.groupContribution}`),
        r.m1Option ? h('p', { style: { color: 'var(--yellow)' } }, `Disponible ya en Ferro: ${r.m1Option}`) : h('p', {}, 'En el hito 1 resuelve el encargo por la ruta común (pagar o trabajar).'))));
    } else if (st.step === S('Oficio')) {
      const kinds: Record<string, string> = { empleo: 'Empleo', libre: 'Libre', ilegal: 'Ilegal' };
      body = h('div', { class: 'col' }, h('p', { class: 'muted' }, 'Tu oficio decide qué empleos puedes coger (5 por oficio, 100 en total) y te da una ventaja. El rol es tu especialidad de combate y técnica; el oficio, cómo te ganas la vida. Podrás cambiarlo en la bolsa de empleo.'),
        h('div', { class: 'grid2' }, ...content.professions.map((pr) => h('button', { class: 'choice', id: `prof-${pr.id}`, 'aria-pressed': String(st.profession === pr.id), onclick: () => { st.profession = pr.id; render(); } },
          h('h4', {}, `${pr.name} · ${kinds[pr.kind]}`), h('p', {}, pr.desc), h('p', { style: { color: 'var(--yellow)' } }, `Ventaja: ${pr.perk}`)))));
    } else if (st.step === S('Atributos')) {
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
      const r = content.roles.find((x) => x.id === st.role)!, o = content.origins.find((x) => x.id === st.origin)!, pf = content.professions.find((x) => x.id === st.profession)!;
      body = h('div', { class: 'col' }, h('h3', {}, st.name || '(sin nombre)'), h('p', {}, `${o.name} · ${r.name} (${r.ability}) · oficio ${pf.name}`),
        h('p', { class: 'mono' }, ATTRIBUTE_IDS.map((k) => `${k} ${st.attributes[k]}`).join(' · ')),
        h('p', {}, `Objetivo: ${OBJECTIVES.find((x) => x.id === st.bio.objective)?.name} · ${CHILDHOODS.find((x) => x.id === st.bio.childhood)?.name} · ${EVENTS.find((x) => x.id === st.bio.event)?.name}`),
        h('p', { class: 'mono small' }, Object.entries(st.skillPoints).filter(([, v]) => v > 0).map(([k, v]) => `${content.skills.find((x) => x.id === k)?.name ?? k} +${v}`).join(' · ') || 'Sin puntos de habilidad repartidos.'),
        h('p', {}, `Empiezas en el vestíbulo del Bloque 9 (zona segura, verde) con ${fmtMoney(Math.max(20, o.startMoney + bioMoney()))}, agente personal, chaqueta, navaja, dos raciones de fideos y dos de agua. Tendrás que comer, beber y dormir.`),
        h('p', { class: 'muted' }, 'Recuerda: una sola vida. Si tu personaje muere, se pierde su progreso; la cuenta conserva ajustes, amigos y el memorial.'));
    }
    card.replaceChildren(h('h2', {}, 'Crear personaje'), h('div', { class: 'steps' }, ...STEPS.map((s, i) => h('span', { class: i === st.step ? 'on' : '' }, `${i + 1}. ${s}`))), body, err, nav);
  };
  const validate = (): string | null => {
    if (st.step === 0 && !/^[\p{L}0-9 _'.-]{3,20}$/u.test(st.name.trim())) return 'El nombre debe tener entre 3 y 20 caracteres.';
    if (st.step === S('Habilidades') && skillSpent() > skillBudget()) return 'Has gastado demasiados puntos de habilidad.';
    if (st.step === S('Atributos') && spent() !== RULES.creationPoints) return `Te faltan o sobran puntos: llevas ${spent()} de ${RULES.creationPoints}.`;
    return null;
  };
  const submit = async () => {
    try { const r = await api<{ id: string }>('/api/characters', { name: st.name.trim(), origin: st.origin, role: st.role, profession: st.profession, attributes: st.attributes, appearance: st.appearance, bio: st.bio, skillPoints: Object.fromEntries(Object.entries(st.skillPoints).filter(([, v]) => v > 0)) }); blip('good'); preview.destroy(); onDone(r.id); }
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
      h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: s.chars3d, onchange: (e: any) => set({ chars3d: e.target.checked }) }), 'Personajes en 3D (desactívalo en equipos lentos; se aplica al recargar)'),
      h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: s.nudity, onchange: (e: any) => set({ nudity: e.target.checked }) }), 'Desnudos (contenido adulto). Si lo quitas, quien no lleve ropa interior aparece con la de serie'),
      h('label', { class: 'row' }, h('span', { style: { width: '9em' } }, 'Tamaño de texto'), h('select', { onchange: (e: any) => set({ textSize: e.target.value }) }, h('option', { value: 'normal', selected: s.textSize === 'normal' }, 'Normal'), h('option', { value: 'large', selected: s.textSize === 'large' }, 'Grande'), h('option', { value: 'xl', selected: s.textSize === 'xl' }, 'Muy grande'))),
      range('music', 'Música'), range('ambient', 'Ambiente'), range('sfx', 'Efectos'), range('ui', 'Interfaz'),
      h('p', { class: 'muted' }, 'Controles: clic izquierdo para moverte o interactuar · clic derecho → Bailar (o Y) · S para cancelar · Tab/Mayús+Tab seleccionar lo cercano · E o Espacio interactuar · R retirada · Z dormir · O empleos · K mercado · B recompensas · J diario · C ficha · I inventario · M mapa · Enter chat · rueda o +/− zoom.')));
  $ui().append(panel);
}
