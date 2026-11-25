// v0.45 · Conducción: un modelo físico sencillo pero honrado, compartido por el servidor (que manda) y el cliente (que
// predice lo que vas a ver). Las unidades son losetas (≈ 1 m) y segundos.
//
// Cómo funciona, en una frase: el coche tiene una dirección (hacia dónde apunta el morro) y una velocidad (hacia dónde
// se mueve de verdad). El volante gira el morro; los neumáticos intentan que la velocidad siga al morro, pero solo
// pueden empujar de lado hasta su agarre. Si pides más, el coche desliza: subviraje si se va de morro, sobreviraje si se
// va de cola. Todo lo demás (peso, reparto de masas al frenar o acelerar, tracción, marchas) cambia cuánto agarre hay
// y lo rápido que responde.
//
// Lo que se ha buscado (ver docs/NOVEDADES-v0.45.md):
// - de GTA V: controles directos, dirección que se suaviza con la velocidad, freno de mano que hace girar el coche y
//   ayudas invisibles que perdonan (el coche se endereza solo si contravolanteas un poco);
// - de lo que se ha visto de GTA VI y de la vida real: el peso se nota (inercia al girar, frenadas más largas, balanceo
//   de la carrocería, cabeceo al frenar y acelerar) y cada tracción se comporta distinto;
// - de los juegos de carreras arcade-simulación: el derrape es controlable y apetece, pero hay que ganárselo.
import { stepWithCollision, type ZoneGrid } from './zonegrid.js';

/** Datos del coche que llegan del contenido (y sus mejoras). */
export interface CarTuning {
  acceleration: number; // losetas/s² desde parado
  braking: number; // losetas/s²
  handling: number; // agarre de 0 a 100
  /** v0.45 · Clase de carrocería (moto, deportivo, hiper…), coche concreto, blindaje, levitación y mejoras. */
  class?: string; id?: string; armor?: number; hover?: boolean; tune?: CarTune;
}
/** Estado del coche entre pasos. `speed` es la rapidez (≥ 0); `fwd` la velocidad hacia el morro (negativa marcha atrás). */
export interface CarMotion {
  speed: number; heading: number;
  vx?: number; vy?: number; yaw?: number; steer?: number; fwd?: number;
  gear?: number; rpm?: number; shift?: number;
  /** Para dibujar y sonar: ángulo de deriva, patinaje de las ruedas motrices, aceleraciones (lateral hacia la izquierda y
   *  longitudinal), golpe del último choque. */
  slip?: number; spin?: number; latA?: number; lonA?: number; impact?: number; braking?: boolean; handbrake?: boolean;
}
/** Mandos: acelerador/freno (−1 frena y luego da marcha atrás, 1 acelera), volante (−1 izquierda, 1 derecha) y freno de mano. */
export interface DriveInput { throttle: number; steer: number; handbrake?: boolean }

// ------------------------------------------------------------------ mejoras del taller
export const TUNE_PARTS = ['motor', 'frenos', 'suspension', 'neumaticos', 'peso'] as const;
export type TunePart = (typeof TUNE_PARTS)[number];
export const TIRE_TYPES = ['serie', 'deportivos', 'rally', 'semislick'] as const;
export const WEIGHT_KITS = ['serie', 'aligerado', 'reforzado'] as const;
export interface CarTune { motor?: number; frenos?: number; suspension?: number; neumaticos?: (typeof TIRE_TYPES)[number]; peso?: (typeof WEIGHT_KITS)[number] }

