// Supervivencia y vida en la ciudad: necesidades, sueño, comercio, empleos, matasanos, recompensas, agresiones y muerte.
import { randomUUID } from 'node:crypto';
import {
  checkChance, walkSpeed, nearestWalkable, isWalkable, dangerAt, findPath, t,
  type BountyView, type ClientMsg, type DeathSummary, type FugitiveDef, type JobsView, type TargetMenuView,
} from '@vertice/shared';
import type { World, PlayerConn } from './world.js';
import type { Entity, RunningTask } from './entity.js';
import { ambientBrain } from './npc.js';
import { MarketService } from '../game/market.js';
import { ClinicService } from '../game/clinic.js';
import { BountyService, type Bounty } from '../game/bounty.js';
import { GameError } from '../game/effects.js';
import { buildSheet, chromeParts, effective, savePlayerVitals, wornAppearance, type PlayerState } from '../game/player.js';

const PROF_RANKS = [0, 5, 12, 22, 35];
const SHOP_RANGE = 3.5;
const HOSTILE_RANGE = 2.6;

export { opposed as opposedChance } from './combat.js';

interface ConnExtra {
  openShop?: { shop: string; entity: number }; openClinic?: { doc: string; entity: number };
  nextAutoAt: number; noFoodWarnAt: number; warned: Record<string, boolean>; lastSheetAt: number; nextHostileAt: number;
  rummaged: Map<number, number>; jobCd: Map<string, number>; loadedCd: boolean; lastPos?: { zone: string; x: number; y: number };
}

export class Survival {
  readonly market: MarketService;
  readonly clinic: ClinicService;
  readonly bounties: BountyService;
  private extra = new WeakMap<PlayerConn, ConnExtra>();
  private fugitiveRespawn = new Map<string, number>();
  private marketBusy = false;
  rng: () => number = Math.random;

  constructor(private w: World) {
    this.market = new MarketService(w.db, w.c, () => this.rng());
    this.clinic = new ClinicService(w.db, w.c, this.market, () => this.rng());
    this.bounties = new BountyService(w.db);
  }

  async init() {
    await this.market.load();
    await this.bounties.load();
    for (const f of this.w.c.fugitives) await this.spawnFugitive(f);
  }

  x(c: PlayerConn): ConnExtra {
    let e = this.extra.get(c);
    if (!e) { e = { nextAutoAt: 0, noFoodWarnAt: 0, warned: {}, lastSheetAt: 0, nextHostileAt: 0, rummaged: new Map(), jobCd: new Map(), loadedCd: false }; this.extra.set(c, e); }
    return e;
  }
  gameHoursPerSecond() { return (1000 / this.w.c.manifest.cityHourMs) * this.w.cfg.needsScale; }
  sheetOf(p: PlayerState) { return buildSheet(this.w.c, p); }
  private sheet(c: PlayerConn) { this.w.send(c, { t: 'sheet', sheet: buildSheet(this.w.c, c.p!) }); this.x(c).lastSheetAt = Date.now(); }
  private notice(c: PlayerConn | undefined, kind: 'info' | 'good' | 'warn' | 'bad', text: string) { if (c) this.w.send(c, { t: 'notice', kind, text }); }
  private bump(e: Entity) { e.labelVer++; }
  connOf(charId: string): PlayerConn | undefined { for (const c of this.w.conns.values()) if (c.p?.charId === charId) return c; return undefined; }

  // ================================================================ tick por segundo
  dangerHere(c: PlayerConn) { return dangerAt(c.e!.zone.grid, c.e!.x, c.e!.y); }
  everySecond() {
    const dtH = this.gameHoursPerSecond();
    for (const c of this.w.conns.values()) if (c.p && c.e && !c.closed) this.tickPlayer(c, dtH);
    const now = Date.now();
    for (const [id, at] of this.fugitiveRespawn) if (now >= at) { this.fugitiveRespawn.delete(id); const f = this.w.c.fugitives.find((x) => x.id === id); if (f) void this.spawnFugitive(f); }
    if (!this.marketBusy && this.w.tick % (20 * 5) < 20) {
      this.marketBusy = true;
      this.market.tick(Date.now() / this.w.c.manifest.cityHourMs + this.w.cfg.cityHourOffset)
        .then((news) => { for (const n of news) for (const c of this.w.conns.values()) this.notice(c, 'info', `Red de mercado · ${n}`); })
        .catch((e) => console.error('[mercado]', e)).finally(() => (this.marketBusy = false));
    }
  }

