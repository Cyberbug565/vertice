// v0.6 · Decorado con cobertura (muebles, columnas, mobiliario urbano), cámaras de vigilancia, zonas verde/amarilla/roja/negra
// y ordenadores en las viviendas. Se aplica sobre las zonas ya generadas.

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const inRect = (x, y, [rx, ry, rw, rh]) => x >= rx && y >= ry && x < rx + rw && y < ry + rh;

/** Rejilla transitable (como la del motor) para comprobar que el mobiliario no corta el paso. */
function walkGrid(z) {
  const w = z.width, h = z.height, walk = new Uint8Array(w * h).fill(1);
  const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < w && y < h) walk[y * w + x] = v; };
  for (const g of z.ground ?? []) if (g.type === 'water' || g.type === 'void') for (let y = g.rect[1]; y < g.rect[1] + g.rect[3]; y++) for (let x = g.rect[0]; x < g.rect[0] + g.rect[2]; x++) set(x, y, 0);
  for (const b of [...(z.buildings ?? []), ...(z.blocks ?? [])]) for (let y = b.rect[1]; y < b.rect[1] + b.rect[3]; y++) for (let x = b.rect[0]; x < b.rect[0] + b.rect[2]; x++) set(x, y, 0);
  for (const p of z.props ?? []) if (p.blocking !== false) set(p.at[0], p.at[1], 0);
  for (const o of z.objects ?? []) set(o.at[0], o.at[1], 0);
  if (z.kind === 'interior') { for (let x = 0; x < w; x++) { set(x, 0, 0); set(x, h - 1, 0); } for (let y = 0; y < h; y++) { set(0, y, 0); set(w - 1, y, 0); } }
  for (const d of z.doors ?? []) set(d.at[0], d.at[1], 1);
  return { w, h, walk };
}
function connected(z, must) {
  const { w, h, walk } = walkGrid(z);
  const start = z.doors?.[0]?.at ?? z.safePoint;
  const seen = new Uint8Array(w * h);
  const q = [start[1] * w + start[0]]; seen[q[0]] = 1;
  while (q.length) { const i = q.pop(), x = i % w, y = (i / w) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const j = ny * w + nx; if (!seen[j] && walk[j]) { seen[j] = 1; q.push(j); } } }
  const ok = ([x, y]) => seen[y * w + x] === 1;
  const near = ([x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => ok([x + dx, y + dy]));
  return must.points.every(ok) && must.near.every(near);
}

// ---------------------------------------------------------------- interiores
const KIND = (z) => {
  const s = `${z.id} ${z.name}`.toLowerCase();
  if (z.id.startsWith('casa-')) return 'casa';
  if (z.skywalk) return 'pasarela';
  if (z.gangBase) return 'almacen';
  if (/bar|club|ramen|comedor|karaoke|kitsune|voltio|casino|pachinko|motel/.test(s)) return 'bar';
  if (/clínica|clinica|consulta|laboratorio|ámbar|ambar|carnicero|iruka|ruiz|yuki|vex/.test(s)) return 'clinica';
  if (/comisar|oficina|torre|aguja|arcolog|teselia|halcón|kaiten|inmobiliaria|concesionario|blindados|autos|motos|usados/.test(s)) return 'oficina';
  if (/almacén|almacen|taller|logística|logistica|nave|desguace|engranajes/.test(s)) return 'almacen';
  if (/cápsula|capsula|hotel|nido|koi|bloque 9/.test(s)) return 'hotel';
  return 'tienda';
};
const SETS = {
  casa: [['sofa', '#4a3a5a'], ['desk', '#3a3040'], ['locker', '#40506a'], ['fridge', '#d8e0e8'], ['planter', '#2f6b4f'], ['arcade', '#b46cff']],
  pasarela: [['planter', '#2f6b4f'], ['bench', null], ['planter', '#2f6b4f']],
  bar: [['sofa', '#6b2140'], ['table', null], ['arcade', '#ff3fa4'], ['barrel', '#5a3a2a'], ['planter', '#2f6b4f'], ['column', '#3a3a4a']],
  clinica: [['locker', '#d8e0e8'], ['planter', '#2f6b4f'], ['desk', '#5a6a7a'], ['column', '#4a5a6a'], ['fridge', '#e8f0f0']],
  oficina: [['desk', '#2a3040'], ['desk', '#2a3040'], ['locker', '#3a4a5a'], ['sofa', '#2a2a3a'], ['planter', '#2f6b4f'], ['column', '#4a4a5a']],
  almacen: [['crate', null], ['barrel', '#5a4a3a'], ['crate', null], ['locker', '#4a4a3a'], ['column', '#3a3a3a'], ['barrel', '#3a5a3a']],
  hotel: [['locker', '#40506a'], ['planter', '#2f6b4f'], ['sofa', '#3a3550'], ['column', '#3a3a4a']],
  tienda: [['planter', '#2f6b4f'], ['column', '#3a3a4a'], ['locker', '#4a4a5a'], ['crate', null], ['desk', '#3a3040']],
};
export function furnishInterior(z, mustPoints = []) {
  if (z.kind !== 'interior' || z.furnished) return 0;
  z.props ??= []; z.objects ??= []; z.blocks ??= [];
  const r = rng(hash(z.id));
  const set = SETS[KIND(z)];
  const must = { points: [...(z.waypoints ?? []), z.safePoint, ...mustPoints].filter(Boolean), near: [...z.objects.map((o) => o.at), ...z.doors.map((d) => d.at)] };
  const occupied = (x, y) => z.props.some((p) => p.at[0] === x && p.at[1] === y) || z.objects.some((o) => o.at[0] === x && o.at[1] === y) || z.blocks.some((b) => inRect(x, y, b.rect))
    || z.doors.some((d) => Math.abs(d.at[0] - x) + Math.abs(d.at[1] - y) <= 2) || must.points.some(([px, py]) => px === x && py === y);
  let placed = 0;
  // Columnas estructurales en las salas grandes (dan cobertura total).
  if (z.width >= 14 && z.height >= 9) for (const [x, y] of [[4, 3], [z.width - 5, 3], [4, z.height - 4], [z.width - 5, z.height - 4]]) {
    if (occupied(x, y)) continue;
    z.props.push({ type: 'column', at: [x, y], color: z.wallColor });
    if (connected(z, must)) placed++; else z.props.pop();
  }
  const target = Math.round((z.width * z.height) / 22);
  for (let tries = 0; placed < target && tries < target * 12; tries++) {
    const [type, color] = set[Math.floor(r() * set.length)];
    const x = 1 + Math.floor(r() * (z.width - 2)), y = 1 + Math.floor(r() * (z.height - 2));
    if (occupied(x, y)) continue;
    z.props.push({ type, at: [x, y], ...(color ? { color } : {}) });
    if (connected(z, must)) placed++; else z.props.pop();
  }
  z.furnished = true;
  return placed;
}

