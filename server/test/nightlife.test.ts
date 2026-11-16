import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isWalkable, type ServerMsg } from '@vertice/shared';
import { BotClient } from '../../tools/loadtest/src/botclient.js';
import { createApp } from '../src/app.js';
import { aimOf, loadPlayer } from '../src/game/player.js';
import { substanceEffects, takeDose } from '../src/game/substances.js';
import type { PlayerConn } from '../src/world/world.js';

let app: Awaited<ReturnType<typeof createApp>>;
const clients: BotClient[] = [];
const op = () => randomUUID();
const conn = (b: BotClient) => [...app.world.conns.values()].find((c) => c.p?.name === b.name)!;
const at = (b: BotClient, zone: string, pos: [number, number]) => app.world.teleport(conn(b), zone, pos);
const trade = (b: BotClient, action: string, site?: string, ref?: string, qty?: number, opId = op()) =>
  b.cmd({ t: 'underworld', action, site, ref, qty, opId });

beforeAll(async () => {
  app = await createApp({ port: 0, host: '127.0.0.1', databaseUrl: undefined, pgliteDir: 'memory://',
    ambientNpcs: 0, crowdNpcs: 0, needsScale: 0, speedScale: 5, lingerSeconds: 0, logLevel: 'warn' });
});
afterAll(async () => {
  for (const b of clients) b.close();
  if (app && clients.length) {
    await clients[0].until(() => app.world.conns.size === 0, 2000, 'cierre de clientes');
    await app.db.query('SELECT 1');
  }
  await app?.close();
});

async function login(name: string) {
  const url = `http://127.0.0.1:${app.port}`;
  const token = await BotClient.registerAndCreate(url, name, 'solo', 'corporativo');
  const b = new BotClient(url, name);
  clients.push(b);
  await b.connect(token, app.contentHash);
  return b;
}

async function site(b: BotClient, id: string) {
  const e = [...app.world.entities.values()].find((e) => e.marketSite === id)!;
  await at(b, e.zone.id, [Math.floor(e.x), Math.floor(e.y)]);
  return e;
}

async function grant(c: PlayerConn, item: string, qty: number) {
  await app.db.query(`INSERT INTO inventory_items (id, character_id, def_id, qty) VALUES ($1,$2,$3,$4)
    ON CONFLICT (character_id, def_id) DO UPDATE SET qty = EXCLUDED.qty`, [randomUUID(), c.p!.charId, item, qty]);
  c.p!.inventory.set(item, qty);
}

