// Esquemas validables del contenido del mundo. El motor no conoce lugares concretos: todo vive en /content.
import { z } from 'zod';
import { ATTRIBUTE_IDS } from './rules.js';

const xy = z.tuple([z.number().int(), z.number().int()]);
const rect = z.tuple([z.number().int(), z.number().int(), z.number().int().positive(), z.number().int().positive()]);
/** v0.6: verde (protected, solo el inicio y tu casa), amarilla (public, vigilada), roja (disputed) y negra (lawless, sin ley). */
export const DangerLevel = z.enum(['protected', 'public', 'disputed', 'lawless']);
export type DangerLevel = z.infer<typeof DangerLevel>;

export const GROUND_TYPES = ['void', 'asphalt', 'sidewalk', 'plaza', 'market', 'dirt', 'water', 'bridge', 'wood', 'tile', 'metal', 'crosswalk', 'deck', 'gravel', 'grass', 'sand', 'alley', 'data', 'grid'] as const;
export type GroundType = (typeof GROUND_TYPES)[number];
export const BLOCKING_GROUND: ReadonlySet<GroundType> = new Set(['void', 'water']);

export const ZoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['exterior', 'interior']),
  width: z.number().int().positive().max(1024),
  height: z.number().int().positive().max(1024),
  chunkSize: z.number().int().positive().default(32),
  danger: DangerLevel,
  base: z.enum(GROUND_TYPES),
  wallColor: z.string().optional(),
  ground: z.array(z.object({ type: z.enum(GROUND_TYPES), rect })).default([]),
  blocks: z.array(z.object({ type: z.enum(['fence', 'wall', 'barrier', 'counter', 'furniture']), rect, height: z.number().default(1), color: z.string().optional() })).default([]),
  buildings: z.array(z.object({
    id: z.string(), name: z.string().optional(), rect, height: z.number().positive(),
    style: z.enum(['mega', 'block', 'shop', 'club', 'clinic', 'industrial', 'tower', 'arcology', 'spire', 'glass']),
    color: z.string(), sign: z.string().optional(), signColor: z.string().optional(),
  })).default([]),
  props: z.array(z.object({ type: z.enum(['stall', 'lamp', 'crate', 'bench', 'plant', 'vending', 'car', 'neon', 'table', 'bed', 'screen', 'pipe', 'holo', 'antenna', 'shelf', 'trash', 'tent', 'smokestack', 'wreck', 'billboard', 'palm', 'neonstrip', 'crane', 'window', 'column', 'sofa', 'desk', 'locker', 'fridge', 'planter', 'arcade', 'barrel', 'dumpster', 'hydrant', 'kiosk', 'jersey', 'busstop', 'monolith', 'datastream', 'glitch', 'node', 'codewall', 'citylights']), at: xy, blocking: z.boolean().default(true), color: z.string().optional(), text: z.string().optional(), z: z.number().optional() })).default([]),
  skybridges: z.array(z.object({ from: xy, to: xy, z: z.number(), color: z.string().optional() })).default([]),
  doors: z.array(z.object({ id: z.string(), name: z.string(), at: xy, to: z.object({ zone: z.string(), at: xy }), danger: DangerLevel.optional(), hidden: z.string().optional(),
    /** v0.9 · Rótulo sobre la puerta (COMISARÍA, FARMACIA, MATASANOS…). */
    sign: z.string().optional(), signColor: z.string().optional(), signIcon: z.string().optional() })).default([]),
  objects: z.array(z.object({
    id: z.string(), name: z.string(), at: xy,
    kind: z.enum(['generator', 'terminal', 'crates', 'elevator', 'board', 'vending', 'shop', 'jobboard', 'bountyboard', 'bed', 'trash', 'workplace', 'marketterm', 'atm', 'ambar', 'bribe', 'housing', 'dealer', 'stash', 'realty', 'hiring', 'loot', 'camera', 'computer', 'neuralchair', 'jackout']),
    dialog: z.string().optional(), shop: z.string().optional(), workplace: z.string().optional(), dealer: z.string().optional(),
    sleep: z.object({ quality: z.number().min(0).max(1), price: z.number().int().nonnegative().default(0) }).optional(),
  })).default([]),
  sectors: z.array(z.object({ chunk: xy, name: z.string() })).default([]),
  dangerAreas: z.array(z.object({ rect, level: DangerLevel })).default([]),
  waypoints: z.array(xy).default([]),
  safePoint: xy,
  spawn: xy.optional(),
  /** Calidad del sueño al dormir en el suelo de esta zona (si no se indica: protegida 0,6, pública 0,35, disputada 0,25). */
  sleepQuality: z.number().min(0).max(1).optional(),
  /** Peso de transeúntes ambientales para esta zona exterior. */
  ambient: z.number().int().nonnegative().default(0),
  /** Patrullas de la PCV en la zona (0 = la policía no entra). */
  police: z.number().int().nonnegative().default(0),
  /** Miembros de bandas y facciones que pasean por la zona. */
  gangs: z.array(z.object({ faction: z.string(), count: z.number().int().positive(), area: z.tuple([z.number(), z.number(), z.number()]).optional() })).default([]),
  /** v0.5: la ciudad única guarda sus distritos (rectángulo, policía, población, bandas). */
  districts: z.array(z.object({
    id: z.string(), name: z.string(), rect, police: z.number().int().default(0), ambient: z.number().int().default(0), sleepQuality: z.number().optional(), danger: DangerLevel.default('public'),
    gangs: z.array(z.object({ faction: z.string(), count: z.number().int().positive(), area: z.tuple([z.number(), z.number(), z.number()]).optional() })).default([]),
    safePoint: xy, waypoints: z.array(xy).default([]),
  })).default([]),
  /** Planta de una torre corporativa (acceso: público, empleados o restringido). */
  tower: z.object({ id: z.string(), floor: z.number().int(), access: z.enum(['publico', 'empleados', 'restringido']), corp: z.string() }).optional(),
  /** Base de una banda o de narcos: sus miembros atacan a quien no sea de los suyos. */
  gangBase: z.object({ faction: z.string(), boss: z.string() }).optional(),
  skywalk: z.boolean().optional(),
  /** v0.10 · Lugar restringido (vigilancia, uniformes que encajan) y arco detector de armas en la entrada. */
  restricted: z.enum(['policia', 'banco', 'carcel', 'corporativo', 'laboratorio']).optional(), detector: z.boolean().optional(),
  furnished: z.boolean().optional(),
  /** v0.8: ciberespacio (se dibuja con fallos visuales) y guarida de una leyenda (hace falta su confianza para entrar). */
  cyber: z.boolean().optional(), legend: z.string().optional(),
  nightlife: z.object({ kind: z.enum(['bar', 'club']), music: z.enum(['fiesta', 'chill']), floor: rect, color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).optional(),
});