// ---------------------------------------------------------------- exteriores: mobiliario urbano, barricadas y cámaras
export function furnishCity(z) {
  const r = rng(424242);
  const occ = new Set([...z.props.map((p) => `${p.at[0]},${p.at[1]}`), ...z.objects.map((o) => `${o.at[0]},${o.at[1]}`)]);
  const doorNear = (x, y) => z.doors.some((d) => Math.abs(d.at[0] - x) <= 2 && Math.abs(d.at[1] - y) <= 2) || z.objects.some((o) => Math.abs(o.at[0] - x) <= 1 && Math.abs(o.at[1] - y) <= 1);
  const road = z.ground.filter((g) => g.type === 'asphalt' || g.type === 'crosswalk');
  const blocked = (x, y) => x < 1 || y < 1 || x >= z.width - 1 || y >= z.height - 1 || occ.has(`${x},${y}`) || doorNear(x, y)
    || z.buildings.some((b) => inRect(x, y, b.rect)) || z.blocks.some((b) => inRect(x, y, b.rect)) || road.some((g) => inRect(x, y, g.rect)) || z.ground.some((g) => g.type === 'water' && inRect(x, y, g.rect));
  const zoneLevel = (x, y) => { let lv = 'public'; for (const a of z.dangerAreas) if (inRect(x, y, a.rect)) lv = a.level; return lv; };
  let n = 0;
  // Junto a cada farola: papelera, hidrante, jardinera, quiosco o contenedor (cobertura en plena calle).
  const lamps = z.props.filter((p) => p.type === 'lamp');
  for (const l of lamps) {
    if (r() > 0.55) continue;
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
      const x = l.at[0] + dx, y = l.at[1] + dy;
      if (blocked(x, y)) continue;
      const lv = zoneLevel(x, y);
      const opts = lv === 'lawless' ? ['jersey', 'barrel', 'wreck', 'barrel'] : lv === 'disputed' ? ['dumpster', 'barrel', 'jersey', 'dumpster'] : ['planter', 'hydrant', 'kiosk', 'dumpster', 'planter', 'busstop'];
      const type = opts[Math.floor(r() * opts.length)];
      z.props.push({ type, at: [x, y], ...(type === 'barrel' && r() < 0.4 ? { color: '#ff6a20', text: 'fuego' } : {}) });
      occ.add(`${x},${y}`); n++;
      break;
    }
  }
  // Barricadas en las zonas sin ley: pasillos de contenedores y bidones donde se atrincheran los cárteles.
  for (const a of z.dangerAreas.filter((x) => x.level === 'lawless')) {
    for (let i = 0; i < 40; i++) {
      const x = a.rect[0] + 2 + Math.floor(r() * (a.rect[2] - 4)), y = a.rect[1] + 2 + Math.floor(r() * (a.rect[3] - 4));
      if (blocked(x, y)) continue;
      z.props.push({ type: r() < 0.5 ? 'jersey' : 'barrel', at: [x, y], ...(r() < 0.3 ? { color: '#ff6a20', text: 'fuego' } : {}) }); occ.add(`${x},${y}`); n++;
    }
  }
  return n;
}