// ------------------------------------------------------------------ cómo es cada tipo de vehículo
type Drive = 'del' | 'tras' | 'total';
interface Profile {
  name: string;
  mass: number; // kg
  drive: Drive;
  grip: number; // multiplicador del agarre lateral
  slide: number; // agarre que queda cuando ya desliza (bajo = derrapa más y cuesta recuperarlo)
  yaw: number; // rapidez con la que el morro obedece (inercia de giro; los pesados, lentos)
  lock: number; // cuánto gira el volante a baja velocidad
  wheelbase: number; // losetas
  roll: number; pitch: number; // balanceo y cabeceo de la carrocería (solo visual)
  power: number; // sobreviraje al dar gas a fondo en curva
  aero: number; // agarre extra por carga aerodinámica a alta velocidad
  engineBrake: number;
  gears: number;
  assist: number; // ayuda de estabilidad (contravolante automático): GTA perdona; un hiper, menos
  hb?: number; // efecto del freno de mano (en una moto, poco)
}
const P: Record<string, Profile> = {
  moto: { name: 'Moto', mass: 210, drive: 'tras', grip: 1.15, slide: 0.86, yaw: 9.5, lock: 1.3, wheelbase: 1.45, roll: -2.4, pitch: 0.7, power: 0.08, hb: 0.45, aero: 0, engineBrake: 1.1, gears: 6, assist: 0.7 },
  economico: { name: 'Utilitario', mass: 1100, drive: 'del', grip: 0.92, slide: 0.84, yaw: 6.2, lock: 1.0, wheelbase: 2.5, roll: 1.0, pitch: 0.85, power: 0, aero: 0, engineBrake: 1.0, gears: 5, assist: 0.8 },
  utilitario: { name: 'Furgoneta / pick-up', mass: 2400, drive: 'tras', grip: 0.78, slide: 0.74, yaw: 3.0, lock: 0.82, wheelbase: 3.2, roll: 1.7, pitch: 1.15, power: 0.12, aero: 0, engineBrake: 1.2, gears: 5, assist: 0.75 },
  deportivo: { name: 'Deportivo', mass: 1350, drive: 'tras', grip: 1.12, slide: 0.62, yaw: 8.2, lock: 1.1, wheelbase: 2.55, roll: 0.55, pitch: 0.5, power: 0.48, aero: 0.15, engineBrake: 0.9, gears: 6, assist: 0.55 },
  todoterreno: { name: 'Todoterreno', mass: 2200, drive: 'total', grip: 0.86, slide: 0.8, yaw: 4.6, lock: 0.95, wheelbase: 2.9, roll: 1.45, pitch: 1.0, power: 0.18, aero: 0, engineBrake: 1.1, gears: 6, assist: 0.75 },
  rally: { name: 'Rally', mass: 1250, drive: 'total', grip: 0.94, slide: 0.86, yaw: 7.4, lock: 1.15, wheelbase: 2.45, roll: 1.05, pitch: 0.8, power: 0.42, aero: 0.05, engineBrake: 0.8, gears: 6, assist: 0.65 },
  lujo: { name: 'Lujo', mass: 2050, drive: 'tras', grip: 0.94, slide: 0.7, yaw: 4.6, lock: 0.92, wheelbase: 3.0, roll: 1.35, pitch: 1.0, power: 0.2, aero: 0.05, engineBrake: 0.7, gears: 8, assist: 0.85 },
  blindado: { name: 'Blindado', mass: 2700, drive: 'total', grip: 0.82, slide: 0.78, yaw: 2.5, lock: 0.76, wheelbase: 3.1, roll: 1.1, pitch: 0.9, power: 0.06, aero: 0, engineBrake: 1.3, gears: 6, assist: 0.8 },
  hiper: { name: 'Superdeportivo', mass: 1450, drive: 'total', grip: 1.22, slide: 0.58, yaw: 9.6, lock: 1.05, wheelbase: 2.65, roll: 0.35, pitch: 0.4, power: 0.5, aero: 0.32, engineBrake: 0.85, gears: 7, assist: 0.45 },
};
/** Coches concretos que no se conducen como su clase. */
const BY_CAR: Record<string, Partial<Profile> & { base: string }> = {
  'orca-coyote': { base: 'rally' }, // buggy de los Nómadas
  'brennan-bisonte': { base: 'rally', mass: 1900, wheelbase: 2.8, roll: 1.4 },
  'marrow-halcon-negro': { base: 'deportivo', power: 0.62, slide: 0.55 }, // biplaza de carreras ilegales: muy de cola
  'saeta-dardo': { base: 'deportivo', grip: 1.18, aero: 0.25 },
  'vidal-sardina': { base: 'economico', power: 0, grip: 0.96, yaw: 7 }, // compacto con turbo
  'brennan-mastin': { base: 'moto', mass: 330, yaw: 7.5 },
  'kaiten-sakura': { base: 'lujo', mass: 2600, wheelbase: 3.7, yaw: 3.4, roll: 1.6 }, // limusina
  'brennan-uro': { base: 'todoterreno', mass: 3600, wheelbase: 3.8, yaw: 2.6 }, // seis ruedas
  'brennan-escoria': { base: 'blindado', mass: 5200, wheelbase: 4.2, yaw: 1.9, roll: 1.4 }, // antiguo camión de bomberos
  'aurora-remesa': { base: 'utilitario', mass: 3400, wheelbase: 3.9, yaw: 2.4 },
  'marrow-espectro': { base: 'hiper', drive: 'tras', power: 0.65, assist: 0.35 }, // un mito: propulsión y mal genio
};
export function carProfile(t: Pick<CarTuning, 'class' | 'id'>): Profile {
  const o = t.id ? BY_CAR[t.id] : undefined;
  const base = P[o?.base ?? t.class ?? 'economico'] ?? P.economico;
  return o ? { ...base, ...o } : base;
}

