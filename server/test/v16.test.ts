// v0.16 · Guantes (hueco «manos»), gama del cromo visible en el aspecto (de chatarra a lujo) y la superarmadura
// «Tormenta» como mítico único: no se vende y es la recompensa del último encargo de Teo (el convoy del Proyecto TORMENTA).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { createApp } from '../src/app.js';
import { BotClient } from '../../tools/loadtest/src/botclient.js';
import { wornAppearance } from '../src/game/player.js';
import { BOSSES, LEGENDS } from '../src/world/legends.js';

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
  return [...app.world.conns.values()].find((x) => x.p?.name === name)!;
}

describe('v0.16', () => {
  it('los guantes van en su hueco y salen en el aspecto', async () => {
    const c = await join('guantes1');
    const w = app.world as any;
    expect(w.c.shops.some((s: any) => (s.stock['guantes-led'] ?? 0) > 0)).toBe(true);
    await w.admin.give(c.p, 'guantes-led');
    w.survival.wear(c, 'manos', 'guantes-led');
    const a = wornAppearance(w.c, c.p!) as any;
    expect(a.gloves).toBe('led');
    expect(() => w.survival.wear(c, 'manos', 'gorra-neon')).toThrow();
  });

  it('el aspecto lleva la gama del cromo visible de cada parte', async () => {
    const c = await join('cromo1');
    const w = app.world as any;
    const arms = w.c.cyberware.filter((d: any) => d.visible === 'brazo').sort((x: any, y: any) => x.grade - y.grade);
    const cheap = arms[0], lux = arms[arms.length - 1];
    c.p!.cyber.push({ id: 'a1', def: cheap.id, location: 'installed', stolen: false, part: 'brazo_izq' }, { id: 'a2', def: lux.id, location: 'installed', stolen: false, part: 'brazo_der' });
    const a = wornAppearance(w.c, c.p!) as any;
    expect(a.chromeTier.brazo_izq).toBe(cheap.grade >= 2 ? (cheap.grade >= 4 ? 'militar' : 'estandar') : 'chatarra');
    expect(['militar', 'lujo']).toContain(a.chromeTier.brazo_der);
  });

  it('la superarmadura «Tormenta» es mítica, no se vende y la da el convoy del Proyecto TORMENTA', () => {
    const w = app.world as any;
    const it = w.c.items.find((i: any) => i.id === 'exo-tormenta');
    expect(it.rarity).toBe('mitico');
    expect(it.armor).toBeGreaterThanOrEqual(40);
    expect(w.mythics.isMythic('exo-tormenta')).toBe(true);
    expect(w.c.shops.some((s: any) => s.stock['exo-tormenta'])).toBe(false);
    const teo = LEGENDS.find((l) => l.id === 'teo')!;
    const last = teo.steps[teo.steps.length - 1];
    expect(last.item).toBe('exo-tormenta');
    expect(BOSSES[(last.goal as any).boss].district).toBe('cenit');
  });
});
