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
  bridge: 0x4c4c5c, wood: 0x5c4232, tile: 0x585a72, metal: 0x46525c, crosswalk: 0x24242f, deck: 0x3e3a36, gravel: 0x4b4640,
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

export function drawBuilding(b: ZoneDef['buildings'][number], body: Graphics, lights: Graphics, quality: 'low' | 'high', occl: Occl = NO_OCCL) {
  const [x0, y0, w, h] = b.rect; const H = b.height; const x1 = x0 + w, y1 = y0 + h;
  const col = HEX(b.color);
  drawBox(body, x0, y0, w, h, 0, H, col);
  const rng = seededRng(hashString(b.id));
  const floorH = b.style === 'industrial' ? 2 : 1;
  const litRate = b.style === 'industrial' ? 0.1 : b.style === 'tower' ? 0.35 : 0.22;
  for (let z = 0.35; z + 0.5 < H; z += floorH) {
    for (let x = x0 + 0.2; x + 0.6 <= x1; x += 1) {
      const lit = rng() < litRate;
      const c = lit ? WINDOW_COLORS[Math.floor(rng() * WINDOW_COLORS.length)] : 0x0e0e1c;
      quadOnFaceY(body, y1, x, x + 0.55, z, z + 0.45, c, lit ? 0.7 : 0.55);
      if (lit && quality === 'high' && rng() < 0.5) { const m = worldToScreen(x + 0.27, y1, z + 0.22); if (!occl(m.x, m.y)) quadOnFaceY(lights, y1, x - 0.1, x + 0.65, z - 0.1, z + 0.55, c, 0.18); }
    }
    for (let y = y0 + 0.2; y + 0.6 <= y1; y += 1) {
      const lit = rng() < litRate;
      const c = lit ? WINDOW_COLORS[Math.floor(rng() * WINDOW_COLORS.length)] : 0x0e0e1c;
      quadOnFaceX(body, x1, y, y + 0.55, z, z + 0.45, c, lit ? 0.7 : 0.55);
      if (lit && quality === 'high' && rng() < 0.5) { const m = worldToScreen(x1, y + 0.27, z + 0.22); if (!occl(m.x, m.y)) quadOnFaceX(lights, x1, y - 0.1, y + 0.65, z - 0.1, z + 0.55, c, 0.18); }
    }
  }
  if (b.style === 'mega') for (let z = 2; z < H; z += 2) { quadOnFaceY(body, y1, x0, x1, z - 0.06, z, 0x000000, 0.35); quadOnFaceX(body, x1, y0, y1, z - 0.06, z, 0x000000, 0.35); }
  if (b.style === 'shop' || b.style === 'club' || b.style === 'clinic') {
    const sc = b.signColor ? HEX(b.signColor) : 0xffd23f;
    quadOnFaceY(body, y1, x0 + 0.4, x1 - 0.4, 0.05, 0.85, shade(sc, 0.35), 0.95);
    const m = worldToScreen((x0 + x1) / 2, y1, 0.4);
    if (!occl(m.x, m.y)) quadOnFaceY(lights, y1, x0 + 0.4, x1 - 0.4, 0.05, 0.85, sc, 0.25);
  }
  if (b.style === 'club' || b.style === 'tower') {
    const sc = b.signColor ? HEX(b.signColor) : 0xff3fa4;
    const a = worldToScreen(x1, y1, 0), t = worldToScreen(x1, y1, H);
    const tgt = (b.style === 'tower' || b.style === 'club') && !occl((a.x + t.x) / 2, (a.y + t.y) / 2) ? lights : body;
    tgt.moveTo(a.x, a.y).lineTo(t.x, t.y).stroke({ width: 3, color: sc, alpha: 0.9 });
    const r0 = worldToScreen(x0, y1, H), r1 = worldToScreen(x1, y1, H), r2 = worldToScreen(x1, y0, H);
    (occl(r1.x, r1.y) ? body : lights).moveTo(r0.x, r0.y).lineTo(r1.x, r1.y).lineTo(r2.x, r2.y).stroke({ width: 2, color: sc, alpha: 0.7 });
  }
  if (b.style === 'industrial') {
    for (let i = 0; i < 2; i++) { const vx = x0 + 1 + rng() * (w - 2), vy = y0 + 1 + rng() * (h - 2); drawBox(body, vx, vy, 0.6, 0.6, H, 0.5, 0x5a5a60); }
  }
  if (b.style === 'clinic') {
    const c = worldToScreen(x1 - 1.2, y1, H - 0.8);
    const tg = occl(c.x, c.y) ? body : lights;
    tg.rect(c.x - 8, c.y - 3, 16, 6).fill({ color: 0x5affc8, alpha: 0.9 });
    tg.rect(c.x - 3, c.y - 8, 6, 16).fill({ color: 0x5affc8, alpha: 0.9 });
  }
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
  }
}

/** Personaje: sombra, piernas, chaqueta, franja de rol, cabeza, pelo y visor. Capas en lugar de variantes completas. */
export function makeCharacter(ap: Appearance | undefined, kind: string): { root: Container; legs: Graphics; body: Container; visor: Graphics } {
  const a = ap ?? { skin: '#c89070', hair: '#222', jacket: '#40506a', accent: '#43f3ff' };
  const root = new Container();
  const shadow = new Graphics().ellipse(0, 0, 11, 5.5).fill({ color: 0x000000, alpha: 0.4 });
  const legs = new Graphics();
  legs.rect(-5, -14, 4, 14).fill(0x1a1a24); legs.rect(1, -14, 4, 14).fill(0x1a1a24);
  const body = new Container();
  const torso = new Graphics();
  torso.roundRect(-8, -31, 16, 18, 4).fill(HEX(a.jacket));
  torso.rect(-8, -24, 16, 2.5).fill(HEX(a.accent));
  torso.rect(-10, -29, 3, 12).fill(shade(HEX(a.jacket), 0.8)); torso.rect(7, -29, 3, 12).fill(shade(HEX(a.jacket), 0.8));
  torso.circle(0, -37, 6).fill(HEX(a.skin));
  torso.ellipse(0, -41, 6.5, 3.5).fill(HEX(a.hair));
  const visor = new Graphics().rect(1, -38.5, 5, 2.2).fill(HEX(a.accent));
  body.addChild(torso, visor);
  if (kind === 'player') { const ring = new Graphics().ellipse(0, 0, 13, 6.5).stroke({ width: 1.5, color: HEX(a.accent), alpha: 0.8 }); root.addChild(ring); }
  root.addChild(shadow, legs, body);
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
