# v0.22 · Ajuste automático de una prenda (FBX/OBJ/GLB) a un cuerpo del kit (UBC de Quaternius).
#   1) Orienta y escala la prenda y pone el cuerpo en la postura de la prenda (brazos y piernas) buscando el mejor encaje.
#   2) Pasa cada vértice de la prenda a la postura de reposo del cuerpo (skinning inverso) con los pesos de los huesos.
#   3) Separa la prenda de la piel (holgura según la capa) y calcula qué vértices del cuerpo tapa (para no dibujarlos).
#   4) Exporta un GLB con el esqueleto del cuerpo y la prenda atada a sus huesos.
# Uso: blender -b --python fit.py -- <config.json>
import bpy, bmesh, sys, os, json, math, random, base64, re
import numpy as np
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree

cfg = json.load(open(sys.argv[sys.argv.index('--') + 1]))
random.seed(7)
REPO = cfg['repo']
BODY_FILE = {'masculino': 'Superhero_Male_FullBody.gltf', 'femenino': 'Superhero_Female_FullBody.gltf'}[cfg['body']]
KIND = cfg['type']          # top | full | pants | boots | gloves | head | vest
CLEAR = cfg.get('clear', {'top': 0.008, 'full': 0.005, 'pants': 0.005, 'boots': 0.004, 'gloves': 0.002, 'head': 0.004, 'vest': 0.02}[KIND])
log = lambda *a: print('FIT', *a, flush=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
# ------------------------------------------------------------------ cuerpo
bpy.ops.import_scene.gltf(filepath=os.path.join(REPO, 'client/public/models/humanos', BODY_FILE))
arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
body = next(o for o in bpy.context.scene.objects if o.type == 'MESH' and any('Superhero' in (s.material.name if s.material else '') for s in o.material_slots))
extras = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o is not body]
for o in bpy.context.scene.objects: o.select_set(False)
# Vértices del cuerpo en el orden del archivo glTF (el importador no los reordena: se comprueba con el archivo).
gj = json.load(open(os.path.join(REPO, 'client/public/models/humanos', BODY_FILE)))
prim = next(p for m in gj['meshes'] for p in m['primitives'] if 'Superhero' in gj['materials'][p['material']]['name'])
acc = gj['accessors'][prim['attributes']['POSITION']]; bv = gj['bufferViews'][acc['bufferView']]
raw = np.frombuffer(open(os.path.join(REPO, 'client/public/models/humanos', gj['buffers'][bv['buffer']]['uri']), 'rb').read(), dtype=np.float32,
                    count=acc['count'] * 3, offset=bv.get('byteOffset', 0) + acc.get('byteOffset', 0)).reshape(-1, 3)
NB = len(body.data.vertices)
assert NB == acc['count'], ('orden', NB, acc['count'])
bco = np.array([v.co[:] for v in body.data.vertices])
assert np.abs(bco - np.stack([raw[:, 0], -raw[:, 2], raw[:, 1]], 1)).max() < 1e-4, 'el importador cambió el orden de los vértices'
bones = [b.name for b in arm.data.bones]
gi2bone = {g.index: g.name for g in body.vertex_groups}
W = np.zeros((NB, len(bones)), np.float32)
bidx = {n: i for i, n in enumerate(bones)}
for v in body.data.vertices:
    for g in v.groups:
        nm = gi2bone.get(g.group)
        if nm in bidx: W[v.index, bidx[nm]] = g.weight
W /= np.maximum(W.sum(1, keepdims=True), 1e-6)
dom = np.array([bones[i] for i in W.argmax(1)])
REGION = {
    'top': r'^(spine|clavicle|upperarm|lowerarm|neck|pelvis)',
    'vest': r'^(spine|clavicle|neck|pelvis)',
    'full': r'^(spine|clavicle|upperarm|lowerarm|neck|pelvis|thigh|calf|root)',
    'pants': r'^(pelvis|thigh|calf|root)',
    'boots': r'^(foot|ball|calf)',
    'gloves': r'^(hand|index|middle|ring|pinky|thumb|lowerarm)',
    'head': r'^(Head|neck)',
}[KIND]
inreg = np.array([bool(re.match(REGION, d)) for d in dom])
body.data.calc_loop_triangles()
polys = [list(t.vertices) for t in body.data.loop_triangles]
regpolys = [p for p in polys if all(inreg[i] for i in p)]

