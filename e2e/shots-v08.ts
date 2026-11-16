// Capturas de la v0.8 con la cuenta de pruebas (servidor en el mismo proceso).
// Uso: npx tsx e2e/shots-v08.ts
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dangerAt, isWalkable } from '@vertice/shared';
import { createApp } from '../server/src/app.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const app = await createApp({ port: 0, host: '127.0.0.1', pgliteDir: 'memory://', databaseUrl: undefined as any, ambientNpcs: 48, crowdNpcs: 0, lingerSeconds: 1, logLevel: 'warn', threats: false, cityHourOffset: 22 - ((Date.now() / 225000) % 24) });
const BASE = `http://127.0.0.1:${app.port}`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
page.on('pageerror', (e: Error) => console.log('pageerror', e.message));
const shot = async (n: string) => { await page.screenshot({ path: `${OUT}${n}.png` }); console.log('📸', n); };

await page.goto(BASE);
await page.fill('#username', 'admintester'); await page.fill('#password', 'admintester');
await page.click('#btn-login');
await page.click('#btn-create');
await page.fill('#char-name', 'Vera Nox');
await page.click('#btn-next');
for (const t of ['Alto/a', 'Afilada', 'Recta', 'Seria', 'Media melena']) await page.click(`button.segbtn:text-is("${t}")`).catch(() => {});
await page.click('button.swatch[aria-label="Acento (luces y cromo) #00ffa8"]').catch(() => {});
for (let i = 0; i < 7; i++) await page.click('#btn-next');
await page.click('#btn-create-final');
await page.waitForFunction(() => (window as any).__vt && (window as any).__vt.me().id > 0, null, { timeout: 20000 });
await sleep(3500);
await page.click('.overlay button.btn.primary', { timeout: 3000 }).catch(() => {});
await sleep(300);
const c = [...app.world.conns.values()][0];
const p = c.p!;
const city = app.world.zones.get('vertice')!;
// Matrices: CARMÍN y ECO (compañeros visibles solo para ti).
p.relics = { matrices: ['matriz-eco', 'matriz-carmin'], socketExtra: 2 };
p.inventory.set('rifle-asalto', 1); p.equipped = 'rifle-asalto';
const spot = (() => { for (let y = 30; y < city.def.height - 30; y++) for (let x = 30; x < city.def.width - 30; x++) if (dangerAt(city.grid, x, y) === 'disputed' && [0, 2, 4, 6].every((d) => isWalkable(city.grid, x + d + 0.5, y + 0.5) && isWalkable(city.grid, x + d + 0.5, y + 4.5))) return [x, y] as [number, number]; return [330, 150] as [number, number]; })();
await app.world.teleport(c, 'vertice', spot);
await sleep(2500);
for (let i = 0; i < 6; i++) app.world.spawnAmbient(city, { x: spot[0] + 3 + i, y: spot[1] + (i % 3) });
await sleep(800);
// Kairós Experimental: zona de cámara lenta y estela del color del cromo.
app.world.handle(c, { t: 'ability', seq: 700, id: 'kairos-6' } as any);
await sleep(300);
await page.keyboard.down('d'); await sleep(900); await page.keyboard.down('s'); await sleep(500);
await shot('v8-01-kairos-estela-companeros');
await page.keyboard.up('d'); await page.keyboard.up('s');
app.world.handle(c, { t: 'ability', seq: 701, id: 'kairos-6' } as any);
await sleep(1500);
// Pantalla de ciberware: rarezas y zócalo de matrices.
await page.keyboard.press('x'); await sleep(1000);
await page.evaluate(() => document.querySelector('.mx-box')?.scrollIntoView());
await sleep(400); await shot('v8-02-cromo-rarezas-matrices');
await page.keyboard.press('Escape'); await sleep(400);
// Ciberespacio (la Malla) con sus IAs.
await app.world.teleport(c, 'ciberespacio', [24, 26]);
await sleep(3000); await shot('v8-03-ciberespacio');
// El Velo y CARMÍN.
p.legends.iris = { trust: 100, step: 4, active: true, count: 0 };
await app.world.teleport(c, 'velo', [44, 20]);
await sleep(1500);
await app.world.legends.tick();
for (const e of app.world.zones.get('velo')!.entities) if (e.npcType === 'gang') { e.npc = undefined; e.aggro = undefined; }
await sleep(1800); await shot('v8-04-velo-carmin');
// Guarida de Iris y su panel de encargos.
await app.world.teleport(c, 'guarida-iris', [4, 4]);
await sleep(2200);
app.world.legends.open(c, 'leyenda-iris');
await sleep(800); await shot('v8-05-leyenda-iris');
await page.click('#legend-panel .close').catch(() => page.keyboard.press('Escape')); await sleep(300);
// Ciberpsicosis grave: alucinaciones y estabilidad mental.
p.psyche = { level: 80, heavy: 600, peak: 80, episode: { until: Date.now() + 14 * 24 * 225000, floor: 70, grave: true }, episodes: 3 };
p.relics = { matrices: ['matriz-carmin'], socketExtra: 2 };
await app.world.teleport(c, 'vertice', spot);
await sleep(4000); await shot('v8-06-ciberpsicosis');
// Menú de trucos.
await page.keyboard.press('Backquote'); await sleep(1200);
await shot('v8-07-trucos');
await browser.close(); await app.close();
process.exit(0);
