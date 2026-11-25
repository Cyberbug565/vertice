// v0.45 · Lo que hace que conducir se sienta: el motor (sintetizado, sube y baja de vueltas con cada marcha), el chirrido
// de los neumáticos al derrapar o patinar, el golpe al chocar y un velocímetro con marcha y cuentarrevoluciones.
// Todo sale de la física que predice el cliente (shared/src/driving.ts).
import { carProfile, type CarMotion, type CarTuning } from '@vertice/shared';
import { audioCtx, sfxBus } from '../audio';
import { h } from './dom';

/** Velocidad del juego (losetas/s) → km/h del velocímetro. La ciudad va a escala reducida, como en todos los sandbox. */
export const KMH = 5.2;
const PITCH: Record<string, number> = { moto: 72, economico: 46, utilitario: 37, deportivo: 56, todoterreno: 40, rally: 52, lujo: 33, blindado: 29, hiper: 62 };

class EngineSound {
  private o1: OscillatorNode; private o2: OscillatorNode; private filt: BiquadFilterNode; private g: GainNode;
  private noise: AudioBufferSourceNode; private band: BiquadFilterNode; private ng: GainNode;
  constructor(private ctx: AudioContext, out: AudioNode) {
    this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = ctx.createOscillator(); this.o2.type = 'square';
    this.filt = ctx.createBiquadFilter(); this.filt.type = 'lowpass'; this.filt.Q.value = 2.5;
    this.g = ctx.createGain(); this.g.gain.value = 0;
    const g2 = ctx.createGain(); g2.gain.value = 0.45;
    this.o1.connect(this.filt); this.o2.connect(g2).connect(this.filt); this.filt.connect(this.g).connect(out);
    // Neumáticos: ruido filtrado en banda (el chirrido).
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = ctx.createBufferSource(); this.noise.buffer = buf; this.noise.loop = true;
    this.band = ctx.createBiquadFilter(); this.band.type = 'bandpass'; this.band.frequency.value = 1900; this.band.Q.value = 7;
    this.ng = ctx.createGain(); this.ng.gain.value = 0;
    this.noise.connect(this.band).connect(this.ng).connect(out);
    this.o1.start(); this.o2.start(); this.noise.start();
  }
  set(on: boolean, m: CarMotion, t: CarTuning | null, throttle: number) {
    const now = this.ctx.currentTime, k = 0.06;
    if (!on || !t) { this.g.gain.setTargetAtTime(0, now, 0.15); this.ng.gain.setTargetAtTime(0, now, 0.08); return; }
    const pr = carProfile(t), base = (t.hover ? 0 : PITCH[pr.name === 'Rally' ? 'rally' : t.class ?? 'economico'] ?? 45);
    const rpm = m.rpm ?? 0.2, shifting = (m.shift ?? 0) > 0;
    if (t.hover) { // levitación: un silbido que sube con la velocidad
      this.o1.type = 'sine'; this.o2.type = 'sine';
      this.o1.frequency.setTargetAtTime(180 + m.speed * 22, now, k); this.o2.frequency.setTargetAtTime(90 + m.speed * 11, now, k);
      this.filt.frequency.setTargetAtTime(1600, now, k);
      this.g.gain.setTargetAtTime(0.025 + 0.03 * Math.abs(throttle), now, 0.1);
    } else {
      this.o1.type = 'sawtooth'; this.o2.type = 'square';
      const f = base * (0.55 + rpm * 1.7);
      this.o1.frequency.setTargetAtTime(f, now, shifting ? 0.03 : k); this.o2.frequency.setTargetAtTime(f / 2, now, k);
      this.filt.frequency.setTargetAtTime(350 + Math.max(0, throttle) * 1700 + rpm * 900, now, k);
      this.g.gain.setTargetAtTime(shifting ? 0.012 : 0.022 + Math.max(0, throttle) * 0.045 + rpm * 0.02, now, shifting ? 0.02 : 0.08);
    }
    const slip = Math.abs(m.slip ?? 0), spin = m.spin ?? 0;
    const screech = t.hover ? 0 : Math.min(0.13, Math.max(0, slip - 0.2) * 0.32 + spin * 0.12 + (m.handbrake && m.speed > 2 ? 0.05 : 0) + (m.braking && (m.lonA ?? 0) < -7 && m.speed > 3 ? 0.04 : 0));
    this.band.frequency.setTargetAtTime(1500 + Math.min(900, m.speed * 45), now, 0.1);
    this.ng.gain.setTargetAtTime(screech, now, 0.06);
  }
  impact(strength: number) {
    const ctx = this.ctx, now = ctx.currentTime, out = this.g.context.destination;
    void out;
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle';
    o.frequency.setValueAtTime(90, now); o.frequency.exponentialRampToValueAtTime(35, now + 0.25);
    g.gain.setValueAtTime(Math.min(0.35, 0.06 + strength * 0.025), now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    o.connect(g).connect(sfxBus() ?? ctx.destination); o.start(now); o.stop(now + 0.4);
    const n = ctx.createBufferSource(); n.buffer = (this.noise.buffer as AudioBuffer);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(Math.min(0.25, 0.04 + strength * 0.02), now); ng.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    n.connect(f).connect(ng).connect(sfxBus() ?? ctx.destination); n.start(now); n.stop(now + 0.25);
  }
}

export function createCarFeel(src: { driving: () => boolean; motion: () => CarMotion; tuning: () => CarTuning | null; throttle: () => number; name: () => string }) {
  let engine: EngineSound | null = null;
  const num = h('b', { class: 'speedo-num mono' }, '0');
  const gear = h('span', { class: 'speedo-gear mono' }, 'N');
  const arc = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  arc.setAttribute('viewBox', '0 0 120 70');
  arc.innerHTML = '<path d="M10 64 A52 52 0 0 1 110 64" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="6" stroke-linecap="round"/><path class="rpm" d="M10 64 A52 52 0 0 1 110 64" fill="none" stroke="#43f3ff" stroke-width="6" stroke-linecap="round" pathLength="100" stroke-dasharray="0 100"/>';
  const rpmPath = arc.querySelector('.rpm') as SVGPathElement;
  const name = h('div', { class: 'speedo-name' });
  const el = h('div', { class: 'speedo', style: { display: 'none' }, 'aria-label': 'Velocímetro' }, arc, h('div', { class: 'speedo-read' }, num, h('small', {}, 'km/h'), gear), name);
  let raf = 0, lastName = '';
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const on = src.driving();
    el.style.display = on ? '' : 'none';
    document.body.classList.toggle('driving', on);
    const m = src.motion(), t = src.tuning();
    if (on) {
      num.textContent = String(Math.round(m.speed * KMH));
      gear.textContent = (m.fwd ?? 0) < -0.3 ? 'R' : m.speed < 0.2 ? 'N' : `${m.gear ?? 1}`;
      const rpm = Math.min(1, m.rpm ?? 0.2);
      rpmPath.setAttribute('stroke-dasharray', `${rpm * 100} 100`);
      rpmPath.setAttribute('stroke', rpm > 0.9 ? '#ff3b5c' : rpm > 0.75 ? '#ffd23f' : '#43f3ff');
      const nm = src.name(); if (nm !== lastName) { lastName = nm; name.textContent = nm; }
    }
    const ctx = audioCtx();
    if (ctx && !engine && on) engine = new EngineSound(ctx, sfxBus() ?? ctx.destination);
    engine?.set(on, m, t, src.throttle());
  };
  raf = requestAnimationFrame(loop);
  return { el, impact: (k: number) => engine?.impact(k), stop: () => { cancelAnimationFrame(raf); engine?.set(false, { speed: 0, heading: 0 }, null, 0); } };
}
