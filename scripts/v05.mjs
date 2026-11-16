// v0.5 · Callejones y zonas oscuras, iluminación, pasarelas elevadas, torres corporativas por plantas, bases de bandas
// y narcos, farmacias, comisarías, obras con puestos de trabajo y fusión de todo en la ciudad única «vertice».
import { CW, CH, M, GRID, OFFSET, WASTE, WORLD_W, WORLD_H, districtRect, wasteRect } from './merge.mjs';

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const inRect = (x, y, [rx, ry, rw, rh]) => x >= rx && y >= ry && x < rx + rw && y < ry + rh;

/** Casillas ocupadas de un distrito (para no poner nada encima de otra cosa). */
function occupancy(z) {
  const busy = new Set([...z.doors.map((d) => `${d.at[0]},${d.at[1]}`), ...z.objects.map((o) => `${o.at[0]},${o.at[1]}`), ...z.props.map((p) => `${p.at[0]},${p.at[1]}`)]);
  const doorNear = (x, y) => z.doors.some((d) => Math.abs(d.at[0] - x) <= 1 && Math.abs(d.at[1] - y) <= 1);
  const free = (x, y) => x > 0 && y > 0 && x < z.width - 1 && y < z.height - 1 && !busy.has(`${x},${y}`)
    && !z.buildings.some((b) => inRect(x, y, b.rect)) && !z.blocks.some((b) => inRect(x, y, b.rect)) && !z.ground.some((g) => g.type === 'water' && inRect(x, y, g.rect));
  return { busy, free, doorNear };
}
const hasDoor = (z, b) => { const [bx, by, bw, bh] = b.rect; return z.doors.some((d) => d.at[0] >= bx - 1 && d.at[0] <= bx + bw && d.at[1] >= by - 1 && d.at[1] <= by + bh); };
const used = new Set();

/** Callejones: los edificios anchos se parten con un callejón oscuro de 2 losetas (zona disputada, sin farolas). */
export function carveAlleys(z) {
  if (z.id === 'yermo') return;
  const out = [];
  for (const b of z.buildings) {
    const [bx, by, bw, bh] = b.rect;
    if (bw >= 14 && !hasDoor(z, b) && bh >= 6) {
      const ax = bx + Math.floor(bw / 3);
      out.push({ ...b, rect: [bx, by, ax - bx, bh] }, { ...b, id: `${b.id}-b`, rect: [ax + 2, by, bx + bw - ax - 2, bh], sign: undefined, name: undefined });
      z.ground.push({ type: 'alley', rect: [ax, by, 2, bh] });
      z.dangerAreas.push({ rect: [ax, by, 2, bh], level: 'disputed' });
      z.props.push({ type: 'trash', at: [ax, by + 1] }, { type: 'pipe', at: [ax + 1, by + Math.floor(bh / 2)] });
    } else out.push(b);
  }
  z.buildings = out;
}

/** Iluminación: farolas a lo largo de todas las calzadas y tiras de neón en las fachadas. */
export function addLighting(z, seed) {
  const r = rng(seed);
  const { free, busy } = occupancy(z);
  const roads = z.ground.filter((g) => g.type === 'asphalt' && Math.max(g.rect[2], g.rect[3]) >= 16 && Math.min(g.rect[2], g.rect[3]) >= 3);
  for (const g of roads) {
    const [x, y, w, h] = g.rect, horiz = w >= h;
    for (let t = 3; t < (horiz ? w : h) - 2; t += 7) {
      for (const side of [-1, 1]) {
        const px = horiz ? x + t : side < 0 ? x - 1 : x + w, py = horiz ? (side < 0 ? y - 1 : y + h) : y + t;
        if (free(px, py) && !z.ground.some((gg) => gg.type === 'alley' && inRect(px, py, gg.rect))) { z.props.push({ type: 'lamp', at: [px, py] }); busy.add(`${px},${py}`); }
      }
    }
  }
  const neon = ['#ff3fa4', '#43f3ff', '#b46cff', '#ffd23f', '#7dff7a', '#ff8a3d'];
  for (const b of z.buildings) {
    if (r() > 0.45) continue;
    const [bx, by, bw, bh] = b.rect;
    const at = [bx + 1 + Math.floor(r() * Math.max(1, bw - 2)), by + bh];
    if (free(at[0], at[1])) { z.props.push({ type: 'neonstrip', at, blocking: false, color: neon[Math.floor(r() * neon.length)] }); busy.add(`${at[0]},${at[1]}`); }
  }
}