/** v0.6: cobertura que da cada elemento del escenario frente a disparos (total o parcial). */
export const COVER_FULL: ReadonlySet<string> = new Set(['column', 'locker', 'dumpster', 'jersey', 'kiosk', 'car', 'vending', 'fridge', 'arcade', 'crane']);
export const COVER_HALF: ReadonlySet<string> = new Set(['crate', 'barrel', 'sofa', 'desk', 'table', 'planter', 'wreck', 'shelf', 'bench', 'trash', 'counter', 'busstop', 'hydrant']);
export type ZoneDef = z.infer<typeof ZoneSchema>;

const Condition = z.union([
  z.object({ role: z.string() }),
  z.object({ notRole: z.string() }),
  z.object({ origin: z.string() }),
  z.object({ contract: z.string(), state: z.enum(['none', 'active', 'completed', 'abandoned']) }),
  z.object({ objective: z.string(), done: z.boolean() }),
  z.object({ flag: z.string(), is: z.union([z.boolean(), z.string(), z.number()]) }),
  z.object({ hasItem: z.string() }),
  z.object({ money: z.number().int() }),
  z.object({ fact: z.string(), is: z.union([z.boolean(), z.string(), z.number()]) }),
]);
export type Condition = z.infer<typeof Condition>;

const Effect = z.union([
  z.object({ acceptContract: z.string() }),
  z.object({ abandonContract: z.string() }),
  z.object({ completeObjective: z.string() }),
  z.object({ completeContract: z.string(), outcome: z.string() }),
  z.object({ money: z.number().int(), reason: z.string(), byContribution: z.boolean().optional() }),
  z.object({ item: z.string(), qty: z.number().int() }),
  z.object({ flag: z.string(), value: z.union([z.boolean(), z.string(), z.number()]), ttlSeconds: z.number().optional() }),
  z.object({ rep: z.string(), delta: z.number().int() }),
  z.object({ xp: z.number().int().nonnegative() }),
  z.object({ fact: z.string(), value: z.union([z.boolean(), z.string(), z.number()]), ttlMinutes: z.number().positive().optional() }),
  z.object({ task: z.string() }),
  z.object({ restore: z.enum(['stamina', 'hp', 'all']) }),
  z.object({ heal: z.enum(['stamina', 'hp']), amount: z.number().int().positive() }),
  z.object({ notice: z.string() }),
  z.object({ contribute: z.string() }),
  z.object({ open: z.enum(['shop', 'clinic', 'jobs', 'bounties', 'market']), id: z.string().optional() }),
  z.object({ wanted: z.number().int() }),
]);
export type Effect = z.infer<typeof Effect>;

