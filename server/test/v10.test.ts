// v0.10 · sigilo: visión en cono y línea de visión, ruido por arma, testigos, descripción y ropa, detectores en las entradas
// (que no ven el cromo), disfraces, sospecha al estilo de los juegos de infiltración, quién te busca y lugares restringidos.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { dangerAt, isWalkable } from '@vertice/shared';
import { createApp } from '../src/app.js';
import { BotClient } from '../../tools/loadtest/src/botclient.js';
import type { Entity } from '../src/world/entity.js';

const DB = process.env.TEST_DATABASE_URL;
let app: Awaited<ReturnType<typeof createApp>>;
let base = '';
const clients: BotClient[] = [];
let n = 0;
const op = () => `op-v10-${Date.now()}-${n++}`;

beforeAll(async () => {
  if (DB) { const c = new pg.Client({ connectionString: DB }); await c.connect(); await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); await c.end(); }
  app = await createApp({ port: 0, host: '127.0.0.1', databaseUrl: DB, pgliteDir: 'memory://', ambientNpcs: 10, crowdNpcs: 0, speedScale: 4, lingerSeconds: 1, logLevel: 'warn',
    cityHourMs: 60000, cityHourOffset: 12 - ((Date.now() / 60000) % 24), needsScale: 1, downedSeconds: 2, jobTimeScale: 0.05, threats: false });
  base = `http://127.0.0.1:${app.port}`;
});
afterAll(async () => { for (const c of clients) c.close(); await app?.close(); });

async function join(name: string, role = 'solo') {
  const token = await BotClient.registerAndCreate(base, name, role, 'callejero');
  const b = new BotClient(base, name); clients.push(b);
  await b.connect(token, app.contentHash);
  return b;
}
const conn = (name: string) => [...app.world.conns.values()].find((c) => c.p?.name === name)!;
const P = (name: string) => conn(name).p!;
const E = (name: string) => conn(name).e!;
const city = () => app.world.zones.get('vertice')!;
const put = (e: Entity, x: number, y: number) => { e.x = x; e.y = y; e.path = []; e.zone.moved(e); };
/** Una calle despejada de 24 × 3 en una zona del nivel pedido. */
function street(level: string): [number, number] {
  const z = city();
  for (let y = 4; y < z.def.height - 4; y++) for (let x = 4; x < z.def.width - 30; x++) {
    if (dangerAt(z.grid, x, y) !== level) continue;
    let ok = true;
    for (let dx = 0; dx < 24 && ok; dx++) for (let dy = 0; dy < 3 && ok; dy++) if (!isWalkable(z.grid, x + dx + 0.5, y + dy + 0.5) || dangerAt(z.grid, x + dx, y + dy) !== level) ok = false;
    if (ok) return [x, y];
  }
  throw new Error('sin calle');
}
let used = new Set<number>();
function npc(x: number, y: number, type = 'civil', facing = 0) {
  const o = [...city().entities].find((e) => e.kind === 'npc' && e.npcType === 'civil' && e.npcMax && !e.dead && e.state !== 'downed' && !used.has(e.id))!;
  used.add(o.id);
  put(o, x, y); o.npc!.pauseUntil = app.world.tick + 1e6; o.facing = facing; o.aggro = undefined; o.npcType = type as any;
  return o;
}
function clearAround(x: number, y: number, r: number) {
  for (const o of city().query(x, y, r)) if (o.kind === 'npc' && !used.has(o.id)) { put(o, 5, 5); o.npc && (o.npc.pauseUntil = app.world.tick + 1e6); }
}

