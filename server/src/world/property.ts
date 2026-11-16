// v0.4 · Propiedades: viviendas (instancias privadas con permisos y alijo), coches, viaje en coche e índices de mercado en tiempo real.
import { randomUUID } from 'node:crypto';
import type { BuildingView, DealerView, HouseDef, MarketLiveView, PropsView, RealtyView, StashView } from '@vertice/shared';
import { GameError } from '../game/effects.js';
import { buildSheet, perkMods, type PlayerState } from '../game/player.js';
import type { Entity } from './entity.js';
import type { PlayerConn, World } from './world.js';

interface Owner { charId: string; name: string; price: number; permits: string[] }
const HIST = 60;

export class Property {
  readonly owners = new Map<string, Owner>();
  readonly housing = new Map<string, number>();
  readonly carIdx = new Map<string, number>();
  private hist = new Map<string, number[]>();
  private trades: { at: number; text: string }[] = [];
  private tempPermits = new Map<string, Map<string, number>>();
  private live = new Set<PlayerConn>();
  private rng: () => number = Math.random;
  readonly houses: Map<string, HouseDef>;

  constructor(private readonly w: World) {
    this.houses = new Map(w.c.houses.map((h) => [h.id, h]));
    for (const z of new Set(w.c.houses.map((h) => h.district || h.zone))) this.housing.set(z, 1);
    for (const car of w.c.cars) this.carIdx.set(car.class, 1);
  }

  async load() {
    const r = await this.w.db.query<any>('SELECT h.house_id, h.character_id, h.price, h.permits, c.name FROM houses_owned h JOIN characters c ON c.id = h.character_id');
    for (const x of r.rows) this.owners.set(x.house_id, { charId: x.character_id, name: x.name, price: Number(x.price), permits: x.permits ?? [] });
    this.sample();
  }

  // ---------------------------------------------------------------- precios
  private discount(p?: PlayerState) {
    if (!p) return 0;
    const pm = perkMods(this.w.c, p);
    return Math.min(0.4, (pm.mods.price ?? 0) + (pm.flags.has('lengua') ? 0.1 : 0));
  }
  /** Nombre de un distrito de la ciudad única (o de una zona). */
  dname(id: string) { for (const z of this.w.c.zones) { const d = z.districts.find((x) => x.id === id); if (d) return d.name; } return this.w.c.zones.find((z) => z.id === id)?.name ?? id; }
  housePrice(h: HouseDef, p?: PlayerState) { return Math.round((h.price * (this.housing.get(h.district || h.zone) ?? 1) * (1 - this.discount(p))) / 10) * 10; }
  carPrice(carId: string, dealerId?: string, p?: PlayerState) {
    const car = this.w.c.cars.find((x) => x.id === carId)!;
    const d = dealerId ? this.w.c.dealers.find((x) => x.id === dealerId) : undefined;
    return Math.round((car.price * (this.carIdx.get(car.class) ?? 1) * (d?.priceMult ?? 1) * (1 - this.discount(p))) / 10) * 10;
  }
  private trade(text: string) { this.trades.unshift({ at: Date.now(), text }); this.trades = this.trades.slice(0, 20); }

