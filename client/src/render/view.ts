// Vista isométrica: bloques de suelo bajo demanda, orden por profundidad topológica, atenuación de edificios,
// interpolación de entidades remotas y predicción del personaje propio.
import { Application, Container, Graphics, Sprite, Text, type FederatedPointerEvent } from 'pixi.js';
import {
  GROUND_TYPES, buildZoneGrid, findPath, screenToWorld, worldToScreen, walkSpeed, nearestWalkable,
  type EntitySpawn, type ZoneDef, type ZoneGrid, type Attributes,
} from '@vertice/shared';
import { content } from '../content';
import { settings } from '../settings';
import { HEX, drawBox, drawBuilding, drawGroundChunk, drawProp, drawSkybridge, glowTexture, makeCharacter, makeHolo, makeSign, shade, type Occl } from './art';

interface SortObj { x0: number; y0: number; x1: number; y1: number; view: Container; sx0: number; sy0: number; sx1: number; sy1: number; building?: boolean; ent?: CEnt; depth: number; mark: number }
export interface CEnt {
  s: EntitySpawn; x: number; y: number; samples: { t: number; x: number; y: number }[]; flags: number; moving: boolean;
  view: Container; legs?: Graphics; body?: Container; visor?: Graphics; label?: Text; obj: SortObj; phase: number;
  charRoot?: Container; marker?: Container; markerAmt?: number; zz?: Text;
}

const INTERP_DELAY = 110;
const CHUNK = 16;

export class GameView {
  app = new Application();
  world = new Container();
  ground = new Container();
  backdrop = new Container();
  markers = new Container();
  objects = new Container();
  nightOverlay = new Graphics();
  lightsLayer = new Container();
  labels = new Container();
  rain = new Graphics();
  sky = new Container();
  private beaconG = new Graphics();
  private beacons: { x: number; y: number }[] = [];
  private holos: Container[] = [];
  private cars: { lane: number; t: number; v: number; g: Graphics }[] = [];
  zone?: ZoneDef;
  grid?: ZoneGrid;
  ents = new Map<number, CEnt>();
  meId = -1;
  me = { x: 0, y: 0, path: [] as [number, number][], speed: 2.6, serverX: 0, serverY: 0, serverMoving: false, lastServer: 0 };
  private statics: SortObj[] = [];
  private chunks = new Map<string, Container>();
  private chunkLights = new Map<string, Container>();
  private pathG = new Graphics();
  private hoverG = new Graphics();
  private marketLights = new Graphics();
  private powered = false;
  zoom = 0.85;
  cam = { x: 0, y: 0 };
  hovered: CEnt | null = null;
  onGroundClick: (x: number, y: number) => void = () => {};
  onEntityClick: (e: CEnt) => void = () => {};
  onRightClick: () => void = () => {};
  onHover: (e: CEnt | null, sx: number, sy: number) => void = () => {};
  onContextLost: (lost: boolean) => void = () => {};
  private rainDrops: { x: number; y: number; v: number }[] = [];
  private cityHourFn: () => number = () => 12;
  private visibleRect = { x0: 0, y0: 0, x1: 0, y1: 0 };
  private sortCounter = 0;
  private occluder: (x0: number, y0: number, x1: number, y1: number) => Occl = () => () => false;
  /** Coste de CPU del último segundo por fotograma (ms), para el indicador de rendimiento. */
  frameMs = 0;
  private frameAcc = 0; private frameN = 0; private frameT0 = 0;

