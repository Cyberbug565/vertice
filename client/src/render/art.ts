// Arte procedural original: losetas, prismas de edificios, accesorios y personajes con capas de color.
import { Container, Graphics, Text, Texture } from 'pixi.js';
import { worldToScreen, hashString, seededRng, type Appearance, type GroundType, type ZoneDef } from '@vertice/shared';

export const HEX = (s: string) => parseInt(s.slice(1), 16);
export function shade(c: number, f: number) {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * f)), g = Math.min(255, Math.round(((c >> 8) & 255) * f)), b = Math.min(255, Math.round((c & 255) * f));
  return (r << 16) | (g << 8) | b;
}

const GROUND: Record<GroundType, number> = {
  void: 0x05050a, asphalt: 0x24242f, sidewalk: 0x3a3a4c, plaza: 0x46405c, market: 0x4b3a46, dirt: 0x4a3f32, water: 0x0b2440,
  bridge: 0x4c4c5c, wood: 0x5c4232, tile: 0x585a72, metal: 0x46525c, crosswalk: 0x24242f, deck: 0x3e3a36, gravel: 0x4b4640, grass: 0x2f5a3a, sand: 0x8a7458, alley: 0x15131c, data: 0x07142a, grid: 0x1a0610,
};

function diamond(x: number, y: number) {
  const a = worldToScreen(x, y), b = worldToScreen(x + 1, y), c = worldToScreen(x + 1, y + 1), d = worldToScreen(x, y + 1);
  return [a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y];
}

/** Dibuja un bloque de losetas (chunk) en un único Graphics estático. */
export function drawGroundChunk(g: Graphics, zone: ZoneDef, ground: Uint8Array, types: readonly GroundType[], cx0: number, cy0: number, size: number) {
  const w = zone.width;
  for (let y = cy0; y < Math.min(zone.height, cy0 + size); y++) for (let x = cx0; x < Math.min(zone.width, cx0 + size); x++) {
    const type = types[ground[y * w + x]];
    const h = hashString(`${x},${y}`);
    const v = 0.94 + ((h % 1000) / 1000) * 0.1;
    let col = shade(GROUND[type], v);
    if ((type === 'tile' || type === 'market') && (x + y) % 2 === 0) col = shade(col, 1.08);
    g.poly(diamond(x, y)).fill(col);
    if (type === 'crosswalk') {
      for (let i = 0; i < 3; i++) { const t = 0.15 + i * 0.3; const p = [...diamondStrip(x, y, t, t + 0.14)]; g.poly(p).fill({ color: 0xd8d8e8, alpha: 0.75 }); }
    } else if (type === 'water' && h % 7 === 0) {
      const a = worldToScreen(x + 0.3, y + 0.5), b = worldToScreen(x + 0.7, y + 0.5);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 1, color: 0x43f3ff, alpha: 0.25 });
    } else if (type === 'deck' || type === 'wood') {
      const a = worldToScreen(x, y + 0.5), b = worldToScreen(x + 1, y + 0.5);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 1, color: 0x000000, alpha: 0.25 });
    } else if (type === 'data' || type === 'grid') {
      // Ciberespacio: rejilla de neón y, a veces, un píxel corrupto.
      const neon = type === 'data' ? 0x43f3ff : 0xff2040;
      const a = worldToScreen(x, y), b = worldToScreen(x + 1, y), d = worldToScreen(x, y + 1);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).moveTo(a.x, a.y).lineTo(d.x, d.y).stroke({ width: 1, color: neon, alpha: 0.35 });
      if (h % 23 === 0) { const m = worldToScreen(x + 0.5, y + 0.5); g.rect(m.x - 6 + (h % 9), m.y - 2, 8 + (h % 7), 3).fill({ color: h % 2 ? 0x5aff8a : 0xff3fa4, alpha: 0.5 }); }
    } else if (type === 'asphalt' && h % 11 === 0) {
      const a = worldToScreen(x + 0.4, y + 0.4);
      g.circle(a.x, a.y + 4, 2).fill({ color: 0x000000, alpha: 0.3 });
    }
    // Bordillo: oscurece el lado de la acera junto a la calzada.
    if (type === 'sidewalk' && x + 1 < w && types[ground[y * w + x + 1]] === 'asphalt') {
      const a = worldToScreen(x + 1, y), b = worldToScreen(x + 1, y + 1);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 2, color: 0x6a6a84, alpha: 0.6 });
    }
  }
}
function diamondStrip(x: number, y: number, t0: number, t1: number) {
  const a = worldToScreen(x + t0, y), b = worldToScreen(x + t1, y), c = worldToScreen(x + t1, y + 1), d = worldToScreen(x + t0, y + 1);
  return [a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y];
}

/** Prisma con caras visibles (+x y +y) y tapa. Devuelve el rectángulo de pantalla. */
export function drawBox(g: Graphics, x0: number, y0: number, w: number, h: number, z0: number, H: number, color: number, alpha = 1) {
  const x1 = x0 + w, y1 = y0 + h;
  const E = worldToScreen(x1, y0, z0), S = worldToScreen(x1, y1, z0), W = worldToScreen(x0, y1, z0);
  const Nt = worldToScreen(x0, y0, z0 + H), Et = worldToScreen(x1, y0, z0 + H), St = worldToScreen(x1, y1, z0 + H), Wt = worldToScreen(x0, y1, z0 + H);
  g.poly([E.x, E.y, S.x, S.y, St.x, St.y, Et.x, Et.y]).fill({ color: shade(color, 0.82), alpha });
  g.poly([S.x, S.y, W.x, W.y, Wt.x, Wt.y, St.x, St.y]).fill({ color: shade(color, 0.62), alpha });
  g.poly([Nt.x, Nt.y, Et.x, Et.y, St.x, St.y, Wt.x, Wt.y]).fill({ color: shade(color, 1.18), alpha });
  g.poly([Wt.x, Wt.y, St.x, St.y, Et.x, Et.y]).stroke({ width: 1, color: shade(color, 1.5), alpha: 0.35 * alpha });
}