const DialogOption = z.object({
  id: z.string(),
  text: z.string(),
  if: z.array(Condition).default([]),
  require: z.array(Condition).default([]),
  requireText: z.string().optional(),
  channel: z.object({ seconds: z.number().positive().max(30), label: z.string() }).optional(),
  check: z.object({ attr: z.enum(ATTRIBUTE_IDS), skill: z.string(), dv: z.number().int(), key: z.string(), roleBonus: z.object({ role: z.string(), bonus: z.number().int() }).optional() }).optional(),
  effects: z.array(Effect).default([]),
  fail: z.array(Effect).default([]),
  goto: z.string().nullable().default(null),
  failGoto: z.string().nullable().optional(),
  failText: z.string().optional(),
});
export type DialogOption = z.infer<typeof DialogOption>;

export const DialogSchema = z.object({
  speaker: z.string(),
  entries: z.array(z.object({ if: z.array(Condition).default([]), node: z.string() })),
  nodes: z.record(z.string(), z.object({ text: z.string(), options: z.array(DialogOption) })),
});
export type DialogDef = z.infer<typeof DialogSchema>;

export const TaskSchema = z.object({
  id: z.string(),
  label: z.string(),
  repeat: z.number().int().positive().default(1),
  steps: z.array(z.union([
    z.object({ moveTo: xy, zone: z.string() }),
    z.object({ wait: z.number().positive(), label: z.string() }),
  ])),
  onComplete: z.array(Effect).default([]),
});
export type TaskDef = z.infer<typeof TaskSchema>;

export const ContractSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  title: z.string(),
  summary: z.string(),
  giver: z.string(),
  legal: z.boolean(),
  shared: z.boolean(),
  objectives: z.array(z.object({ id: z.string(), text: z.string(), shared: z.boolean() })),
  closedWhileFact: z.object({ fact: z.string(), is: z.union([z.boolean(), z.string(), z.number()]) }).optional(),
});
export type ContractDef = z.infer<typeof ContractSchema>;

