"""Extrae las rotaciones UBC que faltan en el cliente. Uso: python completar-ual.py <ZIP de UAL2> <directorio anim>."""
import json
import struct
import sys
import zipfile
from pathlib import Path

def unpack(data):
    size=struct.unpack_from('<I',data,12)[0]
    return json.loads(data[20:20+size]),data[28+size:]
folder=Path(sys.argv[2])
base,_=unpack((folder/'ual2.glb').read_bytes())
with zipfile.ZipFile(sys.argv[1]) as archive:
    name=next(n for n in archive.namelist() if n.endswith('/UAL2_Standard.glb'))
    doc,raw=unpack(archive.read(name))
existing={a['name'] for a in base['animations']}
out={k:doc[k] for k in ('asset','scene','scenes','nodes')}
for node in out['nodes']:
    node.pop('mesh',None);node.pop('skin',None)
out.update(animations=[],accessors=[],bufferViews=[])
binary=bytearray();known={};views={}
def accessor(index):
    if index in known:return known[index]
    a=dict(doc['accessors'][index]);view=dict(doc['bufferViews'][a['bufferView']]);start=view.get('byteOffset',0)
    block=raw[start:start+view['byteLength']]
    key=(block,view.get('byteStride'))
    if key not in views:
        binary.extend(b'\0'*((-len(binary))%4));view['byteOffset']=len(binary);view.pop('target',None)
        binary.extend(block);views[key]=len(out['bufferViews']);out['bufferViews'].append(view)
    a['bufferView']=views[key];known[index]=len(out['accessors']);out['accessors'].append(a)
    return known[index]
for anim in doc['animations']:
    if anim['name'] in existing:continue
    result={'name':anim['name'],'channels':[],'samplers':[]}
    for channel in anim['channels']:
        if channel['target']['path']!='rotation':continue
        s=dict(anim['samplers'][channel['sampler']]);s['input']=accessor(s['input']);s['output']=accessor(s['output'])
        result['channels'].append({'target':channel['target'],'sampler':len(result['samplers'])});result['samplers'].append(s)
    out['animations'].append(result)
binary.extend(b'\0'*((-len(binary))%4));out['buffers']=[{'byteLength':len(binary)}]
header=json.dumps(out,separators=(',',':')).encode();header+=b' '*((-len(header))%4)
def chunk(kind,data):return struct.pack('<I4s',len(data),kind)+data
data=chunk(b'JSON',header)+chunk(b'BIN\0',binary)
(folder/'ual2-extra.glb').write_bytes(b'glTF'+struct.pack('<II',2,12+len(data))+data)
print(len(out['animations']),'clips adicionales',len(data)+12,'bytes')