function quadOnFaceY(g: Graphics, yFace: number, xa: number, xb: number, za: number, zb: number, color: number, alpha: number) {
  const a = worldToScreen(xa, yFace, za), b = worldToScreen(xb, yFace, za), c = worldToScreen(xb, yFace, zb), d = worldToScreen(xa, yFace, zb);
  g.poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y]).fill({ color, alpha });
}
function quadOnFaceX(g: Graphics, xFace: number, ya: number, yb: number, za: number, zb: number, color: number, alpha: number) {
  const a = worldToScreen(xFace, ya, za), b = worldToScreen(xFace, yb, za), c = worldToScreen(xFace, yb, zb), d = worldToScreen(xFace, ya, zb);
  g.poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y]).fill({ color, alpha });
}

const WINDOW_COLORS = [0xfff1c0, 0xffe0a0, 0xfff1c0, 0xcfe8ff, 0x43f3ff, 0xffd23f, 0xff4fa0];

export type Occl = (sx: number, sy: number) => boolean;
const NO_OCCL: Occl = () => false;

export function drawBuilding(b: ZoneDef['buildings'][number], body: Graphics, lights: Graphics, quality: 'low' | 'high', occl: Occl = NO_OCCL): { x: number; y: number }[] {
  const [x0, y0, w, h] = b.rect; const H = b.height; const x1 = x0 + w, y1 = y0 + h;
  const col = HEX(b.color);
  const beacons: { x: number; y: number }[] = [];
  const style = b.style;
  // Volumen principal y remates: arcologías escalonadas, agujas que se estrechan, cristal con franjas de luz.
  const mainH = style === 'arcology' ? Math.round(H * 0.5) : style === 'spire' ? Math.round(H * 0.7) : H;
  const glass = style === 'glass' || style === 'spire';
  drawBox(body, x0, y0, w, h, 0, mainH, glass ? shade(col, 0.9) : col);
  const rng = seededRng(hashString(b.id));
  const floorH = style === 'industrial' ? 2 : 1;
  const litRate = style === 'industrial' ? 0.1 : style === 'tower' || glass ? 0.3 : 0.22;
  for (let z = 0.35; z + 0.5 < mainH; z += floorH) {
    for (let x = x0 + 0.2; x + 0.6 <= x1; x += 1) {
      const lit = rng() < litRate;
      const c = lit ? WINDOW_COLORS[Math.floor(rng() * WINDOW_COLORS.length)] : glass ? 0x1a2a44 : 0x0e0e1c;
      quadOnFaceY(body, y1, x, x + (glass ? 0.9 : 0.55), z, z + (glass ? 0.7 : 0.45), c, lit ? 0.7 : 0.55);
      if (lit && quality === 'high' && rng() < 0.5) { const m = worldToScreen(x + 0.27, y1, z + 0.22); if (!occl(m.x, m.y)) quadOnFaceY(lights, y1, x - 0.1, x + 0.65, z - 0.1, z + 0.55, c, 0.18); }
    }
    for (let y = y0 + 0.2; y + 0.6 <= y1; y += 1) {
      const lit = rng() < litRate;
      const c = lit ? WINDOW_COLORS[Math.floor(rng() * WINDOW_COLORS.length)] : glass ? 0x1a2a44 : 0x0e0e1c;
      quadOnFaceX(body, x1, y, y + (glass ? 0.9 : 0.55), z, z + (glass ? 0.7 : 0.45), c, lit ? 0.7 : 0.55);
      if (lit && quality === 'high' && rng() < 0.5) { const m = worldToScreen(x1, y + 0.27, z + 0.22); if (!occl(m.x, m.y)) quadOnFaceX(lights, x1, y - 0.1, y + 0.65, z - 0.1, z + 0.55, c, 0.18); }
    }
  }
  const sc = b.signColor ? HEX(b.signColor) : 0x43f3ff;
  if (glass) {
    // Franjas verticales de luz en la fachada.
    for (let x = x0 + 1; x < x1; x += 3) { const a = worldToScreen(x, y1, 0.2), t2 = worldToScreen(x, y1, mainH - 0.2); const tg = occl((a.x + t2.x) / 2, (a.y + t2.y) / 2) ? body : lights; tg.moveTo(a.x, a.y).lineTo(t2.x, t2.y).stroke({ width: 2, color: sc, alpha: 0.55 }); }
    for (let y = y0 + 1; y < y1; y += 3) { const a = worldToScreen(x1, y, 0.2), t2 = worldToScreen(x1, y, mainH - 0.2); const tg = occl((a.x + t2.x) / 2, (a.y + t2.y) / 2) ? body : lights; tg.moveTo(a.x, a.y).lineTo(t2.x, t2.y).stroke({ width: 2, color: sc, alpha: 0.4 }); }
  }
  if (style === 'mega' || style === 'arcology') for (let z = 2; z < mainH; z += 2) { quadOnFaceY(body, y1, x0, x1, z - 0.06, z, 0x000000, 0.35); quadOnFaceX(body, x1, y0, y1, z - 0.06, z, 0x000000, 0.35); }
  if (style === 'arcology') {
    // Dos niveles retranqueados con terrazas iluminadas.
    const h2 = Math.round(H * 0.8);
    drawBox(body, x0 + 1, y0 + 1, w - 2, h - 2, mainH, h2 - mainH, shade(col, 1.05));
    drawBox(body, x0 + 2, y0 + 2, Math.max(1, w - 4), Math.max(1, h - 4), h2, H - h2, shade(col, 1.12));
    for (const [zz, ins] of [[mainH, 1], [h2, 2]] as [number, number][]) {
      const a = worldToScreen(x0 + ins, y1 - ins, zz + 0.3), b2 = worldToScreen(x1 - ins, y1 - ins, zz + 0.3), c2 = worldToScreen(x1 - ins, y0 + ins, zz + 0.3);
      lights.moveTo(a.x, a.y).lineTo(b2.x, b2.y).lineTo(c2.x, c2.y).stroke({ width: 2, color: sc, alpha: 0.75 });
    }
    for (let z = mainH + 1; z < H; z += 2) { quadOnFaceY(body, y1 - 1, x0 + 1.3, x1 - 1.3, z, z + 0.4, 0xfff1c0, 0.35); }
    beacons.push(worldToScreen(x0 + w / 2, y0 + h / 2, H + 0.3));
  }
  if (style === 'spire') {
    const iw = Math.max(2, Math.round(w * 0.5)), ih = Math.max(2, Math.round(h * 0.5));
    const ix = x0 + Math.floor((w - iw) / 2), iy = y0 + Math.floor((h - ih) / 2);
    drawBox(body, ix, iy, iw, ih, mainH, H - mainH, shade(col, 1.08));
    for (let z = mainH + 0.5; z < H; z += 1.5) quadOnFaceY(lights, iy + ih, ix + 0.2, ix + iw - 0.2, z, z + 0.15, sc, 0.6);
    const top = worldToScreen(ix + iw / 2, iy + ih / 2, H), tip = worldToScreen(ix + iw / 2, iy + ih / 2, H + 5);
    body.moveTo(top.x, top.y).lineTo(tip.x, tip.y).stroke({ width: 3, color: 0x8890a8 });
    beacons.push(tip);
  }
  if (style === 'shop' || style === 'club' || style === 'clinic') {
    quadOnFaceY(body, y1, x0 + 0.4, x1 - 0.4, 0.05, 0.85, shade(sc, 0.35), 0.95);
    const m = worldToScreen((x0 + x1) / 2, y1, 0.4);
    if (!occl(m.x, m.y)) quadOnFaceY(lights, y1, x0 + 0.4, x1 - 0.4, 0.05, 0.85, sc, 0.25);
  }
  if (style === 'club' || style === 'tower' || glass) {
    const a = worldToScreen(x1, y1, 0), t2 = worldToScreen(x1, y1, mainH);
    const tgt = !occl((a.x + t2.x) / 2, (a.y + t2.y) / 2) ? lights : body;
    tgt.moveTo(a.x, a.y).lineTo(t2.x, t2.y).stroke({ width: 3, color: sc, alpha: 0.9 });
    const r0 = worldToScreen(x0, y1, mainH), r1 = worldToScreen(x1, y1, mainH), r2 = worldToScreen(x1, y0, mainH);
    (occl(r1.x, r1.y) ? body : lights).moveTo(r0.x, r0.y).lineTo(r1.x, r1.y).lineTo(r2.x, r2.y).stroke({ width: 2, color: sc, alpha: 0.7 });
  }
  if (style === 'industrial') {
    for (let i = 0; i < 2; i++) { const vx = x0 + 1 + rng() * (w - 2), vy = y0 + 1 + rng() * (h - 2); drawBox(body, vx, vy, 0.6, 0.6, H, 0.5, 0x5a5a60); }
  }
  if (style === 'clinic') {
    const c = worldToScreen(x1 - 1.2, y1, H - 0.8);
    const tg = occl(c.x, c.y) ? body : lights;
    tg.rect(c.x - 8, c.y - 3, 16, 6).fill({ color: 0x5affc8, alpha: 0.9 });
    tg.rect(c.x - 3, c.y - 8, 6, 16).fill({ color: 0x5affc8, alpha: 0.9 });
  }
  if (H >= 14 && style !== 'arcology' && style !== 'spire') beacons.push(worldToScreen(x1 - 0.5, y1 - 0.5, H + 0.2));
  return beacons;
}

