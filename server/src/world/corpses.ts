// v0.13 · Cadáveres: duran una semana de juego, sueltan sangre que se seca a los 50 minutos, se registran por completo
// (dinero, armas, inventario y cromo) en un panel de saqueo, se pueden esconder en contenedores y, si se quedan a la
// vista, cualquiera que pase puede encontrarlos, llamar a la PCV y abrir una investigación con las cámaras de la zona.
// También: rebuscar en la basura y esconderse dentro de un contenedor o una taquilla.
import { randomUUID } from 'node:crypto';
import { dangerAt, nearestWalkable } from '@vertice/shared';
import { GameError } from '../game/effects.js';
import { skillLevel, weaponFits } from '../game/player.js';
import type { Entity } from './entity.js';
import type { PlayerConn, World } from './world.js';
import type { Zone } from './zone.js';

export interface CorpseLoot { money: number; items: Record<string, number>; chrome: string[] }
export interface CorpseInfo {
  diedAt: number; x: number; y: number;
  killer?: { charId: string; name: string; cam: boolean };
  reportedAt?: number; reporter?: number; policeAt?: number; verdictAt?: number; removeAt?: number; done?: boolean;
  lastDripX?: number; lastDripY?: number;
}
export interface BloodSpot { id: number; zone: string; x: number; y: number; r: number; until: number }

/** Sangre: se seca y desaparece a los 50 minutos (tiempo real). */
export const BLOOD_MS = 50 * 60 * 1000;
/** Contenedores donde cabe algo (cuerpos, una persona escondida, basura que rebuscar). */
const CONTAINERS: Record<string, { cap: number; hide: boolean; junk: boolean; name: string }> = {
  dumpster: { cap: 3, hide: true, junk: true, name: 'el contenedor' }, trash: { cap: 1, hide: false, junk: true, name: 'el cubo de basura' },
  barrel: { cap: 1, hide: false, junk: true, name: 'el bidón' }, crate: { cap: 1, hide: false, junk: true, name: 'la caja' },
  locker: { cap: 1, hide: true, junk: false, name: 'la taquilla' }, fridge: { cap: 1, hide: false, junk: false, name: 'la cámara frigorífica' },
};
const REGION_OF: Record<string, string> = { brazo_izq: 'brazos', brazo_der: 'brazos', pierna_izq: 'piernas', pierna_der: 'piernas', ojos: 'ojos', cabeza: 'corteza', torso: 'esqueleto', manos: 'manos', mano_izq: 'manos', mano_der: 'manos' };

export class Corpses {
  blood: BloodSpot[] = [];
  /** Cuerpos escondidos y gente dentro de cada contenedor («zona:x,y»). */
  stuffed = new Map<string, { bodies: string[]; searchedAt?: number }>();
  private nextBlood = 1;
  private rng = Math.random;
  constructor(private w: World) {}

  private get weekMs() { return this.w.c.manifest.cityHourMs * 24 * 7; }

  // ================================================================ muerte, botín y sangre
  /** Un PNJ acaba de morir: se queda una semana de juego, con su botín y un charco de sangre. */
  onDeath(target: Entity, by?: PlayerConn) {
    const now = Date.now();
    target.downedUntil = now + this.weekMs;
    target.corpse = { diedAt: now, x: target.x, y: target.y, killer: by?.p ? { charId: by.p.charId, name: by.p.name, cam: this.w.combat.cameraSees(by.e!) } : undefined };
    target.loot ??= this.makeLoot(target);
    target.searched = false;
    this.addBlood(target.zone, target.x, target.y, 0.9 + this.rng() * 0.6);
    // Tope de cuerpos por zona: los más viejos que nadie ha encontrado se los lleva el servicio de limpieza.
    const bodies = [...target.zone.entities].filter((e) => e.dead && e.corpse).sort((a, b) => a.corpse!.diedAt - b.corpse!.diedAt);
    for (const old of bodies.slice(0, Math.max(0, bodies.length - 80))) if (!old.carriedBy) this.w.removeEntity(old);
  }