export const NpcSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string(),
  dialog: z.string().optional(),
  faction: z.string().optional(),
  essential: z.boolean().default(true),
  shop: z.string().optional(),
  appearance: z.object({ skin: z.string(), hair: z.string(), jacket: z.string(), accent: z.string() }),
  schedule: z.array(z.object({ from: z.number().min(0).max(24), to: z.number().min(0).max(24), zone: z.string(), at: xy, state: z.enum(['rest', 'work', 'talk']), label: z.string() })).min(1),
});
export type NpcDef = z.infer<typeof NpcSchema>;

export const RoleSchema = z.object({
  id: z.string(), name: z.string(), ability: z.string(), abilityDesc: z.string(), income: z.string(), firstJob: z.string(), groupContribution: z.string(),
  skills: z.record(z.string(), z.number().int().min(0).max(6)),
  accent: z.string(),
  m1Option: z.string().optional(),
});
export type RoleDef = z.infer<typeof RoleSchema>;

export const ITEM_CATEGORIES = ['comida', 'bebida', 'medicina', 'ciberware', 'herramienta', 'arma', 'ropa', 'chatarra', 'mision', 'equipo', 'contrabando', 'municion', 'matriz'] as const;

export const WEAPON_TRAITS = ['perforante', 'inteligente', 'quemadura', 'sangrado', 'electrica', 'emp', 'area', 'silenciosa', 'aturdidora'] as const;
export const RARITIES = ['comun', 'poco-comun', 'raro', 'epico', 'legendario', 'mitico'] as const;
export const WEAR_SLOTS = ['cabeza', 'cara', 'torso_ext', 'torso_int', 'piernas', 'pies', 'manos'] as const;
export type WearSlot = (typeof WEAR_SLOTS)[number];
/** v0.9 · Cuántos implantes caben en cada ranura: dos ojos, dos oídos, dos brazos, dos manos, cuatro dedos (dos por mano), dos piernas… */
export const CYBER_SLOT_CAPACITY: Record<string, number> = { ojos: 2, oidos: 2, brazo: 2, manos: 2, dedos: 4, pierna: 2, cortex: 3, esqueleto: 2, circulatorio: 2, nervioso: 2, tegumento: 2, glandula: 2, bateria: 2, hombros: 2, columna: 1 };
export const cyberSlotCapacity = (slot: string) => CYBER_SLOT_CAPACITY[slot] ?? 1;
/** Nombre de cada hueco de una ranura doble (para la pantalla de ciberware). */
export const CYBER_SLOT_SIDES: Record<string, string[]> = { ojos: ['Ojo izq.', 'Ojo der.'], oidos: ['Oído izq.', 'Oído der.'], brazo: ['Brazo izq.', 'Brazo der.'], manos: ['Mano izq.', 'Mano der.'],
  dedos: ['Dedos izq. 1', 'Dedos izq. 2', 'Dedos der. 1', 'Dedos der. 2'], pierna: ['Pierna izq.', 'Pierna der.'], hombros: ['Hombro izq.', 'Hombro der.'] };