def body_world(evaluated=True):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg) if evaluated else body
    me = ev.to_mesh()
    co = np.array([(ev.matrix_world @ v.co)[:] for v in me.vertices])
    ev.to_mesh_clear()
    return co

# ------------------------------------------------------------------ postura
rest_mat = {b.name: (arm.matrix_world @ b.matrix_local) for b in arm.data.bones}
def bone_dir(a, b):
    return (rest_mat[b].translation - rest_mat[a].translation).normalized()
ARMS = {'l': ('upperarm_l', 'lowerarm_l'), 'r': ('upperarm_r', 'lowerarm_r')}
LEGS = {'l': ('thigh_l', 'calf_l'), 'r': ('thigh_r', 'calf_r')}
side_sign = {s: (1 if rest_mat[ARMS[s][0]].translation.x > 0 else -1) for s in 'lr'}
rest_elev = math.degrees(math.asin(-bone_dir(*ARMS['l']).z))
log('body', cfg['body'], 'verts', NB, 'rest arm elevation', round(rest_elev, 1), 'l side', side_sign['l'])

def set_pose(e=None, f=0.0, l=None):
    for s in 'lr':
        sg = side_sign[s]
        pb = arm.pose.bones[ARMS[s][0]]; pb.rotation_mode = 'QUATERNION'
        if e is None: pb.rotation_quaternion = Quaternion()
        else:
            er, fr = math.radians(e), math.radians(f)
            want = Vector((sg * math.cos(er) * math.cos(fr), -math.cos(er) * math.sin(fr), -math.sin(er))).normalized()
            q = bone_dir(*ARMS[s]).rotation_difference(want)
            rq = rest_mat[ARMS[s][0]].to_quaternion()
            pb.rotation_quaternion = rq.inverted() @ q @ rq
        pl = arm.pose.bones[LEGS[s][0]]; pl.rotation_mode = 'QUATERNION'
        if l is None: pl.rotation_quaternion = Quaternion()
        else:
            d0 = bone_dir(*LEGS[s]); lr = math.radians(l)
            want = Vector((sg * math.sin(lr), d0.y, -math.cos(lr))).normalized()
            q = d0.rotation_difference(want); rq = rest_mat[LEGS[s][0]].to_quaternion()
            pl.rotation_quaternion = rq.inverted() @ q @ rq
    bpy.context.view_layer.update()

# ------------------------------------------------------------------ prenda
before = set(bpy.context.scene.objects)
src = cfg['src']; ext = os.path.splitext(src)[1].lower()
if ext == '.fbx': bpy.ops.import_scene.fbx(filepath=src, ignore_leaf_bones=True)
elif ext == '.obj': bpy.ops.wm.obj_import(filepath=src)
else: bpy.ops.import_scene.gltf(filepath=src)
new = [o for o in bpy.context.scene.objects if o not in before]
keep = []
for o in new:
    if o.type != 'MESH': continue
    nm = o.name; mats = ' '.join(s.material.name for s in o.material_slots if s.material)
    inc, exc = cfg.get('include'), cfg.get('exclude')
    if inc and not any(re.search(p, nm + ' ' + mats, re.I) for p in inc): continue
    if exc and any(re.search(p, nm + ' ' + mats, re.I) for p in exc): continue
    keep.append(o)
assert keep, 'ninguna malla'
# Se aplana todo (sin esqueleto ni modificadores) en un único objeto en el espacio del mundo.
dg = bpy.context.evaluated_depsgraph_get()
bm = bmesh.new(); mats = []
for o in keep:
    if cfg.get('rest_mesh'):
        for md in list(o.modifiers): o.modifiers.remove(md)
        me = o.data.copy(); me.transform(o.matrix_world); ev = None
    else:
        ev = o.evaluated_get(dg); me = ev.to_mesh()
        me.transform(ev.matrix_world)
    off = len(mats)
    for s in o.material_slots: mats.append(s.material)
    if not o.material_slots: mats.append(None)
    for p in me.polygons: p.material_index += off
    bm.from_mesh(me)
    if ev is not None: ev.to_mesh_clear()
if cfg.get('mat_include'):
    bm.faces.ensure_lookup_table()
    names = [(m.name if m else '') for m in mats]
    dead = [f for f in bm.faces if not re.search(cfg['mat_include'], names[f.material_index] if f.material_index < len(names) else '', re.I)]
    bmesh.ops.delete(bm, geom=dead, context='FACES')
