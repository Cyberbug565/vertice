// v0.38 · Inicios nuevos, préstamo de los Kuro, ciberware equilibrado e Interfaz (escáner, expediente y ofertas).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { bioExtraPoints, HARD_SKILLS, LOAN, SCAN_TIERS, scanTier, skillPointCost, skillXpFor, type ServerMsg } from '@vertice/shared';
import { readFileSync } from 'node:fs';
import { createApp } from '../src/app.js';
import { loadPlayer, skillLevel } from '../src/game/player.js';
import { playedMs } from '../src/game/records.js';
import { BotClient } from '../../tools/loadtest/src/botclient.js';

let app: Awaited<ReturnType<typeof createApp>>;
let base = '';
const bots: BotClient[] = [];
beforeAll(async () => {
  app = await createApp({ port: 0, host: '127.0.0.1', databaseUrl: undefined, pgliteDir: 'memory://', ambientNpcs: 0, crowdNpcs: 0, threats: false, logLevel: 'warn', lingerSeconds: 0, cityHourMs: 60_000 });
  base = `http://127.0.0.1:${app.port}`;
});
afterAll(async () => { for (const b of bots) b.close(); await app?.close(); });

async function create(name: string, body: Record<string, unknown> = {}) {
  const token = (await BotClient.api(base, '/api/register', { username: name, password: 'password1' })).token;
  const attributes = { INT: 6, REF: 6, DEX: 5, TECH: 6, COOL: 6, WILL: 5, LUCK: 5, MOVE: 5, BODY: 5, EMP: 6 };
  await BotClient.api(base, '/api/characters', { name, origin: 'callejero', role: 'solo', attributes, appearance: { skin: '#c89070', hair: '#1a1a1a', jacket: '#40506a', accent: '#43f3ff' }, ...body }, token);
  return token;
}
async function join(name: string, body: Record<string, unknown> = {}) {
  const token = await create(name, body);
  const bot = new BotClient(base, name); bots.push(bot);
  await bot.connect(token, app.contentHash);
  const conn = [...app.world.conns.values()].find((c) => c.p?.name === name)!;
  return { bot, conn, p: conn.p!, e: conn.e! };
}
const ledgerOk = async (charId: string, money: number) => {
  const r = await app.db.query<any>('SELECT coalesce(sum(delta),0) AS n FROM ledger WHERE character_id=$1', [charId]);
  expect(Number(r.rows[0].n)).toBe(money);
};

describe('v0.38 · inicios', () => {
  it('hay al menos 10 inicios, cada uno con ventaja, dificultad y un sitio de salida transitable', () => {
    const c = app.world.c;
    expect(c.origins.length).toBeGreaterThanOrEqual(10);
    for (const o of c.origins) {
      expect(o.ventaja.length, o.id).toBeGreaterThan(10);
      expect(['facil', 'normal', 'dificil']).toContain(o.dificultad);
      if (o.start) expect(app.world.zones.get(o.start.zone), o.id).toBeTruthy();
      for (const [it] of o.items) expect(c.items.some((i) => i.id === it), `${o.id}: ${it}`).toBe(true);
    }
  });

  it('el expolicía empieza en su bar con su táser, sus habilidades y mala fama entre las bandas', async () => {
    const { p, e } = await join('Expoli38', { origin: 'expolicia' });
    const o = app.world.c.origins.find((x) => x.id === 'expolicia')!;
    expect(e.zone.id).toBe(o.start!.zone);
    expect(p.inventory.get('taser')).toBeGreaterThan(0);
    for (const [f, v] of Object.entries(o.rep)) expect(p.rep.get(f)).toBe(v);
    for (const [s, v] of Object.entries(o.skills)) expect(skillLevel(p, s)).toBeGreaterThanOrEqual(1 + v);
  });
});

