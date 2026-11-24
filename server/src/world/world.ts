// Simulación autoritativa: zonas en memoria, tick fijo a 20 Hz, intenciones validadas, interés por cliente y traslados.
import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import {
  installedSight, canSee, pedestrianGrid, hashString,RULES, BUILDS, HAIR_STYLES, FACE_SHAPES, NOSES, MOUTHS, BIN_POSITIONS, POS_SCALE, facingToIdx, findPath, stepWithCollision, stepCar, nearestWalkable, isWalkable, sectorOf, dangerAt, walkSpeed, t, seededRng,
  type ClientMsg, type Content, type EntitySpawn, type ServerMsg, type DialogOption, REMOTE_RANGE, REMOTE_DOOR_RANGE, diversifyAppearance, roadMap, crossingAxis, walkLight, portalZoneDef, isPortalZone, parsePortalZone } from '@vertice/shared';
import type { Config } from '../config.js';
import type { Db, Queryable } from '../db/db.js';
import type { Metrics } from '../metrics.js';
import { Zone } from './zone.js';
import { spawnOf, type Entity } from './entity.js';
import { CityPeople, shiftAt } from './city-people.js';
import { ambientBrain, scheduledBrain, thinkNpc } from './npc.js';
import { activeCharacterId, buildJournal, buildSheet, chromeParts, loadPlayer, objectiveStatus, savePlayerVitals, sheetHooks, wornAppearance, type PlayerState } from '../game/player.js';
import { applyMapKeys, mapKeys, rememberMap, mapKnowledge, unlockMap, writeMapKeys } from '../game/exploration.js';
import { FactService, InstanceService } from '../game/services.js';
import { EffectEngine, GameError, type EffectOutcome } from '../game/effects.js';
import { allOk, buildView, checkNumbers, entryNode } from '../game/dialog.js';
import { Survival } from './survival.js';
import { Combat } from './combat.js';
import { Progress } from './progress.js';
import { Property, isHouseZone } from './property.js';
import { Posts } from './posts.js';
import { Autopilot } from './autopilot.js';
import { Intel } from './intel.js';
import { Threats } from './threats.js';
import { Relics } from './relics.js';
import { Legends } from './legends.js';
import { Mythics } from './mythics.js';
import { Corpses } from './corpses.js';
import { Street } from './street.js';
import { Stealth } from './stealth.js';
import { Admin } from './admin.js';
import { Missions } from './missions.js';
import { Debts } from './debt.js';
import { Scanner } from './scanner.js';
import { Nightlife } from './nightlife.js';
import { Casino } from './casino.js';
import { Prison } from './prison.js';
import { Underworld } from './underworld.js';
import { isSick } from '../game/substances.js';
import { selectCharacter } from '../game/accounts.js';

export interface PlayerConn {
  ws: WebSocket; accountId: string; username: string; p?: PlayerState; e?: Entity;
  known: Map<number, { lv: number; sent: number }>; lastSnapTick: number; dialog?: { no: number; dialogId: string; node: string; targetId: number };
  queue: Promise<void>; chatTimes: number[]; closed: boolean; lastSector?: string; lastDanger?: string; bytesOut: number;
  sentScaled?: number; admin?: boolean; kairosWarnAt?: number;
}

const INTERACT_RANGE = 2.3;
const MAX_POS = 4000;
const POS_BUF = new Uint8Array(7 + MAX_POS * 9);
const POS_DV = new DataView(POS_BUF.buffer);
const DOOR_RANGE = 1.3;
/** Presupuesto de búsqueda de caminos según la distancia (en la ciudad única hay trayectos de cientos de losetas). */
const pathBudgetFor = (ax: number, ay: number, bx: number, by: number) => { const d = Math.hypot(bx - ax, by - ay); return Math.min(160000, 9000 + Math.round(d * d * 2.5)); };
const AMBIENT_NAMES = ['Inés', 'Rui', 'Luz', 'Sam', 'Ariel', 'Uma', 'Izan', 'Aya', 'Noa', 'Leo', 'Nadia', 'Ren', 'Vega', 'Dani', 'Sol', 'Gael', 'Paz', 'Teo'];
const AMBIENT_SURNAMES = ['Reyes', 'Seo', 'Lin', 'Vidal', 'Cruz', 'Kato', 'Pons', 'Vera', 'Mora', 'Costa', 'Gil', 'Varela', 'Park', 'Soto', 'Ferrer', 'Fuentes'];
const STREET_ROLES = ['Estudiante', 'Artista de calle', 'Mensajería', 'Turista', 'Vecindario', 'Comerciante'];
const YARD_ROLES = ['Taller mecánico', 'Estiba', 'Reciclaje', 'Mantenimiento', 'Transportista', 'Vecindario'];
const PALETTE = { skin: ['#f6dcc8', '#f0c8a8', '#e8bc96', '#e0b48c', '#d0a078', '#c89070', '#b88060', '#b07a5a', '#9a6848', '#8a5a3c', '#744a30', '#6a4028', '#5a3420', '#46281a', '#c8ccd8'], hair: ['#1a1a1a', '#5a3a2a', '#d9d9e3', '#b46cff', '#43f3ff', '#ff4fa0', '#c0c0c0'], jacket: ['#2f6b4f', '#40506a', '#6b2140', '#7a5b2a', '#3a3a4a', '#5a4b6e', '#2b4a6a'], accent: ['#43f3ff', '#ff4fa0', '#ffd23f', '#7dff7a', '#ff8a3d', '#b46cff'] };

export class World {
  private readonly optics: Map<string, Content['cyberware'][number]>;
  readonly zones = new Map<string, Zone>();
  readonly entities = new Map<number, Entity>();
  readonly conns = new Map<string, PlayerConn>();
  private lingering = new Map<string, { e: Entity; p: PlayerState; timer: NodeJS.Timeout; queue: Promise<void> }>();
  private removals = new Map<string, Promise<void>>();
  private attachLocks = new Map<string, Promise<void>>();
  tick = 0;
  private nextId = 1;
  private dialogNo = 1;
  private pathBudget = 0;
  private pathCache = new Map<string, [number, number][]>();
  private timer?: NodeJS.Timeout;
  private nextTickAt = 0;
  readonly facts: FactService;
  readonly inst: InstanceService;
  readonly effects: EffectEngine;
  private saving = false;
  private closing = false;
  readonly survival: Survival;
  readonly combat: Combat;
  readonly progress: Progress;
  readonly property: Property;
  readonly posts: Posts;
  readonly autopilot: Autopilot;
  readonly intel: Intel;
  readonly threats: Threats;
  readonly relics: Relics;
  readonly legends: Legends;
  readonly mythics: Mythics;
  readonly stealth: Stealth;
  readonly corpses: Corpses;
  readonly street: Street;
  readonly cityPeople: CityPeople;
  readonly admin: Admin;
  readonly nightlife: Nightlife;
  readonly missions: Missions;
  readonly underworld: Underworld;
  readonly casino: Casino;
  readonly prison: Prison;
  readonly debts: Debts;
  readonly scanner: Scanner;
  private spawnAmbientFn: (z: Zone, near?: { x: number; y: number }) => Entity | undefined = () => undefined;

  constructor(readonly c: Content, readonly contentHash: string, readonly db: Db, readonly cfg: Config, readonly metrics: Metrics) {
    this.optics = new Map(c.cyberware.filter(d => d.effects.sight).map(d => [d.id, d]));
    this.facts = new FactService(db);
    this.inst = new InstanceService(db, c);
    this.effects = new EffectEngine(db, c, this.facts, this.inst);
    this.survival = new Survival(this);
    this.combat = new Combat(this, this.survival);
    this.progress = new Progress(this);
    this.property = new Property(this);
    this.posts = new Posts(this);
    this.autopilot = new Autopilot(this);
    this.intel = new Intel(this);
    this.threats = new Threats(this);
    this.relics = new Relics(this);
    this.legends = new Legends(this);
    this.mythics = new Mythics(this);
    this.stealth = new Stealth(this);
    this.corpses = new Corpses(this);
    this.street = new Street(this);
    this.cityPeople = new CityPeople(this);
    this.admin = new Admin(this);
    this.nightlife = new Nightlife(this);
    this.missions = new Missions(this);
    this.underworld = new Underworld(this);
    this.casino = new Casino(this);
    this.prison = new Prison(this);
    this.debts = new Debts(this);
    this.scanner = new Scanner(this);
    sheetHooks.loan = (p) => this.debts.view(p);
    sheetHooks.post = (p) => this.posts.status(p);
    sheetHooks.objective = (p) => objectiveStatus(p).text;
  }

  // ---------------------------------------------------------------- arranque
  async init() {
    await this.facts.load();
    await this.inst.load();
    // Las plantillas de vivienda no son zonas jugables: cada casa es una instancia que se crea al entrar.
    for (const def of this.c.zones) if (!def.id.startsWith('casa-')) this.zones.set(def.id, new Zone(def));
    for (const z of this.zones.values()) this.populateZone(z);
    const initialNpcLevel=seededRng(this.cfg.seed+99);
    for(const n of this.c.npcs)if(!n.resident)this.spawnScheduled(n,6+Math.floor(initialNpcLevel()*10));
    const rng = seededRng(this.cfg.seed);
    const pick = <T,>(a: T[]) => a[Math.floor(rng() * a.length)];
    const exteriors = [...this.zones.values()].filter((z) => z.def.kind === 'exterior' && z.def.ambient > 0);
    // Ciudad única: la población se reparte por distritos (AMBIENT_NPCS es la de Ferro; el resto escala por su peso).
    const ref = 24; // Peso histórico de Ferro para la configuración AMBIENT_NPCS.
    const mkAmbient = (zone: Zone, x: number, y: number, home?: [number, number], radius?: number) => {
      const district = zone.districtAt(x, y);
      const roles = (district?.ambient ?? 0) >= 16 ? STREET_ROLES : YARD_ROLES;
      const e = this.addEntity(zone, { kind: 'npc', name: pick(AMBIENT_NAMES) + ' ' + pick(AMBIENT_SURNAMES), title: pick(roles), x, y, interactive: true, dialog: 'transeunte', label: 'Paseando', speed: 1.3 + rng() * 1.1,
        appearance: { body: rng() < 0.5 ? 'femenino' : 'masculino', skin: pick(PALETTE.skin), hair: pick(PALETTE.hair), jacket: pick(PALETTE.jacket), accent: pick(PALETTE.accent) } });
      e.npc = ambientBrain(this.cfg.seed * 31 + e.id, home, radius);
      // Transeúntes: civiles con algo de cromo visible y salud propia.
      e.npcType = 'civil'; e.npcMax = 35; e.npcHp = 35; e.defense = 9; e.respawn = { zone: zone.id, template: { type: 'civil', near: { x, y } } }; e.level = 1 + Math.floor(rng() * 6);
      const chromeRoll = rng();
      e.chrome = chromeRoll < 0.15 ? ['ojos'] : chromeRoll < 0.25 ? [rng() < 0.5 ? 'brazo_izq' : 'brazo_der'] : chromeRoll < 0.3 ? ['cabeza', 'ojos'] : chromeRoll < 0.34 ? ['pierna_izq', 'pierna_der'] : [];
      (e.appearance as any).build = pick([...BUILDS, 'medio', 'medio']); (e.appearance as any).hairStyle = pick([...HAIR_STYLES]); (e.appearance as any).faceShape = pick([...FACE_SHAPES]); (e.appearance as any).nose = pick([...NOSES]); (e.appearance as any).mouth = pick([...MOUTHS]); (e.appearance as any).legwear = pick(['pantalon', 'pantalon', 'pantalon', 'shorts', 'falda']);
      (e.appearance as any).top = pick(['chaqueta', 'gabardina', 'sudadera', 'top', 'traje', 'chaleco', 'mono']); (e.appearance as any).accessory = pick(['ninguno', 'ninguno', 'gafas', 'gorra', 'capucha', 'auriculares', 'visor']);
      diversifyAppearance(e.appearance as any, rng, 'civil'); // v0.9: más ropa, tejidos, tatuajes y calzado
      (e.appearance as any).eyes = pick(['#3a2a1a', '#2a6aa8', '#3a8a4a', '#43f3ff']); (e.appearance as any).pants = pick(['#1a1a24', '#2a2a3a', '#3a2a24', '#1a2a3a']); (e.appearance as any).facial = pick(['ninguno', 'ninguno', 'barba', 'bigote']);
      e.npc.nextThink = Math.floor(rng() * 20);
      return e;
    };
    for (const zone of exteriors) {
      if (zone.def.districts.length) {
        const pavement = pedestrianGrid(zone.grid, 'stop');
        for (const d of zone.def.districts) {
          const n = Math.round(this.cfg.ambientNpcs * d.ambient / ref);
          for (let i = 0; i < n && d.waypoints.length; i++) {
            const wp = pick(d.waypoints);
            const x = Math.max(d.rect[0] + .5, Math.min(d.rect[0] + d.rect[2] - .5, wp[0] + (rng() - .5) * 17));
            const y = Math.max(d.rect[1] + .5, Math.min(d.rect[1] + d.rect[3] - .5, wp[1] + (rng() - .5) * 17));
            const pos = nearestWalkable(pavement, x, y, 7) ?? nearestWalkable(pavement, wp[0] + .5, wp[1] + .5, 10);
            if (pos) mkAmbient(zone, pos.x, pos.y, [wp[0], wp[1]], 10 + Math.floor(rng() * 18));
          }
        }
        continue;
      }
      const n = Math.round((this.cfg.ambientNpcs * zone.def.ambient) / ref);
      for (let i = 0; i < n; i++) { const wp = pick(zone.def.waypoints); mkAmbient(zone, wp[0] + 0.5, wp[1] + 0.5); }
    }
    const crowdZone = this.zones.get('vertice') ?? this.zones.get('ferro') ?? exteriors[0];
    for (let i = 0; i < this.cfg.crowdNpcs; i++) {
      const p = nearestWalkable(crowdZone.grid, this.cfg.crowdAt[0] + (rng() * 2 - 1) * 8, this.cfg.crowdAt[1] + (rng() * 2 - 1) * 8, 4) ?? { x: this.cfg.crowdAt[0] + 0.5, y: this.cfg.crowdAt[1] + 0.5 };
      mkAmbient(crowdZone, p.x, p.y, this.cfg.crowdAt, 9);
    }
    this.spawnAmbientFn = (zone: Zone, near?: { x: number; y: number }) => {
      const d = near ? zone.districtAt(near.x, near.y) : null;
      const wp = pick(d?.waypoints.length ? d.waypoints : zone.def.waypoints);
      return wp ? mkAmbient(zone, wp[0] + 0.5, wp[1] + 0.5) : undefined;
    };
    await this.survival.init();
    await this.property.load();
    await this.posts.load();
    await this.mythics.load();
    this.combat.spawnPopulation();
    this.nightlife.populate();
    this.missions.populate();
    this.underworld.populate();
    if (this.cfg.threats !== false) await this.threats.init(); else this.threats.enabled = false;
    for(const n of this.c.npcs)if(n.resident)this.spawnScheduled(n);
  }

