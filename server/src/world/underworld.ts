import { randomUUID } from 'node:crypto';
import { dangerAt, hashString, nearestWalkable, type ClientMsg, type ItemDef, type UnderworldDef, type UnderworldView } from '@vertice/shared';
import { GameError } from '../game/effects.js';
import { buildSheet, effective, type PlayerState } from '../game/player.js';
import { alliedCrews, crewRivals, underworldStatus, type UnderworldState } from '../game/underworld.js';
import { isSick } from '../game/substances.js';
import type { Entity } from './entity.js';
import type { PlayerConn, World } from './world.js';

type Crew = UnderworldDef['crews'][number];
type Buyer = UnderworldDef['buyers'][number];
type Site = UnderworldDef['contacts'][number];
type SiteAt = { def: Site; entity: Entity } & ({ kind: 'contact' } | { kind: 'buyer'; buyer: Buyer } | { kind: 'base'; crew: Crew });
type Command = Extract<ClientMsg, { t: 'underworld' }>;

const REACH = 8; // v0.9: se trata a distancia (clic), sin caminar
const DRUG_INVENTORY_LIMIT = 30;
const commissionRate = (crew: Crew) => crew.tier === 'principal' ? 0.28 : 0.24;

interface Change {
  state?: UnderworldState;
  money?: number;
  item?: { id: string; delta: number };
  faction?: { id: string; delta: number };
  reason: string;
}

export class Underworld {
  private readonly sites = new Map<string, SiteAt>();
  private readonly crews: Map<string, Crew>;
  private readonly drugs: ItemDef[];
  private readonly heat = new Map<string, { hour: number; qty: number }>();
  private readonly patrols = new Map<string, Entity>();
  private readonly expiring = new WeakSet<PlayerConn>();
  rng = Math.random;

  constructor(private readonly w: World) {
    this.crews = new Map(w.c.underworld.crews.map((c) => [c.id, c]));
    this.drugs = w.c.items.filter((i) => i.substance?.kind === 'drug');
  }

  populate() {
    const add = (def: Site, role: { kind: 'contact' } | { kind: 'buyer'; buyer: Buyer } | { kind: 'base'; crew: Crew }) => {
      const faction = role.kind === 'base' ? this.w.c.factions.find((f) => f.id === role.crew.id) : undefined;
      const title = role.kind === 'contact' ? 'Contacto de los bajos fondos' : role.kind === 'buyer' ? 'Comprador de la calle' : 'Entrega de la banda';
      const entity = this.w.addEntity(this.w.zones.get(def.zone)!, {
        kind: 'npc', name: def.name, title, label: '', interactive: true, marketSite: def.id, npcType: 'essential', faction: faction?.id,
        x: def.at[0] + 0.5, y: def.at[1] + 0.5, appearance: {
          skin: '#b07a5a', hair: role.kind === 'contact' ? '#c9bddf' : '#2a223c', jacket: faction ? '#394456' : '#454265',
          accent: faction?.color ?? '#f4b45e', hairStyle: role.kind === 'buyer' ? 'corto' : 'rapado', accessory: role.kind === 'base' ? 'gafas' : 'ninguno',
        },
      });
      this.sites.set(def.id, { def, entity, ...role });
    };
    for (const def of this.w.c.underworld.contacts) add(def, { kind: 'contact' });
    for (const buyer of this.w.c.underworld.buyers) add(buyer, { kind: 'buyer', buyer });
    for (const crew of this.crews.values()) for (const def of crew.bases) add(def, { kind: 'base', crew });
  }

  isAlly(p: PlayerState, faction: string) {
    const crew = p.underworld.crew ? this.crews.get(p.underworld.crew) : undefined;
    return crew ? alliedCrews(this.w.c, crew, faction) : false;
  }

  isRival(p: PlayerState, faction: string) {
    const crew = p.underworld.crew ? this.crews.get(p.underworld.crew) : undefined;
    return crew ? crewRivals(this.w.c, crew).includes(faction) : false;
  }

