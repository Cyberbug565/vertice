import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { stepCar, vehicleSpeed, isWalkable } from '@vertice/shared';
import { createApp } from '../src/app.js';
import { BotClient } from '../../tools/loadtest/src/botclient.js';

it('cada carrocería tiene un modelo, miniatura, tráfico y concesionario', async () => {
  const app = await createApp({ port: 0, pgliteDir: 'memory://', ambientNpcs: 0, threats: false, logLevel: 'warn' });
  try {
    const { cars, dealers } = app.world.c;
    const models = new Set(cars.map(c => c.model));
    expect(models.size).toBeGreaterThanOrEqual(22);
    for (const car of cars) expect(dealers.some(d => d.classes.includes(car.class)), car.id).toBe(true);
    for (const model of models) {
      for (const suffix of ['.glb', '.webp', '-calles.webp']) {
        expect(existsSync(new URL(`../../client/public/models/vehiculos/${model}${suffix}`, import.meta.url)), model).toBe(true);
      }
      expect(cars.some(c => c.model === model && c.traffic > 0), model).toBe(true);
    }
    const grid = app.world.zones.get('vertice')!.grid;
    const hatchback = cars.find(c => c.id === 'vidal-pulga')!;
    const hypercar = cars.find(c => c.id === 'saeta-relampago')!;
    const drive = (car: typeof hatchback) => {
      let state = { x: 320.5, y: 426.5, speed: 0, heading: 0 };
      for (let i = 0; i < 20; i++) state = stepCar(grid, state.x, state.y, state, 1, 0, vehicleSpeed(car.speed), car, .05);
      return state;
    };
    const small = drive(hatchback), fast = drive(hypercar);
    expect(fast.x - 320.5).toBeGreaterThan((small.x - 320.5) * 2);
    const stopped = stepCar(grid, fast.x, fast.y, fast, 0, 0, vehicleSpeed(hypercar.speed), hypercar, .2);
    expect(stopped.x).toBeGreaterThan(fast.x);
    expect(stopped.speed).toBeLessThan(fast.speed);
    const turn = (handling: number) => stepCar(grid, fast.x, fast.y, fast, 0, 1, vehicleSpeed(hypercar.speed), { ...hypercar, handling }, .05);
    expect(turn(90).heading).toBeGreaterThan(turn(40).heading);
    let collision = { x: 325.5, y: 434.5, speed: 12, heading: Math.PI / 2 };
    for (let i = 0; i < 40; i++) collision = stepCar(grid, collision.x, collision.y, collision, 0, 1, vehicleSpeed(hypercar.speed), hypercar, .05);
    expect(collision.y).toBeLessThan(436);
    expect(isWalkable(grid, collision.x, collision.y)).toBe(true);
  } finally { await app.close(); }
});

it('compra, conduce, aparca y vuelve a montar el coche elegido con la misma sesión', async () => {
  const app = await createApp({ port: 0, pgliteDir: 'memory://', ambientNpcs: 0, threats: false, logLevel: 'warn' });
  const url = 'http://127.0.0.1:' + app.port;
  const bot = new BotClient(url, 'Conductora');
  try {
    await bot.connect(await BotClient.registerAndCreate(url, 'Conductora'), app.contentHash);
    const conn = [...app.world.conns.values()][0], player = conn.p!, actor = conn.e!;
    player.money = 2000000;
    await app.db.query('UPDATE characters SET money=$2 WHERE id=$1', [player.charId, player.money]);
    await app.world.teleport(conn, 'autos-ferro-int', [8, 4]);
    expect((await bot.cmd({ t: 'car', action: 'buy', dealer: 'autos-ferro', car: 'vidal-pulga', opId: randomUUID() })).ok).toBe(true);
    await app.world.teleport(conn, 'concesionario-saeta-int', [8, 4]);
    expect((await bot.cmd({ t: 'car', action: 'buy', dealer: 'saeta-colinas', car: 'saeta-relampago', opId: randomUUID() })).ok).toBe(true);
    const [city, hyper] = player.cars;
    const ownership = await app.db.query('SELECT car_id FROM cars_owned WHERE character_id=$1', [player.charId]);
    expect(ownership.rows).toHaveLength(2);
    await app.world.teleport(conn, 'vertice', [320, 426]);
    const drive = async (ownedId: string) => {
      const result = await bot.cmd({ t: 'car', action: 'drive', car: ownedId });
      expect(result.ok).toBe(true);
      expect(actor.carMotion!.speed).toBe(0);
      bot.raw({ t: 'steer', seq: 600, dx: 1, dy: 0 });
      await bot.until(() => actor.carMotion!.speed > 1);
      const velocity = actor.carMotion!.speed;
      bot.raw({ t: 'steer', seq: 601, dx: 0, dy: 0 });
      await bot.until(() => actor.carMotion?.speed === 0);
      expect(velocity).toBeGreaterThan(1);
      expect((await bot.cmd({ t: 'car', action: 'park' })).ok).toBe(true);
      expect(app.world.property.parked.get(ownedId)?.vehicle).toBe(ownedId === city.id ? city.car : hyper.car);
    };
    await drive(hyper.id);
    await drive(city.id);
    expect((await bot.cmd({ t: 'car', action: 'drive' })).ok).toBe(true);
    expect(player.driving).toBe(city.id);
  } finally { bot.close(); await app.close(); }
}, 15000);
