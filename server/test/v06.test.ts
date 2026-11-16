// v0.6 · heridas por zonas, desangrado, vendas, límite de armas, cámaras e identificación, zonas sin ley, buscador, objetivo marcado, maletero e historia del personaje.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { dangerAt, isWalkable, skillLevelForXp } from '@vertice/shared';
import { createApp } from '../src/app.js';
import { BotClient } from '../../tools/loadtest/src/botclient.js';
import type { Entity } from '../src/world/entity.js';

const DB = process.env.TEST_DATABASE_URL;
let app: Awaited<ReturnType<typeof createApp>>;
let base = '';
const clients: BotClient[] = [];
let n = 0;
const op = () => `op-v06-${Date.now()}-${n++}`;

beforeAll(async () => {
  if (DB) { const c = new pg.Client({ connectionString: DB }); await c.connect(); await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); await c.end(); }
  app = await createApp({ port: 0, host: '127.0.0.1', databaseUrl: DB, pgliteDir: 'memory://', ambientNpcs: 4, crowdNpcs: 0, speedScale: 6, lingerSeconds: 1, logLevel: 'warn',
    cityHourMs: 60000, cityHourOffset: 10 - ((Date.now() / 60000) % 24), needsScale: 1, downedSeconds: 2, jobTimeScale: 0.05 });
  base = `http://127.0.0.1:${app.port}`;
});
afterAll(async () => { for (const c of clients) c.close(); await app?.close(); });

async function join(name: string, role = 'solo', attrs: Record<string, number> = {}) {
  const token = await BotClient.registerAndCreate(base, name, role, 'callejero', attrs);
  const b = new BotClient(base, name); clients.push(b);
  await b.connect(token, app.contentHash);
  return b;
}
const conn = (name: string) => [...app.world.conns.values()].find((c) => c.p?.name === name)!;
const P = (name: string) => conn(name).p!;
const E = (name: string) => conn(name).e!;
const city = () => app.world.zones.get('vertice')!;
const put = (e: Entity, x: number, y: number) => { e.x = x; e.y = y; e.path = []; e.zone.moved(e); };
/** Un civil quieto como blanco. */
function dummy(x: number, y: number) {
  const z = city();
  const npc = [...z.entities].find((o) => o.kind === 'npc' && o.npcType === 'civil' && o.state !== 'downed' && !o.dead)!;
  put(npc, x, y); npc.npc!.pauseUntil = app.world.tick + 1e6; npc.fleeUntil = 0;
  return npc;
}
/** Primera loseta transitable con el nivel de peligro pedido (y opcionalmente cerca o lejos de cámaras). */
function tileWhere(pred: (x: number, y: number) => boolean): [number, number] {
  const z = city();
  for (let y = 4; y < z.def.height - 4; y++) for (let x = 4; x < z.def.width - 4; x++) if (isWalkable(z.grid, x + 0.5, y + 0.5) && isWalkable(z.grid, x + 1.5, y + 0.5) && pred(x, y)) return [x, y];
  throw new Error('sin loseta');
}

