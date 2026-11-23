// v0.13 · Vida en la calle: conversaciones de verdad entre transeúntes (frase y respuesta), gente que usa el mobiliario
// (se sienta en los bancos, saca algo de la máquina, tira la basura, espera el bus, fuma junto a una farola), reacciones al
// jugador (manos arriba si le apuntas, quejas si le empujas, saludos) y pequeños sucesos: atracos, controles de la PCV y
// discusiones que acaban mal. Todo se decide cerca de los jugadores para no gastar en barrios vacíos.
import { facingToIdx, pedestrianGrid, isWalkable, nearestWalkable, RULES } from '@vertice/shared';
import type { Entity } from './entity.js';
import { powerful, voices } from '../game/voices.js';
import type { World } from './world.js';
import type { Zone } from './zone.js';

type Emote = 'sentado' | 'manos-arriba' | 'telefono' | 'fumar' | 'gesto' | 'brazos' | 'abrir' | 'lanzar';
interface Line { at: number; id: number; text: string; partner?: number }
interface Goal { kind: string; x: number; y: number; face: [number, number]; label: string; emote?: Emote; line?: string; len: [number, number] }
interface StreetEvent { kind: 'atraco' | 'control' | 'pelea'; a: number; b: number; step: number; next: number }

/** Charlas de dos: la primera frase la dice uno y el otro contesta (a veces hay réplica). */
const CONVOS: string[][] = [
  ['¿Has visto lo del tiroteo en el Canal?', 'La PCV ni apareció. Como siempre.', 'Y luego nos piden que paguemos la tasa de seguridad.'],
  ['Me han subido otra vez el alquiler del cubículo.', 'A mí me lo cobran en créditos de empresa. Ni dinero de verdad.'],
  ['¿Te has puesto el chip nuevo de los ojos?', 'Veo los anuncios hasta con los párpados cerrados.', 'Pues dicen que la versión dos es peor.'],
  ['Esta noche hay música en El Relé.', '¿La banda del guitarrista manco? Voy.'],
  ['¿Sabes algo de mi hermano? No contesta.', 'Lo vi en la cola del matasanos de Ferro. Tenía mala cara.'],
  ['Dicen que hay un ciberpsicópata suelto por la Forja.', 'Yo ya no salgo sin el inhibidor.', 'Eso no sirve de nada, que lo sepas.'],
  ['¿Otra vez lloviendo ácido?', 'Es la tercera semana. Se me ha comido la chaqueta.'],
  ['Me ofrecieron un trabajo en la torre Okami.', 'Huye. Allí entra la gente y salen números.'],
  ['¿Me prestas veinte?', 'La última vez que te presté veinte te compraste un implante de uñas.'],
  ['He oído que pagan bien por cromo usado.', 'Sí, si no te importa de dónde salió.'],
  ['Mi abuela dice que antes se veían las estrellas.', 'Tu abuela dice muchas cosas.'],
  ['¿Has probado el ramen del puesto de la esquina?', 'Sabe a pila. Pero a pila buena.'],
];
const PROPS: Record<string, Omit<Goal, 'x' | 'y' | 'face'>[]> = {
  bench: [{ kind: 'bench', label: 'Sentado en el banco', emote: 'sentado', len: [120, 300] }],
  vending: [{ kind: 'vending', label: 'Sacando algo de la máquina', emote: 'abrir', line: '*clonc* …Otra vez se ha tragado la moneda.', len: [30, 60] }],
  atm: [{ kind: 'atm', label: 'Sacando dinero', line: 'Saldo… insuficiente. Genial.', len: [30, 60] }],
  kiosk: [{ kind: 'kiosk', label: 'Comprando en el quiosco', line: 'Uno de algas y un refresco, por favor.', len: [40, 80] }],
  dumpster: [{ kind: 'dumpster', label: 'Tirando la basura', emote: 'lanzar', line: 'Puaj, qué peste.', len: [20, 40] }],
  busstop: [{ kind: 'busstop', label: 'Esperando el bus', emote: 'telefono', len: [120, 260] }, { kind: 'busstop', label: 'Esperando el bus', emote: 'brazos', len: [120, 260] }],
  lamp: [{ kind: 'lamp', label: 'Fumando junto a la farola', emote: 'fumar', len: [80, 180] }],
  billboard: [{ kind: 'billboard', label: 'Mirando un anuncio', line: '¿Implantes a plazos? Ni de broma.', emote: 'brazos', len: [40, 90] }],
  holo: [{ kind: 'holo', label: 'Mirando el holograma', len: [40, 90] }],
  stall: [{ kind: 'stall', label: 'Regateando en un puesto', line: '¿Cuánto? ¡Eso es un robo!', len: [60, 120] }],
};

