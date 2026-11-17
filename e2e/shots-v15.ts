// v0.15 · Capturas: creador con el cuerpo base femenino, ficha con la exoarmadura «Tormenta» y un fusil, y la calle
// de noche con el centro modernizado.
import { createRequire } from 'node:module';
import { createApp } from '../server/src/app.js';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = new URL('./out/', import.meta.url).pathname;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const HOUR = Number(process.env.HOUR ?? 22);
const app = await createApp({ port: 0, host: '127.0.0.1', pgliteDir: 'memory://', databaseUrl: undefined as any, ambientNpcs: 40, crowdNpcs: 0, lingerSeconds: 1, logLevel: 'warn', threats: false, cityHourOffset: HOUR - ((Date.now() / 225000) % 24) });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
page.on('pageerror', (e: Error) => console.log('pageerror', e.message));
const shot = async (n: string, keepOverlays = false) => { if (!keepOverlays) await page.evaluate(() => document.querySelectorAll('.overlay').forEach((o) => o.remove())); await page.screenshot({ path: `${OUT}${n}.png`, timeout: 180000 }); console.log('📸', n); };
await page.goto(`http://127.0.0.1:${app.port}`);
await page.fill('#username', 'admintester'); await page.fill('#password', 'admintester');
await page.click('#btn-login'); await page.click('#btn-create'); await page.fill('#char-name', 'Nia Corvo'); await page.click('#btn-next');
for (const t of ['Femenino', 'Esbelto/a', 'Melena', 'Diamante', 'Cazadora motera', 'Botas altas']) await page.click(`button.segbtn:text-is("${t}")`).catch(() => console.log('sin botón', t));
await sleep(4000);
await shot('v15-01-creador-cuerpo');
for (let i = 0; i < 8; i++) await page.click('#btn-next').catch(() => {});
await page.click('#btn-create-final');
await page.waitForFunction(() => (window as any).__vt && (window as any).__vt.me().id > 0, null, { timeout: 120000 });
await sleep(2500);
await page.click('.overlay button.btn.primary', { timeout: 3000 }).catch(() => {});
await page.evaluate(() => document.querySelectorAll('.overlay').forEach((o) => o.remove()));
const c = [...app.world.conns.values()][0];
const w = app.world as any;
await w.admin.give(c.p, 'exo-tormenta'); w.survival.wear(c, 'torso_ext', 'exo-tormenta');
await w.admin.give(c.p, 'rifle-asalto'); await w.survival.equip(c, 'rifle-asalto');
await sleep(3000);
await page.click('.overlay button.btn.primary', { timeout: 2000 }).catch(() => {});
await page.keyboard.press('i'); await sleep(4500);
await shot('v15-02-ficha-exo', true);
await page.keyboard.press('Escape'); await sleep(300); await page.keyboard.press('Escape'); await sleep(500);
await page.evaluate(() => document.querySelectorAll('.overlay').forEach((o) => o.remove()));
// Centro de la ciudad de noche.
if (process.env.CENTER) {
  const [x, y] = process.env.CENTER.split(',').map(Number);
  await w.teleport(c, 'vertice', [x, y]);
}
await page.evaluate((z) => { const v = (window as any).__vt.view; v.setZoom(z); v.zoom = z; }, Number(process.env.ZOOM ?? 1.1)); // (la foto general puede alejarse más que el límite del juego)
await sleep(5000);
await shot('v15-03-centro-noche');
await page.evaluate(() => (window as any).__vt.view.setZoom(2.6));
await sleep(3000);
await shot('v15-04-exo-calle');
await browser.close(); await app.close(); process.exit(0);
