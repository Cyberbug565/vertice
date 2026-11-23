import { Assets, Rectangle, Texture } from 'pixi.js';

const frames = new Map<string, Texture[] | null>();
const root = '/models/vehiculos/';
export const vehiclePreview = (model: string) => root + model + '.webp';

export function vehicleSprite(model: string, direction: number): Texture | undefined {
  if (!frames.has(model)) {
    frames.set(model, null);
    void Assets.load<Texture>(root + model + '-calles.webp').then(atlas => {
      frames.set(model, [0, 1, 2, 3].map(i => new Texture({ source: atlas.source, frame: new Rectangle(i * 160, 0, 160, 112) })));
    }).catch(err => console.warn('[sprites de vehículos]', model, err));
  }
  return frames.get(model)?.[direction & 3];
}
