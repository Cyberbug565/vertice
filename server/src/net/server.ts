// Transporte: API HTTP (cuentas, personajes, métricas), estáticos del cliente y WebSocket del juego.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { brotliCompressSync, gzipSync, constants as zc } from 'node:zlib';
import { WebSocketServer, type WebSocket } from 'ws';
import { ClientMsg, MAX_CLIENT_MESSAGE_BYTES, PROTOCOL_VERSION } from '@vertice/shared';
import type { Config } from '../config.js';
import type { Db } from '../db/db.js';
import type { Metrics } from '../metrics.js';
import type { World, PlayerConn } from '../world/world.js';
import { login, register, resolveToken, validateCredentials } from '../auth.js';
import { activeCharacterId, createCharacter } from '../game/player.js';

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

function json(res: ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function readBody(req: IncomingMessage, max = 16_384): Promise<any> {
  let size = 0; const chunks: Buffer[] = [];
  for await (const ch of req) { size += ch.length; if (size > max) throw new Error('too_large'); chunks.push(ch as Buffer); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return null; }
}
const bearer = (req: IncomingMessage) => (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '') || null;

/** Límite simple por IP para endpoints de autenticación. */
class IpLimiter {
  private hits = new Map<string, number[]>();
  constructor(private max: number, private windowMs: number) {}
  ok(ip: string) {
    const now = Date.now(); const arr = (this.hits.get(ip) ?? []).filter((t) => now - t < this.windowMs);
    if (arr.length >= this.max) { this.hits.set(ip, arr); return false; }
    arr.push(now); this.hits.set(ip, arr); return true;
  }
}

export function startServer(cfg: Config, db: Db, world: World, metrics: Metrics) {
  const staticCache = new Map<string, Buffer>();
  const authLimiter = new IpLimiter(Number(process.env.AUTH_RATE_LIMIT ?? 30), 60_000);

  const http = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://x');
      const ip = req.socket.remoteAddress ?? '?';
      if (url.pathname.startsWith('/api/')) {
        if (req.method === 'POST' && (url.pathname === '/api/register' || url.pathname === '/api/login')) {
          if (!authLimiter.ok(ip)) return json(res, 429, { error: 'Demasiados intentos. Espera un minuto.' });
          const b = await readBody(req);
          const err = validateCredentials(b?.username, b?.password);
          if (err) return json(res, 400, { error: err });
          const r = url.pathname === '/api/register' ? await register(db, b.username, b.password) : await login(db, b.username, b.password);
          return 'error' in r ? json(res, 400, r) : json(res, 200, r);
        }
        if (url.pathname === '/api/content-version') return json(res, 200, { hash: world.contentHash, protocol: PROTOCOL_VERSION });
        if (url.pathname === '/api/metrics') {
          const local = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
          if (!local && url.searchParams.get('token') !== cfg.adminToken) return json(res, 403, { error: 'forbidden' });
          if (url.searchParams.get('reset') === '1') metrics.resetWindows();
          const mem = process.memoryUsage();
          return json(res, 200, {
            uptimeS: Math.round((Date.now() - metrics.startedAt) / 1000), world: world.stats(), tickMs: metrics.tick.stats(), dbWriteMs: metrics.dbWrite.stats(),
            counters: metrics.counters, memoryMiB: { rss: Math.round(mem.rss / 1048576), heapUsed: Math.round(mem.heapUsed / 1048576) }, db: db.kind,
          });
        }
        const auth = await resolveToken(db, bearer(req));
        if (!auth) return json(res, 401, { error: 'Sesión no válida' });
        if (req.method === 'GET' && url.pathname === '/api/me') {
          const cid = await activeCharacterId(db, auth.accountId);
          let character = null;
          if (cid) {
            const r = await db.query<any>('SELECT id, name, role, origin, level, money, zone_id FROM characters WHERE id=$1', [cid]);
            character = r.rows[0] ?? null;
          }
          const memorial = (await db.query<any>('SELECT summary, created_at FROM memorial WHERE account_id=$1 ORDER BY created_at DESC', [auth.accountId])).rows;
          return json(res, 200, { account: { id: auth.accountId, username: auth.username }, character, memorial, online: world.conns.has(auth.accountId) });
        }
        if (req.method === 'GET' && url.pathname === '/api/cities') {
          return json(res, 200, [{ id: 'vertice-1', name: `${world.c.manifest.city} · Servidor 1`, players: world.conns.size, capacityTarget: 100 }]);
        }
        if (req.method === 'POST' && url.pathname === '/api/characters') {
          const b = await readBody(req);
          const r = await createCharacter(db, world.c, auth.accountId, b, world.contentHash);
          return 'error' in r ? json(res, 400, r) : json(res, 201, r);
        }
        return json(res, 404, { error: 'not_found' });
      }
      if (url.pathname === '/healthz') return json(res, 200, { ok: true });
      // Estáticos del cliente compilado.
      const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
      if (rel.includes('..')) { res.writeHead(400); return res.end(); }
      let file = join(cfg.staticDir, rel || 'index.html');
      try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); } catch { file = join(cfg.staticDir, 'index.html'); }
      try {
        const immutable = rel.startsWith('assets/');
        const type = MIME[extname(file)] ?? 'application/octet-stream';
        const accept = String(req.headers['accept-encoding'] ?? '');
        const enc = /\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : null;
        const compressible = /text|javascript|json|svg/.test(type);
        const key = `${file}|${enc}`;
        let body = staticCache.get(key);
        if (!body) {
          const raw = await readFile(file);
          body = compressible && enc === 'br' ? brotliCompressSync(raw, { params: { [zc.BROTLI_PARAM_QUALITY]: 9 } }) : compressible && enc === 'gzip' ? gzipSync(raw, { level: 9 }) : raw;
          if (immutable || file.endsWith('index.html')) staticCache.set(key, body);
        }
        res.writeHead(200, { 'content-type': type, 'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache', vary: 'accept-encoding', ...(compressible && enc ? { 'content-encoding': enc } : {}) });
        res.end(body);
      } catch {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Cliente no compilado. Ejecuta "npm run build" o usa "npm run dev" y abre http://localhost:5173');
      }
    } catch (err) {
      console.error('[http] error', err);
      if (!res.headersSent) json(res, 500, { error: 'Error interno' });
    }
  });

  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: MAX_CLIENT_MESSAGE_BYTES, perMessageDeflate: false });
  wss.on('connection', (ws: WebSocket) => {
    let conn: PlayerConn | null = null;
    let helloDone = false;
    let alive = true;
    // Límite de mensajes: cubo de fichas 20/s con ráfaga de 40; abuso sostenido cierra la conexión.
    let tokens = 40, last = Date.now(), strikes = 0;
    const helloTimer = setTimeout(() => { if (!helloDone) ws.close(4000, 'hello_timeout'); }, 5000);
    ws.on('pong', () => (alive = true));
    const hb = setInterval(() => { if (!alive) { ws.terminate(); return; } alive = false; try { ws.ping(); } catch {} }, 15000);
    ws.on('message', async (data, isBinary) => {
      const now = Date.now();
      tokens = Math.min(40, tokens + ((now - last) / 1000) * 20); last = now;
      if (tokens < 1) { metrics.inc('msgsRejected'); if (++strikes > 200) ws.close(4029, 'rate_limit'); return; }
      tokens -= 1;
      if (isBinary) { metrics.inc('msgsRejected'); return; }
      let raw: unknown;
      try { raw = JSON.parse(data.toString()); } catch { metrics.inc('msgsRejected'); return; }
      const parsed = ClientMsg.safeParse(raw);
      if (!parsed.success) { metrics.inc('msgsRejected'); ws.send(JSON.stringify({ t: 'error', reason: 'mensaje_invalido' })); return; }
      const m = parsed.data;
      if (!helloDone) {
        if (m.t !== 'hello') return;
        helloDone = true; clearTimeout(helloTimer);
        if (m.v !== PROTOCOL_VERSION || m.contentVersion !== world.contentHash) { ws.send(JSON.stringify({ t: 'error', reason: 'version' })); ws.close(4002, 'version'); return; }
        const auth = await resolveToken(db, m.token);
        if (!auth) { ws.send(JSON.stringify({ t: 'error', reason: 'auth' })); ws.close(4003, 'auth'); return; }
        if (ws.readyState !== 1) return;
        conn = await world.attach(ws, auth.accountId, auth.username);
        if (conn && ws.readyState !== 1) world.detach(conn);
        return;
      }
      if (conn) world.handle(conn, m);
    });
    ws.on('close', () => { clearTimeout(helloTimer); clearInterval(hb); if (conn) world.detach(conn); });
    ws.on('error', () => {});
  });

  return new Promise<{ close: () => Promise<void>; port: number }>((resolve) => {
    http.listen(cfg.port, cfg.host, () => {
      const addr = http.address();
      const port = typeof addr === 'object' && addr ? addr.port : cfg.port;
      resolve({
        port,
        close: () => new Promise<void>((r) => { for (const c of wss.clients) c.terminate(); wss.close(); http.close(() => r()); }),
      });
    });
  });
}
