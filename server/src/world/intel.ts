// v0.6 · Información sobre personas (ordenador del piso o móvil) y «marcar objetivo»: el personaje va solo hasta un lugar o una persona.
// En un ordenador la búsqueda es rápida y precisa (posición exacta, seguimiento en vivo unos minutos);
// con el móvil tarda más y solo da el distrito aproximado. También sirven los soplos de la calle.
import { nearestWalkable, type SearchResult } from '@vertice/shared';
import { GameError } from '../game/effects.js';
import { effective, skillLevel, type PlayerState } from '../game/player.js';
import type { Entity } from './entity.js';
import type { PlayerConn, World } from './world.js';
import { isSick } from '../game/substances.js';

export interface GotoState { kind: 'place' | 'person' | 'door'; label: string; zone: string; x: number; y: number; key?: string; door?: number; lastPathAt: number; tx: number; ty: number }
const TRACK_MS = 5 * 60_000;

export class Intel {
  readonly goto = new Map<string, GotoState>();
  constructor(private readonly w: World) {}

  private placeName(zoneId: string, x: number, y: number) {
    const z = this.w.zones.get(zoneId);
    if (!z) return zoneId;
    if (z.def.kind !== 'exterior') return z.def.name;
    return this.w.property.dname(this.w.districtOf(z, x, y));
  }

  /** Busca personas por nombre. Ordenador: 2 s y posición exacta. Móvil: ~12 s y solo el distrito. */
  search(c: PlayerConn, query: string, device: 'phone' | 'computer') {
    const p = c.p!, e = c.e!;
    if (p.status !== 'alive') throw new GameError('Ahora no.');
    if (device === 'computer' && ![...e.zone.query(e.x, e.y, 2.5)].some((o) => o.objKind === 'computer')) throw new GameError('Necesitas un ordenador: tu piso tiene uno. Si no, usa el móvil (más lento y menos preciso).');
    const inv = skillLevel(p, 'investigacion'), int = effective(this.w.c, p).attrs.INT;
    const secs = device === 'computer' ? Math.max(0.8, 2.2 - inv * 0.05) : Math.max(5, 13 - inv * 0.25 - int * 0.3);
    this.w.cancelActivity(e);
    e.channel = { startTick: this.w.tick, endTick: this.w.tick + Math.round(secs * 20), label: device === 'computer' ? 'Buscando en la red' : 'Buscando con el móvil', targetId: e.id, apply: () => this.w.enqueue(c, async () => {
      const results = await this.results(p, query, device);
      this.w.progress.gain(p, 'investigacion', device === 'computer' ? 3 : 2);
      this.w.send(c, { t: 'searchResults', device, results });
      this.w.send(c, { t: 'action', text: '' });
      if (!results.length) this.w.send(c, { t: 'notice', kind: 'info', text: `Sin resultados para «${query}».` });
    }) };
    this.w.send(c, { t: 'action', text: device === 'computer' ? `Buscando «${query}» en la red…` : `Buscando «${query}» con el móvil…`, duration: secs });
  }

  private async results(p: PlayerState, query: string, device: 'phone' | 'computer'): Promise<SearchResult[]> {
    const precise = device === 'computer';
    const q = query.trim().toLowerCase();
    const out: SearchResult[] = [];
    const locate = (zoneId: string, x: number, y: number) => {
      if (precise) return { zone: zoneId, place: this.placeName(zoneId, x, y), x, y, precise: true };
      // El móvil solo triangula el distrito: un punto aproximado a unas decenas de metros.
      const jx = x + (Math.random() - 0.5) * 30, jy = y + (Math.random() - 0.5) * 30;
      return { zone: zoneId, place: this.placeName(zoneId, x, y), x: jx, y: jy, precise: false };
    };
    // Jugadores (vivos), conectados o no.
    const rows = await this.w.db.query<any>("SELECT id, name, role, level FROM characters WHERE status <> 'dead' AND lower(name) LIKE $1 ORDER BY level DESC LIMIT 8", [`%${q.replace(/[%_]/g, '')}%`]);
    for (const r of rows.rows) {
      if (r.id === p.charId) continue;
      const conn = [...this.w.conns.values()].find((k) => k.p?.charId === r.id);
      const recs = await this.w.db.query<any>('SELECT crime, district FROM public_records WHERE character_id=$1 ORDER BY created_at DESC LIMIT 4', [r.id]);
      const ent = conn?.e;
      const loc = ent ? locate(ent.zone.id, ent.x, ent.y) : null;
      out.push({ key: `p:${r.id}`, name: r.name, kind: 'player', level: r.level ?? 1, title: this.w.c.roles.find((x) => x.id === r.role)?.name ?? '', bounty: this.w.survival.bounties.totalOnPlayer(r.id),
        record: recs.rows.map((x: any) => `${x.crime} en ${x.district}`), online: !!ent, location: loc });
      if (ent && loc) p.intel.set(`p:${r.id}`, { name: r.name, zone: loc.zone, x: loc.x!, y: loc.y!, at: Date.now(), precise });
    }
    // PNJ con nombre: fugitivos, personas clave y gente de las bandas con nombre propio.
    let n = 0;
    for (const z of this.w.zones.values()) for (const o of z.entities) {
      if (n >= 8) break;
      if (o.kind !== 'npc' || o.dead || !o.name.toLowerCase().includes(q)) continue;
      if (!(o.fugitive || o.npcType === 'essential' || (o.dialog && o.dialog !== 'transeunte'))) continue;
      n++;
      const fac = o.faction ? this.w.c.factions.find((f) => f.id === o.faction)?.name : undefined;
      const loc = locate(o.zone.id, o.x, o.y);
      out.push({ key: `n:${o.id}`, name: o.name, kind: 'npc', level: o.level ?? 1, title: o.fugitive ? `Fugitivo · ${o.fugitive.crime}` : o.title ?? '', faction: fac,
        bounty: o.fugitive ? this.w.survival.bounties.totalOnNpc(o.fugitive.id) : 0, record: o.fugitive ? [o.fugitive.crime] : [], online: true, location: loc });
      p.intel.set(`n:${o.id}`, { name: o.name, zone: loc.zone, x: loc.x, y: loc.y, at: Date.now(), precise });
    }
    return out;
  }