describe('v0.38 · préstamo de los Kuro', () => {
  it('da 5 puntos de habilidad extra a cambio de 15.000 €$', () => {
    expect(bioExtraPoints({ event: 'deuda' })).toBe(5);
    expect(bioExtraPoints({ event: 'deuda', objective: 'maestria' })).toBe(7);
    expect(LOAN.principal).toBe(15000);
  });

  it('cobra la cuota sola, apunta las impagadas y con dos manda mercenarios; pagar los retira', async () => {
    const { bot, conn, p } = await join('Deudor38', { bio: { objective: 'rico', childhood: 'calle', event: 'deuda' } });
    expect(p.bio?.loan).toMatchObject({ owed: LOAN.principal, missed: 0 });
    const w = app.world, day = 24 * w.c.manifest.cityHourMs;
    // Vence una cuota sin dinero encima: impagada y recargo.
    p.money = 0; await app.db.query('UPDATE characters SET money=0 WHERE id=$1', [p.charId]);
    await app.db.query('DELETE FROM ledger WHERE character_id=$1', [p.charId]);
    p.bio!.loan!.due = playedMs(p) - 1;
    await w.debts.everySecond();
    expect(p.bio!.loan).toMatchObject({ missed: 1, owed: LOAN.principal + LOAN.penalty });
    p.bio!.loan!.due = playedMs(p) - 1;
    await w.debts.everySecond();
    expect(p.bio!.loan!.missed).toBe(2);
    // En la calle, fuera de zona verde, los Kuro mandan un equipo (forzamos el azar).
    const city = w.zones.get('vertice')!;
    let spot: [number, number] | null = null;
    for (let y = 2; y < city.grid.h - 2 && !spot; y += 3) for (let x = 2; x < city.grid.w - 2; x += 3) if (city.grid.danger[y * city.grid.w + x] >= 2 && city.grid.walk[y * city.grid.w + x]) { spot = [x, y]; break; }
    expect(spot).toBeTruthy();
    await w.teleport(conn, 'vertice', spot!);
    (w.debts as any).rng = () => 0;
    await w.debts.everySecond();
    const mercs = [...w.entities.values()].filter((m) => m.faction === 'kuro' && m.aggro === conn.e!.id);
    expect(mercs.length).toBeGreaterThan(0);
    expect(mercs.every((m) => m.aggroLethal && (m.level ?? 0) >= 10)).toBe(true);
    // Paga dos cuotas: baja de dos impagadas y los mercenarios se retiran. El dinero cuadra con el libro.
    p.money = 5000;
    await app.db.query("INSERT INTO ledger (op_id,character_id,delta,balance_after,reason) VALUES ('t38-ingreso',$1,5000,5000,'Prueba')", [p.charId]);
    await app.db.query('UPDATE characters SET money=5000 WHERE id=$1', [p.charId]);
    expect((await bot.cmd({ t: 'loan', amount: LOAN.daily * 2, opId: randomUUID() })).ok).toBe(true);
    expect(p.bio!.loan!.missed).toBe(0);
    expect(mercs.every((m) => !w.entities.has(m.id))).toBe(true);
    expect(p.money).toBe(5000 - LOAN.daily * 2);
    await ledgerOk(p.charId, p.money);
    // Con dinero encima, la siguiente cuota se cobra sola.
    p.bio!.loan!.due = playedMs(p) - 1;
    await w.debts.everySecond();
    expect(p.money).toBe(5000 - LOAN.daily * 3);
    expect(p.bio!.loan!.due).toBeGreaterThan(playedMs(p) + day * 0.9);
    await ledgerOk(p.charId, p.money);
  });
});