  /** Paseo aleatorio con retorno a la media; las compras empujan el índice hacia arriba y las ventas hacia abajo. */
  hourTick() {
    for (const [k, v] of this.housing) this.housing.set(k, Math.max(0.6, Math.min(1.8, v + (1 - v) * 0.05 + (this.rng() - 0.5) * 0.04)));
    for (const [k, v] of this.carIdx) this.carIdx.set(k, Math.max(0.7, Math.min(1.5, v + (1 - v) * 0.05 + (this.rng() - 0.5) * 0.03)));
  }
  /** Guarda un punto de historia de cada índice y precio (lo llama el mundo cada pocos segundos). */
  sample() {
    const push = (k: string, v: number) => { const a = this.hist.get(k) ?? []; a.push(Math.round(v * 1000) / 1000); if (a.length > HIST) a.shift(); this.hist.set(k, a); };
    for (const [k, v] of this.housing) push(`viv:${k}`, v);
    for (const [k, v] of this.carIdx) push(`car:${k}`, v);
    const mk = this.w.survival.market;
    const cats = new Map<string, { sum: number; n: number }>();
    for (const sh of this.w.c.shops) for (const it of Object.keys(sh.stock)) {
      const def = this.w.c.items.find((i) => i.id === it);
      if (!def?.price) continue;
      const pr = mk.price(sh.id, it);
      push(`item:${sh.id}:${it}`, pr);
      const c = cats.get(def.category) ?? { sum: 0, n: 0 };
      c.sum += pr / (def.price * sh.priceMult); c.n++;
      cats.set(def.category, c);
    }
    for (const [k, v] of cats) push(`cat:${k}`, v.sum / v.n);
  }

  // ---------------------------------------------------------------- viviendas
  private near(c: PlayerConn, building: string) {
    const e = c.e!;
    const o = [...e.zone.entities].find((x) => x.objId === building);
    return !!o && Math.hypot(o.x - e.x, o.y - e.y) < 4.5;
  }
  canEnter(p: PlayerState, houseId: string) {
    const o = this.owners.get(houseId);
    if (!o) return false;
    if (o.charId === p.charId) return true;
    if (o.permits.some((n) => n.toLowerCase() === p.name.toLowerCase())) return true;
    return (this.tempPermits.get(houseId)?.get(p.charId) ?? 0) > Date.now();
  }
  buildingView(p: PlayerState, building: string): BuildingView {
    const list = this.w.c.houses.filter((h) => h.building === building);
    const obj = this.w.c.zones.flatMap((z) => z.objects.map((o) => ({ z, o }))).find((x) => x.o.id === building);
    return {
      building, name: obj?.o.name ?? building, zone: obj?.z.name ?? '',
      units: list.map((h) => { const o = this.owners.get(h.id); return { id: h.id, name: h.name, size: h.size, floor: h.floor, price: this.housePrice(h, p), owner: o ? o.name : null, mine: o?.charId === p.charId, allowed: this.canEnter(p, h.id) }; }),
    };
  }
  realtyView(p: PlayerState, filter?: string): RealtyView {
    const zn = (id: string) => this.dname(id);
    const houses = this.w.c.houses.filter((h) => !this.owners.has(h.id) && (!filter || h.district === filter || h.size === filter))
      .map((h) => ({ id: h.id, name: h.name, size: h.size, zone: h.district, zoneName: zn(h.district), price: this.housePrice(h, p), floor: h.floor }))
      .sort((a, b) => a.price - b.price).slice(0, 120);
    return { houses, index: Object.fromEntries(this.housing), mine: [...p.houses] };
  }