  /** Un soplo de la calle: dónde anda un fugitivo (aproximado). */
  rumor(p: PlayerState): string | null {
    const fug = [...this.w.zones.values()].flatMap((z) => [...z.entities]).filter((o) => o.fugitive && !o.dead && o.state !== 'downed');
    if (!fug.length) return null;
    const f = fug[Math.floor(Math.random() * fug.length)];
    const place = this.placeName(f.zone.id, f.x, f.y);
    p.intel.set(`n:${f.id}`, { name: f.name, zone: f.zone.id, x: f.x + (Math.random() - 0.5) * 20, y: f.y + (Math.random() - 0.5) * 20, at: Date.now(), precise: false });
    return `Dicen que ${f.name} anda por ${place}. Si lo buscas, búscalo con el móvil (tecla G) y márcalo como objetivo.`;
  }

  /** Persona: posición en vivo si la información es precisa y reciente; si no, la última conocida. */
  private personPos(p: PlayerState, key: string): { zone: string; x: number; y: number; live: boolean; name: string } | null {
    const intel = p.intel.get(key);
    if (!intel) return null;
    if (intel.precise && Date.now() - intel.at < TRACK_MS) {
      let ent: Entity | undefined;
      if (key.startsWith('p:')) ent = [...this.w.conns.values()].find((k) => k.p?.charId === key.slice(2))?.e;
      else ent = this.w.entities.get(Number(key.slice(2)));
      if (ent && !ent.dead) return { zone: ent.zone.id, x: ent.x, y: ent.y, live: true, name: intel.name };
    }
    return { zone: intel.zone, x: intel.x, y: intel.y, live: false, name: intel.name };
  }

  start(c: PlayerConn, m: { kind: 'place' | 'person' | 'door' | 'cancel'; x?: number; y?: number; key?: string; door?: number }) {
    const p = c.p!, e = c.e!;
    if (m.kind === 'cancel') { this.cancel(c, 'Objetivo desmarcado.'); return; }
    let st: GotoState;
    if (m.kind === 'person') {
      const pos = m.key ? this.personPos(p, m.key) : null;
      if (!pos) throw new GameError('No sabes dónde está. Búscalo en un ordenador o con el móvil, o pregunta por la calle.');
      st = { kind: 'person', key: m.key, label: pos.name, zone: pos.zone, x: pos.x, y: pos.y, lastPathAt: 0, tx: NaN, ty: NaN };
    } else if (m.kind === 'door') {
      const d = m.door !== undefined ? this.w.entities.get(m.door) : undefined;
      if (!d || d.kind !== 'door') throw new GameError('Esa puerta no existe.');
      st = { kind: 'door', door: d.id, label: d.name, zone: d.zone.id, x: d.x, y: d.y, lastPathAt: 0, tx: NaN, ty: NaN };
    } else {
      if (m.x === undefined || m.y === undefined) throw new GameError('Marca un punto del mapa.');
      const city = [...this.w.zones.values()].find((z) => z.def.kind === 'exterior' && z.def.districts?.length) ?? e.zone;
      const zone = e.zone.def.kind === 'exterior' ? e.zone : city;
      st = { kind: 'place', label: this.placeName(zone.id, m.x, m.y), zone: zone.id, x: m.x, y: m.y, lastPathAt: 0, tx: NaN, ty: NaN };
    }
    this.setGoal(c, st);
  }

  markPlace(c: PlayerConn, label: string, zone: string, x: number, y: number) {
    this.setGoal(c, { kind: 'place', label, zone, x, y, lastPathAt: 0, tx: NaN, ty: NaN });
  }

  private setGoal(c: PlayerConn, st: GotoState) {
    this.goto.set(c.p!.charId, st);
    this.w.send(c, { t: 'gotoTarget', target: { label: st.label, zone: st.zone, x: st.x, y: st.y } });
    this.w.send(c, { t: 'notice', kind: 'info', text: `Objetivo marcado: ${st.label}. Vas de camino (cualquier orden manual lo cancela).` });
    this.step(c);
  }

