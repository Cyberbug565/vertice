// v0.44 · Accesorios de armas y estadísticas de 1 a 10. Cada arma de fuego tiene una clase (pistola, subfusil, fusil,
// tirador, escopeta, ametralladora, energía) y unos huecos para accesorios (mira, boca, cañón, empuñadura, culata,
// cargador, táctico). Cada accesorio solo encaja en ciertas clases y cambia los valores reales del arma (daño, alcance,
// precisión, cadencia, ruido y peso); de esos valores salen las seis barras: daño, alcance, manejo, movilidad, ruido y
// cadencia. El servidor usa los mismos cálculos en combate.

export const WEAPON_CLASSES = ['pistola', 'subfusil', 'fusil', 'tirador', 'escopeta', 'ametralladora', 'energia'] as const;
export type WeaponClass = (typeof WEAPON_CLASSES)[number];
export const CLASS_NAMES: Record<WeaponClass, string> = { pistola: 'Pistola', subfusil: 'Subfusil', fusil: 'Fusil', tirador: 'Tirador', escopeta: 'Escopeta', ametralladora: 'Ametralladora', energia: 'Energía' };

export const ATTACH_SLOTS = ['mira', 'boca', 'canon', 'empunadura', 'culata', 'cargador', 'tactico'] as const;
export type AttachSlot = (typeof ATTACH_SLOTS)[number];
export const SLOT_NAMES: Record<AttachSlot, string> = { mira: 'Mira', boca: 'Boca', canon: 'Cañón', empunadura: 'Empuñadura', culata: 'Culata', cargador: 'Cargador', tactico: 'Táctico' };

/** Arma → clase (las que no admiten accesorios no están). */
const BY_ID: Record<string, WeaponClass> = {
  'pistola-ligera': 'pistola', 'revolver-pesado': 'pistola', 'pistola-inteligente': 'pistola', 'pistola-silenciada': 'pistola', 'pistola-compacta': 'pistola', 'pistola-agujas': 'pistola',
  subfusil: 'subfusil', 'subfusil-compacto': 'subfusil', 'smg-inteligente': 'subfusil',
  'rifle-asalto': 'fusil', carabina: 'fusil',
  'rifle-precision': 'tirador', 'francotirador-inteligente': 'tirador', 'rifle-dardos': 'tirador', 'ballesta-carbono': 'tirador',
  'escopeta-corta': 'escopeta', 'escopeta-bombeo': 'escopeta', 'escopeta-tecnologica': 'escopeta',
  'ametralladora-ligera': 'ametralladora', 'ametralladora-rotativa': 'ametralladora',
  'pistola-plasma': 'energia', 'revolver-riel': 'energia', 'rifle-pulsos': 'energia', 'rifle-riel': 'energia',
};
export function weaponClass(item: { id: string; weapon?: { kind: string } }): WeaponClass | null {
  return item.weapon?.kind === 'ranged' ? BY_ID[item.id] ?? null : null;
}

/** Cambios en los valores reales del arma. dmg y rate son proporciones (+0,1 = +10 %; rate negativo = más rápido entre
 *  disparos); range en losetas; acc en puntos de precisión; noise proporción del ruido; weight en kg. */
export interface AttachMods { dmg?: number; range?: number; acc?: number; rate?: number; noise?: number; weight?: number }
export interface SightDef { zoom: number; reticle: 'hierro' | 'holo' | 'holo-anillo' | 'tactica' | 'francotirador' }
export interface AttachmentDef { slot: AttachSlot; classes: WeaponClass[]; mods: AttachMods; sight?: SightDef; legal?: boolean }

/** `silent`: el arma tiene el rasgo «silenciosa» (el combate ya divide su ruido entre tres; las barras lo cuentan). */
export interface WeaponValues { damage: [number, number]; range: number; accuracy: number; cooldown: number; noise: number; weight: number; silent?: boolean }
/** Valores del arma con sus accesorios puestos. */
export function moddedValues(item: { id: string; weight: number; weapon?: { damage: [number, number]; range: number; accuracy: number; cooldown: number; noise?: number; traits?: readonly string[] } }, atts: (AttachmentDef | undefined)[]): WeaponValues {
  const w = item.weapon!;
  let dmg = 0, range = 0, acc = 0, rate = 0, noise = 0, weight = 0;
  for (const a of atts) if (a) { dmg += a.mods.dmg ?? 0; range += a.mods.range ?? 0; acc += a.mods.acc ?? 0; rate += a.mods.rate ?? 0; noise += a.mods.noise ?? 0; weight += a.mods.weight ?? 0; }
  const k = Math.max(0.4, 1 + dmg);
  return {
    damage: [Math.max(1, Math.round(w.damage[0] * k)), Math.max(1, Math.round(w.damage[1] * k))],
    range: Math.max(2, +(w.range + range).toFixed(1)),
    accuracy: w.accuracy + acc,
    cooldown: +(w.cooldown * Math.max(0.5, 1 + rate)).toFixed(3),
    noise: Math.max(0.03, Math.min(1, (w.noise ?? 0.5) * Math.max(0.05, 1 + noise))),
    weight: Math.max(0.2, +(item.weight + weight).toFixed(2)),
    silent: !!w.traits?.includes('silenciosa'),
  };
}

export const STAT_NAMES = { dano: 'Daño', alcance: 'Alcance', manejo: 'Manejo', movilidad: 'Movilidad', ruido: 'Ruido', cadencia: 'Cadencia' } as const;
export type WeaponStats = Record<keyof typeof STAT_NAMES, number>;
const clamp = (v: number) => Math.max(1, Math.min(10, Math.round(v * 10) / 10));
/** Las seis barras de 1 a 10. Ruido: 10 = atronador, 1 = un susurro. */
export function weaponStats(v: WeaponValues): WeaponStats {
  const avg = (v.damage[0] + v.damage[1]) / 2;
  return {
    dano: clamp(1 + (avg - 6) / 3.4),
    alcance: clamp(1 + (v.range - 5) * 9 / 28),
    manejo: clamp(4 + v.accuracy * 1.1 - Math.max(0, v.weight - 2) * 0.35),
    movilidad: clamp(10.5 - v.weight * 0.85),
    ruido: clamp(v.noise * (v.silent ? 0.3 : 1) * 10),
    cadencia: clamp(1 + (1 / v.cooldown - 0.33) * 9 / 2.6),
  };
}
