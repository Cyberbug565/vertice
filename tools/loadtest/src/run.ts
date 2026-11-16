// Generador de carga sobre el protocolo real.
// Uso: npm run loadtest -- --scenario spread --bots 100 --duration 120 [--base http://localhost:8080]
//      npm run loadtest -- --scenario crowd  --bots 40  --duration 120   (servidor con CROWD_NPCS=60)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BotClient } from './botclient.js';

const args = Object.fromEntries(process.argv.slice(2).reduce<[string, string][]>((acc, a, i, arr) => { if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? 'true' : arr[i + 1]]); return acc; }, []));
const BASE = args.base ?? 'http://localhost:8080';
const SCENARIO = (args.scenario ?? 'spread') as 'spread' | 'crowd';
const BOTS = Number(args.bots ?? 20);
const DURATION = Number(args.duration ?? 60);
const WARMUP = Number(args.warmup ?? 10);
const ADMIN = args.token ?? process.env.ADMIN_TOKEN ?? 'dev-admin';
const RUN = args.run ?? Date.now().toString(36).slice(-4);
const HOT: [number, number] = [38, 174];
const ROLES = ['solo', 'netrunner', 'tech', 'medtech', 'fixer', 'nomad', 'media', 'exec', 'lawman', 'rocker'];
const FERRO_POINTS: [number, number][] = [[15,153],[37,153],[67,153],[89,153],[106,153],[126,153],[145,153],[15,189],[37,189],[67,189],[89,189],[106,189],[126,189],[23,145],[51,145],[82,145],[113,145],[23,175],[51,175],[82,175],[113,169],[138,169],[23,206],[51,210],[82,206],[113,206],[37,163],[42,175],[46,182],[71,185],[41,199]];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const pct = (arr: number[], p: number) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

interface BotStats { acks: number[]; errors: string[]; reconnects: number; doors: number; dialogs: number; buys: number; moves: number }

async function metrics(reset = false) {
  const r = await fetch(`${BASE}/api/metrics?token=${ADMIN}${reset ? '&reset=1' : ''}`);
  return r.json() as Promise<any>;
}

