// v0.5 · Modo automático: la IA controla a tu personaje según su personalidad. Duerme, come, cumple su horario,
// busca encargos de su oficio y asume los riesgos que su carácter le permite (o le pide).
import type { Entity } from './entity.js';
import type { PlayerConn, World } from './world.js';
import { inShift } from './posts.js';
import { GameError } from '../game/effects.js';
import { buildSheet, type PlayerState } from '../game/player.js';

export const PERSONALITIES: Record<string, { name: string; desc: string; maxRisk: number; illegal: boolean; sleepAt: number; stance: 'avoid' | 'defend' | 'aggressive'; crime: number }> = {
  responsable: { name: 'Responsable', desc: 'Cumple su horario, duerme en sitio seguro y evita líos. Solo trabajos legales y tranquilos.', maxRisk: 0.08, illegal: false, sleepAt: 70, stance: 'avoid', crime: 0 },
  ambicioso: { name: 'Ambicioso/a', desc: 'Persigue el dinero: acepta los encargos mejor pagados aunque tengan algo de riesgo.', maxRisk: 0.3, illegal: false, sleepAt: 80, stance: 'defend', crime: 0 },
  temerario: { name: 'Temerario/a', desc: 'Le da igual la ley: trabajos ilegales, peleas y algún robo por la noche. Gana más… o acaba mal.', maxRisk: 1, illegal: true, sleepAt: 88, stance: 'aggressive', crime: 0.12 },
  tranquilo: { name: 'Tranquilo/a', desc: 'Trabaja lo justo, descansa mucho y pasea por la ciudad.', maxRisk: 0.05, illegal: false, sleepAt: 60, stance: 'avoid', crime: 0 },
};

export class Autopilot {
  constructor(private readonly w: World) {}
  private say(c: PlayerConn, text: string) { if (c.p!.auto.status !== text) { c.p!.auto.status = text; this.w.send(c, { t: 'action', text: `🤖 Automático · ${text}` }); } }

  set(c: PlayerConn, on: boolean, personality?: string) {
    const p = c.p!;
    if (personality && !PERSONALITIES[personality]) throw new GameError('Personalidad desconocida.');
    p.auto = { on, personality: personality ?? p.auto.personality, status: '' };
    if (on) {
      const per = PERSONALITIES[p.auto.personality];
      p.stance = per.stance; p.autoNeeds = true;
      this.w.send(c, { t: 'notice', kind: 'good', text: `Modo automático (${per.name}): tu personaje vive solo. Cualquier orden tuya lo desactiva.` });
    } else { this.w.send(c, { t: 'notice', kind: 'info', text: 'Modo automático desactivado: vuelves a tener el control.' }); this.w.send(c, { t: 'action', text: '' }); }
    this.w.send(c, { t: 'sheet', sheet: buildSheet(this.w.c, p) });
  }
  /** Se llama cuando el jugador da una orden manual. */
  takeOver(c: PlayerConn) { if (c.p?.auto.on) this.set(c, false); }

  private busy(e: Entity) { return !!(e.task || e.channel || e.transit || e.pendingInteract !== undefined || e.pendingAction || e.path.length); }
  /** Llega a una zona: sale del interior o entra por la puerta adecuada (la planta de una torre, por el ascensor). */
  private navigate(c: PlayerConn, zoneId: string, label: string): boolean {
    const e = c.e!;
    if (e.zone.id === zoneId) return true;
    const target = this.w.zones.get(zoneId);
    if (!target) return false;
    // Dentro de una torre: ascensor a la planta.
    if (e.zone.def.tower && target.def.tower?.id === e.zone.def.tower.id) { this.say(c, `${label} (ascensor)`); void this.w.posts.elevator(c, target.def.tower.floor, false).catch(() => {}); return false; }
    if (e.zone.def.kind === 'interior') {
      const exit = [...e.zone.entities].find((o) => o.kind === 'door' && o.doorTo && this.w.zones.get(o.doorTo.zone)?.def.kind === 'exterior');
      if (exit) { this.say(c, `${label}: saliendo a la calle`); this.w.handle(c, { t: 'interact', seq: 0, target: exit.id } as any); }
      else if (e.zone.def.tower) void this.w.posts.elevator(c, 0, false).catch(() => {});
      return false;
    }
    const lobby = target.def.tower ? `${target.def.tower.id}-p0` : zoneId;
    const door = [...e.zone.entities].find((o) => o.kind === 'door' && o.doorTo?.zone === lobby);
    if (door) { this.say(c, label); this.w.handle(c, { t: 'interact', seq: 0, target: door.id } as any); }
    return false;
  }

