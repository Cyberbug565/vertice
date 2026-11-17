// v0.11 · Calles con giros: callejones en L y en Z que atraviesan las manzanas grandes (oscuros y disputados) y algunos
// pasajes comerciales iluminados. Los edificios se parten en rectángulos para que el mapa de colisiones siga siendo exacto.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const inR = (x, y, r) => x >= r[0] && y >= r[1] && x < r[0] + r[2] && y < r[1] + r[3];
const touches = (x, y, r) => x >= r[0] - 1 && y >= r[1] - 1 && x <= r[0] + r[2] && y <= r[1] + r[3];

/** Parte un edificio con un callejón que gira. Devuelve los trozos y los tramos de callejón, o null si no cabe. */
export function bendCut(b, shape, flip) {
  const [bx, by, bw, bh] = b.rect;
  if (shape === 'Z') {
    if (bw < 10 || bh < 9) return null;
    const ax1 = bx + Math.floor(bw / 3), ax2 = bx + Math.floor((2 * bw) / 3) - 1, ay = by + Math.floor(bh / 2) - 1;
    if (ax2 - ax1 < 2) return null;
    const lanes = [[ax1, by, 2, ay + 2 - by], [ax1, ay, ax2 + 2 - ax1, 2], [ax2, ay, 2, by + bh - ay]];
    const parts = [[bx, by, ax1 - bx, bh], [ax1, ay + 2, ax2 - ax1, by + bh - ay - 2], [ax1 + 2, by, bx + bw - ax1 - 2, ay - by], [ax2 + 2, ay, bx + bw - ax2 - 2, by + bh - ay]];
    return { lanes: flip ? lanes.map(mirror(b)) : lanes, parts: (flip ? parts.map(mirror(b)) : parts).filter((p) => p[2] >= 2 && p[3] >= 2) };
  }
  // L: baja desde el borde norte hasta la mitad y gira hacia el este (o hacia el oeste si flip).
  if (bw < 8 || bh < 8) return null;
  const ax = bx + Math.floor(bw / 2) - 1, ay = by + Math.floor(bh / 2) - 1;
  const lanes = [[ax, by, 2, ay + 2 - by], [ax, ay, bx + bw - ax, 2]];
  const parts = [[bx, by, ax - bx, bh], [ax + 2, by, bx + bw - ax - 2, ay - by], [ax, ay + 2, bx + bw - ax, by + bh - ay - 2]];
  return { lanes: flip ? lanes.map(mirror(b)) : lanes, parts: (flip ? parts.map(mirror(b)) : parts).filter((p) => p[2] >= 2 && p[3] >= 2) };
}
/** Refleja un rectángulo en horizontal dentro del edificio (para tener giros hacia los dos lados). */
const mirror = (b) => ([x, y, w, h]) => [b.rect[0] + b.rect[2] - (x - b.rect[0]) - w, y, w, h];

export function zonesV11(C) {
  const file = join(C, 'zones', 'vertice.json');
  const z = JSON.parse(readFileSync(file, 'utf8'));
  const r = rng(1107);
  const hasDoor = (b) => z.doors.some((d) => touches(d.at[0], d.at[1], b.rect));
  const busyInside = (b) => z.props.some((p) => inR(p.at[0], p.at[1], b.rect)) || z.objects.some((o) => inR(o.at[0], o.at[1], b.rect))
    || z.blocks.some((k) => inR(k.rect[0], k.rect[1], b.rect)) || (z.skybridges ?? []).some((s) => touches(s.from[0], s.from[1], b.rect) || touches(s.to[0], s.to[1], b.rect));
  const restricted = (b) => (z.dangerAreas ?? []).some((a) => a.restricted && inR(b.rect[0], b.rect[1], a.rect));
  let alleys = 0, passages = 0;
  const out = [];
  for (const b of z.buildings) {
    const big = b.rect[2] >= 8 && b.rect[3] >= 8;
    if (!big || b.name || b.sign || hasDoor(b) || busyInside(b) || restricted(b) || b.style === 'arcology' || b.style === 'spire' || r() < 0.25) { out.push(b); continue; }
    const shape = b.rect[2] >= 10 && b.rect[3] >= 9 && r() < 0.55 ? 'Z' : 'L';
    const cut = bendCut(b, shape, r() < 0.5);
    if (!cut) { out.push(b); continue; }
    // Las dos bocas del callejón tienen que dar a algo transitable (no a otro edificio ni al agua).
    const blocked = (x, y) => x < 0 || y < 0 || x >= z.width || y >= z.height || z.buildings.some((o) => o !== b && inR(x, y, o.rect)) || z.blocks.some((k) => inR(x, y, k.rect))
      || z.ground.some((g) => g.type === 'water' && inR(x, y, g.rect));
    const first = cut.lanes[0], last = cut.lanes[cut.lanes.length - 1];
    const mouths = [[first[0], first[1] - 1], [first[0] + 1, first[1] - 1], ...(last[2] > last[3] ? [[last[0] - 1, last[1]], [last[0] + last[2], last[1]], [last[0] - 1, last[1] + 1], [last[0] + last[2], last[1] + 1]] : [[last[0], last[1] + last[3]], [last[0] + 1, last[1] + last[3]]])];
    const open = mouths.filter(([x, y]) => !blocked(x, y) && !inR(x, y, b.rect)).length;
    if (open < 3) { out.push(b); continue; }
    // Cada trozo conserva estilo y color, con alturas algo distintas para que la manzana no parezca un bloque.
    cut.parts.forEach((p, i) => out.push({ ...b, id: i ? `${b.id}-${shape.toLowerCase()}${i}` : b.id, rect: p, height: Math.max(3, Math.round(b.height * (0.7 + r() * 0.5))), ...(i ? { sign: undefined, name: undefined, signColor: b.signColor } : {}) }));
    const lit = r() < 0.3;
    for (const [i, l] of cut.lanes.entries()) {
      z.ground.push({ type: lit ? 'tile' : 'alley', rect: l });
      if (!lit) z.dangerAreas.push({ rect: l, level: 'disputed' });
      const mx = l[0] + Math.floor(l[2] / 2), my = l[1] + Math.floor(l[3] / 2);
      if (lit) {
        // Pasaje comercial: tiras de neón y algún puesto a un lado.
        z.props.push({ type: 'neonstrip', blocking: false, at: [l[0], l[1]], color: ['#ff3fa4', '#43f3ff', '#ffd23f', '#b46cff'][i % 4] });
        if (i === 1 && l[2] >= 5) z.props.push({ type: 'kiosk', at: [l[0] + 2, l[1]], blocking: true });
      } else {
        // Callejón: basura, un charco de luz mortecina en el codo y alguna tubería.
        if (i === 0) z.props.push({ type: 'trash', at: [l[0] + 1, l[1] + 1] });
        if (i === 1) z.props.push({ type: 'neonstrip', blocking: false, at: [mx, my], color: '#ff5a3a' });
        if (i === cut.lanes.length - 1) z.props.push({ type: 'pipe', at: [l[0], Math.max(l[1], l[1] + l[3] - 2)] });
      }
    }
    if (lit) passages++; else alleys++;
  }
  // Los trozos nuevos sin rótulo pierden también el nombre (quedan como edificios anónimos).
  for (const b of out) { if (b.sign === undefined) delete b.sign; if (b.name === undefined) delete b.name; if (b.signColor === undefined) delete b.signColor; }
  z.buildings = out;
  writeFileSync(file, JSON.stringify(z, null, 1) + '\n');
  return { alleys, passages };
}
