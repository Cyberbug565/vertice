// Prueba de extremo a extremo con DOS navegadores reales (contextos aislados) contra el servidor en marcha.
// Uso: BASE_URL=http://localhost:8080 node e2e/two-browsers.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }
const { chromium } = playwright;

const BASE = process.env.BASE_URL ?? 'http://localhost:8080';
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const tag = Date.now().toString(36).slice(-5);
const results = [];
const step = async (name, fn) => {
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true, ms: Date.now() - t0 }); console.log(`✔ ${name} (${Date.now() - t0} ms)`); }
  catch (e) { results.push({ name, ok: false, error: String(e.message ?? e) }); console.log(`✘ ${name}: ${e.message}`); throw e; }
};

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const ctxB = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const errors = [];
const watch = (p, who) => { p.on('pageerror', (e) => errors.push(`${who}: ${e.message}`)); };

async function createCharacter(page, user, name, roleId) {
  await page.goto(BASE);
  await page.fill('#username', user); await page.fill('#password', 'secreto1');
  await page.click('#btn-register');
  await page.click('#btn-create');
  await page.fill('#char-name', name);
  await page.click('#btn-next'); await page.click('#btn-next');
  await page.click(`#role-${roleId}`); await page.click('#btn-next');
  await page.click('#btn-next');
  await page.click('#btn-create-final');
  await page.waitForFunction(() => window.__vt && window.__vt.me().id > 0, null, { timeout: 15000 });
}
const me = (p) => p.evaluate(() => window.__vt.me());
const ents = (p) => p.evaluate(() => window.__vt.entities());
const clickWorld = async (p, x, y, button = 'left') => { const s = await p.evaluate(([x, y]) => window.__vt.screenOf(x, y), [x, y]); await p.mouse.click(s.x, s.y, { button }); };
const clickEntity = async (p, pred) => {
  const list = await ents(p);
  const e = list.find(pred);
  if (!e) throw new Error('entidad no visible');
  const s = await p.evaluate(([x, y]) => window.__vt.screenOf(x, y), [e.x, e.y]);
  await p.mouse.click(s.x, s.y - (e.kind === 'npc' ? 20 : 8));
};
const waitZone = (p, z, ms = 30000) => p.waitForFunction((z) => window.__vt.me().zone === z, z, { timeout: ms });

const A = await ctxA.newPage(); watch(A, 'A');
const B = await ctxB.newPage(); watch(B, 'B');
const nameA = `Ana ${tag}`, nameB = `Bruno ${tag}`;

