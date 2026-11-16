// v0.4 · progresión, ropa, viviendas, coches, análisis profundo, implantes con habilidad y matasanos ocultos.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { skillXpFor } from '@vertice/shared';
import { createApp } from '../src/app.js';
import { BotClient } from '../../tools/loadtest/src/botclient.js';

const DB = process.env.TEST_DATABASE_URL;
let app: Awaited<ReturnType<typeof createApp>>;
let base = '';
const clients: BotClient[] = [];
const op = () => randomUUID().replace(/-/g, '');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  if (DB) { const c = new pg.Client({ connectionString: DB }); await c.connect(); await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); await c.end(); }
  app = await createApp({ port: 0, host: '127.0.0.1', databaseUrl: DB, pgliteDir: 'memory://', ambientNpcs: 4, crowdNpcs: 0, speedScale: 6, lingerSeconds: 1, logLevel: 'warn',
    cityHourOffset: 10 - ((Date.now() / 60000) % 24), needsScale: 1, downedSeconds: 2, jobTimeScale: 0.05 });
  base = `http://127.0.0.1:${app.port}`;
});
afterAll(async () => { for (const c of clients) c.close(); await app?.close(); });

async function join(name: string, role = 'solo', attrs: Record<string, number> = {}) {
  const token = await BotClient.registerAndCreate(base, name, role, 'callejero', attrs);
  const b = new BotClient(base, name); clients.push(b);
  await b.connect(token, app.contentHash);
  return b;
}
const conn = (name: string) => [...app.world.conns.values()].find((c) => c.p?.name === name)!;
const P = (name: string) => conn(name).p!;
const E = (name: string) => conn(name).e!;
const ledgerOk = async () => (await app.db.query<any>("SELECT count(*)::int AS n FROM characters c LEFT JOIN (SELECT character_id, sum(delta) s FROM ledger GROUP BY 1) l ON l.character_id=c.id WHERE c.money <> COALESCE(l.s,0)")).rows[0].n === 0;
async function give(name: string, amount: number) {
  const p = P(name);
  await app.db.query("INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,$3,$4,'prueba')", [op(), p.charId, amount, p.money + amount]);
  await app.db.query('UPDATE characters SET money = money + $2 WHERE id=$1', [p.charId, amount]);
  p.money += amount;
}

