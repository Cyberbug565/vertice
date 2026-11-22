"""python empaquetar.py <NPZ de leer-fbx.py> <archivo .vtm>. Requiere NumPy y SciPy."""
import json
import struct
import sys
from pathlib import Path

import numpy as np
from scipy.spatial.transform import Rotation

source, target = map(Path, sys.argv[1:])
# Intervalos inclusivos a 30 Hz. Un mismo archivo aporta gestos distintos cuando contiene varias acciones.
# El FBX llamado Running contiene una rodada lateral; el arco sí contiene dos apoyos completos.
cuts = [
    ('andar','Standard.Walk',0,35,'loop'), ('trotar','Change.Direction',48,65,'recto'), ('correr','Run.Forward.Arc.Left',0,22,'recto'),
    ('curva','Run.Forward.Arc.Left',0,22,'arco'), ('herido','Injured.Run',0,19,'loop'),
    ('ebrio','Drunk.Walk',0,90,'loop'), ('fusil','Walk.With.Rifle',0,43,'loop'),
    ('retroceso','Run.Backwards',0,11,'alternar'), ('lateral-izq','Strafing.1',0,18,'paso'),
    ('lateral-der','Strafing',24,45,'loop'), ('pivote','Catwalk.Walk.Start.Turn.180.Right',13,66,'giro'),
    ('revertir','Change.Direction',12,47,'giro'), ('rodar','Run.To.Rolling',12,61,'accion'),
    ('esquiva-lateral','Running',12,66,'lateral'), ('aterrizar','Jumping.Down',34,78,'accion'),
    ('incorporar','Standing.Up',9,120,'accion'), ('desenvainar','Draw.Sword.1',0,15,'accion'),
    ('jab','Lead.Jab',3,30,'accion'), ('boxeo','Boxing',3,31,'accion'),
    ('guardia','Boxing',40,52,'suave'), ('escudo','Sword.And.Shield.Block',0,17,'accion'),
    ('mandibula','Receive.Uppercut.To.The.Face',0,37,'accion'),
    ('tajo-aereo','Great.Sword.Jump.Attack',6,58,'accion'),
    ('saco','Punching.Bag',0,97,'loop'), ('uprock','Brooklyn.Uprock',0,146,'loop'),
    ('provocar','Taunt',0,85,'accion'), ('lanzar','Throw',0,43,'accion'), ('abrir','Opening',12,92,'accion')
]
names = np.load(source/'Standard.Walk.npz')['names'].tolist()
mirror = [names.index(n[:-1]+('r' if n.endswith('_l') else 'l')) if n.endswith(('_l','_r')) else i for i,n in enumerate(names)]
def blend(a,b,u):
    # Normalized lerp between close adjacent keys, taking the short arc.
    b = np.where(np.sum(a*b,axis=-1,keepdims=True)<0,-b,b)
    v = a*(1-u)+b*u
    return v/np.linalg.norm(v,axis=-1,keepdims=True)

