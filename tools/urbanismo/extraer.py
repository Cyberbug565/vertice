"""Blender en segundo plano: extrae geometría y calles del modelo de Lower Manhattan."""

import hashlib
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import bpy
from mathutils import Vector


BUILDINGS = {
    'aguja': 165044, 'bisel': 1816, 'quiebro': 158284, 'tridente': 129594,
    'terraza': 133146, 'curva': 164792, 'oblicua': 124600, 'remate': 125144,
    'pantalla': 117936, 'prisma': 123420,
    'esquina': 125504, 'galeria': 116992, 'balcones': 110346,
    'patio': 121534, 'pasaje': 128726, 'medianera': 159296,
    'lucernario': 12220, 'chaflan': 13370, 'jardin': 73848,
    'pabellon': 92636, 'porche': 121444, 'voladizo': 131948,
    'darsena': 37314, 'laminador': 90336, 'hangar': 95878,
    'silos': 126834, 'almacen': 155768, 'deposito': 164422,
    'nave-hundida': 117292, 'terminal-rota': 135254, 'taller-vencido': 124802,
}
DAMAGED = {'nave-hundida': (0, 0.46), 'terminal-rota': (2, 0.33), 'taller-vencido': (0, 0.28)}
RELEASE = 'https://github.com/Cyberbug565/vertice/releases/tag/newyork'
DIGEST = '56e278e5004ff9c900c79d6b8cbcccc6ced68b24e8e02199f674f53345fd7868'


def building_parts(obj):
    mesh = obj.data
    parents = list(range(len(mesh.vertices)))

    def root(index):
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    for edge in mesh.edges:
        a, b = edge.vertices
        parents[root(b)] = root(a)
    mesh.calc_loop_triangles()
    parts = defaultdict(list)
    for triangle in mesh.loop_triangles:
        parts[root(triangle.vertices[0])].append(tuple(triangle.vertices))
    return {min(min(tri) for tri in triangles): triangles for triangles in parts.values()}


def extract_building(obj, part, damage):
    used = sorted({i for face in part for i in face})
    vertices = [obj.matrix_world @ obj.data.vertices[i].co for i in used]
    # Alinea el volumen a su fachada principal antes de escalarlo a la parcela.
    edges = [(obj.matrix_world @ (obj.data.vertices[b].co) -
              obj.matrix_world @ (obj.data.vertices[a].co))
             for face in part for a, b in zip(face, (*face[1:], face[0]))]
    horizontal = [d for d in edges if abs(d.z) <= 0.18 * d.length and d.length]
    bearing = max(horizontal, key=lambda d: d.length)
    angle = math.atan2(bearing.y, bearing.x)
    # Las diagonales de triangulación no son fachadas. Se escoge una arista
    # que comparta una cara vertical y una cubierta.
    vertical_edges = defaultdict(list)
    world = {i: p for i, p in zip(used, vertices)}
    for a, b, c in part:
        n = (world[b] - world[a]).cross(world[c] - world[a]).normalized()
        for i, j in ((a, b), (b, c), (c, a)):
            vertical_edges[tuple(sorted((i, j)))].append(abs(n.z))
    facade = []
    for (a, b), normals in vertical_edges.items():
        d = world[b] - world[a]
        if min(normals) < 0.25 and (len(normals) == 1 or max(normals) > 0.65) and abs(d.z) < d.length * 0.24:
            facade.append(d)
    if facade:
        bearing = max(facade, key=lambda d: d.length)
        angle = math.atan2(bearing.y, bearing.x)
    ca, sa = math.cos(angle), math.sin(angle)
    aligned = [(x * ca + y * sa, z, x * sa - y * ca) for x, y, z in vertices]
    spans = [(min(axis), max(axis)) for axis in zip(*aligned)]
    points = [
        [(v - lo) / (hi - lo) - (0 if axis == 1 else 0.5)
         for axis, (v, (lo, hi)) in enumerate(zip(point, spans))]
        for point in aligned
    ]
    if damage:
        axis, depth = damage
        for i, p in enumerate(points):
            slump = math.cos(i * 1.7 + p[axis] * 5)
            p[1] *= 1 - depth * max(0, p[axis] + 0.45) * (0.63 + 0.37 * slump)
        top = max(p[1] for p in points)
        for p in points:
            p[1] /= top
    lookup = {key: i for i, key in enumerate(used)}
    triangles = [tuple(lookup[i] for i in tri) for tri in part]
    # Corrige componentes con las caras de fachada invertidas por el importador.
    center = Vector((0, 0.3, 0))
    coords = [Vector(p) for p in points]
    winding = sum((coords[b] - coords[a]).cross(coords[c] - coords[a]).dot(
        (coords[a] + coords[b] + coords[c]) / 3 - center) for a, b, c in triangles)
    if winding < 0:
        triangles = [(a, c, b) for a, b, c in triangles]
    normals = defaultdict(list)
    for a, b, c in triangles:
        n = (coords[b] - coords[a]).cross(coords[c] - coords[a]).normalized()
        for i, j in ((a, b), (b, c), (c, a)):
            normals[tuple(sorted((i, j)))].append(n)
    roof = []
    fins = []
    for (i, j), adjacent in normals.items():
        a, b = coords[i], coords[j]
        if min(a.y, b.y) >= 0.42 and max(n.y for n in adjacent) > 0.46 and (
            len(adjacent) == 1 or min(n.y for n in adjacent) < 0.41
        ) and math.hypot(a.x - b.x, a.z - b.z) > 0.09:
            roof.append((i, j))
        if abs(a.y - b.y) > 0.4 and math.hypot(a.x - b.x, a.z - b.z) < 0.14 and (
            len(adjacent) > 1 and adjacent[0].dot(adjacent[1]) < 0.75
        ):
            fins.append((i, j))
    roof.sort(key=lambda edge: -min(coords[i].y for i in edge))
    fins.sort(key=lambda edge: -abs(coords[edge[0]].y - coords[edge[1]].y))
    return {
        'points': [round(v, 4) for p in points for v in p],
        'faces': [i for tri in triangles for i in tri],
        'cornices': roof[:16],
        'fins': fins[:8],
    }