  private tickPlayer(c: PlayerConn, dtH: number) {
    const p = c.p!, e = c.e!, n = this.w.c.needs, x = this.x(c);
    if (p.status === 'downed') {
      if (p.revive && Date.now() >= p.revive.at) {
        const ef0 = effective(this.w.c, p);
        p.status = 'alive'; p.hp = Math.max(10, Math.round(ef0.hpMax * p.revive.frac)); p.downedUntil = 0; e.label = ''; e.state = 'alive'; this.bump(e);
        this.notice(c, 'good', `${p.revive.why}: vuelves a levantarte con ${p.hp} de salud.`);
        p.revive = undefined; this.sheet(c); return;
      }
      if (Date.now() >= p.downedUntil) {
        if (p.downedLethal) this.w.enqueue(c, () => this.die(p, e, p.downedCause));
        else { p.status = 'alive'; p.hp = 10; p.downedUntil = 0; e.label = ''; e.state = 'alive'; this.bump(e); this.notice(c, 'info', 'Recuperas el sentido con 10 de salud.'); this.sheet(c); }
      }
      else if (Date.now() - x.lastSheetAt > 2000) this.sheet(c);
      return;
    }
    const ef = effective(this.w.c, p);
    const working = !!e.task?.def.id.startsWith('job:');
    const mult = working ? n.workMultiplier : 1;
    const sleepMult = p.sleeping ? 0.5 : 1;
    const before = { h: p.hunger, t: p.thirst, f: p.fatigue };
    p.hunger = Math.min(100, p.hunger + n.perGameHour.hunger * ef.needs.hunger * mult * sleepMult * dtH);
    p.thirst = Math.min(100, p.thirst + n.perGameHour.thirst * ef.needs.thirst * mult * sleepMult * dtH);
    if (p.sleeping) {
      p.fatigue = Math.max(0, p.fatigue - n.sleepRecoverPerGameHour * p.sleeping.quality * dtH);
      p.stamina = Math.min(ef.hpMax + 40, p.stamina + 6 * p.sleeping.quality * dtH * 10);
      if (p.sleeping.quality >= 0.8 && p.hunger < 100 && p.thirst < 100) p.hp = Math.min(ef.hpMax, p.hp + 4 * dtH);
      if (p.fatigue <= 0) {
        const full = p.sleeping.quality >= 0.8;
        if (full) p.luck = p.attributes.LUCK;
        this.wake(c, full ? 'Te despiertas como nueva persona: sueño, Suerte y algo de salud recuperados.' : 'Te despiertas. No has descansado del todo bien.');
      } else if (dangerAt(e.zone.grid, e.x, e.y) !== 'protected') this.streetEvent(c, dtH);
    } else {
      p.fatigue = Math.min(100, p.fatigue + n.perGameHour.fatigue * ef.needs.fatigue * mult * (p.profession === 'estibador' && working ? 0.7 : 1) * dtH);
    }
    let dmg = 0;
    if (p.hunger >= 100) dmg += n.damagePerGameHourAtMax * dtH;
    if (p.thirst >= 100) dmg += n.damagePerGameHourAtMax * dtH;
    if (dmg) {
      p.hp -= dmg;
      if (p.hp <= 0) { this.downed(c, p.thirst >= 100 ? 'deshidratación' : 'inanición'); return; }
    }
    if (!p.sleeping && p.fatigue >= 100) { this.startSleep(c, this.groundQuality(c) * 0.8, 'desplomado en el suelo'); this.notice(c, 'bad', 'El agotamiento te vence: te desplomas y te duermes donde estás.'); }
    if (p.wanted > 0) {
      p.wanted = Math.max(0, p.wanted - n.wantedDecayPerGameHour * dtH * (ef.flags.has('modulador') ? 2 : 1));
      if (p.wanted < 1) { const pcv = this.bounties.onPlayer(p.charId).filter((b) => b.poster === 'pcv'); if (pcv.length) { void this.bounties.cancel(pcv.map((b) => b.id)).then(() => this.updateMarker(e)); this.notice(c, 'good', 'La PCV ha retirado tu orden de búsqueda.'); } }
    }
    // Avisos al cruzar umbrales.
    for (const [k, v, b, label] of [['hunger', p.hunger, before.h, 'hambre'], ['thirst', p.thirst, before.t, 'sed'], ['fatigue', p.fatigue, before.f, 'sueño']] as const) {
      if (v >= n.warnThreshold && b < n.warnThreshold) this.notice(c, 'warn', `Tienes mucha ${label}${k === 'fatigue' ? ': busca un sitio seguro para dormir' : ''}.`);
      if (v >= 100 && b < 100) this.notice(c, 'bad', k === 'fatigue' ? 'Agotamiento total.' : `${label === 'hambre' ? 'Te mueres de hambre' : 'Te deshidratas'}: pierdes salud cada hora.`);
    }
    // Velocidad: atributos efectivos, oficio y cansancio.
    const car = this.w.property.carOf(p);
    if (car && e.zone.def.kind === 'exterior') e.speed = walkSpeed(ef.attrs) * this.w.cfg.speedScale * car.speed * (1 + ef.carSpeed);
    else {
      if (p.driving) this.w.property.park(c, true);
      // Correr: más rápido a cambio de aguante; sin aguante se vuelve a andar.
      const run = p.running && p.stamina > 3 && !p.carrying && !p.sleeping;
      if (run && e.moving) p.stamina = Math.max(0, p.stamina - 3);
      else if (!e.moving || !p.running) p.stamina = Math.min(ef.staminaMax, p.stamina + (Date.now() - p.lastCombatAt > 8000 ? 2.5 : 1));
      if (p.running && p.stamina <= 3 && e.moving) this.notice(c, 'warn', 'Sin aliento: vuelves a andar hasta recuperar aguante.');
      e.speed = walkSpeed(ef.attrs) * this.w.cfg.speedScale * (1 + (ef.mods.speed ?? 0) + ef.speed) * (p.fatigue >= 80 ? 0.8 : 1) * (p.hunger >= 100 || p.thirst >= 100 ? 0.85 : 1) * this.w.combat.speedFactor(p) * ((p.buffs.esprint ?? 0) > Date.now() ? 1.7 : 1) * (run ? 1.65 : 1);
    }
    // Entrenamiento al recorrer la ciudad (atletismo a pie, conducción al volante).
    if (x.lastPos && x.lastPos.zone === e.zone.id) this.w.progress.walkTick(p, Math.hypot(e.x - x.lastPos.x, e.y - x.lastPos.y) * (p.running && !p.driving ? 2 : 1));
    x.lastPos = { zone: e.zone.id, x: e.x, y: e.y };
    // Regeneración (perks de medicina) fuera de combate.
    const regen = ef.perk.regen ?? 0;
    if (regen && Date.now() - p.lastCombatAt > 10000 && p.hp < ef.hpMax && p.hunger < 100 && p.thirst < 100) p.hp = Math.min(ef.hpMax, p.hp + regen * (ef.flags.has('milagro') ? 3 : 1));
    // Adrenalina (implante): curación repartida en el tiempo.
    if ((p.buffs.curar ?? 0) > Date.now()) p.hp = Math.min(ef.hpMax, p.hp + (p.buffs.curarPerSec ?? 0));
    // Biomonitor: autoestimulante por debajo del 25 %.
    if (ef.flags.has('autoestim') && p.hp < ef.hpMax * 0.25 && Date.now() > p.autoStimAt) { p.autoStimAt = Date.now() + 120000; p.hp = Math.min(ef.hpMax, p.hp + 20); this.notice(c, 'good', 'Tu biomonitor inyecta un estimulante: +20 de salud.'); }
    // RAM del deck: se recarga más rápido con rango de red.
    if (ef.ram > 0) p.ram = Math.min(ef.ram, p.ram + (0.25 + p.netRank * 0.03)); else p.ram = 0;
    // Cromo visible y salud para quien mire.
    const parts = chromeParts(this.w.c, p);
    if (parts.join() !== (e.chrome ?? []).join()) { e.chrome = parts; this.bump(e); }
    this.autoNeeds(c);
    if (Date.now() - x.lastSheetAt > 4000) this.sheet(c);
  }

  // ================================================================ necesidades autónomas
  private bestFood(p: PlayerState, need: 'hunger' | 'thirst'): string | null {
    let best: string | null = null, bestScore = -Infinity;
    for (const [it, q] of p.inventory) {
      if (q <= 0) continue;
      const d = this.w.c.items.find((i) => i.id === it);
      const gain = -(d?.consumable?.[need] ?? 0);
      if (!d?.consumable || gain <= 0) continue;
      const waste = Math.max(0, gain - p[need]);
      const score = gain - waste * 1.5 - (d.price ?? 0) * 0.05;
      if (score > bestScore) { bestScore = score; best = it; }
    }
    return best;
  }

