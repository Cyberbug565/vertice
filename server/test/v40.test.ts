// v0.40 · Con la cámara en tercera o primera persona, los PNJ al alcance se replican aunque estén a tu espalda; los
// jugadores siguen con el cono de visión (es la regla de equilibrio de la vista cenital).
import { afterAll, beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
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

async function join(name: string) {
  const token = await BotClient.registerAndCreate(base, name);
  const bot = new BotClient(base, name); bots.push(bot);
  await bot.connect(token, app.contentHash);
  const conn = [...app.world.conns.values()].find((c) => c.p?.name === name)!;
  return { bot, conn };
}

it('en tercera persona se ven los PNJ de detrás; los jugadores de detrás, no', async () => {
  const w = app.world;
  const a = await join('Mirador40'), b = await join('Espalda40');
  const city = w.zones.get('vertice')!;
  // Un sitio abierto de la calle: A mira al este (facing 0); el PNJ y B quedan detrás, al oeste.
  const d = city.def.districts.find((x) => x.id === 'cenit')!;
  const [sx, sy] = d.safePoint;
  await w.teleport(a.conn, 'vertice', [sx, sy]);
  await w.teleport(b.conn, 'vertice', [sx - 3, sy]);
  a.conn.e!.facing = 0; a.conn.e!.moving = false;
  const npc = w.addEntity(city, { kind: 'npc', name: 'Detrás40', x: sx - 3.5 + 0.5, y: sy + 0.5, interactive: true, label: '' });
  const seen = () => a.conn.known.has(npc.id);
  await new Promise((r) => setTimeout(r, 400));
  expect(seen()).toBe(false); // cenital: fuera del cono
  expect(a.conn.known.has(b.conn.e!.id)).toBe(false);
  a.bot.raw({ t: 'camera', mode: 'tercera' });
  await new Promise((r) => setTimeout(r, 400));
  expect(a.conn.nearCam).toBe(true);
  expect(seen()).toBe(true); // tercera persona: el PNJ de detrás se ve
  expect(a.conn.known.has(b.conn.e!.id)).toBe(false); // el jugador de detrás, no
  a.bot.raw({ t: 'camera', mode: 'cenital' });
  await new Promise((r) => setTimeout(r, 400));
  expect(seen()).toBe(false);
});

it('los coches caros salen menos en el tráfico que los baratos', () => {
  const cars = app.world.c.cars;
  const w = (id: string) => cars.find((c) => c.id === id)!.traffic;
  expect(w('vidal-pulga')).toBeGreaterThan(w('marrow-garza') * 3);
  expect(w('marrow-garza')).toBeGreaterThan(w('saeta-relampago') * 5);
  expect(w('zephyr-singularidad')).toBeGreaterThan(0); // hasta el más caro aparece alguna vez
  // Con precio parecido, el más barato sale más (salvo los de servicio, que tienen su propia frecuencia).
  const civil = cars.filter((c) => !['vidal-vigia', 'halcon-pretoriano', 'brennan-rescate', 'brennan-escoria', 'aurora-remesa', 'halcon-centurion', 'brennan-uro'].includes(c.id)).sort((x, y) => x.price - y.price);
  for (let i = 1; i < civil.length; i++) expect(civil[i].traffic, civil[i].id).toBeLessThanOrEqual(civil[i - 1].traffic);
  // Los modelos de las balas no van en el repositorio (licencia): la carpeta está en .gitignore.
  expect(readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8')).toMatch(/models\/extra/);
});