  private name(id: string) { return this.w.c.factions.find((f) => f.id === id)?.name ?? id; }
  private location({ entity: e }: SiteAt) {
    return e.zone.def.kind === 'interior' ? e.zone.def.name : this.w.property.dname(this.w.districtOf(e.zone, e.x, e.y));
  }
  private hour() { return Math.floor(Date.now() / this.w.c.manifest.cityHourMs + this.w.cfg.cityHourOffset); }
  private pressure(buyer: Buyer) {
    const heat = this.heat.get(buyer.id);
    return heat?.hour === this.hour() ? Math.min(6, heat.qty) : 0;
  }
  private price(buyer: Buyer, item: ItemDef) {
    const demand = ((hashString(`${this.hour()}:${buyer.id}:${item.id}`) >>> 0) % 41) / 100;
    return Math.round(item.price! * (0.99 + demand - this.pressure(buyer) * 0.024));
  }
  private supplyPrice(site: SiteAt, item: ItemDef) {
    const swing = ((hashString(`${this.hour()}:${site.def.id}:${item.id}`) >>> 0) % 7) / 100;
    return Math.round(item.price! * (0.43 + swing));
  }
  private risk(p: PlayerState, buyer: Buyer, organized: boolean) {
    const hostility = Math.min(0.14, Math.max(0, -(p.rep.get(buyer.crew) ?? 0)) * 0.008);
    const amount = buyer.risk + this.pressure(buyer) * 0.018 + hostility;
    return Math.min(0.65, organized ? amount * 0.28 : amount);
  }
  private allowedJoin(p: PlayerState, crew: Crew) {
    const faction = this.w.c.factions.find((f) => f.id === crew.id)!;
    return !p.underworld.crew && (p.underworld.rep ?? 0) >= crew.entryRep && (p.rep.get(crew.id) ?? 0) > faction.hostileBelow;
  }

  private nearby(c: PlayerConn, id?: string) {
    const site = id ? this.sites.get(id) : undefined;
    const e = c.e!;
    if (!site || site.entity.zone !== e.zone || Math.hypot(site.entity.x - e.x, site.entity.y - e.y) > REACH)
      throw new GameError('Acércate a la persona con la que quieres tratar.');
    if (c.p!.driving || e.transit || c.p!.status !== 'alive' || c.p!.sleeping || isSick(c.p!.substances))
      throw new GameError('Ahora no puedes negociar.');
    return site;
  }

  open(c: PlayerConn, entity: Entity) {
    try { this.sendView(c, this.nearby(c, entity.marketSite)); }
    catch (err) {
      if (!(err instanceof GameError)) throw err;
      this.w.send(c, { t: 'notice', kind: 'warn', text: err.message });
    }
  }

  private sendView(c: PlayerConn, s: SiteAt) {
    const p = c.p!;
    const job = p.underworld.job;
    const contact = s.kind === 'contact';
    const view: UnderworldView = {
      site: s.def.id, name: s.def.name, place: this.location(s), kind: s.kind, status: underworldStatus(this.w.c, p.underworld), money: p.money,
      goods: s.kind !== 'base' ? this.drugs.map((item) => ({ id: item.id, name: item.name, desc: item.desc, qty: p.inventory.get(item.id) ?? 0,
        price: s.kind === 'buyer' ? this.price(s.buyer, item) : this.supplyPrice(s, item) })) : [],
      markets: contact ? this.w.c.underworld.buyers.map((b) => ({
        id: b.id, name: b.name, place: this.location(this.sites.get(b.id)!), controller: this.name(b.crew),
        risk: this.risk(p, b, p.underworld.crew === b.crew),
        prices: this.drugs.map((item) => ({ name: item.name, price: this.price(b, item) })),
      })) : [],
      crews: contact ? [...this.crews.values()].map((f) => ({ id: f.id, name: this.name(f.id), tier: f.tier,
        parent: f.parent ? this.name(f.parent) : undefined, entryRep: f.entryRep, canJoin: this.allowedJoin(p, f),
        rivals: crewRivals(this.w.c, f).map((id) => this.name(id)), commission: commissionRate(f) })) : [],
      risk: s.kind === 'buyer' ? this.risk(p, s.buyer, p.underworld.crew === s.buyer.crew) : undefined,
      currentStop: (job?.phase === 'sale' && job.buyer === s.def.id) || (job?.phase === 'cash' && job.base === s.def.id),
    };
    this.w.send(c, { t: 'underworld', view });
  }