  private autoNeeds(c: PlayerConn) {
    const p = c.p!, e = c.e!, x = this.x(c), n = this.w.c.needs;
    if (!p.autoNeeds || p.sleeping || e.task || e.channel || e.path.length || c.dialog || e.transit || Date.now() < x.nextAutoAt) return;
    for (const need of ['thirst', 'hunger'] as const) {
      if (p[need] < n.autoThreshold) continue;
      x.nextAutoAt = Date.now() + 4000;
      const item = this.bestFood(p, need);
      if (item) { this.w.enqueue(c, () => this.consume(c, item, `auto-${randomUUID()}`, true)); return; }
      const cat = need === 'hunger' ? 'comida' : 'bebida';
      const sources = this.shopSources(e).filter((s) => this.market.cheapestIn([s.shop], cat, p, need));
      if (sources.length && p.money > 0) {
        sources.sort((a, b) => Math.hypot(a.ent.x - e.x, a.ent.y - e.y) - Math.hypot(b.ent.x - e.x, b.ent.y - e.y));
        for (const src of sources) {
          const deal = this.market.cheapestIn([src.shop], cat, p, need)!;
          const stand = this.approach(e, src.ent);
          if (!stand) continue;
          const name = this.w.c.items.find((i) => i.id === deal.item)!.name;
          this.notice(c, 'info', `Tienes ${need === 'hunger' ? 'hambre' : 'sed'}: vas a comprar ${name} (${deal.price} €$) en ${src.ent.name}. Cualquier clic lo cancela.`);
          this.errand(c, `Ir a comprar ${name}`, stand, async () => {
            if (Math.hypot(src.ent.x - e.x, src.ent.y - e.y) > SHOP_RANGE) return;
            try {
              const r = await this.market.buy(p, src.shop, deal.item, 1, `auto-buy-${randomUUID()}`, 'Compra automática');
              this.notice(c, 'info', `Compras ${r.name} por ${r.total} €$.`);
              await this.consume(c, deal.item, `auto-${randomUUID()}`, true);
            } catch (err) { if (err instanceof GameError) this.notice(c, 'warn', err.message); else throw err; }
          });
          return;
        }
      }
      if (Date.now() > x.noFoodWarnAt) {
        x.noFoodWarnAt = Date.now() + 60_000;
        this.notice(c, 'warn', p.money <= 0
          ? `Tienes ${need === 'hunger' ? 'hambre' : 'sed'} y ni comida ni dinero: rebusca en un contenedor de basura, trabaja, roba en una tienda o aguanta.`
          : `Tienes ${need === 'hunger' ? 'hambre' : 'sed'} y no hay dónde comprar en esta zona: ve a una tienda o máquina expendedora.`);
      }
      return;
    }
  }