  spawnScheduled(n:Content['npcs'][number],level?:number){
    const entry=shiftAt(n,this.cityHour()),zone=this.zones.get(entry.zone);
    if(!zone)return;
    const e=this.addEntity(zone,{kind:'npc',name:n.name,title:n.title,x:entry.at[0]+.5,y:entry.at[1]+.5,
      interactive:true,dialog:n.dialog,appearance:n.appearance,label:entry.label,speed:n.resident?.speed??2.2,npcShop:n.shop});
    const seed=n.resident?(hashString(n.id)^this.cfg.seed):this.cfg.seed+e.id;
    e.npc=scheduledBrain(n,seed);
    e.npcType=n.essential?'essential':'civil';e.faction=n.faction;e.level=level??6+((seed>>>0)%10);
    if(n.id.startsWith('leyenda-')){e.legendId=n.id;e.level=25;}
    if(n.resident){
      e.npc.nextThink=this.tick+e.id%12;
      if(n.id.startsWith('penal-guardia-')){
        Object.assign(e,{prisonStaff:true,npcType:'police',faction:'pcv',npcMax:76,npcHp:76,defense:12,weaponId:'taser',
          respawn:{zone:entry.zone,template:{resident:n.id}}});
      }else if(n.id.startsWith('penal-interno-')){
        Object.assign(e,{prisonGang:n.faction,npcType:'gang',npcMax:34+(seed>>>0)%29,npcHp:34+(seed>>>0)%29,
          defense:7+(seed>>>0)%4,respawn:{zone:entry.zone,template:{resident:n.id}}});
        if((seed>>>0)%4===0)e.weaponId='navaja';
      }else if(n.resident.job==='policia'){
        const f=this.c.factions.find(f=>f.id==='pcv')!;
        Object.assign(e,{npcType:'police',faction:'pcv',npcMax:f.hp,npcHp:f.hp,defense:f.defense,weaponId:f.weapon,chrome:[...f.chrome],
          respawn:{zone:entry.zone,template:{resident:n.id}}});
      }
      this.cityPeople.add(e,n);
    }
    return e;
  }
  private populateZone(z: Zone) {
    for (const d of z.def.doors) {
      const target = this.zones.get(d.to.zone);
      this.addEntity(z, { kind: 'door', name: d.name, x: d.at[0] + 0.5, y: d.at[1] + 0.5, interactive: true, doorTo: { zone: d.to.zone, at: d.to.at }, danger: d.danger ?? target?.def.danger ?? 'public', label: 'Puerta', hiddenDoc: d.hidden, sign: d.sign ? { text: d.sign, color: d.signColor, icon: d.signIcon } : undefined });
    }
    for (const o of z.def.objects) {
      // v0.35 · El portal de un edificio de viviendas es una puerta de verdad: da al vestíbulo (o, si solo hay una vivienda,
      // directamente a ella). Conserva `objKind`/`objId` para el timbre, la compra y el modo automático.
      if (o.kind === 'housing' && z.def.kind === 'exterior') {
        const to = this.property.portalEntry(o.id);
        if (to) { this.addEntity(z, { kind: 'door', name: o.name, x: o.at[0] + 0.5, y: o.at[1] + 0.5, interactive: true, doorTo: to, danger: 'public', label: 'Puerta', objKind: 'housing', objId: o.id, sign: { text: 'PORTAL', color: '#ffd23f', icon: 'casa' } }); continue; }
      }
      this.addEntity(z, { kind: 'object', name: o.name, x: o.at[0] + 0.5, y: o.at[1] + 0.5, interactive: true, objKind: o.kind, dialog: o.dialog, label: '', shop: o.shop, sleep: o.sleep, workplace: o.workplace, objId: o.id, dealer: o.dealer });
    }
  }
  /** Devuelve una zona; las viviendas («casa:<id>») se instancian bajo demanda a partir de su plantilla. */
  ensureZone(id: string): Zone | undefined {
    const z = this.zones.get(id);
    if (z) return z;
    if (isPortalZone(id)) {
      const def = portalZoneDef(this.c, id);
      if (!def) return undefined;
      const nz = new Zone(def);
      this.zones.set(id, nz); this.dynamicSince.set(id, this.tick);
      this.populateZone(nz);
      return nz;
    }
    if (!isHouseZone(id)) return z;
    const house = this.property.houses.get(id.slice(5));
    const tpl = house && this.c.zones.find((x) => x.id === house.template);
    const exit = house && this.property.exitOf(house.id);
    if (!tpl || !exit) return undefined;
    const out = isPortalZone(exit.zone) ? 'Salir al rellano' : 'Salir a la calle';
    const def = { ...structuredClone(tpl), id, name: house.name, doors: tpl.doors.map((d) => ({ ...d, name: out, to: { zone: exit.zone, at: exit.at } })) };
    const nz = new Zone(def);
    this.zones.set(id, nz); this.dynamicSince.set(id, this.tick);
    this.populateZone(nz);
    return nz;
  }

  /** v0.35 · Plantas de portal y viviendas creadas bajo demanda (tick en el que se crearon o se usaron por última vez). */
  readonly dynamicSince = new Map<string, number>();
  /** Libera las zonas bajo demanda que llevan un rato vacías: con todos los portales abiertos, el servidor solo tiene en
   *  memoria (y recorre en cada tick) las plantas y casas en las que hay alguien o que se han usado hace poco. */
  collectZones(force = false) {
    const keep = RULES.tickRate * 60;
    for (const [id, since] of this.dynamicSince) {
      const z = this.zones.get(id);
      if (!z) { this.dynamicSince.delete(id); continue; }
      let busy = false;
      for (const e of z.entities) if (!(e.kind === 'door' || (e.kind === 'object' && e.objId))) { busy = true; break; }
      if (busy) { this.dynamicSince.set(id, this.tick); continue; }
      if (!force && this.tick - since < keep) continue;
      for (const e of [...z.entities]) this.removeEntity(e);
      this.zones.delete(id); this.dynamicSince.delete(id); this.districtCache.delete(id);
      this.metrics.inc('zonesFreed');
    }
  }

  /** Distrito al que pertenece un punto (en la ciudad única) o una zona interior (por su salida a la calle). */
  private districtCache = new Map<string, string>();
  districtOf(zone: Zone, x = 0, y = 0): string {
    if (zone.def.districts.length) return zone.districtAt(x, y)?.id ?? zone.id;
    if (zone.def.kind === 'exterior') return zone.id;
    const cached = this.districtCache.get(zone.id);
    if (cached) return cached;
    let out = zone.id;
    if (zone.id.startsWith('casa:')) out = this.property.houses.get(zone.id.slice(5))?.district || zone.id;
    else if (isPortalZone(zone.id)) { const b = parsePortalZone(zone.id)!.building; out = this.c.houses.find((h) => h.building === b)?.district || zone.id; }
    else {
      const lobby = zone.def.tower ? this.zones.get(`${zone.def.tower.id}-p0`) : zone;
      const d = lobby?.def.doors.find((x) => this.zones.get(x.to.zone)?.def.kind === 'exterior');
      const ext = d && this.zones.get(d.to.zone);
      if (d && ext) out = this.districtOf(ext, d.to.at[0], d.to.at[1]);
    }
    this.districtCache.set(zone.id, out);
    return out;
  }
  districtDef(zone: Zone, x: number, y: number) {
    const id = this.districtOf(zone, x, y);
    for (const z of this.zones.values()) for (const d of z.def.districts) if (d.id === id) return d;
    return null;
  }

  /** Crea un PNJ (lo usa la supervivencia para los fugitivos). */
  spawnNpc(z: Zone, o: { name: string; title: string; x: number; y: number; appearance: Entity['appearance']; label: string; speed: number }): Entity {
    return this.addEntity(z, { kind: 'npc', interactive: true, ...o });
  }
  removeEntity(e: Entity) { this.cityPeople.remove(e);e.zone.remove(e); this.entities.delete(e.id); }
  spawnAmbient(z: Zone, near?: { x: number; y: number }) { return this.spawnAmbientFn(z, near); }
  /** Mueve una entidad a otra zona sin puerta (cuerpos cargados). */
  moveEntityTo(e: Entity, to: Zone, x: number, y: number) { e.zone.remove(e); e.x = x; e.y = y; to.add(e); e.lastMoveTick = this.tick; }
  /** Traslada a un jugador a un punto concreto (detenciones). */
  async teleport(c: PlayerConn, zoneId: string, at: [number, number]) {
    const fake = { doorTo: { zone: zoneId, at }, kind: 'door', name: 'traslado' } as unknown as Entity;
    await this.transferPlayer(c, fake);
  }
  async legalTransfer(c:PlayerConn,zone:string,at:[number,number],apply:(q:Queryable)=>Promise<()=>void>){
    const door={doorTo:{zone,at},kind:'door',name:'Traslado penitenciario'} as Entity;
    if(!await this.transferPlayer(c,door,apply))throw new GameError('Hay un traslado en curso. Inténtalo de nuevo.');
  }
  playerOf(e: Entity): PlayerState | undefined {
    if (e.kind !== 'player') return undefined;
    if (e.conn?.p && !e.ghostOf) return e.conn.p;
    if (e.ghostOwner?.p) return e.ghostOwner.p;
    if (e.ghostOf) return undefined;
    for (const l of this.lingering.values()) if (l.e === e) return l.p;
    return undefined;
  }
  /** Retira de la simulación a un personaje fallecido y cierra su sesión. */
  removeDead(p: PlayerState, e: Entity) {
    this.removeEntity(e);
    this.property.clearParked(p);
    this.intel.goto.delete(p.charId);
    for (const [k, l] of this.lingering) if (l.p === p) { clearTimeout(l.timer); this.lingering.delete(k); }
    const c = e.conn;
    if (c) {
      this.missions.disconnect(c);
      if (this.conns.get(c.accountId) === c) this.conns.delete(c.accountId);
      c.closed = true;
      try { c.ws.close(4005, 'dead'); } catch {}
    }
  }

  addEntity(z: Zone, o: Partial<Entity> & { kind: Entity['kind']; name: string; x: number; y: number; interactive: boolean; label: string; speed?: number }): Entity {
    const e: Entity = {
      id: this.nextId++, zone: z, cellKey: 0, sectorId: '', path: [], facing: 2, moving: false, lastMoveTick: 0, labelVer: 0, ...o,
      speed: (o.speed ?? RULES.walkSpeedBase) * (o.kind === 'npc' && o.speed ? 0.82 : 1) * this.cfg.speedScale,
    } as Entity;
    if (o.kind === 'npc' && z.def.kind === 'exterior') {
      const stop = nearestWalkable(pedestrianGrid(z.grid, 'stop'), e.x, e.y, 12);
      if (stop) { e.x = stop.x; e.y = stop.y; }
    }
    e.sectorId = sectorOf(z.grid, e.x, e.y).id;
    z.add(e);
    this.entities.set(e.id, e);
    return e;
  }

