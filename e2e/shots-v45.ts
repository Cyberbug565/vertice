// v0.45 · Capturas y comprobaciones: barras de salud y aguante sin panel y anillos de hambre, sed y sueño (con cifras al
// mantener Alt), HUD vacío al mirar por una mira, taller del concesionario y conducción (cámara de persecución,
// velocímetro, derrape con freno de mano y marcas en el asfalto).
// Uso: npx tsx e2e/shots-v45.ts (con el cliente compilado en client/dist).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { isWalkable } from '@vertice/shared';
import { createApp } from '../server/src/app.js';
import { buildSheet } from '../server/src/game/player.js';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = new URL('../docs/pruebas-045/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const app = await createApp({ port: 0, host: '127.0.0.1', pgliteDir: 'memory://', databaseUrl: undefined as any, ambientNpcs: 10, crowdNpcs: 0, lingerSeconds: 1, logLevel: 'warn', threats: false, cityHourOffset: 15 - ((Date.now() / 225000) % 24) });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errs: string[] = [];
page.on('pageerror', (e: Error) => errs.push(e.message));
let fail = false;
const check = (ok: boolean, what: string) => { console.log(`${ok ? '✔' : '✘'} ${what}`); if (!ok) fail = true; };
await page.goto(`http://127.0.0.1:${app.port}`);
await page.fill('#username', 'admintester'); await page.fill('#password', 'admintester');
await page.click('#btn-login'); await page.click('#btn-create'); await page.fill('#char-name', 'Rueda Suelta'); await page.click('#btn-next');
for (let i = 0; i < 8; i++) await page.click('#btn-next').catch(() => {});
await page.click('#btn-create-final');
await page.waitForFunction(() => (window as any).__vt && (window as any).__vt.me().id > 0, null, { timeout: 120000 });
await sleep(3000);
for (let i = 0; i < 3; i++) await page.click('.overlay button.btn.primary', { timeout: 1500 }).catch(() => {});
await page.evaluate(() => document.querySelectorAll('.overlay').forEach((o) => o.remove()));
// Sin transiciones CSS: con el render por software van a pocos fotogramas y el estilo calculado tarda en asentarse.
await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });
const w = app.world as any;
const c = [...w.conns.values()][0];
const p = c.p;
w.stealth.discovered = () => {}; // (solo para las capturas: que la policía no se lleve al conductor)
const shot = async (name: string, wait = 800) => { await sleep(wait); await page.evaluate(() => document.querySelectorAll('.toast, .overlay').forEach((o) => o.remove())); await page.screenshot({ path: `${OUT}${name}.png` }); console.log('📸', name); };
const sheet = () => w.send(c, { t: 'sheet', sheet: buildSheet(w.c, p) });

// 1. Constantes vitales sin panel.
p.hunger = 35; p.thirst = 70; p.fatigue = 88; sheet();
await sleep(800);
const vit = await page.evaluate(() => { const v = document.querySelector('.vitals')!; const tl = document.querySelector('.hud-tl') as HTMLElement; return { rings: v.querySelectorAll('.vring').length, bars: v.querySelectorAll('.vbar').length, bg: getComputedStyle(v).backgroundColor, oldBars: tl.querySelectorAll('[aria-label="Salud"], [aria-label="Aguante"], [aria-label="Hambre"]').length, sleepP: getComputedStyle(v.querySelector('.vring.fatigue')!).getPropertyValue('--p') }; });
check(vit.rings === 3 && vit.bars === 2 && /rgba\(0, 0, 0, 0\)|transparent/.test(vit.bg), `barras y anillos sin panel (${JSON.stringify(vit)})`);
check(vit.oldBars === 0, 'el panel del personaje ya no lleva las barras viejas');
check(vit.sleepP.trim() === '12', 'el anillo del sueño baja a medida que aprieta (88 de sueño → 12 %)');
const numsHidden = await page.evaluate(() => getComputedStyle(document.querySelector('.vitals .vnum')!).opacity);
await page.keyboard.down('Alt');
await page.waitForFunction(() => document.querySelector('.vitals')!.classList.contains('nums'), null, { timeout: 5000 }).catch(() => {});
const numsShown = await page.evaluate(() => getComputedStyle(document.querySelector('.vitals .vnum')!).opacity);
check(numsHidden === '0' && numsShown === '1', `las cifras solo salen al mantener Alt (${numsHidden} → ${numsShown})`);
await page.screenshot({ path: `${OUT}01-vitales-con-cifras.png`, clip: { x: 0, y: 0, width: 420, height: 160 } }); console.log('📸 01-vitales-con-cifras');
await page.keyboard.up('Alt');
await page.screenshot({ path: `${OUT}02-vitales.png`, clip: { x: 0, y: 0, width: 420, height: 160 } }); console.log('📸 02-vitales');