export const CYBER_REGIONS = ['so', 'corteza', 'ojos', 'cara', 'brazos', 'manos', 'esqueleto', 'nervioso', 'circulatorio', 'tegumentario', 'piernas'] as const;
export type CyberRegion = (typeof CYBER_REGIONS)[number];
export const WeaponSchema = z.object({
  kind: z.enum(['melee', 'ranged']), family: z.string(), damage: z.tuple([z.number(), z.number()]), range: z.number(), cooldown: z.number(), accuracy: z.number().int(),
  ammo: z.string().optional(), mag: z.number().int().optional(), nonlethal: z.enum(['no', 'opcional', 'solo']).default('no'), noise: z.number().min(0).max(1).default(0.5), tech: z.enum(['clasica', 'potencia', 'tecnica', 'inteligente']).default('clasica'),
  /** v0.4: rasgos especiales (perforante, inteligente, quemadura, sangrado, electrica, emp, area, silenciosa, aturdidora). */
  traits: z.array(z.enum(WEAPON_TRAITS)).default([]),
});
export type WeaponDef = z.infer<typeof WeaponSchema>;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];
export const ItemSchema = z.object({
  id: z.string(), name: z.string(), desc: z.string(), weight: z.number(), price: z.number().int().optional(),
  category: z.enum(ITEM_CATEGORIES).default('equipo'),
  consumable: z.object({ restore: z.enum(['stamina', 'hp']).optional(), amount: z.number().default(0), hunger: z.number().default(0), thirst: z.number().default(0), fatigue: z.number().default(0) }).optional(),
  substance: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('alcohol'), strength: z.number().int().min(1).max(60) }),
    z.object({ kind: z.literal('drug'), seconds: z.number().int().positive(), crashSeconds: z.number().int().positive(),
      habit: z.number().int().min(1).max(40), aim: z.number().default(0), speed: z.number().default(0),
      melee: z.number().default(0), defense: z.number().default(0), ram: z.number().default(0),
      crashAim: z.number().nonpositive().default(0), crashSpeed: z.number().nonpositive().default(0), fatigue: z.number().nonnegative(),
    }),
  ]).optional(),
  confront: z.number().int().optional(),
  weapon: WeaponSchema.optional(),
  armor: z.number().int().optional(),
  rarity: z.enum(RARITIES).default('comun'),
  /** Ropa: hueco donde se lleva, estilo y color con que se dibuja y mejoras. */
  wear: z.object({
    slot: z.enum(WEAR_SLOTS), style: z.string(), color: z.string(),
    /** v0.9 · Tejido, detalle y segundo color con que se dibuja. */
    pattern: z.string().optional(), detail: z.string().optional(), accent: z.string().optional(),
    mods: z.object({ skills: z.record(z.string(), z.number()).default({}), carry: z.number().default(0), speed: z.number().default(0), needs: z.number().default(0),
      /** v0.9 · Mejoras de prendas especiales: esquiva, salud, puntería, RAM y ahorro de RAM. */
      dodge: z.number().default(0), hpMax: z.number().default(0), aim: z.number().default(0), ramPlus: z.number().default(0), ramSave: z.number().default(0) }).prefault({}),
    /** v0.9 · Capacidad especial de la prenda (camaleon, termica, aislante, reflejos, anticamaras…). */
    perk: z.string().optional(),
  }).optional(),
});
export type ItemDef = z.infer<typeof ItemSchema>;

export const NeedsSchema = z.object({
  perGameHour: z.object({ hunger: z.number(), thirst: z.number(), fatigue: z.number() }),
  workMultiplier: z.number(),
  autoThreshold: z.number(),
  warnThreshold: z.number(),
  damagePerGameHourAtMax: z.number(),
  sleepRecoverPerGameHour: z.number(),
  streetEventChancePerGameHour: z.number(),
  downedSeconds: z.number(),
  wantedDecayPerGameHour: z.number(),
});
export type NeedsConfig = z.infer<typeof NeedsSchema>;

export const MarketSchema = z.object({
  corps: z.array(z.object({ id: z.string(), categories: z.array(z.enum(ITEM_CATEGORIES)), markup: z.number(), minMarkup: z.number(), maxMarkup: z.number(), volatility: z.number(), motto: z.string() })),
  elasticity: z.number(), minFactor: z.number(), maxFactor: z.number(), sellRatio: z.number(), restockPerGameHour: z.number(), policyEveryGameHours: z.number(),
});
export type MarketDef = z.infer<typeof MarketSchema>;

export const ShopSchema = z.object({
  id: z.string(), name: z.string(), owner: z.string(), zone: z.string(),
  stock: z.record(z.string(), z.number().int().nonnegative()),
  buys: z.array(z.enum(ITEM_CATEGORIES)).default([]),
  priceMult: z.number().default(1),
  security: z.number().int().min(8).max(25),
  fence: z.boolean().default(false),
  discounts: z.array(z.object({ flag: z.string(), pct: z.number() })).default([]),
});
export type ShopDef = z.infer<typeof ShopSchema>;

