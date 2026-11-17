// v0.12 · Movimiento y controles: el tiempo que el bucle del servidor se salta no se pierde para quien anda con WASD,
// la voltereta respeta su recuperación y el aguante, nada sin dibujo bloquea el paso, las puertas se abren a 3 m y
// las armas nuevas existen con su tienda.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { REMOTE_DOOR_RANGE, buildZoneGrid, isWalkable } from '@vertice/shared';
import { createApp } from '../src/app.js';
import { BotClient } from '../../tools/loadtest/src/botclient.js';
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
const put = (e: Entity, x: number, y: number) => { e.x = x; e.y = y; e.path = []; e.zone.moved(e); };
/** Un tramo recto y libre de 12 casillas en x. */
function lane(): [number, number] {
  const z = city();
  for (let y = 10; y < z.def.height - 10; y++) for (let x = 10; x < z.def.width - 20; x++) {
    let ok = true;
    for (let dx = 0; dx < 12 && ok; dx++) for (let dy = -1; dy <= 1 && ok; dy++) if (!isWalkable(z.grid, x + dx + 0.5, y + dy + 0.5)) ok = false;
    if (ok) return [x, y];
  }
  throw new Error('sin tramo libre');
}

describe('v0.12 · movimiento y controles', () => {
  it('el tiempo saltado por el bucle del servidor se devuelve a quien anda con WASD', async () => {
    await join('andarin');
    const c = conn('andarin');
    await app.world.teleport(c, 'vertice', lane().map((v) => v + 0.5) as [number, number]);
    const e = c.e!;
    const [x0, y0] = [e.x, e.y];
    e.steer = { dx: 1, dy: 0, at: Date.now() };
    app.world.catchUpDt = 0.3; // el bucle se retrasó 0,3 s
    app.world.step();
    const moved = Math.hypot(e.x - x0, e.y - y0);
    // Un tick normal (0,05 s) más los 0,3 s recuperados.
    expect(moved).toBeGreaterThan(e.speed * 0.3);
    expect(moved).toBeLessThan(e.speed * 0.36 + 0.01);
    expect(app.world.catchUpDt).toBe(0);
    e.steer = undefined;
  });

  it('la voltereta respeta la recuperación y no deja dormido ni derribado al personaje', async () => {
    await join('rodador');
    const c = conn('rodador');
    const [x, y] = lane();
    await app.world.teleport(c, 'vertice', [x + 0.5, y + 0.5]);
    const e = c.e!, p = c.p!;
    put(e, x + 0.5, y + 0.5);
    p.stamina = 100;
    (app.world as any).combat.dodge(c, 1, 0);
    expect(e.x - (x + 0.5)).toBeGreaterThan(2);
    expect(() => (app.world as any).combat.dodge(c, 1, 0)).toThrow(/recuperando/);
    e.dodgeReadyAt = 0;
    p.stamina = 3;
    expect(() => (app.world as any).combat.dodge(c, 1, 0)).toThrow(/aguante/);
    expect(p.sleeping).toBeFalsy();
    expect(e.state === 'downed').toBe(false);
  });

  it('las puertas se abren con clic o E desde 3 m', async () => {
    expect(REMOTE_DOOR_RANGE).toBeGreaterThanOrEqual(3);
    const b = await join('portero');
    const c = conn('portero');
    const door = city().def.doors.find((d) => d.id === 'puerta-rele')!;
    await app.world.teleport(c, 'vertice', [door.at[0] + 0.5, door.at[1] + 2.9]);
    const ent = [...city().entities].find((x) => x.kind === 'door' && x.name === door.name)!;
    expect(Math.hypot(ent.x - c.e!.x, ent.y - c.e!.y)).toBeLessThanOrEqual(REMOTE_DOOR_RANGE);
    const r = await b.cmd({ t: 'interact', target: ent.id, remote: true } as any);
    expect(r.ok).toBe(true);
    await b.until(() => c.e!.zone.id === 'bar-rele', 8000, 'dentro del bar');
  });

  it('nada sin dibujo bloquea: los buzones de vivienda y las farolas dejan pasar', () => {
    const def = city().def;
    const g = buildZoneGrid(def);
    const at = (x: number, y: number) => g.walk[y * def.width + x];
    const housing = def.objects.filter((o) => o.kind === 'housing');
    expect(housing.length).toBeGreaterThan(10);
    expect(housing.every((o) => at(o.at[0], o.at[1]) === 1 || def.buildings.some((b) => o.at[0] >= b.rect[0] && o.at[1] >= b.rect[1] && o.at[0] < b.rect[0] + b.rect[2] && o.at[1] < b.rect[1] + b.rect[3]))).toBe(true);
    // (si comparte casilla con algo sólido y visible, como un contenedor, sí bloquea: eso se ve)
    const lamps = def.props.filter((p) => p.type === 'lamp' && !def.props.some((q) => q !== p && q.at[0] === p.at[0] && q.at[1] === p.at[1]) && !def.objects.some((o) => o.at[0] === p.at[0] && o.at[1] === p.at[1]));
    expect(lamps.filter((p) => at(p.at[0], p.at[1]) === 0 && !def.buildings.some((b) => p.at[0] >= b.rect[0] && p.at[1] >= b.rect[1] && p.at[0] < b.rect[0] + b.rect[2] && p.at[1] < b.rect[1] + b.rect[3])).length).toBe(0);
  });

  it('diez armas nuevas a la venta y callejones con giro en la ciudad', () => {
    const ids = ['pistola-compacta', 'subfusil-compacto', 'carabina', 'escopeta-bombeo', 'ametralladora-ligera', 'cuchillo-combate', 'katana', 'hacha-bomberos', 'tuberia', 'mazo'];
    for (const id of ids) {
      expect(app.world.c.items.find((i) => i.id === id)?.weapon, id).toBeTruthy();
      expect(app.world.c.shops.some((s) => (s.stock as any)[id] > 0), id).toBe(true);
    }
    expect(city().def.buildings.filter((b) => /-[lz]\d$/.test(b.id)).length).toBeGreaterThan(40);
  });
});
