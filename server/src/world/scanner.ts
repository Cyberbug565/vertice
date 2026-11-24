// v0.38 · Interfaz en pantalla: lo que sabes de quien tienes cerca y de ti mismo depende de tu nivel de Interfaz (ver
// SCAN_TIERS en shared/interfaz.ts). Todo se calcula aquí, en el servidor: el cliente solo recibe lo que su nivel le deja ver.
// Además, desde Interfaz 8, bandas, carteles y corporaciones te escriben con ofertas de trabajo de red: una prima al firmar y
// un sueldo diario durante unos días (más cuanto más alto el nivel).
import { approxMoney, NET_OFFERS, netOfferPay, SCAN_TIERS, scanTier, type DossierView, type NetOffer, type ScanInfo } from '@vertice/shared';
import { randomUUID } from 'node:crypto';
import { GameError } from '../game/effects.js';
import { buildSheet, effective, skillLevel, type PlayerState } from '../game/player.js';
import { playedMs } from '../game/records.js';
import type { Entity } from './entity.js';
import type { PlayerConn, World } from './world.js';

const RANGE = 26;
const WIPE_MS = 60 * 60_000;
const CONTRACT_FLAG = 'red:contrato';
interface Contract { faction: string; daily: number; left: number; due: number }
const PITCH: Record<'gang' | 'corp', string[]> = {
  gang: ['Nos han dicho que entras en sitios sin llamar. Tenemos sitios.', 'Un trabajo limpio de red. Bueno, limpio para nosotros.', 'Pagamos mejor que la PCV y preguntamos menos.', 'Necesitamos a alguien que haga hablar a las cámaras.'],
  corp: ['Departamento de «Soluciones Discretas». Valoramos su perfil.', 'Contrato de consultoría. Sin preguntas, con factura.', 'Nuestra seguridad necesita a alguien que piense como el enemigo.', 'Oferta confidencial. Si la filtra, lo sabremos.'],
};
/** Cromo de los PNJ (piezas a la vista): «brazo_der» → «Brazo der. cromado». */
const chromePart = (id: string) => { const t = id.replace(/_der$/, ' der.').replace(/_izq$/, ' izq.').replace(/_/g, ' '); return `${t[0].toUpperCase()}${t.slice(1)} cromado${/^(ojos|piernas|brazos|manos)/.test(id) && !/_(der|izq)$/.test(id) ? 's' : ''}`; };
const ARMS: Record<string, string> = { ranged: 'arma de fuego', melee: 'arma blanca' };

export class Scanner {
  private offers = new Map<string, NetOffer & { at: number }>();
  private lastOffer = new Map<string, number>();
  private scanned = new Map<string, Map<number, number>>();
  private lastScan = new WeakMap<PlayerConn, number>();
  private wipedAt = new Map<string, number>();
  constructor(private readonly w: World, private readonly rng: () => number = Math.random) {}

  private iface(p: PlayerState) { return skillLevel(p, 'interfaz'); }
  private facName(id?: string) { return id ? this.w.c.factions.find((f) => f.id === id)?.name ?? id : undefined; }
  private poster(b: { poster: string; placedBy: string | null }) { return b.placedBy ? 'Un particular' : b.poster === 'pcv' ? 'La PCV' : this.facName(b.poster) ?? b.poster; }

  /** Lo que ves de alguien (clic o al pasar el ratón por encima). */
  async scan(c: PlayerConn, targetId: number) {
    const p = c.p, me = c.e, e = this.w.entities.get(targetId);
    if (!p || !me || !e || e.zone !== me.zone || (e.kind !== 'player' && e.kind !== 'npc')) return;
    if (Math.hypot(e.x - me.x, e.y - me.y) > RANGE) return;
    const now = Date.now();
    if (now - (this.lastScan.get(c) ?? 0) < 120) return; // como mucho ~8 por segundo
    this.lastScan.set(c, now);
    this.w.send(c, { t: 'lookInfo', info: await this.info(p, me, e) });
    // Escanear a gente distinta entrena Interfaz (poco: es de las difíciles).
    const seen = this.scanned.get(p.charId) ?? new Map<number, number>(); this.scanned.set(p.charId, seen);
    if (e !== me && now - (seen.get(e.id) ?? 0) > 10 * 60_000) { seen.set(e.id, now); if (seen.size > 400) seen.clear(); this.w.progress.gain(p, 'interfaz', 1); }
  }

