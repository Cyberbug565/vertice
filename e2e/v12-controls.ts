// v0.12 · Pruebas de controles en un navegador real: clic izquierdo en una puerta entra, E sale, rodar seguido no
// teletransporta ni tumba al personaje y andar un buen rato no produce saltos hacia atrás.
import { createRequire } from 'node:module';
import { createApp } from '../server/src/app.js';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const app = await createApp({ port: 0, host: '127.0.0.1', pgliteDir: 'memory://', databaseUrl: undefined as any, ambientNpcs: 10, crowdNpcs: 0, lingerSeconds: 1, logLevel: 'warn', threats: false });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const errors: string[] = [];
page.on('pageerror', (e: Error) => errors.push(e.message));
let failed = 0;
const step = async (name: string, fn: () => Promise<void>) => {
  const t0 = Date.now();
  try { await fn(); console.log(`✔ ${name} (${Date.now() - t0} ms)`); } catch (e: any) { failed++; console.log(`✘ ${name}: ${e.message}`); }
};
await page.goto(`http://127.0.0.1:${app.port}`);
await page.evaluate(() => localStorage.setItem('vertice.settings.v1', JSON.stringify({ quality: 'low', resScale: 0.5 })));
await page.reload();
await page.fill('#username', `ctl${Date.now() % 100000}`); await page.fill('#password', 'contraseña-larga-1');
await page.click('#btn-register').catch(() => {});
await page.click('#btn-create', { timeout: 15000 }); await page.fill('#char-name', 'Prueba Controles');
for (let i = 0; i < 10; i++) await page.click('#btn-next').catch(() => {});
await page.click('#btn-create-final');
await page.waitForFunction(() => (window as any).__vt && (window as any).__vt.me().id > 0, null, { timeout: 30000 });
await sleep(1500);
await page.click('.overlay button.btn.primary', { timeout: 3000 }).catch(() => {});
await page.evaluate(() => document.querySelectorAll('.overlay').forEach((o) => o.remove()));
const c = () => [...app.world.conns.values()][0];
const me = () => page.evaluate(() => (window as any).__vt.me());
const zoneIs = (z: string, ms = 20000) => page.waitForFunction((z) => (window as any).__vt.me().zone === z, z, { timeout: ms });

await step('Clic izquierdo en la puerta del bar (a 2,5 m) entra', async () => {
  const city = app.world.zones.get('vertice')!;
  const door = city.def.doors.find((d) => d.id === 'puerta-rele')!;
  await app.world.teleport(c(), 'vertice', [door.at[0] + 0.5, door.at[1] + 3]);
  await zoneIs('vertice');
  await sleep(2500);
  const d = (await page.evaluate(() => (window as any).__vt.entities())).find((e: any) => e.kind === 'door' && /Relé/.test(e.name));
  if (!d) throw new Error('no se ve la puerta');
  const s = await page.evaluate(([x, y]) => (window as any).__vt.screenOf(x, y), [d.x, d.y]);
  await page.mouse.move(s.x, s.y - 8); await sleep(300);
  await page.mouse.click(s.x, s.y - 8);
  await zoneIs('bar-rele', 30000);
});
await step('E sale del bar a la calle', async () => {
  await sleep(1500);
  const z = app.world.zones.get('bar-rele')!;
  const exit = z.def.doors[0];
  await app.world.teleport(c(), 'bar-rele', [exit.at[0] + 0.5, exit.at[1] + 0.5 + (exit.at[1] > 2 ? -1.2 : 1.2)]);
  await sleep(2000);
  await page.mouse.move(5, 5);
  await page.keyboard.press('e');
  await zoneIs('vertice', 30000);
});
await step('Rodar 8 veces seguidas no teletransporta ni tumba al personaje', async () => {
  await sleep(2000);
  await page.keyboard.down('d');
  let maxJump = 0; let prev = await me();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press(' ');
    for (let k = 0; k < 4; k++) { await sleep(90); const m = await me(); maxJump = Math.max(maxJump, prev.x - m.x); prev = m; }
  }
  await page.keyboard.up('d');
  await sleep(1500);
  const p = c().p!;
  if (p.sleeping) throw new Error('el personaje se ha echado a dormir');
  if (c().e!.downed) throw new Error('el personaje ha quedado derribado');
  const m = await me();
  const drift = Math.hypot(m.x - c().e!.x, m.y - c().e!.y);
  if (drift > 0.6) {
    const dbg = await page.evaluate(() => { const v = (window as any).__vt.view; return { me: [v.me.x, v.me.y], conf: [v.me.serverX, v.me.serverY], moving: v.me.serverMoving, toasts: [...document.querySelectorAll('.toast')].map((t) => t.textContent) }; });
    throw new Error(`cliente y servidor no coinciden (${drift.toFixed(2)} m) · servidor ${c().e!.x.toFixed(2)},${c().e!.y.toFixed(2)} · ${JSON.stringify(dbg)}`);
  }
  // Rodando hacia +x: el personaje nunca debe ir hacia atrás (eso era el «teletransporte»).
  console.log(`   mayor retroceso: ${maxJump.toFixed(2)} m`);
  if (maxJump > 0.5) throw new Error(`retrocede ${maxJump.toFixed(2)} m mientras rueda`);
});
if (!process.env.QUICK) await step('Andar 3 minutos en círculos: sin retrocesos ni desincronización', async () => {
  let snaps = 0; let prev = await me(); let worst = 0;
  const dirs = ['d', 's', 'a', 'w'];
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < 180000) {
    const k = dirs[i++ % 4];
    await page.keyboard.down(k);
    for (let n = 0; n < 10; n++) {
      await sleep(150);
      const m = await me();
      const back = Math.hypot(m.x - prev.x, m.y - prev.y);
      if (back > Math.max(1.4, 4.5 / Math.max(1, await page.evaluate(() => (window as any).__vt.view.app.ticker.FPS)))) snaps++;
      worst = Math.max(worst, Math.hypot(m.x - c().e!.x, m.y - c().e!.y));
      prev = m;
    }
    await page.keyboard.up(k);
  }
  // Con FPS normales no se tolera ningún salto; en un navegador sin GPU (≈5 FPS) se admiten dos correcciones.
  const fps = await page.evaluate(() => (window as any).__vt.view.app.ticker.FPS);
  if (snaps > (fps >= 20 ? 0 : 2) || worst > (fps >= 20 ? 1.5 : 3.5)) throw new Error(`${snaps} saltos bruscos (peor desfase ${worst.toFixed(2)} m, ${fps.toFixed(1)} FPS)`);
  console.log(`   peor desfase cliente/servidor: ${worst.toFixed(2)} m`);
});
if (errors.length) { failed++; console.log('Errores de página:', errors.slice(0, 5)); }
console.log(failed ? `E2E controles: ${failed} FALLO(S)` : 'E2E controles: OK');
await browser.close(); await app.close(); process.exit(failed ? 1 : 0);
