// v0.8.1 · cuenta de administración del dueño y objetos míticos únicos en todo el servidor.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { createApp } from '../src/app.js';
import { BotClient } from '../../tools/loadtest/src/botclient.js';
import { LEGENDS } from '../src/world/legends.js';
import { OWNER_ADMIN, ensureAdminAccount } from '../src/world/admin.js';

const DB = process.env.TEST_DATABASE_URL;
let app: Awaited<ReturnType<typeof createApp>>;
let base = '';
const clients: BotClient[] = [];
let n = 0;
const op = () => `op-v081-${Date.now()}-${n++}`;

beforeAll(async () => {
  if (DB) { const c = new pg.Client({ connectionString: DB }); await c.connect(); await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); await c.end(); }
  app = await createApp({ port: 0, host: '127.0.0.1', databaseUrl: DB, pgliteDir: 'memory://', ambientNpcs: 4, crowdNpcs: 0, speedScale: 4, lingerSeconds: 1, logLevel: 'warn',
    cityHourMs: 60000, cityHourOffset: 12 - ((Date.now() / 60000) % 24), needsScale: 1, downedSeconds: 2, jobTimeScale: 0.05, threats: false });
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
const P = (name: string) => conn(name).p!;
/** Deja a la persona en el último encargo de una leyenda, aceptado, y lo completa matando a su jefe. */
async function finishFinal(name: string, legend: string) {
  const L = LEGENDS.find((l) => l.id === legend)!;
  const last = L.steps.length - 1;
  P(name).legends[legend] = { trust: 90, step: last, active: true, count: 0 };
  const g = L.steps[last].goal as any;
  await app.world.legends.event(conn(name), { type: 'boss', boss: g.boss });
  expect(P(name).legends[legend].done).toBe(true);
}
const owner = async (item: string) => (await app.db.query<any>('SELECT character_id FROM mythic_owners WHERE item_id=$1', [item])).rows[0]?.character_id;

describe('v0.8.1 · administración y míticos únicos', () => {
  it('cuenta «mataxhustaadmin»: existe al arrancar, es de administración, guarda solo el hash y nadie puede registrarla', async () => {
    const r = await app.db.query<any>("SELECT is_admin, pass_hash FROM accounts WHERE lower(username) = 'mataxhustaadmin'");
    expect(r.rows[0]?.is_admin).toBe(true);
    expect(r.rows[0]?.pass_hash).toBe(OWNER_ADMIN.passHash);
    await expect(BotClient.api(base, '/api/register', { username: 'MataxhustaAdmin', password: 'otra-clave-123' })).rejects.toThrow();
    // Si alguien hubiera cambiado la contraseña en la base de datos, al arrancar se restaura.
    await app.db.query("UPDATE accounts SET pass_hash = 'x', is_admin = false WHERE lower(username) = 'mataxhustaadmin'");
    await ensureAdminAccount(app.db);
    const again = await app.db.query<any>("SELECT is_admin, pass_hash FROM accounts WHERE lower(username) = 'mataxhustaadmin'");
    expect(again.rows[0]).toEqual({ is_admin: true, pass_hash: OWNER_ADMIN.passHash });
  });

  it('el primero que completa el encargo final se queda el mítico; los siguientes cobran a lo grande pero sin mítico', async () => {
    await join('primera'); await join('segundo');
    await finishFinal('primera', 'sable');
    expect(P('primera').inventory.get('matriz-eco')).toBe(1);
    expect(await owner('matriz-eco')).toBe(P('primera').charId);
    // La leyenda avisa a los demás de quién lo tiene.
    P('segundo').legends.sable = { trust: 90, step: LEGENDS.find((l) => l.id === 'sable')!.steps.length - 1, active: false, count: 0 };
    const view = app.world.legends.view(P('segundo'), LEGENDS.find((l) => l.id === 'sable')!);
    expect(view.reward).toMatch(/primera: solo matándole/);
    const money0 = P('segundo').money;
    await finishFinal('segundo', 'sable');
    expect(P('segundo').inventory.get('matriz-eco') ?? 0).toBe(0);
    expect(P('segundo').inventory.get('matriz-berserker')).toBe(1);
    expect(P('segundo').money - money0).toBeGreaterThanOrEqual(35000);
    expect(await owner('matriz-eco')).toBe(P('primera').charId);
  });

  it('un mítico no se vende ni se guarda en el maletero', async () => {
    const shop = app.world.c.shops.find((s) => s.fence)!;
    await expect(app.world.survival.market.sell(P('primera'), shop.id, 'matriz-eco', 1, op())).rejects.toThrow(/único/);
    await expect(app.world.property.trunkMove(conn('primera'), 'matriz-eco', 1, 'in')).rejects.toThrow(/mítico/);
  });

  it('matar al portador es la única forma de quitárselo: pasa al asesino (también CARMÍN insertada)', async () => {
    const victim = P('primera'), killer = P('segundo');
    victim.relics = { matrices: ['matriz-eco'], socketExtra: 0 };
    await app.world.survival.die(victim, conn('primera').e!, 'rematado', killer);
    expect(killer.inventory.get('matriz-eco')).toBe(1);
    expect(await owner('matriz-eco')).toBe(killer.charId);
    expect(app.world.mythics.holders.get('matriz-eco')?.name).toBe('segundo');
    const inv = await app.db.query<any>("SELECT character_id, qty FROM inventory_items WHERE def_id='matriz-eco' AND qty > 0");
    expect(inv.rows.map((r: any) => r.character_id)).toEqual([killer.charId]);
  });

  it('si el portador muere sin asesino, el mítico se pierde y la leyenda vuelve a ofrecerlo (Kairós «Cometa»)', async () => {
    await join('cometa'); await join('heredera');
    await finishFinal('cometa', 'teo');
    expect(P('cometa').cyber.some((c) => c.def === 'kairos-6')).toBe(true);
    await finishFinal('heredera', 'teo');
    expect(P('heredera').cyber.some((c) => c.def === 'kairos-6')).toBe(false);
    expect(P('heredera').cyber.some((c) => c.def === 'kairos-5')).toBe(true);
    const e = conn('cometa').e!; e.lastHitBy = undefined; e.lastAttacker = undefined;
    await app.world.survival.die(P('cometa'), e, 'un ciberpsicópata');
    expect(await owner('kairos-6')).toBeUndefined();
    await join('tercera');
    await finishFinal('tercera', 'teo');
    expect(P('tercera').cyber.some((c) => c.def === 'kairos-6')).toBe(true);
    expect(await owner('kairos-6')).toBe(P('tercera').charId);
  });
});
