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
  bridge: 0x4c4c5c, wood: 0x5c4232, tile: 0x585a72, metal: 0x46525c, crosswalk: 0x24242f, deck: 0x3e3a36, gravel: 0x4b4640, grass: 0x2f5a3a, sand: 0x8a7458,
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
      const a = worldToScreen(x + 0.5, y + 0.5, 0), t = worldToScreen(x + 0.5, y + 0.5, 2.6);
      g.moveTo(a.x, a.y).lineTo(t.x, t.y).stroke({ width: 3, color: 0x2a2a38 });
      g.circle(t.x, t.y, 4).fill(0xfff1c0);
      lights.circle(t.x, t.y, 10).fill({ color: 0xfff1c0, alpha: 0.35 });
      lights.ellipse(a.x, a.y, 46, 23).fill({ color: 0xffe9a0, alpha: 0.08 });
      break;
    }
    case 'crate': drawBox(g, x + 0.15, y + 0.15, 0.7, 0.7, 0, 0.6, 0x7a5b3a); break;
    case 'bench': drawBox(g, x + 0.1, y + 0.3, 0.8, 0.4, 0, 0.3, 0x5a5a6a); break;
    case 'table': drawBox(g, x + 0.15, y + 0.15, 0.7, 0.7, 0, 0.55, 0x3a2a24); break;
    case 'bed': drawBox(g, x, y + 0.1, 1, 0.8, 0, 0.4, 0xd8e0e8); { const s = worldToScreen(x + 0.5, y + 0.5, 0.5); lights.circle(s.x, s.y, 18).fill({ color: c, alpha: 0.15 }); } break;
    case 'plant': { drawBox(g, x + 0.3, y + 0.3, 0.4, 0.4, 0, 0.35, 0x4a4a5a); const s = worldToScreen(x + 0.5, y + 0.5, 0.8); g.circle(s.x, s.y, 10).fill(0x2f6b4f); g.circle(s.x + 4, s.y - 5, 7).fill(0x3d8a62); break; }
    case 'vending': drawBox(g, x + 0.15, y + 0.2, 0.7, 0.6, 0, 1.6, 0x2a2a3a); { const s = worldToScreen(x + 0.5, y + 0.8, 0.9); g.rect(s.x - 7, s.y - 14, 14, 20).fill(c); lights.rect(s.x - 10, s.y - 17, 20, 26).fill({ color: c, alpha: 0.2 }); } break;
    case 'car': {
      drawBox(g, x - 0.2, y + 0.1, 1.4, 0.8, 0.1, 0.4, c);
      drawBox(g, x + 0.1, y + 0.2, 0.8, 0.6, 0.5, 0.3, shade(c, 0.6));
      const hl = worldToScreen(x + 1.2, y + 0.5, 0.3); lights.circle(hl.x, hl.y, 8).fill({ color: 0xfff1c0, alpha: 0.4 });
      break;
    }
    case 'screen': case 'neon': { const s = worldToScreen(x + 0.5, y, 1.6); g.rect(s.x - 16, s.y - 10, 32, 18).fill(shade(c, 0.6)); lights.rect(s.x - 20, s.y - 14, 40, 26).fill({ color: c, alpha: 0.3 }); break; }
    case 'pipe': drawBox(g, x + 0.35, y + 0.35, 0.3, 0.3, 0, 1.2, 0x55606a); break;
    case 'shelf': drawBox(g, x + 0.05, y + 0.25, 0.9, 0.5, 0, 1.4, 0x4a4a5a); { const s1 = worldToScreen(x + 0.5, y + 0.75, 0.6); g.rect(s1.x - 12, s1.y - 4, 24, 3).fill(0xffd23f); g.rect(s1.x - 12, s1.y - 16, 24, 3).fill(0x43f3ff); } break;
    case 'trash': drawBox(g, x + 0.2, y + 0.2, 0.6, 0.6, 0, 0.7, 0x2f5a3a); break;
    case 'antenna': case 'holo': break;
    case 'tent': { const p1 = worldToScreen(x, y + 1), p2 = worldToScreen(x + 1, y + 1), p3 = worldToScreen(x + 1, y), top = worldToScreen(x + 0.5, y + 0.5, 1.1); g.poly([p1.x, p1.y, p2.x, p2.y, top.x, top.y]).fill(shade(c, 0.8)); g.poly([p2.x, p2.y, p3.x, p3.y, top.x, top.y]).fill(c); break; }
    case 'smokestack': drawBox(g, x + 0.2, y + 0.2, 0.6, 0.6, 0, 6, 0x5a4a40); { const t = worldToScreen(x + 0.5, y + 0.5, 6.2); lights.circle(t.x, t.y, 6).fill({ color: 0xff8a3d, alpha: 0.35 }); g.circle(t.x, t.y - 10, 9).fill({ color: 0x8a8a8a, alpha: 0.25 }); g.circle(t.x + 6, t.y - 20, 12).fill({ color: 0x8a8a8a, alpha: 0.18 }); } break;
    case 'wreck': drawBox(g, x - 0.1, y + 0.15, 1.2, 0.7, 0, 0.45, 0x5a4a3a); drawBox(g, x + 0.2, y + 0.25, 0.6, 0.5, 0.45, 0.25, 0x3a2a24); break;
    case 'palm': { const a1 = worldToScreen(x + 0.5, y + 0.5, 0), t = worldToScreen(x + 0.5, y + 0.5, 3); g.moveTo(a1.x, a1.y).lineTo(t.x + 3, t.y).stroke({ width: 3, color: 0x6a4a2a }); for (const [dx, dy] of [[-14, 4], [14, 3], [-8, -6], [9, -7], [0, -9]]) g.moveTo(t.x + 3, t.y).quadraticCurveTo(t.x + 3 + dx / 2, t.y + dy - 6, t.x + 3 + dx, t.y + dy).stroke({ width: 3, color: 0x2f8a4f }); break; }
    case 'billboard': { drawBox(g, x + 0.45, y + 0.45, 0.1, 0.1, 0, 2.5, 0x333340); const t = worldToScreen(x + 0.5, y + 0.5, 3.4); g.rect(t.x - 34, t.y - 14, 68, 24).fill(0x101018); lights.rect(t.x - 32, t.y - 12, 64, 20).fill({ color: c, alpha: 0.55 }); break; }
    case 'neonstrip': { const a1 = worldToScreen(x, y + 0.5, 0.2), b1 = worldToScreen(x + 1, y + 0.5, 0.2); lights.moveTo(a1.x, a1.y).lineTo(b1.x, b1.y).stroke({ width: 3, color: c, alpha: 0.9 }); break; }
  }
}