if cfg.get('xside'):
    # Solo una de dos copias puestas una al lado de otra (x > 0 o x < 0 en el archivo).
    dead = [f for f in bm.faces if (f.calc_center_median().x > cfg.get('xcut', 0)) != (cfg['xside'] > 0)]
    bmesh.ops.delete(bm, geom=dead, context='FACES')
loose = [v for v in bm.verts if not v.link_faces]; bmesh.ops.delete(bm, geom=loose, context='VERTS')
if cfg.get('decimate'):
    pass
gme = bpy.data.meshes.new('prenda'); bm.to_mesh(gme); bm.free()
for m in mats: gme.materials.append(m)
for o in new: bpy.data.objects.remove(o, do_unlink=True)
G = bpy.data.objects.new('prenda', gme); bpy.context.scene.collection.objects.link(G)
if cfg.get('decimate'):
    md = G.modifiers.new('dec', 'DECIMATE'); md.ratio = cfg['decimate']
    bpy.context.view_layer.objects.active = G; G.select_set(True)
    bpy.ops.object.modifier_apply(modifier='dec'); G.select_set(False)
    gme = G.data
    log('decimado', len(gme.polygons))
# Material por cara: se fusionan los materiales repetidos (mismo nombre).
gco = np.array([v.co[:] for v in gme.vertices], dtype=np.float64)
R0 = Matrix.Identity(3)
for ax, deg in cfg.get('rot', []): R0 = Matrix.Rotation(math.radians(deg), 3, ax) @ R0
gco = gco @ np.array(R0).T * cfg.get('unit', 1.0)
if cfg.get('decimate'):
    pass
gmin, gmax = gco.min(0), gco.max(0); gsize = gmax - gmin
log('prenda', os.path.basename(src), 'verts', len(gco), 'size', np.round(gsize, 3))