  /** Botín completo del cuerpo (lo que llevaba encima de verdad). */
  makeLoot(t: Entity): CorpseLoot {
    const lvl = dangerAt(t.zone.grid, t.x, t.y);
    const mult = lvl === 'lawless' ? 4 : lvl === 'disputed' ? 2 : 1;
    const has = (id: string) => this.w.c.items.some((i) => i.id === id);
    const items: Record<string, number> = {};
    const add = (id: string, n: number) => { if (has(id) && n > 0) items[id] = (items[id] ?? 0) + n; };
    let money = Math.round((5 + (t.level ?? 3) * 6 + this.rng() * 30) * mult * (t.npcType === 'civil' ? 0.6 : 1));
    const wp = t.weaponId ? this.w.c.items.find((i) => i.id === t.weaponId) : undefined;
    if (wp?.weapon && wp.weapon.family !== 'Implante') { add(wp.id, 1); if (wp.weapon.ammo) add(wp.weapon.ammo, Math.round((4 + this.rng() * 10) * mult)); }
    if (t.npcType === 'police' || t.npcType === 'hierro') { const r = (t.zone.def as any).restricted as string | undefined; add(r === 'corporativo' || r === 'banco' ? 'uniforme-seguridad' : r === 'laboratorio' ? 'bata-laboratorio' : 'uniforme-pcv', 1); }
    if (this.rng() < 0.35) add('venda', 1 + Math.floor(this.rng() * 2));
    if (this.rng() < 0.2 * mult) add('estim', 1);
    if (this.rng() < 0.12) add(this.rng() < 0.5 ? 'sutura' : 'antiseptico', 1);
    if (this.rng() < 0.05) add('antibioticos', 1);
    if (this.rng() < 0.3) add(this.rng() < 0.5 ? 'refresco-neon' : 'fideos-krill', 1);
    if (lvl === 'lawless' && this.rng() < 0.5) add('neblina', 1 + Math.floor(this.rng() * 3));
    if (this.rng() < 0.12) add('ganzua-electronica', 1);
    if (t.lootTier) { const k = t.lootTier; money += Math.round((150 + this.rng() * 250) * k * k); add('estim', k >= 3 ? 2 : 1); if (wp?.weapon?.ammo) add(wp.weapon.ammo, 10 * k); }
    // Cromo: el que se le ve (brazos, ojos, piernas…) y, a veces, algo por dentro.
    const chrome = [...(t.lootChrome ?? [])];
    const maxGrade = Math.min(5, 1 + Math.floor((t.level ?? 3) / 8) + (t.lootTier ? 1 : 0));
    const pick = (region: string) => { const pool = this.w.c.cyberware.filter((d) => (d as any).region === region && d.grade <= maxGrade && !chrome.includes(d.id) && !(d as any).unique && !(d as any).mythic); return pool[Math.floor(this.rng() * pool.length)]?.id; };
    for (const part of t.chrome ?? []) { const id = pick(REGION_OF[part] ?? 'esqueleto'); if (id && chrome.length < 5) chrome.push(id); }
    if (this.rng() < (t.npcType === 'civil' ? 0.15 : 0.35)) { const id = pick(['ojos', 'so', 'manos', 'circulatorio'][Math.floor(this.rng() * 4)]); if (id) chrome.push(id); }
    return { money, items, chrome };
  }

  addBlood(z: Zone, x: number, y: number, r: number) {
    const s: BloodSpot = { id: this.nextBlood++, zone: z.id, x, y, r, until: Date.now() + BLOOD_MS };
    this.blood.push(s);
    if (this.blood.length > 4000) this.blood.splice(0, this.blood.length - 4000);
    for (const o of z.players.values()) if (o.conn) this.w.send(o.conn, { t: 'blood', spots: [s] } as any);
  }
  /** Al entrar en una zona: toda la sangre que sigue fresca. */
  sendBlood(c: PlayerConn) {
    const now = Date.now(), zone = c.e?.zone.id;
    this.w.send(c, { t: 'blood', reset: true, spots: this.blood.filter((s) => s.zone === zone && s.until > now) } as any);
  }

