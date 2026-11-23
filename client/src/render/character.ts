// v0.9 · Personaje detallado: ropa con tejidos de alta resolución y volumen, tatuajes reales por zonas (brazos, piernas, cuello,
// pecho), contornos, costuras, cremalleras, tachuelas, luces LED, más prendas, calzado y complementos. Todo procedural y original.
import { Container, Graphics, type Texture } from 'pixi.js';
import type { Appearance } from '@vertice/shared';
import { fabricTexture, skinTexture } from './textures';

const HEX = (s: string) => parseInt(s.slice(1), 16);
function shade(c: number, f: number) {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * f)), g = Math.min(255, Math.round(((c >> 8) & 255) * f)), b = Math.min(255, Math.round((c & 255) * f));
  return (r << 16) | (g << 8) | b;
}
const hexOf = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const OUT = 0x07070d;
/** Contorno fino: da definición a cada pieza a cualquier zoom. */
const edge = { width: 0.45, color: OUT, alpha: 0.55 } as const;
const tex = (texture: Texture) => ({ texture, textureSpace: 'local' as const });

export interface CharParts { root: Container; legs: Container; body: Container; visor: Graphics; legL: Container; legR: Container; kneeL:Container; kneeR:Container; footL:Container; footR:Container; armB: Container; armF: Container; hand: Container; handB: Container; bodyY: number }
const SLEEVELESS = new Set(['top', 'chaleco', 'tirantes', 'arnes']);
const SHORT_SLEEVE = new Set(['camiseta', 'camisa']);
const WIDE_SLEEVE = new Set(['haori', 'poncho']);
const LONG_COAT = new Set(['gabardina', 'abrigo', 'chubasquero', 'haori']);