describe('Vida nocturna y comercio clandestino', () => {
  it('conecta locales nuevos con la calle y replica baile, movimiento y parada a otro jugador', async () => {
    const a = await login('bailauno'), b = await login('bailados');
    for (const id of ['bar-ultima-luz', 'discoteca-circuito']) {
      const city = app.world.zones.get('vertice')!;
      const door = city.def.doors.find((d) => d.to.zone === id)!;
      await at(a, 'vertice', door.at);
      await a.enterDoor(door.name);
      expect(a.zone).toBe(id);
      expect([...app.world.zones.get(id)!.entities].some((e) => e.npcType === 'essential' && e.emote)).toBe(true);
    }
    await at(b, a.zone, [19, 8]);
    await b.until(() => b.entities.has(a.you));
    for (const move of ['onda', 'rebote']) {
      const remote = b.waitFor((m) => m.t === 'label' && m.id === a.you && m.emote?.move === move);
      expect((await a.cmd({ t: 'dance', move })).ok).toBe(true);
      await remote;
    }
    const clear = b.waitFor((m) => m.t === 'label' && m.id === a.you && m.emote === null);
    expect((await a.move(18.5, 8.5)).ok).toBe(true);
    await clear;
    expect(conn(a).e!.emote).toBeUndefined();
  });

  it('compra en la barra, castiga la puntería y persiste intoxicación, vómitos y dependencia', async () => {
    const b = await login('licorprueba');
    const c = conn(b), p = c.p!;
    const bar = [...app.world.zones.get('voltio-int')!.entities].find((e) => e.shop === 'voltio-barra')!;
    await at(b, 'voltio-int', [3, 8]);
    const menu = b.waitFor<Extract<ServerMsg, { t: 'shop' }>>((m) => m.t === 'shop');
    expect((await b.cmd({ t: 'interact', target: bar.id })).ok).toBe(true);
    expect((await menu).view.bar).toBe(true);
    expect((await b.cmd({ t: 'buy', shop: bar.shop, item: 'licor-voltio', qty: 2, opId: op() })).ok).toBe(true);
    await grant(c, 'pistola-ligera', 1);
    await b.cmd({ t: 'equip', item: 'pistola-ligera' });
    const aim = aimOf(app.world.c, p);
    const command = { t: 'useItem', item: 'licor-voltio', opId: op() };
    expect((await b.cmd(command)).ok).toBe(true);
    expect((await b.cmd(command)).ok).toBe(true);
    expect(p.inventory.get('licor-voltio')).toBe(1);
    expect(aimOf(app.world.c, p).range).toBeLessThan(aim.range);
    expect(aimOf(app.world.c, p).time).toBeGreaterThan(aim.time);
    const fatigue = p.fatigue;
    expect((await b.cmd({ ...command, opId: op() })).ok).toBe(true);
    expect(c.e!.emote?.move).toBe('nausea');
    expect(p.fatigue).toBeGreaterThan(fatigue + 15);
    expect((await b.move(6.5, 8.5)).reason).toMatch(/vomitando/);
    const saved = await loadPlayer(app.db, p.charId);
    expect(saved?.substances).toEqual(p.substances);
    expect(substanceEffects(app.world.c, saved!.substances).sick).toBe(true);
    const later = Date.now() + 400_000;
    const liquor = app.world.c.items.find((i) => i.id === 'licor-voltio')!;
    const third = takeDose(saved!.substances, liquor, later);
    expect(third.newDependence).toBe(true);
    expect(substanceEffects(app.world.c, third.state, later + 255_000).effects)
      .toContainEqual({ id: 'alcohol', name: 'Alcohol', dependent: true, withdrawal: true });
  });

  it('aplica beneficios, bajón y abstinencia distintos con sustancias ya existentes en la mochila', async () => {
    const b = await login('dosisprueba');
    const c = conn(b), p = c.p!;
    await grant(c, 'pulso-azul', 4);
    await grant(c, 'medula-ignea', 1);
    for (let i = 0; i < 4; i++) expect((await b.cmd({ t: 'useItem', item: 'pulso-azul', opId: op() })).ok).toBe(true);
    expect((await b.cmd({ t: 'useItem', item: 'medula-ignea', opId: op() })).ok).toBe(true);
    const buff = substanceEffects(app.world.c, p.substances);
    expect(buff.aim).toBe(3);
    expect(buff.speed).toBeGreaterThan(1);
    expect(buff.melee).toBe(3);
    const crash = substanceEffects(app.world.c, p.substances, Date.now() + 85_000);
    expect(crash.aim).toBeLessThan(0);
    expect(crash.speed).toBeLessThan(1);
    expect(crash.fatigue).toBeGreaterThan(0);
    expect(crash.effects.find((x) => x.id === 'pulso-azul')).toMatchObject({ dependent: true, withdrawal: true, phase: 'crash' });
  });

  it('limita los tratos a PNJ cercanos y paga al solitario con consecuencias cuando falla', async () => {
    const b = await login('libreprueba');
    const c = conn(b);
    const p = c.p!;
    const price = p.money;
    expect((await trade(b, 'buy', 'sira', 'pulso-azul', 5)).ok).toBe(false);
    const contact = await site(b, 'sira');
    const bulletin = b.waitFor<Extract<ServerMsg, { t: 'underworld' }>>((m) => m.t === 'underworld');
    await b.cmd({ t: 'interact', target: contact.id });
    expect((await bulletin).view.markets).toHaveLength(8);
    expect((await trade(b, 'join', 'sira', 'marea')).ok).toBe(false);
    expect((await trade(b, 'buy', 'sira', 'pulso-azul', 4)).ok).toBe(true);
    expect(p.money).toBeLessThan(price);
    const before = p.money;
    await site(b, 'ferro');
    app.world.underworld.rng = () => 0.99;
    const once = op();
    expect((await trade(b, 'sell', 'ferro', 'pulso-azul', 2, once)).ok).toBe(true);
    const after = p.money;
    expect(after).toBeGreaterThan(before);
    expect((await trade(b, 'sell', 'ferro', 'pulso-azul', 2, once)).ok).toBe(true);
    expect(p.money).toBe(after);
    expect(p.underworld.rep).toBe(2);
    expect(p.inventory.get('pulso-azul')).toBe(2);
    app.world.underworld.rng = () => 0;
    expect((await trade(b, 'sell', 'ferro', 'pulso-azul', 1)).ok).toBe(true);
    expect([...c.e!.zone.entities].some((e) => e.aggro === c.e!.id && e.expiresAt && !e.respawn)).toBe(true);
    expect(p.underworld.rep).toBe(2);
  });

  it('lleva el dinero a dos bases de la banda, conserva el encargo y penaliza un vencimiento', async () => {
    const b = await login('bandaprueba');
    const p = conn(b).p!;
    app.world.underworld.rng = () => 0.99;
    await site(b, 'sira');
    expect((await trade(b, 'buy', 'sira', 'pulso-azul', 5)).ok).toBe(true);
    await site(b, 'ferro');
    expect((await trade(b, 'sell', 'ferro', 'pulso-azul', 5)).ok).toBe(true);
    await site(b, 'sira');
    expect((await trade(b, 'join', 'sira', 'hojas-rojas')).ok).toBe(true);
    expect(app.world.underworld.isAlly(p, 'marea')).toBe(true);
    expect(app.world.underworld.isRival(p, 'hermandad-sol')).toBe(true);
    expect(app.world.underworld.isRival(p, 'marea')).toBe(false);
    const bases = new Set<string>();
    for (let i = 0; i < 3; i++) {
      await site(b, 'sira');
      expect((await trade(b, 'accept', 'sira', 'neblina')).ok).toBe(true);
      const sale = p.underworld.job;
      if (sale?.phase !== 'sale') throw new Error('Falta el lote');
      await site(b, sale.buyer);
      const money = p.money;
      expect((await trade(b, 'collect', sale.buyer)).ok).toBe(true);
      const cash = p.underworld.job;
      if (cash?.phase !== 'cash') throw new Error('Falta el dinero de la banda');
      expect(p.money).toBe(money);
      expect(cash.deadline).toBeGreaterThan(Date.now());
      expect((await loadPlayer(app.db, p.charId))?.underworld.job).toEqual(cash);
      const wrongBase = cash.base.endsWith('-central') ? 'hojas-rojas-refugio' : 'hojas-rojas-central';
      await site(b, wrongBase);
      expect((await trade(b, 'deliver', wrongBase)).ok).toBe(false);
      await site(b, cash.base);
      if (i === 2) {
        const overdue = { ...cash, deadline: Date.now() - 50 };
        p.underworld = { ...p.underworld, job: overdue };
        await app.db.query('UPDATE characters SET underworld=$2 WHERE id=$1', [p.charId, JSON.stringify(p.underworld)]);
        const rep = p.underworld.rep!;
        expect((await trade(b, 'deliver', cash.base)).ok).toBe(false);
        expect(p.underworld.job).toBeUndefined();
        expect(p.underworld.rep).toBe(rep - 7);
        expect(p.money).toBe(money);
      } else {
        const base = conn(b).e!.zone;
        expect(isWalkable(base.grid, conn(b).e!.x, conn(b).e!.y)).toBe(true);
        expect((await trade(b, 'deliver', cash.base)).ok).toBe(true);
        expect(p.money).toBe(money + cash.commission);
        expect(p.underworld.deliveries).toBe(i + 1);
        bases.add(cash.base);
      }
    }
    expect(bases.size).toBe(2);
    expect(b.sheet?.underworld.membership?.rank).toBe('Corredor');
  });
});