describe('v0.38 · ciberware equilibrado', () => {
  const all = () => app.world.c.cyberware;
  it('los míticos únicos siguen rotos: muy por encima de cualquier legendario', () => {
    const score = (e: any) => 3 * Object.values(e.attrs ?? {}).reduce((a: number, b: any) => a + b, 0) + Object.values(e.skills ?? {}).reduce((a: number, b: any) => a + b, 0) + 0.12 * (e.hpMax ?? 0) + 0.25 * (e.ram ?? 0) + 30 * (e.speed ?? 0) + 30 * (e.dodge ?? 0) + 25 * (e.crit ?? 0);
    const myth = all().filter((d) => d.rarity === 'mitico' && d.effects);
    const best = Math.max(...all().filter((d) => d.rarity === 'legendario').map((d) => score(d.effects)));
    const k6 = all().find((d) => d.id === 'kairos-6')!;
    expect(score(k6.effects)).toBeGreaterThan(best * 1.5);
    expect(myth.length).toBeGreaterThan(0);
  });
  it('cada rareza tiene su franja de precio, sin implantes idénticos', () => {
    const order = ['comun', 'poco-comun', 'raro', 'epico', 'legendario'];
    const med = (r: string) => { const v = all().filter((d) => d.rarity === r).map((d) => d.price).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
    for (let i = 1; i < order.length; i++) expect(med(order[i]), order[i]).toBeGreaterThan(med(order[i - 1]));
    const sigs = new Map<string, string>();
    for (const d of all().filter((x) => x.rarity !== 'mitico' && !x.ability && !x.unique && !x.passive && !x.id.startsWith('penal-'))) {
      const sig = `${d.slot}|${JSON.stringify(d.effects)}`;
      expect(sigs.get(sig), `${d.id} = ${sigs.get(sig)}`).toBeUndefined();
      sigs.set(sig, d.id);
    }
    expect(readFileSync(new URL('../../docs/EQUILIBRIO_CIBERWARE.md', import.meta.url), 'utf8')).toMatch(/Equilibrio del ciberware/);
  });
});

describe('v0.38 · Interfaz', () => {
  it('es difícil de subir: la experiencia cunde menos y desde el 6 cada punto cuesta dos', async () => {
    expect(HARD_SKILLS.interfaz.xp).toBeLessThan(0.6);
    expect(skillPointCost('interfaz', 5)).toBe(1);
    expect(skillPointCost('interfaz', 6)).toBe(2);
    expect(skillPointCost('armas', 15)).toBe(1);
    const { p } = await join('Hacker38');
    const w = app.world;
    const before = p.skillXp.interfaz ?? 0, beforeArmas = p.skillXp.armas ?? 0;
    for (let i = 0; i < 40; i++) { w.progress.gain(p, 'interfaz', 10); w.progress.gain(p, 'armas', 10); }
    const gi = (p.skillXp.interfaz ?? 0) - before, ga = (p.skillXp.armas ?? 0) - beforeArmas;
    expect(gi).toBeLessThan(ga * 0.6);
    expect(gi).toBeGreaterThan(ga * 0.3);
  });

  it('el escáner enseña más capas cuanta más Interfaz, y el servidor solo manda lo que toca', async () => {
    const a = await join('Mirona38'), b = await join('Mirado38');
    const w = app.world;
    await w.teleport(b.conn, a.e.zone.id, [Math.floor(a.e.x) + 1, Math.floor(a.e.y)]);
    b.p.money = 12345;
    await app.db.query("INSERT INTO public_records (id, character_id, crime, district) VALUES (gen_random_uuid(), $1, 'Robo', 'Arrabal')", [b.p.charId]).catch(async () => app.db.query("INSERT INTO public_records (id, character_id, crime, district) VALUES ('r38', $1, 'Robo', 'Arrabal')", [b.p.charId]));
    const look = async (lv: number) => {
      a.p.skillXp.interfaz = skillXpFor(lv);
      const got = a.bot.waitFor<Extract<ServerMsg, { t: 'lookInfo' }>>((m) => m.t === 'lookInfo' && m.info.id === b.e.id);
      (w.scanner as any).lastScan = new WeakMap();
      await w.scanner.scan(a.conn, b.e.id);
      return (await got).info;
    };
    const t0 = await look(1);
    expect(t0.tier).toBe(0); expect(t0.kind).toBeUndefined(); expect(t0.level).toBeUndefined();
    const t1 = await look(3);
    expect(t1.kind).toBe('jugador'); expect(t1.levelApprox).toBeTruthy(); expect(t1.level).toBeUndefined();
    const t2 = await look(6);
    expect(t2.level).toBe(b.p.level); expect(t2.attitude).toBeTruthy(); expect(t2.bounty).toBeUndefined();
    const t3 = await look(10);
    expect(t3.record?.[0]).toMatch(/Robo/); expect(t3.money).toBeUndefined();
    const t4 = await look(15);
    expect(t4.money).toBeTruthy(); expect(t4.skills?.length).toBe(3); expect(t4.humanity).toBeUndefined();
    const t5 = await look(20);
    expect(t5.tier).toBe(SCAN_TIERS.length - 1); expect(t5.humanity).toMatch(/\//);
    expect(scanTier(25)).toBe(5);
  });

  it('expediente: lo que sabe la PCV según tu Interfaz, y con acceso raíz se borra la descripción', async () => {
    const { bot, conn, p } = await join('Fichado38');
    const w = app.world;
    p.wanted = 2.5;
    await w.survival.bounties.post('player', { charId: p.charId, name: p.name }, 700, 'pcv', 'Orden de búsqueda: prueba');
    w.stealth.st(conn).description = { outfit: w.stealth.outfit(p), until: Date.now() + 5 * 60_000, crime: 'robo' };
    const view = async (lv: number) => { p.skillXp.interfaz = skillXpFor(lv); return w.scanner.dossier(conn); };
    const d0 = await view(1);
    expect(d0.wanted).toBe(true); expect(d0.wantedLevel).toBeUndefined(); expect(d0.bounty).toBeUndefined();
    const d1 = await view(3);
    expect(d1.wantedLevel).toBe(2); expect(d1.bountyApprox).toBeTruthy(); expect(d1.bounty).toBeUndefined();
    const d2 = await view(6);
    expect(d2.bounty).toBe(700); expect(d2.description).toMatchObject({ crime: 'robo', matches: true }); expect(d2.decayMin).toBeGreaterThan(0);
    const d3 = await view(10);
    expect(d3.bountyBy?.[0]).toMatch(/PCV/);
    const d5 = await view(20);
    expect(d5.canWipe).toBe(true);
    expect((await bot.cmd({ t: 'dossier', action: 'wipe' })).ok).toBe(true);
    expect(w.stealth.st(conn).description).toBeUndefined();
    expect((await bot.cmd({ t: 'dossier', action: 'wipe' })).ok).toBe(false); // una vez por hora
  });

  it('desde Interfaz 8 llegan ofertas de bandas y corporaciones; firmar paga, sube la reputación y deja sueldo', async () => {
    const { bot, conn, p } = await join('Contratada38');
    const w = app.world;
    p.skillXp.interfaz = skillXpFor(7);
    (w.scanner as any).rng = () => 0;
    await w.scanner.everyMinute();
    expect((await w.scanner.dossier(conn)).offers.length).toBe(0); // con 7, nada
    p.skillXp.interfaz = skillXpFor(14);
    await w.scanner.everyMinute();
    const offer = (await w.scanner.dossier(conn)).offers[0];
    expect(offer).toBeTruthy();
    const low = w.scanner.makeOffer(p, 8)!, high = w.scanner.makeOffer(p, 20)!;
    expect(high.bonus).toBeGreaterThan(low.bonus * 3);
    const m0 = p.money, rep0 = p.rep.get(offer.faction) ?? 0;
    await app.db.query("INSERT INTO ledger (op_id,character_id,delta,balance_after,reason) VALUES ('t38-base',$1,$2,$2,'Prueba')", [p.charId, 0]);
    expect((await bot.cmd({ t: 'dossier', action: 'accept', offer: offer.id })).ok).toBe(true);
    expect(p.money).toBe(m0 + offer.bonus);
    expect(p.rep.get(offer.faction)).toBe(rep0 + 12);
    const k = (await w.scanner.dossier(conn)).retainer!;
    expect(k).toMatchObject({ daily: offer.daily, left: offer.days });
    // Un día de juego después, cobra el sueldo.
    (p.flags.get('red:contrato')!.value as any).due = playedMs(p) - 1;
    await w.scanner.everyMinute();
    expect(p.money).toBe(m0 + offer.bonus + offer.daily);
    const reloaded = await loadPlayer(app.db, p.charId);
    expect((reloaded!.flags.get('red:contrato')!.value as any).left).toBe(offer.days - 1);
  });
});
