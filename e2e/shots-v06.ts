// Capturas de la v0.6 con el servidor en el mismo proceso (para preparar escenas de combate).
// Uso: npx tsx e2e/shots-v06.ts
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dangerAt, isWalkable } from '@vertice/shared';
import { createApp } from '../server/src/app.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const app = await createApp({ port: 0, host: '127.0.0.1', pgliteDir: 'memory://', databaseUrl: undefined as any, ambientNpcs: 48, crowdNpcs: 0, lingerSeconds: 1, logLevel: 'warn', cityHourOffset: 12 - ((Date.now() / 225000) % 24) });
const BASE = `http://127.0.0.1:${app.port}`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
page.on('pageerror', (e: Error) => console.log('pageerror', e.message));
const shot = async (n: string) => { await page.screenshot({ path: `${OUT}${n}.png` }); console.log('📸', n); };

await page.goto(BASE);
await page.fill('#username', 'fotografa'); await page.fill('#password', 'secreto1');
await page.click('#btn-register'); await page.click('#btn-create');
await page.fill('#char-name', 'Kira Voss');
await page.click('#btn-next');
// Aspecto: corpulento con afro (arreglado: el pelo va por detrás de la cara).
for (const t of ['Corpulento', 'Afro']) await page.click(`button.segbtn:text-is("${t}")`);
await sleep(600); await shot('v6-01-creador-afro');
await page.click('#btn-next'); await page.click('#btn-next');
await page.click('#bio-objective-leyenda'); await page.click('#bio-childhood-red');
await shot('v6-02-creador-historia');
await page.click('#btn-next'); await page.click('#role-solo'); await page.click('#btn-next'); await page.click('#btn-next'); await page.click('#btn-next');
for (const s of ['Armas a distancia', 'Atletismo', 'Percepción']) for (let i = 0; i < 3; i++) await page.click(`button[aria-label="Subir ${s}"]`);
await shot('v6-03-creador-habilidades');
await page.click('#btn-next'); await page.click('#btn-create-final');
await page.waitForFunction(() => (window as any).__vt && (window as any).__vt.me().id > 0, null, { timeout: 20000 });
await sleep(1500);

const c = [...app.world.conns.values()][0];
const p = c.p!;
const city = app.world.zones.get('vertice')!;
// Zona negra con una banda: tiroteo.
const gang = [...city.entities].find((o) => o.npcType === 'gang' && dangerAt(city.grid, o.x, o.y) === 'lawless') ?? [...city.entities].find((o) => o.npcType === 'gang')!;
let at: [number, number] = [Math.floor(gang.x) + 4, Math.floor(gang.y)];
for (let d = 3; d < 12 && !isWalkable(city.grid, at[0] + 0.5, at[1] + 0.5); d++) at = [Math.floor(gang.x) + d, Math.floor(gang.y) + 1];
p.inventory.set('rifle-asalto', 1); p.inventory.set('bala-rifle', 200); p.equipped = 'rifle-asalto'; p.hp = 400;
await app.world.teleport(c, 'vertice', at);
await sleep(2500);
const foes = [...city.query(gang.x, gang.y, 14)].filter((o) => o.npcType === 'gang' && o.state !== 'downed');
for (const f of foes) { f.aggro = c.e!.id; f.aggroLethal = true; f.npcHp = 12; }
const shield = setInterval(() => { p.hp = 65; p.body.bleed = 0; if (p.status === 'downed') { p.status = 'alive'; c.e!.state = 'alive'; } }, 200);
app.world.combat.rng = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return (s % 1000) / 1000; }; })();
for (let i = 0; i < 9; i++) {
  const t = foes.find((f) => f.state !== 'downed');
  if (!t) break;
  t.body ??= { wounds: {}, lost: [], bleed: 0 }; t.body.wounds.brazo_der = 30; t.body.wounds.brazo_izq = 30;
  app.world.handle(c, { t: 'hostile', seq: 100 + i, target: t.id, action: 'attack', opId: `foto-${i}`, part: i % 2 ? 'brazos' : 'torso' } as any);
  await sleep(i === 5 ? 120 : 650);
  if (i === 5) await shot('v6-04-tiroteo-trazadoras');
}
await sleep(800);
await shot('v6-05-sangre-y-cuerpos');
clearInterval(shield);
// Ficha con heridas.
p.body.wounds.pierna_izq = 26; p.body.wounds.torso = 12; p.body.bleed = 0.8;
await page.keyboard.press('c'); await sleep(900);
await page.evaluate(() => document.querySelector('.cs-tabs button:last-child')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
await sleep(700);
await page.evaluate(() => { const el = document.querySelector('.sheet-tab'); el?.querySelector('h3:nth-of-type(4)')?.scrollIntoView(); });
await sleep(400); await shot('v6-06-ficha-heridas');
await page.keyboard.press('Escape'); await sleep(400);
// Interior amueblado.
p.body.bleed = 0;
await app.world.teleport(c, 'bar-rele', app.world.zones.get('bar-rele')!.def.safePoint as [number, number]);
await sleep(2500); await shot('v6-07-interior-amueblado');
// Mapa con zonas de colores y destino marcado.
await app.world.teleport(c, 'vertice', at);
await sleep(1500);
app.world.handle(c, { t: 'goto', seq: 300, kind: 'place', x: at[0] - 60, y: at[1] - 30 } as any);
await sleep(1200);
await page.keyboard.press('m'); await sleep(1200); await shot('v6-08-mapa-zonas-destino');
await page.keyboard.press('Escape'); await sleep(300);
await page.keyboard.press('g'); await sleep(300);
await page.fill('#search-panel input[type=search]', 'Kira'); await page.keyboard.press('Enter');
await sleep(14000); await shot('v6-09-buscador-movil');
await browser.close(); await app.close();
process.exit(0);
