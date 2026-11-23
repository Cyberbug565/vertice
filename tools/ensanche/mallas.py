"""Extrae volúmenes, módulos y colores de los archivos de entorno de la release newyork."""
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def hex_color(values):
    return '#' + ''.join(f'{round(max(0, min(1, c)) * 255):02x}' for c in values[:3])


def average(image, uv):
    w, h = image.size
    x, y = int(uv.x % 1 * w), int(uv.y % 1 * h)
    # Las PNG de color se condensan a una paleta de superficie, conservando cada UV y las zonas de desgaste.
    return [sum(image.pixels[((max(0, min(h - 1, y + b)) * w + max(0, min(w - 1, x + a))) * 4) + axis]
                for a, b in ((-1, 0), (0, 0), (1, 0), (0, -1), (0, 1))) / 5 for axis in range(3)]


def frac_surface(name, obj, poly):
    name = name.lower()
    if 'led' in obj.name.lower():
        return ('#66e9ff', 1) if obj.name in ('led.001', 'led.023', 'led.025') else ('#ed65bf', 1)
    if 'neonsign' in obj.name.lower():
        return ('#de5dac', .7) if 'restaurant' in obj.name.lower() or 'love' in obj.name.lower() else ('#477aaf', .85)
    if any(k in name for k in ('glass', 'mirror', 'reflection', 'window', 'night scene')):
        return ('#21445a', .18) if poly.index % 5 else ('#5aa0b7', .48)
    if any(k in name for k in ('metal', 'iron', 'wire', 'vent', 'ac', 'material.04')):
        return '#475365', 0
    if any(k in name for k in ('plaster', 'wall', 'tile', 'material.054')):
        return '#697083', 0
    if 'material.' in name:
        return (('#6b7e94', 0), ('#414d62', 0), ('#354558', 0), ('#7e8ba3', 0))[poly.material_index % 4]
    return '#4d627a', 0


def collect(objects, material_for, accept=lambda _: True):
    points, faces, colors = [], [], []
    for o in objects:
        mesh = o.data
        mesh.calc_loop_triangles()
        world = [o.matrix_world @ v.co for v in mesh.vertices]
        kept = {}
        for f in mesh.loop_triangles:
            xyz = [world[i] for i in f.vertices]
            if not accept(xyz):
                continue
            face = []
            vertices = f.vertices if o.matrix_world.determinant() > 0 else tuple(reversed(f.vertices))
            for i in vertices:
                if i not in kept:
                    kept[i] = len(points)
                    points.append(world[i])
                face.append(kept[i])
            faces.append(face)
            colors.append(material_for(o, f))
    return points, faces, colors


def decimate(name, parts, budget):
    points, faces, colors = parts
    if len(faces) <= budget:
        return parts
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(points, [], faces)
    palette = list(dict.fromkeys(colors))
    indices = {color: i for i, color in enumerate(palette)}
    for color, lit in palette:
        key = f'{color}-{lit}'
        mesh.materials.append(bpy.data.materials.get(key) or bpy.data.materials.new(key))
    mesh.polygons.foreach_set('material_index', [indices[c] for c in colors])
    mesh.validate()
    mesh.update()
    o = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    mod = o.modifiers.new('LOD navegador', 'DECIMATE')
    mod.ratio = budget / len(mesh.polygons)
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    mesh = o.data
    mesh.calc_loop_triangles()
    result = ([v.co.copy() for v in mesh.vertices], [list(f.vertices) for f in mesh.loop_triangles],
              [palette[f.material_index] for f in mesh.loop_triangles])
    bpy.data.objects.remove(o, do_unlink=True)
    return result


def foundation(form):
    """Basamento de hormigón con chaflán para asentar las fachadas importadas."""
    points, faces, colors = form['points'], form['faces'], form['surface']
    offset = len(points) // 3
    material = len(colors['palette'])
    colors['palette'].append({'color': '#495160', 'light': 0})
    for level, radius in ((0, .5), (.007, .5), (.011, .49)):
        for x, z in ((-radius, -radius), (-radius, radius), (radius, radius), (radius, -radius)):
            points.extend([x, level, z])
    triangles = []
    for row in (0, 4):
        for i in range(4):
            j = (i + 1) % 4
            triangles.extend([(row+i, row+j, row+4+j), (row+i, row+4+j, row+4+i)])
    triangles.extend([(8, 9, 10), (8, 10, 11)])
    for face in triangles:
        faces.extend(offset+i for i in face)
        colors['face'].append(material)
    return form


