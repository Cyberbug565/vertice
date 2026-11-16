// v0.8 · rarezas, Kairós (dilatación del tiempo), matrices (CARMÍN y ECO), Proyección de Eco, leyendas y sus guaridas,
// ciberespacio y el Velo, episodios largos de ciberpsicosis y la cuenta de pruebas con trucos.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { dangerAt, isWalkable } from '@vertice/shared';
import { createApp } from '../src/app.js';
import { BotClient } from '../../tools/loadtest/src/botclient.js';
import { effective } from '../src/game/player.js';
import type { Entity } from '../src/world/entity.js';

const DB = process.env.TEST_DATABASE_URL;
let app: Awaited<ReturnType<typeof createApp>>;
let base = '';
const clients: BotClient[] = [];
let n = 0;
const op = () => `op-v08-${Date.now()}-${n++}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  if (DB) { const c = new pg.Client({ connectionString: DB }); await c.connect(); await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); await c.end(); }
  app = await createApp({ port: 0, host: '127.0.0.1', databaseUrl: DB, pgliteDir: 'memory://', ambientNpcs: 6, crowdNpcs: 0, speedScale: 4, lingerSeconds: 1, logLevel: 'warn',
    cityHourMs: 60000, cityHourOffset: 12 - ((Date.now() / 60000) % 24), needsScale: 1, downedSeconds: 2, jobTimeScale: 0.05, threats: false });
  base = `http://127.0.0.1:${app.port}`;
});
afterAll(async () => { for (const c of clients) c.close(); await app?.close(); });

async function join(name: string, role = 'solo') {
  const token = await BotClient.registerAndCreate(base, name, role, 'callejero');
  const b = new BotClient(base, name); clients.push(b);
  await b.connect(token, app.contentHash);
  return b;
}
const conn = (name: string) => [...app.world.conns.values()].find((c) => c.p?.name === name)!;
const P = (name: string) => conn(name).p!;
const E = (name: string) => conn(name).e!;
const city = () => app.world.zones.get('vertice')!;
const put = (e: Entity, x: number, y: number) => { e.x = x; e.y = y; e.path = []; e.zone.moved(e); };
const install = (name: string, def: string) => P(name).cyber.push({ id: `t-${def}-${n++}`, def, location: 'installed', stolen: false });
function tileWhere(pred: (x: number, y: number) => boolean): [number, number] {
  const z = city();
  for (let y = 4; y < z.def.height - 4; y++) for (let x = 4; x < z.def.width - 4; x++) {
    let ok = true;
    for (let dx = 0; dx < 6 && ok; dx++) if (!isWalkable(z.grid, x + dx + 0.5, y + 0.5)) ok = false;
    if (ok && pred(x, y)) return [x, y];
  }
  throw new Error('sin loseta');
}
async function toLawless(b: BotClient, name: string) {
  const [x, y] = tileWhere((tx, ty) => dangerAt(city().grid, tx, ty) === 'lawless');
  await app.world.teleport(conn(name), 'vertice', [x, y]);
  await b.until(() => E(name).zone.id === 'vertice', 5000, 'en la calle');
  return [x, y] as const;
}
function civil(x: number, y: number) {
  const npc = [...city().entities].find((o) => o.kind === 'npc' && o.npcType === 'civil' && o.npcMax && !o.dead && o.state !== 'downed')!;
  put(npc, x, y); npc.npc!.pauseUntil = app.world.tick + 1e6;
  return npc;
}

