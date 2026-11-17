// v0.13 · Cadáveres: duran una semana de juego, sangre de 50 minutos, saqueo completo (dinero, armas, objetos, cromo),
// esconderlos en contenedores, hallazgo por los transeúntes con aviso a la PCV e investigación por cámaras; rebuscar en
// la basura y esconderse dentro de un contenedor.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { dangerAt, isWalkable } from '@vertice/shared';
import { createApp } from '../src/app.js';
import { BotClient } from '../../tools/loadtest/src/botclient.js';
import { BLOOD_MS } from '../src/world/corpses.js';
import type { Entity } from '../src/world/entity.js';

const DB = process.env.TEST_DATABASE_URL;
let app: Awaited<ReturnType<typeof createApp>>;
let base = '';
const clients: BotClient[] = [];

beforeAll(async () => {
  if (DB) { const c = new pg.Client({ connectionString: DB }); await c.connect(); await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); await c.end(); }
  app = await createApp({ port: 0, host: '127.0.0.1', databaseUrl: DB, pgliteDir: 'memory://', ambientNpcs: 0, crowdNpcs: 0, lingerSeconds: 1, logLevel: 'warn', threats: false });
  base = `http://127.0.0.1:${app.port}`;
});
afterAll(async () => { for (const c of clients) c.close(); await app?.close(); });

async function join(name: string) {
  const token = await BotClient.registerAndCreate(base, name, 'solo', 'callejero');
  const b = new BotClient(base, name); clients.push(b);
  await b.connect(token, app.contentHash);
  return b;
}
const conn = (name: string) => [...app.world.conns.values()].find((c) => c.p?.name === name)!;
const city = () => app.world.zones.get('vertice')!;
/** Un sitio en la calle de un nivel de peligro, libre alrededor y sin cámaras cerca. */
function spot(level: string, camerasOk = false): [number, number] {
  const z = city();
  for (let y = 12; y < z.def.height - 12; y += 2) for (let x = 12; x < z.def.width - 12; x += 2) {
    if (dangerAt(z.grid, x, y) !== level) continue;
    let ok = true;
    for (let dx = -2; dx <= 2 && ok; dx++) for (let dy = -2; dy <= 2 && ok; dy++) if (!isWalkable(z.grid, x + dx + 0.5, y + dy + 0.5)) ok = false;
    if (!ok) continue;
    if (!camerasOk && [...z.query(x, y, 16)].some((o) => o.objKind === 'camera')) continue;
    if ([...z.query(x, y, 12)].some((o) => o.kind === 'npc')) continue;
    return [x + 0.5, y + 0.5];
  }
  throw new Error('sin sitio');
}
function npcAt(x: number, y: number, chrome: string[] = []): Entity {
  const e = app.world.spawnAmbient(city(), { x, y })!;
  e.x = x; e.y = y; e.path = []; e.npc!.nextThink = 1e9; e.zone.moved(e);
  e.chrome = chrome; e.level = 12;
  return e;
}

