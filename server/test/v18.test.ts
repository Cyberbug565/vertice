// v0.18 · «Cada tiro cuenta»: heridas por tipo (bala, cortes, amputación), hemorragia por herida, tratamientos
// (venda, sutura, pinzas, desinfectante, antibióticos), infección, curación con el tiempo de juego, salud que no
// vuelve sola (solo durmiendo y sin heridas), estimulantes con salud temporal y la Tormenta en la mochila del admin.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { treatmentsFor, WOUND_INFO, type Wound } from '@vertice/shared';
import { createApp } from '../src/app.js';
import { BotClient } from '../../tools/loadtest/src/botclient.js';

const DB = process.env.TEST_DATABASE_URL;
let app: Awaited<ReturnType<typeof createApp>>;
let base = '';
const clients: BotClient[] = [];
let n = 0;
const op = () => `op-v18-${Date.now()}-${n++}`;

beforeAll(async () => {
  if (DB) { const c = new pg.Client({ connectionString: DB }); await c.connect(); await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); await c.end(); }
  app = await createApp({ port: 0, host: '127.0.0.1', databaseUrl: DB, pgliteDir: 'memory://', ambientNpcs: 0, crowdNpcs: 0, lingerSeconds: 1, logLevel: 'warn', threats: false });
  base = `http://127.0.0.1:${app.port}`;
});
afterAll(async () => { for (const c of clients) c.close(); await app?.close(); });

async function join(name: string) {
  const token = await BotClient.registerAndCreate(base, name, 'solo', 'callejero', {});
  const b = new BotClient(base, name); clients.push(b);
  await b.connect(token, app.contentHash);
  return b;
}
const conn = (name: string) => [...app.world.conns.values()].find((c) => c.p?.name === name)!;
const weapon = (id: string) => ({ id, w: app.world.c.items.find((i) => i.id === id)!.weapon! });
const fresh = () => ({ wounds: {}, lost: [], bleed: 0, list: [] as Wound[], seq: 0 });