export class Street {
  private lines: Line[] = [];
  private events: StreetEvent[] = [];
  private nextEvent = new Map<string, number>();
  private said = new Map<number, number>(); // última frase espontánea por PNJ
  private chatUntil=new WeakMap<Entity,number>();
  private aimedAt = new Map<number, number>(); // PNJ con las manos arriba → hasta cuándo
  private idx = new Map<string, Map<string, { type: string; x: number; y: number }[]>>();
  private rng = Math.random;
  constructor(private w: World) {}

  // ================================================================ utilidades
  private say(e: Entity, text: string, delayMs = 0, partner?: Entity) { this.lines.push({ at: Date.now() + delayMs, id: e.id, text, partner:partner?.id }); }
  private emote(e: Entity, move: Emote | undefined) { e.emote = move ? { move: move as any, at: Date.now() } : undefined; e.labelVer++; }
  private label(e: Entity, l: string) { if (e.label !== l) { e.label = l; e.labelVer++; } }
  private face(a: Entity, x: number, y: number) { a.facing = facingToIdx(x - a.x, y - a.y); a.lastMoveTick = this.w.tick; }
  private calm(e: Entity) { return e.kind === 'npc' && !e.dead && e.state !== 'downed' && e.aggro === undefined && !(e.fleeUntil && e.fleeUntil > Date.now()) && !e.carriedBy; }
  private civ(e: Entity) { return this.calm(e) && e.npc?.type === 'ambient'; }
  /** Índice del mobiliario interesante por celdas de 8×8 (se construye una vez por zona). */
  private propsNear(z: Zone, x: number, y: number, r: number) {
    let m = this.idx.get(z.id);
    if (!m) {
      m = new Map();
      for (const p of z.def.props) if (PROPS[p.type]) { const k = `${p.at[0] >> 3},${p.at[1] >> 3}`; (m.get(k) ?? m.set(k, []).get(k)!).push({ type: p.type, x: p.at[0], y: p.at[1] }); }
      this.idx.set(z.id, m);
    }
    const out: { type: string; x: number; y: number }[] = [];
    for (let cx = (x - r) >> 3; cx <= (x + r) >> 3; cx++) for (let cy = (y - r) >> 3; cy <= (y + r) >> 3; cy++) for (const p of m.get(`${cx},${cy}`) ?? []) if (Math.hypot(p.x + 0.5 - x, p.y + 0.5 - y) <= r) out.push(p);
    return out;
  }

