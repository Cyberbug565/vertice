# Vista de comprobación del cuerpo y las prendas, de frente y de lado.
# Uso: blender -b --python tools/blender/vista-prenda.py -- <masculino|femenino> <out.png> <prenda.glb> [...]
# CLIP=Melee_Hook TIME=0.25 ONLYDOWN=1 permite revisar una animación real de ual2.glb.
import bpy, sys, os, math, base64, json
import numpy as np
from mathutils import Vector, Quaternion
a = sys.argv[sys.argv.index('--') + 1:]
kind, out, glbs = a[0], a[1], a[2:]
from pathlib import Path
REPO = str(Path(__file__).resolve().parents[2])
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
clip_source = None
if os.environ.get('CLIP'):
    before = set(bpy.context.scene.objects)
    previous = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=os.path.join(REPO, 'client/public/models/anim/ual2.glb'))
    imported = set(bpy.context.scene.objects) - before
    clip_source = next(o for o in imported if o.type == 'ARMATURE')
    clip = next((a for a in set(bpy.data.actions) - previous if a.name == os.environ['CLIP'] or a.name.startswith(os.environ['CLIP'] + '_Armature')), None)
    if not clip: raise ValueError('Animación desconocida: ' + os.environ['CLIP'])
    clip_source.animation_data_create(); clip_source.animation_data.action = clip
    for track in clip_source.animation_data.nla_tracks: track.mute = True
    for ob in imported: ob.hide_render = True
    bpy.context.scene.frame_set(round(float(os.environ.get('TIME', '.3')) * bpy.context.scene.render.fps))
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
    if clip_source:
        for A in arms:
            for bone in A.data.bones:
                pb = A.pose.bones[bone.name]; source = clip_source.pose.bones.get(bone.name)
                if not source or bone.name == 'root': continue
                sr = (clip_source.matrix_world @ source.bone.matrix_local).to_quaternion()
                sp = (clip_source.matrix_world @ source.matrix).to_quaternion()
                rest = (A.matrix_world @ bone.matrix_local).to_quaternion()
                desired = sp @ sr.inverted() @ rest
                parent_rest = (A.matrix_world @ bone.parent.matrix_local).to_quaternion() if bone.parent else A.matrix_world.to_quaternion()
                parent_pose = (A.matrix_world @ pb.parent.matrix).to_quaternion() if pb.parent else A.matrix_world.to_quaternion()
                relative_rest = parent_rest.inverted() @ rest
                pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = relative_rest.inverted() @ parent_pose.inverted() @ desired
                bpy.context.view_layer.update()
        return
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

