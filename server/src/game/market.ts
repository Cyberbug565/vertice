// Red de mercado: las corporaciones fijan el margen de cada categoría y cada tienda ajusta por existencias.
// Las compras y ventas de los jugadores mueven el precio; la reposición y la política corporativa lo devuelven a su cauce.
import { randomUUID } from 'node:crypto';
import { checkChance, type Content, type ItemCategory, type MarketView, type ShopView } from '@vertice/shared';
import type { Db } from '../db/db.js';
import { GameError } from './effects.js';
import { effective, flagValue, type PlayerState } from './player.js';

export const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

interface StockEntry { stock: number; target: number; sold: number }

export class MarketService {
  private stock = new Map<string, Map<string, StockEntry>>();
  readonly markup = new Map<string, number>();
  private prevMarkup = new Map<string, number>();
  private soldSincePolicy = new Map<string, number>();
  bulletin: { at: string; text: string }[] = [];
  private dirty = new Set<string>();
  private lastRestockHour = -1;
  private lastPolicyHour = -1;
  private fenceCyber: { id: string; def: string }[] = [];

  constructor(private db: Db, private c: Content, private rng: () => number = Math.random) {}

  async load() {
    for (const sh of this.c.shops) {
      const m = new Map<string, StockEntry>();
      for (const [it, n] of Object.entries(sh.stock)) m.set(it, { stock: n, target: n, sold: 0 });
      this.stock.set(sh.id, m);
    }
    for (const corp of this.c.market.corps) { this.markup.set(corp.id, corp.markup); this.prevMarkup.set(corp.id, corp.markup); }
    const s = await this.db.query<any>('SELECT * FROM market_stock');
    for (const r of s.rows) { const e = this.stock.get(r.shop_id)?.get(r.item_id); if (e) { e.stock = r.stock; e.sold = r.sold_total; } }
    const p = await this.db.query<any>('SELECT * FROM corp_policy');
    for (const r of p.rows) { this.markup.set(r.corp_id, r.markup); this.prevMarkup.set(r.corp_id, r.markup); }
    const h = await this.db.query<any>('SELECT corp_id, markup, reason, at FROM price_history ORDER BY id DESC LIMIT 12');
    this.bulletin = h.rows.map((r: any) => ({ at: new Date(r.at).toISOString(), text: r.reason }));
    const fc = await this.db.query<any>("SELECT id, def_id FROM cyberware_instances WHERE location = 'shop' AND shop_id = 'perista-pachinko'");
    this.fenceCyber = fc.rows.map((r: any) => ({ id: r.id, def: r.def_id }));
    if (this.fenceCyber.length < 2) await this.refillFence();
  }

  corpOf(cat: ItemCategory, itemId?: string): string | null {
    if (cat === 'ciberware' && itemId) { const cw = this.c.cyberware.find((x) => x.id === itemId); if (cw && this.markup.has(cw.maker)) return cw.maker; }
    return this.c.market.corps.find((x) => x.categories.includes(cat))?.id ?? null;
  }
  basePrice(itemId: string): number {
    return this.c.items.find((i) => i.id === itemId)?.price ?? this.c.cyberware.find((x) => x.id === itemId)?.price ?? 0;
  }
  /** Precio de referencia fijado por la corporación (sin efecto de existencias ni tienda). */
  corpPrice(itemId: string, cat: ItemCategory): number {
    const corp = this.corpOf(cat, itemId);
    return this.basePrice(itemId) * (corp ? this.markup.get(corp)! : 1);
  }

  private factor(e: StockEntry) {
    const m = this.c.market;
    return Math.max(m.minFactor, Math.min(m.maxFactor, Math.pow(e.target / Math.max(0.5, e.stock), m.elasticity)));
  }

  discountFor(shopId: string, p?: PlayerState): number {
    const sh = this.c.shops.find((x) => x.id === shopId)!;
    let d = 0;
    if (p) {
      for (const dc of sh.discounts) if (flagValue(p, dc.flag) === true) d = Math.max(d, dc.pct / 100);
      const corp = this.c.market.corps.some((x) => x.id === sh.owner);
      const mods = this.c.professions.find((x) => x.id === p.profession)?.mods;
      if (corp && mods?.corpDiscount) d = Math.max(d, mods.corpDiscount);
    }
    return d;
  }

