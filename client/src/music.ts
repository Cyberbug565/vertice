// Secuencias originales de Vértice. Todos los sonidos se sintetizan al vuelo.
export type MusicScene = 'fiesta' | 'accion' | 'chill' | 'calle' | 'yermo' | 'noche';

interface Score {
  bpm: number; root: number; progression: number[]; bass: number[];
  melody: number[]; kick: number[]; snare: number[]; hats: number[]; wave: OscillatorType; ambient: number;
  /** v0.9 · Arpegio de sintetizador con filtro que respira (estilo synthwave oscuro) y eco. */
  arp?: number[]; arpWave?: OscillatorType;
}

const REST = -24;
export const SCORES: Record<MusicScene, Score> = {
  fiesta: {
    bpm: 124, root: 45, progression: [0, -5, -2, -7], bass: [0, REST, 12, 0, REST, 7, 0, 12],
    melody: [12, REST, 15, 19, REST, 17, 15, REST, 12, 19, REST, 22, 19, REST, 15, 17],
    kick: [0, 4, 8, 12], snare: [4, 12], hats: [2, 6, 10, 14, 15], wave: 'triangle', ambient: 0.16,
  },
  accion: {
    bpm: 152, root: 40, progression: [0, 1, -2, 3], bass: [0, 0, REST, 0, 7, 0, 3, REST],
    melody: [12, REST, REST, 13, 19, REST, REST, 18, 12, REST, 15, 13, REST, 20, REST, 19],
    kick: [0, 3, 7, 8, 11, 14], snare: [4, 12], hats: [0, 2, 4, 6, 8, 10, 12, 13, 14, 15], wave: 'square', ambient: 0.38,
    arp: [0, 12, 3, 15, 7, 19, 3, 15], arpWave: 'square',
  },
  chill: {
    bpm: 82, root: 50, progression: [0, -3, 2, -5], bass: [0, REST, REST, 7, REST, REST, 12, REST],
    melody: [19, REST, REST, REST, 22, REST, 24, REST, 26, REST, REST, 22, REST, 17, REST, REST],
    kick: [0, 10], snare: [4, 12], hats: [2, 6, 10, 14], wave: 'sine', ambient: 0.2,
  },
  calle: {
    bpm: 102, root: 45, progression: [0, 3, -2, -4], bass: [0, REST, REST, 0, 12, REST, 7, REST],
    melody: [15, REST, REST, 12, REST, REST, 19, REST, REST, 20, REST, REST, 15, REST, 19, REST],
    kick: [0, 7, 10], snare: [4, 12], hats: [2, 6, 11, 14], wave: 'triangle', ambient: 1,
    arp: [0, 7, 12, 15, 12, 7, 3, 7], arpWave: 'sawtooth',
  },
  // v0.9 · Noche en la calle: synthwave oscuro, bajo de sierra y arpegio filtrado.
  noche: {
    bpm: 96, root: 40, progression: [0, -4, -2, -5], bass: [0, 0, REST, 0, 0, REST, 0, 12],
    melody: [REST, REST, 19, REST, REST, REST, 22, REST, 24, REST, REST, REST, 22, REST, 19, REST],
    kick: [0, 4, 8, 12], snare: [4, 12], hats: [2, 6, 10, 14], wave: 'sawtooth', ambient: 0.9,
    arp: [12, 15, 19, 24, 19, 15, 12, 7], arpWave: 'sawtooth',
  },
  yermo: {
    bpm: 68, root: 42, progression: [0, -1, -5, 2], bass: [0, REST, REST, REST, REST, 7, REST, REST],
    melody: [12, REST, REST, REST, REST, 19, REST, REST, 13, REST, REST, REST, 17, REST, REST, REST],
    kick: [0, 11], snare: [12], hats: [7, 15], wave: 'sine', ambient: 0.72,
  },
};

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export function beginMusic(ctx: AudioContext, out: GainNode, score: Score) {
  const bus = ctx.createGain();
  bus.gain.value = 0;
  bus.connect(out);
  bus.gain.setTargetAtTime(0.85, ctx.currentTime, 0.17);
  const length = Math.ceil(ctx.sampleRate * 0.18);
  const noise = ctx.createBuffer(1, length, ctx.sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;
  const stepSize = 60 / score.bpm / 4;
  // v0.9 · Eco con realimentación (delay a puntillo) y filtro del arpegio que se abre y se cierra lentamente.
  const delay = ctx.createDelay(1); delay.delayTime.value = stepSize * 3;
  const fb = ctx.createGain(); fb.gain.value = 0.32;
  const wet = ctx.createGain(); wet.gain.value = 0.28;
  delay.connect(fb).connect(delay); delay.connect(wet).connect(bus);
  const arpFilter = ctx.createBiquadFilter(); arpFilter.type = 'lowpass'; arpFilter.frequency.value = 900; arpFilter.Q.value = 7;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lfoG = ctx.createGain(); lfoG.gain.value = 700;
  lfo.connect(lfoG).connect(arpFilter.frequency); lfo.start();
  arpFilter.connect(bus); arpFilter.connect(delay);
  let step = 0;
  let next = ctx.currentTime + 0.08;

  const voice = (at: number, midi: number, duration: number, volume: number, wave: OscillatorType, attack = 0.018) => {
    const osc = ctx.createOscillator(), amp = ctx.createGain();
    osc.type = wave;
    osc.frequency.value = hz(midi);
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(volume, at + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(amp).connect(bus);
    osc.start(at);
    osc.stop(at + duration + 0.01);
  };
  const kick = (at: number) => {
    const osc = ctx.createOscillator(), env = ctx.createGain();
    osc.frequency.setValueAtTime(115, at);
    osc.frequency.exponentialRampToValueAtTime(40, at + 0.14);
    env.gain.setValueAtTime(score.bpm < 90 ? 0.09 : 0.18, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
    osc.connect(env).connect(bus);
    osc.start(at);
    osc.stop(at + 0.19);
  };
  const drums = (at: number, bright: boolean) => {
    const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), env = ctx.createGain();
    const length = bright ? 0.055 : 0.145;
    src.buffer = noise;
    filter.type = bright ? 'highpass' : 'bandpass';
    filter.frequency.value = bright ? 7000 : 1900;
    env.gain.setValueAtTime(bright ? 0.034 : 0.075, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + length);
    src.connect(filter).connect(env).connect(bus);
    src.start(at);
    src.stop(at + length);
  };

  const schedule = () => {
    if (ctx.state !== 'running') return;
    if (next < ctx.currentTime) next = ctx.currentTime + 0.025;
    while (next < ctx.currentTime + 0.16) {
      const s = step % 16;
      const root = score.root + score.progression[Math.floor(step / 16) % score.progression.length];
      const bass = score.bass[s % score.bass.length], lead = score.melody[s];
      if (s === 0) for (const tone of [12, 15, 19, 22]) voice(next, root + tone, 0.94, 0.018, 'sine', 0.2);
      if (bass !== REST) voice(next, root + bass - 12, stepSize * 1.7, 0.11, 'triangle');
      if (lead !== REST) {
        voice(next, root + lead, stepSize * 2.8, score.wave === 'square' ? 0.025 : 0.06, score.wave);
        if (score.bpm <= 102) voice(next + stepSize * 2, root + lead, stepSize * 3.5, 0.018, 'sine');
      }
      if (score.arp) {
        const n = score.arp[s % score.arp.length];
        const o = ctx.createOscillator(), a = ctx.createGain();
        o.type = score.arpWave ?? 'sawtooth'; o.frequency.value = hz(root + n);
        a.gain.setValueAtTime(0.0001, next); a.gain.exponentialRampToValueAtTime(0.035, next + 0.008); a.gain.exponentialRampToValueAtTime(0.0001, next + stepSize * 0.9);
        o.connect(a).connect(arpFilter); o.start(next); o.stop(next + stepSize);
      }
      if (score.kick.includes(s)) kick(next);
      if (score.snare.includes(s)) drums(next, false);
      if (score.hats.includes(s)) drums(next, true);
      step++;
      next += stepSize;
    }
  };
  const timer = window.setInterval(schedule, 44);
  schedule();
  return () => {
    clearInterval(timer);
    try { lfo.stop(); } catch {}
    bus.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
    window.setTimeout(() => bus.disconnect(), 850);
  };
}