// 2. Mirando por la mira: solo salud y aguante.
const city = w.zones.get('vertice');
const dist = city.def.districts.find((x: any) => x.id === 'cenit');
await w.teleport(c, 'vertice', dist.safePoint);
await page.waitForFunction(() => (window as any).__vt.me().zone === 'vertice', null, { timeout: 60000 });
await w.effects.apply(p, [{ item: 'rifle-precision', qty: 1 }], { opId: `s45-${randomUUID()}`, kind: 'test' });
p.flags.set('armas:mods', { value: { 'rifle-precision': { mira: 'mira-recortada-4x' } }, expiresAt: null });
await page.evaluate(() => (window as any).__vt.net.send({ t: 'equip', seq: 0, item: 'rifle-precision' }));
await sleep(800); sheet();
await page.evaluate(() => (window as any).__vt.camera('tercera'));
await sleep(1500);
await page.evaluate(() => { (window as any).__vt.view.guarding = true; });
await page.waitForFunction(() => (window as any).__vt.view.chars3d.ads > 0.97, null, { timeout: 15000 }).catch(() => {});
await sleep(1000);
const scoped = await page.evaluate(`(() => { const vis = (sel) => { const e = document.querySelector(sel); return !!e && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).opacity !== '0'; }; return { scoped: document.body.classList.contains('scoped'), vitals: vis('.vitals'), tl: vis('.hud-tl'), minimap: vis('#minimap'), rings: getComputedStyle(document.querySelector('.vrings')).opacity }; })()`) as any;
check(scoped.scoped && scoped.vitals && !scoped.tl && !scoped.minimap && scoped.rings === '0', `con la mira solo quedan salud y aguante (${JSON.stringify(scoped)})`);
await shot('03-mira-hud-limpio', 300);
await page.evaluate(() => { (window as any).__vt.view.guarding = false; });
await page.waitForFunction(() => (window as any).__vt.view.chars3d.ads === 0, null, { timeout: 15000 }).catch(() => {});
await sleep(500);
check(!(await page.evaluate(() => document.body.classList.contains('scoped'))), 'al dejar de apuntar vuelve el HUD');
await page.evaluate(() => (window as any).__vt.net.send({ t: 'equip', seq: 0, item: null }));

// 3. Concesionario: comprar un hiperdeportivo y un todoterreno de rally, y el taller.
p.money = 3_000_000;
await app.db.query('UPDATE characters SET money=$2 WHERE id=$1', [p.charId, p.money]);
await w.teleport(c, 'concesionario-saeta-int', [8, 4]);
await page.waitForFunction(() => (window as any).__vt.me().zone === 'concesionario-saeta-int', null, { timeout: 60000 });
await w.property.buyCar(c, 'saeta-colinas', 'saeta-relampago', randomUUID());
const hyper = p.cars[p.cars.length - 1];
await w.property.tune(c, 'saeta-colinas', hyper.id, 'neumaticos', 'semislick', randomUUID());
w.send(c, { t: 'dealer', view: w.property.dealerView(p, 'saeta-colinas') });
await page.waitForSelector('#dealer-panel .taller');
check(await page.locator('#dealer-panel .taller-part').count() >= 5, 'el concesionario tiene taller con motor, frenos, suspensión, neumáticos y peso');
await shot('04-taller', 600);
await page.evaluate(() => document.querySelectorAll('.panel').forEach((x) => x.remove()));

