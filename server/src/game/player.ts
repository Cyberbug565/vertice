// Estado en memoria de una vida de personaje y su persistencia básica.
import { randomUUID } from 'node:crypto';
import {
  ATTRIBUTE_IDS, RULES, normalizeAppearance, carryCapacity, chromeCapacity, humanityBase, levelForXp, maxHp, maxStamina, validateAttributes, xpForLevel,
  LEVEL_GAINS, SKILL_MAX, legacySkillLevel, levelNeedsMult, skillBonus, skillLevelForXp, skillXpFor, WEAR_SLOTS,
  CHILDHOODS, CREATION_SKILL_MAX, CREATION_SKILL_POINTS, EVENTS, OBJECTIVES, WEAPON_SLOTS, newBody, woundList, effectiveBleed, painOf, twoHanded, MATRICES, SOCKET_BASE, SOCKET_MAX, type BodyPart, weaponSize, type BodyState, SKILL_POINT_CAP,
  type Appearance, type Attributes, type CharacterSheet, type Content, type JournalEntry, t,
} from '@vertice/shared';
import type { Db, Queryable } from '../db/db.js';
import { substanceEffects, type SubstanceUse } from './substances.js';
import { underworldStatus, type UnderworldState } from './underworld.js';
import { selectedCharacterId } from './accounts.js';
import { playedMs } from './records.js';

export interface ContractProgress { instanceId: string; contractId: string; version: number; state: 'active' | 'completed' | 'abandoned'; objectives: Record<string, boolean>; outcome?: string | null }

export interface PlayerState {
  playedMs?: number; playSessionAt?: number;
  downedBy?: { charId: string; name: string };
  charId: string; accountId: string; name: string; role: string; origin: string;
  attributes: Attributes; skills: Record<string, number>; appearance: Appearance;
  level: number; xp: number; roleRank: number; money: number; hp: number; stamina: number; luck: number; humanity: number;
  stance: 'avoid' | 'defend' | 'aggressive';
  zone: string; x: number; y: number;
  inventory: Map<string, number>;
  rep: Map<string, number>;
  flags: Map<string, { value: unknown; expiresAt: number | null }>;
  contracts: Map<string, ContractProgress>; // último progreso por encargo
  checks: Map<string, { success: boolean; roll: number; total: number }>;
  // ---- v0.2
  hunger: number; thirst: number; fatigue: number; wanted: number;
  profession: string; professionRank: number; professionXp: number; autoNeeds: boolean; activeJob: string | null;
  status: 'alive' | 'downed'; downedUntil: number; downedCause: string;
  sleeping: { quality: number; where: string; since: number } | null;
  cyber: CyberInstance[];
  humanityMax: number;
  // ---- v0.3
  equipped: string | null; netXp: number; netRank: number; ram: number; downedLethal: boolean;
  carrying: number | null; blindUntil: number; nextAttackAt: number;
  ambar: { id: string; plan: string; usesLeft: number; expiresAt: number } | null;
  // ---- v0.4
  skillXp: Record<string, number>; perks: string[]; skillPointsSpent: number;
  wear: Partial<Record<string, string>>;
  abilityCd: Record<string, number>; buffs: Record<string, number>;
  secondLifeAt: number; milagroAt: number; autoStimAt: number;
  houses: string[]; cars: { id: string; car: string }[]; driving: string | null;
  lastCombatAt: number; walked: number;
  revive?: { at: number; frac: number; why: string };
  /** v0.18 · Salud temporal de estimulantes: se va cuando pasa el efecto. */
  tempHp?: { amount: number; until: number };
  // ---- v0.5
  running: boolean; auto: { on: boolean; personality: string; status: string };
  // ---- v0.6
  body: BodyState;
  bio: { objective: string; childhood: string; event: string; done: boolean } | null;
  identified: { crime: string; district: string; at: number } | null;
  intel: Map<string, { name: string; zone: string; x: number; y: number; at: number; precise: boolean }>;
  substances: SubstanceUse;
  /** v0.7 · Ciberpsicosis: nivel 0–100, segundos acumulados por encima de 50, pico del episodio y bajada temporal de la capacidad de cromo. */
  psyche: { level: number; heavy: number; peak: number; debuff?: { amount: number; until: number }; episode?: { until: number; floor: number; grave: boolean }; episodes?: number };
  /** v0.8: matrices puestas en el zócalo y ranuras extra; Kairós encendido; progreso con las leyendas. */
  relics: { matrices: string[]; socketExtra: number };
  /** v0.9 · Escudo cinético restante. */
  shield?: number;
  kairos?: { tier: number; since: number };
  legends: Record<string, { trust: number; step: number; active: boolean; count: number; done?: boolean }>;
  underworld: UnderworldState;
}

export interface CyberInstance { id: string; def: string; location: 'inventory' | 'installed'; stolen: boolean; part?: string | null }

export const NET_RANKS = [0, 3, 8, 15, 25, 38, 55, 75, 100, 130, 170];
/** Partes visibles del cuerpo con cromo. */
export function chromeParts(c: Content, p: { cyber: CyberInstance[] }): string[] {
  const out = new Set<string>();
  for (const ci of p.cyber) {
    if (ci.location !== 'installed') continue;
    const d = c.cyberware.find((x) => x.id === ci.def);
    if (!d || d.visible === 'ninguna') continue;
    if (d.visible === 'brazo' || d.visible === 'pierna') out.add(ci.part ?? `${d.visible}_der`);
    else if (d.visible === 'piernas') { out.add('pierna_izq'); out.add('pierna_der'); }
    else out.add(d.visible);
  }
  return [...out];
}

