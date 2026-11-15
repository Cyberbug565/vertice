// Esquemas validables del contenido del mundo. El motor no conoce lugares concretos: todo vive en /content.
import { z } from 'zod';
import { ATTRIBUTE_IDS } from './rules.js';

const xy = z.tuple([z.number().int(), z.number().int()]);
const rect = z.tuple([z.number().int(), z.number().int(), z.number().int().positive(), z.number().int().positive()]);
export const DangerLevel = z.enum(['protected', 'public', 'disputed']);
export type DangerLevel = z.infer<typeof DangerLevel>;

export const GROUND_TYPES = ['void', 'asphalt', 'sidewalk', 'plaza', 'market', 'dirt', 'water', 'bridge', 'wood', 'tile', 'metal', 'crosswalk', 'deck', 'gravel'] as const;
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
  props: z.array(z.object({ type: z.enum(['stall', 'lamp', 'crate', 'bench', 'plant', 'vending', 'car', 'neon', 'table', 'bed', 'screen', 'pipe', 'holo', 'antenna', 'shelf', 'trash']), at: xy, blocking: z.boolean().default(true), color: z.string().optional(), text: z.string().optional(), z: z.number().optional() })).default([]),
  skybridges: z.array(z.object({ from: xy, to: xy, z: z.number(), color: z.string().optional() })).default([]),
  doors: z.array(z.object({ id: z.string(), name: z.string(), at: xy, to: z.object({ zone: z.string(), at: xy }), danger: DangerLevel.optional() })).default([]),
  objects: z.array(z.object({
    id: z.string(), name: z.string(), at: xy,
    kind: z.enum(['generator', 'terminal', 'crates', 'elevator', 'board', 'vending', 'shop', 'jobboard', 'bountyboard', 'bed', 'trash', 'workplace', 'marketterm']),
    dialog: z.string().optional(), shop: z.string().optional(), workplace: z.string().optional(),
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
});
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

export const ITEM_CATEGORIES = ['comida', 'bebida', 'medicina', 'ciberware', 'herramienta', 'arma', 'ropa', 'chatarra', 'mision', 'equipo', 'contrabando'] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];
export const ItemSchema = z.object({
  id: z.string(), name: z.string(), desc: z.string(), weight: z.number(), price: z.number().int().optional(),
  category: z.enum(ITEM_CATEGORIES).default('equipo'),
  consumable: z.object({ restore: z.enum(['stamina', 'hp']).optional(), amount: z.number().default(0), hunger: z.number().default(0), thirst: z.number().default(0), fatigue: z.number().default(0) }).optional(),
  confront: z.number().int().optional(),
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
  }).prefault({}),
  prosthetic: z.boolean().default(false),
});
export type CyberwareDef = z.infer<typeof CyberwareSchema>;

export const RipperdocSchema = z.object({
  id: z.string(), name: z.string(), npc: z.string(), zone: z.string(), skill: z.number().int().min(1).max(5), priceMult: z.number(),
  morality: z.enum(['estricta', 'flexible', 'sin_escrupulos']), danger: z.number().min(0).max(1), faction: z.string().optional(),
  stock: z.array(z.string()), stolenStock: z.array(z.string()).default([]), maxGrade: z.number().int().min(1).max(5), desc: z.string(),
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

export const FugitiveSchema = z.object({ id: z.string(), name: z.string(), crime: z.string(), zone: z.string(), area: z.tuple([z.number(), z.number(), z.number()]), bounty: z.number().int(), hp: z.number().int(), defense: z.number().int(), poster: z.string(), appearance: z.object({ skin: z.string(), hair: z.string(), jacket: z.string(), accent: z.string() }) });
export type FugitiveDef = z.infer<typeof FugitiveSchema>;

export const ContentSchema = z.object({
  manifest: z.object({ version: z.string(), edition: z.string(), city: z.string(), startZone: z.string(), startAt: xy, cityHourMs: z.number().int().positive() }),
  attributes: z.array(z.object({ id: z.enum(ATTRIBUTE_IDS), name: z.string(), represents: z.string(), effect: z.string(), example: z.string() })),
  skills: z.array(z.object({ id: z.string(), name: z.string(), attr: z.enum(ATTRIBUTE_IDS) })),
  roles: z.array(RoleSchema),
  origins: z.array(z.object({ id: z.string(), name: z.string(), desc: z.string(), contact: z.string(), startMoney: z.number().int() })),
  factions: z.array(z.object({ id: z.string(), name: z.string(), kind: z.enum(['gang', 'service', 'authority', 'corp', 'contact', 'neighborhood']), desc: z.string() })),
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
});
export type Content = z.infer<typeof ContentSchema>;