  price(shopId: string, itemId: string, p?: PlayerState): number {
    const sh = this.c.shops.find((x) => x.id === shopId)!;
    const e = this.stock.get(shopId)?.get(itemId);
    const cat = this.c.items.find((i) => i.id === itemId)?.category ?? 'equipo';
    const raw = this.corpPrice(itemId, cat) * sh.priceMult * (e ? this.factor(e) : 1);
    return Math.max(1, Math.round(raw * (1 - this.discountFor(shopId, p))));
  }
  sellPrice(shopId: string, itemId: string): number {
    const cat = this.c.items.find((i) => i.id === itemId)?.category ?? 'equipo';
    const e = this.stock.get(shopId)?.get(itemId);
    const f = e ? this.factor(e) : 1;
    return Math.max(1, Math.floor(this.corpPrice(itemId, cat) * this.c.market.sellRatio * Math.min(1.2, f)));
  }

  stealChance(shopId: string, p: PlayerState): number {
    const sh = this.c.shops.find((x) => x.id === shopId)!;
    const ef = effective(this.c, p);
    return checkChance(ef.attrs.DEX, ef.skills.sigilo ?? 0, sh.security, 0, ef.steal);
  }

  shopView(shopId: string, p: PlayerState): ShopView {
    const sh = this.c.shops.find((x) => x.id === shopId)!;
    const items = [...(this.stock.get(shopId) ?? new Map()).entries()].map(([it, e]) => {
      const def = this.c.items.find((i) => i.id === it)!;
      const price = this.price(shopId, it, p);
      const ref = Math.round(this.corpPrice(it, def.category) * sh.priceMult);
      return { item: it, name: def.name, desc: def.desc, category: def.category, price, base: def.price ?? 0, stock: Math.floor(e.stock), trend: ref ? Math.round(((price / (1 - this.discountFor(shopId, p)) - ref) / ref) * 100) : 0, stealChance: this.stealChance(shopId, p), discount: Math.round(this.discountFor(shopId, p) * 100) };
    });
    const sell = [...p.inventory].filter(([it, q]) => {
      if (q <= 0) return false;
      const def = this.c.items.find((i) => i.id === it);
      return def && def.category !== 'mision' && (sh.fence || sh.buys.includes(def.category));
    }).map(([it, q]) => ({ item: it, name: this.c.items.find((i) => i.id === it)!.name, qty: q, price: this.sellPrice(shopId, it) }));
    if (sh.fence) {
      for (const ci of p.cyber.filter((x) => x.location === 'inventory')) {
        const d = this.c.cyberware.find((x) => x.id === ci.def)!;
        sell.push({ item: `cyber:${ci.id}`, name: `${d.name}${ci.stolen ? ' (robado)' : ''}`, qty: 1, price: Math.floor(d.price * 0.35) });
      }
      for (const fc of this.fenceCyber) {
        const d = this.c.cyberware.find((x) => x.id === fc.def)!;
        items.push({ item: `cyber:${fc.id}`, name: `${d.name} (robado, grado ${ROMAN[d.grade - 1]})`, desc: `${d.desc} Sin factura: solo lo instalan matasanos sin escrúpulos o flexibles.`, category: 'ciberware', price: Math.round(d.price * 0.45), base: d.price, stock: 1, trend: -55, stealChance: 0, discount: 0 });
      }
    }
    const owner = this.c.factions.find((f) => f.id === sh.owner)?.name ?? sh.owner;
    return { shop: shopId, name: sh.name, owner: sh.owner, ownerName: owner, security: sh.security, fence: sh.fence, money: p.money, items, sell };
  }