  async command(c: PlayerConn, m: Command) {
    const p = c.p!;
    await this.expire(c);
    if (m.action === 'track') {
      const job = p.underworld.job;
      if (!job) throw new GameError('No tienes un encargo activo.');
      this.mark(c, this.sites.get(job.phase === 'sale' ? job.buyer : job.base));
      return;
    }
    const s = this.nearby(c, m.site);
    if (m.action === 'quote' && s.kind === 'contact') { this.mark(c, m.ref ? this.sites.get(m.ref) : undefined, 'buyer'); return; }
    if (!m.opId) throw new GameError('Falta el identificador de la operación.');
    const op = m.opId, state = p.underworld;
    if (s.kind === 'contact') {
      switch (m.action) {
        case 'buy': await this.buy(c, s, m.ref, m.qty ?? 1, op); break;
        case 'join': {
          const crew = m.ref ? this.crews.get(m.ref) : undefined;
          if (!crew || !this.allowedJoin(p, crew)) throw new GameError('La banda aún no te acepta o ya tienes afiliación.');
          if (await this.commit(p, op, { state: { ...state, crew: crew.id, deliveries: 0 }, reason: 'Afiliación' }))
            this.w.send(c, { t: 'notice', kind: 'good', text: `Ya eres parte de ${this.name(crew.id)}. Sus rivales pueden atacarte en su territorio.` });
          break;
        }
        case 'leave':
          if (!state.crew || state.job) throw new GameError('Resuelve el encargo antes de dejar la banda.');
          if (await this.commit(p, op, { state: { ...state, crew: undefined, deliveries: 0, rep: Math.max(0, (state.rep ?? 0) - 2) }, reason: 'Salida de la banda' }))
            this.w.send(c, { t: 'notice', kind: 'info', text: 'Vuelves a trabajar por libre. Pierdes 2 de reputación y la protección de la banda.' });
          break;
        case 'accept': await this.accept(c, m.ref, op); break;
        case 'abandon':
          if (!state.job) throw new GameError('No tienes un encargo activo.');
          await this.fail(c, op, 'Has abandonado el encargo.');
          break;
        default: throw new GameError('Habla con el comprador o con el contable asignado.');
      }
    } else if (s.kind === 'buyer' && m.action === 'sell') await this.sell(c, s.buyer, m.ref, m.qty ?? 1, op);
    else if (s.kind === 'buyer' && m.action === 'collect') await this.collect(c, s.buyer, op);
    else if (s.kind === 'base' && m.action === 'deliver') await this.deliver(c, s, op);
    else throw new GameError('Esa persona no puede hacer ese trato.');
    this.w.send(c, { t: 'sheet', sheet: buildSheet(this.w.c, p) });
    this.sendView(c, s);
  }

  private mark(c: PlayerConn, target?: SiteAt, kind?: SiteAt['kind']) {
    if (!target || (kind && target.kind !== kind)) throw new GameError('No conoces ese sitio.');
    const e = target.entity;
    this.w.intel.markPlace(c, `${target.def.name} · ${this.location(target)}`, e.zone.id, e.x, e.y);
  }

  private drug(id?: string) {
    const item = this.drugs.find((d) => d.id === id);
    if (!item) throw new GameError('Esa mercancía no se negocia aquí.');
    return item;
  }

  private async buy(c: PlayerConn, s: SiteAt, id: string | undefined, qty: number, op: string) {
    const p = c.p!, item = this.drug(id);
    const count = this.drugs.reduce((sum, d) => sum + (p.inventory.get(d.id) ?? 0), 0);
    const capacity = effective(this.w.c, p);
    if (count + qty > DRUG_INVENTORY_LIMIT || capacity.weight + qty * item.weight > capacity.carryMax) throw new GameError('No tienes espacio para más mercancía.');
    const cost = this.supplyPrice(s, item) * qty;
    if (await this.commit(p, op, { money: -cost, item: { id: item.id, delta: qty }, reason: `Mercado negro · compra de ${item.name}` }))
      this.w.send(c, { t: 'notice', kind: 'info', text: `Compras ${qty} × ${item.name} por ${cost} €$.` });
  }