/** Pasarela aérea entre dos torres. */
export function drawSkybridge(g: Graphics, lights: Graphics, sb: ZoneDef['skybridges'][number]) {
  const c = sb.color ? HEX(sb.color) : 0x43f3ff;
  const [ax, ay] = sb.from, [bx, by] = sb.to;
  const horiz = ay === by;
  const x0 = Math.min(ax, bx), y0 = Math.min(ay, by);
  const w = horiz ? Math.abs(bx - ax) : 1, h = horiz ? 1 : Math.abs(by - ay);
  drawBox(g, x0, y0, w, h, sb.z, 0.7, 0x2a3040, 0.95);
  const a = worldToScreen(x0, y0 + h, sb.z + 0.35), b = worldToScreen(x0 + w, y0 + h, sb.z + 0.35), c2 = worldToScreen(x0 + w, y0, sb.z + 0.35);
  lights.moveTo(a.x, a.y).lineTo(b.x, b.y).lineTo(c2.x, c2.y).stroke({ width: 2, color: c, alpha: 0.9 });
}

/** Holograma publicitario flotante. */
export function makeHolo(p: ZoneDef['props'][number], quality: 'low' | 'high'): Container {
  const col = p.color ?? '#43f3ff';
  const c = new Container();
  const txt = new Text({ text: p.text ?? '', style: { fontFamily: 'system-ui, sans-serif', fontWeight: '800', fontSize: 22, fill: col, letterSpacing: 3,
    dropShadow: quality === 'high' ? { color: col, blur: 10, distance: 0, alpha: 1 } : undefined } });
  txt.anchor.set(0.5);
  const frame = new Graphics().roundRect(-txt.width / 2 - 14, -txt.height / 2 - 8, txt.width + 28, txt.height + 16, 6).fill({ color: HEX(col), alpha: 0.12 }).stroke({ width: 2, color: HEX(col), alpha: 0.8 });
  const pos = worldToScreen(p.at[0] + 0.5, p.at[1] + 0.5, p.z ?? 6);
  const base = worldToScreen(p.at[0] + 0.5, p.at[1] + 0.5, 0);
  const beam = new Graphics().moveTo(0, 0).lineTo(0, base.y - pos.y).stroke({ width: 1, color: HEX(col), alpha: 0.25 });
  c.addChild(beam, frame, txt);
  c.position.set(pos.x, pos.y);
  return c;
}

/** Letrero de neón alineado con la cara +y del edificio. */
export function makeSign(b: ZoneDef['buildings'][number], quality: 'low' | 'high'): Container | null {
  if (!b.sign) return null;
  const [x0, y0, w, h] = b.rect; void y0;
  const color = b.signColor ?? '#ff3fa4';
  const size = Math.min(26, Math.max(12, (w * 64) / Math.max(4, b.sign.length) / 1.6));
  const txt = new Text({ text: b.sign, style: { fontFamily: 'system-ui, sans-serif', fontWeight: '800', fontSize: size, fill: color, letterSpacing: 2,
    dropShadow: quality === 'high' ? { color, blur: 8, distance: 0, alpha: 0.9 } : undefined } });
  txt.anchor.set(0.5, 1);
  const zTop = b.style === 'shop' || b.style === 'club' || b.style === 'clinic' ? Math.min(b.height - 0.2, 2.2) : b.height - 0.4;
  const p = worldToScreen(x0 + w / 2, y0 + h, zTop);
  txt.position.set(p.x, p.y);
  txt.skew.set(0, Math.atan(0.5));
  return txt;
}