  /** Compra atómica: dinero, inventario y libro económico en la misma transacción. */
  async buy(p: PlayerState, shopId: string, itemId: string, qty: number, opId: string, reasonPrefix = 'Compra') {
    if (itemId.startsWith('cyber:')) return this.buyFenceCyber(p, shopId, itemId.slice(6), opId);
    const e = this.stock.get(shopId)?.get(itemId);
    if (!e) throw new GameError('Esa tienda no vende eso.');
    if (e.stock < qty) throw new GameError('No quedan existencias suficientes.');
    const unit = this.price(shopId, itemId, p);
    const total = unit * qty;
    if (p.money < total) throw new GameError(`No tienes suficientes eurodólares (${total} €$).`);
    const name = this.c.items.find((i) => i.id === itemId)!.name;
    await this.db.tx(async (q) => {
      const dup = await q.query('SELECT 1 FROM ops WHERE op_id = $1', [opId]);
      if (dup.rows.length) throw new GameError('Operación ya procesada');
      const bal = p.money - total;
      await q.query('INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,$3,$4,$5)', [`${opId}:buy`, p.charId, -total, bal, `${reasonPrefix}: ${qty}× ${name} en ${this.c.shops.find((s) => s.id === shopId)!.name} (${unit} €$/u)`]);
      await q.query('UPDATE characters SET money = $2 WHERE id = $1', [p.charId, bal]);
      await q.query(`INSERT INTO inventory_items (id, character_id, def_id, qty) VALUES ($1,$2,$3,$4) ON CONFLICT (character_id, def_id) DO UPDATE SET qty = inventory_items.qty + EXCLUDED.qty`, [randomUUID(), p.charId, itemId, qty]);
      await q.query('INSERT INTO ops (op_id, character_id, kind, result) VALUES ($1,$2,$3,$4)', [opId, p.charId, 'buy', JSON.stringify({ shopId, itemId, qty, total })]);
    });
    p.money -= total;
    p.inventory.set(itemId, (p.inventory.get(itemId) ?? 0) + qty);
    e.stock -= qty; e.sold += qty;
    this.noteSale(itemId, qty);
    this.dirty.add(`${shopId}|${itemId}`);
    return { total, unit, name };
  }

  private async buyFenceCyber(p: PlayerState, shopId: string, instId: string, opId: string) {
    const fc = this.fenceCyber.find((x) => x.id === instId);
    if (!fc || shopId !== 'perista-pachinko') throw new GameError('Ese implante ya no está a la venta.');
    const d = this.c.cyberware.find((x) => x.id === fc.def)!;
    const total = Math.round(d.price * 0.45);
    if (p.money < total) throw new GameError(`No tienes suficientes eurodólares (${total} €$).`);
    await this.db.tx(async (q) => {
      const dup = await q.query('SELECT 1 FROM ops WHERE op_id = $1', [opId]);
      if (dup.rows.length) throw new GameError('Operación ya procesada');
      const r = await q.query("UPDATE cyberware_instances SET location='inventory', character_id=$2, shop_id=NULL, history = history || $3::jsonb WHERE id=$1 AND location='shop' RETURNING id",
        [instId, p.charId, JSON.stringify([{ at: new Date().toISOString(), event: 'comprado al perista', by: p.name }])]);
      if (!r.rows.length) throw new GameError('Otra persona lo ha comprado antes.');
      await q.query('INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,$3,$4,$5)', [`${opId}:buy`, p.charId, -total, p.money - total, `Compra al perista: ${d.name} (robado)`]);
      await q.query('UPDATE characters SET money = money - $2 WHERE id = $1', [p.charId, total]);
      await q.query('INSERT INTO ops (op_id, character_id, kind, result) VALUES ($1,$2,$3,$4)', [opId, p.charId, 'buy', JSON.stringify({ instId })]);
    });
    p.money -= total;
    p.cyber.push({ id: instId, def: fc.def, location: 'inventory', stolen: true });
    this.fenceCyber = this.fenceCyber.filter((x) => x.id !== instId);
    return { total, unit: total, name: d.name };
  }