try {
  await step('Creación de personaje en dos navegadores (Solo y Netrunner)', async () => {
    await createCharacter(A, `ana${tag}`, nameA, 'solo');
    await createCharacter(B, `bruno${tag}`, nameB, 'netrunner');
  });
  await step('Ambos coinciden en el vestíbulo del Bloque 9 y se ven', async () => {
    await A.waitForFunction((n) => window.__vt.entities().some((e) => e.kind === 'player' && e.name === n), nameB, { timeout: 8000 });
    await B.waitForFunction((n) => window.__vt.entities().some((e) => e.kind === 'player' && e.name === n), nameA, { timeout: 8000 });
    await A.waitForTimeout(500);
    await A.screenshot({ path: `${OUT}01-vestibulo-dos-jugadores.png` });
  });
  await step('Clic en el suelo mueve; clic derecho cancela', async () => {
    const m0 = await me(A);
    await clickWorld(A, 14.5, 9.5);
    await A.waitForTimeout(600);
    const m1 = await me(A);
    if (Math.hypot(m1.x - m0.x, m1.y - m0.y) < 0.3) throw new Error('no se movió');
    await clickWorld(A, 14.5, 9.5, 'right');
    await A.waitForTimeout(700);
    const m2 = await me(A);
    await A.waitForTimeout(600);
    const m3 = await me(A);
    if (Math.hypot(m3.x - m2.x, m3.y - m2.y) > 0.15) throw new Error('siguió moviéndose tras cancelar');
  });
  await step('Colisión: un clic fuera del área transitable se rechaza con motivo', async () => {
    await clickWorld(A, 8.5, -4);
    await A.waitForSelector('.toast.warn', { timeout: 4000 });
  });
  await step('Salir a la calle (interior → exterior)', async () => {
    await clickEntity(A, (e) => e.kind === 'door');
    await waitZone(A, 'ferro');
    await A.waitForTimeout(1200);
    await A.screenshot({ path: `${OUT}02-calle-ferro.png` });
  });
  await step('Entrar en el bar El Relé haciendo clic en su puerta (aproximación autónoma)', async () => {
    await clickEntity(A, (e) => e.kind === 'door' && e.name.includes('Relé'));
    await waitZone(A, 'bar-rele');
    await A.waitForTimeout(800);
  });
  await step('Hablar con Nadia y aceptar el encargo compartido', async () => {
    await clickEntity(A, (e) => e.name.includes('Nadia'));
    await A.waitForSelector('#opt-accept', { timeout: 15000 });
    await A.screenshot({ path: `${OUT}03-dialogo-nadia.png` });
    await A.click('#opt-accept');
    await A.waitForFunction(() => window.__vt.st.journal.some((j) => j.state === 'active'), null, { timeout: 5000 });
  });
  await step('El segundo jugador se une a la misma instancia del encargo', async () => {
    await clickEntity(B, (e) => e.kind === 'door');
    await waitZone(B, 'ferro');
    await B.waitForTimeout(500);
    await clickEntity(B, (e) => e.kind === 'door' && e.name.includes('Relé'));
    await waitZone(B, 'bar-rele');
    await B.waitForTimeout(800);
    await clickEntity(B, (e) => e.name.includes('Nadia'));
    await B.waitForSelector('#opt-accept', { timeout: 15000 });
    await B.click('#opt-accept');
    await B.waitForFunction(() => window.__vt.st.journal.some((j) => j.state === 'active' && j.participants === 2), null, { timeout: 5000 });
    await B.keyboard.press('j');
    await B.waitForTimeout(300);
    await B.screenshot({ path: `${OUT}04-diario-compartido.png` });
    await B.keyboard.press('Escape');
  });
  await step('Reconexión: recargar la página recupera la misma vida y lugar', async () => {
    const before = await me(A);
    await A.reload();
    await A.click('#btn-enter');
    await A.waitForFunction(() => window.__vt && window.__vt.me().id > 0, null, { timeout: 15000 });
    const after = await me(A);
    if (after.zone !== before.zone) throw new Error(`zona ${after.zone} ≠ ${before.zone}`);
    await A.waitForFunction(() => window.__vt.st.journal.some((j) => j.state === 'active'), null, { timeout: 5000 });
  });
  await step('Dos pestañas: la nueva toma el control y la antigua se cierra sin duplicar', async () => {
    const B2 = await ctxB.newPage(); watch(B2, 'B2');
    await B2.goto(BASE);
    await B2.click('#btn-enter');
    await B2.waitForFunction(() => window.__vt && window.__vt.me().id > 0, null, { timeout: 15000 });
    await B.waitForSelector('text=Sesión cerrada', { timeout: 8000 });
    await A.waitForTimeout(800);
    const n = (await ents(A)).filter((e) => e.kind === 'player' && e.name === nameB).length;
    if (n !== 1) throw new Error(`A ve ${n} entidades de Bruno`);
    await B2.close();
  });
  await step('Salir del bar de vuelta a la calle', async () => {
    await clickEntity(A, (e) => e.kind === 'door');
    await waitZone(A, 'ferro');
    const fps = await A.evaluate(() => window.__vt.view.app.ticker.FPS);
    results.push({ name: 'FPS (Chromium sin GPU, SwiftShader)', ok: true, value: Math.round(fps) });
  });
} catch {
  await A.screenshot({ path: `${OUT}fallo-A.png` }).catch(() => {});
  await B.screenshot({ path: `${OUT}fallo-B.png` }).catch(() => {});
} finally {
  writeFileSync(`${OUT}resultado.json`, JSON.stringify({ base: BASE, at: new Date().toISOString(), results, pageErrors: errors }, null, 2));
  await browser.close();
  const failed = results.some((r) => !r.ok) || errors.length;
  if (errors.length) console.log('Errores de página:', errors);
  console.log(failed ? 'E2E: FALLO' : 'E2E: OK');
  process.exit(failed ? 1 : 0);
}
