// v0.3 · armas, KO y muerte, recompensas «vivo», cuerpos, red, facciones, Ámbar y policía.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
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
const fixRng = (v: number) => { app.world.survival.rng = () => v; };
const freeRng = () => { app.world.survival.rng = Math.random; };
const near = (a: string, x: number, y: number) => { E(a).x = x; E(a).y = y; E(a).path = []; };

describe('v0.3 · combate, red y ciudad', () => {
  it('la megápolis tiene siete distritos conectados y las bandas y la policía patrullan', () => {
    const ext = [...app.world.zones.values()].filter((z) => z.def.kind === 'exterior').map((z) => z.id).sort();
    expect(ext).toEqual(['arrabal', 'cenit', 'colinas', 'ferro', 'forja', 'neon-rojo', 'yermo']);
    const npcs = [...app.world.entities.values()];
    expect(npcs.some((e) => e.npcType === 'gang' && e.faction === 'engranajes' && e.zone.id === 'forja')).toBe(true);
    expect(npcs.some((e) => e.npcType === 'police' && e.zone.id === 'cenit')).toBe(true);
    expect(npcs.some((e) => e.npcType === 'police' && e.zone.id === 'forja')).toBe(false); // la PCV no entra en Forja
  });

  it('arma de fuego: gasta munición, tiene alcance y deja un cuerpo que se puede cargar (y pesa)', async () => {
    const a = await join('pistolera', 'solo', { REF: 8, LUCK: 3 });
    await a.enterDoor('Salida');
    const pa = P('pistolera');
    const civ = [...E('pistolera').zone.entities].find((e) => e.npcType === 'civil')!;
    civ.npc = undefined; civ.path = [];
    near('pistolera', civ.x + 4, civ.y);
    const ammo0 = pa.inventory.get('bala-pistola')!;
    fixRng(0.95);
    for (let i = 0; i < 6 && civ.state !== 'downed'; i++) { civ.fleeUntil = 0; civ.path = []; near('pistolera', civ.x + 4, civ.y); await a.cmd({ t: 'hostile', target: civ.id, action: 'attack', opId: op() }); await sleep(1100); }
    freeRng();
    expect(civ.state).toBe('downed');
    expect(civ.npcLethalDown).toBe(true);
    expect(pa.inventory.get('bala-pistola')!).toBeLessThan(ammo0);
    near('pistolera', civ.x + 1, civ.y);
    const r = await a.cmd({ t: 'hostile', target: civ.id, action: 'carry', opId: op() });
    expect(r.ok).toBe(true);
    expect(pa.carrying).toBe(civ.id);
    expect(app.world.combat.speedFactor(pa)).toBeLessThan(1); // 70 kg de más
    await a.cmd({ t: 'drop' });
    expect(pa.carrying).toBeNull();
    expect(pa.wanted).toBeGreaterThan(0); // Ferro tiene PCV: es un delito
  });

  it('recompensa «solo vivo»: dejarlo KO cobra; rematar a un derribado lo mata', async () => {
    const h = await join('cazador', 'solo', { REF: 8, LUCK: 3 });
    const t = await join('perseguido', 'tech');
    const pc = P('cazador'), pt = P('perseguido');
    const ins = await BotClient.api(base, '/api/login', { username: 'cazador', password: 'password1' });
    void ins;
    // Un tercero pone precio «vivo».
    const cl = await join('cliente3');
    const r = await cl.cmd({ t: 'bountyPlace', kind: 'player', target: 'perseguido', amount: 100, reason: 'Que pague lo que debe', aliveOnly: true, opId: op() });
    expect(r.ok).toBe(true);
    await h.enterDoor('Salida'); await t.enterDoor('Salida');
    pt.stance = 'defend'; pt.nextAttackAt = Date.now() + 1e9;
    await h.cmd({ t: 'equip', item: 'navaja' });
    const m0 = pc.money;
    fixRng(0.95);
    for (let i = 0; i < 10 && pt.status === 'alive'; i++) { near('cazador', E('perseguido').x + 1, E('perseguido').y); E('perseguido').path = []; await h.cmd({ t: 'hostile', target: E('perseguido').id, action: 'claim', opId: op() }); await sleep(1100); }
    freeRng();
    expect(pt.status).toBe('downed');
    expect(pt.downedLethal).toBe(false); // capturado vivo
    expect(pc.money).toBe(m0 + 100);
    // Ahora otro jugador lo remata: muerte definitiva.
    const k = await h.cmd({ t: 'hostile', target: E('perseguido').id, action: 'finish', opId: op() });
    expect(k.ok).toBe(true);
    await sleep(300);
    expect((await app.db.query<any>("SELECT status FROM characters WHERE name='perseguido'")).rows[0].status).toBe('dead');
    expect(await ledgerOk()).toBe(true);
  });

  it('netrunner: escanear, rango de red y saquear un cajero', async () => {
    const n = await join('hacker', 'netrunner', { INT: 8, LUCK: 3 });
    const p = P('hacker');
    await n.enterDoor('Salida');
    const atm = [...E('hacker').zone.entities].find((e) => e.objKind === 'atm')!;
    near('hacker', atm.x + 2, atm.y);
    expect(p.netRank).toBe(0);
    p.netXp = 8; p.netRank = 2; p.ram = 99;
    fixRng(0.95);
    const m0 = p.money;
    const menu = n.waitFor((m) => m.t === 'targetMenu', 3000, 'menú');
    await n.cmd({ t: 'menu', target: atm.id });
    const mv = (await menu as any).view;
    expect(mv.options.some((o: any) => o.id === 'hack:saquear-cajero')).toBe(true);
    const r = await n.cmd({ t: 'hack', target: atm.id, hack: 'saquear-cajero', opId: op() });
    expect(r.ok).toBe(true);
    await n.until(() => p.money > m0, 15000, 'botín del cajero');
    freeRng();
    expect(p.netXp).toBeGreaterThan(8);
    const again = await n.cmd({ t: 'hack', target: atm.id, hack: 'saquear-cajero', opId: op() });
    expect(again.ok).toBe(false); // cajero vacío
    expect(await ledgerOk()).toBe(true);
  });

  it('facciones: atacar a una banda baja la relación con ella y con sus aliados, y sube con sus enemigos', async () => {
    const g = await join('pendenciera', 'solo', { REF: 8, LUCK: 3 });
    const p = P('pendenciera');
    await app.world.combat.repChange(conn('pendenciera'), 'engranajes', -20, op());
    expect(p.rep.get('engranajes')).toBe(-20);
    expect(p.rep.get('chatarreros') ?? 0).toBeLessThan(0); // aliados (+30) bajan
    expect(p.rep.get('kitsune') ?? 0).toBeGreaterThan(0); // enemigos (−40) suben
    const fv = g.waitFor((m) => m.t === 'factions', 3000, 'facciones');
    await g.cmd({ t: 'factions' });
    const v = (await fv as any).view;
    expect(v.factions.find((f: any) => f.id === 'engranajes').territory).toContain('Forja');
  });

  it('Rescate Ámbar: con suscripción te rescatan; la PCV te detiene y se deja sobornar', async () => {
    const a = await join('asegurada');
    const p = P('asegurada');
    p.money = 1000;
    await app.db.query("INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,850,1000,'prueba')", [op(), p.charId]);
    await app.db.query('UPDATE characters SET money=1000 WHERE id=$1', [p.charId]);
    const r = await a.cmd({ t: 'ambar', plan: 'plata', opId: op() });
    expect(r.ok).toBe(true);
    expect(p.ambar?.plan).toBe('plata');
    await a.enterDoor('Salida');
    (app.world.c.ambar.find((x) => x.id === 'plata') as any).arrival = 1;
    app.world.survival.downed(conn('asegurada'), 'prueba', undefined, undefined, true);
    expect(p.status).toBe('downed');
    await a.until(() => p.status === 'alive', 8000, 'rescate Ámbar');
    expect(p.hp).toBeGreaterThan(10);
    expect(p.ambar!.usesLeft).toBe(0);
    // Soborno: borra el expediente.
    p.wanted = 1.8; // tasa: 250 × 2 = 500 €$
    const before = p.money;
    const b = await a.cmd({ t: 'bribe', opId: op() });
    expect(b.ok).toBe(true);
    expect(p.wanted).toBe(0);
    expect(p.money).toBe(before - 500);
    // Detención: KO por la PCV → multa, expediente limpio y comisaría.
    p.wanted = 2.5;
    await app.world.combat.arrest(conn('asegurada'));
    expect(p.wanted).toBe(0);
    expect(E('asegurada').zone.id).toBe('comisaria-int');
    expect(await ledgerOk()).toBe(true);
  });

  it('nivel de detalle: sin jugadores en una zona, sus transeúntes no se mueven', async () => {
    const z = app.world.zones.get('yermo')!;
    const civ = [...z.entities].find((e) => e.npc && e.npcType !== 'essential')!;
    const x0 = civ.x, y0 = civ.y;
    civ.path = [[civ.x + 5, civ.y]];
    await sleep(600);
    expect(civ.x).toBe(x0); expect(civ.y).toBe(y0);
  });
});
