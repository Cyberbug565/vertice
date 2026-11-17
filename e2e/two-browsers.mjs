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
  await page.click('#btn-next'); await page.click('#btn-next'); await page.click('#btn-next'); // nombre, aspecto, origen
  await page.click('#bio-objective-leyenda'); await page.click('#btn-next'); // historia
  await page.click(`#role-${roleId}`); await page.click('#btn-next');
  await page.click('#btn-next'); // oficio
  await page.click('#btn-next'); // atributos
  for (let i = 0; i < 3; i++) await page.click('button[aria-label="Subir Atletismo"]').catch(() => {});
  await page.click('#btn-next'); // habilidades
  await page.click('#btn-create-final');
  await page.waitForFunction(() => window.__vt && window.__vt.me().id > 0, null, { timeout: 15000 });
}
const me = (p) => p.evaluate(() => window.__vt.me());
const ents = (p) => p.evaluate(() => window.__vt.entities());
const clickWorld = async (p, x, y, button = 'left') => { const s = await p.evaluate(([x, y]) => window.__vt.screenOf(x, y), [x, y]); await p.mouse.click(s.x, s.y, { button }); };
/** v0.9 · Ya no se camina con el clic: se acerca con WASD (como un jugador) hasta tener el objetivo a mano. */
const walkTo = async (p, pred, near) => {
  const t0 = Date.now(); let best = Infinity, bestAt = Date.now(), side = 0;
  const held = new Set();
  const set = async (keys) => { for (const k of [...held]) if (!keys.includes(k)) { await p.keyboard.up(k); held.delete(k); } for (const k of keys) if (!held.has(k)) { await p.keyboard.down(k); held.add(k); } };
  try {
    // Trayectos largos: la aproximación automática del servidor (la que usan los bots y el destino marcado); el final, a mano.
    { const e = (await ents(p)).find(pred); const me = await p.evaluate(() => window.__vt.me());
      if (e && Math.hypot(e.x - me.x, e.y - me.y) > near) {
        const z0 = me.zone;
        await p.evaluate((id) => window.__vt.net.send({ t: 'interact', target: id }), e.id);
        await p.waitForFunction(([x, y, n, z]) => { const m = window.__vt.me(); return m.zone !== z || Math.hypot(m.x - x, m.y - y) <= n; }, [e.x, e.y, near, z0], { timeout: 40000 }).catch(() => {});
        if ((await p.evaluate(() => window.__vt.me().zone)) !== z0) return 'entered';
      } }
    while (Date.now() - t0 < 60000) {
      const me = await p.evaluate(() => window.__vt.me());
      const e = (await ents(p)).find(pred);
      if (!e) throw new Error('entidad no visible');
      const dx = e.x - me.x, dy = e.y - me.y, d = Math.hypot(dx, dy);
      if (d <= near) return;
      if (d < best - 0.3) { best = d; bestAt = Date.now(); } else if (Date.now() - bestAt > 1500) { side = (side + 1) % 4; bestAt = Date.now(); best = d; }
      // Mundo → pantalla isométrica: derecha = x − y, abajo = x + y. Si se atasca, rodea por un lado.
      let sx = dx - dy, sy = dx + dy;
      if (side === 1) [sx, sy] = [-sy, sx]; else if (side === 3) [sx, sy] = [sy, -sx];
      const keys = [];
      if (sx > 0.4) keys.push('d'); else if (sx < -0.4) keys.push('a');
      if (sy > 0.4) keys.push('s'); else if (sy < -0.4) keys.push('w');
      await set(keys);
      await p.waitForTimeout(side ? 500 : 120);
    }
    { const e = (await ents(p)).find(pred); const me = await p.evaluate(() => window.__vt.me()); throw new Error(`no llega andando (a ${Math.hypot(e.x - me.x, e.y - me.y).toFixed(1)} m de ${e.name}; yo ${me.x.toFixed(1)},${me.y.toFixed(1)} → ${e.x},${e.y})`); }
  } finally { await set([]); }
};
const clickEntity = async (p, pred) => {
  // Tras cambiar de zona las entidades llegan en varias tandas: se espera hasta 20 s a que aparezca.
  let e = null;
  for (const t0 = Date.now(); !e && Date.now() - t0 < 20000; ) { e = (await ents(p)).find(pred); if (!e) await p.waitForTimeout(500); }
  if (!e) throw new Error('entidad no visible');
  if ((await walkTo(p, pred, e.kind === 'door' ? 1.6 : 5)) === 'entered') return;
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
  await step('WASD mueve; al soltar se para; el clic en el suelo ya no mueve', async () => {
    await A.click('canvas', { position: { x: 5, y: 5 } }).catch(() => {});
    const m0 = await me(A);
    await A.keyboard.down('d');
    await A.waitForTimeout(700);
    await A.keyboard.up('d');
    await A.waitForTimeout(500);
    const m1 = await me(A);
    if (Math.hypot(m1.x - m0.x, m1.y - m0.y) < 0.3) throw new Error('no se movió con WASD');
    await A.waitForTimeout(500);
    const m2 = await me(A);
    if (Math.hypot(m2.x - m1.x, m2.y - m1.y) > 0.15) throw new Error('siguió moviéndose al soltar la tecla');
    await clickWorld(A, m2.x + 3, m2.y);
    await A.waitForTimeout(700);
    const m3 = await me(A);
    if (Math.hypot(m3.x - m2.x, m3.y - m2.y) > 0.15) throw new Error('el clic en el suelo no debería mover');
  });
  await step('Esc abre el menú (ajustes, teclas, cerrar sesión)', async () => {
    await A.keyboard.press('Escape');
    await A.waitForSelector('#pause-menu', { timeout: 3000 });
    await A.keyboard.press('Escape');
    await A.waitForSelector('#pause-menu', { state: 'detached', timeout: 3000 });
  });
  await step('Salir a la calle (interior → exterior)', async () => {
    await clickEntity(A, (e) => e.kind === 'door');
    await waitZone(A, 'vertice');
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
    await waitZone(B, 'vertice');
    await B.waitForTimeout(500);
    await clickEntity(B, (e) => e.kind === 'door' && e.name.includes('Relé'));
    await waitZone(B, 'bar-rele');
    await B.waitForTimeout(800);
    await clickEntity(B, (e) => e.name.includes('Nadia'));
    await B.waitForSelector('#opt-accept', { timeout: 15000 });
    await B.click('#opt-accept');
    await B.waitForFunction(() => window.__vt.st.journal.some((j) => j.state === 'active' && j.participants >= 2), null, { timeout: 5000 });
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
    await waitZone(A, 'vertice');
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