  cancel(c: PlayerConn, why?: string) {
    if (!c.p || !this.goto.delete(c.p.charId)) return;
    this.w.send(c, { t: 'gotoTarget', target: null });
    if (why) this.w.send(c, { t: 'notice', kind: 'info', text: why });
  }

  /** Cada segundo: avanza hacia el objetivo marcado. */
  tick() { for (const c of this.w.conns.values()) if (c.p && this.goto.has(c.p.charId)) { try { this.step(c); } catch (err) { if (err instanceof GameError) this.cancel(c, err.message); else throw err; } } }

  private step(c: PlayerConn) {
    const p = c.p!, e = c.e!;
    const st = this.goto.get(p.charId);
    if (!st || c.closed || p.status !== 'alive' || p.sleeping || isSick(p.substances) || e.transit || e.channel || e.pendingInteract !== undefined || e.pendingAction) return;
    if (st.kind === 'person' && st.key) {
      const pos = this.personPos(p, st.key);
      if (pos) { const moved = pos.zone !== st.zone || Math.hypot(pos.x - st.x, pos.y - st.y) > 2; st.zone = pos.zone; st.x = pos.x; st.y = pos.y; if (moved) this.w.send(c, { t: 'gotoTarget', target: { label: st.label, zone: st.zone, x: st.x, y: st.y } }); }
    }
    if (st.kind === 'door') {
      const d = st.door !== undefined ? this.w.entities.get(st.door) : undefined;
      if (d && d.zone === e.zone && Math.hypot(d.x - e.x, d.y - e.y) < 1.5) { this.cancel(c); this.w.handle(c, { t: 'interact', seq: 0, target: d.id } as any); return; }
    }
    // ¿Otra zona? Primero salir a la calle; luego entrar por la puerta que lleva allí.
    if (st.zone !== e.zone.id) {
      if (e.path.length) return;
      if (e.zone.def.kind === 'interior') {
        const exit = [...e.zone.entities].find((o) => o.kind === 'door' && o.doorTo && this.w.zones.get(o.doorTo.zone)?.def.kind === 'exterior');
        if (exit) { this.w.handle(c, { t: 'interact', seq: 0, target: exit.id } as any); return; }
        if (e.zone.def.tower) { void this.w.posts.elevator(c, 0, false).catch(() => {}); return; }
        throw new GameError('No encuentras la salida.');
      }
      const tz = this.w.zones.get(st.zone);
      const lobby = tz?.def.tower ? `${tz.def.tower.id}-p0` : st.zone;
      const door = [...e.zone.entities].find((o) => o.kind === 'door' && o.doorTo?.zone === lobby);
      if (!door) throw new GameError(`${st.label} está en un sitio al que no sabes llegar.`);
      if (Math.hypot(door.x - e.x, door.y - e.y) < 1.5) { this.w.handle(c, { t: 'interact', seq: 0, target: door.id } as any); return; }
      return this.pathTo(c, door.x, door.y, st);
    }
    const dist = Math.hypot(st.x - e.x, st.y - e.y);
    const near = st.kind === 'person' ? 2.5 : 1.8;
    if (dist <= near) {
      const live = st.kind === 'person' && st.key ? this.personPos(p, st.key)?.live : true;
      this.cancel(c, st.kind === 'person' && !live ? `Llegas a donde decían que estaba ${st.label}. Busca por la zona o consigue información más precisa.` : `Has llegado: ${st.label}.`);
      return;
    }
    if (e.path.length && Math.hypot(st.tx - st.x, st.ty - st.y) < 3) return;
    this.pathTo(c, st.x, st.y, st);
  }

  private pathTo(c: PlayerConn, x: number, y: number, st: GotoState) {
    const e = c.e!;
    const now = Date.now();
    if (now - st.lastPathAt < 900) return;
    st.lastPathAt = now;
    st.tx = st.x; st.ty = st.y;
    // Rutas muy largas: tramos de hasta 140 losetas hacia el objetivo.
    let tx = x, ty = y;
    const d = Math.hypot(x - e.x, y - e.y);
    if (d > 140) { tx = e.x + ((x - e.x) / d) * 140; ty = e.y + ((y - e.y) / d) * 140; }
    const dest = nearestWalkable(e.zone.grid, tx, ty, 8);
    if (!dest) throw new GameError('No hay forma de llegar hasta ahí.');
    const r = this.w.playerPath(e, dest.x, dest.y);
    if (!r.ok) {
      // Un tramo más corto suele encontrar camino.
      const half = nearestWalkable(e.zone.grid, e.x + (dest.x - e.x) / 2, e.y + (dest.y - e.y) / 2, 8);
      if (!half || !this.w.playerPath(e, half.x, half.y).ok) throw new GameError(`No encuentras ruta hacia ${st.label}.`);
    }
    if (e.conn) this.w.send(e.conn, { t: 'ack', seq: 0, ok: true, path: e.path });
  }
}