  /** Cada 2 s: decide qué hace cada personaje en automático. */
  tick() {
    for (const c of this.w.conns.values()) {
      const p = c.p, e = c.e;
      if (!p?.auto.on || !e || c.closed || p.status !== 'alive' || p.sleeping || this.busy(e)) continue;
      try { this.decide(c, p, e); } catch (err) { if (!(err instanceof GameError)) console.error('[automático]', err); }
    }
  }
  private decide(c: PlayerConn, p: PlayerState, e: Entity) {
    const per = PERSONALITIES[p.auto.personality] ?? PERSONALITIES.responsable;
    const h = this.w.cityHour();
    // 1. Dormir cuando toca: en casa si tiene, si no en un sitio seguro (o donde caiga, si es temerario).
    if (p.fatigue >= per.sleepAt) {
      const home = p.houses[0];
      if (home) {
        const zid = `casa:${home}`;
        if (e.zone.id === zid) { const bed = [...e.zone.entities].find((o) => o.objKind === 'bed'); if (bed) { this.say(c, 'a dormir en casa'); this.w.handle(c, { t: 'interact', seq: 0, target: bed.id } as any); } return; }
        const mine = this.w.property.houses.get(home);
        if (mine && e.zone.id.startsWith(`portal:${mine.building}:`)) { void this.w.property.enterHouse(c, home).catch(() => {}); return; }
        if (e.zone.def.kind === 'interior') { this.navigate(c, 'vertice', 'volviendo a casa'); return; }
        const exit = this.w.property.streetOf(home);
        if (exit && Math.hypot(exit.at[0] + 0.5 - e.x, exit.at[1] + 0.5 - e.y) > 3) { this.say(c, 'volviendo a casa'); this.w.handle(c, { t: 'move', seq: 0, x: exit.at[0] + 0.5, y: exit.at[1] + 0.5 } as any); return; }
        void this.w.property.enterHouse(c, home).catch(() => {});
        return;
      }
      if (per.maxRisk < 0.5 && this.w.survival.dangerHere(c) !== 'protected') { this.say(c, 'buscando un refugio para dormir'); this.w.handle(c, { t: 'retreat', seq: 0 } as any); return; }
      this.say(c, 'durmiendo'); this.w.handle(c, { t: 'sleep', seq: 0 } as any); return;
    }
    // 2. Turno del puesto fijo.
    const st = this.w.posts.status(p);
    const post = this.w.posts.postOf(p);
    if (post && st?.onShift && !st.worked) {
      if (this.navigate(c, post.zone, `yendo al trabajo (${post.name})`)) { this.say(c, `trabajando: ${post.name}`); void this.w.posts.work(c).catch(() => {}); }
      return;
    }
    // 3. Encargo del oficio (bolsa de empleo).
    if (p.activeJob) {
      const job = this.w.c.jobs.find((j) => j.id === p.activeJob);
      const wp = job && this.w.c.workplaces.find((x) => x.id === job.workplace);
      if (!wp) { p.activeJob = null; return; }
      if (this.navigate(c, wp.zone, `yendo al encargo: ${job!.title}`)) { this.say(c, `encargo: ${job!.title}`); void this.w.survival.jobStart(c).catch(() => { p.activeJob = null; }); }
      return;
    }
    // 4. Temerarios: de noche, algún robo a un transeúnte despistado.
    if (per.crime && (h >= 22 || h < 5) && this.w.survival.rng() < per.crime && e.zone.def.kind === 'exterior') {
      const v = e.zone.query(e.x, e.y, 12).find((o) => o.npcType === 'civil' && o.state !== 'downed');
      if (v) { this.say(c, `robando a ${v.name}`); this.w.handle(c, { t: 'hostile', seq: 0, target: v.id, action: 'rob', opId: `auto-${Date.now()}-${v.id}` } as any); return; }
    }
    // 5. Buscar un encargo acorde a su carácter.
    void this.w.survival.jobsView(c).then(async (v) => {
      const pick = v.jobs.filter((j) => j.available && j.profession === p.profession && j.risk <= per.maxRisk && (j.legal || per.illegal))
        .sort((a, b) => b.pay * b.chance * (p.auto.personality === 'ambicioso' ? 1.5 : 1) - a.pay * a.chance)[0];
      if (pick && h >= 6 && h < 23) { await this.w.survival.jobAccept(c, pick.id); this.say(c, `acepta un encargo: ${pick.title} (${pick.pay} €$)`); return; }
      // 6. Si no hay nada: pasear (o descansar, si es tranquilo).
      if (e.zone.def.kind === 'interior') { this.navigate(c, 'vertice', 'saliendo a la calle'); return; }
      const d = e.zone.districtAt(e.x, e.y);
      const wps = d?.waypoints.length ? d.waypoints : e.zone.def.waypoints;
      const wp = wps[Math.floor(this.w.survival.rng() * wps.length)];
      if (wp) { this.say(c, p.auto.personality === 'tranquilo' ? 'paseando sin prisa' : 'buscando algo que hacer'); this.w.handle(c, { t: 'move', seq: 0, x: wp[0] + 0.5, y: wp[1] + 0.5 } as any); }
    }).catch(() => {});
  }
}
