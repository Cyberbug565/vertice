// v0.8 · Cuenta de pruebas «admintester» y menú de trucos (solo cuentas marcadas como administración).
// La cuenta se crea al arrancar: en local con la contraseña de ADMIN_TESTER_PASSWORD (o «admintester» si no estás en producción);
// en producción solo si ADMIN_TESTER_PASSWORD está definida.
import { randomUUID } from 'node:crypto';
import { MATRICES, RULES, SKILL_MAX, nearestWalkable, skillXpFor, xpForLevel } from '@vertice/shared';
import { register } from '../auth.js';
import type { Db } from '../db/db.js';
import { GameError } from '../game/effects.js';
import { effective, type PlayerState } from '../game/player.js';
import { BOSSES, LEGENDS } from './legends.js';
import type { PlayerConn, World } from './world.js';

export const ADMIN_USER = 'admintester';

/** Crea (o marca) la cuenta de pruebas al arrancar. */
export async function ensureAdminAccount(db: Db) {
  const pw = process.env.ADMIN_TESTER_PASSWORD || (process.env.NODE_ENV !== 'production' ? 'admintester' : '');
  if (!pw) return;
  const r = await register(db, ADMIN_USER, pw);
  await db.query('UPDATE accounts SET is_admin = true WHERE lower(username) = lower($1)', [ADMIN_USER]);
  if (!('error' in r)) console.log(`[admin] cuenta de pruebas «${ADMIN_USER}» creada${process.env.ADMIN_TESTER_PASSWORD ? '' : ' (contraseña de desarrollo: admintester)'}.`);
}

export class Admin {
  constructor(private readonly w: World) {}
  private notice(c: PlayerConn, text: string) { this.w.send(c, { t: 'notice', kind: 'good', text: `🛠 ${text}` }); }
  private sheet(c: PlayerConn) { this.w.send(c, { t: 'sheet', sheet: (this.w.survival as any).sheetOf(c.p!) }); }

  /** Al entrar: marca la conexión y, la primera vez, lo desbloquea todo. */
  async onJoin(c: PlayerConn) {
    const r = await this.w.db.query<any>('SELECT is_admin FROM accounts WHERE id=$1', [c.accountId]).catch(() => ({ rows: [] as any[] }));
    c.admin = !!r.rows[0]?.is_admin;
    if (!c.admin || !c.p) return;
    (c.p as any).admin = true;
    if (!c.p.flags.has('admin-desbloqueado')) setTimeout(() => { if (!c.closed) void this.unlockAll(c).catch((err) => console.error('[admin]', err)); }, 1500);
  }

  private async give(p: PlayerState, item: string, qty = 1) {
    await this.w.effects.apply(p, [{ item, qty }], { opId: `admin-${randomUUID()}`, kind: 'admin' });
  }
  private async giveCyber(p: PlayerState, def: string, installed: boolean) {
    const id = randomUUID();
    await this.w.db.query('INSERT INTO cyberware_instances (id, def_id, character_id, location, stolen, history) VALUES ($1,$2,$3,$4,$5,$6)', [id, def, p.charId, installed ? 'installed' : 'inventory', false, JSON.stringify([{ at: new Date().toISOString(), event: 'menú de trucos' }])]);
    if (installed) p.cyber = p.cyber.filter((ci) => !(ci.location === 'installed' && this.w.c.cyberware.find((x) => x.id === ci.def)?.slot === this.w.c.cyberware.find((x) => x.id === def)?.slot));
    p.cyber.push({ id, def, location: installed ? 'installed' : 'inventory', stolen: false });
  }

