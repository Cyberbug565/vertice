import { diversifyAppearance, findPath, hashString, seededRng, t, type MissionContact, type MissionEncounter } from '@vertice/shared';
import type { Entity } from './entity.js';
import type { PlayerConn, World } from './world.js';

const REACH = 20;
const OFFER_MS = 105_000;
const RETRY_MS = 40_000;
const AFTER_OFFER_MS = 160_000;
const RIDE_SPEED = 8;
interface EncounterView {
  next: number;
  offer?: { def: MissionEncounter; entity?: Entity; until: number };
  sites: Map<string, Entity>;
}

export class Missions {
  private readonly views = new Map<PlayerConn, EncounterView>();

  constructor(private readonly world: World, private readonly rng = Math.random) {}

  private spawn(site: MissionContact, owner?: PlayerConn) {
    const zone = this.world.zones.get(site.zone);
    if (!zone) return;
    const npc = site.kind === 'npc';
    const rng = seededRng(hashString(site.id));
    const pick = <T>(values: T[]) => values[Math.floor(rng() * values.length)];
    const appearance = npc ? {
      body: site.body ?? 'masculino', skin: pick(['#d7a680', '#945f41', '#674836', '#e9bc9a', '#a66e54']),
      hair: pick(['#161721', '#523429', '#75777b', '#302236', '#3b2c20']),
      jacket: pick(['#3c596e', '#5b3747', '#50563f', '#675446', '#2c364e']),
      accent: pick(['#e1a45b', '#72bea8', '#b0cf82', '#c48d88']),
    } : undefined;
    if (appearance) diversifyAppearance(appearance, rng, 'civil');
    return this.world.addEntity(zone, {
      kind: npc ? 'npc' : 'object', npcType: npc ? 'essential' : undefined, appearance,
      name: site.name, title: site.title, dialog: site.dialogue, objKind: npc ? undefined : site.kind,
      x: site.at[0] + .5, y: site.at[1] + .5, interactive: true, label: '', privateTo: owner,
    });
  }

  populate() { for (const site of this.world.c.missionContacts) this.spawn(site); }

  tick(now = Date.now(), roll = this.rng) {
    for (const conn of this.world.conns.values()) {
      const player = conn.p, actor = conn.e;
      if (conn.closed || !actor || !player || player.status !== 'alive' || actor.ghostOf || actor.transit) continue;
      let state = this.views.get(conn);
      if (!state) { state = { next: now, sites: new Map() }; this.views.set(conn, state); }
      const wantedSites = new Set<string>();
      const close = (site: MissionContact) => actor.zone.id === site.zone && Math.hypot(actor.x - site.at[0] - .5, actor.y - site.at[1] - .5) < REACH;
      for (const def of this.world.c.missionEncounters) {
        const progress = player.contracts.get(def.contract)?.state;
        for (const site of def.sites) if (close(site) &&
          (progress === 'active' || progress === 'completed' && site.kind === 'mission-ufo')) {
          wantedSites.add(site.id);
          if (!state.sites.has(site.id)) {
            const entity = this.spawn(site, conn);
            if (entity) state.sites.set(site.id, entity);
          }
        }
      }
      for (const [id, entity] of state.sites) if (!wantedSites.has(id) && conn.dialog?.targetId !== entity.id) {
        this.world.removeEntity(entity);
        state.sites.delete(id);
      }

      const offer = state.offer;
      if (offer) {
        const active = player.contracts.get(offer.def.contract)?.state;
        if ((now > offer.until || actor.zone.id !== offer.def.contact.zone || active === 'completed') && (!offer.entity || conn.dialog?.targetId !== offer.entity.id)) {
          if (offer.entity) this.world.removeEntity(offer.entity);
          state.offer = undefined;
          state.next = now + AFTER_OFFER_MS;
        }
        continue;
      }
      if (now < state.next || player.driving || actor.missionRide || conn.dialog) continue;
      const choices = this.world.c.missionEncounters.filter(def =>
        !player.contracts.has(def.contract) && close(def.contact));
      if (!choices.length) continue;
      state.next = now + RETRY_MS;
      if (roll() >= .52) continue;
      const def = choices[Math.floor(roll() * choices.length)];
      const entity = this.spawn(def.contact, conn);
      if (!entity) continue;
      state.offer = { def, entity, until: now + OFFER_MS };
      this.world.send(conn, { t: 'notice', kind: 'info', text: t(this.world.c, def.rumor) });
    }
  }

  startRide(conn: PlayerConn, id: string) {
    const actor = conn.e!, player = conn.p!;
    const def = this.world.c.missionEncounters.find(e => e.id === id);
    const ride = def?.ride, offer = this.views.get(conn)?.offer;
    if (!ride || offer?.def !== def || player.contracts.get(def.contract)?.state !== 'active' ||
      !offer.entity || actor.zone !== offer.entity.zone || player.driving || player.carrying || actor.missionRide ||
      Math.hypot(actor.x - offer.entity.x, actor.y - offer.entity.y) > 4) {
      this.world.send(conn, { t: 'notice', kind: 'info', text: 'El coche no puede salir ahora. La pista sigue en el diario por si quieres ir andando.' });
      return;
    }
    const path: [number, number][] = [];
    let x = actor.x, y = actor.y;
    for (const [tx, ty] of ride.route) {
      const result = findPath(actor.zone.grid, x, y, tx + .5, ty + .5, 8000);
      if (!result.ok) {
        this.world.send(conn, { t: 'notice', kind: 'info', text: 'El camino está bloqueado. Puedes seguir la pista a pie.' });
        return;
      }
      path.push(...result.path);
      x = tx + .5; y = ty + .5;
    }
    this.world.closeDialog(conn);
    this.world.cancelActivity(actor);
    actor.steer = undefined;
    actor.guard = false;
    actor.missionRide = RIDE_SPEED;
    actor.vehicle = ride.car;
    actor.labelVer++;
    actor.path = path;
    actor.moving = true;
    this.world.survival.refreshMovement(conn);
    this.world.removeEntity(offer.entity);
    offer.entity = undefined;
    this.world.send(conn, { t: 'ack', seq: 0, ok: true, path, info: 'Milo conduce hasta el barranco. Muévete para pedirle que pare.' });
  }

  finishRide(actor: Entity, arrived = false) {
    if (!actor.missionRide) return;
    actor.missionRide = undefined;
    actor.vehicle = null;
    actor.labelVer++;
    actor.path = [];
    actor.moving = false;
    if (!actor.conn || actor.conn.closed) return;
    this.world.survival.refreshMovement(actor.conn);
    this.world.send(actor.conn, { t: 'ack', seq: 0, ok: true, path: [], info: arrived ?
      'Milo aparca junto al terraplén. Baja y busca la luz que sale de la arena.' : 'Milo te deja bajar. Puedes seguir a pie.' });
  }

  disconnect(conn: PlayerConn) {
    const state = this.views.get(conn);
    if (state?.offer?.entity) this.world.removeEntity(state.offer.entity);
    for (const entity of state?.sites.values() ?? []) this.world.removeEntity(entity);
    this.views.delete(conn);
    if (conn.e) this.finishRide(conn.e);
  }
}
