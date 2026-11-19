# Vista de comprobación: cuerpo del kit + prendas (GLB de fit.py), de frente y de lado, en reposo y con los brazos bajados.
# Uso: blender -b --python prev.py -- <masculino|femenino> <out.png> <prenda1.glb> [prenda2.glb ...]
import bpy, sys, os, math, base64, json
import numpy as np
from mathutils import Vector, Quaternion
a = sys.argv[sys.argv.index('--') + 1:]
kind, out, glbs = a[0], a[1], a[2:]
REPO = '/home/user/vertice'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(REPO, 'client/public/models/humanos', {'masculino': 'Superhero_Male_FullBody.gltf', 'femenino': 'Superhero_Female_FullBody.gltf'}[kind]))
arms = [o for o in bpy.context.scene.objects if o.type == 'ARMATURE']
body = next(o for o in bpy.context.scene.objects if o.type == 'MESH' and any('Superhero' in (s.material.name if s.material else '') for s in o.material_slots))
hide = np.zeros(len(body.data.vertices), bool)
for g in glbs:
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=g)
    sc = bpy.context.scene
    hb = sc.get('vt_hide')
    for o in set(bpy.context.scene.objects) - before:
        if o.type == 'ARMATURE': arms.append(o)
    if hb:
        bits = np.unpackbits(np.frombuffer(base64.b64decode(hb), np.uint8))[:len(hide)].astype(bool); hide |= bits
        del sc['vt_hide']
# Piel lisa y caras ocultas fuera.
sk = bpy.data.materials.new('piel'); sk.use_nodes = True; sk.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.75, 0.5, 0.38, 1)
body.data.materials.clear(); body.data.materials.append(sk)
import bmesh
bm = bmesh.new(); bm.from_mesh(body.data)
bm.verts.ensure_lookup_table()
kill = [f for f in bm.faces if all(hide[v.index] for v in f.verts)]
bmesh.ops.delete(bm, geom=kill, context='FACES'); bm.to_mesh(body.data); bm.free()
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = int(os.environ.get('SPP', 12)); sc.cycles.use_denoising = False
sc.render.resolution_x = int(os.environ.get('RES', 320)); sc.render.resolution_y = int(os.environ.get('RES', 320))
sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True; sc.world.node_tree.nodes['Background'].inputs[1].default_value = 0.9
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3; sun.rotation_euler = (0.8, 0.2, -0.6); sc.collection.objects.link(sun)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 2.0
shots = []
def pose(down):
    for A in arms:
        for s in 'lr':
            pb = A.pose.bones.get(f'upperarm_{s}')
            if not pb: continue
            pb.rotation_mode = 'QUATERNION'
            if not down: pb.rotation_quaternion = Quaternion(); continue
            b = A.data.bones[f'upperarm_{s}']
            rq = (A.matrix_world @ b.matrix_local).to_quaternion()
            sg = 1 if (A.matrix_world @ b.matrix_local).translation.x > 0 else -1
            q = Quaternion((0, 1, 0), sg * math.radians(68))
            pb.rotation_quaternion = rq.inverted() @ q @ rq
            for leg in (f'thigh_{s}',):
                pl = A.pose.bones.get(leg); pl.rotation_mode = 'QUATERNION'
                bl = A.data.bones[leg]; rl = (A.matrix_world @ bl.matrix_local).to_quaternion()
                pl.rotation_quaternion = rl.inverted() @ Quaternion((1, 0, 0), math.radians(-25 if s == 'l' else 20)) @ rl
    bpy.context.view_layer.update()
i = 0
for down in ((True,) if os.environ.get('ONLYDOWN') else (False, True)):
    pose(down)
    for d, rot in [((0, -1, 0), (math.pi / 2, 0, 0)), ((1, 0, 0), (math.pi / 2, 0, math.pi / 2))]:
        cam.location = Vector((0, 0, 0.95)) + Vector(d) * 4; cam.rotation_euler = rot
        p = out.replace('.png', f'_{i}.png'); sc.render.filepath = p; bpy.ops.render.render(write_still=True); shots.append(p); i += 1

