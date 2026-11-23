"""Normaliza los modelos de la release coches. Blender -b -t 2 -P modelos.py -- EXTRAIDOS ORIGINALES DESTINO."""
import json
import re
import sys
from pathlib import Path
import bpy
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index('--') + 1:]
extracted, originals, dest = map(Path, args[:3])
catalog = json.loads(Path(__file__).with_name('catalogo.json').read_text())
dest.mkdir(parents=True, exist_ok=True)
PAINT = {
    'car_base': '#2B4D64', 'glass': '#182738', 'dark_bits': '#182129',
    'bright_lights_and_lines': '#63E6EA', 'forward_lights': '#D4FBFF', 'tail_lights': '#F84968',
    'wing_lights': '#70C2FF', 'glwoing_darker_blue': '#438EDB', 'gold_piping': '#BF9B61',
    'metallic_elements': '#91A8B6', 'lettering': '#CFD6E8', 'plates': '#526B7B',
}

def rgb(h):
    return tuple(((int(h[i:i+2],16)/255+.055)/1.055)**2.4 for i in (1,3,5))

def shader(mat):
    mat.use_nodes = True
    return next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)

def set_color(mat, color, luminous=False):
    node = shader(mat)
    if node:
        node.inputs['Base Color'].default_value = (*rgb(color), 1)
        node.inputs['Roughness'].default_value = .54
        node.inputs['Metallic'].default_value = .24
        if luminous:
            node.inputs['Emission Color'].default_value = (*rgb(color), 1)
            node.inputs['Emission Strength'].default_value = .85

def fix_hover(obj, hover):
    textures = {x.name: x for x in (hover / 'textures').rglob('*.png')}
    for mat, filename in re.findall(r'newmtl\s+(\S+)[\s\S]*?map_Kd\s+([^\r\n]+)', obj.with_suffix('.mtl').read_text(errors='replace')):
        base = Path(filename.strip().replace('\\', '/')).name
        path = textures.get(base) or textures.get(base.lower())
        if not path:
            print('TEXTURE_MISSING', obj.name, base, flush=True)
            continue
        m = bpy.data.materials.get(mat)
        if not m:
            continue
        node = shader(m)
        image = bpy.data.images.load(str(path), check_existing=True)
        tex = m.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = image
        node.inputs['Roughness'].default_value = .75
        m.node_tree.links.new(tex.outputs['Color'], node.inputs['Base Color'])
        emissive = textures.get(obj.stem + '_emiss.png')
        if emissive:
            lights = m.node_tree.nodes.new('ShaderNodeTexImage')
            lights.image = bpy.data.images.load(str(emissive), check_existing=True)
            m.node_tree.links.new(lights.outputs['Color'], node.inputs['Emission Color'])
            node.inputs['Emission Strength'].default_value = .5

