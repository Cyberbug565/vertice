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
  bridge: 0x4c4c5c, wood: 0x5c4232, tile: 0x585a72, metal: 0x46525c, crosswalk: 0x24242f, deck: 0x3e3a36, gravel: 0x4b4640, grass: 0x2f5a3a, sand: 0x8a7458, alley: 0x15131c,
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
      // Farola alta con brazo y cono de luz en el suelo.
      const a = worldToScreen(x + 0.5, y + 0.5, 0), t = worldToScreen(x + 0.5, y + 0.5, 4.2), arm = worldToScreen(x + 1.1, y + 0.5, 4.1);
      g.moveTo(a.x, a.y).lineTo(t.x, t.y).stroke({ width: 4, color: 0x2a2a38 });
      g.moveTo(t.x, t.y).lineTo(arm.x, arm.y).stroke({ width: 3, color: 0x2a2a38 });
      g.roundRect(arm.x - 6, arm.y - 2, 12, 5, 2).fill(0xfff1c0);
      lights.circle(arm.x, arm.y, 14).fill({ color: 0xfff1c0, alpha: 0.4 });
      const fl = worldToScreen(x + 1.1, y + 0.5, 0);
      lights.ellipse(fl.x, fl.y, 70, 35).fill({ color: 0xff9a30, alpha: 0.16 });
      lights.ellipse(fl.x, fl.y, 36, 18).fill({ color: 0xffc060, alpha: 0.14 });
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
  }
}

