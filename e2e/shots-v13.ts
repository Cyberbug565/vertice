// v0.13 · Capturas: creador con vista 3D, panel de saqueo de un cadáver con su sangre, confirmación dentro del juego y
// vida en la calle (gente sentada, al teléfono, charlando, con las manos arriba).
import { createRequire } from 'node:module';
import { createApp } from '../server/src/app.js';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = new URL('./out/', import.meta.url).pathname;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const app = await createApp({ port: 0, host: '127.0.0.1', pgliteDir: 'memory://', databaseUrl: undefined as any, ambientNpcs: 30, crowdNpcs: 0, lingerSeconds: 1, logLevel: 'warn', threats: false, cityHourOffset: 15 - ((Date.now() / 225000) % 24) });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
page.on('pageerror', (e: Error) => console.log('pageerror', e.message));
const shot = async (n: string, keepOverlays = false) => { if (!keepOverlays) await page.evaluate(() => document.querySelectorAll('.overlay').forEach((o) => o.remove())); await page.screenshot({ path: `${OUT}${n}.png`, timeout: 120000 }); console.log('📸', n); };
await page.goto(`http://127.0.0.1:${app.port}`);
await page.fill('#username', 'admintester'); await page.fill('#password', 'admintester');
await page.click('#btn-login'); await page.click('#btn-create'); await page.fill('#char-name', 'Nia Corvo'); await page.click('#btn-next');
for (const t of ['Curvilíneo/a', 'Ondas', 'Diamante', 'Respingona', 'Media sonrisa', 'Cazadora motera', 'Botas altas']) await page.click(`button.segbtn:text-is("${t}")`).catch(() => {});
await sleep(3000);
await shot('v13-01-creador-3d');
for (let i = 0; i < 8; i++) await page.click('#btn-next').catch(() => {});
await page.click('#btn-create-final');
await sleep(2500);
await page.waitForFunction(() => (window as any).__vt && (window as any).__vt.me().id > 0, null, { timeout: 120000 });
await sleep(2500);
await page.click('.overlay button.btn.primary', { timeout: 3000 }).catch(() => {});
await page.evaluate(() => document.querySelectorAll('.overlay').forEach((o) => o.remove()));
const c = [...app.world.conns.values()][0];
const city = app.world.zones.get('vertice')!;
const door = city.def.doors.find((d) => /Comisaría de Neón/.test(d.name))!;
await app.world.teleport(c, 'vertice', [door.at[0] + 2, door.at[1] + 3]);
await sleep(2500);
// Un cadáver con su charco de sangre y el panel de saqueo abierto.
const victim = app.world.spawnAmbient(city, { x: c.e!.x, y: c.e!.y })!;
victim.x = c.e!.x + 1.2; victim.y = c.e!.y + 0.3; victim.npc!.nextThink = 1e9; victim.zone.moved(victim);
victim.chrome = ['brazo_izq', 'ojos']; victim.weaponId = 'pistola-ligera'; victim.level = 14;
(app.world.combat as any).npcDeath(victim, c);
// Vida en la calle: uno sentado, otro al teléfono, dos charlando y uno con las manos arriba.
const mk = (dx: number, dy: number, emote: string, label: string) => { const e = app.world.spawnAmbient(city, { x: c.e!.x, y: c.e!.y })!; e.x = c.e!.x + dx; e.y = c.e!.y + dy; e.npc!.nextThink = 1e9; e.path = []; e.zone.moved(e); e.emote = { move: emote as any, at: Date.now() }; e.label = label; e.labelVer++; return e; };
mk(-2.2, -1.2, 'sentado', 'Sentado'); mk(2.6, -1.5, 'telefono', 'Al teléfono'); const a = mk(-1.5, 1.8, 'gesto', 'Charlando'); const b = mk(-0.6, 2.3, 'gesto', 'Charlando'); mk(3, 1.5, 'manos-arriba', 'Con las manos arriba');
a.facing = 1; b.facing = 5;
await page.evaluate(() => (window as any).__vt.view.setZoom(2.2));
await sleep(3000);
await page.evaluate((id) => (window as any).__vt.net.send({ t: 'loot', seq: 77, target: id, kind: 'view' }), victim.id);
await sleep(2500);
await shot('v13-02-saqueo-y-calle');
await page.evaluate(() => document.getElementById('loot-panel')?.remove());
// Confirmación dentro del juego (antes, ventana del navegador).
await page.keyboard.press('Escape'); await sleep(600);
await page.click('button.pbtn.danger').catch(() => {});
await sleep(800);
await shot('v13-03-confirmacion');
await browser.close(); await app.close(); process.exit(0);