# ------------------------------------------------------------------ ajuste
rest = body_world(False)
rmin, rmax = rest[inreg].min(0), rest[inreg].max(0); rsize = rmax - rmin
def fit_part(P, side=None):
    """Busca escala, giro, traslación y postura para que los puntos P (prenda) abracen la región del cuerpo."""
    regm = inreg.copy()
    if side: regm &= (np.sign(rest[:, 0]) == side_sign[side])
    rpolys = [p for p in polys if all(regm[i] for i in p)]
    bmn, bmx = rest[regm].min(0), rest[regm].max(0)
    pmn, pmx = P.min(0), P.max(0)
    sample = P[np.random.RandomState(1).choice(len(P), min(len(P), 900), replace=False)]
    # Cobertura: puntos del cuerpo que la prenda tiene que tapar (si no, encoger la prenda hasta nada «encajaría»).
    cmask = regm.copy()
    if KIND == 'boots': cmask &= rest[:, 2] < bmn[2] + 0.22
    if KIND == 'gloves': cmask &= np.array([not d.startswith('lowerarm') for d in dom])
    if KIND in ('top', 'full'): cmask &= np.array([not d.startswith('lowerarm') for d in dom])
    cidx = np.where(cmask)[0]
    cidx = cidx[np.random.RandomState(2).choice(len(cidx), min(len(cidx), 260), replace=False)] if len(cidx) else cidx
    from mathutils.kdtree import KDTree
    posed = {'e': None}
    use_arms = KIND in ('top', 'full'); use_legs = KIND in ('full', 'pants'); use_rot = KIND == 'gloves'
    def unpack(x):
        i = 0; d = {'s': math.exp(x[0]), 't': np.array(x[1:4])}; i = 4
        if use_arms: d['e'], d['f'] = x[i], x[i + 1]; i += 2
        if use_legs: d['l'] = x[i]; i += 1
        if use_rot: d['rx'], d['ry'], d['rz'] = x[i], x[i + 1], x[i + 2]; i += 3
        return d
    cache = {}
    def bvh_for(d):
        key = (round(d.get('e', 0), 1), round(d.get('f', 0), 1), round(d.get('l', 0), 1))
        if key not in cache:
            set_pose(d.get('e') if use_arms else None, d.get('f', 0) if use_arms else 0, d.get('l') if use_legs else None)
            co = body_world()
            cache[key] = (BVHTree.FromPolygons([Vector(c) for c in co], rpolys), co[cidx] if len(cidx) else None)
            if len(cache) > 400: cache.pop(next(iter(cache)))
        return cache[key][0]
    def xform(d, pts, yaw):
        c = (pmn + pmx) / 2
        R = Matrix.Rotation(yaw, 3, 'Z')
        if use_rot: R = (Matrix.Rotation(d['rz'], 3, 'Z') @ Matrix.Rotation(d['ry'], 3, 'Y') @ Matrix.Rotation(d['rx'], 3, 'X')) @ R
        return (pts - c) @ np.array(R).T * d['s'] + d['t']
    def loss(x, yaw, pts):
        d = unpack(x)
        if use_arms and not (-10 < d['e'] < 80 and -40 < d['f'] < 40): return 1e3
        if use_arms and e_est is not None and abs(d['e'] - e_est) > 14: return 1e3
        if use_legs and not (-5 < d['l'] < 30): return 1e3
        bvh = bvh_for(d)
        key = (round(d.get('e', 0), 1), round(d.get('f', 0), 1), round(d.get('l', 0), 1))
        csm = cache[key][1]
        Q = xform(d, pts, yaw)
        ds = np.empty(len(Q))
        for i, q in enumerate(Q):
            loc, nrm, _, dist = bvh.find_nearest(Vector(q))
            if loc is None: ds[i] = 0.3; continue
            sd = (Vector(q) - loc).dot(nrm)
            ds[i] = dist if sd >= 0 else -dist
        r = ds - CLEAR
        hub = np.where(np.abs(r) < 0.02, 0.5 * r * r, 0.02 * (np.abs(r) - 0.01))
        hub = np.minimum(hub, 0.004)  # partes sueltas (faldones, capuchas): no tiran del ajuste
        pen = np.maximum(0, -ds) ** 2 * 40
        extra = 0.0
        if KIND != 'head' and csm is not None and len(csm):
            kd = KDTree(len(Q))
            for i, q in enumerate(Q): kd.insert(Vector(q), i)
            kd.balance()
            cd = np.array([min(kd.find(Vector(c))[2], 0.08) for c in csm])
            extra = 0.4 * float((cd ** 2).mean())
        else:
            # Cascos y máscaras: no pueden encoger mucho por debajo del tamaño de la cabeza.
            r_ = math.log(d['s'] / s0)
            extra = 0.002 * max(0.0, -r_ - 0.35) ** 2 * 50
        return float(hub.mean() + pen.mean()) + extra
    def nelder(f, x0, step, it):
        n = len(x0); S = [np.array(x0, float)] + [np.array(x0, float) + np.eye(n)[i] * step[i] for i in range(n)]
        F = [f(s) for s in S]
        for _ in range(it):
            o = np.argsort(F); S = [S[i] for i in o]; F = [F[i] for i in o]
            c = np.mean(S[:-1], 0); xr = c + (c - S[-1]); fr = f(xr)
            if fr < F[0]:
                xe = c + 2 * (c - S[-1]); fe = f(xe)
                S[-1], F[-1] = (xe, fe) if fe < fr else (xr, fr)
            elif fr < F[-2]: S[-1], F[-1] = xr, fr
            else:
                xc = c + 0.5 * (S[-1] - c); fc = f(xc)
                if fc < F[-1]: S[-1], F[-1] = xc, fc
                else:
                    S = [S[0]] + [S[0] + 0.5 * (s - S[0]) for s in S[1:]]; F = [F[0]] + [f(s) for s in S[1:]]
        i = int(np.argmin(F)); return S[i], F[i]
    # Ángulo de las mangas (0 = en T, 45 = en A) medido en la prenda: los puntos de los brazos en la mitad de arriba.
    e_est = None
    if use_arms:
        cx = (pmn[0] + pmx[0]) / 2; W2 = max(1e-6, (pmx[0] - pmn[0]) / 2); hgt = pmx[2] - pmn[2]
        ax_ = np.abs(P[:, 0] - cx)
        sel = (ax_ > 0.5 * W2) & (P[:, 2] > pmn[2] + 0.35 * hgt)
        if sel.sum() > 20:
            xx, zz = ax_[sel], P[sel, 2]
            slope = np.cov(xx, zz)[0, 1] / max(1e-9, np.var(xx))
            e_est = float(np.clip(math.degrees(math.atan(-slope)), 0, 70))
        log('mangas', None if e_est is None else round(e_est, 1))
    # Escala inicial: tamaño de la prenda frente al de la región (por tipo).
    if KIND in ('head', 'gloves'): s0 = float(max(bmx - bmn) / max(pmx - pmn)) * 1.05
    elif KIND == 'boots': s0 = float((bmx - bmn)[1] / (pmx - pmn)[1]) * 1.1
    elif KIND in ('top', 'vest'): s0 = float((bmx - bmn)[2] / (pmx - pmn)[2]) * 0.9
    else: s0 = float((bmx - bmn)[2] / (pmx - pmn)[2])
    s0 *= cfg.get('s_hint', 1.0)
    best = None
    yaws = cfg.get('yaws', [0.0, math.pi])
    elevs = cfg.get('elevs', [e_est] if e_est is not None else [8.0, 40.0]) if use_arms else [None]
    for yaw in yaws:
        for e0 in elevs:
            for sm in cfg.get('scales', [0.85, 1.15]):
                s = s0 * sm
                # Traslación inicial: centro de la región; en vertical, según el tipo.
                c = (bmn + bmx) / 2
                ext = (pmx - pmn) * s
                if KIND in ('top', 'vest', 'full'): tz = bmx[2] - ext[2] / 2 + cfg.get('dz', 0.0)
                elif KIND == 'pants': tz = bmx[2] - ext[2] / 2 + 0.02
                elif KIND == 'boots': tz = bmn[2] + ext[2] / 2 - 0.01
                elif KIND == 'head': tz = bmx[2] - ext[2] / 2 + 0.02 + cfg.get('dz', 0.0)
                else: tz = c[2]
                x0 = [math.log(s), c[0], c[1], tz]
                step = [0.08, 0.02, 0.02, 0.03]
                if use_arms: x0 += [e0, 0.0]; step += [8.0, 6.0]
                if use_legs: x0 += [cfg.get('leg0', 4.0)]; step += [3.0]
                if use_rot: x0 += [0.0, 0.0, 0.0]; step += [0.3, 0.3, 0.3]
                sub = sample[:300]
                x, fx = nelder(lambda x: loss(x, yaw, sub), x0, step, 70)
                if best is None or fx < best[1]: best = (x, fx, yaw)
    x, fx = nelder(lambda x: loss(x, best[2], sample), best[0], [0.03, 0.01, 0.01, 0.01] + ([3.0, 3.0] if use_arms else []) + ([1.5] if use_legs else []) + ([0.1] * 3 if use_rot else []), 120)
    d = unpack(x); log('ajuste', side or '', 'loss', round(fx, 6), 'escala', round(d['s'], 4), 'yaw', round(math.degrees(best[2])), {k: round(float(v), 1) for k, v in d.items() if k in ('e', 'f', 'l')})
    return d, best[2], (lambda pts: xform(d, pts, best[2]))

