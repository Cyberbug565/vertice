import { randomUUID } from 'node:crypto';
import { checkChance, dangerAt, nearestWalkable, RULES, type BusinessAction, type BusinessView, type Content } from '@vertice/shared';
import { GameError } from '../game/effects.js';
import { effective } from '../game/player.js';
import type { Entity } from './entity.js';
import { ambientBrain } from './npc.js';
import type { PlayerConn, World } from './world.js';
import type { Zone } from './zone.js';

type Shop = Content['shops'][number];
type Clinic = Content['ripperdocs'][number];
type Method = Exclude<BusinessAction, 'view'>;
interface Site {
  key: string;
  zone: Zone;
  anchor: Entity;
  name: string;
  shop?: Shop;
  clinic?: Clinic;
  owner: string;
  security: number;
  category: string;
  machine: boolean;
  guards: Set<Entity>;
  clerk?: Entity;
  alarmUntil?: number;
  restockAt: number;
  closedUntil?: number;
}
type Dispatch = { site: Site; actor: number; eta: number; units: number };
const RANGE = 3;
const LABELS = { conveniencia: 'Tienda de conveniencia', comida: 'Comida', empenos: 'Casa de empeños', joyeria: 'Joyería' };
const MINUTE = 60000;

const standing = (e?: Entity): e is Entity => !!e && !e.dead && e.state !== 'downed' && !e.carriedBy;
const distance = (a: {x:number;y:number}, b: {x:number;y:number}) => Math.hypot(a.x-b.x,a.y-b.y);

export function protectionPolicy(security: number, patrols: number, illicit: boolean) {
  const fee = Math.max(75, 150 + security * 4 - Math.min(8, patrols) * 12);
  const budget = illicit ? 0 : Math.max(0, (security - 10) * 44 + Math.min(6, patrols) * 28);
  const response = illicit ? 0 : Math.min(.97, Math.max(.07, .16 + (security - 10) * .035 + patrols * .065));
  return { fee, budget, response, delay: Math.max(8, 37 - security - patrols * 1.3), units: security >= 21 ? 2 : 1 };
}

export class Robberies {
  private readonly sites = new Map<string, Site>();
  private readonly byZone = new Map<string, Site[]>();
  private readonly shops: Map<string, Shop>;
  private readonly doctors: Map<string, Clinic>;
  private readonly factions: Map<string, Content['factions'][number]>;
  private readonly waiting: Dispatch[] = [];
  private readonly patrols = new Set<Entity>();
  private readonly frightened = new Map<Entity, number>();
  private readonly committing = new Set<string>();

  constructor(private readonly w: World) {
    this.shops = new Map(w.c.shops.map(s => [s.id, s]));
    this.doctors = new Map(w.c.ripperdocs.map(d => [d.npc, d]));
    this.factions = new Map(w.c.factions.map(f => [f.id, f]));
  }

  async init() {
    for (const z of this.w.zones.values()) {
      const counters = [...z.entities].filter(e => e.shop && (e.objKind === 'shop' || e.objKind === 'vending'));
      for (const e of counters) {
        const shop = this.shops.get(e.shop!);
        if (shop) this.addSite(z, e, shop);
      }
    }
    for (const shop of this.shops.values()) {
      if (shop.zone === '*') continue;
      const zone = this.w.zones.get(shop.zone);
      if (!zone || this.byZone.get(zone.id)?.some(s => s.shop?.id === shop.id)) continue;
      const staff = this.w.c.npcs.find(n => n.shop === shop.id);
      const pos = staff?.schedule.find(s => s.zone === zone.id)?.at ?? zone.def.safePoint;
      this.addSite(zone, this.counter(zone, shop.id, shop.name, pos), shop);
    }
    for (const clinic of this.doctors.values()) {
      const zone = this.w.zones.get(clinic.zone);
      if (!zone) continue;
      const npc = this.w.c.npcs.find(n => n.id === clinic.npc)!;
      const pos = npc.schedule.find(s => s.zone === zone.id)?.at ?? zone.def.safePoint;
      const walk = nearestWalkable(zone.grid, pos[0]+2.5, pos[1]+.5, 3);
      const at = walk ? [Math.floor(walk.x), Math.floor(walk.y)] : pos;
      this.addSite(zone, this.counter(zone, clinic.id, 'Reserva de implantes', at), undefined, clinic);
    }
    const rows = await this.w.db.query<{site:string;restock_at:string}>('SELECT site,restock_at FROM business_reserves WHERE restock_at > $1', [Date.now()]);
    for (const row of rows.rows) {
      const site = this.sites.get(row.site);
      if (site) site.restockAt = Number(row.restock_at);
    }
    for (const site of this.sites.values()) {
      if (site.machine) continue;
      if (site.shop && !this.w.c.npcs.some(n => n.shop === site.shop!.id && !n.essential)) this.spawnClerk(site.key);
      if (site.security >= 22 && !site.zone.query(site.anchor.x,site.anchor.y,8).some(e=>e.objKind === 'camera')) {
        const pos = nearestWalkable(site.zone.grid,site.anchor.x+2,site.anchor.y-3,3);
        if (pos) this.w.addEntity(site.zone,{...pos,kind:'object',objKind:'camera',objId:'vigilancia-'+site.key,
          interactive:true,name:'Cámara del local',label:''});
      }
      this.spawnGuards(site);
    }
  }

