import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { vehicleSpeed } from '@vertice/shared';
import { BotClient } from '../../tools/loadtest/src/botclient.js';
import { createApp } from '../src/app.js';

it('compra el Vector, atraviesa la avenida ampliada, aparca y accede al maletero', async () => {
  const app = await createApp({ port: 0, host: '127.0.0.1', pgliteDir: 'memory://', ambientNpcs: 0, crowdNpcs: 0, needsScale: 0, lingerSeconds: 0, threats: false, logLevel: 'warn' });
  const base = 'http://127.0.0.1:' + app.port;
  const bot = new BotClient(base, 'vectorista');
  try {
    await bot.connect(await BotClient.registerAndCreate(base, 'vectorista'), app.contentHash);
    const conn = [...app.world.conns.values()][0], p = conn.p!;
    const car = app.world.c.cars.find(x => x.id === 'saeta-vector')!;
    expect(car.model).toBe('vector');
    const dealer = 'saeta-colinas', showroom = app.world.zones.get('concesionario-saeta-int')!;
    const seller = [...showroom.entities].find(e => e.dealer === dealer)!;
    await app.world.teleport(conn, showroom.id, [Math.floor(seller.x), Math.floor(seller.y)]);
    await app.db.query('UPDATE characters SET money=60000 WHERE id=$1', [p.charId]);
    p.money = 60000;
    expect((await bot.cmd({ t: 'car', action: 'buy', dealer, car: car.id, opId: randomUUID() })).ok).toBe(true);
    const owned = p.cars.find(x => x.car === car.id)!;
    expect(owned.id).toBeTruthy();

    await app.world.teleport(conn, 'vertice', [603, 172]);
    expect((await bot.cmd({ t: 'car', action: 'drive', car: owned.id })).ok).toBe(true);
    expect(conn.e!.vehicle).toBe(car.id);
    expect(conn.e!.speed).toBeCloseTo(vehicleSpeed(car.speed), 3);
    expect((await bot.cmd({ t: 'move', x: 620.5, y: 172.5 })).ok).toBe(true);
    await vi.waitFor(() => expect(conn.e!.x).toBeGreaterThan(615), { timeout: 7000 });

    expect((await bot.cmd({ t: 'car', action: 'park' })).ok).toBe(true);
    expect(conn.e!.vehicle).toBeNull();
    const object = app.world.property.parked.get(owned.id)!;
    expect(object.objKind).toBe('mycar');
    expect(object.vehicle).toBe(car.id);
    expect(object.x).toBeGreaterThan(615);
    await vi.waitFor(async () => {
      const row = await app.db.query<{ zone: string }>('SELECT zone FROM cars_owned WHERE id=$1', [owned.id]);
      expect(row.rows[0]?.zone).toBe('vertice');
    });
    const trunk = bot.waitFor(m => m.t === 'trunk', 3000, 'maletero Vector');
    expect((await bot.cmd({ t: 'trunk', action: 'view' })).ok).toBe(true);
    expect(await trunk).toMatchObject({ view: { name: 'Saeta Vector', capacity: car.trunk } });
  } finally {
    bot.close();
    await app.close();
  }
}, 30000);