if KIND in ('boots', 'gloves'):
    # Pares: cada lado se ajusta a su pie o mano. Si la prenda es una sola pieza, se refleja para el otro lado.
    cx = (gmin[0] + gmax[0]) / 2
    parts = {}
    if cfg.get('single'):
        parts = {'l': gco.copy(), 'r': gco * np.array([-1, 1, 1])}
        vsel = {'l': np.arange(len(gco)), 'r': np.arange(len(gco))}
        mirror = True
    else:
        right = gco[:, 0] > cx
        vsel = {'l': np.where(right == (side_sign['l'] > 0))[0], 'r': np.where(right != (side_sign['l'] > 0))[0]}
        parts = {s: gco[vsel[s]] for s in 'lr'}; mirror = False
    fits = {s: fit_part(parts[s], s) for s in 'lr'}
    set_pose(None)
    posed_parts = {s: fits[s][2](parts[s]) for s in 'lr'}
    pose_d = None
else:
    d, yaw, fx = fit_part(gco)
    posed = fx(gco)
    pose_d = d
    mirror = False
    # La búsqueda deja el esqueleto en la última muestra evaluada, que puede ser
    # distinta de la ganadora (también al reutilizar una entrada de la caché).
    # El skinning inverso debe usar exactamente la postura que ajustó la prenda.
    set_pose(d.get('e'), d.get('f', 0), d.get('l'))

