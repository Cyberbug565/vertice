// Conexión WebSocket: saludo, reconexión con espera creciente, ping/RTT y despacho de mensajes.
import { PROTOCOL_VERSION, decodePositions, type ClientMsg, type ServerMsg } from '@vertice/shared';
import { contentHash } from './content';

export type NetStatus = 'connecting' | 'online' | 'reconnecting' | 'offline';
type Positions = NonNullable<ReturnType<typeof decodePositions>>;

export class Net {
  private ws?: WebSocket;
  private seq = 1;
  private pingTimer?: number;
  private retry = 0;
  private stopped = false;
  status: NetStatus = 'connecting';
  rtt = 0;
  clockOffset = 0; // servidor - cliente (ms)
  bytesIn = 0;
  onMsg: (m: ServerMsg) => void = () => {};
  onPositions: (p: Positions) => void = () => {};
  onStatus: (s: NetStatus, detail?: string) => void = () => {};

  constructor(private token: string) {}

  connect() {
    this.stopped = false;
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    this.setStatus(this.retry ? 'reconnecting' : 'connecting');
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', token: this.token, v: PROTOCOL_VERSION, contentVersion: contentHash }));
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') {
        this.bytesIn += (ev.data as ArrayBuffer).byteLength;
        const p = decodePositions(ev.data as ArrayBuffer);
        if (p) this.onPositions(p);
        return;
      }
      this.bytesIn += ev.data.length;
      const m = JSON.parse(ev.data) as ServerMsg;
      if (m.t === 'welcome') { this.retry = 0; this.setStatus('online'); this.startPing(); }
      if (m.t === 'pong') { const now = performance.now(); this.rtt = now - m.ct; this.clockOffset = m.st - (Date.now() - this.rtt / 2); }
      if (m.t === 'kicked') { this.stopped = true; this.setStatus('offline', m.reason); }
      if (m.t === 'error') {
        if (m.reason === 'version') { this.stopped = true; this.setStatus('offline', 'Hay una versión nueva del juego. Recarga la página.'); }
        if (m.reason === 'auth') { this.stopped = true; this.setStatus('offline', 'auth'); }
        if (m.reason === 'no_character') { this.stopped = true; this.setStatus('offline', 'no_character'); }
      }
      this.onMsg(m);
    };
    ws.onclose = () => {
      clearInterval(this.pingTimer);
      if (this.stopped) return;
      this.retry++;
      const delay = Math.min(8000, 400 * 2 ** Math.min(this.retry, 5));
      this.setStatus('reconnecting', `Reconectando en ${Math.round(delay / 1000)} s…`);
      setTimeout(() => !this.stopped && this.connect(), delay);
    };
  }
  private setStatus(s: NetStatus, detail?: string) { this.status = s; this.onStatus(s, detail); }
  private startPing() {
    clearInterval(this.pingTimer);
    const ping = () => this.send({ t: 'ping', ct: performance.now() } as any);
    ping();
    this.pingTimer = window.setInterval(ping, 2000);
  }
  /** Envía una intención con número de secuencia. Devuelve la secuencia para correlacionar el ack. */
  send(m: Omit<ClientMsg, 'seq'> & { seq?: number }): number {
    const seq = this.seq++;
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ ...m, seq }));
    return seq;
  }
  close() { this.stopped = true; clearInterval(this.pingTimer); this.ws?.close(); }
}

export const newOpId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/-/g, '');
