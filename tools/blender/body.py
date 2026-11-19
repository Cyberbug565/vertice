# Lee el cuerpo del kit (posiciones, normales, uv, índices, hueso dominante) directamente del glTF.
import json, numpy as np, os
HUM = '/home/user/vertice/client/public/models/humanos'
FILES = {'masculino': 'Superhero_Male_FullBody.gltf', 'femenino': 'Superhero_Female_FullBody.gltf'}
TEX = {'masculino': 'T_Superhero_Male_Dark.jpg', 'femenino': 'T_Superhero_Female_Dark_BaseColor.jpg'}
CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
def load(kind):
    g = json.load(open(os.path.join(HUM, FILES[kind])))
    bins = {}
    def acc(i):
        a = g['accessors'][i]; bv = g['bufferViews'][a['bufferView']]; b = bv['buffer']
        if b not in bins: bins[b] = open(os.path.join(HUM, g['buffers'][b]['uri']), 'rb').read()
        n = NC[a['type']]
        arr = np.frombuffer(bins[b], dtype=CT[a['componentType']], count=a['count'] * n, offset=bv.get('byteOffset', 0) + a.get('byteOffset', 0))
        stride = bv.get('byteStride')
        if stride and stride != n * np.dtype(CT[a['componentType']]).itemsize:
            raise RuntimeError('stride')
        return arr.reshape(a['count'], n) if n > 1 else arr
    p = next(p for m in g['meshes'] for p in m['primitives'] if 'Superhero' in g['materials'][p['material']]['name'])
    A = p['attributes']
    pos = acc(A['POSITION']).astype(np.float64); nrm = acc(A['NORMAL']).astype(np.float64); uv = acc(A['TEXCOORD_0']).astype(np.float64)
    idx = acc(p['indices']).astype(np.int64).reshape(-1, 3)
    J = acc(A['JOINTS_0']); W = acc(A['WEIGHTS_0'])
    skin = g['skins'][0]; names = [g['nodes'][j]['name'] for j in skin['joints']]
    dom = np.array([names[J[i][np.argmax(W[i])]] for i in range(len(pos))])
    return dict(pos=pos, nrm=nrm, uv=uv, idx=idx, dom=dom)
