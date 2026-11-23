import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { RULES, stepWithCollision, vehicleSpeed, walkSpeed, type ZoneGrid } from '@vertice/shared';
import { BotClient } from '../../tools/loadtest/src/botclient.js';
import { createApp } from '../src/app.js';

it('barre una pared al avanzar deprisa y permite deslizarse en un eje', () => {
  const walk = new Uint8Array(48).fill(1);
  for (let y = 0; y < 6; y++) walk[y * 8 + 3] = 0;
  const grid = { w: 8, h: 6, walk } as ZoneGrid;
  const next = stepWithCollision(grid, 1.5, 1.5, 4.5, 2.1);
  expect(next.x).toBeGreaterThan(1.5);
  expect(next.x).toBeLessThan(3);
  expect(next.y).toBeCloseTo(3.6);
});

it('notifica la velocidad al conducir, al volver a andar y al esprintar', async () => {
  const app = await createApp({ port: 0, host: '127.0.0.1', databaseUrl: undefined, pgliteDir: 'memory://', ambientNpcs: 0, crowdNpcs: 0, needsScale: 0, lingerSeconds: 0, threats: false, logLevel: 'warn' });
  const base = 'http://127.0.0.1:' + app.port;
  const bot = new BotClient(base, 'pruebadeconduccion');
  try {
    await bot.connect(await BotClient.registerAndCreate(base, 'pruebadeconduccion'), app.contentHash);
    const c = [...app.world.conns.values()][0], p = c.p!;
    const world = app.world.zones.get('vertice')!;
    await app.world.teleport(c, world.id, world.def.safePoint);
    app.world.survival.refreshMovement(c);
    const walking = c.e!.speed;
    expect(walking).toBeCloseTo(walkSpeed(p.attributes), 1);
    const car = app.world.c.cars.reduce((a, b) => a.speed < b.speed ? a : b);
    const own = randomUUID(); p.cars.push({ id: own, car: car.id });
    await app.db.query('INSERT INTO cars_owned (id,character_id,car_id,price) VALUES ($1,$2,$3,0)', [own, p.charId, car.id]);
    const driven = bot.waitFor(msg => msg.t === 'selfSpeed' && msg.v > RULES.maxFootSpeed);
    expect((await bot.cmd({ t: 'car', action: 'drive', car: own })).ok).toBe(true);
    expect(await driven).toMatchObject({ t: 'selfSpeed', v: Math.round(vehicleSpeed(car.speed) * 1000) / 1000, guard: false });
    expect(c.e!.speed).toBeGreaterThan(walking * 3);
    expect((await bot.cmd({ t: 'guard', on: true })).ok).toBe(false);
    const parked = bot.waitFor(msg => msg.t === 'selfSpeed' && msg.v < RULES.maxFootSpeed);
    expect((await bot.cmd({ t: 'car', action: 'park' })).ok).toBe(true);
    expect(await parked).toMatchObject({ t: 'selfSpeed', v: Math.round(walking * 1000) / 1000 });
    expect((await bot.cmd({ t: 'run', on: true })).ok).toBe(true);
    expect(c.e!.speed).toBeCloseTo(walking * RULES.runSpeedFactor, 3);
    expect(c.e!.speed).toBeLessThan(vehicleSpeed(car.speed));
  } finally {
    bot.close();
    await app.close();
  }
});
