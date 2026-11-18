// v0.6 · Daño por zonas del cuerpo, heridas, desangrado y amputaciones; tamaño de las armas (cuántas puedes llevar encima).
export const BODY_PARTS = ['cabeza', 'torso', 'brazo_izq', 'brazo_der', 'mano_izq', 'mano_der', 'pierna_izq', 'pierna_der'] as const;
export type BodyPart = (typeof BODY_PARTS)[number];
export const AIM_ZONES = ['torso', 'cabeza', 'brazos', 'manos', 'piernas'] as const;
export type AimZone = (typeof AIM_ZONES)[number];
export const PART_NAMES: Record<BodyPart, string> = { cabeza: 'cabeza', torso: 'torso', brazo_izq: 'brazo izquierdo', brazo_der: 'brazo derecho', mano_izq: 'mano izquierda', mano_der: 'mano derecha', pierna_izq: 'pierna izquierda', pierna_der: 'pierna derecha' };
/** Penalización para acertar al apuntar a una zona y multiplicador de daño. */
export const AIM: Record<AimZone, { penalty: number; mult: number }> = { torso: { penalty: 0, mult: 1 }, cabeza: { penalty: 4, mult: 2 }, brazos: { penalty: 2, mult: 0.7 }, manos: { penalty: 3, mult: 0.5 }, piernas: { penalty: 2, mult: 0.75 } };

/** v0.18 · Heridas al estilo de los juegos de supervivencia: cada herida es una entrada con su tipo, su hemorragia y
 *  lo que necesita para curarse. La salud no vuelve sola: solo con descanso y sin heridas abiertas. */
export const WOUND_KINDS = ['rasguno', 'corte', 'corte-profundo', 'bala', 'contusion', 'quemadura', 'amputacion'] as const;
export type WoundKind = (typeof WOUND_KINDS)[number];
export interface Wound {
  id: number; part: BodyPart; kind: WoundKind;
  /** Hemorragia actual sin tratar (salud por segundo). */
  bleed: number;
  /** Bala alojada (hay que sacarla con pinzas antes de que empiece a curar). */
  bullet?: boolean;
  sutured?: boolean; bandaged?: boolean;
  /** Horas de juego que lleva puesta la venda (a partir de 18 está sucia). */
  bandageAge?: number;
  /** Horas de juego de protección del desinfectante. */
  disinfected?: number;
  /** 0–1: a partir de 0,5 está infectada (quita salud y no cura). */
  infection: number;
  /** Progreso de la curación (0–1) y horas de juego que tarda en total. */
  heal: number; hours: number;
}
export interface WoundInfo { name: string; hours: number; bleed: number; needs: string }
export const WOUND_INFO: Record<WoundKind, WoundInfo> = {
  rasguno: { name: 'Rasguño', hours: 24, bleed: 0.03, needs: 'Una venda evita que se infecte.' },
  corte: { name: 'Corte', hours: 72, bleed: 0.12, needs: 'Venda para cortar la hemorragia; la sutura acelera la curación.' },
  'corte-profundo': { name: 'Corte profundo', hours: 336, bleed: 0.3, needs: 'Venda y sutura: sin sutura no cierra ni cura.' },
  bala: { name: 'Herida de bala', hours: 168, bleed: 0.2, needs: 'Sacar la bala con pinzas y vendar.' },
  contusion: { name: 'Contusión', hours: 24, bleed: 0, needs: 'Cura sola con el tiempo.' },
  quemadura: { name: 'Quemadura', hours: 72, bleed: 0, needs: 'Vendar y desinfectar.' },
  amputacion: { name: 'Amputación', hours: Infinity, bleed: 0.8, needs: 'Venda para cortar la hemorragia. No cura: un matasanos tiene que implantarte el miembro.' },
};
/** Tratamientos y el objeto que gasta cada uno (las pinzas no se gastan). */
export const TREATMENTS = {
  vendar: { item: 'venda', label: 'Vendar' },
  'cambiar-venda': { item: 'venda', label: 'Cambiar la venda' },
  suturar: { item: 'sutura', label: 'Suturar' },
  'sacar-bala': { item: 'pinzas', label: 'Sacar la bala' },
  desinfectar: { item: 'antiseptico', label: 'Desinfectar' },
} as const;
export type TreatmentId = keyof typeof TREATMENTS;
/** Qué tratamientos tienen sentido ahora mismo para una herida. */
export function treatmentsFor(w: Wound): TreatmentId[] {
  const out: TreatmentId[] = [];
  if (w.kind === 'contusion') return out;
  if (w.kind === 'bala' && w.bullet) out.push('sacar-bala');
  if (!w.bandaged) out.push('vendar'); else if ((w.bandageAge ?? 0) >= 18) out.push('cambiar-venda');
  if ((w.kind === 'corte' || w.kind === 'corte-profundo') && !w.sutured) out.push('suturar');
  if (w.kind !== 'amputacion' && !(w.disinfected && w.disinfected > 0)) out.push('desinfectar');
  return out;
}
/** Estado de una herida en una frase («sangrando», «bala alojada», «vendada», «infectada»…). */
export function woundStatus(w: Wound): string[] {
  const s: string[] = [];
  if (w.bleed > 0.01) s.push(w.bleed >= 0.25 ? 'sangra mucho' : 'sangra');
  if (w.bullet) s.push('bala alojada');
  if (w.sutured) s.push('suturada');
  if (w.bandaged) s.push((w.bandageAge ?? 0) >= 18 ? 'venda sucia' : 'vendada');
  if (w.infection >= 0.5) s.push('infectada'); else if (w.infection >= 0.2) s.push('se está infectando');
  if (w.disinfected && w.disinfected > 0) s.push('desinfectada');
  return s;
}