  /** Puntos de venta presentes en la zona: máquinas, mostradores y vendedores. */
  private shopSources(e: Entity): { shop: string; ent: Entity }[] {
    const out: { shop: string; ent: Entity }[] = [];
    for (const o of e.zone.entities) {
      if (o.kind === 'object' && o.shop) out.push({ shop: o.shop, ent: o });
      if (o.kind === 'npc' && o.npcShop && o.label && !o.label.startsWith('De camino')) out.push({ shop: o.npcShop, ent: o });
    }
    return out;
  }
  private approach(e: Entity, target: Entity): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null, bd = Infinity;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const px = Math.floor(target.x) + dx + 0.5, py = Math.floor(target.y) + dy + 0.5;
      if (!isWalkable(e.zone.grid, px, py) || Math.hypot(px - target.x, py - target.y) > 1.9) continue;
      const d = Math.hypot(px - e.x, py - e.y);
      if (d < bd) { bd = d; best = { x: px, y: py }; }
    }
    return best;
  }
  /** Recado autónomo: caminar a un punto y ejecutar una acción al llegar. */
  private errand(c: PlayerConn, label: string, to: { x: number; y: number }, onDone: () => Promise<void>) {
    const e = c.e!;
    this.w.cancelActivity(e);
    e.task = { def: { id: 'auto:errand', label, repeat: 1, steps: [{ moveTo: [Math.floor(to.x), Math.floor(to.y)], zone: e.zone.id }], onComplete: [] }, step: 0, rep: 0, waitUntil: 0, started: false, opId: `errand-${randomUUID()}`,
      onDone: () => this.w.enqueue(c, onDone) } as RunningTask;
  }

  async consume(c: PlayerConn, item: string, opId: string, auto = false) {
    const p = c.p!;
    const d = this.w.c.items.find((i) => i.id === item);
    if (!d?.consumable) throw new GameError('Eso no se puede consumir.');
    if ((p.inventory.get(item) ?? 0) < 1) throw new GameError('No te quedan.');
    const r = await this.w.db.tx(async (q) => {
      const dup = await q.query('SELECT 1 FROM ops WHERE op_id = $1', [opId]);
      if (dup.rows.length) return false;
      const u = await q.query('UPDATE inventory_items SET qty = qty - 1 WHERE character_id=$1 AND def_id=$2 AND qty >= 1 RETURNING qty', [p.charId, item]);
      if (!u.rows.length) throw new GameError('No te quedan.');
      await q.query('INSERT INTO ops (op_id, character_id, kind, result) VALUES ($1,$2,$3,$4)', [opId, p.charId, 'consume', JSON.stringify({ item })]);
      return true;
    });
    if (!r) return;
    p.inventory.set(item, (p.inventory.get(item) ?? 0) - 1);
    const k = p.profession === 'cocinero' && d.category === 'comida' ? 1.25 : 1;
    const cons = d.consumable;
    p.hunger = Math.max(0, Math.min(100, p.hunger + (cons.hunger ?? 0) * k));
    p.thirst = Math.max(0, Math.min(100, p.thirst + (cons.thirst ?? 0)));
    p.fatigue = Math.max(0, Math.min(100, p.fatigue + (cons.fatigue ?? 0)));
    const ef = effective(this.w.c, p);
    if (cons.restore === 'hp') p.hp = Math.min(ef.hpMax, p.hp + cons.amount);
    if (cons.restore === 'stamina') p.stamina = p.stamina + cons.amount;
    this.notice(c, 'info', `${auto ? 'Automático: ' : ''}consumes ${d.name}.`);
    this.sheet(c);
  }

  // ================================================================ sueño
  groundQuality(c: PlayerConn) {
    const e = c.e!, p = c.p!;
    const dn = dangerAt(e.zone.grid, e.x, e.y);
    const dist = e.zone.districtAt(e.x, e.y);
    let q = (dist && dn !== 'protected' ? dist.sleepQuality : undefined) ?? e.zone.def.sleepQuality ?? (dn === 'protected' ? 0.6 : dn === 'public' ? 0.35 : 0.25);
    if (dn !== 'protected') {
      q += this.w.c.professions.find((x) => x.id === p.profession)?.mods.sleepStreet ?? 0;
      if (e.zone.def.kind === 'exterior' && (p.inventory.get('ropa-impermeable') ?? 0) > 0) q += 0.05;
    }
    return Math.min(0.9, q);
  }
  startSleep(c: PlayerConn, quality: number, where: string) {
    const p = c.p!, e = c.e!;
    this.w.cancelActivity(e);
    this.w.closeDialog(c);
    p.sleeping = { quality, where, since: Date.now() };
    e.label = 'Durmiendo'; e.state = 'sleeping'; this.bump(e);
    this.w.send(c, { t: 'action', text: `Durmiendo (${where}, calidad ${Math.round(quality * 100)} %)` });
    this.sheet(c);
  }
  wake(c: PlayerConn, text?: string) {
    const p = c.p!, e = c.e!;
    if (!p.sleeping) return;
    p.sleeping = null;
    e.label = ''; e.state = 'alive'; this.bump(e);
    this.w.send(c, { t: 'action', text: '' });
    if (text) this.notice(c, 'info', text);
    this.sheet(c);
  }
  async sleepCmd(c: PlayerConn, seq: number) {
    const p = c.p!;
    if (p.status !== 'alive') return this.w.send(c, { t: 'ack', seq, ok: false, reason: 'No puedes dormir ahora.' });
    if (p.sleeping) return this.w.send(c, { t: 'ack', seq, ok: true });
    const q = this.groundQuality(c);
    const dn = dangerAt(c.e!.zone.grid, c.e!.x, c.e!.y);
    this.startSleep(c, q, dn === 'protected' ? 'en un sitio protegido' : 'en la calle');
    if (dn !== 'protected') this.notice(c, 'warn', 'Duermes a la intemperie: descansas peor y te pueden robar o dar una paliza.');
    this.w.send(c, { t: 'ack', seq, ok: true });
  }
  async sleepInBed(c: PlayerConn, bed: Entity) {
    const p = c.p!;
    const s = bed.sleep!;
    if (s.price > 0) {
      if (p.money < s.price) throw new GameError(`La cápsula cuesta ${s.price} €$ y no te llega.`);
      const opId = `bed-${randomUUID()}`;
      await this.w.db.tx(async (q) => {
        await q.query('INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,$3,$4,$5)', [opId, p.charId, -s.price, p.money - s.price, `Noche en ${bed.name}`]);
        await q.query('UPDATE characters SET money = money - $2 WHERE id = $1', [p.charId, s.price]);
      });
      p.money -= s.price;
    }
    this.startSleep(c, s.quality, bed.name);
  }

  private streetEvent(c: PlayerConn, dtH: number) {
    const p = c.p!, e = c.e!;
    const mods = this.w.c.professions.find((x) => x.id === p.profession)?.mods;
    const chance = this.w.c.needs.streetEventChancePerGameHour * dtH * Math.max(0.2, 1 - 2 * (mods?.sleepStreet ?? 0));
    if (this.rng() >= chance) return;
    if (this.rng() < 0.6) {
      const amount = Math.floor(p.money * (0.15 + this.rng() * 0.2));
      const items = [...p.inventory].filter(([it, q]) => q > 0 && this.w.c.items.find((i) => i.id === it)?.category !== 'mision');
      const lose = this.rng() < 0.25 && items.length ? items[Math.floor(this.rng() * items.length)][0] : null;
      if (amount < 1 && !lose) return;
      this.w.enqueue(c, async () => {
        await this.w.db.tx(async (q) => {
          if (amount) {
            await q.query('INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,$3,$4,$5)', [`street-${randomUUID()}`, p.charId, -amount, p.money - amount, 'Te han robado mientras dormías en la calle']);
            await q.query('UPDATE characters SET money = money - $2 WHERE id = $1', [p.charId, amount]);
          }
          if (lose) await q.query('UPDATE inventory_items SET qty = qty - 1 WHERE character_id=$1 AND def_id=$2 AND qty >= 1', [p.charId, lose]);
          await q.query('INSERT INTO incidents (kind, victim_char, zone, detail) VALUES ($1,$2,$3,$4)', ['robo_durmiendo', p.charId, e.zone.id, JSON.stringify({ amount, lose })]);
        });
        p.money -= amount;
        if (lose) p.inventory.set(lose, (p.inventory.get(lose) ?? 1) - 1);
        this.notice(c, 'bad', `Mientras dormías te han robado${amount ? ` ${amount} €$` : ''}${lose ? `${amount ? ' y ' : ' '}${this.w.c.items.find((i) => i.id === lose)!.name}` : ''}.`);
        this.sheet(c);
      });
    } else {
      const dmg = 8 + Math.floor(this.rng() * 13);
      p.hp -= dmg;
      void this.w.db.query('INSERT INTO incidents (kind, victim_char, zone, detail) VALUES ($1,$2,$3,$4)', ['paliza_durmiendo', p.charId, e.zone.id, JSON.stringify({ dmg })]).catch(() => {});
      if (p.hp <= 0) { this.downed(c, 'una paliza mientras dormía en la calle'); return; }
      this.wake(c);
      this.notice(c, 'bad', `Te despiertan a golpes unos matones de la calle: −${dmg} de salud.`);
    }
  }

  // ================================================================ derribo, rescate y muerte
  downed(c: PlayerConn | undefined, cause: string, p0?: PlayerState, e0?: Entity, lethal = true) {
    const p = p0 ?? c!.p!, e = e0 ?? c!.e!;
    if (p.status !== 'alive') return;
    if (c) { this.w.cancelActivity(e); this.w.closeDialog(c); }
    if (p.carrying) { const t = this.w.entities.get(p.carrying); if (t) { t.carriedBy = undefined; t.labelVer++; } p.carrying = null; }
    p.sleeping = null; p.hp = 0; p.status = 'downed'; p.downedCause = cause; p.downedLethal = lethal;
    if (p.driving && c) this.w.property.park(c, true);
    // Segundas oportunidades: segundo corazón (implante), «Segunda vida» y «Milagro» (perks).
    if (lethal) {
      const ef = effective(this.w.c, p), now = Date.now(), day = 24 * this.w.c.manifest.cityHourMs;
      if (ef.flags.has('segundo-corazon') && now > p.secondLifeAt) { p.secondLifeAt = now + 2 * day; p.revive = { at: now + 4000, frac: 0.5, why: 'Tu segundo corazón arranca' }; }
      else if (ef.flags.has('segunda-vida') && now > p.secondLifeAt) { p.secondLifeAt = now + day; p.revive = { at: now + 6000, frac: 0.5, why: 'Segunda vida' }; }
      else if (ef.flags.has('milagro') && now > p.milagroAt) { p.milagroAt = now + 3600000; p.revive = { at: now + 8000, frac: 0.3, why: 'Te estabilizas tú solo (Milagro)' }; }
    }
    p.downedUntil = Date.now() + (lethal ? (this.w.cfg.downedSeconds ?? this.w.c.needs.downedSeconds) * 1000 : 45000);
    e.label = lethal ? 'Desangrándose' : 'Inconsciente'; e.state = 'downed'; this.bump(e);
    if (c) {
      this.notice(c, 'bad', lethal ? `Estás derribado (${cause}). Tienes ${this.w.cfg.downedSeconds ?? this.w.c.needs.downedSeconds} s para que alguien te estabilice con un estimulante o un médico.` : `Te han dejado KO (${cause}). Recuperarás el sentido en unos 45 s.`);
      this.sheet(c);
    }
    this.w.combat.onPlayerDowned(c, p, e);
    void savePlayerVitals(this.w.db, p).catch(() => {});
    for (const o of e.zone.query(e.x, e.y, 20)) if (o.kind === 'player' && o.conn && o !== e) this.notice(o.conn, 'warn', `${p.name} está derribado cerca de ti. Haz clic sobre su cuerpo para estabilizarlo.`);
  }

  async rescue(c: PlayerConn, seq: number, targetId: number, opId: string) {
    const p = c.p!, e = c.e!;
    const target = this.w.entities.get(targetId);
    const tp = target?.conn?.p ?? (target ? this.w.playerOf(target) : undefined);
    if (!target || !tp || target.zone !== e.zone || Math.hypot(target.x - e.x, target.y - e.y) > HOSTILE_RANGE) return this.w.send(c, { t: 'ack', seq, ok: false, reason: 'No estás junto a esa persona.' });
    if (tp.status !== 'downed') return this.w.send(c, { t: 'ack', seq, ok: false, reason: 'No necesita que la estabilicen.' });
    const medic = p.profession === 'medico' || p.role === 'medtech';
    if (!medic && (p.inventory.get('estim') ?? 0) < 1) return this.w.send(c, { t: 'ack', seq, ok: false, reason: 'Necesitas un estimulante médico (o ser médico/Medtech).' });
    if (!medic) {
      await this.w.db.tx(async (q) => {
        const dup = await q.query('SELECT 1 FROM ops WHERE op_id = $1', [opId]);
        if (dup.rows.length) throw new GameError('Operación ya procesada');
        const u = await q.query("UPDATE inventory_items SET qty = qty - 1 WHERE character_id=$1 AND def_id='estim' AND qty >= 1 RETURNING qty", [p.charId]);
        if (!u.rows.length) throw new GameError('Necesitas un estimulante médico.');
        await q.query('INSERT INTO ops (op_id, character_id, kind, result) VALUES ($1,$2,$3,$4)', [opId, p.charId, 'rescue', JSON.stringify({ target: tp.charId })]);
      });
      p.inventory.set('estim', (p.inventory.get('estim') ?? 1) - 1);
    }
    if (tp.status !== 'downed') return this.w.send(c, { t: 'ack', seq, ok: false, reason: 'Ya no está derribado.' });
    tp.status = 'alive'; tp.hp = 15; tp.downedUntil = 0;
    target.label = ''; target.state = 'alive'; this.bump(target);
    await savePlayerVitals(this.w.db, tp).catch(() => {});
    this.notice(target.conn, 'good', `${p.name} te ha estabilizado. Vuelves en ti con 15 de salud.`);
    if (target.conn) this.sheet(target.conn);
    try { const out = await this.w.effects.apply(p, [{ rep: 'calle', delta: 2 }, { xp: 15 }], { opId: `${opId}:rep`, kind: 'rescue' }); this.w.handleOutcome(c, out); } catch {}
    this.notice(c, 'good', `Has estabilizado a ${tp.name}.`);
    this.w.progress.gain(p, 'medicina', 10);
    this.w.send(c, { t: 'ack', seq, ok: true });
  }

  /** Muerte definitiva: cierra la vida en una transacción idempotente, registra el memorial y libera la entidad. */
  async die(p: PlayerState, e: Entity, cause: string, killer?: PlayerState) {
    if ((p as any).dead) return;
    (p as any).dead = true;
    const place = `${e.zone.def.name}`;
    let summary: DeathSummary | null = null;
    const refunds = await this.w.db.tx(async (q) => {
      const r = await q.query<any>("UPDATE characters SET status='dead', died_at=now(), cause_of_death=$2, hp=0 WHERE id=$1 AND status <> 'dead' RETURNING created_at, level, money", [p.charId, cause]);
      // Una sola vida: sus casas vuelven al mercado (el alijo se pierde) y sus coches desaparecen.
      await q.query('DELETE FROM house_stash WHERE house_id IN (SELECT house_id FROM houses_owned WHERE character_id=$1)', [p.charId]);
      await q.query('DELETE FROM houses_owned WHERE character_id=$1', [p.charId]);
      await q.query('DELETE FROM cars_owned WHERE character_id=$1', [p.charId]);
      await q.query('DELETE FROM posts_held WHERE character_id=$1', [p.charId]);
      for (const [k, h] of this.w.posts.held) if (h.charId === p.charId) this.w.posts.held.delete(k);
      if (!r.rows.length) return [];
      await q.query("UPDATE cyberware_instances SET location='lost', history = history || $2::jsonb WHERE character_id=$1 AND location IN ('inventory','installed')", [p.charId, JSON.stringify([{ at: new Date().toISOString(), event: 'perdido con la muerte de su portador' }])]);
      const refunds = await this.bounties.expireForCharTx(q, p.charId);
      const jobs = await q.query<any>('SELECT count(*)::int AS n FROM job_log WHERE character_id=$1', [p.charId]);
      const ctr = await q.query<any>("SELECT count(*)::int AS n FROM contract_progress WHERE character_id=$1 AND state='completed'", [p.charId]);
      summary = {
        name: p.name, role: this.w.c.roles.find((x) => x.id === p.role)?.name ?? p.role, profession: this.w.c.professions.find((x) => x.id === p.profession)?.name ?? p.profession,
        level: p.level, cause: killer ? `${cause} (${killer.name})` : cause, place, money: p.money, minutesAlive: Math.round((Date.now() - new Date(r.rows[0].created_at).getTime()) / 60000),
        jobs: jobs.rows[0].n, contracts: ctr.rows[0].n,
      };
      await q.query('INSERT INTO memorial (id, account_id, character_id, summary) VALUES ($1,$2,$3,$4) ON CONFLICT (character_id) DO NOTHING', [randomUUID(), p.accountId, p.charId, JSON.stringify(summary)]);
      return refunds;
    });
    for (const rf of refunds) { const oc = this.connOf(rf.placedBy); if (oc?.p) { oc.p.money += rf.amount; this.notice(oc, 'info', `${p.name} ha muerto sin que nadie cobrara tu recompensa: te devuelven ${rf.amount} €$.`); this.sheet(oc); } }
    this.w.metrics.inc('deaths');
    const c = e.conn;
    if (c && summary) { this.w.send(c, { t: 'death', summary }); }
    // La vida ha terminado: la sesión deja de simularla ya (la entidad se retira tras un instante para que se vea caer).
    if (c && this.w.conns.get(c.accountId) === c) this.w.conns.delete(c.accountId);
    for (const o of e.zone.query(e.x, e.y, 20)) if (o.kind === 'player' && o.conn && o !== e) this.notice(o.conn, 'bad', `${p.name} ha muerto (${cause}).`);
    setTimeout(() => this.w.removeDead(p, e), 1500);
  }

  // ================================================================ recompensas (las agresiones viven en combat.ts)
  async addWanted(c: PlayerConn, amount: number, why: string) {
    const p = c.p!;
    const before = p.wanted;
    p.wanted = Math.min(5, p.wanted + amount);
    if (Math.floor(p.wanted) > Math.floor(before)) this.notice(c, 'warn', `Nivel de búsqueda ${Math.floor(p.wanted)} (${why}).`);
    if (p.wanted >= 2) {
      const amt = 150 * Math.floor(p.wanted);
      const pcv = this.bounties.onPlayer(p.charId).filter((b) => b.poster === 'pcv');
      if (!pcv.length || pcv[0].amount < amt) {
        if (pcv.length) await this.bounties.cancel(pcv.map((b) => b.id));
        await this.bounties.post('player', { charId: p.charId, name: p.name }, amt, 'pcv', `Orden de búsqueda: ${why}`);
        this.notice(c, 'bad', `La PCV pone precio a tu cabeza: ${amt} €$.`);
        this.updateMarker(c.e!);
      }
    }
  }

  updateMarker(e: Entity) {
    const tp = this.w.playerOf(e);
    const amt = tp ? this.bounties.totalOnPlayer(tp.charId) : e.fugitive ? this.bounties.totalOnNpc(e.fugitive.id) : 0;
    if (e.bounty !== amt) { e.bounty = amt; this.bump(e); }
  }

  bountyView(p: PlayerState): BountyView {
    const active = [...this.bounties.active.values()].map((b) => {
      let zone: string | undefined, online: boolean | undefined;
      if (b.kind === 'player' && b.targetChar) { const oc = this.connOf(b.targetChar); online = !!oc; zone = oc?.e?.zone.def.name; }
      if (b.kind === 'npc') { const f = this.w.c.fugitives.find((x) => x.id === b.targetNpc); zone = f ? this.w.zones.get(f.zone)?.def.name : undefined; }
      return { id: b.id, targetName: b.targetName, kind: b.kind, amount: b.amount, poster: b.poster === 'particular' ? 'Particular' : this.w.c.factions.find((f) => f.id === b.poster)?.name ?? b.poster, reason: b.reason, zone, online, mine: b.placedBy === p.charId, onMe: b.targetChar === p.charId, aliveOnly: b.aliveOnly };
    }).sort((a, b) => b.amount - a.amount);
    const targets: BountyView['targets'] = [];
    for (const c of this.w.conns.values()) if (c.p && c.p.charId !== p.charId) targets.push({ kind: 'player', id: c.p.name, name: `${c.p.name} (jugador)` });
    for (const f of this.w.c.fugitives) targets.push({ kind: 'npc', id: f.id, name: `${f.name} (fugitivo)` });
    return { money: p.money, active, targets };
  }

  async placeBounty(c: PlayerConn, m: Extract<ClientMsg, { t: 'bountyPlace' }>) {
    const p = c.p!;
    let target: { charId?: string; npc?: string; name: string };
    if (m.kind === 'player') {
      const r = await this.w.db.query<any>("SELECT id, name FROM characters WHERE lower(name) = lower($1) AND status <> 'dead'", [m.target.trim()]);
      if (!r.rows.length) throw new GameError('No hay ningún personaje vivo con ese nombre.');
      target = { charId: r.rows[0].id, name: r.rows[0].name };
    } else {
      const f = this.w.c.fugitives.find((x) => x.id === m.target);
      if (!f) throw new GameError('Solo puedes poner recompensas a fugitivos entre los PNJ.');
      target = { npc: f.id, name: f.name };
    }
    const reason = m.reason.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120);
    await this.bounties.place(p, m.kind, target, m.amount, reason, m.opId, m.aliveOnly);
    this.notice(c, 'good', `Recompensa publicada: ${m.amount} €$ por ${target.name}.`);
    this.sheet(c);
    if (target.charId) {
      const tc = this.connOf(target.charId);
      if (tc) { this.notice(tc, 'bad', `Alguien ha puesto precio a tu cabeza: ${m.amount} €$ («${reason}»).`); this.updateMarker(tc.e!); }
    } else for (const e of this.w.entities.values()) if (e.fugitive?.id === target.npc) this.updateMarker(e);
    this.w.send(c, { t: 'bounties', view: this.bountyView(p) });
  }

  scheduleFugitive(id: string) { this.fugitiveRespawn.set(id, Date.now() + 3 * this.w.c.manifest.cityHourMs); }
  private async spawnFugitive(f: FugitiveDef) {
    const z = this.w.zones.get(f.zone);
    if (!z) return;
    if (!this.bounties.onNpc(f.id).length) await this.bounties.post('npc', { npc: f.id, name: f.name }, f.bounty, f.poster, f.alive ? `${f.crime} (lo quieren VIVO)` : f.crime, f.alive);
    const pos = nearestWalkable(z.grid, f.area[0] + 0.5, f.area[1] + 0.5, 4) ?? { x: z.def.safePoint[0] + 0.5, y: z.def.safePoint[1] + 0.5 };
    const e = this.w.spawnNpc(z, { name: f.name, title: 'Fugitivo', x: pos.x, y: pos.y, appearance: f.appearance, label: `Buscado: ${f.crime}`, speed: 2.4 });
    e.fugitive = f; e.npcHp = f.hp; e.npcMax = f.hp; e.defense = f.defense; e.weaponId = f.weapon; e.npcType = 'fugitive'; e.dialog = undefined; e.chrome = ['ojos']; e.level = Math.min(25, 6 + Math.floor(f.bounty / 100));
    e.npc = ambientBrain(this.w.cfg.seed + e.id, [f.area[0], f.area[1]], f.area[2]);
    this.updateMarker(e);
  }

  /** Ponerse o quitarse una prenda: cambia el aspecto, el blindaje y las mejoras. */
  wear(c: PlayerConn, slot: string, item: string | null) {
    const p = c.p!, e = c.e!;
    if (!['cabeza', 'cara', 'torso_ext', 'torso_int', 'piernas', 'pies'].includes(slot)) throw new GameError('Hueco de ropa desconocido.');
    if (item === null) { delete p.wear[slot]; }
    else {
      const def = this.w.c.items.find((i) => i.id === item);
      if (!def?.wear) throw new GameError('Eso no se puede poner.');
      if (def.wear.slot !== slot) throw new GameError('Esa prenda va en otro sitio.');
      if ((p.inventory.get(item) ?? 0) < 1) throw new GameError('No la tienes.');
      p.wear[slot] = item;
    }
    e.appearance = wornAppearance(this.w.c, p); this.bump(e);
    void savePlayerVitals(this.w.db, p).catch(() => {});
    this.sheet(c);
  }

  equip(c: PlayerConn, item: string | null) {
    const p = c.p!;
    if (item === null) { p.equipped = null; this.notice(c, 'info', 'Vas con los puños.'); this.sheet(c); return; }
    const def = this.w.c.items.find((i) => i.id === item);
    const ef = effective(this.w.c, p);
    if (!def?.weapon) throw new GameError('Eso no es un arma.');
    if ((p.inventory.get(item) ?? 0) < 1 && !ef.integrated.includes(item)) throw new GameError('No tienes esa arma.');
    p.equipped = item;
    this.notice(c, 'info', `Empuñas ${def.name}.`);
    this.sheet(c);
  }

  // ================================================================ tiendas, mercado, basura
  openShop(c: PlayerConn, shop: string, source: Entity) {
    this.x(c).openShop = { shop, entity: source.id };
    this.w.send(c, { t: 'shop', view: this.market.shopView(shop, c.p!) });
  }
  private checkShop(c: PlayerConn, shop: string) {
    const o = this.x(c).openShop;
    const src = o && this.w.entities.get(o.entity);
    if (!o || o.shop !== shop || !src || src.zone !== c.e!.zone || Math.hypot(src.x - c.e!.x, src.y - c.e!.y) > SHOP_RANGE) throw new GameError('Tienes que estar en la tienda.');
  }
  async buy(c: PlayerConn, m: Extract<ClientMsg, { t: 'buy' }>) {
    this.checkShop(c, m.shop);
    const r = await this.market.buy(c.p!, m.shop, m.item, m.qty, m.opId);
    this.w.progress.gain(c.p!, 'negociacion', 2);
    this.notice(c, 'good', `Compras ${m.qty > 1 ? `${m.qty}× ` : ''}${r.name} por ${r.total} €$.`);
    this.sheet(c);
    this.w.send(c, { t: 'shop', view: this.market.shopView(m.shop, c.p!) });
  }
  async sell(c: PlayerConn, m: Extract<ClientMsg, { t: 'sell' }>) {
    this.checkShop(c, m.shop);
    const r = await this.market.sell(c.p!, m.shop, m.item, m.qty, m.opId);
    this.w.progress.gain(c.p!, 'negociacion', 2);
    for (const [slot, id] of Object.entries(c.p!.wear)) if (id === m.item && (c.p!.inventory.get(m.item) ?? 0) <= 0) { delete c.p!.wear[slot]; c.e!.appearance = wornAppearance(this.w.c, c.p!); this.bump(c.e!); }
    this.notice(c, 'good', `Vendes ${r.name} por ${r.total} €$.`);
    this.sheet(c);
    this.w.send(c, { t: 'shop', view: this.market.shopView(m.shop, c.p!) });
  }
  async steal(c: PlayerConn, m: Extract<ClientMsg, { t: 'steal' }>) {
    this.checkShop(c, m.shop);
    const p = c.p!;
    const r = await this.market.steal(p, m.shop, m.item, m.opId);
    this.w.progress.gain(p, 'sigilo', r.success ? 6 : 2);
    if (r.success) { this.notice(c, 'good', `✔ Te llevas ${r.name} sin pagar (tirada ${r.total} contra ${r.dv}).`); await this.addWanted(c, 0.3, 'hurto'); }
    else {
      const dmg = 5 + Math.floor(this.rng() * 8);
      p.hp -= dmg;
      this.notice(c, 'bad', `✘ Te pillan robando ${r.name} (tirada ${r.total} contra ${r.dv}): el vigilante te zarandea (−${dmg} de salud).`);
      await this.addWanted(c, 1.2, 'hurto en una tienda');
      if (p.hp <= 0) this.downed(c, 'paliza de un vigilante');
    }
    this.sheet(c);
    this.w.send(c, { t: 'shop', view: this.market.shopView(m.shop, p) });
  }

  async rummage(c: PlayerConn, trash: Entity) {
    const x = this.x(c), p = c.p!;
    const until = x.rummaged.get(trash.id) ?? 0;
    if (Date.now() < until) throw new GameError('Ya has rebuscado aquí hace poco.');
    x.rummaged.set(trash.id, Date.now() + 2 * this.w.c.manifest.cityHourMs);
    this.w.progress.gain(p, 'percepcion', 2);
    const e = c.e!;
    this.w.cancelActivity(e);
    e.channel = { startTick: this.w.tick, endTick: this.w.tick + 60, label: 'Rebuscando en la basura', targetId: trash.id, apply: () => this.w.enqueue(c, async () => {
      const mods = this.w.c.professions.find((y) => y.id === p.profession)?.mods;
      const r = this.rng();
      const base = 0.5 + (mods?.rummage ?? 0);
      let found: string | null = null;
      if (r < base * 0.65) found = 'sobras';
      else if (r < base) found = 'chatarra';
      if (p.profession === 'chatarrero' && found === 'sobras' && this.rng() < 0.3) found = 'chatarra';
      if (found) {
        await this.w.db.query(`INSERT INTO inventory_items (id, character_id, def_id, qty) VALUES ($1,$2,$3,1) ON CONFLICT (character_id, def_id) DO UPDATE SET qty = inventory_items.qty + 1`, [randomUUID(), p.charId, found]);
        p.inventory.set(found, (p.inventory.get(found) ?? 0) + 1);
        this.notice(c, 'good', `Encuentras ${this.w.c.items.find((i) => i.id === found)!.name}.`);
      } else this.notice(c, 'info', 'Solo hay basura de verdad.');
      this.w.send(c, { t: 'action', text: '' });
      this.sheet(c);
    }) };
    this.w.send(c, { t: 'action', text: 'Rebuscando en la basura', duration: 3 });
  }

  // ================================================================ empleos y oficios
  private async loadCd(c: PlayerConn) {
    const x = this.x(c);
    if (x.loadedCd) return;
    x.loadedCd = true;
    const r = await this.w.db.query<any>('SELECT job_id, max(at) AS at FROM job_log WHERE character_id=$1 GROUP BY job_id', [c.p!.charId]);
    for (const row of r.rows) {
      const job = this.w.c.jobs.find((j) => j.id === row.job_id);
      if (job) x.jobCd.set(job.id, new Date(row.at).getTime() + job.cooldownGameHours * this.w.c.manifest.cityHourMs);
    }
  }
  async jobsView(c: PlayerConn): Promise<JobsView> {
    await this.loadCd(c);
    const p = c.p!, x = this.x(c), ef = effective(this.w.c, p);
    const prof = (id: string) => this.w.c.professions.find((y) => y.id === id)!;
    const jobs = this.w.c.jobs.map((j) => {
      const wp = this.w.c.workplaces.find((y) => y.id === j.workplace)!;
      const pr = prof(j.profession);
      let reason: string | undefined;
      const open = j.profession === p.profession || j.profession === 'vagabundo';
      if (!open) reason = `Requiere el oficio ${pr.name}`;
      else if (p.professionRank < j.minRank) reason = `Requiere rango ${j.minRank} en tu oficio`;
      const cd = x.jobCd.get(j.id) ?? 0;
      if (!reason && cd > Date.now()) reason = 'Turno reciente: vuelve más tarde';
      const chance = checkChance((ef.attrs as any)[pr.attr], (ef.skills[pr.skill] ?? 0) + p.professionRank, j.dv);
      return { id: j.id, title: j.title, desc: j.desc, profession: j.profession, professionName: pr.name, employer: this.w.c.factions.find((f) => f.id === j.employer)?.name ?? j.employer, place: wp.name, zone: wp.zone, zoneName: this.w.zones.get(wp.zone)?.def.name ?? wp.zone,
        seconds: j.seconds, pay: j.pay, chance, minRank: j.minRank, legal: j.legal, risk: j.risk, available: !reason, reason, cooldownMin: cd > Date.now() ? Math.ceil((cd - Date.now()) / 60000) : undefined };
    });
    return { profession: p.profession, rank: p.professionRank, xp: p.professionXp, activeJob: p.activeJob, professions: this.w.c.professions.map((y) => ({ id: y.id, name: y.name, kind: y.kind, desc: y.desc, perk: y.perk })), jobs };
  }
  async jobAccept(c: PlayerConn, jobId: string) {
    const v = await this.jobsView(c);
    const j = v.jobs.find((y) => y.id === jobId);
    if (!j) throw new GameError('Ese empleo no existe.');
    if (!j.available) throw new GameError(j.reason ?? 'No disponible.');
    c.p!.activeJob = jobId;
    this.notice(c, 'info', `Empleo aceptado: ${j.title} (${j.place}, ${j.zoneName}). Ve allí y pulsa «Empezar turno».`);
    this.sheet(c);
  }
  async jobStart(c: PlayerConn) {
    const p = c.p!, e = c.e!;
    if (!p.activeJob) throw new GameError('No tienes ningún empleo aceptado.');
    if (p.sleeping) this.wake(c);
    const job = this.w.c.jobs.find((j) => j.id === p.activeJob)!;
    const wp = this.w.c.workplaces.find((y) => y.id === job.workplace)!;
    if (e.zone.id !== wp.zone) { const z = this.w.zones.get(wp.zone); throw new GameError(`Tu puesto está en ${z ? (z.def.districts.length ? `${this.w.property.dname(this.w.districtOf(z, wp.at[0], wp.at[1]))} (${wp.name})` : z.def.name) : wp.zone}: ve allí primero.`); }
    this.w.cancelActivity(e);
    e.task = { def: { id: `job:${job.id}`, label: job.title, repeat: 1, steps: [{ moveTo: wp.at as [number, number], zone: wp.zone }, { wait: Math.max(0.5, job.seconds * this.w.cfg.jobTimeScale), label: `Trabajando: ${job.title}` }], onComplete: [] },
      step: 0, rep: 0, waitUntil: 0, started: false, opId: `job-${randomUUID()}`, onDone: () => this.w.enqueue(c, () => this.finishJob(c, job.id)) } as RunningTask;
    this.notice(c, 'info', `Turno empezado: ${job.title}. Tu personaje va al puesto y trabaja solo (${job.seconds} s). Cualquier clic lo interrumpe sin cobrar.`);
  }
  private async finishJob(c: PlayerConn, jobId: string) {
    const p = c.p!, x = this.x(c);
    const job = this.w.c.jobs.find((j) => j.id === jobId)!;
    const pr = this.w.c.professions.find((y) => y.id === job.profession)!;
    const ef = effective(this.w.c, p);
    const roll = 1 + Math.floor(this.rng() * 10);
    const total = (ef.attrs as any)[pr.attr] + (ef.skills[pr.skill] ?? 0) + p.professionRank + roll;
    const ok = total >= job.dv;
    let pay = Math.round(job.pay * (ok ? 1 : 0.5) * (1 + 0.05 * p.professionRank) * (p.profession === 'camarero' && job.profession === 'camarero' ? 1.1 : 1));
    const lines = [`Tirada: ${roll} + ${pr.attr} ${(ef.attrs as any)[pr.attr]} + ${pr.skill} ${ef.skills[pr.skill] ?? 0} + rango ${p.professionRank} = ${total} contra ${job.dv} → ${ok ? 'buen trabajo' : 'trabajo flojo (50 %)'}`];
    let injury = 0, wanted = 0;
    if (this.rng() < job.risk) {
      if (job.legal) { injury = 5 + Math.floor(this.rng() * 11); lines.push(`Te has hecho daño en el turno: −${injury} de salud.`); }
      else { wanted = 1; lines.push('Alguien te ha visto: sube tu nivel de búsqueda.'); }
    }
    const opId = `job-${randomUUID()}`;
    const xpGain = ok ? 3 : 1;
    const newXp = p.professionXp + (job.profession === p.profession ? xpGain : 0);
    let rank = p.professionRank;
    while (rank + 1 < PROF_RANKS.length && newXp >= PROF_RANKS[rank + 1]) rank++;
    await this.w.db.tx(async (q) => {
      await q.query('INSERT INTO job_log (op_id, character_id, job_id, pay, result) VALUES ($1,$2,$3,$4,$5)', [opId, p.charId, job.id, pay, JSON.stringify({ ok, roll, total })]);
      await q.query('INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,$3,$4,$5)', [`${opId}:pay`, p.charId, pay, p.money + pay, `Paga: ${job.title} (${this.w.c.factions.find((f) => f.id === job.employer)?.name ?? job.employer})`]);
      await q.query('UPDATE characters SET money = money + $2, profession_xp = $3, profession_rank = $4, active_job = NULL WHERE id = $1', [p.charId, pay, newXp, rank]);
    });
    p.money += pay; p.professionXp = newXp; p.activeJob = null;
    this.w.progress.gain(p, pr.skill, ok ? 8 : 3);
    if (rank > p.professionRank) { lines.push(`¡Asciendes a rango ${rank} como ${pr.name}!`); p.professionRank = rank; }
    if (injury) { p.hp -= injury; if (p.hp <= 0) this.downed(c, `accidente laboral (${job.title})`); }
    x.jobCd.set(job.id, Date.now() + job.cooldownGameHours * this.w.c.manifest.cityHourMs);
    const effects: any[] = [{ rep: job.employer, delta: 1 }, { xp: ok ? 15 : 5 }];
    if (p.profession === 'periodista' || p.profession === 'musico') effects.push({ rep: 'calle', delta: 1 });
    try { await this.w.effects.apply(p, effects, { opId: `${opId}:rep`, kind: 'job' }); } catch {}
    if (wanted) await this.addWanted(c, wanted, `trabajo ilegal: ${job.title}`);
    this.w.send(c, { t: 'reward', title: `Turno terminado: ${job.title}`, lines: [`+${pay} €$`, ...lines] });
    this.w.send(c, { t: 'action', text: '' });
    this.sheet(c);
  }
  async changeProfession(c: PlayerConn, prof: string, opId: string) {
    const p = c.p!;
    if (!this.w.c.professions.some((x) => x.id === prof)) throw new GameError('Oficio desconocido.');
    if (p.profession === prof) throw new GameError('Ya tienes ese oficio.');
    const r = await this.w.db.query<any>("SELECT value, expires_at FROM character_flags WHERE character_id=$1 AND key='cambio_oficio' AND expires_at > now()", [p.charId]);
    if (r.rows.length) throw new GameError('Ya cambiaste de oficio hace poco: espera un día de juego.');
    await this.w.db.tx(async (q) => {
      await q.query('UPDATE characters SET profession=$2, profession_rank=0, profession_xp=0, active_job=NULL WHERE id=$1', [p.charId, prof]);
      await q.query(`INSERT INTO character_flags (character_id, key, value, expires_at) VALUES ($1,'cambio_oficio','true', now() + make_interval(secs => $2))
        ON CONFLICT (character_id, key) DO UPDATE SET value=EXCLUDED.value, expires_at=EXCLUDED.expires_at`, [p.charId, (24 * this.w.c.manifest.cityHourMs) / 1000]);
      await q.query('INSERT INTO ops (op_id, character_id, kind, result) VALUES ($1,$2,$3,$4)', [opId, p.charId, 'profession', JSON.stringify({ prof })]);
    });
    p.profession = prof; p.professionRank = 0; p.professionXp = 0; p.activeJob = null;
    this.notice(c, 'good', `Ahora trabajas como ${this.w.c.professions.find((x) => x.id === prof)!.name}.`);
    this.sheet(c);
    this.w.send(c, { t: 'jobs', view: await this.jobsView(c) });
  }

  // ================================================================ matasanos
  openClinic(c: PlayerConn, doc: string, source: Entity) {
    this.x(c).openClinic = { doc, entity: source.id };
    this.w.send(c, { t: 'clinic', view: this.clinic.view(doc, c.p!) });
  }
  async clinicDo(c: PlayerConn, m: Extract<ClientMsg, { t: 'clinicDo' }>) {
    const o = this.x(c).openClinic;
    const src = o && this.w.entities.get(o.entity);
    if (!o || o.doc !== m.doc || !src || src.zone !== c.e!.zone || Math.hypot(src.x - c.e!.x, src.y - c.e!.y) > 4) throw new GameError('Tienes que estar en la consulta.');
    const p = c.p!;
    if (p.sleeping) this.wake(c);
    const r = await this.clinic.operate(p, m.doc, m.action, m.source, m.ref, m.opId);
    if (r.outcome === 'death') {
      this.w.send(c, { t: 'reward', title: 'La operación ha salido mal', lines: r.lines });
      await this.die(p, c.e!, r.cause!);
      return;
    }
    if (m.action === 'install') this.w.progress.gain(c.p!, 'filo', 12);
    this.w.send(c, { t: 'reward', title: r.outcome === 'clean' ? `Operación limpia: ${r.def.name}` : `Operación con complicaciones: ${r.def.name}`, lines: r.lines });
    this.sheet(c);
    this.w.send(c, { t: 'clinic', view: this.clinic.view(m.doc, p) });
  }
}

export function profName(c: World['c'], id: string) { return c.professions.find((x) => x.id === id)?.name ?? id; }
void t;