  async buyHouse(c: PlayerConn, houseId: string, opId: string, remote = false) {
    const p = c.p!;
    const h = this.houses.get(houseId);
    if (!h) throw new GameError('Esa vivienda no existe.');
    if (this.owners.has(houseId)) throw new GameError('Esa vivienda ya tiene dueño.');
    if (!remote && !this.near(c, h.building)) throw new GameError('Acércate al portal o cómprala en una inmobiliaria.');
    const price = this.housePrice(h, p);
    if (p.money < price) throw new GameError(`Cuesta ${price.toLocaleString('es-ES')} €$ y tienes ${p.money.toLocaleString('es-ES')}.`);
    await this.w.db.tx(async (q) => {
      const dup = await q.query('SELECT 1 FROM ops WHERE op_id = $1', [opId]);
      if (dup.rows.length) throw new GameError('Operación ya procesada');
      const bal = p.money - price;
      await q.query('INSERT INTO houses_owned (house_id, character_id, price) VALUES ($1,$2,$3)', [houseId, p.charId, price]);
      await q.query('INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,$3,$4,$5)', [`${opId}:casa`, p.charId, -price, bal, `Compra de vivienda: ${h.name}`]);
      await q.query('UPDATE characters SET money=$2 WHERE id=$1', [p.charId, bal]);
      await q.query('INSERT INTO ops (op_id, character_id, kind, result) VALUES ($1,$2,$3,$4)', [opId, p.charId, 'house', JSON.stringify({ houseId, price })]);
    });
    p.money -= price; p.houses.push(houseId);
    this.owners.set(houseId, { charId: p.charId, name: p.name, price, permits: [] });
    this.housing.set(h.district, Math.min(1.8, (this.housing.get(h.district) ?? 1) * 1.015));
    this.trade(`${p.name} compra «${h.name}» por ${price.toLocaleString('es-ES')} €$.`);
    this.w.send(c, { t: 'reward', title: 'Vivienda comprada', lines: [h.name, `${price.toLocaleString('es-ES')} €$`, 'Es tu refugio: zona protegida, cama perfecta y alijo para guardar cosas.', 'Solo entra quien tú autorices (Propiedades, tecla P).'] });
    this.w.send(c, { t: 'sheet', sheet: buildSheet(this.w.c, p) });
  }
  async sellHouse(c: PlayerConn, houseId: string, opId: string) {
    const p = c.p!;
    const h = this.houses.get(houseId);
    const o = this.owners.get(houseId);
    if (!h || o?.charId !== p.charId) throw new GameError('No es tuya.');
    if (c.e!.zone.id === `casa:${houseId}`) throw new GameError('Sal de la vivienda antes de venderla.');
    const value = Math.round(this.housePrice(h) * 0.7);
    await this.w.db.tx(async (q) => {
      const dup = await q.query('SELECT 1 FROM ops WHERE op_id = $1', [opId]);
      if (dup.rows.length) throw new GameError('Operación ya procesada');
      const bal = p.money + value;
      await q.query('DELETE FROM house_stash WHERE house_id=$1', [houseId]);
      await q.query('DELETE FROM houses_owned WHERE house_id=$1', [houseId]);
      await q.query('INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,$3,$4,$5)', [`${opId}:venta-casa`, p.charId, value, bal, `Venta de vivienda: ${h.name}`]);
      await q.query('UPDATE characters SET money=$2 WHERE id=$1', [p.charId, bal]);
      await q.query('INSERT INTO ops (op_id, character_id, kind, result) VALUES ($1,$2,$3,$4)', [opId, p.charId, 'house-sell', JSON.stringify({ houseId, value })]);
    });
    p.money += value; p.houses = p.houses.filter((x) => x !== houseId);
    this.owners.delete(houseId);
    this.housing.set(h.district, Math.max(0.6, (this.housing.get(h.district) ?? 1) * 0.99));
    this.trade(`Se pone a la venta «${h.name}» (${value.toLocaleString('es-ES')} €$ para su antiguo dueño).`);
    this.w.send(c, { t: 'notice', kind: 'good', text: `Vendes ${h.name} por ${value.toLocaleString('es-ES')} €$ (70 % del valor de mercado). Lo que había en el alijo se pierde.` });
    this.w.send(c, { t: 'sheet', sheet: buildSheet(this.w.c, p) });
  }

