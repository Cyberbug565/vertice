// v0.6 · Daño por zonas del cuerpo, heridas, desangrado y amputaciones; tamaño de las armas (cuántas puedes llevar encima).
export const BODY_PARTS = ['cabeza', 'torso', 'brazo_izq', 'brazo_der', 'mano_izq', 'mano_der', 'pierna_izq', 'pierna_der'] as const;
export type BodyPart = (typeof BODY_PARTS)[number];
export const AIM_ZONES = ['torso', 'cabeza', 'brazos', 'manos', 'piernas'] as const;
export type AimZone = (typeof AIM_ZONES)[number];
export const PART_NAMES: Record<BodyPart, string> = { cabeza: 'cabeza', torso: 'torso', brazo_izq: 'brazo izquierdo', brazo_der: 'brazo derecho', mano_izq: 'mano izquierda', mano_der: 'mano derecha', pierna_izq: 'pierna izquierda', pierna_der: 'pierna derecha' };
/** Penalización para acertar al apuntar a una zona y multiplicador de daño. */
export const AIM: Record<AimZone, { penalty: number; mult: number }> = { torso: { penalty: 0, mult: 1 }, cabeza: { penalty: 4, mult: 2 }, brazos: { penalty: 2, mult: 0.7 }, manos: { penalty: 3, mult: 0.5 }, piernas: { penalty: 2, mult: 0.75 } };

export interface BodyState { wounds: Partial<Record<BodyPart, number>>; lost: BodyPart[]; bleed: number }
export const newBody = (): BodyState => ({ wounds: {}, lost: [], bleed: 0 });

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
const BIG_MELEE = new Set(['bate', 'machete', 'katana-termica', 'martillo-neumatico', 'lanza-electrica', 'hacha-plasma', 'espada-monofilamento']);
export function weaponSize(item: { id: string; weapon?: { family: string; kind: string } }): 'grande' | 'pequena' | null {
  if (!item.weapon || item.weapon.family === 'Implante') return null;
  if (item.weapon.kind === 'ranged') return BIG_FAMILIES.has(item.weapon.family) ? 'grande' : 'pequena';
  return BIG_MELEE.has(item.id) ? 'grande' : 'pequena';
}
/** Armas a dos manos: no se pueden usar sin los dos brazos. */
export const twoHanded = (item: { id: string; weapon?: { family: string; kind: string } }) => weaponSize(item) === 'grande';