/** Figura de un personaje: piernas y brazos articulados (cadera y hombro) para andar con naturalidad y empuñar armas. */
export function makeCharacter(ap: Appearance | undefined, kind: string, chrome: string[] = [], lost: string[] = []): CharParts {
  const a = { skin: '#c89070', hair: '#222222', jacket: '#40506a', accent: '#43f3ff', eyes: '#3a2a1a', pants: '#1a1a24', build: 'medio', hairStyle: 'corto', top: 'chaqueta', facial: 'ninguno', accessory: 'ninguno', tattoo: '',
    faceShape: 'ovalada', brows: 'normales', makeup: 'ninguno', makeupColor: '#ff3fa4', piercing: 'ninguno', scar: 'ninguna', bodyTattoo: 'ninguno', shirt: '', shoes: '#101018',
    headwear: '', headColor: '', eyewear: '', legwear: 'pantalon', rarityGlow: '', tattooZone: 'brazos', tattooInk: '#14141e', faceTattoo: 'ninguno', topPattern: 'liso', pantsPattern: 'liso',
    shoeStyle: 'botas', topDetail: 'ninguno', accent2: '', ...(ap ?? {}) } as Required<Appearance>;
  const cr = new Set(chrome);
  const B = a.build;
  const bf = B === 'delgado' ? 0.85 : B === 'robusto' ? 1.2 : B === 'corpulento' ? 1.38 : B === 'atletico' ? 1.06 : B === 'alto' ? 0.95 : 1;
  const hf = B === 'bajo' ? 0.8 : B === 'alto' ? 1.24 : B === 'atletico' ? 1.05 : 1;
  const gone = new Set(lost);
  const BLOOD = 0x8a0a12;
  const skin = HEX(a.skin), hair = HEX(a.hair), jacket = HEX(a.jacket), accent = HEX(a.accent), pants = HEX(a.pants), eyes = HEX(a.eyes);
  const shirt = a.shirt ? HEX(a.shirt) : shade(jacket, 0.7), shoes = HEX(a.shoes || '#101018'), mk = HEX(a.makeupColor || '#ff3fa4');
  const acc2 = a.accent2 ? HEX(a.accent2) : shade(accent, 0.7);
  const tattooCol = a.tattoo ? HEX(a.tattoo) : 0x1a1a2a;
  const metal = 0xa8b0c0, metalDark = 0x5a6070, metalLight = 0xdfe6f0;
  const top = a.top, tz = a.tattooZone || 'brazos', tstyle = a.bodyTattoo && a.bodyTattoo !== 'ninguno' ? a.bodyTattoo : '';
  const inkHex = a.tattooInk || '#14141e';
  const tatOn = (part: 'brazoF' | 'brazoB' | 'pierna' | 'cuello' | 'pecho') => !!tstyle && (tz === 'todo' || (part === 'brazoF' && (tz === 'brazos' || tz === 'brazo')) || (part === 'brazoB' && tz === 'brazos') || (part === 'pierna' && tz === 'piernas') || (part === 'cuello' && tz === 'cuello') || (part === 'pecho' && tz === 'pecho'));
  const skinTex = (part: 'brazoF' | 'brazoB' | 'pierna' | 'cuello' | 'pecho', wu: number, hu: number) => skinTexture(a.skin, tatOn(part) ? tstyle : 'ninguno', inkHex, a.accent, wu, hu, part);
  const topTex = (wu: number, hu: number, base = a.jacket) => fabricTexture(a.topPattern || 'liso', base, a.accent, wu, hu);
  const root = new Container();
  if (kind === 'player') root.addChild(new Graphics().ellipse(0, 0, 14, 7).stroke({ width: 1.5, color: accent, alpha: 0.85 }));
  if (a.rarityGlow) root.addChild(new Graphics().ellipse(0, 0, 16, 8).stroke({ width: 1, color: HEX(a.rarityGlow), alpha: 0.6 }));
  root.addChild(new Graphics().ellipse(0, 0, 12 * bf, 6).fill({ color: 0x000000, alpha: 0.4 }));

  // ================================================================ piernas y calzado
  const legs = new Container();
  const lw = a.legwear || 'pantalon';
  const bareLeg = lw === 'shorts' || lw === 'falda' || lw === 'bermudas';
  const shoe = (g: Graphics, x: number, w: number) => {
    const st = a.shoeStyle || 'botas';
    const sole = st === 'zapatillas' ? 0xf0f0f4 : st === 'plataformas' ? 0x202024 : shade(shoes, 0.5);
    const shaft = st === 'botas-altas' ? 9 : st === 'botas' ? 5 : st === 'botas-tacticas' ? 6.5 : 0;
    if (shaft) { g.roundRect(x - 0.3, -2.8 - shaft, w + 0.6, shaft + 0.5, 1).fill(shoes).stroke(edge); for (let yy = -2.8 - shaft + 1.2; yy < -3; yy += 1.4) g.rect(x + w * 0.35, yy, w * 0.3, 0.35).fill({ color: shade(shoes, 1.6), alpha: 0.7 }); }
    if (st === 'botas-tacticas') { g.rect(x - 0.3, -6, w + 0.6, 0.7).fill(0x2a2a30); g.rect(x - 0.3, -8.5, w + 0.6, 0.7).fill(0x2a2a30); }
    if (st === 'tacones') {
      g.poly([x - 0.4, -2.6, x + w + 2.2, -1.2, x + w + 2.2, 0, x + 0.8, 0, x + 0.8, -1]).fill(shoes).stroke(edge);
      g.rect(x - 0.2, -1.2, 0.7, 1.6).fill(shade(shoes, 0.5));
      return;
    }
    const sh = st === 'plataformas' ? 2.4 : 1;
    g.roundRect(x - 0.6, -2.8, w + 1.8, 3.4, 1).fill(shoes).stroke(edge);
    g.rect(x - 0.6, 0.6 - sh, w + 1.8, sh).fill(sole);
    if (st === 'zapatillas') { g.moveTo(x + 0.4, -1.8).lineTo(x + w + 0.6, -0.9).stroke({ width: 0.6, color: accent, alpha: 0.9 }); g.circle(x + w * 0.5, -2.2, 0.35).fill(0xffffff); }
    if (st === 'mocasines') g.rect(x + 0.6, -2.4, w * 0.6, 0.5).fill({ color: 0xd8b040, alpha: 0.8 });
    g.rect(x - 0.4, -2.6, w + 1.4, 0.5).fill({ color: 0xffffff, alpha: 0.12 }); // brillo
  };
  const leg = (side: -1 | 1) => {
    const g = new Graphics();
    const x = side * 3.2 * bf - 2.4 * bf, w = 4.8 * bf;
    const holder = new Container();
    holder.pivot.set(x + w / 2, -19); holder.position.set(x + w / 2, -19);
    const knee=new Container(),foot=new Container(),shin=new Graphics(),boot=new Graphics();
    knee.pivot.set(x+w/2,-10); knee.position.copyFrom(knee.pivot);
    foot.pivot.set(x+w/2,-2); foot.position.copyFrom(foot.pivot);
    holder.addChild(g,knee); knee.addChild(shin,foot); foot.addChild(boot);
    if (gone.has(side < 0 ? 'pierna_izq' : 'pierna_der')) { g.roundRect(x, -19, w, 4, 1.5).fill(pants); g.ellipse(x + w / 2, -15, w / 2, 1.4).fill(BLOOD); return {holder,knee,foot}; }
    const isChrome = cr.has(side < 0 ? 'pierna_izq' : 'pierna_der');
    if (isChrome) {
      g.roundRect(x,-19,w,10,1.5).fill(metal).stroke(edge);
      shin.roundRect(x,-11,w,10,1.5).fill(metal).stroke(edge);
      for (let yy = -17; yy < -3; yy += 3) (yy < -10 ? g : shin).rect(x + 0.3, yy, w - 0.6, 0.5).fill(metalDark);
      g.circle(x + w / 2, -10.5, 1.6).fill(metalDark); g.circle(x + w / 2, -10.5, 0.9).fill(accent);
      shin.rect(x + w - 1.2,-10,1.2,7).fill({ color: accent, alpha: 0.6 });
      g.rect(x + 0.6,-18,.6,8).fill({ color: metalLight, alpha: 0.7 });
    } else if (bareLeg) {
      const skin=tex(skinTex('pierna',w,18));
      g.roundRect(x,-19,w,10,1.5).fill(skin).stroke(edge);
      shin.roundRect(x,-11,w,10,1.5).fill(skin).stroke(edge);
      if (lw === 'shorts') g.roundRect(x - 0.2, -19, w + 0.4, 7, 1.5).fill(tex(fabricTexture(a.pantsPattern, a.pants, a.accent, w + 0.4, 7))).stroke(edge);
      if (lw === 'bermudas') g.roundRect(x - 0.3, -19, w + 0.6, 10, 1.5).fill(tex(fabricTexture(a.pantsPattern, a.pants, a.accent, w + 0.6, 10))).stroke(edge);
    } else {
      const narrow = lw === 'leggins' ? 0.4 : 0;
      const cloth=tex(fabricTexture(a.pantsPattern,a.pants,a.accent,w,18));
      g.roundRect(x+narrow,-19,w-2*narrow,10,1.5).fill(cloth).stroke(edge);
      shin.roundRect(x+narrow,-11,w-2*narrow,10,1.5).fill(cloth).stroke(edge);
      g.moveTo(x + w * 0.5, -18).lineTo(x + w * 0.5, -10).stroke({ width: 0.35, color: shade(pants, 0.6), alpha: 0.8 }); // costura
      g.moveTo(x + 0.8, -10.6).quadraticCurveTo(x + w / 2, -9.6, x + w - 0.8, -10.6).stroke({ width: 0.35, color: shade(pants, 0.55), alpha: 0.7 }); // rodilla
      if (lw === 'cargo') { g.roundRect(x + (side < 0 ? 0.2 : w - 2.8), -14.5, 2.6, 3.4, 0.5).fill(shade(pants, 0.82)).stroke({ width: 0.3, color: shade(pants, 0.5) }); g.rect(x + (side < 0 ? 0.2 : w - 2.8), -14.5, 2.6, 0.8).fill(shade(pants, 0.7)); }
      if (lw === 'tactico') { g.roundRect(x + 0.3, -12, w - 0.6, 3, 1).fill(0x2a2a30).stroke(edge); g.rect(x + 0.8, -11.2, w - 1.6, 0.4).fill({ color: accent, alpha: 0.6 }); }
    }
    shoe(boot,x,w);
    return {holder,knee,foot};
  };
  const leftLeg=leg(-1),rightLeg=leg(1);
  const legL=leftLeg.holder,legR=rightLeg.holder;
  legs.addChild(legL, legR);
  legs.scale.y = hf;
  if (lw === 'falda' || lw === 'falda-larga') {
    const long = lw === 'falda-larga';
    const sk = new Graphics().poly([-6 * bf, -20, 6 * bf, -20, (long ? 8.5 : 8) * bf, long ? -4 : -11, -(long ? 8.5 : 8) * bf, long ? -4 : -11]).fill(tex(fabricTexture(a.pantsPattern, a.pants, a.accent, 16 * bf, long ? 16 : 9))).stroke(edge);
    for (let i = -2; i <= 2; i++) sk.moveTo(i * 2 * bf, -19).lineTo(i * 2.8 * bf, long ? -5 : -12).stroke({ width: 0.3, color: shade(pants, 0.6), alpha: 0.6 });
    legs.addChild(sk);
  }
  // Cinturón con hebilla.
  const belt = new Graphics();
  if (!bareLeg || lw === 'shorts' || lw === 'bermudas') { belt.rect(-7.6 * bf, -20.2, 15.2 * bf, 1.4).fill(0x15151a); belt.roundRect(-1, -20.5, 2.2, 2, 0.4).fill(0xc8ccd8); }

  // ================================================================ torso, brazos y cabeza
  const body = new Container();
  const tw = 16 * bf, tx = -tw / 2;
  const sleeveless = SLEEVELESS.has(top);
  const arm = (side: -1 | 1) => {
    const g = new Graphics();
    const x = side < 0 ? tx - 3.4 : tx + tw - 0.6;
    const holder = new Container();
    holder.pivot.set(x + 2, -34.5); holder.position.set(x + 2, -34.5);
    holder.addChild(g);
    const hand = new Container(); hand.position.set(x + 2, -19.5); holder.addChild(hand);
    (holder as any).hand = hand;
    const sideK = side < 0 ? 'izq' : 'der';
    const skinPart = side > 0 ? 'brazoF' : 'brazoB';
    if (gone.has(`brazo_${sideK}`)) { g.roundRect(x, -36, 4, 5, 1.5).fill(sleeveless ? skin : shade(jacket, 0.85)); g.ellipse(x + 2, -31, 2, 1.2).fill(BLOOD); hand.visible = false; return holder; }
    const isChrome = cr.has(side < 0 ? 'brazo_izq' : 'brazo_der');
    if (isChrome) {
      g.roundRect(x, -36, 4, 16, 1.5).fill(metal).stroke(edge);
      g.roundRect(x - 0.4, -36.4, 4.8, 4.2, 1.6).fill(metalLight).stroke(edge); // hombrera
      for (let yy = -31; yy < -22; yy += 2.2) g.rect(x + 0.2, yy, 3.6, 0.45).fill(metalDark);
      g.circle(x + 2, -28, 1.4).fill(metalDark); g.circle(x + 2, -28, 0.8).fill(accent);
      g.rect(x + 1.4, -35, 1, 13).fill({ color: accent, alpha: 0.55 });
      g.roundRect(x - 0.3, -21, 4.6, 4, 1.5).fill(metalDark).stroke(edge);
      for (let i = 0; i < 3; i++) g.rect(x + 0.4 + i * 1.3, -18.2, 0.9, 1.4).fill(metal); // dedos
      return holder;
    }
    const sleeveCol = shade(jacket, side < 0 ? 0.82 : 0.97);
    const wide = WIDE_SLEEVE.has(top);
    if (sleeveless) {
      g.roundRect(x, -36, 4, 16, 1.5).fill(tex(skinTex(skinPart, 4, 16))).stroke(edge);
      if (top === 'arnes') { g.rect(x - 0.2, -34, 4.4, 0.8).fill(0x15151a); g.circle(x + 2, -33.6, 0.45).fill(0xc8ccd8); }
    } else if (SHORT_SLEEVE.has(top)) {
      g.roundRect(x, -36, 4, 16, 1.5).fill(tex(skinTex(skinPart, 4, 16))).stroke(edge);
      g.roundRect(x - 0.3, -36.2, 4.6, top === 'camisa' ? 9 : 6.5, 1.5).fill(tex(topTex(4.6, 6.5, hexOf(sleeveCol)))).stroke(edge);
      g.rect(x - 0.3, top === 'camisa' ? -28.2 : -30.7, 4.6, 0.6).fill(shade(jacket, 0.65));
    } else if (wide) {
      g.roundRect(x, -36, 4, 16, 1.5).fill(skin);
      g.poly([x - 0.3, -36.2, x + 4.3, -36.2, x + 5.8, -23, x - 1.8, -23]).fill(tex(topTex(7.6, 13, hexOf(sleeveCol)))).stroke(edge);
      g.rect(x - 1.8, -24, 7.6, 1).fill(acc2);
    } else {
      g.roundRect(x, -36, 4, 16, 1.5).fill(tex(topTex(4, 16, hexOf(sleeveCol)))).stroke(edge);
      if (LONG_COAT.has(top)) g.roundRect(x - 0.4, -36, 4.8, 15, 1.5).fill(tex(topTex(4.8, 15, hexOf(shade(jacket, side < 0 ? 0.72 : 0.88))))).stroke(edge);
      g.rect(x - 0.2, -22.4, 4.4, 1.2).fill(shade(jacket, 0.6)); // puño
      g.moveTo(x + 2.6, -35).lineTo(x + 2.6, -23).stroke({ width: 0.3, color: shade(jacket, 0.55), alpha: 0.7 }); // costura
      g.moveTo(x + 0.4, -28.6).quadraticCurveTo(x + 2, -27.6, x + 3.6, -28.8).stroke({ width: 0.35, color: shade(jacket, 0.6), alpha: 0.6 }); // codo
      if (top === 'armadura' || top === 'exo-tormenta') { g.roundRect(x - 0.8, -36.8, 5.6, 4.6, 1.8).fill(shade(jacket, 1.25)).stroke(edge); g.rect(x - 0.6, -33.4, 5.2, 0.5).fill(accent); }
      if (top === 'cortavientos') g.rect(x, -31, 4, 2).fill(acc2);
      if (a.topDetail === 'led') g.rect(x + 3.3, -35, 0.5, 12).fill({ color: accent, alpha: 0.95 });
      if (a.topDetail === 'reflectante') g.rect(x - 0.1, -26, 4.2, 1).fill({ color: 0xe8f0ff, alpha: 0.9 });
      if (a.topDetail === 'tachuelas') for (let i = 0; i < 3; i++) g.circle(x + 0.9 + i * 1.1, -35, 0.38).fill(0xd8dce8);
      if (a.topDetail === 'parches' && side > 0) { g.roundRect(x + 0.5, -33, 3, 3, 0.6).fill(acc2).stroke({ width: 0.3, color: 0xffffff, alpha: 0.6 }); g.circle(x + 2, -31.5, 0.6).fill(accent); }
    }
    if (gone.has(`mano_${sideK}`)) { g.ellipse(x + 2, -20.5, 2, 1.1).fill(BLOOD); hand.visible = false; }
    else { g.roundRect(x, -21, 4, 3.6, 1.5).fill(skin).stroke(edge); g.rect(x + 0.6, -18.6, 2.8, 0.35).fill({ color: shade(skin, 0.7), alpha: 0.8 }); }
    return holder;
  };
  const armBack = arm(-1), armFront = arm(1);
  const torso = new Graphics();
  const jt = topTex(tw, 19);
  // Complexión: hombros anchos (atlético) o barriga (corpulento).
  if (B === 'atletico') torso.poly([tx - 1.6, -37, tx + tw + 1.6, -37, tx + tw - 1, -27, tx + 1, -27]).fill(sleeveless && top !== 'chaleco' ? skin : jacket);
  if (B === 'corpulento') torso.ellipse(1, -24, tw / 2 + 1.5, 6).fill(top === 'top' || top === 'arnes' ? skin : shade(jacket, 0.92));
  if (LONG_COAT.has(top)) torso.roundRect(tx - 1, -37, tw + 2, top === 'abrigo' || top === 'haori' ? 33 : 30, 3).fill(tex(topTex(tw + 2, 32, hexOf(shade(jacket, 0.9))))).stroke(edge);
  if (top === 'poncho') torso.poly([tx - 3, -30, tx + tw + 3, -30, tx + tw + 1, -15, tx - 1, -15]).fill(tex(topTex(tw + 6, 15))).stroke(edge);
  if (top === 'arnes' || top === 'top') {
    // Torso a la vista (con tatuaje de pecho si lo hay).
    torso.roundRect(tx, -37, tw, 19, 4).fill(tex(skinTex('pecho', tw, 19))).stroke(edge);
    torso.moveTo(-2, -33).quadraticCurveTo(0, -32, 2, -33).stroke({ width: 0.4, color: shade(skin, 0.7), alpha: 0.6 });
    if (top === 'top') torso.roundRect(tx, -37, tw, 11, 4).fill(tex(fabricTexture(a.topPattern, a.shirt || hexOf(shade(accent, 0.45)), a.accent, tw, 11))).stroke(edge);
    else { torso.moveTo(tx + 1, -37).lineTo(tx + tw - 2, -22).moveTo(tx + tw - 1, -37).lineTo(tx + 2, -22).stroke({ width: 1.3, color: 0x15151a }); torso.circle(0, -29.6, 1).fill(0xc8ccd8); }
  } else if (top === 'tirantes') {
    torso.roundRect(tx, -37, tw, 19, 4).fill(tex(skinTex('pecho', tw, 19))).stroke(edge);
    torso.roundRect(tx + 1.4, -34, tw - 2.8, 16, 3).fill(tex(topTex(tw - 2.8, 16))).stroke(edge);
    torso.rect(tx + 2.4, -37, 1.6, 3.5).fill(jacket); torso.rect(tx + tw - 4, -37, 1.6, 3.5).fill(jacket);
  } else {
    torso.roundRect(tx, -37, tw, 19, 4).fill(tex(jt)).stroke(edge);
  }
  if (top === 'chaqueta' || LONG_COAT.has(top) || top === 'bomber' || top === 'biker' || top === 'blazer') {
    // Cuello abierto: se ve la camiseta de debajo (y el cuello con su tatuaje).
    torso.poly([-3.4, -37, 3.4, -37, 0, -26]).fill(tex(fabricTexture('liso', hexOf(shirt), a.accent, 7, 11)));
    torso.poly([0, -37, -3.5, -30, 0, -24]).fill(shade(jacket, 0.7)); torso.poly([0, -37, 3.5, -30, 0, -24]).fill(shade(jacket, 0.82));
    if (top !== 'blazer') torso.rect(tx, -27, tw, top === 'bomber' ? 0 : 2).fill(accent);
    torso.rect(tx + tw - 5, -33, 3, 2).fill(shade(jacket, 0.6));
  }
  if (top === 'bomber') { torso.roundRect(tx, -20.5, tw, 2.4, 1).fill(tex(fabricTexture('punto', hexOf(acc2), a.accent, tw, 2.4))); torso.roundRect(-3.6, -38, 7.2, 2, 1).fill(acc2); torso.rect(tx + 1.5, -33, 3, 1.4).fill(accent); }
  if (top === 'biker') { torso.moveTo(-2, -37).lineTo(3, -28).lineTo(2, -19).stroke({ width: 0.7, color: 0xc8ccd8 }); torso.poly([-3.5, -37, -6.5, -33, -3, -31]).fill(shade(jacket, 0.65)); for (let i = 0; i < 4; i++) torso.circle(tx + 2 + i * 0.9, -26 + i * 0.4, 0.3).fill(0xd8dce8); }
  if (top === 'blazer') { torso.circle(0, -25, 0.5).fill(0x101018); torso.circle(0, -22.5, 0.5).fill(0x101018); torso.rect(tx + 1.5, -28.6, 3.4, 0.5).fill(shade(jacket, 0.55)); torso.poly([tx + tw - 4.5, -33, tx + tw - 2.5, -33, tx + tw - 3.5, -31]).fill(acc2); }
  if (top === 'camisa') { torso.poly([-3, -37, 0, -34, 3, -37, 2.6, -38, -2.6, -38]).fill(shade(jacket, 1.15)); for (let yy = -33; yy < -19; yy += 2.6) torso.circle(0.4, yy, 0.4).fill(shade(jacket, 0.5)); torso.moveTo(0, -34).lineTo(0, -18).stroke({ width: 0.3, color: shade(jacket, 0.6) }); }
  if (top === 'camiseta') { torso.ellipse(0, -36.4, 3.4, 1.4).fill(tex(skinTex('cuello', 6.8, 2.8))); torso.ellipse(0, -36.4, 3.6, 1.6).stroke({ width: 0.5, color: shade(jacket, 0.6) }); torso.roundRect(-3, -32, 6, 5, 1).fill({ color: accent, alpha: 0.75 }); torso.rect(-2, -30.6, 4, 0.6).fill(shade(accent, 0.4)); }
  if (top === 'haori') { torso.poly([-1, -37, 1, -37, -3, -18, -5, -18]).fill(acc2); torso.rect(tx - 1, -25, tw + 2, 2).fill(shade(acc2, 0.7)); }
  if (top === 'armadura' || top === 'exo-tormenta') { torso.roundRect(tx + 1.5, -35, tw - 3, 8, 2).fill(shade(jacket, 1.25)).stroke(edge); torso.roundRect(tx + 2, -26, tw - 4, 6, 2).fill(shade(jacket, 1.1)).stroke(edge); torso.rect(-2.5, -31.5, 5, 0.6).fill(accent); }
  if (top === 'cortavientos') { torso.rect(tx, -31, tw, 3).fill(acc2); torso.moveTo(0, -37).lineTo(0, -18).stroke({ width: 0.5, color: 0xc8ccd8 }); }
  if (top === 'chubasquero') { torso.rect(tx + 1, -36, 1.2, 16).fill({ color: 0xffffff, alpha: 0.25 }); torso.moveTo(0, -37).lineTo(0, -10).stroke({ width: 0.5, color: shade(jacket, 0.5) }); }
  if (top === 'chaleco') { torso.rect(-1, -37, 2, 19).fill(shade(jacket, 0.6)); torso.rect(tx + 2, -28, 4, 3).fill(shade(jacket, 0.7)); torso.rect(tx + tw - 6, -28, 4, 3).fill(shade(jacket, 0.7)); torso.poly([-2.5, -37, 2.5, -37, 0, -33]).fill(shirt); }
  if (top === 'sudadera') { torso.roundRect(tx + 3, -26, tw - 6, 5, 2).fill(shade(jacket, 0.8)); torso.moveTo(-2, -36).lineTo(-2, -31).moveTo(2, -36).lineTo(2, -31).stroke({ width: 0.8, color: accent }); torso.rect(tx, -20, tw, 1.6).fill(shade(jacket, 0.7)); }
  if (top === 'traje') { torso.poly([-3, -37, 0, -32, 3, -37]).fill(a.shirt ? shirt : 0xe8e8f0); torso.rect(-0.8, -34, 1.6, 9).fill(accent); torso.poly([-3, -37, -5, -30, -1, -28]).fill(shade(jacket, 0.75)); torso.poly([3, -37, 5, -30, 1, -28]).fill(shade(jacket, 0.85)); }
  if (top === 'mono') { torso.rect(tx, -22, tw, 2).fill(0x2a2a2a); torso.rect(tx + 3, -34, 3, 3).fill(shade(jacket, 0.75)); torso.rect(-0.3, -37, 0.6, 15).fill(0xc8ccd8); }
  // Detalles de la prenda.
  const d = a.topDetail;
  if (d === 'cremallera' && !sleeveless) { torso.moveTo(0.4, -37).lineTo(0.4, -18).stroke({ width: 0.6, color: 0xc8ccd8 }); for (let yy = -36; yy < -18; yy += 1) torso.rect(-0.2, yy, 1.2, 0.3).fill(0x8a90a0); torso.roundRect(0, -30, 0.9, 1.6, 0.3).fill(0xe0e4ec); }
  if (d === 'tachuelas') for (let i = 0; i < 7; i++) { torso.circle(tx + 1.2 + i * 0.9, -36 + (i % 2) * 0.6, 0.38).fill(0xd8dce8); torso.circle(tx + tw - 1.2 - i * 0.9, -36 + (i % 2) * 0.6, 0.38).fill(0xd8dce8); }
  if (d === 'parches') { torso.roundRect(tx + 1.5, -34, 3.2, 2.4, 0.5).fill(acc2); torso.circle(tx + tw - 3.5, -24, 1.3).fill(accent); torso.rect(tx + tw - 4.6, -32, 2.6, 2).fill(0xffd23f); }
  if (d === 'led') { torso.rect(tx + 0.4, -36, 0.5, 17).fill({ color: accent, alpha: 0.95 }); torso.rect(tx + tw - 0.9, -36, 0.5, 17).fill({ color: accent, alpha: 0.95 }); torso.rect(tx, -19.2, tw, 0.5).fill({ color: accent, alpha: 0.95 }); }
  if (d === 'cuello-pelo') for (let i = 0; i < 9; i++) torso.ellipse(-5 + i * 1.25, -37.2 + (i % 2) * 0.5, 1.2, 1).fill(i % 2 ? 0xe8dcc8 : 0xcfc0a8);
  if (d === 'reflectante') { torso.rect(tx, -28, tw, 1.3).fill({ color: 0xe8f0ff, alpha: 0.9 }); torso.rect(tx, -23, tw, 1.3).fill({ color: 0xe8f0ff, alpha: 0.9 }); }
  if (d === 'cinturon') { torso.rect(tx, -23.5, tw, 1.6).fill(0x15151a); torso.roundRect(-1.2, -24, 2.4, 2.4, 0.4).fill(0xd8b040); }
  if (d === 'placas') { torso.roundRect(tx + 2, -34, tw - 4, 5, 1.5).fill(0x3a3e48).stroke(edge); torso.roundRect(tx + 2, -28, tw - 4, 5, 1.5).fill(0x3a3e48).stroke(edge); torso.rect(tx + 3, -32, 2, 0.6).fill(accent); }
  if (cr.has('torso')) { torso.moveTo(tx + 3, -33).lineTo(tx + tw - 3, -33).moveTo(tx + 4, -30).lineTo(tx + tw - 4, -30).stroke({ width: 1, color: accent, alpha: 0.8 }); torso.circle(0, -31, 1.6).fill(accent); torso.circle(0, -31, 2.4).stroke({ width: 0.5, color: metalLight }); }

  // ================================================================ cabeza
  const hairBack = new Graphics();
  const head = new Graphics();
  const hw = a.headwear, ew = a.eyewear;
  const hood = hw === 'capucha' || (!hw && (a.accessory === 'capucha' || top === 'sudadera' || top === 'chubasquero'));
  if (hood) head.ellipse(0, -44, 8.5, 9).fill(tex(fabricTexture(a.topPattern, hw === 'capucha' && a.headColor ? a.headColor : hexOf(shade(jacket, 0.85)), a.accent, 17, 18))).stroke(edge);
  // Cuello (con tatuaje si toca).
  head.rect(-2.2, -39.8, 4.4, 3.4).fill(tex(skinTex('cuello', 4.4, 3.4)));
  head.rect(-2.2, -37, 4.4, 0.6).fill({ color: shade(skin, 0.6), alpha: 0.5 });
  const fs = a.faceShape;
  const addedFaces: Record<string, number[]> = {
    oblonga: [10.8, 15.4, 3.8, -53], 'mandibula-marcada': [13.2, 13.8, 1.7, -52], 'frente-ancha': [13.7, 13.8, 4.2, -52.5],
    'pomulos-altos': [13.2, 13, 3.3, -52], 'ovalada-corta': [12.8, 11.9, 5.4, -51.5], 'perfil-suave': [12.3, 13.1, 5.6, -52],
  };
  const [fw, fh, fr, fy] = addedFaces[fs] ?? (fs === 'angulosa' ? [12, 13, 2, -52] : fs === 'redonda' ? [13, 12.5, 6, -51.5] : fs === 'alargada' ? [11, 14.5, 4, -53]
    : fs === 'cuadrada' ? [13, 13, 1.5, -52] : fs === 'corazon' ? [12.5, 12.5, 5, -52] : fs === 'ancha' ? [14, 12.5, 4.5, -51.5] : fs === 'afilada' ? [11, 14, 3, -52.5] : [12, 13, 5, -52]);
  head.roundRect(-fw / 2, fy, fw, fh, fr).fill(skin).stroke(edge);
  if (fs === 'corazon' || fs === 'afilada' || fs === 'frente-ancha') head.poly([-fw / 2 + 1, fy + fh - 4, fw / 2 - 1, fy + fh - 4, 1, fy + fh + 1.6]).fill(skin);
  if (fs === 'cuadrada' || fs === 'mandibula-marcada') head.rect(-fw / 2, fy + fh - 3, fw, 2).fill(shade(skin, 0.94));
  if (fs === 'angulosa') head.poly([-6, -42, -3, -38.6, 4, -38.6, 6, -42]).fill(shade(skin, 0.92));
  // Volumen de la cara: sombra en el lado contrario a la luz, pómulo iluminado y oreja con detalle.
  head.roundRect(-fw / 2, fy, fw * 0.32, fh, fr).fill({ color: 0x000000, alpha: 0.13 });
  head.ellipse(4.6, -44.6, 1.6, 1).fill({ color: 0xffffff, alpha: 0.08 });
  head.ellipse(-fw / 2, -45, 1.4, 2).fill(shade(skin, 0.85)); head.ellipse(-fw / 2 + 0.3, -45, 0.6, 1).fill(shade(skin, 0.65));
  const browC = shade(hair, 0.9);
  const bw = a.brows === 'finas' ? 0.5 : a.brows === 'gruesas' ? 1.4 : 0.9;
  if (a.brows === 'arqueadas') { head.moveTo(-1.6, -48).lineTo(0, -49.2).lineTo(1.5, -48.4).stroke({ width: 0.9, color: browC }); head.moveTo(3, -48.4).lineTo(4.4, -49.2).lineTo(5.6, -48).stroke({ width: 0.9, color: browC }); }
  else { head.rect(-1.5, -48.6, 3, bw).fill(browC); head.rect(3, -48.6, 2.6, bw).fill(browC); if (a.brows === 'cortadas') head.rect(4, -48.8, 0.6, 1.4).fill(skin); }
  const eyeCol = cr.has('ojos') ? accent : eyes;
  for (const ex of [0, 4.3]) {
    head.rect(ex - 1.1, -47, 2.4, 1.8).fill(0xf4f4f4); head.rect(ex - 0.2, -47, 1.2, 1.8).fill(eyeCol);
    head.rect(ex + 0.1, -46.6, 0.6, 1).fill(0x050508); head.rect(ex + 0.5, -46.9, 0.35, 0.35).fill(0xffffff); // pupila y brillo
    head.rect(ex - 1.2, -47.2, 2.6, 0.35).fill({ color: shade(skin, 0.5), alpha: 0.8 }); // párpado
  }
  if (cr.has('ojos')) { head.rect(-1.6, -47.4, 7.6, 2.4).fill({ color: accent, alpha: 0.25 }); head.circle(4.9, -46.1, 1.4).stroke({ width: 0.35, color: metalLight }); }
  if (a.makeup === 'delineado') head.moveTo(-1.4, -47.2).lineTo(1.6, -47.2).moveTo(3.1, -47.2).lineTo(6.2, -47.6).stroke({ width: 0.6, color: 0x101010 });
  if (a.makeup === 'neon') { head.rect(-1.4, -44.8, 3, 0.7).fill(mk); head.rect(3, -44.8, 3, 0.7).fill(mk); }
  if (a.makeup === 'pintura') head.rect(-fw / 2, -46, fw, 1.6).fill({ color: mk, alpha: 0.7 });
  const ns = (a as any).nose ?? 'recta', nc = shade(skin, 0.7);
  if (ns === 'chata') head.moveTo(5.6, -45.5).lineTo(6.3, -43.6).lineTo(5.2, -43.4).stroke({ width: 1, color: nc });
  else if (ns === 'aguilena') head.moveTo(5.6, -46.4).quadraticCurveTo(7.6, -45.2, 6.6, -43.2).lineTo(5.4, -43.2).stroke({ width: 0.9, color: nc });
  else if (ns === 'pequena') head.moveTo(5.6, -44.6).lineTo(6, -43.6).lineTo(5.3, -43.5).stroke({ width: 0.7, color: nc });
  else if (ns === 'ancha') { head.moveTo(5.6, -46).lineTo(6.8, -43.4).lineTo(4.6, -43.1).stroke({ width: 1.1, color: nc }); head.circle(4.9, -43.5, 0.6).fill(nc); }
  else head.moveTo(5.8, -46).lineTo(6.6, -43.5).lineTo(5.4, -43.2).stroke({ width: 0.8, color: nc });
  const ms = (a as any).mouth ?? 'neutra', lipC = a.makeup === 'labios' ? mk : shade(skin, 0.55), lipW = a.makeup === 'labios' ? 1.4 : 0.9;
  if (ms === 'sonrisa') head.moveTo(1.4, -42).quadraticCurveTo(3, -40.6, 4.8, -42.2).stroke({ width: lipW, color: lipC });
  else if (ms === 'seria') head.moveTo(1.5, -41.4).quadraticCurveTo(3, -42.2, 4.6, -41.4).stroke({ width: lipW, color: lipC });
  else if (ms === 'labios-gruesos') { head.roundRect(1.3, -42.4, 3.6, 1.8, 0.9).fill(a.makeup === 'labios' ? mk : shade(skin, 0.68)); head.moveTo(1.4, -41.5).lineTo(4.8, -41.5).stroke({ width: 0.5, color: shade(skin, 0.5) }); }
  else if (ms === 'fina') head.moveTo(1.8, -41.6).lineTo(4.4, -41.7).stroke({ width: 0.6, color: lipC });
  else head.moveTo(1.5, -41.6).lineTo(4.6, -41.8).stroke({ width: lipW, color: lipC });
  const f = a.facial;
  if (f === 'barba') head.poly([-5, -44, -4, -39.5, 0, -38, 4, -39.5, 6, -43, 5.5, -41, 1, -40.5, -2, -41]).fill(hair);
  if (f === 'barba-larga') head.poly([-5, -44, -4, -37, 0, -34.5, 4, -37, 6, -43, 5.5, -41, 1, -40.5, -2, -41]).fill(hair);
  if (f === 'bigote' || f === 'candado') head.rect(1, -42.8, 4.6, 1.3).fill(hair);
  if (f === 'perilla' || f === 'candado') head.rect(2, -40.5, 2.4, 2.2).fill(hair);
  if (f === 'patillas') { head.rect(-5.6, -48, 1.6, 6).fill(hair); head.rect(4.8, -48, 1.2, 4).fill(hair); }
  if (f === 'barba' || f === 'barba-larga') for (let i = 0; i < 6; i++) head.moveTo(-3 + i * 1.5, -40.5).lineTo(-3.2 + i * 1.5, -38.8).stroke({ width: 0.3, color: shade(hair, 1.5), alpha: 0.5 });
  if (a.scar === 'mejilla') head.moveTo(3, -45).lineTo(5.5, -42.5).stroke({ width: 0.8, color: shade(skin, 0.6) });
  if (a.scar === 'ojo') head.moveTo(4, -50).lineTo(5, -44).stroke({ width: 0.8, color: shade(skin, 0.6) });
  if (a.scar === 'frente') head.moveTo(-2, -50.5).lineTo(3, -49.6).stroke({ width: 0.8, color: shade(skin, 0.6) });
  // Tatuaje facial: estilo (v0.9) en el color elegido.
  const ft = a.faceTattoo && a.faceTattoo !== 'ninguno' ? a.faceTattoo : a.tattoo ? 'linea' : '';
  if (ft === 'linea') head.moveTo(-5.5, -46).lineTo(-3.5, -42).stroke({ width: 1, color: tattooCol, alpha: 0.85 });
  if (ft === 'lagrimas') { for (const yy of [-44.6, -43.2]) head.poly([5.2, yy, 5.7, yy + 0.9, 4.7, yy + 0.9]).fill(tattooCol); }
  if (ft === 'codigo') for (let i = 0; i < 4; i++) head.rect(-5.2, -47 + i * 1.3, 1 + (i % 2), 0.5).fill(tattooCol);
  if (ft === 'puntos') for (let i = 0; i < 3; i++) head.circle(3.4 + i * 0.9, -49.6, 0.35).fill(tattooCol);
  if (ft === 'barras') for (let i = 0; i < 6; i++) head.rect(-5.4 + i * 0.5 + (i % 3) * 0.15, -46, 0.25 + (i % 2) * 0.2, 2.6).fill(tattooCol);
  if (ft === 'circuito') { head.moveTo(-5, -48).lineTo(-3.5, -46.5).lineTo(-3.5, -43).stroke({ width: 0.45, color: tattooCol }); head.circle(-3.5, -43, 0.5).fill(tattooCol); }
  if (ft === 'rayas') for (let i = 0; i < 3; i++) head.moveTo(3.2, -44.8 + i * 0.9).lineTo(5.6, -45.2 + i * 0.9).stroke({ width: 0.5, color: tattooCol });
  if (ft === 'luna') { head.circle(-4.2, -49.6, 1).fill(tattooCol); head.circle(-3.8, -49.9, 0.85).fill(skin); }
  if (ft === 'tribal') head.poly([-5.8, -49, -3.6, -47, -4.6, -44, -3.2, -42, -5.6, -43.5]).fill(tattooCol);
  const pierce = 0xd8dce8;
  if (a.piercing === 'nariz') head.circle(6.4, -43.8, 0.6).fill(pierce);
  if (a.piercing === 'septum') head.circle(5.8, -42.8, 0.7).stroke({ width: 0.5, color: pierce });
  if (a.piercing === 'ceja') head.circle(5.4, -48.8, 0.5).fill(pierce);
  if (a.piercing === 'labio') head.circle(3, -41, 0.5).fill(pierce);
  if (a.piercing === 'orejas') { head.circle(-6, -43.4, 0.8).stroke({ width: 0.5, color: pierce }); head.circle(-6.2, -45.5, 0.5).fill(pierce); }
  if (cr.has('cabeza')) { head.roundRect(-6.2, -49, 3, 5, 1).fill(metal); head.circle(-4.7, -46.5, 1).fill(accent); head.rect(-3, -40, 6, 1).fill({ color: metal, alpha: 0.8 }); head.moveTo(-6.2, -47).lineTo(-3.2, -47).stroke({ width: 0.3, color: metalDark }); }
  // Peinados (si no hay casco que los tape) con mechones con brillo para dar textura.
  const hs = a.hairStyle;
  const covered = hw === 'casco' || hw === 'casco-moto';
  const dye = a.hairTint ? HEX(a.hairTint) : hair;
  const hl = a.hairDye === 'mechas' ? dye : shade(hair, 1.6);
  if (!covered) {
    if (hs !== 'calvo' && hs !== 'rapado' && hs !== 'mohicano') { head.roundRect(-6.5, -53.5, 13, 5, 3).fill(hair); for (let i = 0; i < 5; i++) head.moveTo(-5 + i * 2.4, -53).quadraticCurveTo(-4 + i * 2.4, -51.5, -4.4 + i * 2.4, -49.6).stroke({ width: 0.35, color: hl, alpha: 0.45 }); }
    if (hs === 'rapado' || hs === 'mohicano') head.roundRect(-6, -52.4, 12, 3, 2).fill({ color: hair, alpha: 0.5 });
    if (hs === 'cresta') head.poly([-3, -52, -1, -59, 1, -58.5, 3, -60, 4, -52]).fill(hair);
    if (hs === 'mohicano') { head.poly([-5, -52, -3, -62, -1, -60, 1, -63, 3, -60, 5, -52]).fill(hair); head.moveTo(-2, -60).lineTo(0, -54).stroke({ width: 0.4, color: hl, alpha: 0.5 }); }
    if (hs === 'largo') head.roundRect(-7, -52, 4, 15, 2).fill(hair);
    if (hs === 'melena') { head.roundRect(-7.2, -52, 4.2, 18, 2).fill(hair); head.roundRect(4.6, -52, 2.6, 10, 1.5).fill(hair); }
    if (hs === 'coleta') { head.roundRect(-9, -50, 4, 3, 1.5).fill(hair); head.roundRect(-10.5, -48, 3, 9, 1.5).fill(hair); }
    if (hs === 'coleta-alta') { head.roundRect(-6, -58, 4, 5, 2).fill(hair); head.roundRect(-9, -57, 3.4, 14, 1.6).fill(hair); }
    if (hs === 'afro') { hairBack.circle(-1.2, -50.5, 10).fill(hair); hairBack.circle(-4.5, -46, 6).fill(hair); head.roundRect(-7, -56, 14, 6.5, 3.5).fill(hair); head.ellipse(-6.4, -49, 2.2, 4.2).fill(hair); for (let i = 0; i < 14; i++) hairBack.circle(-8 + (i * 37) % 15, -58 + (i * 23) % 14, 0.6).fill({ color: hl, alpha: 0.35 }); }
    if (hs === 'afro-corto') { hairBack.circle(-1, -51, 7.6).fill(hair); head.roundRect(-6.8, -55, 13.6, 5.5, 3).fill(hair); }
    if (hs === 'pompadour') { head.roundRect(-6, -58, 12, 6, 3).fill(hair); head.ellipse(4, -56, 4.5, 3).fill(hair); head.rect(-6.6, -51, 1.4, 4).fill({ color: hair, alpha: 0.6 }); head.moveTo(-4, -57).quadraticCurveTo(2, -59, 6, -56).stroke({ width: 0.4, color: hl, alpha: 0.5 }); }
    if (hs === 'bob') { hairBack.roundRect(-8, -54, 15, 14, 4).fill(hair); head.roundRect(-7, -54.5, 14, 5.5, 3).fill(hair); head.roundRect(4.4, -52, 2.8, 9, 1.4).fill(hair); }
    if (hs === 'media-melena') { hairBack.roundRect(-8, -53, 9, 17, 3).fill(hair); head.roundRect(4.8, -52, 2.2, 7, 1.2).fill(hair); }
    if (hs === 'trenza-larga') { hairBack.roundRect(-9, -50, 3.4, 4, 1.4).fill(hair); for (let i = 0; i < 6; i++) hairBack.ellipse(-8.6 + (i % 2) * 0.8, -45 + i * 3.4, 1.9, 2).fill(i % 2 ? shade(hair, 0.85) : hair); }
    if (hs === 'erizo') for (let i = -6; i <= 5; i += 2.2) head.poly([i - 1.2, -52, i, -57.5 - Math.abs(i) * 0.15, i + 1.2, -52]).fill(hair);
    if (hs === 'largo') hairBack.roundRect(-8, -52, 6, 17, 2.5).fill(hair);
    if (hs === 'melena') hairBack.roundRect(-8.4, -52, 7, 20, 3).fill(hair);
    if (hs === 'rastas') for (let i = -8; i <= -2; i += 2) hairBack.roundRect(i, -50, 1.6, 15, 0.8).fill(shade(hair, 0.9));
    if (hs === 'rizos') for (const [cx, cy] of [[-5, -53], [-2, -55], [1.5, -55], [4.5, -53], [-6.5, -49.5]]) { head.circle(cx, cy, 2.6).fill(hair); head.circle(cx + 0.6, cy - 0.6, 0.8).fill({ color: hl, alpha: 0.35 }); }
    if (hs === 'moño') head.circle(-3.5, -55, 3.4).fill(hair);
    if (hs === 'dos-moños') { head.circle(-4.5, -55, 2.8).fill(hair); head.circle(3.5, -55.5, 2.8).fill(hair); }
    if (hs === 'rastas') for (let i = -6; i <= -2; i += 2) head.roundRect(i, -50, 1.6, 12, 0.8).fill(hair);
    if (hs === 'trenzas') { head.roundRect(-7.6, -50, 2.2, 14, 1).fill(hair); head.roundRect(5.2, -50, 2.2, 12, 1).fill(hair); }
    if (hs === 'asimetrico') head.poly([-6.5, -53, 6.5, -53, 6.5, -46, 3, -49]).fill(hair);
    if (hs === 'undercut') { head.roundRect(-6.5, -55, 10, 4, 2).fill(hair); head.poly([3, -55, 7.5, -52, 6.5, -49, 2, -51]).fill(hair); }
    if (hs === 'flequillo') head.poly([-1, -53, 7, -53, 6.5, -48.6, 3, -49.8, 0, -48.8]).fill(hair);
    if (hs === 'puntas') head.poly([-6.5, -52, -5, -57, -3, -53.5, -1, -58, 1, -53.5, 3, -58, 4.5, -53.5, 6.5, -56, 6.5, -52]).fill(hair);
    if (hs === 'lobo') { head.roundRect(-7, -54.5, 14, 6, 3).fill(hair); head.poly([-7, -50, -8, -42, -5, -46]).fill(hair); head.poly([6, -50, 7, -44, 4.5, -47]).fill(hair); }
    if (a.hairTint && hs !== 'calvo' && (a.hairDye === 'puntas' || a.hairDye === 'raices')) {
      const at = a.hairDye === 'raices' ? -52.4 : /largo|melena|bob|lobo|ondas|rastas|coleta/.test(hs) ? -42.2 : -50.4;
      const shape = a.hairDye === 'puntas' && at > -45 ? hairBack : head;
      shape.moveTo(-5.6, at + .25).quadraticCurveTo(-.6, at - 1.05, 5, at + .1).stroke({ width: .82, color: dye, alpha: .8 });
    }

  }
  // ================================================================ prendas de cabeza y cara
  const visor = new Graphics();
  const hc = a.headColor ? HEX(a.headColor) : shade(accent, 0.6);
  const headItem = hw || (['gorra', 'capucha'].includes(a.accessory) ? a.accessory : '');
  const eyeItem = ew || (['gafas', 'visor', 'mascara'].includes(a.accessory) ? a.accessory : '');
  if (headItem === 'gorra') { visor.roundRect(-6.5, -55, 13, 5, 2.5).fill(hc).stroke(edge); visor.roundRect(3, -51.5, 7, 1.8, 0.8).fill(shade(hc, 0.75)); visor.circle(-1, -53.6, 0.9).fill(accent); }
  if (headItem === 'capucha') head.roundRect(-7.5, -54.5, 15, 6, 3).fill(hw ? hc : shade(jacket, 0.85));
  if (headItem === 'casco') { visor.roundRect(-7.2, -56, 14.4, 10, 5).fill(hc).stroke(edge); visor.roundRect(-1, -50, 8, 3.4, 1.2).fill({ color: 0x101820, alpha: 0.9 }); visor.rect(-7, -51, 2, 1).fill(accent); }
  if (headItem === 'casco-moto') { visor.roundRect(-7.6, -57, 15.2, 16, 6).fill(hc).stroke(edge); visor.roundRect(-2, -51.5, 9.4, 5, 2).fill({ color: 0x0a1018, alpha: 0.92 }); visor.rect(-1.6, -51, 8, 0.8).fill({ color: accent, alpha: 0.7 }); visor.rect(-7.6, -47, 15.2, 0.8).fill(shade(hc, 0.6)); }
  if (headItem === 'sombrero') { visor.ellipse(0, -52.5, 11, 2.6).fill(hc).stroke(edge); visor.roundRect(-5.5, -59, 11, 7, 2).fill(hc); visor.rect(-5.5, -54, 11, 1.2).fill(shade(hc, 0.6)); }
  if (headItem === 'bandana') { visor.roundRect(-6.6, -52.5, 13.2, 2.6, 1).fill(hc); visor.poly([-6.6, -51.5, -9.5, -49, -8, -48.5]).fill(hc); }
  if (headItem === 'gorro') { visor.roundRect(-6.8, -57, 13.6, 7, 3.5).fill(tex(fabricTexture('punto', hexOf(hc), a.accent, 13.6, 7))).stroke(edge); visor.rect(-6.8, -51.6, 13.6, 1.8).fill(shade(hc, 0.75)); }
  if (headItem === 'boina') { visor.ellipse(-1, -54.5, 8, 3.2).fill(hc).stroke(edge); visor.circle(-1, -57.4, 0.6).fill(shade(hc, 0.6)); }
  if (headItem === 'diadema-led') { visor.moveTo(-6.4, -50).quadraticCurveTo(0, -58, 6.4, -50).stroke({ width: 1.1, color: accent }); for (let i = 0; i < 4; i++) visor.circle(-4 + i * 2.6, -54.6 + Math.abs(i - 1.5) * 0.8, 0.5).fill(0xffffff); }
  if (eyeItem === 'gafas') { visor.roundRect(-1.8, -47.6, 3.4, 2.4, 0.8).fill(0x101018); visor.roundRect(3, -47.6, 3.2, 2.4, 0.8).fill(0x101018); visor.rect(1.6, -46.8, 1.4, 0.7).fill(0x101018); if (ew) visor.rect(-1.6, -47.4, 7.6, 0.6).fill({ color: accent, alpha: 0.6 }); }
  if (eyeItem === 'gafas-sol') { visor.roundRect(-2, -47.8, 3.8, 2.6, 1.2).fill(0x050508); visor.roundRect(3, -47.8, 3.6, 2.6, 1.2).fill(0x050508); visor.rect(1.8, -47, 1.2, 0.5).fill(0xc8ccd8); visor.rect(-1.4, -47.4, 1.2, 0.5).fill({ color: 0xffffff, alpha: 0.4 }); }
  if (eyeItem === 'monoculo') { visor.circle(4.9, -46.1, 1.9).fill({ color: accent, alpha: 0.35 }).stroke({ width: 0.6, color: metalLight }); visor.moveTo(6.8, -46).lineTo(7.4, -42).stroke({ width: 0.3, color: metalLight }); }
  if (eyeItem === 'visor') visor.roundRect(-2, -48, 9, 3, 1).fill({ color: accent, alpha: 0.85 });
  if (eyeItem === 'visor-tactico') { visor.roundRect(-3, -48.6, 10.4, 3.6, 1.2).fill({ color: 0x0a1018, alpha: 0.9 }).stroke(edge); for (let i = 0; i < 4; i++) visor.rect(-2 + i * 2.3, -47.6, 1.4, 1.2).fill({ color: accent, alpha: 0.8 }); visor.rect(-6.6, -47.5, 3.8, 1).fill(0x2a2a30); }
  if (eyeItem === 'mascara') visor.roundRect(-1, -43.5, 7.5, 4.5, 1.5).fill(0x202028);
  if (eyeItem === 'mascara-gas') { visor.roundRect(-1.5, -45, 8.4, 6.4, 2.4).fill(0x1a1a20).stroke(edge); visor.circle(5.6, -41.4, 1.8).fill(0x2a2a30); visor.circle(5.6, -41.4, 1.1).fill({ color: accent, alpha: 0.5 }); visor.roundRect(-1.2, -48, 8, 2.6, 1).fill({ color: 0x5a8aa8, alpha: 0.5 }); }
  if (eyeItem === 'bandana-cara') { visor.poly([-5.6, -44, 6.6, -44, 6.4, -40, 1, -37.6, -5.4, -40]).fill(tex(fabricTexture('cuadros', a.headColor || hexOf(shade(accent, 0.5)), '#101010', 12, 6))).stroke(edge); }
  if (eyeItem === 'mascara-demonio') { visor.roundRect(-5.6, -50, 12, 11, 3).fill(0xb01020).stroke(edge); visor.poly([-5, -50, -6.6, -55, -3, -50]).fill(0xe8e0d0); visor.poly([5, -50, 6.8, -55, 3, -50]).fill(0xe8e0d0); visor.rect(-1.4, -47.2, 2.6, 1).fill(0x050508); visor.rect(3.2, -47.2, 2.6, 1).fill(0x050508); for (let i = 0; i < 4; i++) visor.poly([0.6 + i * 1.2, -42, 1.2 + i * 1.2, -40.4, 1.8 + i * 1.2, -42]).fill(0xf0f0f0); }
  if (a.accessory === 'auriculares' && !hw) { visor.roundRect(-7.4, -48, 2.6, 5, 1).fill(0x202028); visor.moveTo(-6, -48).quadraticCurveTo(0, -57, 5.8, -50).stroke({ width: 1.2, color: 0x303038 }); visor.circle(-6.1, -45.5, 0.8).fill(accent); }
  const bodyY = -19 * (hf - 1);
  body.y = bodyY;
  body.addChild(armBack, torso, belt, hairBack, head, visor, armFront);
  root.addChild(legs, body);
  if (B === 'bajo') root.scale.set(0.96); if (B === 'alto') root.scale.set(1.02);
  return { root, legs, body, visor, legL, legR, kneeL:leftLeg.knee,kneeR:rightLeg.knee,footL:leftLeg.foot,footR:rightLeg.foot, armB: armBack, armF: armFront, hand: (armFront as any).hand, handB: (armBack as any).hand, bodyY };
}