  private async sell(c: PlayerConn, buyer: Buyer, id: string | undefined, qty: number, op: string) {
    const p = c.p!, item = this.drug(id);
    if (p.underworld.crew) throw new GameError('Tu banda exige que trabajes por encargo. Habla con el contacto.');
    if ((p.inventory.get(item.id) ?? 0) < qty) throw new GameError('No tienes esa cantidad.');
    const deal = this.deal(p, buyer, item, qty, false);
    const rep = (p.underworld.rep ?? 0) + (deal.riskEvent ? 0 : qty);
    const change: Change = { state: { ...p.underworld, rep }, money: deal.gross, item: { id: item.id, delta: -qty }, reason: `Mercado negro · venta de ${item.name}` };
    if (deal.riskEvent === 'rival') change.faction = { id: buyer.crew, delta: -2 };
    if (!await this.commit(p, op, change)) return;
    this.afterDeal(c, buyer, qty, deal.riskEvent);
    this.w.send(c, { t: 'notice', kind: deal.riskEvent ? 'warn' : 'good', text: `Cobras ${deal.gross} €$ por ${qty} × ${item.name}.${deal.riskEvent ? '' : ` +${qty} de reputación en los bajos fondos.`}` });
  }

  private async accept(c: PlayerConn, id: string | undefined, op: string) {
    const p = c.p!, state = p.underworld, crew = state.crew ? this.crews.get(state.crew) : undefined;
    if (!crew) throw new GameError('Para hacer encargos primero debes estar en una banda.');
    if (state.job) throw new GameError('Ya tienes un encargo.');
    if ((state.cooldownUntil ?? 0) > Date.now()) throw new GameError('La banda aún está esperando a que se enfríe el último encargo.');
    const item = this.drug(id);
    const buyers = this.w.c.underworld.buyers.filter((b) => b.crew === crew.id);
    const deliveries = state.deliveries ?? 0;
    const buyer = buyers[deliveries % buyers.length];
    const qty = (crew.tier === 'principal' ? 3 : 2) + Math.min(2, Math.floor(deliveries / 3));
    if (await this.commit(p, op, { state: { ...state, job: { phase: 'sale', crew: crew.id, buyer: buyer.id, item: item.id, qty } }, reason: 'Encargo de la banda' }))
      this.w.send(c, { t: 'notice', kind: 'info', text: `La banda te confía ${qty} × ${item.name}. Véndeselo a ${buyer.name} en ${this.location(this.sites.get(buyer.id)!)}.` });
  }

  private async collect(c: PlayerConn, buyer: Buyer, op: string) {
    const p = c.p!, state = p.underworld, job = state.job;
    if (job?.phase !== 'sale' || job.buyer !== buyer.id || job.crew !== state.crew) throw new GameError('No tienes una venta concertada con esta persona.');
    const item = this.drug(job.item);
    const crew = this.crews.get(job.crew)!;
    const base = crew.bases[(state.deliveries ?? 0) % crew.bases.length];
    const entrance = c.e!.zone.def.doors.find((d) => d.to.zone === base.zone);
    const distance = entrance ? Math.hypot(entrance.at[0] - buyer.at[0], entrance.at[1] - buyer.at[1]) : 180;
    const time = Math.min(450, Math.max(150, Math.ceil(distance / 1.6 + 100)));
    const deal = this.deal(p, buyer, item, job.qty, true);
    const next: UnderworldState = { ...state, job: { phase: 'cash', crew: crew.id, item: item.id, qty: job.qty, base: base.id,
      gross: deal.gross, commission: Math.round(deal.gross * commissionRate(crew)), deadline: Date.now() + time * 1000 } };
    if (!await this.commit(p, op, { state: next, reason: 'Cobro para la banda' })) return;
    this.afterDeal(c, buyer, job.qty, deal.riskEvent);
    this.w.send(c, { t: 'notice', kind: 'warn', text: `Llevas ${deal.gross} €$ de la banda. Tienes ${time} s para entregarlos en ${this.location(this.sites.get(base.id)!)}.` });
  }