  cityHour(): number {
    return ((Date.now() / this.c.manifest.cityHourMs + this.cfg.cityHourOffset) % 24 + 24) % 24;
  }

  start() {
    const dtMs = 1000 / RULES.tickRate;
    this.nextTickAt = performance.now();
    const loop = () => {
      const now = performance.now();
      // Recuperación acotada si el proceso se retrasa: como mucho 3 ticks de golpe.
      let n = 0;
      while (now >= this.nextTickAt && n < 3) { this.step(); this.nextTickAt += dtMs; n++; }
      if (now - this.nextTickAt > dtMs * 5) {
        // v0.12 · El tiempo que se salta no se pierde para quien anda con WASD: si no, el cliente (que sí lo vive) se adelanta
        // y al rato el servidor «te devuelve» unos pasos atrás.
        this.metrics.inc('lateTicks'); this.catchUpDt = Math.min(0.5, this.catchUpDt + (now - this.nextTickAt) / 1000); this.nextTickAt = now;
      }
      this.timer = setTimeout(loop, Math.max(0, this.nextTickAt - performance.now()));
    };
    loop();
  }
  stop() { if (this.timer) clearTimeout(this.timer); }
  /** Segundos de simulación que el bucle tuvo que saltarse por ir con retraso (se devuelven a los jugadores en el siguiente tick). */
  catchUpDt = 0;

  // ---------------------------------------------------------------- tick
  step() {
    const t0 = performance.now();
    this.tick++;
    this.pathBudget = 40;
    const dt = 1 / RULES.tickRate;
    const catchUp = this.catchUpDt; this.catchUpDt = 0;
    if (this.tick % 10 === 1) for (const z of this.zones.values()) if (z.def.districts.length) z.refreshActive();
    this.relics.dilation();
    if(this.tick%20===1){this.cityPeople.everySecond();this.cityPeople.watchDoors();}
    if(this.tick%20===11)this.prison.everySecond();
    for (const z of this.zones.values()) {
      // Nivel de detalle: lejos de cualquier jugador, los transeúntes y bandas quedan «resumidos» (no se mueven ni piensan).
      const anyone = z.players.size > 0;
      // v0.35 · Una planta de portal o una casa vacía no tiene nada que simular (solo puertas y muebles).
      if (!anyone && this.dynamicSince.has(z.id)) continue;
      for (const e of z.entities) {
        const resident=!!e.npc?.def?.resident;
        if(resident&&!z.isActive(e)&&e.aggro===undefined)continue;
        if (e.npc && e.npcType !== 'essential' && e.aggro === undefined && (!anyone || !z.isActive(e))) continue;
        const edt = e.conn ? dt + catchUp : dt;
        if (e.path.length) {
          if (e.carMotion) { e.carMotion.speed = 0; e.carMotion.heading = e.facing * Math.PI / 4; }
          this.moveEntity(e, edt);
        }
        else if (e.carMotion && (e.steer || e.carMotion.speed > 0)) this.driveEntity(e, edt);
        else if (e.steer) { for (let left = edt; left > 1e-6 && e.steer; left -= dt) this.steerEntity(e, Math.min(dt, left)); }
        if (e.pendingAction && e.conn) this.combat.checkPending(e.conn);
        if (e.channel && this.tick >= e.channel.endTick) { const ch = e.channel; e.channel = undefined; ch.apply(); }
        if (e.task) this.processTask(e);
        if (e.npc && e.npc.nextThink <= this.tick) {
          if (this.pathBudget > 0) {
            thinkNpc(this, e);
            e.npc.nextThink = this.tick + (resident&&e.aggro===undefined?(e.moving?7:14):z.players.size>0?5:20)+(e.id%3);
          } else e.npc.nextThink = this.tick + 1;
        }
      }
    }
    // Instantáneas escalonadas: cada cliente recibe una cada `snapshotEveryTicks` ticks, repartidos entre ticks consecutivos.
    { const every = RULES.snapshotEveryTicks, phase = this.tick % every; let i = 0; for (const c of this.conns.values()) { if ((i++ % every) === phase) this.snapshot(c); } }
    if (this.tick % 5 === 0) for (const c of this.conns.values()) {
      const e = c.e;
      if (!e || !c.p || e.ghostOf || e.transit) continue;
      void rememberMap(this.db,c.p,e.zone.id,e.x,e.y,true).then(delta => {
        if (delta && !c.closed) this.send(c,{t:'atlas',map:delta});
      }).catch(err => console.warn('[atlas]',err));
    }
    this.combat.everyTick();
    if (this.tick % 20 === 0 && this.tick % 200 === 0) { try { this.property.sample(); } catch (err) { console.error('[propiedad]', err); } }
    if (this.tick % 20 === 10) { try { this.intel.tick(); } catch (err) { console.error('[objetivo]', err); } }
    if (this.tick % 40 === 20) { try { this.autopilot.tick(); } catch (err) { console.error('[automático]', err); } }
    if (this.tick % 40 === 0) { try { this.property.pushLive(); } catch (err) { console.error('[mercado vivo]', err); } }
    if (this.tick % 20 === 0) { try { this.survival.everySecond(); } catch (err) { console.error('[supervivencia]', err); } this.combat.everySecond().catch((err) => console.error('[combate]', err)); }
    if (this.tick % 20 === 0) this.underworld.everySecond();
    if (this.tick % 100 === 17) this.missions.tick();
    if (this.tick % 20 === 14) { try { this.street.everySecond(); } catch (err) { console.error('[calle]', err); } }
    if (this.tick % 20 === 8) { try { this.corpses.everySecond(); } catch (err) { console.error('[cadáveres]', err); } }
    if (this.tick % 20 === 10) { try { this.stealth.tick(); } catch (err) { console.error('[sigilo]', err); } }
    if (this.tick % 20 === 12) this.legends.tick().catch((err) => console.error('[leyendas]', err));
    if (this.tick % 20 === 15) { try { this.relics.everySecond(); } catch (err) { console.error('[matrices]', err); } }
    if (this.tick % 20 === 5) this.threats.tick().catch((err) => console.error('[amenazas]', err));
    if (this.tick % 20 === 3) this.debts.everySecond().catch((err) => console.error('[deuda]', err));
    if (this.tick % 1200 === 7) this.scanner.everyMinute().catch((err) => console.error('[red]', err));
    if (this.tick % 20 === 0) this.facts.expire().then((ch) => { if (ch) this.broadcastFacts(); }).catch(() => {});
    if (this.tick % (RULES.tickRate * 15) === 0) void this.persistAll();
    if (this.tick % (RULES.tickRate * 20) === 7) this.collectZones();
    this.metrics.tick.push(performance.now() - t0);
  }

  private moveEntity(e: Entity, dt: number) {
    if (e.missionRide && (e.state === 'downed' || (e.stunUntil ?? 0) > Date.now())) { this.missions.finishRide(e); return; }
    if (this.waitsForLight(e)) { if (e.moving) { e.moving = false; e.lastMoveTick = this.tick; } return; }
    this.nightlife.stop(e);
    let budget = e.speed * dt * (e.timeScale ?? 1);
    let lastDx = 0, lastDy = 0;
    while (budget > 0 && e.path.length) {
      const [tx, ty] = e.path[0];
      const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
      if (d > 1e-6) { lastDx = dx; lastDy = dy; }
      if (d <= budget) { e.x = tx; e.y = ty; e.path.shift(); budget -= d; }
      else { e.x += (dx / d) * budget; e.y += (dy / d) * budget; budget = 0; }
    }
    if (lastDx || lastDy) e.facing = facingToIdx(lastDx, lastDy);
    e.moving = e.path.length > 0;
    e.lastMoveTick = this.tick;
    e.zone.moved(e);
    if (e.kind === 'player' && e.conn) {
      const s = sectorOf(e.zone.grid, e.x, e.y);
      const dn = dangerAt(e.zone.grid, e.x, e.y);
      if (s.id !== e.sectorId || dn !== e.conn.lastDanger) {
        if (s.id !== e.sectorId) this.metrics.inc('sectorCrossings');
        e.sectorId = s.id; e.conn.lastDanger = dn;
        this.send(e.conn, { t: 'sector', sector: s.name, danger: dn });
      }
    }
    if (!e.moving) this.onArrive(e);
  }

  /** v0.19 · Un transeúnte que va a pisar la calzada espera a que su semáforo de peatones esté en verde. */
  private waitsForLight(e: Entity) {
    if (!e.npc || e.aggro !== undefined || e.zone.def.kind !== 'exterior' || !e.path.length) return false;
    const g = e.zone.grid, rm = roadMap(g);
    if (rm.axis[Math.floor(e.y) * g.w + Math.floor(e.x)]) return false; // ya está cruzando: que acabe
    const [tx, ty] = e.path[0], dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
    if (d < 1e-6) return false;
    const px = e.x + (dx / d) * 0.6, py = e.y + (dy / d) * 0.6;
    const ax = crossingAxis(g, px, py, dx, dy);
    if (!ax) return false;
    return walkLight(Date.now(), px, py, ax) !== 'verde';
  }

  private driveEntity(e: Entity, dt: number) {
    const p = this.playerOf(e), car = p && this.property.carOf(p);
    const motion = e.carMotion!;
    if (!car || !p || e.transit || e.carriedBy || e.state === 'downed' || p.status !== 'alive' || p.sleeping || (e.stunUntil ?? 0) > Date.now()) {
      motion.speed = 0; e.steer = undefined; e.moving = false; e.lastMoveTick = this.tick;
      return;
    }
    if (e.steer && Date.now() - e.steer.at > 1500) e.steer = undefined;
    for (let remaining = dt; remaining > 1e-6; remaining -= 1 / RULES.tickRate) {
      const next = stepCar(e.zone.grid, e.x, e.y, motion, e.steer?.dx ?? 0, e.steer?.dy ?? 0,
        e.speed, car, Math.min(remaining, 1 / RULES.tickRate) * (e.timeScale ?? 1));
      e.moving = next.x !== e.x || next.y !== e.y;
      if (e.moving) { e.x = next.x; e.y = next.y; }
      motion.speed = next.speed; motion.heading = next.heading;
    }
    e.facing = facingToIdx(Math.cos(motion.heading), Math.sin(motion.heading));
    e.lastMoveTick = this.tick;
    e.zone.moved(e);
    if (e.conn) this.sectorCheck(e);
  }

  /** v0.7: movimiento libre con WASD. Se desliza por las paredes (prueba el eje X y el Y por separado). */
  private steerEntity(e: Entity, dt: number) {
    const s = e.steer!;
    if (Date.now() - s.at > 1500 || (!s.dx && !s.dy)) { e.steer = undefined; if (e.moving) { e.moving = false; e.lastMoveTick = this.tick; } return; }
    const p = this.playerOf(e);
    if (e.transit || e.carriedBy || e.state === 'downed' || (p && (p.status !== 'alive' || p.sleeping)) || (e.stunUntil ?? 0) > Date.now()) { e.moving = false; return; }
    this.nightlife.stop(e);
    const step = e.speed * dt * (e.guard && !p?.driving ? 0.5 : 1) * (e.timeScale ?? 1);
    const { x: nx, y: ny } = stepWithCollision(e.zone.grid, e.x, e.y, s.dx * step, s.dy * step, !!e.ghostOf);
    const moved = nx !== e.x || ny !== e.y;
    e.facing = e.guard && e.guardFacing !== undefined ? e.guardFacing : facingToIdx(s.dx, s.dy);
    if (moved) { e.x = nx; e.y = ny; e.zone.moved(e); }
    e.moving = moved;
    e.lastMoveTick = this.tick;
    if (e.kind === 'player' && e.conn) this.sectorCheck(e);
  }
  private sectorCheck(e: Entity) {
    const s = sectorOf(e.zone.grid, e.x, e.y);
    const dn = dangerAt(e.zone.grid, e.x, e.y);
    if (s.id !== e.sectorId || dn !== e.conn!.lastDanger) {
      if (s.id !== e.sectorId) this.metrics.inc('sectorCrossings');
      e.sectorId = s.id; e.conn!.lastDanger = dn;
      this.send(e.conn!, { t: 'sector', sector: s.name, danger: dn });
    }
  }

  private onArrive(e: Entity) {
    if (e.kind !== 'player' || !e.conn) return;
    if (e.missionRide) this.missions.finishRide(e, true);
    if (e.pendingInteract !== undefined) {
      const target = this.entities.get(e.pendingInteract);
      e.pendingInteract = undefined;
      if (target && target.zone === e.zone) this.tryInteract(e.conn, target, 2);
    } else if (!e.task) this.send(e.conn, { t: 'action', text: '' });
  }