def road_sample(obj):
    # Recorte de la malla de ejes a escala de manzana, alineado a 60°.
    # Su retícula y sus dos calles descentradas se trasladan al Cénit.
    x0, y0, x1, y1 = -480, 880, 220, 1280
    angle = math.radians(60)
    vertices = []
    for v in obj.data.vertices:
        x, y, z = obj.matrix_world @ v.co
        xx = x * math.cos(angle) + y * math.sin(angle)
        yy = -x * math.sin(angle) + y * math.cos(angle)
        vertices.append((xx, yy, z))
    streets = set()
    for edge in obj.data.edges:
        a, b = [vertices[i] for i in edge.vertices]
        if not all(x0 <= x <= x1 and y0 <= y <= y1 and z < 30 for x, y, z in (a, b)):
            continue
        if math.dist(a[:2], b[:2]) < 10:
            continue
        line = tuple(sorted(tuple(round((p[i] - (x0, y0)[i]) / (x1 - x0, y1 - y0)[i], 4)
                                  for i in (0, 1)) for p in (a, b)))
        streets.add(line)
    return {'aspect': (x1 - x0) / (y1 - y0), 'edges': sorted(streets)}


def main():
    source = Path(bpy.data.filepath)
    with source.open('rb') as stream:
        if hashlib.file_digest(stream, 'sha256').hexdigest() != DIGEST:
            raise ValueError('Se necesita nylowermanhattan.blend de la release newyork.')
    obj = bpy.data.objects['Areas:building']
    parts = building_parts(obj)
    buildings = {}
    for name, entry in BUILDINGS.items():
        if entry not in parts:
            raise KeyError(name + ': el volumen cambió en el archivo de origen')
        buildings[name] = extract_building(obj, parts[entry], DAMAGED.get(name))
    result = {
        'source': {'release': RELEASE, 'file': source.name, 'sha256': DIGEST, 'components': BUILDINGS},
        'buildings': buildings,
        'roads': road_sample(bpy.data.objects['Ways:highway']),
    }
    out = Path(sys.argv[sys.argv.index('--') + 1])
    out.write_text(json.dumps(result, separators=(',', ':')) + '\n', encoding='utf8')


if __name__ == '__main__':
    main()
