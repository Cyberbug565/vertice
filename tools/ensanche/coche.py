"""Convierte la geometría del Maya ASCII a un modelo de juego. No ejecuta instrucciones de Maya."""
import hashlib
import math
import re
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector


DIGEST = '2c330fbed72e55df7e43ace55772301fd9b9f3598c7268e26b50dd57e23cefbe'
NODE = re.compile(r'^createNode (\w+)(?: -s)? -n "([^"]+)"(?: -p "([^"]+)")?;', re.M)
ARRAY = re.compile(r'^\s*setAttr[^"\n]*"\.(vt|ed|fc)\[(\d+)(?::(\d+))?\]"(?:\s+-type "polyFaces")?\s+([^;]+);', re.M)
GROUP = re.compile(r'setAttr[^"\n]*"\.iog\[0\]\.og\[(\d+)\]\.gcl"[^;]+;')
FACE = re.compile(r'\bf\s+(\d+)\s+((?:-?\d+\s*)+)')

COLORS = {
    'MainBody': ('#8f9dab', 'casco'),
    'Interni': ('#1c2634', 'casco'),
    'FinituraNero': ('#293445', 'casco'),
    'Motore': ('#535e70', 'casco'),
    'EnginePart1': ('#596876', 'casco'),
    'EnginePart2': ('#293042', 'casco'),
    'EnginePart3': ('#a3afc0', 'casco'),
    'BrightCables': ('#bf6638', 'casco'),
    'DarkCables': ('#303948', 'casco'),
    'WhiteLight': ('#d9f5ff', 'faros'),
    'OrangeLight': ('#ff9b4e', 'faros'),
    'RedLight': ('#ee254d', 'pilotos'),
    'BlueLight': ('#4ed9ff', 'ion'),
    'Standard_8': ('#234050', 'casco'),
}


def matrix(attrs):
    def vec(key, fallback):
        match = re.search(r'setAttr "\.' + key + r'" -type "double3" ([^;]+);', attrs)
        return tuple(map(float, match[1].split())) if match else fallback

    t, r, s = vec('t', (0, 0, 0)), vec('r', (0, 0, 0)), vec('s', (1, 1, 1))
    return Matrix.Translation(t) @ Euler(tuple(math.radians(x) for x in r), 'XYZ').to_matrix().to_4x4() @ Matrix.Diagonal((*s, 1))


def model_nodes(src):
    found = list(NODE.finditer(src))
    transform, meshes = {}, {}
    for i, m in enumerate(found):
        kind, name, parent = m.groups()
        if not name.startswith('CPDeLorean_'):
            continue
        attrs = src[m.end():found[i + 1].start() if i + 1 < len(found) else len(src)]
        if kind == 'transform':
            transform[name] = matrix(attrs)
        elif kind == 'mesh':
            meshes[name] = (transform[parent], attrs)
    return meshes


def read_mesh(name, transform, attrs, materials):
    points, edges, faces = [], [], []
    groups = [list() for _ in COLORS]
    slots = list(COLORS)
    for m in GROUP.finditer(attrs):
        slot = materials.get((name, m[1]))
        if slot in COLORS:
            for span in re.findall(r'"f\[(\d+(?::\d+)?)\]"', m[0]):
                ends = list(map(int, span.split(':')))
                groups[slots.index(slot)].append((ends[0], ends[-1] + 1))
    for kind, start, stop, values in ARRAY.findall(attrs):
        if kind == 'vt':
            assert len(points) == int(start)
            points.extend(np.fromstring(values, sep=' ').reshape((-1, 3)).tolist())
        elif kind == 'ed':
            assert len(edges) == int(start)
            edges.extend(np.fromstring(values, dtype=int, sep=' ').reshape((-1, 3))[:, :2].tolist())
        else:
            assert len(faces) == int(start)
            for count, ids in FACE.findall(values):
                indices = list(map(int, ids.split()))
                assert len(indices) == int(count), name
                face = [edges[n][0] if n >= 0 else edges[-n - 1][1] for n in indices]
                faces.append(face if transform.determinant() > 0 else face[::-1])
            assert len(faces) == int(stop or start) + 1, name
    assert points and faces, name
    positions = []
    for p in points:
        x, y, z = transform @ Vector(p)
        positions.append((x, -z, y))
    lookup = np.full(len(faces), slots.index(materials.get((name, ''), 'MainBody')), dtype=np.int32)
    for i, spans in enumerate(groups):
        for lo, hi in spans:
            lookup[lo:hi] = i
    return positions, faces, lookup


