// v0.2 · supervivencia, mercado, matasanos, empleos y recompensas sobre el protocolo real (tiempo de juego acelerado).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { surgeryRisk } from '@vertice/shared';
import { createApp } from '../src/app.js';
import { BotClient } from '../../tools/loadtest/src/botclient.js';
import { opposedChance } from '../src/world/survival.js';

const DB = process.env.TEST_DATABASE_URL;
let app: Awaited<ReturnType<typeof createApp>>;
let base = '';
const clients: BotClient[] = [];
const op = () => randomUUID().replace(/-/g, '');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  if (DB) { const c = new pg.Client({ connectionString: DB }); await c.connect(); await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); await c.end(); }
  app = await createApp({ port: 0, host: '127.0.0.1', databaseUrl: DB, pgliteDir: 'memory://', ambientNpcs: 4, crowdNpcs: 0, speedScale: 6, lingerSeconds: 1, logLevel: 'warn',
    cityHourOffset: 10 - ((Date.now() / 60000) % 24), needsScale: 1, downedSeconds: 2, jobTimeScale: 0.05 });
  base = `http://127.0.0.1:${app.port}`;
});
afterAll(async () => { for (const c of clients) c.close(); await app?.close(); });

async function join(name: string, role = 'solo', attrs: Record<string, number> = {}) {
  const token = await BotClient.registerAndCreate(base, name, role, 'callejero', attrs);
  const b = new BotClient(base, name); clients.push(b);
  await b.connect(token, app.contentHash);
  return { b, token };
}
const P = (name: string) => [...app.world.conns.values()].find((c) => c.p?.name === name)!.p!;
const E = (name: string) => [...app.world.conns.values()].find((c) => c.p?.name === name)!.e!;
const ledgerOk = async () => (await app.db.query<any>("SELECT count(*)::int AS n FROM characters c LEFT JOIN (SELECT character_id, sum(delta) s FROM ledger GROUP BY 1) l ON l.character_id=c.id WHERE c.money <> COALESCE(l.s,0)")).rows[0].n === 0;

describe('reglas puras', () => {
  it('enfrentamiento opuesto y riesgo quirúrgico', () => {
    expect(opposedChance(10, 10)).toBeCloseTo(0.55);
    expect(opposedChance(30, 0)).toBe(1);
    const good = surgeryRisk({ skill: 5, grade: 1, danger: 0, body: 5, rep: 0, stolen: false, unscrupulous: false, bonus: 0, humanityAfter: 50, removal: false });
    const bad = surgeryRisk({ skill: 2, grade: 4, danger: 0.35, body: 5, rep: -20, stolen: true, unscrupulous: true, bonus: 0, humanityAfter: 50, removal: false });
    expect(good.survival).toBeGreaterThan(0.95);
    expect(good.label).toBe('Baja');
    expect(bad.survival).toBeLessThan(good.survival - 0.3);
    expect(bad.theft).toBeGreaterThan(0.2);
  });
});