  private counter(zone: Zone, id: string, name: string, at: readonly number[]) {
    return this.w.addEntity(zone, { name, x: at[0]+.5, y: at[1]+.5, kind: 'object', objKind: 'business-vault',
      interactive: true, label: '', objId: 'reserva-' + id });
  }

  private addSite(zone: Zone, anchor: Entity, shop?: Shop, clinic?: Clinic) {
    const machine = anchor.objKind === 'vending';
    const id = clinic?.id ?? shop!.id;
    const key = machine ? `maquina:${zone.id}:${anchor.objId ?? id}` : `${clinic ? 'consulta' : 'tienda'}:${id}`;
    const old = this.sites.get(key);
    anchor.businessSite = key;
    if (old) return;
    const security = shop?.security ?? (clinic!.id === 'okami' ? 25 : clinic!.morality === 'estricta'
      ? (clinic!.skill >= 4 ? 20 : 12) : 12 + clinic!.skill);
    const owner = shop?.owner ?? clinic?.faction ?? (clinic?.id === 'remache' ? 'engranajes' : 'independiente');
    const category = clinic ? 'Consulta de ciberware' : machine ? 'Expendedora' : shop?.business ? LABELS[shop.business] : 'Comercio';
    const site: Site = { key, zone, anchor, name: clinic?.name ?? shop!.name, shop, clinic, machine, owner, security,
      category, guards: new Set(), restockAt: 0 };
    this.sites.set(key, site);
    const sites = this.byZone.get(zone.id) ?? [];
    sites.push(site);
    this.byZone.set(zone.id, sites);
  }

  private illicit(s: Site) {
    return this.factions.get(s.owner)?.kind === 'gang' || !!(s.clinic?.hidden && s.clinic.morality !== 'estricta');
  }

  registerStaff(e: Entity, def: Content['npcs'][number]) {
    const clinic = this.doctors.get(def.id);
    if (!clinic && (!def.shop || def.essential)) return;
    e.businessJob = clinic ? 'consulta:' + clinic.id : 'tienda:' + def.shop;
    e.npcType = 'civil';
    e.npcMax = e.npcHp = clinic ? 68 : 55;
    e.defense = clinic ? 10 : 8;
    e.respawn = { zone: e.zone.id, template: { resident: def.id } };
  }

  spawnClerk(key: string) {
    const site = this.sites.get(key);
    if (!site || standing(site.clerk)) return;
    const at = nearestWalkable(site.zone.grid, site.anchor.x-1.5, site.anchor.y, 3);
    if (!at) return;
    const e = this.w.spawnNpc(site.zone, { name: site.shop?.clerk ?? `Dependiente · ${site.name}`,
      title: 'Dependiente', ...at, label: 'Atendiendo el mostrador', speed: 1.65,
      appearance: { body: site.security % 2 ? 'femenino' : 'masculino', skin: '#bd8969', hair: '#252329',
        jacket: site.security >= 21 ? '#243559' : '#55423b', accent: '#50e8c5', top: site.security >= 21 ? 'traje' : 'camisa' } });
    Object.assign(e, { npcType: 'civil', npcHp: 55, npcMax: 55, defense: 8, npcShop: site.shop?.id,
      businessJob: site.key, respawn: { zone: site.zone.id, template: { commerceClerk: key } } });
    e.npc = ambientBrain(this.w.cfg.seed + e.id, [at.x, at.y], 2);
    e.npc.pauseUntil = Number.POSITIVE_INFINITY;
    site.clerk = e;
    return e;
  }