  private deal(p: PlayerState, buyer: Buyer, item: ItemDef, qty: number, organized: boolean) {
    const gross = this.price(buyer, item) * qty;
    if (this.rng() >= this.risk(p, buyer, organized)) return { gross, riskEvent: null };
    const riskEvent = this.rng() < 0.55 ? 'rival' as const : 'buyer' as const;
    const loss = organized ? 0.2 : riskEvent === 'buyer' ? 0.6 : 0.45;
    return { gross: Math.round(gross * (1 - loss)), riskEvent };
  }

  private afterDeal(c: PlayerConn, buyer: Buyer, qty: number, outcome: 'rival' | 'buyer' | null) {
    this.heat.set(buyer.id, { hour: this.hour(), qty: this.pressure(buyer) + qty });
    if (!outcome) return;
    if (outcome === 'buyer') {
      this.w.send(c, { t: 'notice', kind: 'bad', text: 'El comprador, desesperado por la abstinencia, se queda con parte del dinero y corta el trato.' });
      return;
    }
    const p = c.p!, e = c.e!;
    const controlledBy = this.crews.get(buyer.crew)!;
    const enemies = crewRivals(this.w.c, controlledBy);
    const rivals = p.underworld.crew ? enemies : [buyer.crew, ...enemies];
    const faction = rivals[Math.floor(this.rng() * rivals.length)];
    if (!faction) return;
    this.w.send(c, { t: 'notice', kind: 'bad', text: `${this.name(faction)} se queda con parte del dinero y manda a alguien tras de ti.` });
    if (dangerAt(e.zone.grid, e.x, e.y) === 'protected') return;
    const previous = this.patrols.get(p.charId);
    if (previous && this.w.entities.has(previous.id)) return;
    const at = nearestWalkable(e.zone.grid, e.x + 4, e.y + 2, 4);
    const enforcer = at && this.w.combat.spawnFactionNpc(e.zone, faction, 'gang', undefined, at);
    if (enforcer) {
      enforcer.aggro = e.id;
      enforcer.aggroLethal = false;
      enforcer.respawn = undefined;
      enforcer.expiresAt = Date.now() + 45_000;
      enforcer.label = 'Viene a por ti';
      this.patrols.set(p.charId, enforcer);
    }
  }

  private async deliver(c: PlayerConn, site: Extract<SiteAt, { kind: 'base' }>, op: string) {
    const p = c.p!, state = p.underworld;
    const job = state.job;
    if (job?.phase !== 'cash' || job.base !== site.def.id || job.crew !== state.crew) throw new GameError('Entrega el dinero en la base que te han indicado.');
    if (job.deadline <= Date.now()) { await this.expire(c); throw new GameError('Se ha acabado el plazo de entrega.'); }
    const previousRank = underworldStatus(this.w.c, state).membership?.rank;
    const next = { ...state, job: undefined, deliveries: (state.deliveries ?? 0) + 1, rep: (state.rep ?? 0) + 4 };
    if (!await this.commit(p, op, { state: next, money: job.commission, faction: { id: site.crew.id, delta: 3 }, reason: 'Comisión de la banda' })) return;
    const rank = underworldStatus(this.w.c, next).membership?.rank;
    this.w.send(c, { t: 'reward', title: 'Encargo completado', lines: [`Has entregado ${job.gross} €$. Comisión: ${job.commission} €$.`,
      '+4 de reputación en los bajos fondos y +3 con la banda.', ...(rank !== previousRank ? [`Ascenso a ${rank}.`] : [])] });
  }