export const CyberwareSchema = z.object({
  id: z.string(), name: z.string(), family: z.string(), slot: z.string(), grade: z.number().int().min(1).max(5),
  capacity: z.number().int(), humanity: z.number().int(), price: z.number().int(), maker: z.string(), desc: z.string(),
  effects: z.object({
    attrs: z.record(z.string(), z.number()).default({}), skills: z.record(z.string(), z.number()).default({}),
    needs: z.object({ hunger: z.number().default(1), thirst: z.number().default(1), fatigue: z.number().default(1) }).optional(),
    hpMax: z.number().default(0), confront: z.number().default(0), steal: z.number().default(0), surgery: z.number().default(0),
    carry: z.number().default(0), ram: z.number().default(0), armor: z.number().default(0), weapon: z.string().optional(),
    meleeDmg: z.number().default(0), speed: z.number().default(0), carSpeed: z.number().default(0), dodge: z.number().default(0),
    /** v0.9 · RAM extra, ahorro de RAM, regeneración de salud por segundo y probabilidad de crítico. */
    ramPlus: z.number().optional(), ramSave: z.number().optional(), regen: z.number().optional(), crit: z.number().optional(),
  }).prefault({}),
  /** v0.4: zona del cuerpo en la pantalla de ciberware. */
  region: z.enum(CYBER_REGIONS).optional(),
  /** Habilidad que se activa (tecla) con enfriamiento. */
  rarity: z.enum(RARITIES).optional(),
  ability: z.object({ kind: z.enum(['tiempo-bala', 'invisible', 'curar', 'pulso', 'esprint', 'carga', 'senuelo', 'torbellino', 'disparo-cargado', 'pico-ram', 'kairos', 'marcar', 'escudo', 'salto']), name: z.string(), cooldown: z.number(), duration: z.number().default(0), power: z.number().default(0) }).optional(),
  /** Efecto pasivo único (segundo-corazon, autoestim, lector, modulador, compartimento, refuerzo). */
  unique: z.string().optional(),
  /** v0.9 · Capacidad pasiva especial (ojo-absoluto, vampiro, desvio-balas, segundo-aliento, ejecutor…). */
  passive: z.string().optional(),
  prosthetic: z.boolean().default(false),
  /** Parte del cuerpo donde se ve: se dibuja en el personaje. */
  visible: z.enum(['cabeza', 'ojos', 'torso', 'brazo', 'pierna', 'piernas', 'ninguna']).default('ninguna'),
});
export type CyberwareDef = z.infer<typeof CyberwareSchema>;

export const RipperdocSchema = z.object({
  id: z.string(), name: z.string(), npc: z.string(), zone: z.string(), skill: z.number().int().min(1).max(5), priceMult: z.number(),
  morality: z.enum(['estricta', 'flexible', 'sin_escrupulos']), danger: z.number().min(0).max(1), faction: z.string().optional(),
  stock: z.array(z.string()), stolenStock: z.array(z.string()).default([]), maxGrade: z.number().int().min(1).max(5), desc: z.string(),
  /** v0.4: consulta sin rótulo; no aparece en el mapa hasta descubrirla. */
  hidden: z.boolean().default(false), rumor: z.string().default(''),
});
export type RipperdocDef = z.infer<typeof RipperdocSchema>;

export const ProfessionSchema = z.object({
  id: z.string(), name: z.string(), kind: z.enum(['empleo', 'libre', 'ilegal']), desc: z.string(), skill: z.string(), attr: z.enum(ATTRIBUTE_IDS), perk: z.string(),
  mods: z.object({ confront: z.number().default(0), steal: z.number().default(0), sleepStreet: z.number().default(0), rescue: z.boolean().default(false), corpDiscount: z.number().default(0), speed: z.number().default(0), bounty: z.number().default(0), rummage: z.number().default(0) }).prefault({}),
});
export type ProfessionDef = z.infer<typeof ProfessionSchema>;