async function runBot(i: number, contentHash: string, until: number, stats: BotStats, clients: BotClient[]) {
  const username = `bot${RUN}x${i}`;
  const token = await BotClient.registerAndCreate(BASE, username, ROLES[i % ROLES.length]);
  let b = new BotClient(BASE, username);
  b.keepLog = false;
  clients[i] = b;
  await b.connect(token, contentHash);
  const timedMove = async (x: number, y: number) => {
    const t0 = performance.now();
    const a = await b.move(x, y);
    stats.acks.push(performance.now() - t0); stats.moves++;
    return a;
  };
  const walkTo = async (x: number, y: number, maxMs = 25000) => {
    const a = await timedMove(x, y);
    if (!a.ok) return false;
    const end = a.path![a.path!.length - 1];
    const t0 = Date.now();
    while (Math.hypot(b.x - end[0], b.y - end[1]) > 0.1 && Date.now() - t0 < maxMs && Date.now() < until) await sleep(200);
    return true;
  };
  // Salir del vestíbulo a la calle.
  await b.enterDoor('Salida', 30000).catch((e) => stats.errors.push(`salida: ${e.message}`));
  while (Date.now() < until) {
    try {
      if (b.closed) throw new Error('conexión cerrada');
      const r = Math.random();
      if (SCENARIO === 'crowd') {
        // Punto concurrido: deambular cerca del mercado, hablar con PNJ cercanos y charlar.
        await walkTo(HOT[0] + rnd(-7, 7), HOT[1] + rnd(-7, 7), 12000);
        if (r < 0.1) { const npc = b.findEntity((e) => e.kind === 'npc' && Math.hypot(e.x - b.x, e.y - b.y) < 6); if (npc) { await b.cmd({ t: 'interact', target: npc.id }); stats.dialogs++; await sleep(1500); await b.cmd({ t: 'closeDialog' }); } }
        if (r > 0.97) b.raw({ t: 'chat', seq: b.seq++, channel: 'local', text: 'probando carga en el mercado' });
        await sleep(rnd(500, 2500));
      } else if (r < 0.62) {
        await walkTo(...(pick(FERRO_POINTS).map((v) => v + 0.5) as [number, number]));
        await sleep(rnd(500, 3000));
      } else if (r < 0.82) {
        // Entrar en un interior, quedarse un rato y salir.
        if (b.zone !== 'vertice') { await b.enterDoor('Salida', 30000); continue; }
        const [door, ax, ay] = pick([['Relé', 71.5, 183.5], ['Clínica', 40.5, 202.5], ['Bloque 9', 69.5, 175.5]] as [string, number, number][]);
        await walkTo(ax, ay, 40000);
        await b.enterDoor(door, 40000); stats.doors++;
        await walkTo(rnd(3, 9), rnd(3, 8), 8000);
        if (door === 'Clínica' && Math.random() < 0.5) {
          const d = await b.interactAndDialog('Sato', 20000).catch(() => null); stats.dialogs++;
          if (d && d.options.some((o) => o.id === 'stim' && !o.disabled)) { await b.choose('stim'); stats.buys++; }
          await b.cmd({ t: 'closeDialog' });
        }
        await sleep(rnd(3000, 9000));
        await b.enterDoor('Salida', 40000); stats.doors++;
      } else if (r < 0.92) {
        // Comprar fideos a Lin si está a la vista (escritura económica idempotente).
        const lin = b.findEntity((e) => e.name.startsWith('Lin'));
        if (lin) {
          const d = await b.interactAndDialog('Lin', 30000).catch(() => null); stats.dialogs++;
          if (d && d.options.some((o) => o.id === 'buy' && !o.disabled)) { await b.choose('buy'); stats.buys++; }
          await b.cmd({ t: 'closeDialog' });
        } else await walkTo(18.5, 31.5);
      } else if (r < 0.96) {
        // Reconexión deliberada: cerrar y volver a entrar con la misma sesión.
        b.close(); await sleep(rnd(300, 1500));
        b = new BotClient(BASE, username); b.keepLog = false; clients[i] = b;
        await b.connect(token, contentHash); stats.reconnects++;
      } else {
        b.raw({ t: 'chat', seq: b.seq++, channel: 'local', text: `hola desde ${username}` });
        await sleep(rnd(1000, 3000));
      }
    } catch (e: any) {
      stats.errors.push(e.message);
      if (b.closed && Date.now() < until) {
        await sleep(1000);
        b = new BotClient(BASE, username); b.keepLog = false; clients[i] = b;
        try { await b.connect(token, contentHash); stats.reconnects++; } catch (e2: any) { stats.errors.push(`reconexión: ${e2.message}`); await sleep(3000); }
      } else await sleep(1000);
    }
  }
}

