"""v0.36 · Saca la puerta (marco + hojas) de los edificios del kit CC0 de Kenney «City Kit Commercial».

Uso: blender -b --python tools/puertas/extraer.py
Escribe client/public/models/puertas/puerta-<tipo>.glb con dos o tres mallas: «marco», «hoja-i» y (si es doble) «hoja-d».
El origen queda en el centro del umbral, la puerta mira a +Y de Blender (+Z en glTF, hacia la calle) y la escala es la
del kit (×5,2 en el juego, como los edificios). Cada hoja guarda en `vt_bisagra` la x de su bisagra.
"""
import bpy, bmesh, os
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
# modelo, caja de la puerta (x0, x1, y0, y1, ztop) en el sistema de Blender, y del plano de las hojas (y máx. de la hoja)
DOORS = {
    'portal': ('building-c', (-0.282, -0.074, 0.245, 0.30, 0.302), 0.2752),
    'tienda': ('building-a', (0.068, 0.376, 0.32, 0.375, 0.302), 0.3502),
}
EPS = 0.0015

def extract(kind, model, box, leaf_y):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=f'{ROOT}/client/public/models/kenney/{model}.glb')
    src = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
    x0, x1, y0, y1, zt = box
    M = src.matrix_world
    bm = bmesh.new(); bm.from_mesh(src.data); bm.transform(M)
    inside = lambda v: x0 - EPS <= v.co.x <= x1 + EPS and y0 - EPS <= v.co.y <= y1 + EPS and -EPS <= v.co.z <= zt + EPS
    keep = [f for f in bm.faces if all(inside(v) for v in f.verts)]
    # Hojas: lo que está en el plano de la hoja o detrás (cristal), dentro del hueco y por debajo del dintel.
    fx0, fx1 = x0 + 0.028, x1 - 0.028
    def is_leaf(f):
        c = f.calc_center_median()
        within = fx0 - EPS <= min(v.co.x for v in f.verts) and max(v.co.x for v in f.verts) <= fx1 + EPS and c.z < zt - 0.025
        # El pomo sobresale del plano de la hoja pero va con ella.
        knob = all(fx0 + 0.003 < v.co.x < fx1 - 0.003 and 0.003 < v.co.z < zt - 0.03 for v in f.verts)
        return within and (all(v.co.y <= leaf_y + EPS for v in f.verts) or knob)
    leaf = [f for f in keep if is_leaf(f)]
    frame = [f for f in keep if f not in leaf]
    cx = (x0 + x1) / 2
    width = fx1 - fx0
    double = kind == 'tienda'
    parts = {'marco': frame}
    if double:
        parts['hoja-i'] = [f for f in leaf if f.calc_center_median().x < cx]
        parts['hoja-d'] = [f for f in leaf if f.calc_center_median().x >= cx]
    else:
        parts['hoja-i'] = leaf
    mat = src.data.materials[0] if src.data.materials else None
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
    out = []
    for name, faces in parts.items():
        nb = bmesh.new()
        vmap = {}
        uv_src = bm.loops.layers.uv.active
        uv_dst = nb.loops.layers.uv.new('UVMap')
        for f in faces:
            vs = []
            for v in f.verts:
                if v not in vmap: vmap[v] = nb.verts.new(v.co - Vector((cx, y1, 0)))
                vs.append(vmap[v])
            try: nf = nb.faces.new(vs)
            except ValueError: continue
            for l_new, l_old in zip(nf.loops, f.loops): l_new[uv_dst].uv = l_old[uv_src].uv
        me = bpy.data.meshes.new(name); nb.to_mesh(me); nb.free()
        if mat: me.materials.append(mat)
        ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
        if name.startswith('hoja'):
            hinge = (fx0 if name == 'hoja-i' else fx1) - cx
            ob['vt_bisagra'] = hinge
        out.append((name, len(faces)))
    path = f'{ROOT}/client/public/models/puertas/puerta-{kind}.glb'
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_extras=True, export_yup=True)
    print('PUERTA', kind, model, out, 'ancho', round(x1 - x0, 3), 'alto', zt, '->', path)
    bm.free()

os.makedirs(f'{ROOT}/client/public/models/puertas', exist_ok=True)
for k, (m, box, ly) in DOORS.items(): extract(k, m, box, ly)
