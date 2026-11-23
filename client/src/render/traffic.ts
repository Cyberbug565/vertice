// v0.19 · Tráfico rodado por una red de calles conectada: los coches siguen su carril, giran en los cruces (nunca
// desaparecen al acabar un tramo), paran en rojo antes del paso de peatones, guardan distancia con el de delante y
// frenan si hay alguien en la calzada. Solo existen alrededor de la cámara (un radio amplio) y aparecen y se van con un
// fundido. Los semáforos se dibujan en cada paso de peatones con su luz para coches y para peatones (ver shared/traffic).
import { Container, Graphics, Sprite } from 'pixi.js';
import { carLight, walkLight, worldToScreen, type RoadAxis, type ZoneDef } from '@vertice/shared';
import { drawBox, shade } from './art';
import { vehicleSprite } from './vehicle-art';
import { content } from '../content';
import type { CarDef } from '@vertice/shared';

interface Road { x: number; y: number; w: number; h: number; horiz: boolean; width: number; perDir: number; a0: number; a1: number; cross: { r: Road; a0: number; a1: number }[]; stops: { at0: number; at1: number; cx: number; cy: number }[] }
interface Car { r: Road; dir: 1 | -1; lane: number; s: number; v: number; vmax: number; alpha: number; out: boolean; t0: number; o0: number; k0: number; g: Graphics; drawn: string; def: CarDef; sprite: Sprite; rx: number; ry: number; turn: { r: Road; dir: 1 | -1; at: number } | null; decided: Road | null }
interface Signal { cx: number; cy: number; axis: RoadAxis; px: number; py: number; qx: number; qy: number }

const R_LIVE = 44, R_GONE = 50, FADE = 1.1;
const streetCars = content.cars.filter(c => c.traffic > 0);
const totalWeight = streetCars.reduce((sum, c) => sum + c.traffic, 0);
function randomCar() {
  let roll = Math.random() * totalWeight;
  return streetCars.find(c => (roll -= c.traffic) <= 0) ?? streetCars[0];
}

export class Traffic {
  private roads: Road[] = [];
  private cars: Car[] = [];
  private signals: Signal[] = [];
  private lightsG = new Graphics();
  private marks = new Graphics();
  private lastLights = 0;
  constructor(private zone: ZoneDef, private layer: Container, private count: number) {
    this.build();
    layer.addChildAt(this.marks, 0);
    layer.addChild(this.lightsG);
  }