async function main() {
  const cv: any = await (await fetch(`${BASE}/api/content-version`)).json();
  console.log(`Escenario ${SCENARIO} · ${BOTS} bots · ${DURATION} s (+${WARMUP} s de calentamiento) · ${BASE}`);
  const clients: BotClient[] = [];
  const stats: BotStats = { acks: [], errors: [], reconnects: 0, doors: 0, dialogs: 0, buys: 0, moves: 0 };
  const until = Date.now() + (WARMUP + DURATION) * 1000 + BOTS * 60;
  const t0 = Date.now();
  const bots: Promise<void>[] = [];
  for (let i = 0; i < BOTS; i++) { bots.push(runBot(i, cv.hash, until, stats, clients).catch((e) => { stats.errors.push(`bot ${i}: ${e.message}`); })); await sleep(60); }
  console.log(`Bots conectados en ${((Date.now() - t0) / 1000).toFixed(1)} s. Calentando…`);
  await sleep(WARMUP * 1000);
  // Ventana de medición: se reinician las ventanas del servidor y se marca el inicio por cliente.
  await metrics(true);
  const startIdx = clients.map((c) => c?.perSecond.length ?? 0);
  const startBytes = clients.map((c) => c?.bytesIn ?? 0);
  stats.acks = [];
  const mid: any[] = [];
  const tick = setInterval(async () => { try { const m = await metrics(); mid.push({ t: Math.round((Date.now() - t0) / 1000), tickP95: +m.tickMs.p95.toFixed(2), conns: m.world.connections, rss: m.memoryMiB.rss }); } catch {} }, 10000);
  await Promise.all(bots);
  clearInterval(tick);
  const m = await metrics();
  const windows: number[] = [];
  const perClientAvg: number[] = [];
  clients.forEach((c, i) => {
    if (!c) return;
    const w = c.perSecond.slice(startIdx[i] ?? 0).filter((_, k, arr) => k < arr.length);
    windows.push(...w.map((x) => x / 1024));
    if (w.length) perClientAvg.push(w.reduce((s, x) => s + x, 0) / w.length / 1024);
  });
  for (const c of clients) c?.close();
  const report = {
    scenario: SCENARIO, bots: BOTS, durationS: DURATION, warmupS: WARMUP, base: BASE, run: RUN, at: new Date().toISOString(),
    note: 'Generador y servidor en la misma máquina salvo que se indique lo contrario. Población: bots = clientes sintéticos; PNJ según /api/metrics.',
    server: { tickMs: m.tickMs, dbWriteMs: m.dbWriteMs, world: m.world, counters: m.counters, memoryMiB: m.memoryMiB, db: m.db },
    client: {
      recvKiBps: { avg: +(perClientAvg.reduce((s, x) => s + x, 0) / Math.max(1, perClientAvg.length)).toFixed(2), p50: +pct(windows, 0.5).toFixed(2), p95: +pct(windows, 0.95).toFixed(2), p99: +pct(windows, 0.99).toFixed(2), max: +Math.max(0, ...windows).toFixed(2) },
      moveAckMs: { p50: +pct(stats.acks, 0.5).toFixed(1), p95: +pct(stats.acks, 0.95).toFixed(1), p99: +pct(stats.acks, 0.99).toFixed(1), n: stats.acks.length },
      initialLoadKiB: +(startBytes.reduce((s, x) => s + x, 0) / Math.max(1, startBytes.length) / 1024).toFixed(1),
    },
    activity: { moves: stats.moves, doorCrossings: stats.doors, dialogs: stats.dialogs, purchases: stats.buys, reconnects: stats.reconnects, errors: stats.errors.length, sampleErrors: [...new Set(stats.errors)].slice(0, 10) },
    timeline: mid,
  };
  const dir = join(dirname(fileURLToPath(import.meta.url)), '../../../loadtest-results');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${SCENARIO}-${BOTS}bots-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  const tk = m.tickMs;
  console.log(`\n== Resultado (${SCENARIO}, ${BOTS} bots, ${DURATION} s medidos) ==`);
  console.log(`Tick servidor: p50 ${tk.p50.toFixed(2)} ms · p95 ${tk.p95.toFixed(2)} ms · p99 ${tk.p99.toFixed(2)} ms · máx ${tk.max.toFixed(2)} ms (presupuesto 50 ms; objetivo p95 ≤ 25, p99 ≤ 40)`);
  console.log(`Recepción por cliente: media ${report.client.recvKiBps.avg} KiB/s · p95 ventana 1 s ${report.client.recvKiBps.p95} KiB/s · máx ${report.client.recvKiBps.max} KiB/s`);
  console.log(`Ack de movimiento: p50 ${report.client.moveAckMs.p50} ms · p95 ${report.client.moveAckMs.p95} ms (n=${report.client.moveAckMs.n})`);
  console.log(`Mundo: ${JSON.stringify(m.world.zones)} · conexiones ${m.world.connections} · RSS ${m.memoryMiB.rss} MiB`);
  console.log(`Actividad: ${JSON.stringify(report.activity)}`);
  console.log(`Informe: ${file}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