  // ================================================================ rutinas con el mobiliario (desde el cerebro del PNJ)
  /** El transeúnte elige algo del entorno que hacer: devuelve true si se ha puesto en camino. */
  pickEnvironment(e: Entity): boolean {
    const near = this.propsNear(e.zone, e.x, e.y, 10);
    if (!near.length) return false;
    const p = near[Math.floor(this.rng() * near.length)];
    const opts = PROPS[p.type];
    const g = opts[Math.floor(this.rng() * opts.length)];
    // Un sitio libre al lado del mueble (en el propio banco, para sentarse).
    const pavement = pedestrianGrid(e.zone.grid, 'stop');
    const seat = { x: p.x + .5, y: p.y + .5 };
    const spot = nearestWalkable(pavement, seat.x + (p.type === 'bench' ? 0 : this.rng() < .5 ? -.9 : .9), seat.y + .9, 2);
    if (!spot || e.zone.query(spot.x, spot.y, .6).some(o => o !== e && o.kind === 'npc')) return false;
    if (!this.w.npcPath(e, spot.x, spot.y)) return false;
    e.goal = { ...g, x: spot.x, y: spot.y, face: [seat.x, seat.y] };
    this.label(e, `De camino: ${g.label.toLowerCase()}`);
    return true;
  }
  /** Llegó a su destino con una tarea del entorno: la hace. Devuelve las décimas de segundo que dura. */
  arrive(e: Entity): number {
    const g = e.goal as Goal | undefined; e.goal = undefined;
    if (!g) return 0;
    this.face(e, g.face[0], g.face[1]);
    if (g.kind === 'bench') e.facing = facingToIdx(0, 1); // mirando a la calle
    this.label(e, g.label);
    this.emote(e, g.emote);
    if (g.line && this.rng() < 0.6) this.say(e, g.line, 600);
    return Math.floor(g.len[0] + this.rng() * (g.len[1] - g.len[0]));
  }
  private dayPart() { const h=this.w.cityHour(); return h>=21||h<6?'noche':'dia'; }
  private temperament(e:Entity) {const t=e.npc?.temperament;return t?(t==='cauto'||t==='nervioso'||t==='metodico'?'caracter:cauto':'caracter:curioso'):e.id%2?'caracter:cauto':'caracter:curioso'; }
  private nearbyTags(e:Entity) {
    const z=e.zone, tags=new Set([this.dayPart(),this.temperament(e),'barrio:'+(z.districtAt(e.x,e.y)?.id??z.id)]);
    for(const p of this.propsNear(z,e.x,e.y,7)) tags.add('cerca:'+p.type);
    if(this.w.c.ripperdocs.some(d=>d.zone===z.id))tags.add('servicio:clinica');
    for(const o of z.query(e.x,e.y,8)){
      if(o===e || o.hiddenIn || o.dead || o.state==='downed' || (o.buffs?.invisible??0)>Date.now())continue;
      const shown=o.kind==='player' && o.weaponId && powerful(this.w.c.items.find(i=>i.id===o.weaponId));
      const cop=o.npcType==='police',chrome=!!o.chrome?.length;
      if(!(shown||cop||chrome)||Math.hypot(o.x-e.x,o.y-e.y)>8||!this.w.combat.lineClear(e,o))continue;
      if(shown)tags.add('arma:potente');
      if(cop)tags.add('policia:visible');
      if(chrome)tags.add('cromo:visible');
    }
    return tags;
  }
  /** Conversación de verdad entre dos transeúntes que se han parado a charlar. */
  converse(a: Entity, b: Entity) {
    if(!this.civ(a)||!this.civ(b)||!this.w.combat.lineClear(a,b))return;
    const now=Date.now();
    if((this.chatUntil.get(a)??0)>now || (this.chatUntil.get(b)??0)>now)return;
    const novel=this.rng()<.95 && voices.conversation(a,this.nearbyTags(a));
    const c=novel||CONVOS[Math.floor(this.rng()*CONVOS.length)];
    const until=now+c.length*3200;
    this.chatUntil.set(a,until); this.chatUntil.set(b,until);
    for(const e of [a,b])if(e.npc)e.npc.pauseUntil=Math.max(e.npc.pauseUntil,this.w.tick+Math.ceil((until-now)*RULES.tickRate/1000));
    this.face(a, b.x, b.y); this.face(b, a.x, a.y);
    this.emote(a, 'gesto'); this.emote(b, 'gesto');
    c.forEach((text, i) => this.say(i % 2 ? b : a, text, 800 + i * 3200, i % 2 ? a : b));
  }

  speak(e:Entity,text:string){this.say(e,text);}
  exchange(a:Entity,b:Entity,text:string[]){
    const now=Date.now(),until=now+5400;
    if(!this.calm(a)||!this.calm(b)||!a.npc||!b.npc||(this.chatUntil.get(a)??0)>now||(this.chatUntil.get(b)??0)>now)return false;
    for(const e of [a,b]){
      this.chatUntil.set(e,until);
      e.npc!.pauseUntil=this.w.tick+Math.ceil((until-now)*RULES.tickRate/1000);
      this.emote(e,'gesto');
    }
    this.face(a,b.x,b.y);this.face(b,a.x,a.y);
    text.forEach((line,i)=>this.say(i%2?b:a,line,600+i*2600,i%2?a:b));
    return true;
  }

