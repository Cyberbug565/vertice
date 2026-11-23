import { describe, expect, it } from 'vitest';
import { InstancedMesh, MeshStandardMaterial, Vector3 } from 'three';
import { buildZoneGrid, roadMap, ZoneSchema } from '@vertice/shared';
import citySource from '../../content/zones/vertice.json';
import catalogue from '../src/render/nueva-york.json';
import { City3D } from '../src/render/city3d';
import { URBAN_FORMS, urbanForm, urbanPoint } from '../src/render/urban-form';
import { urbanGeometry, urbanTransform } from '../src/render/urban3d';

const zone = ZoneSchema.parse(citySource);
const tiles = (rect: number[], width: number) =>
  Array.from({ length: rect[2] * rect[3] }, (_, i) => (rect[1] + Math.floor(i / rect[2])) * width + rect[0] + i % rect[2]);
const inDistrict = (id: string) => {
  const [x, y, w, h] = zone.districts.find(d => d.id === id)!.rect;
  return zone.buildings.filter(({ rect: [a, b, rw, rh] }) => {
    const cx = a + rw / 2, cy = b + rh / 2;
    return cx >= x && cx < x + w && cy >= y && cy < y + h;
  });
};

describe('Trama urbana de Nueva York', () => {
  it('utiliza el catálogo con distintas alturas y densidades según el barrio', () => {
    expect(zone.buildings.every(b => urbanForm(b))).toBe(true);
    expect(new Set(zone.buildings.map(b => b.urban?.model))).toEqual(new Set(Object.keys(URBAN_FORMS)));
    expect(new Set(Object.values(catalogue.source.components)).size).toBe(Object.keys(URBAN_FORMS).length);
    for (const form of Object.values(URBAN_FORMS)) {
      expect(form.faces.length % 3).toBe(0);
      expect(form.faces.every(i => i >= 0 && i * 3 < form.points.length)).toBe(true);
      expect(urbanGeometry(form).getAttribute('position').count).toBe(form.faces.length);
    }
    const towers = inDistrict('cenit').filter(b => b.urban?.facade === 'corporativa');
    const villas = inDistrict('colinas').filter(b => b.urban?.facade === 'residencial');
    expect(towers.filter(b => b.height > 40).length).toBeGreaterThan(10);
    expect(villas.filter(b => b.height < 8).length).toBeGreaterThan(20);
    expect(inDistrict('poligono').filter(b => b.urban?.facade === 'ruina').length).toBeGreaterThan(10);
    expect(inDistrict('yermo').filter(b => b.urban?.facade === 'ruina').length).toBeGreaterThan(3);
  });

  it('conecta las calzadas nuevas y coloca pasos transitables fuera de los edificios', () => {
    const grid = buildZoneGrid(zone), roads = roadMap(grid);
    const newRoads = zone.ground.filter(g => g.type === 'asphalt' && g.street);
    expect(newRoads).toHaveLength(7);
    for (const street of newRoads) {
      const cells = tiles(street.rect, grid.w);
      expect(cells.every(i => grid.walk[i] && grid.buildingAt[i] === -1 && roads.axis[i])).toBe(true);
      expect(cells.some(i => roads.axis[i] === 3)).toBe(true);
    }
    for (const crossing of zone.ground.filter(g => g.type === 'crosswalk' && g.street)) {
      expect(tiles(crossing.rect, grid.w).every(i => roads.crossing[i] && roads.axis[i])).toBe(true);
    }
    const links = [...zone.doors.map(d => d.at), ...zone.districts.map(d => d.safePoint).filter(Boolean)];
    expect(links.every(p => grid.walk[p![1] * grid.w + p![0]])).toBe(true);
  });

  it('ajusta las formas y su iluminación a la misma planta y gira los edificios sin desplazarlos', () => {
    for (const b of zone.buildings) {
      const form = urbanForm(b)!;
      const matrix = urbanTransform(b, b.height);
      for (let i = 0; i < form.points.length; i += 3) {
        const pos = new Vector3().fromArray(form.points, i).applyMatrix4(matrix);
        const [x, y, z] = urbanPoint(b, form, i / 3);
        expect(pos.distanceTo(new Vector3(x, y, z))).toBeLessThan(0.0001);
      }
    }
  });

  it('construye las instancias nuevas y deja de dibujar el fantasma cuando se recupera la visibilidad', () => {
    const city = new City3D();
    try {
      expect(city.build(zone, 'low')).toBe(true);
      const ghosts = city.group.children.filter((node): node is InstancedMesh =>
        node instanceof InstancedMesh && (node.material as MeshStandardMaterial).transparent);
      expect(ghosts.length).toBeGreaterThan(0);
      expect(ghosts.filter(g => g.visible)).toHaveLength(0);
      city.setFaded(0, 1);
      expect(ghosts.filter(g => g.visible)).toHaveLength(1);
      city.setFaded(0, 2);
      expect(ghosts.filter(g => g.visible)).toHaveLength(0);
      city.setFaded(0, 0);
      expect(ghosts.filter(g => g.visible)).toHaveLength(0);
    } finally {
      city.clear();
    }
  });
});