/** Cámaras: en los sitios principales de las zonas vigiladas (amarillas): cruces de avenidas, junto a tiendas, torres y comisarías. */
export function placeCameras(z) {
  const r = rng(777);
  const occ = new Set([...z.props.map((p) => `${p.at[0]},${p.at[1]}`), ...z.objects.map((o) => `${o.at[0]},${o.at[1]}`)]);
  const zoneLevel = (x, y) => { let lv = z.danger; for (const a of z.dangerAreas) if (inRect(x, y, a.rect)) lv = a.level; return lv; };
  const ok = (x, y) => x > 0 && y > 0 && x < z.width - 1 && y < z.height - 1 && !occ.has(`${x},${y}`) && zoneLevel(x, y) === 'public'
    && !z.buildings.some((b) => inRect(x, y, b.rect)) && !z.blocks.some((b) => inRect(x, y, b.rect)) && !z.ground.some((g) => (g.type === 'asphalt' || g.type === 'crosswalk' || g.type === 'water') && inRect(x, y, g.rect))
    && !z.doors.some((d) => Math.abs(d.at[0] - x) <= 1 && Math.abs(d.at[1] - y) <= 1);
  let n = 0;
  // Junto a las puertas de locales importantes.
  for (const d of z.doors) {
    if (!/torre|comisar|farmacia|armer|banco|casino|aurora|okami|supermerc|concesion|blindados|halcón|teselia|kaiten/i.test(`${d.id} ${d.name}`) || r() > 0.85) continue;
    for (const [dx, dy] of [[2, 1], [-2, 1], [2, 0], [-2, 0]]) { const x = d.at[0] + dx, y = d.at[1] + dy; if (!ok(x, y)) continue; z.objects.push({ id: `camara-${n++}`, name: 'Cámara de vigilancia', at: [x, y], kind: 'camera' }); occ.add(`${x},${y}`); break; }
  }
  // En las aceras de las avenidas, cada cierto trecho.
  for (const l of z.props.filter((p) => p.type === 'lamp')) {
    if (r() > 0.16) continue;
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) { const x = l.at[0] + dx, y = l.at[1] + dy; if (!ok(x, y)) continue; z.objects.push({ id: `camara-${n++}`, name: 'Cámara de vigilancia', at: [x, y], kind: 'camera' }); occ.add(`${x},${y}`); break; }
  }
  return n;
}

/** Zonas de color: verde solo en el inicio (y en tu casa), amarilla con vigilancia, roja sin apenas ley y negra sin ley. */
export function dangerPolicy(zone) {
  if (zone.cyber) return;
  if (zone.kind === 'interior') {
    zone.danger = zone.id === 'bloque9' || zone.id.startsWith('casa-') ? 'protected' : zone.gangBase ? 'lawless' : zone.danger === 'disputed' ? 'disputed' : 'public';
    for (const d of zone.doors ?? []) if (d.danger === 'protected') d.danger = 'public';
  }
}
export function cityDanger(z, red = ['forja'], black = ['yermo', 'muelles-viejos', 'descampado-norte', 'poligono', 'vertedero', 'cementerio-trenes']) {
  // Las zonas abandonadas venían como disputadas: pasan a negras. Distritos rojos y negros completos.
  z.dangerAreas = z.dangerAreas.filter((a) => !(a.level === 'disputed' && z.districts.some((d) => black.includes(d.id) && d.rect.join() === a.rect.join())));
  for (const d of z.districts) {
    if (red.includes(d.id)) z.dangerAreas.unshift({ rect: d.rect, level: 'disputed' });
    if (black.includes(d.id)) { z.dangerAreas.push({ rect: d.rect, level: 'lawless' }); d.danger = 'lawless'; d.police = 0; }
  }
  for (const d of z.doors) if (d.danger === 'protected' && d.to.zone !== 'bloque9') d.danger = 'public';
}

/** Ordenador personal en cada plantilla de vivienda (búsqueda de personas e información). */
export function addComputer(t) {
  if (t.objects.some((o) => o.kind === 'computer')) return;
  t.objects.push({ id: `ordenador-${t.id}`, name: 'Ordenador personal', at: [5, 2], kind: 'computer' });
}
