import { CircleGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry, Vector3 } from 'three';
import type { Human } from './human3d';

const edge=new RingGeometry(.266,.282,6), face=new CircleGeometry(.266,6);
const border=new MeshBasicMaterial({color:0x79ede5,side:DoubleSide,transparent:true,opacity:.88,depthWrite:false});
const glass=new MeshBasicMaterial({color:0x3bbcb7,side:DoubleSide,transparent:true,opacity:.23,depthWrite:false});
const hand=new Vector3();
export function kineticShield(human: Human) {
  const field=new Group();
  field.add(new Mesh(face,glass),new Mesh(edge,border));
  field.scale.set(.85,1.13,1);
  field.rotation.x=-.16;
  human.root.add(field);
  return field;
}
export function placeShield(field:Group,human:Human,armed:boolean) {
  const joint=human.bones.get(armed?'hand_r':'hand_l');
  if(!joint)return;
  joint.updateWorldMatrix(true,false);
  human.root.worldToLocal(hand.setFromMatrixPosition(joint.matrixWorld));
  field.position.copy(hand);
  field.position.z+=.11;
}