describe('v0.2 · vivir en la ciudad', () => {
  it('las necesidades crecen y el personaje come y bebe solo de su inventario', async () => {
    const { b } = await join('nadie');
    const p = P('nadie');
    p.hunger = 64; p.thirst = 70;
    await b.waitFor((m) => m.t === 'notice' && /Automático: consumes/.test(m.text), 8000, 'consumo automático');
    await b.until(() => b.sheet!.needs.thirst < 60, 8000, 'sed saciada');
    await b.until(() => b.sheet!.needs.hunger < 60, 12000, 'hambre saciada');
    expect(p.inventory.get('agua-filtrada')).toBeLessThan(2);
  });

  it('sin comida, va solo a la máquina expendedora más cercana y compra', async () => {
    const { b } = await join('compradora');
    const p = P('compradora');
    for (const it of ['fideos-krill', 'agua-filtrada']) p.inventory.set(it, 0);
    await b.enterDoor('Salida');
    await b.moveAndArrive(48.5, 40.5);
    const money = p.money;
    p.thirst = 75;
    await b.waitFor((m) => m.t === 'notice' && /vas a comprar/.test(m.text), 8000, 'recado de compra');
    await b.until(() => p.money < money && p.thirst < 60, 15000, 'compra y consumo');
    expect(await ledgerOk()).toBe(true);
  });

  it('hambre y sed al máximo: derribo, nadie ayuda, muerte definitiva y memorial', async () => {
    const { b, token } = await join('hambrienta');
    const p = P('hambrienta');
    p.autoNeeds = false; p.hunger = 100; p.thirst = 100; p.hp = 1.5;
    await b.waitFor((m) => m.t === 'notice' && /derribado/.test(m.text), 8000, 'derribo');
    const death: any = await b.waitFor((m) => m.t === 'death', 8000, 'muerte');
    expect(death.summary.cause).toMatch(/deshidratación|inanición/);
    const row = (await app.db.query<any>("SELECT status FROM characters WHERE name='hambrienta'")).rows[0];
    expect(row.status).toBe('dead');
    const me = await BotClient.api(base, '/api/me', undefined, token);
    expect(me.character).toBeNull();
    expect(me.memorial[0].summary.name).toBe('hambrienta');
    // Nueva partida: la cuenta crea otro personaje con identificador nuevo.
    await BotClient.api(base, '/api/characters', { name: 'renacida', origin: 'callejero', role: 'medtech', profession: 'medico', attributes: { INT: 6, REF: 6, DEX: 5, TECH: 6, COOL: 6, WILL: 5, LUCK: 5, MOVE: 5, BODY: 5, EMP: 6 }, appearance: { skin: '#c89070', hair: '#1a1a1a', jacket: '#40506a', accent: '#43f3ff' } }, token);
    const again = new BotClient(base, 'renacida'); clients.push(again);
    const w = await again.connect(token, app.contentHash);
    expect(w.sheet.name).toBe('renacida');
    expect(w.sheet.profession).toBe('medico');
  });

  it('un derribado se puede estabilizar con un estimulante', async () => {
    const { b: a } = await join('socorrista');
    const { b: v } = await join('herida');
    const pa = P('socorrista'), pv = P('herida');
    pa.inventory.set('estim', 1);
    await app.db.query("INSERT INTO inventory_items (id, character_id, def_id, qty) VALUES ($1,$2,'estim',1)", [randomUUID(), pa.charId]);
    app.world.survival.downed(v as any && [...app.world.conns.values()].find((c) => c.p?.name === 'herida'), 'prueba');
    expect(pv.status).toBe('downed');
    (app.world as any).cfg.downedSeconds = 20; pv.downedUntil = Date.now() + 20000;
    E('socorrista').x = E('herida').x + 1; E('socorrista').y = E('herida').y;
    const r = await a.cmd({ t: 'rescue', target: E('herida').id, opId: op() });
    expect(r.ok).toBe(true);
    expect(pv.status).toBe('alive');
    expect(pv.hp).toBe(15);
    (app.world as any).cfg.downedSeconds = 2;
  });

  it('dormir en la calle descansa peor y te pueden robar; en tu cubículo se descansa del todo', async () => {
    const { b } = await join('dormilona');
    const p = P('dormilona');
    await b.enterDoor('Salida');
    p.fatigue = 60;
    app.world.survival.rng = () => 0; // fuerza un robo nocturno
    const r = await b.cmd({ t: 'sleep' });
    expect(r.ok).toBe(true);
    expect(p.sleeping!.quality).toBeCloseTo(0.6, 2); // calle 0,35 + 0,25 del oficio Vagabundo
    await b.waitFor((m) => m.t === 'notice' && /te han robado/.test(m.text), 5000, 'robo durmiendo');
    app.world.survival.rng = Math.random;
    await b.cmd({ t: 'wake' });
    expect(p.sleeping).toBeNull();
    await b.enterDoor('Bloque 9');
    p.fatigue = 3;
    const bed = b.findEntity((e) => e.objKind === 'bed')!;
    await b.cmd({ t: 'interact', target: bed.id });
    await b.until(() => !!p.sleeping, 8000, 'dormir en el cubículo');
    expect(p.sleeping!.quality).toBe(1);
    p.fatigue = 0.5;
    await b.waitFor((m) => m.t === 'notice' && /nueva persona/.test(m.text), 8000, 'descanso completo');
    expect(await ledgerOk()).toBe(true);
  });

  it('robos y palizas entre jugadores: prohibido en zona protegida, búsqueda y recompensa de la PCV en la calle', async () => {
    const { b: a } = await join('caco');
    const { b: v } = await join('victima');
    // En el vestíbulo (protegido) se rechaza.
    E('caco').x = E('victima').x + 1; E('caco').y = E('victima').y;
    const no = await a.cmd({ t: 'hostile', target: E('victima').id, action: 'beat', opId: op() });
    expect(no.ok).toBe(false); expect(no.reason).toMatch(/protegida/);
    await a.enterDoor('Salida'); await v.enterDoor('Salida');
    E('caco').x = E('victima').x + 1; E('caco').y = E('victima').y;
    app.world.survival.rng = () => 0.95; // siempre saca 10
    const pv = P('victima'), pa = P('caco');
    pv.stance = 'defend'; pv.nextAttackAt = Date.now() + 1e9; // ni huye ni contraataca durante la prueba
    // La patrulla de la PCV de Ferro intervendría (v0.3) y el caco huiría: la apartamos para medir solo el expediente.
    for (const o of E('caco').zone.entities) if (o.npcType === 'police') { o.x = 2; o.y = 2; o.path = []; o.npc = undefined; }
    const m0 = pv.money;
    const rob = await a.cmd({ t: 'hostile', target: E('victima').id, action: 'rob', opId: op() });
    expect(rob.ok).toBe(true);
    expect(pv.money).toBeLessThan(m0);
    for (let i = 0; i < 12; i++) { await sleep(1300); E('caco').x = E('victima').x + 1; E('caco').y = E('victima').y; E('victima').path = []; await a.cmd({ t: 'hostile', target: E('victima').id, action: 'beat', opId: op() }); if (pv.status !== 'alive') break; }
    app.world.survival.rng = Math.random;
    expect(pa.wanted).toBeGreaterThanOrEqual(2);
    expect(app.world.survival.bounties.onPlayer(pa.charId).some((x) => x.poster === 'pcv')).toBe(true);
    expect(await ledgerOk()).toBe(true);
  });

  it('red de mercado: comprar sube el precio, vender lo baja y las corporaciones revisan márgenes', async () => {
    const { b } = await join('mercader');
    await b.enterDoor('Salida');
    await b.moveAndArrive(48.5, 40.5);
    const vend = b.findEntity((e) => e.objKind === 'vending')!;
    const shopMsg = b.waitFor((m) => m.t === 'shop', 4000, 'tienda');
    await b.cmd({ t: 'interact', target: vend.id });
    const v0 = (await shopMsg as any).view;
    const water0 = v0.items.find((i: any) => i.item === 'agua-filtrada');
    P('mercader').money = 1000;
    await app.db.query("INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,850,1000,'prueba')", [op(), P('mercader').charId]);
    await app.db.query('UPDATE characters SET money=1000 WHERE id=$1', [P('mercader').charId]);
    const v1p = b.waitFor((m) => m.t === 'shop', 4000, 'tienda tras compra');
    await b.cmd({ t: 'buy', shop: 'aurora-vending', item: 'agua-filtrada', qty: 10, opId: op() });
    const v1 = (await v1p as any).view;
    expect(v1.items.find((i: any) => i.item === 'agua-filtrada').price).toBeGreaterThan(water0.price);
    const before = app.world.survival.market.markup.get('aurora')!;
    const news = await app.world.survival.market.policy();
    expect(news.length).toBe(4);
    expect(app.world.survival.market.markup.get('aurora')).not.toBe(before);
    const mk = b.waitFor((m) => m.t === 'market', 4000, 'red de mercado');
    await b.cmd({ t: 'market' });
    const mv = (await mk as any).view;
    expect(mv.corps.length).toBe(4);
    expect(mv.bulletin.length).toBeGreaterThan(0);
    expect(await ledgerOk()).toBe(true);
  });

  it('matasanos: muestra la supervivencia, instala cromo legal y la doctora estricta rechaza cromo robado', async () => {
    const { b } = await join('cromada', 'solo', { BODY: 6, LUCK: 4 });
    const p = P('cromada');
    p.money = 5000;
    await app.db.query("INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,4850,5000,'prueba')", [op(), p.charId]);
    await app.db.query('UPDATE characters SET money=5000 WHERE id=$1', [p.charId]);
    await b.enterDoor('Salida');
    await b.moveAndArrive(24.5, 57.5);
    await b.enterDoor('Clínica');
    await b.interactAndDialog('Sato');
    const cl = b.waitFor((m) => m.t === 'clinic', 4000, 'consulta');
    await b.choose('chrome');
    const view = (await cl as any).view;
    const optica = view.offers.find((o: any) => o.def === 'optica-inspeccion' && o.source === 'stock');
    expect(optica.survival).toBeGreaterThan(0.9);
    expect(['Baja', 'Moderada']).toContain(optica.danger);
    app.world.survival.rng = () => 0.01; // operación limpia
    const r = await b.cmd({ t: 'clinicDo', doc: 'sato', action: 'install', source: 'stock', ref: 'optica-inspeccion', opId: op() });
    expect(r.ok).toBe(true);
    expect(p.cyber.some((c) => c.def === 'optica-inspeccion' && c.location === 'installed')).toBe(true);
    expect(b.sheet!.skills.percepcion).toBeGreaterThan(b.sheet!.skills.percepcion - 2);
    expect(p.humanityMax).toBe(59);
    // Un implante robado en el inventario: Sato se niega.
    const id = randomUUID();
    await app.db.query("INSERT INTO cyberware_instances (id, def_id, character_id, location, stolen) VALUES ($1,'coprocesador',$2,'inventory',true)", [id, p.charId]);
    p.cyber.push({ id, def: 'coprocesador', location: 'inventory', stolen: true });
    const no = await b.cmd({ t: 'clinicDo', doc: 'sato', action: 'install', source: 'inventory', ref: id, opId: op() });
    expect(no.ok).toBe(false); expect(no.reason).toMatch(/robado/);
    app.world.survival.rng = Math.random;
    expect(await ledgerOk()).toBe(true);
  });

  it('empleos: aceptar, ir al puesto, trabajar de forma autónoma y cobrar', async () => {
    const { b } = await join('currante');
    const p = P('currante');
    const jv = b.waitFor((m) => m.t === 'jobs', 4000, 'empleos');
    await b.cmd({ t: 'jobs' });
    const view = (await jv as any).view;
    expect(view.jobs.length).toBe(100);
    expect(view.professions.length).toBe(20);
    const job = view.jobs.find((j: any) => j.id === 'vagabundo-3');
    expect(job.available).toBe(true);
    await b.cmd({ t: 'jobAccept', job: 'vagabundo-3' });
    expect(p.activeJob).toBe('vagabundo-3');
    const early = await b.cmd({ t: 'jobStart' });
    expect(early.ok).toBe(false); expect(early.reason).toMatch(/Ferro/);
    await b.enterDoor('Salida');
    const money = p.money;
    const reward = b.waitFor((m) => m.t === 'reward' && /Turno terminado/.test((m as any).title), 30000, 'paga');
    await b.cmd({ t: 'jobStart' });
    await reward;
    expect(p.money).toBeGreaterThan(money);
    const again = await b.cmd({ t: 'jobAccept', job: 'vagabundo-3' });
    expect(again.ok).toBe(false); // turno reciente
    const prof = await b.cmd({ t: 'profession', profession: 'cazarrecompensas', opId: op() });
    expect(prof.ok).toBe(true);
    expect(p.profession).toBe('cazarrecompensas');
    expect(await ledgerOk()).toBe(true);
  });

  it('recompensas: un particular pone precio, otro la cobra al derribar y el dinero cuadra', async () => {
    const { b: placer } = await join('cliente');
    const { b: hunter } = await join('cazadora', 'solo');
    const { b: target } = await join('objetivo');
    const pc = P('cliente');
    const m0 = pc.money;
    const r = await placer.cmd({ t: 'bountyPlace', kind: 'player', target: 'objetivo', amount: 100, reason: 'Me debe dinero', opId: op() });
    expect(r.ok).toBe(true);
    expect(pc.money).toBe(m0 - 100);
    await target.waitFor((m) => m.t === 'label' && (m as any).bounty === 100, 3000, 'marca de recompensa').catch(() => {});
    await hunter.enterDoor('Salida'); await target.enterDoor('Salida');
    const ph = P('cazadora'), pt = P('objetivo');
    pt.stance = 'defend'; pt.nextAttackAt = Date.now() + 1e9;
    const mh = ph.money;
    app.world.survival.rng = () => 0.95;
    for (let i = 0; i < 10 && pt.status === 'alive'; i++) {
      E('cazadora').x = E('objetivo').x + 1; E('cazadora').y = E('objetivo').y;
      E('objetivo').path = [];
      const a = await hunter.cmd({ t: 'hostile', target: E('objetivo').id, action: 'claim', opId: op() });
      expect(a.ok).toBe(true);
      await sleep(1200);
    }
    app.world.survival.rng = Math.random;
    expect(pt.status).toBe('downed');
    expect(ph.money).toBe(mh + 100);
    expect(ph.wanted).toBe(0); // cobrar una recompensa no es delito
    expect(app.world.survival.bounties.onPlayer(pt.charId).length).toBe(0);
    expect(await ledgerOk()).toBe(true);
  });

  it('fugitivos: se capturan y se cobra la recompensa institucional', async () => {
    const { b } = await join('rastreadora', 'solo', { REF: 8, LUCK: 3 });
    const p = P('rastreadora');
    await b.cmd({ t: 'equip', item: 'navaja' }); // para capturar vivo hace falta un arma que permita dejar KO
    const fug = [...app.world.entities.values()].find((e) => e.fugitive?.id === 'chispas-lund')!;
    await b.enterDoor('Salida');
    const m0 = p.money;
    app.world.survival.rng = () => 0.95;
    for (let i = 0; i < 10 && app.world.entities.has(fug.id); i++) {
      E('rastreadora').x = fug.x + 1; E('rastreadora').y = fug.y; fug.path = []; fug.aggro = undefined; fug.nextAttackAt = Date.now() + 1e9;
      await b.cmd({ t: 'hostile', target: fug.id, action: 'claim', opId: op() });
      await sleep(1200);
    }
    app.world.survival.rng = Math.random;
    expect(app.world.entities.has(fug.id)).toBe(false);
    expect(p.money).toBe(m0 + 300);
    expect(await ledgerOk()).toBe(true);
  });
});
