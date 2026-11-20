import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { createApp } from '../src/app.js';
import { recordActivity } from '../src/game/records.js';
import { BotClient } from '../../tools/loadtest/src/botclient.js';
import type { CharacterRecord } from '@vertice/shared';

const storage = mkdtempSync(join(tmpdir(), 'vertice-cuentas-'));
let app: Awaited<ReturnType<typeof createApp>>, base: string;
const clients: BotClient[] = [];
const input = (name: string) => ({ name, origin: 'callejero', role: 'solo', profession: 'policia', attributes: { INT: 6, REF: 6, DEX: 5, TECH: 6, COOL: 6, WILL: 5, LUCK: 5, MOVE: 5, BODY: 5, EMP: 6 }, appearance: { skin: '#c89070', hair: '#1a1a1a', jacket: '#40506a', accent: '#43f3ff' } });
const api = (path: string, body?: unknown, token = ownerToken) => BotClient.api(base, path, body, token);
let ownerToken = '', otherToken = '', firstId = '', secondId = '', accountId = '';
const record = (id: string): Promise<CharacterRecord> => api(`/api/characters/${id}/record`);
async function boot() {
  app = await createApp({ port: 0, host: '127.0.0.1', databaseUrl: undefined, pgliteDir: storage, ambientNpcs: 0, crowdNpcs: 0, lingerSeconds: 0, threats: false, logLevel: 'warn' });
  base = `http://127.0.0.1:${app.port}`;
}
async function connect(id: string, token = ownerToken) {
  const b = new BotClient(base, id); clients.push(b);
  await b.connect(token, app.contentHash, id); return b;
}
beforeAll(async () => { await boot(); });
afterAll(async () => { for (const b of clients) b.close(); await app?.close(); rmSync(storage, { recursive: true, force: true }); });