/** Personaje: sombra, piernas, chaqueta, franja de rol, cabeza, pelo y visor. Capas en lugar de variantes completas. */
/** Personaje por partes (cabeza, torso, brazos y piernas izquierdos y derechos) con capas de ropa, rasgos y cromo visible. */
export function makeCharacter(ap: Appearance | undefined, kind: string, chrome: string[] = []): { root: Container; legs: Container; body: Container; visor: Graphics } {
  const a = { skin: '#c89070', hair: '#222222', jacket: '#40506a', accent: '#43f3ff', eyes: '#3a2a1a', pants: '#1a1a24', build: 'medio', hairStyle: 'corto', top: 'chaqueta', facial: 'ninguno', accessory: 'ninguno', tattoo: '', ...(ap ?? {}) } as Required<Appearance>;
  const cr = new Set(chrome);
  const bf = a.build === 'delgado' ? 0.85 : a.build === 'robusto' ? 1.2 : 1;
  const skin = HEX(a.skin), hair = HEX(a.hair), jacket = HEX(a.jacket), accent = HEX(a.accent), pants = HEX(a.pants), eyes = HEX(a.eyes);
  const metal = 0xa8b0c0, metalDark = 0x5a6070;
  const root = new Container();
  if (kind === 'player') root.addChild(new Graphics().ellipse(0, 0, 14, 7).stroke({ width: 1.5, color: accent, alpha: 0.85 }));
  root.addChild(new Graphics().ellipse(0, 0, 12 * bf, 6).fill({ color: 0x000000, alpha: 0.4 }));
  // ---- Piernas
  const legs = new Container();
  const leg = (side: -1 | 1) => {
    const g = new Graphics();
    const x = side * 3.2 * bf - 2.4 * bf, w = 4.8 * bf;
    const isChrome = cr.has(side < 0 ? 'pierna_izq' : 'pierna_der');
    if (isChrome) {
      g.roundRect(x, -19, w, 18, 1.5).fill(metal);
      g.rect(x, -11, w, 1.2).fill(metalDark); g.circle(x + w / 2, -10.5, 1.6).fill(accent);
      g.rect(x + w - 1.2, -18, 1.2, 15).fill({ color: accent, alpha: 0.6 });
    } else g.roundRect(x, -19, w, 18, 1.5).fill(pants);
    g.roundRect(x - 0.6, -2.5, w + 1.6, 3.2, 1).fill(0x101018);
    return g;
  };
  const legL = leg(-1), legR = leg(1);
  legs.addChild(legL, legR);
  // ---- Torso, brazos y cabeza
  const body = new Container();
  const tw = 16 * bf, tx = -tw / 2;
  const arm = (side: -1 | 1) => {
    const g = new Graphics();
    const x = side < 0 ? tx - 3.4 : tx + tw - 0.6;
    const isChrome = cr.has(side < 0 ? 'brazo_izq' : 'brazo_der');
    const sleeveless = a.top === 'top' || a.top === 'chaleco';
    if (isChrome) {
      g.roundRect(x, -36, 4, 16, 1.5).fill(metal);
      g.rect(x, -28, 4, 1).fill(metalDark); g.circle(x + 2, -28, 1.4).fill(accent);
      g.rect(x + 1.4, -35, 1, 13).fill({ color: accent, alpha: 0.55 });
      g.roundRect(x - 0.3, -21, 4.6, 4, 1.5).fill(metalDark);
    } else {
      g.roundRect(x, -36, 4, 16, 1.5).fill(sleeveless ? skin : shade(jacket, side < 0 ? 0.8 : 0.95));
      if (a.tattoo && sleeveless) g.moveTo(x + 2, -34).lineTo(x + 2, -24).stroke({ width: 1.2, color: HEX(a.tattoo), alpha: 0.9 });
      g.roundRect(x, -21, 4, 3.6, 1.5).fill(skin);
    }
    return g;
  };
  const armBack = arm(-1), armFront = arm(1);
  const torso = new Graphics();
  const top = a.top;
  if (top === 'gabardina') torso.roundRect(tx - 1, -37, tw + 2, 30, 3).fill(shade(jacket, 0.9));
  torso.roundRect(tx, -37, tw, 19, 4).fill(top === 'top' ? shade(accent, 0.45) : jacket);
  if (top === 'top') torso.rect(tx + 1, -24, tw - 2, 5).fill(skin);
  if (top === 'chaqueta' || top === 'gabardina') { torso.poly([0, -36, -3, -30, 0, -25]).fill(shade(jacket, 0.7)); torso.poly([0, -36, 3, -30, 0, -25]).fill(shade(jacket, 0.8)); torso.rect(tx, -27, tw, 2).fill(accent); }
  if (top === 'chaleco') { torso.rect(-1, -37, 2, 19).fill(shade(jacket, 0.6)); torso.rect(tx + 2, -28, 4, 3).fill(shade(jacket, 0.7)); torso.rect(tx + tw - 6, -28, 4, 3).fill(shade(jacket, 0.7)); }
  if (top === 'sudadera') { torso.roundRect(tx + 3, -26, tw - 6, 5, 2).fill(shade(jacket, 0.8)); torso.moveTo(-2, -36).lineTo(-2, -31).moveTo(2, -36).lineTo(2, -31).stroke({ width: 0.8, color: accent }); }
  if (top === 'traje') { torso.poly([-3, -37, 0, -33, 3, -37]).fill(0xe8e8f0); torso.rect(-0.8, -34, 1.6, 9).fill(accent); }
  if (top === 'mono') { torso.rect(tx, -22, tw, 2).fill(0x2a2a2a); torso.rect(tx + 3, -34, 3, 3).fill(shade(jacket, 0.75)); }
  if (cr.has('torso')) { torso.moveTo(tx + 3, -33).lineTo(tx + tw - 3, -33).moveTo(tx + 4, -30).lineTo(tx + tw - 4, -30).stroke({ width: 1, color: accent, alpha: 0.8 }); torso.circle(0, -31, 1.6).fill(accent); }
  // ---- Cabeza
  const head = new Graphics();
  if (a.accessory === 'capucha' || top === 'sudadera') head.ellipse(0, -44, 8.5, 9).fill(shade(jacket, 0.85));
  head.rect(-2, -39.5, 4, 3).fill(shade(skin, 0.9));
  head.roundRect(-6, -52, 12, 13, 5).fill(skin);
  head.ellipse(-6, -45, 1.4, 2).fill(shade(skin, 0.85));
  // Cejas, ojos, nariz y boca (vista de tres cuartos mirando a la derecha).
  head.rect(-1.5, -48.6, 3, 0.9).fill(shade(hair, 0.9)); head.rect(3, -48.6, 2.6, 0.9).fill(shade(hair, 0.9));
  const eyeCol = cr.has('ojos') ? accent : eyes;
  for (const ex of [0, 4.3]) { head.rect(ex - 1.1, -47, 2.4, 1.8).fill(0xf4f4f4); head.rect(ex - 0.2, -47, 1.2, 1.8).fill(eyeCol); }
  if (cr.has('ojos')) head.rect(-1.6, -47.4, 7.6, 2.4).fill({ color: accent, alpha: 0.25 });
  head.moveTo(5.8, -46).lineTo(6.6, -43.5).lineTo(5.4, -43.2).stroke({ width: 0.8, color: shade(skin, 0.7) });
  head.moveTo(1.5, -41.6).lineTo(4.6, -41.8).stroke({ width: 0.9, color: shade(skin, 0.55) });
  if (a.facial === 'barba') head.poly([-5, -44, -4, -39.5, 0, -38, 4, -39.5, 6, -43, 5.5, -41, 1, -40.5, -2, -41]).fill(hair);
  if (a.facial === 'bigote') head.rect(1, -42.8, 4.6, 1.3).fill(hair);
  if (a.facial === 'perilla') head.rect(2, -40.5, 2.4, 2.2).fill(hair);
  if (a.tattoo) head.moveTo(-5.5, -46).lineTo(-3.5, -42).stroke({ width: 1, color: HEX(a.tattoo), alpha: 0.85 });
  if (cr.has('cabeza')) { head.roundRect(-6.2, -49, 3, 5, 1).fill(metal); head.circle(-4.7, -46.5, 1).fill(accent); }
  // Peinados.
  const hs = a.hairStyle;
  if (hs !== 'calvo' && hs !== 'rapado') head.roundRect(-6.5, -53.5, 13, 5, 3).fill(hair);
  if (hs === 'rapado') head.roundRect(-6, -52.4, 12, 3, 2).fill({ color: hair, alpha: 0.55 });
  if (hs === 'cresta') head.poly([-3, -52, -1, -59, 1, -58.5, 3, -60, 4, -52]).fill(hair);
  if (hs === 'largo') head.roundRect(-7, -52, 4, 15, 2).fill(hair);
  if (hs === 'coleta') { head.roundRect(-9, -50, 4, 3, 1.5).fill(hair); head.roundRect(-10.5, -48, 3, 9, 1.5).fill(hair); }
  if (hs === 'afro') head.circle(-0.5, -51, 8.5).fill(hair);
  if (hs === 'moño') head.circle(-3.5, -55, 3.4).fill(hair);
  if (hs === 'rastas') for (let i = -6; i <= -2; i += 2) head.roundRect(i, -50, 1.6, 12, 0.8).fill(hair);
  if (hs === 'asimetrico') head.poly([-6.5, -53, 6.5, -53, 6.5, -46, 3, -49]).fill(hair);
  // Accesorios.
  const acc = a.accessory;
  const visor = new Graphics();
  if (acc === 'gafas') { visor.roundRect(-1.8, -47.6, 3.4, 2.4, 0.8).fill(0x101018); visor.roundRect(3, -47.6, 3.2, 2.4, 0.8).fill(0x101018); visor.rect(1.6, -46.8, 1.4, 0.7).fill(0x101018); }
  if (acc === 'visor') { visor.roundRect(-2, -48, 9, 3, 1).fill({ color: accent, alpha: 0.85 }); }
  if (acc === 'mascara') visor.roundRect(-1, -43.5, 7.5, 4.5, 1.5).fill(0x202028);
  if (acc === 'gorra') { visor.roundRect(-6.5, -55, 13, 5, 2.5).fill(shade(accent, 0.6)); visor.roundRect(3, -51.5, 7, 1.8, 0.8).fill(shade(accent, 0.5)); }
  if (acc === 'auriculares') { visor.roundRect(-7.4, -48, 2.6, 5, 1).fill(0x202028); visor.moveTo(-6, -48).quadraticCurveTo(0, -57, 5.8, -50).stroke({ width: 1.2, color: 0x303038 }); visor.circle(-6.1, -45.5, 0.8).fill(accent); }
  if (acc === 'capucha') head.roundRect(-7.5, -54.5, 15, 6, 3).fill(shade(jacket, 0.85));
  body.addChild(armBack, torso, head, visor, armFront);
  root.addChild(legs, body);
  return { root, legs, body, visor };
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
