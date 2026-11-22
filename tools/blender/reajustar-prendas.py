"""Reajusta las prendas existentes al cuerpo UBC sin perder materiales ni UV.

blender -b -t 4 --python tools/blender/reajustar-prendas.py -- \
  --source client/public/models/prendas --output /ruta/prendas --body masculino

El origen se conserva. Se endereza el eje de cada manga antes de transferir los
pesos por coordenadas baricéntricas. La tela recibe pesos del miembro correcto,
los guantes se alinean por separado y las faldas comparten el movimiento de ambas
piernas. No se ejecuta nada de los archivos de recursos.
"""
import argparse, base64, itertools, json, math, os, re, struct, sys
from pathlib import Path
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
from mathutils.geometry import barycentric_transform

ap = argparse.ArgumentParser()
ap.add_argument('--source', required=True, type=Path)
ap.add_argument('--output', required=True, type=Path)
ap.add_argument('--body', required=True, choices=['masculino', 'femenino'])
ap.add_argument('--ids', default='')
args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:])
repo = Path(__file__).resolve().parents[2]
assert args.source.resolve() != args.output.resolve(), 'El destino debe ser distinto del origen'
files = sorted((args.source / args.body).glob('*.glb'))
if args.ids: files = [f for f in files if f.stem in args.ids.split(',')]
assert files, 'No hay prendas'

def readmeta(path):
    raw = path.read_bytes()
    length = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20 + length])
    return json.loads(doc['scenes'][0]['extras']['vt_meta'])

def smooth(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)

bpy.ops.wm.read_factory_settings(use_empty=True)
bodyfile = 'Superhero_Male_FullBody.gltf' if args.body == 'masculino' else 'Superhero_Female_FullBody.gltf'
bpy.ops.import_scene.gltf(filepath=str(repo / 'client/public/models/humanos' / bodyfile))
arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
body = next(o for o in bpy.context.scene.objects if o.type == 'MESH' and any('Superhero' in (s.material.name if s.material else '') for s in o.material_slots))
bodyobjects = set(bpy.context.scene.objects)
body.hide_render = True
bp = np.array([(body.matrix_world @ v.co)[:] for v in body.data.vertices])
polys = [list(p.vertices) for p in body.data.polygons]
names = [b.name for b in arm.data.bones]
bi = {n: i for i, n in enumerate(names)}
weights = np.zeros((len(bp), len(names)))
for v in body.data.vertices:
    for g in v.groups:
        n = body.vertex_groups[g.group].name
        if n in bi: weights[v.index, bi[n]] = g.weight
weights /= np.maximum(weights.sum(1, keepdims=True), 1e-9)
dominant = np.array([names[i] for i in weights.argmax(1)])
rest = {b.name: np.array((arm.matrix_world @ b.matrix_local).translation) for b in arm.data.bones}
alltree = BVHTree.FromPolygons([Vector(p) for p in bp], polys)

# Triángulos explícitos: los índices de BVH y los de interpolación deben coincidir.
body.data.calc_loop_triangles()
tris = [list(t.vertices) for t in body.data.loop_triangles]
surfaces = {}
def surface(key):
    if key in surfaces: return surfaces[key]
    def valid(n):
        if key == 'head': return n.startswith(('Head', 'neck'))
        if key.startswith('arm_'): return n.endswith('_' + key[-1]) and n.startswith(('clavicle', 'upperarm', 'lowerarm'))
        if key.startswith('hand_'): return n.endswith('_' + key[-1]) and n.startswith(('hand', 'thumb', 'index', 'middle', 'ring', 'pinky', 'lowerarm'))
        if key.startswith('leg_'): return n in ('pelvis', 'root') or n.endswith('_' + key[-1]) and n.startswith(('thigh', 'calf', 'foot', 'ball'))
        if key.startswith('foot_'): return n.endswith('_' + key[-1]) and n.startswith(('calf', 'foot', 'ball'))
        if key == 'torso': return n.startswith(('spine', 'clavicle', 'neck', 'pelvis', 'root'))
        return True
    ts = [t for t in tris if all(valid(dominant[i]) for i in t)]
    if not ts: raise ValueError('Sin superficie ' + key)
    tree = BVHTree.FromPolygons([Vector(p) for p in bp], ts, all_triangles=True)
    surfaces[key] = (tree, ts)
    return tree, ts