  async enterHouse(c: PlayerConn, houseId: string) {
    const p = c.p!;
    const h = this.houses.get(houseId);
    if (!h) throw new GameError('Esa vivienda no existe.');
    if (!this.near(c, h.building)) throw new GameError('Tienes que estar en el portal.');
    if (!this.canEnter(p, houseId)) throw new GameError(this.owners.has(houseId) ? 'No tienes permiso: llama al timbre y espera a que te abran.' : 'Está en venta. Cómprala para entrar.');
    const z = this.w.ensureZone(`casa:${houseId}`);
    if (!z) throw new GameError('No se pudo abrir la vivienda.');
    p.driving = null;
    await this.w.teleport(c, z.id, [z.def.safePoint[0], z.def.safePoint[1]]);
    this.w.send(c, { t: 'notice', kind: 'info', text: this.owners.get(houseId)!.charId === p.charId ? 'Estás en casa. Aquí nadie puede atacarte.' : `Entras en casa de ${this.owners.get(houseId)!.name}.` });
  }
  /** Punto de salida de una vivienda: delante de su portal. */
  exitOf(houseId: string): { zone: string; at: [number, number] } | null {
    const h = this.houses.get(houseId);
    if (!h) return null;
    const z = this.w.c.zones.find((x) => x.id === h.zone);
    const o = z?.objects.find((x) => x.id === h.building);
    if (!z || !o) return null;
    return { zone: z.id, at: [o.at[0], o.at[1] + 1] };
  }
  ring(c: PlayerConn, houseId: string) {
    const p = c.p!;
    const h = this.houses.get(houseId);
    const o = this.owners.get(houseId);
    if (!h || !o) throw new GameError('Nadie vive ahí.');
    if (!this.near(c, h.building)) throw new GameError('Tienes que estar en el portal.');
    const owner = [...this.w.conns.values()].find((x) => x.p?.charId === o.charId);
    if (!owner) throw new GameError(`${o.name} no está conectado. Vuelve más tarde.`);
    this.w.send(owner, { t: 'ring', house: houseId, houseName: h.name, from: p.name, fromId: c.e!.id });
    this.w.send(c, { t: 'notice', kind: 'info', text: `Llamas al timbre de ${o.name}. Espera respuesta…` });
  }
  answer(c: PlayerConn, houseId: string, who: number, allow: boolean) {
    const o = this.owners.get(houseId);
    if (o?.charId !== c.p!.charId) throw new GameError('No es tu casa.');
    const visitor = [...this.w.conns.values()].find((x) => x.e?.id === who);
    if (!visitor?.p) throw new GameError('Ya se ha ido.');
    if (allow) {
      const m = this.tempPermits.get(houseId) ?? new Map<string, number>();
      m.set(visitor.p.charId, Date.now() + 24 * this.w.c.manifest.cityHourMs);
      this.tempPermits.set(houseId, m);
    }
    this.w.send(visitor, { t: 'notice', kind: allow ? 'good' : 'bad', text: allow ? `${c.p!.name} te abre la puerta: puedes entrar durante un día de juego.` : `${c.p!.name} no te abre.` });
  }
  async permit(c: PlayerConn, houseId: string, name: string, allow: boolean) {
    const o = this.owners.get(houseId);
    if (o?.charId !== c.p!.charId) throw new GameError('No es tu casa.');
    const clean = name.trim();
    if (clean.length < 3) throw new GameError('Escribe el nombre del personaje.');
    o.permits = allow ? [...new Set([...o.permits, clean])].slice(0, 20) : o.permits.filter((n) => n.toLowerCase() !== clean.toLowerCase());
    await this.w.db.query('UPDATE houses_owned SET permits=$2 WHERE house_id=$1', [houseId, JSON.stringify(o.permits)]);
    this.w.send(c, { t: 'notice', kind: 'good', text: allow ? `${clean} puede entrar en tu casa.` : `${clean} ya no puede entrar.` });
  }

