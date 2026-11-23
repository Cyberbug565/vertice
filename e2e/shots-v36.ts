// v0.36 · Capturas y medida: portal → vestíbulo → escalera → rellano → tu piso, vuelta a la calle sin reconstruir la
// ciudad, puertas correderas, porteros de los casinos grandes y patrullas de la PCV.
// Uso: npx tsx e2e/shots-v35.ts (con el cliente compilado en client/dist).
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { portalZoneId, PORTAL_IN } from '@vertice/shared';
import { createApp } from '../server/src/app.js';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = new URL('./out/', import.meta.url).pathname;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const HOUR = Number(process.env.HOUR ?? 13);
const app = await createApp({ port: 0, host: '127.0.0.1', pgliteDir: 'memory://', databaseUrl: undefined as any, ambientNpcs: 20, crowdNpcs: 0, lingerSeconds: 1, logLevel: 'warn', threats: false, cityHourOffset: HOUR - ((Date.now() / 225000) % 24) });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('pageerror', (e: Error) => console.log('pageerror', e.message));
page.on('console', (m: any) => { if (m.type() === 'error') console.log('console', m.text().slice(0, 300)); });
await page.goto(`http://127.0.0.1:${app.port}`);
await page.fill('#username', 'admintester'); await page.fill('#password', 'admintester');
await page.click('#btn-login'); await page.click('#btn-create'); await page.fill('#char-name', 'Nia Corvo'); await page.click('#btn-next');
for (let i = 0; i < 8; i++) await page.click('#btn-next').catch(() => {});
await page.click('#btn-create-final');
await page.waitForFunction(() => (window as any).__vt && (window as any).__vt.me().id > 0, null, { timeout: 120000 });
await sleep(3000);
for (let i = 0; i < 3; i++) await page.click('.overlay button.btn.primary', { timeout: 1500 }).catch(() => {});
await page.evaluate(() => document.querySelectorAll('.overlay').forEach((o) => o.remove()));
const c = [...app.world.conns.values()][0];
const w = app.world as any;
const zoneMs = () => page.evaluate(() => (window as any).__vt.view.lastZoneMs as number);
const inZone = (z: string) => page.waitForFunction((zz: string) => (window as any).__vt.me().zone === zz, z, { timeout: 60000 });
const shot = async (name: string, zoom = 2.4, wait = 2500) => {
  await page.evaluate((zz: number) => { const v = (window as any).__vt.view; v.setZoom(zz); v.zoom = zz; }, zoom);
  await sleep(wait);
  await page.evaluate(() => document.querySelectorAll('.overlay, .toast').forEach((o) => o.remove()));
  await page.screenshot({ path: `${OUT}v36-${name}.png`, timeout: 180000 }); console.log('📸', name);
};
const cross = async (door: any) => { await w.transferPlayer(c, door); await inZone(door.doorTo.zone); return zoneMs(); };
const report: Record<string, unknown> = {};

