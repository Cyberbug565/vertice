import { createRequire } from 'node:module';
import { createApp } from '../server/src/app.js';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
// v0.11 · Capturas: personajes 3D, calles de día/noche y callejones con giro.
// Uso: HOUR=22 npx tsx e2e/shots-v11.ts <zoom> <city|n2|x,y> [no3d] [nombre]
const OUT = new URL('./out/', import.meta.url).pathname;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const app = await createApp({ port: 0, host: '127.0.0.1', pgliteDir: 'memory://', databaseUrl: undefined as any, ambientNpcs: 40, crowdNpcs: 0, lingerSeconds: 1, logLevel: 'warn', threats: false, cityHourOffset: Number(process.env.HOUR ?? 13) - ((Date.now() / 225000) % 24) });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
page.on('pageerror', (e: Error) => console.log('pageerror', e.message));
page.on('console', (m: any) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console', m.type(), JSON.stringify(m.text()).slice(0, 400)); });
await page.goto(`http://127.0.0.1:${app.port}`);
if (process.argv[4] === 'no3d') { await page.evaluate(() => localStorage.setItem('vertice.settings.v1', JSON.stringify({ chars3d: false }))); await page.reload(); }
await page.fill('#username', 'admintester'); await page.fill('#password', 'admintester');
await page.click('#btn-login'); await page.click('#btn-create'); await page.fill('#char-name', 'Kai Sombra'); await page.click('#btn-next');
for (const t of ['Atlético', 'Cazadora motera', 'Dragón', 'Los dos brazos', 'Botas altas']) await page.click(`button.segbtn:text-is("${t}")`).catch(() => {});
for (let i = 0; i < 8; i++) await page.click('#btn-next').catch(() => {});
await page.click('#btn-create-final');
await page.waitForFunction(() => (window as any).__vt && (window as any).__vt.me().id > 0, null, { timeout: 20000 });
await sleep(3000);
await page.click('.overlay button.btn.primary', { timeout: 3000 }).catch(() => {});
const c = [...app.world.conns.values()][0];
const city = app.world.zones.get('vertice')!;
const door = city.def.doors.find((d) => /Comisaría de Neón/.test(d.name))!;
const where = /^\d+,\d+$/.test(process.argv[3] ?? '') ? ['vertice', process.argv[3].split(',').map(Number)] : process.argv[3] === 'n2' ? ['pasarelas', app.world.zones.get('pasarelas')!.def.safePoint] : ['vertice', [door.at[0] + 2, door.at[1] + 3]];
await app.world.teleport(c, where[0] as string, where[1] as [number, number]);
await sleep(2500);
const zz = app.world.zones.get(where[0] as string)!;
for (let i = 0; i < 6; i++) app.world.spawnAmbient(zz, { x: c.e!.x + 1.5 + (i % 3) * 1.2, y: c.e!.y + 1 + Math.floor(i / 3) * 1.4 });
// v0.12 · GHOSTS=1: CARMÍN y Rafa «Brasas» a la vista; KAIROS=n: Kairós encendido (estela de imágenes residuales).
if (process.env.GHOSTS) { try { await (app.world as any).relics.matrix(c, 'equip', 'matriz-carmin'); } catch (err) { console.log('matriz', (err as Error).message); } }
if (process.env.KAIROS) { try { (app.world as any).relics.toggleKairos(c, Number(process.env.KAIROS)); } catch (err) { console.log('kairos', (err as Error).message); } }
if (process.env.WEAPON) { try { await (app.world as any).admin.give(c.p, process.env.WEAPON); await (app.world as any).survival.equip(c, process.env.WEAPON); } catch (err) { console.log('arma', (err as Error).message); } }
const zoom = Number(process.argv[2] ?? 2.2);
await page.evaluate((z) => (window as any).__vt.view.setZoom(z), zoom);
if (process.env.MOVESHOT) { await page.evaluate(() => document.querySelectorAll('.overlay').forEach((o) => o.remove())); await page.keyboard.down('d'); await sleep(2500); await page.screenshot({ path: `${OUT}${process.argv[5] ?? 'v11'}.png` }); await page.keyboard.up('d'); console.log('📸 en movimiento'); await browser.close(); await app.close(); process.exit(0); }
await page.keyboard.down('d'); await sleep(900); await page.keyboard.up('d');
await sleep(2500);
await page.evaluate(() => document.querySelectorAll('.overlay').forEach((o) => o.remove()));
await sleep(800);
await page.screenshot({ path: `${OUT}${process.argv[5] ?? 'v11'}.png` }); console.log('📸', process.argv[5] ?? 'v11');
await browser.close(); await app.close(); process.exit(0);