  spawnGuards(site: Site) {
    const illicit = this.illicit(site);
    const desired = site.security >= 24 ? 3 : site.security >= 21 ? 2 : site.security >= 18 || illicit ? 1 : 0;
    const candidates = site.zone.def.kind === 'interior' ? [...site.zone.actors].filter(e =>
      e.npcType === 'police' && !e.businessGuard && distance(e,site.anchor) <= 18) : [];
    for (let slot = 0; slot < desired; slot++) {
      const waypoints = site.zone.def.kind === 'interior' ? site.zone.def.waypoints : [];
      const wp = waypoints[(slot + 1) % waypoints.length];
      const at = nearestWalkable(site.zone.grid, wp ? wp[0]+.5 : site.anchor.x+4+slot, wp ? wp[1]+.5 : site.anchor.y+2, 4);
      const faction = illicit && this.factions.get(site.owner)?.kind !== 'gang' ? 'chatarreros' : site.owner;
      const guard = candidates.shift() ?? (at && this.w.combat.spawnFactionNpc(site.zone, faction, 'gang', [at.x, at.y, 4], at));
      if (!guard) continue;
      this.fitGuard(site, guard);
    }
  }

  respawnGuard(key: string) {
    const site = this.sites.get(key);
    if (!site) return;
    const at = nearestWalkable(site.zone.grid, site.anchor.x+3.5, site.anchor.y+1, 4);
    const faction = this.illicit(site) && this.factions.get(site.owner)?.kind !== 'gang' ? 'chatarreros' : site.owner;
    const e = at && this.w.combat.spawnFactionNpc(site.zone, faction, 'gang',[at.x, at.y, 4],at);
    if (e) this.fitGuard(site,e);
  }

  private fitGuard(site: Site, e: Entity) {
    const illicit = this.illicit(site);
    e.businessGuard = site.key;
    e.faction = illicit && this.factions.get(site.owner)?.kind !== 'gang' ? 'chatarreros' : site.owner;
    e.title = illicit ? 'Protección de la banda' : 'Seguridad privada';
    e.name = e.name.replace(/^Agente /, 'Guardia ');
    e.label = illicit ? 'Vigilando el local' : 'Seguridad del local';
    e.npcType = 'gang';
    e.weaponId = illicit ? (site.security >= 16 ? 'subfusil' : 'pistola-ligera')
      : site.security >= 24 ? 'rifle-asalto' : site.security >= 21 ? 'subfusil' : 'taser';
    e.npcHp = e.npcMax = 55 + Math.max(0,site.security - 16)*7;
    e.defense = 8 + Math.floor(site.security/3);
    e.respawn = { zone: site.zone.id, template: { commerceGuard: site.key } };
    for (const old of site.guards) if (old.dead || !this.w.entities.has(old.id)) site.guards.delete(old);
    site.guards.add(e);
  }

  private siteOf(e?: Entity): Site | undefined {
    if (!e) return;
    const ref = e.businessSite ?? e.businessGuard ?? e.businessJob ?? (e.npcShop ? 'tienda:' + e.npcShop : '');
    const s = this.sites.get(ref);
    return s?.zone === e.zone ? s : undefined;
  }

  target(e?: Entity) { return this.siteOf(e)?.anchor.id; }

  acceptsViolence(e: Entity) { return !!(this.siteOf(e) && e.kind === 'npc' && e.npcMax); }

  private staff(s: Site) {
    return [...s.zone.actors].filter(e => e.businessJob === s.key &&
      (e.dead || e.state === 'downed' || !this.w.cityPeople.has(e) || this.w.cityPeople.isWorking(e)));
  }

  checkTrade(source: Entity) {
    const s = this.siteOf(source);
    if (!s || s.machine) return;
    if (!standing(source) || (s.closedUntil ?? 0) > Date.now()) throw new GameError('El negocio está cerrado por el incidente.');
    const staff = this.staff(s);
    if (staff.length && !staff.some(standing)) throw new GameError('El mostrador se ha quedado sin nadie para atenderte.');
  }