def donor(p, key):
    tree, ts = surface(key)
    loc, normal, ti, dist = tree.find_nearest(Vector(p))
    ids = ts[ti]
    bc = barycentric_transform(loc, *(Vector(bp[i]) for i in ids), Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))
    w = np.maximum(0, np.array(bc)); w /= max(w.sum(), 1e-9)
    return np.array(loc), np.array(normal), (weights[ids] * w[:, None]).sum(0), dist

# Las mangas del primer ajuste aún caían en A dentro de una malla ligada en T.
def sleeves(P, gid, kind):
    result = P.copy()
    arm_part = np.zeros(len(P))
    for side, sign in [('l', 1), ('r', -1)]:
        shoulder, elbow, wrist = (rest[n + '_' + side] for n in ('upperarm', 'lowerarm', 'hand'))
        xx = P[:, 0] * sign
        start = abs(shoulder[0]) + .035
        long = kind == 'full' or gid in ('abrigo-monje', 'abrigo-pop', 'chaqueta-capucha-cyber')
        height = np.maximum(smooth((P[:, 2] - rest['pelvis'][2] + .04) / .20), smooth((xx - abs(elbow[0]) + .08) / .12)) if long else np.ones(len(P))
        chosen = (xx > start) & (height > .8)
        if chosen.sum() < 16: continue
        end = np.quantile(xx[chosen], .98)
        # Medianas de secciones: no dejan que bolsillos ni costuras inclinen el eje.
        centers = []
        for lo, hi in zip(np.linspace(start, end, 10)[:-1], np.linspace(start, end, 10)[1:]):
            q = P[chosen & (xx >= lo) & (xx <= hi)]
            if len(q) >= 4: centers.append([np.median(abs(q[:, 0])), *np.median(q[:, 1:], axis=0)])
        if len(centers) < 3: continue
        C = np.array(centers)
        cy = np.polyfit(C[:, 0], C[:, 1], 1)
        cz = np.polyfit(C[:, 0], C[:, 2], 1)
        radial = np.sqrt((P[:, 1] - np.polyval(cy, xx)) ** 2 + (P[:, 2] - np.polyval(cz, xx)) ** 2)
        radii = []
        for cx, _, _ in C:
            section = chosen & (abs(xx - cx) < (end - start) / 8)
            radii.append(float(np.quantile(radial[section], .95)))
        # El puño largo termina antes de la mano, nunca en los dedos.
        target_end = abs(wrist[0]) - .008 if end > abs(wrist[0]) * .80 else end
        axis_x = np.array([abs(shoulder[0]), abs(elbow[0]), abs(wrist[0])])
        arm_region = np.array([n.endswith('_' + side) and n.startswith(('upperarm', 'lowerarm')) for n in dominant])
        radius_x = np.linspace(start, max(target_end, start + .05), 24)
        body_radii = []
        for tx in radius_x:
            ty = np.interp(tx, axis_x, [shoulder[1], elbow[1], wrist[1]])
            tz = np.interp(tx, axis_x, [shoulder[2], elbow[2], wrist[2]])
            region = (abs(bp[:, 0] * sign - tx) < .035) & arm_region
            body_radii.append(float(np.quantile(np.linalg.norm(bp[region, 1:] - np.array([ty, tz]), axis=1), .95)) if region.any() else .04)
        selected = np.where((xx > start) & (height > 0))[0]
        for i in selected:
            x = xx[i]
            k = float(smooth((x - start) / .10)) * height[i]
            tx = start + (x - start) * (target_end - start) / max(end - start, .05)
            ty = np.interp(tx, axis_x, [shoulder[1], elbow[1], wrist[1]])
            tz = np.interp(tx, axis_x, [shoulder[2], elbow[2], wrist[2]])
            radius = np.interp(tx, radius_x, body_radii)
            # Se limita la sección, no cada vértice por separado: puños y forros
            # conservan el orden de sus capas y no se convierten en tiras largas.
            radial_scale = min(1., (radius + .025) / max(.01, np.interp(x, C[:, 0], radii)))
            target_y = ty + (P[i, 1] - np.polyval(cy, x)) * radial_scale
            target_z = tz + (P[i, 2] - np.polyval(cz, x)) * radial_scale
            result[i, 0] += k * (tx - x) * sign
            result[i, 1] += k * (target_y - P[i, 1])
            result[i, 2] += k * (target_z - P[i, 2])
            arm_part[i] = k
    return result, arm_part