export const WorkplaceSchema = z.object({ id: z.string(), name: z.string(), zone: z.string(), at: xy });
export const JobSchema = z.object({
  id: z.string(), title: z.string(), desc: z.string(), profession: z.string(), employer: z.string(), workplace: z.string(),
  seconds: z.number().positive(), pay: z.number().int().positive(), dv: z.number().int(), minRank: z.number().int().min(0), legal: z.boolean(), cooldownGameHours: z.number(),
  risk: z.number().min(0).max(1).default(0),
});
export type JobDef = z.infer<typeof JobSchema>;

export const FugitiveSchema = z.object({ id: z.string(), name: z.string(), crime: z.string(), zone: z.string(), area: z.tuple([z.number(), z.number(), z.number()]), bounty: z.number().int(), hp: z.number().int(), defense: z.number().int(), poster: z.string(), alive: z.boolean().default(false), weapon: z.string().optional(), appearance: z.object({ skin: z.string(), hair: z.string(), jacket: z.string(), accent: z.string() }) });
export type FugitiveDef = z.infer<typeof FugitiveSchema>;

export const QuickhackSchema = z.object({
  id: z.string(), name: z.string(), target: z.enum(['person', 'atm', 'shop', 'camera']), ram: z.number().int(), upload: z.number(), dv: z.number().int(), minRank: z.number().int().default(0),
  effect: z.enum(['scan', 'deepscan', 'blind', 'damage', 'knockout', 'kill', 'drain', 'cash', 'disable']), minSkill: z.number().int().default(0), amount: z.tuple([z.number(), z.number()]).default([0, 0]), trace: z.number().min(0).max(1), range: z.number().default(12), desc: z.string(),
});
export type QuickhackDef = z.infer<typeof QuickhackSchema>;
export const AmbarPlanSchema = z.object({ id: z.string(), name: z.string(), price: z.number().int(), days: z.number(), arrival: z.number(), uses: z.number().int(), revive: z.number(), zones: z.array(z.string()), color: z.string(), desc: z.string() });
export type AmbarPlanDef = z.infer<typeof AmbarPlanSchema>;
export const WorldSchema = z.object({
  name: z.string(),
  districts: z.array(z.object({ zone: z.string(), gx: z.number().int(), gy: z.number().int(), color: z.string(), desc: z.string(), police: z.string(), factions: z.array(z.string()), rect: rect.optional() })),
});
export type WorldDef = z.infer<typeof WorldSchema>;

export const PerkSchema = z.object({
  id: z.string(), name: z.string(), desc: z.string(), skill: z.string(), tier: z.number().int().min(1).max(5), cost: z.number().int().min(1).max(3),
  requires: z.object({ skills: z.record(z.string(), z.number().int()).default({}), level: z.number().int().default(1), perks: z.array(z.string()).default([]) }).prefault({}),
  mods: z.record(z.string(), z.number()).default({}), flag: z.string().optional(),
});
export type PerkDef = z.infer<typeof PerkSchema>;
export const CAR_CLASSES = ['moto', 'economico', 'utilitario', 'deportivo', 'todoterreno', 'lujo', 'blindado', 'hiper'] as const;
export const CarSchema = z.object({
  id: z.string(), name: z.string(), maker: z.string(), class: z.enum(CAR_CLASSES), speed: z.number(), trunk: z.number(), seats: z.number().int(), armor: z.number().int(),
  price: z.number().int(), color: z.string(), desc: z.string(),
});
export type CarDef = z.infer<typeof CarSchema>;
export const DealerSchema = z.object({ id: z.string(), name: z.string(), zone: z.string(), classes: z.array(z.enum(CAR_CLASSES)), priceMult: z.number(), desc: z.string() });
export type DealerDef = z.infer<typeof DealerSchema>;
export const HOUSE_SIZES = ['estudio', 'piso', 'loft', 'atico', 'villa'] as const;
export const HouseSchema = z.object({
  id: z.string(), name: z.string(), building: z.string(), zone: z.string(), size: z.enum(HOUSE_SIZES), template: z.string(), price: z.number().int(), floor: z.number().int(), district: z.string().default(''),
});
export const PostSchema = z.object({
  id: z.string(), name: z.string(), zone: z.string(), at: xy, skill: z.string(), minLevel: z.number().int(), pay: z.number().int(), shift: z.tuple([z.number().int(), z.number().int()]),
  employer: z.string(), desc: z.string(), obra: z.string().optional(),
});
export type PostDef = z.infer<typeof PostSchema>;
export type HouseDef = z.infer<typeof HouseSchema>;

