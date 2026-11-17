// Capturas de la v0.10: ruleta de armas, armas a la espalda y la cadera, barra de sigilo, ojos de quien te mira, arco detector y el Banco Central.
// Uso: npx tsx e2e/shots-v10.ts
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createApp } from '../server/src/app.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const app = await createApp({ port: 0, host: '127.0.0.1', pgliteDir: 'memory://', databaseUrl: undefined as any, ambientNpcs: 40, crowdNpcs: 0, lingerSeconds: 1, logLevel: 'warn', threats: false, cityHourOffset: 15 - ((Date.now() / 225000) % 24) });
const BASE = `http://127.0.0.1:${app.port}`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('pageerror', (e: Error) => console.log('pageerror', e.message));
const shot = async (n: string) => { await page.screenshot({ path: `${OUT}${n}.png` }); console.log('📸', n); };

await page.goto(BASE);
await page.fill('#username', 'admintester'); await page.fill('#password', 'admintester');
await page.click('#btn-login');
await page.click('#btn-create');
await page.fill('#char-name', 'Kai Sombra');
await page.click('#btn-next');
for (let i = 0; i < 8; i++) await page.click('#btn-next').catch(() => {});
await page.click('#btn-create-final');
await page.waitForFunction(() => (window as any).__vt && (window as any).__vt.me().id > 0, null, { timeout: 20000 });
await sleep(3500);
await page.click('.overlay button.btn.primary', { timeout: 3000 }).catch(() => {});
const c = [...app.world.conns.values()][0];
const p = c.p!;
// Armas encima: rifle a la espalda, katana a la espalda y pistola en la cadera; el dedo pistola, en el cromo.
const rifle = app.world.c.items.find((i) => i.weapon?.family === 'Rifle')!.id;
const pistol = app.world.c.items.find((i) => i.weapon?.family === 'Pistola')!.id;
for (const [id] of [...p.inventory]) if (app.world.c.items.find((i) => i.id === id)?.weapon) p.inventory.set(id, 0);
p.inventory.set(rifle, 1); p.inventory.set(pistol, 1); p.inventory.set('katana-termica', 1); p.equipped = null;
p.cyber.push({ id: 'shot-dedo', def: 'dedo-pistola', location: 'installed', stolen: false } as any);
const city = app.world.zones.get('vertice')!;
const bankDoor = city.def.doors.find((d) => d.to.zone === 'banco-central')!;
await app.world.teleport(c, 'vertice', [bankDoor.at[0], bankDoor.at[1] + 3]);
await sleep(3000);
// Un agente mirando: la barra de sigilo y el ojo sobre su cabeza.
const e = c.e!;
const cop = app.world.combat.spawnFactionNpc(city, 'pcv', 'police', undefined, { x: e.x - 4, y: e.y });
if (cop) { cop.npc!.pauseUntil = app.world.tick + 1e6; cop.facing = 0; }
p.equipped = pistol;
app.world.send(c, { t: 'sheet', sheet: (app.world.survival as any).sheetOf(p) });
await sleep(4500);
await shot('v10-01-armas-a-la-vista-sospecha');
// De cerca: rifle y katana a la espalda, pistola en la cadera (manos vacías).
p.equipped = null; app.world.send(c, { t: 'sheet', sheet: (app.world.survival as any).sheetOf(p) });
const n2 = app.world.zones.get('pasarelas')!.def.safePoint as [number, number];
await app.world.teleport(c, 'pasarelas', [n2[0] - 3, n2[1]]);
await sleep(2500);
await page.evaluate(() => (window as any).__vt.view.setZoom(3.2));
await sleep(1500);
await shot('v10-05-armas-espalda-cadera');
await page.evaluate(() => (window as any).__vt.view.setZoom(1));
await app.world.teleport(c, 'vertice', [bankDoor.at[0], bankDoor.at[1] + 3]);
p.equipped = pistol;
await sleep(2500);
// Ruleta de armas.
await page.keyboard.press('r'); await sleep(700);
await page.mouse.move(640 + 150, 360); await sleep(400);
await shot('v10-02-ruleta-de-armas');
await page.keyboard.press('Escape'); await sleep(300);
// Entrar en el banco armado: arco detector y alarma.
p.equipped = null;
await app.world.teleport(c, 'banco-central', [10, 12]);
app.world.stealth.detector(c, 'banco-central');
await sleep(2200);
await shot('v10-03-arco-detector-alarma');
// Te buscan: PCV, militares y una banda.
p.wanted = 4.5;
const gang = app.world.c.factions.find((f) => f.kind === 'gang')!;
await app.world.survival.bounties.post('player', { charId: p.charId, name: p.name }, 5000, gang.id, 'Nos la debes');
await app.world.teleport(c, 'vertice', [bankDoor.at[0], bankDoor.at[1] + 3]);
await sleep(3500);
await shot('v10-04-te-buscan');
await browser.close(); await app.close();
process.exit(0);