  private processTask(e: Entity) {
    const tk = e.task!;
    const step = tk.def.steps[tk.step];
    const conn = e.conn;
    if ('moveTo' in step) {
      const tx = step.moveTo[0] + 0.5, ty = step.moveTo[1] + 0.5;
      if (e.zone.id !== step.zone) { this.cancelActivity(e, 'Tarea cancelada: estás en otra zona'); return; }
      if (!tk.started) {
        tk.started = true;
        const r = findPath(e.zone.grid, e.x, e.y, tx, ty, pathBudgetFor(e.x, e.y, tx, ty));
        if (!r.ok) { this.cancelActivity(e, 'Tarea cancelada: ruta bloqueada'); return; }
        e.path = r.path;
        if (conn) this.send(conn, { t: 'action', text: `${t(this.c, tk.def.label)} (${tk.rep + 1}/${tk.def.repeat}) · caminando` });
      } else if (!e.path.length) { tk.step++; tk.started = false; }
    } else {
      if (!tk.started) {
        tk.started = true; tk.waitUntil = this.tick + Math.round(step.wait * RULES.tickRate);
        if (conn) this.send(conn, { t: 'action', text: `${t(this.c, step.label)} (${tk.rep + 1}/${tk.def.repeat})`, duration: step.wait });
        e.labelVer++; e.label = t(this.c, step.label);
      } else if (this.tick >= tk.waitUntil) { tk.step++; tk.started = false; }
    }
    if (tk.step >= tk.def.steps.length) {
      tk.step = 0; tk.rep++;
      if (tk.rep >= tk.def.repeat) {
        e.task = undefined;
        e.label = ''; e.labelVer++;
        if (tk.onDone) { tk.onDone(); return; }
        if (conn?.p) this.enqueue(conn, async () => {
          try { const out = await this.effects.apply(conn.p!, tk.def.onComplete, { opId: tk.opId, kind: 'task' }); this.handleOutcome(conn, out); }
          catch (err) { this.reportError(conn, err); }
          this.send(conn, { t: 'action', text: '' });
        });
      }
    }
  }

  cancelActivity(e: Entity, reason?: string) {
    this.missions.finishRide(e);
    this.nightlife.stop(e);
    const had = !!(e.task || e.channel || e.path.length);
    e.task = undefined; e.channel = undefined; e.path = []; e.pendingInteract = undefined; e.moving = false;
    if (e.conn) {
      if (reason) this.send(e.conn, { t: 'notice', kind: 'warn', text: reason });
      if (had) this.send(e.conn, { t: 'action', text: '' });
    }
  }

  // ---------------------------------------------------------------- red
  send(c: PlayerConn, m: ServerMsg) {
    if (c.closed || c.ws.readyState !== 1) return;
    if (c.e && (m.t === 'speech' || m.t === 'motion') && m.id !== c.e.id && !c.known.has(m.id)) return;
    if (c.e && m.t === 'noise' && !canSee(c.e.zone.grid, c.e.x, c.e.y, c.e.facing, installedSight(c.p?.cyber ?? [], this.optics), m.x, m.y)) return;
    if (c.e && m.t === 'fx' && m.from !== c.e.id && m.to !== c.e.id && !c.known.has(m.from)) return;
    const s = JSON.stringify(m);
    c.ws.send(s);
    c.bytesOut += s.length;
    this.metrics.inc('bytesOut', s.length); this.metrics.inc('bytesOutJson', s.length);
  }

  motion(e:Entity,cue:import('@vertice/shared').MotionCue) {
    for(const viewer of e.zone.query(e.x,e.y,28)){
      if(viewer.conn && (viewer===e || viewer.conn.known.has(e.id)))this.send(viewer.conn,{t:'motion',id:e.id,cue});
    }
  }

  private snapshot(c: PlayerConn) {
    const e = c.e;
    if (!e || c.closed || c.ws.readyState !== 1) return;
    const buffered = c.ws.bufferedAmount;
    if (buffered > 2_000_000) { this.metrics.inc('slowClientDrops'); c.ws.close(4008, 'Cliente demasiado lento'); return; }
    // Contrapresión: las posiciones son el último estado; si el cliente va atrasado no se envían y se reenviarán después.
    const skipPos = buffered > 256_000;
    if (skipPos) this.metrics.inc('snapshotsSkipped');
    const sight = installedSight(c.p?.cyber ?? [], this.optics);
    const vis = e.zone.query(e.x, e.y, Math.max(this.cfg.viewRadius, sight.range));
    const visIds = new Set<number>();
    const spawns: EntitySpawn[] = [];
    const labels: Entity[] = [];
    let np = 0;
    const NEAR2 = 12 * 12;
    for (const v of vis) {
      // Puertas y mobiliario fijo ya figuran en la cartografía del cliente. Los actores y los objetos dinámicos sí se filtran aquí.
      const fixed = v.kind === 'door' || v.kind === 'object' && !!v.objId;
      if (!fixed && v !== e && !canSee(e.zone.grid, e.x, e.y, e.facing, sight, v.x, v.y)) continue;
      if (v.privateTo && v.privateTo !== c) continue;
      if(v.doorTo?.zone==='casino-meridiano-vip' && (!c.p||!this.casino.vip(c.p)))continue;
      visIds.add(v.id);
      const k = c.known.get(v.id);
      if (!k) { spawns.push(spawnOf(v)); c.known.set(v.id, { lv: v.labelVer, sent: this.tick }); continue; }
      if (k.lv !== v.labelVer) { k.lv = v.labelVer; labels.push(v); }
      if (skipPos || v.lastMoveTick <= k.sent) continue;
      // Interés por distancia: cerca a 10 Hz; lejos a 5 Hz. La posición final al detenerse siempre se entrega.
      const dx = v.x - e.x, dy = v.y - e.y;
      if (v !== e && dx * dx + dy * dy > NEAR2 && this.tick - k.sent < 4 && v.moving) continue;
      if (np >= MAX_POS) continue;
      const o = 7 + np * 9;
      POS_DV.setUint32(o, v.id); POS_DV.setUint16(o + 4, Math.max(0, Math.min(65535, Math.round(v.x * POS_SCALE)))); POS_DV.setUint16(o + 6, Math.max(0, Math.min(65535, Math.round(v.y * POS_SCALE))));
      POS_DV.setUint8(o + 8, (v.moving ? 1 : 0) | (v.facing << 1) | (v.task || v.channel ? 16 : 0) | (v.state === 'sleeping' ? 32 : 0) | (v.state === 'downed' ? 64 : 0) | (v.bounty ? 128 : 0));
      np++;
      k.sent = this.tick;
    }
    const gone: number[] = [];
    for (const id of c.known.keys()) if (!visIds.has(id)) gone.push(id);
    for (const id of gone) c.known.delete(id);
    // Agrupar las escrituras de esta instantánea en una sola llamada al sistema.
    const sock = (c.ws as any)._socket as { cork?: () => void; uncork?: () => void } | undefined;
    sock?.cork?.();
    try {
      if (gone.length) this.send(c, { t: 'despawn', ids: gone });
      if (spawns.length) this.send(c, { t: 'spawn', e: spawns });
      for (const l of labels) { const sp = spawnOf(l); this.send(c, { t: 'label', id: l.id, label: l.label, bounty: l.bounty ?? 0, state: l.state ?? 'alive', chrome: sp.chrome ?? [], hpPct: sp.hpPct, carried: sp.carried, appearance: l.kind === 'player' ? l.appearance : undefined, vehicle: l.vehicle ?? null, level: l.level, buffs: sp.buffs, lost: sp.lost ?? [], bleeding: sp.bleeding ?? false, weapon: sp.weapon, dead: sp.dead ?? false, emote: sp.emote ?? null, carry: sp.carry ?? [] }); }
      if (np) {
        POS_DV.setUint8(0, BIN_POSITIONS); POS_DV.setUint32(1, this.tick >>> 0); POS_DV.setUint16(5, np);
        const buf = Buffer.from(POS_BUF.subarray(0, 7 + np * 9)); // copia: el búfer compartido se reutiliza
        c.ws.send(buf);
        c.bytesOut += buf.byteLength;
        this.metrics.inc('bytesOut', buf.byteLength); this.metrics.inc('bytesOutPositions', buf.byteLength);
      }
    } finally { sock?.uncork?.(); }
    c.lastSnapTick = this.tick;
  }

  enqueue(c: PlayerConn, fn: () => Promise<void>) {
    c.queue = c.queue.then(fn).catch((err) => this.reportError(c, err));
  }
  private reportError(c: PlayerConn, err: unknown) {
    if (err instanceof GameError) this.send(c, { t: 'notice', kind: 'bad', text: err.message });
    else { console.error('[world] error', err); this.send(c, { t: 'notice', kind: 'bad', text: 'Error del servidor: la operación no se ha aplicado' }); }
  }

  // ---------------------------------------------------------------- sesiones
  async attach(ws: WebSocket, accountId: string, username: string, characterId?: string): Promise<PlayerConn | null> {
    const prev = this.attachLocks.get(accountId) ?? Promise.resolve();
    let release!: () => void;
    const lock = new Promise<void>((r) => (release = r));
    const tail = prev.then(() => lock);
    this.attachLocks.set(accountId, tail);
    await prev;
    try { await this.removals.get(accountId); return await this.attachInner(ws, accountId, username, characterId); } finally { release(); if (this.attachLocks.get(accountId) === tail) this.attachLocks.delete(accountId); }
  }

  private async attachInner(ws: WebSocket, accountId: string, username: string, characterId?: string): Promise<PlayerConn | null> {
    const conn: PlayerConn = { ws, accountId, username, known: new Map(), lastSnapTick: 0, queue: Promise.resolve(), chatTimes: [], closed: false, bytesOut: 0 };
    if (characterId && !await selectCharacter(this.db, accountId, characterId)) { ws.send(JSON.stringify({ t: 'error', reason: 'no_character' })); ws.close(4004, 'no_character'); return null; }
    const selected = characterId ?? await activeCharacterId(this.db, accountId);
    const old0 = this.conns.get(accountId);
    const old = old0 && !(old0.p as any)?.dead ? old0 : undefined;
    const ling0 = this.lingering.get(accountId);
    const ling = ling0 && !(ling0.p as any).dead ? ling0 : undefined;
    if (old) {
      // Reconexión desde otra pestaña: la nueva sesión toma el control de la MISMA entidad; la anterior se cierra.
      old.closed = true;
      this.missions.disconnect(old);
      try { old.ws.send(JSON.stringify({ t: 'kicked', reason: 'Has abierto el juego en otra pestaña o dispositivo.' })); old.ws.close(4001, 'replaced'); } catch {}
      this.metrics.inc('kicks');
      await old.queue.catch(() => {});
      if (old.p?.charId === selected) { conn.p = old.p; conn.e = old.e; }
      else if (old.e && old.p) { this.conns.delete(accountId); await this.removePlayer(accountId, old.e, old.p); }
      this.metrics.inc('reconnects');
    } else if (ling) {
      clearTimeout(ling.timer); this.lingering.delete(accountId);
      await ling.queue;
      if (ling.p.charId === selected) { conn.p = ling.p; conn.e = ling.e; }
      else await this.removePlayer(accountId, ling.e, ling.p);
      this.metrics.inc('reconnects');
    }
    if (!conn.p) {
      const charId = selected;
      if (!charId) { ws.send(JSON.stringify({ t: 'error', reason: 'no_character' })); ws.close(4004, 'no_character'); return null; }
      const p = await loadPlayer(this.db, charId);
      if (!p) { ws.send(JSON.stringify({ t: 'error', reason: 'no_character' })); ws.close(4004, 'no_character'); return null; }
      let zone = this.ensureZone(p.zone);
      if (!zone) { zone = this.zones.get(this.c.manifest.startZone)!; p.x = this.c.manifest.startAt[0] + 0.5; p.y = this.c.manifest.startAt[1] + 0.5; }
      if (!isWalkable(zone.grid, p.x, p.y)) { p.x = zone.def.safePoint[0] + 0.5; p.y = zone.def.safePoint[1] + 0.5; }
      conn.p = p;
      conn.e = this.addEntity(zone, { kind: 'player', name: p.name, title: this.c.roles.find((r) => r.id === p.role)?.name, x: p.x, y: p.y, interactive: true, appearance: wornAppearance(this.c, p), role: p.role, label: '', speed: walkSpeed(p.attributes), level: p.level });
      conn.e.chrome = chromeParts(this.c, p);
      conn.e.body = p.body; conn.e.weaponId = p.equipped ?? undefined;
      await this.combat.loadAmbar(p);
      await this.property.restoreParked(p).catch((err) => console.error('[coches]', err));
    }
    const e = conn.e!;
    e.conn = conn;
    await this.admin.onJoin(conn);
    this.nightlife.symptoms(conn.p!, e);
    if (e.label === 'Desconectado') { e.label = ''; e.labelVer++; }
    this.conns.set(accountId, conn);
    const s = sectorOf(e.zone.grid, e.x, e.y);
    e.sectorId = s.id;
    conn.lastDanger = dangerAt(e.zone.grid, e.x, e.y);
    this.send(conn, {
      t: 'welcome', you: e.id, sheet: buildSheet(this.c, conn.p!), zone: e.zone.id, x: e.x, y: e.y, tick: this.tick,
      cityHourMs: this.c.manifest.cityHourMs, cityEpoch: this.cfg.cityHourOffset, journal: this.journal(conn.p!), facts: this.facts.all(), sector: s.name, danger: conn.lastDanger,
    });
    if(conn.p?.sentence||e.zone.id==='penal-visitas')this.prison.show(conn);
    await rememberMap(this.db,conn.p!,e.zone.id,e.x,e.y,true);
    this.send(conn,{t:'atlas',map:mapKnowledge(conn.p!),reset:true});
    this.corpses.sendBlood(conn);
    if (e.path.length) this.send(conn, { t: 'ack', seq: 0, ok: true, path: e.path });
    return conn;
  }