describe('v0.10 · sigilo', () => {
  it('visión: te ve de frente y de cerca; de espaldas a más de 2 m, no; los edificios tapan', async () => {
    const b = await join('sigilosa');
    const [x, y] = street('public');
    await app.world.teleport(conn('sigilosa'), 'vertice', [x, y + 1]);
    await b.until(() => E('sigilosa').zone.id === 'vertice', 5000, 'calle');
    put(E('sigilosa'), x + 6.5, y + 1.5);
    const o = npc(x + 1.5, y + 1.5, 'civil', 0); // mira hacia +x (hacia ella)
    expect(app.world.stealth.sees(o, E('sigilosa'))).toBe(true);
    o.facing = 4; // de espaldas
    expect(app.world.stealth.sees(o, E('sigilosa'))).toBe(false);
    put(E('sigilosa'), x + 3, y + 1.5);
    expect(app.world.stealth.sees(o, E('sigilosa'))).toBe(true); // de cerca siempre
  });

  it('ruido: un arma silenciosa apenas se oye; un rifle, a decenas de metros', async () => {
    const s = app.world.c.items.find((i) => i.id === 'dedo-pistola-arma')!.weapon!;
    const loud = app.world.c.items.find((i) => i.weapon?.kind === 'ranged' && /Rifle|Escopeta/.test(i.weapon.family))!.weapon!;
    const r = (w: any) => (8 + (w.noise ?? 0.5) * 32) * ((w.traits ?? []).includes('silenciosa') ? 0.3 : 1);
    expect(r(s)).toBeLessThan(5);
    expect(r(loud)).toBeGreaterThan(20);
  });

  it('sin testigos no hay búsqueda; con testigos, recuerdan tu ropa y cambiarte de ropa te salva', async () => {
    const b = await join('fantasma');
    const [x, y] = street('public');
    await app.world.teleport(conn('fantasma'), 'vertice', [x, y + 1]);
    await b.until(() => E('fantasma').zone.id === 'vertice', 5000, 'calle');
    clearAround(x + 12, y + 1, 40);
    const p = P('fantasma');
    p.inventory.set('dedo-pistola-arma', 0); p.equipped = null;
    put(E('fantasma'), x + 12.5, y + 1.5);
    const victim = npc(x + 13.5, y + 1.5, 'civil', 4); victim.npcHp = 1;
    (conn('fantasma') as any).lastNoise = 2.5;
    // Nadie alrededor (la víctima cae): nadie se entera.
    await app.world.combat['crime'](conn('fantasma'), victim, true, 'kill');
    expect(p.wanted).toBe(0);
    // Ahora hay un agente mirando: te busca y recuerda tu ropa.
    const cop = npc(x + 16.5, y + 1.5, 'police', 4);
    await app.world.combat['crime'](conn('fantasma'), victim, true, 'kill');
    expect(p.wanted).toBeGreaterThan(0);
    const st = app.world.stealth.st(conn('fantasma'));
    expect(st.description?.outfit).toBe(app.world.stealth.outfit(p));
    put(cop, E('fantasma').x + 8, E('fantasma').y);
    cop.aggro = undefined; // le has perdido de vista: ahora busca a quien encaje con la descripción
    expect(app.world.stealth.recognizes(cop, conn('fantasma'))).toBe(true);
    // Se cambia de ropa: ya no encaja con la descripción (y de lejos no le ve la cara).
    p.inventory.set('chubasquero-acido', 1); p.wear = { ...p.wear, torso_ext: 'chubasquero-acido' } as any;
    expect(app.world.stealth.recognizes(cop, conn('fantasma'))).toBe(false);
    cop.aggro = undefined; p.wanted = 0;
  });

  it('arco detector: con un arma encima salta la alarma; con un dedo pistola (cromo) o de uniforme, no', async () => {
    const b = await join('infiltrada');
    const p = P('infiltrada');
    const pistol = app.world.c.items.find((i) => i.weapon?.family === 'Pistola')!.id;
    p.inventory.set(pistol, 1);
    expect(app.world.stealth.detector(conn('infiltrada'), 'comisaria-int')).toBe(true);
    expect(app.world.stealth.st(conn('infiltrada')).suspicion).toBe(100);
    // Sin armas pero con el dedo pistola instalado: el arco no ve el cromo.
    for (const [id] of [...p.inventory]) if (app.world.c.items.find((i) => i.id === id)?.weapon) p.inventory.set(id, 0);
    p.cyber.push({ id: 't-dedo', def: 'dedo-pistola', location: 'installed', stolen: false });
    expect(app.world.stealth.detector(conn('infiltrada'), 'comisaria-int')).toBe(false);
    // Uniforme de la PCV: pita, pero te dejan pasar armada.
    p.inventory.set(pistol, 1); p.inventory.set('uniforme-pcv', 1); p.wear = { ...p.wear, torso_ext: 'uniforme-pcv' } as any;
    expect(app.world.stealth.disguise(p)).toBe('disfraz-pcv');
    expect(app.world.stealth.detector(conn('infiltrada'), 'comisaria-int')).toBe(false);
    void b;
  });

  it('sospecha: con el arma empuñada delante de un agente, primero te avisa; si sigues, «descubierto» y va a por ti', async () => {
    const b = await join('descuidada');
    const [x, y] = street('public');
    await app.world.teleport(conn('descuidada'), 'vertice', [x, y + 1]);
    await b.until(() => E('descuidada').zone.id === 'vertice', 5000, 'calle');
    clearAround(x + 12, y + 1, 30);
    const p = P('descuidada');
    const pistol = app.world.c.items.find((i) => i.weapon?.family === 'Pistola')!.id;
    p.inventory.set(pistol, 1); p.equipped = pistol;
    put(E('descuidada'), x + 12.5, y + 1.5);
    const cop = npc(x + 8.5, y + 1.5, 'police', 0);
    const st = app.world.stealth.st(conn('descuidada'));
    for (let i = 0; i < 5; i++) app.world.stealth.tick();
    expect(st.observers).toContain(cop.id);
    expect(st.warnedAt).toBeGreaterThan(0);
    expect(cop.aggro).toBeUndefined(); // primero, el aviso
    for (let i = 0; i < 4; i++) app.world.stealth.tick();
    expect(st.state).toBe('descubierto');
    expect(cop.aggro).toBe(E('descuidada').id);
    expect(app.world.stealth.hunters(conn('descuidada')).some((h) => h.id === 'pcv')).toBe(true);
    cop.aggro = undefined;
  });

  it('quién te busca: PCV, militares con búsqueda alta y las bandas que pagan por tu cabeza', async () => {
    const b = await join('perseguida');
    void b;
    const p = P('perseguida');
    p.wanted = 4.2;
    const gang = app.world.c.factions.find((f) => f.kind === 'gang')!;
    await app.world.survival.bounties.post('player', { charId: p.charId, name: p.name }, 3000, gang.id, 'Nos debes una');
    const h = app.world.stealth.hunters(conn('perseguida'));
    expect(h.map((x) => x.id)).toEqual(expect.arrayContaining(['pcv', 'hierro', `b-${gang.id}`]));
    expect(h.find((x) => x.id === `b-${gang.id}`)!.name).toMatch(gang.name);
    p.wanted = 0;
  });

  it('lugares restringidos: comisarías, torres, el Banco Central y el Penal de Hierro con detector, guardias y rótulo', async () => {
    const zones = [...app.world.zones.values()];
    expect(zones.filter((z) => (z.def as any).restricted).length).toBeGreaterThanOrEqual(30);
    for (const id of ['banco-central', 'penal-hierro', 'comisaria-int', 'torre-halcon-p0']) {
      const z = app.world.zones.get(id) ?? app.world.ensureZone(id)!;
      expect((z.def as any).detector).toBe(true);
      expect(z.def.police).toBeGreaterThan(0);
    }
    const doors = city().def.doors;
    expect((doors.find((d) => d.to.zone === 'banco-central') as any)?.sign).toBe('BANCO');
    expect((doors.find((d) => d.to.zone === 'penal-hierro') as any)?.sign).toBe('PENAL');
    // Y al registrar a un agente caído te llevas su uniforme.
    const b = await join('saqueadora');
    void b;
    const [x, y] = street('lawless' as any === 'x' ? 'public' : 'disputed');
    await app.world.teleport(conn('saqueadora'), 'vertice', [x, y + 1]);
    await b.until(() => E('saqueadora').zone.id === 'vertice', 5000, 'calle');
    const cop = npc(E('saqueadora').x + 1, E('saqueadora').y, 'police', 0);
    cop.state = 'downed'; cop.searched = false;
    await app.world.combat.searchBody(conn('saqueadora'), cop);
    expect(P('saqueadora').inventory.get('uniforme-pcv')).toBe(1);
    void op;
  });
});
