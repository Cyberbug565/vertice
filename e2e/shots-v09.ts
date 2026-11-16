// Capturas de la v0.9: personaje detallado, ropa nueva, luz dinámica y rótulos, Nivel 2, combate, Onda Carmín, modo hackeo y ciberware.
// Uso: npx tsx e2e/shots-v09.ts
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createApp } from '../server/src/app.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// De noche (22 h) para ver la iluminación dinámica.
const app = await createApp({ port: 0, host: '127.0.0.1', pgliteDir: 'memory://', databaseUrl: undefined as any, ambientNpcs: 72, crowdNpcs: 0, lingerSeconds: 1, logLevel: 'warn', threats: false, cityHourOffset: 22.5 - ((Date.now() / 225000) % 24) });
const BASE = `http://127.0.0.1:${app.port}`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('pageerror', (e: Error) => console.log('pageerror', e.message));
const shot = async (n: string) => { await page.screenshot({ path: `${OUT}${n}.png` }); console.log('📸', n); };

await page.goto(BASE);
await page.fill('#username', 'admintester'); await page.fill('#password', 'admintester');
await page.click('#btn-login');
await page.click('#btn-create');
await page.fill('#char-name', 'Vera Nox');
await page.click('#btn-next');
for (const t of ['Atlético', 'Media melena', 'Cazadora motera', 'Cuero', 'Tachuelas', 'Dragón', 'Los dos brazos', 'Lágrimas', 'Botas altas', 'Camuflaje urbano']) await page.click(`button.segbtn:text-is("${t}")`).catch(() => console.log('sin botón', t));
await sleep(600);
await page.setViewportSize({ width: 1280, height: 720 });
await page.locator('.preview').first().screenshot({ path: `${OUT}v9-01-personaje-detallado.png` }); console.log('📸 v9-01-personaje-detallado');
for (let i = 0; i < 7; i++) await page.click('#btn-next');
await page.click('#btn-create-final');
await page.waitForFunction(() => (window as any).__vt && (window as any).__vt.me().id > 0, null, { timeout: 20000 });
await sleep(3500);
await page.click('.overlay button.btn.primary', { timeout: 3000 }).catch(() => {});
await sleep(300);
const c = [...app.world.conns.values()][0];
const p = c.p!;
const city = app.world.zones.get('vertice')!;
// Calle de noche junto a una comisaría y una farmacia con sus rótulos: luz de las farolas, callejones oscuros.
const door = city.def.doors.find((d) => /Comisaría de Neón/.test(d.name)) ?? city.def.doors.find((d) => d.sign)!;
await app.world.teleport(c, 'vertice', [door.at[0] + 2, door.at[1] + 2]);
await sleep(3500); await shot('v9-02-noche-luz-dinamica-rotulos');
// Nivel 2: pasarelas.
await app.world.teleport(c, 'pasarelas', app.world.zones.get('pasarelas')!.def.safePoint as [number, number]);
await sleep(3500); await shot('v9-03-nivel-2-pasarelas');
// Combate: ropa nueva, ráfaga con trazadoras, sangre y cuerpos.
await app.world.teleport(c, 'vertice', [door.at[0] + 6, door.at[1] + 6]);
await sleep(2500);
for (const id of ['chaqueta-carbono-fantasma', 'pantalon-exo-sprinter', 'botas-sigilo-pluma', 'visor-tactico-halcon']) { p.inventory.set(id, 1); }
p.wear = { ...p.wear, torso_ext: 'chaqueta-carbono-fantasma', piernas: 'pantalon-exo-sprinter', pies: 'botas-sigilo-pluma', cara: 'visor-tactico-halcon' } as any;
p.inventory.set('subfusil-callejero', 1); p.inventory.set('municion-9mm', 300); p.equipped = 'subfusil-callejero';
app.world.send(c, { t: 'sheet', sheet: (app.world.survival as any).sheetOf(p) });
const e0 = c.e!;
for (let i = 0; i < 4; i++) app.world.spawnAmbient(city, { x: e0.x + 3 + i * 0.8, y: e0.y + (i % 2) * 1.2 });
await sleep(300);
const dummies = [...city.query(e0.x, e0.y, 7)].filter((o) => o.kind === 'npc' && o.npcType === 'civil' && !o.dead).slice(0, 4);
// Si no ha aparecido nadie cerca, traemos a cuatro transeúntes.
if (dummies.length < 2) for (const o of [...city.entities].filter((x) => x.kind === 'npc' && x.npcType === 'civil' && !x.dead).slice(0, 4)) { app.world.moveEntityTo(o, city, e0.x + 3 + dummies.length * 0.8, e0.y + (dummies.length % 2) * 1.2); dummies.push(o); }
for (const d of dummies) { d.npc!.pauseUntil = app.world.tick + 1e6; d.path = []; }
await sleep(900);
for (let k = 0; k < 3; k++) for (const d of dummies) { app.world.combat['fx'](e0, 'shot', e0.id, d.id, { weapon: 'subfusil-callejero', hit: true, part: 'torso', burst: 3 }); await sleep(70); }
await sleep(250); await shot('v9-04-combate-rafaga-sangre');
// Onda Carmín (roja) y de noqueo (amarilla).
for (const o of app.world.entities.values()) if (o.kind === 'player' && o.conn) { app.world.send(o.conn, { t: 'fx', kind: 'wave', from: e0.id, to: e0.id, x: e0.x, y: e0.y, r: 11, ko: false }); }
await sleep(120); await shot('v9-05-onda-carmin');
await sleep(1200);
for (const o of app.world.entities.values()) if (o.kind === 'player' && o.conn) { app.world.send(o.conn, { t: 'fx', kind: 'wave', from: e0.id, to: e0.id, x: e0.x, y: e0.y, r: 11, ko: true }); }
await sleep(120); await shot('v9-06-onda-noqueo');
await sleep(1200);
// Modo hackeo: R y clic sobre alguien.
const t = dummies.find((d) => !d.dead) ?? dummies[0];
await page.keyboard.press('r'); await sleep(300);
app.world.handle(c, { t: 'hackMenu', seq: 900, target: t.id } as any);
await sleep(900); await shot('v9-07-modo-hackeo');
await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await sleep(300);
// Ciberware con ranuras dobles y los implantes nuevos.
for (const id of ['ojo-absoluto', 'ojo-predictivo', 'brazo-desviador', 'brazo-sismico', 'dedo-pistola', 'dedo-memoria', 'dedo-ganzua', 'pierna-salto-felino', 'pierna-esprinter', 'corazon-segundo-aliento']) p.cyber.push({ id: `v9-${id}`, def: id, location: 'installed', stolen: false } as any);
app.world.send(c, { t: 'sheet', sheet: (app.world.survival as any).sheetOf(p) });
await sleep(400);
await page.keyboard.press('x'); await sleep(1200); await shot('v9-08-ciberware-ranuras-dobles');
await browser.close(); await app.close();
process.exit(0);
