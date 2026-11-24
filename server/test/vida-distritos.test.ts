import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { GROUND_TYPES, isWalkable, pedestrianGrid, RULES, type ServerMsg } from '@vertice/shared';
import { BotClient } from '../../tools/loadtest/src/botclient.js';
import { createApp } from '../src/app.js';
import { effective, loadPlayer, wornAppearance } from '../src/game/player.js';

let app: Awaited<ReturnType<typeof createApp>>;
const bots: BotClient[] = [];
const connection = (bot: BotClient) => [...app.world.conns.values()].find(c => c.p?.name === bot.name)!;

beforeAll(async () => {
  app = await createApp({ port: 0, host: '127.0.0.1', pgliteDir: 'memory://', databaseUrl: undefined,
    ambientNpcs: 72, crowdNpcs: 0, threats: false, lingerSeconds: 0, logLevel: 'warn', seed: 2468,
    cityHourOffset: 13 - Date.now() / 225000 % 24 });
});

afterAll(async () => {
  for (const bot of bots) bot.close();
  await app?.close();
});

async function enter(name: string) {
  const url = 'http://127.0.0.1:' + app.port;
  const bot = new BotClient(url, name);
  bots.push(bot);
  await bot.connect(await BotClient.registerAndCreate(url, name, 'solo', 'callejero'), app.contentHash);
  return bot;
}

it('concentra población cerca de los jugadores, comparte grupos y libera zonas inactivas', async () => {
  const w = app.world;
  const city = w.zones.get('vertice')!;
  const loft = w.zones.get('torre-halcon-p0')!;
  const extra = () => [...w.entities.values()].filter(e => e.npc?.localCrowd);
  const near = (x: number, y: number) => extra().filter(e => e.zone === city && Math.hypot(e.x - x, e.y - y) <= 26);

  expect(extra()).toHaveLength(0);
  const a = await enter('GenteCentro');
  const b = await enter('GenteExterior');
  w.stop();
  try {
    await w.teleport(connection(a), city.id, [223, 152]);
    await w.teleport(connection(b), city.id, [415, 365]);
    for (let i = 0; i < 12; i++) w.crowds.update();

    const center = near(223.5, 152.5), outer = near(415.5, 365.5);
    expect(center.length).toBeGreaterThan(10);
    expect(center.length).toBeGreaterThan(outer.length * 2);
    expect(extra().length).toBeLessThanOrEqual(180);
    const pavement = pedestrianGrid(city.grid, 'stop');
    expect(extra().filter(e => e.zone === city).every(e => isWalkable(pavement, e.x, e.y) &&
      ['sidewalk', 'plaza', 'market'].includes(GROUND_TYPES[city.grid.ground[Math.floor(e.y) * city.grid.w + Math.floor(e.x)]]))).toBe(true);
    const old = center.map(e => e.id);
    await w.teleport(connection(b), city.id, [223, 152]);
    for (let i = 0; i < 5; i++) w.crowds.update();
    expect(near(223.5, 152.5).map(e => e.id)).toEqual(old);
    await w.teleport(connection(a), loft.id, [9, 9]);
    await w.teleport(connection(b), loft.id, [9, 9]);
    w.crowds.update();
    expect(extra().filter(e => e.zone === loft).length).toBeGreaterThan(6);
    w.tick += RULES.tickRate * 13;
    w.crowds.update();
    expect(extra().filter(e => e.zone === city)).toHaveLength(0);
    expect([...loft.actors].filter(e => e.npcType === 'police' && e.title === 'Seguridad privada')).toHaveLength(4);
    expect(w.stealth.restricted(loft.id)).toBeUndefined();
    expect(loft.def.detector).toBe(true);
    expect(w.stealth.restricted('torre-halcon-p4')).toBe('corporativo');
    expect([...city.actors].filter(e => e.npcType === 'police' && city.districtAt(e.x, e.y)?.id === 'cenit').length).toBeGreaterThanOrEqual(8);
    expect([...city.actors].some(e => e.npcType === 'police' && city.districtAt(e.x, e.y)?.id === 'fundicion-sur')).toBe(false);
  } finally {
    w.start();
  }
});

it('vende cromo clandestino en Fundición y la clínica certificada rechaza instalarlo', async () => {
  const w = app.world;
  const fighter = await enter('ClienteRemache');
  const c = connection(fighter);
  const p = c.p!;
  p.money = 100000;
  await app.db.query('UPDATE characters SET money=$2 WHERE id=$1', [p.charId, p.money]);
  const city = w.zones.get('vertice')!;
  const door = [...city.entities].find(e => e.hiddenDoc === 'remache')!;
  await w.teleport(c, city.id, [Math.floor(door.x), Math.floor(door.y)]);
  await fighter.enterDoor('Puerta de servicio');
  expect(fighter.zone).toBe('remache-int');
  expect(w.interiors.frame(c.e!.zone.def)).toBeDefined();
  const remache = [...c.e!.zone.actors].find(e => e.name.includes('Remache'))!;
  await w.teleport(c, remache.zone.id, [Math.floor(remache.x) + 1, Math.floor(remache.y)]);
  await fighter.interactAndDialog('Iria');
  const store = fighter.waitFor<Extract<ServerMsg, { t: 'clinic' }>>(m => m.t === 'clinic' && m.view.doc === 'remache');
  await fighter.choose('catalogo');
  const { view } = await store;
  expect(view.offers.filter(o => o.line === 'taller' && o.source === 'stock')).toHaveLength(5);
  const id = 'remache-mano-garra', offer = view.offers.find(o => o.def === id)!;
  expect(offer.blocked).toBeUndefined();
  expect(offer.stolen).toBe(false);
  const baseDamage = effective(w.c, p).meleeDmg;
  const previousRng = w.survival.rng;
  try {
    w.survival.rng = () => .02;
    const purchase = await fighter.cmd({ t: 'clinicDo', doc: 'remache', action: 'install', source: 'stock', ref: id, side: 'izq', opId: randomUUID() });
    expect(purchase.ok).toBe(true);
    const fresh = (await loadPlayer(app.db, p.charId))!;
    const installed = fresh.cyber.find(i => i.def === id)!;
    expect(effective(w.c, fresh).meleeDmg).toBe(baseDamage + 3);
    expect(wornAppearance(w.c, fresh).chromeModels).toMatchObject({ mano_izq: 'pinza' });
    await w.survival.clinic.operate(fresh, 'remache', 'remove', 'installed', installed.id, randomUUID());
    const okami = w.survival.clinic.view('okami', fresh);
    const premium = okami.offers.filter(o => o.source === 'stock' && o.line === 'certificado');
    expect(premium).toHaveLength(5);
    expect(Math.min(...premium.map(o => o.price))).toBeGreaterThan(offer.price * 10);
    expect(okami.offers.find(o => o.ref === installed.id)?.blocked).toMatch(/licencia/);
    await expect(w.survival.clinic.operate(fresh, 'okami', 'install', 'inventory', installed.id, randomUUID())).rejects.toThrow(/licencia/);
  } finally {
    w.survival.rng = previousRng;
  }
});