  detach(conn: PlayerConn) {
    if (this.closing) { conn.closed = true; return; }
    if (conn.closed) return;
    if (this.relics.ghosts.has(conn)) this.relics.endGhost(conn, false);
    conn.closed = true;
    if (this.conns.get(conn.accountId) !== conn) return;
    this.conns.delete(conn.accountId);
    this.casino.disconnect(conn);
    this.missions.disconnect(conn);
    const e = conn.e, p = conn.p;
    if (!e || !p) return;
    this.nightlife.stop(e);
    this.prison.disconnect(conn);
    e.task = undefined; e.channel = undefined; e.path = []; e.pendingInteract = undefined; e.moving = false; e.conn = undefined;
    const danger = dangerAt(e.zone.grid, e.x, e.y);
    if (danger === 'protected' || this.cfg.lingerSeconds <= 0) { this.scheduleRemoval(conn.accountId, e, p, conn.queue); return; }
    // Política breve y defensiva: el personaje permanece unos segundos en el mundo antes de retirarse.
    e.label = 'Desconectado'; e.labelVer++;
    const timer = setTimeout(() => { this.lingering.delete(conn.accountId); this.scheduleRemoval(conn.accountId, e, p, conn.queue); }, this.cfg.lingerSeconds * 1000);
    this.lingering.set(conn.accountId, { e, p, timer, queue: conn.queue });
  }

  /** También disponible para las lecturas de la ficha mientras se termina de guardar una desconexión. */
  playerForAccount(accountId: string, charId?: string) {
    const p = this.conns.get(accountId)?.p ?? this.lingering.get(accountId)?.p;
    const e = this.conns.get(accountId)?.e ?? this.lingering.get(accountId)?.e;
    if (p && e) { const body = this.conns.get(accountId) ? this.relics.bodyOf(this.conns.get(accountId)!) : e; p.x = body.x; p.y = body.y; p.zone = body.zone.id; }
    return p && !(p as any).dead && (!charId || p.charId === charId) ? p : undefined;
  }

  async waitForAccountSave(accountId: string) { await this.removals.get(accountId); }

  private scheduleRemoval(accountId: string, e: Entity, p: PlayerState, queue: Promise<void>) {
    const task = queue.then(() => this.removePlayer(accountId, e, p));
    this.removals.set(accountId, task);
    void task.catch((err) => console.error('[guardado]', err)).finally(() => { if (this.removals.get(accountId) === task) this.removals.delete(accountId); });
  }

  private async removePlayer(_accountId: string, e: Entity, p: PlayerState) {
    this.property.clearParked(p);
    this.intel.goto.delete(p.charId);
    e.zone.remove(e);
    this.entities.delete(e.id);
    p.x = e.x; p.y = e.y; p.zone = e.zone.id;
    await savePlayerVitals(this.db, p);
  }

  async persistAll() {
    if (this.saving) return;
    this.saving = true;
    try {
      const list = [...this.conns.values()].filter((c) => c.e && c.p).map((c) => ({ e: this.relics.bodyOf(c), p: c.p! }));
      for (const l of this.lingering.values()) list.push(l);
      for (const { e, p } of list) {
        if (e.transit) continue;
        p.x = e.x; p.y = e.y; p.zone = e.zone.id;
        const t0 = performance.now();
        await savePlayerVitals(this.db, p);
        this.metrics.dbWrite.push(performance.now() - t0);
      }
    } catch (err) { console.error('[world] error al guardar', err); } finally { this.saving = false; }
  }

  async shutdown() {
    this.closing = true;
    this.stop();
    for (const c of this.conns.values()) c.closed = true;
    for (const l of this.lingering.values()) clearTimeout(l.timer);
    await Promise.all([...this.conns.values()].map((c) => c.queue));
    for (const [k, l] of this.lingering) { clearTimeout(l.timer); await l.queue; await this.removePlayer(k, l.e, l.p); }
    this.lingering.clear();
    await Promise.all(this.removals.values());
    while (this.saving) await new Promise((r) => setTimeout(r, 10));
    await this.persistAll();
  }

  journal(p: PlayerState) { return buildJournal(this.c, p, (id) => this.inst.participants(id)); }