const UnderworldSiteSchema = z.object({ id: z.string(), name: z.string(), zone: z.string(), at: xy });
const UnderworldSchema = z.object({
  contacts: z.array(UnderworldSiteSchema),
  buyers: z.array(UnderworldSiteSchema.extend({ crew: z.string(), risk: z.number().min(0).max(0.7) })),
  crews: z.array(z.object({
    id: z.string(), tier: z.enum(['principal', 'secundaria']), parent: z.string().optional(),
    entryRep: z.number().int().nonnegative(), rivals: z.array(z.string()), bases: z.array(UnderworldSiteSchema).min(2),
  })),
});
export type UnderworldDef = z.infer<typeof UnderworldSchema>;

export const ContentSchema = z.object({
  manifest: z.object({ version: z.string(), edition: z.string(), city: z.string(), startZone: z.string(), startAt: xy, cityHourMs: z.number().int().positive() }),
  attributes: z.array(z.object({ id: z.enum(ATTRIBUTE_IDS), name: z.string(), represents: z.string(), effect: z.string(), example: z.string() })),
  skills: z.array(z.object({ id: z.string(), name: z.string(), attr: z.enum(ATTRIBUTE_IDS) })),
  roles: z.array(RoleSchema),
  origins: z.array(z.object({ id: z.string(), name: z.string(), desc: z.string(), contact: z.string(), startMoney: z.number().int() })),
  factions: z.array(z.object({
    id: z.string(), name: z.string(), kind: z.enum(['gang', 'service', 'authority', 'corp', 'contact', 'neighborhood']), desc: z.string(),
    color: z.string().default('#9a9ac0'), archetype: z.string().default(''), territory: z.array(z.string()).default([]), relations: z.record(z.string(), z.number()).default({}),
    hostileBelow: z.number().default(-30), weapon: z.string().optional(), hp: z.number().int().default(45), defense: z.number().int().default(12), chrome: z.array(z.string()).default([]),
  })),
  items: z.array(ItemSchema),
  npcs: z.array(NpcSchema),
  zones: z.array(ZoneSchema),
  dialogs: z.record(z.string(), DialogSchema),
  tasks: z.array(TaskSchema),
  contracts: z.array(ContractSchema),
  locale: z.record(z.string(), z.string()),
  needs: NeedsSchema,
  market: MarketSchema,
  shops: z.array(ShopSchema),
  cyberware: z.array(CyberwareSchema),
  ripperdocs: z.array(RipperdocSchema),
  professions: z.array(ProfessionSchema),
  workplaces: z.array(WorkplaceSchema),
  jobs: z.array(JobSchema),
  fugitives: z.array(FugitiveSchema),
  quickhacks: z.array(QuickhackSchema),
  ambar: z.array(AmbarPlanSchema),
  world: WorldSchema,
  perks: z.array(PerkSchema),
  cars: z.array(CarSchema),
  dealers: z.array(DealerSchema),
  houses: z.array(HouseSchema),
  posts: z.array(PostSchema),
  underworld: UnderworldSchema,
});
export type Content = z.infer<typeof ContentSchema>;
