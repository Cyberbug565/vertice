// v0.9 · controles (interactuar a distancia sin caminar), modo hackeo, esquiva, patada, golpe fuerte, Onda Carmín (radio, jefes, noqueo),
// ahorro de RAM, ranuras dobles, capacidades de los implantes y prendas nuevas, Nivel 2, farolas, rótulos y variedad de PNJ.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { BODY_TATTOOS, FABRICS, dangerAt, isWalkable } from '@vertice/shared';
import { createApp } from '../src/app.js';
import { BotClient } from '../../tools/loadtest/src/botclient.js';
import { effective } from '../src/game/player.js';
import { ONDA_RADIUS } from '../src/world/relics.js';
import type { Entity } from '../src/world/entity.js';

const DB = process.env.TEST_DATABASE_URL;
let app: Awaited<ReturnType<typeof createApp>>;
let base = '';
const clients: BotClient[] = [];
let n = 0;
const op = () => `op-v09-${Date.now()}-${n++}`;

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
const install = (name: string, def: string) => P(name).cyber.push({ id: `t-${def}-${n++}`, def, location: 'installed', stolen: false });
function lawless(): [number, number] {
  const z = city();
  for (let y = 4; y < z.def.height - 4; y++) for (let x = 4; x < z.def.width - 4; x++) {
    if (dangerAt(z.grid, x, y) !== 'lawless') continue;
    let ok = true;
    for (let dx = 0; dx < 8 && ok; dx++) for (let dy = 0; dy < 3 && ok; dy++) if (!isWalkable(z.grid, x + dx + 0.5, y + dy + 0.5)) ok = false;
    if (ok) return [x, y];
  }
  throw new Error('sin loseta');
}
async function toLawless(b: BotClient, name: string) {
  const [x, y] = lawless();
  await app.world.teleport(conn(name), 'vertice', [x, y]);
  await b.until(() => E(name).zone.id === 'vertice', 5000, 'en la calle');
  put(E(name), x + 0.5, y + 0.5);
  return [x, y] as const;
}
function npcAt(x: number, y: number, hp = 60) {
  const npc = [...city().entities].find((o) => o.kind === 'npc' && o.npcType === 'civil' && o.npcMax && !o.dead && o.state !== 'downed' && !(o as any).usedInTest)!;
  (npc as any).usedInTest = true;
  put(npc, x, y); npc.npc!.pauseUntil = app.world.tick + 1e6; npc.npcMax = hp; npc.npcHp = hp; npc.aggro = undefined;
  return npc;
}