  private async fail(c: PlayerConn, op: string, message: string) {
    const p = c.p!, state = p.underworld;
    const job = state.job;
    if (!job) return;
    const loss = job.phase === 'cash' ? 7 : 3;
    const failure = { ...state, job: undefined, rep: Math.max(0, (state.rep ?? 0) - loss), cooldownUntil: Date.now() + 30_000 };
    if (await this.commit(p, op, { state: failure, faction: { id: job.crew, delta: -loss }, reason: 'Incumplimiento de la banda' }))
      this.w.send(c, { t: 'notice', kind: 'bad', text: `${message} Pierdes ${loss} de reputación con la banda y en los bajos fondos.` });
  }

  private async expire(c: PlayerConn) {
    const job = c.p!.underworld.job;
    if (job?.phase !== 'cash' || job.deadline > Date.now()) return;
    await this.fail(c, `underworld-timeout-${randomUUID()}`, 'Se ha acabado el plazo. La banda da el dinero por perdido.');
    this.w.send(c, { t: 'sheet', sheet: buildSheet(this.w.c, c.p!) });
  }

  everySecond() {
    const now = Date.now();
    for (const [id, e] of this.patrols) {
      if (this.w.entities.has(e.id) && (e.expiresAt ?? Infinity) > now) continue;
      if (this.w.entities.has(e.id)) this.w.removeEntity(e);
      this.patrols.delete(id);
    }
    for (const c of this.w.conns.values()) {
      const job = c.p?.underworld.job;
      if (job?.phase !== 'cash' || job.deadline > now || this.expiring.has(c)) continue;
      this.expiring.add(c);
      this.w.enqueue(c, async () => {
        try { await this.expire(c); } finally { this.expiring.delete(c); }
      });
    }
  }

  private async commit(p: PlayerState, op: string, change: Change) {
    const { state = p.underworld, money = 0, item, faction, reason } = change;
    const result = await this.w.db.tx(async (q) => {
      const fresh = await q.query("INSERT INTO ops (op_id, character_id, kind, result) VALUES ($1,$2,'underworld',$3) ON CONFLICT DO NOTHING RETURNING op_id",
        [op, p.charId, JSON.stringify({ reason, money, item })]);
      if (!fresh.rows.length) return null;
      const char = await q.query<{ money: string }>("UPDATE characters SET underworld=$2, money=money+$3 WHERE id=$1 AND status <> 'dead' AND underworld=$4::jsonb AND money+$3 >= 0 RETURNING money",
        [p.charId, JSON.stringify(state), money, JSON.stringify(p.underworld)]);
      if (!char.rows.length) throw new GameError(money < 0 ? 'No tienes suficientes eurodólares.' : 'El trato ha cambiado. Vuelve a hablar con tu contacto.');
      let qty: number | undefined;
      if (item) {
        const updated = item.delta > 0
          ? await q.query<{ qty: number }>(`INSERT INTO inventory_items (id, character_id, def_id, qty) VALUES ($1,$2,$3,$4)
             ON CONFLICT (character_id, def_id) DO UPDATE SET qty=inventory_items.qty + EXCLUDED.qty RETURNING qty`, [randomUUID(), p.charId, item.id, item.delta])
          : await q.query<{ qty: number }>('UPDATE inventory_items SET qty=qty+$3 WHERE character_id=$1 AND def_id=$2 AND qty+$3 >= 0 RETURNING qty', [p.charId, item.id, item.delta]);
        if (!updated.rows.length) throw new GameError('No te queda esa mercancía.');
        qty = updated.rows[0].qty;
      }
      if (money) await q.query('INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,$3,$4,$5)', [`${op}:street`, p.charId, money, char.rows[0].money, reason]);
      if (faction) await q.query(`INSERT INTO reputation (character_id, faction_id, value) VALUES ($1,$2,$3)
        ON CONFLICT (character_id, faction_id) DO UPDATE SET value=reputation.value + EXCLUDED.value`, [p.charId, faction.id, faction.delta]);
      return { money: Number(char.rows[0].money), qty };
    });
    if (!result) return false;
    p.underworld = state;
    p.money = result.money;
    if (item && result.qty !== undefined) p.inventory.set(item.id, result.qty);
    if (faction) p.rep.set(faction.id, (p.rep.get(faction.id) ?? 0) + faction.delta);
    return true;
  }
}