describe('v0.13 · cadáveres', () => {
  it('un muerto se queda una semana de juego, suelta sangre y se registra entero', async () => {
    const b = await join('saqueador');
    const c = conn('saqueador');
    const [x, y] = spot('lawless');
    await app.world.teleport(c, 'vertice', [x, y]);
    await b.until(() => c.e!.zone.id === 'vertice', 5000, 'calle');
    const victim = npcAt(x + 1, y, ['brazo_izq', 'ojos']);
    victim.weaponId = 'pistola-ligera';
    (app.world.combat as any).npcDeath(victim, c);
    const week = app.world.c.manifest.cityHourMs * 24 * 7;
    expect(victim.dead).toBe(true);
    expect(victim.downedUntil! - Date.now()).toBeGreaterThan(week - 5000);
    const blood = app.world.corpses.blood.find((s) => Math.hypot(s.x - victim.x, s.y - victim.y) < 0.1)!;
    expect(blood.until - Date.now()).toBeGreaterThan(BLOOD_MS - 5000);
    expect(victim.loot!.items['pistola-ligera']).toBe(1);
    expect(victim.loot!.chrome.length).toBeGreaterThanOrEqual(2);
    // Panel de saqueo: dinero, armas y objetos de una vez; el cromo pide Reparación.
    const view = b.waitFor((m) => m.t === 'lootView', 4000, 'panel');
    expect((await b.cmd({ t: 'loot', target: victim.id, kind: 'view' } as any)).ok).toBe(true);
    const v = (await view) as any;
    expect(v.money).toBeGreaterThan(0);
    expect(v.chrome.every((ch: any) => ch.blocked)).toBe(true);
    const money0 = c.p!.money, pist0 = c.p!.inventory.get('pistola-ligera') ?? 0;
    const r = await b.cmd({ t: 'loot', target: victim.id, kind: 'all' } as any);
    expect(r.ok).toBe(true);
    expect(c.p!.money).toBeGreaterThan(money0);
    expect(c.p!.inventory.get('pistola-ligera')).toBe(pist0 + 1);
    expect(victim.loot!.money).toBe(0);
    // Con Reparación suficiente, el cromo sale.
    c.p!.skillXp.reparacion = 1e6;
    const before = c.p!.cyber.length;
    await app.world.corpses.take(c, victim, 'chrome', victim.loot!.chrome[0]);
    expect(c.p!.cyber.length).toBe(before + 1);
  });

  it('meter un cadáver en un contenedor lo hace desaparecer; rebuscar y esconderse dentro', async () => {
    const b = await join('limpiador');
    const c = conn('limpiador');
    const z = city();
    const box = z.def.props.find((p) => p.type === 'dumpster' && [[0, 1], [1, 0], [0, -1], [-1, 0]].some(([dx, dy]) => isWalkable(z.grid, p.at[0] + dx + 0.5, p.at[1] + dy + 0.5)))!;
    const [dx, dy] = [[0, 1], [1, 0], [0, -1], [-1, 0]].find(([ax, ay]) => isWalkable(z.grid, box.at[0] + ax + 0.5, box.at[1] + ay + 0.5))!;
    await app.world.teleport(c, 'vertice', [box.at[0] + dx + 0.5, box.at[1] + dy + 0.5]);
    await b.until(() => c.e!.zone.id === 'vertice', 5000, 'calle');
    const victim = npcAt(c.e!.x, c.e!.y);
    (app.world.combat as any).npcDeath(victim, c);
    (app.world.combat as any).carry(c, victim);
    expect(c.p!.carrying).toBe(victim.id);
    expect((await b.cmd({ t: 'container', action: 'body' } as any)).ok).toBe(true);
    expect(app.world.entities.has(victim.id)).toBe(false);
    expect(c.p!.carrying).toBeNull();
    expect([...app.world.corpses.stuffed.values()].some((s) => s.bodies.includes(victim.name))).toBe(true);
    // Al rebuscar se encuentra el cuerpo (y nada más).
    const r = await b.cmd({ t: 'container', action: 'search' } as any);
    expect(r.ok).toBe(true);
    // Esconderse: nadie te ve; al moverte sales.
    expect((await b.cmd({ t: 'container', action: 'hide' } as any)).ok).toBe(true);
    expect(c.e!.hiddenIn).toBeTruthy();
    const watcher = npcAt(c.e!.x + 1.5, c.e!.y);
    expect(app.world.stealth.sees(watcher, c.e!)).toBe(false);
    b.raw({ t: 'steer', seq: 9001, dx: 1, dy: 0 });
    await b.until(() => !c.e!.hiddenIn, 3000, 'sale');
    b.raw({ t: 'steer', seq: 9002, dx: 0, dy: 0 });
  });

  it('un cadáver a la vista: alguien lo encuentra, llama a la PCV y las cámaras identifican al asesino', async () => {
    const b = await join('descuidado');
    const c = conn('descuidado');
    const [x, y] = spot('public');
    await app.world.teleport(c, 'vertice', [x, y]);
    await b.until(() => c.e!.zone.id === 'vertice', 5000, 'calle');
    const victim = npcAt(x + 1, y);
    (app.world.combat as any).npcDeath(victim, c);
    victim.corpse!.killer!.cam = true; // como si una cámara lo hubiera grabado
    victim.corpse!.diedAt -= 10000;
    const passer = npcAt(x + 4, y);
    passer.facing = 0;
    app.world.corpses.everySecond();
    expect(victim.corpse!.reportedAt).toBeTruthy();
    expect(victim.corpse!.reporter).toBe(passer.id);
    victim.corpse!.policeAt = Date.now() - 1;
    app.world.corpses.everySecond();
    expect([...city().query(victim.x, victim.y, 6)].filter((o) => o.npcType === 'police').length).toBeGreaterThanOrEqual(1);
    victim.corpse!.verdictAt = Date.now() - 1;
    const wanted0 = c.p!.wanted;
    app.world.corpses.everySecond();
    await b.until(() => !!c.p!.identified && c.p!.wanted > wanted0, 4000, 'identificado y buscado');
    // Después, la PCV se lleva el cuerpo.
    victim.corpse!.removeAt = Date.now() - 1;
    app.world.corpses.everySecond();
    expect(app.world.entities.has(victim.id)).toBe(false);
  });

  it('en una zona sin ley nadie llama a la policía', async () => {
    const b = await join('sinley');
    const c = conn('sinley');
    const [x, y] = spot('lawless');
    await app.world.teleport(c, 'vertice', [x, y]);
    await b.until(() => c.e!.zone.id === 'vertice', 5000, 'calle');
    const victim = npcAt(x + 1, y);
    (app.world.combat as any).npcDeath(victim, c);
    victim.corpse!.diedAt -= 10000;
    npcAt(x + 3, y);
    app.world.corpses.everySecond();
    expect(victim.corpse!.reportedAt).toBeUndefined();
  });
});
