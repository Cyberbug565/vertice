// v0.35 · Medida (npx tsx scripts/medir-portales.ts): coste del tick con 0 zonas de portal, con TODAS las plantas de todos los portales creadas y tras liberarlas.
import { createApp } from '../server/src/app.js';
import { portalZoneId } from '@vertice/shared';
const app = await createApp({ port: 0, host: '127.0.0.1', pgliteDir: 'memory://', databaseUrl: undefined as any, ambientNpcs: 60, crowdNpcs: 0, lingerSeconds: 1, logLevel: 'warn', threats: false });
const w = app.world as any;
w.stop?.();
const tick = (n: number) => { const t0 = performance.now(); for (let i = 0; i < n; i++) w.step(); return (performance.now() - t0) / n; };
const mem = () => Math.round(process.memoryUsage().heapUsed / 1048576);
tick(200);
const base = tick(400), baseZones = w.zones.size, baseMem = mem();
const t0 = performance.now();
const tops = new Map<string, number>();
for (const h of w.c.houses) tops.set(h.building, Math.max(tops.get(h.building) ?? 0, h.floor));
let made = 0;
for (const [b, top] of tops) { const n = w.c.houses.filter((h: any) => h.building === b).length; if (n < 2) continue; for (let f = 0; f <= top; f++) if (w.ensureZone(portalZoneId(b, f))) made++; }
for (const h of w.c.houses) if (w.ensureZone(`casa:${h.id}`)) made++;
const buildMs = performance.now() - t0;
const all = tick(400), allZones = w.zones.size, allMem = mem();
w.collectZones(true);
const after = tick(400);
console.log(JSON.stringify({ baseTickMs: +base.toFixed(3), baseZones, baseHeapMB: baseMem, created: made, createAllMs: Math.round(buildMs), allOpenTickMs: +all.toFixed(3), allOpenZones: allZones, allOpenHeapMB: allMem, afterGcTickMs: +after.toFixed(3), afterGcZones: w.zones.size }, null, 1));
await app.close(); process.exit(0);
