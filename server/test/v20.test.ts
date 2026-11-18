// v0.20 · El jugador manda siempre (sin retirada automática al recibir un disparo), golpes al aire y con las manos vacías,
// y calles conectadas (ningún extremo de calzada muere en la acera).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { createApp } from '../src/app.js';
import { BotClient } from '../../tools/loadtest/src/botclient.js';

const DB = process.env.TEST_DATABASE_URL;
let app: Awaited<ReturnType<typeof createApp>>;
let base = '';
const clients: BotClient[] = [];
let n = 0;
const op = () => `op-v20-${Date.now()}-${n++}`;
beforeAll(async () => {
  if (DB) { const c = new pg.Client({ connectionString: DB }); await c.connect(); await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); await c.end(); }
  app = await createApp({ port: 0, host: '127.0.0.1', databaseUrl: DB, pgliteDir: 'memory://', ambientNpcs: 0, crowdNpcs: 0, lingerSeconds: 1, logLevel: 'warn', threats: false });
  base = `http://127.0.0.1:${app.port}`;
});
afterAll(async () => { for (const c of clients) c.close(); await app?.close(); });
async function join(name: string) {
  const token = await BotClient.registerAndCreate(base, name, 'solo', 'callejero', {});
  const b = new BotClient(base, name); clients.push(b);
  await b.connect(token, app.contentHash);
  return b;
}
const conn = (name: string) => [...app.world.conns.values()].find((c) => c.p?.name === name)!;
const city = () => app.world.zones.get('vertice')!;

describe('v0.20', () => {
  it('al recibir un golpe con la postura «Evitar» no sales corriendo solo (salvo en modo automático)', async () => {
    await join('pacifica');
    const c = conn('pacifica'), p = c.p!, e = c.e!;
    await app.world.teleport(c, 'vertice', [69, 177]);
    await new Promise((r) => setTimeout(r, 300));
    p.stance = 'avoid'; p.auto.on = false; e.path = [];
    (app.world.combat as any).counter(e, e);
    expect(e.path.length).toBe(0);
    expect(e.pendingAction).toBeUndefined();
  });

  it('con las manos vacías el golpe se lanza aunque no haya nadie (golpe al aire)', async () => {
    const b = clients[0];
    const c = conn('pacifica'), p = c.p!;
    p.equipped = null as any; p.nextAttackAt = 0;
    const fx = b.waitFor((m) => m.t === 'fx' && (m as any).kind === 'hit' && (m as any).from === c.e!.id, 3000, 'fx');
    const r = await b.cmd({ t: 'swing', dx: 1, dy: 0, opId: op() });
    expect(r.ok).toBe(true);
    const m = (await fx) as any;
    expect(m.hit).toBe(false);
    expect(p.nextAttackAt).toBeGreaterThan(Date.now());
  });

  it('el golpe hacia alguien a tiro le alcanza', async () => {
    const c = conn('pacifica'), p = c.p!, e = c.e!;
    p.nextAttackAt = 0;
    const z = city();
    const t = (app.world as any).addEntity(z, { kind: 'npc', name: 'Saco', x: e.x + 1, y: e.y, interactive: true, speed: 0 });
    t.npcType = 'civil'; t.npcMax = 500; t.npcHp = 500; t.defense = -50;
    (app.world.combat as any).rng = () => 0.99;
    const before = t.npcHp;
    await app.world.combat.swing(c, 1, 0, false, op());
    (app.world.combat as any).rng = Math.random;
    expect(t.npcHp).toBeLessThan(before);
  });

  it('las calzadas de barrio llegan hasta otra calzada (no mueren en un paso de peatones)', () => {
    const z = city().def, W = z.width, H = z.height;
    const g: string[] = new Array(W * H).fill(z.base);
    for (const r of z.ground) for (let y = Math.max(0, r.rect[1]); y < Math.min(H, r.rect[1] + r.rect[3]); y++) for (let x = Math.max(0, r.rect[0]); x < Math.min(W, r.rect[0] + r.rect[2]); x++) g[y * W + x] = r.type;
    const road = (x: number, y: number) => x < 0 || y < 0 || x >= W || y >= H || g[y * W + x] === 'asphalt' || g[y * W + x] === 'crosswalk';
    let dead = 0;
    for (const r of z.ground.filter((gg) => gg.type === 'asphalt' && Math.min(gg.rect[2], gg.rect[3]) >= 3 && Math.max(gg.rect[2], gg.rect[3]) >= 12)) {
      const [x, y, w, h] = r.rect, horiz = w >= h;
      for (const end of [0, 1]) {
        let ok = 0, tot = 0;
        for (let k = 0; k < (horiz ? h : w); k++) { tot++; if (horiz ? road(end ? x + w : x - 1, y + k) : road(x + k, end ? y + h : y - 1)) ok++; }
        if (ok < tot * 0.6) dead++;
      }
    }
    expect(dead).toBe(0);
  });
});