  async info(p: PlayerState, me: Entity, e: Entity): Promise<ScanInfo> {
    const lv = this.iface(p), tier = scanTier(lv);
    const tp = this.w.playerOf(e);
    const out: ScanInfo = { id: e.id, tier, name: e.name };
    const w = e.weaponId ? this.w.c.items.find((i) => i.id === e.weaponId) : tp?.equipped ? this.w.c.items.find((i) => i.id === tp.equipped) : undefined;
    out.armed = w ? (tier >= 2 ? w.name : ARMS[w.weapon?.kind ?? ''] ?? 'armado/a') : undefined;
    out.bleeding = (e.body?.bleed ?? 0) > 0.2 || undefined;
    if (e === me) return { ...out, kind: 'jugador', level: p.level };
    if (tier >= 1) {
      out.kind = tp ? 'jugador' : 'pnj';
      const level = tp?.level ?? e.level ?? 1;
      out.levelApprox = level < 5 ? 'novato' : level < 12 ? 'curtido' : level < 20 ? 'peligroso' : 'letal';
      out.faction = this.facName(e.faction);
    }
    if (tier >= 2) {
      out.level = tp?.level ?? e.level ?? 1;
      out.title = tp ? this.w.c.roles.find((r) => r.id === tp.role)?.name : e.title;
      out.hpPct = tp ? Math.round((tp.hp / Math.max(1, effective(this.w.c, tp).hpMax)) * 100) : e.npcMax ? Math.round(((e.npcHp ?? e.npcMax) / e.npcMax) * 100) : undefined;
      out.wanted = tp ? Math.floor(tp.wanted) || undefined : undefined;
      out.attitude = this.attitude(p, me, e, tp);
    }
    if (tier >= 3) {
      const bounty = tp ? this.w.survival.bounties.totalOnPlayer(tp.charId) : e.fugitive ? this.w.survival.bounties.totalOnNpc(e.fugitive.id) : e.bounty ?? 0;
      out.bounty = bounty || undefined;
      const chrome = tp ? tp.cyber.filter((x) => x.location === 'installed').map((x) => this.w.c.cyberware.find((d) => d.id === x.def)?.name ?? x.def) : (e.chrome ?? []).map((id) => this.w.c.cyberware.find((d) => d.id === id)?.name ?? chromePart(id));
      out.chrome = chrome.length ? chrome.slice(0, 8) : undefined;
      if (tp) {
        const r = await this.w.db.query<any>('SELECT crime, district FROM public_records WHERE character_id=$1 ORDER BY created_at DESC LIMIT 4', [tp.charId]).catch(() => ({ rows: [] as any[] }));
        out.record = r.rows.map((x: any) => `${x.crime} (${x.district})`);
      } else if (e.fugitive) out.record = [e.fugitive.crime];
    }
    if (tier >= 4) {
      if (tp) {
        const sk = effective(this.w.c, tp).skills;
        out.skills = Object.entries(sk).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, v]) => `${this.w.c.skills.find((s) => s.id === id)?.name ?? id} ${v}`);
        out.money = approxMoney(tp.money);
        out.debt = (tp.bio?.loan?.owed ?? 0) > 0 || undefined;
      } else out.money = approxMoney((e.lootTier ?? (e.npcType === 'civil' ? 0 : 1)) * 120 + (e.level ?? 1) * 15);
    }
    if (tier >= 5) {
      if (tp) {
        const ef = effective(this.w.c, tp);
        out.ram = ef.ram || undefined;
        out.humanity = `${Math.round(tp.humanity)}/${tp.humanityMax}`;
        out.psycho = (tp.psyche?.level ?? 0) >= 45 || undefined;
      } else out.psycho = e.npcType === 'psycho' || undefined;
      const list = tp ? this.w.survival.bounties.onPlayer(tp.charId) : e.fugitive ? this.w.survival.bounties.onNpc(e.fugitive.id) : [];
      out.bountyBy = list.length ? [...new Set(list.map((b) => this.poster(b)))] : undefined;
    }
    return out;
  }

  private attitude(p: PlayerState, me: Entity, e: Entity, tp?: PlayerState): ScanInfo['attitude'] {
    if (e.aggro === me.id) return 'hostil';
    if (tp) return tp.wanted >= 3 ? 'recelosa' : 'neutral';
    if (e.npcType === 'police' || e.npcType === 'hierro') return p.wanted >= 2 ? 'hostil' : p.wanted >= 1 ? 'recelosa' : 'neutral';
    const f = e.faction ? this.w.c.factions.find((x) => x.id === e.faction) : undefined;
    if (f) { const r = p.rep.get(f.id) ?? 0; return r <= f.hostileBelow ? 'hostil' : r < 0 ? 'recelosa' : r >= 20 ? 'amistosa' : 'neutral'; }
    return 'neutral';
  }

  /** Tu expediente: lo que la ciudad sabe de ti (y lo que tú sabes de eso). */
  async dossier(c: PlayerConn): Promise<DossierView> {
    const p = c.p!, lv = this.iface(p), tier = scanTier(lv), now = Date.now();
    const next = SCAN_TIERS[tier + 1];
    const v: DossierView = { interfaz: lv, tier, next: next ? { level: next.level, unlocks: next.self } : undefined, wanted: p.wanted >= 1, offers: [] };
    const bounties = this.w.survival.bounties.onPlayer(p.charId), total = bounties.reduce((a, b) => a + b.amount, 0);
    if (tier >= 1) { v.wantedLevel = Math.floor(p.wanted); v.bountyApprox = total ? approxMoney(total) : undefined; }
    if (tier >= 2) {
      v.bounty = total || undefined;
      v.decayMin = p.wanted > 0 ? Math.ceil((p.wanted / Math.max(0.01, this.w.c.needs.wantedDecayPerGameHour)) * this.w.c.manifest.cityHourMs / 60000) : undefined;
      const st = this.w.stealth.st(c);
      if (st.description && st.description.until > now) v.description = { crime: st.description.crime, minutes: Math.ceil((st.description.until - now) / 60000), matches: st.description.outfit === this.w.stealth.outfit(p) };
      v.faceCovered = this.w.stealth.faceCovered(p);
    }
    if (tier >= 3) {
      v.bountyBy = bounties.length ? bounties.map((b) => `${this.poster(b)}: ${b.amount.toLocaleString('es-ES')} €$ (${b.reason})`) : undefined;
      const r = await this.w.db.query<any>('SELECT crime, district FROM public_records WHERE character_id=$1 ORDER BY created_at DESC LIMIT 6', [p.charId]).catch(() => ({ rows: [] as any[] }));
      v.record = r.rows.map((x: any) => `${x.crime} (${x.district})`);
    }
    if (tier >= 4) {
      const hunters: string[] = [];
      for (const z of this.w.zones.values()) for (const o of z.entities) if (!o.dead && (o.hunting === p.charId || (c.e && o.aggro === c.e.id && o.aggroLethal))) hunters.push(`${o.name}${o.title ? ` · ${o.title}` : ''} (${z.def.name})`);
      v.hunters = hunters.slice(0, 8);
      v.hostile = this.w.c.factions.filter((f) => (p.rep.get(f.id) ?? 0) <= f.hostileBelow).map((f) => f.name);
    }
    if (tier >= 5) { const last = this.wipedAt.get(p.charId) ?? 0; v.canWipe = now - last >= WIPE_MS; v.wipeInMin = v.canWipe ? undefined : Math.ceil((WIPE_MS - (now - last)) / 60000); }
    const o = this.offers.get(p.charId);
    if (o && o.at + NET_OFFERS.ttlMin * 60_000 > now) v.offers = [{ ...o, expiresInMin: Math.ceil((o.at + NET_OFFERS.ttlMin * 60_000 - now) / 60000) }];
    const k = this.contract(p);
    if (k) v.retainer = { factionName: this.facName(k.faction) ?? k.faction, daily: k.daily, left: k.left, inMin: Math.max(0, Math.round((k.due - playedMs(p)) / 60000)) };
    return v;
  }

  async command(c: PlayerConn, action: 'view' | 'wipe' | 'accept' | 'decline', offer?: string) {
    const p = c.p!;
    if (action === 'wipe') {
      if (scanTier(this.iface(p)) < 5) throw new GameError('Necesitas Interfaz 20 (acceso raíz) para tocar la base de la PCV.');
      const last = this.wipedAt.get(p.charId) ?? 0;
      if (Date.now() - last < WIPE_MS) throw new GameError('La PCV ha reforzado el acceso. Espera un poco antes de volver a entrar.');
      const st = this.w.stealth.st(c);
      if (!st.description || st.description.until <= Date.now()) throw new GameError('No hay ninguna descripción tuya en la base de la PCV.');
      st.description = undefined; this.wipedAt.set(p.charId, Date.now());
      this.w.progress.gain(p, 'interfaz', 6);
      this.w.send(c, { t: 'notice', kind: 'good', text: 'Descripción de los testigos borrada de la base de la PCV.' });
    } else if (action === 'accept' || action === 'decline') {
      const o = this.offers.get(p.charId);
      if (!o || o.id !== offer || o.at + NET_OFFERS.ttlMin * 60_000 < Date.now()) throw new GameError('Esa oferta ya no está.');
      this.offers.delete(p.charId);
      if (action === 'accept') await this.accept(c, p, o);
      else this.w.send(c, { t: 'notice', kind: 'info', text: `Rechazas la oferta de ${o.factionName}.` });
    }
    this.w.send(c, { t: 'dossier', view: await this.dossier(c) });
  }

  private contract(p: PlayerState): Contract | undefined { const v = p.flags.get(CONTRACT_FLAG)?.value as Contract | undefined; return v && v.left > 0 ? v : undefined; }
  private async saveContract(p: PlayerState, k: Contract | null) {
    if (k) p.flags.set(CONTRACT_FLAG, { value: k, expiresAt: null }); else p.flags.delete(CONTRACT_FLAG);
    await this.w.db.query(k ? 'INSERT INTO character_flags (character_id, key, value) VALUES ($1,$2,$3) ON CONFLICT (character_id, key) DO UPDATE SET value = EXCLUDED.value' : 'DELETE FROM character_flags WHERE character_id=$1 AND key=$2', k ? [p.charId, CONTRACT_FLAG, JSON.stringify(k)] : [p.charId, CONTRACT_FLAG]);
  }
  private async pay(p: PlayerState, amount: number, reason: string, faction?: { id: string; delta: number }) {
    await this.w.db.tx(async (q) => {
      const bal = p.money + amount;
      await q.query('INSERT INTO ledger (op_id, character_id, delta, balance_after, reason) VALUES ($1,$2,$3,$4,$5)', [`red-${randomUUID()}`, p.charId, amount, bal, reason]);
      await q.query('UPDATE characters SET money=$2 WHERE id=$1', [p.charId, bal]);
      if (faction) await q.query('INSERT INTO reputation (character_id, faction_id, value) VALUES ($1,$2,$3) ON CONFLICT (character_id, faction_id) DO UPDATE SET value=reputation.value + EXCLUDED.value', [p.charId, faction.id, faction.delta]);
    });
    p.money += amount;
    if (faction) p.rep.set(faction.id, (p.rep.get(faction.id) ?? 0) + faction.delta);
  }
  private async accept(c: PlayerConn, p: PlayerState, o: NetOffer) {
    if (this.contract(p)) throw new GameError('Ya trabajas para alguien. Termina ese contrato primero.');
    await this.pay(p, o.bonus, `Prima de contrato de red (${o.factionName})`, { id: o.faction, delta: 12 });
    // Los rivales de quien te contrata se enteran.
    const f = this.w.c.factions.find((x) => x.id === o.faction);
    for (const [rival, rel] of Object.entries(f?.relations ?? {})) if (rel <= -30 && this.w.c.factions.some((x) => x.id === rival)) {
      await this.w.db.query('INSERT INTO reputation (character_id, faction_id, value) VALUES ($1,$2,$3) ON CONFLICT (character_id, faction_id) DO UPDATE SET value=reputation.value + EXCLUDED.value', [p.charId, rival, -6]);
      p.rep.set(rival, (p.rep.get(rival) ?? 0) - 6);
    }
    await this.saveContract(p, { faction: o.faction, daily: o.daily, left: o.days, due: playedMs(p) + 24 * this.w.c.manifest.cityHourMs });
    this.w.send(c, { t: 'notice', kind: 'good', text: `Contrato firmado con ${o.factionName}: ${o.bonus.toLocaleString('es-ES')} €$ ahora y ${o.daily.toLocaleString('es-ES')} €$ al día durante ${o.days} días.` });
    this.w.send(c, { t: 'sheet', sheet: buildSheet(this.w.c, p) });
  }

  /** Una vez por minuto: ofertas nuevas y sueldos de los contratos. */
  async everyMinute() {
    const now = Date.now();
    for (const c of this.w.conns.values()) {
      const p = c.p;
      if (!p || c.closed || p.status !== 'alive') continue;
      const k = this.contract(p);
      if (k && playedMs(p) >= k.due) {
        k.left--; k.due += 24 * this.w.c.manifest.cityHourMs;
        await this.pay(p, k.daily, `Sueldo de red (${this.facName(k.faction)})`).catch((err) => console.error('[red]', err));
        await this.saveContract(p, k.left > 0 ? k : null).catch(() => {});
        this.w.send(c, { t: 'notice', kind: 'good', text: k.left > 0 ? `${this.facName(k.faction)} te ingresa ${k.daily.toLocaleString('es-ES')} €$ (quedan ${k.left} días).` : `Último sueldo de ${this.facName(k.faction)}. El contrato ha terminado.` });
        this.w.send(c, { t: 'sheet', sheet: buildSheet(this.w.c, p) });
      }
      const lv = this.iface(p), cur = this.offers.get(p.charId);
      if (cur && cur.at + NET_OFFERS.ttlMin * 60_000 < now) this.offers.delete(p.charId);
      if (lv < NET_OFFERS.minLevel || k || this.offers.has(p.charId)) continue;
      if (now - (this.lastOffer.get(p.charId) ?? 0) < NET_OFFERS.everyMin * 60_000) continue;
      if (this.rng() > 0.35) continue;
      const o = this.makeOffer(p, lv);
      if (!o) continue;
      this.lastOffer.set(p.charId, now); this.offers.set(p.charId, o);
      this.w.send(c, { t: 'notice', kind: 'good', text: `📱 ${o.factionName} te ofrece un contrato de red: ${o.bonus.toLocaleString('es-ES')} €$ al firmar + ${o.daily.toLocaleString('es-ES')} €$/día. Míralo en Personaje → Expediente.` });
    }
  }

  makeOffer(p: PlayerState, lv: number): (NetOffer & { at: number }) | undefined {
    const pool = this.w.c.factions.filter((f) => (f.kind === 'gang' || f.kind === 'corp') && !f.id.startsWith('ias-') && (p.rep.get(f.id) ?? 0) > f.hostileBelow);
    if (!pool.length) return;
    const f = pool[Math.floor(this.rng() * pool.length)], kind = f.kind === 'corp' ? 'corp' : 'gang';
    const pay = netOfferPay(lv, kind), rep = p.rep.get(f.id) ?? 0, boost = rep >= 20 ? 1.15 : 1;
    const lines = PITCH[kind];
    return { id: randomUUID(), faction: f.id, factionName: f.name, kind, bonus: Math.round(pay.bonus * boost), daily: Math.round(pay.daily * boost), days: NET_OFFERS.days, expiresInMin: NET_OFFERS.ttlMin, pitch: lines[Math.floor(this.rng() * lines.length)], at: Date.now() };
  }
}