/** Busca un edificio sin puerta (el más grande que cumpla la condición) y le abre una entrada. Devuelve la puerta y la casilla de salida. */
function entrance(z, pick, opts) {
  const { free, doorNear } = occupancy(z);
  const cands = z.buildings.filter((b) => !hasDoor(z, b) && !used.has(b.id) && pick(b)).sort((a, b) => b.rect[2] * b.rect[3] - a.rect[2] * a.rect[3]);
  for (const b of cands) {
    const [bx, by, bw, bh] = b.rect;
    for (const [dx, dy, ox, oy] of [[bx + Math.floor(bw / 2), by + bh, 0, 1], [bx + Math.floor(bw / 2) + 1, by + bh, 0, 1], [bx - 1, by + Math.floor(bh / 2), -1, 0], [bx + bw, by + Math.floor(bh / 2), 1, 0], [bx + Math.floor(bw / 2), by - 1, 0, -1]]) {
      if (!free(dx, dy) || doorNear(dx, dy) || !free(dx + ox, dy + oy)) continue;
      used.add(b.id);
      Object.assign(b, opts.building ?? {});
      z.doors.push({ id: opts.doorId, name: opts.name, at: [dx, dy], to: { zone: opts.zone, at: opts.inAt }, danger: opts.danger ?? 'protected' });
      return { b, door: [dx, dy], out: [dx + ox, dy + oy] };
    }
  }
  return null;
}
const city = (zid, [x, y]) => { const [ox, oy] = OFFSET[zid]; return [x + ox, y + oy]; };

// ---------------------------------------------------------------- torres corporativas (varias plantas por ascensor)
const TOWERS = [
  { id: 'torre-halcon', corp: 'halcon', name: 'Torre Halcón Dynamics', district: 'cenit', color: '#2c3444', sign: 'HALCÓN DYNAMICS', signColor: '#43f3ff',
    floors: [['Vestíbulo', 'publico', 'lobby'], ['Atención al cliente', 'publico', 'oficina'], ['Oficinas de contratos', 'empleados', 'oficina'], ['Centro de seguridad', 'empleados', 'seguridad'], ['Armería interna', 'restringido', 'armeria'], ['Laboratorio de armas', 'restringido', 'laboratorio'], ['Planta ejecutiva', 'restringido', 'ejecutiva'], ['Azotea y helipuerto', 'restringido', 'azotea']] },
  { id: 'torre-okami', corp: 'okami', name: 'Torre Okami', district: 'colinas', color: '#3a2e44', sign: 'OKAMI', signColor: '#5affc8',
    floors: [['Vestíbulo', 'publico', 'lobby'], ['Clínica de día', 'publico', 'oficina'], ['Administración', 'empleados', 'oficina'], ['Laboratorio biotecnológico', 'empleados', 'laboratorio'], ['Banco de órganos', 'restringido', 'laboratorio'], ['Planta ejecutiva', 'restringido', 'ejecutiva']] },
  { id: 'torre-teselia', corp: 'teselia', name: 'Aguja Teselia', district: 'cenit', color: '#262c48', sign: 'TESELIA', signColor: '#b46cff',
    floors: [['Vestíbulo', 'publico', 'lobby'], ['Tienda insignia', 'publico', 'oficina'], ['Desarrollo neural', 'empleados', 'oficina'], ['Sala de servidores', 'restringido', 'servidores'], ['Laboratorio de cromo', 'restringido', 'laboratorio'], ['Planta ejecutiva', 'restringido', 'ejecutiva'], ['Azotea', 'restringido', 'azotea']] },
  { id: 'torre-aurora', corp: 'aurora', name: 'Torre Aurora Logística', district: 'forja', color: '#3a4038', sign: 'AURORA', signColor: '#7dff7a',
    floors: [['Vestíbulo', 'publico', 'lobby'], ['Centro de reparto', 'empleados', 'oficina'], ['Control de flota', 'empleados', 'servidores'], ['Almacén de alta seguridad', 'restringido', 'armeria'], ['Planta ejecutiva', 'restringido', 'ejecutiva']] },
  { id: 'torre-kaiten', corp: 'kaiten', name: 'Arcología Kaiten', district: 'colinas', color: '#4a5a4a', sign: 'KAITEN', signColor: '#ffbf00',
    floors: [['Vestíbulo', 'publico', 'lobby'], ['Oficina de ventas', 'publico', 'oficina'], ['Gestión de fincas', 'empleados', 'oficina'], ['Bóveda de escrituras', 'restringido', 'armeria'], ['Ático de la dirección', 'restringido', 'ejecutiva']] },
];
const FLOOR_STYLE = {
  lobby: { base: 'tile', props: (w, h) => [{ type: 'plant', at: [2, 2] }, { type: 'plant', at: [w - 3, 2] }, { type: 'bench', at: [4, h - 3] }, { type: 'bench', at: [w - 6, h - 3] }, { type: 'screen', at: [Math.floor(w / 2), 1], blocking: false }], counters: (w) => [[Math.floor(w / 2) - 3, 4, 6, 1]] },
  oficina: { base: 'tile', props: (w, h) => { const o = []; for (let x = 5; x < w - 3; x += 4) for (let y = 3; y < h - 3; y += 4) o.push({ type: 'table', at: [x, y] }); o.push({ type: 'plant', at: [w - 2, 1] }); return o; } },
  seguridad: { base: 'metal', props: (w) => [...[3, 7, 11, 15].filter((x) => x < w - 2).map((x) => ({ type: 'screen', at: [x, 1], blocking: false })), { type: 'table', at: [5, 5] }, { type: 'table', at: [10, 5] }] },
  armeria: { base: 'metal', props: (w, h) => { const o = []; for (let x = 2; x < w - 2; x += 2) o.push({ type: 'shelf', at: [x, 1] }); for (let x = 3; x < w - 3; x += 5) o.push({ type: 'crate', at: [x, h - 3] }); return o; } },
  laboratorio: { base: 'tile', props: (w, h) => [{ type: 'bed', at: [3, h - 4] }, { type: 'bed', at: [7, h - 4] }, ...[3, 8, 13].filter((x) => x < w - 2).map((x) => ({ type: 'table', at: [x, 4] })), { type: 'screen', at: [w - 4, 1], blocking: false }] },
  servidores: { base: 'metal', props: (w, h) => { const o = []; for (let x = 3; x < w - 3; x += 3) for (let y = 3; y < h - 3; y += 3) o.push({ type: 'shelf', at: [x, y] }); return o; } },
  ejecutiva: { base: 'wood', props: (w, h) => [{ type: 'table', at: [Math.floor(w / 2), Math.floor(h / 2)] }, { type: 'plant', at: [2, 2] }, { type: 'plant', at: [w - 3, h - 3] }, { type: 'neon', at: [Math.floor(w / 2), 1], blocking: false }, { type: 'bench', at: [4, h - 3] }] },
  azotea: { base: 'deck', props: (w, h) => [{ type: 'antenna', at: [3, 3], blocking: false, z: 4 }, { type: 'crate', at: [w - 4, 3] }, { type: 'pipe', at: [5, h - 3] }] },
};
const W_T = 22, H_T = 14;
function towerZones(t, exit) {
  const zones = [];
  t.floors.forEach(([name, access, style], i) => {
    const st = FLOOR_STYLE[style];
    const id = `${t.id}-p${i}`;
    const blocks = (st.counters?.(W_T) ?? []).map(([x, y, w, h]) => ({ type: 'counter', rect: [x, y, w, h], color: t.color }));
    const doors = i === 0 ? [{ id: `salida-${t.id}`, name: 'Salida a la calle', at: [W_T - 1, 7], to: { zone: 'vertice', at: exit }, danger: 'public' }] : [];
    zones.push({
      id, name: `${t.name} · ${i === 0 ? 'Vestíbulo' : `Planta ${i}: ${name}`}`, kind: 'interior', width: W_T, height: H_T, danger: access === 'publico' ? 'protected' : 'public', base: st.base, wallColor: t.color,
      blocks, props: st.props(W_T, H_T),
      doors, objects: [{ id: `ascensor-${id}`, name: 'Ascensor', at: [1, 7], kind: 'elevator' }],
      waypoints: [[4, 7], [10, 9], [16, 7]], safePoint: [3, 7],
      gangs: access === 'restringido' ? [{ faction: t.corp, count: style === 'ejecutiva' || style === 'armeria' ? 3 : 2, area: [12, 7, 5] }] : [],
      tower: { id: t.id, floor: i, access, corp: t.corp },
    });
  });
  return zones;
}

