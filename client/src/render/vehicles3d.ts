import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CarDef } from '@vertice/shared';

type CarModel = NonNullable<CarDef['model']>;
interface VehicleEntity {
  x: number; y: number;
  s: { id: number; vehicle?: string | null };
  vehicleModel?: CarModel;
  view?: { visible: boolean };
}
interface Rig {
  group: THREE.Group;
  chassis: THREE.Group;
  tail?: THREE.MeshStandardMaterial;
  model: CarModel;
  yaw: number; preferredYaw: number; speed: number; x: number; y: number;
}

const templates = new Map<CarModel, THREE.Group>();
const requested = new Set<CarModel>();
const paths: Record<CarModel, string> = { vector: '/models/vehiculos/vector.glb' };
const shade = new THREE.CircleGeometry(1, 20);
shade.rotateX(-Math.PI / 2);
const shadeMaterial = new THREE.MeshBasicMaterial({ color: 0x060912, opacity: .3, transparent: true, depthWrite: false });

function requestModel(model: CarModel) {
  if (requested.has(model)) return;
  requested.add(model);
  new GLTFLoader().loadAsync(paths[model]).then(glb => {
    templates.set(model, glb.scene);
  }).catch(error => console.warn('[modelo de vehículo]', error));
}

export class Vehicles3D {
  readonly world = new THREE.Group();
  private models = new Map<number, Rig>();

  isReady(model: CarModel) { return templates.has(model); }

  private create(model: CarModel, template: THREE.Group, x: number, y: number) {
    const group = new THREE.Group();
    const car = template.clone(true);
    const shadow = new THREE.Mesh(shade, shadeMaterial);
    shadow.scale.set(.57, 1, 1.05);
    shadow.position.y = .008;
    group.add(shadow, car);
    const lamp = car.getObjectByName('pilotos') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | undefined;
    const tail = lamp?.material.clone();
    if (lamp && tail) lamp.material = tail;
    this.world.add(group);
    return { group, chassis: car, tail, model, x, y, yaw: Math.PI / 2, preferredYaw: Math.PI / 2, speed: 0 };
  }

  sync(entities: Iterable<VehicleEntity>, now: number, delta: number, reduceMotion: boolean) {
    const dt = Math.max(.001, Math.min(delta, .1));
    const seen = new Set<number>();
    for (const e of entities) {
      const model = e.vehicleModel;
      if (!model || !e.s.vehicle || e.view?.visible === false) continue;
      const template = templates.get(model);
      if (!template) { requestModel(model); continue; }
      const id = e.s.id;
      seen.add(id);
      let rig = this.models.get(id);
      if (!rig || rig.model !== model) {
        this.remove(id);
        rig = this.create(model, template, e.x, e.y);
        this.models.set(id, rig);
      }
      const dx = e.x - rig.x, dy = e.y - rig.y, distance = Math.hypot(dx, dy);
      const nextSpeed = distance < 2 ? distance / dt : 0;
      if (distance > .003 && distance < 2) rig.preferredYaw = Math.atan2(dx, dy);
      const angle = rig.preferredYaw - rig.yaw;
      rig.yaw += Math.atan2(Math.sin(angle), Math.cos(angle)) * Math.min(1, dt * 11);
      const braking = rig.speed - nextSpeed > .85;
      rig.speed += (nextSpeed - rig.speed) * Math.min(1, dt * 7);
      rig.chassis.position.y = reduceMotion ? 0 : Math.sin(now * .0035 + id) * .023;
      rig.group.position.set(e.x, 0, e.y);
      rig.group.rotation.y = rig.yaw;
      rig.x = e.x;
      rig.y = e.y;
      if (rig.tail) rig.tail.emissiveIntensity += ((braking ? 1.9 : .75) - rig.tail.emissiveIntensity) * Math.min(1, dt * 8);
    }
    for (const id of this.models.keys()) if (!seen.has(id)) this.remove(id);
  }

  private remove(id: number) {
    const rig = this.models.get(id);
    if (!rig) return;
    this.world.remove(rig.group);
    rig.tail?.dispose();
    this.models.delete(id);
  }

  clear() { for (const id of this.models.keys()) this.remove(id); }
}