/** Atributos, habilidades y modificadores efectivos (base + ciberware + oficio). */
export function skillLevel(p: PlayerState, id: string) { return skillLevelForXp(p.skillXp[id] ?? 0); }
/** Suma de las mejoras de los perks comprados y conjunto de efectos únicos (perks y ciberware). */
export function perkMods(c: Content, p: PlayerState) {
  const mods: Record<string, number> = {};
  const flags = new Set<string>();
  for (const id of p.perks) {
    const d = c.perks.find((x) => x.id === id);
    if (!d) continue;
    for (const [k, v] of Object.entries(d.mods)) mods[k] = (mods[k] ?? 0) + v;
    if (d.flag) flags.add(d.flag);
  }
  for (const ci of p.cyber) if (ci.location === 'installed') { const d = c.cyberware.find((x) => x.id === ci.def); if (d?.unique) flags.add(d.unique); }
  return { mods, flags };
}
/** Aspecto con la ropa puesta encima. */
/** Estilos de calzado antiguos → v0.9. */
const SHOE_STYLE: Record<string, string> = { calzado: 'botas', deportivas: 'zapatillas', zapatos: 'mocasines' };
export function wornAppearance(c: Content, p: PlayerState): Appearance {
  const a: any = { ...p.appearance };
  // v0.22 · Prendas 3D, ropa interior y partes al aire. Un hueco vacío ('') es que se ha quitado lo de serie.
  const worn = (slot: string) => { const id = p.wear[slot]; const it = id ? c.items.find((i) => i.id === id) : undefined; return it?.wear && (p.inventory.get(it.id) ?? 0) > 0 ? it : undefined; };
  const garments: string[] = [], bare = new Set<string>();
  const covered = new Set<string>();
  for (const slot of Object.keys(p.wear)) { const it = worn(slot); if (it?.wear?.also) for (const s2 of it.wear.also) covered.add(s2); }
  const off = (slot: string) => p.wear[slot] === '' && !covered.has(slot);
  if (off('torso_int') && !worn('torso_ext') || off('torso_ext') && !worn('torso_int')) bare.add('torso');
  for (const [slot, part] of [['piernas', 'piernas'], ['pies', 'pies'], ['cabeza', 'cabeza'], ['cara', 'cara'], ['manos', 'manos']] as const) if (off(slot)) bare.add(part);
  for (const slot of ['torso_int', 'torso_ext', 'piernas', 'pies', 'cabeza', 'cara', 'manos', 'accesorio']) {
    const it = worn(slot);
    if (!it?.wear?.style.startsWith('g:')) continue;
    garments.push(it.wear.style.slice(2));
    // Lo que tapa la prenda 3D no se dibuja con la ropa de serie (queda «al aire» debajo de la prenda).
    for (const s2 of [slot, ...(it.wear.also ?? [])]) bare.add(s2 === 'torso_int' || s2 === 'torso_ext' ? 'torso' : s2);
  }
  // Con una prenda 3D en el tronco, la de serie solo se queda si el otro hueco lleva ropa clásica.
  const classicTorso = ['torso_int', 'torso_ext'].some((s2) => worn(s2) && !worn(s2)!.wear!.style.startsWith('g:'));
  if (classicTorso) bare.delete('torso');
  for (const [slot, key] of [['interior_sup', 'underTop'], ['interior_inf', 'underBottom']] as const) {
    if (p.wear[slot] === '') { a[key] = ''; continue; }
    const it = worn(slot);
    if (it?.wear?.style.startsWith('u:')) { a[key] = it.wear.style.slice(2); a[key + 'Color'] = it.wear.color; }
  }
  if (garments.length) a.garments = garments.join(',');
  if (bare.size) a.bare = [...bare].join(',');
  for (const [slot, id] of Object.entries(p.wear)) {
    const it = id ? c.items.find((i) => i.id === id) : undefined;
    if (!it?.wear || (p.inventory.get(it.id) ?? 0) <= 0) continue;
    const w = it.wear;
    if (w.style.startsWith('g:') || w.style.startsWith('u:') || slot === 'accesorio') continue;
    const ww = w as typeof w & { pattern?: string; detail?: string; accent?: string };
    if (slot === 'torso_ext') { a.top = w.style; a.jacket = w.color; a.outer = w.style; a.topPattern = ww.pattern ?? 'liso'; a.topDetail = ww.detail ?? 'ninguno'; if (ww.accent) a.accent2 = ww.accent; }
    else if (slot === 'torso_int') { a.shirt = w.color; if (!p.wear.torso_ext || (p.inventory.get(p.wear.torso_ext) ?? 0) <= 0) { a.top = w.style; a.jacket = w.color; a.topPattern = ww.pattern ?? 'liso'; a.topDetail = ww.detail ?? 'ninguno'; if (ww.accent) a.accent2 = ww.accent; } }
    else if (slot === 'piernas') { a.pants = w.color; a.legwear = w.style; a.pantsPattern = ww.pattern ?? 'liso'; }
    else if (slot === 'pies') { a.shoes = w.color; a.shoeStyle = SHOE_STYLE[w.style] ?? w.style; }
    else if (slot === 'cabeza') { a.headwear = w.style; a.headColor = w.color; }
    else if (slot === 'cara') { a.eyewear = w.style; a.accessory = 'ninguno'; }
    else if (slot === 'manos') { a.gloves = w.style; a.gloveColor = w.color; } // v0.16 · guantes
    if (it.rarity === 'legendario' || it.rarity === 'epico') a.rarityGlow = it.rarity === 'legendario' ? '#ffd23f' : '#b46cff';
  }
  // v0.16 · Gama del cromo visible de cada parte (según el grado y la rareza del implante): chatarra barata hasta lujo.
  const tiers: Record<string, string> = {};
  const rank = (t: string) => ['chatarra', 'estandar', 'militar', 'lujo'].indexOf(t);
  for (const ci of p.cyber) {
    if (ci.location !== 'installed') continue;
    const d = c.cyberware.find((x) => x.id === ci.def);
    if (!d || d.visible === 'ninguna') continue;
    const r = d.rarity ?? '';
    const t = r === 'mitico' || r === 'legendario' || d.grade >= 5 ? 'lujo' : d.grade >= 4 || r === 'epico' ? 'militar' : d.grade >= 2 ? 'estandar' : 'chatarra';
    const parts = d.visible === 'brazo' || d.visible === 'pierna' ? [ci.part ?? `${d.visible}_der`] : d.visible === 'piernas' ? ['pierna_izq', 'pierna_der'] : [d.visible];
    for (const pt of parts) if (!tiers[pt] || rank(t) > rank(tiers[pt])) tiers[pt] = t;
  }
  if (Object.keys(tiers).length) a.chromeTier = tiers;
  return a;
}