def glove_surface(ob, P):
    """Retopología de los guantes rígidos: conserva su material y proyecta sus UV
    sobre los dedos UBC, que deben poder cerrarse sin mezclar dedos vecinos."""
    side = 'l' if P[:, 0].mean() >= 0 else 'r'
    sign = 1 if side == 'l' else -1
    wrist = abs(rest['hand_' + side][0]) - .025
    chosen = np.array([n.endswith('_' + side) and n.startswith(('hand', 'thumb', 'index', 'middle', 'ring', 'pinky', 'lowerarm')) for n in dominant]) & (bp[:, 0] * sign >= wrist)
    ts = [t for t in tris if all(chosen[i] for i in t)]
    used = sorted({i for t in ts for i in t}); remap = {i: j for j, i in enumerate(used)}
    source = ob.data; source.calc_loop_triangles()
    sts = list(source.loop_triangles)
    tree = BVHTree.FromPolygons([Vector(p) for p in P], [list(t.vertices) for t in sts], all_triangles=True)
    points = [bp[i] + np.array(body.data.vertices[i].normal) * .0035 for i in used]
    me = bpy.data.meshes.new('guante_ajustado'); me.from_pydata(points, [], [[remap[i] for i in t] for t in ts]); me.update()
    for m in source.materials: me.materials.append(m)
    uv = me.uv_layers.new(name='UVMap'); srcuv = source.uv_layers.active
    for face in me.polygons:
        center = sum((me.vertices[i].co for i in face.vertices), Vector()) / len(face.vertices)
        _, _, fi, _ = tree.find_nearest(center); face.material_index = source.polygons[sts[fi].polygon_index].material_index
        for li in face.loop_indices:
            point = me.vertices[me.loops[li].vertex_index].co
            loc, _, ti, _ = tree.find_nearest(point); t = sts[ti]
            if srcuv:
                abc = [Vector((srcuv.data[loop].uv.x, srcuv.data[loop].uv.y, 0)) for loop in t.loops]
                value = barycentric_transform(loc, *(Vector(P[i]) for i in t.vertices), *abc)
                uv.data[li].uv = value.xy
    ob.data = me
    return me, np.array(points)