// ---------------------------------------------------------------- bases de bandas y narcos
const BASES = [
  { id: 'base-marea', name: 'Almacén 7 · Cártel de la Marea', faction: 'marea', waste: 'muelles-viejos', boss: 'El Capitán Iriarte', color: '#2a4a5a', sign: 'ALMACÉN 7' },
  { id: 'base-saqueadores', name: 'Refinería en ruinas', faction: 'saqueadores', waste: 'descampado-norte', boss: 'Calavera Ruiz', color: '#5a4a3a', sign: '' },
  { id: 'base-hojas-rojas', name: 'Nave 14 · Hojas Rojas', faction: 'hojas-rojas', waste: 'poligono', boss: 'Madame Kurenai', color: '#5a1a2a', sign: 'NAVE 14' },
  { id: 'base-chatarreros', name: 'Taller del Vertedero', faction: 'chatarreros', waste: 'vertedero', boss: 'Tuercas Méndez', color: '#5a4a2a', sign: 'CHATARRA' },
  { id: 'base-engranajes', name: 'Cochera de los Engranajes', faction: 'engranajes', waste: 'cementerio-trenes', boss: 'Pistón', color: '#4a1a1a', sign: '' },
];
const WB = 28, HB = 18;
function baseZone(b, exit) {
  const props = [], blocks = [];
  for (let x = 3; x < WB - 3; x += 4) { props.push({ type: 'crate', at: [x, 3] }, { type: 'crate', at: [x + 1, HB - 4] }); }
  for (let y = 6; y < HB - 5; y += 4) props.push({ type: 'crate', at: [8, y] }, { type: 'crate', at: [19, y] });
  props.push({ type: 'table', at: [13, 8] }, { type: 'table', at: [15, 8] }, { type: 'screen', at: [14, 1], blocking: false, color: '#ff3040' }, { type: 'neon', at: [6, 1], blocking: false, color: '#ff3040' });
  blocks.push({ type: 'counter', rect: [22, 5, 1, 8], color: b.color });
  return {
    id: b.id, name: b.name, kind: 'interior', width: WB, height: HB, danger: 'disputed', base: 'metal', wallColor: b.color, blocks, props,
    doors: [{ id: `salida-${b.id}`, name: 'Salida', at: [WB - 1, 9], to: { zone: 'vertice', at: exit }, danger: 'disputed' }],
    objects: [{ id: `botin-${b.id}`, name: 'Alijo de la banda', at: [24, 9], kind: 'loot' }],
    waypoints: [[5, 9], [12, 12], [20, 6], [14, 9]], safePoint: [WB - 3, 9],
    gangs: [{ faction: b.faction, count: 7, area: [14, 9, 8] }],
    gangBase: { faction: b.faction, boss: b.boss },
  };
}

