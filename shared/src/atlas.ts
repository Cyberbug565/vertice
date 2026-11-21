export const MAP_CELL = 8;
export const MAP_INTERFACE = 15;
export interface MapKnowledge { cells: string[]; places: string[]; unlocked: boolean }
export const cellKey = (zone: string, x: number, y: number) => zone + '@' + Math.floor(x / MAP_CELL) + ',' + Math.floor(y / MAP_CELL);
export const emptyMap = (): MapKnowledge => ({ cells: [], places: [], unlocked: false });

export class Atlas {
  cells = new Set<string>();
  places = new Set<string>();
  unlocked = false;
  revision = 0;
  apply(update: MapKnowledge, reset = false) {
    if (reset) { this.cells.clear(); this.places.clear(); this.unlocked = false; }
    for (const k of update.cells) this.cells.add(k);
    for (const k of update.places) this.places.add(k);
    this.unlocked ||= update.unlocked;
    this.revision++;
  }
  seen(zone: string, x: number, y: number) { return this.unlocked || this.cells.has(cellKey(zone, x, y)); }
  knows(id: string) { return this.unlocked || this.places.has(id); }
}