  async sell(p: PlayerState, shopId: string, itemId: string, qty: number, opId: string) {
    const sh = this.c.shops.find((x) => x.id === shopId)!;
    if (itemId.startsWith('cyber:')) {
      if (!sh.fence) throw new GameError('Aquí no compran implantes.');
      const inst = p.cyber.find((x) => x.id === itemId.slice(6) && x.location === 'inventory');
      if (!inst) throw new GameError('No tienes ese implante suelto.');
      const d = this.c.cyberware.find((x) => x.id === inst.def)!;
      const total = Math.floor(d.price * 0.35);
      await this.db.tx(async (q) => {
        const dup = await q.query('SELECT 1 FROM ops WHERE op_id = $1', [opId]);
        if (dup.rows.length) throw new GameError('Operación ya procesada');
        const r = await q.query("UPDATE cyberware_instances SET location='shop', shop_id=$2, character_id=NULL, stolen=true, history = history || $3::jsonb WHERE id=$1 AND character_id=$4 AND location='inventory' RETURNING id",
          [inst.id, shopId, JSON.stringify([{ at: new Date().toISOString(), event: 'vendido al perista', by: p.name }]), p.charId]);
        if (!r.rows.length) throw new GameError('No tienes ese implante suelto.');
        await q.query('INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,$3,$4,$5)', [`${opId}:sell`, p.charId, total, p.money + total, `Venta al perista: ${d.name}`]);
        await q.query('UPDATE characters SET money = money + $2 WHERE id = $1', [p.charId, total]);
        await q.query('INSERT INTO ops (op_id, character_id, kind, result) VALUES ($1,$2,$3,$4)', [opId, p.charId, 'sell', JSON.stringify({ inst: inst.id })]);
      });
      p.money += total;
      p.cyber = p.cyber.filter((x) => x.id !== inst.id);
      this.fenceCyber.push({ id: inst.id, def: inst.def });
      return { total, name: d.name };
    }
    const def = this.c.items.find((i) => i.id === itemId);
    if (!def || def.category === 'mision' || !(sh.fence || sh.buys.includes(def.category))) throw new GameError('Aquí no compran eso.');
    if ((p.inventory.get(itemId) ?? 0) < qty) throw new GameError('No tienes tantas unidades.');
    const unit = this.sellPrice(shopId, itemId);
    const total = unit * qty;
    await this.db.tx(async (q) => {
      const dup = await q.query('SELECT 1 FROM ops WHERE op_id = $1', [opId]);
      if (dup.rows.length) throw new GameError('Operación ya procesada');
      const r = await q.query('UPDATE inventory_items SET qty = qty - $3 WHERE character_id=$1 AND def_id=$2 AND qty >= $3 RETURNING qty', [p.charId, itemId, qty]);
      if (!r.rows.length) throw new GameError('No tienes tantas unidades.');
      await q.query('INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,$3,$4,$5)', [`${opId}:sell`, p.charId, total, p.money + total, `Venta: ${qty}× ${def.name} en ${sh.name} (${unit} €$/u)`]);
      await q.query('UPDATE characters SET money = money + $2 WHERE id = $1', [p.charId, total]);
      await q.query('INSERT INTO ops (op_id, character_id, kind, result) VALUES ($1,$2,$3,$4)', [opId, p.charId, 'sell', JSON.stringify({ shopId, itemId, qty, total })]);
    });
    p.money += total;
    p.inventory.set(itemId, (p.inventory.get(itemId) ?? 0) - qty);
    // La mercancía vendida entra en la oferta de la tienda y abarata el precio.
    let e = this.stock.get(shopId)!.get(itemId);
    if (!e) { e = { stock: 0, target: Math.max(4, qty), sold: 0 }; this.stock.get(shopId)!.set(itemId, e); }
    e.stock = Math.min(e.target * 3, e.stock + qty);
    this.dirty.add(`${shopId}|${itemId}`);
    return { total, name: def.name };
  }

