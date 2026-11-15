// A* sobre rejilla con 8 vecinos, sin cortar esquinas, con límite de expansiones y suavizado por línea de visión.
import type { ZoneGrid } from './zonegrid.js';
import { isWalkable } from './zonegrid.js';

export interface PathResult { ok: boolean; path: [number, number][]; expanded: number; reason?: string }

class MinHeap {
  private k: number[] = []; private v: number[] = [];
  get size() { return this.k.length; }
  push(key: number, val: number) {
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop(): number {
    const k = this.k, v = this.v; const top = v[0]; const lk = k.pop()!, lv = v.pop()!;
    if (k.length) {
      let i = 0; const n = k.length;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; let mk = lk;
        if (l < n && k[l] < mk) { m = l; mk = k[l]; } if (r < n && k[r] < mk) { m = r; mk = k[r]; }
        if (m === i) break; k[i] = k[m]; v[i] = v[m]; i = m; }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

const SQ2 = Math.SQRT2;
// Buffers reutilizados por tamaño de rejilla para evitar asignaciones en cada búsqueda.
const bufCache = new Map<number, { g: Float32Array; from: Int32Array; stamp: Uint32Array; closed: Uint32Array; gen: number }>();
function bufs(n: number) {
  let b = bufCache.get(n);
  if (!b) { b = { g: new Float32Array(n), from: new Int32Array(n), stamp: new Uint32Array(n), closed: new Uint32Array(n), gen: 0 }; bufCache.set(n, b); }
  b.gen++; return b;
}

export function findPath(grid: ZoneGrid, sx: number, sy: number, tx: number, ty: number, maxExpand = 6000): PathResult {
  const w = grid.w, h = grid.h, walk = grid.walk;
  const s = Math.floor(sy) * w + Math.floor(sx), t = Math.floor(ty) * w + Math.floor(tx);
  if (!isWalkable(grid, tx, ty)) return { ok: false, path: [], expanded: 0, reason: 'destino_bloqueado' };
  if (s === t) return { ok: true, path: [[tx, ty]], expanded: 0 };
  const b = bufs(w * h), gen = b.gen;
  const heap = new MinHeap();
  const tX = t % w, tY = (t / w) | 0;
  const hfn = (i: number) => { const dx = Math.abs((i % w) - tX), dy = Math.abs(((i / w) | 0) - tY); return (dx + dy) + (SQ2 - 2) * Math.min(dx, dy); };
  b.g[s] = 0; b.stamp[s] = gen; b.from[s] = -1; heap.push(hfn(s), s);
  let expanded = 0;
  while (heap.size) {
    const cur = heap.pop();
    if (b.closed[cur] === gen) continue;
    b.closed[cur] = gen;
    if (cur === t) break;
    if (++expanded > maxExpand) return { ok: false, path: [], expanded, reason: 'ruta_demasiado_larga' };
    const cx = cur % w, cy = (cur / w) | 0, cg = b.g[cur];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (!walk[ni] || b.closed[ni] === gen) continue;
      if (dx && dy && (!walk[cy * w + nx] || !walk[ny * w + cx])) continue; // sin cortar esquinas
      const ng = cg + (dx && dy ? SQ2 : 1);
      if (b.stamp[ni] !== gen || ng < b.g[ni]) { b.stamp[ni] = gen; b.g[ni] = ng; b.from[ni] = cur; heap.push(ng + hfn(ni), ni); }
    }
  }
  if (b.closed[t] !== gen) return { ok: false, path: [], expanded, reason: 'sin_ruta' };
  const tiles: number[] = [];
  for (let c = t; c !== -1; c = b.from[c]) tiles.push(c);
  tiles.reverse();
  const pts: [number, number][] = tiles.map((i) => [(i % w) + 0.5, ((i / w) | 0) + 0.5]);
  pts[pts.length - 1] = [tx, ty];
  return { ok: true, path: smooth(grid, sx, sy, pts), expanded };
}

/** ¿Se puede ir en línea recta? Muestrea el segmento con un margen lateral para no rozar esquinas. */
export function lineWalkable(grid: ZoneGrid, ax: number, ay: number, bx: number, by: number): boolean {
  const d = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(d / 0.25));
  const nx = d > 0 ? -(by - ay) / d * 0.3 : 0, ny = d > 0 ? (bx - ax) / d * 0.3 : 0;
  for (let i = 0; i <= steps; i++) {
    const x = ax + ((bx - ax) * i) / steps, y = ay + ((by - ay) * i) / steps;
    if (!isWalkable(grid, x, y) || !isWalkable(grid, x + nx, y + ny) || !isWalkable(grid, x - nx, y - ny)) return false;
  }
  return true;
}

function smooth(grid: ZoneGrid, sx: number, sy: number, pts: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  let ax = sx, ay = sy, i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !lineWalkable(grid, ax, ay, pts[j][0], pts[j][1])) j--;
    out.push(pts[j]); ax = pts[j][0]; ay = pts[j][1]; i = j + 1;
  }
  return out;
}
