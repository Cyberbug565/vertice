// v0.9 · Efectos de sonido sintetizados al vuelo (Web Audio): sin muestras grabadas ni música con derechos.
// Disparos según el arma, golpes, cuchilladas, patadas, impactos en carne y en cromo, quejidos y gritos, coches, sirenas,
// la Onda Carmín, esquivas y hackeos. Cada sonido se coloca en el espacio: más bajo y a un lado según dónde ocurre.
import { audioCtx, sfxBus } from './audio';

let noiseBuf: AudioBuffer | null = null;
let verb: ConvolverNode | null = null;
let verbFor: AudioContext | null = null;
function noise(ctx: AudioContext) {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const len = ctx.sampleRate * 1.5;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
/** Reverberación de calle (impulso generado): da el eco de los callejones a disparos y gritos. */
function reverb(ctx: AudioContext, out: AudioNode) {
  if (verb && verbFor === ctx) return verb;
  verb = ctx.createConvolver(); verbFor = ctx;
  const len = Math.floor(ctx.sampleRate * 1.6);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
  verb.buffer = ir;
  const g = ctx.createGain(); g.gain.value = 0.32;
  verb.connect(g).connect(out);
  return verb;
}

let lastAt: Record<string, number> = {};
/** Evita que 30 balas a la vez saturen: cada tipo de sonido tiene un mínimo entre reproducciones. */
function throttle(key: string, ms: number) { const now = performance.now(); if (now - (lastAt[key] ?? 0) < ms) return false; lastAt[key] = now; return true; }

/** Salida espacial: volumen por distancia (en metros) y panorámica por la posición horizontal en pantalla. */
function spatial(dist = 0, pan = 0, wet = 0.25) {
  const ctx = audioCtx(), bus = sfxBus();
  if (!ctx || !bus || ctx.state !== 'running') return null;
  const vol = Math.max(0, 1 / (1 + dist / 7)) * (dist > 45 ? 0 : 1);
  if (vol < 0.02) return null;
  const g = ctx.createGain(); g.gain.value = vol;
  const p = ctx.createStereoPanner(); p.pan.value = Math.max(-0.9, Math.min(0.9, pan));
  g.connect(p).connect(bus);
  const send = ctx.createGain(); send.gain.value = wet + Math.min(0.4, dist / 60);
  g.connect(send).connect(reverb(ctx, bus));
  return { ctx, out: g, t: ctx.currentTime };
}
function env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}
function burst(ctx: AudioContext, out: AudioNode, t: number, dur: number, type: BiquadFilterType, freq: number, q: number, peak: number, sweepTo?: number) {
  const s = ctx.createBufferSource(); s.buffer = noise(ctx); s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = ctx.createGain(); env(g, t, peak, 0.003, dur);
  s.connect(f).connect(g).connect(out); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
function tone(ctx: AudioContext, out: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, dur: number, peak: number, attack = 0.005) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain(); env(g, t, peak, attack, dur);
  o.connect(g).connect(out); o.start(t); o.stop(t + attack + dur + 0.05);
}

