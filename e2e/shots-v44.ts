// v0.44 · Capturas y comprobaciones: armería con barras de estadísticas, banco de armero (vista previa de cambios y
// montar), punto de mira sin mira y la vista a través de cada mira al apuntar (hierro, holo 1,2×, holo 1,4×, 4×, 8×).
// Uso: npx tsx e2e/shots-v44.ts (con el cliente compilado en client/dist).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { createApp } from '../server/src/app.js';
import { buildSheet } from '../server/src/game/player.js';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = new URL('../docs/pruebas-044/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const app = await createApp({ port: 0, host: '127.0.0.1', pgliteDir: 'memory://', databaseUrl: undefined as any, ambientNpcs: 20, crowdNpcs: 0, lingerSeconds: 1, logLevel: 'warn', threats: false, cityHourOffset: 13 - ((Date.now() / 225000) % 24) });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errs: string[] = [];
page.on('pageerror', (e: Error) => errs.push(e.message));
let fail = false;
const check = (ok: boolean, what: string) => { console.log(`${ok ? '✔' : '✘'} ${what}`); if (!ok) fail = true; };
await page.goto(`http://127.0.0.1:${app.port}`);
await page.fill('#username', 'admintester'); await page.fill('#password', 'admintester');
await page.click('#btn-login'); await page.click('#btn-create'); await page.fill('#char-name', 'Tiro Fino'); await page.click('#btn-next');
for (let i = 0; i < 8; i++) await page.click('#btn-next').catch(() => {});
await page.click('#btn-create-final');
await page.waitForFunction(() => (window as any).__vt && (window as any).__vt.me().id > 0, null, { timeout: 120000 });
await sleep(3000);
for (let i = 0; i < 3; i++) await page.click('.overlay button.btn.primary', { timeout: 1500 }).catch(() => {});
await page.evaluate(() => document.querySelectorAll('.overlay').forEach((o) => o.remove()));
const w = app.world as any;
const c = [...w.conns.values()][0];
const p = c.p;
const shot = async (name: string, wait = 1200) => { await sleep(wait); await page.evaluate(() => document.querySelectorAll('.toast').forEach((o) => o.remove())); await page.screenshot({ path: `${OUT}${name}.png` }); console.log('📸', name); };
let op = 0;
const give = (items: [string, number][]) => w.effects.apply(p, items.map(([item, qty]) => ({ item, qty })), { opId: `shots44-${++op}`, kind: 'test' });
await give([['rifle-precision', 1], ['rifle-asalto', 1], ['mira-francotirador-8x', 1], ['canon-estriado-hielo', 1], ['bipode-titan', 1], ['supresor-sombra', 1]]);
p.money = 250000; w.send(c, { t: 'sheet', sheet: buildSheet(w.c, p) });

// 1. Armería legal: barras blancas en cada arma y la descripción de cada accesorio.
await w.teleport(c, 'armeria-precision-int', [7, 6]);
await page.waitForFunction(() => (window as any).__vt.me().zone === 'armeria-precision-int', null, { timeout: 60000 });
await sleep(1500);
w.send(c, { t: 'shop', view: w.survival.market.shopView('armeria-precision', p) });
await page.waitForSelector('#shop-panel .wstats');
check(await page.locator('#shop-panel .wstats').count() >= 6, 'la tienda enseña las barras de cada arma');
check(await page.locator('[data-armero]').count() === 1, 'botón del banco de armero en una armería con taller');
await shot('01-armeria-barras', 400);
await page.evaluate(() => { const t = document.querySelector('#shop-panel'); const row = [...t!.querySelectorAll('tr')].find((r) => /Visor de francotirador/.test(r.textContent ?? '')); row?.scrollIntoView(); });
await shot('02-armeria-accesorios', 300);

// 2. Banco de armero: elegir el rifle, pasar por encima de un accesorio (verde/rojo) y montarlo.
await page.click('[data-armero]');
await page.waitForSelector('#armero-panel');
await page.click('#armero-panel button:has-text("Rifle de precisión")').catch(() => {});
await sleep(300);
const opt = page.locator('#armero-panel .armero-opt', { hasText: 'Cañón estriado' }).first();
await opt.hover(); await sleep(250);
check(await page.locator('#armero-panel .wstat-bar b.up').count() > 0, 'la vista previa marca en verde lo que sube');
await shot('03-banco-vista-previa', 200);
for (const name of ['Visor de francotirador', 'Cañón estriado', 'Bípode', 'Supresor Sombra']) {
  const b = page.locator('#armero-panel .armero-opt', { hasText: name }).first().locator('button:has-text("Montar")');
  if (await b.count()) { await b.click(); await sleep(700); }
}
const mods = w.c && (p.flags.get('armas:mods')?.value ?? {});
check(mods['rifle-precision']?.mira === 'mira-francotirador-8x' && !!mods['rifle-precision']?.canon, `accesorios montados desde el panel: ${JSON.stringify(mods['rifle-precision'])}`);
await page.mouse.move(5, 5);
await shot('04-banco-montado', 500);

// 3. Al aire libre: punto de mira y la vista por cada mira al apuntar. (Solo para las capturas: la policía no reacciona
//    al arma empuñada en plena calle; en el juego te daría el alto y acabarías en el penal.)
w.stealth.discovered = () => {};
await page.evaluate(() => document.querySelectorAll('.panel').forEach((x) => x.remove()));
const city = w.zones.get('vertice');
const d = city.def.districts.find((x: any) => x.id === 'cenit');
await w.teleport(c, 'vertice', d.safePoint);
await page.waitForFunction(() => (window as any).__vt.me().zone === 'vertice', null, { timeout: 60000 });
await sleep(2500);
const setGun = async (weapon: string, slots: Record<string, string>) => {
  p.flags.set('armas:mods', { value: { ...(p.flags.get('armas:mods')?.value ?? {}), [weapon]: slots }, expiresAt: null });
  await page.evaluate((id: string) => (window as any).__vt.net.send({ t: 'equip', seq: 0, item: id }), weapon);
  await sleep(600); w.send(c, { t: 'sheet', sheet: buildSheet(w.c, p) }); await sleep(400);
};
await setGun('rifle-asalto', {});
await page.evaluate(() => (window as any).__vt.camera('tercera'));
await page.evaluate(() => { const v = (window as any).__vt.view; v.chars3d.camYaw = 0.6; v.chars3d.camPitch = -0.08; });
await sleep(1500);
const dot = () => page.evaluate(() => getComputedStyle(document.querySelector('.crosshair')!).display !== 'none');
check(await dot(), 'tercera persona sin mira: punto de mira en el centro');
await shot('05-tercera-punto', 300);
const aim = async (on: boolean) => { await page.evaluate((o: boolean) => { (window as any).__vt.view.guarding = o; }, on); await page.waitForFunction((o: boolean) => { const a = (window as any).__vt.view.chars3d.ads; return o ? a > 0.97 : a === 0; }, on, { timeout: 15000 }).catch(() => {}); await sleep(300); };
const sights: [string, string, string, Record<string, string>][] = [
  ['06-hierro', 'hierro', 'rifle-asalto', { mira: 'mira-hierro-tritio' }],
  ['07-holo-12', 'holo', 'rifle-asalto', { mira: 'mira-holo-12' }],
  ['08-holo-14', 'holo-anillo', 'rifle-asalto', { mira: 'mira-holo-14', empunadura: 'agarre-vertical-explorador' }],
  ['09-recortada-4x', 'tactica', 'rifle-asalto', { mira: 'mira-recortada-4x' }],
  ['10-francotirador-8x', 'francotirador', 'rifle-precision', { mira: 'mira-francotirador-8x', canon: 'canon-estriado-hielo', boca: 'supresor-sombra' }],
];
let fov0 = await page.evaluate(() => (window as any).__vt.view.chars3d.pcam.fov);
for (const [name, ret, gun, slots] of sights) {
  await aim(false); await setGun(gun, slots);
  await page.waitForFunction((r: string) => (window as any).__vt.view.scope?.reticle === r, ret, { timeout: 10000 }).catch(() => {});
  await aim(true);
  const st = await page.evaluate(() => ({ ret: (document.querySelector('.sight-ov') as HTMLElement).dataset.reticle, on: getComputedStyle(document.querySelector('.sight-ov')!).display !== 'none', fov: (window as any).__vt.view.chars3d.pcam.fov, ads: (window as any).__vt.view.ads }));
  check(st.ads && st.on && st.ret === ret, `${name}: se ve a través de la mira (${st.ret})`);
  if (name !== '06-hierro') check(st.fov < fov0, `${name}: la cámara se acerca (fov ${st.fov.toFixed(1)})`);
  await shot(name, 300);
}
// Primera persona sin mira al apuntar: solo el punto, algo de aumento.
await aim(false); await setGun('rifle-asalto', {});
await page.evaluate(() => (window as any).__vt.camera('primera')); await sleep(800);
check(await dot(), 'primera persona sin mira: punto de mira');
await aim(true);
check(await dot() && await page.evaluate(() => getComputedStyle(document.querySelector('.sight-ov')!).display === 'none'), 'apuntando sin mira: punto y sin retícula');
await shot('11-primera-sin-mira', 300);
await aim(false);
await page.evaluate(() => (window as any).__vt.camera('cenital')); await sleep(500);
check(!(await dot()), 'cenital: sin punto de mira');
if (errs.length) { fail = true; console.log('errores de página:', errs.slice(0, 5)); }
await browser.close(); await app.close();
console.log(fail ? 'E2E v0.44: FALLO' : 'E2E v0.44: OK');
process.exit(fail ? 1 : 0);