  async unlockAll(c: PlayerConn) {
    const p = c.p!;
    await this.w.effects.apply(p, [{ money: 1_000_000, reason: 'Menú de trucos' }], { opId: `admin-${randomUUID()}`, kind: 'admin' });
    p.level = RULES.levelMax; p.xp = xpForLevel(RULES.levelMax);
    for (const s of this.w.c.skills) p.skillXp[s.id] = skillXpFor(SKILL_MAX);
    p.perks = this.w.c.perks.map((x) => x.id);
    for (const d of this.w.c.ripperdocs) p.flags.set(`descubierto:${d.id}`, { value: true, expiresAt: null });
    await this.giveCyber(p, 'zocalo-matrices', true);
    await this.giveCyber(p, 'kairos-6', true);
    for (const k of ['kairos-1', 'kairos-2', 'kairos-3', 'kairos-4', 'kairos-5']) await this.giveCyber(p, k, false);
    p.relics = { matrices: ['matriz-eco'], socketExtra: 2 };
    for (const id of Object.keys(MATRICES)) if (id !== 'matriz-eco') await this.give(p, id);
    for (const [it, q] of [['venda', 20], ['estim', 10], ['inmunosupresor', 10], ['cuna-neural', 1], ['rifle-asalto', 1], ['bala-rifle', 300], ['pistola-inteligente', 1], ['bala-ligera', 300], ['katana-termica', 1]] as [string, number][]) if (this.w.c.items.some((i) => i.id === it)) await this.give(p, it, q);
    p.legends ??= {};
    for (const L of LEGENDS) p.legends[L.id] = { trust: 100, step: p.legends[L.id]?.step ?? 0, active: false, count: 0 };
    p.flags.set('admin-desbloqueado', { value: true, expiresAt: null });
    p.hp = effective(this.w.c, p).hpMax; p.ram = effective(this.w.c, p).ram;
    this.notice(c, 'Todo desbloqueado: dinero, nivel máximo, habilidades 25, todos los perks, zócalo con 4 ranuras, Kairós Experimental instalado, todas las matrices, armas y las tres leyendas abiertas. Pulsa º (o F10) para el menú de trucos.');
    this.sheet(c);
  }

