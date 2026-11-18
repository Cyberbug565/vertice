// v0.19 · Capturas de la calle: callejones, aceras, pasos de peatones, contornos de edificios y la Tormenta.
// SPOTS="nombre:x,y:zoom;..." (casillas de la ciudad) y HOUR (hora del día).
import { createRequire } from 'node:module';
import { createApp } from '../server/src/app.js';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = new URL('./out/', import.meta.url).pathname;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const HOUR = Number(process.env.HOUR ?? 13);
const app = await createApp({ port: 0, host: '127.0.0.1', pgliteDir: 'memory://', databaseUrl: undefined as any, ambientNpcs: Number(process.env.NPCS ?? 30), crowdNpcs: 0, lingerSeconds: 1, logLevel: 'warn', threats: false, cityHourOffset: HOUR - ((Date.now() / 225000) % 24) });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('pageerror', (e: Error) => console.log('pageerror', e.message));
page.on('console', (m: any) => { if (m.type() === 'error') console.log('console', m.text().slice(0, 300)); });
await page.goto(`http://127.0.0.1:${app.port}`);
await page.fill('#username', 'admintester'); await page.fill('#password', 'admintester');
await page.click('#btn-login'); await page.click('#btn-create'); await page.fill('#char-name', 'Nia Corvo'); await page.click('#btn-next');
for (let i = 0; i < 8; i++) await page.click('#btn-next').catch(() => {});
await page.click('#btn-create-final');
await page.waitForFunction(() => (window as any).__vt && (window as any).__vt.me().id > 0, null, { timeout: 120000 });
await sleep(3000);
for (let i = 0; i < 3; i++) await page.click('.overlay button.btn.primary', { timeout: 1500 }).catch(() => {});
await page.evaluate(() => document.querySelectorAll('.overlay').forEach((o) => o.remove()));
const c = [...app.world.conns.values()][0];
const w = app.world as any;
if (process.env.PUNCH) { (c.p as any).equipped = null; if (process.env.WEAPON) { await w.admin.give(c.p, process.env.WEAPON); (c.p as any).equipped = process.env.WEAPON; } w.survival.sheet(c); }
if (process.env.TORMENTA) { w.survival.wear(c, 'torso_ext', 'exo-tormenta', true); }
for (const spot of (process.env.SPOTS ?? 'callejon:163,18:2.2').split(';')) {
  const [name, xy, z] = spot.split(':'); const [x, y] = xy.split(',').map(Number);
  await w.teleport(c, 'vertice', [x, y]);
  await sleep(2500);
  await page.evaluate((zz) => { const v = (window as any).__vt.view; v.setZoom(zz); v.zoom = zz; }, Number(z ?? 2));
  if (process.env.CLIPTEST) {
    // v0.21 · Tres transeúntes junto al jugador con gestos de la librería de animaciones.
    const e0 = c.e!;
    for (const [i, mv] of (['telefono', 'brazos', 'gesto'] as const).entries()) {
      const n = w.addEntity(e0.zone, { kind: 'npc', name: `Gesto ${i}`, x: e0.x + 1.2 + i * 0.9, y: e0.y + 0.6, interactive: true, speed: 0, appearance: { skin: '#c89070', hair: '#222', jacket: ['#7a2030', '#305a7a', '#5a5a30'][i], accent: '#43f3ff', top: 'chaqueta', body: i === 1 ? 'femenino' : 'masculino' } });
      n.npcType = 'civil'; n.emote = { move: mv, at: Date.now() }; n.facing = 2; n.labelVer++;
    }
  }
  if (process.env.CARTOONS) {
    // v0.21 · Transeúntes con personajes cartoon alrededor del jugador.
    const e0 = c.e!;
    for (const [i, model] of String(process.env.CARTOONS).split(',').entries()) {
      const n = w.addEntity(e0.zone, { kind: 'npc', name: `Vecino ${i}`, x: e0.x - 1.6 + (i % 4) * 1.1, y: e0.y + 0.9 + Math.floor(i / 4) * 1.1, interactive: true, speed: 0, appearance: { skin: '#c89070', hair: '#222', jacket: '#305a7a', accent: '#43f3ff', model } });
      n.npcType = 'civil'; n.facing = 2; n.labelVer++;
      if (i % 3 === 1) n.emote = { move: (['telefono', 'brazos', 'gesto'] as const)[i % 3], at: Date.now() };
    }
  }
  await sleep(Number(process.env.WAIT ?? 5000));
  await page.evaluate(() => document.querySelectorAll('.overlay, .toast').forEach((o) => o.remove()));
  if (process.env.PUNCH) {
    // v0.20 · Guardia (clic derecho mantenido) y puñetazo al aire (clic izquierdo).
    // SLOWMO: el reloj de la página va más despacio para ver todo el movimiento en una máquina lenta.
    if (process.env.SLOWMO) await page.evaluate((k) => { const real = performance.now.bind(performance), t0 = real(); performance.now = () => t0 + (real() - t0) * k; }, Number(process.env.SLOWMO));
    const [ax, ay] = (process.env.AIM ?? '700,330').split(',').map(Number);
    await page.mouse.move(ax, ay); await page.mouse.down({ button: 'right' }); await sleep(1200);
    await page.mouse.click(ax + 20, ay + 10);
    for (const [i, d] of String(process.env.PUNCH).split(',').entries()) { await sleep(Number(d)); await page.screenshot({ path: `${OUT}v19-${name}-${i}.png`, timeout: 180000 }); console.log('📸', name, i); }
  }
  if (!process.env.PUNCH) { await page.screenshot({ path: `${OUT}v19-${name}.png`, timeout: 180000 }); console.log('📸', name); }
  if (process.env.PUNCH) await page.mouse.up({ button: 'right' });
}
await browser.close(); await app.close(); process.exit(0);