  // ================================================================ registrar el cuerpo
  private near(c: PlayerConn, t: Entity, d = 2.5) { if (t.zone !== c.e!.zone || Math.hypot(t.x - c.e!.x, t.y - c.e!.y) > d) throw new GameError('Acércate al cuerpo.'); }
  /** Abre el panel de saqueo (como tu inventario, pero el del cuerpo). */
  view(c: PlayerConn, t: Entity) {
    const p = c.p!;
    this.near(c, t);
    if (!t.dead && t.state !== 'downed') throw new GameError('Solo puedes registrar a alguien caído.');
    if (this.w.playerOf(t)) throw new GameError('A otro jugador se le roba con «Robar».');
    if (!t.loot) {
      t.loot = this.makeLoot(t);
      // Registrar a un civil inconsciente a la vista es un delito.
      if (!t.dead && (t.npcType === 'civil' || (t.faction && t.npcType !== 'gang'))) (this.w.combat as any).crime(c, t, false, 'attempt');
    }
    const L = t.loot, rep = skillLevel(p, 'reparacion');
    const name = (id: string) => this.w.c.items.find((i) => i.id === id)?.name ?? id;
    const items = Object.entries(L.items).filter(([, n]) => n > 0).map(([id, qty]) => {
      const def = this.w.c.items.find((i) => i.id === id);
      const block = def?.weapon ? weaponFits(this.w.c, p, id, qty) : undefined;
      return { id, name: name(id), qty, kind: def?.weapon ? 'arma' : def?.wear ? 'ropa' : def?.category ?? 'objeto', weight: def?.weight ?? 0, blocked: block || undefined };
    });
    const chrome = L.chrome.map((id) => { const d = this.w.c.cyberware.find((x) => x.id === id)!; const need = d.grade * 4; return { id, name: d.name, grade: d.grade, region: (d as any).region, need, blocked: rep < need ? `Extraerlo sin romperlo requiere Reparación ${need} (tienes ${rep})` : undefined }; });
    this.w.send(c, { t: 'lootView', target: t.id, name: t.name, dead: !!t.dead, money: L.money, items, chrome } as any);
  }

  /** Coger una cosa (o todo lo que se pueda) del cuerpo. */
  async take(c: PlayerConn, t: Entity, kind: 'money' | 'item' | 'chrome' | 'all', id?: string) {
    const p = c.p!;
    this.near(c, t);
    if (!t.loot) throw new GameError('Primero regístralo.');
    const L = t.loot, got: string[] = [], skipped: string[] = [];
    const takeMoney = async () => { if (L.money > 0) { const m = L.money; L.money = 0; await (this.w.combat as any).credit(p, m, `botin-${randomUUID()}`, `Registro de ${t.name}`); got.push(`${m} €$`); } };
    const takeItem = async (item: string) => {
      const qty = L.items[item] ?? 0; if (!qty) return;
      const def = this.w.c.items.find((i) => i.id === item); if (!def) return;
      const block = def.weapon ? weaponFits(this.w.c, p, item, qty) : undefined;
      if (block) { skipped.push(`${def.name}: ${block}`); return; }
      delete L.items[item];
      p.inventory.set(item, (p.inventory.get(item) ?? 0) + qty);
      await this.w.db.query('INSERT INTO inventory_items (id, character_id, def_id, qty) VALUES ($1,$2,$3,$4) ON CONFLICT (character_id, def_id) DO UPDATE SET qty = inventory_items.qty + EXCLUDED.qty', [randomUUID(), p.charId, item, qty]);
      got.push(`${qty > 1 ? `${qty}× ` : ''}${def.name}`);
    };
    const takeChrome = async (cid: string) => {
      if (!L.chrome.includes(cid)) return;
      const d = this.w.c.cyberware.find((x) => x.id === cid)!;
      const need = d.grade * 4, have = skillLevel(p, 'reparacion');
      if (have < need) { skipped.push(`${d.name}: requiere Reparación ${need}`); return; }
      L.chrome = L.chrome.filter((x) => x !== cid);
      if (t.lootChrome) t.lootChrome = t.lootChrome.filter((x) => x !== cid);
      const instId = randomUUID();
      await this.w.db.query('INSERT INTO cyberware_instances (id, def_id, character_id, location, stolen, history) VALUES ($1,$2,$3,$4,$5,$6)',
        [instId, d.id, p.charId, 'inventory', true, JSON.stringify([{ at: new Date().toISOString(), event: `extraído del cuerpo de ${t.name}` }])]);
      p.cyber.push({ id: instId, def: d.id, location: 'inventory', stolen: true });
      this.w.progress.gain(p, 'reparacion', 8 + d.grade * 4);
      got.push(`Implante: ${d.name} (sin instalar)`);
    };
    if (kind === 'money' || kind === 'all') await takeMoney();
    if (kind === 'item' && id) await takeItem(id);
    if (kind === 'chrome' && id) await takeChrome(id);
    if (kind === 'all') { for (const it of Object.keys(L.items)) await takeItem(it); for (const ch of [...L.chrome]) await takeChrome(ch); }
    if (!got.length && skipped.length) throw new GameError(skipped[0]);
    t.searched = L.money === 0 && !Object.keys(L.items).length && !L.chrome.length;
    if (got.length) { this.w.progress.gain(p, 'percepcion', 1); this.w.send(c, { t: 'notice', kind: 'good', text: `Coges: ${got.join(', ')}.${skipped.length ? ` (${skipped.join('; ')})` : ''}` }); }
    this.w.send(c, { t: 'sheet', sheet: (this.w.survival as any).sheetOf(p) });
    this.view(c, t);
  }