describe('v0.18 · cada tiro cuenta', () => {
  it('un disparo deja una herida de bala con la bala dentro: sangra, no cura sin pinzas y sin vendar se infecta', async () => {
    await join('balazo');
    const c = conn('balazo'), p = c.p!, e = c.e!;
    const W = app.world.combat.wounds;
    p.body = fresh(); p.hp = 100;
    app.world.combat.rng = () => 0.99;
    const r = W.hit(e, p, 'brazo_der', 14, weapon('pistola-ligera'), true);
    app.world.combat.rng = Math.random;
    expect(r.wound).toBe('bala');
    const w = p.body.list![0];
    expect(w.kind).toBe('bala'); expect(w.bullet).toBe(true);
    W.tick0(p.body);
    expect(p.body.bleed).toBeGreaterThan(0.1);
    expect(treatmentsFor(w)).toContain('sacar-bala');
    // Dos días sin tratar: nada de curación y la herida se infecta.
    W.hourly(p, 48, false);
    expect(w.heal).toBe(0);
    expect(w.infection).toBeGreaterThanOrEqual(0.5);
    // Pinzas (con buen pulso), antibióticos y venda: deja de sangrar y empieza a curar.
    (W as any).rng = () => 0;
    expect(W.treat(p, w.id, 'sacar-bala').ok).toBe(true);
    expect(w.bullet).toBe(false);
    W.antibiotics(p); W.antibiotics(p);
    expect(w.infection).toBeLessThan(0.5);
    W.treat(p, w.id, 'vendar');
    W.tick0(p.body);
    expect(p.body.bleed).toBe(0);
    // Una semana de juego cambiando la venda cuando se ensucia: se cura.
    let hours = 0;
    while (p.body.list!.some((x) => x.id === w.id) && hours < 260) {
      W.hourly(p, 1, false); hours++;
      if (treatmentsFor(w).includes('cambiar-venda')) W.treat(p, w.id, 'cambiar-venda');
    }
    expect(p.body.list!.some((x) => x.id === w.id)).toBe(false);
    expect(hours).toBeGreaterThanOrEqual(WOUND_INFO.bala.hours * 0.9);
  });

  it('armas de filo: rasguño, corte o corte profundo según el golpe; el profundo no cierra sin sutura', async () => {
    const p = conn('balazo').p!, e = conn('balazo').e!;
    const W = app.world.combat.wounds;
    p.body = fresh();
    app.world.combat.rng = () => 0.99;
    W.hit(e, p, 'torso', 4, weapon('navaja'), true);
    W.hit(e, p, 'brazo_izq', 14, weapon('navaja'), true);
    W.hit(e, p, 'pierna_der', 30, weapon('katana-termica'), true);
    app.world.combat.rng = Math.random;
    const kinds = p.body.list!.map((x) => x.kind);
    expect(kinds).toEqual(['rasguno', 'corte', 'corte-profundo']);
    // Cada una sangra distinto: el profundo, mucho más.
    const [ras, cor, pro] = p.body.list!;
    expect(pro.bleed).toBeGreaterThan(cor.bleed);
    expect(cor.bleed).toBeGreaterThan(ras.bleed);
    // El profundo vendado sigue sangrando algo y no cura hasta suturarlo.
    W.treat(p, pro.id, 'vendar');
    W.hourly(p, 24, false);
    expect(pro.heal).toBe(0);
    (W as any).rng = () => 0;
    expect(W.treat(p, pro.id, 'suturar').ok).toBe(true);
    W.treat(p, pro.id, 'desinfectar');
    W.hourly(p, 12, false);
    expect(pro.heal).toBeGreaterThan(0);
    // Un corte profundo tarda unas dos semanas de juego.
    expect(WOUND_INFO['corte-profundo'].hours).toBe(336);
    expect(WOUND_INFO.rasguno.hours).toBe(24);
  });

  it('la amputación sangra mucho, no cura nunca y bloquea la salud hasta implantar el miembro', async () => {
    const c = conn('balazo'), p = c.p!, e = c.e!;
    const W = app.world.combat.wounds;
    p.body = fresh();
    p.body.wounds.brazo_izq = 40;
    app.world.combat.rng = () => 0;
    const r = W.hit(e, p, 'brazo_izq', 30, weapon('katana-termica'), true);
    app.world.combat.rng = Math.random;
    expect(r.severed).toBe('brazo_izq');
    const amp = p.body.list!.find((x) => x.kind === 'amputacion')!;
    expect(amp.bleed).toBeGreaterThan(0.5);
    W.treat(p, amp.id, 'vendar');
    W.hourly(p, 24 * 30, false);
    expect(p.body.list!.some((x) => x.kind === 'amputacion')).toBe(true);
    expect(W.restore(p, 'brazo', 'brazo_izq')).toBe(true);
    expect(p.body.list!.some((x) => x.kind === 'amputacion')).toBe(false);
  });

  it('la salud no vuelve sola: ni despierto ni durmiendo con heridas; durmiendo y curado, sí', async () => {
    const c = conn('balazo'), p = c.p!, e = c.e!;
    const sv = app.world.survival as any;
    p.body = fresh(); p.hunger = 10; p.thirst = 10; p.fatigue = 50; p.hp = 40; p.lastCombatAt = 0;
    sv.tickPlayer(c, 1);
    expect(p.hp).toBe(40);
    app.world.combat.rng = () => 0.99;
    app.world.combat.wounds.hit(e, p, 'torso', 10, weapon('pistola-ligera'), true);
    app.world.combat.rng = Math.random;
    p.body.list![0].bleed = 0; app.world.combat.wounds.tick0(p.body);
    p.hp = 40;
    p.sleeping = { quality: 1, where: 'test', since: Date.now() } as any;
    sv.tickPlayer(c, 1);
    expect(p.hp).toBeLessThanOrEqual(40);
    p.body = fresh();
    sv.tickPlayer(c, 1);
    expect(p.hp).toBeGreaterThan(40);
    p.sleeping = null as any;
  });

  it('el estimulante no cura heridas: da salud temporal que se va al pasar el efecto', async () => {
    const c = conn('balazo'), p = c.p!;
    const sv = app.world.survival as any;
    p.body = fresh(); p.hp = 30;
    sv.addTempHp(p, 30, 240);
    expect(p.hp).toBe(60);
    p.tempHp!.until = Date.now() - 1;
    sv.tickPlayer(c, 0.001);
    expect(Math.round(p.hp)).toBe(30);
    expect(p.tempHp).toBeUndefined();
  });

  it('tratamientos por la red: vendar gasta una venda; las pinzas no se gastan', async () => {
    const b = clients[0];
    const c = conn('balazo'), p = c.p!, e = c.e!;
    p.body = fresh(); p.hp = 100; p.status = 'alive';
    app.world.combat.rng = () => 0.99;
    app.world.combat.wounds.hit(e, p, 'pierna_izq', 12, weapon('pistola-ligera'), true);
    app.world.combat.rng = Math.random;
    const w = p.body.list![0];
    for (const it of ['venda', 'pinzas']) {
      p.inventory.set(it, 2);
      await app.db.query("INSERT INTO inventory_items (id, character_id, def_id, qty) VALUES (gen_random_uuid(), $1, $2, 2) ON CONFLICT (character_id, def_id) DO UPDATE SET qty = 2", [p.charId, it]);
    }
    (app.world.combat.wounds as any).rng = () => 0;
    expect((await b.cmd({ t: 'treat', wound: w.id, action: 'sacar-bala', opId: op() })).ok).toBe(true);
    expect((await b.cmd({ t: 'treat', wound: w.id, action: 'vendar', opId: op() })).ok).toBe(true);
    expect(p.inventory.get('pinzas')).toBe(2);
    expect(p.inventory.get('venda')).toBe(1);
    expect(w.bullet).toBe(false); expect(w.bandaged).toBe(true);
    const bad = await b.cmd({ t: 'treat', wound: w.id, action: 'suturar', opId: op() });
    expect(bad.ok).toBe(false);
    const sheet = app.world.survival.sheetOf(p);
    expect(sheet.body.list?.[0].kind).toBe('bala');
  });

  it('material médico nuevo a la venta en la farmacia', () => {
    const c = app.world.c;
    for (const id of ['sutura', 'pinzas', 'antiseptico', 'antibioticos']) {
      expect(c.items.some((i) => i.id === id)).toBe(true);
      expect(c.shops.find((s) => s.id === 'farmacia')!.stock[id]).toBeGreaterThan(0);
    }
  });
});
