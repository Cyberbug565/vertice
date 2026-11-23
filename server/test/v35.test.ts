// v0.35 · Portales de viviendas por dentro (vestíbulo, escaleras y plantas), zonas bajo demanda que se liberan solas,
// porteros de los casinos grandes y patrullas en las comisarías.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildZoneGrid, findPath, portalZoneDef, portalZoneId, PORTAL_IN, STAIRS_UP, STAIRS_DOWN, PORTAL_DOOR } from '@vertice/shared';
import { createApp } from '../src/app.js';
import { BotClient } from '../../tools/loadtest/src/botclient.js';

const DB = process.env.TEST_DATABASE_URL;
let app: Awaited<ReturnType<typeof createApp>>;
let base = '';
const clients: BotClient[] = [];
const op = () => randomUUID().replace(/-/g, '');

beforeAll(async () => {
  if (DB) { const c = new pg.Client({ connectionString: DB }); await c.connect(); await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); await c.end(); }
  app = await createApp({ port: 0, host: '127.0.0.1', databaseUrl: DB, pgliteDir: 'memory://', ambientNpcs: 4, crowdNpcs: 0, speedScale: 6, lingerSeconds: 1, logLevel: 'warn',
    cityHourMs: 60000, cityHourOffset: 10 - ((Date.now() / 60000) % 24), needsScale: 1, downedSeconds: 2, jobTimeScale: 0.05 });
  base = `http://127.0.0.1:${app.port}`;
});
afterAll(async () => { for (const c of clients) c.close(); await app?.close(); });

async function join(name: string, role = 'solo') {
  const token = await BotClient.registerAndCreate(base, name, role, 'callejero', {});
  const b = new BotClient(base, name); clients.push(b);
  await b.connect(token, app.contentHash);
  return b;
}
const conn = (name: string) => [...app.world.conns.values()].find((c) => c.p?.name === name)!;
const E = (name: string) => conn(name).e!;
async function give(name: string, amount: number) {
  const p = conn(name).p!;
  await app.db.query("INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,$3,$4,'prueba')", [op(), p.charId, amount, p.money + amount]);
  await app.db.query('UPDATE characters SET money = money + $2 WHERE id=$1', [p.charId, amount]);
  p.money += amount;
}