describe('v0.6 · combate realista, cámaras, buscador y maletero', () => {
  it('la historia y el reparto de puntos al crear dan habilidades; un reparto inválido se rechaza', async () => {
    const reg = await BotClient.api(base, '/api/register', { username: 'historia', password: 'password1' });
    const attributes = { INT: 6, REF: 6, DEX: 5, TECH: 6, COOL: 6, WILL: 5, LUCK: 5, MOVE: 5, BODY: 5, EMP: 6 };
    const appearance = { skin: '#c89070', hair: '#1a1a1a', jacket: '#40506a', accent: '#43f3ff', build: 'corpulento', hairStyle: 'afro' };
    await expect(BotClient.api(base, '/api/characters', { name: 'historia', origin: 'callejero', role: 'solo', attributes, appearance, bio: { objective: 'rico', childhood: 'calle', event: 'traicion' }, skillPoints: { medicina: 4 } }, reg.token)).rejects.toThrow();
    await BotClient.api(base, '/api/characters', { name: 'historia', origin: 'callejero', role: 'solo', attributes, appearance, bio: { objective: 'maestria', childhood: 'hospital', event: 'deuda' }, skillPoints: { medicina: 3, reparacion: 3, conduccion: 3, sigilo: 3, interfaz: 2 } }, reg.token);
    const b = new BotClient(base, 'historia'); clients.push(b);
    await b.connect(reg.token, app.contentHash);
    const p = P('historia');
    expect(p.bio?.objective).toBe('maestria');
    expect(skillLevelForXp(p.skillXp.medicina ?? 0)).toBeGreaterThanOrEqual(5); // hospital +2 y 3 puntos
    expect(p.appearance.build).toBe('corpulento');
  });

  it('heridas por zonas: el tiro apuntado acierta en la zona elegida, sangra y la venda corta la hemorragia', async () => {
    const a = await join('tiradora', 'solo', { REF: 8, LUCK: 3 });
    const pa = P('tiradora');
    const [x, y] = tileWhere((tx, ty) => dangerAt(city().grid, tx, ty) === 'lawless');
    await app.world.teleport(conn('tiradora'), 'vertice', [x, y]);
    await a.until(() => E('tiradora').zone.id === 'vertice', 5000, 'en la calle');
    const t = dummy(x + 1.5, y + 0.5);
    t.npcHp = 400; t.npcMax = 400;
    pa.equipped = 'pistola-ligera'; pa.inventory.set('pistola-ligera', 1); pa.inventory.set('municion-ligera', 30);
    const r = await a.cmd({ t: 'hostile', target: t.id, action: 'aim', part: 'piernas', opId: op() });
    expect(r.ok).toBe(true);
    await a.until(() => Object.keys(t.body?.wounds ?? {}).some((k) => k.startsWith('pierna')), 8000, 'herida en la pierna');
    // Un jugador herido sangra y se venda.
    pa.body.bleed = 1.2; pa.inventory.set('venda', 1);
    await app.db.query("INSERT INTO inventory_items (id, character_id, def_id, qty) VALUES (gen_random_uuid(), $1, 'venda', 1) ON CONFLICT (character_id, def_id) DO UPDATE SET qty = 1", [pa.charId]);
    expect((await a.cmd({ t: 'useItem', item: 'venda', opId: op() })).ok).toBe(true);
    expect(pa.body.bleed).toBeLessThan(0.5);
  });

  it('límite de armas: no caben más de 2 largas encima', async () => {
    const a = await join('armera');
    const p = P('armera');
    p.inventory.set('rifle-asalto', 1); p.inventory.set('escopeta-corta', 1);
    p.money = 99999;
    const { weaponFits } = await import('../src/game/player.js');
    expect(weaponFits(app.world.c, p, 'rifle-precision')).toMatch(/maletero/);
    expect(weaponFits(app.world.c, p, 'navaja')).toBeNull();
    void a;
  });

  it('zona sin ley: matar no tiene consecuencias; zona vigilada con cámara: te identifica y queda constancia pública', async () => {
    const k = await join('sicaria', 'solo', { BODY: 8, LUCK: 2 });
    const p = P('sicaria');
    p.equipped = 'pistola-ligera'; p.inventory.set('pistola-ligera', 1); p.inventory.set('municion-ligera', 60);
    // Zona negra.
    const [lx, ly] = tileWhere((tx, ty) => dangerAt(city().grid, tx, ty) === 'lawless');
    await app.world.teleport(conn('sicaria'), 'vertice', [lx, ly]);
    await k.until(() => E('sicaria').zone.id === 'vertice', 5000, 'en el yermo');
    const t1 = dummy(lx + 1.5, ly + 0.5); t1.npcHp = 1;
    app.world.combat.rng = () => 0.99;
    await k.cmd({ t: 'hostile', target: t1.id, action: 'attack', opId: op() });
    await k.until(() => t1.state === 'downed', 6000, 'derribado');
    expect(p.wanted).toBe(0);
    expect(p.identified).toBeNull();
    // Delante de una cámara, en zona amarilla.
    const cam = [...city().entities].find((o) => o.objKind === 'camera' && dangerAt(city().grid, o.x, o.y) === 'public' && isWalkable(city().grid, o.x + 1, o.y) && isWalkable(city().grid, o.x + 2, o.y))!;
    expect(cam).toBeTruthy();
    await app.world.teleport(conn('sicaria'), 'vertice', [Math.floor(cam.x) + 1, Math.floor(cam.y)]);
    for (const o of [...city().query(cam.x, cam.y, 25)]) if (o.npcType === 'police' || o.npcType === 'hierro') put(o, 10, 10);
    const t2 = dummy(cam.x + 1.6, cam.y + 1); t2.npcHp = 1;
    await k.cmd({ t: 'hostile', target: t2.id, action: 'attack', opId: op() });
    await k.until(() => !!p.identified, 6000, 'identificada por la cámara');
    app.world.combat.rng = Math.random;
    const rec = await app.db.query<any>('SELECT crime FROM public_records WHERE character_id=$1', [p.charId]);
    expect(rec.rows.length).toBeGreaterThan(0);
    expect(p.wanted).toBeGreaterThan(0);
  });

  it('buscador: el móvil encuentra a una persona por su nombre y se puede marcar como objetivo', async () => {
    const s = await join('rastreadora');
    const target = await join('desaparecido');
    void target;
    const [x, y] = tileWhere((tx, ty) => dangerAt(city().grid, tx, ty) === 'public');
    await app.world.teleport(conn('rastreadora'), 'vertice', [x, y]);
    await app.world.teleport(conn('desaparecido'), 'vertice', [x + 6, y]);
    await s.until(() => E('rastreadora').zone.id === 'vertice' && E('desaparecido').zone.id === 'vertice', 5000, 'en la calle');
    const res = s.waitFor((m) => m.t === 'searchResults', 20000, 'resultados');
    expect((await s.cmd({ t: 'searchPeople', query: 'desapar', device: 'phone' })).ok).toBe(true);
    const out = (await res) as any;
    const hit = out.results.find((r: any) => r.name === 'desaparecido');
    expect(hit?.location?.precise).toBe(false);
    // Sin ordenador cerca no se puede usar el ordenador.
    expect((await s.cmd({ t: 'searchPeople', query: 'desapar', device: 'computer' })).ok).toBe(false);
    const goal = s.waitFor((m) => m.t === 'gotoTarget' && !!(m as any).target, 5000, 'objetivo');
    expect((await s.cmd({ t: 'goto', kind: 'person', key: hit.key })).ok).toBe(true);
    await goal;
    expect(app.world.intel.goto.has(P('rastreadora').charId)).toBe(true);
    // Una orden manual lo cancela.
    await s.cmd({ t: 'stop' });
    expect(app.world.intel.goto.has(P('rastreadora').charId)).toBe(false);
  });

  it('maletero: el coche aparcado se ve en la calle y guarda armas hasta su capacidad', async () => {
    const d = await join('conductora');
    const p = P('conductora');
    const [x, y] = tileWhere((tx, ty) => dangerAt(city().grid, tx, ty) === 'public');
    await app.world.teleport(conn('conductora'), 'vertice', [x, y]);
    await d.until(() => E('conductora').zone.id === 'vertice', 5000, 'en la calle');
    const car = app.world.c.cars[0];
    const r = await app.db.query<any>('INSERT INTO cars_owned (id, character_id, car_id, price) VALUES (gen_random_uuid(), $1, $2, 1) RETURNING id', [p.charId, car.id]);
    p.cars.push({ id: r.rows[0].id, car: car.id });
    expect((await d.cmd({ t: 'trunk', action: 'view' })).ok).toBe(false); // sin coche cerca
    await d.cmd({ t: 'car', action: 'drive' });
    await d.cmd({ t: 'car', action: 'park' });
    const parked = app.world.property.parked.get(r.rows[0].id);
    expect(parked?.objKind).toBe('mycar');
    const view = d.waitFor((m) => m.t === 'trunk', 3000, 'maletero');
    expect((await d.cmd({ t: 'trunk', action: 'view' })).ok).toBe(true);
    await view;
    expect((await d.cmd({ t: 'trunk', action: 'in', item: 'navaja', qty: 1 })).ok).toBe(true);
    expect(p.inventory.get('navaja') ?? 0).toBe(0);
    expect((await d.cmd({ t: 'trunk', action: 'out', item: 'navaja', qty: 1 })).ok).toBe(true);
    expect(p.inventory.get('navaja')).toBe(1);
  });
});