  private options(c: PlayerConn, site: Site): BusinessView['options'] {
    const p = c.p!, e = c.e!, now = Date.now();
    const current = this.staff(site);
    const clerk = current.find(standing);
    const guard = [...site.guards].some(standing);
    const ef = effective(this.w.c,p);
    const ready = site.restockAt <= now ? undefined : 'Las reservas aún se están reponiendo.';
    const alarm = (site.alarmUntil ?? 0) > now ? 'El local está en alerta.' : undefined;
    const away = distance(e,site.anchor) > RANGE || !this.w.combat.lineClear(e,site.anchor) ? 'Acércate al punto de cobro o a la reserva.' : undefined;
    const watched = [...site.guards].filter(g=>standing(g) && this.w.stealth.sees(g,e)).length;
    const recorded = this.w.combat.cameraSees(e) ? 1 : 0;
    const quiet = Math.max(8,site.security - (site.machine ? 2 : 0)) + Math.min(3,watched) + recorded;
    const threat = Math.max(8, site.security - 3 + (guard ? 2 : 0));
    return [
      { action: 'stealth', label: 'Sustraer en sigilo', detail: 'Usa Destreza y Sigilo. Si te descubren, el local puede dar la alarma.',
        chance: checkChance(ef.attrs.DEX,ef.skills.sigilo ?? 0,quiet,0,ef.steal),blocked:ready ?? away ?? alarm },
      { action: 'threat', label: 'Intimidar con el arma', detail: 'Usa Temple y Negociación contra el dependiente. Los vigilantes pueden responder incluso si cede.',
        chance: checkChance(ef.attrs.COOL,ef.skills.negociacion ?? 0,threat,0,ef.confront),
        blocked:ready ?? away ?? alarm ?? (!clerk ? 'No hay un dependiente en pie.' : !this.w.combat.weaponDrawn(p) ? 'Empuña un arma primero.' :
          !this.w.combat.lineClear(e,clerk) || distance(e,clerk) > 5 ? 'Acércate al dependiente.' : undefined) },
      { action: 'force', label: 'Saqueo por la fuerza', detail: 'Abre la reserva cuando el personal y los guardias ya no puedan defenderla. Activa la alarma del local.',
        blocked:ready ?? away ?? (clerk ? 'El personal todavía defiende el local.' : guard ? 'Queda seguridad en pie.' : undefined) },
    ];
  }

  open(c: PlayerConn, target?: Entity) {
    const s = this.siteOf(target), e = c.e!;
    if (!s || s.zone !== e.zone || !target || distance(e,target)>6 || !this.w.combat.lineClear(e,target))
      throw new GameError('Acércate al comercio para interactuar.');
    const paid = this.rate(s);
    const hasCrew = this.illicit(s);
    const protection = hasCrew ? 'Protección de banda' : paid.budget >= paid.fee ? 'Aviso a la PCV sujeto a pago y disponibilidad' : 'Sin tarifa cubierta para un aviso';
    const status = s.restockAt > Date.now() ? 'Reponiendo reservas' : (s.closedUntil ?? 0) > Date.now() ? 'Incidente en curso' : 'Reservas disponibles';
    this.w.send(c, { t: 'business', view: { target:s.anchor.id, name:s.name, security:s.security,
      guards:[...s.guards].filter(standing).length, status, protection, category:s.category, options:this.options(c,s) } });
  }