describe('v0.35 · portales por dentro', () => {
  it('cada planta generada es transitable de la puerta a las escaleras y es igual en cliente y servidor', () => {
    const c = app.world.c;
    const buildings = [...new Set(c.houses.map((h) => h.building))];
    let floors = 0;
    for (const b of buildings) {
      const units = c.houses.filter((h) => h.building === b);
      if (units.length < 2) continue;
      const top = Math.max(...units.map((h) => h.floor));
      for (let f = 0; f <= top; f++) {
        const def = portalZoneDef(c, portalZoneId(b, f))!;
        expect(def, `${b} planta ${f}`).toBeTruthy();
        const g = buildZoneGrid(def);
        const to = (p: readonly number[]) => findPath(g, PORTAL_IN[0] + 0.5, PORTAL_IN[1] + 0.5, p[0] + 0.5, p[1] + 0.5);
        for (const d of def.doors) expect(to(d.at).ok, `${def.id} → ${d.name}`).toBe(true);
        expect(def.doors.some((d) => d.at[0] === STAIRS_UP[0] && d.at[1] === STAIRS_UP[1])).toBe(f < top);
        expect(def.doors.some((d) => d.at[0] === STAIRS_DOWN[0] && d.at[1] === STAIRS_DOWN[1])).toBe(f > 0);
        floors++;
      }
    }
    expect(floors).toBeGreaterThan(500);
    // Fuera de rango o edificio inexistente: no hay zona.
    expect(portalZoneDef(c, portalZoneId(buildings[0], 99))).toBeNull();
    expect(portalZoneDef(c, 'portal:no-existe:0')).toBeNull();
  });

  it('del portal de la calle se sube a pie hasta la puerta de tu piso, y al salir vuelves al rellano', async () => {
    const o = await join('vecina');
    const v = await join('curioso');
    await o.enterDoor('Salida'); await v.enterDoor('Salida');
    await give('vecina', 2_000_000);
    const c = app.world.c;
    const counts = new Map<string, number>();
    for (const h of c.houses) counts.set(h.building, (counts.get(h.building) ?? 0) + 1);
    const city = app.world.zones.get('vertice')!;
    const portals = [...city.entities].filter((x) => x.kind === 'door' && x.objKind === 'housing' && (counts.get(x.objId!) ?? 0) >= 3);
    expect(portals.length).toBeGreaterThan(20);
    const near = portals.sort((a, b) => Math.hypot(a.x - E('vecina').x, a.y - E('vecina').y) - Math.hypot(b.x - E('vecina').x, b.y - E('vecina').y))[0];
    const house = c.houses.filter((h) => h.building === near.objId).sort((a, b) => a.floor - b.floor)[1];
    for (const n of ['vecina', 'curioso']) { E(n).x = near.x; E(n).y = near.y + 1; E(n).path = []; }
    await o.until(() => !!o.findEntity((e) => e.id === near.id), 4000, 'ver el portal');
    await v.until(() => !!v.findEntity((e) => e.id === near.id), 4000, 'ver el portal');
    // La puerta del portal da al vestíbulo.
    await o.enterDoor(near.name);
    expect(o.zone).toBe(portalZoneId(near.objId!, 0));
    // Escaleras arriba, planta a planta.
    for (let f = 1; f <= house.floor; f++) { await o.enterDoor('Subir'); expect(o.zone).toBe(portalZoneId(near.objId!, f)); }
    // La puerta de la vivienda está cerrada: se abre el portero automático con la opción de comprar.
    const view = o.waitFor((m) => m.t === 'building', 3000, 'portero automático');
    const door = o.findEntity((e) => e.kind === 'door' && e.name.startsWith('Puerta de'))!;
    await o.cmd({ t: 'interact', target: door.id });
    expect(((await view) as any).view.units.some((u: any) => u.id === house.id)).toBe(true);
    expect(E('vecina').zone.id).toBe(portalZoneId(near.objId!, house.floor));
    // Se compra desde el rellano (estás dentro del portal) y la puerta ya se abre.
    expect((await o.cmd({ t: 'house', action: 'buy', house: house.id, opId: op() })).ok).toBe(true);
    await o.enterDoor('Puerta de');
    expect(o.zone).toBe(`casa:${house.id}`);
    // Al salir de casa estás en el rellano de tu planta, no en la calle.
    await o.enterDoor('Salir');
    expect(o.zone).toBe(portalZoneId(near.objId!, house.floor));
    expect(E('vecina').x).toBeCloseTo(PORTAL_IN[0] + 0.5, 0);
    // El visitante sube, pero sin permiso no pasa de la puerta.
    await v.enterDoor(near.name);
    for (let f = 1; f <= house.floor; f++) await v.enterDoor('Subir');
    const notice = v.waitFor((m) => m.t === 'notice' && /llave|timbre/.test((m as any).text), 3000, 'aviso de puerta cerrada');
    const d2 = v.findEntity((e) => e.kind === 'door' && e.name.startsWith('Puerta de'))!;
    await v.cmd({ t: 'interact', target: d2.id });
    await notice;
    expect(E('curioso').zone.id).toBe(portalZoneId(near.objId!, house.floor));
    // Bajar del todo y salir a la calle, delante del portal.
    for (let f = house.floor; f >= 1; f--) await v.enterDoor('Bajar');
    await v.enterDoor('Salir a la calle');
    expect(v.zone).toBe('vertice');
    expect(Math.hypot(E('curioso').x - near.x, E('curioso').y - near.y)).toBeLessThan(2);
    expect(PORTAL_DOOR[0]).toBe(13);
  });

  it('las plantas y casas vacías se liberan; las ocupadas no', async () => {
    const w = app.world;
    const busy = E('vecina').zone.id;
    const free = portalZoneId(busy.split(':')[1], 0);
    expect(w.zones.has(free)).toBe(true);
    w.collectZones(true);
    expect(w.zones.has(busy)).toBe(true);
    expect(w.zones.has(free)).toBe(false);
    // Volver a entrar la recrea al momento.
    expect(w.ensureZone(free)?.def.doors.length).toBeGreaterThan(0);
  });

  it('un edificio de una sola vivienda (villa) da directamente a la casa', () => {
    const c = app.world.c;
    const counts = new Map<string, number>();
    for (const h of c.houses) counts.set(h.building, (counts.get(h.building) ?? 0) + 1);
    const city = app.world.zones.get('vertice')!;
    const door = [...city.entities].find((x) => x.kind === 'door' && x.objKind === 'housing' && counts.get(x.objId!) === 1)!;
    expect(door.doorTo!.zone).toMatch(/^casa:/);
    const h = app.world.property.houses.get(door.doorTo!.zone.slice(5))!;
    expect(app.world.property.exitOf(h.id)!.zone).toBe('vertice');
  });

  it('dos porteros por turno en la puerta de los casinos grandes deciden quién entra y lo dicen', async () => {
    const w = app.world;
    const b = await join('jugadora');
    await b.enterDoor('Salida');
    const c = conn('jugadora');
    for (const zone of ['casino-meridiano', 'casino-hipodromo']) {
      const crew = w.cityPeople.doormen(zone);
      // La hora de la prueba (10:00) es turno de día: dos en la puerta.
      expect(crew.length, zone).toBe(2);
      expect(crew.every((e) => e.zone.id === 'vertice')).toBe(true);
    }
    const door = w.c.zones.find((z) => z.id === 'vertice')!.doors.find((d) => d.to.zone === 'casino-hipodromo')!;
    await w.teleport(c, 'vertice', [door.at[0], door.at[1] + 1]);
    await b.until(() => b.zone === 'vertice' && !!b.findEntity((e) => e.kind === 'door' && e.name === door.name), 4000, 'ver la puerta');
    const target = [...c.e!.zone.entities].find((e) => e.doorTo?.zone === 'casino-hipodromo')!;
    // Con el arma en la mano: no.
    expect(c.p!.equipped).toBeTruthy();
    const says = b.waitFor((m) => (m.t === 'notice' && (m as any).text.includes('Guarda el arma')), 3000, 'el portero habla');
    await b.cmd({ t: 'interact', target: target.id, remote: true });
    await says;
    expect(c.e!.zone.id).toBe('vertice');
    // Sin camiseta: tampoco.
    c.p!.equipped = null;
    const ap = c.e!.appearance!; const before = ap.bare; ap.bare = 'torso';
    expect(await w.cityPeople.doorVerdict(c, 'casino-hipodromo', 'vertice')).toMatch(/camiseta/);
    ap.bare = before;
    // Vestido y con las manos vacías: adelante.
    expect(await w.cityPeople.doorVerdict(c, 'casino-hipodromo', 'vertice')).toBeUndefined();
    await b.cmd({ t: 'interact', target: target.id, remote: true });
    await b.until(() => b.zone === 'casino-hipodromo', 8000, 'dentro del Hipódromo');
    // Gran Meridiano sigue pidiendo saldo: el portero lo dice.
    expect(await w.cityPeople.doorVerdict(c, 'casino-meridiano', 'vertice')).toMatch(/saldo mínimo/);
    // Sin porteros en su puesto, la puerta queda libre de sus normas (solo quedan las del casino).
    const crew = w.cityPeople.doormen('casino-hipodromo');
    for (const e of crew) e.aggro = 0;
    expect(await w.cityPeople.doorDeny(c, 'vertice', 'casino-hipodromo')).toBeUndefined();
    for (const e of crew) e.aggro = undefined;
  });

  it('dos agentes por turno patrullan alrededor de cada comisaría', () => {
    const w = app.world;
    const stations = w.c.zones.find((z) => z.id === 'vertice')!.doors.filter((d) => /^comisaria/.test(d.to.zone));
    expect(stations.length).toBe(5);
    const patrol = [...w.entities.values()].filter((e) => e.npc?.def?.id?.startsWith('patrulla-'));
    expect(patrol.length).toBe(stations.length * 4);
    for (const st of stations) {
      const day = patrol.filter((e) => { const s = e.npc!.def!.schedule[0]; return s.from === 6 && Math.hypot(s.at[0] - st.at[0], s.at[1] - st.at[1]) < 20; });
      expect(day.length, st.name).toBe(2);
      for (const e of day) expect(e.npc!.def!.schedule[0].stops!.length).toBeGreaterThanOrEqual(2);
    }
  });
});