describe('v0.4 · progresión y propiedades', () => {
  it('las habilidades suben con el uso; los niveles dan puntos de habilidad y de perk; los perks exigen requisitos', async () => {
    const b = await join('progresa');
    const p = P('progresa');
    const lv0 = app.world.progress; void lv0;
    const before = p.skillXp.armas ?? 0;
    app.world.progress.gain(p, 'armas', 40);
    expect(p.skillXp.armas).toBeGreaterThan(before);
    // Subir de nivel de personaje da puntos.
    app.world.progress.playerXp(p, 1000);
    expect(p.level).toBeGreaterThan(1);
    const sk = b.waitFor((m) => m.t === 'sheet' && (m as any).sheet.skillPoints > 0, 3000, 'ficha con puntos');
    await b.cmd({ t: 'props' });
    app.world.progress.onLevelUp(p, 1);
    const sheet = (await sk as any).sheet;
    expect(sheet.skillProg.find((s: any) => s.id === 'armas').level).toBeGreaterThanOrEqual(1);
    const lvl = sheet.skillProg.find((s: any) => s.id === 'sigilo').level;
    expect((await b.cmd({ t: 'skillUp', skill: 'sigilo', opId: op() })).ok).toBe(true);
    expect(p.skillXp.sigilo).toBe(skillXpFor(lvl + 1));
    // Perk sin requisito: rechazado con el motivo; con requisito: comprado.
    const no = await b.cmd({ t: 'perkBuy', perk: 'ojo-de-dios', opId: op() });
    expect(no.ok).toBe(false); expect(no.reason).toMatch(/Requiere/);
    p.skillXp.armas = skillXpFor(4);
    const yes = await b.cmd({ t: 'perkBuy', perk: 'pulso-firme', opId: op() });
    expect(yes.ok).toBe(true);
    expect(p.perks).toContain('pulso-firme');
    // Con puntos no se pasa del 20.
    p.skillXp.sigilo = skillXpFor(20);
    expect((await b.cmd({ t: 'skillUp', skill: 'sigilo', opId: op() })).reason).toMatch(/20/);
  });

  it('la ropa se pone por huecos, cambia el aspecto y suma blindaje', async () => {
    const b = await join('modista');
    const p = P('modista');
    expect(p.wear.torso_ext).toBe('chaqueta');
    p.inventory.set('cazadora-neon', 1); p.inventory.set('casco-moto', 1);
    expect((await b.cmd({ t: 'wear', slot: 'torso_ext', item: 'cazadora-neon' })).ok).toBe(true);
    expect((await b.cmd({ t: 'wear', slot: 'cabeza', item: 'casco-moto' })).ok).toBe(true);
    expect(E('modista').appearance!.jacket).toBe('#ff3fa4');
    expect(E('modista').appearance!.headwear).toBe('casco');
    expect((await b.cmd({ t: 'wear', slot: 'pies', item: 'casco-moto' })).ok).toBe(false);
    const sheet = app.world.survival.sheetOf(p);
    expect(sheet.armor).toBe(2); // cazadora 1 + casco 1
  });

  it('viviendas: comprar en el portal, entrar, alijo y permisos', async () => {
    const o = await join('propietaria');
    const v = await join('visita');
    await o.enterDoor('Salida'); await v.enterDoor('Salida');
    await give('propietaria', 200000);
    const ferro = app.world.zones.get('ferro')!;
    const portal = [...ferro.entities].find((x) => x.objKind === 'housing')!;
    const house = app.world.c.houses.find((h) => h.building === portal.objId)!;
    for (const n of ['propietaria', 'visita']) { E(n).x = portal.x + 0.5; E(n).y = portal.y + 1; E(n).path = []; }
    const view = o.waitFor((m) => m.t === 'building', 3000, 'portal');
    await o.cmd({ t: 'house', action: 'view', building: portal.objId });
    expect((await view as any).view.units.length).toBeGreaterThan(0);
    expect((await v.cmd({ t: 'house', action: 'enter', house: house.id })).reason).toMatch(/venta/);
    const r = await o.cmd({ t: 'house', action: 'buy', house: house.id, opId: op() });
    expect(r.ok).toBe(true);
    expect(P('propietaria').houses).toContain(house.id);
    expect((await v.cmd({ t: 'house', action: 'enter', house: house.id })).reason).toMatch(/permiso/);
    expect((await o.cmd({ t: 'house', action: 'enter', house: house.id })).ok).toBe(true);
    await o.until(() => E('propietaria').zone.id === `casa:${house.id}`, 5000, 'dentro de casa');
    expect(E('propietaria').zone.def.danger).toBe('protected');
    expect((await o.cmd({ t: 'house', action: 'stashIn', house: house.id, item: 'fideos-krill', qty: 1 })).ok).toBe(true);
    expect(P('propietaria').inventory.get('fideos-krill')).toBe(1);
    expect((await o.cmd({ t: 'house', action: 'permit', house: house.id, name: 'visita' })).ok).toBe(true);
    expect((await v.cmd({ t: 'house', action: 'enter', house: house.id })).ok).toBe(true);
    await v.until(() => E('visita').zone.id === `casa:${house.id}`, 5000, 'visita dentro');
    expect(await ledgerOk()).toBe(true);
  });

  it('coches: comprar en el concesionario, conducir más rápido y viajar a otro distrito', async () => {
    const d = await join('conductora');
    const p = P('conductora');
    await give('conductora', 50000);
    await app.world.teleport(conn('conductora'), 'autos-ferro-int', [8, 4]);
    await d.until(() => E('conductora').zone.id === 'autos-ferro-int', 5000, 'en el concesionario');
    const cheap = app.world.property.dealerView(p, 'autos-ferro').cars[0];
    const r = await d.cmd({ t: 'car', action: 'buy', dealer: 'autos-ferro', car: cheap.id, opId: op() });
    expect(r.ok).toBe(true);
    expect(p.cars.length).toBe(1);
    expect((await d.cmd({ t: 'car', action: 'drive' })).ok).toBe(false); // dentro no se conduce
    await d.enterDoor('Salida');
    await d.until(() => E('conductora').zone.id === 'ferro', 8000, 'en la calle');
    const walk = E('conductora').speed;
    expect((await d.cmd({ t: 'car', action: 'drive' })).ok).toBe(true);
    await sleep(1200);
    expect(E('conductora').speed).toBeGreaterThan(walk * 1.5);
    expect(E('conductora').vehicle).toBe(cheap.id);
    p.perks.push('piloto');
    expect((await d.cmd({ t: 'car', action: 'travel', zone: 'cenit' }, 15000)).ok).toBe(true);
    await d.until(() => E('conductora').zone.id === 'cenit', 8000, 'en Cénit');
    expect(await ledgerOk()).toBe(true);
  });

  it('análisis profundo (hackeo de edgerunner) muestra nivel y estadísticas; los PNJ tienen nivel', async () => {
    const n = await join('analista', 'netrunner', { INT: 8, LUCK: 3 });
    const p = P('analista');
    await n.enterDoor('Salida');
    const civ = [...E('analista').zone.entities].find((e) => e.npcType === 'civil')!;
    expect(civ.level).toBeGreaterThanOrEqual(1);
    E('analista').x = civ.x + 2; E('analista').y = civ.y; civ.npc = undefined; civ.path = [];
    // Sin Interfaz 6 no está disponible.
    p.skillXp.interfaz = 0;
    expect((await n.cmd({ t: 'hack', target: civ.id, hack: 'analisis-profundo', opId: op() })).reason).toMatch(/Interfaz/);
    p.skillXp.interfaz = skillXpFor(8); p.ram = 99;
    app.world.survival.rng = () => 0.95;
    const sc = n.waitFor((m) => m.t === 'scan', 8000, 'escaneo');
    expect((await n.cmd({ t: 'hack', target: civ.id, hack: 'analisis-profundo', opId: op() })).ok).toBe(true);
    const v = (await sc as any).view;
    app.world.survival.rng = Math.random;
    expect(v.deep).toBe(true); expect(v.level).toBe(civ.level); expect(v.attributes.BODY).toBeGreaterThan(0);
  });

  it('implantes con habilidad: se activan y se recargan', async () => {
    const b = await join('cromada');
    const p = P('cromada');
    p.cyber.push({ id: randomUUID(), def: 'glandula-adrenalina', location: 'installed', stolen: false });
    p.hp = 10;
    expect((await b.cmd({ t: 'ability', id: 'glandula-adrenalina' })).ok).toBe(true);
    await sleep(2200);
    expect(p.hp).toBeGreaterThan(10);
    const again = await b.cmd({ t: 'ability', id: 'glandula-adrenalina' });
    expect(again.ok).toBe(false); expect(again.reason).toMatch(/recarga/);
    expect(p.skillXp.filo ?? 0).toBeGreaterThan(0);
  });

  it('los matasanos clandestinos no tienen rótulo y se descubren al entrar', async () => {
    const b = await join('exploradora');
    await b.enterDoor('Salida');
    const ferro = app.world.zones.get('ferro')!;
    const door = [...ferro.entities].find((x) => x.hiddenDoc === 'carnicero')!;
    expect(door.name).toBe('Puerta sin rótulo');
    expect(app.world.survival.sheetOf(P('exploradora')).discovered).not.toContain('carnicero');
    E('exploradora').x = door.x; E('exploradora').y = door.y + 1; E('exploradora').path = [];
    await b.cmd({ t: 'interact', target: door.id });
    await b.until(() => E('exploradora').zone.id === 'carnicero-int', 8000, 'dentro de la consulta');
    expect(app.world.survival.sheetOf(P('exploradora')).discovered).toContain('carnicero');
  });
});