  private build() {
    const z = this.zone;
    // (Los tramos que repiten parte de otra calle, como las uniones de v0.20, no son calles aparte.)
    const inside = (a: number[], b: number[]) => a !== b && a[0] >= b[0] && a[1] >= b[1] && a[0] + a[2] <= b[0] + b[2] && a[1] + a[3] <= b[1] + b[3];
    const asphalt = z.ground.filter((g) => g.type === 'asphalt');
    this.roads = asphalt.filter((g) => Math.min(g.rect[2], g.rect[3]) >= 3 && Math.max(g.rect[2], g.rect[3]) >= 12 && !asphalt.some((o) => inside(g.rect, o.rect))).map((g) => {
      const [x, y, w, h] = g.rect, horiz = w >= h, width = horiz ? h : w;
      return { x, y, w, h, horiz, width, perDir: width >= 6 ? 2 : 1, a0: horiz ? x : y, a1: horiz ? x + w : y + h, cross: [], stops: [] };
    });
    // Cruces: tramos de las calzadas perpendiculares que se solapan con la banda de cada calzada.
    for (const r of this.roads) for (const o of this.roads) {
      if (o === r || o.horiz === r.horiz) continue;
      const overlap = r.horiz ? o.x < r.x + r.w && r.x < o.x + o.w && o.y <= r.y + r.h && r.y <= o.y + o.h : o.y < r.y + r.h && r.y < o.y + o.h && o.x <= r.x + r.w && r.x <= o.x + o.w;
      if (overlap) r.cross.push({ r: o, a0: r.horiz ? o.x : o.y, a1: r.horiz ? o.x + o.w : o.y + o.h });
    }
    for (const r of this.roads) r.cross.sort((a, b) => a.a0 - b.a0);
    // Líneas de detención: cada paso de peatones y cada cruce (los coches paran antes si su semáforo no está en verde).
    for (const c of z.ground.filter((g) => g.type === 'crosswalk')) {
      const [x, y, w, h] = c.rect, cx = x + w / 2, cy = y + h / 2;
      const r = this.roads.find((rr) => cx >= rr.x && cx <= rr.x + rr.w && cy >= rr.y && cy <= rr.y + rr.h && (rr.horiz ? h >= w : w >= h));
      if (!r) continue;
      r.stops.push({ at0: r.horiz ? x : y, at1: r.horiz ? x + w : y + h, cx, cy });
      // Semáforo en las dos aceras, a la entrada del paso.
      const axis: RoadAxis = r.horiz ? 'h' : 'v';
      const ends = r.horiz ? [[cx - 1.4, r.y - 0.4], [cx + 1.4, r.y + r.h + 0.4]] : [[r.x - 0.4, cy + 1.4], [r.x + r.w + 0.4, cy - 1.4]];
      this.signals.push({ cx, cy, axis, px: ends[0][0], py: ends[0][1], qx: ends[1][0], qy: ends[1][1] });
    }
    for (const r of this.roads) {
      for (const c of r.cross) if (!r.stops.some((s) => s.at1 > c.a0 - 3 && s.at0 < c.a1 + 3)) r.stops.push({ at0: c.a0, at1: c.a1, cx: r.horiz ? (c.a0 + c.a1) / 2 : r.x + r.w / 2, cy: r.horiz ? r.y + r.h / 2 : (c.a0 + c.a1) / 2 });
      r.stops.sort((a, b) => a.at0 - b.at0);
    }
    this.drawMarks();
  }