describe('v0.8 · implantes, matrices, leyendas y ciberespacio', () => {
  it('contenido: rarezas, seis Kairós, zócalo, ciberespacio, el Velo y las tres guaridas', () => {
    const cw = app.world.c.cyberware;
    expect(cw.every((d) => !!d.rarity)).toBe(true);
    expect(cw.filter((d) => d.id.startsWith('kairos-')).length).toBe(6);
    expect(cw.find((d) => d.id === 'kairos-6')?.rarity).toBe('mitico');
    expect(app.world.zones.get('ciberespacio')?.def.cyber).toBe(true);
    expect([...app.world.zones.get('ciberespacio')!.entities].some((e) => e.faction === 'ias-salvajes')).toBe(true);
    for (const z of ['guarida-iris', 'refugio-sable', 'garaje-cometa']) expect([...app.world.zones.get(z)!.entities].some((e) => e.legendId)).toBe(true);
  });

  it('matrices: CARMÍN no ocupa cromo, da capacidad y no se puede quitar; ECO da salud', async () => {
    const b = await join('portadora');
    const p = P('portadora');
    install('portadora', 'zocalo-matrices');
    p.inventory.set('matriz-carmin', 1); p.inventory.set('matriz-eco', 1);
    await app.db.query("INSERT INTO inventory_items (id, character_id, def_id, qty) VALUES (gen_random_uuid(),$1,'matriz-carmin',1),(gen_random_uuid(),$1,'matriz-eco',1)", [p.charId]);
    const cap0 = effective(app.world.c, p).chromeCapacity, used0 = effective(app.world.c, p).chromeUsed, hp0 = effective(app.world.c, p).hpMax;
    expect((await b.cmd({ t: 'matrix', action: 'equip', item: 'matriz-carmin' })).ok).toBe(true);
    expect(effective(app.world.c, p).chromeCapacity).toBe(cap0 + 25);
    expect(effective(app.world.c, p).chromeUsed).toBe(used0);
    expect(effective(app.world.c, p).matrix.hackImmune).toBe(true);
    const no = await b.cmd({ t: 'matrix', action: 'remove', item: 'matriz-carmin' });
    expect(no.ok).toBe(false);
    expect((await b.cmd({ t: 'matrix', action: 'equip', item: 'matriz-eco' })).ok).toBe(true);
    expect(effective(app.world.c, p).hpMax).toBe(hp0 + 60);
    // CARMÍN corta cualquier hemorragia.
    p.body.bleed = 2;
    app.world.relics.everySecond();
    expect(p.body.bleed).toBe(0);
  });

  it('Kairós: ralentiza a quien está dentro de la zona, acelera al usuario, gasta RAM y luego salud; al apagarlo, agotamiento', async () => {
    const b = await join('veloz');
    const p = P('veloz');
    const [x, y] = await toLawless(b, 'veloz');
    install('veloz', 'kairos-4');
    const other = civil(x + 3.5, y + 0.5);
    put(E('veloz'), x + 0.5, y + 0.5);
    p.ram = 20;
    expect((await b.cmd({ t: 'ability', id: 'kairos-4' })).ok).toBe(true);
    app.world.relics.dilation();
    expect(other.timeScale!).toBeLessThan(0.6);
    expect(E('veloz').timeScale!).toBeGreaterThan(1.3);
    for (let i = 0; i < 8; i++) app.world.relics.everySecond();
    expect(p.ram).toBe(0);
    const hp = p.hp;
    app.world.relics.everySecond();
    expect(p.hp).toBeLessThan(hp);
    expect((await b.cmd({ t: 'ability', id: 'kairos-4' })).ok).toBe(true);
    expect(p.kairos).toBeUndefined();
    expect(p.stamina).toBe(0);
    app.world.relics.dilation();
    expect(other.timeScale).toBeUndefined();
  });

  it('Proyección de Eco: el fantasma solo lo ve su dueño, atraviesa paredes y un pulso EMP lo corta con aturdimiento', async () => {
    const b = await join('medium');
    const o = await join('mirona');
    const p = P('medium');
    const [x, y] = await toLawless(b, 'medium');
    await app.world.teleport(conn('mirona'), 'vertice', [x + 2, y]);
    await o.until(() => E('mirona').zone.id === 'vertice', 5000, 'en la calle');
    install('medium', 'zocalo-matrices');
    p.relics = { matrices: ['matriz-eco'], socketExtra: 0 };
    const body = E('medium');
    expect((await b.cmd({ t: 'ability', id: 'matriz-eco' })).ok).toBe(true);
    const ghost = E('medium');
    expect(ghost).not.toBe(body);
    expect(ghost.ghostOf).toBe(body.id);
    await sleep(400);
    const seen = (app.world as any).conns.get(conn('mirona').accountId).known as Map<number, unknown>;
    expect(seen.has(ghost.id)).toBe(false);
    expect(seen.has(body.id)).toBe(true);
    // Atraviesa lo que sea (aunque haya un edificio delante).
    put(ghost, x + 0.5, y + 0.5);
    b.raw({ t: 'steer', seq: 990, dx: 0, dy: -1 });
    await b.until(() => ghost.y < y - 2, 5000, 'avanza sin chocar');
    b.raw({ t: 'steer', seq: 991, dx: 0, dy: 0 });
    app.world.relics.emp('vertice', body.x, body.y, 4);
    expect(E('medium')).toBe(body);
    expect(body.stunUntil!).toBeGreaterThan(Date.now() + 10000);
  });

  it('leyendas: la guarida se cierra sin la confianza de su gente; con ella, encargos que avanzan y un jefe que aparece', async () => {
    const b = await join('aspirante', 'netrunner');
    const p = P('aspirante');
    await app.world.teleport(conn('aspirante'), 'nodo-vacio-int', [9, 4]);
    await b.until(() => E('aspirante').zone.id === 'nodo-vacio-int', 5000, 'en el Nodo');
    const door = [...E('aspirante').zone.entities].find((e) => e.kind === 'door' && e.doorTo?.zone === 'guarida-iris')!;
    expect(door).toBeTruthy();
    p.rep.set('red-bisagra', -50); p.netRank = 0;
    await (app.world as any).transferPlayer(conn('aspirante'), door);
    expect(E('aspirante').zone.id).toBe('nodo-vacio-int');
    p.rep.set('red-bisagra', 30);
    await (app.world as any).transferPlayer(conn('aspirante'), door);
    expect(E('aspirante').zone.id).toBe('guarida-iris');
    const iris = [...E('aspirante').zone.entities].find((e) => e.legendId === 'leyenda-iris')!;
    put(E('aspirante'), iris.x + 1, iris.y);
    expect((await b.cmd({ t: 'legend', legend: 'iris', action: 'accept' })).ok).toBe(true);
    for (let i = 0; i < 5; i++) await app.world.legends.event(conn('aspirante'), { type: 'hack' });
    expect(p.legends.iris.step).toBe(1);
    expect(p.legends.iris.trust).toBeGreaterThan(0);
    // Encargo de jefe (Sable, el convoy de Forja): el jefe aparece al llegar y, si cae, se cumple.
    p.legends.sable = { trust: 50, step: 2, active: true, count: 0 };
    const d = city().def.districts.find((x) => x.id === 'forja')!;
    await app.world.teleport(conn('aspirante'), 'vertice', d.waypoints[Math.floor(d.waypoints.length / 2)] as [number, number]);
    await b.until(() => E('aspirante').zone.id === 'vertice', 5000, 'en Forja');
    await app.world.legends.tick();
    const boss = [...city().entities].find((e) => e.legendBoss?.legend === 'sable')!;
    expect(boss?.name).toMatch(/Brutus/);
    boss.dead = true; boss.state = 'downed';
    await app.world.legends.tick();
    expect(p.legends.sable.step).toBe(3);
    expect((p.inventory.get('ampliacion-zocalo') ?? 0)).toBeGreaterThan(0);
  });

  it('ciberespacio: silla de inmersión para entrar, nodo para salir; el Velo solo con Iris en su último encargo', async () => {
    const b = await join('buceadora');
    const p = P('buceadora');
    await app.world.teleport(conn('buceadora'), 'torre-halcon-p5', [17, 4]);
    await b.until(() => E('buceadora').zone.id === 'torre-halcon-p5', 5000, 'en la planta 5');
    await app.world.legends.jackIn(conn('buceadora'), 'silla');
    await b.until(() => E('buceadora').zone.id === 'ciberespacio', 5000, 'en la Malla');
    const veloDoor = [...E('buceadora').zone.entities].find((e) => e.kind === 'door' && e.doorTo?.zone === 'velo')!;
    await (app.world as any).transferPlayer(conn('buceadora'), veloDoor);
    expect(E('buceadora').zone.id).toBe('ciberespacio');
    p.legends.iris = { trust: 100, step: 4, active: true, count: 0 };
    await (app.world as any).transferPlayer(conn('buceadora'), veloDoor);
    expect(E('buceadora').zone.id).toBe('velo');
    await app.world.legends.jackOut(conn('buceadora'));
    await b.until(() => E('buceadora').zone.id === 'torre-halcon-p5', 5000, 'de vuelta');
  });

  it('ciberpsicosis: el episodio dura semanas de juego y el nivel no baja de su suelo; la Matriz ECO lo anula', async () => {
    const b = await join('rota');
    const p = P('rota');
    const th = app.world.threats as any;
    p.psyche = { level: 44, heavy: 0, peak: 0 };
    th.psychoGain(conn('rota'), p, 2);
    expect(p.psyche.episode).toBeTruthy();
    const day = app.world.c.manifest.cityHourMs * 24;
    expect(p.psyche.episode!.until - Date.now()).toBeGreaterThan(6 * day);
    p.psyche.level = 46;
    th.psyche(conn('rota'), p, E('rota'));
    expect(p.psyche.level).toBeGreaterThanOrEqual(p.psyche.episode!.floor);
    expect((app.world.survival as any).sheetOf(p).psyche.episode.days).toBeGreaterThan(6);
    install('rota', 'zocalo-matrices');
    p.relics = { matrices: ['matriz-eco'], socketExtra: 0 };
    th.psyche(conn('rota'), p, E('rota'));
    expect(p.psyche.level).toBe(0);
    expect(p.psyche.episode).toBeUndefined();
    void b;
  });

  it('cuenta de pruebas: «admintester» existe, entra con todo desbloqueado y usa trucos; los demás no', async () => {
    const r = await app.db.query<any>("SELECT is_admin FROM accounts WHERE lower(username) = 'admintester'");
    expect(r.rows[0]?.is_admin).toBe(true);
    const login = await BotClient.api(base, '/api/login', { username: 'admintester', password: 'admintester' });
    await BotClient.api(base, '/api/characters', { name: 'Admin Tester', origin: 'callejero', role: 'solo', attributes: { INT: 6, REF: 6, DEX: 5, TECH: 6, COOL: 6, WILL: 5, LUCK: 5, MOVE: 5, BODY: 5, EMP: 6 }, appearance: { skin: '#c89070', hair: '#1a1a1a', jacket: '#40506a', accent: '#43f3ff' } }, login.token);
    const a = new BotClient(base, 'Admin Tester'); clients.push(a);
    await a.connect(login.token, app.contentHash);
    const pa = P('Admin Tester');
    await a.until(() => pa.flags.has('admin-desbloqueado'), 8000, 'todo desbloqueado');
    expect(pa.level).toBe(30);
    expect(pa.money).toBeGreaterThanOrEqual(1_000_000);
    expect(pa.cyber.some((c) => c.def === 'kairos-6' && c.location === 'installed')).toBe(true);
    expect((await a.cmd({ t: 'cheat', cmd: 'spawn', arg: 'ciberpsicopata' })).ok).toBe(true);
    const normal = await join('tramposa');
    const no = await normal.cmd({ t: 'cheat', cmd: 'money', n: 1e9 });
    expect(no.ok).toBe(false);
  });
});
