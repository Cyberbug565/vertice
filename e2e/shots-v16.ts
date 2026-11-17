// v0.16 · Capturas del creador: varias combinaciones de ropa, peinado y accesorios, de cuerpo entero y de cara.
import { createRequire } from 'node:module';
import { createApp } from '../server/src/app.js';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = new URL('./out/', import.meta.url).pathname;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const app = await createApp({ port: 0, host: '127.0.0.1', pgliteDir: 'memory://', databaseUrl: undefined as any, ambientNpcs: 0, crowdNpcs: 0, lingerSeconds: 1, logLevel: 'warn', threats: false });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
page.on('pageerror', (e: Error) => console.log('pageerror', e.message));
page.on('console', (m: any) => { if (m.type() === 'error' || m.type() === 'warning') { const t = m.text(); if (!/texImage3D|GPU stall|GL_CLOSE/.test(t)) console.log('console', t.slice(0, 300)); } });
await page.goto(`http://127.0.0.1:${app.port}`);
await page.fill('#username', 'admintester'); await page.fill('#password', 'admintester');
await page.click('#btn-login'); await page.click('#btn-create'); await page.fill('#char-name', 'Nia Corvo'); await page.click('#btn-next');
const sets: Record<string, any> = JSON.parse(process.env.SETS ?? '{}');
const zooms = (process.env.ZOOMS ?? 'zoom-cuerpo,zoom-cara').split(',');
for (const [name, labels] of Object.entries(sets)) {
  if (!Array.isArray(labels)) await page.evaluate((ap: any) => { const p = (window as any).__vtPreview; p.__base ??= { ...p.ent.s.appearance }; p.show({ ...p.__base, ...ap }, ap.chrome ?? [], ap.weapon); }, labels);
  else for (const t of labels) await page.click(`button.segbtn:text-is("${t}")`).catch(() => console.log('sin botón', t));
  for (const z of zooms) {
    await page.click(`#${z}`).catch(() => {});
    await sleep(3500);
    const el = await page.$('.preview3d');
    await el!.screenshot({ path: `${OUT}v16-${name}-${z}.png`, timeout: 120000 }); console.log('📸', name, z);
  }
}
await browser.close(); await app.close(); process.exit(0);
