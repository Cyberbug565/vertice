// Mide el cliente en el punto concurrido: coste de CPU por fotograma, FPS, recepción y arranque (frío y en caché).
// Uso: BASE_URL=http://localhost:8080 QUALITY=low node e2e/client-perf.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const BASE = process.env.BASE_URL ?? 'http://localhost:8080';
const QUALITY = process.env.QUALITY ?? 'low';
const OUT = new URL('./out/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
await page.addInitScript((q) => localStorage.setItem('vertice.settings.v1', JSON.stringify({ quality: q, fpsCap: 60, resScale: 1 })), QUALITY);
const tag = Date.now().toString(36).slice(-5);
let t0 = Date.now();
await page.goto(BASE);
await page.fill('#username', `perf${tag}`); await page.fill('#password', 'secreto1');
await page.click('#btn-register'); await page.click('#btn-create');
await page.fill('#char-name', `Perf ${tag}`);
for (let i = 0; i < 6; i++) await page.click('#btn-next');
await page.click('#btn-create-final');
await page.waitForFunction(() => window.__vt && window.__vt.me().id > 0, null, { timeout: 20000 });
const coldBytes = await page.evaluate(() => performance.getEntriesByType('resource').concat(performance.getEntriesByType('navigation')).reduce((s, e) => s + (e.transferSize || e.encodedBodySize || 0), 0));
// Arranque en caché: recargar y entrar.
let t1 = Date.now();
await page.reload();
await page.click('#btn-enter');
await page.waitForFunction(() => window.__vt && window.__vt.me().id > 0, null, { timeout: 20000 });
const warmToControlMs = Date.now() - t1;
// Ir al punto concurrido del mercado.
const clickWorld = async (x, y) => { const s = await page.evaluate(([x, y]) => window.__vt.screenOf(x, y), [x, y]); await page.mouse.click(s.x, s.y); };
await clickWorld(8.5, 11.5);
await page.waitForFunction(() => window.__vt.me().zone === 'vertice', null, { timeout: 20000 });
await page.waitForTimeout(800);
for (const [x, y] of [[33.5, 36.5], [24.5, 35.5]]) { await page.evaluate(([x, y]) => window.__vt.view.onGroundClick(x, y), [x, y]); await page.waitForTimeout(7000); }
await page.waitForTimeout(2000);
const samples = [];
let lastBytes = await page.evaluate(() => window.__vt.net.bytesIn);
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(1000);
  const s = await page.evaluate(() => ({ cpu: window.__vt.view.frameMs, fps: window.__vt.view.app.ticker.FPS, bytes: window.__vt.net.bytesIn, ents: window.__vt.view.ents.size }));
  samples.push({ cpuMs: s.cpu, fps: s.fps, kibps: (s.bytes - lastBytes) / 1024, ents: s.ents }); lastBytes = s.bytes;
}
await page.screenshot({ path: `${OUT}05-mercado-concurrido-${QUALITY}.png` });
const where = await page.evaluate(() => window.__vt.me());
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const r = {
  base: BASE, quality: QUALITY, viewport: '1280x720', renderer: 'Chromium headless + SwiftShader (WebGL por CPU, sin GPU)', at: new Date().toISOString(),
  coldDownloadKiB: Math.round(coldBytes / 1024), coldToControlMs: t1 - t0, warmToControlMs,
  position: where,
  visibleEntities: Math.round(samples.reduce((s, x) => s + x.ents, 0) / samples.length),
  cpuFrameMs: { avg: +(samples.reduce((s, x) => s + x.cpuMs, 0) / samples.length).toFixed(2), p95: +pct(samples.map((x) => x.cpuMs), 0.95).toFixed(2) },
  fps: { avg: +(samples.reduce((s, x) => s + x.fps, 0) / samples.length).toFixed(1), p5: +pct(samples.map((x) => x.fps), 0.05).toFixed(1) },
  recvKiBps: { avg: +(samples.reduce((s, x) => s + x.kibps, 0) / samples.length).toFixed(2), p95: +pct(samples.map((x) => x.kibps), 0.95).toFixed(2) },
};
writeFileSync(`${OUT}client-perf-${QUALITY}.json`, JSON.stringify(r, null, 2));
console.log(JSON.stringify(r, null, 2));
await browser.close();