// ---------------------------------------------------------------- servicios: farmacias, comisarías y obras
const PHARMA = { ferro: 'Farmacia del Canal', cenit: 'Farmacia Okami Cénit', 'neon-rojo': 'Farmacia 24h Sakura', arrabal: 'Farmacia de San Ciro', colinas: 'Parafarmacia Jardines', forja: 'Botiquín Obrero' };
const POLICE = { ferro: 'Comisaría de Ferro', 'neon-rojo': 'Comisaría de Neón Rojo', arrabal: 'Puesto de la PCV del Arrabal', colinas: 'Comisaría de Colinas Doradas' };
const OBRAS = { ferro: 'Obra del nuevo muelle', cenit: 'Obra de la Torre Kaiten II', 'neon-rojo': 'Obra del Casino Fénix', forja: 'Ampliación de la fundición', arrabal: 'Obra del Bloque 60', colinas: 'Urbanización Mirador' };

/** Procesa un distrito ya escalado: callejones, luces, torres, farmacias, comisarías, obras y pasarelas. Devuelve interiores, puestos y zonas extra. */
export function enrichDistrict(z, seed) {
  z.dangerAreas ??= []; z.skybridges ??= []; z.blocks ??= []; z.props ??= []; z.objects ??= []; z.doors ??= [];
  const interiors = [], extraZones = [], posts = [];
  carveAlleys(z);
  // Torres corporativas (edificios más grandes del distrito).
  for (const t of TOWERS.filter((x) => x.district === z.id)) {
    const e = entrance(z, (b) => b.rect[2] >= 6 && b.rect[3] >= 6, { doorId: `puerta-${t.id}`, name: t.name, zone: `${t.id}-p0`, inAt: [W_T - 3, 7],
      building: { name: t.name, style: 'spire', height: 70 + Math.floor(t.floors.length * 4), color: t.color, sign: t.sign, signColor: t.signColor } });
    if (!e) throw new Error(`${z.id}: no cabe ${t.id}`);
    extraZones.push(...towerZones(t, city(z.id, e.out)));
    // Puestos de oficina en la torre.
    posts.push(
      { id: `${t.id}-analista`, name: `Analista de ${t.name.replace(/^Torre |^Aguja |^Arcología /, '')}`, zone: `${t.id}-p2`, at: [6, 7], skill: 'investigacion', minLevel: 8, pay: 260, shift: [8, 16], employer: t.corp, desc: 'Informes, auditorías y reuniones interminables.' },
      { id: `${t.id}-seguridad`, name: `Vigilante de ${t.name}`, zone: `${t.id}-p0`, at: [6, 10], skill: 'armas', minLevel: 8, pay: 220, shift: [22, 6], employer: t.corp, desc: 'Turno de noche en el vestíbulo. Que nadie suba sin tarjeta.' },
      { id: `${t.id}-recepcion`, name: `Recepcionista de ${t.name}`, zone: `${t.id}-p0`, at: [Math.floor(W_T / 2), 3], skill: 'negociacion', minLevel: 5, pay: 160, shift: [8, 16], employer: t.corp, desc: 'Sonrisa corporativa y control de visitas.' },
    );
  }
  // Farmacia.
  if (PHARMA[z.id]) {
    const id = `farmacia-${z.id}`;
    const e = entrance(z, (b) => b.rect[2] >= 3, { doorId: `puerta-${id}`, name: PHARMA[z.id], zone: id, inAt: [9, 4], building: { name: PHARMA[z.id], sign: 'FARMACIA ✚', signColor: '#5affc8', style: 'shop' } });
    if (e) {
      interiors.push({ id, name: PHARMA[z.id], size: 'small', base: 'tile', wall: '#2a4a3a', out: ['vertice', ...city(z.id, e.out)], danger: 'protected', shelves: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1]], plants: [[10, 7]],
        objects: [{ id: `caja-${id}`, name: `Mostrador de ${PHARMA[z.id]}`, at: [7, 3], kind: 'shop', shop: 'farmacia' }, { id: `contratar-${id}`, name: 'Encargada de la farmacia · ¿hay trabajo?', at: [9, 6], kind: 'hiring' }] });
      posts.push({ id: `${id}-farmaceutico`, name: `Farmacéutico/a · ${PHARMA[z.id]}`, zone: id, at: [6, 3], skill: 'medicina', minLevel: 8, pay: 200, shift: [9, 17], employer: 'okami', desc: 'Dispensar medicamentos, preparar fórmulas y aconsejar.' },
        { id: `${id}-dependiente`, name: `Dependiente/a · ${PHARMA[z.id]}`, zone: id, at: [8, 3], skill: 'negociacion', minLevel: 4, pay: 120, shift: [16, 24], employer: 'okami', desc: 'Caja, reposición y paciencia con los clientes.' });
    }
  }
  // Comisaría.
  if (POLICE[z.id]) {
    const id = `comisaria-${z.id}`;
    const e = entrance(z, (b) => b.rect[2] >= 5, { doorId: `puerta-${id}`, name: POLICE[z.id], zone: id, inAt: [13, 5], building: { name: POLICE[z.id], sign: 'PCV', signColor: '#60a5fa', style: 'block' } });
    if (e) {
      interiors.push({ id, name: POLICE[z.id], size: 'big', base: 'tile', wall: '#2c3a52', out: ['vertice', ...city(z.id, e.out)], danger: 'protected', tables: [[4, 4], [7, 4], [4, 7]], screens: [[5, 1, '#60a5fa'], [9, 1, '#60a5fa']],
        objects: [{ id: `ventanilla-${id}`, name: 'Ventanilla de «agilización»', at: [10, 8], kind: 'bribe' }, { id: `contratar-${id}`, name: 'Sargento de guardia · ¿hay plazas?', at: [12, 3], kind: 'hiring' }] });
      posts.push({ id: `${id}-patrulla`, name: `Agente de patrulla · ${POLICE[z.id]}`, zone: id, at: [5, 8], skill: 'armas', minLevel: 8, pay: 230, shift: [14, 22], employer: 'pcv', desc: 'Patrulla, multas y detenciones (y algún «favor»).' },
        { id: `${id}-detective`, name: `Detective · ${POLICE[z.id]}`, zone: id, at: [8, 6], skill: 'investigacion', minLevel: 10, pay: 300, shift: [8, 16], employer: 'pcv', desc: 'Casos abiertos, testigos y pruebas que desaparecen.' },
        { id: `${id}-calabozos`, name: `Guardia de calabozos · ${POLICE[z.id]}`, zone: id, at: [2, 9], skill: 'intimidacion', minLevel: 6, pay: 180, shift: [22, 6], employer: 'pcv', desc: 'Turno de noche vigilando a los detenidos.' });
    }
  }
  // Obra: un solar vallado con grúa y caseta.
  if (OBRAS[z.id]) {
    const cand = z.buildings.filter((b) => !hasDoor(z, b) && !used.has(b.id) && b.rect[2] >= 6 && b.rect[3] >= 6).sort((a, b) => a.rect[2] * a.rect[3] - b.rect[2] * b.rect[3])[0];
    if (cand) {
      z.buildings = z.buildings.filter((b) => b !== cand);
      const [bx, by, bw, bh] = cand.rect;
      z.ground.push({ type: 'gravel', rect: [bx, by, bw, bh] });
      z.blocks.push({ type: 'fence', rect: [bx, by, bw, 1] }, { type: 'fence', rect: [bx, by, 1, bh] }, { type: 'fence', rect: [bx + bw - 1, by, 1, bh] });
      z.props.push({ type: 'crane', at: [bx + 2, by + 2], blocking: true }, { type: 'crate', at: [bx + bw - 2, by + 2] }, { type: 'crate', at: [bx + bw - 2, by + 3] }, { type: 'pipe', at: [bx + 1, by + bh - 2] });
      const id = `obra-${z.id}`;
      const at = [bx + Math.floor(bw / 2), by + bh - 2];
      z.objects.push({ id: `caseta-${id}`, name: `Caseta de obra · ${OBRAS[z.id]} · ¿hay trabajo?`, at, kind: 'hiring' });
      z.dangerAreas.push({ rect: [bx, by, bw, bh], level: 'public' });
      const zc = 'vertice', p = (dx, dy) => city(z.id, [bx + dx, by + dy]);
      posts.push({ id: `${id}-peon`, name: `Peón · ${OBRAS[z.id]}`, zone: zc, at: p(2, 4), skill: 'atletismo', minLevel: 4, pay: 140, shift: [7, 15], employer: 'kaiten', desc: 'Cargar, cavar y aguantar el sol.', obra: `caseta-${id}` },
        { id: `${id}-gruista`, name: `Operador/a de grúa · ${OBRAS[z.id]}`, zone: zc, at: p(3, 2), skill: 'conduccion', minLevel: 8, pay: 220, shift: [7, 15], employer: 'kaiten', desc: 'Mover vigas a 80 metros sin matar a nadie.', obra: `caseta-${id}` },
        { id: `${id}-jefe`, name: `Jefe/a de obra · ${OBRAS[z.id]}`, zone: zc, at: p(bw - 3, bh - 3), skill: 'reparacion', minLevel: 12, pay: 320, shift: [7, 15], employer: 'kaiten', desc: 'Planos, plazos y gritos.', obra: `caseta-${id}` });
    }
  }
  // Pasarelas elevadas (segundo nivel): túneles acristalados que cruzan la avenida principal de edificio a edificio.
  if (z.id !== 'yermo') {
    const av = z.ground.filter((g) => g.type === 'asphalt' && g.rect[2] >= z.width * 0.8 && g.rect[3] >= 6).sort((a, b) => b.rect[3] - a.rect[3])[0];
    const { free, doorNear } = occupancy(z);
    let n = 0;
    if (av) for (const fx of [0.2, 0.55, 0.8]) {
      if (n >= 2) break;
      const [, ay, , ah] = av.rect;
      const north = z.buildings.find((b) => b.rect[1] + b.rect[3] <= ay && b.rect[1] + b.rect[3] >= ay - 4 && b.rect[0] <= z.width * fx && b.rect[0] + b.rect[2] > z.width * fx);
      const south = z.buildings.find((b) => b.rect[1] >= ay + ah && b.rect[1] <= ay + ah + 4 && b.rect[0] <= z.width * fx && b.rect[0] + b.rect[2] > z.width * fx);
      if (!north || !south) continue;
      const x = Math.floor(z.width * fx);
      const a = [x, north.rect[1] + north.rect[3]], b = [x, south.rect[1] - 1];
      if (!free(a[0], a[1]) || !free(b[0], b[1]) || doorNear(a[0], a[1]) || doorNear(b[0], b[1])) continue;
      const id = `pasarela-${z.id}-${++n}`;
      const len = Math.max(14, b[1] - a[1] + 4);
      z.doors.push({ id: `${id}-n`, name: 'Escaleras a la pasarela elevada', at: a, to: { zone: id, at: [2, 2] }, danger: 'public' },
        { id: `${id}-s`, name: 'Escaleras a la pasarela elevada', at: b, to: { zone: id, at: [len - 3, 2] }, danger: 'public' });
      z.skybridges.push({ from: [x, north.rect[1] + north.rect[3] - 1], to: [x, south.rect[1]], z: 9, color: '#43f3ff' });
      const props = [];
      for (let i = 2; i < len - 2; i += 2) props.push({ type: 'window', at: [i, 0], blocking: false, color: '#43f3ff' }, { type: 'window', at: [i, 4], blocking: false, color: '#43f3ff' });
      props.push({ type: 'neon', at: [Math.floor(len / 2), 0], blocking: false, color: '#ff3fa4' }, { type: 'bench', at: [Math.floor(len / 2), 3] });
      extraZones.push({
        id, name: `Pasarela elevada · ${z.name}`, kind: 'interior', width: len, height: 5, danger: 'public', base: 'metal', wallColor: '#1a2a3a', blocks: [], props,
        doors: [{ id: `${id}-bajar-n`, name: 'Bajar (lado norte)', at: [0, 2], to: { zone: 'vertice', at: city(z.id, [a[0], a[1] + 1]) }, danger: 'public' },
          { id: `${id}-bajar-s`, name: 'Bajar (lado sur)', at: [len - 1, 2], to: { zone: 'vertice', at: city(z.id, [b[0], b[1] - 1]) }, danger: 'public' }],
        objects: [], waypoints: [[3, 2], [len - 4, 2]], safePoint: [3, 2], skywalk: true,
      });
    }
  }
  addLighting(z, seed);
  return { interiors, extraZones, posts };
}

