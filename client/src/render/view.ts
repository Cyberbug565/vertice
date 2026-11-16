// Vista isométrica: bloques de suelo bajo demanda, orden por profundidad topológica, atenuación de edificios,
// interpolación de entidades remotas y predicción del personaje propio.
import { Application, Container, Graphics, Sprite, Text, type FederatedPointerEvent } from 'pixi.js';
import {
  GROUND_TYPES, buildZoneGrid, findPath, isWalkable, screenToWorld, worldToScreen, walkSpeed, nearestWalkable,
  type EntitySpawn, type ZoneDef, type ZoneGrid, type Attributes,
} from '@vertice/shared';
import { content, zoneDef } from '../content';
import { settings } from '../settings';
import { kairosOf, kairosScale, MATRICES } from '@vertice/shared';
import { dancePose } from './dance';
import { HEX, drawBox, drawBuilding, drawGroundChunk, drawProp, drawSkybridge, glowTexture, makeCharacter, makeHolo, makeSevered, makeSign, makeVehicle, makeWeapon, shade, type Occl } from './art';

interface SortObj { x0: number; y0: number; x1: number; y1: number; view: Container; sx0: number; sy0: number; sx1: number; sy1: number; building?: boolean; ent?: CEnt; depth: number; mark: number }
export interface CEnt {
  s: EntitySpawn; x: number; y: number; samples: { t: number; x: number; y: number }[]; flags: number; moving: boolean;
  view: Container; legs?: Container; body?: Container; visor?: Graphics; hpBar?: Graphics; tag?: Graphics; bubble?: Container; bubbleUntil?: number; label?: Text; obj: SortObj; phase: number;
  charRoot?: Container; marker?: Container; markerAmt?: number; zz?: Text;
  vehX?: Container; vehY?: Container; lvl?: Text;
  // v0.6: extremidades articuladas, arma en la mano y animación de ataque.
  legL?: Container; legR?: Container; armB?: Container; armF?: Container; hand?: Container; bodyY?: number;
  weaponKind?: 'ranged' | 'melee'; weaponBig?: boolean; attackAt?: number; attackKind?: 'shot' | 'hit'; dropAt?: number; faceSign?: number;
}

const INTERP_DELAY = 110;
/** Las personas se dibujan algo más pequeñas que antes para que farolas, coches y edificios tengan escala real. */
const CHAR_SCALE = 0.74;
const FACTION_COLORS: Record<string, number> = { engranajes: 0xff3040, kitsune: 0xb46cff, 'hermandad-sol': 0xffb347, furias: 0xff4fa0, 'voces-vacio': 0x43f3ff, 'nomadas-polvo': 0xd9a066, saqueadores: 0x8a6a3a, pcv: 0x60a5fa, 'unidad-hierro': 0x1e3a8a, ambar: 0xffbf00, chatarreros: 0xff8a3d, 'hojas-rojas': 0xff5a5a };
const CHUNK = 16;