  /** Robo: sin pago, con tirada contra la seguridad de la tienda. Devuelve el resultado; el llamador aplica consecuencias. */
  async steal(p: PlayerState, shopId: string, itemId: string, opId: string): Promise<{ success: boolean; roll: number; total: number; dv: number; name: string }> {
    const sh = this.c.shops.find((x) => x.id === shopId)!;
    const e = this.stock.get(shopId)?.get(itemId);
    if (!e || e.stock < 1) throw new GameError('No hay nada de eso que robar.');
    const ef = effective(this.c, p);
    const roll = 1 + Math.floor(this.rng() * 10);
    const total = ef.attrs.DEX + (ef.skills.sigilo ?? 0) + ef.steal + roll;
    const success = total >= sh.security;
    const name = this.c.items.find((i) => i.id === itemId)!.name;
    await this.db.tx(async (q) => {
      const dup = await q.query('SELECT 1 FROM ops WHERE op_id = $1', [opId]);
      if (dup.rows.length) throw new GameError('Operación ya procesada');
      if (success) await q.query(`INSERT INTO inventory_items (id, character_id, def_id, qty) VALUES ($1,$2,$3,1) ON CONFLICT (character_id, def_id) DO UPDATE SET qty = inventory_items.qty + 1`, [randomUUID(), p.charId, itemId]);
      await q.query('INSERT INTO incidents (kind, actor_char, zone, detail) VALUES ($1,$2,$3,$4)', [success ? 'hurto' : 'hurto_fallido', p.charId, p.zone, JSON.stringify({ shopId, itemId, roll, total, dv: sh.security })]);
      await q.query('INSERT INTO ops (op_id, character_id, kind, result) VALUES ($1,$2,$3,$4)', [opId, p.charId, 'steal', JSON.stringify({ success })]);
    });
    if (success) { p.inventory.set(itemId, (p.inventory.get(itemId) ?? 0) + 1); e.stock -= 1; this.dirty.add(`${shopId}|${itemId}`); }
    return { success, roll, total, dv: sh.security, name };
  }

  private noteSale(itemId: string, qty: number) {
    const cat = this.c.items.find((i) => i.id === itemId)?.category;
    if (!cat) return;
    const corp = this.corpOf(cat, itemId);
    if (corp) this.soldSincePolicy.set(corp, (this.soldSincePolicy.get(corp) ?? 0) + qty);
  }

  /** Reposición horaria y política corporativa periódica. Devuelve avisos para difundir. */
  async tick(gameHour: number): Promise<string[]> {
    const h = Math.floor(gameHour);
    const out: string[] = [];
    if (h !== this.lastRestockHour) {
      if (this.lastRestockHour >= 0) {
        for (const [shopId, m] of this.stock) for (const [it, e] of m) {
          if (e.stock < e.target) { e.stock = Math.min(e.target, e.stock + Math.max(1, e.target * this.c.market.restockPerGameHour)); this.dirty.add(`${shopId}|${it}`); }
          else if (e.stock > e.target) { e.stock = Math.max(e.target, e.stock - e.target * 0.05); this.dirty.add(`${shopId}|${it}`); }
        }
      }
      this.lastRestockHour = h;
    }
    const every = this.c.market.policyEveryGameHours;
    const slot = Math.floor(h / every);
    if (slot !== this.lastPolicyHour) {
      if (this.lastPolicyHour >= 0) out.push(...(await this.policy()));
      this.lastPolicyHour = slot;
    }
    await this.flush();
    return out;
  }

  /** Las corporaciones revisan sus márgenes según la demanda acumulada y su propia estrategia. */
  async policy(): Promise<string[]> {
    const out: string[] = [];
    for (const corp of this.c.market.corps) {
      const sold = this.soldSincePolicy.get(corp.id) ?? 0;
      const expected = 6;
      const pressure = Math.max(-1, Math.min(1.5, (sold - expected) / Math.max(expected, 1)));
      const old = this.markup.get(corp.id)!;
      const nu = Math.max(corp.minMarkup, Math.min(corp.maxMarkup, old * (1 + corp.volatility * pressure + (this.rng() - 0.5) * corp.volatility)));
      const rounded = Math.round(nu * 1000) / 1000;
      this.prevMarkup.set(corp.id, old);
      this.markup.set(corp.id, rounded);
      this.soldSincePolicy.set(corp.id, 0);
      const pct = Math.round((rounded / old - 1) * 100);
      const name = this.c.factions.find((f) => f.id === corp.id)?.name ?? corp.id;
      const cats = corp.categories.join(', ');
      const text = pct === 0 ? `${name} mantiene sus precios de ${cats}.` : `${name} ${pct > 0 ? 'sube' : 'baja'} un ${Math.abs(pct)} % los precios de ${cats}${sold > expected ? ' por la alta demanda' : sold < expected / 2 ? ' por la baja demanda' : ''}.`;
      out.push(text);
      this.bulletin.unshift({ at: new Date().toISOString(), text });
      await this.db.query(`INSERT INTO corp_policy (corp_id, markup, note, updated_at) VALUES ($1,$2,$3, now()) ON CONFLICT (corp_id) DO UPDATE SET markup=EXCLUDED.markup, note=EXCLUDED.note, updated_at=now()`, [corp.id, rounded, text]);
      await this.db.query('INSERT INTO price_history (corp_id, markup, reason) VALUES ($1,$2,$3)', [corp.id, rounded, text]);
    }
    this.bulletin = this.bulletin.slice(0, 12);
    if (this.rng() < 0.5) await this.refillFence();
    return out;
  }