  // ================================================================ cada segundo
  everySecond() {
    const now = Date.now();
    // Frases programadas (las de las conversaciones y sucesos) a quien esté cerca.
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const l = this.lines[i]; if (l.at > now) continue;
      this.lines.splice(i, 1);
      const e = this.w.entities.get(l.id);
      if (!e || e.dead || e.state === 'downed') continue;
      if(l.partner!==undefined){
        const b=this.w.entities.get(l.partner);
        if(!b||!this.calm(e)||!this.calm(b)||b.zone!==e.zone||Math.hypot(e.x-b.x,e.y-b.y)>4||!this.w.combat.lineClear(e,b)||this.aimedAt.has(e.id)||this.aimedAt.has(b.id))continue;
      }
      for (const o of e.zone.query(e.x, e.y, 18)) if (o.kind === 'player' && o.conn) this.w.send(o.conn, { t: 'speech', id: e.id, text: l.text });
    }
    for (const z of this.w.zones.values()) {
      if (!z.players.size) continue;
      for (const pe of z.players.values()) this.aroundPlayer(z, pe, now);
      // Sucesos callejeros: uno cada 50–110 s por zona, cerca de algún jugador.
      if (z.def.kind === 'exterior' && now > (this.nextEvent.get(z.id) ?? 0)) { this.nextEvent.set(z.id, now + 50000 + this.rng() * 60000); this.startEvent(z); }
    }
    for (const [id, until] of this.aimedAt) if (until < now) {
      this.aimedAt.delete(id);
      const e = this.w.entities.get(id);
      if (e && !e.dead && e.state !== 'downed') { this.emote(e, undefined); e.fleeUntil = now + 8000; this.label(e, 'Huyendo'); }
    }
    for(const [id,until] of this.said)if(until<=now)this.said.delete(id);
    this.runEvents(now);
  }

  /** Reacciones de la gente a un jugador: manos arriba si le apuntas, quejas si le empujas y algún saludo. */
  private aroundPlayer(z: Zone, pe: Entity, now: number) {
    const p = pe.conn?.p; if (!p || pe.hiddenIn || pe.dead || pe.state==='downed' || (pe.buffs?.invisible??0)>now) return;
    const shown=pe.weaponId ? this.w.c.items.find(i=>i.id===pe.weaponId) : undefined;
    const ranged=shown?.weapon?.kind==='ranged',strong=powerful(shown);
    const dir = (pe.facing * Math.PI) / 4, fx = Math.cos(dir), fy = Math.sin(dir);
    for (const o of z.query(pe.x, pe.y, 10)) {
      if(o.npc?.def?.resident){
        const dx=o.x-pe.x,dy=o.y-pe.y,d=Math.hypot(dx,dy)||.01;
        this.w.cityPeople.nearPlayer(o,pe,!!pe.guard&&ranged&&d<9&&(dx*fx+dy*fy)/d>.82,strong&&d<6);
        continue;
      }
      if (o.kind !== 'npc' || !this.calm(o) || o.npcType === 'gang' || o.npcType === 'police' || o.npcType === 'hierro' || o.npcType === 'essential' || o.predator) continue;
      const dx = o.x - pe.x, dy = o.y - pe.y, d = Math.hypot(dx, dy) || 0.01;
      // Le apuntas con un arma de fuego: manos arriba (y en cuanto bajas el arma, sale corriendo).
      if (pe.guard && ranged && d < 9 && (dx * fx + dy * fy) / d > 0.82 && this.w.combat.lineClear(pe, o)) {
        if (!this.aimedAt.has(o.id)) { this.emote(o, 'manos-arriba'); this.label(o, 'Con las manos arriba'); this.face(o, pe.x, pe.y); this.say(o,voices.reaction(o,new Set(['apuntado']))??'¡Espera!'); if (o.path.length) o.path = []; if (o.npc) o.npc.pauseUntil = this.w.tick + 400; }
        this.aimedAt.set(o.id, now + 2500);
        continue;
      }
      if (o.npc?.type !== 'ambient' || (this.said.get(o.id) ?? 0) > now) continue;
      if (d < 0.75 && pe.moving) { this.said.set(o.id, now + 30000); this.face(o, pe.x, pe.y); this.say(o,voices.reaction(o,new Set(['empujon']))??'¡Cuidado!'); continue; }
      if(this.aimedAt.has(o.id)||(this.chatUntil.get(o)??0)>now)continue;
      if(strong && d<=8 && this.rng()<.22 && this.w.combat.lineClear(pe,o)){
        const trait=this.temperament(o),line=voices.reaction(o,new Set(['arma:potente',trait]));
        if(line){
          this.say(o,line);this.said.set(o.id,now+60000);this.face(o,pe.x,pe.y);
          if(trait==='caracter:cauto'){o.fleeUntil=now+4500;o.path=[];this.label(o,'Busca distancia');}
          else { this.emote(o,'gesto');if(o.npc)o.npc.pauseUntil=this.w.tick+20; }
          continue;
        }
      }
      if (d < 3 && !o.path.length && this.rng() < 0.025) {
        this.said.set(o.id, now + 120000); this.face(o, pe.x, pe.y);
        const tags=this.nearbyTags(o);tags.add('saludo');
        if(p.wanted>=2)tags.add('buscado');
        const line=tags.has('buscado')?voices.comment(o,'buscado',tags):voices.reaction(o,tags);
        if(line)this.say(o,line);
      }
    }
  }

  // ================================================================ sucesos
  private startEvent(z: Zone) {
    const players = [...z.players.values()].filter((p) => !p.hiddenIn);
    if (!players.length) return;
    const pe = players[Math.floor(this.rng() * players.length)];
    const near = [...z.query(pe.x, pe.y, 22)].filter((o) => o.kind === 'npc' && this.calm(o) && Math.hypot(o.x - pe.x, o.y - pe.y) > 5);
    const civs = near.filter((o) => this.civ(o));
    const gang = near.find((o) => o.npcType === 'gang');
    const cop = near.find((o) => o.npcType === 'police' && !o.dispatchedUntil);
    const r = this.rng();
    let a: Entity | undefined, b: Entity | undefined, kind: StreetEvent['kind'];
    if (gang && civs.length && r < 0.45) { kind = 'atraco'; a = gang; b = civs[0]; }
    else if (cop && civs.length && r < 0.8) { kind = 'control'; a = cop; b = civs[0]; }
    else if (civs.length >= 2) { kind = 'pelea'; a = civs[0]; b = civs[1]; }
    else return;
    if (!this.w.npcPath(a, b.x + 0.8, b.y)) return;
    if (b.npc) b.npc.pauseUntil = this.w.tick + 300; b.path = [];
    this.label(a, kind === 'atraco' ? 'Acechando' : kind === 'control' ? 'Control de identidad' : 'Buscando bronca');
    this.events.push({ kind, a: a.id, b: b.id, step: 0, next: Date.now() + 30000 });
  }
  private runEvents(now: number) {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const ev = this.events[i];
      const a = this.w.entities.get(ev.a), b = this.w.entities.get(ev.b);
      const end = () => { this.events.splice(i, 1); if (a && !a.dead) { this.emote(a, undefined); if (a.npc) a.npc.pauseUntil = 0; } if (b && !b.dead) this.emote(b, undefined); };
      if (!a || !b || a.dead || b.dead || a.state === 'downed' || b.state === 'downed' || a.aggro !== undefined || a.zone !== b.zone) { end(); continue; }
      const close = Math.hypot(a.x - b.x, a.y - b.y) < 1.6;
      if (ev.step === 0) {
        if (!close && now < ev.next) continue;
        if (!close) { end(); continue; }
        ev.step = 1; ev.next = now + 9000; a.path = [];
        this.face(a, b.x, b.y); this.face(b, a.x, a.y);
        if (b.npc) b.npc.pauseUntil = this.w.tick + 200;
        if (ev.kind === 'atraco') { this.label(a, 'Atracando'); this.emote(b, 'manos-arriba'); this.label(b, 'Le están atracando'); this.say(a, 'La cartera y el chip de crédito. Ya.'); this.say(b, '¡Por favor, no me hagas daño!', 2500); this.say(a, 'Calladito. Así me gusta.', 5500); }
        else if (ev.kind === 'control') { this.label(b, 'Enseñando la documentación'); this.say(a, 'Control de la PCV. Documentación, por favor.'); this.say(b, 'Sí, agente… aquí tiene.', 2600); this.say(a, 'Circule. Y no me haga volver.', 6200); }
        else { this.emote(a, 'gesto'); this.emote(b, 'gesto'); this.label(a, 'Discutiendo'); this.label(b, 'Discutiendo'); this.say(a, '¿Qué miras tú?'); this.say(b, '¿Algún problema?', 2200); this.say(a, '¡Tú eres mi problema!', 4500); this.say(b, '¡Lárgate antes de que te parta la cara!', 6800); }
        continue;
      }
      if (now < ev.next) continue;
      // Desenlace: el atracador se va con lo robado, la víctima grita; tras el control, cada uno a lo suyo; la pelea acaba en huida.
      if (ev.kind === 'atraco') { this.say(b, '¡Al ladrón! ¡Que alguien lo pare!'); b.fleeUntil = now + 8000; this.emote(b, undefined); const away = nearestWalkable(a.zone.grid, a.x + (this.rng() - 0.5) * 30, a.y + (this.rng() - 0.5) * 30, 4); if (away) this.w.npcPath(a, away.x, away.y); this.label(a, 'Huyendo con el botín'); }
      else if (ev.kind === 'pelea') { const loser = this.rng() < 0.5 ? a : b; this.say(loser, '¡Vale, vale! ¡Me voy!'); loser.fleeUntil = now + 6000; }
      end();
    }
  }
}
