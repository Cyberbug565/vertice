// Cliente sintético que habla el MISMO protocolo que el navegador. Lo usan las pruebas de integración y de carga.
import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { PROTOCOL_VERSION, decodePositions, type ClientMsg, type ServerMsg, type EntitySpawn, type DialogView, type CharacterSheet, type JournalEntry } from '@vertice/shared';

type Pred = (m: ServerMsg) => boolean;

export class BotClient {
  ws?: WebSocket;
  seq = 1;
  you = -1;
  zone = '';
  x = 0; y = 0;
  sheet?: CharacterSheet;
  journal: JournalEntry[] = [];
  dialog?: DialogView;
  facts: Record<string, unknown> = {};
  entities = new Map<number, EntitySpawn & { x: number; y: number }>();
  log: ServerMsg[] = [];
  bytesIn = 0;
  binaryIn = 0;
  perSecond: number[] = [];
  private secBytes = 0;
  private secTimer?: NodeJS.Timeout;
  private waiters: { pred: Pred; resolve: (m: ServerMsg) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }[] = [];
  closed = false;
  closeCode = 0;
  keepLog = true;

  constructor(readonly base: string, readonly name = 'bot') {}

  static async api(base: string, path: string, body?: unknown, token?: string): Promise<any> {
    const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const j: any = await r.json();
    if (!r.ok) throw new Error(`${path}: ${r.status} ${j.error}`);
    return j;
  }
  static async registerAndCreate(base: string, username: string, role = 'solo', origin = 'callejero', extra: Partial<Record<string, number>> = {}) {
    let token: string;
    try { token = (await BotClient.api(base, '/api/register', { username, password: 'password1' })).token; }
    catch { token = (await BotClient.api(base, '/api/login', { username, password: 'password1' })).token; }
    const me: any = await BotClient.api(base, '/api/me', undefined, token);
    if (!me.character) {
      const attributes = { INT: 6, REF: 6, DEX: 5, TECH: 6, COOL: 6, WILL: 5, LUCK: 5, MOVE: 5, BODY: 5, EMP: 6, ...extra };
      await BotClient.api(base, '/api/characters', { name: username.slice(0, 20), origin, role, attributes, appearance: { skin: '#c89070', hair: '#1a1a1a', jacket: '#40506a', accent: '#43f3ff' } }, token);
    }
    return token;
  }

  connect(token: string, contentVersion: string): Promise<Extract<ServerMsg, { t: 'welcome' }>> {
    const url = this.base.replace(/^http/, 'ws') + '/ws';
    this.ws = new WebSocket(url, { perMessageDeflate: false });
    this.ws.binaryType = 'nodebuffer';
    this.secTimer = setInterval(() => { this.perSecond.push(this.secBytes); this.secBytes = 0; }, 1000);
    this.ws.on('message', (data: Buffer, isBinary) => {
      this.bytesIn += data.length; this.secBytes += data.length;
      if (isBinary) {
        this.binaryIn += data.length;
        const p = decodePositions(data);
        if (p) for (const e of p.ents) { const ex = this.entities.get(e.id); if (ex) { ex.x = e.x; ex.y = e.y; } if (e.id === this.you) { this.x = e.x; this.y = e.y; } }
        return;
      }
      const m = JSON.parse(data.toString()) as ServerMsg;
      this.onMsg(m);
    });
    this.ws.on('close', (code) => { this.closed = true; this.closeCode = code; clearInterval(this.secTimer); for (const w of this.waiters) { clearTimeout(w.timer); w.reject(new Error(`cerrado ${code}`)); } this.waiters = []; });
    this.ws.on('open', () => this.raw({ t: 'hello', token, v: PROTOCOL_VERSION, contentVersion }));
    return this.waitFor((m) => m.t === 'welcome' || m.t === 'error', 10000).then((m) => { if (m.t !== 'welcome') throw new Error(`hello rechazado: ${(m as any).reason}`); return m; });
  }

  private onMsg(m: ServerMsg) {
    if (this.keepLog) { this.log.push(m); if (this.log.length > 500) this.log.shift(); }
    switch (m.t) {
      case 'welcome': this.you = m.you; this.zone = m.zone; this.x = m.x; this.y = m.y; this.sheet = m.sheet; this.journal = m.journal; this.facts = m.facts; break;
      case 'zone': this.zone = m.zone; this.x = m.x; this.y = m.y; this.entities.clear(); this.dialog = undefined; break;
      case 'spawn': for (const e of m.e) this.entities.set(e.id, { ...e }); break;
      case 'despawn': for (const id of m.ids) this.entities.delete(id); break;
      case 'sheet': this.sheet = m.sheet; break;
      case 'journal': this.journal = m.journal; break;
      case 'dialog': this.dialog = m.view; break;
      case 'dialogClose': this.dialog = undefined; break;
      case 'facts': this.facts = m.facts; break;
    }
    for (const w of [...this.waiters]) if (w.pred(m)) { clearTimeout(w.timer); this.waiters.splice(this.waiters.indexOf(w), 1); w.resolve(m); }
  }