/** Personaje por partes (cabeza, torso, brazos y piernas izquierdos y derechos) con capas de ropa, rasgos y cromo visible. */
export function makeCharacter(ap: Appearance | undefined, kind: string, chrome: string[] = []): { root: Container; legs: Container; body: Container; visor: Graphics } {
  const a = { skin: '#c89070', hair: '#222222', jacket: '#40506a', accent: '#43f3ff', eyes: '#3a2a1a', pants: '#1a1a24', build: 'medio', hairStyle: 'corto', top: 'chaqueta', facial: 'ninguno', accessory: 'ninguno', tattoo: '',
    faceShape: 'ovalada', brows: 'normales', makeup: 'ninguno', makeupColor: '#ff3fa4', piercing: 'ninguno', scar: 'ninguna', bodyTattoo: 'ninguno', shirt: '', shoes: '#101018',
    headwear: '', headColor: '', eyewear: '', legwear: 'pantalon', rarityGlow: '', ...(ap ?? {}) } as Required<Appearance>;
  const cr = new Set(chrome);
  const bf = a.build === 'delgado' ? 0.85 : a.build === 'robusto' ? 1.2 : 1;
  const skin = HEX(a.skin), hair = HEX(a.hair), jacket = HEX(a.jacket), accent = HEX(a.accent), pants = HEX(a.pants), eyes = HEX(a.eyes);
  const shirt = a.shirt ? HEX(a.shirt) : shade(jacket, 0.7), shoes = HEX(a.shoes || '#101018'), mk = HEX(a.makeupColor || '#ff3fa4');
  const tattooCol = a.tattoo ? HEX(a.tattoo) : 0x1a1a2a;
  const metal = 0xa8b0c0, metalDark = 0x5a6070;
  const root = new Container();
  if (kind === 'player') root.addChild(new Graphics().ellipse(0, 0, 14, 7).stroke({ width: 1.5, color: accent, alpha: 0.85 }));
  if (a.rarityGlow) root.addChild(new Graphics().ellipse(0, 0, 16, 8).stroke({ width: 1, color: HEX(a.rarityGlow), alpha: 0.6 }));
  root.addChild(new Graphics().ellipse(0, 0, 12 * bf, 6).fill({ color: 0x000000, alpha: 0.4 }));
  // ---- Piernas (pantalón, falda o pantalón corto) y calzado
  const legs = new Container();
  const lw = a.legwear || 'pantalon';
  const leg = (side: -1 | 1) => {
    const g = new Graphics();
    const x = side * 3.2 * bf - 2.4 * bf, w = 4.8 * bf;
    const isChrome = cr.has(side < 0 ? 'pierna_izq' : 'pierna_der');
    if (isChrome) {
      g.roundRect(x, -19, w, 18, 1.5).fill(metal);
      g.rect(x, -11, w, 1.2).fill(metalDark); g.circle(x + w / 2, -10.5, 1.6).fill(accent);
      g.rect(x + w - 1.2, -18, 1.2, 15).fill({ color: accent, alpha: 0.6 });
    } else if (lw === 'shorts' || lw === 'falda') {
      g.roundRect(x, -19, w, 18, 1.5).fill(skin);
      if (lw === 'shorts') g.roundRect(x - 0.2, -19, w + 0.4, 7, 1.5).fill(pants);
      if (a.bodyTattoo !== 'ninguno' && side > 0) g.moveTo(x + 1, -10).lineTo(x + w - 1, -7).stroke({ width: 0.9, color: tattooCol, alpha: 0.8 });
    } else {
      g.roundRect(x, -19, w, 18, 1.5).fill(pants);
      g.rect(x + w * 0.45, -18, 0.6, 15).fill({ color: shade(pants, 0.7), alpha: 0.7 });
    }
    g.roundRect(x - 0.6, -2.8, w + 1.8, 3.4, 1).fill(shoes);
    g.rect(x - 0.6, -0.4, w + 1.8, 0.8).fill(shade(shoes, 0.55));
    return g;
  };
  legs.addChild(leg(-1), leg(1));
  if (lw === 'falda') legs.addChild(new Graphics().poly([-6 * bf, -20, 6 * bf, -20, 8 * bf, -11, -8 * bf, -11]).fill(pants));
  // ---- Torso, brazos y cabeza
  const body = new Container();
  const tw = 16 * bf, tx = -tw / 2;
  const top = a.top;
  const sleeveless = top === 'top' || top === 'chaleco';
  const arm = (side: -1 | 1) => {
    const g = new Graphics();
    const x = side < 0 ? tx - 3.4 : tx + tw - 0.6;
    const isChrome = cr.has(side < 0 ? 'brazo_izq' : 'brazo_der');
    if (isChrome) {
      g.roundRect(x, -36, 4, 16, 1.5).fill(metal);
      g.rect(x, -28, 4, 1).fill(metalDark); g.circle(x + 2, -28, 1.4).fill(accent);
      g.rect(x + 1.4, -35, 1, 13).fill({ color: accent, alpha: 0.55 });
      g.roundRect(x - 0.3, -21, 4.6, 4, 1.5).fill(metalDark);
    } else {
      g.roundRect(x, -36, 4, 16, 1.5).fill(sleeveless ? skin : shade(jacket, side < 0 ? 0.8 : 0.95));
      if (top === 'gabardina') g.roundRect(x - 0.4, -36, 4.8, 15, 1.5).fill(shade(jacket, side < 0 ? 0.72 : 0.88));
      if (sleeveless && a.bodyTattoo !== 'ninguno') {
        const t = a.bodyTattoo;
        if (t === 'tribal') g.moveTo(x + 0.5, -34).lineTo(x + 3.5, -31).lineTo(x + 0.5, -28).lineTo(x + 3.5, -25).stroke({ width: 1, color: tattooCol, alpha: 0.9 });
        if (t === 'circuito') { g.moveTo(x + 2, -35).lineTo(x + 2, -29).lineTo(x + 3.4, -27).stroke({ width: 0.7, color: accent, alpha: 0.9 }); g.circle(x + 2, -29, 0.7).fill(accent); }
        if (t === 'floral') { g.circle(x + 2, -31, 1.4).fill({ color: 0xff6aa8, alpha: 0.85 }); g.circle(x + 1.6, -26, 1).fill({ color: 0x7dff7a, alpha: 0.7 }); }
        if (t === 'codigo') for (let yy = -35; yy < -23; yy += 2) g.rect(x + 0.8 + (yy % 4 ? 1 : 0), yy, 1.4, 0.6).fill({ color: 0x5affc8, alpha: 0.85 });
      } else if (a.tattoo && sleeveless) g.moveTo(x + 2, -34).lineTo(x + 2, -24).stroke({ width: 1.2, color: tattooCol, alpha: 0.9 });
      g.roundRect(x, -21, 4, 3.6, 1.5).fill(skin);
    }
    return g;
  };
  const armBack = arm(-1), armFront = arm(1);
  const torso = new Graphics();
  if (top === 'gabardina') torso.roundRect(tx - 1, -37, tw + 2, 30, 3).fill(shade(jacket, 0.9));
  torso.roundRect(tx, -37, tw, 19, 4).fill(top === 'top' ? shade(accent, 0.45) : jacket);
  if (top === 'top') { torso.roundRect(tx, -37, tw, 12, 4).fill(a.shirt ? shirt : shade(accent, 0.45)); torso.rect(tx + 1, -25, tw - 2, 6).fill(skin); }
  if (top === 'chaqueta' || top === 'gabardina') {
    // Cuello abierto: se ve la camiseta de debajo.
    torso.poly([-3.4, -37, 3.4, -37, 0, -26]).fill(shirt);
    torso.poly([0, -37, -3.5, -30, 0, -24]).fill(shade(jacket, 0.7)); torso.poly([0, -37, 3.5, -30, 0, -24]).fill(shade(jacket, 0.8));
    torso.rect(tx, -27, tw, 2).fill(accent);
    torso.rect(tx + tw - 5, -33, 3, 2).fill(shade(jacket, 0.6));
  }
  if (top === 'chaleco') { torso.rect(-1, -37, 2, 19).fill(shade(jacket, 0.6)); torso.rect(tx + 2, -28, 4, 3).fill(shade(jacket, 0.7)); torso.rect(tx + tw - 6, -28, 4, 3).fill(shade(jacket, 0.7)); torso.poly([-2.5, -37, 2.5, -37, 0, -33]).fill(shirt); }
  if (top === 'sudadera') { torso.roundRect(tx + 3, -26, tw - 6, 5, 2).fill(shade(jacket, 0.8)); torso.moveTo(-2, -36).lineTo(-2, -31).moveTo(2, -36).lineTo(2, -31).stroke({ width: 0.8, color: accent }); }
  if (top === 'traje') { torso.poly([-3, -37, 0, -32, 3, -37]).fill(a.shirt ? shirt : 0xe8e8f0); torso.rect(-0.8, -34, 1.6, 9).fill(accent); torso.poly([-3, -37, -5, -30, -1, -28]).fill(shade(jacket, 0.75)); torso.poly([3, -37, 5, -30, 1, -28]).fill(shade(jacket, 0.85)); }
  if (top === 'mono') { torso.rect(tx, -22, tw, 2).fill(0x2a2a2a); torso.rect(tx + 3, -34, 3, 3).fill(shade(jacket, 0.75)); }
  if (cr.has('torso')) { torso.moveTo(tx + 3, -33).lineTo(tx + tw - 3, -33).moveTo(tx + 4, -30).lineTo(tx + tw - 4, -30).stroke({ width: 1, color: accent, alpha: 0.8 }); torso.circle(0, -31, 1.6).fill(accent); }
  // ---- Cabeza
  const head = new Graphics();
  const hw = a.headwear, ew = a.eyewear;
  const hood = hw === 'capucha' || (!hw && (a.accessory === 'capucha' || top === 'sudadera'));
  if (hood) head.ellipse(0, -44, 8.5, 9).fill(hw === 'capucha' && a.headColor ? HEX(a.headColor) : shade(jacket, 0.85));
  head.rect(-2, -39.5, 4, 3).fill(shade(skin, 0.9));
  const fs = a.faceShape;
  const [fw, fh, fr, fy] = fs === 'angulosa' ? [12, 13, 2, -52] : fs === 'redonda' ? [13, 12.5, 6, -51.5] : fs === 'alargada' ? [11, 14.5, 4, -53] : [12, 13, 5, -52];
  head.roundRect(-fw / 2, fy, fw, fh, fr).fill(skin);
  if (fs === 'angulosa') head.poly([-6, -42, -3, -38.6, 4, -38.6, 6, -42]).fill(shade(skin, 0.92));
  head.ellipse(-fw / 2, -45, 1.4, 2).fill(shade(skin, 0.85));
  // Cejas, ojos, nariz y boca (vista de tres cuartos mirando a la derecha).
  const browC = shade(hair, 0.9);
  const bw = a.brows === 'finas' ? 0.5 : a.brows === 'gruesas' ? 1.4 : 0.9;
  if (a.brows === 'arqueadas') { head.moveTo(-1.6, -48).lineTo(0, -49.2).lineTo(1.5, -48.4).stroke({ width: 0.9, color: browC }); head.moveTo(3, -48.4).lineTo(4.4, -49.2).lineTo(5.6, -48).stroke({ width: 0.9, color: browC }); }
  else { head.rect(-1.5, -48.6, 3, bw).fill(browC); head.rect(3, -48.6, 2.6, bw).fill(browC); if (a.brows === 'cortadas') head.rect(4, -48.8, 0.6, 1.4).fill(skin); }
  const eyeCol = cr.has('ojos') ? accent : eyes;
  for (const ex of [0, 4.3]) { head.rect(ex - 1.1, -47, 2.4, 1.8).fill(0xf4f4f4); head.rect(ex - 0.2, -47, 1.2, 1.8).fill(eyeCol); }
  if (cr.has('ojos')) head.rect(-1.6, -47.4, 7.6, 2.4).fill({ color: accent, alpha: 0.25 });
  if (a.makeup === 'delineado') { head.moveTo(-1.4, -47.2).lineTo(1.6, -47.2).moveTo(3.1, -47.2).lineTo(6.2, -47.6).stroke({ width: 0.6, color: 0x101010 }); }
  if (a.makeup === 'neon') { head.rect(-1.4, -44.8, 3, 0.7).fill(mk); head.rect(3, -44.8, 3, 0.7).fill(mk); }
  if (a.makeup === 'pintura') head.rect(-fw / 2, -46, fw, 1.6).fill({ color: mk, alpha: 0.7 });
  head.moveTo(5.8, -46).lineTo(6.6, -43.5).lineTo(5.4, -43.2).stroke({ width: 0.8, color: shade(skin, 0.7) });
  head.moveTo(1.5, -41.6).lineTo(4.6, -41.8).stroke({ width: a.makeup === 'labios' ? 1.4 : 0.9, color: a.makeup === 'labios' ? mk : shade(skin, 0.55) });
  // Vello facial.
  const f = a.facial;
  if (f === 'barba') head.poly([-5, -44, -4, -39.5, 0, -38, 4, -39.5, 6, -43, 5.5, -41, 1, -40.5, -2, -41]).fill(hair);
  if (f === 'barba-larga') head.poly([-5, -44, -4, -37, 0, -34.5, 4, -37, 6, -43, 5.5, -41, 1, -40.5, -2, -41]).fill(hair);
  if (f === 'bigote' || f === 'candado') head.rect(1, -42.8, 4.6, 1.3).fill(hair);
  if (f === 'perilla' || f === 'candado') head.rect(2, -40.5, 2.4, 2.2).fill(hair);
  if (f === 'patillas') { head.rect(-5.6, -48, 1.6, 6).fill(hair); head.rect(4.8, -48, 1.2, 4).fill(hair); }
  // Cicatrices, tatuaje facial y piercings.
  if (a.scar === 'mejilla') head.moveTo(3, -45).lineTo(5.5, -42.5).stroke({ width: 0.8, color: shade(skin, 0.6) });
  if (a.scar === 'ojo') head.moveTo(4, -50).lineTo(5, -44).stroke({ width: 0.8, color: shade(skin, 0.6) });
  if (a.scar === 'frente') head.moveTo(-2, -50.5).lineTo(3, -49.6).stroke({ width: 0.8, color: shade(skin, 0.6) });
  if (a.tattoo) head.moveTo(-5.5, -46).lineTo(-3.5, -42).stroke({ width: 1, color: tattooCol, alpha: 0.85 });
  const pierce = 0xd8dce8;
  if (a.piercing === 'nariz') head.circle(6.4, -43.8, 0.6).fill(pierce);
  if (a.piercing === 'septum') head.circle(5.8, -42.8, 0.7).stroke({ width: 0.5, color: pierce });
  if (a.piercing === 'ceja') head.circle(5.4, -48.8, 0.5).fill(pierce);
  if (a.piercing === 'labio') head.circle(3, -41, 0.5).fill(pierce);
  if (a.piercing === 'orejas') { head.circle(-6, -43.4, 0.8).stroke({ width: 0.5, color: pierce }); head.circle(-6.2, -45.5, 0.5).fill(pierce); }
  if (cr.has('cabeza')) { head.roundRect(-6.2, -49, 3, 5, 1).fill(metal); head.circle(-4.7, -46.5, 1).fill(accent); head.rect(-3, -40, 6, 1).fill({ color: metal, alpha: 0.8 }); }
  // Peinados (si no hay casco ni sombrero que los tape).
  const hs = a.hairStyle;
  const covered = hw === 'casco';
  if (!covered) {
    if (hs !== 'calvo' && hs !== 'rapado' && hs !== 'mohicano') head.roundRect(-6.5, -53.5, 13, 5, 3).fill(hair);
    if (hs === 'rapado' || hs === 'mohicano') head.roundRect(-6, -52.4, 12, 3, 2).fill({ color: hair, alpha: 0.5 });
    if (hs === 'cresta') head.poly([-3, -52, -1, -59, 1, -58.5, 3, -60, 4, -52]).fill(hair);
    if (hs === 'mohicano') head.poly([-5, -52, -3, -62, -1, -60, 1, -63, 3, -60, 5, -52]).fill(hair);
    if (hs === 'largo') head.roundRect(-7, -52, 4, 15, 2).fill(hair);
    if (hs === 'melena') { head.roundRect(-7.2, -52, 4.2, 18, 2).fill(hair); head.roundRect(4.6, -52, 2.6, 10, 1.5).fill(hair); }
    if (hs === 'coleta') { head.roundRect(-9, -50, 4, 3, 1.5).fill(hair); head.roundRect(-10.5, -48, 3, 9, 1.5).fill(hair); }
    if (hs === 'coleta-alta') { head.roundRect(-6, -58, 4, 5, 2).fill(hair); head.roundRect(-9, -57, 3.4, 14, 1.6).fill(hair); }
    if (hs === 'afro') head.circle(-0.5, -51, 8.5).fill(hair);
    if (hs === 'rizos') for (const [cx, cy] of [[-5, -53], [-2, -55], [1.5, -55], [4.5, -53], [-6.5, -49.5]]) head.circle(cx, cy, 2.6).fill(hair);
    if (hs === 'moño') head.circle(-3.5, -55, 3.4).fill(hair);
    if (hs === 'dos-moños') { head.circle(-4.5, -55, 2.8).fill(hair); head.circle(3.5, -55.5, 2.8).fill(hair); }
    if (hs === 'rastas') for (let i = -6; i <= -2; i += 2) head.roundRect(i, -50, 1.6, 12, 0.8).fill(hair);
    if (hs === 'trenzas') { head.roundRect(-7.6, -50, 2.2, 14, 1).fill(hair); head.roundRect(5.2, -50, 2.2, 12, 1).fill(hair); }
    if (hs === 'asimetrico') head.poly([-6.5, -53, 6.5, -53, 6.5, -46, 3, -49]).fill(hair);
    if (hs === 'undercut') { head.roundRect(-6.5, -55, 10, 4, 2).fill(hair); head.poly([3, -55, 7.5, -52, 6.5, -49, 2, -51]).fill(hair); }
    if (hs === 'flequillo') head.poly([-1, -53, 7, -53, 6.5, -48.6, 3, -49.8, 0, -48.8]).fill(hair);
    if (hs === 'puntas') head.poly([-6.5, -52, -5, -57, -3, -53.5, -1, -58, 1, -53.5, 3, -58, 4.5, -53.5, 6.5, -56, 6.5, -52]).fill(hair);
    if (hs === 'lobo') { head.roundRect(-7, -54.5, 14, 6, 3).fill(hair); head.poly([-7, -50, -8, -42, -5, -46]).fill(hair); head.poly([6, -50, 7, -44, 4.5, -47]).fill(hair); }
  }
  // Prendas de cabeza y cara (de la ropa) o accesorio elegido al crear el personaje.
  const visor = new Graphics();
  const hc = a.headColor ? HEX(a.headColor) : shade(accent, 0.6);
  const headItem = hw || (['gorra', 'capucha'].includes(a.accessory) ? a.accessory : '');
  const eyeItem = ew || (['gafas', 'visor', 'mascara'].includes(a.accessory) ? a.accessory : '');
  if (headItem === 'gorra') { visor.roundRect(-6.5, -55, 13, 5, 2.5).fill(hc); visor.roundRect(3, -51.5, 7, 1.8, 0.8).fill(shade(hc, 0.75)); }
  if (headItem === 'capucha') head.roundRect(-7.5, -54.5, 15, 6, 3).fill(hw ? hc : shade(jacket, 0.85));
  if (headItem === 'casco') { visor.roundRect(-7.2, -56, 14.4, 10, 5).fill(hc); visor.roundRect(-1, -50, 8, 3.4, 1.2).fill({ color: 0x101820, alpha: 0.9 }); visor.rect(-7, -51, 2, 1).fill(accent); }
  if (headItem === 'sombrero') { visor.ellipse(0, -52.5, 11, 2.6).fill(hc); visor.roundRect(-5.5, -59, 11, 7, 2).fill(hc); visor.rect(-5.5, -54, 11, 1.2).fill(shade(hc, 0.6)); }
  if (headItem === 'bandana') { visor.roundRect(-6.6, -52.5, 13.2, 2.6, 1).fill(hc); visor.poly([-6.6, -51.5, -9.5, -49, -8, -48.5]).fill(hc); }
  if (eyeItem === 'gafas') { visor.roundRect(-1.8, -47.6, 3.4, 2.4, 0.8).fill(ew ? 0x101018 : 0x101018); visor.roundRect(3, -47.6, 3.2, 2.4, 0.8).fill(0x101018); visor.rect(1.6, -46.8, 1.4, 0.7).fill(0x101018); if (ew) visor.rect(-1.6, -47.4, 7.6, 0.6).fill({ color: accent, alpha: 0.6 }); }
  if (eyeItem === 'visor') visor.roundRect(-2, -48, 9, 3, 1).fill({ color: accent, alpha: 0.85 });
  if (eyeItem === 'mascara') visor.roundRect(-1, -43.5, 7.5, 4.5, 1.5).fill(0x202028);
  if (a.accessory === 'auriculares' && !hw) { visor.roundRect(-7.4, -48, 2.6, 5, 1).fill(0x202028); visor.moveTo(-6, -48).quadraticCurveTo(0, -57, 5.8, -50).stroke({ width: 1.2, color: 0x303038 }); visor.circle(-6.1, -45.5, 0.8).fill(accent); }
  body.addChild(armBack, torso, head, visor, armFront);
  root.addChild(legs, body);
  return { root, legs, body, visor };
}

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