  // ================================================================ contenedores
  private containerNear(c: PlayerConn) {
    const e = c.e!, z = e.zone;
    let best: { key: string; type: string; x: number; y: number; d: number } | null = null;
    const consider = (type: string, x: number, y: number) => {
      if (!CONTAINERS[type]) return;
      const d = Math.hypot(x + 0.5 - e.x, y + 0.5 - e.y);
      if (d <= 1.9 && (!best || d < best.d)) best = { key: `${z.id}:${x},${y}`, type, x, y, d };
    };
    for (const p of z.def.props) consider(p.type, p.at[0], p.at[1]);
    for (const o of z.def.objects) if (o.kind === 'trash') consider('trash', o.at[0], o.at[1]);
    return best as { key: string; type: string; x: number; y: number; d: number } | null;
  }
  async container(c: PlayerConn, action: 'body' | 'search' | 'hide' | 'out') {
    const p = c.p!, e = c.e!;
    if (action === 'out') return this.leaveHiding(c, true);
    const box = this.containerNear(c);
    if (!box) throw new GameError('No hay ningún contenedor a mano.');
    const def = CONTAINERS[box.type];
    const st = this.stuffed.get(box.key) ?? { bodies: [] };
    this.stuffed.set(box.key, st);
    if (action === 'body') {
      const t = p.carrying ? this.w.entities.get(p.carrying) : undefined;
      if (!t) throw new GameError('No llevas ningún cuerpo.');
      if (!t.dead) throw new GameError('Está vivo: no puedes meterlo ahí. Remátalo o déjalo en el suelo.');
      if (st.bodies.length >= def.cap) throw new GameError(`En ${def.name} ya no cabe nadie más.`);
      p.carrying = null; t.carriedBy = undefined;
      st.bodies.push(t.name);
      this.w.removeEntity(t);
      this.w.progress.gain(p, 'sigilo', 6);
      // Si alguien te ve hacerlo, cuenta como si te hubiera visto matar.
      const wit = this.w.stealth.witnesses(e, 1.5, undefined);
      if (wit.seen.length) { this.w.stealth.remember(c, wit.seen, 'esconder un cadáver'); this.w.send(c, { t: 'notice', kind: 'bad', text: '👁 Alguien te ha visto meter un cuerpo en la basura.' }); }
      else this.w.send(c, { t: 'notice', kind: 'good', text: `🤫 Metes el cuerpo en ${def.name}. Nadie lo encontrará… de momento.` });
      this.w.send(c, { t: 'sheet', sheet: (this.w.survival as any).sheetOf(p) });
      return;
    }
    if (action === 'search') {
      if (!def.junk) throw new GameError(`En ${def.name} no hay nada que rebuscar.`);
      if (st.bodies.length) { this.w.motion(e,'abrir'); this.w.send(c, { t: 'notice', kind: 'warn', text: `Levantas la tapa… y hay un cadáver dentro (${st.bodies.join(', ')}). Mejor cerrarla.` }); return; }
      if (st.searchedAt && Date.now() - st.searchedAt < 10 * 60 * 1000) throw new GameError('Ya lo has revuelto hace poco: solo quedan bolsas vacías.');
      this.w.motion(e,'abrir');
      st.searchedAt = Date.now();
      const table: [string, number, number][] = [['chatarra', 0.45, 3], ['fideos-krill', 0.15, 1], ['refresco-neon', 0.15, 1], ['bala-pistola', 0.12, 8], ['venda', 0.1, 1], ['neblina', 0.04, 1], ['ganzua-electronica', 0.03, 1]];
      const found: string[] = [];
      for (const [id, ch, n] of table) if (this.rng() < ch && this.w.c.items.some((i) => i.id === id)) {
        const qty = 1 + Math.floor(this.rng() * n);
        p.inventory.set(id, (p.inventory.get(id) ?? 0) + qty);
        await this.w.db.query('INSERT INTO inventory_items (id, character_id, def_id, qty) VALUES ($1,$2,$3,$4) ON CONFLICT (character_id, def_id) DO UPDATE SET qty = inventory_items.qty + EXCLUDED.qty', [randomUUID(), p.charId, id, qty]);
        found.push(`${qty > 1 ? `${qty}× ` : ''}${this.w.c.items.find((i) => i.id === id)!.name}`);
      }
      this.w.progress.gain(p, 'percepcion', 1);
      this.w.send(c, { t: 'notice', kind: found.length ? 'good' : 'info', text: found.length ? `Rebuscas en ${def.name}: ${found.join(', ')}.` : `Rebuscas en ${def.name}: solo basura y olor a fritanga.` });
      this.w.send(c, { t: 'sheet', sheet: (this.w.survival as any).sheetOf(p) });
      return;
    }
    // Esconderse dentro: nadie te ve mientras estés quieto ahí.
    if (!def.hide) throw new GameError(`En ${def.name} no cabe una persona.`);
    if (p.carrying) throw new GameError('Suelta antes el cuerpo.');
    if (st.bodies.length >= def.cap) throw new GameError(`${def.name[0].toUpperCase()}${def.name.slice(1)} está lleno.`);
    e.hiddenIn = box.key; e.steer = undefined; e.path = []; e.moving = false;
    e.x = box.x + 0.5; e.y = box.y + 0.5; e.zone.moved(e);
    p.buffs.escondido = Date.now() + 24 * 3600 * 1000; e.buffs = p.buffs; (this.w.combat as any).bump(e);
    this.w.send(c, { t: 'notice', kind: 'good', text: `Te metes en ${def.name}. Nadie te ve mientras sigas dentro (E o moverte para salir).` });
    this.w.send(c, { t: 'sheet', sheet: (this.w.survival as any).sheetOf(p) });
  }
  leaveHiding(c: PlayerConn, notify = true) {
    const p = c.p!, e = c.e!;
    if (!e.hiddenIn) { if (notify) throw new GameError('No estás escondido.'); return; }
    e.hiddenIn = undefined; delete p.buffs.escondido; e.buffs = p.buffs; (this.w.combat as any).bump(e);
    const at = nearestWalkable(e.zone.grid, e.x, e.y + 0.9, 3);
    if (at) { e.x = at.x; e.y = at.y; e.zone.moved(e); }
    if (notify) this.w.send(c, { t: 'notice', kind: 'info', text: 'Sales del escondite.' });
    this.w.send(c, { t: 'sheet', sheet: (this.w.survival as any).sheetOf(p) });
  }