  waitFor<T extends ServerMsg = ServerMsg>(pred: Pred, timeoutMs = 8000, label = 'mensaje'): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.waiters = this.waiters.filter((w) => w.timer !== timer); reject(new Error(`[${this.name}] timeout esperando ${label}`)); }, timeoutMs);
      this.waiters.push({ pred, resolve: resolve as any, reject, timer });
    });
  }

  raw(m: ClientMsg | Record<string, unknown>) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m)); }
  /** Envía un comando con secuencia y espera su ack. */
  async cmd(m: Record<string, unknown>, timeoutMs = 8000): Promise<Extract<ServerMsg, { t: 'ack' }>> {
    const seq = this.seq++;
    const p = this.waitFor<Extract<ServerMsg, { t: 'ack' }>>((x) => x.t === 'ack' && x.seq === seq, timeoutMs, `ack ${m.t}`);
    this.raw({ ...m, seq });
    return p;
  }
  move(x: number, y: number) { return this.cmd({ t: 'move', x, y }); }
  async moveAndArrive(x: number, y: number, timeoutMs = 60000) {
    const a = await this.move(x, y);
    if (!a.ok) throw new Error(`[${this.name}] movimiento rechazado: ${a.reason}`);
    const end = a.path![a.path!.length - 1];
    await this.until(() => Math.hypot(this.x - end[0], this.y - end[1]) < 0.05, timeoutMs, 'llegar');
    return a;
  }
  async until(cond: () => boolean, timeoutMs = 10000, label = 'condición') {
    const t0 = Date.now();
    while (!cond()) { if (Date.now() - t0 > timeoutMs) throw new Error(`[${this.name}] timeout: ${label}`); await new Promise((r) => setTimeout(r, 25)); }
  }
  findEntity(pred: (e: EntitySpawn) => boolean) { return [...this.entities.values()].find(pred); }
  async interactAndDialog(name: string, timeoutMs = 60000): Promise<DialogView> {
    await this.until(() => !!this.findEntity((e) => e.name.includes(name)), 4000, `ver a ${name}`).catch(() => {});
    const ent = this.findEntity((e) => e.name.includes(name));
    if (!ent) throw new Error(`[${this.name}] no veo a ${name} en ${this.zone}`);
    this.dialog = undefined;
    const a = await this.cmd({ t: 'interact', target: ent.id });
    if (!a.ok) throw new Error(`[${this.name}] interacción rechazada: ${a.reason}`);
    await this.until(() => !!this.dialog, timeoutMs, `diálogo con ${name}`);
    return this.dialog!;
  }
  async enterDoor(name: string, timeoutMs = 60000) {
    await this.until(() => !!this.findEntity((e) => e.kind === 'door' && e.name.includes(name)), 4000, `ver la puerta ${name}`).catch(() => {});
    const ent = this.findEntity((e) => e.kind === 'door' && e.name.includes(name));
    if (!ent) throw new Error(`[${this.name}] no veo la puerta ${name}`);
    const from = this.zone;
    const p = this.waitFor((m) => m.t === 'zone', timeoutMs, `zona tras ${name}`);
    const a = await this.cmd({ t: 'interact', target: ent.id });
    if (!a.ok) throw new Error(`[${this.name}] puerta rechazada: ${a.reason}`);
    await p;
    await this.until(() => this.entities.size > 0, 3000, 'entidades de la nueva zona');
    if (this.zone === from) throw new Error('no cambió de zona');
  }
  async choose(option: string, luck = 0, opId = randomUUID().replace(/-/g, '')) {
    if (!this.dialog) throw new Error(`[${this.name}] no hay diálogo abierto`);
    const opt = this.dialog.options.find((o) => o.id === option);
    if (!opt) throw new Error(`[${this.name}] opción ${option} no disponible (hay: ${this.dialog.options.map((o) => o.id).join(', ')})`);
    return this.cmd({ t: 'choose', dialog: this.dialog.dialog, option, luck, opId });
  }
  close() { clearInterval(this.secTimer); this.ws?.close(); }
}