for key, (name, length, family) in catalog.items():
    if args[3:] and name not in args[3:]:
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    hover = extracted / 'HoverCars'
    angle = 0
    if family == 'kay':
        f = next(extracted.glob(f'KayKit*/Assets/gltf/{key}.gltf'))
        bpy.ops.import_scene.gltf(filepath=str(f))
    elif family == 'hover':
        f = next((hover / 'meshes').rglob(key + '.obj'))
        bpy.ops.wm.obj_import(filepath=str(f), forward_axis='Y', up_axis='Z')
        angle = -90
        fix_hover(f, hover)
        if name in ('hover-municipal', 'hover-servicio'):
            for mat in bpy.data.materials:
                node = shader(mat)
                if not node or not node.inputs['Base Color'].is_linked:
                    continue
                tint = mat.node_tree.nodes.new('ShaderNodeMixRGB')
                tint.blend_type = 'MULTIPLY'
                tint.inputs[0].default_value = .82
                tint.inputs[2].default_value = (*rgb('#CDB691' if name == 'hover-municipal' else '#8EB3C4'), 1)
                previous = node.inputs['Base Color'].links[0].from_node
                # El exportador solo consume una textura directa en base color.
                img = previous.image if previous.type == 'TEX_IMAGE' else None
                if img and img.has_data:
                    if max(img.size) > 256:
                        scale = 256 / max(img.size)
                        img.scale(max(1, round(img.size[0]*scale)), max(1, round(img.size[1]*scale)))
                    px = list(img.pixels)
                    for i, factor in enumerate(tint.inputs[2].default_value[:3]):
                        for k in range(i,len(px),4):
                            px[k] *= .18 + .82 * factor
                    img.pixels.foreach_set(px)
                    img.update()
                    img.pack()
                mat.node_tree.nodes.remove(tint)
    elif name == 'royal':
        bpy.ops.import_scene.fbx(filepath=str(originals / (key + '.fbx')))
        for m in bpy.data.materials:
            if 'Vino' in m.name: set_color(m,'#B52747')
            elif 'Glass_Solid' in m.name: set_color(m,'#293847')
            elif 'Glass_Car' in m.name: set_color(m,'#EA5B5E', True)
            elif 'Gold' in m.name: set_color(m,'#D7A66E')
            elif 'Black' in m.name: set_color(m,'#1F2330')
            elif 'Aluminium' in m.name or 'Mercury' in m.name: set_color(m,'#8090A2')
    elif name == 'maglev':
        bpy.ops.wm.obj_import(filepath=str(originals / (key + '.obj')))
        for mat in bpy.data.materials:
            set_color(mat, PAINT.get(mat.name,'#344352'), any(s in mat.name for s in ('lines','lights','glwoing')))
    else:
        f = (originals if name == 'kotetsu' else extracted) / (key + '.blend')
        bpy.ops.wm.open_mainfile(filepath=str(f))
        angle = 180
        if name == 'prototipo':
            set_color(bpy.data.materials['Futuristic_Car.001'], '#3D8588')
            set_color(bpy.data.materials['Futuristic_Car_black.001'], '#1B2333')
            set_color(bpy.data.materials['Futuristic_Car_glass.001'], '#3B526A')
    bpy.context.view_layer.update()
    candidates = []
    rotate = Matrix.Rotation(angle * 3.141592653589793 / 180, 4, 'Z')
    dg = bpy.context.evaluated_depsgraph_get()
    for ob in list(bpy.context.scene.objects):
        if ob.type != 'MESH' or ob.hide_render or ob.hide_get():
            continue
        p = ob.matrix_world.translation
        if name == 'kotetsu' and (abs(p.x) > 2.1 or abs(p.y) > 5.6 or p.z < -.1 or max(ob.dimensions) > 9):
            continue
        if name == 'prototipo' and ('force' in ob.name.lower() or ob.name.startswith('Car_Con')):
            continue
        if name == 'royal' and ('logo' in ob.name.lower() or abs(p.y) > .08):
            continue
        if name == 'maglev' and ob.name.startswith('Text'):
            continue
        evaluated = ob.evaluated_get(dg)
        mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=dg)
        mesh.transform(rotate @ evaluated.matrix_world)
        if len(mesh.polygons):
            candidates.append((ob.name, mesh))
    for ob in list(bpy.context.scene.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    objects = []
    for src, mesh in candidates:
        o = bpy.data.objects.new(src, mesh)
        bpy.context.collection.objects.link(o)
        o.select_set(True)
        objects.append(o)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    obj.data.calc_loop_triangles()
    total = len(obj.data.loop_triangles)
    if total > 5500:
        dec = obj.modifiers.new('Presupuesto de juego', 'DECIMATE')
        dec.ratio = 4650 / total
        dec.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=dec.name)
        obj.data.calc_loop_triangles()
    lo = [min(v.co[i] for v in obj.data.vertices) for i in range(3)]
    hi = [max(v.co[i] for v in obj.data.vertices) for i in range(3)]
    k = length / (hi[1] - lo[1])
    for v in obj.data.vertices:
        v.co = ((v.co.x - (lo[0]+hi[0])/2)*k, (v.co.y - (lo[1]+hi[1])/2)*k, (v.co.z-lo[2])*k)
    for i, mat in enumerate(list(obj.data.materials)):
        if mat is None: continue
        mat.use_backface_culling = True
        node = shader(mat)
        if node and 'glass' in mat.name.lower():
            # Cristales tintados opacos: el coche no necesita ordenar superficies transparentes.
            node.inputs['Alpha'].default_value = 1
            node.inputs['Transmission Weight'].default_value = 0
    for img in bpy.data.images:
        if img.has_data and max(img.size) > 256:
            scale = 256 / max(img.size)
            img.scale(max(1,round(img.size[0]*scale)),max(1,round(img.size[1]*scale)))
            img.pack()
    bpy.ops.export_scene.gltf(filepath=str(dest / (name+'.glb')), export_format='GLB', use_selection=True, export_animations=False, export_yup=True)
    bounds = [round((hi[i]-lo[i])*k,3) for i in range(3)]
    print('CAR', name, bounds, len(obj.data.loop_triangles), flush=True)