def sleeve_surfaces(ob, P, arm_part):
    """Retopologiza las mangas sobre el brazo: conserva torso, UV y materiales.
    Las costuras del modelo importado no siempre rodean el brazo del kit; una
    manga continua debe compartir la superficie y las articulaciones del brazo.
    """
    source = ob.data; source.calc_loop_triangles()
    source_tris = list(source.loop_triangles)
    source_uv = source.uv_layers.active
    points = [p.copy() for p in P]; face_ids = []; uv_faces = []; material_ids = []
    replaced = []
    for side, sign in [('l', 1), ('r', -1)]:
        mask = (P[:, 0] * sign > 0) & (arm_part > .6)
        if mask.sum() < 16: continue
        end = min(abs(rest['hand_' + side][0]) - .008, float(np.quantile(P[mask, 0] * sign, .99)))
        cut = abs(rest['upperarm_' + side][0]) + .005
        if end - cut < .06: continue
        replaced.append((sign, cut))
        region = np.array([n.endswith('_' + side) and n.startswith(('upperarm', 'lowerarm', 'clavicle')) for n in dominant])
        region &= (bp[:, 0] * sign > cut - .035) & (bp[:, 0] * sign < end + .005)
        target_tris = [t for t in tris if all(region[i] for i in t)]
        used = sorted({i for t in target_tris for i in t}); mapping = {}
        tree = BVHTree.FromPolygons([Vector(p) for p in P], [list(t.vertices) for t in source_tris], all_triangles=True)
        for vi in used:
            p = bp[vi] + np.array(body.data.vertices[vi].normal) * .020
            mapping[vi] = len(points); points.append(p)
        for t in target_tris:
            ids = [mapping[i] for i in t]; face_ids.append(ids)
            center = np.array([points[i] for i in ids]).mean(0)
            _, _, fi, _ = tree.find_nearest(Vector(center))
            material_ids.append(source.polygons[source_tris[fi].polygon_index].material_index)
            coords = []
            for i in ids:
                loc, _, ti, _ = tree.find_nearest(Vector(points[i])); st = source_tris[ti]
                if source_uv:
                    uv = [Vector((source_uv.data[li].uv.x, source_uv.data[li].uv.y, 0)) for li in st.loops]
                    value = barycentric_transform(loc, *(Vector(P[v]) for v in st.vertices), *uv)
                    coords.append(value.xy[:])
                else: coords.append((0, 0))
            uv_faces.append(coords)
    if not replaced: return source, P, arm_part
    for t in source_tris:
        ids = list(t.vertices); center = P[ids].mean(0)
        if any(center[0] * sign > cut and arm_part[ids].mean() > .15 for sign, cut in replaced): continue
        face_ids.append(ids); material_ids.append(source.polygons[t.polygon_index].material_index)
        uv_faces.append([source_uv.data[li].uv[:] if source_uv else (0, 0) for li in t.loops])
    me = bpy.data.meshes.new('prenda_mangas_ajustadas'); me.from_pydata(points, [], face_ids); me.update()
    for m in source.materials: me.materials.append(m)
    uv = me.uv_layers.new(name='UVMap')
    for face, mat, coords in zip(me.polygons, material_ids, uv_faces):
        face.material_index = mat; face.use_smooth = True
        for li, value in zip(face.loop_indices, coords): uv.data[li].uv = value
    ob.data = me
    return me, np.array(points), np.concatenate((arm_part, np.ones(len(points) - len(P))))

# ICP de similitud para la palma. Solo rotaciones propias: nunca refleja una mano.
def align_glove(P, side):
    mask = np.array([n.endswith('_' + side) and n.startswith(('hand', 'thumb', 'index', 'middle', 'ring', 'pinky')) for n in dominant])
    target = bp[mask]
    kd = KDTree(len(target))
    for i, p in enumerate(target): kd.insert(Vector(p), i)
    kd.balance()
    center = P.mean(0); cloud = P - center
    size = max(np.ptp(cloud, axis=0)); tsize = max(np.ptp(target, axis=0))
    scale = tsize / max(size, 1e-5)
    source = cloud * scale
    # Los autovectores orientan dedos y palma. Se ensayan las 24 bases posibles.
    _, sv = np.linalg.eigh(np.cov(source.T)); _, tv = np.linalg.eigh(np.cov(target.T))
    best = None
    for perm in itertools.permutations(range(3)):
        for signs in itertools.product([-1, 1], repeat=3):
            R = tv[:, perm] @ np.diag(signs) @ sv.T
            if np.linalg.det(R) < .5: continue
            q = source @ R.T + target.mean(0)
            for _ in range(12):
                hits = np.array([target[kd.find(Vector(p))[1]] for p in q])
                qc, hc = q.mean(0), hits.mean(0)
                u, _, vh = np.linalg.svd((q - qc).T @ (hits - hc))
                r = vh.T @ u.T
                if np.linalg.det(r) < 0: vh[-1] *= -1; r = vh.T @ u.T
                q = (q - qc) @ r.T + hc
            loss = float(np.square(q - hits).sum(1).mean())
            if best is None or loss < best[0]: best = loss, q
    return best[1]

