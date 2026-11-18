// v0.20 · Calles conectadas: muchas calzadas de barrio acababan a 1–15 casillas de la avenida de los antiguos límites
// de zona (o en el antiguo canal de la Marea), con un paso de peatones que no llevaba a ningún sitio. Cada extremo así se
// prolonga hasta la calzada más cercana en su eje si el hueco está libre (sin edificios, muros, agua ni puertas), y en la
// unión se pinta un paso de peatones para quien va por la acera de la avenida. Idempotente.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MAX_GAP = 16;

export function zonesV20(C) {
  const file = join(C, 'zones', 'vertice.json');
  const z = JSON.parse(readFileSync(file, 'utf8'));
  if (z.v20) return { joined: 0, left: 0 };
  const W = z.width, H = z.height;
  const ground = () => {
    const g = new Array(W * H).fill(z.base);
    for (const r of z.ground) for (let y = Math.max(0, r.rect[1]); y < Math.min(H, r.rect[1] + r.rect[3]); y++) for (let x = Math.max(0, r.rect[0]); x < Math.min(W, r.rect[0] + r.rect[2]); x++) g[y * W + x] = r.type;
    return g;
  };
  const hard = new Uint8Array(W * H);
  const fill = (r) => { for (let y = Math.max(0, r[1]); y < Math.min(H, r[1] + r[3]); y++) for (let x = Math.max(0, r[0]); x < Math.min(W, r[0] + r[2]); x++) hard[y * W + x] = 1; };
  for (const b of z.buildings) fill(b.rect);
  for (const b of z.blocks) fill(b.rect);
  for (const d of z.doors) hard[d.at[1] * W + d.at[0]] = 1;
  // Las cámaras de vigilancia se pueden mover un poco (las demás cosas, no).
  for (const o of z.objects) if (o.kind !== 'camera') hard[o.at[1] * W + o.at[0]] = 1;
  let g = ground();
  const isRoad = (x, y) => x >= 0 && y >= 0 && x < W && y < H && (g[y * W + x] === 'asphalt' || g[y * W + x] === 'crosswalk');
  let joined = 0, left = 0;
  const added = [];
  for (const r of z.ground.filter((gg) => gg.type === 'asphalt' && Math.min(gg.rect[2], gg.rect[3]) >= 3)) {
    for (const end of [0, 1]) {
      const [x, y, w, h] = r.rect, horiz = w >= h, width = horiz ? h : w;
      const lat = (k) => (horiz ? y + k : x + k);
      const cellAt = (t, k) => (horiz ? [t, lat(k)] : [lat(k), t]);
      const start = horiz ? (end ? x + w : x - 1) : (end ? y + h : y - 1), step = end ? 1 : -1;
      const roadCol = (t) => { let n = 0; for (let k = 0; k < width; k++) { const [cx, cy] = cellAt(t, k); if (isRoad(cx, cy)) n++; } return n >= width * 0.6; };
      const edge = (t) => (horiz ? t < 0 || t >= W : t < 0 || t >= H);
      if (edge(start) || roadCol(start)) continue; // ya conecta (o es el borde del mapa)
      // Busca la calzada más cercana en el eje, con el hueco libre.
      let hit = -1;
      for (let d = 0; d < MAX_GAP; d++) {
        const t = start + d * step;
        if (edge(t)) break;
        if (roadCol(t)) { hit = t; break; }
        let blocked = false;
        for (let k = 0; k < width && !blocked; k++) { const [cx, cy] = cellAt(t, k); if (hard[cy * W + cx] || g[cy * W + cx] === 'water') blocked = true; }
        if (blocked) break;
      }
      if (hit < 0) { left++; continue; }
      const a = Math.min(start, hit - step), b = Math.max(start, hit - step);
      const stub = horiz ? [a, y, b - a + 1, h] : [x, a, w, b - a + 1];
      // La calle crece (así conserva su orientación) y el tramo nuevo se repite al final para pisar la acera que había.
      r.rect = horiz ? [Math.min(x, a), y, Math.max(x + w, b + 1) - Math.min(x, a), h] : [x, Math.min(y, a), w, Math.max(y + h, b + 1) - Math.min(y, a)];
      added.push({ type: 'asphalt', rect: stub });
      // Paso de peatones en la unión (las dos casillas junto a la calzada a la que llega), si cabe.
      if (b - a + 1 >= 3) {
        const c0 = end ? b - 1 : a;
        added.push({ type: 'crosswalk', rect: horiz ? [c0, y, 2, h] : [x, c0, w, 2] });
      }
      // Lo que hubiera en el hueco (farolas, papeleras…) se quita de la calzada nueva.
      const inStub = (p) => p.at[0] >= stub[0] && p.at[0] < stub[0] + stub[2] && p.at[1] >= stub[1] && p.at[1] < stub[1] + stub[3];
      z.props = z.props.filter((p) => !inStub(p));
      // Una cámara que quede en la calzada nueva se aparta a la acera de al lado.
      for (const o of z.objects) if (o.kind === 'camera' && inStub(o)) o.at = horiz ? [o.at[0], o.at[1] < y + h / 2 ? y - 1 : y + h] : [o.at[0] < x + w / 2 ? x - 1 : x + w, o.at[1]];
      joined++;
    }
  }
  z.ground.push(...added);
  // Los puntos de paseo que hayan quedado en la calzada nueva pasan a la acera.
  g = ground();
  const solid = new Uint8Array(hard);
  for (const p of z.props) if (p.blocking !== false) solid[p.at[1] * W + p.at[0]] = 1;
  const fix = (wp) => {
    if (!isRoad(wp[0], wp[1])) return wp;
    for (let rr = 1; rr < 14; rr++) for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== rr) continue;
      const px = wp[0] + dx, py = wp[1] + dy;
      if (px < 1 || py < 1 || px >= W - 1 || py >= H - 1) continue;
      if (!isRoad(px, py) && !solid[py * W + px] && g[py * W + px] !== 'water') return [px, py];
    }
    return wp;
  };
  z.waypoints = z.waypoints.map(fix);
  for (const d of z.districts ?? []) d.waypoints = d.waypoints.map(fix);
  z.v20 = true;
  writeFileSync(file, JSON.stringify(z, null, 1) + '\n');
  return { joined, left };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = zonesV20(join(process.cwd(), 'content'));
  console.log(`v0.20: ${r.joined} calles prolongadas hasta la calzada más cercana (${r.left} extremos sin hueco libre).`);
}
