// Red degradada: proxy TCP con RTT y ancho de banda limitados, y cortes bruscos durante operaciones persistentes.
// Uso: npm run degraded -w tools/loadtest -- --target 8080 --rtts 50,150,250 [--kbps 64]
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BotClient } from './botclient.js';

const args = Object.fromEntries(process.argv.slice(2).reduce<[string, string][]>((acc, a, i, arr) => { if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] ?? 'true']); return acc; }, []));
const TARGET = Number(args.target ?? 8080);
const RTTS = (args.rtts ?? '50,150,250').split(',').map(Number);
const KBPS = Number(args.kbps ?? 64);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Proxy con retardo de RTT/2 por sentido y cola limitada por ancho de banda (orden preservado). */
function startProxy(port: number, rttMs: number, kibps: number) {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((client) => {
    const up = net.connect(TARGET, '127.0.0.1');
    sockets.add(client); sockets.add(up);
    const pipe = (from: net.Socket, to: net.Socket) => {
      let nextFree = 0;
      from.on('data', (d) => {
        const now = Date.now();
        const tx = (d.length / (kibps * 1024)) * 1000; // tiempo de transmisión con el ancho de banda limitado
        const start = Math.max(now, nextFree);
        nextFree = start + tx;
        setTimeout(() => { if (!to.destroyed) to.write(d); }, start + tx + rttMs / 2 - now);
      });
      from.on('close', () => setTimeout(() => to.destroy(), rttMs / 2));
      from.on('error', () => to.destroy());
    };
    pipe(client, up); pipe(up, client);
  });
  server.listen(port, '127.0.0.1');
  return { cut: () => { for (const s of sockets) s.destroy(); sockets.clear(); }, close: () => new Promise<void>((r) => { for (const s of sockets) s.destroy(); server.close(() => r()); }) };
}

async function scenario(rtt: number, port: number) {
  const proxy = startProxy(port, rtt, KBPS);
  const base = `http://127.0.0.1:${port}`;
  const cv: any = await BotClient.api(base, '/api/content-version');
  const user = `net${rtt}x${Date.now().toString(36).slice(-4)}`;
  const token = await BotClient.registerAndCreate(base, user, 'medtech', 'corporativo');
  const res: Record<string, unknown> = { rttMs: rtt, bandwidthKiBps: KBPS };
  let b = new BotClient(base, user);
  const w0 = await b.connect(token, cv.hash);
  const money0 = w0.sheet.money;
  // 1) Latencia de confirmación de órdenes con el RTT impuesto.
  const acks: number[] = [];
  for (let i = 0; i < 5; i++) { const t0 = performance.now(); await b.move(5.5 + i, 8.5); acks.push(performance.now() - t0); await sleep(300); }
  res.moveAckMsMedian = Math.round(acks.sort((a, c) => a - c)[2]);
  // 2) Desplazamiento a la clínica y coherencia de posición (cliente ≈ servidor al llegar).
  await b.enterDoor('Salida', 60000);
  await b.moveAndArrive(23.5, 51.5, 90000);
  await b.enterDoor('Clínica', 60000);
  await b.interactAndDialog('Sato', 60000);
  // 3) Cortes bruscos durante una compra. Temprano: la orden no llega. Tardío: el servidor ya la aplicó pero el ack no llega.
  //    En ambos casos el reintento con el mismo opId deja exactamente un cobro.
  const outcomes: string[] = [];
  for (const [label, cutAt] of [['temprano', Math.max(5, rtt / 4)], ['tardío', rtt * 0.5 + 60]] as [string, number][]) {
    const opId = randomUUID().replace(/-/g, '');
    if (!b.dialog) await b.interactAndDialog('Sato', 60000);
    b.raw({ t: 'choose', seq: b.seq++, dialog: b.dialog!.dialog, option: 'stim', luck: 0, opId });
    await sleep(cutAt);
    proxy.cut();
    await sleep(500);
    b = new BotClient(base, user);
    const w1 = await b.connect(token, cv.hash);
    res.zoneAfterCut = w1.zone;
    await b.interactAndDialog('Sato', 60000);
    const retry = await b.cmd({ t: 'choose', dialog: b.dialog!.dialog, option: 'stim', luck: 0, opId }, 20000);
    outcomes.push(`${label}: ${retry.info ?? (retry.ok ? 'aplicada en el reintento' : retry.reason)}`);
    await sleep(rtt + 300);
  }
  res.retries = outcomes;
  res.moneyDelta = b.sheet!.money - money0;
  res.stimsCharged = Math.round(-(b.sheet!.money - money0) / 40);
  res.ok = res.stimsCharged === 2 && res.zoneAfterCut === 'clinica-sato';
  // 4) Posición tras reconectar = última posición confirmada.
  const before = { x: b.x, y: b.y };
  b.close();
  await sleep(600);
  const b2 = new BotClient(base, user);
  const w2 = await b2.connect(token, cv.hash);
  res.positionDriftAfterReconnect = +Math.hypot(w2.x - before.x, w2.y - before.y).toFixed(3);
  b2.close();
  await proxy.close();
  return res;
}

const out: Record<string, unknown>[] = [];
let port = 9100;
for (const rtt of RTTS) {
  try { const r = await scenario(rtt, port++); out.push(r); console.log(JSON.stringify(r)); }
  catch (e: any) { out.push({ rttMs: rtt, ok: false, error: e.message }); console.log(`RTT ${rtt}: ERROR ${e.message}`); }
}
const dir = join(dirname(fileURLToPath(import.meta.url)), '../../../loadtest-results');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, `degraded-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), JSON.stringify({ target: TARGET, at: new Date().toISOString(), results: out }, null, 2));
process.exit(out.every((r) => r.ok) ? 0 : 1);
