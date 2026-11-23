// Vista previa en vivo de un personaje (Pixi) a escala grande: creador de personaje y pantalla de personaje.
import { Application, Container } from 'pixi.js';
import { makeCharacter } from '../render/art';
import type { Appearance } from '@vertice/shared';
import { h } from './dom';

export class Preview {
  app = new Application(); ready: Promise<void>; holder = new Container(); el: HTMLDivElement;
  constructor(private w = 240, private hgt = 300, cls = 'preview') {
    this.el = h('div', { class: cls });
    this.ready = this.app.init({ width: w, height: hgt, backgroundAlpha: 0, antialias: true, resolution: window.devicePixelRatio || 1, autoDensity: true }).then(() => {
      this.el.append(this.app.canvas); this.app.stage.addChild(this.holder);
    });
  }
  async show(ap: Appearance, chrome: string[], _weapon?: string, lost?: string[], _name?: string) {
    await this.ready;
    this.holder.removeChildren().forEach((c) => c.destroy({ children: true }));
    const ch = makeCharacter(ap, 'player', chrome, lost);
    const sc = (this.hgt / 300) * 3.6;
    ch.root.scale.set(sc); ch.root.position.set(this.w / 2, this.hgt - 38 * (this.hgt / 300));
    this.holder.addChild(ch.root);
  }
  destroy() { void this.ready.then(() => this.app.destroy(true, { children: true })); }
}