  private insideHouse(c: PlayerConn, houseId: string) {
    if (c.e!.zone.id !== `casa:${houseId}`) throw new GameError('El alijo está dentro de la vivienda.');
    if (!this.canEnter(c.p!, houseId)) throw new GameError('No tienes permiso.');
  }
  async stashView(c: PlayerConn, houseId: string): Promise<StashView> {
    this.insideHouse(c, houseId);
    const r = await this.w.db.query<any>('SELECT def_id, qty FROM house_stash WHERE house_id=$1 AND qty > 0 ORDER BY def_id', [houseId]);
    const nm = (d: string) => this.w.c.items.find((i) => i.id === d)?.name ?? d;
    return {
      house: houseId, name: this.houses.get(houseId)?.name ?? houseId,
      items: r.rows.map((x: any) => ({ def: x.def_id, name: nm(x.def_id), qty: x.qty })),
      inventory: [...c.p!.inventory].filter(([, q]) => q > 0).map(([d, q]) => ({ def: d, name: nm(d), qty: q })),
    };
  }
  async stashMove(c: PlayerConn, houseId: string, item: string, qty: number, dir: 'in' | 'out') {
    this.insideHouse(c, houseId);
    const p = c.p!;
    if (!this.w.c.items.some((i) => i.id === item)) throw new GameError('Objeto desconocido.');
    await this.w.db.tx(async (q) => {
      if (dir === 'in') {
        if ((p.inventory.get(item) ?? 0) < qty) throw new GameError('No llevas tantos.');
        await q.query('UPDATE inventory_items SET qty = qty - $3 WHERE character_id=$1 AND def_id=$2', [p.charId, item, qty]);
        await q.query('INSERT INTO house_stash (house_id, def_id, qty) VALUES ($1,$2,$3) ON CONFLICT (house_id, def_id) DO UPDATE SET qty = house_stash.qty + EXCLUDED.qty', [houseId, item, qty]);
      } else {
        const r = await q.query<any>('SELECT qty FROM house_stash WHERE house_id=$1 AND def_id=$2', [houseId, item]);
        if ((r.rows[0]?.qty ?? 0) < qty) throw new GameError('No hay tantos en el alijo.');
        await q.query('UPDATE house_stash SET qty = qty - $3 WHERE house_id=$1 AND def_id=$2', [houseId, item, qty]);
        await q.query(`INSERT INTO inventory_items (id, character_id, def_id, qty) VALUES ($1,$2,$3,$4) ON CONFLICT (character_id, def_id) DO UPDATE SET qty = inventory_items.qty + EXCLUDED.qty`, [randomUUID(), p.charId, item, qty]);
      }
    });
    p.inventory.set(item, (p.inventory.get(item) ?? 0) + (dir === 'in' ? -qty : qty));
    if (dir === 'in' && p.equipped === item && (p.inventory.get(item) ?? 0) <= 0) p.equipped = null;
    for (const [slot, id] of Object.entries(p.wear)) if (id === item && (p.inventory.get(item) ?? 0) <= 0) delete p.wear[slot];
    this.w.send(c, { t: 'stash', view: await this.stashView(c, houseId) });
    this.w.send(c, { t: 'sheet', sheet: buildSheet(this.w.c, p) });
  }

  propsView(p: PlayerState): PropsView {
    const zn = (id: string) => this.dname(id);
    return {
      houses: p.houses.map((id) => { const h = this.houses.get(id)!; const o = this.owners.get(id); return { id, name: h.name, zone: h.district, zoneName: zn(h.district), size: h.size, value: Math.round(this.housePrice(h) * 0.7), paid: o?.price ?? 0, permits: o?.permits ?? [] }; }),
      cars: p.cars.map((x) => { const d = this.w.c.cars.find((k) => k.id === x.car)!; return { id: x.id, car: x.car, name: `${d.maker} ${d.name}`, class: d.class, value: Math.round(this.carPrice(d.id) * 0.6), speed: d.speed }; }),
      driving: p.driving,
    };
  }

