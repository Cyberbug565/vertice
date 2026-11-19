# v0.22 · Texturas de los cuerpos: piel sin la ropa interior pintada del kit, anatomía adulta (areolas y pezones; vulva) y
# máscaras de ropa interior en el UV de cada cuerpo (se pintan en 3D y se proyectan a la textura).
import sys, os, numpy as np, cv2
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import body as B  # (tools/blender/body.py)
OUT = sys.argv[1] if len(sys.argv) > 1 else '/home/user/vertice/client/public/models/humanos'
SRC = os.path.dirname(os.path.abspath(__file__)) + '/orig'   # copia de las texturas originales del kit
os.makedirs(SRC, exist_ok=True)

def raster(b, rule, size, ss=2):
    """Para cada píxel del UV: valor de rule(P, N) (0..1) con P/N interpolados en el triángulo. Supermuestreo ss×ss."""
    S = size * ss
    out = np.zeros((S, S), np.float32)
    P, N, UV, T = b['pos'], b['nrm'], b['uv'], b['idx']
    uvp = UV * S
    for t in T:
        a, c, d = uvp[t]
        x0, y0 = np.floor(np.minimum(np.minimum(a, c), d)).astype(int); x1, y1 = np.ceil(np.maximum(np.maximum(a, c), d)).astype(int)
        x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, S - 1), min(y1, S - 1)
        if x1 < x0 or y1 < y0: continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        v0, v1 = c - a, d - a
        den = v0[0] * v1[1] - v1[0] * v0[1]
        if abs(den) < 1e-12: continue
        px, py = xs - a[0], ys - a[1]
        l1 = (px * v1[1] - v1[0] * py) / den; l2 = (v0[0] * py - px * v0[1]) / den; l0 = 1 - l1 - l2
        inside = (l0 >= -1e-4) & (l1 >= -1e-4) & (l2 >= -1e-4)
        if not inside.any(): continue
        L = np.stack([l0[inside], l1[inside], l2[inside]], 1)
        Pp = L @ P[t]; Np = L @ N[t]; Np /= np.linalg.norm(Np, axis=1, keepdims=True) + 1e-9
        val = rule(Pp, Np)
        yy, xx = ys[inside].astype(int), xs[inside].astype(int)
        out[yy, xx] = np.maximum(out[yy, xx], val)
    if ss > 1: out = cv2.resize(out, (size, size), interpolation=cv2.INTER_AREA)
    return out

def raster_pos(b, size):
    """Posición 3D de cada píxel del UV (NaN fuera de las islas)."""
    out = np.full((size, size, 3), np.nan, np.float32)
    P, UV, T = b['pos'], b['uv'], b['idx']
    uvp = UV * size
    for t in T:
        a, c, d = uvp[t]
        x0, y0 = np.floor(np.minimum(np.minimum(a, c), d)).astype(int); x1, y1 = np.ceil(np.maximum(np.maximum(a, c), d)).astype(int)
        x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, size - 1), min(y1, size - 1)
        if x1 < x0 or y1 < y0: continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        v0, v1 = c - a, d - a
        den = v0[0] * v1[1] - v1[0] * v0[1]
        if abs(den) < 1e-12: continue
        px, py = xs - a[0], ys - a[1]
        l1 = (px * v1[1] - v1[0] * py) / den; l2 = (v0[0] * py - px * v0[1]) / den; l0 = 1 - l1 - l2
        inside = (l0 >= -1e-3) & (l1 >= -1e-3) & (l2 >= -1e-3)
        if not inside.any(): continue
        Lm = np.stack([l0[inside], l1[inside], l2[inside]], 1)
        out[ys[inside].astype(int), xs[inside].astype(int)] = Lm @ P[t]
    return out

def landmarks(k, b):
    P = b['pos']
    crotch = P[np.where((np.abs(P[:, 0]) < 0.012) & (P[:, 1] > 0.7) & (P[:, 1] < 1.0))[0]]; crotch = crotch[np.argmin(crotch[:, 1])]
    nip = []
    for s in (1, -1):
        if k == 'femenino':
            m = (np.sign(P[:, 0]) == s) & (np.abs(P[:, 0]) > 0.04) & (np.abs(P[:, 0]) < 0.2) & (P[:, 1] > 1.2) & (P[:, 1] < 1.45)
            i = np.where(m)[0][np.argmax(P[m, 2])]
        else:
            m = (np.abs(P[:, 0] - s * 0.103) < 0.012) & (np.abs(P[:, 1] - 1.312) < 0.025)
            i = np.where(m)[0][np.argmax(P[m, 2])]
        nip.append(P[i])
    return dict(crotch=crotch, nip=nip)