export function drawProp(g: Graphics, lightsIn: Graphics, p: ZoneDef['props'][number], powered: boolean, occl: Occl = NO_OCCL) {
  const [x, y] = p.at; const c = p.color ? HEX(p.color) : 0x8888aa;
  const top = worldToScreen(x + 0.5, y + 0.5, 1);
  // Si un edificio delante tapa el accesorio, su brillo no debe atravesarlo.
  const lights = occl(top.x, top.y) ? new Graphics() : lightsIn;
  switch (p.type) {
    case 'stall': {
      drawBox(g, x + 0.1, y + 0.1, 0.8, 0.8, 0, 0.55, 0x4a3a2a);
      drawBox(g, x, y, 1, 1, 0.9, 0.12, powered ? c : shade(c, 0.45));
      if (powered) { const s = worldToScreen(x + 0.5, y + 0.5, 0.8); lights.circle(s.x, s.y, 30).fill({ color: c, alpha: 0.12 }); }
      break;
    }
    case 'lamp': {
      // Farola alta con brazo y cono de luz en el suelo.
      const a = worldToScreen(x + 0.5, y + 0.5, 0), t = worldToScreen(x + 0.5, y + 0.5, 4.2), arm = worldToScreen(x + 1.1, y + 0.5, 4.1);
      g.moveTo(a.x, a.y).lineTo(t.x, t.y).stroke({ width: 4, color: 0x2a2a38 });
      g.moveTo(t.x, t.y).lineTo(arm.x, arm.y).stroke({ width: 3, color: 0x2a2a38 });
      // v0.9 · Cada distrito tiene su color de farola (p.color); por defecto, sodio cálido.
      const lc = p.color ? c : 0xfff1c0, pool = p.color ? c : 0xff9a30;
      g.roundRect(arm.x - 6, arm.y - 2, 12, 5, 2).fill(lc);
      lights.circle(arm.x, arm.y, 14).fill({ color: lc, alpha: 0.4 });
      const fl = worldToScreen(x + 1.1, y + 0.5, 0);
      lights.ellipse(fl.x, fl.y, 70, 35).fill({ color: pool, alpha: 0.16 });
      lights.ellipse(fl.x, fl.y, 36, 18).fill({ color: lc, alpha: 0.14 });
      break;
    }
    case 'crate': drawBox(g, x + 0.05, y + 0.05, 0.9, 0.9, 0, 0.9, 0x7a5b3a); drawBox(g, x + 0.05, y + 0.05, 0.9, 0.9, 0.9, 0.04, 0x5a4128); break;
    case 'bench': drawBox(g, x, y + 0.25, 1, 0.5, 0, 0.45, 0x5a5a6a); drawBox(g, x, y + 0.65, 1, 0.12, 0.45, 0.4, 0x4a4a5a); break;
    case 'table': drawBox(g, x + 0.15, y + 0.15, 0.7, 0.7, 0, 0.55, 0x3a2a24); break;
    case 'bed': drawBox(g, x, y + 0.1, 1, 0.8, 0, 0.4, 0xd8e0e8); { const s = worldToScreen(x + 0.5, y + 0.5, 0.5); lights.circle(s.x, s.y, 18).fill({ color: c, alpha: 0.15 }); } break;
    case 'plant': { drawBox(g, x + 0.3, y + 0.3, 0.4, 0.4, 0, 0.35, 0x4a4a5a); const s = worldToScreen(x + 0.5, y + 0.5, 0.8); g.circle(s.x, s.y, 10).fill(0x2f6b4f); g.circle(s.x + 4, s.y - 5, 7).fill(0x3d8a62); break; }
    case 'vending': drawBox(g, x + 0.1, y + 0.15, 0.8, 0.7, 0, 2.2, 0x2a2a3a); { const s = worldToScreen(x + 0.5, y + 0.8, 0.9); g.rect(s.x - 7, s.y - 14, 14, 20).fill(c); lights.rect(s.x - 10, s.y - 17, 20, 26).fill({ color: c, alpha: 0.2 }); } break;
    case 'car': {
      drawBox(g, x - 0.5, y, 2, 1, 0.12, 0.55, c);
      drawBox(g, x - 0.05, y + 0.12, 1.1, 0.76, 0.67, 0.45, shade(c, 0.55));
      const hl = worldToScreen(x + 1.5, y + 0.5, 0.4); lights.circle(hl.x, hl.y, 10).fill({ color: 0xfff1c0, alpha: 0.45 });
      break;
    }
    case 'screen': case 'neon': { const s = worldToScreen(x + 0.5, y, 1.6); g.rect(s.x - 16, s.y - 10, 32, 18).fill(shade(c, 0.6)); lights.rect(s.x - 20, s.y - 14, 40, 26).fill({ color: c, alpha: 0.3 }); break; }
    case 'pipe': drawBox(g, x + 0.3, y + 0.3, 0.4, 0.4, 0, 1.8, 0x55606a); break;
    case 'crane': {
      // Grúa de obra: torre de celosía, pluma larga y luz roja en la punta.
      drawBox(g, x + 0.3, y + 0.3, 0.4, 0.4, 0, 14, 0xffb020);
      const t0 = worldToScreen(x + 0.5, y + 0.5, 14), t1 = worldToScreen(x + 6, y + 0.5, 14), t2 = worldToScreen(x - 2, y + 0.5, 14);
      g.moveTo(t2.x, t2.y).lineTo(t1.x, t1.y).stroke({ width: 3, color: 0xffb020 });
      const hook = worldToScreen(x + 4.5, y + 0.5, 8); g.moveTo(worldToScreen(x + 4.5, y + 0.5, 14).x, worldToScreen(x + 4.5, y + 0.5, 14).y).lineTo(hook.x, hook.y).stroke({ width: 1, color: 0x888888 });
      drawBox(g, x - 2, y + 0.3, 0.6, 0.4, 13.4, 0.6, 0x5a5a5a);
      lights.circle(t1.x, t1.y, 5).fill({ color: 0xff3040, alpha: 0.8 }); void t0;
      break;
    }
    case 'window': {
      // Ventanal de la pasarela: cristal con el brillo de la ciudad detrás.
      const s = worldToScreen(x + 0.5, y, 1.4);
      g.rect(s.x - 14, s.y - 16, 28, 24).fill(0x0a1426).stroke({ width: 2, color: 0x3a4a5a });
      for (let i = 0; i < 5; i++) g.rect(s.x - 11 + i * 5, s.y - 6 - ((i * 7) % 9), 3, 10 + ((i * 5) % 7)).fill(i % 2 ? 0x2a3a6a : 0x3a2a5a);
      lights.rect(s.x - 14, s.y - 16, 28, 24).fill({ color: c, alpha: 0.14 });
      break;
    }
    case 'shelf': drawBox(g, x + 0.05, y + 0.25, 0.9, 0.5, 0, 1.4, 0x4a4a5a); { const s1 = worldToScreen(x + 0.5, y + 0.75, 0.6); g.rect(s1.x - 12, s1.y - 4, 24, 3).fill(0xffd23f); g.rect(s1.x - 12, s1.y - 16, 24, 3).fill(0x43f3ff); } break;
    case 'trash': drawBox(g, x + 0.05, y + 0.1, 0.9, 0.8, 0, 1.0, 0x2f5a3a); drawBox(g, x + 0.05, y + 0.1, 0.9, 0.8, 1.0, 0.08, 0x23452c); break;
    case 'antenna': case 'holo': break;
    case 'tent': { const p1 = worldToScreen(x, y + 1), p2 = worldToScreen(x + 1, y + 1), p3 = worldToScreen(x + 1, y), top = worldToScreen(x + 0.5, y + 0.5, 1.1); g.poly([p1.x, p1.y, p2.x, p2.y, top.x, top.y]).fill(shade(c, 0.8)); g.poly([p2.x, p2.y, p3.x, p3.y, top.x, top.y]).fill(c); break; }
    case 'smokestack': drawBox(g, x + 0.2, y + 0.2, 0.6, 0.6, 0, 6, 0x5a4a40); { const t = worldToScreen(x + 0.5, y + 0.5, 6.2); lights.circle(t.x, t.y, 6).fill({ color: 0xff8a3d, alpha: 0.35 }); g.circle(t.x, t.y - 10, 9).fill({ color: 0x8a8a8a, alpha: 0.25 }); g.circle(t.x + 6, t.y - 20, 12).fill({ color: 0x8a8a8a, alpha: 0.18 }); } break;
    case 'wreck': drawBox(g, x - 0.1, y + 0.15, 1.2, 0.7, 0, 0.45, 0x5a4a3a); drawBox(g, x + 0.2, y + 0.25, 0.6, 0.5, 0.45, 0.25, 0x3a2a24); break;
    case 'palm': { const a1 = worldToScreen(x + 0.5, y + 0.5, 0), t = worldToScreen(x + 0.5, y + 0.5, 3); g.moveTo(a1.x, a1.y).lineTo(t.x + 3, t.y).stroke({ width: 3, color: 0x6a4a2a }); for (const [dx, dy] of [[-14, 4], [14, 3], [-8, -6], [9, -7], [0, -9]]) g.moveTo(t.x + 3, t.y).quadraticCurveTo(t.x + 3 + dx / 2, t.y + dy - 6, t.x + 3 + dx, t.y + dy).stroke({ width: 3, color: 0x2f8a4f }); break; }
    case 'billboard': { drawBox(g, x + 0.45, y + 0.45, 0.1, 0.1, 0, 2.5, 0x333340); const t = worldToScreen(x + 0.5, y + 0.5, 3.4); g.rect(t.x - 34, t.y - 14, 68, 24).fill(0x101018); lights.rect(t.x - 32, t.y - 12, 64, 20).fill({ color: c, alpha: 0.55 }); break; }
    case 'neonstrip': { const a1 = worldToScreen(x, y + 0.5, 0.2), b1 = worldToScreen(x + 1, y + 0.5, 0.2); lights.moveTo(a1.x, a1.y).lineTo(b1.x, b1.y).stroke({ width: 3, color: c, alpha: 0.9 }); break; }
    // ---- v0.6: mobiliario y mobiliario urbano que sirve de cobertura
    case 'column': drawBox(g, x + 0.2, y + 0.2, 0.6, 0.6, 0, 3.2, p.color ? c : 0x5a5a6e); drawBox(g, x + 0.12, y + 0.12, 0.76, 0.76, 3.0, 0.2, 0x6a6a80); { const s1 = worldToScreen(x + 0.8, y + 0.8, 1.6); lights.rect(s1.x - 1, s1.y - 30, 2, 40).fill({ color: 0x43f3ff, alpha: 0.18 }); } break;
    case 'sofa': drawBox(g, x, y + 0.2, 1, 0.65, 0, 0.35, c); drawBox(g, x, y + 0.7, 1, 0.18, 0.35, 0.4, shade(c, 0.8)); drawBox(g, x, y + 0.2, 0.15, 0.65, 0.35, 0.2, shade(c, 0.85)); drawBox(g, x + 0.85, y + 0.2, 0.15, 0.65, 0.35, 0.2, shade(c, 0.85)); break;
    case 'desk': drawBox(g, x, y + 0.15, 1, 0.7, 0, 0.6, 0x3a3a46); { const s1 = worldToScreen(x + 0.5, y + 0.45, 0.6); g.rect(s1.x - 7, s1.y - 12, 14, 9).fill(0x101018); g.rect(s1.x - 6, s1.y - 11, 12, 7).fill(0x2a6aa8); lights.rect(s1.x - 8, s1.y - 13, 16, 11).fill({ color: 0x43a8ff, alpha: 0.2 }); } break;
    case 'locker': drawBox(g, x + 0.1, y + 0.25, 0.8, 0.5, 0, 2.0, c === 0x8888aa ? 0x4a5a6a : c); { const s1 = worldToScreen(x + 0.5, y + 0.75, 1.0); g.rect(s1.x - 0.5, s1.y - 18, 1, 26).fill(0x2a3440); g.rect(s1.x - 8, s1.y - 14, 4, 1).fill(0x9aa8b8); g.rect(s1.x + 4, s1.y - 14, 4, 1).fill(0x9aa8b8); } break;
    case 'fridge': drawBox(g, x + 0.15, y + 0.2, 0.7, 0.6, 0, 2.0, 0xd8dce8); { const s1 = worldToScreen(x + 0.5, y + 0.8, 1.2); g.rect(s1.x + 4, s1.y - 12, 1.4, 8).fill(0x6a6a7a); } break;
    case 'planter': drawBox(g, x + 0.05, y + 0.05, 0.9, 0.9, 0, 0.5, 0x4a4a58); { const s1 = worldToScreen(x + 0.5, y + 0.5, 0.6); g.circle(s1.x - 6, s1.y, 8).fill(0x2f6b4f); g.circle(s1.x + 5, s1.y - 3, 9).fill(0x3d8a62); g.circle(s1.x, s1.y - 9, 7).fill(0x2f7b55); } break;
    case 'arcade': drawBox(g, x + 0.15, y + 0.2, 0.7, 0.6, 0, 1.9, 0x1a1a2a); { const s1 = worldToScreen(x + 0.5, y + 0.8, 1.2); g.rect(s1.x - 7, s1.y - 12, 14, 10).fill(c); lights.rect(s1.x - 10, s1.y - 15, 20, 16).fill({ color: c, alpha: 0.3 }); } break;
    case 'barrel': {
      drawBox(g, x + 0.25, y + 0.25, 0.5, 0.5, 0, 0.95, p.text === 'fuego' ? 0x3a3a40 : c === 0x8888aa ? 0x2a6a8a : c);
      if (p.text === 'fuego') { const s1 = worldToScreen(x + 0.5, y + 0.5, 1.0); g.poly([s1.x - 6, s1.y, s1.x - 2, s1.y - 14, s1.x + 1, s1.y - 6, s1.x + 4, s1.y - 16, s1.x + 7, s1.y]).fill(0xff8a20); g.poly([s1.x - 3, s1.y, s1.x, s1.y - 9, s1.x + 3, s1.y]).fill(0xffe060); lights.circle(s1.x, s1.y - 4, 46).fill({ color: 0xff6a20, alpha: 0.22 }); lights.circle(s1.x, s1.y - 6, 16).fill({ color: 0xffb040, alpha: 0.35 }); }
      break;
    }
    case 'dumpster': drawBox(g, x - 0.2, y + 0.1, 1.4, 0.8, 0, 1.0, 0x2a5a4a); drawBox(g, x - 0.2, y + 0.1, 1.4, 0.8, 1.0, 0.08, 0x1f4538); break;
    case 'hydrant': drawBox(g, x + 0.38, y + 0.38, 0.24, 0.24, 0, 0.55, 0xc82020); drawBox(g, x + 0.33, y + 0.33, 0.34, 0.34, 0.55, 0.1, 0xa01818); break;
    case 'kiosk': drawBox(g, x + 0.05, y + 0.05, 0.9, 0.9, 0, 1.9, 0x2a2a3a); drawBox(g, x - 0.05, y - 0.05, 1.1, 1.1, 1.9, 0.15, c); { const s1 = worldToScreen(x + 0.5, y + 0.95, 1.1); g.rect(s1.x - 10, s1.y - 10, 20, 9).fill(0xffd23f); lights.rect(s1.x - 12, s1.y - 12, 24, 13).fill({ color: 0xffd23f, alpha: 0.2 }); } break;
    case 'jersey': drawBox(g, x, y + 0.3, 1, 0.4, 0, 0.75, 0xa8a8b0); { const a1 = worldToScreen(x, y + 0.7, 0.5), b1 = worldToScreen(x + 1, y + 0.7, 0.5); g.moveTo(a1.x, a1.y).lineTo(b1.x, b1.y).stroke({ width: 3, color: 0xd82020, alpha: 0.85 }); } break;
    // ---- v0.8: decorado del ciberespacio
    case 'monolith': drawBox(g, x + 0.2, y + 0.2, 0.6, 0.6, 0, 4.5, 0x06101c); { const t = worldToScreen(x + 0.5, y + 0.8, 2.5); g.rect(t.x - 1, t.y - 60, 2, 70).fill({ color: c, alpha: 0.9 }); lights.rect(t.x - 10, t.y - 70, 20, 90).fill({ color: c, alpha: 0.18 }); for (let i = 0; i < 5; i++) g.rect(t.x - 8 + i * 3, t.y - 40 + ((i * 13) % 30), 2, 4).fill({ color: c, alpha: 0.7 }); } break;
    case 'datastream': { const a = worldToScreen(x + 0.5, y + 0.5, 0), t = worldToScreen(x + 0.5, y + 0.5, 7); lights.moveTo(a.x, a.y).lineTo(t.x, t.y).stroke({ width: 6, color: c, alpha: 0.18 }); lights.moveTo(a.x, a.y).lineTo(t.x, t.y).stroke({ width: 1.5, color: c, alpha: 0.7 }); for (let i = 0; i < 6; i++) { const q = worldToScreen(x + 0.5, y + 0.5, 1 + i); lights.rect(q.x - 2, q.y, 4, 3).fill({ color: 0xffffff, alpha: 0.6 }); } break; }
    case 'glitch': { const s0 = worldToScreen(x + 0.5, y + 0.5, 0.2); for (let i = 0; i < 4; i++) g.rect(s0.x - 18 + i * 9, s0.y - 6 + ((i * 7) % 10), 6 + (i % 3) * 5, 3).fill({ color: i % 2 ? c : 0xffffff, alpha: 0.55 }); break; }
    case 'node': drawBox(g, x + 0.25, y + 0.25, 0.5, 0.5, 0, 0.4, 0x0a1a2a); { const s0 = worldToScreen(x + 0.5, y + 0.5, 1.2); g.poly([s0.x, s0.y - 12, s0.x + 9, s0.y, s0.x, s0.y + 12, s0.x - 9, s0.y]).fill({ color: c, alpha: 0.7 }); lights.circle(s0.x, s0.y, 22).fill({ color: c, alpha: 0.2 }); } break;
    case 'codewall': drawBox(g, x, y + 0.4, 1, 0.2, 0, 2.6, 0x031a0c); { for (let i = 0; i < 6; i++) { const q = worldToScreen(x + 0.15 + (i % 3) * 0.3, y + 0.6, 0.4 + Math.floor(i / 3) * 1.1); g.rect(q.x - 3, q.y - 6, 6, 4).fill({ color: c, alpha: 0.8 }); } } break;
    // v0.9 · Abismo bajo las pasarelas: luces de la ciudad muy abajo y estelas de coches.
    case 'citylights': { const s0 = worldToScreen(x + 0.5, y + 0.5, -2.5); const r = seededRng(hashString(`${x},${y}`)); for (let i = 0; i < 5; i++) lights.rect(s0.x - 22 + r() * 44, s0.y - 8 + r() * 18, 1.5 + r() * 2, 1.5).fill({ color: r() < 0.5 ? c : 0xfff1c0, alpha: 0.35 + r() * 0.4 }); if (r() < 0.3) lights.moveTo(s0.x - 20, s0.y + 6).lineTo(s0.x + 20, s0.y - 4).stroke({ width: 1, color: 0xff3040, alpha: 0.35 }); break; }
    case 'busstop': drawBox(g, x, y + 0.6, 1, 0.08, 0, 1.8, 0x6a7a8a, 0.55); drawBox(g, x - 0.05, y + 0.1, 1.1, 0.6, 1.8, 0.1, 0x3a4a5a); drawBox(g, x + 0.1, y + 0.35, 0.8, 0.25, 0, 0.4, 0x4a4a5a); { const s1 = worldToScreen(x + 0.5, y + 0.65, 1.1); lights.rect(s1.x - 12, s1.y - 10, 24, 16).fill({ color: 0x43a8ff, alpha: 0.25 }); } break;
  }
}