  /** Marcas viales: doble línea continua central, discontinuas entre carriles y líneas de detención. */
  private drawMarks() {
    const mk = this.marks;
    const inCross = (r: Road, t: number) => r.cross.some((c) => t >= c.a0 - 0.2 && t <= c.a1 + 0.2);
    const line = (r: Road, off: number, dashed: boolean, color: number, width: number) => {
      for (let t = r.a0 + 0.3; t < r.a1 - 0.3; t += dashed ? 1.6 : 0.5) {
        const seg = dashed ? 0.8 : 0.5;
        if (inCross(r, t) || inCross(r, t + seg) || r.stops.some((s) => t + seg > s.at0 && t < s.at1)) continue;
        const a = r.horiz ? worldToScreen(t, r.y + off) : worldToScreen(r.x + off, t), b = r.horiz ? worldToScreen(t + seg, r.y + off) : worldToScreen(r.x + off, t + seg);
        mk.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width, color, alpha: 0.95 });
      }
    };
    for (const r of this.roads) {
      const mid = r.width / 2;
      line(r, mid - 0.07, false, 0xffd23f, 1.8); line(r, mid + 0.07, false, 0xffd23f, 1.8);
      if (r.perDir === 2) { line(r, mid / 2, true, 0xf0f0ff, 1.6); line(r, mid + mid / 2, true, 0xf0f0ff, 1.6); }
      // Línea de detención blanca antes de cada paso (en el lado de llegada de cada sentido).
      for (const s of r.stops) for (const [at, half] of [[s.at0 - 0.5, 1], [s.at1 + 0.5, 0]] as const) {
        const o0 = half ? mid : 0, o1 = half ? r.width : mid;
        const a = r.horiz ? worldToScreen(at, r.y + o0) : worldToScreen(r.x + o0, at), b = r.horiz ? worldToScreen(at, r.y + o1) : worldToScreen(r.x + o1, at);
        mk.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 2.4, color: 0xf0f0ff, alpha: 0.8 });
      }
    }
  }

  private lanePos(r: Road, dir: 1 | -1, lane: number) {
    const mid = r.width / 2;
    const off = dir > 0 ? mid + (lane + 0.5) * (mid / r.perDir) : mid - (lane + 0.5) * (mid / r.perDir);
    return (r.horiz ? r.y : r.x) + off;
  }
  private pos(c: Car): [number, number] { const l = this.lanePos(c.r, c.dir, c.lane); return c.r.horiz ? [c.s, l] : [l, c.s]; }

  private spawn(c: Car | null, cx: number, cy: number): Car | null {
    const near = this.roads.filter((r) => (r.horiz ? Math.abs(r.y + r.h / 2 - cy) < R_LIVE && r.x < cx + R_LIVE && r.x + r.w > cx - R_LIVE : Math.abs(r.x + r.w / 2 - cx) < R_LIVE && r.y < cy + R_LIVE && r.y + r.h > cy - R_LIVE));
    if (!near.length) return null;
    for (let tries = 0; tries < 8; tries++) {
      const r = near[Math.floor(Math.random() * near.length)];
      const center = r.horiz ? cx : cy;
      const lo = Math.max(r.a0 + 1, center - R_LIVE + 4), hi = Math.min(r.a1 - 1, center + R_LIVE - 4);
      if (hi <= lo) continue;
      const s = lo + Math.random() * (hi - lo);
      const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1, lane = Math.floor(Math.random() * r.perDir);
      if (this.cars.some((o) => o !== c && o.r === r && o.dir === dir && o.lane === lane && Math.abs(o.s - s) < 4)) continue;
      const def = randomCar();
      const vmax = Math.min(7.8, 2.05 + def.speed * .95 + lane * .65 + Math.random());
      const car: Car = c ?? { r, dir, lane, s, v: 0, vmax, alpha: 0, out: false, t0: 0, o0: 0, k0: 0, g: new Graphics(), drawn: '', def, sprite: new Sprite(), rx: 0, ry: 0, turn: null, decided: null };
      Object.assign(car, { r, dir, lane, s, v: vmax * 0.6, vmax, def, alpha: 0, out: false, t0: performance.now(), turn: null, decided: null });
      const [x, y] = this.pos(car); car.rx = x; car.ry = y;
      car.sprite.anchor.set(.5);
      car.sprite.visible = false;
      if (!c) { car.g.addChild(car.sprite); this.layer.addChild(car.g); }
      return car;
    }
    return null;
  }

  private draw(c: Car) {
    const direction = (c.r.horiz ? 0 : 1) + (c.dir < 0 ? 2 : 0);
    const texture = vehicleSprite(c.def.model, direction);
    c.sprite.visible = !!texture;
    if (texture) c.sprite.texture = texture;
    const key = `${c.def.id}:${direction}:${!!texture}`;
    if (c.drawn === key) return;
    c.drawn = key;
    const g = c.g; g.clear();
    if (texture) { g.ellipse(0, 0, 17, 7).fill({ color: 0x050713, alpha: .38 }); return; }
    const color = parseInt(c.def.color.slice(1), 16);
    const [lx, ly] = c.r.horiz ? [1.35, 0.62] : [0.62, 1.35];
    drawBox(g, -lx / 2, -ly / 2, lx, ly, 0.05, 0.36, color); drawBox(g, -lx * 0.3, -ly * 0.3, lx * 0.6, ly * 0.6, 0.41, 0.26, shade(color, 0.55));
    const fx = c.r.horiz ? 0.66 * c.dir : 0, fy = c.r.horiz ? 0 : 0.66 * c.dir;
    const head = worldToScreen(fx, fy, 0.25), tail = worldToScreen(-fx, -fy, 0.25);
    g.circle(head.x, head.y, 2.6).fill(0xfff1c0); g.circle(tail.x, tail.y, 2.1).fill(0xff3040);
  }

  /** Avanza el tráfico. `people` son las posiciones de personas en la calle (los coches frenan si hay alguien delante). */
  update(dt: number, now: number, cx: number, cy: number, people: { x: number; y: number }[], motion = 1, visibleAt: (x: number, y: number) => boolean = () => true) {
    dt = Math.min(0.1, dt) * motion;
    // Población alrededor de la cámara.
    while (this.cars.length < this.count) { const c = this.spawn(null, cx, cy); if (!c) break; this.cars.push(c); }
    for (const c of this.cars) {
      const [x, y] = this.pos(c);
      const far = Math.hypot(x - cx, y - cy);
      if (!c.out && far > R_GONE) c.out = true;
      // Fundido por tiempo real (no por fotogramas): entra en FADE s y se va en algo menos.
      const tn = performance.now();
      if (c.out) { if (!c.o0) c.o0 = tn; c.alpha = c.k0 * Math.max(0, 1 - (tn - c.o0) / (FADE * 650)); }
      else { c.alpha = Math.min(1, (tn - c.t0) / (FADE * 1000)); c.k0 = c.alpha; }
      if (c.out && c.alpha <= 0) { c.o0 = 0; this.spawn(c, cx, cy) ?? (c.alpha = 0); continue; }
      this.drive(c, dt, now, people);
      // Posición dibujada: se acerca a la lógica con suavidad (así los giros trazan una curva).
      const [tx, ty] = this.pos(c), k = Math.min(1, dt * 5);
      c.rx += (tx - c.rx) * k; c.ry += (ty - c.ry) * k;
      const p = worldToScreen(c.rx, c.ry);
      c.g.position.set(p.x, p.y); c.g.alpha = c.alpha; c.g.visible = c.alpha > 0.01 && visibleAt(c.rx, c.ry);
      if (c.g.visible) this.draw(c);
    }
    if (now - this.lastLights > 200) { this.lastLights = now; this.drawLights(now, cx, cy); }
  }

  private drive(c: Car, dt: number, now: number, people: { x: number; y: number }[]) {
    const r = c.r, dir = c.dir, axis: RoadAxis = r.horiz ? 'h' : 'v';
    let limit = Infinity; // distancia libre por delante
    // Semáforos: la primera línea de detención por delante.
    for (const s of r.stops) {
      const line = dir > 0 ? s.at0 - 0.7 : s.at1 + 0.7, d = (line - c.s) * dir;
      if (d < -0.05 || d > 14) continue;
      const col = carLight(now, s.cx, s.cy, axis);
      if (col === 'rojo' || (col === 'ambar' && d > 1.6)) limit = Math.min(limit, d);
      break;
    }
    // El coche de delante en el mismo carril.
    for (const o of this.cars) if (o !== c && o.r === r && o.dir === dir && o.lane === c.lane) { const d = (o.s - c.s) * dir; if (d > 0 && d < 12) limit = Math.min(limit, d - 2.1); }
    // Alguien en la calzada, delante y en el carril.
    const lp = this.lanePos(r, dir, c.lane);
    for (const p of people) {
      const along = (r.horiz ? p.x : p.y) - c.s, lat = (r.horiz ? p.y : p.x) - lp;
      if (Math.abs(lat) < 0.75 && along * dir > 0 && along * dir < 5) limit = Math.min(limit, along * dir - 1.4);
    }
    const target = limit === Infinity ? c.vmax : Math.max(0, Math.min(c.vmax, (limit - 0.15) * 1.6));
    c.v += (target - c.v) * Math.min(1, dt * (target < c.v ? 6 : 1.5));
    c.s += c.v * dt * dir;
    // Giros: al llegar a un cruce se decide (una vez) si se gira; al final de la calzada hay que girar sí o sí.
    const ahead = r.cross.filter((x) => (dir > 0 ? x.a1 > c.s : x.a0 < c.s));
    const next = dir > 0 ? ahead[0] : ahead[ahead.length - 1];
    if (next && !c.turn && c.decided !== next.r) {
      c.decided = next.r;
      const atEnd = dir > 0 ? next.a1 >= r.a1 - 0.5 : next.a0 <= r.a0 + 0.5;
      if (atEnd || Math.random() < 0.3) {
        const o = next.r;
        // Sentido en la calzada nueva: hacia donde haya más calle (o al azar en mitad).
        const here = r.horiz ? r.y + r.h / 2 : r.x + r.w / 2;
        const room = (d: 1 | -1) => (d > 0 ? o.a1 - here : here - o.a0);
        const nd: 1 | -1 = room(1) < 6 ? -1 : room(-1) < 6 ? 1 : Math.random() < 0.5 ? 1 : -1;
        const lane = Math.min(c.lane, o.perDir - 1);
        c.turn = { r: o, dir: nd, at: this.lanePos(o, nd, lane) };
        c.lane = lane;
      }
    }
    if (c.turn && (dir > 0 ? c.s >= c.turn.at : c.s <= c.turn.at)) {
      const t = c.turn, lateral = this.lanePos(r, dir, c.lane);
      c.r = t.r; c.dir = t.dir; c.s = lateral; c.turn = null; c.decided = null; c.v *= 0.55;
      return;
    }
    // Sin cruce al final (borde del mapa): se va con un fundido.
    if ((dir > 0 && c.s > r.a1 - 0.6) || (dir < 0 && c.s < r.a0 + 0.6)) { c.s = Math.max(r.a0 + 0.6, Math.min(r.a1 - 0.6, c.s)); c.out = true; }
  }

  /** Semáforos cercanos: poste con luces para coches (rojo/ámbar/verde) y muñeco para peatones. */
  private drawLights(now: number, cx: number, cy: number) {
    const g = this.lightsG; g.clear();
    for (const s of this.signals) {
      if (Math.abs(s.cx - cx) > 34 || Math.abs(s.cy - cy) > 34) continue;
      const car = carLight(now, s.cx, s.cy, s.axis), walk = walkLight(now, s.cx, s.cy, s.axis);
      const blink = walk === 'ambar' && Math.floor(now / 350) % 2 === 0;
      for (const [x, y] of [[s.px, s.py], [s.qx, s.qy]]) {
        const base = worldToScreen(x, y), top = worldToScreen(x, y, 2.3);
        g.moveTo(base.x, base.y).lineTo(top.x, top.y).stroke({ width: 2, color: 0x24242c });
        // Caja de luces para coches.
        g.roundRect(top.x - 4, top.y - 15, 8, 17, 2).fill(0x101014).stroke({ width: 1, color: 0x3a3a46 });
        const lit = (c: string, want: string, col: number, yy: number) => g.circle(top.x, top.y + yy, 2.3).fill({ color: c === want ? col : 0x2a2a30, alpha: c === want ? 1 : 0.9 });
        lit(car, 'rojo', 0xff2a2a, -12); lit(car, 'ambar', 0xffb020, -7); lit(car, 'verde', 0x3aff7a, -2);
        // Peatones: muñeco verde (o parpadeando) / mano roja.
        const pm = worldToScreen(x, y, 1.45);
        g.roundRect(pm.x + 4, pm.y - 6, 7, 8, 1.5).fill(0x101014);
        if (walk === 'verde' || blink) g.circle(pm.x + 7.5, pm.y - 3.5, 1).fill(0x3aff7a).rect(pm.x + 7, pm.y - 2.5, 1, 3).fill(0x3aff7a);
        else if (walk !== 'ambar') g.rect(pm.x + 6, pm.y - 4, 3, 4).fill(0xff3030);
      }
    }
  }

  destroy() { for (const c of this.cars) c.g.destroy({ children: true }); this.cars = []; this.lightsG.destroy(); this.marks.destroy(); }
  /** v0.35 · Se guarda sin destruir (entras en un interior) y se vuelve a poner al salir: los coches siguen donde estaban. */
  detach() { this.layer.removeChild(this.marks, this.lightsG, ...this.cars.map((c) => c.g)); }
  attach() { this.layer.addChildAt(this.marks, 0); this.layer.addChild(this.lightsG, ...this.cars.map((c) => c.g)); }
}