  async command(c: PlayerConn, target: number, action: BusinessAction, opId: string) {
    const e = c.e!, source = this.w.entities.get(target), site = this.siteOf(source);
    if (!site || !source || !c.p || c.p.status !== 'alive' || c.closed || e.ghostOf || e.transit || e.vehicle || source.zone !== e.zone)
      throw new GameError('Comercio fuera de alcance.');
    if (action === 'view') { this.open(c,source); return; }
    if (e.channel) throw new GameError('Ya estás haciendo otra acción.');
    const option = this.options(c,site).find(o => o.action === action)!;
    if (option.blocked) throw new GameError(option.blocked);
    if (c.p.sleeping) this.w.survival.wake(c);
    this.w.cancelActivity(e);
    this.w.closeDialog(c);
    const duration = action === 'force' ? 3.2 : action === 'stealth' ? 2.5 : 1.8;
    const beginHit = e.lastHitAt;
    e.channel = { startTick:this.w.tick, endTick:this.w.tick+Math.round(duration*RULES.tickRate), targetId:site.anchor.id, label:option.label,
      apply:() => this.w.enqueue(c,async () => {
        try {
          if (!c.p || c.closed || c.p.status !== 'alive' || e.zone !== site.zone || e.transit || e.lastHitAt !== beginHit)
            throw new GameError('El intento se ha interrumpido.');
          await this.finish(c,site,action,opId);
        } catch (err) {
          if (!(err instanceof GameError)) throw err;
          this.w.send(c,{t:'notice',kind:'warn',text:err.message});
        } finally { this.w.send(c,{t:'action',text:''}); }
      }) };
    this.w.send(c, { t:'action', text:option.label, duration });
  }

  private async finish(c: PlayerConn, site: Site, method: Method, opId: string) {
    const p = c.p!, e = c.e!;
    const option = this.options(c,site).find(o => o.action === method)!;
    if (option.blocked) throw new GameError(option.blocked);
    if (this.committing.has(site.key)) throw new GameError('Otra persona está abriendo la reserva.');
    this.committing.add(site.key);
    try {
      const success = method === 'force' || this.w.survival.rng() < (option.chance ?? 0);
      const seen = method !== 'stealth' || !success;
      if (!success) {
        const op = await this.w.db.query("INSERT INTO ops (op_id,character_id,kind,result) VALUES ($1,$2,'commerce-raid',$3::jsonb) ON CONFLICT DO NOTHING RETURNING op_id",[opId,p.charId,JSON.stringify({site:site.key,method,success:false})]);
        if (!op.rows.length) throw new GameError('Operación ya procesada.');
        await this.raise(c,site,method === 'threat' ? 2 : 1.15);
        this.w.send(c,{t:'notice',kind:'bad',text:'El personal del local ha descubierto tu intento.'});
        return;
      }
      const now = Date.now();
      const refill = now + this.w.c.manifest.cityHourMs * (site.security >= 20 ? 7 : 4);
      const amount = site.machine ? 22 : (site.security - 7) ** 2 * (method === 'stealth' ? 1 : 2) + (site.clinic ? 180 : 40);
      const loot = this.loot(site,method);
      const balance = await this.w.db.tx(async q => {
        const receipt = await q.query("INSERT INTO ops (op_id,character_id,kind,result) VALUES ($1,$2,'commerce-raid',$3::jsonb) ON CONFLICT DO NOTHING RETURNING op_id",
          [opId,p.charId,JSON.stringify({site:site.key,method,success:true,amount,item:loot.item,implant:loot.implant?.def})]);
        if (!receipt.rows.length) throw new GameError('Operación ya procesada.');
        const available = await q.query("INSERT INTO business_reserves (site,restock_at) VALUES ($1,$2) ON CONFLICT (site) DO UPDATE SET restock_at=EXCLUDED.restock_at WHERE business_reserves.restock_at <= $3 RETURNING site",
          [site.key,refill,now]);
        if (!available.rows.length) throw new GameError('Las reservas aún se están reponiendo.');
        const cash = await q.query<{money:number}>("UPDATE characters SET money=money+$2 WHERE id=$1 AND status='alive' RETURNING money",[p.charId,amount]);
        if (!cash.rows.length) throw new GameError('El personaje ya no puede recoger el botín.');
        const money = Number(cash.rows[0].money);
        await q.query('INSERT INTO ledger (op_id,character_id,delta,balance_after,reason) VALUES ($1,$2,$3,$4,$5)',
          [opId+':botin',p.charId,amount,money,`Robo comercial · ${site.name}`]);
        if (loot.item) await q.query('INSERT INTO inventory_items (id,character_id,def_id,qty) VALUES ($1,$2,$3,1) ON CONFLICT (character_id,def_id) DO UPDATE SET qty=inventory_items.qty+1',[randomUUID(),p.charId,loot.item.id]);
        if (loot.implant) await q.query("INSERT INTO cyberware_instances (id,def_id,character_id,location,stolen,history) VALUES ($1,$2,$3,'inventory',true,$4::jsonb)",
          [loot.implant.id,loot.implant.def,p.charId,JSON.stringify([{at:new Date(now).toISOString(),event:`Robado en ${site.name}`}])]);
        return money;
      });
      p.money=balance;
      if (loot.item) p.inventory.set(loot.item.id,(p.inventory.get(loot.item.id) ?? 0)+1);
      if (loot.implant) p.cyber.push(loot.implant);
      site.restockAt=refill;
      this.w.progress.gain(p,method === 'stealth' ? 'sigilo' : 'negociacion', 6);
      if (method === 'threat') {
        const clerk=this.staff(site).find(standing);
        if (clerk) {
          clerk.path=[]; clerk.moving=false;
          clerk.stunUntil=Math.max(clerk.stunUntil ?? 0,now+4200);
          clerk.emote={move:'manos-arriba',at:now};
          clerk.label='Rindiéndose';
          clerk.labelVer++;
          this.frightened.set(clerk,now+4200);
          this.w.street.speak(clerk,'Está bien. Te doy lo que hay en la caja.');
        }
      }
      if (seen) await this.raise(c,site,method === 'force' ? 2.6 : 2.1);
      const goods = loot.item?.name ?? loot.implantName;
      this.w.send(c,{t:'reward',title:`Botín · ${site.name}`,lines:[`+${amount} €$`,...(goods ? [goods] : []),
        method === 'stealth' ? 'Sales con el botín sin disparar la alarma del local.' : 'El local ha activado su protocolo de seguridad.']});
      this.w.survival.refreshSheet(c);
      if (e.zone === site.zone) this.open(c,site.anchor);
    } finally { this.committing.delete(site.key); }
  }

