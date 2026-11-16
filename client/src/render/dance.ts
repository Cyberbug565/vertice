import type { EmoteState } from '@vertice/shared';

export interface DancePose {
  sway: number; lift: number; lean: number; left: number; right: number; front: number; back: number; turn?: number;
}

export function dancePose(move: EmoteState['move'], secs: number): DancePose {
  const t = secs * Math.PI * 2;
  const s = Math.sin(t), c = Math.cos(t);
  switch (move) {
    case 'neon':
      return { sway: 4 * s, lift: Math.abs(c) * 2, lean: s * 0.16, left: c * 0.55, right: -c * 0.5, front: -0.8 - c * 0.85, back: 0.65 + c * 0.8 };
    case 'onda': {
      const wave = Math.sin(t * 0.65);
      return { sway: wave * 2.4, lift: 1 + 2 * wave, lean: 0.22 * Math.sin(t * 0.65 - 0.9),
        left: -0.14 + wave * 0.13, right: 0.15 - wave * 0.13, front: -1.05 + Math.cos(t * 0.65 - 0.5), back: 1.1 + Math.cos(t * 0.65 - 1.8) * 0.8 };
    }
    case 'orbita': {
      const turn = t * 0.75;
      return { sway: 5 * Math.sin(turn), lift: 2 + 1.6 * Math.cos(turn * 2), lean: Math.sin(turn) * 0.34, turn: Math.cos(turn),
        left: Math.cos(turn) * 0.43, right: Math.sin(turn) * 0.43, front: -1.3 - Math.cos(turn) * 0.42, back: 1.1 + Math.cos(turn) * 0.53 };
    }
    case 'espejo': {
      const beat = Math.floor(secs * 2) % 2 === 0 ? 1 : -1;
      return { sway: 3 * beat + s, lift: Math.abs(s) * 1.8, lean: 0.11 * beat, left: -0.32 * beat,
        right: -0.24 * beat, front: beat > 0 ? -2.25 : -0.32, back: beat < 0 ? 2.15 : 0.36 };
    }
    case 'rebote': {
      const hop = Math.max(0, Math.sin(t * 1.8));
      return { sway: 2 * s, lift: 8 * hop, lean: s * 0.12, left: -0.38 - hop * 0.28, right: 0.38 + hop * 0.28,
        front: -2.2 - hop * 0.5, back: 1.9 + hop * 0.55 };
    }
    case 'robot': {
      const lock = Math.floor(secs * 4) % 4;
      return { sway: [-4, 0, 4, 0][lock], lift: lock % 2 ? 0 : 2.4, lean: [-0.28, 0, 0.28, 0][lock],
        left: [-0.46, -0.1, 0.27, 0][lock], right: [0.28, 0, 0.47, 0.18][lock],
        front: [-1.6, -2.65, -1.45, -0.25][lock], back: [0.4, 1.75, 2.58, 1.25][lock] };
    }
    case 'nausea':
      return { sway: 2, lift: -2.7 + c * 1.2, lean: 0.52 + s * 0.1, left: -0.24, right: 0.26, front: -1.1, back: 0.4 };
  }
}
