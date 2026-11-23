// v0.35 · Genera content/npcs/porteros-patrullas.json: dos porteros por turno en la puerta de los casinos grandes y dos
// agentes de la PCV por turno patrullando alrededor de cada comisaría. Uso: npx tsx scripts/gen-v35-npcs.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { buildZoneGrid, pedestrianGrid, isWalkable, ZoneSchema } from '@vertice/shared';

const city = ZoneSchema.parse(JSON.parse(readFileSync('content/zones/vertice.json', 'utf8')));
const grid = buildZoneGrid(city), ped = pedestrianGrid(grid, 'stop');
const ok = (x: number, y: number) => isWalkable(ped, x + 0.5, y + 0.5);
let seed = 340;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const NAMES = ['Marco Bastida', 'Lía Ferrán', 'Gael Sorní', 'Unai Prats', 'Elsa Corbal', 'Rubén Tamés', 'Iria Valcárcel', 'Dani Ochoa', 'Noa Garrido', 'Hugo Sendra',
  'Abril Tena', 'Mateo Ruidíaz', 'Olga Sastre', 'Pol Arnau', 'Carla Montes', 'Iker Lamas', 'Zoe Barral', 'Rai Cendón', 'Luna Escrivá', 'Tomás Viader',
  'Irene Gual', 'Bruno Calvet', 'Celia Nadal', 'Erik Solé', 'Ainhoa Pujol', 'Martí Quiles', 'Lola Requena', 'Nil Tarrés', 'Sara Ibars', 'Adrián Mora',
  'Vega Lluch', 'Óscar Feliu', 'Eva Rigau', 'Joan Bover', 'Maya Serra', 'Aitor Rius', 'Lara Pons', 'Iván Oller', 'Clara Domènech', 'Raúl Vidiella'];
let ni = 0;
const SKIN = ['#f1c7a8', '#d9a47f', '#ae7259', '#8b5a3c', '#704333', '#4a2c22'], HAIR = ['#1f171d', '#2a1d17', '#5a3a22', '#b9b2a8', '#7a2a1a'];
const STYLES = ['corto', 'rapado', 'moño', 'coleta', 'afro', 'cresta'];
const body = () => (rnd() < 0.5 ? 'masculino' : 'femenino');
const out: unknown[] = [];
/** Casilla transitable más cercana dentro de un interior. */
function inside(zone: string, x: number, y: number): [number, number] {
  const g = buildZoneGrid(ZoneSchema.parse(JSON.parse(readFileSync(`content/zones/${zone}.json`, 'utf8'))));
  for (let r = 0; r <= 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (isWalkable(g, x + dx + 0.5, y + dy + 0.5)) return [x + dx, y + dy];
  throw new Error(`sin hueco en ${zone}`);
}

// Desde la puerta, la calle está del lado transitable; los porteros se ponen a los lados, un paso hacia fuera.
function doorSide(at: [number, number]) {
  const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const;
  let best = dirs[0], bn = -1;
  for (const d of dirs) { let n = 0; for (let k = 1; k <= 4; k++) if (ok(at[0] + d[0] * k, at[1] + d[1] * k)) n++; if (n > bn) { bn = n; best = d; } }
  return best;
}
function near(x: number, y: number, r = 4): [number, number] {
  for (let rr = 0; rr <= r; rr++) for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) if (ok(x + dx, y + dy)) return [x + dx, y + dy];
  throw new Error(`sin hueco cerca de ${x},${y}`);
}