  private loot(site: Site, method: Method) {
    const ceiling = site.security >= 24 ? 22500 : site.security >= 19 ? 8500 : 4500;
    if (site.clinic) {
      const catalog = site.clinic.stock.map(id => this.w.c.cyberware.find(d => d.id === id))
        .filter(d => d && d.rarity !== 'mitico' && d.price <= ceiling)
        .sort((a,b) => b!.price-a!.price);
      const group = catalog.slice(method === 'stealth' ? Math.min(3,catalog.length-1) : 0).slice(0,7);
      const d=group[Math.floor(this.w.survival.rng()*group.length)];
      if (d) return { implant:{id:randomUUID(),def:d.id,location:'inventory' as const,stolen:true}, implantName:`${d.name} · robado` };
    }
    const stock = site.shop?.stock;
    const goods = stock ? this.w.c.items.filter(i => stock[i.id] > 0 && i.category !== 'mision' &&
      i.rarity !== 'mitico' && (i.price ?? 0) <= ceiling/4).sort((a,b)=>(b.price ?? 0)-(a.price ?? 0)).slice(0,5) : [];
    return { item:goods[Math.floor(this.w.survival.rng()*goods.length)] };
  }

  private rate(site: Site) {
    const f = this.w.interiors.frame(site.zone.def);
    const outside = f && this.w.zones.get(f.entrance.zone);
    const district = outside && f ? outside.districtAt(...f.entrance.at) : site.zone.districtAt(site.anchor.x,site.anchor.y);
    return protectionPolicy(site.security,district?.police ?? 0,this.illicit(site));
  }

  async shoplifting(c: PlayerConn, who: Entity | undefined, success: boolean) {
    const site = this.siteOf(who);
    if (site && !success) await this.raise(c,site,1.2);
  }

  assault(c: PlayerConn, target: Entity, severity: 'attempt' | 'hit' | 'down' | 'kill') {
    const site = target.kind === 'npc' ? this.siteOf(target) : undefined;
    if (!site) return false;
    if (severity !== 'attempt') void this.raise(c,site,severity === 'kill' ? 3 : 1.6).catch(err=>console.error('[comercios]',err));
    return true;
  }