  async cheat(c: PlayerConn, cmd: string, arg?: string, n?: number) {
    if (!c.admin) throw new GameError('Solo para cuentas de administración.');
    const p = c.p!, e = this.w.relics.bodyOf(c);
    const z = e.zone;
    const near = (r = 3) => { const a = Math.random() * Math.PI * 2; return nearestWalkable(z.grid, e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, 4) ?? { x: e.x + 1, y: e.y }; };
    switch (cmd) {
      case 'info': {
        const items = [...this.w.c.items.map((i) => ({ id: i.id, name: i.name, kind: i.category })), ...this.w.c.cyberware.map((d) => ({ id: `cyber:${d.id}`, name: d.name, kind: 'implante' }))];
        const npcs = ['civil', 'policia', 'maleante', 'ciberpsicopata', ...this.w.c.factions.filter((f) => f.kind === 'gang').map((f) => `banda:${f.id}`), 'recompensa:0', 'recompensa:1', 'recompensa:2', 'recompensa:3', ...Object.keys(BOSSES).map((b) => `jefe:${b}`)];
        const places = [...(this.w.zones.get('vertice')?.def.districts ?? []).map((d) => ({ id: `distrito:${d.id}`, name: d.name })), ...['bloque9', 'ciberespacio', 'velo', 'guarida-iris', 'refugio-sable', 'garaje-cometa', 'torre-halcon-p7', 'torre-okami-p5'].map((id) => ({ id, name: this.w.c.zones.find((x) => x.id === id)?.name ?? id }))];
        this.w.send(c, { t: 'cheatInfo', items, npcs, places });
        return;
      }
      case 'unlock': return this.unlockAll(c);
      case 'money': await this.w.effects.apply(p, [{ money: Math.round(n ?? 100000), reason: 'Menú de trucos' }], { opId: `admin-${randomUUID()}`, kind: 'admin' }); break;
      case 'level': { const l = Math.max(1, Math.min(RULES.levelMax, Math.round(n ?? RULES.levelMax))); p.level = l; p.xp = xpForLevel(l); break; }
      case 'skills': for (const s of this.w.c.skills) p.skillXp[s.id] = skillXpFor(SKILL_MAX); break;
      case 'heal': { p.hp = effective(this.w.c, p).hpMax; p.body = { wounds: {}, lost: [], bleed: 0 }; p.stamina = effective(this.w.c, p).staminaMax; p.hunger = 0; p.thirst = 0; p.fatigue = 0; p.ram = effective(this.w.c, p).ram; if (p.status === 'downed') { p.status = 'alive'; e.state = 'alive'; e.label = ''; e.labelVer++; } break; }
      case 'god': (p as any).god = !(p as any).god; this.notice(c, (p as any).god ? 'Modo dios: no recibes daño.' : 'Modo dios desactivado.'); break;
      case 'ram': p.ram = effective(this.w.c, p).ram; break;
      case 'wanted': p.wanted = 0; p.identified = null; break;
      case 'psyche': { p.psyche.level = Math.max(0, Math.min(100, n ?? 0)); if (!n) p.psyche.episode = undefined; break; }
      case 'episode': { p.psyche.level = Math.max(p.psyche.level, n ?? 75); p.psyche.episode = undefined; this.w.threats.psychoGain(c, p, 0.01); break; }
      case 'hour': { this.w.cfg.cityHourOffset += ((n ?? 12) - this.w.cityHour() + 24) % 24; for (const o of this.w.conns.values()) this.w.send(o, { t: 'notice', kind: 'info', text: `🛠 Hora de la ciudad: ${Math.round(n ?? 12)}:00` }); break; }
      case 'item': {
        if (!arg) throw new GameError('Falta el objeto.');
        if (arg.startsWith('cyber:')) { await this.giveCyber(p, arg.slice(6), false); break; }
        if (arg.startsWith('install:')) { await this.giveCyber(p, arg.slice(8), true); break; }
        if (!this.w.c.items.some((i) => i.id === arg)) throw new GameError('Ese objeto no existe.');
        await this.give(p, arg, Math.max(1, Math.round(n ?? 1)));
        break;
      }
      case 'legend': {
        const L = LEGENDS.find((x) => x.id === arg);
        if (!L) throw new GameError('Leyenda desconocida.');
        p.legends ??= {};
        p.legends[L.id] = { trust: 100, step: Math.max(0, Math.min(L.steps.length - 1, Math.round(n ?? L.steps.length - 1))), active: true, count: 0 };
        this.notice(c, `${L.name}: encargo ${p.legends[L.id].step + 1} activo («${L.steps[p.legends[L.id].step].title}»).`);
        break;
      }
      case 'spawn': {
        const kind = arg ?? 'civil';
        const at = near(3);
        if (kind === 'civil') this.w.spawnAmbient(z, at);
        else if (kind === 'policia') this.w.combat.spawnFactionNpc(z, 'pcv', 'police', undefined, at);
        else if (kind === 'maleante') this.w.threats.spawnPredator(z, [at.x, at.y]);
        else if (kind === 'ciberpsicopata') { const was = this.w.threats.psychos.size; this.w.threats.psychos.clear(); await this.w.threats.spawnPsycho(at); if (!was) void 0; }
        else if (kind.startsWith('banda:')) this.w.combat.spawnFactionNpc(z, kind.slice(6), 'gang', undefined, at);
        else if (kind.startsWith('recompensa:')) { const gen = this.w.threats.gen; if (gen.size >= 8) gen.clear(); await this.w.threats.spawnBounty({ tier: Number(kind.slice(11)) || 0, at }); }
        else if (kind.startsWith('jefe:')) { const L = LEGENDS.find((l) => l.steps.some((s) => s.goal.type === 'boss' && s.goal.boss === kind.slice(5))); if (L) { const b = this.w.legends.spawnBoss(c, L, kind.slice(5)); if (b && b.zone !== z) this.notice(c, `${b.name} ha aparecido en ${b.zone.def.name}.`); } }
        else throw new GameError('No sé qué es eso.');
        this.notice(c, `Aparece: ${kind}.`);
        return;
      }
      case 'tp': {
        if (!arg) throw new GameError('¿Adónde?');
        if (arg.startsWith('distrito:')) { const d = this.w.zones.get('vertice')?.def.districts.find((x) => x.id === arg.slice(9)); if (!d) throw new GameError('Distrito desconocido.'); await this.w.teleport(c, 'vertice', d.safePoint as [number, number]); return; }
        const zz = this.w.ensureZone(arg);
        if (!zz) throw new GameError('Zona desconocida.');
        await this.w.teleport(c, arg, zz.def.safePoint as [number, number]);
        return;
      }
      case 'killall': for (const o of [...z.query(e.x, e.y, 12)]) if (o.kind === 'npc' && o.npcMax && o.npcType !== 'essential' && o.state !== 'downed') this.w.combat.damageNpc(o, 99999, true, c); break;
      default: throw new GameError('Truco desconocido.');
    }
    this.sheet(c);
  }
}