/** Celdas abandonadas: descampados, muelles y polígonos con la base de una banda o de los narcos. */
function wasteCell(id, seed) {
  const w = WASTE[id], [x0, y0, cw, ch] = wasteRect(id), r = rng(seed);
  const ground = [{ type: w.base, rect: [x0, y0, cw, ch] }];
  const buildings = [], props = [], doors = [], objects = [], dangerAreas = [{ rect: [x0, y0, cw, ch], level: 'disputed' }], waypoints = [];
  if (id === 'muelles-viejos') { ground.push({ type: 'water', rect: [x0, y0, cw, 30] }, { type: 'deck', rect: [x0, y0 + 30, cw, 6] }); for (let x = x0 + 6; x < x0 + cw - 6; x += 14) ground.push({ type: 'deck', rect: [x, y0 + 12, 4, 18] }); }
  ground.push({ type: 'asphalt', rect: [x0, y0 + Math.floor(ch / 2) + 8, cw, 6] });
  // Naves y ruinas.
  const slots = [[8, 40], [40, 40], [80, 40], [110, 40], [8, 76], [44, 76], [84, 76], [114, 76]];
  slots.forEach(([dx, dy], i) => {
    const bw = 16 + Math.floor(r() * 8), bh = 10 + Math.floor(r() * 6);
    if (dx + bw > cw - 2 || dy + bh > ch - 2) return;
    buildings.push({ id: `${id}-nave-${i}`, rect: [x0 + dx, y0 + dy, bw, bh], height: 6 + Math.floor(r() * 8), style: i % 3 ? 'industrial' : 'block', color: ['#3a3a3a', '#4a3a34', '#3a4040', '#403a30'][i % 4] });
    waypoints.push([x0 + dx + Math.floor(bw / 2), y0 + dy + bh + 2]);
  });
  for (let i = 0; i < 30; i++) { const px = x0 + 2 + Math.floor(r() * (cw - 4)), py = y0 + (id === 'muelles-viejos' ? 37 : 2) + Math.floor(r() * (ch - (id === 'muelles-viejos' ? 40 : 4))); if (!buildings.some((b) => inRect(px, py, b.rect))) props.push({ type: r() < 0.5 ? 'wreck' : 'crate', at: [px, py], color: '#5a4a3a' }); }
  for (let x = x0 + 10; x < x0 + cw - 4; x += 30) props.push({ type: 'lamp', at: [x, y0 + Math.floor(ch / 2) + 7] });
  return { ground, buildings, props, doors, objects, dangerAreas, waypoints };
}