  async init(parent: HTMLElement, cityHour: () => number) {
    this.cityHourFn = cityHour;
    await this.app.init({ resizeTo: window, background: 0x07070f, antialias: false, preference: 'webgl', resolution: (window.devicePixelRatio || 1) * settings.resScale, autoDensity: true, powerPreference: 'high-performance' });
    parent.appendChild(this.app.canvas);
    this.app.stage.addChild(this.world, this.nightOverlay, this.lightsLayer, this.rain, this.labels);
    this.world.addChild(this.ground, this.backdrop, this.markers, this.objects, this.sky);
    this.markers.addChild(this.pathG, this.hoverG);
    this.lightsLayer.blendMode = 'add';
    this.lightsLayer.addChild(this.marketLights);
    this.objects.sortableChildren = true;
    this.app.ticker.maxFPS = settings.fpsCap;
    // Entrada: clic izquierdo mueve o interactúa, clic derecho cancela.
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.on('pointertap', (ev: FederatedPointerEvent) => this.onTap(ev));
    this.app.stage.on('pointermove', (ev: FederatedPointerEvent) => this.onMove(ev));
    this.app.canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); this.onRightClick(); });
    this.app.canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.setZoom(this.zoom * (e.deltaY > 0 ? 0.9 : 1.1)); }, { passive: false });
    // Pérdida del contexto gráfico: aviso y reconstrucción de la escena al recuperarlo.
    this.app.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.onContextLost(true); });
    this.app.canvas.addEventListener('webglcontextrestored', () => { this.rebuild(); this.onContextLost(false); });
    document.addEventListener('visibilitychange', () => { this.app.ticker.maxFPS = document.hidden ? 4 : settings.fpsCap; });
    for (let i = 0; i < 160; i++) this.rainDrops.push({ x: Math.random(), y: Math.random(), v: 0.6 + Math.random() * 0.6 });
    this.app.ticker.add((t) => this.frame(t.deltaMS / 1000));
  }

  applySettings() {
    this.app.ticker.maxFPS = settings.fpsCap;
    this.app.renderer.resolution = (window.devicePixelRatio || 1) * settings.resScale;
    this.app.renderer.resize(window.innerWidth, window.innerHeight);
    this.rebuild();
  }

  setZoom(z: number) { this.zoom = Math.max(0.4, Math.min(1.7, z)); }

  // ------------------------------------------------------------------ zona
  setZone(zoneId: string, x: number, y: number) {
    this.zone = content.zones.find((z) => z.id === zoneId)!;
    this.grid = buildZoneGrid(this.zone);
    for (const e of this.ents.values()) this.destroyEnt(e);
    this.ents.clear();
    this.hovered = null; this.onHover(null, 0, 0);
    this.cam.x = x; this.cam.y = y;
    this.me.x = x; this.me.y = y; this.me.path = []; this.me.serverX = x; this.me.serverY = y;
    this.rebuild();
  }

  rebuild() {
    if (!this.zone) return;
    for (const c of this.chunks.values()) c.destroy({ children: true });
    for (const c of this.chunkLights.values()) c.destroy({ children: true });
    this.chunks.clear(); this.chunkLights.clear();
    this.backdrop.removeChildren().forEach((c) => c.destroy({ children: true }));
    for (const s of this.statics) s.view.destroy({ children: true });
    this.statics = [];
    this.stallObjs = [];
    this.lightsLayer.removeChildren();
    this.lightsLayer.addChild(this.marketLights, this.beaconG);
    this.sky.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.beacons = []; this.holos = []; this.cars = [];
    const z = this.zone, q = settings.quality;
    if (z.kind === 'interior') {
      // Paredes del fondo (siempre detrás) y barandilla frontal baja con huecos en las puertas.
      const wallCol = HEX(z.wallColor ?? '#3a3a5a');
      const back = new Graphics();
      drawBox(back, 0, 0, z.width, 1, 0, 2.4, wallCol);
      drawBox(back, 0, 1, 1, z.height - 1, 0, 2.4, shade(wallCol, 0.9));
      this.backdrop.addChild(back);
      const doorSet = new Set(z.doors.map((d) => `${d.at[0]},${d.at[1]}`));
      for (let x = 1; x < z.width; x++) if (!doorSet.has(`${x},${z.height - 1}`)) this.addStatic(x, z.height - 1, 1, 1, (g) => drawBox(g, x, z.height - 1 + 0.6, 1, 0.4, 0, 0.35, shade(wallCol, 0.8)));
      for (let y = 1; y < z.height - 1; y++) if (!doorSet.has(`${z.width - 1},${y}`)) this.addStatic(z.width - 1, y, 1, 1, (g) => drawBox(g, z.width - 1 + 0.6, y, 0.4, 1, 0, 0.35, shade(wallCol, 0.8)));
    }
    // Siluetas de edificios en pantalla para resolver la oclusión estática de las luces.
    const sil = z.buildings.map((b) => {
      const [x0, y0, w, h] = b.rect, x1 = x0 + w, y1 = y0 + h, H = b.height;
      const pts = [worldToScreen(x0, y1), worldToScreen(x1, y1), worldToScreen(x1, y0), worldToScreen(x1, y0, H), worldToScreen(x0, y0, H), worldToScreen(x0, y1, H)];
      return { x0, y0, x1, y1, pts };
    });
    const inPoly = (px: number, py: number, pts: { x: number; y: number }[]) => {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i], b = pts[j];
        if ((a.y > py) !== (b.y > py) && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside;
      }
      return inside;
    };
    this.occluder = (bx0: number, by0: number, bx1: number, by1: number): Occl => (sx, sy) =>
      sil.some((s) => !(s.x0 === bx0 && s.y0 === by0 && s.x1 === bx1 && s.y1 === by1) && (bx1 <= s.x0 || by1 <= s.y0) && inPoly(sx, sy, s.pts));
    for (const b of z.buildings) {
      const [x0, y0, w, h] = b.rect;
      const lights = new Graphics();
      const occl = this.occluder(x0, y0, x0 + w, y0 + h);
      const obj = this.addStatic(x0, y0, w, h, (g) => { this.beacons.push(...drawBuilding(b, g, lights, q, occl)); }, true);
      const sign = makeSign(b, q);
      if (sign) obj.view.addChild(sign);
      this.lightsLayer.addChild(lights);
    }
    for (const bl of z.blocks) {
      const [x0, y0, w, h] = bl.rect;
      const col = bl.color ? HEX(bl.color) : bl.type === 'fence' ? 0x5a5a66 : bl.type === 'barrier' ? 0x6a6a7a : 0x6a5a7a;
      const H = bl.type === 'fence' ? 1.1 : bl.height;
      // Las vallas largas se trocean por loseta para que el orden de profundidad sea correcto.
      if (w > 1 || h > 1) { for (let yy = y0; yy < y0 + h; yy++) for (let xx = x0; xx < x0 + w; xx++) this.addStatic(xx, yy, 1, 1, (g) => drawBox(g, xx + (w > 1 ? 0 : 0.3), yy + (h > 1 ? 0 : 0.3), w > 1 ? 1 : 0.4, h > 1 ? 1 : 0.4, 0, H, col, bl.type === 'fence' ? 0.85 : 1)); }
      else this.addStatic(x0, y0, w, h, (g) => drawBox(g, x0, y0, w, h, 0, H, col));
    }
    const propLights = new Graphics();
    // Pasarelas aéreas, hologramas y antenas: elementos elevados que se dibujan por encima de la calle.
    const skyG = new Graphics(), skyL = new Graphics();
    for (const sb of z.skybridges) drawSkybridge(skyG, skyL, sb);
    this.sky.addChild(skyG);
    this.lightsLayer.addChild(skyL);
    for (const p of z.props) {
      if (p.type === 'holo') { const h = makeHolo(p, q); this.holos.push(h); this.lightsLayer.addChild(h); continue; }
      if (p.type === 'antenna') {
        const a = worldToScreen(p.at[0] + 0.5, p.at[1] + 0.5, p.z ?? 20), t = worldToScreen(p.at[0] + 0.5, p.at[1] + 0.5, (p.z ?? 20) + 4);
        skyG.moveTo(a.x, a.y).lineTo(t.x, t.y).stroke({ width: 2, color: 0x8890a8 });
        this.beacons.push(t);
        continue;
      }
    }
    if (z.kind === 'exterior' && q === 'high') {
      // Tráfico aéreo decorativo: vehículos voladores con luces en carriles elevados.
      for (let i = 0; i < 14; i++) {
        const g = new Graphics();
        g.roundRect(-9, -3, 18, 6, 3).fill(0x2a2a3a); g.rect(6, -2, 4, 4).fill(0xfff1c0); g.rect(-10, -2, 3, 4).fill(0xff3040);
        this.sky.addChild(g);
        this.cars.push({ lane: i, t: Math.random(), v: 0.02 + Math.random() * 0.03, g });
      }
    }
    for (const p of z.props) {
      if (p.type === 'stall' || p.type === 'holo' || p.type === 'antenna') continue;
      this.addStatic(p.at[0], p.at[1], 1, 1, (g) => drawProp(g, propLights, p, true, this.occluder(p.at[0], p.at[1], p.at[0] + 1, p.at[1] + 1)));
    }
    this.lightsLayer.addChild(propLights);
    this.redrawMarket();
    this.ensureChunks(true);
  }

  private stallObjs: SortObj[] = [];
  private redrawMarket() {
    if (!this.zone) return;
    for (const s of this.stallObjs) { s.view.destroy({ children: true }); const i = this.statics.indexOf(s); if (i >= 0) this.statics.splice(i, 1); }
    this.stallObjs = [];
    this.marketLights.clear();
    for (const p of this.zone.props) if (p.type === 'stall') this.stallObjs.push(this.addStatic(p.at[0], p.at[1], 1, 1, (g) => drawProp(g, this.marketLights, p, this.powered, this.occluder(p.at[0], p.at[1], p.at[0] + 1, p.at[1] + 1))));
  }

  setFacts(facts: Record<string, unknown>) {
    const p = facts.lumen_power === true;
    if (p !== this.powered) { this.powered = p; this.redrawMarket(); for (const e of this.ents.values()) if (e.s.objKind === 'generator') this.drawObjectEnt(e); }
  }

  private addStatic(x0: number, y0: number, w: number, h: number, draw: (g: Graphics) => void, building = false): SortObj {
    const g = new Graphics();
    draw(g);
    const view = new Container();
    view.addChild(g);
    this.objects.addChild(view);
    const b = view.getLocalBounds();
    const obj: SortObj = { x0, y0, x1: x0 + w, y1: y0 + h, view, sx0: b.minX, sy0: b.minY, sx1: b.maxX, sy1: b.maxY, building, depth: 0, mark: 0 };
    this.statics.push(obj);
    return obj;
  }

  /** Construye los bloques de suelo cercanos a la cámara y libera los lejanos. */
  private ensureChunks(force = false) {
    if (!this.zone || !this.grid) return;
    const z = this.zone;
    const cx = Math.floor(this.cam.x / CHUNK), cy = Math.floor(this.cam.y / CHUNK);
    const want = new Set<string>();
    const R = Math.ceil(40 / CHUNK / this.zoom);
    for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
      if (x < 0 || y < 0 || x * CHUNK >= z.width || y * CHUNK >= z.height) continue;
      want.add(`${x},${y}`);
    }
    for (const [k, c] of this.chunks) if (!want.has(k)) { c.destroy({ children: true }); this.chunks.delete(k); }
    for (const k of want) {
      if (this.chunks.has(k) && !force) continue;
      if (this.chunks.has(k)) continue;
      const [x, y] = k.split(',').map(Number);
      const g = new Graphics();
      drawGroundChunk(g, z, this.grid.ground, GROUND_TYPES, x * CHUNK, y * CHUNK, CHUNK);
      const c = new Container(); c.addChild(g);
      this.ground.addChild(c);
      this.chunks.set(k, c);
    }
  }

  // ------------------------------------------------------------------ entidades
  upsert(s: EntitySpawn) {
    const old = this.ents.get(s.id);
    if (old) this.destroyEnt(old);
    const view = new Container();
    const ent: CEnt = { s, x: s.x, y: s.y, samples: [{ t: performance.now(), x: s.x, y: s.y }], flags: 0, moving: false, view, obj: null as any, phase: Math.random() * 6 };
    if (s.kind === 'player' || s.kind === 'npc') {
      const ch = makeCharacter(s.appearance, s.kind);
      view.addChild(ch.root);
      ent.legs = ch.legs; ent.body = ch.body; ent.visor = ch.visor; ent.charRoot = ch.root;
      ent.zz = new Text({ text: 'Zz', style: { fontFamily: 'system-ui', fontSize: 14, fontWeight: '700', fill: 0x9ad8ff, stroke: { color: 0x000000, width: 3 } } });
      ent.zz.anchor.set(0.5); ent.zz.position.set(14, -30); ent.zz.visible = false;
      view.addChild(ent.zz);
      if (s.kind === 'player') {
        ent.label = new Text({ text: s.name, style: { fontFamily: 'system-ui, sans-serif', fontSize: 12, fill: s.id === this.meId ? 0xffd23f : 0xffffff, stroke: { color: 0x000000, width: 3 } } });
        ent.label.anchor.set(0.5, 1);
        this.labels.addChild(ent.label);
      }
    } else this.drawObjectEnt(ent);
    this.objects.addChild(view);
    ent.obj = { x0: s.x - 0.25, y0: s.y - 0.25, x1: s.x + 0.25, y1: s.y + 0.25, view, sx0: -14, sy0: -48, sx1: 14, sy1: 6, ent, depth: 0, mark: 0 };
    if (s.kind === 'object') { ent.obj.x0 = Math.floor(s.x); ent.obj.y0 = Math.floor(s.y); ent.obj.x1 = ent.obj.x0 + 1; ent.obj.y1 = ent.obj.y0 + 1; }
    if (s.id === this.meId) { this.me.x = s.x; this.me.y = s.y; this.me.serverX = s.x; this.me.serverY = s.y; }
    this.ents.set(s.id, ent);
    this.place(ent);
  }

  private drawObjectEnt(ent: CEnt) {
    const s = ent.s;
    ent.view.removeChildren().forEach((c) => c.destroy({ children: true }));
    const g = new Graphics();
    const fx = Math.floor(s.x), fy = Math.floor(s.y);
    // Dibujamos relativo a la posición de la entidad (centro de su loseta).
    const o = worldToScreen(s.x, s.y);
    const rel = (fn: (g: Graphics) => void) => { fn(g); g.position.set(-o.x, -o.y); };
    if (s.kind === 'door') {
      const col = s.danger === 'protected' ? 0x5affc8 : s.danger === 'disputed' ? 0xff5a5a : 0xffd23f;
      rel((g) => {
        const a = worldToScreen(fx, fy), b = worldToScreen(fx + 1, fy), c = worldToScreen(fx + 1, fy + 1), d = worldToScreen(fx, fy + 1);
        g.poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y]).fill({ color: col, alpha: 0.18 }).stroke({ width: 2, color: col, alpha: 0.9 });
        const m = worldToScreen(fx + 0.5, fy + 0.5);
        g.poly([m.x - 6, m.y - 30, m.x + 6, m.y - 30, m.x, m.y - 20]).fill(col);
      });
    } else if (s.objKind === 'generator') {
      const col = this.powered ? 0x5affc8 : 0xff5a5a;
      rel((g) => { drawBox(g, fx + 0.1, fy + 0.1, 0.8, 0.8, 0, 1.1, 0x3a4048); const t = worldToScreen(fx + 0.5, fy + 1, 0.7); g.poly([t.x - 3, t.y - 12, t.x + 4, t.y - 12, t.x, t.y - 4, t.x + 4, t.y - 4, t.x - 4, t.y + 6, t.x - 1, t.y - 2, t.x - 5, t.y - 2]).fill(col); });
    } else if (s.objKind === 'terminal') {
      rel((g) => { drawBox(g, fx + 0.3, fy + 0.3, 0.4, 0.4, 0, 1.3, 0x2a2a3a); const t = worldToScreen(fx + 0.5, fy + 0.7, 1.1); g.rect(t.x - 7, t.y - 9, 14, 10).fill(0x43f3ff); });
    } else if (s.objKind === 'crates') {
      rel((g) => { drawBox(g, fx + 0.05, fy + 0.05, 0.9, 0.9, 0, 0.6, 0x7a5b3a); drawBox(g, fx + 0.2, fy + 0.2, 0.6, 0.6, 0.6, 0.5, 0x8a6b4a); });
    } else if (s.objKind === 'elevator') {
      rel((g) => { const a = worldToScreen(fx + 0.1, fy + 1, 0), b = worldToScreen(fx + 0.9, fy + 1, 0), c = worldToScreen(fx + 0.9, fy + 1, 1.8), d = worldToScreen(fx + 0.1, fy + 1, 1.8); g.poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y]).fill(0x8890a8).stroke({ width: 2, color: 0x43f3ff }); });
    } else if (s.objKind === 'vending') {
      rel((g) => { drawBox(g, fx + 0.15, fy + 0.2, 0.7, 0.6, 0, 1.7, 0x22222e); const t = worldToScreen(fx + 0.5, fy + 0.8, 1.0); g.rect(t.x - 8, t.y - 16, 16, 22).fill(0x43f3ff); g.rect(t.x - 8, t.y - 16, 16, 4).fill(0xff3fa4); });
    } else if (s.objKind === 'shop') {
      rel((g) => { drawBox(g, fx, fy + 0.1, 1, 0.8, 0, 0.9, 0x3a3a50); const t = worldToScreen(fx + 0.5, fy + 0.5, 1.2); g.rect(t.x - 7, t.y - 6, 14, 8).fill(0x7dff7a); });
    } else if (s.objKind === 'jobboard' || s.objKind === 'bountyboard' || s.objKind === 'marketterm') {
      const col = s.objKind === 'jobboard' ? 0x43f3ff : s.objKind === 'bountyboard' ? 0xff3040 : 0xffd23f;
      rel((g) => { drawBox(g, fx + 0.4, fy + 0.4, 0.2, 0.2, 0, 1.3, 0x333340); drawBox(g, fx + 0.05, fy + 0.35, 0.9, 0.3, 1.1, 1.0, 0x1a1a28); const t = worldToScreen(fx + 0.5, fy + 0.65, 1.6); g.rect(t.x - 14, t.y - 10, 28, 16).fill({ color: col, alpha: 0.85 }); });
    } else if (s.objKind === 'bed') {
      rel((g) => { drawBox(g, fx + 0.05, fy + 0.1, 0.9, 0.8, 0, 0.5, 0x3a4a6a); drawBox(g, fx + 0.1, fy + 0.15, 0.8, 0.7, 0.5, 0.35, 0x8890c8, 0.8); });
    } else if (s.objKind === 'trash') {
      rel((g) => { drawBox(g, fx + 0.15, fy + 0.2, 0.7, 0.6, 0, 0.8, 0x2f5a3a); drawBox(g, fx + 0.1, fy + 0.15, 0.8, 0.7, 0.8, 0.08, 0x3d7a4a); });
    } else if (s.objKind === 'workplace') {
      rel((g) => { const m = worldToScreen(fx + 0.5, fy + 0.5); g.circle(m.x, m.y - 14, 7).fill({ color: 0xffd23f, alpha: 0.9 }); g.rect(m.x - 2, m.y - 18, 4, 8).fill(0x1a1a28); });
    } else if (s.objKind === 'board') {
      rel((g) => { drawBox(g, fx + 0.45, fy + 0.45, 0.1, 0.1, 0, 1.2, 0x333340); drawBox(g, fx + 0.1, fy + 0.4, 0.8, 0.2, 1.0, 0.8, 0xd8c8a0); });
    }
    ent.view.addChild(g);
  }

  remove(id: number) { const e = this.ents.get(id); if (e) { this.destroyEnt(e); this.ents.delete(id); } }
  private destroyEnt(e: CEnt) { e.view.destroy({ children: true }); e.label?.destroy(); if (this.hovered === e) this.hovered = null; }
  setLabel(id: number, label: string, bounty?: number, state?: 'alive' | 'downed' | 'sleeping') {
    const e = this.ents.get(id);
    if (!e) return;
    e.s.label = label;
    if (bounty !== undefined) e.s.bounty = bounty || undefined;
    if (state !== undefined) e.s.state = state === 'alive' ? undefined : state;
  }
  /** Recompensa visible sobre la cabeza y postura tumbada al dormir o caer derribado. */
  private statusVisuals(e: CEnt, now: number) {
    if (!e.charRoot) return;
    const sleeping = e.s.state === 'sleeping' || (e.flags & 32) === 32;
    const downed = e.s.state === 'downed' || (e.flags & 64) === 64;
    const lying = sleeping || downed;
    e.charRoot.rotation = lying ? -Math.PI / 2 : 0;
    e.charRoot.position.set(lying ? -18 : 0, lying ? -4 : 0);
    if (e.zz) { e.zz.visible = sleeping; e.zz.y = -30 - (settings.reduceMotion ? 0 : (now / 120) % 10); }
    if (downed) e.charRoot.alpha = settings.reduceFlashes ? 0.7 : 0.55 + 0.35 * Math.abs(Math.sin(now / 300));
    else e.charRoot.alpha = 1;
    const amt = e.s.bounty ?? 0;
    if (amt !== (e.markerAmt ?? 0)) {
      e.marker?.destroy({ children: true }); e.marker = undefined; e.markerAmt = amt;
      if (amt > 0) {
        const m = new Container();
        const t = new Text({ text: `${amt} €$`, style: { fontFamily: 'system-ui', fontSize: 11, fontWeight: '700', fill: 0xffffff } });
        t.anchor.set(0.5);
        const bg = new Graphics().roundRect(-t.width / 2 - 14, -9, t.width + 20, 18, 4).fill(0xb01030).stroke({ width: 1, color: 0xff5a5a });
        const icon = new Graphics().poly([-t.width / 2 - 9, 0, -t.width / 2 - 5, -5, -t.width / 2 - 1, 0, -t.width / 2 - 5, 5]).fill(0xffffff);
        m.addChild(bg, icon, t); t.x = 3;
        m.position.set(0, -62);
        e.view.addChild(m); e.marker = m;
      }
    }
  }

  positions(ents: { id: number; x: number; y: number; flags: number }[]) {
    const now = performance.now();
    for (const p of ents) {
      const e = this.ents.get(p.id);
      if (!e) continue;
      e.flags = p.flags;
      if (p.id === this.meId) { this.me.serverX = p.x; this.me.serverY = p.y; this.me.serverMoving = (p.flags & 1) === 1; this.me.lastServer = now; continue; }
      e.samples.push({ t: now, x: p.x, y: p.y });
      if (e.samples.length > 6) e.samples.shift();
    }
  }

  setMyAttributes(a: Attributes) { this.me.speed = walkSpeed(a); }
  /** Predicción local: el cliente calcula la ruta con la misma rejilla y empieza a moverse antes del ack. */
  predictMove(x: number, y: number): [number, number][] | null {
    if (!this.grid) return null;
    const d = nearestWalkable(this.grid, x, y, 2);
    if (!d) return null;
    const r = findPath(this.grid, this.me.x, this.me.y, d.x, d.y, 9000);
    if (!r.ok) return null;
    this.me.path = r.path.slice();
    this.drawPath(r.path, false);
    return r.path;
  }
  confirmPath(path: [number, number][]) { this.me.path = path.slice(); this.drawPath(path, true); }
  cancelPrediction() { this.me.path = []; this.pathG.clear(); }

  drawPath(path: [number, number][], confirmed: boolean) {
    const g = this.pathG; g.clear();
    if (!path.length) return;
    const col = confirmed ? 0x43f3ff : 0x9a9ac0;
    let p = worldToScreen(this.me.x, this.me.y);
    g.moveTo(p.x, p.y);
    for (const [x, y] of path) { p = worldToScreen(x, y); g.lineTo(p.x, p.y); }
    g.stroke({ width: 2, color: col, alpha: 0.7 });
    const end = path[path.length - 1];
    const e = worldToScreen(end[0], end[1]);
    g.ellipse(e.x, e.y, 12, 6).stroke({ width: 2, color: col });
  }

  // ------------------------------------------------------------------ entrada
  private toWorld(gx: number, gy: number) {
    const l = this.world.toLocal({ x: gx, y: gy });
    return screenToWorld(l.x, l.y);
  }
  private pick(gx: number, gy: number): CEnt | null {
    const l = this.world.toLocal({ x: gx, y: gy });
    let best: CEnt | null = null, bestDepth = -Infinity;
    for (const e of this.ents.values()) {
      if (!e.s.interactive || e.s.id === this.meId) continue;
      const p = worldToScreen(e.x, e.y);
      const dx = l.x - p.x, dy = l.y - p.y;
      const hit = e.s.kind === 'door' ? Math.abs(dx) < 24 && dy > -36 && dy < 14 : e.s.kind === 'object' ? Math.abs(dx) < 22 && dy > -44 && dy < 14 : Math.abs(dx) < 12 && dy > -48 && dy < 6;
      if (hit && e.view.zIndex > bestDepth) { best = e; bestDepth = e.view.zIndex; }
    }
    return best;
  }
  private onTap(ev: FederatedPointerEvent) {
    if (ev.button !== 0) return;
    const e = this.pick(ev.global.x, ev.global.y);
    if (e) return this.onEntityClick(e);
    const w = this.toWorld(ev.global.x, ev.global.y);
    this.onGroundClick(w.x, w.y);
  }
  private onMove(ev: FederatedPointerEvent) {
    const e = this.pick(ev.global.x, ev.global.y);
    this.hovered = e;
    this.app.canvas.style.cursor = e ? 'pointer' : 'crosshair';
    this.onHover(e, ev.global.x, ev.global.y);
  }

  // ------------------------------------------------------------------ fotograma
  private place(e: CEnt) {
    const p = worldToScreen(e.x, e.y);
    e.view.position.set(p.x, p.y);
    e.obj.x0 = e.x - 0.25; e.obj.y0 = e.y - 0.25; e.obj.x1 = e.x + 0.25; e.obj.y1 = e.y + 0.25;
    if (e.s.kind === 'object' || e.s.kind === 'door') { e.obj.x0 = Math.floor(e.x); e.obj.y0 = Math.floor(e.y); e.obj.x1 = e.obj.x0 + 1; e.obj.y1 = e.obj.y0 + 1; }
    e.obj.sx0 = p.x - 24; e.obj.sx1 = p.x + 24; e.obj.sy0 = p.y - 50; e.obj.sy1 = p.y + 14;
  }

  private frame(dt: number) {
    if (!this.zone) return;
    const now = performance.now();
    this.frameInner(dt, now);
    this.frameAcc += performance.now() - now; this.frameN++;
    if (now - this.frameT0 > 1000) { this.frameMs = this.frameAcc / Math.max(1, this.frameN); this.frameAcc = 0; this.frameN = 0; this.frameT0 = now; }
  }

  private frameInner(dt: number, now: number) {
    dt = Math.min(dt, 0.1);
    // Personaje propio: avanza por la ruta predicha y se reconcilia con el último estado confirmado.
    const me = this.me;
    if (me.path.length) {
      let budget = me.speed * dt;
      while (budget > 0 && me.path.length) {
        const [tx, ty] = me.path[0]; const dx = tx - me.x, dy = ty - me.y, d = Math.hypot(dx, dy);
        if (d <= budget) { me.x = tx; me.y = ty; me.path.shift(); budget -= d; } else { me.x += (dx / d) * budget; me.y += (dy / d) * budget; budget = 0; }
      }
      if (!me.path.length) this.pathG.clear();
    }
    const err = Math.hypot(me.serverX - me.x, me.serverY - me.y);
    if (err > 3) { me.x = me.serverX; me.y = me.serverY; }
    else if (!me.path.length && !me.serverMoving) { const k = Math.min(1, dt * 8); me.x += (me.serverX - me.x) * k; me.y += (me.serverY - me.y) * k; }
    else if (err > 1.2) { const k = Math.min(1, dt * 2); me.x += (me.serverX - me.x) * k; me.y += (me.serverY - me.y) * k; }

    const renderT = now - INTERP_DELAY;
    for (const e of this.ents.values()) {
      if (e.s.id === this.meId) {
        const dx = me.x - e.x, dy = me.y - e.y;
        e.moving = Math.hypot(dx, dy) > 0.002;
        if (e.moving) this.face(e, dx, dy);
        e.x = me.x; e.y = me.y;
      } else if (e.s.kind === 'player' || e.s.kind === 'npc') {
        const s = e.samples;
        let nx = s[s.length - 1].x, ny = s[s.length - 1].y;
        for (let i = s.length - 1; i > 0; i--) {
          if (s[i - 1].t <= renderT && s[i].t >= renderT) { const k = (renderT - s[i - 1].t) / Math.max(1, s[i].t - s[i - 1].t); nx = s[i - 1].x + (s[i].x - s[i - 1].x) * k; ny = s[i - 1].y + (s[i].y - s[i - 1].y) * k; break; }
        }
        if (s.length && s[0].t > renderT) { nx = s[0].x; ny = s[0].y; }
        const dx = nx - e.x, dy = ny - e.y;
        e.moving = Math.hypot(dx, dy) > 0.002 || (e.flags & 1) === 1;
        if (Math.hypot(dx, dy) > 0.002) this.face(e, dx, dy);
        e.x = nx; e.y = ny;
      }
      this.place(e);
      this.statusVisuals(e, now);
      // Animación corta: piernas alternas y balanceo; se desactiva con «reducir movimiento».
      if (e.legs && e.body && !(e.charRoot && e.charRoot.rotation !== 0)) {
        e.phase += dt * (e.moving ? 12 : 2);
        const bob = settings.reduceMotion ? 0 : e.moving ? Math.abs(Math.sin(e.phase)) * 1.5 : Math.sin(e.phase) * 0.4;
        e.body.y = -bob;
        e.legs.scale.y = e.moving && !settings.reduceMotion ? 0.85 + 0.15 * Math.abs(Math.cos(e.phase)) : 1;
        e.legs.skew.x = e.moving && !settings.reduceMotion ? Math.sin(e.phase) * 0.25 : 0;
      }
      if (e.label) {
        e.label.visible = settings.showNames || e === this.hovered;
        const p = worldToScreen(e.x, e.y, 1.6);
        const g = this.world.toGlobal(p);
        e.label.position.set(g.x, g.y);
        e.label.scale.set(Math.max(0.8, this.zoom));
      }
    }

    // Cámara: sigue al personaje activo con zoom acotado.
    const k = settings.reduceMotion ? 1 : Math.min(1, dt * 6);
    this.cam.x += (me.x - this.cam.x) * k; this.cam.y += (me.y - this.cam.y) * k;
    const c = worldToScreen(this.cam.x, this.cam.y);
    const W = this.app.screen.width, H = this.app.screen.height;
    this.world.scale.set(this.zoom);
    this.world.position.set(Math.round(W / 2 - c.x * this.zoom), Math.round(H / 2 - c.y * this.zoom));
    this.lightsLayer.position.copyFrom(this.world.position); this.lightsLayer.scale.copyFrom(this.world.scale);
    this.visibleRect = { x0: (-this.world.x) / this.zoom - 80, y0: (-this.world.y) / this.zoom - 120, x1: (W - this.world.x) / this.zoom + 80, y1: (H - this.world.y) / this.zoom + 400 };
    if ((this.sortCounter++ & 15) === 0) this.ensureChunks();
    for (const c of this.chunks.values()) c.visible = true;

    this.depthSort();
    this.drawHover();
    this.drawNight();
    this.drawRain(dt);
    this.animateSky(now, dt);
  }

  private animateSky(now: number, dt: number) {
    const g = this.beaconG; g.clear();
    const on = settings.reduceFlashes ? true : Math.floor(now / 700) % 2 === 0;
    for (const b of this.beacons) g.circle(b.x, b.y, on ? 5 : 3).fill({ color: 0xff3040, alpha: on ? 0.95 : 0.4 });
    for (const [i, h] of this.holos.entries()) h.alpha = settings.reduceFlashes ? 0.85 : 0.75 + 0.25 * Math.abs(Math.sin(now / 900 + i)) * (Math.random() < 0.02 ? 0.2 : 1);
    if (!this.zone) return;
    const W = this.zone.width, Hh = this.zone.height;
    for (const c of this.cars) {
      c.t += c.v * dt * (settings.reduceMotion ? 0.3 : 1);
      if (c.t > 1) c.t -= 1;
      const along = c.lane % 2 === 0;
      const lanePos = 8 + ((c.lane * 13) % (along ? Hh - 16 : W - 16));
      const z = 16 + (c.lane % 4) * 5;
      const x = along ? c.t * W : lanePos, y = along ? lanePos : c.t * Hh;
      const p = worldToScreen(x, y, z);
      c.g.position.set(p.x, p.y);
      c.g.scale.x = along ? 1 : -1;
    }
  }

  private face(e: CEnt, dx: number, dy: number) {
    const sx = dx - dy; // dirección horizontal en pantalla
    if (e.body && Math.abs(sx) > 0.0005) e.body.scale.x = sx >= 0 ? 1 : -1;
  }

  /** Orden topológico de profundidad entre objetos que se solapan en pantalla. */
  private depthSort() {
    const vr = this.visibleRect;
    const list: SortObj[] = [];
    for (const s of this.statics) { const vis = s.sx1 >= vr.x0 && s.sx0 <= vr.x1 && s.sy1 >= vr.y0 && s.sy0 <= vr.y1; s.view.visible = vis; if (vis) list.push(s); }
    for (const e of this.ents.values()) list.push(e.obj);
    const n = list.length;
    const behind: number[][] = Array.from({ length: n }, () => []);
    for (let i = 0; i < n; i++) {
      const a = list[i];
      for (let j = i + 1; j < n; j++) {
        const b = list[j];
        if (a.sx1 < b.sx0 || b.sx1 < a.sx0 || a.sy1 < b.sy0 || b.sy1 < a.sy0) continue;
        if (!a.ent && !b.ent && !a.building && !b.building) { /* accesorios estáticos */ }
        let aBehind: boolean;
        if (a.x1 <= b.x0 || a.y1 <= b.y0) aBehind = true;
        else if (b.x1 <= a.x0 || b.y1 <= a.y0) aBehind = false;
        else aBehind = a.x0 + a.y0 + a.x1 + a.y1 < b.x0 + b.y0 + b.x1 + b.y1;
        if (aBehind) behind[j].push(i); else behind[i].push(j);
      }
    }
    const mark = ++this.sortCounter;
    let depth = 0;
    const visit = (i: number) => {
      const o = list[i];
      if (o.mark === mark) return;
      o.mark = mark;
      for (const k of behind[i]) visit(k);
      o.depth = depth++;
    };
    for (let i = 0; i < n; i++) visit(i);
    // Atenuación: edificios que tapan al personaje propio.
    const me = this.ents.get(this.meId);
    for (const o of list) {
      if (o.view.zIndex !== o.depth) o.view.zIndex = o.depth;
      if (o.building) {
        let a = 1;
        if (me) { const m = me.obj; const overlaps = !(o.sx1 < m.sx0 || m.sx1 < o.sx0 || o.sy1 < m.sy0 || m.sy1 < o.sy0); if (overlaps && o.depth > m.depth) a = 0.28; }
        o.view.alpha += (a - o.view.alpha) * 0.25;
      }
    }
  }

  private drawHover() {
    const g = this.hoverG; g.clear();
    const e = this.hovered;
    if (!e) return;
    const p = worldToScreen(e.x, e.y);
    g.ellipse(p.x, p.y, 16, 8).stroke({ width: 2, color: 0xffd23f, alpha: 0.9 });
  }

  private drawNight() {
    const h = this.cityHourFn();
    // 0 de día (9–17 h), hasta 0,55 de noche (21–5 h).
    const dark = h >= 9 && h < 17 ? 0 : h >= 21 || h < 5 ? 0.55 : h >= 17 ? ((h - 17) / 4) * 0.55 : ((9 - h) / 4) * 0.55;
    const interior = this.zone?.kind === 'interior';
    const a = interior ? 0.12 : dark;
    const W = this.app.screen.width, H = this.app.screen.height;
    this.nightOverlay.clear().rect(0, 0, W, H).fill({ color: 0x080a2a, alpha: a });
    this.lightsLayer.alpha = interior ? 0.7 : 0.35 + dark * 1.2;
  }

  private drawRain(dt: number) {
    const g = this.rain; g.clear();
    if (settings.quality !== 'high' || settings.reduceMotion || this.zone?.kind === 'interior') return;
    const W = this.app.screen.width, H = this.app.screen.height;
    for (const d of this.rainDrops) {
      d.y += d.v * dt * 1.2; d.x -= d.v * dt * 0.15;
      if (d.y > 1) { d.y = 0; d.x = Math.random(); }
      if (d.x < 0) d.x += 1;
      g.moveTo(d.x * W, d.y * H).lineTo(d.x * W - 3, d.y * H + 12);
    }
    g.stroke({ width: 1, color: 0x9ad8ff, alpha: 0.25 });
  }

  glow() { return new Sprite(glowTexture()); }
}
