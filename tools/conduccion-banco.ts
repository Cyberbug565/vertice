// v0.45 · Banco de pruebas de la conducción: mide cada coche en una pista vacía (0 → 60 % de punta, punta, frenada,
// radio de giro, derrape con freno de mano y estabilidad). Uso: npx tsx tools/conduccion-banco.ts
import { loadContentFromDisk } from '../server/src/content.js';
import { stepCar, vehicleSpeed, carSpec, type CarMotion, type DriveInput, type ZoneGrid } from '@vertice/shared';
const { content } = loadContentFromDisk();
const W = 2000;
const grid = { w: W, h: W, walk: new Uint8Array(W * W).fill(1) } as unknown as ZoneGrid;
const DT = 0.05;
function run(car: (typeof content.cars)[number], steps: number, input: (t: number, m: CarMotion) => DriveInput, m0?: CarMotion) {
  let s: any = { x: 1000, y: 1000, ...(m0 ?? { speed: 0, heading: 0 }) };
  const vmax = vehicleSpeed(car.speed), tuning = { ...car, class: car.class, id: car.id };
  const out: any[] = [];
  for (let i = 0; i < steps; i++) { s = stepCar(grid, s.x, s.y, s, input(i * DT, s), vmax, tuning, DT); out.push(s); }
  return { end: s, trace: out, vmax };
}
const rows: string[] = [];
for (const car of content.cars) {
  const acc = run(car, 400, () => ({ throttle: 1, steer: 0 }));
  const t60 = acc.trace.findIndex((s) => s.speed >= acc.vmax * 0.6) * DT, t95 = acc.trace.findIndex((s) => s.speed >= acc.vmax * 0.95) * DT;
  const top = Math.max(...acc.trace.map((s) => s.speed));
  // frenada desde el 80 %
  const start = acc.trace.find((s) => s.speed >= acc.vmax * 0.8) ?? acc.end;
  const br = run(car, 200, () => ({ throttle: -1, steer: 0 }), start);
  const stopI = br.trace.findIndex((s) => s.speed < 0.1);
  const brakeDist = Math.hypot(br.trace[stopI].x - start.x, br.trace[stopI].y - start.y);
  // giro a fondo a mitad de punta (manteniendo gas suave)
  const mid = acc.trace.find((s) => s.speed >= acc.vmax * 0.5) ?? acc.end;
  const turn = run(car, 60, () => ({ throttle: 0.5, steer: 1 }), mid);
  const tEnd = turn.end; const radius = tEnd.speed / Math.max(0.01, Math.abs(tEnd.yaw));
  const turnSlip = Math.max(...turn.trace.map((s) => Math.abs(s.slip ?? 0)));
  // freno de mano en curva a 70 %
  const fast = acc.trace.find((s) => s.speed >= acc.vmax * 0.7) ?? acc.end;
  const hb = run(car, 30, (t) => ({ throttle: t < 0.6 ? 0 : 1, steer: 1, handbrake: t < 0.6 }), fast);
  const hbSlip = Math.max(...hb.trace.map((s) => Math.abs(s.slip ?? 0)));
  const hbTurn = Math.abs(hb.end.heading - fast.heading);
  // gas a fondo en curva (sobreviraje de potencia) desde el 35 %
  const slow = acc.trace.find((s) => s.speed >= acc.vmax * 0.35) ?? acc.end;
  const pw = run(car, 40, () => ({ throttle: 1, steer: 1 }), slow);
  const pwSlip = Math.max(...pw.trace.map((s) => Math.abs(s.slip ?? 0)));
  const spec = carSpec({ ...car });
  rows.push([car.id.padEnd(22), car.class.padEnd(11), String(Math.round(spec.mass)).padStart(5), acc.vmax.toFixed(1).padStart(5), top.toFixed(1).padStart(5), t60.toFixed(2).padStart(5), t95.toFixed(1).padStart(5), brakeDist.toFixed(1).padStart(5), radius.toFixed(1).padStart(5), (turnSlip * 57.3).toFixed(0).padStart(4), (hbSlip * 57.3).toFixed(0).padStart(4), (hbTurn * 57.3).toFixed(0).padStart(4), (pwSlip * 57.3).toFixed(0).padStart(4), (turn.trace.reduce((a: number, t: any) => a + (t.yaw ?? 0), 0) > 0 ? 'der' : 'izq')].join(' '));
}
console.log('coche                  clase        kg    vmax  punta t60%  t95%  fren  radio dsl° fm° fmGiro gas° giro');
console.log(rows.join('\n'));