export interface BodyState { wounds: Partial<Record<BodyPart, number>>; lost: BodyPart[]; bleed: number; list?: Wound[]; seq?: number }
export const newBody = (): BodyState => ({ wounds: {}, lost: [], bleed: 0, list: [], seq: 0 });

/** Lista de heridas del cuerpo (las partidas antiguas solo tenían daño por zona: se convierten en contusiones). */
export function woundList(b: BodyState): Wound[] {
  if (!b.list) {
    b.list = []; b.seq = b.seq ?? 0;
    for (const [part, v] of Object.entries(b.wounds) as [BodyPart, number][]) if (v > 0 && !b.lost.includes(part)) b.list.push({ id: ++b.seq, part, kind: 'contusion', bleed: 0, infection: 0, heal: 0, hours: 24 });
    for (const part of b.lost) b.list.push({ id: ++b.seq, part, kind: 'amputacion', bleed: 0, bandaged: true, bandageAge: 0, infection: 0, heal: 0, hours: 0 });
  }
  return b.list;
}
/** Hemorragia que sale de verdad de una herida (las vendas cortan casi todas; el corte profundo necesita además sutura). */
export function effectiveBleed(w: Wound) {
  if (!w.bandaged) return w.bleed;
  if (w.kind === 'corte-profundo' && !w.sutured) return w.bleed * 0.25;
  if (w.kind === 'amputacion') return w.bleed * 0.05;
  return 0;
}
/** Dolor (0–100) según las heridas abiertas. */
export function painOf(b: BodyState) {
  const per: Record<WoundKind, number> = { rasguno: 4, corte: 12, 'corte-profundo': 25, bala: 28, contusion: 8, quemadura: 18, amputacion: 40 };
  return Math.min(100, Math.round(woundList(b).reduce((a, w) => a + per[w.kind] * (1 - w.heal * 0.7) * (w.infection >= 0.5 ? 1.4 : 1) * (w.bandaged ? 0.8 : 1), 0)));
}
/** Lo que cobra un matasanos por curarte las heridas (sin contar las amputaciones). */
export function woundCarePrice(p: { body: BodyState }, mult: number) {
  const cost: Record<WoundKind, number> = { rasguno: 15, corte: 60, 'corte-profundo': 160, bala: 140, contusion: 0, quemadura: 80, amputacion: 0 };
  return Math.max(40, Math.round(woundList(p.body).reduce((a, w) => a + cost[w.kind] * (w.infection >= 0.5 ? 1.6 : 1), 0) * mult));
}
/** ¿Hay alguna herida sin curar? (mientras la haya, la salud no se regenera). */
export const hasOpenWounds = (b: BodyState) => woundList(b).length > 0;


/** Zona alcanzada: la apuntada (con lado al azar) o una al azar ponderada por tamaño. */
export function hitPart(rng: () => number, aim?: AimZone): BodyPart {
  const side = rng() < 0.5 ? 'izq' : 'der';
  const zone = aim ?? (() => { const r = rng() * 100; return r < 40 ? 'torso' : r < 60 ? 'piernas' : r < 80 ? 'brazos' : r < 90 ? 'cabeza' : 'manos'; })();
  return zone === 'brazos' ? `brazo_${side}` : zone === 'manos' ? `mano_${side}` : zone === 'piernas' ? `pierna_${side}` : zone;
}
export const zoneOfPart = (p: BodyPart): AimZone => (p.startsWith('brazo') ? 'brazos' : p.startsWith('mano') ? 'manos' : p.startsWith('pierna') ? 'piernas' : (p as AimZone));
export const isLimb = (p: BodyPart) => p !== 'cabeza' && p !== 'torso';

/** Armas que caben encima: hasta 2 grandes (fusiles, escopetas, armas largas) y 3 pequeñas (pistolas, cuchillos, porras). */
export const WEAPON_SLOTS = { grande: 2, pequena: 3 } as const;
const BIG_FAMILIES = new Set(['Rifle', 'Escopeta', 'Ametralladora', 'Especial', 'Arco', 'Subfusil']);
const BIG_MELEE = new Set(['bate', 'machete', 'katana-termica', 'martillo-neumatico', 'lanza-electrica', 'hacha-plasma', 'espada-monofilamento', 'mazo', 'cuchilla-serrada']);
export function weaponSize(item: { id: string; weapon?: { family: string; kind: string } }): 'grande' | 'pequena' | null {
  if (!item.weapon || item.weapon.family === 'Implante') return null;
  if (item.weapon.kind === 'ranged') return BIG_FAMILIES.has(item.weapon.family) ? 'grande' : 'pequena';
  return BIG_MELEE.has(item.id) ? 'grande' : 'pequena';
}
/** Armas a dos manos: no se pueden usar sin los dos brazos. */
export const twoHanded = (item: { id: string; weapon?: { family: string; kind: string } }) => weaponSize(item) === 'grande';
