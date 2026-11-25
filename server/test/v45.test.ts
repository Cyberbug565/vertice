// v0.45 · Conducción: cada tipo de vehículo se conduce distinto (peso, tracción, agarre), los mandos de coche
// (acelerador, volante, freno de mano) mueven el coche en el servidor, el estado del coche llega a quien lo ve y el
// taller del concesionario monta mejoras que cambian la física.
import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { carSpec, stepCar, vehicleSpeed, type CarMotion, type DriveInput, type ZoneGrid } from '@vertice/shared';
import { createApp } from '../src/app.js';
import { BotClient } from '../../tools/loadtest/src/botclient.js';

let app: Awaited<ReturnType<typeof createApp>>;
let base = '';
const bots: BotClient[] = [];
beforeAll(async () => {
  app = await createApp({ port: 0, host: '127.0.0.1', databaseUrl: undefined, pgliteDir: 'memory://', ambientNpcs: 0, crowdNpcs: 0, threats: false, logLevel: 'warn', lingerSeconds: 0 });
  base = `http://127.0.0.1:${app.port}`;
});
afterAll(async () => { for (const b of bots) b.close(); await app?.close(); });

const W = 1200;
const open = { w: W, h: W, walk: new Uint8Array(W * W).fill(1) } as unknown as ZoneGrid;
const car = (id: string) => app.world.c.cars.find((c) => c.id === id)!;
function sim(id: string, steps: number, input: (i: number) => DriveInput, from?: CarMotion & { x: number; y: number }, tune = {}) {
  const c = car(id);
  let s: any = from ?? { x: 600, y: 600, speed: 0, heading: 0 };
  const trace: any[] = [];
  for (let i = 0; i < steps; i++) { s = stepCar(open, s.x, s.y, s, input(i), vehicleSpeed(c.speed), { ...c, tune }, 0.05); trace.push(s); }
  return { s, trace };
}

it('cada tipo se conduce distinto: el peso, la tracción y el agarre se notan', () => {
  const hyper = 'saeta-relampago', truck = 'brennan-escoria', hatch = 'vidal-pulga', rwd = 'marrow-espectro';
  // Freno de mano en curva lanzado: el superdeportivo cruza la cola mucho más que el antiguo camión de bomberos.
  const drift = (id: string) => { const fast = sim(id, 80, () => ({ throttle: 1, steer: 0 })).s; return Math.max(...sim(id, 20, () => ({ throttle: 0, steer: 1, handbrake: true }), fast).trace.map((t) => Math.abs(t.slip))); };
  expect(drift(hyper)).toBeGreaterThan(drift(truck) * 2);
  // El camión pesa y frena en más metros (a igual velocidad).
  const brakeDist = (id: string) => { const start = { x: 600, y: 600, speed: 6, heading: 0, vx: 6, vy: 0 }; const r = sim(id, 80, () => ({ throttle: -1, steer: 0 }), start); return Math.max(...r.trace.map((t) => t.x)) - 600; };
  expect(brakeDist(truck)).toBeGreaterThan(brakeDist(hyper) * 1.3);
  expect(carSpec({ ...car(truck) }).mass).toBeGreaterThan(carSpec({ ...car(hatch) }).mass * 4);
  // Gas a fondo en curva: la propulsión trasera suelta la cola; la tracción delantera no (se va de morro).
  const powerSlide = (id: string) => { const slow = sim(id, 200, () => ({ throttle: 1, steer: 0 })).trace.find((t) => t.speed > vehicleSpeed(car(id).speed) * 0.35)!; return Math.max(...sim(id, 40, () => ({ throttle: 1, steer: 1 }), slow).trace.map((t) => Math.abs(t.slip))); };
  expect(powerSlide(rwd)).toBeGreaterThan(0.12);
  expect(powerSlide(hatch)).toBeLessThan(0.05);
  // Volante a la derecha → gira a la derecha (el rumbo crece en la rejilla); a la izquierda, al revés.
  const going = sim(hatch, 30, () => ({ throttle: 1, steer: 0 })).s;
  expect(sim(hatch, 10, () => ({ throttle: 0.5, steer: 1 }), going).s.heading).toBeGreaterThan(0.1);
  expect(sim(hatch, 10, () => ({ throttle: 0.5, steer: -1 }), going).s.heading).toBeLessThan(-0.1);
  // Marcha atrás con S desde parado, y más lenta que hacia delante.
  const back = sim(hatch, 40, () => ({ throttle: -1, steer: 0 })).s;
  expect(back.x).toBeLessThan(600);
  expect(back.speed).toBeLessThan(vehicleSpeed(car(hatch).speed) * 0.4);
  // Las mejoras cambian la física: motor 3 acelera más, el kit aligerado pesa menos, los semislick agarran más.
  const at = (tune: object) => sim(hatch, 20, () => ({ throttle: 1, steer: 0 }), undefined, tune).s.x;
  expect(at({ motor: 3 })).toBeGreaterThan(at({}));
  expect(carSpec({ ...car(hatch), tune: { peso: 'aligerado' } }).mass).toBeLessThan(carSpec({ ...car(hatch) }).mass);
  expect(carSpec({ ...car(hatch), tune: { neumaticos: 'semislick' } }).grip).toBeGreaterThan(carSpec({ ...car(hatch) }).grip);
});

