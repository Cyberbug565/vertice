// v0.7 · WASD, guardia (apuntar y bloquear), curar por zonas, cromo que no sangra, chat global, recompensas generadas,
// maleantes y víctimas, policía con tiempo de llegada, ciberpsicópatas y ciberpsicosis.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { dangerAt, isWalkable, skillXpFor } from '@vertice/shared';
import { createApp } from '../src/app.js';
import { BotClient } from '../../tools/loadtest/src/botclient.js';
import type { Entity } from '../src/world/entity.js';

const DB = process.env.TEST_DATABASE_URL;
let app: Awaited<ReturnType<typeof createApp>>;
let base = '';
const clients: BotClient[] = [];
let n = 0;
const op = () => `op-v07-${Date.now()}-${n++}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  if (DB) { const c = new pg.Client({ connectionString: DB }); await c.connect(); await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); await c.end(); }
  app = await createApp({ port: 0, host: '127.0.0.1', databaseUrl: DB, pgliteDir: 'memory://', ambientNpcs: 6, crowdNpcs: 0, speedScale: 4, lingerSeconds: 1, logLevel: 'warn',
    cityHourMs: 60000, cityHourOffset: 12 - ((Date.now() / 60000) % 24), needsScale: 1, downedSeconds: 2, jobTimeScale: 0.05, threats: false });
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
const city = () => app.world.zones.get('vertice')!;
const put = (e: Entity, x: number, y: number) => { e.x = x; e.y = y; e.path = []; e.zone.moved(e); };
function tileWhere(pred: (x: number, y: number) => boolean): [number, number] {
  const z = city();
  for (let y = 4; y < z.def.height - 4; y++) for (let x = 4; x < z.def.width - 4; x++) {
    let ok = true;
    for (let dx = 0; dx < 4 && ok; dx++) if (!isWalkable(z.grid, x + dx + 0.5, y + 0.5)) ok = false;
    if (ok && pred(x, y)) return [x, y];
  }
  throw new Error('sin loseta');
}
async function toStreet(b: BotClient, name: string, danger: string) {
  const [x, y] = tileWhere((tx, ty) => dangerAt(city().grid, tx, ty) === danger && ![...city().query(tx, ty, 12)].some((o) => o.objKind === 'camera'));
  await app.world.teleport(conn(name), 'vertice', [x, y]);
  await b.until(() => E(name).zone.id === 'vertice', 5000, 'en la calle');
  for (const o of [...city().query(x, y, 30)]) if (o.npcType === 'police' || o.npcType === 'gang') put(o, 5, 5);
  return [x, y] as const;
}

describe('v0.7 · controles, cuerpo, chat y amenazas', () => {
  it('WASD: el personaje avanza en la dirección pedida y se para al soltar', async () => {
    const b = await join('andarina');
    const [x, y] = await toStreet(b, 'andarina', 'public');
    const e = E('andarina');
    put(e, x + 0.5, y + 0.5);
    b.raw({ t: 'steer', seq: 900, dx: 1, dy: 0 });
    await b.until(() => e.x > x + 1.6, 5000, 'avanzar');
    b.raw({ t: 'steer', seq: 901, dx: 0, dy: 0 });
    await sleep(200);
    const stopX = e.x;
    await sleep(300);
    expect(e.x).toBeCloseTo(stopX, 3);
    expect(Math.abs(e.y - (y + 0.5))).toBeLessThan(0.05);
  });

  it('guardia: apuntar con el clic derecho da tiro seguro; bloquear con arma cuerpo a cuerpo reduce el golpe', async () => {
    const a = await join('apuntadora', 'solo', { REF: 8, LUCK: 3 });
    const d = await join('bloqueador', 'solo', { BODY: 8, LUCK: 2 });
    const [x, y] = await toStreet(a, 'apuntadora', 'lawless');
    await app.world.teleport(conn('bloqueador'), 'vertice', [x + 3, y]);
    await d.until(() => E('bloqueador').zone.id === 'vertice', 5000, 'en la calle');
    put(E('apuntadora'), x + 0.5, y + 0.5); put(E('bloqueador'), x + 3.5, y + 0.5);
    const pa = P('apuntadora'), pd = P('bloqueador');
    pa.equipped = 'pistola-ligera'; pa.inventory.set('pistola-ligera', 1); pa.inventory.set('bala-ligera', 30); pa.inventory.set('municion-ligera', 30);
    pd.hp = 60; pd.stance = 'avoid';
    expect((await a.cmd({ t: 'guard', on: true })).ok).toBe(true);
    E('apuntadora').guardSince = Date.now() - 5000;
    app.world.combat.rng = () => 0.01; // tiradas pésimas: solo el tiro seguro acierta
    await app.world.combat.attack(conn('apuntadora'), E('bloqueador'), true, op());
    app.world.combat.rng = Math.random;
    expect(Object.keys(pd.body.wounds).length).toBeGreaterThan(0);
    // Bloqueo: el mismo golpe de puños hace mucho menos daño si se defiende con un arma cuerpo a cuerpo.
    pd.equipped = 'navaja'; pd.inventory.set('navaja', 1);
    pa.equipped = null; pa.nextAttackAt = 0;
    E('apuntadora').guard = false;
    put(E('apuntadora'), x + 2.6, y + 0.5);
    const hit = async () => { pd.hp = 60; pd.body = { wounds: {}, lost: [], bleed: 0 }; pa.nextAttackAt = 0; app.world.combat.rng = () => 0.99; await app.world.combat.attack(conn('apuntadora'), E('bloqueador'), false, op()); app.world.combat.rng = Math.random; return 60 - pd.hp; };
    const open = await hit();
    E('bloqueador').guard = true;
    const blocked = await hit();
    E('bloqueador').guard = false;
    expect(blocked).toBeLessThan(open);
  });

  it('curar heridas: la venda corta la hemorragia de esa herida; el cromo no sangra', async () => {
    const b = await join('herida');
    const p = P('herida');
    // Partida antigua (solo daño por zonas): se convierte en contusiones.
    p.body = { wounds: { pierna_izq: 22 }, lost: [], bleed: 0 };
    expect(app.world.combat.wounds.bodyOf(E('herida'), p).wounds.pierna_izq).toBe(22);
    p.body = { wounds: {}, lost: [], bleed: 0, list: [], seq: 0 };
    app.world.combat.rng = () => 0.99;
    app.world.combat.wounds.hit(E('herida'), p, 'pierna_izq', 14, { id: 'navaja', w: app.world.c.items.find((i) => i.id === 'navaja')!.weapon! }, true);
    app.world.combat.rng = Math.random;
    const w = p.body.list![0];
    expect(w.kind).toBe('corte');
    expect(p.body.bleed).toBeGreaterThan(0.05);
    p.inventory.set('venda', 2);
    await app.db.query("INSERT INTO inventory_items (id, character_id, def_id, qty) VALUES (gen_random_uuid(), $1, 'venda', 2) ON CONFLICT (character_id, def_id) DO UPDATE SET qty = 2", [p.charId]);
    expect((await b.cmd({ t: 'treat', wound: w.id, action: 'vendar', opId: op() })).ok).toBe(true);
    expect(w.bandaged).toBe(true);
    expect(p.body.bleed).toBe(0);
    expect(p.inventory.get('venda')).toBe(1);
    // Cromo: no sangra ni abre heridas (se repara en un matasanos).
    p.cyber.push({ id: 'test-brazo', def: 'brazo-protesico', location: 'installed', stolen: false, part: 'brazo_der' });
    p.body.wounds.brazo_der = 30;
    const sheet = (app.world.survival as any).sheetOf(p);
    expect(sheet.body.chrome).toContain('brazo_der');
    expect(sheet.body.broken).toContain('brazo_der');
    const before = p.body.list!.length;
    app.world.combat.wounds.hit(E('herida'), p, 'brazo_der', 20, { id: 'navaja', w: app.world.c.items.find((i) => i.id === 'navaja')!.weapon! }, true);
    expect(p.body.bleed).toBe(0);
    expect(p.body.list!.length).toBe(before);
    p.cyber = p.cyber.filter((c) => c.id !== 'test-brazo');
  });

  it('chat: el local llega a quien está cerca; el global, a toda la ciudad', async () => {
    const a = await join('pregonera');
    const b = await join('lejano');
    await app.world.teleport(conn('lejano'), 'bar-rele', app.world.zones.get('bar-rele')!.def.safePoint as [number, number]);
    await b.until(() => E('lejano').zone.id === 'bar-rele', 5000, 'en el bar');
    const got = b.waitFor((m) => m.t === 'chat' && (m as any).channel === 'global', 3000, 'global');
    expect((await a.cmd({ t: 'chat', channel: 'global', text: 'Hola, Vértice' })).ok).toBe(true);
    expect(((await got) as any).text).toBe('Hola, Vértice');
    let local = false;
    const unsub = b.waitFor((m) => m.t === 'chat' && (m as any).channel === 'local', 1200, 'local').then(() => { local = true; }).catch(() => {});
    await a.cmd({ t: 'chat', channel: 'local', text: 'solo para los de aquí' });
    await unsub;
    expect(local).toBe(false);
  });

  it('recompensas generadas: más alta, más fuerte y con escoltas; tope de la ciudad', async () => {
    const th = app.world.threats;
    const [x, y] = tileWhere((tx, ty) => dangerAt(city().grid, tx, ty) === 'lawless');
    const small = await th.spawnBounty({ tier: 0, at: { x: x + 0.5, y: y + 0.5 } });
    const big = await th.spawnBounty({ tier: 3, at: { x: x + 1.5, y: y + 0.5 } });
    expect(small && big).toBeTruthy();
    expect(big!.npcMax!).toBeGreaterThan(small!.npcMax!);
    expect(big!.lootTier).toBeGreaterThan(small!.lootTier!);
    const escorts = [...city().entities].filter((o) => o.escortOf === big!.id);
    expect(escorts.length).toBeGreaterThanOrEqual(3);
    expect(app.world.survival.bounties.onNpc(big!.fugitive!.id).length).toBe(1);
    // Tope: la ciudad no publica más de GAME_BOUNTY_CAP a la vez.
    const { GAME_BOUNTY_CAP } = await import('../src/world/threats.js');
    while (th.gen.size < GAME_BOUNTY_CAP) await th.spawnBounty({ tier: 0, at: { x: x + 0.5, y: y + 0.5 } });
    expect(await th.spawnBounty({ tier: 0 })).toBeNull();
    // Si el objetivo muere, su recompensa desaparece y deja hueco.
    small!.dead = true;
    th.enabled = true; await th.tick(); th.enabled = false;
    expect(th.gen.size).toBe(GAME_BOUNTY_CAP - 1);
  });

  it('maleantes: atacan a civiles, la víctima reacciona y una cámara avisa a la PCV, que llega al rato', async () => {
    const b = await join('testigo');
    const [x, y] = await toStreet(b, 'testigo', 'public');
    const z = city();
    const thug = app.world.threats.spawnPredator(z, [x, y])!;
    const civ = [...z.entities].find((o) => o.npcType === 'civil' && o.npcMax && !o.dead && o.state !== 'downed')!;
    put(thug, x + 0.5, y + 0.5); put(civ, x + 1.5, y + 0.5);
    civ.npc!.pauseUntil = app.world.tick + 1e6;
    thug.aggro = civ.id; thug.aggroLethal = true; thug.nextAttackAt = 0;
    app.world.combat.rng = () => 0.99;
    const hp0 = civ.npcHp!;
    app.world.combat.npcThink(thug);
    app.world.combat.rng = Math.random;
    expect(civ.npcHp!).toBeLessThan(hp0);
    expect(civ.fleeUntil || civ.callingUntil || civ.aggro !== undefined).toBeTruthy();
    // Aviso a la PCV: llega cuando toca (según la distancia a patrullas y comisarías).
    const cops0 = [...z.entities].filter((o) => o.npcType === 'police').length;
    app.world.threats.report(thug, 'camara');
    const inc = (app.world.threats as any).incidents.find((i: any) => i.offender === thug.id);
    expect(inc).toBeTruthy();
    expect(inc.eta).toBeGreaterThan(Date.now());
    inc.eta = Date.now() - 1;
    app.world.threats.enabled = true; await app.world.threats.tick(); app.world.threats.enabled = false;
    const cops = [...z.entities].filter((o) => o.npcType === 'police');
    expect(cops.length).toBeGreaterThan(cops0);
    expect(cops.some((o) => o.aggro === thug.id && o.aggroLethal)).toBe(true);
  });

  it('ciberpsicópatas: muy fuertes, con recompensa y cromo extraíble con Reparación suficiente', async () => {
    const b = await join('mecanica');
    const [x, y] = await toStreet(b, 'mecanica', 'lawless');
    const psy = (await app.world.threats.spawnPsycho({ x: x + 2.5, y: y + 0.5 }))!;
    expect(psy.npcType).toBe('psycho');
    expect(psy.npcMax!).toBeGreaterThan(500);
    expect(psy.lootChrome!.length).toBeGreaterThanOrEqual(3);
    expect(app.world.survival.bounties.onNpc(psy.fugitive!.id)[0].amount).toBeGreaterThanOrEqual(5000);
    // Muerto, se puede extraer su cromo… si sabes.
    psy.dead = true; psy.state = 'downed';
    put(psy, E('mecanica').x + 1, E('mecanica').y);
    const p = P('mecanica');
    const first = psy.lootChrome![0];
    p.skillXp.reparacion = 0;
    const no = await b.cmd({ t: 'hostile', target: psy.id, action: 'extract', chrome: first, opId: op() });
    expect(no.ok).toBe(false); expect(no.reason).toMatch(/Reparación/);
    p.skillXp.reparacion = skillXpFor(22);
    expect((await b.cmd({ t: 'hostile', target: psy.id, action: 'extract', chrome: first, opId: op() })).ok).toBe(true);
    expect(p.cyber.some((c) => c.def === first && c.location === 'inventory')).toBe(true);
  });

  it('ciberpsicosis: pasarse del límite de cromo sube el nivel sin síntomas visibles al principio; tras mucho tiempo, quitarse cromo baja la tolerancia', async () => {
    const b = await join('cromada');
    const p = P('cromada');
    const th = app.world.threats as any;
    // Mucho cromo encima (más que su capacidad).
    for (const id of ['esqueleto-titanio', 'reflejos-sobrealimentados', 'acelerador-neural', 'segundo-corazon', 'camuflaje-optico']) p.cyber.push({ id: `t-${id}`, def: id, location: 'installed', stolen: false });
    p.psyche = { level: 0, heavy: 0, peak: 0 };
    for (let i = 0; i < 60; i++) th.psyche(conn('cromada'), p, E('cromada'));
    expect(p.psyche.level).toBeGreaterThan(0);
    expect((app.world.survival as any).sheetOf(p).psychosis).toBeNull(); // al principio no se nota
    p.psyche.level = 80;
    expect((app.world.survival as any).sheetOf(p).psychosis).toBe('Ciberpsicosis');
    p.psyche.heavy = 3600; p.psyche.peak = 90;
    const cap0 = (await import('../src/game/player.js')).effective(app.world.c, p).chromeCapacity;
    app.world.threats.onRemoval(conn('cromada'));
    const cap1 = (await import('../src/game/player.js')).effective(app.world.c, p).chromeCapacity;
    expect(cap1).toBeLessThan(cap0);
    p.cyber = p.cyber.filter((c) => !c.id.startsWith('t-'));
    void b;
  });
});