// 1. Portal de un edificio con varias plantas.
const counts = new Map<string, number>();
for (const h of w.c.houses) counts.set(h.building, (counts.get(h.building) ?? 0) + 1);
const city = w.zones.get('vertice');
const portal = [...city.entities].filter((e: any) => e.kind === 'door' && e.objKind === 'housing' && (counts.get(e.objId) ?? 0) >= 4)[Number(process.env.PORTAL ?? 3)] as any;
await w.teleport(c, 'vertice', [Math.floor(portal.x), Math.floor(portal.y) + 4]);
await inZone('vertice'); await sleep(6000);
w.handle(c, { t: 'move', seq: 0, x: portal.x, y: portal.y + 1.6 }); await sleep(2500);
report.cityFirstBuildMs = await zoneMs();
// v0.36 · Puerta del kit encajada en la fachada: cerrada de lejos y abierta al llegar.
{ const v = await page.evaluate(() => 0); void v; }
const near3 = async (dx: number, dy: number, name: string, zoom: number) => { w.handle(c, { t: 'move', seq: 0, x: portal.x + dx, y: portal.y + dy }); await sleep(2500); await shot(name, zoom, 1200); };
await near3(-3, 3, '0a-portal-cerrado', 3.2);
await near3(0, 0.9, '0b-portal-abierto', 3.2);
await shot('1-portal-calle', 1.9, 1500);
// 2. Vestíbulo (la puerta se abre al acercarse y se cruza sin pantalla de carga).
report.lobbyMs = await cross(portal);
report.lobbyEntities = [...c.e.zone.entities].map((e: any) => `${e.kind}:${e.name}`);
await shot('2-vestibulo', 1.7);
// 3. Escalera: planta 1 y planta 2.
const stairs = () => [...c.e.zone.entities].find((e: any) => e.kind === 'door' && e.name.startsWith('Subir')) as any;
report.floor1Ms = await cross(stairs());
report.floor2Ms = await cross(stairs());
report.landingEntities = [...c.e.zone.entities].map((e: any) => `${e.kind}:${e.name}`);
await shot('3-rellano', 1.7);
// 4. Tu piso: comprar y entrar por la puerta del rellano.
const house = w.c.houses.find((h: any) => h.building === portal.objId && h.floor === 2);
c.p.money += house.price * 2;
w.property.owners.set(house.id, { charId: c.p.charId, name: c.p.name, price: house.price, permits: [] }); c.p.houses.push(house.id);
const apt = [...c.e.zone.entities].find((e: any) => e.kind === 'door' && e.name.startsWith('Puerta de')) as any;
report.homeMs = await cross(apt);
await shot('4-piso', 1.7);
// 5. Salir al rellano, bajar y volver a la calle: la ciudad se recupera de la caché.
report.backToLandingMs = await cross([...c.e.zone.entities].find((e: any) => e.kind === 'door') as any);
const down = () => [...c.e.zone.entities].find((e: any) => e.kind === 'door' && e.name.startsWith('Bajar')) as any;
await cross(down()); await cross(down());
report.cityFromCacheMs = await cross([...c.e.zone.entities].find((e: any) => e.kind === 'door' && e.name === 'Salir a la calle') as any);
await shot('5-calle-otra-vez', 1.9, 1500);
// 6. Puerta corredera abierta (de pie junto a una puerta de la ciudad).
await shot('6-puerta-abierta', 3.4, 1500);
// 7. Porteros de Gran Meridiano y del Hipódromo.
for (const [i, zone] of ['casino-meridiano', 'casino-hipodromo'].entries()) {
  const d = city.def.doors.find((x: any) => x.to.zone === zone);
  await w.teleport(c, 'vertice', [d.at[0], d.at[1] + 3]);
  await inZone('vertice'); await sleep(2500);
  report[`doormen-${zone}`] = w.cityPeople.doormen(zone).map((e: any) => `${e.name} @${e.x.toFixed(1)},${e.y.toFixed(1)}`);
  report[`door-${zone}`] = d.at;
  w.handle(c, { t: 'move', seq: 0, x: d.at[0] + 0.5, y: d.at[1] + 2.5 });
  await sleep(3500);
  await shot(`7-porteros-${i + 1}`, 2.2, 1200);
}
// 8. Patrulla delante de la comisaría de Ferro.
const st = city.def.doors.find((x: any) => x.to.zone === 'comisaria-ferro');
await w.teleport(c, 'vertice', [st.at[0] + 4, st.at[1] + 3]);
await sleep(9000);
report.patrolNear = [...c.e.zone.query(c.e.x, c.e.y, 18)].filter((e: any) => e.npc?.def?.id?.startsWith('patrulla-')).map((e: any) => e.name);
await shot('8-patrulla', 2.0, 1500);
report.serverZones = { total: w.zones.size, dynamic: w.dynamicSince.size };
w.collectZones(true);
report.serverZonesAfterGc = { total: w.zones.size, dynamic: w.dynamicSince.size };
console.log(JSON.stringify(report, null, 1));
writeFileSync(`${OUT}v36-report.json`, JSON.stringify(report, null, 1));
await browser.close(); await app.close();
void portalZoneId; void PORTAL_IN;
