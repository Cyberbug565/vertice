// Estado en memoria de una vida de personaje y su persistencia básica.
import { randomUUID } from 'node:crypto';
import {
  ATTRIBUTE_IDS, RULES, carryCapacity, chromeCapacity, humanityBase, levelForXp, maxHp, maxStamina, validateAttributes, xpForLevel,
  type Appearance, type Attributes, type CharacterSheet, type Content, type JournalEntry, t,
} from '@vertice/shared';
import type { Db, Queryable } from '../db/db.js';

export interface ContractProgress { instanceId: string; contractId: string; version: number; state: 'active' | 'completed' | 'abandoned'; objectives: Record<string, boolean>; outcome?: string | null }

export interface PlayerState {
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
}

export interface CyberInstance { id: string; def: string; location: 'inventory' | 'installed'; stolen: boolean }

/** Atributos, habilidades y modificadores efectivos (base + ciberware + oficio). */
export function effective(c: Content, p: PlayerState) {
  const attrs = { ...p.attributes } as Attributes;
  const skills = { ...p.skills };
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
  hpMax += 5 * (attrs.BODY - p.attributes.BODY) + 3 * (attrs.WILL - p.attributes.WILL);
  const prof = c.professions.find((x) => x.id === p.profession);
  const mods = prof?.mods ?? { confront: 0, steal: 0, sleepStreet: 0, rescue: false, corpDiscount: 0, speed: 0, bounty: 0, rummage: 0 };
  confront += mods.confront ?? 0; steal += mods.steal ?? 0;
  if (p.profession === 'tecnico' || p.profession === 'investigador') surgery += 0.01;
  for (const [it, q] of p.inventory) { if (q <= 0) continue; if (it === 'ganzua-electronica') steal += 2; }
  const weapon = Math.max(0, ...[...p.inventory].filter(([, q]) => q > 0).map(([it]) => c.items.find((i) => i.id === it)?.category === 'arma' ? c.items.find((i) => i.id === it)?.confront ?? 0 : 0));
  const armor = (p.inventory.get('chaleco-balistico') ?? 0) > 0 ? 2 : 0;
  return { attrs, skills, hpMax, confront: confront + weapon, defense: armor + Math.floor(confront / 2), steal, surgery, chromeUsed, chromeCapacity: chromeCapacity(attrs), humanityLoad: load, needs, mods };
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const NAME = /^[\p{L}0-9 _'.-]{3,20}$/u;

export interface CreateCharacterInput { name: string; origin: string; role: string; attributes: Record<string, number>; appearance: Appearance; profession?: string }

export function validateCreate(c: Content, input: any): string | null {
  if (!input || typeof input !== 'object') return 'Datos inválidos';
  if (typeof input.name !== 'string' || !NAME.test(input.name.trim())) return 'El nombre debe tener 3–20 caracteres (letras, números, espacios)';
  if (!c.origins.some((o) => o.id === input.origin)) return 'Origen desconocido';
  if (!c.roles.some((r) => r.id === input.role)) return 'Rol desconocido';
  if (input.profession !== undefined && !c.professions.some((r) => r.id === input.profession)) return 'Oficio desconocido';
  const a = validateAttributes(input.attributes ?? {});
  if (a) return a;
  const ap = input.appearance;
  if (!ap || !['skin', 'hair', 'jacket', 'accent'].every((k) => typeof ap[k] === 'string' && HEX.test(ap[k]))) return 'Aspecto inválido';
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
  const id = randomUUID();
  const items: [string, number][] = [['agente', 1], ['chaqueta', 1], ['navaja', 1], ['fideos-krill', 2], ['agua-filtrada', 2]];
  if (role.id === 'netrunner') items.push(['pulsera-interfaz', 1]);
  if (role.id === 'tech' || role.id === 'nomad') items.push(['kit-herramientas', 1]);
  if (role.id === 'medtech') items.push(['estim', 2]);
  try {
    await db.tx(async (q) => {
      await q.query(
        `INSERT INTO characters (id, account_id, name, origin, role, attributes, skills, appearance, money, hp, stamina, luck, humanity, zone_id, pos_x, pos_y, rules_version, content_version, profession, humanity_max)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$13)`,
        [id, accountId, input.name.trim(), origin.id, role.id, JSON.stringify(attrs), JSON.stringify(skills), JSON.stringify(input.appearance), 0,
          maxHp(attrs), maxStamina(attrs), attrs.LUCK, humanityBase(attrs.EMP), c.manifest.startZone, c.manifest.startAt[0] + 0.5, c.manifest.startAt[1] + 0.5, RULES.version, contentVersion, input.profession ?? 'vagabundo']);
      await q.query('INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,$3,$3,$4)', [`start-${id}`, id, origin.startMoney, `Fondos iniciales (${origin.name})`]);
      await q.query('UPDATE characters SET money = $2 WHERE id = $1', [id, origin.startMoney]);
      for (const [def, qty] of items) await q.query('INSERT INTO inventory_items (id, character_id, def_id, qty) VALUES ($1,$2,$3,$4)', [randomUUID(), id, def, qty]);
    });
  } catch (e: any) {
    if (/characters_one_active_uq/.test(e.message ?? '') || /characters_one_active_uq/.test(e.constraint ?? '')) return { error: 'Ya tienes un personaje vivo en esta cuenta' };
    if (/characters_name_alive_uq/.test(e.message ?? '') || /characters_name_alive_uq/.test(e.constraint ?? '')) return { error: 'Ese nombre ya está en uso' };
    throw e;
  }
  return { id };
}

export async function activeCharacterId(db: Queryable, accountId: string): Promise<string | null> {
  const r = await db.query<{ id: string }>("SELECT id FROM characters WHERE account_id = $1 AND status <> 'dead'", [accountId]);
  return r.rows[0]?.id ?? null;
}

export async function loadPlayer(db: Queryable, charId: string): Promise<PlayerState | null> {
  const r = await db.query<any>('SELECT * FROM characters WHERE id = $1', [charId]);
  const row = r.rows[0];
  if (!row || row.status === 'dead') return null;
  const [inv, rep, flags, prog, checks, cyber] = await Promise.all([
    db.query<any>('SELECT def_id, qty FROM inventory_items WHERE character_id = $1 AND qty > 0', [charId]),
    db.query<any>('SELECT faction_id, value FROM reputation WHERE character_id = $1', [charId]),
    db.query<any>('SELECT key, value, expires_at FROM character_flags WHERE character_id = $1', [charId]),
    db.query<any>(`SELECT p.*, i.objectives AS shared_obj FROM contract_progress p JOIN contract_instances i ON i.id = p.instance_id WHERE p.character_id = $1 ORDER BY p.updated_at ASC`, [charId]),
    db.query<any>('SELECT check_key, success, roll, total FROM skill_checks WHERE character_id = $1', [charId]),
    db.query<any>("SELECT id, def_id, location, stolen FROM cyberware_instances WHERE character_id = $1 AND location IN ('inventory','installed') ORDER BY created_at", [charId]),
  ]);
  const p: PlayerState = {
    charId, accountId: row.account_id, name: row.name, role: row.role, origin: row.origin,
    attributes: row.attributes, skills: row.skills, appearance: row.appearance,
    level: row.level, xp: row.xp, roleRank: row.role_rank, money: Number(row.money), hp: row.hp, stamina: row.stamina, luck: row.luck, humanity: row.humanity,
    stance: row.stance, zone: row.zone_id, x: row.pos_x, y: row.pos_y,
    inventory: new Map(inv.rows.map((x: any) => [x.def_id, x.qty])),
    rep: new Map(rep.rows.map((x: any) => [x.faction_id, x.value])),
    flags: new Map(flags.rows.map((x: any) => [x.key, { value: x.value, expiresAt: x.expires_at ? new Date(x.expires_at).getTime() : null }])),
    contracts: new Map(),
    checks: new Map(checks.rows.map((x: any) => [x.check_key, { success: x.success, roll: x.roll, total: x.total }])),
    hunger: row.hunger, thirst: row.thirst, fatigue: row.fatigue, wanted: row.wanted,
    profession: row.profession, professionRank: row.profession_rank, professionXp: row.profession_xp, autoNeeds: row.auto_needs, activeJob: row.active_job,
    status: row.status === 'downed' ? 'downed' : 'alive', downedUntil: row.status === 'downed' ? Date.now() + (row.downed_left_ms ?? 30000) : 0, downedCause: 'heridas',
    sleeping: null,
    cyber: cyber.rows.map((x: any) => ({ id: x.id, def: x.def_id, location: x.location, stolen: x.stolen })),
    humanityMax: row.humanity_max ?? humanityBase(row.attributes.EMP),
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

export function buildSheet(c: Content, p: PlayerState): CharacterSheet {
  const ef = effective(c, p);
  const a = ef.attrs;
  const weight = [...p.inventory].reduce((s, [d, q]) => s + (c.items.find((i) => i.id === d)?.weight ?? 0) * q, 0);
  return {
    id: p.charId, name: p.name, role: p.role, origin: p.origin, level: p.level, xp: p.xp, xpNext: xpForLevel(Math.min(RULES.levelMax, p.level + 1)), roleRank: p.roleRank,
    attributes: { ...a }, baseAttributes: { ...p.attributes }, skills: { ...ef.skills },
    hp: p.hp, hpMax: ef.hpMax, stamina: p.stamina, staminaMax: maxStamina(a), luck: p.luck, luckMax: p.attributes.LUCK,
    humanity: p.humanity, humanityMax: p.humanityMax, chromeCapacity: ef.chromeCapacity, chromeUsed: ef.chromeUsed,
    carry: Math.round(weight * 10) / 10, carryMax: carryCapacity(a),
    money: p.money, streetRep: p.rep.get('calle') ?? 0, reputation: Object.fromEntries([...p.rep].filter(([k]) => k !== 'calle')),
    inventory: [...p.inventory].filter(([, q]) => q > 0).map(([d, q]) => ({ def: d, name: c.items.find((i) => i.id === d)?.name ?? d, qty: q })),
    appearance: p.appearance, stance: p.stance,
    needs: { hunger: Math.round(p.hunger), thirst: Math.round(p.thirst), fatigue: Math.round(p.fatigue) },
    needsMult: ef.needs, status: p.status, downedLeft: p.status === 'downed' ? Math.max(0, Math.round((p.downedUntil - Date.now()) / 1000)) : 0,
    sleeping: p.sleeping ? { quality: Math.round(p.sleeping.quality * 100) / 100, where: p.sleeping.where } : null,
    wanted: Math.round(p.wanted * 10) / 10, autoNeeds: p.autoNeeds,
    profession: p.profession, professionName: c.professions.find((x) => x.id === p.profession)?.name ?? p.profession, professionRank: p.professionRank, professionXp: p.professionXp,
    activeJob: p.activeJob,
    cyber: p.cyber.map((ci) => { const d = c.cyberware.find((x) => x.id === ci.def)!; return { id: ci.id, def: ci.def, name: d.name, slot: d.slot, grade: d.grade, capacity: d.capacity, humanity: d.humanity, family: d.family, maker: d.maker, desc: d.desc, location: ci.location, stolen: ci.stolen }; }),
    bonuses: { confront: ef.confront, defense: ef.defense, steal: ef.steal, surgery: Math.round(ef.surgery * 100) },
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
     auto_needs=$13, active_job=$14, status=$15, downed_left_ms=$16 WHERE id=$1 AND status <> 'dead'`,
    [p.charId, p.zone, p.x, p.y, Math.round(p.hp), Math.round(p.stamina), p.luck, p.stance, p.hunger, p.thirst, p.fatigue, p.wanted, p.autoNeeds, p.activeJob,
      p.status, p.status === 'downed' ? Math.max(0, p.downedUntil - Date.now()) : null]);
}

export function recomputeLevel(p: PlayerState) {
  const before = p.level;
  p.level = levelForXp(p.xp);
  return p.level > before;
}