report = []
for path in files:
    meta = readmeta(path); kind = meta['type']; gid = path.stem
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(path.resolve()))
    new = set(bpy.context.scene.objects) - before
    meshes = [o for o in new if o.type == 'MESH']
    outobjects = []
    clear = {'top': .013, 'full': .010, 'pants': .009, 'vest': .018, 'gloves': .003, 'boots': .005, 'head': .004}[kind]
    for ob in meshes:
        me = ob.data
        # Curvas grandes y superficies muy planas necesitan vértices cerca del codo.
        if kind in ('top', 'full', 'pants', 'vest') and len(me.vertices) < 6000:
            bm = bmesh.new(); bm.from_mesh(me)
            for _ in range(3):
                edges = [e for e in bm.edges if e.calc_length() > .04]
                if not edges or len(bm.verts) > 12000: break
                bmesh.ops.subdivide_edges(bm, edges=edges, cuts=1, use_grid_fill=True)
            bmesh.ops.triangulate(bm, faces=bm.faces[:]);bm.to_mesh(me);bm.free()
        P = np.array([(ob.matrix_world @ v.co)[:] for v in me.vertices])
        arm_part = np.zeros(len(P))
        if kind in ('top', 'full'): P, arm_part = sleeves(P, gid, kind)
        if kind in ('top', 'full'): me, P, arm_part = sleeve_surfaces(ob, P, arm_part)
        # Los cuellos altos se ajustan al cuello; una pieza de torso no tapa los ojos.
        if gid in ('top-alas', 'conjunto-dorado', 'chaqueta-csi', 'jersey-cyber', 'chaqueta-capucha-cyber'):
            high = P[:, 2] > rest['neck_01'][2] + .03
            P[high, 2] = rest['neck_01'][2] + .03 + (P[high, 2] - rest['neck_01'][2] - .03) * .18
        if kind == 'gloves':
            for side, sign in [('l', 1), ('r', -1)]:
                ids = np.where(P[:, 0] * sign > 0)[0]
                if len(ids): P[ids] = align_glove(P[ids], side)
            if gid == 'guantes-nudillos':
                me, P = glove_surface(ob, P)
                arm_part = np.zeros(len(P))
        # También se comprueban los centros de las caras. Tres vértices fuera
        # de la piel no garantizan que la cara pase por fuera de un codo.
        if kind in ('top', 'full', 'pants', 'vest'):
            for _ in range(3):
                correction = np.zeros_like(P); counts = np.zeros(len(P))
                for face in me.polygons:
                    ids = list(face.vertices); center = P[ids].mean(0)
                    loc, normal, _, dist = alltree.find_nearest(Vector(center))
                    if dist > .10: continue
                    depth = clear - float((Vector(center) - loc).dot(normal))
                    if depth <= 0: continue
                    for vi in ids:
                        correction[vi] += np.array(normal) * depth
                        counts[vi] += 1
                P += correction / np.maximum(1, counts[:, None])
        WW = np.zeros((len(P), len(names)))
        for i, p in enumerate(P):
            side = 'l' if p[0] >= 0 else 'r'
            if kind == 'head': key = 'head'
            elif kind == 'gloves': key = 'hand_' + side
            elif kind == 'boots': key = 'foot_' + side
            elif arm_part[i] > .2: key = 'arm_' + side
            elif kind == 'pants' or kind == 'full' and p[2] < rest['pelvis'][2] -.02: key = 'leg_' + side
            elif p[2] > rest['neck_01'][2] + .07: key = 'head'
            elif abs(p[0]) > abs(rest['upperarm_' + side][0]) + .025 and p[2] > rest['pelvis'][2] + .02: key = 'arm_' + side
            elif p[2] < rest['pelvis'][2] - .06: key = 'leg_' + side
            else: key = 'torso'
            loc, normal, w, dist = donor(p, key)
            # Conserva los pliegues y el volumen: solo corrige intersecciones.
            signed = float(np.dot(p - loc, normal))
            if kind != 'head' and dist < .16 and signed < clear: P[i] = loc + normal * clear
            if kind == 'head':
                w[:] = 0; w[bi['Head']] = 1
            # Un faldón continuo reparte la zancada; no se pega a una sola pierna.
            if ('falda' in gid or gid == 'vestido-scifi') and p[2] < rest['pelvis'][2]:
                hip_height = rest['pelvis'][2]
                knee_height = rest['calf_' + side][2]
                hip_width = abs(rest['thigh_l'][0] - rest['thigh_r'][0])
                follow = float(smooth((hip_height - p[2]) / (.65 * (hip_height - knee_height))))
                left = float(smooth(.5 + p[0] / hip_width))
                bend = .86 * float(smooth((knee_height + .10 - p[2]) / .25))
                w[:] = 0
                w[bi['pelvis']] = 1 - follow
                for suffix, share in [('l', left), ('r', 1 - left)]:
                    w[bi['thigh_' + suffix]] = share * follow * (1 - bend)
                    w[bi['calf_' + suffix]] = share * follow * bend
            top = np.argsort(w)[-4:]; ww = np.zeros_like(w); ww[top] = w[top]; ww /= max(ww.sum(), 1e-9); WW[i] = ww
        ob.parent = arm; ob.matrix_world = Matrix.Identity(4)
        for v, p in zip(me.vertices, P): v.co = p
        ob.vertex_groups.clear()
        for j, name in enumerate(names):
            ids = np.where(WW[:, j] > 1e-6)[0]
            if not len(ids): continue
            vg = ob.vertex_groups.new(name=name)
            for i in ids: vg.add([int(i)], float(WW[i, j]), 'REPLACE')
        for md in list(ob.modifiers): ob.modifiers.remove(md)
        md = ob.modifiers.new('Esqueleto UBC', 'ARMATURE'); md.object = arm
        bpy.context.view_layer.objects.active = ob
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
        me.update(); outobjects.append(ob)
    # Máscara limitada al tipo de prenda: un cuello nunca elimina parte de la cara.
    verts, faces = [], []
    for ob in outobjects:
        off = len(verts); verts.extend(v.co.copy() for v in ob.data.vertices)
        faces.extend([[i + off for i in p.vertices] for p in ob.data.polygons])
    cloth = BVHTree.FromPolygons(verts, faces)
    min_cloth_z = min(verts[i].z for f in faces for i in f)
    hide = np.zeros(len(bp), bool)
    for i, p in enumerate(bp):
        name = dominant[i]
        if kind == 'head': continue  # cascos/máscaras conservan la cara debajo
        if kind in ('top', 'vest') and name.startswith(('Head', 'hand', 'thumb', 'index', 'middle', 'pinky', 'ring')): continue
        if kind in ('top', 'vest') and gid not in ('abrigo-monje', 'abrigo-pop', 'chaqueta-capucha-cyber') and name.startswith(('thigh','calf','foot','ball')): continue
        if kind in ('top', 'vest') and p[2] < min_cloth_z + .02: continue
        if kind in ('boots', 'gloves'):
            allowed = ('foot', 'ball', 'calf') if kind == 'boots' else ('hand', 'thumb', 'index', 'middle', 'pinky', 'ring', 'lowerarm')
            if not name.startswith(allowed): continue
        if kind == 'pants' and not name.startswith(('root','pelvis','spine_01','thigh','calf','foot','ball')): continue
        n = body.matrix_world.to_3x3() @ body.data.vertices[i].normal
        # Un rayo largo cerca de un bajo o de una chaqueta abierta ocultaba
        # piel que estaba al aire. Se exige proximidad y un impacto exterior.
        near, _, _, distance = cloth.find_nearest(Vector(p))
        limit = .18 if ('falda' in gid or gid in ('vestido-scifi', 'abrigo-monje')) else .065
        if distance > limit: continue
        hit = cloth.ray_cast(Vector(p) - n * .002, n, limit + .002)
        if hit[0] is not None: hide[i] = True
    meta['fit_version'] = 3 if 'falda' in gid or gid == 'vestido-scifi' else 2
    bpy.context.scene['vt_hide'] = base64.b64encode(np.packbits(hide.astype(np.uint8)).tobytes()).decode()
    bpy.context.scene['vt_meta'] = json.dumps(meta, ensure_ascii=False)
    for ob in bpy.context.scene.objects: ob.select_set(ob in outobjects or ob == arm)
    out = args.output / args.body / path.name; out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', use_selection=True, export_skins=True, export_animations=False, export_extras=True, export_apply=False, export_image_format='AUTO')
    report.append({'id': gid, 'body': args.body, 'vertices': sum(len(ob.data.vertices) for ob in outobjects), 'hidden': int(hide.sum()), 'bytes': out.stat().st_size})
    print('REAJUSTE', json.dumps(report[-1]), flush=True)
    for ob in new:
        if ob.name in bpy.data.objects: bpy.data.objects.remove(ob, do_unlink=True)
(args.output / f'informe-{args.body}.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