describe('cuentas persistentes y expedientes', () => {
  it('salud del servicio comprueba base de datos y versión', async () => {
    const r = await fetch(`${base}/healthz`); expect(r.ok).toBe(true);
    expect(await r.json()).toMatchObject({ ok: true, service: 'vertice', contentVersion: app.contentHash });
  });

  it('una cuenta conserva dos vidas independientes y recuerda la última selección', async () => {
    const owner = await api('/api/register', { username: 'cuenta.persistente', password: 'test-password' }, '');
    ownerToken = owner.token; accountId = owner.accountId;
    otherToken = (await api('/api/register', { username: 'otra.cuenta', password: 'test-password' }, '')).token;
    firstId = (await api('/api/characters', input('Nerea Persistente'))).id;
    secondId = (await api('/api/characters', input('Dario Independiente'))).id;
    const me = await api('/api/me'); expect(me.characters).toHaveLength(2); expect(me.character.id).toBe(secondId);
    await api('/api/characters/select', { id: firstId });
    expect((await api('/api/me')).character.id).toBe(firstId);
  });

  it('rechaza el nombre duplicado sin cambiar el personaje seleccionado', async () => {
    await expect(api('/api/characters', input('Nerea Persistente'))).rejects.toThrow(/nombre/);
    expect((await api('/api/me')).character.id).toBe(firstId);
  });

  it('otra cuenta no puede ver, seleccionar ni conectar personajes ajenos', async () => {
    await expect(api('/api/characters/select', { id: firstId }, otherToken)).rejects.toThrow(/404/);
    await expect(api(`/api/characters/${firstId}/record`, undefined, otherToken)).rejects.toThrow(/404/);
    const invalid = new BotClient(base); clients.push(invalid);
    await expect(invalid.connect(otherToken, app.contentHash, firstId)).rejects.toThrow(/no_character/);
    expect((await api('/api/me', undefined, otherToken)).character).toBe(null);
  });

  it('salir y reconectar de inmediato espera el guardado de posición, ropa y progresión', async () => {
    const b = await connect(firstId);
    const c = app.world.conns.get(accountId)!;
    await app.world.effects.apply(c.p!, [{ money: 125, reason: 'Trabajo de prueba' }, { item: 'venda', qty: 2 }], { opId: randomUUID(), kind: 'test' });
    await b.cmd({ t: 'stance', stance: 'defend' });
    c.p!.wear.torso_ext = ''; c.p!.skillXp.atletismo = 900;
    c.p!.playSessionAt = Date.now() - 65000;
    c.e!.x += 0.2; const x = c.e!.x;
    b.close();
    const reconnect = await connect(firstId);
    expect(reconnect.sheet!.wear.torso_ext).toBe(''); expect(reconnect.sheet!.stance).toBe('defend');
    expect(reconnect.x).toBeCloseTo(x, 2);
    expect((await record(firstId)).secondsPlayed).toBeGreaterThanOrEqual(65);
    expect(reconnect.sheet!.inventory.find((i) => i.def === 'venda')?.qty).toBe(2);
    reconnect.close(); await app.world.waitForAccountSave(accountId);
  });

  it('cambiar de personaje con una sesión abierta retira y guarda la vida anterior', async () => {
    const a = await connect(firstId);
    const b = await connect(secondId);
    expect(b.sheet!.id).toBe(secondId); expect(b.sheet!.wear.torso_ext).toBe('chaqueta');
    await a.until(() => a.closed, 2000);
    expect(app.world.conns.size).toBe(1);
    expect((await record(firstId)).stats.moneyEarned).toBe(125);
    b.close();
  });

  it('los ingresos, turnos y ventas se actualizan con operaciones reales y reintentos idempotentes', async () => {
    const b = await connect(firstId), c = app.world.conns.get(accountId)!;
    const item = app.world.c.items.find((i) => i.substance?.kind === 'drug')!;
    await app.world.effects.apply(c.p!, [{ item: item.id, qty: 3 }], { opId: randomUUID(), kind: 'test' });
    const under = app.world.underworld as any;
    const buyer = app.world.c.underworld.buyers[0];
    under.rng = () => 0.99;
    const op = randomUUID();
    await under.sell(c, buyer, item.id, 2, op);
    await under.sell(c, buyer, item.id, 2, op).catch(() => {});
    const r = await record(firstId);
    expect(r.stats.drugsSold).toBe(2); expect(r.stats.moneyEarned).toBeGreaterThan(125);
    expect(r.drugSales[0].qty).toBe(2); expect(r.profession).toBe(app.world.c.professions.find((p) => p.id === 'policia')!.name);
    b.close();
  });

  it('recuerda cada implante adquirido aunque se venda o cambie de dueño', async () => {
    const def = app.world.c.cyberware[0].id, inst = randomUUID();
    await app.db.query("INSERT INTO cyberware_instances (id, def_id, character_id, location) VALUES ($1,$2,$3,'inventory')", [inst, def, firstId]);
    await app.db.query("UPDATE cyberware_instances SET location='shop', character_id=NULL WHERE id=$1", [inst]);
    expect((await record(firstId)).stats.cyberwareAcquired).toBe(1);
    await app.db.query("UPDATE cyberware_instances SET location='inventory', character_id=$2 WHERE id=$1", [inst, secondId]);
    expect((await record(secondId)).stats.cyberwareAcquired).toBe(1);
    await app.db.query('UPDATE cyberware_instances SET character_id=$2 WHERE id=$1', [inst, firstId]);
    expect((await record(firstId)).stats.cyberwareAcquired).toBe(1);
  });

  it('solo la muerte definitiva de un PNJ cuenta una baja; KO y reintentos no duplican', async () => {
    const b = await connect(firstId), c = app.world.conns.get(accountId)!;
    const e = app.world.addEntity(c.e!.zone, { kind: 'npc', name: 'Victima de prueba', x: c.e!.x + 1, y: c.e!.y, interactive: true, label: '', npcType: 'civil' });
    app.world.combat.knockOut(e, c); expect((await record(firstId)).stats.kills).toBe(0);
    await (app.world.combat as any).npcDeath(e, c); await (app.world.combat as any).npcDeath(e, c);
    const r = await record(firstId); expect(r.stats.kills).toBe(1); expect(r.victims[0].name).toBe('Victima de prueba');
    b.close();
  });

  it('el memorial congela todos los datos y una vida muerta ya no puede seleccionarse', async () => {
    const b = await connect(firstId), c = app.world.conns.get(accountId)!;
    await app.db.query('INSERT INTO job_log (op_id,character_id,job_id,pay,result) VALUES ($1,$2,$3,25,$4)', [randomUUID(), firstId, app.world.c.jobs[0].id, '{}']);
    await app.world.survival.die(c.p!, c.e!, 'prueba de mortalidad');
    const r = await record(firstId); expect(r.status).toBe('dead'); expect(r.stats.kills).toBe(1);
    expect(r.stats.drugsSold).toBe(2); expect(r.stats.jobsCompleted).toBe(1); expect(r.stats.cyberwareAcquired).toBe(1);
    expect(r.inventory.find((i) => i.name === 'Venda')?.qty ?? r.inventory.find((i) => /venda/i.test(i.name))?.qty).toBe(2);
    await expect(api('/api/characters/select', { id: firstId })).rejects.toThrow(/404/);
    const me = await api('/api/me'); expect(me.characters).toHaveLength(1); expect(me.character.id).toBe(secondId); expect(me.memorial[0].summary.record).toEqual(r);
    await recordActivity(app.db, firstId, randomUUID(), 'drug_sale', { item: 'neblina' }, 100, 999);
    expect(await record(firstId)).toEqual(r); b.close();
  });

  it('un reinicio real de la base en disco y otro login conservan selección, personajes y memorial', async () => {
    const frozen = await record(firstId);
    for (const b of clients) b.close(); await app.close(); await boot();
    const login = await api('/api/login', { username: 'CUENTA.PERSISTENTE', password: 'test-password' }, '');
    ownerToken = login.token;
    const me = await api('/api/me'); expect(me.characters.map((c: any) => c.id)).toEqual([secondId]); expect(me.memorial[0].character_id).toBe(firstId);
    expect(await record(firstId)).toEqual(frozen);
    const b = await connect(secondId); expect(b.sheet!.id).toBe(secondId); b.close();
  });

  it('las bajas conservan el autor aunque salga del juego antes del desenlace', async () => {
    const b = await connect(secondId), c = app.world.conns.get(accountId)!;
    const target = app.world.addEntity(c.e!.zone, { kind: 'npc', name: 'Victima diferida', x: c.e!.x + 1, y: c.e!.y, interactive: true, label: '', npcType: 'civil' });
    app.world.combat.damageNpc(target, 100, true, c);
    b.close(); await b.until(() => !app.world.conns.has(accountId), 2000); await app.world.waitForAccountSave(accountId);
    await (app.world.combat as any).npcDeath(target);
    expect((await record(secondId)).stats.npcKills).toBe(1);
    const victimId = (await api('/api/characters', input('Victima Jugador'), otherToken)).id;
    const victimBot = await connect(victimId, otherToken);
    const victim = [...app.world.conns.values()].find((v) => v.p?.charId === victimId)!;
    app.world.combat.damagePlayer(victim.p!, victim.e!, 500, true, { charId: secondId, name: 'Dario Independiente' });
    expect(victim.p!.downedBy?.charId).toBe(secondId);
    await app.world.survival.die(victim.p!, victim.e!, victim.p!.downedCause);
    expect((await record(secondId)).stats.playerKills).toBe(1); victimBot.close();
  });

  it('un puerto ocupado rechaza el inicio en vez de quedar bloqueado', async () => {
    const blocker = createServer(); await new Promise<void>((r) => blocker.listen(0, '127.0.0.1', r));
    const port = (blocker.address() as any).port;
    try { await expect(createApp({ port, host: '127.0.0.1', pgliteDir: 'memory://', databaseUrl: undefined, ambientNpcs: 0, crowdNpcs: 0, logLevel: 'warn' })).rejects.toThrow(/EADDRINUSE/); }
    finally { await new Promise<void>((r) => blocker.close(() => r())); }
  });
});