// v0.9 · El personaje vive en character.ts (más detalle, tejidos y tatuajes de alta resolución).
export { makeCharacter, type CharParts } from './character';

/** Vehículo de un jugador al volante: caja isométrica con cabina, faros y neón por debajo. */
export function makeVehicle(cls: string, color: string, accentHex = '#43f3ff'): Container {
  const root = new Container();
  const g = new Graphics();
  const col = HEX(color), acc = HEX(accentHex);
  const moto = cls === 'moto';
  const [L, W, H] = moto ? [1.2, 0.4, 0.35] : cls === 'utilitario' || cls === 'blindado' ? [2.0, 0.95, 0.75] : cls === 'todoterreno' ? [1.8, 0.95, 0.65] : cls === 'hiper' || cls === 'deportivo' ? [1.9, 0.9, 0.38] : cls === 'lujo' ? [2.1, 0.9, 0.5] : [1.6, 0.85, 0.5];
  const under = new Graphics();
  const c0 = worldToScreen(-L / 2, -W / 2), c1 = worldToScreen(L / 2, -W / 2), c2 = worldToScreen(L / 2, W / 2), c3 = worldToScreen(-L / 2, W / 2);
  under.poly([c0.x, c0.y, c1.x, c1.y, c2.x, c2.y, c3.x, c3.y]).fill({ color: acc, alpha: 0.35 });
  root.addChild(under);
  drawBox(g, -L / 2, -W / 2, L, W, 0.12, H, col);
  if (!moto) drawBox(g, -L * 0.18, -W * 0.4, L * 0.45, W * 0.8, 0.12 + H, H * 0.55, shade(col, cls === 'blindado' ? 0.7 : 0.45));
  else drawBox(g, -0.1, -0.12, 0.3, 0.24, 0.47, 0.35, 0x202028);
  const head = worldToScreen(L / 2, 0, 0.3), tail = worldToScreen(-L / 2, 0, 0.3);
  g.circle(head.x, head.y, moto ? 2 : 3).fill(0xfff1c0);
  g.circle(tail.x, tail.y, moto ? 1.6 : 2.4).fill(0xff3040);
  root.addChild(g);
  return root;
}

