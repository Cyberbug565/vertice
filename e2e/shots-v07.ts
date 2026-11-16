// Capturas de la v0.7 (servidor en el mismo proceso para preparar las escenas).
// Uso: npx tsx e2e/shots-v07.ts
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dangerAt, isWalkable } from '@vertice/shared';
import { createApp } from '../server/src/app.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const app = await createApp({ port: 0, host: '127.0.0.1', pgliteDir: 'memory://', databaseUrl: undefined as any, ambientNpcs: 48, crowdNpcs: 0, lingerSeconds: 1, logLevel: 'warn', threats: false, cityHourOffset: 21.5 - ((Date.now() / 225000) % 24) });
const BASE = `http://127.0.0.1:${app.port}`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
page.on('pageerror', (e: Error) => console.log('pageerror', e.message));
const shot = async (n: string) => { await page.screenshot({ path: `${OUT}${n}.png` }); console.log('📸', n); };

await page.goto(BASE);
await page.fill('#username', 'fotografa7'); await page.fill('#password', 'secreto1');
await page.click('#btn-register'); await page.click('#btn-create');
await page.fill('#char-name', 'Nika Sol');
await page.click('#btn-next');
for (const t of ['Atlético', 'Corazón', 'Aguileña', 'Sonrisa', 'Bob']) await page.click(`button.segbtn:text-is("${t}")`);
await sleep(500); await shot('v7-01-caras');
for (let i = 0; i < 7; i++) await page.click('#btn-next');
await page.click('#btn-create-final');
await page.waitForFunction(() => (window as any).__vt && (window as any).__vt.me().id > 0, null, { timeout: 20000 });
await sleep(1200);

const c = [...app.world.conns.values()][0];
const p = c.p!;
const city = app.world.zones.get('vertice')!;
const spot = (() => { for (let y = 20; y < city.def.height - 20; y++) for (let x = 20; x < city.def.width - 20; x++) if (dangerAt(city.grid, x, y) === 'lawless' && [0, 1, 2, 3, 4, 5].every((d) => isWalkable(city.grid, x + d + 0.5, y + 0.5) && isWalkable(city.grid, x + d + 0.5, y + 3.5))) return [x, y] as [number, number]; return [300, 150] as [number, number]; })();
p.inventory.set('pistola-ligera', 1); p.inventory.set('bala-ligera', 200); p.equipped = 'pistola-ligera';
p.body.wounds = { torso: 16, brazo_izq: 8, pierna_der: 25 }; p.body.bleed = 0.6;
p.inventory.set('venda', 3); p.inventory.set('estim', 1);
await app.world.teleport(c, 'vertice', spot);
await sleep(2500);
// Recompensa gorda con escoltas y un ciberpsicópata cerca.
const boss = await app.world.threats.spawnBounty({ tier: 3, at: { x: spot[0] + 5.5, y: spot[1] + 0.5 } });
const psy = await app.world.threats.spawnPsycho({ x: spot[0] + 3.5, y: spot[1] + 3.5 });
if (psy) { psy.npc = undefined; psy.aggro = undefined; }
if (boss) { boss.npc = undefined; for (const e of city.entities) if (e.escortOf === boss.id) e.npc = undefined; }
await sleep(1500);
// Apuntando con el clic derecho hacia el objetivo.
const scr = await page.evaluate(([x, y]) => (window as any).__vt.screenOf(x, y), [boss!.x, boss!.y - 0.4]);
await page.mouse.move(scr.x, scr.y - 20);
await page.mouse.down({ button: 'right' });
await sleep(2200);
await shot('v7-02-apuntando-cuerpo-recompensa');
await page.mouse.up({ button: 'right' });
// Chat local y global.
app.world.handle(c, { t: 'chat', seq: 500, channel: 'local', text: 'Ese psicópata va a por todos…' } as any);
await sleep(1500);
app.world.handle(c, { t: 'chat', seq: 501, channel: 'global', text: 'Ciberpsicópata suelto en El Yermo, ¡cuidado!' } as any);
await sleep(800);
await page.click('.bp-part[data-part="pierna_der"]');
await sleep(500);
await shot('v7-03-chat-y-curar');
await page.mouse.click(30, 400); await sleep(200);
await page.keyboard.press('Escape'); await sleep(500);
await shot('v7-04-menu-esc');
await page.click('.pbtn:has-text("Teclas")'); await sleep(500);
await shot('v7-05-teclas');
await page.click('#keys-panel .btn.primary');
await browser.close(); await app.close();
process.exit(0);