  private async refillFence() {
    const pool = this.c.ripperdocs.flatMap((d) => d.stolenStock);
    while (this.fenceCyber.length < 3 && pool.length) {
      const def = pool[Math.floor(this.rng() * pool.length)];
      const id = randomUUID();
      await this.db.query("INSERT INTO cyberware_instances (id, def_id, location, shop_id, stolen, history) VALUES ($1,$2,'shop','perista-pachinko',true,$3)",
        [id, def, JSON.stringify([{ at: new Date().toISOString(), event: 'llega a la trastienda del perista sin factura' }])]);
      this.fenceCyber.push({ id, def });
    }
  }

  async flush() {
    if (!this.dirty.size) return;
    const keys = [...this.dirty]; this.dirty.clear();
    for (const k of keys) {
      const [shopId, it] = k.split('|');
      const e = this.stock.get(shopId)?.get(it);
      if (!e) continue;
      await this.db.query(`INSERT INTO market_stock (shop_id, item_id, stock, target, sold_total) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (shop_id, item_id) DO UPDATE SET stock=EXCLUDED.stock, target=EXCLUDED.target, sold_total=EXCLUDED.sold_total`, [shopId, it, e.stock, e.target, e.sold]);
    }
  }

  /** Busca la tienda más barata con existencias de una categoría (para la autonomía de necesidades). */
  cheapestIn(shopIds: string[], cat: ItemCategory, p: PlayerState, need: 'hunger' | 'thirst'): { shop: string; item: string; price: number } | null {
    let best: { shop: string; item: string; price: number; score: number } | null = null;
    for (const sid of shopIds) for (const [it, e] of this.stock.get(sid) ?? []) {
      const def = this.c.items.find((i) => i.id === it)!;
      if (def.category !== cat || e.stock < 1 || !def.consumable) continue;
      const price = this.price(sid, it, p);
      if (price > p.money) continue;
      const gain = -(def.consumable[need] ?? 0);
      if (gain <= 0) continue;
      const score = price / gain;
      if (!best || score < best.score) best = { shop: sid, item: it, price, score };
    }
    return best;
  }

  view(): MarketView {
    const corps = this.c.market.corps.map((corp) => ({
      id: corp.id, name: this.c.factions.find((f) => f.id === corp.id)?.name ?? corp.id, motto: corp.motto, categories: corp.categories,
      markup: this.markup.get(corp.id)!, trend: Math.round(((this.markup.get(corp.id)! / (this.prevMarkup.get(corp.id) ?? 1)) - 1) * 100),
    }));
    const items = new Set<string>();
    for (const m of this.stock.values()) for (const it of m.keys()) items.add(it);
    const table = [...items].map((it) => {
      const def = this.c.items.find((i) => i.id === it)!;
      const prices = [...this.stock.entries()].filter(([, m]) => m.has(it)).map(([sid, m]) => ({ shop: sid, shopName: this.c.shops.find((s) => s.id === sid)!.name, price: this.price(sid, it), stock: Math.floor(m.get(it)!.stock) }));
      return { item: it, name: def.name, category: def.category, base: def.price ?? 0, prices };
    }).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    return { corps, bulletin: this.bulletin, table, nextPolicyInMin: 0 };
  }

  /** Solo para pruebas: existencias actuales. */
  stockOf(shopId: string, itemId: string) { return this.stock.get(shopId)?.get(itemId)?.stock ?? 0; }
}