def soft(d, r, f=0.25):
    """1 dentro del radio r, cae a 0 en un margen f·r."""
    return np.clip((r - d) / (r * f), 0, 1)

for k in ('masculino', 'femenino'):
    b = B.load(k); L = landmarks(k, b); cy = L['crotch'][1]; cz = L['crotch'][2]
    print(k, 'entrepierna', L['crotch'].round(3), 'pezones', [n.round(3) for n in L['nip']])
    dom = b['dom']
    # ---------------------------------------------------------------- textura base sin ropa interior
    src = os.path.join(SRC, B.TEX[k])
    if not os.path.exists(src): os.replace(os.path.join(B.HUM, B.TEX[k]), src) if False else __import__('shutil').copy(os.path.join(B.HUM, B.TEX[k]), src)
    img = cv2.imread(src); H = img.shape[0]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    bb_, gg_, rr_ = [img[:, :, i].astype(int) for i in range(3)]
    dark = (((hsv[:, :, 2] < 112) & (hsv[:, :, 1] < 120)) | (bb_ > rr_ - 8) | (gg_ > rr_ + 4)).astype(np.uint8)
    face = int(H * 0.335); dark[:face, :int(H * 0.37)] = 0     # la cara (ojos, cejas) no se toca
    dark = cv2.dilate(dark, np.ones((13, 13), np.uint8))
    # Relleno en 3D: cada píxel tapado toma el color de la piel más cercana EN EL CUERPO (no en la textura), para que las
    # costuras del UV no mezclen zonas que no se tocan.
    Pimg = raster_pos(b, H)
    valid = ~np.isnan(Pimg[:, :, 0])
    # Los píxeles del borde de cada isla (que el rasterizado deja fuera) toman la posición del píxel válido más cercano.
    from scipy.ndimage import distance_transform_edt
    dist, (iy, ix) = distance_transform_edt(~valid, return_indices=True)
    near = (~valid) & (dist <= 8)
    Pimg[near] = Pimg[iy[near], ix[near]]
    edge = near.copy()
    valid = valid | near
    from scipy.spatial import cKDTree
    srcm = valid & (dark == 0)
    ys, xs = np.nonzero(srcm)
    sel = np.arange(0, len(ys), 3)
    tree = cKDTree(Pimg[ys[sel], xs[sel]])
    ty, tx = np.nonzero(valid & (dark > 0))
    dd, ii = tree.query(Pimg[ty, tx], k=12)
    w = 1 / (dd + 0.004)
    cols = img[ys[sel][ii], xs[sel][ii]].astype(np.float32)
    nude = img.astype(np.float32).copy()
    nude[ty, tx] = (cols * w[:, :, None]).sum(1) / w.sum(1, keepdims=True)
    # Fuera de las islas (relleno de la textura) se copia el vecino para que el filtrado no traiga el color viejo.
    rest_ = (~valid) & (dark > 0)
    nude = nude.astype(np.uint8)
    nude = cv2.inpaint(nude, rest_.astype(np.uint8) * 255, 4, cv2.INPAINT_TELEA).astype(np.float32)
    soft_m = cv2.GaussianBlur(dark.astype(np.float32), (0, 0), 3)[:, :, None]
    nude = cv2.GaussianBlur(nude, (0, 0), 1.5) * soft_m + nude * (1 - soft_m)
    noise = (np.random.RandomState(3).randn(H, H, 1) * 1.5).astype(np.float32)
    nude = np.clip(nude + noise * (dark[:, :, None] > 0), 0, 255).astype(np.uint8)
    # Suavizado en 3D de las costuras del kit (cambios de tono entre islas): se cambia el tono de fondo (baja frecuencia)
    # por la media de los vecinos en el cuerpo, sin tocar el detalle pintado. Solo en el tronco y la cadera (no en la cara).
    from scipy.spatial import cKDTree
    vy, vx = np.nonzero(valid)
    trunk = (Pimg[vy, vx, 1] > 0.75) & (Pimg[vy, vx, 1] < 1.45)
    vy, vx = vy[trunk], vx[trunk]
    sub = np.arange(0, len(vy), 37)
    tr_all = cKDTree(Pimg[vy[sub], vx[sub]])
    low_uv = cv2.GaussianBlur(nude.astype(np.float32), (0, 0), 10)
    _, nn = tr_all.query(Pimg[vy, vx], k=48)
    low_3d = low_uv[vy[sub][nn], vx[sub][nn]].mean(1)
    nude = nude.astype(np.float32)
    nude[vy, vx] = np.clip(nude[vy, vx] - low_uv[vy, vx] + low_3d, 0, 255)
    nude = nude.astype(np.uint8)
    print('  píxeles de ropa interior repintados', int(dark.sum()))
    # ---------------------------------------------------------------- anatomía pintada (areolas, pezones, vulva)
    R_ar, R_np = (0.0145, 0.0042) if k == 'masculino' else (0.019, 0.0050)
    def areola(Pp, Np):
        v = np.zeros(len(Pp))
        for n in L['nip']: v = np.maximum(v, soft(np.linalg.norm(Pp - n, axis=1), R_ar, 0.35) * (Np[:, 2] > 0.2))
        return v
    def nipple(Pp, Np):
        v = np.zeros(len(Pp))
        for n in L['nip']: v = np.maximum(v, soft(np.linalg.norm(Pp - n, axis=1), R_np, 0.5) * (Np[:, 2] > 0.2))
        return v
    A1 = raster(b, areola, H, 1); A2 = raster(b, nipple, H, 1)
    tone = nude.astype(np.float32)
    ar_col = tone * np.array([0.78, 0.74, 0.86])           # BGR: algo más oscuro y rosado
    np_col = tone * np.array([0.62, 0.58, 0.74])
    tone = tone * (1 - A1[:, :, None] * 0.85) + ar_col * (A1[:, :, None] * 0.85)
    tone = tone * (1 - A2[:, :, None]) + np_col * A2[:, :, None]
    if k == 'femenino':
        # Vulva: labios (sombra suave) y hendidura central, en la parte baja delantera del pubis hasta la entrepierna.
        top = cy + 0.062
        def labia(Pp, Np):
            on = (Pp[:, 1] < top) & (Pp[:, 1] > cy - 0.01) & (Pp[:, 2] > cz - 0.005)
            w = 0.017 * np.clip((top - Pp[:, 1]) / 0.03, 0.25, 1)
            return on * soft(np.abs(Pp[:, 0]), w, 0.6) * 0.55
        def cleft(Pp, Np):
            on = (Pp[:, 1] < top - 0.006) & (Pp[:, 1] > cy - 0.012) & (Pp[:, 2] > cz - 0.01)
            return on * soft(np.abs(Pp[:, 0]), 0.0022, 0.8)
        V1 = raster(b, labia, H, 1); V2 = raster(b, cleft, H, 1)
        tone = tone * (1 - V1[:, :, None] * 0.5) + tone * np.array([0.8, 0.76, 0.86]) * (V1[:, :, None] * 0.5)
        tone = tone * (1 - V2[:, :, None] * 0.9) + tone * np.array([0.45, 0.42, 0.55]) * (V2[:, :, None] * 0.9)
    cv2.imwrite(os.path.join(OUT, B.TEX[k]), np.clip(tone, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 90])
    # ---------------------------------------------------------------- máscaras de ropa interior (1024, RGBA)
    torso = np.isin(dom, ['spine_01', 'spine_02', 'spine_03', 'pelvis'])
    def by_dom(names):
        ok = np.isin(dom, names)
        T = b['idx']; return ok
    # La regla recibe puntos interpolados; para saber «a qué hueso pertenece» se usa la posición (cadera/tronco por altura).
    ax = lambda Pp: np.abs(Pp[:, 0])
    front = lambda Pp: Pp[:, 2] > cz
    if k == 'masculino':
        top_y = cy + 0.135
        def briefs(Pp, Np):
            y, x = Pp[:, 1], ax(Pp)
            cut = np.where(front(Pp), cy + 0.004 + 0.85 * np.maximum(0, x - 0.035), cy - 0.025 + 0.55 * np.maximum(0, x - 0.045))
            return ((y <= top_y) & (y >= cut) & (x < 0.24)).astype(float)
        def boxer(Pp, Np):
            y, x = Pp[:, 1], ax(Pp)
            return ((y <= top_y) & (y >= cy - 0.13) & (x < 0.26)).astype(float)
        def tank(Pp, Np):
            y, x, z = Pp[:, 1], ax(Pp), Pp[:, 2]
            neck = (z > 0) & (y > 1.355 - 1.8 * x * x)
            arm = (x > 0.14) & (y > 1.27) | (x > 0.19)
            back = (z <= 0) & (y > 1.43 - 1.5 * x * x)
            return ((y >= top_y - 0.03) & (y < 1.52) & ~neck & ~arm & ~back).astype(float)
        chans = [briefs, boxer, tank, None]
    else:
        top_y = cy + 0.105
        n0 = L['nip'][0]; ub = n0[1] - 0.07
        def panties(Pp, Np):
            y, x = Pp[:, 1], ax(Pp)
            cut = np.where(front(Pp), cy + 0.006 + 1.15 * np.maximum(0, x - 0.026), cy - 0.02 + 0.7 * np.maximum(0, x - 0.035))
            return ((y <= top_y) & (y >= cut) & (x < 0.24)).astype(float)
        def thong(Pp, Np):
            y, x = Pp[:, 1], ax(Pp)
            f = front(Pp)
            tri = f & (y >= cy + 0.006 + 1.7 * np.maximum(0, x - 0.012)) & (y <= top_y)
            band = (y <= top_y) & (y >= top_y - 0.011) & (x < 0.24)
            back = ~f & (x < 0.0055 + 0.03 * np.clip((y - cy) / 0.08, 0, 1) * 0) & (y <= top_y)
            return (tri | band | back).astype(float)
        def bra(Pp, Np):
            y, x, z = Pp[:, 1], ax(Pp), Pp[:, 2]
            cup = np.zeros(len(Pp), bool)
            for n in L['nip']:
                d = np.linalg.norm((Pp - n) * np.array([1, 1.1, 1]), axis=1)
                cup |= (d < 0.082) & (z > n[2] - 0.085) & (y < n[1] + 0.05)
                cup |= (np.abs(Pp[:, 0] - n[0]) < 0.075) & (y <= n[1]) & (y >= ub - 0.01) & (z > 0.02)
            band = (y >= ub - 0.032) & (y <= ub) & (y > 1.0)
            strap = (np.abs(x - abs(n0[0]) + 0.005) < 0.008) & (y > n0[1] + 0.02) & (y < 1.53)
            return (cup | band | strap).astype(float)
        def sports(Pp, Np):
            y, x, z = Pp[:, 1], ax(Pp), Pp[:, 2]
            body_ = (y >= ub - 0.05) & (y <= n0[1] + 0.07) & (x < 0.17)
            neck = (z > 0) & (y > n0[1] + 0.045 - 1.2 * np.maximum(0, x - 0.05))
            strap = (np.abs(x - 0.078) < 0.013) & (y > n0[1]) & (y < 1.52)
            back = (z <= 0) & (y >= ub - 0.05) & (y < 1.5) & (x < 0.05 + 0.25 * np.maximum(0, y - n0[1]))
            return ((body_ & ~neck) | strap | back).astype(float)
        chans = [panties, thong, bra, sports]
    M = np.zeros((1024, 1024, 4), np.uint8)
    for i, r in enumerate(chans):
        if r is None: continue
        m = raster(b, r, 1024, 2)
        # Se ensancha un poco por las costuras del UV (si no, quedan rayas de piel en los cortes de la textura).
        m = np.maximum(m, cv2.dilate(m, np.ones((3, 3), np.uint8)) * (m > 0.02))
        M[:, :, i] = np.clip(m * 255, 0, 255).astype(np.uint8)
    cv2.imwrite(os.path.join(OUT, f'interior-{k}.png'), cv2.cvtColor(M, cv2.COLOR_RGBA2BGRA))
    print('  máscaras', [int((M[:, :, i] > 127).sum()) for i in range(4)])