it('al volante, los mandos mueven el coche en el servidor, los demás reciben su rumbo y el taller monta mejoras', async () => {
  const w = app.world;
  const token = await BotClient.registerAndCreate(base, 'Piloto45');
  const bot = new BotClient(base, 'Piloto45'); bots.push(bot);
  const states: any[] = [];
  const watcherTok = await BotClient.registerAndCreate(base, 'Mirona45');
  const watcher = new BotClient(base, 'Mirona45'); bots.push(watcher);
  await bot.connect(token, app.contentHash);
  await watcher.connect(watcherTok, app.contentHash);
  (watcher as any).ws.on('message', (d: Buffer) => { try { const m = JSON.parse(d.toString()); if (m.t === 'carState') states.push(m); } catch { /* binario */ } });
  const conn = [...w.conns.values()].find((c) => c.p?.name === 'Piloto45')!, wc = [...w.conns.values()].find((c) => c.p?.name === 'Mirona45')!;
  const p = conn.p!;
  p.money = 2_000_000;
  await app.db.query('UPDATE characters SET money=$2 WHERE id=$1', [p.charId, p.money]);
  await w.teleport(conn, 'concesionario-saeta-int', [8, 4]);
  expect((await bot.cmd({ t: 'car', action: 'buy', dealer: 'saeta-colinas', car: 'saeta-relampago', opId: randomUUID() })).ok).toBe(true);
  const own = p.cars[0];
  // Taller: motor de carreras y semislick; se cobra y se guarda.
  const before = p.money;
  expect((await bot.cmd({ t: 'car', action: 'tune', dealer: 'saeta-colinas', car: own.id, part: 'motor', value: 3, opId: randomUUID() })).ok).toBe(true);
  expect((await bot.cmd({ t: 'car', action: 'tune', dealer: 'saeta-colinas', car: own.id, part: 'neumaticos', value: 'semislick', opId: randomUUID() })).ok).toBe(true);
  expect(p.money).toBeLessThan(before);
  expect(w.property.tunesOf(p)[own.id]).toEqual({ motor: 3, neumaticos: 'semislick' });
  const saved = await app.db.query<any>("SELECT value FROM character_flags WHERE character_id=$1 AND key='coches:tune'", [p.charId]);
  expect(JSON.stringify(saved.rows[0].value)).toContain('semislick');
  expect((await bot.cmd({ t: 'car', action: 'tune', dealer: 'saeta-colinas', car: own.id, part: 'motor', value: 'turbo', opId: randomUUID() })).ok).toBe(false);
  // A la calle, al volante; la mirona al lado.
  const d = w.zones.get('vertice')!.def.districts.find((x) => x.id === 'cenit')!;
  await w.teleport(conn, 'vertice', d.safePoint);
  await w.teleport(wc, 'vertice', [d.safePoint[0] - 1, d.safePoint[1]]);
  expect((await bot.cmd({ t: 'car', action: 'drive', car: own.id })).ok).toBe(true);
  expect(w.property.tuningOf(p, car('saeta-relampago')).tune).toEqual({ motor: 3, neumaticos: 'semislick' });
  const e = conn.e!;
  e.carMotion!.heading = 0; wc.e!.facing = 0; // la mirona mira hacia donde va a ir el coche (los jugadores tienen cono de visión)
  const x0 = e.x, y0 = e.y;
  bot.raw({ t: 'drive', seq: 0, throttle: 1, steer: 0 });
  await new Promise((r) => setTimeout(r, 700));
  expect(e.carMotion!.speed).toBeGreaterThan(1);
  expect(Math.hypot(e.x - x0, e.y - y0)).toBeGreaterThan(0.5);
  // Freno: se para y no da marcha atrás mientras frena.
  bot.raw({ t: 'drive', seq: 0, throttle: -1, steer: 0 });
  await bot.until(() => e.carMotion!.speed < 0.1);
  bot.raw({ t: 'drive', seq: 0, throttle: 0, steer: 0 });
  expect(states.length).toBeGreaterThan(0); // la mirona recibe el rumbo y la deriva del coche
  expect(states.some((m) => m.v.some((r: number[]) => r[0] === e.id))).toBe(true);
  // Al aparcar y volver a subir, las mejoras siguen.
  expect((await bot.cmd({ t: 'car', action: 'park' })).ok).toBe(true);
  expect(w.property.tunesOf(p)[own.id].motor).toBe(3);
}, 20000);
