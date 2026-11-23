import { Container, Graphics } from 'pixi.js';
import { coversActor, sightRay, worldToScreen, type Sight, type ZoneGrid } from '@vertice/shared';

export class SightShade {
  readonly layer = new Container();
  private shade = new Graphics();
  private opening = new Graphics();
  private last = '';
  private grid?: ZoneGrid;

  constructor() {
    this.layer.addChild(this.shade, this.opening);
    this.shade.setMask({ mask: this.opening, inverse: true });
  }

  update(grid: ZoneGrid, x: number, y: number, facing: number, sight: Sight, world: Container, width: number, height: number) {
    this.layer.position.copyFrom(world.position);
    this.layer.scale.copyFrom(world.scale);
    const key = [Math.round(x * 32), Math.round(y * 32), facing, sight.range, sight.degrees, width, height, world.scale.x].join('/');
    if (grid === this.grid && this.last === key) return;
    this.grid = grid;
    this.last = key;
    const base = worldToScreen(x, y), mask = this.opening.clear();
    const extent = Math.max(width, height) / world.scale.x + 2048;
    this.shade.clear().rect(base.x - extent, base.y - extent, extent * 2, extent * 2).fill({ color: 0x090c18, alpha: .94 });
    const angle = sight.degrees * Math.PI / 180, start = facing * Math.PI / 4 - angle / 2;
    const outline = sight.degrees < 360 ? [base.x, base.y] : [];
    const steps = Math.ceil(sight.degrees / 1.5);
    let previous = { id: -1, x: 0, y: 0 };
    for (let i = 0; i <= steps; i++) {
      const a = start + angle * i / steps, dx = Math.cos(a), dy = Math.sin(a);
      const d = sightRay(grid, x, y, dx, dy, sight.range);
      const hit = worldToScreen(x + dx * d, y + dy * d);
      outline.push(hit.x, hit.y);
      const col = Math.floor(x + dx * (d + .001)), row = Math.floor(y + dy * (d + .001));
      const id = d < sight.range && col >= 0 && row >= 0 && col < grid.w && row < grid.h ? grid.buildingAt[row * grid.w + col] : -1;
      // La cara que detuvo el rayo recibe luz hasta su cubierta. El recorte de cámara conserva su sombra en el suelo.
      if (id >= 0 && id === previous.id) {
        const b = grid.def.buildings[id], h = b.height * 1.35;
        if (!coversActor(b.rect, h, x, y)) {
          mask.poly([previous.x, previous.y, hit.x, hit.y, hit.x, hit.y - h * 32, previous.x, previous.y - h * 32]).fill(0xffffff);
        }
      }
      previous = { id, x: hit.x, y: hit.y };
    }
    mask.poly(outline).fill(0xffffff);
    mask.ellipse(base.x, base.y - 13, 13, 20).fill(0xffffff);
  }
}