/** Une los distritos escalados y las celdas abandonadas en la zona única «vertice». Devuelve la zona, las bases y metadatos. */
export function mergeCity(districts, names) {
  const ground = [{ type: 'sidewalk', rect: [0, 0, WORLD_W, WORLD_H] }], blocks = [], buildings = [], props = [], doors = [], objects = [], skybridges = [], dangerAreas = [], waypoints = [], meta = [];
  // Circunvalación: avenidas de 8 losetas entre celdas (pasos de cebra en los cruces).
  for (let gy = 0; gy <= 3; gy++) ground.push({ type: 'asphalt', rect: [0, gy * CH, WORLD_W, M] });
  for (let gx = 0; gx <= 4; gx++) ground.push({ type: 'asphalt', rect: [gx * CW, 0, M, WORLD_H] });
  for (let gy = 0; gy <= 3; gy++) for (let gx = 0; gx <= 4; gx++) ground.push({ type: 'crosswalk', rect: [gx * CW + M, gy * CH, 2, M] }, { type: 'crosswalk', rect: [gx * CW, gy * CH + M, M, 2] });
  for (let gy = 0; gy <= 3; gy++) for (let x = 6; x < WORLD_W - 4; x += 11) { if (gy > 0) props.push({ type: 'lamp', at: [x, gy * CH - 1] }); if (gy < 3) props.push({ type: 'lamp', at: [x, gy * CH + M] }); }
  for (let gx = 0; gx <= 4; gx++) for (let y = 6; y < WORLD_H - 4; y += 11) { if (gx > 0) props.push({ type: 'lamp', at: [gx * CW - 1, y] }); if (gx < 4) props.push({ type: 'lamp', at: [gx * CW + M, y] }); }
  for (let gy = 0; gy < 3; gy++) for (let gx = 0; gx < 4; gx++) waypoints.push([gx * CW + 4, gy * CH + Math.floor(CH / 2)], [gx * CW + Math.floor(CW / 2), gy * CH + 4]);
  const T = (ox, oy) => ({ P: ([x, y, ...r]) => [x + ox, y + oy, ...r], R: ([x, y, w, h]) => [x + ox, y + oy, w, h] });
  for (const z of districts) {
    const [ox, oy] = OFFSET[z.id];
    const { P, R } = T(ox, oy);
    ground.push({ type: z.base, rect: [ox, oy, z.width, z.height] });
    for (const g of z.ground) ground.push({ ...g, rect: R(g.rect) });
    for (const b of z.blocks) blocks.push({ ...b, rect: R(b.rect) });
    for (const b of z.buildings) buildings.push({ ...b, rect: R(b.rect) });
    for (const p of z.props) props.push({ ...p, at: P(p.at) });
    for (const d of z.doors) if (!GRID[d.to.zone]) doors.push({ ...d, at: P(d.at) });
    for (const o of z.objects) objects.push({ ...o, at: P(o.at) });
    for (const s of z.skybridges ?? []) skybridges.push({ ...s, from: P(s.from), to: P(s.to) });
    for (const a of z.dangerAreas ?? []) dangerAreas.push({ ...a, rect: R(a.rect) });
    for (const w of z.waypoints) waypoints.push(P(w));
    meta.push({ id: z.id, name: z.name, rect: districtRect(z.id), police: z.police ?? 0, ambient: z.ambient ?? 0, sleepQuality: z.sleepQuality, gangs: (z.gangs ?? []).map((g) => ({ ...g, area: g.area ? P(g.area) : undefined })),
      safePoint: P(z.safePoint), waypoints: z.waypoints.map(P), danger: 'public' });
  }
  const bases = [];
  for (const id of Object.keys(WASTE)) {
    const c = wasteCell(id, id.length * 97);
    ground.push(...c.ground); buildings.push(...c.buildings); props.push(...c.props); dangerAreas.push(...c.dangerAreas); waypoints.push(...c.waypoints);
    const [x0, y0, cw, ch] = wasteRect(id);
    const b = BASES.find((x) => x.waste === id);
    const bb = { id: `${id}-base`, name: b.name, rect: [x0 + Math.floor(cw / 2) - 12, y0 + Math.floor(ch / 2) - 12, 24, 14], height: 10, style: 'industrial', color: b.color, ...(b.sign ? { sign: b.sign, signColor: '#ff3040' } : {}) };
    buildings.push(bb);
    const door = [bb.rect[0] + 12, bb.rect[1] + bb.rect[3]];
    doors.push({ id: `puerta-${b.id}`, name: b.name, at: door, to: { zone: b.id, at: [WB - 3, 9] }, danger: 'disputed' });
    bases.push(baseZone(b, [door[0], door[1] + 1]));
    meta.push({ id, name: WASTE[id].name, rect: [x0, y0, cw, ch], police: 0, ambient: 2, sleepQuality: 0.2, gangs: WASTE[id].gangs.map((g) => ({ ...g, area: [x0 + Math.floor(cw / 2), y0 + Math.floor(ch / 2) + 10, 20] })),
      safePoint: [x0 + 4, y0 + Math.floor(ch / 2) + 10], waypoints: c.waypoints, danger: 'disputed' });
  }
  // Sectores: un nombre por bloque de 32×32 según el distrito.
  const sectors = [];
  for (let cy = 0; cy * 32 < WORLD_H; cy++) for (let cx = 0; cx * 32 < WORLD_W; cx++) {
    const x = cx * 32 + 16, y = cy * 32 + 16;
    const d = meta.find((m) => inRect(x, y, m.rect));
    if (!d) { sectors.push({ chunk: [cx, cy], name: 'Ciudad Vértice · Circunvalación' }); continue; }
    const [rx, ry, rw, rh] = d.rect;
    const v = y < ry + rh / 3 ? 'Norte' : y < ry + (2 * rh) / 3 ? 'Centro' : 'Sur', hh = x < rx + rw / 3 ? 'oeste' : x < rx + (2 * rw) / 3 ? '' : 'este';
    sectors.push({ chunk: [cx, cy], name: `${d.name} · ${v}${hh ? ` ${hh}` : ''}` });
  }
  const ferro = meta.find((m) => m.id === 'ferro');
  const zone = {
    id: 'vertice', name: names.city, kind: 'exterior', width: WORLD_W, height: WORLD_H, chunkSize: 32, danger: 'public', base: 'sidewalk',
    ground, blocks, buildings, props, doors, objects, skybridges, dangerAreas, sectors, waypoints, safePoint: ferro.safePoint,
    ambient: meta.reduce((a, m) => a + m.ambient, 0), police: meta.reduce((a, m) => a + m.police, 0), gangs: [], districts: meta,
  };
  return { zone, bases };
}

export const MAREA = {
  id: 'marea', name: 'Cártel de la Marea', kind: 'gang', desc: 'Narcotraficantes que mueven sintéticos por los muelles viejos. Pagan bien y matan mejor.',
  color: '#2a8aaa', archetype: 'Cártel de narcotráfico portuario', territory: ['muelles-viejos', 'ferro'], relations: { pcv: -60, 'hermandad-sol': -50, 'hojas-rojas': 30, chatarreros: 20, 'unidad-hierro': -70 },
  hostileBelow: -20, weapon: 'subfusil', hp: 60, defense: 14, chrome: ['ojos', 'brazo_der'],
};