  private async raise(c: PlayerConn, site: Site, heat: number) {
    const e=c.e!, now=Date.now();
    if (e.zone !== site.zone) return;
    for (const guard of site.guards) {
      if (!standing(guard) || guard.zone !== site.zone || guard.aggro !== undefined) continue;
      guard.aggro=e.id;
      guard.aggroLethal=this.illicit(site) || site.security >= 21;
      guard.path=[]; guard.moving=false;
    }
    const notify=(text:string)=>this.w.send(c,{t:'notice',kind:'warn',text});
    if ((site.alarmUntil ?? 0) > now) return;
    site.alarmUntil=now+MINUTE;
    site.closedUntil=now+MINUTE;
    const illicit=this.illicit(site);
    if (illicit) {
      if (this.factions.get(site.owner)?.kind === 'gang') await this.w.combat.repChange(c,site.owner,-9,'comercio-'+randomUUID());
      notify('El local avisa a su gente. La banda se encarga de la respuesta.');
      return;
    }
    const payment=this.rate(site);
    if (payment.budget < payment.fee) {
      notify('La tarifa de la PCV no está cubierta. El aviso queda sin patrulla asignada.');
      return;
    }
    const day=Math.floor(now/(24*this.w.c.manifest.cityHourMs));
    const paid=await this.w.db.query(
      "INSERT INTO business_reserves (site,billing_day,calls_spent) VALUES ($1,$2,$3) ON CONFLICT (site) DO UPDATE SET billing_day=EXCLUDED.billing_day,calls_spent=CASE WHEN business_reserves.billing_day=$2 THEN business_reserves.calls_spent+$3 ELSE $3 END WHERE business_reserves.billing_day<>$2 OR business_reserves.calls_spent+$3<=$4 RETURNING site",
      [site.key,day,payment.fee,payment.budget]);
    if (!paid.rows.length) { notify('El local agotó su presupuesto de avisos a la PCV.'); return; }
    if (this.w.survival.rng() >= payment.response) { notify('El local pagó el aviso, pero la central de la PCV no asignó una patrulla.'); return; }
    this.waiting.push({site, actor:e.id, eta:now+payment.delay*1000, units:payment.units});
    await this.w.survival.addWanted(c,heat,'asalto a '+site.name);
    notify(`Aviso de pago aceptado. La PCV calcula ${Math.round(payment.delay)} s de llegada.`);
  }

  tick(now = Date.now()) {
    for (const [clerk,until] of this.frightened) if (now >= until || clerk.dead || clerk.state === 'downed') {
      if (clerk.emote?.move === 'manos-arriba') { clerk.emote=undefined; clerk.labelVer++; }
      this.frightened.delete(clerk);
    }
    for (const call of this.waiting.filter(call=>call.eta <= now)) {
      this.waiting.splice(this.waiting.indexOf(call),1);
      const {site}=call, target=this.w.entities.get(call.actor);
      const frame=this.w.interiors.frame(site.zone.def);
      const outside=frame && this.w.zones.get(frame.entrance.zone);
      const interior=site.zone.players.size > 0 && (!target || target.zone === site.zone || target.zone !== outside);
      const zone=interior ? site.zone : outside ?? site.zone;
      if (!zone.players.size) continue;
      const threshold=interior
        ? site.zone.def.doors.find(d=>this.w.zones.get(d.to.zone)?.def.kind === 'exterior')?.at : frame?.entrance.at;
      const anchor=threshold ? {x:threshold[0]+.5,y:threshold[1]+.5} : site.anchor;
      const present=target?.zone === zone && standing(target) && distance(target,anchor) <= 32;
      for (let j=0;j<call.units;j++) {
        const x=anchor.x+(interior ? -1.5-j : 4+j), y=anchor.y+(interior ? 0 : 2);
        const at=nearestWalkable(zone.grid,x,y,5);
        if (!at) continue;
        const cop=this.w.combat.spawnFactionNpc(zone,'pcv','police',undefined,at);
        if (!cop) continue;
        cop.respawn=undefined;
        cop.dispatchedUntil=now+MINUTE*2;
        if (present) { cop.aggro=target.id; cop.aggroLethal=false; }
        this.patrols.add(cop);
      }
      if (present && target.conn) this.w.send(target.conn,{t:'notice',kind:'bad',text:'La PCV ha llegado al local.'});
    }
    for (const cop of this.patrols) {
      if (!this.w.entities.has(cop.id)) { this.patrols.delete(cop); continue; }
      if (!cop.zone.players.size && cop.aggro === undefined && (cop.dispatchedUntil ?? 0) < now) {
        this.w.removeEntity(cop); this.patrols.delete(cop);
      }
    }
  }
}
