"""Blender -b --disable-autoexec -P leer-fbx.py -- <carpeta FBX> <carpeta NPZ>."""
import hashlib
import json
import math
import sys
import tempfile
import zipfile
from pathlib import Path, PurePosixPath

import bpy
import numpy as np
from mathutils import Quaternion

args=sys.argv[sys.argv.index('--')+1:]
source,output=map(Path,args[:2])
only_jog='--solo-trote' in args
output.mkdir(parents=True, exist_ok=True)
mapping = {'pelvis':'Hips','spine_01':'Spine','spine_02':'Spine1','spine_03':'Spine2','neck_01':'Neck','Head':'Head'}
for side, prefix in [('l','Left'),('r','Right')]:
    for dst, src in [('clavicle','Shoulder'),('upperarm','Arm'),('lowerarm','ForeArm'),('hand','Hand'),('thigh','UpLeg'),('calf','Leg'),('foot','Foot'),('ball','ToeBase')]:
        mapping[dst+'_'+side] = prefix+src
    for finger in ['Thumb','Index','Middle','Ring','Pinky']:
        for index in (1,2,3):
            mapping[f'{finger.lower()}_0{index}_{side}'] = f'{prefix}Hand{finger}{index}'
names = list(mapping)
axis = Quaternion((1,0,0), -math.pi/2)
reverse_axis = axis.inverted()
manifest = []
temp=tempfile.TemporaryDirectory()
sources=[] if only_jog else [(f,False) for f in sorted(source.glob('*.fbx'))]
outfits=source/'Modular.Character.Outfits.-.Fantasy.Standard.zip'
if outfits.exists():
    with zipfile.ZipFile(outfits) as z:
        member=next(n for n in z.namelist() if n.endswith('/Female_Peasant_Body.gltf'))
        doc=json.loads(z.read(member))
        assert [a['name'] for a in doc['animations']]==['Jog_Fwd_Loop']
        for buf in doc['buffers']:
            file=PurePosixPath(buf['uri'])
            assert file.name==buf['uri']
            (Path(temp.name)/file.name).write_bytes(z.read(str(PurePosixPath(member).parent/file)))
        doc.pop('images',None);doc.pop('textures',None);doc.pop('samplers',None)
        doc['materials']=[{'name':'Base'} for _ in doc.get('materials',[])]
        gltf=Path(temp.name)/'Jog_Fwd_Loop.gltf'
        gltf.write_text(json.dumps(doc));sources.append((gltf,True))
for path,ubc in sources:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if ubc:bpy.ops.import_scene.gltf(filepath=str(path.resolve()))
    else:bpy.ops.import_scene.fbx(filepath=str(path.resolve()),use_anim=True,use_image_search=False)
    rig = next(obj for obj in bpy.context.scene.objects if obj.type == 'ARMATURE')
    scene = bpy.context.scene
    actions = [a for a in bpy.data.actions if a.fcurves]
    if len(actions) != 1:
        raise ValueError(f'{path}: {len(actions)} movimientos')
    action = actions[0]
    rig.animation_data.action = action
    fps = scene.render.fps / scene.render.fps_base
    start, end = action.frame_range
    frames = round((end-start)/fps*30) + 1
    original = {b.name.rsplit(':',1)[-1]:b for b in rig.data.bones}
    pose = [rig.pose.bones[original[n if ubc else mapping[n]].name] for n in names]
    parents = []
    for b in pose:
        parent = b.parent
        while parent and parent not in pose:
            parent=parent.parent
        parents.append(pose.index(parent) if parent else -1)
    rest = [(rig.matrix_world @ b.bone.matrix_local).to_quaternion().normalized().inverted() for b in pose]
    pelvis_height = (rig.matrix_world @ pose[0].bone.matrix_local).translation.z
    rotations = np.empty((frames,len(pose),4),dtype=np.float32)
    locations = np.empty((frames,len(pose),3),dtype=np.float32)
    for frame in range(frames):
        value=start+(end-start)*frame/(frames-1)
        scene.frame_set(math.floor(value),subframe=value-math.floor(value))
        matrices=[rig.matrix_world @ b.matrix for b in pose]
        delta=[axis @ (mat.to_quaternion().normalized() @ inv) @ reverse_axis for mat,inv in zip(matrices,rest)]
        for i,(mat,q) in enumerate(zip(matrices,delta)):
            local = delta[parents[i]].inverted() @ q if parents[i]>=0 else q
            local.normalize()
            quat=np.array([local.x,local.y,local.z,local.w])
            if frame and np.dot(rotations[frame-1,i],quat)<0:quat=-quat
            rotations[frame,i]=quat
            locations[frame,i]=axis @ mat.translation
    np.savez_compressed(output/(path.stem+'.npz'),names=names,parents=parents,rotations=rotations,locations=locations,hip=pelvis_height)
    manifest.append({'file':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'action':action.name,'fps':fps,'frames':frames,'seconds':round((end-start)/fps,4),'bones':len(original),'mapped':len(pose)})
    print('CLIP',path.name,frames,round((end-start)/fps,3),flush=True)
if not only_jog:(output/'scan.json').write_text(json.dumps(manifest,indent=2))
