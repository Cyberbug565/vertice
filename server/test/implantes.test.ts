import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { CYBER_MODELS, RARITY_COLOR, type ServerMsg } from '@vertice/shared';
import { createApp } from '../src/app.js';
import { ClinicService } from '../src/game/clinic.js';
import { effective, loadPlayer, wornAppearance } from '../src/game/player.js';
import { BotClient } from '../../tools/loadtest/src/botclient.js';

let app: Awaited<ReturnType<typeof createApp>>;
beforeAll(async () => {
  app = await createApp({
    port: 0,
    host: '127.0.0.1',
    databaseUrl: undefined,
    pgliteDir: 'memory://',
    ambientNpcs: 0,
    crowdNpcs: 0,
    threats: false,
    logLevel: 'warn',
  });
});
afterAll(async () => {
  await app?.close();
});

it('cada modelo tiene estadísticas activas, un color oficial y se vende en una clínica compatible', () => {
  const c = app.world.c,
    catalog = c.cyberware.filter((d) => d.model);
  expect(catalog.map((d) => d.model).sort()).toEqual(Object.keys(CYBER_MODELS).sort());
  for (const d of catalog) {
    expect(d.visible).toBe(CYBER_MODELS[d.model!]);
    expect(RARITY_COLOR[d.rarity!]).toMatch(/^#/);
    expect(c.ripperdocs.some((doc) => doc.stock.includes(d.id) && doc.maxGrade >= d.grade)).toBe(true);
  }
  expect(
    catalog
      .filter((d) => d.rarity === 'legendario')
      .map((d) => d.model)
      .sort(),
  ).toEqual(['asedio', 'coloso', 'titan']);
});

it('el lado, el modelo y sus bonificaciones sobreviven a la instalación, retirada, guardado y reimplante', async () => {
  const base = `http://127.0.0.1:${app.port}`,
    c = app.world.c;
  const token = await BotClient.registerAndCreate(base, 'PruebaCromo', 'solo', 'callejero');
  const roster = await BotClient.api(base, '/api/me', undefined, token);
  const p = (await loadPlayer(app.db, roster.character.id))!;
  p.money = 1000000;
  await app.db.query('UPDATE characters SET money=$2 WHERE id=$1', [p.charId, p.money]);
  const clinic = new ClinicService(app.db, c, app.world.survival.market, () => 0.5);
  const ef = effective(c, p),
    buy = (ref: string, side: 'izq' | 'der') =>
      clinic.operate(p, 'sato', 'install', 'stock', ref, randomUUID(), side);
  await buy('cromo-circuito', 'der');
  expect(wornAppearance(c, p).chromeModels).toEqual({ brazo_der: 'circuito' });
  expect(effective(c, p).carryMax).toBe(ef.carryMax + 3);
  const cash = p.money;
  await expect(buy('cromo-servo', 'der')).rejects.toThrow(/lado/);
  expect(p.money).toBe(cash);
  await buy('cromo-servo', 'izq');
  const fresh = (await loadPlayer(app.db, p.charId))!;
  expect(wornAppearance(c, fresh).chromeModels).toEqual({ brazo_der: 'circuito', brazo_izq: 'servo' });
  expect(effective(c, fresh).meleeDmg).toBeCloseTo(ef.meleeDmg + 0.16);
  const installed = fresh.cyber.find((i) => i.def === 'cromo-circuito')!;
  await clinic.operate(fresh, 'sato', 'remove', 'installed', installed.id, randomUUID());
  expect(wornAppearance(c, fresh).chromeModels).toEqual({ brazo_izq: 'servo' });
  expect(installed.part).toBeNull();
  await clinic.operate(fresh, 'sato', 'install', 'inventory', installed.id, randomUUID(), 'der');
  const final = (await loadPlayer(app.db, p.charId))!;
  expect(final.cyber.filter((i) => i.location === 'installed')).toHaveLength(2);
  expect(wornAppearance(c, final).chromeModels?.brazo_der).toBe('circuito');
});

it('el matasanos comunica por WebSocket el lado intervenido, la salud de la mano y el modelo visible a otro jugador', async () => {
  const base = `http://127.0.0.1:${app.port}`;
  const world = app.world;
  const doctor = [...world.entities.values()].find((e) => e.name === 'Doc Sato')!;
  const patient = new BotClient(base, 'PacienteCromo');
  const observer = new BotClient(base, 'TestigoCromo');
  const previousRng = world.survival.rng;
  try {
    for (const bot of [patient, observer]) {
      const token = await BotClient.registerAndCreate(base, bot.name, 'solo', 'callejero');
      await bot.connect(token, app.contentHash);
      const conn = [...world.conns.values()].find((c) => c.p?.name === bot.name)!;
      await world.teleport(conn, doctor.zone.id, [doctor.x, doctor.y + 0.5]);
    }
    const conn = [...world.conns.values()].find((c) => c.p?.name === patient.name)!;
    const player = conn.p!;
    player.money = 30000;
    await app.db.query('UPDATE characters SET money=$2 WHERE id=$1', [player.charId, player.money]);
    await patient.interactAndDialog('Sato');
    await patient.choose('chrome');
    world.survival.rng = () => 0.01;
    await observer.until(
      () => observer.entities.has(patient.you),
      5000,
      'ver al paciente antes de la intervención',
    );
    const ack = await patient.cmd({
      t: 'clinicDo',
      doc: 'sato',
      action: 'install',
      source: 'stock',
      ref: 'cromo-circuito',
      side: 'izq',
      opId: randomUUID(),
    });
    expect(ack.ok).toBe(true);
    expect(patient.sheet!.body.chrome).toEqual(expect.arrayContaining(['brazo_izq', 'mano_izq']));
    expect(patient.sheet!.body.chrome).not.toContain('mano_der');
    const visibleUpdate = () =>
      observer.log.find(
        (m): m is Extract<ServerMsg, { t: 'label' }> =>
          m.t === 'label' && m.id === patient.you && m.appearance?.chromeModels?.brazo_izq === 'circuito',
      );
    await observer.until(
      () => !!visibleUpdate(),
      5000,
      'recibir el nuevo brazo izquierdo sin volver a entrar en la zona',
    );
    expect(visibleUpdate()!.appearance!.chromeModels).toEqual({ brazo_izq: 'circuito' });
    player.body.wounds.mano_izq = 12;
    expect(world.survival.clinic.view('sato', player).repair?.parts).toEqual(['mano_izq']);
  } finally {
    world.survival.rng = previousRng;
    patient.close();
    observer.close();
  }
});