/** Valores efectivos del coche con su clase, blindaje, levitación y mejoras (los mismos en el servidor y en el cliente). */
export function carSpec(t: CarTuning) {
  const pr = carProfile(t), tune = t.tune ?? {};
  const motor = tune.motor ?? 0, frenos = tune.frenos ?? 0, susp = tune.suspension ?? 0;
  const tire = tune.neumaticos ?? 'serie', kit = tune.peso ?? 'serie';
  const mass = (pr.mass + (t.armor ?? 0) * 220) * (kit === 'aligerado' ? 0.88 : kit === 'reforzado' ? 1.22 : 1);
  const massRatio = (pr.mass + (t.armor ?? 0) * 220) / mass; // >1 si se ha aligerado
  const tireGrip = tire === 'deportivos' ? 1.1 : tire === 'semislick' ? 1.2 : tire === 'rally' ? 0.97 : 1;
  const tireSlide = tire === 'rally' ? 1.16 : tire === 'semislick' ? 0.9 : tire === 'deportivos' ? 1.0 : 1;
  const hover = !!t.hover;
  return {
    profile: pr, mass, hover,
    // La aceleración del catálogo se reparte con el peso: un coche pesado tarda más en coger velocidad.
    accel: t.acceleration * 0.62 * Math.pow(1300 / mass, 0.14) * (1 + 0.09 * motor) * Math.pow(massRatio, 0.7),
    topMult: 1 + 0.035 * motor,
    brake: t.braking * Math.pow(1300 / mass, 0.2) * (1 + 0.13 * frenos) * Math.pow(massRatio, 0.3), // los pesados frenan en más metros
    grip: (5 + t.handling * 0.11) * pr.grip * tireGrip * (1 + 0.05 * susp) * (hover ? 0.62 : 1),
    slide: Math.min(0.95, pr.slide * tireSlide * (hover ? 1.25 : 1)),
    yaw: pr.yaw * (0.75 + t.handling / 200) * (1 + 0.07 * susp) * Math.pow(massRatio, 0.6) * (hover ? 0.8 : 1),
    lock: pr.lock * (0.8 + t.handling / 250), // el manejo del catálogo: volante más directo
    roll: pr.roll * (1 - 0.22 * susp),
    pitch: pr.pitch * (1 - 0.2 * susp),
    engineBrake: pr.engineBrake * (hover ? 0.35 : 1),
  };
}
export type CarSpec = ReturnType<typeof carSpec>;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Convierte la dirección de antes («ve hacia ahí», para bots y clientes viejos) en mandos de coche. */
export function steerToInput(motion: CarMotion, dx: number, dy: number): DriveInput {
  if (!dx && !dy) return { throttle: 0, steer: 0 };
  const delta = wrap(Math.atan2(dy, dx) - motion.heading);
  if ((motion.speed ?? 0) < 0.3 && Math.abs(delta) > 0.4) return { throttle: 0, steer: 0, snap: Math.atan2(dy, dx) } as DriveInput & { snap: number };
  return { throttle: Math.abs(delta) > 2.2 ? -1 : 1, steer: clamp(-delta * 1.6, -1, 1) };
}