  // ================================================================ cada segundo: hallazgos, investigación, sangre
  everySecond() {
    const now = Date.now();
    this.blood = this.blood.filter((s) => s.until > now);
    for (const z of this.w.zones.values()) {
      if (!z.players.size) continue;
      for (const t of z.entities) {
        if (!t.dead || !t.corpse) continue;
        const k = t.corpse;
        // Rastro de sangre mientras lo arrastras (los primeros 15 minutos).
        if (t.carriedBy && now - k.diedAt < 15 * 60 * 1000 && Math.hypot(t.x - (k.lastDripX ?? k.x), t.y - (k.lastDripY ?? k.y)) > 1.6) { k.lastDripX = t.x; k.lastDripY = t.y; this.addBlood(z, t.x, t.y, 0.25 + this.rng() * 0.2); }
        if (k.done || t.carriedBy) continue;
        if (!k.reportedAt) this.discover(z, t);
        else this.investigate(z, t);
      }
    }
  }
  /** ¿Lo ve alguien que no sea del barrio sin ley? Grita, huye y llama a la PCV. */
  private discover(z: Zone, t: Entity) {
    const lvl = dangerAt(z.grid, t.x, t.y);
    if (lvl === 'lawless' || Date.now() - t.corpse!.diedAt < 4000) return;
    for (const o of z.query(t.x, t.y, 8)) {
      if (o.kind !== 'npc' || o.dead || o.state === 'downed' || o.aggro !== undefined || o === t) continue;
      if (o.npcType === 'gang' || o.npcType === 'psycho' || o.predator) continue;
      if (!this.w.combat.lineClear(o, t)) continue;
      if (lvl === 'disputed' && this.rng() < 0.6) continue; // en las zonas rojas, muchos miran hacia otro lado
      const k = t.corpse!;
      k.reportedAt = Date.now(); k.reporter = o.id;
      const cop = o.npcType === 'police' || o.npcType === 'hierro';
      const line = cop ? 'Central, tengo un cadáver. Solicito unidad forense.' : ['¡Dios! ¡Hay un muerto!', '¡Un cadáver! ¡Que alguien llame a la PCV!', '¿Eso es… sangre? ¡Policía!', '¡Está muerto! ¡Está muerto!'][Math.floor(this.rng() * 4)];
      for (const pl of z.query(o.x, o.y, 22)) if (pl.kind === 'player' && pl.conn) this.w.send(pl.conn, { t: 'speech', id: o.id, text: line });
      if (!cop) o.fleeUntil = Date.now() + 8000;
      k.policeAt = Date.now() + (cop ? 3000 : 15000 + this.rng() * 15000);
      for (const pl of z.query(t.x, t.y, 40)) if (pl.kind === 'player' && pl.conn) this.w.send(pl.conn, { t: 'notice', kind: 'warn', text: `📞 Alguien ha encontrado el cadáver de ${t.name} y ha llamado a la PCV.` });
      const killer = k.killer && [...this.w.conns.values()].find((c) => c.p?.charId === k.killer!.charId);
      if (killer && killer.e?.zone !== z) this.w.send(killer, { t: 'notice', kind: 'warn', text: `📞 Han encontrado el cadáver de ${t.name}. La PCV va a investigar.` });
      return;
    }
  }
  /** La PCV acordona la escena, revisa las cámaras cercanas y luego se lleva el cuerpo. */
  private investigate(z: Zone, t: Entity) {
    const k = t.corpse!, now = Date.now();
    if (k.policeAt && now >= k.policeAt && !k.verdictAt) {
      k.policeAt = undefined;
      for (let i = 0; i < 2; i++) {
        const at = nearestWalkable(z.grid, t.x + (i ? 1.6 : -1.4), t.y + (i ? 0.8 : 1.2), 4);
        if (!at) continue;
        const cop = this.w.combat.spawnFactionNpc(z, 'pcv', 'police', undefined, at);
        if (cop) { cop.dispatchedUntil = now + 4 * 60 * 1000; cop.respawn = undefined; cop.label = i ? 'Forense de la PCV' : 'Investigando'; }
      }
      for (const pl of z.query(t.x, t.y, 30)) if (pl.kind === 'player' && pl.conn) this.w.send(pl.conn, { t: 'notice', kind: 'info', text: `🚓 La PCV acordona la escena del crimen de ${t.name} y revisa las cámaras.` });
      k.verdictAt = now + 15000;
      return;
    }
    if (k.verdictAt && now >= k.verdictAt && !k.removeAt) {
      k.removeAt = now + 2 * 60 * 1000;
      // Cámaras que veían el lugar (o que te grabaron al matar).
      const camNow = [...z.query(k.x, k.y, 14)].some((o) => o.objKind === 'camera' && (o.disabledUntil ?? 0) < now && this.w.combat.lineClear(o, { ...t, x: k.x, y: k.y } as Entity));
      const killer = k.killer && [...this.w.conns.values()].find((c) => c.p?.charId === k.killer!.charId);
      const caught = !!k.killer && (k.killer.cam || camNow);
      if (caught && killer?.p) {
        const ef = killer.p;
        const ghost = (ef.buffs.invisible ?? 0) > now;
        if (!ghost) void this.w.combat.identify(killer, 'asesinato');
        else this.w.send(killer, { t: 'notice', kind: 'good', text: `🎥 La PCV revisa las cámaras por la muerte de ${t.name}… y solo ve una silueta borrosa.` });
      } else if (killer) this.w.send(killer, { t: 'notice', kind: 'good', text: `🎥 La PCV ha revisado las cámaras por la muerte de ${t.name}: no hay pistas.` });
      for (const pl of z.query(t.x, t.y, 30)) if (pl.kind === 'player' && pl.conn && pl.conn !== killer) this.w.send(pl.conn, { t: 'notice', kind: 'info', text: caught ? `🎥 Las cámaras han grabado a quien mató a ${t.name}.` : `🎥 La investigación por ${t.name} sigue abierta: sin imágenes.` });
      return;
    }
    if (k.removeAt && now >= k.removeAt) { k.done = true; if (!t.carriedBy) this.w.removeEntity(t); }
  }
}