export function effective(c: Content, p: PlayerState) {
  const attrs = { ...p.attributes } as Attributes;
  const skills: Record<string, number> = {};
  for (const s of c.skills) skills[s.id] = skillBonus(skillLevel(p, s.id));
  const pm = perkMods(c, p);
  const wearItems = Object.values(p.wear).map((id) => (id && (p.inventory.get(id) ?? 0) > 0 ? c.items.find((i) => i.id === id) : undefined)).filter((x): x is NonNullable<typeof x> => !!x?.wear);
  for (const it of wearItems) for (const [k, v] of Object.entries(it.wear!.mods.skills)) skills[k] = (skills[k] ?? 0) + v;
  let hpMax = maxHp(p.attributes), confront = 0, steal = 0, surgery = 0, chromeUsed = 0, load = 0;
  const needs = { hunger: 1, thirst: 1, fatigue: 1 };
  for (const ci of p.cyber) {
    if (ci.location !== 'installed') continue;
    const d = c.cyberware.find((x) => x.id === ci.def);
    if (!d) continue;
    chromeUsed += d.capacity; load += d.humanity;
    for (const [k, v] of Object.entries(d.effects.attrs ?? {})) (attrs as any)[k] = Math.min(10, ((attrs as any)[k] ?? 0) + v);
    for (const [k, v] of Object.entries(d.effects.skills ?? {})) skills[k] = (skills[k] ?? 0) + v;
    hpMax += d.effects.hpMax ?? 0; confront += d.effects.confront ?? 0; steal += d.effects.steal ?? 0; surgery += d.effects.surgery ?? 0;
    if (d.effects.needs) { needs.hunger *= d.effects.needs.hunger; needs.thirst *= d.effects.needs.thirst; needs.fatigue *= d.effects.needs.fatigue; }
  }
  // v0.8: matrices del zócalo neural (solo si el zócalo está instalado).
  const matrix = { rangedDmg: 0, aim: 0, hackImmune: false, cameraGhost: false, psyResist: 0, psyImmune: false, hackSpeed: 0, hackCost: 0, ramRegen: 1, ramBonus: 0, ramSave: 0, humanityBonus: 0, stopBleed: false, psyGain: 1, capBonus: 0, meleeDmg: 0, armor: 0 };
  if (p.cyber.some((ci) => ci.location === 'installed' && ci.def === 'zocalo-matrices')) for (const id of p.relics?.matrices ?? []) {
    const m = MATRICES[id]; if (!m) continue;
    chromeUsed += m.chrome; hpMax += m.hpMax ?? 0;
    if (m.stealth) skills.sigilo = (skills.sigilo ?? 0) + m.stealth;
    matrix.rangedDmg += m.rangedDmg ?? 0; matrix.meleeDmg += m.meleeDmg ?? 0; matrix.aim += m.aim ?? 0; matrix.armor += m.armor ?? 0;
    matrix.hackImmune ||= !!m.hackImmune; matrix.cameraGhost ||= !!m.cameraGhost; matrix.psyImmune ||= !!m.psyImmune; matrix.stopBleed ||= !!m.stopBleed;
    matrix.psyResist = Math.max(matrix.psyResist, m.psyResist ?? 0); matrix.hackSpeed = Math.max(matrix.hackSpeed, m.hackSpeed ?? 0); matrix.hackCost = Math.max(matrix.hackCost, m.hackCost ?? 0);
    matrix.ramRegen = Math.max(matrix.ramRegen, m.ramRegen ?? 1); matrix.ramBonus += m.ramBonus ?? 0; matrix.psyGain *= m.psyGain ?? 1; matrix.capBonus += m.capBonus ?? 0; matrix.ramSave += m.ramSave ?? 0; matrix.humanityBonus += m.humanityBonus ?? 0;
  }
  hpMax += 5 * (attrs.BODY - p.attributes.BODY) + 3 * (attrs.WILL - p.attributes.WILL);
  hpMax += LEVEL_GAINS.hp * (p.level - 1) + (pm.mods.hpMax ?? 0);
  confront += pm.mods.confront ?? 0; steal += pm.mods.steal ?? 0; surgery += pm.mods.surgery ?? 0;
  const lv = levelNeedsMult(p.level) * (1 - (pm.mods.needs ?? 0)) * (1 - wearItems.reduce((a, it) => a + it.wear!.mods.needs, 0));
  needs.hunger *= lv; needs.thirst *= lv; needs.fatigue *= lv;
  const prof = c.professions.find((x) => x.id === p.profession);
  const mods = prof?.mods ?? { confront: 0, steal: 0, sleepStreet: 0, rescue: false, corpDiscount: 0, speed: 0, bounty: 0, rummage: 0 };
  confront += mods.confront ?? 0; steal += mods.steal ?? 0;
  if (p.profession === 'tecnico' || p.profession === 'investigador') surgery += 0.01;
  for (const [it, q] of p.inventory) { if (q <= 0) continue; if (it === 'ganzua-electronica') steal += 2; }
  // Blindaje: la suma de la ropa puesta más el cromo subdérmico.
  let armor = wearItems.reduce((a, it) => a + (it.armor ?? 0), 0), carryBonus = wearItems.reduce((a, it) => a + it.wear!.mods.carry, 0) + (pm.mods.carry ?? 0), ram = 0;
  let speed = wearItems.reduce((a, it) => a + it.wear!.mods.speed, 0) + (pm.mods.speed ?? 0), meleeDmg = pm.mods.meleeDmg ?? 0, dodge = pm.mods.dodge ?? 0, carSpeed = pm.mods.carSpeed ?? 0, chromeBonus = pm.mods.chrome ?? 0;
  const integrated: string[] = [];
  let cyberRamSave = 0, ramPlus = 0, regen = 0, crit = 0, aimBonus = 0;
  // v0.9 · Capacidades especiales: perks, prendas con capacidad y pasivas de los implantes, todo en un mismo conjunto.
  const flags = new Set(pm.flags);
  for (const it of wearItems) {
    const m = it.wear!.mods;
    dodge += m.dodge ?? 0; hpMax += m.hpMax ?? 0; aimBonus += m.aim ?? 0; ramPlus += m.ramPlus ?? 0; cyberRamSave += m.ramSave ?? 0;
    const perk = (it.wear as any).perk; if (perk) flags.add(perk);
  }
  for (const ci of p.cyber) {
    if (ci.location !== 'installed') continue;
    const d = c.cyberware.find((x) => x.id === ci.def);
    if (!d) continue;
    armor += d.effects.armor ?? 0; carryBonus += d.effects.carry ?? 0; ram = Math.max(ram, d.effects.ram ?? 0); cyberRamSave += d.effects.ramSave ?? 0; ramPlus += d.effects.ramPlus ?? 0;
    regen += d.effects.regen ?? 0; crit += d.effects.crit ?? 0; if (d.passive) flags.add(d.passive);
    speed += d.effects.speed ?? 0; meleeDmg += d.effects.meleeDmg ?? 0; dodge += d.effects.dodge ?? 0; carSpeed += d.effects.carSpeed ?? 0;
    if (d.effects.weapon) integrated.push(d.effects.weapon);
  }
  if (!ram && p.role === 'netrunner' && (p.inventory.get('pulsera-interfaz') ?? 0) > 0) ram = 4;
  if (!ram && p.role === 'netrunner') ram = 3;
  if (ram) ram += pm.mods.ram ?? 0;
  // Arma equipada: debe estar en la mochila o ser un implante instalado; si no, puños.
  // v0.6: sin un brazo (o una mano) no se pueden usar armas a dos manos; sin los dos, ninguna.
  const lost = new Set(p.body?.lost ?? []);
  const armsLost = (['izq', 'der'] as const).filter((s) => lost.has(`brazo_${s}`) || lost.has(`mano_${s}`)).length;
  const legsLost = (['izq', 'der'] as const).filter((s) => lost.has(`pierna_${s}`)).length;
  const chromeBroken = chromeParts(c, p).filter((k) => (p.body?.wounds?.[k as BodyPart] ?? 0) >= 24);
  const brokenArms = chromeBroken.filter((k) => k.startsWith('brazo')).length, brokenLegs = chromeBroken.filter((k) => k.startsWith('pierna')).length;
  const eq = p.equipped && ((p.inventory.get(p.equipped) ?? 0) > 0 || integrated.includes(p.equipped)) ? c.items.find((i) => i.id === p.equipped) : undefined;
  const weapon = eq?.weapon && armsLost < 2 && !(armsLost && twoHanded(eq)) ? eq : undefined;
  const weight = [...p.inventory].reduce((acc, [d, q]) => acc + (c.items.find((i) => i.id === d)?.weight ?? 0) * q, 0);
  const carryMax = carryCapacity(attrs) + carryBonus;
  return { attrs, skills, hpMax, confront, defense: Math.floor(confront / 2), armor: armor + matrix.armor, steal, surgery, chromeUsed, chromeCapacity: chromeCapacity(attrs) + chromeBonus + matrix.capBonus - ((p.psyche?.debuff?.until ?? 0) > Date.now() ? p.psyche!.debuff!.amount : 0), humanityLoad: Math.max(0, load - matrix.humanityBonus), needs, mods, weapon, integrated, ram: ram ? ram + matrix.ramBonus + ramPlus : 0, ramSave: Math.min(0.6, matrix.ramSave + cyberRamSave), weight, carryMax,
    staminaMax: maxStamina(attrs) + LEVEL_GAINS.stamina * (p.level - 1) + (pm.mods.stamina ?? 0), speed, meleeDmg: meleeDmg + matrix.meleeDmg, dodge: Math.min(0.5, dodge), carSpeed, perk: pm.mods, flags, regen, crit, aimBonus,
    matrix, armsLost, legsLost, limbMult: (legsLost === 2 ? 0.25 : legsLost ? 0.5 : 1) * (brokenLegs === 2 ? 0.5 : brokenLegs ? 0.75 : 1), chromeBroken, brokenArms };
}
/** v0.7 · Un miembro de cromo muy dañado (24+) no sangra, pero falla hasta que lo repara un matasanos. */
export const CHROME_BROKEN_AT = 24;

