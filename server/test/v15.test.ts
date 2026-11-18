// v0.15 · Cuerpo base (masculino / femenino) en el aspecto, exoarmadura «Tormenta» a la venta y con su blindaje, y que
// no se pueda elegir gratis al crear el personaje.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { normalizeAppearance } from '@vertice/shared';
import { createApp } from '../src/app.js';
import { BotClient } from '../../tools/loadtest/src/botclient.js';
import { effective, wornAppearance } from '../src/game/player.js';

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

const look = { skin: '#c89070', hair: '#222222', jacket: '#40506a', accent: '#43f3ff' };

describe('v0.15', () => {
  it('el cuerpo base se valida y la exoarmadura no se elige al crear', () => {
    for (const body of ['masculino', 'femenino', '']) expect(normalizeAppearance({ ...look, body }).ok).toBe(true);
    expect(normalizeAppearance({ ...look, body: 'robot' }).ok).toBe(false);
    expect(normalizeAppearance({ ...look, top: 'exo-tormenta' }).ok).toBe(false);
  });

  it('la superarmadura se viste y blinda', async () => {
    const content = (app.world as any).c;
    const it = content.items.find((i: any) => i.id === 'exo-tormenta');
    expect(it?.wear?.style).toBe('exo-tormenta');
    const token = await BotClient.registerAndCreate(base, 'tormenta1', 'solo', 'callejero');
    const b = new BotClient(base, 'tormenta1'); clients.push(b);
    await b.connect(token, app.contentHash);
    const c = [...app.world.conns.values()].find((x) => x.p?.name === 'tormenta1')!;
    await (app.world as any).admin.give(c.p, 'exo-tormenta');
    (app.world as any).survival.wear(c, 'torso_ext', 'exo-tormenta', true);
    expect(wornAppearance(content, c.p!).top).toBe('exo-tormenta');
    expect(effective(content, c.p!).armor).toBeGreaterThanOrEqual(9); // (sustituye a la chaqueta del principio)
  });
});
