// v0.44 · Accesorios de armas: estadísticas de 1 a 10 distintas por arma, accesorios que solo encajan en ciertas clases,
// banco de armero en las armerías con taller, ilegales solo en el mercado negro y efecto real en combate (daño, ruido).
import { afterAll, beforeAll, expect, it } from 'vitest';
import { moddedValues, weaponClass, weaponStats } from '@vertice/shared';
import { createApp } from '../src/app.js';
import { moddedWeapon, modsOf } from '../src/game/weapons.js';
import { BotClient } from '../../tools/loadtest/src/botclient.js';

let app: Awaited<ReturnType<typeof createApp>>;
let base = '';
const bots: BotClient[] = [];
beforeAll(async () => {
  app = await createApp({ port: 0, host: '127.0.0.1', databaseUrl: undefined, pgliteDir: 'memory://', ambientNpcs: 0, crowdNpcs: 0, threats: false, logLevel: 'warn', lingerSeconds: 0 });
  base = `http://127.0.0.1:${app.port}`;
});
afterAll(async () => { for (const b of bots) b.close(); await app?.close(); });

async function join(name: string) {
  const token = await BotClient.registerAndCreate(base, name);
  const bot = new BotClient(base, name); bots.push(bot);
  await bot.connect(token, app.contentHash);
  const conn = [...app.world.conns.values()].find((c) => c.p?.name === name)!;
  return { bot, conn };
}
const item = (id: string) => app.world.c.items.find((i) => i.id === id)!;
const wait = (ms = 300) => new Promise((r) => setTimeout(r, ms));
let op = 0;

it('cada arma tiene sus propias barras de 1 a 10 y las mejores son las más caras', () => {
  const guns = app.world.c.items.filter((i) => weaponClass(i));
  expect(guns.length).toBeGreaterThanOrEqual(20);
  const keys = new Set(guns.map((g) => JSON.stringify(weaponStats(moddedValues(g as any, [])))));
  expect(keys.size).toBe(guns.length); // ninguna arma tiene las mismas seis barras que otra
  for (const g of guns) for (const v of Object.values(weaponStats(moddedValues(g as any, [])))) { expect(v).toBeGreaterThanOrEqual(1); expect(v).toBeLessThanOrEqual(10); }
  expect(item('francotirador-inteligente').price).toBeGreaterThan(item('rifle-precision').price!);
  expect(item('francotirador-inteligente').price).toBeGreaterThan(50000);
  expect(item('pistola-ligera').price).toBeGreaterThan(500);
});

it('los accesorios tienen nombre propio, encajan solo en ciertas clases y los ilegales solo se venden en el mercado negro', () => {
  const atts = app.world.c.items.filter((i) => i.attachment);
  expect(atts.length).toBeGreaterThanOrEqual(40);
  expect(new Set(atts.map((a) => a.name)).size).toBe(atts.length);
  for (const a of atts) expect(a.name).not.toMatch(/\b(1|2|3)$/);
  expect(item('mira-francotirador-8x').attachment!.classes).toEqual(['tirador']);
  for (const z of [1.1, 1.2, 1.4, 4, 8]) expect(atts.some((a) => a.attachment!.sight?.zoom === z), `mira ×${z}`).toBe(true);
  for (const sh of app.world.c.shops) for (const s of Object.keys(sh.stock)) {
    const def = item(s);
    if (def?.attachment?.legal === false) expect(sh.fence, `${def.id} en ${sh.id}`).toBe(true);
  }
});

it('en el banco de armero se monta y desmonta un accesorio y cambia el arma en combate', async () => {
  const w = app.world;
  const a = await join('Armero44');
  const p = a.conn.p!;
  await w.effects.apply(p, [{ item: 'rifle-precision', qty: 1 }, { item: 'supresor-sombra', qty: 1 }, { item: 'mira-francotirador-8x', qty: 1 }, { item: 'canon-estriado-hielo', qty: 1 }, { item: 'cachas-vibora', qty: 1 }], { opId: `t44-${++op}`, kind: 'test' } as any);
  const send = (m: any) => a.bot.raw({ t: 'weaponMod', seq: 0, opId: `armero44-${++op}`, ...m });
  // Fuera de una armería con taller no se puede.
  send({ action: 'install', weapon: 'rifle-precision', attachment: 'mira-francotirador-8x' });
  await wait();
  expect(modsOf(p)['rifle-precision']).toBeUndefined();
  // En Precisión Cívica, sí.
  await w.teleport(a.conn, 'armeria-precision-int', [7, 5]);
  await wait();
  const before = moddedWeapon(w.c, p, item('rifle-precision'))!;
  send({ action: 'install', weapon: 'rifle-precision', attachment: 'mira-francotirador-8x' });
  send({ action: 'install', weapon: 'rifle-precision', attachment: 'canon-estriado-hielo' });
  send({ action: 'install', weapon: 'rifle-precision', attachment: 'supresor-sombra' });
  send({ action: 'install', weapon: 'rifle-precision', attachment: 'cachas-vibora' }); // de pistola: no encaja
  await wait(600);
  const mods = modsOf(p)['rifle-precision']!;
  expect(mods.mira).toBe('mira-francotirador-8x');
  expect(mods.canon).toBe('canon-estriado-hielo');
  expect(mods.boca).toBe('supresor-sombra');
  expect(mods.empunadura).toBeUndefined();
  expect(p.inventory.get('mira-francotirador-8x') ?? 0).toBe(0);
  expect(p.inventory.get('cachas-vibora')).toBe(1);
  const after = moddedWeapon(w.c, p, item('rifle-precision'))!;
  expect(after.range).toBeGreaterThan(before.range); // cañón estriado
  expect(after.noise!).toBeLessThan((before.noise ?? 0.5) * 0.6); // silenciador
  // La ficha manda la mira y las barras; el combate usa el arma modificada.
  a.bot.raw({ t: 'equip', seq: 0, item: 'rifle-precision' });
  await wait();
  const sheet = (await import('../src/game/player.js')).buildSheet(w.c, p);
  expect(sheet.weapon?.sight).toEqual({ zoom: 8, reticle: 'francotirador' });
  expect(sheet.weapon?.stats?.ruido).toBeLessThan(weaponStats(moddedValues(item('rifle-precision') as any, [])).ruido);
  // Quitar devuelve el accesorio al inventario.
  send({ action: 'remove', weapon: 'rifle-precision', slot: 'boca' });
  await wait();
  expect(modsOf(p)['rifle-precision']!.boca).toBeUndefined();
  expect(p.inventory.get('supresor-sombra')).toBe(1);
  // Montar otra mira devuelve la anterior.
  await w.effects.apply(p, [{ item: 'mira-recortada-4x', qty: 1 }], { opId: `t44-${++op}`, kind: 'test' } as any);
  send({ action: 'install', weapon: 'rifle-precision', attachment: 'mira-recortada-4x' });
  await wait();
  expect(modsOf(p)['rifle-precision']!.mira).toBe('mira-recortada-4x');
  expect(p.inventory.get('mira-francotirador-8x')).toBe(1);
});