const HEX = /^#[0-9a-fA-F]{6}$/;
const NAME = /^[\p{L}0-9 _'.-]{3,20}$/u;

export interface CreateCharacterInput { name: string; origin: string; role: string; attributes: Record<string, number>; appearance: Appearance; profession?: string; bio?: { objective: string; childhood: string; event: string }; skillPoints?: Record<string, number> }

export function validateCreate(c: Content, input: any): string | null {
  if (!input || typeof input !== 'object') return 'Datos inválidos';
  if (typeof input.name !== 'string' || !NAME.test(input.name.trim())) return 'El nombre debe tener 3–20 caracteres (letras, números, espacios)';
  if (!c.origins.some((o) => o.id === input.origin)) return 'Origen desconocido';
  if (!c.roles.some((r) => r.id === input.role)) return 'Rol desconocido';
  if (input.profession !== undefined && !c.professions.some((r) => r.id === input.profession)) return 'Oficio desconocido';
  const a = validateAttributes(input.attributes ?? {});
  if (a) return a;
  const ap = normalizeAppearance(input.appearance);
  if (!ap.ok) return ap.error;
  if (input.bio) {
    if (!OBJECTIVES.some((o) => o.id === input.bio.objective)) return 'Objetivo desconocido';
    if (!CHILDHOODS.some((o) => o.id === input.bio.childhood)) return 'Infancia desconocida';
    if (!EVENTS.some((o) => o.id === input.bio.event)) return 'Giro vital desconocido';
  }
  if (input.skillPoints) {
    const extra = (input.bio?.objective === 'maestria' ? 2 : 0) + (input.bio?.event === 'deuda' ? 2 : 0);
    let sum = 0;
    for (const [k, v] of Object.entries(input.skillPoints)) {
      if (!c.skills.some((s) => s.id === k) || !Number.isInteger(v) || (v as number) < 0 || (v as number) > CREATION_SKILL_MAX) return `Reparto de habilidades inválido (${k})`;
      sum += v as number;
    }
    if (sum > CREATION_SKILL_POINTS + extra) return `Solo puedes repartir ${CREATION_SKILL_POINTS + extra} puntos de habilidad`;
  }
  return null;
}

export async function createCharacter(db: Db, c: Content, accountId: string, input: CreateCharacterInput, contentVersion: string): Promise<{ id: string } | { error: string }> {
  const err = validateCreate(c, input);
  if (err) return { error: err };
  const role = c.roles.find((r) => r.id === input.role)!;
  const origin = c.origins.find((o) => o.id === input.origin)!;
  const attrs = Object.fromEntries(ATTRIBUTE_IDS.map((k) => [k, input.attributes[k]])) as Attributes;
  const skills: Record<string, number> = Object.fromEntries(c.skills.map((s) => [s.id, 0]));
  for (const [k, v] of Object.entries(role.skills)) skills[k] = v;
  for (const k of ['percepcion', 'atletismo', 'negociacion']) skills[k] = Math.max(skills[k], 1);
  // Niveles de partida: rol + infancia + giro vital + objetivo + puntos repartidos (máx. 20 con puntos).
  const lv: Record<string, number> = Object.fromEntries(Object.entries(skills).map(([k, v]) => [k, legacySkillLevel(v)]));
  const bio = input.bio;
  const add = (m: Record<string, number> | undefined) => { for (const [k, v] of Object.entries(m ?? {})) lv[k] = (lv[k] ?? 1) + v; };
  if (bio) { add(OBJECTIVES.find((o) => o.id === bio.objective)?.skills); add(CHILDHOODS.find((o) => o.id === bio.childhood)?.skills); add(EVENTS.find((o) => o.id === bio.event)?.skills); }
  add(input.skillPoints);
  const skillXp = Object.fromEntries(Object.entries(lv).map(([k, v]) => [k, skillXpFor(Math.min(SKILL_POINT_CAP, Math.max(1, v)))]));
  const bioMoney = bio ? (OBJECTIVES.find((o) => o.id === bio.objective)?.money ?? 0) + (CHILDHOODS.find((o) => o.id === bio.childhood)?.money ?? 0) + (EVENTS.find((o) => o.id === bio.event)?.money ?? 0) : 0;
  const startMoney = Math.max(20, origin.startMoney + bioMoney);
  const id = randomUUID();
  const items: [string, number][] = [['agente', 1], ['chaqueta', 1], ['camiseta-basica', 1], ['vaqueros', 1], ['deportivas', 1], ['navaja', 1], ['fideos-krill', 2], ['agua-filtrada', 2]];
  const wear = { torso_ext: 'chaqueta', torso_int: 'camiseta-basica', piernas: 'vaqueros', pies: 'deportivas' };
  if (role.id === 'netrunner') items.push(['pulsera-interfaz', 1]);
  if (role.id === 'tech' || role.id === 'nomad') items.push(['kit-herramientas', 1]);
  if (role.id === 'medtech') items.push(['estim', 2]);
  if (role.id === 'solo') items.push(['pistola-ligera', 1], ['bala-pistola', 24]);
  if (role.id === 'lawman') items.push(['taser', 1], ['carga-taser', 6]);
  if (role.id === 'nomad') items.push(['bate', 1]);
  const equipped = role.id === 'solo' ? 'pistola-ligera' : role.id === 'lawman' ? 'taser' : role.id === 'nomad' ? 'bate' : 'navaja';
  try {
    await db.tx(async (q) => {
      // Serializa la selección y creación de vidas dentro de la misma cuenta.
      await q.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE', [accountId]);
      await q.query(
        `INSERT INTO characters (id, account_id, name, origin, role, attributes, skills, appearance, money, hp, stamina, luck, humanity, zone_id, pos_x, pos_y, rules_version, content_version, profession, humanity_max)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$13)`,
        [id, accountId, input.name.trim(), origin.id, role.id, JSON.stringify(attrs), JSON.stringify(skills), JSON.stringify((normalizeAppearance(input.appearance) as any).value), 0,
          maxHp(attrs), maxStamina(attrs), attrs.LUCK, humanityBase(attrs.EMP), c.manifest.startZone, c.manifest.startAt[0] + 0.5, c.manifest.startAt[1] + 0.5, RULES.version, contentVersion, input.profession ?? 'vagabundo']);
      await q.query('INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,$3,$3,$4)', [`start-${id}`, id, startMoney, `Fondos iniciales (${origin.name})`]);
      await q.query('UPDATE characters SET money = $2, equipped = $3, skill_xp = $4, wear = $5, bio = $6 WHERE id = $1', [id, startMoney, equipped, JSON.stringify(skillXp), JSON.stringify(wear), bio ? JSON.stringify({ ...bio, done: false }) : null]);
      for (const [def, qty] of items) await q.query('INSERT INTO inventory_items (id, character_id, def_id, qty) VALUES ($1,$2,$3,$4)', [randomUUID(), id, def, qty]);
      await q.query('UPDATE accounts SET selected_character_id=$2 WHERE id=$1', [accountId, id]);
    });
  } catch (e: any) {
    if (/characters_name_alive_uq/.test(e.message ?? '') || /characters_name_alive_uq/.test(e.constraint ?? '')) return { error: 'Ese nombre ya está en uso' };
    throw e;
  }
  return { id };
}

export async function activeCharacterId(db: Queryable, accountId: string): Promise<string | null> {
  return selectedCharacterId(db, accountId);
}

export async function loadPlayer(db: Queryable, charId: string): Promise<PlayerState | null> {
  const r = await db.query<any>('SELECT * FROM characters WHERE id = $1', [charId]);
  const row = r.rows[0];
  if (!row || row.status === 'dead') return null;
  const [inv, rep, flags, prog, checks, cyber, houses, cars] = await Promise.all([
    db.query<any>('SELECT def_id, qty FROM inventory_items WHERE character_id = $1 AND qty > 0', [charId]),
    db.query<any>('SELECT faction_id, value FROM reputation WHERE character_id = $1', [charId]),
    db.query<any>('SELECT key, value, expires_at FROM character_flags WHERE character_id = $1', [charId]),
    db.query<any>(`SELECT p.*, i.objectives AS shared_obj FROM contract_progress p JOIN contract_instances i ON i.id = p.instance_id WHERE p.character_id = $1 ORDER BY p.updated_at ASC`, [charId]),
    db.query<any>('SELECT check_key, success, roll, total FROM skill_checks WHERE character_id = $1', [charId]),
    db.query<any>("SELECT id, def_id, location, stolen, part FROM cyberware_instances WHERE character_id = $1 AND location IN ('inventory','installed') ORDER BY created_at", [charId]),
    db.query<any>('SELECT house_id FROM houses_owned WHERE character_id = $1 ORDER BY bought_at', [charId]),
    db.query<any>('SELECT id, car_id FROM cars_owned WHERE character_id = $1 ORDER BY bought_at', [charId]),
  ]);
  // Personajes anteriores a la v0.4: las habilidades antiguas (0–6) pasan a niveles 1–25 y se viste la chaqueta.
  const skillXp: Record<string, number> = row.skill_xp ?? Object.fromEntries(Object.entries(row.skills ?? {}).map(([k, v]) => [k, skillXpFor(legacySkillLevel(Number(v)))]));
  const invMap = new Map<string, number>(inv.rows.map((x: any) => [x.def_id, x.qty]));
  const wear: Record<string, string> = row.wear ?? ((invMap.get('chaqueta') ?? 0) > 0 ? { torso_ext: 'chaqueta' } : {});
  const p: PlayerState = {
    playedMs: Number(row.played_ms ?? 0), playSessionAt: Date.now(),
    charId, accountId: row.account_id, name: row.name, role: row.role, origin: row.origin,
    attributes: row.attributes, skills: row.skills, appearance: row.appearance,
    level: row.level, xp: row.xp, roleRank: row.role_rank, money: Number(row.money), hp: row.hp, stamina: row.stamina, luck: row.luck, humanity: row.humanity,
    stance: row.stance, zone: row.zone_id, x: row.pos_x, y: row.pos_y,
    inventory: invMap,
    rep: new Map(rep.rows.map((x: any) => [x.faction_id, x.value])),
    flags: new Map(flags.rows.map((x: any) => [x.key, { value: x.value, expiresAt: x.expires_at ? new Date(x.expires_at).getTime() : null }])),
    contracts: new Map(),
    checks: new Map(checks.rows.map((x: any) => [x.check_key, { success: x.success, roll: x.roll, total: x.total }])),
    hunger: row.hunger, thirst: row.thirst, fatigue: row.fatigue, wanted: row.wanted,
    profession: row.profession, professionRank: row.profession_rank, professionXp: row.profession_xp, autoNeeds: row.auto_needs, activeJob: row.active_job,
    status: row.status === 'downed' ? 'downed' : 'alive', downedUntil: row.status === 'downed' ? Date.now() + (row.downed_left_ms ?? 30000) : 0, downedCause: row.downed_cause ?? 'heridas', downedBy: row.downed_by ?? undefined,
    sleeping: null,
    cyber: cyber.rows.map((x: any) => ({ id: x.id, def: x.def_id, location: x.location, stolen: x.stolen, part: x.part })),
    humanityMax: row.humanity_max ?? humanityBase(row.attributes.EMP),
    equipped: row.equipped ?? null, netXp: row.net_xp ?? 0, netRank: row.net_rank ?? 0, ram: 99, downedLethal: row.downed_lethal ?? true,
    carrying: null, blindUntil: 0, nextAttackAt: 0, ambar: null,
    skillXp, perks: row.perks ?? [], skillPointsSpent: row.skill_points_spent ?? 0, wear, abilityCd: {}, buffs: {},
    secondLifeAt: Number(row.second_life_at ?? 0), milagroAt: 0, autoStimAt: 0,
    houses: houses.rows.map((x: any) => x.house_id), cars: cars.rows.map((x: any) => ({ id: x.id, car: x.car_id })), driving: null, lastCombatAt: 0, walked: 0,
    running: false, auto: { on: !!row.autopilot?.on, personality: row.autopilot?.personality ?? 'responsable', status: '' },
    body: row.body ?? newBody(), bio: row.bio ?? null, identified: row.identified ?? null, intel: new Map(),
    substances: row.substance_use ?? {}, underworld: row.underworld ?? {}, psyche: { level: 0, heavy: 0, peak: 0, ...(row.psyche ?? {}) }, relics: { matrices: [], socketExtra: 0, ...(row.relics ?? {}) }, legends: row.legends ?? {},
  };
  for (const x of prog.rows) {
    p.contracts.set(x.contract_id, { instanceId: x.instance_id, contractId: x.contract_id, version: x.version, state: x.state, objectives: { ...x.shared_obj, ...x.objectives }, outcome: x.outcome });
  }
  return p;
}

export function flagValue(p: PlayerState, key: string): unknown {
  const f = p.flags.get(key);
  if (!f) return false;
  if (f.expiresAt && f.expiresAt < Date.now()) return false;
  return f.value;
}

/** Ganchos que rellena el mundo (datos que no viven en el estado del personaje). */
export const sheetHooks: { post: (p: PlayerState) => CharacterSheet['post']; objective: (p: PlayerState) => string } = { post: () => null, objective: () => '' };
/** Armas que llevas encima por tamaño (las integradas no cuentan). */
export function weaponSlotsOf(c: Content, p: PlayerState) {
  let grande = 0, pequena = 0;
  for (const [id, q] of p.inventory) { if (q <= 0) continue; const it = c.items.find((i) => i.id === id); const sz = it && weaponSize(it); if (sz === 'grande') grande += q; else if (sz === 'pequena') pequena += q; }
  return { grande, pequena, maxGrande: WEAPON_SLOTS.grande, maxPequena: WEAPON_SLOTS.pequena };
}
/** ¿Cabe un arma más? Devuelve el motivo si no. */
export function weaponFits(c: Content, p: PlayerState, itemId: string, qty = 1): string | null {
  const it = c.items.find((i) => i.id === itemId);
  const sz = it && weaponSize(it);
  if (!sz) return null;
  const s = weaponSlotsOf(c, p);
  if (sz === 'grande' && s.grande + qty > s.maxGrande) return `Ya llevas ${s.grande} armas largas (máximo ${s.maxGrande}). Guarda alguna en el maletero del coche o en tu piso franco.`;
  if (sz === 'pequena' && s.pequena + qty > s.maxPequena) return `Ya llevas ${s.pequena} armas cortas (máximo ${s.maxPequena}). Guarda alguna en el maletero del coche o en tu piso franco.`;
  return null;
}
/** Tiro apuntado: alcance de tiro seguro y tiempo quieto apuntando (mejoran con Armas a distancia y REF). */
export function aimOf(c: Content, p: PlayerState) {
  const ef = effective(c, p);
  const w = ef.weapon?.weapon;
  if (!w || w.kind !== 'ranged') return { range: 0, time: 0 };
  const lv = skillLevelForXp(p.skillXp.armas ?? 0);
  const aim = substanceEffects(c, p.substances).aim;
  const f = Math.max(0.2, Math.min(0.85, 0.3 + lv * 0.02 + ef.attrs.REF * 0.025 + (w.traits?.includes('inteligente') ? 0.1 : 0) + aim * 0.035));
  return { range: Math.round(w.range * f * 10) / 10, time: Math.round(Math.max(0.7, 2.4 - lv * 0.05 - ef.attrs.REF * 0.06 - aim * 0.12) * 10) / 10 };
}

export function buildSheet(c: Content, p: PlayerState): CharacterSheet {
  const ef = effective(c, p);
  const a = ef.attrs;
  return {
    id: p.charId, name: p.name, role: p.role, origin: p.origin, level: p.level, xp: p.xp, xpNext: xpForLevel(Math.min(RULES.levelMax, p.level + 1)), roleRank: p.roleRank,
    attributes: { ...a }, baseAttributes: { ...p.attributes }, skills: { ...ef.skills },
    xpLevelStart: xpForLevel(p.level),
    skillProg: c.skills.map((sk) => { const xp = p.skillXp[sk.id] ?? 0, lv = skillLevelForXp(xp); return { id: sk.id, name: sk.name, attr: sk.attr, level: lv, xp, from: skillXpFor(lv), to: lv >= SKILL_MAX ? skillXpFor(SKILL_MAX) : skillXpFor(lv + 1), bonus: ef.skills[sk.id] ?? 0 }; }),
    skillPoints: pointsAvailable(c, p).skill, perkPoints: pointsAvailable(c, p).perk, perks: [...p.perks],
    wear: { ...p.wear } as Record<string, string>, look: wornAppearance(c, p),
    abilities: [...p.cyber.filter((ci) => ci.location === 'installed').map((ci) => c.cyberware.find((d) => d.id === ci.def)).filter((d) => d?.ability).map((d) => ({ id: d!.id, name: d!.ability!.name, kind: d!.ability!.kind as string, cooldown: d!.ability!.cooldown, readyIn: Math.max(0, Math.round(((p.abilityCd[d!.id] ?? 0) - Date.now()) / 1000)) })),
      ...(p.cyber.some((ci) => ci.location === 'installed' && ci.def === 'zocalo-matrices') ? (p.relics?.matrices ?? []) : []).filter((id) => MATRICES[id]?.ability).flatMap((id) => [{ id, name: MATRICES[id].ability!.name, kind: MATRICES[id].ability!.kind as string, cooldown: MATRICES[id].ability!.cooldown, readyIn: Math.max(0, Math.round(((p.abilityCd[id] ?? 0) - Date.now()) / 1000)) },
        ...(MATRICES[id].ability2 ? [{ id: `${id}:ko`, name: MATRICES[id].ability2!.name, kind: MATRICES[id].ability2!.kind as string, cooldown: MATRICES[id].ability2!.cooldown, readyIn: Math.max(0, Math.round(((p.abilityCd[`${id}:ko`] ?? 0) - Date.now()) / 1000)) }] : [])])],
    buffs: Object.fromEntries(Object.entries(p.buffs).filter(([, u]) => u > Date.now()).map(([k, u]) => [k, Math.round((u - Date.now()) / 1000)])),
    houses: [...p.houses], cars: p.cars.map((x) => ({ id: x.id, car: x.car })), driving: p.driving,
    discovered: [...p.flags.keys()].filter((k) => k.startsWith('descubierto:')).map((k) => k.slice(12)),
    speedMult: Math.round((1 + ef.speed) * 100) / 100, dodge: Math.round(ef.dodge * 100), uniques: [...ef.flags],
    running: p.running, auto: { on: p.auto.on, personality: p.auto.personality }, post: sheetHooks.post(p),
    body: { wounds: { ...p.body.wounds } as Record<string, number>, lost: [...p.body.lost], bleed: Math.round(p.body.bleed * 10) / 10, chrome: chromeParts(c, p), broken: effective(c, p).chromeBroken,
      list: woundList(p.body).map((w) => ({ ...w, bleed: Math.round(effectiveBleed(w) * 1000) / 1000})), tempHp: p.tempHp ? Math.round(p.tempHp.amount) : 0, tempHpS: p.tempHp ? Math.max(0, Math.round((p.tempHp.until - Date.now()) / 1000)) : 0, pain: painOf(p.body) },
    weaponSlots: weaponSlotsOf(c, p), aim: aimOf(c, p),
    bio: p.bio ? { ...p.bio, objectiveName: OBJECTIVES.find((o) => o.id === p.bio!.objective)?.name ?? p.bio.objective, progress: sheetHooks.objective(p) } : null,
    identified: p.identified ? { crime: p.identified.crime, district: p.identified.district } : null,
    substances: substanceEffects(c, p.substances).status, underworld: underworldStatus(c, p.underworld),
    // Ciberpsicosis: no se nota nada hasta que es seria.
    psychosis: (p.psyche?.level ?? 0) >= 70 ? 'Ciberpsicosis' : (p.psyche?.level ?? 0) >= 45 ? 'Inestable' : (p.psyche?.level ?? 0) >= 15 ? 'Inquieto' : null,
    psyche: { level: Math.round(p.psyche?.level ?? 0), episode: p.psyche?.episode && p.psyche.episode.until > Date.now() ? { grave: p.psyche.episode.grave, days: Math.round(((p.psyche.episode.until - Date.now()) / (c.manifest.cityHourMs * 24)) * 10) / 10 } : null },
    matrices: { socket: p.cyber.some((ci) => ci.location === 'installed' && ci.def === 'zocalo-matrices'), slots: Math.min(SOCKET_MAX, SOCKET_BASE + (p.relics?.socketExtra ?? 0)), equipped: [...(p.relics?.matrices ?? [])] },
    kairos: p.kairos ? p.kairos.tier : 0, admin: !!(p as any).admin, chromeDebuff: (p.psyche?.debuff?.until ?? 0) > Date.now() ? { amount: p.psyche!.debuff!.amount, minutes: Math.ceil((p.psyche!.debuff!.until - Date.now()) / 60000) } : null,
    hp: Math.round(p.hp), hpMax: ef.hpMax, stamina: Math.round(p.stamina), staminaMax: ef.staminaMax, luck: p.luck, luckMax: p.attributes.LUCK,
    humanity: p.humanity, humanityMax: p.humanityMax, chromeCapacity: ef.chromeCapacity, chromeUsed: ef.chromeUsed,
    carry: Math.round(ef.weight * 10) / 10, carryMax: ef.carryMax,
    money: p.money, streetRep: p.rep.get('calle') ?? 0, reputation: Object.fromEntries([...p.rep].filter(([k]) => k !== 'calle')),
    inventory: [...p.inventory].filter(([, q]) => q > 0).map(([d, q]) => ({ def: d, name: c.items.find((i) => i.id === d)?.name ?? d, qty: q })),
    appearance: p.appearance, stance: p.stance,
    needs: { hunger: Math.round(p.hunger), thirst: Math.round(p.thirst), fatigue: Math.round(p.fatigue) },
    needsMult: ef.needs, status: p.status, downedLeft: p.status === 'downed' ? Math.max(0, Math.round((p.downedUntil - Date.now()) / 1000)) : 0,
    sleeping: p.sleeping ? { quality: Math.round(p.sleeping.quality * 100) / 100, where: p.sleeping.where } : null,
    wanted: Math.round(p.wanted * 10) / 10, autoNeeds: p.autoNeeds,
    profession: p.profession, professionName: c.professions.find((x) => x.id === p.profession)?.name ?? p.profession, professionRank: p.professionRank, professionXp: p.professionXp,
    activeJob: p.activeJob,
    cyber: p.cyber.map((ci) => { const d = c.cyberware.find((x) => x.id === ci.def)!; return { id: ci.id, def: ci.def, name: d.name, slot: d.slot, grade: d.grade, capacity: d.capacity, humanity: d.humanity, family: d.family, maker: d.maker, desc: d.desc, location: ci.location, stolen: ci.stolen, region: d.region ?? 'corteza', part: ci.part ?? null, ability: d.ability?.name, unique: d.unique, passive: d.passive, rarity: d.rarity ?? (d.grade <= 1 ? 'comun' : d.grade === 2 ? 'raro' : d.grade === 3 ? 'epico' : 'legendario') }; }),
    bonuses: { confront: ef.confront, defense: ef.defense, steal: ef.steal, surgery: Math.round(ef.surgery * 100) },
    weapon: ef.weapon?.weapon ? { id: ef.weapon.id, name: ef.weapon.name, kind: ef.weapon.weapon.kind, family: ef.weapon.weapon.family, damage: ef.weapon.weapon.damage, range: ef.weapon.weapon.range, cooldown: ef.weapon.weapon.cooldown, accuracy: ef.weapon.weapon.accuracy,
      ammo: ef.weapon.weapon.ammo, ammoName: ef.weapon.weapon.ammo ? c.items.find((i) => i.id === ef.weapon!.weapon!.ammo)?.name : undefined, ammoCount: ef.weapon.weapon.ammo ? p.inventory.get(ef.weapon.weapon.ammo) ?? 0 : undefined, nonlethal: ef.weapon.weapon.nonlethal, tech: ef.weapon.weapon.tech } : null,
    weapons: [...[...p.inventory].filter(([it, q]) => q > 0 && c.items.find((i) => i.id === it)?.weapon).map(([it]) => ({ id: it, name: c.items.find((i) => i.id === it)!.name, integrated: false })),
      ...ef.integrated.map((it) => ({ id: it, name: c.items.find((i) => i.id === it)!.name, integrated: true }))],
    armor: ef.armor, encumbrance: ef.weight > ef.carryMax * 1.5 ? 'sobrecargado' : ef.weight > ef.carryMax ? 'cargado' : 'normal', carrying: null,
    net: { rank: p.netRank, xp: p.netXp, xpNext: NET_RANKS[Math.min(NET_RANKS.length - 1, p.netRank + 1)], ram: Math.floor(Math.min(p.ram, ef.ram)), ramMax: ef.ram, canHack: ef.ram > 0 },
    ambar: p.ambar && p.ambar.expiresAt > Date.now() ? { plan: p.ambar.plan, name: c.ambar.find((x) => x.id === p.ambar!.plan)?.name ?? p.ambar.plan, usesLeft: p.ambar.usesLeft, expiresInMin: Math.round((p.ambar.expiresAt - Date.now()) / 60000) } : null,
    chrome: chromeParts(c, p),
  };
}

export function buildJournal(c: Content, p: PlayerState, participants: (instanceId: string) => number): JournalEntry[] {
  const out: JournalEntry[] = [];
  for (const cp of p.contracts.values()) {
    const def = c.contracts.find((k) => k.id === cp.contractId);
    if (!def) continue;
    out.push({
      contract: def.id, title: t(c, def.title), summary: t(c, def.summary), state: cp.state, outcome: cp.outcome ?? undefined,
      objectives: def.objectives.map((o) => ({ id: o.id, text: t(c, o.text), done: !!cp.objectives[o.id] })),
      participants: participants(cp.instanceId),
    });
  }
  return out;
}

export async function savePlayerVitals(db: Queryable, p: PlayerState) {
  await db.query(`UPDATE characters SET zone_id=$2, pos_x=$3, pos_y=$4, hp=$5, stamina=$6, luck=$7, stance=$8, hunger=$9, thirst=$10, fatigue=$11, wanted=$12,
     auto_needs=$13, active_job=$14, status=$15, downed_left_ms=$16, equipped=$17, net_xp=$18, net_rank=$19, downed_lethal=$20,
     skill_xp=$21, perks=$22, skill_points_spent=$23, wear=$24, second_life_at=$25, level=$26, xp=$27, autopilot=$28, body=$29, bio=$30, identified=$31, psyche=$32, relics=$33, legends=$34, played_ms=$35, downed_by=$36, downed_cause=$37 WHERE id=$1 AND status <> 'dead'`,
    [p.charId, p.zone, p.x, p.y, Math.round(p.hp), Math.round(p.stamina), p.luck, p.stance, p.hunger, p.thirst, p.fatigue, p.wanted, p.autoNeeds, p.activeJob,
      p.status, p.status === 'downed' ? Math.max(0, p.downedUntil - Date.now()) : null, p.equipped, p.netXp, p.netRank, p.downedLethal,
      JSON.stringify(p.skillXp), JSON.stringify(p.perks), p.skillPointsSpent, JSON.stringify(p.wear), p.secondLifeAt, p.level, p.xp, JSON.stringify({ on: p.auto.on, personality: p.auto.personality }), JSON.stringify(p.body), p.bio ? JSON.stringify(p.bio) : null, p.identified ? JSON.stringify(p.identified) : null, JSON.stringify(p.psyche), JSON.stringify(p.relics ?? { matrices: [], socketExtra: 0 }), JSON.stringify(p.legends ?? {}), playedMs(p), p.downedBy ? JSON.stringify(p.downedBy) : null, p.downedCause]);
}

/** Puntos de habilidad y de perk disponibles: se ganan al subir de nivel (y los de perk también cada 5 niveles de habilidad). */
export function pointsAvailable(c: Content, p: PlayerState) {
  const skillEarned = LEVEL_GAINS.skillPoints * (p.level - 1);
  // De habilidad: un punto de perk al llegar a 10, 15, 20 y 25 en cualquiera de ellas.
  const perkEarned = LEVEL_GAINS.perkPoints * (p.level - 1) + 1 + Object.values(p.skillXp).reduce((a, xp) => { const lv = skillLevelForXp(xp); return a + (lv >= 10 ? Math.floor(lv / 5) - 1 : 0); }, 0);
  const perkSpent = p.perks.reduce((a, id) => a + (c.perks.find((x) => x.id === id)?.cost ?? 0), 0);
  const bonus = p.bio?.done ? 2 : 0;
  return { skill: Math.max(0, skillEarned - p.skillPointsSpent), perk: Math.max(0, perkEarned + bonus - perkSpent) };
}

export function recomputeLevel(p: PlayerState) {
  const before = p.level;
  p.level = levelForXp(p.xp);
  return p.level > before;
}

/** v0.6 · Objetivo vital elegido al crear el personaje: progreso en texto y si ya se ha cumplido. */
export function objectiveStatus(p: PlayerState): { text: string; done: boolean } {
  const o = p.bio?.objective;
  switch (o) {
    case 'rico': return { text: `${p.money.toLocaleString('es-ES')} / 50.000 €$`, done: p.money >= 50000 };
    case 'leyenda': { const r = p.rep.get('calle') ?? 0; return { text: `Reputación callejera ${r} / 40`, done: r >= 40 }; }
    case 'cromo': { const n = p.cyber.filter((x) => x.location === 'installed').length; return { text: `${n} / 5 implantes`, done: n >= 5 }; }
    case 'hogar': return { text: p.houses.length ? 'Ya tienes casa' : 'Aún sin casa propia', done: p.houses.length > 0 };
    case 'maestria': { const best = Math.max(0, ...Object.values(p.skillXp).map((x) => skillLevelForXp(x))); return { text: `Mejor habilidad: nivel ${best} / 20`, done: best >= 20 }; }
    default: return { text: '', done: false };
  }
}