# ------------------------------------------------------------------ skinning inverso (postura de la prenda → reposo)
def finalize(P, poly_offset=0):
    """Devuelve (posiciones en reposo, pesos por vértice) para puntos P en la postura actual del cuerpo."""
    co = body_world()
    bvh = BVHTree.FromPolygons([Vector(c) for c in co], polys)
    # Matrices de cada hueso: postura × reposo⁻¹ (espacio del mundo).
    dg = bpy.context.evaluated_depsgraph_get()
    S = np.zeros((len(bones), 4, 4))
    for i, b in enumerate(bones):
        pm = arm.matrix_world @ arm.pose.bones[b].matrix
        S[i] = np.array(pm @ rest_mat[b].inverted())
    out = np.empty_like(P); WW = np.zeros((len(P), len(bones)), np.float32)
    head_i = bidx['Head']
    for k, p in enumerate(P):
        if KIND == 'head' and cfg.get('rigid', True):
            w = np.zeros(len(bones)); w[head_i] = 1
        else:
            loc, nrm, fi, dist = bvh.find_nearest(Vector(p))
            vs = polys[fi]
            # Coordenadas baricéntricas: reproducen el skinning de la superficie
            # donante incluso junto a los codos; la distancia inversa no lo hace.
            from mathutils.geometry import barycentric_transform
            tri = [Vector(co[i]) for i in vs[:3]]
            bc = barycentric_transform(loc, *tri, Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))
            ww = np.maximum(0, np.array(bc)); ww /= max(ww.sum(), 1e-8)
            w = (W[vs[:3]] * ww[:, None]).sum(0); w /= max(w.sum(), 1e-8)
        # Solo los 4 huesos más fuertes.
        top = np.argsort(w)[-4:]; w2 = np.zeros_like(w); w2[top] = w[top]; w2 /= w2.sum()
        M = np.tensordot(w2, S, 1)
        out[k] = (np.linalg.inv(M) @ np.append(p, 1))[:3]
        WW[k] = w2
    return out, WW

if KIND in ('boots', 'gloves'):
    restP = np.zeros_like(gco); Wout = np.zeros((len(gco), len(bones)), np.float32)
    if mirror:
        # Se duplica la geometría: un lado con las caras normales y el otro reflejado.
        A, WA = finalize(posed_parts['l']); B, WB = finalize(posed_parts['r'])
    else:
        for s in 'lr':
            Ps, Ws = finalize(posed_parts[s]); restP[vsel[s]] = Ps; Wout[vsel[s]] = Ws
else:
    restP, Wout = finalize(posed)
set_pose(None)

# ------------------------------------------------------------------ holgura en reposo
co_rest = body_world(False)
bvh_rest = BVHTree.FromPolygons([Vector(c) for c in co_rest], polys)
def push(P):
    P = P.copy(); moved = 0
    for k, p in enumerate(P):
        loc, nrm, fi, dist = bvh_rest.find_nearest(Vector(p))
        if loc is None or dist > 0.09: continue
        sd = (Vector(p) - loc).dot(nrm)
        if sd < CLEAR:
            P[k] = np.array(loc + nrm * CLEAR); moved += 1
    return P, moved
if KIND != 'head':
    if KIND in ('boots', 'gloves') and mirror:
        A, ma = push(A); B, mb = push(B); log('holgura', ma + mb)
    else:
        restP, mv = push(restP); log('holgura', mv)

# ------------------------------------------------------------------ malla final
def build_mesh(P, Wv, flip=False, name='prenda'):
    me = gme.copy(); me.name = name
    for v, p in zip(me.vertices, P): v.co = Vector(p)
    if flip:
        bm2 = bmesh.new(); bm2.from_mesh(me); bmesh.ops.reverse_faces(bm2, faces=bm2.faces); bm2.to_mesh(me); bm2.free()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    vg = {}
    for i, b in enumerate(bones):
        col = Wv[:, i]
        nz = np.nonzero(col > 1e-4)[0]
        if not len(nz): continue
        g = ob.vertex_groups.new(name=b)
        for vi in nz: g.add([int(vi)], float(col[vi]), 'REPLACE')
    ob.parent = arm; mod = ob.modifiers.new('Armature', 'ARMATURE'); mod.object = arm
    me.update()
    return ob
if KIND in ('boots', 'gloves') and mirror:
    oA = build_mesh(A, WA, False, 'prenda_l'); oB = build_mesh(B, WB, True, 'prenda_r')
    finals = [oA, oB]
else:
    finals = [build_mesh(restP, Wout)]
bpy.data.objects.remove(G, do_unlink=True)