// 4. A la calle, al volante, en la recta más larga cerca del punto seguro.
const g = city.grid;
let best = { len: 0, x: 0, y: 0, dir: 0 };
for (let oy = -40; oy <= 40; oy += 2) for (let ox = -40; ox <= 40; ox += 2) {
  const x = dist.safePoint[0] + ox + 0.5, y = dist.safePoint[1] + oy + 0.5;
  if (!isWalkable(g, x, y)) continue;
  for (const [dir, dx, dy] of [[0, 1, 0], [1, 0, 1], [2, -1, 0], [3, 0, -1]] as const) {
    let n = 0; while (n < 220 && isWalkable(g, x + dx * n, y + dy * n) && isWalkable(g, x + dx * n + dy * 1.2, y + dy * n + dx * 1.2) && isWalkable(g, x + dx * n - dy * 1.2, y + dy * n - dx * 1.2)) n++;
    if (n > best.len) best = { len: n, x, y, dir };
  }
}
console.log('recta', best);
await w.teleport(c, 'vertice', [Math.floor(best.x), Math.floor(best.y)]);
await page.waitForFunction(() => (window as any).__vt.me().zone === 'vertice', null, { timeout: 60000 });
await sleep(1500);
await page.evaluate(() => { (window as any).__vt.camera('tercera'); (window as any).__vt.drawDist(50); });
const fpsOnFoot = await page.evaluate(`new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 3000) res(n / ((performance.now() - t0) / 1000)); else requestAnimationFrame(f); }; f(); })`);
console.log('fps a pie (tercera persona):', Number(fpsOnFoot).toFixed(1));
c.e.facing = best.dir * 2;
w.property.drive(c, hyper.id);
await page.waitForFunction(() => (window as any).__vt.view.driving && !!(window as any).__vt.view.carTune, null, { timeout: 20000 });
await sleep(1500);
const heading = best.dir * Math.PI / 2;
c.e.carMotion.heading = heading;
await page.evaluate((h: number) => { const v = (window as any).__vt.view; v.carMotion = { speed: 0, heading: h }; }, heading);
await page.evaluate(() => { (window as any).__vt.camera('tercera'); (window as any).__vt.drawDist(50); });
await sleep(1200);
// Grabadora en la página: lo máximo de cada cosa mientras se conduce (el navegador de pruebas va a pocos fotogramas).
await page.evaluate(`(() => { const v = window.__vt.view; window.__rec = { maxSpeed: 0, maxSlip: 0, hb: false, fps: 0 }; let n = 0; const t0 = performance.now(); const loop = () => { const m = v.carMotion; const r = window.__rec; r.maxSpeed = Math.max(r.maxSpeed, m.speed); r.maxSlip = Math.max(r.maxSlip, Math.abs(m.slip || 0)); r.hb = r.hb || !!m.handbrake; n++; r.fps = n / ((performance.now() - t0) / 1000); requestAnimationFrame(loop); }; loop(); })()`);
await shot('05-al-volante-parado', 600);
await page.keyboard.down('w');
await page.waitForFunction(() => (window as any).__rec.maxSpeed > 6, null, { timeout: 25000, polling: 100 }).catch(() => {});
const run = await page.evaluate(() => { const v = (window as any).__vt.view, r = (window as any).__rec; return { fps: r.fps, maxSpeed: r.maxSpeed, gear: v.carMotion.gear, fov: v.chars3d.pcam.fov, speedo: document.querySelector('.speedo-num')?.textContent, shown: getComputedStyle(document.querySelector('.speedo')!).display }; });
console.log('fps al volante (tercera persona):', run.fps.toFixed(1));
check(run.maxSpeed > 6 && run.shown !== 'none' && Number(run.speedo) > 20, `acelera con W y el velocímetro lo marca (${JSON.stringify(run)})`);
check(run.fov > 62, 'la cámara abre el ángulo con la velocidad');
await shot('06-persecucion-a-fondo', 0);
// Derrape: volante a la derecha y freno de mano, en cuanto va lanzado.
await page.evaluate(() => { const r = (window as any).__rec; r.maxSlip = 0; r.hb = false; });
await page.keyboard.down('d'); await page.keyboard.down(' ');
await page.waitForFunction(() => (window as any).__rec.maxSlip > 0.5, null, { timeout: 10000, polling: 100 }).catch(() => {});
const drift = await page.evaluate(() => { const v = (window as any).__vt.view, r = (window as any).__rec; return { slip: r.maxSlip, hb: r.hb, marks: (v.chars3d.vehicles as any).markN }; });
await shot('07-derrape-freno-de-mano', 0);
await page.keyboard.up(' '); await page.keyboard.up('d'); await page.keyboard.up('w');
check(drift.hb && drift.slip > 0.3, `con el freno de mano la cola se va (deriva ${(drift.slip * 57.3).toFixed(0)}°)`);
check(drift.marks > 0, `deja marcas de neumático (${drift.marks})`);
await page.keyboard.down('s'); await sleep(1800); await page.keyboard.up('s');
const stopped = await page.evaluate(() => (window as any).__vt.view.carMotion.speed);
check(stopped < 3, `S frena (queda a ${stopped.toFixed(1)} losetas/s)`);
await sleep(1200);
const err = await page.evaluate(() => { const me = (window as any).__vt.view.me; return Math.hypot(me.serverX - me.x, me.serverY - me.y); });
check(err < 2.5, `lo que predice el cliente y lo que calcula el servidor coinciden (desfase ${err.toFixed(2)} losetas)`);
// Primera persona: cámara de capó.
await page.evaluate(() => (window as any).__vt.camera('primera'));
await page.keyboard.down('w'); await sleep(1500);
await shot('08-camara-de-capo', 0);
await page.keyboard.up('w');
await page.keyboard.down('s'); await sleep(1500); await page.keyboard.up('s');
// Cenital al volante.
await page.evaluate(() => (window as any).__vt.camera('cenital'));
await page.keyboard.down('w'); await page.keyboard.down('a'); await sleep(1400);
await shot('09-cenital-al-volante', 0);
await page.keyboard.up('a'); await page.keyboard.up('w');
if (errs.length) { fail = true; console.log('errores de página:', errs.slice(0, 5)); }
await browser.close(); await app.close();
console.log(fail ? 'E2E v0.45: FALLO' : 'E2E v0.45: OK');
process.exit(fail ? 1 : 0);
