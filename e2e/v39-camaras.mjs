// v0.39 · Cámaras: F5 cambia cenital → tercera → primera persona; W va hacia donde mira la cámara y D a su derecha;
// arrastrar gira la vista sin contar como clic, y un clic sobre una puerta en tercera persona la abre (selección 3D).
// Uso: con el servidor en marcha (PORT=8080), `node e2e/v39-camaras.mjs`.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const BASE = process.env.BASE ?? 'http://localhost:8080';
const b = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await b.newContext({ viewport: { width: 1100, height: 700 } })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
let fail = false;
const step = async (name, fn) => { const t = Date.now(); try { await fn(); console.log(`✔ ${name} (${Date.now() - t} ms)`); } catch (e) { fail = true; console.log(`✘ ${name}: ${e.message.split('\n')[0]}`); } };
const tag = Date.now().toString(36).slice(-5);
await step('Crear personaje', async () => {
  await page.goto(BASE);
  await page.fill('#username', 'cam' + tag); await page.fill('#password', 'secreto1'); await page.click('#btn-register');
  await page.click('#btn-create'); await page.fill('#char-name', 'Cam ' + tag.slice(-4));
  for (let i = 0; i < 3; i++) await page.click('#btn-next');
  await page.click('#bio-objective-leyenda'); await page.click('#btn-next');
  await page.click('[id^=role-]'); for (let i = 0; i < 4; i++) await page.click('#btn-next');
  await page.click('#btn-create-final');
  await page.waitForFunction(() => window.__vt && window.__vt.me().id > 0, null, { timeout: 20000 });
  await page.waitForTimeout(2000);
});
await step('F5 recorre cenital → tercera → primera → cenital', async () => {
  await page.click('canvas', { position: { x: 5, y: 300 } }).catch(() => {});
  const seen = [await page.evaluate(() => window.__vt.camera())];
  for (let i = 0; i < 3; i++) { await page.keyboard.press('F5'); await page.waitForTimeout(400); seen.push(await page.evaluate(() => window.__vt.camera())); }
  if (seen.join(',') !== 'cenital,tercera,primera,cenital') throw new Error(seen.join(','));
});
await step('En tercera persona, W va hacia donde mira la cámara y D a su derecha', async () => {
  await page.evaluate(() => window.__vt.camera('tercera'));
  await page.waitForTimeout(500); // (el primer fotograma coloca la cámara detrás del personaje)
  for (const yaw of [Math.PI / 2, -Math.PI / 2, 0.7]) {
    await page.evaluate((y) => { window.__vt.view.chars3d.camYaw = y; }, yaw);
    await page.waitForTimeout(150);
    for (const [key, ex, ey] of [['w', Math.sin(yaw), Math.cos(yaw)], ['d', -Math.cos(yaw), Math.sin(yaw)]]) {
      const p0 = await page.evaluate(() => window.__vt.me());
      await page.keyboard.down(key); await page.waitForTimeout(450); await page.keyboard.up(key); await page.waitForTimeout(450);
      const p1 = await page.evaluate(() => window.__vt.me());
      const dx = p1.x - p0.x, dy = p1.y - p0.y, l = Math.hypot(dx, dy);
      if (l < 0.2) continue; // contra una pared: no cuenta
      if ((dx * ex + dy * ey) / l < 0.9) throw new Error(`yaw ${yaw.toFixed(2)} ${key}: (${(dx / l).toFixed(2)}, ${(dy / l).toFixed(2)})`);
    }
  }
});
await step('Arrastrar gira sin clicar; un clic en la puerta la abre', async () => {
  const door = (await page.evaluate(() => window.__vt.entities())).find((e) => e.kind === 'door' && !/Escaleras/.test(e.name));
  const aim = () => page.evaluate((d) => { const me = window.__vt.me(); window.__vt.view.chars3d.camYaw = Math.atan2(d.x - me.x, d.y - me.y); }, door);
  await aim(); await page.waitForTimeout(500);
  const z0 = await page.evaluate(() => window.__vt.me().zone);
  const yaw0 = await page.evaluate(() => window.__vt.view.chars3d.camYaw);
  let s = await page.evaluate((d) => window.__vt.screenOf(d.x, d.y, 0.6), door);
  await page.mouse.move(s.x, s.y); await page.mouse.down(); await page.mouse.move(s.x + 60, s.y, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(1500);
  if (await page.evaluate(() => window.__vt.view.chars3d.camYaw) === yaw0) throw new Error('arrastrar no giró la cámara');
  if ((await page.evaluate(() => window.__vt.me().zone)) !== z0) throw new Error('arrastrar contó como clic');
  await aim(); await page.waitForTimeout(500);
  s = await page.evaluate((d) => window.__vt.screenOf(d.x, d.y, 0.6), door);
  await page.mouse.click(s.x, s.y);
  await page.waitForFunction((z) => window.__vt.me().zone !== z, z0, { timeout: 30000 });
});
await step('Primera persona: el modelo propio no se dibuja y la mirilla sí', async () => {
  await page.evaluate(() => window.__vt.camera('primera')); await page.waitForTimeout(600);
  const r = await page.evaluate(() => { const rig = window.__vt.view.chars3d.rigs.get(window.__vt.me().id); return { body: rig?.root.visible, cross: getComputedStyle(document.querySelector('.crosshair')).display }; });
  if (r.body !== false || r.cross === 'none') throw new Error(JSON.stringify(r));
  await page.evaluate(() => window.__vt.camera('cenital'));
});
if (errs.length) { fail = true; console.log('errores de página:', errs.slice(0, 5)); }
await b.close();
console.log(fail ? 'E2E cámaras: FALLO' : 'E2E cámaras: OK');
process.exit(fail ? 1 : 0);