# ------------------------------------------------------------------ partes del cuerpo tapadas
hide = np.zeros(NB, bool)
if KIND not in ('head',) and not cfg.get('nohide'):
    dg = bpy.context.evaluated_depsgraph_get()
    tris = []; vv = []
    for ob in finals:
        me = ob.data
        off = len(vv); vv += [Vector(v.co) for v in me.vertices]; tris += [[i + off for i in p.vertices] for p in me.polygons]
    gb = BVHTree.FromPolygons(vv, tris)
    body.data.update()
    nrms = [v.normal.copy() for v in body.data.vertices]
    for i in range(NB):
        o = Vector(co_rest[i]); n = nrms[i]
        h = gb.ray_cast(o - n * 0.035, n, 0.035 + cfg.get('hide_dist', 0.10))
        if h[0] is not None:
            # Tiene que haber tela también un poco más allá por los lados (si no, es un borde: no se oculta).
            hide[i] = True
    # Los bordes: se quita un anillo de vértices ocultos que tocan la piel visible (la tela suele quedarse corta en el borde).
    log('ocultos', int(hide.sum()), 'de', NB)
bits = np.packbits(hide.astype(np.uint8))
covers = sorted({d for d, h in zip(dom, hide) if h})

# ------------------------------------------------------------------ materiales (solo color base, texturas a 1024)
TEX = cfg.get('tex_dir')
def find_tex(matname):
    if not TEX or not os.path.isdir(TEX): return None
    fs = [f for f in os.listdir(TEX) if re.search(r'(albedo|basecolor|base_color|diffuse|_bc\.|_a\.png|ald_|dome2\.tga|modddif|pulover_albedo)', f, re.I) and not re.search(r'(normal|rough|metal|_ao|emiss|height|opac)', f, re.I)]
    over = cfg.get('tex_map', {})
    for k, v in over.items():
        if matname and re.search(k, matname, re.I): return os.path.join(TEX, v)
    if not fs: return None
    if len(fs) == 1: return os.path.join(TEX, fs[0])
    toks = lambda s: set(t for t in re.split(r'[^a-z0-9]+', (s or '').lower()) if len(t) > 2)
    best = max(fs, key=lambda f: len(toks(f) & toks(matname)))
    if not toks(best) & toks(matname): best = sorted(fs)[0]
    return os.path.join(TEX, best)
done = {}
for ob in finals:
    for i, slot in enumerate(ob.material_slots):
        old = slot.material; key = old.name if old else f'm{i}'
        if key not in done:
            m = bpy.data.materials.new('ropa_' + re.sub(r'[^a-zA-Z0-9]+', '_', key)[:40]); m.use_nodes = True
            bsdf = m.node_tree.nodes['Principled BSDF']
            path = cfg.get('tex_force') or find_tex(key)
            color = cfg.get('color')
            if path and os.path.exists(path) and not color:
                img = bpy.data.images.load(path)
                TM = cfg.get('tex_max', 1024)
                if max(img.size) > TM: img.scale(*(int(s * TM / max(img.size)) for s in img.size))
                img.file_format = 'JPEG'
                tn = m.node_tree.nodes.new('ShaderNodeTexImage'); tn.image = img
                m.node_tree.links.new(tn.outputs['Color'], bsdf.inputs['Base Color'])
                log('textura', key, '→', os.path.basename(path))
            else:
                c = color or '#3a3a44'
                bsdf.inputs['Base Color'].default_value = (*(int(c[j:j + 2], 16) / 255 for j in (1, 3, 5)), 1)
            bsdf.inputs['Roughness'].default_value = 0.8
            done[key] = m
        slot.material = done[key]

# ------------------------------------------------------------------ exportar
for o in extras + [body]: bpy.data.objects.remove(o, do_unlink=True)
bpy.context.scene['vt_hide'] = base64.b64encode(bits.tobytes()).decode()
bpy.context.scene['vt_meta'] = json.dumps({'id': cfg['id'], 'body': cfg['body'], 'type': KIND, 'covers': covers, 'pose': {k: float(v) for k, v in (pose_d or {}).items() if k in ('e', 'f', 'l', 's')}})
for o in bpy.context.scene.objects: o.select_set(o in finals or o == arm)
os.makedirs(os.path.dirname(cfg['out']), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=cfg['out'], export_format='GLB', use_selection=True, export_skins=True, export_animations=False,
                          export_image_format='JPEG', export_extras=True, export_apply=False, export_normals=True, export_texcoords=True)
log('ok', cfg['out'], os.path.getsize(cfg['out']))
