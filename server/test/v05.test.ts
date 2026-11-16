// v0.5 · ciudad única, puestos fijos con horario, torres por plantas, bases, correr y modo automático.
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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  if (DB) { const c = new pg.Client({ connectionString: DB }); await c.connect(); await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); await c.end(); }
  app = await createApp({ port: 0, host: '127.0.0.1', databaseUrl: DB, pgliteDir: 'memory://', ambientNpcs: 4, crowdNpcs: 0, speedScale: 6, lingerSeconds: 1, logLevel: 'warn',
    cityHourMs: 60000, cityHourOffset: 10 - ((Date.now() / 60000) % 24), needsScale: 1, downedSeconds: 2, jobTimeScale: 0.05 });
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

describe('v0.5 · ciudad única, puestos y automático', () => {
  it('la ciudad es una sola zona con distritos, callejones, pasarelas, torres y bases', () => {
    const city = app.world.zones.get('vertice')!;
    expect(city.def.width).toBeGreaterThan(500);
    expect(city.def.ground.some((g) => g.type === 'alley')).toBe(true);
    expect(city.def.doors.some((d) => d.to.zone.startsWith('pasarela-'))).toBe(true);
    expect(city.def.doors.some((d) => d.to.zone === 'torre-halcon-p0')).toBe(true);
    expect(city.def.doors.some((d) => d.to.zone === 'base-marea')).toBe(true);
    expect(app.world.zones.get('torre-halcon-p7')?.def.tower?.access).toBe('restringido');
    expect([...app.world.zones.get('base-marea')!.entities].filter((e) => e.faction === 'marea').length).toBeGreaterThan(3);
  });

  it('puestos fijos: requisitos de habilidad, uno por persona, en persona y en horario; el turno paga', async () => {
    const a = await join('farmaceutica');
    const b = await join('rival');
    const pa = P('farmaceutica');
    await app.world.teleport(conn('farmaceutica'), 'farmacia-ferro', [9, 5]);
    await a.until(() => E('farmaceutica').zone.id === 'farmacia-ferro', 5000, 'en la farmacia');
    // Sin Medicina 8 no te contratan.
    pa.skillXp.medicina = 0;
    const no = await a.cmd({ t: 'post', action: 'apply', post: 'farmacia-ferro-farmaceutico' });
    expect(no.ok).toBe(false); expect(no.reason).toMatch(/Medicina/);
    pa.skillXp.medicina = skillXpFor(9);
    expect((await a.cmd({ t: 'post', action: 'apply', post: 'farmacia-ferro-farmaceutico' })).ok).toBe(true);
    // Ocupado para los demás (y no se puede pedir a distancia).
    P('rival').skillXp.medicina = skillXpFor(10);
    expect((await b.cmd({ t: 'post', action: 'apply', post: 'farmacia-ferro-farmaceutico' })).reason).toMatch(/Ocupado|ocupado/);
    // Turno de 9 a 17: ahora son las 10.
    const m0 = pa.money;
    expect((await a.cmd({ t: 'post', action: 'work' })).ok).toBe(true);
    await a.until(() => pa.money > m0, 15000, 'nómina del turno');
    expect(pa.money).toBeGreaterThanOrEqual(m0 + 200);
    expect((await a.cmd({ t: 'post', action: 'work' })).reason).toMatch(/Ya has trabajado/);
    expect((await a.cmd({ t: 'post', action: 'quit' })).ok).toBe(true);
    expect(app.world.posts.held.has('farmacia-ferro-farmaceutico')).toBe(false);
    expect(await ledgerOk()).toBe(true);
  });

  it('torres: el ascensor solo sube a plantas autorizadas; hackearlo da paso pero la seguridad persigue al intruso', async () => {
    const t = await join('intrusa', 'netrunner', { INT: 8, LUCK: 3 });
    const p = P('intrusa');
    await app.world.teleport(conn('intrusa'), 'torre-halcon-p0', [3, 7]);
    await t.until(() => E('intrusa').zone.id === 'torre-halcon-p0', 5000, 'en el vestíbulo');
    const view = t.waitFor((m) => m.t === 'elevator', 3000, 'ascensor');
    await t.cmd({ t: 'elevator' });
    const v = (await view as any).view;
    expect(v.floors.length).toBe(8);
    expect(v.floors.find((f: any) => f.floor === 1).allowed).toBe(true);
    expect(v.floors.find((f: any) => f.floor === 6).allowed).toBe(false);
    expect((await t.cmd({ t: 'elevator', floor: 6 })).reason).toMatch(/restringido/);
    // La reacción se verifica con un guardia al alcance del ascensor. Su ruta habitual es aleatoria.
    const floor = app.world.zones.get('torre-halcon-p6')!;
    const guard = [...floor.entities].find((g) => g.npcType === 'gang' && g.faction === 'halcon')!;
    guard.x = 4.5;
    guard.y = 7.5;
    floor.moved(guard);
    p.skillXp.interfaz = skillXpFor(25);
    app.world.survival.rng = () => 0.01;
    expect((await t.cmd({ t: 'elevator', floor: 6, hack: true })).ok).toBe(true);
    app.world.survival.rng = Math.random;
    await t.until(() => E('intrusa').zone.id === 'torre-halcon-p6', 5000, 'planta ejecutiva');
    await t.until(() => guard.aggro === E('intrusa').id, 8000, 'seguridad alertada');
  });

  it('correr: más velocidad a cambio de aguante', async () => {
    const r = await join('corredora');
    const p = P('corredora');
    await r.enterDoor('Salida');
    await sleep(1100);
    const walk = E('corredora').speed;
    await r.cmd({ t: 'run', on: true });
    E('corredora').path = [[E('corredora').x + 40, E('corredora').y]]; E('corredora').moving = true;
    const s0 = p.stamina;
    await sleep(2200);
    expect(E('corredora').speed).toBeGreaterThan(walk * 1.4);
    expect(p.stamina).toBeLessThan(s0);
  });

  it('modo automático: la IA acepta encargos de su oficio y una orden manual le devuelve el control', async () => {
    const a = await join('autonoma');
    const p = P('autonoma');
    expect((await a.cmd({ t: 'auto', on: true, personality: 'ambicioso' })).ok).toBe(true);
    expect(p.auto.on).toBe(true);
    await a.until(() => !!p.activeJob || !!E('autonoma').task || E('autonoma').zone.id !== 'bloque9', 15000, 'la IA actúa');
    await a.cmd({ t: 'stop' });
    expect(p.auto.on).toBe(false);
  });

  it('bases: el alijo no se toca con guardias en pie', async () => {
    const l = await join('saqueadora');
    await app.world.teleport(conn('saqueadora'), 'base-marea', [23, 9]);
    await l.until(() => E('saqueadora').zone.id === 'base-marea', 5000, 'en la base');
    const loot = [...E('saqueadora').zone.entities].find((o) => o.objKind === 'loot')!;
    E('saqueadora').x = loot.x - 1; E('saqueadora').y = loot.y;
    const m0 = P('saqueadora').money;
    await l.cmd({ t: 'interact', target: loot.id });
    await sleep(800);
    expect(P('saqueadora').money).toBe(m0);
    for (const g of [...E('saqueadora').zone.entities].filter((x) => x.faction === 'marea')) { g.state = 'downed'; g.downedUntil = Date.now() + 60000; }
    await l.cmd({ t: 'interact', target: loot.id });
    await l.until(() => P('saqueadora').money > m0, 5000, 'botín');
    expect(await ledgerOk()).toBe(true);
  });
});