describe('v0.9 · controles, combate, implantes, ropa y ciudad', () => {
  it('clic a distancia: abre la interacción sin caminar; lejos, pide acercarse con WASD; las puertas, solo de cerca', async () => {
    const b = await join('clicadora');
    const [x, y] = await toLawless(b, 'clicadora');
    const t = npcAt(x + 5.5, y + 0.5);
    const near = await b.cmd({ t: 'interact', target: t.id, remote: true } as any);
    expect(near.ok).toBe(true);
    expect(E('clicadora').path.length).toBe(0);
    put(t, x + 0.5, y + 0.5); put(E('clicadora'), x + 0.5, y + 0.5);
    t.x = E('clicadora').x + 12; t.zone.moved(t);
    const far = await b.cmd({ t: 'interact', target: t.id, remote: true } as any);
    expect(far.ok).toBe(false);
    expect(far.reason).toMatch(/WASD/);
    expect(E('clicadora').path.length).toBe(0);
    // Atacar fuera de alcance tampoco persigue: hay que acercarse (empieza con una pistola de 12 m).
    t.x = E('clicadora').x + 20; t.zone.moved(t);
    const atk = await b.cmd({ t: 'hostile', target: t.id, action: 'attack', opId: op(), remote: true } as any);
    expect(atk.ok).toBe(false);
    expect(E('clicadora').path.length).toBe(0);
  });

  it('modo hackeo: el panel solo trae opciones de red (y avisa si no tienes deck)', async () => {
    const b = await join('hacker', 'netrunner');
    const [x, y] = await toLawless(b, 'hacker');
    const t = npcAt(x + 3.5, y + 0.5);
    const menu = b.waitFor((m) => m.t === 'targetMenu', 4000, 'panel');
    expect((await b.cmd({ t: 'hackMenu', target: t.id } as any)).ok).toBe(true);
    const v = ((await menu) as any).view;
    expect(v.hackMode).toBe(true);
    expect(v.options.length).toBeGreaterThan(0);
    expect(v.options.every((o: any) => o.group === 'red')).toBe(true);
  });

  it('esquiva: rueda 2,6 m, gasta aguante y durante medio segundo casi nada le acierta', async () => {
    const b = await join('rodadora');
    const [x, y] = await toLawless(b, 'rodadora');
    const p = P('rodadora'), e = E('rodadora');
    const st0 = p.stamina;
    expect((await b.cmd({ t: 'dodge', dx: 1, dy: 0 } as any)).ok).toBe(true);
    expect(e.x - (x + 0.5)).toBeGreaterThan(2);
    expect(p.stamina).toBe(st0 - 10);
    expect((e.dodgeUntil ?? 0)).toBeGreaterThan(Date.now());
    // Sin esperar, no puede volver a rodar.
    expect((await b.cmd({ t: 'dodge', dx: 1, dy: 0 } as any)).ok).toBe(false);
  });

  it('patada: empuja, desequilibra y no gasta munición; el golpe fuerte aturde más y rompe la guardia', async () => {
    const b = await join('pateadora');
    const [x, y] = await toLawless(b, 'pateadora');
    const p = P('pateadora');
    p.attributes.REF = 10; p.attributes.DEX = 10;
    const t = npcAt(x + 1.6, y + 0.5, 400); t.defense = -50;
    const x0 = t.x;
    expect((await b.cmd({ t: 'hostile', target: t.id, action: 'kick', opId: op(), remote: true } as any)).ok).toBe(true);
    expect(t.x).toBeGreaterThan(x0 + 1);
    expect((t.stunUntil ?? 0)).toBeGreaterThan(Date.now());
    p.nextAttackAt = 0; put(t, x + 1.4, y + 0.5); t.stunUntil = 0;
    expect((await b.cmd({ t: 'hostile', target: t.id, action: 'heavy', opId: op(), remote: true } as any)).ok).toBe(true);
    expect(p.nextAttackAt - Date.now()).toBeGreaterThan(1000);
  });

  it('Onda Carmín: radio de 11 m, mucho daño, pero un jefe nunca cae de una onda; la amarilla noquea', async () => {
    const b = await join('carmesi', 'netrunner');
    const [x, y] = await toLawless(b, 'carmesi');
    const p = P('carmesi');
    install('carmesi', 'zocalo-matrices');
    p.relics = { matrices: ['matriz-carmin'], socketExtra: 0 };
    p.ram = 50; p.stance = 'aggressive';
    expect(ONDA_RADIUS).toBeGreaterThanOrEqual(11);
    const far = npcAt(x + 7.5, y + 0.5, 60);
    const boss = npcAt(x + 3.5, y + 1.5, 600); boss.npcType = 'psycho';
    expect((await b.cmd({ t: 'ability', id: 'matriz-carmin' } as any)).ok).toBe(true);
    expect(far.state === 'downed' || far.dead).toBe(true);
    expect(boss.state).not.toBe('downed');
    expect(boss.npcHp!).toBeGreaterThan(0);
    expect(boss.npcHp!).toBeLessThan(600 * 0.7);
    // Onda de noqueo: deja KO al resto.
    const other = npcAt(x + 5.5, y + 0.5, 60);
    p.ram = 50;
    expect((await b.cmd({ t: 'ability', id: 'matriz-carmin:ko' } as any)).ok).toBe(true);
    expect(other.state).toBe('downed');
    expect(other.dead).toBeFalsy();
  });

  it('CARMÍN y las matrices de flujo reducen el gasto de RAM del Kairós (y da más capacidad y RAM)', async () => {
    const b = await join('flujo');
    await toLawless(b, 'flujo');
    const p = P('flujo');
    install('flujo', 'zocalo-matrices'); install('flujo', 'kairos-6'); install('flujo', 'cortex-calculo');
    p.cyber.push({ id: 't-deck', def: app.world.c.cyberware.find((d) => (d.effects.ram ?? 0) > 0)!.id, location: 'installed', stolen: false });
    const ram0 = effective(app.world.c, p).ram;
    p.relics = { matrices: ['matriz-carmin', 'matriz-delta'], socketExtra: 0 };
    const ef = effective(app.world.c, p);
    expect(ef.ram).toBe(ram0 + 30);
    expect(ef.ramSave).toBeCloseTo(0.6, 5); // 0,45 + 0,30 → tope del 60 %
    p.ram = 40;
    expect((await b.cmd({ t: 'ability', id: 'kairos-6' } as any)).ok).toBe(true);
    app.world.relics.everySecond();
    expect(40 - p.ram).toBeCloseTo(5 * 0.4, 5);
    await b.cmd({ t: 'ability', id: 'kairos-6' } as any);
  });

  it('ranuras dobles: caben dos ojos y cuatro dedos; un quinto dedo no', async () => {
    const b = await join('cromada');
    const p = P('cromada');
    void b;
    const doc = app.world.c.ripperdocs.find((d) => d.maxGrade >= 4)!;
    const offer = (id: string) => (app.world.survival.clinic as any).offer(p, doc, app.world.c.cyberware.find((d) => d.id === id)!, 'stock', id, false);
    install('cromada', 'ojo-lince');
    expect(offer('ojo-contraste').blocked ?? '').not.toMatch(/ocupad/);
    install('cromada', 'ojo-contraste');
    expect(offer('ojo-nocturno').blocked).toMatch(/ocupad/);
    for (const id of ['dedo-ganzua', 'dedo-linterna', 'dedo-conector', 'dedo-memoria']) install('cromada', id);
    expect(offer('dedo-pistola').blocked).toMatch(/ocupad/);
    expect(app.world.c.cyberware.length).toBeGreaterThanOrEqual(149);
  });

  it('capacidades: el Ojo «Absoluto» acierta casi siempre, la Mano «Vampiro» cura y el «Segundo aliento» te levanta', async () => {
    const b = await join('absoluta');
    const [x, y] = await toLawless(b, 'absoluta');
    const p = P('absoluta');
    const gun = app.world.c.items.find((i) => i.weapon?.kind === 'ranged' && i.weapon.ammo && i.weapon.range >= 20)!;
    p.inventory.set(gun.id, 1); p.inventory.set(gun.weapon!.ammo!, 500); p.equipped = gun.id;
    install('absoluta', 'ojo-absoluto');
    expect(effective(app.world.c, p).flags.has('ojo-absoluto')).toBe(true);
    const t = npcAt(x + 7.5, y + 0.5, 100000); t.defense = 40;
    let hits = 0;
    for (let i = 0; i < 20; i++) { p.nextAttackAt = 0; const hp = t.npcHp!; await app.world.combat.attack(conn('absoluta'), t, true, op()); if (t.npcHp! < hp) hits++; }
    expect(hits).toBeGreaterThanOrEqual(14);
    // Vampiro: los golpes curan.
    install('absoluta', 'mano-vampiro'); p.equipped = null;
    put(t, E('absoluta').x + 1, E('absoluta').y); t.defense = -60;
    p.hp = 50;
    for (let i = 0; i < 5; i++) { p.nextAttackAt = 0; await app.world.combat.attack(conn('absoluta'), t, true, op()); }
    expect(p.hp).toBeGreaterThan(50);
    // Segundo aliento: al caer, se levanta.
    install('absoluta', 'corazon-segundo-aliento');
    app.world.survival.downed(conn('absoluta'), 'prueba', p, E('absoluta'), true);
    expect(p.revive?.frac).toBeCloseTo(0.34, 2);
  });

  it('ropa nueva: 100 prendas con tejidos, detalles y mejoras que cuentan (esquiva, salud, RAM, capacidad especial)', async () => {
    const b = await join('modelo');
    void b;
    const p = P('modelo');
    const clothes = app.world.c.items.filter((i) => i.category === 'ropa');
    expect(clothes.length).toBeGreaterThanOrEqual(146);
    expect(clothes.filter((i) => (i.wear as any)?.pattern).length).toBeGreaterThanOrEqual(100);
    const d0 = effective(app.world.c, p).dodge;
    p.inventory.set('chaqueta-carbono-fantasma', 1); p.wear = { ...p.wear, torso_ext: 'chaqueta-carbono-fantasma' } as any;
    expect(effective(app.world.c, p).dodge).toBeCloseTo(d0 + 0.08, 5);
    expect(effective(app.world.c, p).flags.has('reflejos')).toBe(true);
    // Y se ve: el aspecto lleva el tejido y el detalle de la prenda.
    const look = (app.world.survival as any).sheetOf(p).look;
    expect(look.topPattern).toBe('carbono');
    expect(look.topDetail).toBe('led');
  });

  it('ciudad: Nivel 2 con escaleras en los extremos de las pasarelas, farolas fuera de la calzada y rótulos en los locales públicos', async () => {
    const c = city().def;
    const stairs = c.doors.filter((d) => d.to.zone === 'pasarelas');
    expect(stairs.length).toBeGreaterThanOrEqual(20);
    const n2 = app.world.zones.get('pasarelas')!;
    for (const d of stairs) expect(isWalkable(n2.grid, d.to.at[0] + 0.5, d.to.at[1] + 0.5)).toBe(true);
    for (const d of n2.def.doors) { expect(d.to.zone).toBe('vertice'); expect(isWalkable(city().grid, d.to.at[0] + 0.5, d.to.at[1] + 0.5)).toBe(true); }
    const inR = (x: number, y: number, r: number[]) => x >= r[0] && y >= r[1] && x < r[0] + r[2] && y < r[1] + r[3];
    const groundAt = (x: number, y: number) => { let t: string = c.base; for (const g of c.ground) if (inR(x, y, g.rect)) t = g.type; return t; };
    const lamps = c.props.filter((p) => p.type === 'lamp');
    expect(lamps.filter((l) => ['asphalt', 'crosswalk', 'water'].includes(groundAt(l.at[0], l.at[1]))).length).toBe(0);
    const comisaria = c.doors.find((d) => /Comisaría/.test(d.name))!;
    expect((comisaria as any).sign).toBe('COMISARÍA');
    expect((c.doors.find((d) => /Farmacia/.test(d.name)) as any).sign).toBe('FARMACIA');
    expect((c.doors.find((d) => /Clínica Sato/.test(d.name)) as any).sign).toBe('MATASANOS');
    expect((c.doors.find((d) => /sin rótulo/.test(d.name)) as any).sign).toBeUndefined();
    // PNJ variados: tejidos y tatuajes distintos.
    const npcs = [...city().entities].filter((e) => e.kind === 'npc' && e.npcType === 'civil');
    expect(new Set(npcs.map((e) => (e.appearance as any)?.topPattern)).size).toBeGreaterThan(2);
    expect(FABRICS.length).toBeGreaterThanOrEqual(20); expect(BODY_TATTOOS.length).toBeGreaterThanOrEqual(20);
  });
});
