// Audio original y procedural: ambiente de lluvia y zumbido urbano, y señales de interfaz. Volúmenes separados.
import { settings, onSettings } from './settings';

let ctx: AudioContext | null = null;
const gains: Record<'music' | 'ambient' | 'sfx' | 'ui', GainNode | null> = { music: null, ambient: null, sfx: null, ui: null };

export function initAudio() {
  if (ctx) { void ctx.resume(); return; }
  try { ctx = new AudioContext(); } catch { return; }
  for (const k of Object.keys(gains) as (keyof typeof gains)[]) { const g = ctx.createGain(); g.connect(ctx.destination); gains[k] = g; }
  applyVolumes();
  // Ambiente: ruido filtrado (lluvia) + zumbido grave (ciudad).
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3 + w * 0.08; }
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
  const ag = ctx.createGain(); ag.gain.value = 0.35;
  src.connect(lp).connect(ag).connect(gains.ambient!); src.start();
  const hum = ctx.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 55;
  const hl = ctx.createBiquadFilter(); hl.type = 'lowpass'; hl.frequency.value = 120;
  const hg = ctx.createGain(); hg.gain.value = 0.05;
  hum.connect(hl).connect(hg).connect(gains.ambient!); hum.start();
}

function applyVolumes() {
  if (!ctx) return;
  for (const k of Object.keys(gains) as (keyof typeof gains)[]) gains[k]?.gain.setTargetAtTime(settings[k], ctx.currentTime, 0.05);
}
onSettings(applyVolumes);

export function blip(kind: 'ui' | 'good' | 'bad' | 'step' = 'ui') {
  if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  const f = kind === 'good' ? 880 : kind === 'bad' ? 180 : kind === 'step' ? 320 : 600;
  o.type = kind === 'bad' ? 'square' : 'triangle';
  o.frequency.setValueAtTime(f, ctx.currentTime);
  if (kind === 'good') o.frequency.exponentialRampToValueAtTime(f * 1.5, ctx.currentTime + 0.12);
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
  o.connect(g).connect(kind === 'ui' ? gains.ui! : gains.sfx!);
  o.start(); o.stop(ctx.currentTime + 0.2);
}
export function setAmbientActive(active: boolean) { if (ctx) void (active ? ctx.resume() : ctx.suspend()); }