  // ---------------------------------------------------------------- intenciones
  handle(c: PlayerConn, m: ClientMsg) {
    if (c.closed) return;
    const e = c.e;
    if (!e || !c.p) return;
    this.metrics.inc('msgsIn');
    const p = c.p, sv = this.survival;
    const blocked=this.prison.allowCommand(c,m);
    if(blocked){if('seq' in m)this.send(c,{t:'ack',seq:m.seq,ok:false,reason:blocked});return;}
    // Derribado: solo puede hablar, mirar paneles y esperar ayuda.
    const passive = ['ping', 'chat', 'market', 'jobs', 'bounties', 'closeDialog', 'hello', 'autonomy', 'factions', 'ambar', 'props', 'marketLive', 'skillUp', 'perkBuy', 'auto', 'penal', 'look', 'dossier', 'loan'];
    // Una orden manual del jugador (no del piloto automático, que usa seq 0) le devuelve el control.
    if ('seq' in m && m.seq > 0 && ['move', 'interact', 'hostile', 'retreat', 'stop', 'dance'].includes(m.t)) this.intel.cancel(c, 'Objetivo desmarcado: has tomado el control.');
    if (p.auto.on && 'seq' in m && m.seq > 0 && ['move', 'interact', 'hostile', 'hack', 'retreat', 'sleep', 'jobStart', 'car', 'stop', 'dance'].includes(m.t)) this.autopilot.takeOver(c);
    if (p.status === 'downed' && !passive.includes(m.t)) { if ('seq' in m) this.send(c, { t: 'ack', seq: m.seq, ok: false, reason: 'Estás derribado: espera a que alguien te estabilice.' }); return; }
    if (isSick(p.substances) && !passive.includes(m.t) && !['stop', 'menu'].includes(m.t)) {
      if ('seq' in m) this.send(c, { t: 'ack', seq: m.seq, ok: false, reason: 'Estás vomitando. Espera a recuperarte.' });
      return;
    }
    // Cualquier orden activa despierta al personaje.
    if (p.sleeping && ['move', 'interact', 'retreat', 'stop', 'jobStart', 'useItem'].includes(m.t)) sv.wake(c, 'Te despiertas.');
    const guarded = (seq: number, fn: () => Promise<void>) => this.enqueue(c, async () => {
      try { await fn(); this.send(c, { t: 'ack', seq, ok: true }); }
      catch (err) { if (err instanceof GameError) this.send(c, { t: 'ack', seq, ok: false, reason: err.message }); else throw err; }
    });
    switch (m.t) {
      case 'penal': return guarded(m.seq,()=>this.prison.command(c,m));
      case 'bank': return guarded(m.seq,()=>this.prison.bank(c,m));
      case 'ping': this.send(c, { t: 'pong', seq: m.seq, ct: m.ct, st: Date.now() }); return;
      case 'move': return this.onMove(c, e, m.seq, m.x, m.y);
      case 'steer': {
        const moving = m.dx !== 0 || m.dy !== 0;
        const len = Math.hypot(m.dx, m.dy) || 1;
        if (moving && !e.steer) { this.cancelActivity(e); this.closeDialog(c); this.intel.cancel(c); if (p.auto.on) this.autopilot.takeOver(c); }
        // v0.20 · Con WASD manda el jugador: se olvida cualquier ruta o acción pendiente (ir a por alguien, retirada…).
        if (moving && (e.path.length || e.pendingAction)) { e.path = []; e.pendingInteract = undefined; e.pendingAction = undefined; }
        if (moving && e.hiddenIn) this.corpses.leaveHiding(c, true);
        e.steer = moving ? { dx: m.dx / len, dy: m.dy / len, at: Date.now() } : undefined;
        if (moving) e.lastDir = { dx: m.dx / len, dy: m.dy / len };
        if (!moving && !e.carMotion) { e.moving = false; e.lastMoveTick = this.tick; }
        return;
      }
      case 'dodge': return guarded(m.seq, async () => this.combat.dodge(c, m.dx, m.dy));
      case 'swing': return guarded(m.seq, async () => this.combat.swing(c, m.dx, m.dy, !!m.heavy, m.opId));
      case 'guard': {
        if(p.driving && m.on){this.send(c,{t:'ack',seq:m.seq,ok:false,reason:'Estás al volante.'});return;}
        if(!!e.guard!==m.on){e.guard=m.on;e.guardSince=m.on?Date.now():undefined;e.labelVer++;}
        e.guardFacing=m.on?m.facing:undefined;
        if(m.on && m.facing!==undefined && e.facing!==m.facing){e.facing=m.facing;e.lastMoveTick=this.tick+1;}
        this.send(c, { t: 'ack', seq: m.seq, ok: true }); return;
      }
      case 'stop': this.cancelActivity(e); this.closeDialog(c); this.send(c, { t: 'ack', seq: m.seq, ok: true, info: 'Orden cancelada' }); return;
      case 'interact': return this.onInteract(c, e, m.seq, m.target, m.remote);
      case 'retreat': return this.onRetreat(c, e, m.seq);
      case 'closeDialog': this.closeDialog(c); this.send(c, { t: 'ack', seq: m.seq, ok: true }); return;
      case 'mapHack': return guarded(m.seq,async () => {
        await unlockMap(this.db,p);
        this.send(c,{t:'atlas',map:{cells:[],places:[],unlocked:true}});
      });
      case 'stance': p.stance = m.stance; this.send(c, { t: 'ack', seq: m.seq, ok: true }); this.send(c, { t: 'sheet', sheet: buildSheet(this.c, p) }); return;
      case 'chat': return this.onChat(c, e, m.seq, m.text, m.channel);
      case 'choose': this.enqueue(c, () => this.onChoose(c, m)); return;
      case 'useItem': return guarded(m.seq, () => sv.consume(c, m.item, m.opId));
      case 'sleep': return guarded(m.seq, () => sv.sleepCmd(c, -1));
      case 'wake': sv.wake(c, 'Te despiertas.'); this.send(c, { t: 'ack', seq: m.seq, ok: true }); return;
      case 'autonomy': p.autoNeeds = m.autoNeeds; this.send(c, { t: 'ack', seq: m.seq, ok: true }); this.send(c, { t: 'sheet', sheet: buildSheet(this.c, p) }); return;
      case 'buy': return guarded(m.seq, () => sv.buy(c, m));
      case 'sell': return guarded(m.seq, () => sv.sell(c, m));
      case 'steal': return guarded(m.seq, () => sv.steal(c, m));
      case 'market': this.send(c, { t: 'market', view: { ...sv.market.view(), nextPolicyInMin: Math.round(((this.c.market.policyEveryGameHours - ((Date.now() / this.c.manifest.cityHourMs + this.cfg.cityHourOffset) % this.c.market.policyEveryGameHours)) * this.c.manifest.cityHourMs) / 60000) } }); this.send(c, { t: 'ack', seq: m.seq, ok: true }); return;
      case 'jobs': return guarded(m.seq, async () => this.send(c, { t: 'jobs', view: await sv.jobsView(c) }));
      case 'jobAccept': return guarded(m.seq, async () => { await sv.jobAccept(c, m.job); this.send(c, { t: 'jobs', view: await sv.jobsView(c) }); });
      case 'jobStart': return guarded(m.seq, () => sv.jobStart(c));
      case 'jobQuit': p.activeJob = null; if (e.task?.def.id.startsWith('job:')) this.cancelActivity(e, 'Turno abandonado: no cobras.'); this.send(c, { t: 'ack', seq: m.seq, ok: true }); this.send(c, { t: 'sheet', sheet: buildSheet(this.c, p) }); return;
      case 'profession': return guarded(m.seq, () => sv.changeProfession(c, m.profession, m.opId));
      case 'clinicDo': return guarded(m.seq, () => sv.clinicDo(c, m));
      case 'bounties': this.send(c, { t: 'bounties', view: sv.bountyView(p) }); this.send(c, { t: 'ack', seq: m.seq, ok: true }); return;
      case 'bountyPlace': return guarded(m.seq, () => sv.placeBounty(c, m));
      case 'hackMenu': { const t = this.entities.get(m.target); if (!t || t.zone !== e.zone || t === e) return this.send(c, { t: 'ack', seq: m.seq, ok: false, reason: 'Nada que hackear ahí.' }); this.send(c, { t: 'targetMenu', view: this.combat.hackMenu(c, t) }); this.send(c, { t: 'ack', seq: m.seq, ok: true }); return; }
      case 'menu': { const t = this.entities.get(m.target); if (t && t.zone === e.zone) this.send(c, { t: 'targetMenu', view: this.combat.menu(c, t) }); this.send(c, { t: 'ack', seq: m.seq, ok: true }); return; }
      case 'hack': return guarded(m.seq, () => this.combat.hack(c, m));
      case 'equip': return guarded(m.seq, async () => sv.equip(c, m.item));
      case 'skillUp': return guarded(m.seq, () => this.progress.skillUp(c, m.skill));
      case 'loan': return guarded(m.seq, () => this.debts.pay(c, m.amount));
      case 'look': return void this.scanner.scan(c, m.target).catch((err) => console.error('[escáner]', err));
      case 'dossier': return guarded(m.seq, () => this.scanner.command(c, m.action, m.offer));
      case 'perkBuy': return guarded(m.seq, () => this.progress.perkBuy(c, m.perk));
      case 'wear': return guarded(m.seq, async () => sv.wear(c, m.slot, m.item, (m as any).confirm === true));
      case 'ability': return guarded(m.seq, () => this.combat.ability(c, m.id));
      case 'props': this.send(c, { t: 'props', view: this.property.propsView(p) }); this.send(c, { t: 'ack', seq: m.seq, ok: true }); return;
      case 'marketLive': this.property.liveOn(c, m.on); this.send(c, { t: 'ack', seq: m.seq, ok: true }); return;
      case 'run': p.running = m.on; this.survival.refreshMovement(c); this.send(c, { t: 'ack', seq: m.seq, ok: true }); this.send(c, { t: 'sheet', sheet: buildSheet(this.c, p) }); return;
      case 'auto': return guarded(m.seq, async () => this.autopilot.set(c, m.on, m.personality));
      case 'post': return guarded(m.seq, async () => {
        if (m.action === 'apply') { await this.posts.apply(c, m.post ?? ''); this.send(c, { t: 'hiring', view: this.posts.hiringView(c, m.obj ?? this.c.posts.find((x) => x.id === m.post)?.obra) }); }
        else if (m.action === 'quit') await this.posts.quit(c);
        else if (m.action === 'work') await this.posts.work(c);
        else this.send(c, { t: 'hiring', view: this.posts.hiringView(c, m.obj) });
      });
      case 'elevator': return guarded(m.seq, async () => { if (m.floor === undefined) this.send(c, { t: 'elevator', view: this.posts.elevatorView(c) }); else await this.posts.elevator(c, m.floor, !!m.hack); });
      case 'house': return guarded(m.seq, async () => {
        const pr = this.property, hid = m.house ?? '';
        switch (m.action) {
          case 'view': this.send(c, { t: 'building', view: pr.buildingView(p, m.building ?? '') }); break;
          case 'realty': this.send(c, { t: 'realty', view: pr.realtyView(p, m.filter) }); break;
          case 'buy': { const desk = [...e.zone.entities].some((o) => o.objKind === 'realty' && Math.hypot(o.x - e.x, o.y - e.y) < 5); await pr.buyHouse(c, hid, m.opId ?? randomUUID(), desk); break; }
          case 'sell': await pr.sellHouse(c, hid, m.opId ?? randomUUID()); this.send(c, { t: 'props', view: pr.propsView(p) }); break;
          case 'enter': await pr.enterHouse(c, hid); break;
          case 'ring': pr.ring(c, hid); break;
          case 'answer': pr.answer(c, hid, m.who ?? 0, !!m.allow); break;
          case 'permit': await pr.permit(c, hid, m.name ?? '', true); this.send(c, { t: 'props', view: pr.propsView(p) }); break;
          case 'revoke': await pr.permit(c, hid, m.name ?? '', false); this.send(c, { t: 'props', view: pr.propsView(p) }); break;
          case 'stash': this.send(c, { t: 'stash', view: await pr.stashView(c, hid) }); break;
          case 'stashIn': await pr.stashMove(c, hid, m.item ?? '', m.qty ?? 1, 'in'); break;
          case 'stashOut': await pr.stashMove(c, hid, m.item ?? '', m.qty ?? 1, 'out'); break;
        }
      });
      case 'car': return guarded(m.seq, async () => {
        if (e.missionRide) throw new GameError('Vas de pasajero. Muévete para bajarte primero.');
        const pr = this.property;
        switch (m.action) {
          case 'dealer': this.send(c, { t: 'dealer', view: pr.dealerView(p, m.dealer ?? '') }); break;
          case 'buy': await pr.buyCar(c, m.dealer ?? '', m.car ?? '', m.opId ?? randomUUID()); this.send(c, { t: 'dealer', view: pr.dealerView(p, m.dealer ?? '') }); break;
          case 'sell': await pr.sellCar(c, m.car ?? '', m.opId ?? randomUUID()); this.send(c, { t: 'props', view: pr.propsView(p) }); break;
          case 'drive': pr.drive(c, m.car); break;
          case 'park': pr.park(c); break;
          case 'travel': await pr.travel(c, m.zone ?? ''); break;
        }
      });
      case 'drop': return guarded(m.seq, async () => this.combat.drop(c));
      // v0.13 · Saqueo de cuerpos y contenedores (meter un cadáver, rebuscar, esconderse).
      case 'loot': return guarded(m.seq, async () => { const t = this.entities.get(m.target); if (!t) throw new GameError('Ya no está.'); if (m.kind === 'view') this.corpses.view(c, t); else await this.corpses.take(c, t, m.kind, m.id); });
      case 'container': return guarded(m.seq, async () => this.corpses.container(c, m.action));
      case 'matrix': return guarded(m.seq, async () => this.relics.matrix(c, m.action, m.item));
      case 'legend': return guarded(m.seq, async () => this.legends.handle(c, m.legend, m.action));
      case 'cheat': return guarded(m.seq, async () => this.admin.cheat(c, m.cmd, m.arg, m.n));
      case 'treat': return guarded(m.seq, async () => sv.treatWound(c, m.wound, m.action, m.opId));
      case 'repairChrome': return guarded(m.seq, async () => sv.repairChrome(c, m.doc, m.opId));
      case 'clinicHeal': return guarded(m.seq, async () => sv.clinicHeal(c, m.doc, m.opId));
      case 'searchPeople': return guarded(m.seq, async () => this.intel.search(c, m.query, m.device));
      case 'goto': return guarded(m.seq, async () => this.intel.start(c, m));
      case 'trunk': return guarded(m.seq, async () => {
        if (m.action === 'view') this.send(c, { t: 'trunk', view: await this.property.trunkView(c) });
        else await this.property.trunkMove(c, m.item ?? '', m.qty ?? 1, m.action);
      });
      case 'casino': return guarded(m.seq,()=>this.casino.play(c,m));
      case 'dance': return guarded(m.seq, async () => this.nightlife.dance(c, m.move));
      case 'underworld': return guarded(m.seq, () => this.underworld.command(c, m));
      case 'factions': this.send(c, { t: 'factions', view: this.combat.factionsView(p) }); this.send(c, { t: 'ack', seq: m.seq, ok: true }); return;
      case 'ambar': return guarded(m.seq, async () => { if (m.plan && m.opId) await this.combat.buyAmbar(c, m.plan, m.opId); this.send(c, { t: 'ambar', view: this.combat.ambarView(p) }); this.send(c, { t: 'sheet', sheet: buildSheet(this.c, p) }); });
      case 'bribe': return guarded(m.seq, () => this.combat.bribe(c, m.opId));
      case 'hostile': this.enqueue(c, async () => { try { await this.combat.action(c, m); } catch (err) { if (err instanceof GameError) this.send(c, { t: 'ack', seq: m.seq, ok: false, reason: err.message }); else throw err; } }); return;
      case 'rescue': this.enqueue(c, async () => { try { await sv.rescue(c, m.seq, m.target, m.opId); } catch (err) { if (err instanceof GameError) this.send(c, { t: 'ack', seq: m.seq, ok: false, reason: err.message }); else throw err; } }); return;
      case 'hello': return;
    }
  }

  private onMove(c: PlayerConn, e: Entity, seq: number, x: number, y: number) {
    if (e.transit) return this.send(c, { t: 'ack', seq, ok: false, reason: 'Cruzando una puerta…' });
    this.cancelActivity(e);
    this.closeDialog(c);
    const dest = nearestWalkable(e.zone.grid, x, y, 2);
    if (!dest) return this.send(c, { t: 'ack', seq, ok: false, reason: 'Destino inaccesible: ahí hay un edificio, agua u obstáculo.' });
    const r = this.playerPath(e, dest.x, dest.y);
    if (!r.ok) return this.send(c, { t: 'ack', seq, ok: false, reason: r.reason });
    this.send(c, { t: 'ack', seq, ok: true, path: e.path });
  }

  playerPath(e: Entity, x: number, y: number): { ok: true } | { ok: false; reason: string } {
    if (e.conn?.p && isSick(e.conn.p.substances)) return { ok: false, reason: 'Estás vomitando. Espera a recuperarte.' };
    this.metrics.inc('pathRequests');
    const r = findPath(e.zone.grid, e.x, e.y, x, y, pathBudgetFor(e.x, e.y, x, y));
    this.metrics.inc('pathExpanded', r.expanded);
    if (!r.ok) {
      this.metrics.inc('pathFailures');
      return { ok: false, reason: r.reason === 'ruta_demasiado_larga' ? 'Ruta demasiado larga: elige un destino intermedio.' : 'No hay ruta hasta ese punto.' };
    }
    e.path = r.path; e.moving = true;
    return { ok: true };
  }

  /** Ruta de PNJ con presupuesto por tick y caché de rutas comunes. */
  npcPath(e: Entity, x: number, y: number): boolean {
    const grid = e.zone.grid;
    const end = nearestWalkable(pedestrianGrid(grid, 'stop'), x, y, 8);
    if (!end) return false;
    const key = `${e.zone.id}|${e.x},${e.y}|${end.x},${end.y}`;
    const cached = this.pathCache.get(key);
    if (cached) { this.metrics.inc('pathCacheHits'); e.path = cached.slice(); e.moving = true; return true; }
    if (this.pathBudget <= 0) return false;
    this.pathBudget--;
    this.metrics.inc('pathRequests');
    // v0.19 · Los transeúntes van por la acera y cruzan por los pasos de peatones.
    const r = findPath(grid, e.x, e.y, end.x, end.y, 9000, { pedestrian: true });
    this.metrics.inc('pathExpanded', r.expanded);
    if (!r.ok) { this.metrics.inc('pathFailures'); return false; }
    if (this.pathCache.size > 3000) this.pathCache.delete(this.pathCache.keys().next().value!);
    this.pathCache.set(key, r.path);
    e.path = r.path.slice(); e.moving = true;
    return true;
  }