manifest = {'bones':names,'clips':{},'stride':len(names)*4+15}
payload = bytearray()
for id,filename,first,last,mode in cuts:
    a=np.load(source/(filename+'.npz'))
    q=a['rotations'][first:last+1].copy()
    if np.max(np.ptp(q,axis=0))<1e-4:raise ValueError(f'{id} carece de movimiento')
    pos=a['locations'][first:last+1].copy()
    hip=float(a['hip'])
    if mode in ('recto','arco','giro','lateral'):
        line=pos[:,names.index('thigh_l')]-pos[:,names.index('thigh_r')]
        angles=np.unwrap(np.arctan2(-line[:,2],line[:,0]))
        # El controlador orienta la raíz. Se conserva el giro de la cadera en cada pisada.
        if mode=='lateral': angles=np.full(len(q),np.arctan2(4.36,-1.28))
        else: angles=np.linspace(angles[0],angles[-1],len(q))
        if mode=='arco': angles-=.13
        adjust=Rotation.from_rotvec(np.c_[np.zeros(len(q)),-angles,np.zeros(len(q))])
        q[:,0]=(adjust*Rotation.from_quat(q[:,0])).as_quat()
        centered=pos-pos[:,0:1]
        pos=np.einsum('fij,fbj->fbi',adjust.as_matrix(),centered)+pos[:,0:1]
    # Canales planos obtenidos de la anatomía capturada para el modo Pixi.
    chans=[]
    for side in ('l','r'):
        joint=lambda s:pos[:,names.index(s+'_'+side)]
        forward=lambda d:np.arctan2(d[:,2],-d[:,1])
        thigh=forward(joint('calf')-joint('thigh'))
        shin=forward(joint('foot')-joint('calf'))
        arm=forward(joint('lowerarm')-joint('upperarm'))
        fore=forward(joint('hand')-joint('lowerarm'))
        bend=lambda v:np.clip(np.abs(np.arctan2(np.sin(v),np.cos(v))),0,2.7)
        sole=joint('ball')-joint('foot')
        chans.extend([thigh,bend(thigh-shin),-np.arctan2(sole[:,1],np.maximum(.005,sole[:,2]))-.28,
                      np.zeros(len(q)), -arm,-bend(fore-arm)])
    planar=np.column_stack(chans)
    height=(pos[:,0,1]/hip)-1
    # El uprock regresa a su origen. El actor conserva su posición de red,
    # mientras la pelvis recorre la pista entre apoyos dentro de su baldosa.
    shift=(pos[:,0,[0,2]]-pos[0,0,[0,2]])/hip if id=='uprock' else np.zeros((len(q),2))
    if mode=='alternar':
        opposite=q[:,mirror]*[1,-1,-1,1]
        q=np.concatenate([q,opposite]); height=np.tile(height,2)
        planar=np.concatenate([planar,planar[:,[6,7,8,9,10,11,0,1,2,3,4,5]]])
        # Une también el empalme interno de los dos medios pasos.
        mid=len(q)//2
        for k in range(3):
            u=(k+1)/4
            q[mid+k]=blend(q[mid-1],q[mid+k],u)
            planar[mid+k]=planar[mid-1]*(1-u)+planar[mid+k]*u
            height[mid+k]=height[mid-1]*(1-u)+height[mid+k]*u
    if mode=='suave': # La guardia oscila entre dos posturas con ambos puños recogidos.
        q=np.concatenate([q,q[-2::-1]]);planar=np.concatenate([planar,planar[-2::-1]]);height=np.r_[height,height[-2::-1]]
    loop=mode in ('loop','recto','arco','alternar','paso','suave')
    if loop:
        count=min(5,len(q)//4)
        for j in range(count):
            i=len(q)-count+j;u=(j+1)/count;u=u*u*(3-2*u)
            q[i]=blend(q[i],q[0],u);height[i]+=u*(height[0]-height[i]);planar[i]+=u*(planar[0]-planar[i])
    if id in ('andar','trotar','correr','curva','herido','fusil'):
        # Mismo pie adelantado al comienzo de todos los ciclos. Mantiene el apoyo
        # al pasar de marcha a carrera sin invertir de golpe las rodillas.
        lead=pos[:-1,names.index('foot_l'),2]-pos[:-1,names.index('foot_r'),2]
        key=int(np.argmax(lead))
        def align(values):
            rolled=np.roll(values[:-1],-key,axis=0)
            return np.concatenate([rolled,rolled[:1]])
        q=align(q);height=align(height);planar=align(planar)
    if len(shift)!=len(q):shift=np.zeros((len(q),2))
    frame=np.column_stack([q.reshape(len(q),-1),np.clip(height,-1.9,1.9)/2,np.clip(shift,-1.9,1.9)/2,np.clip(planar,-np.pi,np.pi)/np.pi])
    manifest['clips'][id]={'frame':len(payload)//(2*manifest['stride']),'count':len(q),'loop':loop}
    payload.extend(np.rint(frame*32767).astype('<i2').tobytes())
header=json.dumps(manifest,separators=(',',':')).encode();header+=b' '*((-len(header))%4)
target.write_bytes(b'VTM1'+struct.pack('<I',len(header))+header+payload)
print(len(cuts),'segmentos',len({f for _,f,*_ in cuts}),'animaciones de origen',target.stat().st_size,'bytes')