  // ---------------------------------------------------------------- coches
  dealerView(p: PlayerState, dealerId: string): DealerView {
    const d = this.w.c.dealers.find((x) => x.id === dealerId);
    if (!d) throw new GameError('Concesionario desconocido.');
    return {
      dealer: d.id, name: d.name, desc: d.desc,
      cars: this.w.c.cars.filter((x) => d.classes.includes(x.class)).map((x) => ({ id: x.id, name: x.name, maker: x.maker, class: x.class, speed: x.speed, trunk: x.trunk, seats: x.seats, armor: x.armor, price: this.carPrice(x.id, d.id, p), color: x.color, desc: x.desc })).sort((a, b) => a.price - b.price),
      owned: p.cars.map((x) => { const k = this.w.c.cars.find((c) => c.id === x.car)!; return { id: x.id, car: x.car, name: `${k.maker} ${k.name}`, value: Math.round(this.carPrice(k.id) * 0.6) }; }),
    };
  }
  async buyCar(c: PlayerConn, dealerId: string, carId: string, opId: string) {
    const p = c.p!;
    const d = this.w.c.dealers.find((x) => x.id === dealerId);
    const car = this.w.c.cars.find((x) => x.id === carId);
    if (!d || !car || !d.classes.includes(car.class)) throw new GameError('Ese concesionario no vende ese coche.');
    const e = c.e!;
    const desk = [...e.zone.entities].find((o) => o.dealer === dealerId);
    if (!desk || Math.hypot(desk.x - e.x, desk.y - e.y) > 5) throw new GameError('Habla con el vendedor del concesionario.');
    if (p.cars.length >= 6) throw new GameError('Tu garaje está lleno (6 vehículos).');
    const price = this.carPrice(carId, dealerId, p);
    if (p.money < price) throw new GameError(`Cuesta ${price.toLocaleString('es-ES')} €$.`);
    const id = randomUUID();
    await this.w.db.tx(async (q) => {
      const dup = await q.query('SELECT 1 FROM ops WHERE op_id = $1', [opId]);
      if (dup.rows.length) throw new GameError('Operación ya procesada');
      const bal = p.money - price;
      await q.query('INSERT INTO cars_owned (id, character_id, car_id, price) VALUES ($1,$2,$3,$4)', [id, p.charId, carId, price]);
      await q.query('INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,$3,$4,$5)', [`${opId}:coche`, p.charId, -price, bal, `Compra de vehículo: ${car.maker} ${car.name}`]);
      await q.query('UPDATE characters SET money=$2 WHERE id=$1', [p.charId, bal]);
      await q.query('INSERT INTO ops (op_id, character_id, kind, result) VALUES ($1,$2,$3,$4)', [opId, p.charId, 'car', JSON.stringify({ carId, price })]);
    });
    p.money -= price; p.cars.push({ id, car: carId });
    this.carIdx.set(car.class, Math.min(1.5, (this.carIdx.get(car.class) ?? 1) * 1.01));
    this.trade(`${p.name} se lleva un ${car.maker} ${car.name} por ${price.toLocaleString('es-ES')} €$.`);
    this.w.send(c, { t: 'reward', title: `${car.maker} ${car.name}`, lines: [`${price.toLocaleString('es-ES')} €$`, `Velocidad ×${car.speed} · maletero ${car.trunk} kg · blindaje ${car.armor}`, 'En la calle pulsa V (o el botón Conducir) para subirte.', 'Desde el mapa (M) puedes viajar en coche a otro distrito.'] });
    this.w.send(c, { t: 'sheet', sheet: buildSheet(this.w.c, p) });
  }
  async sellCar(c: PlayerConn, ownedId: string, opId: string) {
    const p = c.p!;
    const own = p.cars.find((x) => x.id === ownedId);
    if (!own) throw new GameError('No es tuyo.');
    const car = this.w.c.cars.find((x) => x.id === own.car)!;
    const value = Math.round(this.carPrice(car.id) * 0.6);
    await this.w.db.tx(async (q) => {
      const dup = await q.query('SELECT 1 FROM ops WHERE op_id = $1', [opId]);
      if (dup.rows.length) throw new GameError('Operación ya procesada');
      const bal = p.money + value;
      await q.query('DELETE FROM cars_owned WHERE id=$1', [ownedId]);
      await q.query('INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,$3,$4,$5)', [`${opId}:venta-coche`, p.charId, value, bal, `Venta de vehículo: ${car.maker} ${car.name}`]);
      await q.query('UPDATE characters SET money=$2 WHERE id=$1', [p.charId, bal]);
      await q.query('INSERT INTO ops (op_id, character_id, kind, result) VALUES ($1,$2,$3,$4)', [opId, p.charId, 'car-sell', JSON.stringify({ ownedId, value })]);
    });
    p.money += value; p.cars = p.cars.filter((x) => x.id !== ownedId);
    if (p.driving === ownedId) this.park(c, true);
    this.w.send(c, { t: 'notice', kind: 'good', text: `Vendes el ${car.maker} ${car.name} por ${value.toLocaleString('es-ES')} €$.` });
    this.w.send(c, { t: 'sheet', sheet: buildSheet(this.w.c, p) });
  }
  carOf(p: PlayerState) { const own = p.driving ? p.cars.find((x) => x.id === p.driving) : undefined; return own ? this.w.c.cars.find((x) => x.id === own.car) : undefined; }
  drive(c: PlayerConn, ownedId?: string) {
    const p = c.p!, e = c.e!;
    if (!p.cars.length) throw new GameError('No tienes coche. Cómpralo en un concesionario.');
    if (e.zone.def.kind !== 'exterior') throw new GameError('Solo se conduce en la calle.');
    if (p.status !== 'alive' || p.sleeping) throw new GameError('Ahora no puedes conducir.');
    const own = (ownedId ? p.cars.find((x) => x.id === ownedId) : undefined) ?? [...p.cars].sort((a, b) => this.w.c.cars.find((x) => x.id === b.car)!.speed - this.w.c.cars.find((x) => x.id === a.car)!.speed)[0];
    p.driving = own.id;
    e.vehicle = own.car; e.labelVer++;
    const car = this.w.c.cars.find((x) => x.id === own.car)!;
    this.w.send(c, { t: 'notice', kind: 'good', text: `Al volante del ${car.maker} ${car.name}. V para bajarte.` });
    this.w.send(c, { t: 'sheet', sheet: buildSheet(this.w.c, p) });
  }
  park(c: PlayerConn, quiet = false) {
    const p = c.p!, e = c.e!;
    if (!p.driving) return;
    p.driving = null; e.vehicle = null; e.labelVer++;
    if (!quiet) this.w.send(c, { t: 'notice', kind: 'info', text: 'Aparcas y bajas del coche.' });
    this.w.send(c, { t: 'sheet', sheet: buildSheet(this.w.c, p) });
  }
  /** Viaje en coche a otro distrito: unos segundos de trayecto (instantáneo con el perk «Piloto»). */
  async travel(c: PlayerConn, zoneId: string) {
    const p = c.p!, e = c.e!;
    // Ciudad única: se viaja a un distrito (su punto seguro); se mantiene la compatibilidad con zonas sueltas.
    const city = [...this.w.zones.values()].find((z) => z.def.districts.some((d) => d.id === zoneId));
    const dist = city?.def.districts.find((d) => d.id === zoneId);
    const to = city ?? this.w.zones.get(zoneId);
    if (!to || to.def.kind !== 'exterior' || (!dist && zoneId === e.zone.id) || (dist && this.w.districtOf(e.zone, e.x, e.y) === zoneId)) throw new GameError('Elige otro distrito.');
    if (e.zone.def.kind !== 'exterior') throw new GameError('Sal a la calle para coger el coche.');
    if (!p.cars.length) throw new GameError('Necesitas un coche para viajar entre distritos.');
    if (p.status !== 'alive') throw new GameError('Ahora no.');
    if (!p.driving) this.drive(c);
    const pilot = perkMods(this.w.c, p).flags.has('piloto');
    const car = this.carOf(p)!;
    const secs = pilot ? 0 : Math.max(3, Math.round(14 / car.speed));
    if (secs) {
      this.w.send(c, { t: 'action', text: `Conduces hacia ${dist?.name ?? to.def.name}…`, progress: 0, duration: secs });
      await new Promise((r) => setTimeout(r, secs * 1000));
      if (c.closed || p.status !== 'alive' || c.e !== e) return;
    }
    const sp = dist?.safePoint ?? to.def.safePoint;
    await this.w.teleport(c, to.id, [sp[0], sp[1]]);
    e.vehicle = car.id; e.labelVer++;
    this.w.progress.gain(p, 'conduccion', 6);
    this.w.send(c, { t: 'action', text: '' });
  }

