// Instrumentación: tick, red, rutas, cruces, escrituras y conexiones.
export class Ring {
  private buf: Float64Array; private n = 0; private i = 0;
  constructor(size: number) { this.buf = new Float64Array(size); }
  push(v: number) { this.buf[this.i] = v; this.i = (this.i + 1) % this.buf.length; if (this.n < this.buf.length) this.n++; }
  reset() { this.n = 0; this.i = 0; }
  stats() {
    if (!this.n) return { n: 0, avg: 0, p50: 0, p95: 0, p99: 0, max: 0 };
    const a = Array.from(this.buf.subarray(0, this.n)).sort((x, y) => x - y);
    const q = (p: number) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
    return { n: this.n, avg: a.reduce((s, v) => s + v, 0) / a.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: a[a.length - 1] };
  }
}

export class Metrics {
  readonly startedAt = Date.now();
  tick = new Ring(20 * 60 * 10); // 10 min de ticks
  dbWrite = new Ring(5000);
  moveAckMs = new Ring(5000);
  counters: Record<string, number> = {
    msgsIn: 0, msgsRejected: 0, bytesOut: 0, bytesOutPositions: 0, bytesOutJson: 0, snapshotsSkipped: 0, sectorCrossings: 0, zoneTransfers: 0,
    npcTransfers: 0, pathRequests: 0, pathFailures: 0, pathExpanded: 0, pathCacheHits: 0, kicks: 0, slowClientDrops: 0, reconnects: 0, lateTicks: 0,
  };
  inc(k: string, v = 1) { this.counters[k] = (this.counters[k] ?? 0) + v; }
  resetWindows() { this.tick.reset(); this.dbWrite.reset(); this.moveAckMs.reset(); for (const k of Object.keys(this.counters)) this.counters[k] = 0; }
}