def pack(name, parts, budget):
    points, faces, colors = decimate(name, parts, budget)
    spans = [(min(a), max(a)) for a in zip(*points)]
    assert all(hi - lo > .01 for lo, hi in spans), name
    aligned = []
    for co in points:
        x, y, z = [(v - lo) / (hi - lo) for v, (lo, hi) in zip(co, spans)]
        aligned.extend([round(x - .5, 4), round(z, 4), round(.5 - y, 4)])
    palette = list(dict.fromkeys(colors))
    indices = {c: i for i, c in enumerate(palette)}
    print(name, len(points), len(faces), len(palette))
    form = {'points': aligned, 'faces': [i for face in faces for i in face],
            'cornices': [], 'fins': [], 'surface': {
                'palette': [{'color': col, 'light': power} for col, power in palette],
                'face': [indices[c] for c in colors],
            }}
    return form if name.startswith('contenedor') else foundation(form)


def mat_name(o, face):
    return o.material_slots[face.material_index].name if face.material_index < len(o.material_slots) else ''


def towers():
    objects = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.data.polygons]
    north, south = [], []
    for o in objects:
        extent = [o.matrix_world @ Vector(v) for v in o.bound_box]
        if (max(p.z for p in extent) < .05 or max(p.x for p in extent) - min(p.x for p in extent) > 21 or
                max(p.y for p in extent) - min(p.y for p in extent) > 21):
            continue
        target = north if sum(p.y for p in extent) / len(extent) > -5.4 else south
        target.append(o)
    def color(o, face):
        return frac_surface(mat_name(o, face), o, o.data.polygons[face.polygon_index])

    return {
        'torre-prisma': pack('torre-prisma', collect(north, color), 1470),
        'torre-secuencia': pack('torre-secuencia', collect(south, color), 1470),
        'podio-terminal': pack('podio-terminal', collect(north, color, lambda tri: max(v.z for v in tri) < 13.92), 820),
    }


def neighborhood():
    model = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
    # Se extraen tres inmuebles de Cyberpunk City #1. La selección se mide en las coordenadas del archivo de John Doe.
    rectangles = {
        'pasaje-electrico': (-.15, -5.84, 1.16, -3.11),
        'torre-aurora-neon': (7.34, -6.31, 8.92, -5.21),
        'torre-cableada': (9.37, -9.53, 10.59, -7.22),
    }
    base = [('#45516b', 0), ('#4b5771', 0), ('#738097', 0), ('#3f5f74', .16),
            ('#2f3948', 0), ('#688aa1', .3), ('#a3afc0', 0)]
    def color(o, f):
        n = f.material_index
        if n in (13, 20, 25):
            return ['#ab55fc', '#45e5e7', '#fc8dbb'][n % 3], .6
        return base[n % len(base)]

    return {
        name: pack(name, collect([model], color, lambda vs: all(x0 <= v.x <= x1 and y0 <= v.y <= y1 and v.z > .1 for v in vs)), 540)
        for name, (x0, y0, x1, y1) in rectangles.items()
    }


def freight(obj_path, textures):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.wm.obj_import(filepath=str(obj_path))
    objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    variants = dict(zip(('contenedor-oxido', 'contenedor-verde', 'contenedor-cobalto'), ('', '_Green', '_Blue')))
    result = {}
    for name, suffix in variants.items():
        images = {part: bpy.data.images.load(str(textures / f'{part}_BaseColor{suffix}.png'), check_existing=True)
                  for part in ('Structure', 'Others')}

        def color(o, tri):
            image = images.get(mat_name(o, tri), images['Structure'])
            uv_data = o.data.uv_layers.active.data
            uv = sum((uv_data[j].uv for j in tri.loops), Vector((0, 0))) / 3
            rgb = average(image, uv)
            # Cuantización cromática reproducible para reducir el número de entradas del material.
            rgb = tuple(round(min(1, c * .88 + .10) * 9) / 9 for c in rgb)
            return hex_color(rgb), 0

        result[name] = pack(name, collect(objects, color), 570)
    low, high = result['contenedor-oxido'], result['contenedor-cobalto']
    offset = len(low['points']) // 3
    palette = low['surface']['palette'] + high['surface']['palette']
    stacked = []
    for layer, obj in enumerate((low, high)):
        data = obj['points']
        for i in range(0, len(data), 3):
            x, y, z = data[i:i+3]
            stacked.extend([round(-x * .95, 4) if layer else x,
                            round(y * .497 + layer * .503, 4), -z if layer else z])
    result['contenedor-apilado'] = {
        'points': stacked,
        'faces': low['faces'] + [i + offset for i in high['faces']],
        'cornices': [], 'fins': [],
        'surface': {'palette': palette, 'face': low['surface']['face'] + [i + len(low['surface']['palette']) for i in high['surface']['face']]},
    }
    return result


def main():
    mode, dest, *args = sys.argv[sys.argv.index('--') + 1:]
    if mode == 'torres':
        result = towers()
    elif mode == 'barrio':
        result = neighborhood()
    elif mode == 'contenedores':
        result = freight(*map(Path, args))
    else:
        raise ValueError(mode)
    Path(dest).write_text(json.dumps(result, separators=(',', ':')) + '\n')


if __name__ == '__main__':
    main()