const CASINOS = [{ zone: 'casino-meridiano', name: 'Gran Meridiano', jacket: '#15131c', accent: '#d8b04a' }, { zone: 'casino-hipodromo', name: 'Hipódromo Prisma', jacket: '#1c1530', accent: '#ff3fa4' }];
for (const cas of CASINOS) {
  const d = city.doors.find((x) => x.to.zone === cas.zone)!;
  const [sx, sy] = doorSide(d.at);
  const px = sy !== 0 ? 1 : 0, py = sx !== 0 ? 1 : 0; // perpendicular a la salida
  const front: [number, number] = [d.at[0] + sx * 2, d.at[1] + sy * 2];
  const spots = [near(d.at[0] + sx - px * 1, d.at[1] + sy - py * 1, 1), near(d.at[0] + sx + px * 1, d.at[1] + sy + py * 1, 1)];
  const tpl = ZoneSchema.parse(JSON.parse(readFileSync(`content/zones/${cas.zone}.json`, 'utf8')));
  for (const [shift, from, to] of [['día', 8, 20], ['noche', 20, 8]] as const) for (let k = 0; k < 2; k++) {
    const b = body();
    out.push({
      id: `portero-${cas.zone.replace('casino-', '')}-${shift === 'día' ? 'd' : 'n'}${k + 1}`, name: NAMES[ni++], title: `Portero de ${cas.name}`, essential: true,
      resident: { job: 'seguridad', temper: k ? 'seco' : 'metodico', speed: 1.5, door: cas.zone,
        personal: k ? 'Aquí dentro la casa siempre gana. Aquí fuera, decido yo quién juega.' : `Llevo años en la puerta de ${cas.name}. Me fijo en las manos, en la ropa y en la cartera.` },
      appearance: { skin: pick(SKIN), hair: pick(HAIR), jacket: cas.jacket, accent: cas.accent, body: b, hairStyle: pick(STYLES), top: 'chaqueta', build: 'fornido', accessory: 'gafas', pants: '#111118' },
      schedule: [
        { from, to, zone: 'vertice', at: spots[k], state: 'work', label: 'Controla la puerta', face: front, pose: 'brazos' },
        { from: to, to: (to + 1) % 24, zone: 'vertice', at: near(front[0] + sx * 3 + px * (k ? 3 : -3), front[1] + sy * 3 + py * (k ? 3 : -3), 4), state: 'talk', label: 'Se fuma un cigarro tras el relevo', pose: 'fumar' },
        { from: (to + 1) % 24, to: from, zone: cas.zone, at: tpl.safePoint, state: 'rest', label: 'Descansa fuera de turno', pose: 'telefono' },
      ],
    });
  }
}

// Patrullas: un recorrido de 5 paradas alrededor de la manzana de cada comisaría, en sentidos opuestos para cada agente.
const STATIONS = city.doors.filter((d) => /^comisaria/.test(d.to.zone));
for (const st of STATIONS) {
  const [sx, sy] = doorSide(st.at);
  const cx = st.at[0] + sx * 3, cy = st.at[1] + sy * 3;
  const ring: [number, number][] = [];
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; try { ring.push(near(Math.round(cx + Math.cos(a) * 11), Math.round(cy + Math.sin(a) * 9), 7)); } catch { /* manzana sin acera por ese lado */ } }
  if (ring.length < 3) throw new Error(`Patrulla sin recorrido: ${st.id}`);
  for (const [shift, from, to] of [['día', 6, 18], ['noche', 18, 6]] as const) for (let k = 0; k < 2; k++) {
    const route = k ? [...ring].reverse() : ring;
    out.push({
      id: `patrulla-${(st.to.zone === 'comisaria-int' ? 'cenit' : st.to.zone.replace('comisaria-', ''))}-${shift === 'día' ? 'd' : 'n'}${k + 1}`, name: NAMES[ni++], title: 'Agente de la PCV · Patrulla', essential: true,
      resident: { job: 'policia', temper: k ? 'cauto' : 'cordial', speed: 2.1, personal: `Damos la vuelta a la manzana de ${st.name.replace(/^Comisaría (de )?/, '')} cada pocos minutos. Si ves algo raro, avisa.` },
      appearance: { skin: pick(SKIN), hair: pick(HAIR), jacket: '#1e3250', accent: '#559efa', body: body(), hairStyle: pick(STYLES), top: 'chaleco', build: 'medio', accessory: 'gorra', pants: '#202a3a' },
      schedule: [
        { from, to, zone: 'vertice', at: route[0], state: 'work', label: 'Patrulla la manzana', stops: route.slice(1), pose: 'brazos' },
        { from: to, to: (to + 1) % 24, zone: st.to.zone, at: inside(st.to.zone, 12 - 2 * k, 5), state: 'talk', label: 'Redacta el parte del turno', pose: 'gesto' },
        { from: (to + 1) % 24, to: from, zone: st.to.zone, at: inside(st.to.zone, 10 - 2 * k, 2), state: 'rest', label: 'Descansa tras el relevo', pose: 'sentado' },
      ],
    });
  }
}
writeFileSync('content/npcs/porteros-patrullas.json', JSON.stringify(out, null, 2) + '\n');
console.log(`${out.length} PNJ: ${CASINOS.length * 4} porteros y ${STATIONS.length * 4} agentes de patrulla.`);
