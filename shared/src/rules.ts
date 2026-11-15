// Reglas de prototipo (sección 7, 9 y 11 del documento de diseño). Todos los valores son configurables.
export const ATTRIBUTE_IDS = ['INT', 'REF', 'DEX', 'TECH', 'COOL', 'WILL', 'LUCK', 'MOVE', 'BODY', 'EMP'] as const;
export type AttributeId = (typeof ATTRIBUTE_IDS)[number];
export type Attributes = Record<AttributeId, number>;

export const RULES = {
  version: 'reglas-0.1.0',
  creationPoints: 55,
  attrMin: 2,
  attrMax: 8,
  levelMax: 30,
  luckMaxSpendPerCheck: 4,
  tickRate: 20,
  snapshotEveryTicks: 2,
  walkSpeedBase: 2.6, // losetas/s con MOVE 5
  walkSpeedPerMove: 0.12,
} as const;

export function maxHp(a: Pick<Attributes, 'BODY' | 'WILL'>): number {
  return 25 + 5 * a.BODY + 3 * a.WILL;
}
export function maxStamina(a: Pick<Attributes, 'BODY' | 'WILL'>): number {
  return 40 + 4 * a.BODY + 2 * a.WILL;
}
export function carryCapacity(a: Pick<Attributes, 'BODY'>): number {
  return 20 + 6 * a.BODY;
}
export function chromeCapacity(a: Pick<Attributes, 'TECH' | 'BODY'>): number {
  return 18 + 2 * a.TECH + a.BODY;
}
export function humanityBase(empBase: number): number {
  return 10 * empBase;
}
export function walkSpeed(a: Pick<Attributes, 'MOVE'>): number {
  return RULES.walkSpeedBase + (a.MOVE - 5) * RULES.walkSpeedPerMove;
}

/** Humanidad tras cirugía: primero se aplica el nuevo máximo y después el coste transitorio. */
export function humanityAfterSurgery(current: number, base: number, persistentLoad: number, surgeryCost: number) {
  const max = base - persistentLoad;
  return { max, current: Math.max(0, Math.min(current, max) - surgeryCost) };
}

/** Umbral individual de inestabilidad T y estados (aviso, descompensación, crisis). */
export function instabilityThresholds(p: { will: number; humanity: number; humanityBase: number; chromeSaturationPct: number; bonus?: number }) {
  const raw = 55 + 2 * (p.will - 5) + Math.floor((12 * p.humanity) / p.humanityBase) - Math.floor(p.chromeSaturationPct / 10) + (p.bonus ?? 0);
  const T = Math.max(40, Math.min(70, raw));
  return { warning: T, decompensation: T + 15, crisis: T + 25 };
}

export function validateAttributes(a: Partial<Record<string, number>>): string | null {
  let sum = 0;
  for (const id of ATTRIBUTE_IDS) {
    const v = a[id];
    if (typeof v !== 'number' || !Number.isInteger(v)) return `Falta el atributo ${id}`;
    if (v < RULES.attrMin || v > RULES.attrMax) return `${id} debe estar entre ${RULES.attrMin} y ${RULES.attrMax}`;
    sum += v;
  }
  if (sum !== RULES.creationPoints) return `Debes repartir exactamente ${RULES.creationPoints} puntos (llevas ${sum})`;
  for (const k of Object.keys(a)) if (!(ATTRIBUTE_IDS as readonly string[]).includes(k)) return `Atributo desconocido ${k}`;
  return null;
}

// ---- Tiradas de habilidad: atributo + habilidad + 1d10 (+ Suerte reservada) ≥ dificultad ----
export interface CheckSpec { attr: AttributeId; skill: string; dv: number }

/** Resultado mínimo del dado necesario (1..10) o 11 si es imposible. */
export function minDieNeeded(attr: number, skill: number, dv: number, luck = 0, bonus = 0): number {
  return Math.max(1, dv - attr - skill - luck - bonus);
}
/** Probabilidad de éxito en [0,1]. */
export function checkChance(attr: number, skill: number, dv: number, luck = 0, bonus = 0): number {
  const need = minDieNeeded(attr, skill, dv, luck, bonus);
  if (need > 10) return 0;
  return (11 - need) / 10;
}
export function chanceBand(p: number): string {
  if (p >= 0.9) return 'casi segura';
  if (p >= 0.7) return 'probable';
  if (p >= 0.45) return 'incierta';
  if (p > 0) return 'difícil';
  return 'imposible';
}

// ---- Niveles ----
export function xpForLevel(level: number): number {
  // XP acumulada necesaria para alcanzar `level` (nivel 1 = 0).
  return Math.round(100 * (level - 1) * (1 + (level - 1) * 0.25));
}
export function levelForXp(xp: number): number {
  let l = 1;
  while (l < RULES.levelMax && xp >= xpForLevel(l + 1)) l++;
  return l;
}

// ---- Generador de números con semilla (mulberry32) para escenarios reproducibles ----
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