/**
 * Un paso de conducción. `maxSpeed` es la punta del coche (losetas/s). Devuelve la posición nueva y el estado.
 * El paso se parte en trocitos de 1/60 s para que el servidor (20 Hz) y el cliente (cada fotograma) den lo mismo.
 */
export function stepCar(grid: ZoneGrid, x: number, y: number, motion: CarMotion, input: DriveInput, maxSpeed: number, tuning: CarTuning, dt: number) {
  const spec = carSpec(tuning);
  let m: CarMotion = { ...motion };
  const snap = (input as { snap?: number }).snap;
  if (snap !== undefined) { m.heading = snap; m.vx = 0; m.vy = 0; m.yaw = 0; }
  let px = x, py = y, impact = 0;
  for (let left = dt; left > 1e-6; left -= 1 / 60) {
    const h = Math.min(1 / 60, left);
    const r = integrate(grid, px, py, m, input, maxSpeed * spec.topMult, spec, h);
    px = r.x; py = r.y; m = r.m; impact = Math.max(impact, r.m.impact ?? 0);
  }
  m.impact = impact;
  return { x: px, y: py, ...m } as { x: number; y: number } & Required<Pick<CarMotion, 'speed' | 'heading'>> & CarMotion;
}

function integrate(grid: ZoneGrid, x: number, y: number, m0: CarMotion, input: DriveInput, vmax: number, s: CarSpec, dt: number) {
  const pr = s.profile;
  let heading = m0.heading;
  let vx = m0.vx ?? Math.cos(heading) * (m0.speed ?? 0), vy = m0.vy ?? Math.sin(heading) * (m0.speed ?? 0);
  let yaw = m0.yaw ?? 0, steerPos = m0.steer ?? 0, gear = m0.gear ?? 1, shift = Math.max(0, (m0.shift ?? 0) - dt);
  // En la rejilla la y crece hacia abajo: un ángulo que crece gira a la derecha. La izquierda del morro es (fy, −fx).
  const base = (h: number) => ({ fx: Math.cos(h), fy: Math.sin(h), lx: Math.sin(h), ly: -Math.cos(h) });
  let b = base(heading);
  let fwd = vx * b.fx + vy * b.fy, lat = vx * b.lx + vy * b.ly;
  const v = Math.hypot(vx, vy);
  const throttleIn = clamp(input.throttle, -1, 1), hb = !!input.handbrake;
  // Volante: con teclado no hay medias tintas, así que se mueve a una velocidad (más rápido al soltar, como en GTA).
  const want = clamp(input.steer, -1, 1);
  const rate = (want === 0 || Math.sign(want) !== Math.sign(steerPos) ? 7.5 : 4.2) * (0.75 + 0.25 * pr.lock);
  steerPos += clamp(want - steerPos, -rate * dt, rate * dt);

  // --- Acelerador, freno y marcha atrás
  let accelCmd = 0, braking = false;
  if (throttleIn > 0) { if (fwd < -0.3) braking = true; else accelCmd = throttleIn; }
  else if (throttleIn < 0) { if (fwd > 0.3) braking = true; else accelCmd = throttleIn * 0.45; } // marcha atrás, floja
  // Marchas (para el sonido y el tirón al cambiar): el par sube y baja dentro de cada marcha.
  const u = clamp(Math.abs(fwd) / Math.max(1, vmax), 0, 1.05);
  const edges = Array.from({ length: pr.gears }, (_, i) => Math.pow((i + 1) / pr.gears, 0.72));
  let g = edges.findIndex((e) => u <= e) + 1; if (g <= 0) g = pr.gears;
  if (fwd < -0.2) g = -1;
  if (g > gear && gear > 0 && accelCmd > 0 && !s.hover) shift = 0.13; // cambio hacia arriba: un instante sin empuje
  gear = g;
  const lo = g > 1 ? edges[g - 2] : 0, hi = g > 0 ? edges[g - 1] : 0.3;
  const rpm = g > 0 ? clamp(0.28 + 0.72 * (u - lo) / Math.max(0.01, hi - lo), 0.2, 1.05) : clamp(0.3 + u * 3, 0.3, 1);
  const torque = (1 - Math.pow(Math.min(1, u), 2.1)) * (0.8 + 0.3 * Math.sin(Math.PI * clamp(rpm, 0, 1)));
  const maxGrip = s.grip * (1 + pr.aero * u * u);
  const driveShare = pr.drive === 'total' ? 1 : pr.drive === 'del' ? 0.62 : 0.56; // peso sobre las ruedas que empujan
  let aLon = 0, spin = 0;
  if (accelCmd > 0) {
    const a = s.accel * accelCmd * torque * (shift > 0 ? 0.15 : 1);
    const limit = maxGrip * driveShare * 1.3; // tracción: lo que no agarra, patina
    if (a > limit) spin = clamp((a - limit) / a, 0, 1);
    aLon = Math.min(a, limit + (a - limit) * 0.35);
  } else if (accelCmd < 0) aLon = s.accel * accelCmd * (1 - Math.min(1, Math.abs(fwd) / 4));
  if (braking) aLon = -Math.sign(fwd) * s.brake * Math.min(1, 0.45 + Math.abs(fwd) / 3);
  if (hb) aLon -= Math.sign(fwd) * s.brake * 0.42;
  // Sin gas: freno motor, rodadura y aire (los pesados ruedan más tiempo; los ligeros paran antes).
  if (accelCmd === 0 && !braking && !hb) aLon = -Math.sign(fwd) * (0.7 + 0.06 * Math.abs(fwd)) * s.engineBrake * Math.pow(1300 / s.mass, 0.25);
  const fwdBefore = fwd;
  fwd += aLon * dt;
  if (accelCmd <= 0 && Math.sign(fwd) !== Math.sign(fwdBefore) && fwdBefore !== 0 && !(accelCmd < 0 && fwdBefore < 0)) fwd = 0; // frenar no hace dar marcha atrás
  const top = fwd >= 0 ? vmax : vmax * 0.32;
  if (Math.abs(fwd) > top) fwd = Math.sign(fwd) * (top + (Math.abs(fwd) - top) * Math.exp(-dt * 3));

  // --- Volante → giro del morro (modelo de bicicleta), limitado por lo que agarran las ruedas delanteras.
  const vAbs = Math.abs(fwd);
  const maxAngle = 0.62 * s.lock / (1 + vAbs / 9); // la dirección se suaviza con la velocidad
  let yawTarget = vAbs > 0.05 ? (fwd * Math.tan(steerPos * maxAngle)) / pr.wheelbase : 0;
  // Reparto de pesos: al frenar se carga el morro (gira mejor); al acelerar se descarga (un tracción delantera subvira).
  const transfer = braking ? 1.25 : accelCmd > 0 ? (pr.drive === 'del' ? 0.8 : 0.95) : 1;
  const powerUse = accelCmd > 0 ? Math.hypot(Math.abs(fwd * yaw) / maxGrip, aLon / (maxGrip * driveShare * 1.3)) : 0;
  const frontGrip = maxGrip * transfer * (pr.drive === 'del' ? 1 - clamp((powerUse - 0.8) * 1.5, 0, 0.35) : 1);
  const yawCap = vAbs > 0.5 ? (frontGrip * 1.1) / vAbs : 6;
  if (Math.abs(yawTarget) > yawCap) yawTarget = Math.sign(yawTarget) * yawCap; // subviraje: no gira más de lo que agarra
  // Freno de mano: la cola se suelta y el coche pivota hacia donde giras.
  if (hb && vAbs > 2) yawTarget += steerPos * Math.min(2.6, vAbs * 0.25) * Math.sign(fwd) * (pr.hb ?? 1);
  // Ayuda de estabilidad: si la cola se va, el morro tiende a volver hacia donde va el coche (más en un lujo, menos en un hiper).
  const beta = v > 1 ? Math.atan2(lat, Math.max(0.5, Math.abs(fwd))) : 0; // > 0: el coche se mueve a la izquierda del morro
  if (Math.abs(beta) > 0.2 && !hb) yawTarget -= beta * pr.assist * 1.4 * (steerPos !== 0 && Math.sign(steerPos) !== Math.sign(-beta) ? 1.8 : 1);
  const resp = s.yaw * (braking ? 1.2 : 1) * (hb ? 1.5 : 1);
  yaw += (yawTarget - yaw) * Math.min(1, dt * resp);
  heading = wrap(heading + yaw * dt);

  // --- La velocidad, vista desde el morro nuevo: lo que queda de lado es deriva y los neumáticos la frenan hasta su límite.
  vx = b.fx * fwd + b.lx * lat; vy = b.fy * fwd + b.ly * lat;
  b = base(heading);
  fwd = vx * b.fx + vy * b.fy; lat = vx * b.lx + vy * b.ly;
  const sliding = Math.abs(beta) > 0.18 || hb;
  // Círculo de fricción: una rueda no puede empujar y girar a la vez al máximo. Con propulsión trasera, gas a fondo en
  // plena curva suelta la cola (sobreviraje de potencia); con tracción delantera, el morro se va (subviraje).
  const latUse = Math.abs(fwd * yaw) / maxGrip, lonUse = accelCmd > 0 ? aLon / (maxGrip * driveShare * 1.3) : 0;
  const combined = Math.hypot(latUse, lonUse);
  let rearLoss = 0;
  if (pr.drive !== 'del' && accelCmd > 0) rearLoss = clamp(Math.max((combined - 0.62) * 2.6, spin) * pr.power * 2 * (pr.drive === 'total' ? 0.6 : 1), 0, 0.85);
  let latGrip = maxGrip * (sliding ? s.slide : 1) * (1 - rearLoss) * (hb ? 1 - 0.68 * (pr.hb ?? 1) : 1);
  if (v < 1.2 && !hb) latGrip = 99; // casi parado: no se derrapa
  const latBefore = lat;
  lat -= Math.sign(lat) * Math.min(Math.abs(lat), latGrip * dt);
  const scrub = Math.abs(latBefore - lat) * (sliding ? 0.2 : 0.02); // derrapar cuesta velocidad: los neumáticos frotan
  fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), scrub);
  vx = b.fx * fwd + b.lx * lat; vy = b.fy * fwd + b.ly * lat;

  // --- Mover con choques: lo que choca rebota poco (los pesados, aún menos) y el golpe se apunta.
  const ddx = vx * dt, ddy = vy * dt;
  const next = stepWithCollision(grid, x, y, ddx, ddy);
  let impact = 0;
  const rest = 0.22 * Math.min(1.3, Math.pow(1300 / s.mass, 0.4));
  if (Math.abs(ddx) > 1e-5 && Math.abs(next.x - x) < Math.abs(ddx) * 0.5) { impact += Math.abs(vx); vx = -vx * rest; }
  if (Math.abs(ddy) > 1e-5 && Math.abs(next.y - y) < Math.abs(ddy) * 0.5) { impact += Math.abs(vy); vy = -vy * rest; }
  if (impact > 0) yaw *= -0.25;
  if (Math.hypot(vx, vy) < 0.04 && accelCmd === 0) { vx = 0; vy = 0; yaw = 0; }
  const fNow = vx * b.fx + vy * b.fy, lNow = vx * b.lx + vy * b.ly;
  const m: CarMotion = {
    speed: Math.hypot(vx, vy), heading, vx, vy, yaw, steer: steerPos, fwd: fNow, gear, shift,
    rpm: accelCmd > 0 || Math.abs(fNow) > 0.5 ? rpm : 0.2,
    slip: Math.hypot(vx, vy) > 1 ? Math.atan2(lNow, Math.max(0.5, Math.abs(fNow))) : 0, spin: accelCmd > 0 ? spin : 0,
    latA: -fNow * yaw, lonA: aLon, impact, braking: braking || (hb && Math.abs(fNow) > 0.5), handbrake: hb,
  };
  return { x: next.x, y: next.y, m };
}

/** Nombre de la conducción de un coche (para la ficha y el concesionario). */
export function driveStyle(t: Pick<CarTuning, 'class' | 'id' | 'hover'>) {
  const pr = carProfile(t);
  const traction = pr.drive === 'total' ? 'tracción total' : pr.drive === 'del' ? 'tracción delantera' : 'propulsión trasera';
  return `${t.hover ? 'Levitación · ' : ''}${pr.name} · ${traction} · ${Math.round(pr.mass)} kg`;
}