let glowTex: Texture | null = null;
export function glowTexture(): Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  glowTex = Texture.from(c);
  return glowTex;
}

/** Arma en la mano: las de fuego apuntan hacia delante (+x) con la empuñadura en el origen; las de cuerpo a cuerpo, hacia arriba (−y). */
export function makeWeapon(id: string, family: string, kind: string, accentHex = '#43f3ff'): Graphics | null {
  const g = new Graphics();
  const ac = HEX(accentHex), gun = 0x1c1e26, gun2 = 0x343844, steel = 0xc8d0dc, wood = 0x6a4a30;
  const plasma = /plasma|termica|electrica|pulsos|riel|sonico|emp/.test(id);
  const glow = plasma ? (id.includes('termica') || id.includes('plasma') ? 0xff6a20 : 0x43c8ff) : ac;
  if (kind === 'ranged') {
    switch (family) {
      case 'Pistola': case 'Revólver': case 'Táser':
        g.roundRect(-1, -0.5, 2.4, 4.2, 0.6).fill(gun2);
        g.roundRect(-1.2, -2.4, family === 'Revólver' ? 9 : 7.5, 2.6, 0.6).fill(family === 'Táser' ? 0xffd23f : gun);
        if (family === 'Revólver') g.circle(1.6, -1.2, 1.6).fill(gun2);
        if (id.includes('silenciada')) g.roundRect(6, -2.1, 4.5, 2, 0.8).fill(gun2);
        g.rect(4.5, -2.2, 2, 0.6).fill({ color: glow, alpha: 0.85 });
        break;
      case 'Subfusil':
        g.roundRect(-1, -0.5, 2.2, 4, 0.6).fill(gun2); g.rect(2.5, 0, 1.8, 4.5).fill(gun);
        g.roundRect(-3, -2.6, 13, 3, 0.8).fill(gun); g.rect(10, -2, 2.5, 1.4).fill(gun2); g.rect(2, -3.4, 4, 0.8).fill({ color: glow, alpha: 0.8 });
        break;
      case 'Rifle':
        g.roundRect(-6, -2.2, 6, 3.2, 1).fill(id.includes('dardos') ? wood : gun2);
        g.roundRect(-1, -0.4, 2, 3.6, 0.6).fill(gun2);
        g.roundRect(0, -2.8, 15, 3, 0.8).fill(gun); g.rect(15, -2, 6, 1.2).fill(gun2);
        if (id.includes('precision') || id.includes('francotirador')) { g.roundRect(3, -5.4, 7, 2, 0.8).fill(gun2); g.circle(10, -4.4, 0.9).fill({ color: glow, alpha: 0.9 }); }
        g.rect(5, -2.4, 6, 0.6).fill({ color: glow, alpha: 0.8 });
        break;
      case 'Escopeta':
        g.roundRect(-6, -2, 6, 3.4, 1).fill(wood); g.roundRect(-1, -0.2, 2, 3.4, 0.6).fill(gun2);
        g.roundRect(0, -3, 16, 3.6, 1).fill(gun); g.roundRect(5, 0.4, 7, 1.8, 0.8).fill(wood);
        if (id.includes('tecnologica')) g.rect(2, -3.4, 10, 0.6).fill({ color: glow, alpha: 0.85 });
        break;
      case 'Ametralladora':
        g.roundRect(-5, -3, 9, 6, 1.5).fill(gun2); for (let i = 0; i < 3; i++) g.rect(4, -2.4 + i * 1.8, 13, 1).fill(gun);
        g.circle(4, 0, 3.2).stroke({ width: 1, color: steel });
        break;
      case 'Arco':
        g.roundRect(-1, -1.2, 12, 2, 0.6).fill(gun); g.moveTo(9, -6).quadraticCurveTo(12, 0, 9, 6).stroke({ width: 1.4, color: gun2 });
        g.moveTo(9, -6).lineTo(9, 6).stroke({ width: 0.5, color: steel }); g.rect(1, -1.8, 12, 0.6).fill(steel);
        break;
      case 'Especial':
        g.roundRect(-4, -3.2, 18, 5.6, 2).fill(gun); g.circle(14, -0.4, 2.6).fill(gun2); g.circle(14, -0.4, 1.4).fill({ color: glow, alpha: 0.9 });
        break;
      default: return null; // cañón de antebrazo: el propio brazo es el arma
    }
    return g;
  }
  switch (family) {
    case 'Cuchillo': g.rect(-0.8, -1, 1.6, 3).fill(gun2); g.poly([-0.8, -1, 0.8, -1, 0.4, -7, -0.6, -6]).fill(steel); break;
    case 'Hoja': {
      const len = id.includes('lanza') ? 26 : id.includes('machete') ? 14 : id.includes('hacha') ? 16 : 20;
      g.rect(-0.8, -1, 1.6, 4.5).fill(id.includes('katana') ? 0x2a1a1a : gun2);
      if (id.includes('lanza')) { g.rect(-0.6, -len, 1.2, len).fill(gun2); g.poly([-1.6, -len, 1.6, -len, 0, -len - 5]).fill(glow); }
      else if (id.includes('hacha')) { g.rect(-0.6, -len, 1.2, len).fill(gun2); g.poly([0, -len, 6, -len - 2, 6, -len + 6, 0, -len + 4]).fill(glow); }
      else { g.rect(-2.2, -1.6, 4.4, 0.8).fill(steel); g.poly([-1, -1.6, 1, -1.6, 0.9, -len, -0.2, -len - 1.6, -1, -len + 1]).fill(plasma || id.includes('monofilamento') ? glow : steel); }
      break;
    }
    case 'Contundente':
      if (id === 'bate') g.poly([-0.8, 2, 0.8, 2, 1.8, -14, -1.8, -14]).fill(wood);
      else if (id === 'nunchakus') { g.roundRect(-0.9, -6, 1.8, 6, 0.8).fill(gun2); g.roundRect(1, -11, 1.8, 6, 0.8).fill(gun2); g.moveTo(0, -6).lineTo(1.9, -5).stroke({ width: 0.4, color: steel }); }
      else if (id === 'martillo-neumatico') { g.rect(-0.7, -12, 1.4, 14).fill(gun2); g.roundRect(-3.5, -16, 7, 5, 1).fill(gun); g.rect(-3.5, -14, 7, 0.8).fill({ color: glow, alpha: 0.9 }); }
      else { g.roundRect(-1, -11, 2, 13, 0.8).fill(gun); g.rect(-0.6, -10, 1.2, 6).fill({ color: id.includes('electrica') || id.includes('aturdidora') ? 0x43c8ff : gun2, alpha: 0.9 }); }
      break;
    case 'Puños': g.roundRect(-1.6, -1.6, 3.6, 3.2, 1).fill(steel); g.circle(0.2, 0, 0.7).fill({ color: 0x43c8ff, alpha: 0.9 }); break;
    case 'Implante':
      if (id.includes('cuchillas')) { g.poly([-0.6, -1, 0.6, -1, 0.3, -12, -0.4, -11]).fill(0xd8e0ec); g.poly([1, 0, 2, 0, 2, -10, 1.4, -9]).fill(0xd8e0ec); }
      else if (id.includes('latigo')) g.moveTo(0, 0).quadraticCurveTo(8, -6, 14, 2).stroke({ width: 0.8, color: glow });
      else if (id.includes('garras')) for (const dx of [-1.2, 0, 1.2]) g.poly([dx - 0.3, 0, dx + 0.3, 0, dx, -4]).fill(steel);
      else return null;
      break;
    default: return null;
  }
  return g;
}

/** Miembro cortado en el suelo (brazo o pierna) con su charco de sangre. */
export function makeSevered(part: string, skinHex: string): Container {
  const c = new Container();
  const g = new Graphics();
  g.ellipse(0, 0, 9, 4).fill({ color: 0x5a0408, alpha: 0.85 });
  const skin = HEX(skinHex);
  const isLeg = part.startsWith('pierna');
  g.roundRect(-6, -2.5, isLeg ? 13 : 9, isLeg ? 4.4 : 3.4, 1.6).fill(isLeg ? 0x1a1a24 : skin);
  g.ellipse(-6, -0.4, 1.4, 2).fill(0xa01018);
  if (isLeg) g.roundRect(6, -3, 3.6, 5, 1).fill(0x101018);
  c.addChild(g);
  return c;
}