  // ---------------------------------------------------------------- mercado en tiempo real
  liveOn(c: PlayerConn, on: boolean) { if (on) this.live.add(c); else this.live.delete(c); if (on) this.w.send(c, { t: 'marketLive', view: this.liveView() }); }
  pushLive() {
    if (!this.live.size) return;
    const v = this.liveView();
    for (const c of [...this.live]) { if (c.closed) { this.live.delete(c); continue; } this.w.send(c, { t: 'marketLive', view: v }); }
  }
  liveView(): MarketLiveView {
    const h = (k: string) => this.hist.get(k) ?? [];
    const ch = (a: number[]) => (a.length > 1 ? Math.round(((a[a.length - 1] / a[0]) - 1) * 1000) / 10 : 0);
    const CAT: Record<string, string> = { comida: 'Comida', bebida: 'Bebida', medicina: 'Medicina', arma: 'Armas', municion: 'Munición', ropa: 'Ropa', equipo: 'Equipo', herramienta: 'Herramientas', chatarra: 'Chatarra', ciberware: 'Ciberware', contrabando: 'Contrabando' };
    const indices = [
      ...[...this.hist.keys()].filter((k) => k.startsWith('cat:')).map((k) => ({ id: k, name: CAT[k.slice(4)] ?? k.slice(4), value: h(k).at(-1) ?? 1, change: ch(h(k)), history: h(k) })),
      ...[...this.housing.keys()].map((z) => ({ id: `viv:${z}`, name: `Vivienda · ${this.dname(z)}`, value: this.housing.get(z)!, change: ch(h(`viv:${z}`)), history: h(`viv:${z}`) })),
      ...[...this.carIdx.keys()].map((k) => ({ id: `car:${k}`, name: `Vehículos · ${k}`, value: this.carIdx.get(k)!, change: ch(h(`car:${k}`)), history: h(`car:${k}`) })),
    ];
    const items: MarketLiveView['items'] = [];
    for (const sh of this.w.c.shops) for (const it of Object.keys(sh.stock)) {
      const def = this.w.c.items.find((i) => i.id === it);
      const a = h(`item:${sh.id}:${it}`);
      if (!def?.price || !a.length) continue;
      items.push({ item: `${sh.id}:${it}`, name: `${def.name} · ${sh.name}`, category: def.category, price: a.at(-1)!, base: def.price, change: ch(a), history: a });
    }
    items.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
    const zones = [...this.housing.keys()];
    return {
      at: Date.now(), indices, items: items.slice(0, 40),
      trades: [...this.trades, ...this.w.survival.market.view().bulletin.map((b) => ({ at: Date.parse(b.at), text: b.text }))].sort((a, b) => b.at - a.at).slice(0, 14),
      housing: zones.map((z) => { const free = this.w.c.houses.filter((x) => x.district === z && !this.owners.has(x.id)); return { zone: z, name: this.dname(z), index: this.housing.get(z)!, forSale: free.length, cheapest: free.length ? Math.min(...free.map((x) => this.housePrice(x))) : 0 }; }),
      cars: this.w.c.cars.map((x) => ({ id: x.id, name: `${x.maker} ${x.name}`, class: x.class, price: this.carPrice(x.id) })),
    };
  }
}

export function isHouseZone(id: string) { return id.startsWith('casa:'); }
export type { Entity };