  private onInteract(c: PlayerConn, e: Entity, seq: number, targetId: number, remote = false) {
    if (e.transit) return this.send(c, { t: 'ack', seq, ok: false, reason: 'Cruzando una puerta…' });
    const target = this.entities.get(targetId);
    if (e.ghostOf && target?.kind !== 'door') return this.send(c, { t: 'ack', seq, ok: false, reason: 'Eres una proyección: nadie te ve y no puedes tocar nada. Espía, atraviesa paredes y cruza puertas.' });
    if (!target || (target.privateTo && target.privateTo !== c) || target.zone !== e.zone || !target.interactive || target === e) return this.send(c, { t: 'ack', seq, ok: false, reason: 'No puedes interactuar con eso.' });
    // v0.9 · Clic del jugador: nunca camina. Interactúa a distancia (REMOTE_RANGE) o pide acercarse con WASD.
    if (remote) {
      const d = Math.hypot(target.x - e.x, target.y - e.y);
      const max = target.kind === 'door' ? REMOTE_DOOR_RANGE : REMOTE_RANGE;
      if (d > max) return this.send(c, { t: 'ack', seq, ok: false, reason: target.kind === 'door' ? `Acércate a la puerta (WASD): estás a ${d.toFixed(0)} m.` : `Demasiado lejos (${d.toFixed(0)} m de ${REMOTE_RANGE} m). Acércate con WASD.` });
      if (target.kind === 'player' || target.fugitive || (target.npcType && target.npcType !== 'essential' && target.npcType !== 'civil' && !this.cityPeople.has(target))) { this.send(c, { t: 'targetMenu', view: this.combat.menu(c, target) }); return this.send(c, { t: 'ack', seq, ok: true }); }
      this.closeDialog(c);
      if (target.kind === 'door') { void this.transferPlayer(c, target); return this.send(c, { t: 'ack', seq, ok: true }); }
      this.tryInteract(c, target, 0, REMOTE_RANGE);
      return this.send(c, { t: 'ack', seq, ok: true });
    }
    if (target.kind === 'player' || target.fugitive || (target.npcType && target.npcType !== 'essential' && target.npcType !== 'civil' && !this.cityPeople.has(target))) {
      // Menú de acciones sobre personas: se calcula en el servidor con probabilidades y bloqueos.
      if (Math.hypot(target.x - e.x, target.y - e.y) > 2.6) {
        const r = this.playerPath(e, target.x, target.y);
        if (!r.ok) return this.send(c, { t: 'ack', seq, ok: false, reason: r.reason });
        e.path = e.path.slice(0, -1);
        if (e.path.length === 0) e.path = [[target.x, target.y]];
      }
      this.send(c, { t: 'targetMenu', view: this.combat.menu(c, target) });
      return this.send(c, { t: 'ack', seq, ok: true, path: e.path.length ? e.path : undefined });
    }
    this.cancelActivity(e);
    this.closeDialog(c);
    if (this.tryInteract(c, target, 0)) return this.send(c, { t: 'ack', seq, ok: true });
    // Acercarse al punto de interacción adecuado.
    const range = target.kind === 'door' ? 0 : INTERACT_RANGE - 0.4;
    let best: { x: number; y: number } | null = null, bd = Infinity;
    const tx = Math.floor(target.x), ty = Math.floor(target.y);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const px = tx + dx + 0.5, py = ty + dy + 0.5;
      if (!isWalkable(e.zone.grid, px, py)) continue;
      if (Math.hypot(px - target.x, py - target.y) > Math.max(range, 0.01) + 0.01) continue;
      const d = Math.hypot(px - e.x, py - e.y);
      if (d < bd) { bd = d; best = { x: px, y: py }; }
    }
    if (!best) return this.send(c, { t: 'ack', seq, ok: false, reason: 'No hay acceso hasta ahí.' });
    const r = this.playerPath(e, best.x, best.y);
    if (!r.ok) return this.send(c, { t: 'ack', seq, ok: false, reason: r.reason });
    e.pendingInteract = target.id;
    this.send(c, { t: 'ack', seq, ok: true, path: e.path, info: `Yendo hacia ${target.name}` });
  }

  /** Abre la interacción si está al alcance. `retries` permite perseguir a un PNJ que se ha movido. */
  private tryInteract(c: PlayerConn, target: Entity, retries: number, reach = INTERACT_RANGE): boolean {
    if (target.privateTo && target.privateTo !== c) return false;
    const e = c.e!;
    const d = Math.hypot(target.x - e.x, target.y - e.y);
    if (target.kind === 'door') {
      if (d > DOOR_RANGE) { if (retries > 0) this.reapproach(c, target, retries); return false; }
      void this.transferPlayer(c, target);
      return true;
    }
    if (d > reach) { if (retries > 0) this.reapproach(c, target, retries); return false; }
    if (target.marketSite) { this.underworld.open(c, target); return true; }
    if (target.legendId) { this.legends.open(c, target.legendId); return true; }
    if (target.kind === 'object' && target.objKind && !target.dialog) { this.objectAction(c, target); return true; }
    if(target.kind==='npc' && this.cityPeople.interact(c,target))return true;
    if (target.kind === 'npc' && !target.dialog && target.npcShop) { this.survival.openShop(c, target.npcShop, target); return true; }
    this.openDialog(c, target);
    return true;
  }
  private reapproach(c: PlayerConn, target: Entity, retries: number) {
    const e = c.e!;
    const p = nearestWalkable(e.zone.grid, target.x, target.y, 2);
    if (!p || !this.playerPath(e, p.x, p.y).ok) return this.send(c, { t: 'notice', kind: 'warn', text: `No llegas hasta ${target.name}.` });
    e.pendingInteract = target.id;
    void retries;
    this.send(c, { t: 'ack', seq: 0, ok: true, path: e.path });
  }

  private onRetreat(c: PlayerConn, e: Entity, seq: number) {
    this.cancelActivity(e); this.closeDialog(c);
    if (e.zone.def.kind === 'interior') {
      const sp = e.zone.def.safePoint;
      const r = this.playerPath(e, sp[0] + 0.5, sp[1] + 0.5);
      return this.send(c, r.ok ? { t: 'ack', seq, ok: true, path: e.path, info: 'Retirada al punto seguro del local' } : { t: 'ack', seq, ok: false, reason: r.reason });
    }
    let best: { door: Entity; path: [number, number][]; len: number } | null = null;
    // Refugio: zonas protegidas o, en su defecto, cualquier local público cercano (no casas ajenas ni bases de bandas).
    const refuges = [...e.zone.entities].filter((d) => d.kind === 'door' && d.doorTo && (d.danger === 'protected' ? !d.doorTo.zone.startsWith('casa:') && !/^casa-/.test(d.doorTo.zone) : d.danger === 'public' && this.zones.get(d.doorTo.zone)?.def.kind === 'interior' && !this.zones.get(d.doorTo.zone)?.def.gangBase && !/^casa/.test(d.doorTo.zone)))
      .sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y)).slice(0, 6);
    for (const d of refuges) {
      const r = findPath(e.zone.grid, e.x, e.y, d.x, d.y, pathBudgetFor(e.x, e.y, d.x, d.y));
      if (!r.ok) continue;
      let len = 0, px = e.x, py = e.y;
      for (const [x, y] of r.path) { len += Math.hypot(x - px, y - py); px = x; py = y; }
      if (!best || len < best.len) best = { door: d, path: r.path, len };
    }
    if (!best) return this.send(c, { t: 'ack', seq, ok: false, reason: 'No hay refugio alcanzable.' });
    e.path = best.path; e.moving = true; e.pendingInteract = best.door.id;
    this.send(c, { t: 'ack', seq, ok: true, path: e.path, info: `Retirada hacia ${best.door.name} (${Math.round(best.len)} m)` });
  }

  private onChat(c: PlayerConn, e: Entity, seq: number, text: string, channel: 'local' | 'global' = 'local') {
    const now = Date.now();
    c.chatTimes = c.chatTimes.filter((x) => now - x < 5000);
    // El global llega a toda la ciudad: como mucho un mensaje cada 4 s.
    if (c.chatTimes.length >= 3 || (channel === 'global' && c.chatTimes.some((x) => now - x < 4000 && (c as any).lastGlobal === x))) return this.send(c, { t: 'ack', seq, ok: false, reason: 'Vas demasiado rápido: espera unos segundos para escribir.' });
    c.chatTimes.push(now);
    if (channel === 'global') (c as any).lastGlobal = now;
    const clean = text.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200);
    if (!clean) return;
    if (channel === 'global') { for (const o of this.conns.values()) if (!o.closed) this.send(o, { t: 'chat', from: e.name, fromId: e.id, channel: 'global', text: clean }); this.send(c, { t: 'ack', seq, ok: true }); return; }
    for (const o of e.zone.query(e.x, e.y, 20)) if (o.kind === 'player' && o.conn) this.send(o.conn, { t: 'chat', from: e.name, fromId: e.id, channel: 'local', text: clean });
    this.send(c, { t: 'ack', seq, ok: true });
  }

  // ---------------------------------------------------------------- puertas y traslados
  private async transferPlayer(c: PlayerConn, door: Entity, legal?:(q:Queryable)=>Promise<()=>void>) {
    const e = c.e!, p = c.p!;
    if (e.transit || !door.doorTo) return;
    if (e.ghostOf) { if(!legal&&!this.prison.portal(c,door.doorTo.zone))this.relics.ghostDoor(c, door); return; }
    const to = this.ensureZone(door.doorTo.zone);
    if (!to) return;
    // v0.8: las guaridas de las leyendas y el Velo solo se abren a quien se ha ganado su confianza.
    const deny = legal?undefined:(this.prison.portal(c,to.id)??await this.cityPeople.doorDeny(c,e.zone.id,to.id)??await this.casino.deny(p,e.zone.id,to.id)??this.legends.denyEntry(p,to)??this.property.denyDoor(c,to.id));
    if(e.transit)return;
    if (deny) { this.send(c, { t: 'notice', kind: 'warn', text: deny }); return; }
    this.nightlife.stop(e);
    this.missions.finishRide(e);
    if (p.driving && to.def.kind !== 'exterior') this.property.park(c, true);
    if (door.hiddenDoc) this.combat.discover(c, door.hiddenDoc);
    e.transit = true;
    e.path = []; e.moving = false;
    const transferId = randomUUID();
    const nx = door.doorTo.at[0] + 0.5, ny = door.doorTo.at[1] + 0.5;
    const entered = mapKeys(p,to.id,nx,ny,true);
    let apply:(()=>void)|undefined;
    const t0 = performance.now();
    try {
      // El traslado se confirma en la base de datos antes de cambiar de autoridad; si falla, el origen sigue siendo propietario.
      await this.db.tx(async (q) => {
        if(legal)apply=await legal(q);
        await q.query('UPDATE characters SET zone_id=$2, pos_x=$3, pos_y=$4 WHERE id=$1', [p.charId, to.id, nx, ny]);
        await q.query('INSERT INTO zone_transfers (id, character_id, from_zone, to_zone) VALUES ($1,$2,$3,$4)', [transferId, p.charId, e.zone.id, to.id]);
        await writeMapKeys(q,p.charId,entered);
      });
    } catch (err) {
      e.transit = false;
      if(legal)throw err;
      console.error('[world] traslado fallido', err);
      this.send(c, { t: 'notice', kind: 'bad', text: 'No se pudo cruzar la puerta. Sigues donde estabas.' });
      return;
    }
    this.metrics.dbWrite.push(performance.now() - t0);
    if (c.closed && this.conns.get(c.accountId) !== c && !this.lingering.has(c.accountId)) { /* desconectado en tránsito: aún aplicamos el traslado */ }
    apply?.();
    e.zone.remove(e);
    e.x = nx; e.y = ny; p.zone = to.id; p.x = nx; p.y = ny;
    to.add(e);
    const discovery = applyMapKeys(p,entered);
    e.transit = false;
    e.pendingAction = undefined;
    if (e.carMotion) { e.carMotion.speed = 0; e.steer = undefined; }
    if (p.carrying) { const body = this.entities.get(p.carrying); if (body) this.moveEntityTo(body, to, nx + 0.3, ny + 0.3); }
    this.metrics.inc('zoneTransfers');
    const conn = e.conn;
    if (conn) {
      conn.known.clear();
      conn.dialog = undefined;
      const s = sectorOf(to.grid, nx, ny);
      e.sectorId = s.id;
      conn.lastDanger = dangerAt(to.grid, nx, ny);
      this.send(conn, { t: 'zone', zone: to.id, x: nx, y: ny, sector: s.name, danger: conn.lastDanger });
      if (discovery) this.send(conn,{t:'atlas',map:discovery});
      if (e.hiddenIn) { e.hiddenIn = undefined; delete conn.p!.buffs.escondido; }
      this.corpses.sendBlood(conn);
      void this.legends.event(conn, { type: 'visit', zone: to.id }).catch(() => {});
      // v0.10 · Arco detector de armas en la entrada de los lugares restringidos.
      this.stealth.detector(conn, to.id);
      if(p.sentence||to.id==='penal-visitas')this.prison.show(conn);
    }
    return true;
  }

  transferNpc(e: Entity, zoneId: string, at: [number, number]) {
    const to = this.zones.get(zoneId);
    if (!to) return;
    e.zone.remove(e);
    const stop = nearestWalkable(pedestrianGrid(to.grid, 'stop'), at[0]+.5, at[1]+.5, 8);
    e.x = stop?.x ?? at[0]+.5; e.y = stop?.y ?? at[1]+.5; e.path = []; e.moving = false; e.lastMoveTick = this.tick;
    to.add(e);
    this.metrics.inc('npcTransfers');
  }

  /** Objetos con función propia (tiendas, camas, basura, tablones, puestos de trabajo). */
  private objectAction(c: PlayerConn, o: Entity) {
    const sv = this.survival;
    const run = (fn: () => Promise<void> | void) => this.enqueue(c, async () => { try { await fn(); } catch (err) { if (err instanceof GameError) this.send(c, { t: 'notice', kind: 'warn', text: err.message }); else throw err; } });
    switch (o.objKind) {
      case 'penal': return run(()=>this.prison.open(c,o));
      case 'casino': return run(()=>this.casino.open(c,o.id));
      case 'vending': case 'shop': return sv.openShop(c, o.shop!, o);
      case 'bed': return run(() => sv.sleepInBed(c, o));
      case 'trash': return run(() => sv.rummage(c, o));
      case 'jobboard': return run(async () => this.send(c, { t: 'jobs', view: await sv.jobsView(c) }));
      case 'bountyboard': return this.send(c, { t: 'bounties', view: sv.bountyView(c.p!) });
      case 'marketterm': return this.handle(c, { t: 'market', seq: 0 });
      case 'computer': return this.send(c, { t: 'searchResults', device: 'computer', results: [] });
      case 'neuralchair': return run(() => this.legends.jackIn(c, 'silla', o.zone.id === 'pachinko-int' ? 300 : 0));
      case 'jackout': return run(() => this.legends.jackOut(c));
      case 'mycar': {
        if (o.ownerChar !== c.p!.charId) return this.send(c, { t: 'notice', kind: 'info', text: `${o.name}. Cerrado con llave.` });
        return run(async () => this.send(c, { t: 'trunk', view: await this.property.trunkView(c) }));
      }
      case 'atm': case 'camera': return this.send(c, { t: 'targetMenu', view: this.combat.menu(c, o) });
      case 'ambar': return this.send(c, { t: 'ambar', view: this.combat.ambarView(c.p!) });
      case 'hiring': return this.send(c, { t: 'hiring', view: this.posts.hiringView(c, o.objId) });
      case 'elevator': return run(async () => this.send(c, { t: 'elevator', view: this.posts.elevatorView(c) }));
      case 'loot': return run(() => this.combat.loot(c, o));
      case 'housing': return this.send(c, { t: 'building', view: this.property.buildingView(c.p!, o.objId ?? '') });
      case 'dealer': return run(() => this.send(c, { t: 'dealer', view: this.property.dealerView(c.p!, o.dealer ?? '') }));
      case 'realty': return this.send(c, { t: 'realty', view: this.property.realtyView(c.p!) });
      case 'stash': return run(async () => { const hid = o.zone.id.startsWith('casa:') ? o.zone.id.slice(5) : ''; this.send(c, { t: 'stash', view: await this.property.stashView(c, hid) }); });
      case 'bribe': return run(async () => { if ((c.p!.wanted ?? 0) < 0.5) throw new GameError('La ventanilla está cerrada para quien no tiene expediente.'); await this.combat.bribe(c, `bribe-${randomUUID()}`); });
      case 'workplace': {
        const p = c.p!;
        const job = p.activeJob ? this.c.jobs.find((j) => j.id === p.activeJob) : undefined;
        if (job && job.workplace === o.workplace) return run(() => sv.jobStart(c));
        return run(async () => { this.send(c, { t: 'notice', kind: 'info', text: `${o.name}. Acepta un empleo de este puesto en la bolsa de empleo (J → Empleos).` }); this.send(c, { t: 'jobs', view: await sv.jobsView(c) }); });
      }
    }
    this.send(c, { t: 'notice', kind: 'info', text: `${o.name}: no hay nada que hacer aquí.` });
  }

  // ---------------------------------------------------------------- diálogos
  private openDialog(c: PlayerConn, target: Entity) {
    if (!target.dialog) return this.send(c, { t: 'notice', kind: 'info', text: `${target.name}: no hay nada que hacer aquí.` });
    const def = this.c.dialogs[target.dialog];
    const node = entryNode(this.c, c.p!, this.facts, def);
    c.dialog = { no: this.dialogNo++, dialogId: target.dialog, node, targetId: target.id };
    if (target.kind === 'npc') { target.talkingUntil = this.tick + RULES.tickRate * 30; target.path = []; target.facing = facingToIdx(c.e!.x - target.x, c.e!.y - target.y); target.lastMoveTick = this.tick; }
    c.e!.facing = facingToIdx(target.x - c.e!.x, target.y - c.e!.y); c.e!.lastMoveTick = this.tick;
    this.sendDialog(c);
  }
  private sendDialog(c: PlayerConn) {
    const d = c.dialog!;
    const target = this.entities.get(d.targetId);
    this.send(c, { t: 'dialog', view: buildView(this.c, c.p!, this.facts, this.c.dialogs[d.dialogId], d.node, d.no, { name: target?.name ?? '', title: target?.title }) });
  }
  closeDialog(c: PlayerConn) {
    if (!c.dialog) return;
    const target = this.entities.get(c.dialog.targetId);
    if (target?.talkingUntil) target.talkingUntil = this.tick + RULES.tickRate;
    c.dialog = undefined;
    this.send(c, { t: 'dialogClose' });
  }

  private async onChoose(c: PlayerConn, m: Extract<ClientMsg, { t: 'choose' }>) {
    const e = c.e!, p = c.p!;
    const d = c.dialog;
    const fail = (reason: string) => this.send(c, { t: 'ack', seq: m.seq, ok: false, reason });
    if (!d || d.no !== m.dialog) return fail('Ese diálogo ya no está abierto.');
    if (await this.effects.isProcessed(m.opId)) return this.send(c, { t: 'ack', seq: m.seq, ok: true, info: 'Operación ya aplicada' });
    const def = this.c.dialogs[d.dialogId];
    const node = def.nodes[d.node];
    const opt = node.options.find((o) => o.id === m.option);
    if (!opt || !allOk(this.c, p, this.facts, opt.if)) return fail('Esa opción ya no está disponible.');
    if (opt.require.length && !allOk(this.c, p, this.facts, opt.require)) return fail(t(this.c, opt.requireText!));
    const target = this.entities.get(d.targetId);
    if (!target || target.zone !== e.zone || Math.hypot(target.x - e.x, target.y - e.y) > REMOTE_RANGE + 1.5) { this.closeDialog(c); return fail('Te has alejado demasiado.'); }
    if (e.task || e.channel) return fail('Ya hay otra acción en curso. Cancélala primero.');
    if (target.kind === 'npc') target.talkingUntil = this.tick + RULES.tickRate * 30;

    let success = true;
    let checkExtra: Record<string, unknown> | undefined;
    if (opt.check) {
      const n = checkNumbers(this.c, p, opt);
      const r = await this.effects.commitCheck(p, opt.check.key, m.opId, { attr: opt.check.attr, attrValue: n.attrValue, skill: opt.check.skill, skillValue: n.skillValue, bonus: n.bonus, dv: n.dv }, m.luck);
      if (!r.reused) this.progress.gain(p, opt.check.skill, r.success ? 6 : 3);
      success = r.success;
      checkExtra = { check: { key: opt.check.key, roll: r.roll, total: r.total, dv: n.dv, success, reused: r.reused, luck: r.luckSpent } };
      const detail = r.reused ? `Resultado ya registrado: ${r.total} contra ${n.dv}` :
        `Tirada: ${r.roll} (1d10) + ${opt.check.attr} ${n.attrValue} + ${n.skillName} ${n.skillValue}${n.bonus ? ` + rol ${n.bonus}` : ''}${r.luckSpent ? ` + Suerte ${r.luckSpent}` : ''} = ${r.total} contra ${n.dv}`;
      this.send(c, { t: 'notice', kind: success ? 'good' : 'bad', text: `${success ? '✔ Éxito' : '✘ Fallo'} · ${detail}` });
      if (r.luckSpent) this.send(c, { t: 'sheet', sheet: buildSheet(this.c, p) });
    }
    const run = async () => this.applyOption(c, d, opt, success, m.opId, checkExtra);
    if (opt.channel) {
      const dialogSnapshot = { ...d };
      this.closeDialog(c);
      const ticks = Math.round(opt.channel.seconds * RULES.tickRate);
      e.channel = { startTick: this.tick, endTick: this.tick + ticks, label: t(this.c, opt.channel.label), targetId: d.targetId, apply: () => this.enqueue(c, async () => { c.dialog = undefined; await this.applyOption(c, dialogSnapshot, opt, success, m.opId, checkExtra, true); this.send(c, { t: 'action', text: '' }); }) };
      e.label = t(this.c, opt.channel.label); e.labelVer++;
      this.send(c, { t: 'action', text: t(this.c, opt.channel.label), duration: opt.channel.seconds });
      return this.send(c, { t: 'ack', seq: m.seq, ok: true });
    }
    await run();
    this.send(c, { t: 'ack', seq: m.seq, ok: true });
  }

  private async applyOption(c: PlayerConn, d: NonNullable<PlayerConn['dialog']>, opt: DialogOption, success: boolean, opId: string, extra?: Record<string, unknown>, fromChannel = false) {
    const p = c.p!;
    const effects = success ? opt.effects : opt.fail;
    if (effects.length) {
      const out = await this.effects.apply(p, effects, { opId, kind: 'dialog', dialogId: d.dialogId, nodeId: d.node, optionId: opt.id, extra });
      this.handleOutcome(c, out);
      if (out.startTasks.length) { this.closeDialog(c); return; }
    }
    if (!success && opt.failText) this.send(c, { t: 'notice', kind: 'warn', text: t(this.c, opt.failText) });
    if (c.e) { c.e.label = ''; c.e.labelVer++; }
    const next = success ? opt.goto : (opt.failGoto ?? null);
    if (fromChannel) return; // tras una acción canalizada el diálogo ya está cerrado
    if (next && c.dialog && c.dialog.no === d.no) { c.dialog.node = next; this.sendDialog(c); }
    else this.closeDialog(c);
  }

  handleOutcome(c: PlayerConn, out: EffectOutcome) {
    const p = c.p!;
    this.send(c, { t: 'sheet', sheet: buildSheet(this.c, p) });
    if (out.completed) this.send(c, { t: 'reward', title: `Encargo completado: ${out.completed.title}`, lines: out.lines });
    else if (out.lines.length) this.send(c, { t: 'notice', kind: 'good', text: out.lines.join(' · ') });
    for (const n of out.notices) this.send(c, { t: 'notice', kind: 'good', text: n });
    if (out.levelUp) this.progress.onLevelUp(c.p!, out.levelUp - 1);
    if (out.journalChanged) this.send(c, { t: 'journal', journal: this.journal(p) });
    for (const od of out.objectiveDone) {
      if (!od.shared) continue;
      // Objetivo compartido: actualizar al resto de participantes conectados.
      for (const o of this.conns.values()) {
        if (o === c || !o.p) continue;
        const cp = [...o.p.contracts.values()].find((x) => x.instanceId === od.instanceId && x.state === 'active');
        if (!cp) continue;
        cp.objectives[od.objective] = true;
        const def = this.c.contracts.find((k) => k.id === cp.contractId)!;
        this.send(o, { t: 'notice', kind: 'good', text: `${p.name} ha completado un objetivo compartido: ${t(this.c, def.objectives.find((x) => x.id === od.objective)!.text)}` });
        this.send(o, { t: 'journal', journal: this.journal(o.p) });
      }
    }
    if (out.factsChanged) this.broadcastFacts();
    if (out.missionRide) this.missions.startRide(c, out.missionRide);
    for (const tk of out.startTasks) this.startTask(c, tk);
    if (out.wanted) void this.survival.addWanted(c, out.wanted, 'delito');
    if (out.open) {
      const src = c.dialog ? this.entities.get(c.dialog.targetId) : undefined;
      this.closeDialog(c);
      if (out.open.kind === 'shop' && src) this.survival.openShop(c, out.open.id!, src);
      else if (out.open.kind === 'clinic' && src) this.survival.openClinic(c, out.open.id!, src);
      else if (out.open.kind === 'jobs') void this.survival.jobsView(c).then((v) => this.send(c, { t: 'jobs', view: v }));
      else if (out.open.kind === 'bounties') this.send(c, { t: 'bounties', view: this.survival.bountyView(c.p!) });
    }
  }

  private startTask(c: PlayerConn, taskId: string) {
    const e = c.e!;
    const def = this.c.tasks.find((x) => x.id === taskId)!;
    this.cancelActivity(e);
    e.task = { def, step: 0, rep: 0, waitUntil: 0, started: false, opId: `task-${randomUUID()}` };
    this.send(c, { t: 'notice', kind: 'info', text: `Tarea iniciada: ${t(this.c, def.label)}. Tu personaje la hará solo; cualquier clic la cancela.` });
  }

  broadcastFacts() {
    const facts = this.facts.all();
    for (const c of this.conns.values()) this.send(c, { t: 'facts', facts });
  }

  stats() {
    const zones: Record<string, { entities: number; players: number; npcs: number }> = {};
    for (const z of this.zones.values()) {
      let npcs = 0; for (const e of z.entities) if (e.kind === 'npc') npcs++;
      zones[z.id] = { entities: z.entities.size, players: z.players.size, npcs };
    }
    return { tick: this.tick, cityHour: Math.round(this.cityHour() * 100) / 100, connections: this.conns.size, lingering: this.lingering.size, zones };
  }
}