def material(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get('Principled BSDF')
    color = nodes.new('ShaderNodeVertexColor')
    color.layer_name = 'Pintura'
    mat.node_tree.links.new(color.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Metallic'].default_value = 0.49 if name == 'casco' else 0.09
    bsdf.inputs['Roughness'].default_value = 0.39
    if name != 'casco':
        strength = {'faros': 0.95, 'pilotos': 0.85, 'ion': 1.12}[name]
        bsdf.inputs['Emission Color'].default_value = {
            'faros': (.78, .92, 1, 1), 'pilotos': (1, .066, .15, 1), 'ion': (.09, .68, 1, 1),
        }[name]
        bsdf.inputs['Emission Strength'].default_value = strength
    return mat


def main():
    source, output = map(Path, sys.argv[sys.argv.index('--') + 1:])
    with source.open('rb') as src:
        if hashlib.file_digest(src, 'sha256').hexdigest() != DIGEST:
            raise ValueError('El coche no coincide con el Maya ASCII de la release newyork.')
    src = source.read_text(encoding='cp1252')
    shading = {b: a.removeprefix('DeLorean_') for a, b in re.findall(r'connectAttr "(\w+)\.oc" "(\w+)\.ss"', src)}
    uses = re.findall(r'connectAttr "(\w+)\.iog(?:\.og\[(\d+)\])?" "(\w+)\.dsm"', src)
    slots = {(obj, group): shading[sg] for obj, group, sg in uses if shading.get(sg) in COLORS}
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    parts = model_nodes(src)
    assert len(parts) == 12
    default_materials = [bpy.data.materials.new(n) for n in COLORS]
    packed = {tag: [[], [], [], {}] for _, tag in COLORS.values()}
    lo = [float('inf')] * 3
    hi = [-float('inf')] * 3
    for name, (transform, attrs) in parts.items():
        vertices, faces, memberships = read_mesh(name, transform, attrs, slots)
        print(name, len(vertices), len(faces), flush=True)
        assert all(0 <= i < len(vertices) for face in faces for i in face), name
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(vertices, [], faces)
        for m in default_materials:
            mesh.materials.append(m)
        mesh.polygons.foreach_set('material_index', memberships)
        mesh.validate(verbose=False)
        mesh.update()
        o = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(o)
        bpy.context.view_layer.objects.active = o
        mesh.calc_loop_triangles()
        # Las piezas de luz y forma pequeña conservan sus separaciones de material durante la reducción.
        part = name.removeprefix('CPDeLorean_').removesuffix('Shape')
        budget = 4200 if part == 'MainBody' else 140 if 'pipes' in part else 300
        decimate = o.modifiers.new('Malla de juego', 'DECIMATE')
        decimate.ratio = min(1, budget / max(1, len(mesh.loop_triangles)))
        decimate.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=decimate.name)
        mesh = o.data
        mesh.calc_loop_triangles()
        for f in mesh.loop_triangles:
            color, tag = list(COLORS.values())[f.material_index]
            pts, tris, paint, memo = packed[tag]
            ids = []
            for i in f.vertices:
                key = (name, i)
                if key not in memo:
                    co = mesh.vertices[i].co.copy()
                    for axis in range(3):
                        lo[axis] = min(lo[axis], co[axis])
                        hi[axis] = max(hi[axis], co[axis])
                    memo[key] = len(pts)
                    pts.append(co)
                ids.append(memo[key])
            tris.append(ids)
            paint.append(color)
        bpy.data.objects.remove(o, do_unlink=True)

    length = hi[1] - lo[1]
    print('Maya original y-up, escala', lo, hi, length)
    scale = 2.22 / length
    mid_x, mid_y, min_z = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]
    for tag, (pts, faces, paint, _) in packed.items():
        if not faces:
            continue
        mesh = bpy.data.meshes.new(tag)
        mesh.from_pydata([((p.x - mid_x) * scale, (p.y - mid_y) * scale, (p.z - min_z) * scale + .075)
                          for p in pts], [], faces)
        mesh.update()
        layer = mesh.color_attributes.new(name='Pintura', type='BYTE_COLOR', domain='CORNER')
        for poly, color in zip(mesh.polygons, paint):
            rgb = tuple(int(color[i:i + 2], 16) / 255 for i in (1, 3, 5))
            poly.use_smooth = True
            for i in poly.loop_indices:
                layer.data[i].color_srgb = (*rgb, 1)
        mesh.validate(clean_customdata=False)
        obj = bpy.data.objects.new(tag, mesh)
        obj.data.materials.append(material(tag))
        bpy.context.collection.objects.link(obj)
        print(tag, len(mesh.vertices), len(faces))
    bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', export_normals=True, export_yup=True)


if __name__ == '__main__':
    main()
