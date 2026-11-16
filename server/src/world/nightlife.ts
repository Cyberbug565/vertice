import { DANCES, DANCE_IDS, type DanceId } from '@vertice/shared';
import { GameError } from '../game/effects.js';
import { isSick } from '../game/substances.js';
import type { PlayerState } from '../game/player.js';
import type { Entity } from './entity.js';
import type { World, PlayerConn } from './world.js';

const PATRONS = [
  { name: 'Aya', skin: '#8a5a3c', hair: '#0c1123', jacket: '#b4437c', hairStyle: 'cresta', accent: '#fa8cdc' },
  { name: 'Ivo', skin: '#c89070', hair: '#c7e6fb', jacket: '#425382', hairStyle: 'rapado', accent: '#60f1ff' },
  { name: 'Vela', skin: '#f0c8a8', hair: '#5d2656', jacket: '#42564c', hairStyle: 'largo', accent: '#9dfabd' },
  { name: 'Mar', skin: '#b07a5a', hair: '#6e4ce0', jacket: '#6b3f5f', hairStyle: 'corto', accent: '#ce94ff' },
  { name: 'Nico', skin: '#e0b48c', hair: '#233047', jacket: '#6d4131', hairStyle: 'afro', accent: '#fbd191' },
];

export class Nightlife {
  constructor(private readonly w: World) {}

  populate() {
    let venue = 0;
    for (const z of this.w.zones.values()) {
      const room = z.def.nightlife;
      if (!room) continue;
      const [x, y, width, height] = room.floor;
      const positions = [ [1, 1], [width - 2, height - 1], [width - 1, 0], [0, height - 1], [width - 2, 0] ];
      const count = room.kind === 'club' ? (width >= 7 ? 5 : 3) : 1;
      for (let i = 0; i < count; i++) {
        const { name, ...appearance } = PATRONS[(i + venue) % PATRONS.length];
        const [dx, dy] = positions[i];
        const e = this.w.addEntity(z, { kind: 'npc', name, title: 'En la pista', label: '', interactive: false,
          x: x + dx + 0.5, y: y + dy + 0.5, appearance, npcType: 'essential' });
        e.emote = { move: DANCE_IDS[(venue + i) % DANCE_IDS.length], at: Date.now() - 260 * i };
      }
      venue++;
    }
  }

  dance(c: PlayerConn, move: DanceId | null) {
    const e = c.e!, p = c.p!;
    if (move === null) { this.stop(e); return; }
    if (e.transit || e.task || e.channel || e.pendingAction || p.sleeping || p.carrying || p.driving ||
        Date.now() - p.lastCombatAt < 5000 || isSick(p.substances)) throw new GameError('Ahora mismo no puedes bailar.');
    this.w.cancelActivity(e);
    this.w.closeDialog(c);
    e.lastMoveTick = this.w.tick + 1;
    e.emote = { move, at: Date.now() };
    e.labelVer++;
    this.w.send(c, { t: 'notice', kind: 'info', text: `Bailas ${DANCES[move].name}. Camina o pulsa «Dejar de bailar» para parar.` });
  }

  stop(e: Entity) {
    if (!e.emote || e.emote.move === 'nausea') return;
    e.emote = undefined;
    e.labelVer++;
  }

  symptoms(p: PlayerState, e: Entity) {
    const vomiting = isSick(p.substances) && p.status === 'alive' && !p.sleeping;
    if (vomiting && e.emote?.move !== 'nausea') {
      this.w.cancelActivity(e);
      e.pendingAction = undefined;
      e.emote = { move: 'nausea', at: Date.now() };
      e.labelVer++;
    } else if (!vomiting && e.emote?.move === 'nausea') {
      e.emote = undefined;
      e.labelVer++;
    }
  }
}