export class GameView {
  app = new Application();
  world = new Container();
  ground = new Container();
  backdrop = new Container();
  decalLayer = new Container();
  private floor = new Container();
  private floorTiles = [new Graphics(), new Graphics(), new Graphics()];
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
  // v0.8: zonas Kairós, estelas de imágenes residuales, compañeros de las matrices y alucinaciones.
  private kairosG = new Graphics();
  private trailLayer = new Container();
  private trails = new Map<number, { tex: any; tint: number; pts: { x: number; y: number; t: number; sp?: any }[]; last: number; tier: number }>();
  private companions: { id: string; root: Container; x: number; y: number; nextLine: number; bubble?: Container; bubbleUntil?: number }[] = [];
  private halluc: { c: Container; until: number; x: number; y: number }[] = [];
  ghostMode = false;
  psyche = 0;
  private marketLights = new Graphics();
  private powered = false;
  zoom = 0.85;
  cam = { x: 0, y: 0 };
  hovered: CEnt | null = null;
  onGroundClick: (x: number, y: number) => void = () => {};
  onEntityClick: (e: CEnt) => void = () => {};
  onRightClick: (x: number, y: number) => void = () => {};
  /** v0.7: clic derecho mantenido (apuntar o bloquear). */
  onGuard: (on: boolean) => void = () => {};
  /** Dirección de WASD en coordenadas del mundo (0,0 = quieto) y si estás en guardia (apuntando o bloqueando). */
  steer = { dx: 0, dy: 0 };
  guarding = false;
  /** Punto del suelo bajo el cursor (para mirar hacia él al apuntar). */
  cursor = { x: 0, y: 0, sx: 0, sy: 0 };
  serverTime = () => Date.now();
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
    this.floor.addChild(...this.floorTiles);
    this.world.addChild(this.ground, this.floor, this.decalLayer, this.backdrop, this.markers, this.objects, this.sky);
    this.markers.addChild(this.kairosG, this.trailLayer, this.pathG, this.hoverG);
    this.lightsLayer.blendMode = 'add';
    this.lightsLayer.addChild(this.marketLights);
    this.objects.sortableChildren = true;
    this.app.ticker.maxFPS = settings.fpsCap;
    // Entrada: clic izquierdo mueve o interactúa, clic derecho abre acciones.
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.on('pointertap', (ev: FederatedPointerEvent) => this.onTap(ev));
    this.app.stage.on('pointermove', (ev: FederatedPointerEvent) => this.onMove(ev));
    this.app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.app.canvas.addEventListener('pointerdown', (e) => { if (e.button === 2) { this.guarding = true; this.onGuard(true); } });
    window.addEventListener('pointerup', (e) => { if (e.button === 2 && this.guarding) { this.guarding = false; this.onGuard(false); } });
    window.addEventListener('blur', () => { if (this.guarding) { this.guarding = false; this.onGuard(false); } });
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
    this.zone = zoneDef(zoneId)!;
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
    for (const t of this.traffic) t.g.destroy(); this.trafficMarks?.destroy(); this.trafficMarks = null;
    this.beacons = []; this.holos = []; this.cars = []; this.traffic = [];
    const z = this.zone, q = settings.quality;
    this.buildDanceFloor();
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
    for (const t of this.traffic) t.g.destroy();
    this.traffic = [];
    this.buildTraffic();
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
    if (s.kind === 'npc' && s.faction?.startsWith('ias-')) {
      // IAs del ciberespacio: geometría que flota y parpadea, no personas.
      const big = s.faction === 'ias-velo' || s.name === 'CARMÍN';
      const col = s.name === 'CARMÍN' ? 0xff2040 : big ? 0xff4060 : 0x43f3ff;
      const body = new Container();
      const g = new Graphics();
      const k = big ? 1.5 : 1;
      g.poly([0, -46 * k, 14 * k, -26 * k, 0, -6 * k, -14 * k, -26 * k]).fill({ color: 0x050510, alpha: 0.9 }).stroke({ width: 2, color: col });
      g.circle(0, -26 * k, 4 * k).fill(col);
      for (let i = 0; i < 4; i++) g.rect(-18 * k + i * 9 * k, -12 * k - (i % 2) * 34 * k, 6 * k, 2).fill({ color: i % 2 ? 0xffffff : col, alpha: 0.7 });
      g.ellipse(0, 0, 12 * k, 5 * k).fill({ color: col, alpha: 0.25 });
      body.addChild(g);
      view.addChild(body);
      ent.body = body;
      if (s.name === 'CARMÍN') { const ch = makeCharacter(s.appearance, 'npc', ['ojos']); ch.root.scale.set(CHAR_SCALE * 1.4); ch.root.alpha = 0.9; view.addChild(ch.root); ent.charRoot = ch.root; ent.legs = ch.legs; ent.body = ch.body; ent.bodyY = ch.bodyY; }
    } else if (s.kind === 'player' || s.kind === 'npc') {
      const ch = makeCharacter(s.appearance, s.kind, s.chrome ?? [], s.lost ?? []);
      ch.root.scale.set(CHAR_SCALE * ch.root.scale.x);
      view.addChild(ch.root);
      ent.legs = ch.legs; ent.body = ch.body; ent.visor = ch.visor; ent.charRoot = ch.root;
      // Ciberpsicópata: aura roja que late bajo los pies.
      if (s.npcType === 'psycho') { const aura = new Graphics().ellipse(0, 0, 22, 11).fill({ color: 0xff2020, alpha: 0.25 }).ellipse(0, 0, 22, 11).stroke({ width: 2, color: 0xff2020, alpha: 0.9 }); view.addChildAt(aura, 0); ch.root.scale.set(CHAR_SCALE * 1.15); }
      ent.legL = ch.legL; ent.legR = ch.legR; ent.armB = ch.armB; ent.armF = ch.armF; ent.hand = ch.hand; ent.bodyY = ch.bodyY;
      // Arma empuñada (se ve en la mano; las largas se llevan con las dos manos).
      const wi = s.weapon ? content.items.find((i) => i.id === s.weapon) : undefined;
      if (wi?.weapon && ch.hand.visible) {
        const wg = makeWeapon(wi.id, wi.weapon.family, wi.weapon.kind, s.appearance?.accent);
        if (wg) { ch.hand.addChild(wg); ent.weaponKind = wi.weapon.kind; ent.weaponBig = ['Rifle', 'Escopeta', 'Ametralladora', 'Especial', 'Arco', 'Subfusil'].includes(wi.weapon.family) || ['bate', 'katana-termica', 'lanza-electrica', 'hacha-plasma', 'espada-monofilamento', 'martillo-neumatico', 'machete'].includes(wi.id); }
      }
      // Al volante: el coche sustituye a la figura (en moto, la figura va montada encima).
      const car = s.vehicle ? content.cars.find((x) => x.id === s.vehicle) : undefined;
      if (car) {
        ent.vehX = makeVehicle(car.class, car.color, s.appearance?.accent);
        ent.vehY = makeVehicle(car.class, car.color, s.appearance?.accent); ent.vehY.scale.x = -1;
        view.addChildAt(ent.vehX, 0); view.addChildAt(ent.vehY, 0); ent.vehY.visible = false;
        if (car.class === 'moto') { ch.root.scale.set(CHAR_SCALE * 0.85); ch.root.y = -10; ch.legs.visible = false; } else ch.root.visible = false;
      }
      if (s.level && s.kind === 'npc') {
        ent.lvl = new Text({ text: `Nv ${s.level}`, style: { fontFamily: 'system-ui', fontSize: 10, fontWeight: '700', fill: 0xffd23f, stroke: { color: 0x000000, width: 3 } } });
        ent.lvl.anchor.set(0.5, 1); ent.lvl.position.set(0, -54); ent.lvl.visible = false;
        view.addChild(ent.lvl);
      }
      ent.zz = new Text({ text: 'Zz', style: { fontFamily: 'system-ui', fontSize: 14, fontWeight: '700', fill: 0x9ad8ff, stroke: { color: 0x000000, width: 3 } } });
      ent.zz.anchor.set(0.5); ent.zz.position.set(12, -24); ent.zz.visible = false;
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
    } else if (s.objKind === 'camera') {
      // Cámara de vigilancia en un poste: piloto rojo si graba, gris si está apagada.
      const off = s.label === 'Apagada';
      rel((g) => { const a1 = worldToScreen(fx + 0.5, fy + 0.5, 0), t = worldToScreen(fx + 0.5, fy + 0.5, 3.2); g.moveTo(a1.x, a1.y).lineTo(t.x, t.y).stroke({ width: 2, color: 0x3a3a48 }); g.roundRect(t.x - 2, t.y - 4, 12, 6, 2).fill(0xd8dce8); g.rect(t.x + 8, t.y - 3, 3, 4).fill(0x101018); g.circle(t.x + 1, t.y - 1, 1.6).fill(off ? 0x6a6a6a : 0xff2030); });
    } else if (s.objKind === 'neuralchair') {
      rel((g) => { drawBox(g, fx + 0.1, fy + 0.2, 0.8, 0.6, 0, 0.45, 0x1a1a2a); drawBox(g, fx + 0.1, fy + 0.65, 0.8, 0.15, 0.45, 0.8, 0x24243a); const t = worldToScreen(fx + 0.5, fy + 0.7, 1.4); g.ellipse(t.x, t.y, 10, 4).stroke({ width: 2, color: 0x43f3ff }); g.circle(t.x, t.y - 4, 2).fill(0x43f3ff); });
    } else if (s.objKind === 'jackout') {
      rel((g) => { const t = worldToScreen(fx + 0.5, fy + 0.5, 0.6); g.poly([t.x, t.y - 22, t.x + 12, t.y - 4, t.x, t.y + 14, t.x - 12, t.y - 4]).fill({ color: 0x5aff8a, alpha: 0.35 }).stroke({ width: 2, color: 0x5aff8a }); g.rect(t.x - 1, t.y - 12, 2, 16).fill(0xffffff); });
    } else if (s.objKind === 'computer') {
      rel((g) => { drawBox(g, fx + 0.1, fy + 0.2, 0.8, 0.6, 0, 0.75, 0x2a2a36); const t = worldToScreen(fx + 0.5, fy + 0.6, 0.75); g.rect(t.x - 8, t.y - 13, 16, 11).fill(0x101018); g.rect(t.x - 7, t.y - 12, 14, 9).fill(0x43f3ff); g.rect(t.x - 6, t.y - 10, 8, 1).fill(0x101018); g.rect(t.x - 6, t.y - 7, 10, 1).fill(0x101018); });
    } else if (s.objKind === 'mycar') {
      const car = s.vehicle ? content.cars.find((x) => x.id === s.vehicle) : undefined;
      if (car) { const v = makeVehicle(car.class, car.color, '#43f3ff'); ent.view.addChild(v); return; }
    } else if (s.objKind === 'board') {
      rel((g) => { drawBox(g, fx + 0.45, fy + 0.45, 0.1, 0.1, 0, 1.2, 0x333340); drawBox(g, fx + 0.1, fy + 0.4, 0.8, 0.2, 1.0, 0.8, 0xd8c8a0); });
    }
    ent.view.addChild(g);
  }

  remove(id: number) { const e = this.ents.get(id); if (e) { this.destroyEnt(e); this.ents.delete(id); } }
  private destroyEnt(e: CEnt) { e.view.destroy({ children: true }); e.label?.destroy(); if (this.hovered === e) this.hovered = null; }
  setLabel(id: number, label: string, bounty?: number, state?: 'alive' | 'downed' | 'sleeping', chrome?: string[], hpPct?: number, carried?: boolean, extra?: { appearance?: EntitySpawn['appearance']; vehicle?: string | null; level?: number; buffs?: string[]; lost?: string[]; bleeding?: boolean; weapon?: string; dead?: boolean; emote?: EntitySpawn['emote'] | null }) {
    const e = this.ents.get(id);
    if (!e) return;
    if (extra) {
      if (extra.emote !== undefined) {
        if (extra.emote && e.s.id === this.meId) this.cancelPrediction();
        e.s.emote = extra.emote ?? undefined;
      }
      e.s.bleeding = extra.bleeding || undefined;
      e.s.dead = extra.dead || undefined;
      const lostChanged = (extra.lost ?? []).join() !== (e.s.lost ?? []).join();
      const wChanged = (extra.weapon ?? undefined) !== (e.s.weapon ?? undefined);
      if (lostChanged || wChanged) {
        // Miembro arrancado: cae al suelo junto al cuerpo.
        for (const part of extra.lost ?? []) if (!(e.s.lost ?? []).includes(part) && !part.startsWith('mano')) this.severed(e, part);
        this.upsert({ ...e.s, x: e.x, y: e.y, lost: extra.lost, weapon: extra.weapon, label, chrome: chrome ?? e.s.chrome, appearance: extra.appearance ?? e.s.appearance, vehicle: extra.vehicle ?? e.s.vehicle, state: state === 'alive' ? undefined : state ?? e.s.state });
        return;
      }
      if (extra.buffs !== undefined) e.s.buffs = extra.buffs;
      if (extra.level !== undefined) e.s.level = extra.level;
      const apChanged = extra.appearance && JSON.stringify(extra.appearance) !== JSON.stringify(e.s.appearance);
      const vehChanged = (extra.vehicle ?? null) !== (e.s.vehicle ?? null);
      if (apChanged || vehChanged) { this.upsert({ ...e.s, x: e.x, y: e.y, appearance: extra.appearance ?? e.s.appearance, vehicle: extra.vehicle ?? null, chrome: chrome ?? e.s.chrome, label, state: state === 'alive' ? undefined : state ?? e.s.state }); return; }
    }
    if (hpPct !== undefined) e.s.hpPct = hpPct;
    if (carried !== undefined) e.s.carried = carried || undefined;
    if (chrome !== undefined && (chrome ?? []).join() !== (e.s.chrome ?? []).join()) { e.s.chrome = chrome; this.upsert({ ...e.s, x: e.x, y: e.y }); return; }
    const relabel = e.s.objKind === 'camera' && e.s.label !== label;
    e.s.label = label;
    if (relabel) this.drawObjectEnt(e);
    if (bounty !== undefined) e.s.bounty = bounty || undefined;
    if (state !== undefined) e.s.state = state === 'alive' ? undefined : state;
  }
  /** Recompensa visible sobre la cabeza y postura tumbada al dormir o caer derribado. */
  /** Bocadillo de diálogo sobre una entidad durante unos segundos. */
  say(id: number, text: string) {
    const e = this.ents.get(id);
    if (!e) return;
    e.bubble?.destroy({ children: true });
    const t = new Text({ text, style: { fontFamily: 'system-ui', fontSize: 12, fill: 0x101018, wordWrap: true, wordWrapWidth: 180 } });
    const bg = new Graphics().roundRect(-t.width / 2 - 8, -t.height - 10, t.width + 16, t.height + 10, 6).fill(0xf4f4fa).stroke({ width: 1.5, color: 0x43f3ff });
    bg.poly([-5, -1, 5, -1, 0, 6]).fill(0xf4f4fa);
    t.position.set(-t.width / 2, -t.height - 5);
    const c = new Container(); c.addChild(bg, t);
    this.labels.addChild(c);
    e.bubble = c; e.bubbleUntil = performance.now() + 4500;
  }
  /** Trazadoras de disparos, impactos y líneas de hackeo. */
  private fxList: { g: Graphics; until: number }[] = [];
  /** Balas trazadoras que viajan, arcos de golpe según el arma, salpicaduras y charcos de sangre. */
  private bullets: { g: Graphics; ax: number; ay: number; bx: number; by: number; t0: number; dur: number; col: number; w: number; hit: boolean; tx: number; ty: number; part?: string; target: number }[] = [];
  private decals: { g: Graphics; until: number }[] = [];
  fx(kind: 'shot' | 'hit' | 'hack' | 'ko', from: number, to: number, extra: { part?: string; weapon?: string; hit?: boolean; sever?: boolean; crit?: boolean } = {}) {
    const a = this.ents.get(from), b = this.ents.get(to);
    if (!a || !b) return;
    a.attackAt = performance.now(); a.attackKind = kind === 'shot' ? 'shot' : kind === 'hit' ? 'hit' : undefined;
    if (a !== b && a.body) a.body.scale.x = (b.x - a.x) - (b.y - a.y) >= 0 ? 1 : -1;
    const partZ = extra.part === 'cabeza' ? 1.55 : extra.part?.startsWith('pierna') ? 0.45 : 1.1;
    const pa = worldToScreen(a.x, a.y, 1.15), pb = worldToScreen(b.x, b.y, partZ);
    const wi = extra.weapon ? content.items.find((i) => i.id === extra.weapon) : undefined;
    const fam = wi?.weapon?.family ?? '';
    const hit = extra.hit !== false;
    if (kind === 'hack') {
      const g = new Graphics().moveTo(pa.x, pa.y).lineTo(pb.x, pb.y).stroke({ width: 1.5, color: 0x43f3ff, alpha: 0.8 }).circle(pb.x, pb.y, 10).stroke({ width: 1.5, color: 0x43f3ff });
      this.lightsLayer.addChild(g); this.fxList.push({ g, until: performance.now() + 600 }); return;
    }
    if (kind === 'shot') {
      const id = extra.weapon ?? '';
      const col = /plasma|termica/.test(id) ? 0xff7a30 : /riel|pulsos|sonico|emp|inteligente/.test(id) ? 0x43c8ff : fam === 'Táser' ? 0xffd23f : fam === 'Arco' ? 0xd8e0ec : 0xfff1a0;
      const pellets = fam === 'Escopeta' ? 5 : fam === 'Ametralladora' ? 4 : fam === 'Subfusil' ? 3 : 1;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      // Fogonazo en la boca del arma.
      if (!settings.reduceFlashes) { const mf = new Graphics().circle(pa.x + (pb.x > pa.x ? 6 : -6), pa.y - 2, 4).fill({ color: 0xfff6c0, alpha: 0.95 }); this.lightsLayer.addChild(mf); this.fxList.push({ g: mf, until: performance.now() + 60 }); }
      for (let i = 0; i < pellets; i++) {
        const spread = pellets > 1 ? (Math.random() - 0.5) * 16 : 0;
        const miss = !hit ? { x: (Math.random() - 0.5) * 40, y: (Math.random() - 0.5) * 24 } : { x: 0, y: 0 };
        const g = new Graphics();
        this.lightsLayer.addChild(g);
        this.bullets.push({ g, ax: pa.x, ay: pa.y, bx: pb.x + spread + miss.x, by: pb.y + spread * 0.5 + miss.y, t0: performance.now() + i * (fam === 'Escopeta' ? 0 : 55), dur: Math.min(260, 40 + dist * 9) / this.timeScaleAt(b.x, b.y, a), col, w: fam === 'Rifle' || fam === 'Especial' ? 2.4 : 1.6, hit: hit && i === 0, tx: b.x, ty: b.y, part: extra.part, target: b.s.id });
      }
    } else if (kind === 'hit') {
      // Arco del golpe: ancho con armas largas, corto con cuchillos y puños.
      const g = new Graphics();
      const r = fam === 'Hoja' ? 16 : fam === 'Contundente' ? 13 : fam === 'Cuchillo' ? 9 : 8;
      const col = /termica|plasma/.test(extra.weapon ?? '') ? 0xff7a30 : /electrica|aturdidora|taser|choque/.test(extra.weapon ?? '') ? 0x43c8ff : fam === 'Hoja' || fam === 'Cuchillo' || fam === 'Implante' ? 0xe8f0ff : 0xffffff;
      const dir = pb.x >= pa.x ? 1 : -1;
      g.arc(pa.x + dir * 4, pa.y, r, dir > 0 ? -1.4 : Math.PI - 0.2, dir > 0 ? 0.2 : Math.PI + 1.4).stroke({ width: fam === 'Hoja' ? 3 : 2, color: col, alpha: 0.9 });
      this.lightsLayer.addChild(g); this.fxList.push({ g, until: performance.now() + 180 });
      if (hit) this.impact(b, pb.x, pb.y, extra, fam === 'Contundente' || fam === 'Puños' || fam === '');
    } else if (kind === 'ko') {
      const g = new Graphics().circle(pb.x, pb.y - 6, 7).stroke({ width: 1.5, color: 0xffd23f });
      this.lightsLayer.addChild(g); this.fxList.push({ g, until: performance.now() + 500 });
    }
    if (extra.sever) this.blood(b.x, b.y, 1.4, 60000);
  }
  /** Impacto en el cuerpo: salpicadura (más con armas de filo y balas), chispas en el cromo y sangre en el suelo. */
  private impact(b: CEnt, x: number, y: number, extra: { part?: string; crit?: boolean; sever?: boolean }, blunt: boolean) {
    const g = new Graphics();
    const n = blunt ? 3 : extra.crit || extra.sever ? 14 : 8;
    for (let i = 0; i < n; i++) { const ang = Math.random() * Math.PI * 2, d = 2 + Math.random() * (extra.sever ? 16 : 9); g.circle(x + Math.cos(ang) * d, y + Math.sin(ang) * d * 0.6, 0.8 + Math.random() * 1.8).fill({ color: 0xb0101a, alpha: 0.9 }); }
    if (blunt) g.circle(x, y, 5).stroke({ width: 1.5, color: 0xffffff, alpha: 0.7 });
    this.lightsLayer.addChild(g); this.fxList.push({ g, until: performance.now() + 260 });
    if (!blunt || Math.random() < 0.3) this.blood(b.x + (Math.random() - 0.5) * 0.4, b.y + (Math.random() - 0.5) * 0.4, extra.crit || extra.sever ? 0.9 : 0.55, 40000);
  }
  /** Charco o gota de sangre en el suelo (se desvanece con el tiempo). */
  blood(wx: number, wy: number, size: number, ms: number) {
    if (this.decals.length > 220) { const d = this.decals.shift()!; d.g.destroy(); }
    const p = worldToScreen(wx, wy, 0);
    const g = new Graphics();
    const r = 4 + size * 9;
    g.ellipse(0, 0, r, r * 0.5).fill({ color: 0x5a0408, alpha: 0.8 });
    for (let i = 0; i < 3; i++) g.ellipse((Math.random() - 0.5) * r * 1.4, (Math.random() - 0.5) * r * 0.6, r * 0.35, r * 0.18).fill({ color: 0x7a0810, alpha: 0.75 });
    g.position.set(p.x, p.y);
    this.decalLayer.addChild(g);
    this.decals.push({ g, until: performance.now() + ms });
  }
  /** Miembro arrancado tirado en el suelo junto a su dueño. */
  private severed(e: CEnt, part: string) {
    const c = makeSevered(part, e.s.appearance?.skin ?? '#c89070');
    const ox = (Math.random() - 0.5) * 1.2, oy = (Math.random() - 0.5) * 1.2;
    const p = worldToScreen(e.x + ox, e.y + oy, 0);
    c.position.set(p.x, p.y); c.rotation = (Math.random() - 0.5) * 1.2; c.scale.set(CHAR_SCALE);
    this.decalLayer.addChild(c);
    this.decals.push({ g: c as any, until: performance.now() + 120000 });
    this.blood(e.x + ox, e.y + oy, 1.2, 120000);
  }
  private animateFx(now: number) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const k = (now - b.t0) / b.dur;
      if (k < 0) continue;
      b.g.clear();
      if (k >= 1) {
        b.g.destroy(); this.bullets.splice(i, 1);
        const t = this.ents.get(b.target);
        if (b.hit && t) this.impact(t, b.bx, b.by, { part: b.part }, false);
        else { const s = new Graphics().circle(b.bx, b.by, 2).fill({ color: 0xffe0a0, alpha: 0.8 }); this.lightsLayer.addChild(s); this.fxList.push({ g: s, until: now + 90 }); }
        continue;
      }
      const x = b.ax + (b.bx - b.ax) * k, y = b.ay + (b.by - b.ay) * k;
      const tl = 0.18;
      const x0 = b.ax + (b.bx - b.ax) * Math.max(0, k - tl), y0 = b.ay + (b.by - b.ay) * Math.max(0, k - tl);
      b.g.moveTo(x0, y0).lineTo(x, y).stroke({ width: b.w, color: b.col, alpha: 0.95 });
      b.g.circle(x, y, b.w * 0.8).fill({ color: 0xffffff, alpha: 0.9 });
    }
    for (let i = this.decals.length - 1; i >= 0; i--) { const d = this.decals[i]; const left = d.until - now; if (left <= 0) { d.g.destroy(); this.decals.splice(i, 1); } else if (left < 4000) d.g.alpha = left / 4000; }
  }
  private statusVisuals(e: CEnt, now: number) {
    if (e.bubble) {
      if (now > (e.bubbleUntil ?? 0)) { e.bubble.destroy({ children: true }); e.bubble = undefined; }
      else { const g = this.world.toGlobal(worldToScreen(e.x, e.y, 1.8)); e.bubble.position.set(g.x, g.y); }
    }
    // Barra de salud de PNJ heridos y marca de facción.
    if (e.s.npcType && e.s.npcType !== 'essential' && e.s.hpPct !== undefined && e.s.hpPct < 100) {
      if (!e.hpBar) { e.hpBar = new Graphics(); e.view.addChild(e.hpBar); }
      e.hpBar.clear().rect(-10, -50, 20, 3).fill(0x301018).rect(-10, -50, 20 * Math.max(0, e.s.hpPct) / 100, 3).fill(0xff3040);
    }
    if (e.s.factionColor === undefined && e.s.faction && !e.tag && e.s.npcType !== 'civil' && e.s.npcType !== 'essential') {
      const col = FACTION_COLORS[e.s.faction] ?? 0x9a9ac0;
      e.tag = new Graphics().poly([0, -58, 4, -54, 0, -50, -4, -54]).fill(col).stroke({ width: 1, color: 0x000000, alpha: 0.6 });
      e.view.addChild(e.tag);
    }
    if (e.lvl) e.lvl.visible = this.showLevels && (e === this.hovered || (e.s.npcType !== 'civil' && Math.hypot(e.x - this.me.x, e.y - this.me.y) < 10));
    // Camuflaje óptico: casi invisible para los demás (y translúcido para uno mismo).
    const invis = e.s.buffs?.includes('invisible');
    e.view.alpha = invis ? (e.s.id === this.meId ? 0.4 : 0.08) : 1;
    if (!e.charRoot) return;
    const sleeping = e.s.state === 'sleeping' || (e.flags & 32) === 32;
    const downed = e.s.state === 'downed' || (e.flags & 64) === 64;
    const lying = sleeping || downed;
    e.charRoot.rotation = lying ? -Math.PI / 2 : 0;
    e.charRoot.position.set(lying ? -13 : 0, lying ? -3 : 0);
    if (e.zz) { e.zz.visible = sleeping; e.zz.y = -24 - (settings.reduceMotion ? 0 : (now / 120) % 10); }
    if (downed && e.s.dead) e.charRoot.alpha = 0.92;
    else if (downed) e.charRoot.alpha = settings.reduceFlashes ? 0.7 : 0.55 + 0.35 * Math.abs(Math.sin(now / 300));
    else e.charRoot.alpha = 1;
    if (e.s.carried) { e.charRoot.rotation = -Math.PI / 2; e.charRoot.position.set(-4, -19); }
    // Proyección de Eco: el fantasma que controlas se ve translúcido y anaranjado (los demás no lo ven).
    if (this.ghostMode && e.s.id === this.meId) { e.charRoot.alpha = 0.45 + 0.15 * Math.sin(now / 220); e.charRoot.tint = 0xffc070; }
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

  /** Velocidad propia: la exacta la manda el servidor (selfSpeed); esto solo es la estimación inicial. */
  serverSpeed = false;
  setMyAttributes(a: Attributes, speed = 1) { if (!this.serverSpeed) this.me.speed = walkSpeed(a) * speed; }
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
  private pick(gx: number, gy: number, includeSelf = false): CEnt | null {
    const l = this.world.toLocal({ x: gx, y: gy });
    let best: CEnt | null = null, bestDepth = -Infinity;
    for (const e of this.ents.values()) {
      if (!e.s.interactive || (!includeSelf && e.s.id === this.meId)) continue;
      const p = worldToScreen(e.x, e.y);
      const dx = l.x - p.x, dy = l.y - p.y;
      const hit = e.s.kind === 'door' ? Math.abs(dx) < 24 && dy > -36 && dy < 14 : e.s.kind === 'object' ? Math.abs(dx) < 22 && dy > -44 && dy < 14 : Math.abs(dx) < 13 && dy > -48 && dy < 8;
      if (hit && includeSelf && e.s.id === this.meId) return e;
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
    const w = this.toWorld(ev.global.x, ev.global.y);
    this.cursor = { x: w.x, y: w.y, sx: ev.global.x, sy: ev.global.y };
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
    // WASD: el cliente avanza al instante con las mismas reglas que el servidor (se desliza por las paredes).
    if ((this.steer.dx || this.steer.dy) && this.grid) {
      me.path = []; this.pathG.clear();
      const step = me.speed * dt * (this.guarding ? 0.5 : 1), g = this.grid;
      const free = (x: number, y: number) => isWalkable(g, x, y) && isWalkable(g, x + Math.sign(x - me.x) * 0.22, y + Math.sign(y - me.y) * 0.22);
      let nx = me.x + this.steer.dx * step, ny = me.y + this.steer.dy * step;
      if (!free(nx, ny)) { if (free(nx, me.y)) ny = me.y; else if (free(me.x, ny)) nx = me.x; else { nx = me.x; ny = me.y; } }
      me.x = nx; me.y = ny;
      const errS = Math.hypot(me.serverX - me.x, me.serverY - me.y);
      if (errS > 3) { me.x = me.serverX; me.y = me.serverY; }
      else if (errS > 0.6) { const k = Math.min(1, dt * 3); me.x += (me.serverX - me.x) * k; me.y += (me.serverY - me.y) * k; }
    } else if (me.path.length) {
      let budget = me.speed * dt;
      while (budget > 0 && me.path.length) {
        const [tx, ty] = me.path[0]; const dx = tx - me.x, dy = ty - me.y, d = Math.hypot(dx, dy);
        if (d <= budget) { me.x = tx; me.y = ty; me.path.shift(); budget -= d; } else { me.x += (dx / d) * budget; me.y += (dy / d) * budget; budget = 0; }
      }
      if (!me.path.length) this.pathG.clear();
    }
    const err = Math.hypot(me.serverX - me.x, me.serverY - me.y);
    if (this.steer.dx || this.steer.dy) { /* corregido arriba */ }
    else if (err > 3) { me.x = me.serverX; me.y = me.serverY; }
    else if (!me.path.length && !me.serverMoving) { const k = Math.min(1, dt * 8); me.x += (me.serverX - me.x) * k; me.y += (me.serverY - me.y) * k; }
    else if (err > 1.2) { const k = Math.min(1, dt * 2); me.x += (me.serverX - me.x) * k; me.y += (me.serverY - me.y) * k; }

    const renderT = now - INTERP_DELAY;
    const serverNow = this.serverTime();
    for (const e of this.ents.values()) {
      if (e.s.id === this.meId) {
        const dx = me.x - e.x, dy = me.y - e.y;
        e.moving = Math.hypot(dx, dy) > 0.002;
        if (this.guarding) this.face(e, this.cursor.x - me.x, this.cursor.y - me.y);
        else if (e.moving) this.face(e, dx, dy);
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
      if (e.legs && e.body && !(e.charRoot && e.charRoot.rotation !== 0)) this.animateBody(e, dt, now, serverNow);
      if (e.label) {
        e.label.visible = settings.showNames || e === this.hovered;
        const p = worldToScreen(e.x, e.y, 1.25);
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
    this.drawKairos(now);
    this.updateCompanions(now, dt);
    this.updateHalluc(now);
    this.pulseDanceFloor(now);
    this.drawHover();
    this.drawNight();
    this.drawRain(dt);
    this.animateSky(now, dt);
  }

  /** Tráfico rodado: coches que circulan por las calzadas anchas del distrito. */
  private traffic: { g: Graphics; ax: number; ay: number; bx: number; by: number; t: number; v: number }[] = [];
  /** Calzadas (asfalto largo) con su orientación y carriles por sentido. */
  private roads() {
    if (!this.zone || this.zone.kind !== 'exterior') return [];
    return this.zone.ground.filter((gr) => gr.type === 'asphalt' && Math.min(gr.rect[2], gr.rect[3]) >= 3 && Math.max(gr.rect[2], gr.rect[3]) >= 16).map((gr) => {
      const [x, y, w, h] = gr.rect; const horiz = w >= h; const width = horiz ? h : w;
      return { x, y, w, h, horiz, width, perDir: width >= 6 ? 2 : 1 };
    });
  }
  private buildTraffic() {
    const roads = this.roads();
    if (!roads.length) return;
    // Marcas viales: doble línea continua en el centro y discontinua entre carriles del mismo sentido.
    const mk = new Graphics();
    const crossing = (r: (typeof roads)[number], px: number, py: number) => roads.some((o) => o !== r && o.horiz !== r.horiz && px >= o.x && px <= o.x + o.w && py >= o.y && py <= o.y + o.h);
    const line = (r: (typeof roads)[number], off: number, dashed: boolean, color: number, width: number) => {
      const len = r.horiz ? r.w : r.h;
      for (let t = 0.3; t < len - 0.3; t += dashed ? 1.6 : 0.5) {
        const seg = dashed ? 0.8 : 0.5;
        const ax = r.horiz ? r.x + t : r.x + off, ay = r.horiz ? r.y + off : r.y + t;
        const bx = r.horiz ? ax + seg : ax, by = r.horiz ? ay : ay + seg;
        if (crossing(r, ax, ay) || crossing(r, bx, by)) continue;
        const a = worldToScreen(ax, ay), b = worldToScreen(bx, by);
        mk.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width, color, alpha: 0.75 });
      }
    };
    for (const r of roads) {
      const mid = r.width / 2;
      line(r, mid - 0.06, false, 0xffd23f, 1.2); line(r, mid + 0.06, false, 0xffd23f, 1.2);
      if (r.perDir === 2) { line(r, mid / 2, true, 0xe8e8f0, 1); line(r, mid + mid / 2, true, 0xe8e8f0, 1); }
    }
    this.markers.addChildAt(mk, 0);
    this.trafficMarks = mk;
    // Coches por carril: cada sentido circula por su mitad de la calzada.
    const n = settings.quality === 'high' ? 2 : settings.quality === 'low' ? 0 : 1;
    const cols = [0xffd23f, 0xff5a5a, 0x43f3ff, 0xe8e8f0, 0x2a2a3a, 0xb46cff, 0x7dff7a, 0xff8a3d];
    let ci = 0;
    for (const r of roads) {
      const mid = r.width / 2;
      for (const dir of [1, -1]) for (let lane = 0; lane < r.perDir; lane++) for (let k = 0; k < n; k++) {
        const off = dir > 0 ? mid + (lane + 0.5) * (mid / r.perDir) : (lane + 0.5) * (mid / r.perDir);
        const ax = r.horiz ? r.x : r.x + off, ay = r.horiz ? r.y + off : r.y;
        const bx = r.horiz ? r.x + r.w : ax, by = r.horiz ? ay : r.y + r.h;
        const g = new Graphics();
        const col = cols[ci++ % cols.length];
        const [lx, ly] = r.horiz ? [1.3, 0.6] : [0.6, 1.3];
        drawBox(g, -lx / 2, -ly / 2, lx, ly, 0.05, 0.35, col); drawBox(g, -lx * 0.3, -ly * 0.3, lx * 0.6, ly * 0.6, 0.4, 0.25, shade(col, 0.55));
        const head = worldToScreen(r.horiz ? 0.65 * dir : 0, r.horiz ? 0 : 0.65 * dir, 0.25);
        g.circle(head.x, head.y, 2.5).fill(0xfff1c0);
        const tail = worldToScreen(r.horiz ? -0.65 * dir : 0, r.horiz ? 0 : -0.65 * dir, 0.25);
        g.circle(tail.x, tail.y, 2).fill(0xff3040);
        this.markers.addChild(g);
        const len = r.horiz ? r.w : r.h;
        this.traffic.push({ g, ax: dir > 0 ? ax : bx, ay: dir > 0 ? ay : by, bx: dir > 0 ? bx : ax, by: dir > 0 ? by : ay, t: (k * 0.5 + lane * 0.27 + ci * 0.137) % 1, v: (2.5 + lane * 1.5 + (ci % 3) * 0.6) / len });
      }
    }
  }
  private trafficMarks: Graphics | null = null;
  private animateTraffic(dt: number) {
    for (const c of this.traffic) {
      c.t += c.v * dt * (settings.reduceMotion ? 0.4 : 1);
      if (c.t > 1) c.t -= 1;
      const x = c.ax + (c.bx - c.ax) * c.t, y = c.ay + (c.by - c.ay) * c.t;
      const p = worldToScreen(x, y);
      c.g.position.set(p.x, p.y);
    }
  }
  private animateSky(now: number, dt: number) {
    this.animateFx(now);
    for (const f of [...this.fxList]) if (now > f.until) { f.g.destroy(); this.fxList.splice(this.fxList.indexOf(f), 1); }
    this.animateTraffic(dt);
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

  /** Andar orgánico: piernas desde la cadera y brazos desde el hombro en contrafase, balanceo del tronco y postura de arma. */
  private animateBody(e: CEnt, dt: number, now: number, serverNow: number) {
    const rm = settings.reduceMotion;
    const run = e.moving && (e.s.buffs?.includes('corriendo') || (e.samples.length > 1 && Math.hypot(e.samples[e.samples.length - 1].x - e.samples[0].x, e.samples[e.samples.length - 1].y - e.samples[0].y) / Math.max(1, (e.samples[e.samples.length - 1].t - e.samples[0].t) / 1000) > 3.2));
    const spd = e.moving ? (run ? 15 : 10) : 1.6;
    e.phase += dt * spd;
    const sw = rm ? 0 : e.moving ? Math.sin(e.phase) : 0;
    const amp = run ? 0.75 : 0.48;
    const bob = rm ? 0 : e.moving ? Math.abs(Math.cos(e.phase)) * (run ? 2.2 : 1.3) : Math.sin(e.phase) * 0.35;
    const facing = e.faceSign ?? 1;
    e.body!.scale.x = facing; e.legs!.scale.x = 1;
    e.body!.x = 0; e.legs!.x = 0; e.legs!.y = 0;
    e.body!.y = (e.bodyY ?? 0) - bob;
    e.body!.rotation = e.moving && !rm ? (run ? 0.1 : 0.03) * (e.body!.scale.x >= 0 ? 1 : -1) : 0;
    e.legs!.skew.x = 0; e.legs!.scale.y = e.legs!.scale.y || 1;
    if (e.legL) e.legL.rotation = sw * amp;
    if (e.legR) e.legR.rotation = -sw * amp;
    // Brazos: balanceo natural, o postura de combate con el arma.
    const since = e.attackAt ? now - e.attackAt : 1e9;
    let front = -sw * amp * 0.8, back = sw * amp * 0.8;
    if (e.weaponKind === 'ranged') { front = since < 380 ? -1.45 : -0.55 + sw * 0.08; if (e.weaponBig) back = front + 0.25; }
    else if (e.weaponKind === 'melee') { front = -0.25 - sw * 0.2; if (e.weaponBig) back = front + 0.3; }
    // Guardia: apuntando (brazo extendido hacia el objetivo) o bloqueando (arma cruzada delante).
    const guard = e.s.id === this.meId ? this.guarding : !!e.s.buffs?.includes('guardia');
    if (guard && since >= 380) { if (e.weaponKind === 'ranged') { front = -1.5; if (e.weaponBig) back = -1.3; } else { front = -1.05; back = -0.9; } }
    if (since < 320 && e.attackKind === 'hit') { const k = since / 320; front = 2.0 - k * 3.8; if (e.weaponBig) back = front + 0.3; }
    else if (since < 380 && e.attackKind === 'shot' && !e.weaponKind) front = -1.4;
    if (e.s.emote && !e.moving && !e.s.vehicle) {
      const age = Math.max(0, serverNow - e.s.emote.at) / 1000;
      const pose = dancePose(e.s.emote.move, rm ? 0.18 : age);
      const turn = pose.turn === undefined ? 1 : Math.sign(pose.turn || 1) * Math.max(0.42, Math.abs(pose.turn));
      const flip = Math.sign(facing * turn);
      e.body!.scale.x = facing * turn;
      e.legs!.scale.x = Math.abs(turn);
      e.body!.x = pose.sway * flip;
      e.body!.y = (e.bodyY ?? 0) - pose.lift;
      e.body!.rotation = pose.lean * flip;
      e.legs!.x = pose.sway * flip;
      e.legs!.y = -Math.max(0, pose.lift);
      if (e.legL) e.legL.rotation = pose.left * flip;
      if (e.legR) e.legR.rotation = pose.right * flip;
      front = pose.front;
      back = pose.back;
    }
    if (e.armF) e.armF.rotation = front;
    if (e.armB) e.armB.rotation = back;
    // El arma se mantiene más o menos horizontal (fuego) o en la línea del brazo (cuerpo a cuerpo).
    if (e.hand && e.weaponKind === 'ranged') e.hand.rotation = -front - (since < 380 ? 0 : 0.35);
    else if (e.hand) e.hand.rotation = 0.6;
    // Gotas de sangre al andar si se desangra.
    if (e.s.bleeding && now > (e.dropAt ?? 0)) { e.dropAt = now + (e.moving ? 260 : 900); this.blood(e.x + (Math.random() - 0.5) * 0.3, e.y + (Math.random() - 0.5) * 0.3, 0.35 + Math.random() * 0.3, 14000); }
  }

  private buildDanceFloor() {
    for (const g of this.floorTiles) g.clear();
    const room = this.zone?.nightlife;
    this.floor.visible = !!room;
    if (!room) return;
    const [x, y, w, h] = room.floor;
    const palette = [HEX(room.color), room.kind === 'club' ? 0x58dbf7 : 0xd3a67d, room.kind === 'club' ? 0xe575dd : 0xe8a68d];
    for (let v = 0; v < h; v++) for (let u = 0; u < w; u++) {
      const ix = x + u, iy = y + v, pad = 0.055;
      const shape = [[ix + pad, iy + pad], [ix + 1 - pad, iy + pad], [ix + 1 - pad, iy + 1 - pad], [ix + pad, iy + 1 - pad]]
        .flatMap(([a, b]) => { const p = worldToScreen(a, b); return [p.x, p.y]; });
      const k = (u + v * 2 + Math.floor(u / 3)) % palette.length;
      this.floorTiles[k].poly(shape).fill({ color: palette[k], alpha: room.kind === 'club' ? 0.45 : 0.24 }).stroke({ color: palette[k], width: 1, alpha: 0.7 });
    }
  }

  private pulseDanceFloor(now: number) {
    if (!this.floor.visible) return;
    const still = settings.reduceFlashes || settings.reduceMotion || this.zone?.nightlife?.kind === 'bar';
    for (const [i, tiles] of this.floorTiles.entries()) tiles.alpha = still ? 0.62 : 0.63 + 0.18 * Math.sin(now / 285 + i * 2.1);
  }

  private face(e: CEnt, dx: number, dy: number) {
    const sx = dx - dy; // dirección horizontal en pantalla
    if (e.body && Math.abs(sx) > 0.0005) e.body.scale.x = e.faceSign = sx >= 0 ? 1 : -1;
    // El coche se orienta según el eje por el que circula (X o Y del mundo).
    if (e.vehX && e.vehY && Math.hypot(dx, dy) > 0.001) { const alongX = Math.abs(dx) >= Math.abs(dy); e.vehX.visible = alongX; e.vehY.visible = !alongX; }
  }
  /** Muestra el nivel de los PNJ (óptica de análisis o perk «Lector»). */
  showLevels = false;

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

  /** Alcance de tu arma (rojo) y de tiro seguro apuntando (verde); lo rellena la ficha del personaje. */
  combat = { range: 1.5, aim: 0, ranged: false };
  // ================================================================ v0.8 · Kairós, compañeros, fantasma y alucinaciones
  private kairosTier(e: CEnt) { const b = e.s.buffs?.find((x) => x.startsWith('kairos')); return b ? Number(b.slice(6)) || 0 : 0; }
  /** Escala de tiempo en un punto para las balas de `shooter` (más lentas dentro de una zona Kairós ajena; más rápidas si dispara quien lo lleva). */
  timeScaleAt(x: number, y: number, shooter?: CEnt) {
    const own = shooter ? this.kairosTier(shooter) : 0;
    let sc = own ? kairosOf(own).boost : 1;
    for (const e of this.ents.values()) {
      const t = this.kairosTier(e);
      if (!t || e === shooter || t <= own) continue;
      const r = kairosOf(t).radius;
      if (r && Math.hypot(e.x - x, e.y - y) <= r) sc = Math.min(sc, kairosScale(t, own));
    }
    return Math.max(0.08, sc);
  }
  private drawKairos(now: number) {
    const g = this.kairosG; g.clear();
    let meIn = 0;
    for (const e of this.ents.values()) {
      const t = this.kairosTier(e);
      const tr = this.trails.get(e.s.id);
      if (!t || !e.charRoot) { if (tr) { for (const p of tr.pts) p.sp?.destroy(); this.trails.delete(e.s.id); } continue; }
      const k = kairosOf(t);
      const tint = HEX(e.s.appearance?.accent ?? '#43f3ff');
      if (k.radius) {
        const m = worldToScreen(e.x, e.y), rr = k.radius * 45.25, pulse = 0.5 + 0.5 * Math.sin(now / 160);
        g.ellipse(m.x, m.y, rr, rr * 0.5).fill({ color: tint, alpha: 0.05 + 0.03 * pulse }).stroke({ width: 2, color: tint, alpha: 0.35 + 0.25 * pulse });
        const q = 0.6 + 0.4 * ((now / 900) % 1);
        g.ellipse(m.x, m.y, rr * q, rr * 0.5 * q).stroke({ width: 1, color: 0xffffff, alpha: 0.15 });
        if (e.s.id !== this.meId && Math.hypot(e.x - this.me.x, e.y - this.me.y) <= k.radius) meIn = Math.max(meIn, t);
      }
      if (e.s.id === this.meId) meIn = Math.max(meIn, t);
      // Estela de imágenes residuales: más larga y duradera cuanto mejor es el Kairós; del color del cromo elegido.
      let trail = tr;
      if (!trail) {
        let tex: any = null;
        try { tex = this.app.renderer.generateTexture({ target: e.charRoot, resolution: 1 } as any); } catch {}
        trail = { tex, tint, pts: [], last: 0, tier: t };
        this.trails.set(e.s.id, trail);
      }
      if (trail.tex && now - trail.last > 45 && (e.moving || (e.s.id === this.meId && (this.steer.dx || this.steer.dy)))) {
        trail.last = now;
        const b = e.charRoot.getLocalBounds();
        const sp = new Sprite(trail.tex);
        sp.anchor.set(-b.x / Math.max(1, b.width), -b.y / Math.max(1, b.height));
        sp.scale.set(e.charRoot.scale.x, e.charRoot.scale.y);
        sp.tint = tint; sp.blendMode = 'add';
        const p = worldToScreen(e.x, e.y); sp.position.set(p.x, p.y);
        this.trailLayer.addChild(sp);
        trail.pts.push({ x: e.x, y: e.y, t: now, sp });
      }
      const life = 90 * k.trail;
      while (trail.pts.length && (now - trail.pts[0].t > life || trail.pts.length > k.trail * 2)) trail.pts.shift()!.sp?.destroy();
      for (const p of trail.pts) if (p.sp) p.sp.alpha = 0.55 * (1 - (now - p.t) / life);
    }
    document.body.classList.toggle('kairos-on', meIn > 0);
  }
  /** Compañeros de las matrices (CARMÍN y Rafa): solo los ve quien las lleva. */
  setCompanions(ids: string[]) {
    const want = ids.filter((id) => MATRICES[id]?.companion && !(this.ghostMode && id === 'matriz-eco'));
    for (const c of [...this.companions]) if (!want.includes(c.id)) { c.root.destroy({ children: true }); c.bubble?.destroy({ children: true }); this.companions.splice(this.companions.indexOf(c), 1); }
    for (const id of want) {
      if (this.companions.some((c) => c.id === id)) continue;
      const ap = id === 'matriz-carmin' ? { skin: '#f4d8d8', hair: '#ff2040', jacket: '#1a7a3a', accent: '#ff2040', eyes: '#5aff8a', build: 'alto', hairStyle: 'melena', top: 'gabardina', faceShape: 'afilada', mouth: 'sonrisa' }
        : { skin: '#e0c0a0', hair: '#1a1a1a', jacket: '#1a1a1a', accent: '#ffb020', build: 'delgado', hairStyle: 'largo', top: 'chaqueta', facial: 'perilla', accessory: 'gafas', mouth: 'seria' };
      const ch = makeCharacter(ap as any, 'npc', id === 'matriz-carmin' ? [] : ['brazo_izq']);
      ch.root.scale.set(CHAR_SCALE); ch.root.alpha = 0.82;
      const glow = new Graphics().ellipse(0, 0, 14, 7).stroke({ width: 1.5, color: HEX(MATRICES[id].companion!.color), alpha: 0.8 });
      const root = new Container(); root.addChild(glow, ch.root);
      this.objects.addChild(root);
      this.companions.push({ id, root, x: this.me.x - 1, y: this.me.y + 1, nextLine: performance.now() + 4000 + Math.random() * 8000 });
    }
  }
  private updateCompanions(now: number, dt: number) {
    this.companions.forEach((c, i) => {
      const tx = this.me.x - 1.1 + i * 0.4, ty = this.me.y + 0.9 - i * 1.6;
      const k = Math.min(1, dt * 2.5);
      c.x += (tx - c.x) * k; c.y += (ty - c.y) * k;
      const p = worldToScreen(c.x, c.y); c.root.position.set(p.x, p.y); c.root.zIndex = p.y;
      c.root.alpha = 0.75 + 0.15 * Math.sin(now / 300 + i);
      if (now > c.nextLine) {
        c.nextLine = now + 14000 + Math.random() * 20000;
        const lines = MATRICES[c.id].companion!.lines;
        c.bubble?.destroy({ children: true });
        const t = new Text({ text: lines[Math.floor(Math.random() * lines.length)], style: { fontFamily: 'system-ui', fontSize: 12, fill: 0xffffff, wordWrap: true, wordWrapWidth: 200 } });
        const col = HEX(MATRICES[c.id].companion!.color);
        const bg = new Graphics().roundRect(-t.width / 2 - 8, -t.height - 10, t.width + 16, t.height + 10, 6).fill({ color: 0x10040a, alpha: 0.92 }).stroke({ width: 1.5, color: col });
        t.position.set(-t.width / 2, -t.height - 5);
        const b = new Container(); b.addChild(bg, t); this.labels.addChild(b);
        c.bubble = b; c.bubbleUntil = now + 5000;
      }
      if (c.bubble) { if (now > (c.bubbleUntil ?? 0)) { c.bubble.destroy({ children: true }); c.bubble = undefined; } else { const g = this.world.toGlobal(worldToScreen(c.x, c.y, 1.9)); c.bubble.position.set(g.x, g.y); } }
    });
  }
  /** Alucinaciones de la ciberpsicosis: siluetas que aparecen y desaparecen (solo las ves tú). */
  private updateHalluc(now: number) {
    for (const h0 of [...this.halluc]) { if (now > h0.until) { h0.c.destroy({ children: true }); this.halluc.splice(this.halluc.indexOf(h0), 1); } else { h0.c.alpha = (0.25 + 0.35 * Math.random()) * (this.psyche >= 70 ? 1.3 : 1); } }
    const lv = this.psyche;
    if (lv < 25 || settings.reduceFlashes || !this.grid) return;
    const every = lv >= 70 ? 1500 : lv >= 45 ? 3500 : 7000;
    if (this.halluc.length > 3 || Math.random() > 1 / (every / 16)) return;
    const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 4;
    const x = this.me.x + Math.cos(a) * r, y = this.me.y + Math.sin(a) * r;
    const ch = makeCharacter({ skin: '#101014', hair: '#000000', jacket: '#08080c', accent: lv >= 70 ? '#ff2020' : '#303040', eyes: '#ff2020' } as any, 'npc', lv >= 70 ? ['ojos'] : []);
    ch.root.scale.set(CHAR_SCALE * (0.9 + Math.random() * 0.4)); ch.root.tint = lv >= 70 ? 0xff6060 : 0x8080a0;
    const c = new Container(); c.addChild(ch.root);
    const p = worldToScreen(x, y); c.position.set(p.x, p.y); c.zIndex = p.y;
    this.objects.addChild(c);
    this.halluc.push({ c, until: now + 900 + Math.random() * 1600, x, y });
  }
  private tinted: CEnt | null = null;
  /** Destino marcado (rombo magenta que late sobre el suelo). */
  goal: { x: number; y: number; zone: string } | null = null;
  private drawHover() {
    const g = this.hoverG; g.clear();
    if (this.goal && this.zone && this.goal.zone === this.zone.id) {
      const gp = worldToScreen(this.goal.x, this.goal.y), k = 1 + 0.15 * Math.sin(performance.now() / 200);
      g.poly([gp.x, gp.y - 10 * k, gp.x + 14 * k, gp.y, gp.x, gp.y + 10 * k, gp.x - 14 * k, gp.y]).stroke({ width: 2, color: 0xff40ff, alpha: 0.9 });
      g.poly([gp.x, gp.y - 40, gp.x + 5, gp.y - 32, gp.x, gp.y - 24, gp.x - 5, gp.y - 32]).fill({ color: 0xff40ff, alpha: 0.85 });
    }
    const e = this.hovered;
    if (this.tinted && this.tinted !== e) { this.clearTint(this.tinted); this.tinted = null; }
    if (!e) return;
    this.tinted = e;
    const p = worldToScreen(e.x, e.y);
    const person = (e.s.kind === 'npc' || e.s.kind === 'player') && e.s.id !== this.meId && !e.s.dead && e.s.npcType !== 'essential';
    if (!person) { g.ellipse(p.x, p.y, 16, 8).stroke({ width: 2, color: 0xffd23f, alpha: 0.9 }); return; }
    const d = Math.hypot(e.x - this.me.x, e.y - this.me.y);
    const inAim = this.combat.ranged && d <= this.combat.aim, inRange = d <= this.combat.range;
    const col = inAim ? 0x5aff7a : inRange ? 0xff3040 : 0xffd23f;
    g.ellipse(p.x, p.y, 17, 8.5).stroke({ width: 2.5, color: col, alpha: 0.95 });
    // Silueta teñida: verde = tiro seguro (quieto y apuntando), rojo = a tu alcance.
    if (e.charRoot) e.charRoot.tint = inAim ? 0xb8ffc8 : inRange ? 0xffb0b0 : 0xffffff;
    // Anillos de alcance alrededor de ti.
    const m = worldToScreen(this.me.x, this.me.y);
    const ring = (r: number, c: number) => { const k = r * 45.25; g.ellipse(m.x, m.y, k, k * 0.5).stroke({ width: 1.2, color: c, alpha: 0.45 }); };
    if (this.combat.ranged) { ring(this.combat.range, 0xff3040); ring(this.combat.aim, 0x5aff7a); }
  }
  /** Quita el tinte de la silueta al dejar de señalar a alguien. */
  clearTint(e: CEnt | null) { if (e?.charRoot) e.charRoot.tint = 0xffffff; }

  /** Fase del día (para el HUD): madrugada, amanecer, día, atardecer o noche. */
  dayPhase(h = this.cityHourFn()) { return h >= 5 && h < 8 ? 'amanecer' : h >= 8 && h < 18 ? 'día' : h >= 18 && h < 21 ? 'atardecer' : 'noche'; }
  private drawNight() {
    const h = this.cityHourFn();
    // Ciclo de 24 h de juego (1 h 30 min reales): amanecer anaranjado, día claro, atardecer violeta y noche azul con luces.
    const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));
    let color = 0x080a2a, alpha = 0;
    if (h >= 21 || h < 5) { color = 0x05082a; alpha = 0.6; }
    else if (h < 8) { const t = (h - 5) / 3; color = t < 0.5 ? 0x3a1a4a : 0xff8a4a; alpha = lerp(0.55, 0.08, t); }
    else if (h < 17) { color = 0xfff1d0; alpha = 0.03; }
    else if (h < 21) { const t = (h - 17) / 4; color = t < 0.5 ? 0xff6a3a : 0x3a1a5a; alpha = lerp(0.1, 0.6, t); }
    const interior = this.zone?.kind === 'interior';
    const W = this.app.screen.width, H = this.app.screen.height;
    this.nightOverlay.clear().rect(0, 0, W, H).fill({ color: interior ? 0x080a2a : color, alpha: interior ? 0.12 : alpha });
    // Farolas, neones y ventanas brillan más cuanto más oscuro está.
    const dark = h >= 21 || h < 5 ? 1 : h < 8 ? lerp(1, 0, (h - 5) / 3) : h < 17 ? 0 : lerp(0, 1, (h - 17) / 4);
    this.lightsLayer.alpha = interior ? 0.75 : 0.25 + dark * 0.95;
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