export type GunKind = 'pistola' | 'revolver' | 'escopeta' | 'rifle' | 'subfusil' | 'ametralladora' | 'plasma' | 'taser' | 'arco' | 'francotirador';
export function gunKind(family: string, id = ''): GunKind {
  if (/plasma|termica|riel|pulsos|sonico/.test(id)) return 'plasma';
  if (/Táser/.test(family) || /taser/.test(id)) return 'taser';
  if (/Arco/.test(family)) return 'arco';
  if (/Escopeta/.test(family)) return 'escopeta';
  if (/Subfusil/.test(family)) return 'subfusil';
  if (/Ametralladora/.test(family)) return 'ametralladora';
  if (/Rifle|Especial/.test(family)) return /franco|precision/.test(id) ? 'francotirador' : 'rifle';
  if (/revolver|magnum/.test(id)) return 'revolver';
  return 'pistola';
}
/** Disparo: chasquido + cuerpo grave + cola de ruido, distinto para cada tipo de arma. */
export function gunshot(kind: GunKind, dist = 0, pan = 0, rounds = 1) {
  for (let r = 0; r < Math.min(3, rounds); r++) {
    const o = spatial(dist, pan, 0.35); if (!o) return;
    const { ctx, out } = o; const t = o.t + r * 0.075;
    switch (kind) {
      case 'escopeta': burst(ctx, out, t, 0.35, 'lowpass', 2600, 0.7, 1.1, 300); tone(ctx, out, t, 'sine', 120, 40, 0.25, 0.9); break;
      case 'rifle': case 'francotirador': burst(ctx, out, t, 0.22, 'bandpass', 2200, 0.8, 0.9, 500); burst(ctx, out, t, 0.04, 'highpass', 5000, 0.5, 0.7); tone(ctx, out, t, 'sine', 160, 45, 0.18, kind === 'francotirador' ? 1 : 0.7); break;
      case 'subfusil': case 'ametralladora': burst(ctx, out, t, 0.09, 'bandpass', 2600, 1, 0.7, 900); tone(ctx, out, t, 'sine', 180, 60, 0.07, 0.4); break;
      case 'revolver': burst(ctx, out, t, 0.2, 'bandpass', 1600, 0.9, 1, 350); tone(ctx, out, t, 'sine', 140, 40, 0.2, 0.8); break;
      case 'plasma': tone(ctx, out, t, 'sawtooth', 1800, 120, 0.22, 0.35); tone(ctx, out, t, 'square', 900, 60, 0.18, 0.2); burst(ctx, out, t, 0.12, 'highpass', 3000, 0.7, 0.3); break;
      case 'taser': tone(ctx, out, t, 'square', 2400, 2200, 0.25, 0.18); burst(ctx, out, t, 0.25, 'bandpass', 4000, 6, 0.3); break;
      case 'arco': burst(ctx, out, t, 0.18, 'bandpass', 900, 2, 0.35, 2400); break;
      default: burst(ctx, out, t, 0.14, 'bandpass', 2000, 0.9, 0.85, 450); tone(ctx, out, t, 'sine', 170, 55, 0.12, 0.55);
    }
  }
}
/** Impacto en el cuerpo: golpe sordo y salpicadura húmeda, o chasquido metálico si es cromo. */
export function impact(kindOf: 'carne' | 'cromo' | 'puño' | 'filo' | 'bala', dist = 0, pan = 0, heavy = false) {
  if (!throttle(`imp-${kindOf}`, 40)) return;
  const o = spatial(dist, pan, 0.15); if (!o) return;
  const { ctx, out, t } = o;
  const k = heavy ? 1.5 : 1;
  if (kindOf === 'cromo') { tone(ctx, out, t, 'square', 1400, 900, 0.18, 0.18); tone(ctx, out, t, 'triangle', 2600, 2400, 0.3, 0.12); burst(ctx, out, t, 0.06, 'highpass', 6000, 0.5, 0.25); return; }
  if (kindOf === 'puño') { tone(ctx, out, t, 'sine', 160 * k, 50, 0.12, 0.8 * k); burst(ctx, out, t, 0.07, 'lowpass', 900, 0.7, 0.6); return; }
  if (kindOf === 'filo') { burst(ctx, out, t - 0.05, 0.12, 'bandpass', 3800, 1.5, 0.4, 1500); burst(ctx, out, t + 0.05, 0.12, 'lowpass', 1200, 0.7, 0.45); return; }
  // carne / bala: golpe sordo + chapoteo
  tone(ctx, out, t, 'sine', 110, 45, 0.1, 0.5 * k); burst(ctx, out, t, 0.16, 'lowpass', 700, 1.2, 0.55 * k, 200);
}
export function swing(dist = 0, pan = 0, heavy = false) {
  if (!throttle('swing', 60)) return;
  const o = spatial(dist, pan, 0.05); if (!o) return;
  burst(o.ctx, o.out, o.t, heavy ? 0.3 : 0.18, 'bandpass', heavy ? 500 : 900, 1.2, heavy ? 0.45 : 0.3, heavy ? 1800 : 2600);
}
export function kick(dist = 0, pan = 0) { const o = spatial(dist, pan, 0.1); if (!o) return; tone(o.ctx, o.out, o.t, 'sine', 120, 38, 0.18, 1); burst(o.ctx, o.out, o.t, 0.1, 'lowpass', 500, 1, 0.6); }
export function whoosh(dist = 0, pan = 0) { const o = spatial(dist, pan, 0.05); if (!o) return; burst(o.ctx, o.out, o.t, 0.32, 'bandpass', 400, 0.8, 0.45, 2400); }
/** Voz sintética: quejido corto (dolor) o grito largo (herida grave o muerte). Formantes de vocal sobre un diente de sierra. */
export function voice(kind: 'quejido' | 'grito' | 'muerte', high: boolean, dist = 0, pan = 0) {
  if (!throttle(`voz-${kind}`, kind === 'quejido' ? 220 : 500)) return;
  const o = spatial(dist, pan, 0.3); if (!o) return;
  const { ctx, out, t } = o;
  const base = (high ? 230 : 130) * (0.9 + Math.random() * 0.25);
  const dur = kind === 'quejido' ? 0.28 : kind === 'grito' ? 0.75 : 1.4;
  const src = ctx.createOscillator(); src.type = 'sawtooth';
  src.frequency.setValueAtTime(base * (kind === 'quejido' ? 1.15 : 1.5), t);
  src.frequency.linearRampToValueAtTime(base * (kind === 'quejido' ? 0.85 : 1.9), t + dur * 0.3);
  src.frequency.exponentialRampToValueAtTime(base * (kind === 'muerte' ? 0.5 : 0.8), t + dur);
  const vib = ctx.createOscillator(); vib.frequency.value = 6 + Math.random() * 3; const vg = ctx.createGain(); vg.gain.value = base * 0.03; vib.connect(vg).connect(src.frequency);
  const g = ctx.createGain(); env(g, t, kind === 'quejido' ? 0.18 : 0.26, 0.03, dur);
  const mix = ctx.createGain(); mix.gain.value = 1;
  // Formantes de «a»/«o» (abiertas): dos filtros en paralelo.
  for (const [f, q, a] of [[high ? 900 : 700, 6, 1], [high ? 1400 : 1150, 8, 0.6], [2600, 10, 0.25]] as [number, number, number][]) {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
    const bg = ctx.createGain(); bg.gain.value = a; src.connect(bp).connect(bg).connect(mix);
  }
  mix.connect(g).connect(out);
  burst(ctx, g, t, dur * 0.8, 'bandpass', 1600, 0.8, 0.06); // aire
  src.start(t); vib.start(t); src.stop(t + dur + 0.1); vib.stop(t + dur + 0.1);
}
/** Explosión de la Onda Carmín: estruendo grave, chasquido eléctrico y arpegio digital (roja o amarilla). */
export function wave(ko: boolean, dist = 0, pan = 0) {
  const o = spatial(dist, pan, 0.5); if (!o) return;
  const { ctx, out, t } = o;
  tone(ctx, out, t, 'sine', 90, 25, 1.2, 1.1); burst(ctx, out, t, 0.9, 'lowpass', 1400, 0.7, 0.9, 120);
  for (let i = 0; i < 8; i++) tone(ctx, out, t + 0.05 + i * 0.045, 'square', (ko ? 880 : 660) * 2 ** ((i % 4) / 3), 200, 0.12, 0.08);
  burst(ctx, out, t, 0.4, 'highpass', 5000, 0.6, 0.25);
}
export function hackChirp(dist = 0, pan = 0) {
  if (!throttle('hack', 120)) return;
  const o = spatial(dist, pan, 0.1); if (!o) return;
  for (let i = 0; i < 5; i++) tone(o.ctx, o.out, o.t + i * 0.05, 'square', 1200 + Math.random() * 1600, 900, 0.04, 0.06);
}
/** Coche que pasa: motor grave con efecto Doppler y ruido de neumáticos. */
export function carPass(dist = 6, pan = 0, fast = false) {
  const o = spatial(dist, pan, 0.2); if (!o) return;
  const { ctx, out, t } = o;
  const dur = fast ? 1.4 : 2.4;
  const eng = ctx.createOscillator(); eng.type = 'sawtooth';
  eng.frequency.setValueAtTime(fast ? 95 : 70, t); eng.frequency.linearRampToValueAtTime(fast ? 120 : 82, t + dur * 0.45); eng.frequency.linearRampToValueAtTime(fast ? 70 : 55, t + dur);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + dur * 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const p = ctx.createStereoPanner(); p.pan.setValueAtTime(-0.8 * Math.sign(pan || 1), t); p.pan.linearRampToValueAtTime(0.8 * Math.sign(pan || 1), t + dur);
  eng.connect(lp).connect(g).connect(p).connect(out); eng.start(t); eng.stop(t + dur + 0.05);
  burst(ctx, g, t, dur, 'bandpass', 600, 0.5, 0.25);
}
export function horn(dist = 8, pan = 0) {
  const o = spatial(dist, pan, 0.3); if (!o) return;
  for (const f of [392, 494]) tone(o.ctx, o.out, o.t, 'square', f, f * 0.99, 0.45, 0.06, 0.02);
}
export function siren(dist = 20, pan = 0) {
  if (!throttle('siren', 4000)) return;
  const o = spatial(dist, pan, 0.4); if (!o) return;
  const { ctx, out, t } = o;
  const s = ctx.createOscillator(); s.type = 'sawtooth';
  for (let i = 0; i < 4; i++) { s.frequency.setValueAtTime(700, t + i * 0.9); s.frequency.linearRampToValueAtTime(1300, t + i * 0.9 + 0.45); s.frequency.linearRampToValueAtTime(700, t + i * 0.9 + 0.9); }
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.3); g.gain.setValueAtTime(0.08, t + 3.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
  s.connect(lp).connect(g).connect(out); s.start(t); s.stop(t + 3.7);
}
export function step(dist = 0, pan = 0) { if (!throttle('step', 140)) return; const o = spatial(dist, pan, 0); if (!o) return; burst(o.ctx, o.out, o.t, 0.05, 'lowpass', 500, 1, 0.12); }
