import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { carProfile, type CarDef } from '@vertice/shared';

type CarModel = NonNullable<CarDef['model']>;
interface VehicleEntity {
  x: number; y: number;
  s: { id: number; facing?: number; vehicle?: string | null };
  vehicleHover?: boolean;
  vehicleModel?: CarModel;
  view?: { visible: boolean };
  /** v0.45 · Clase y coche (para su balanceo) y estado de la física: rumbo, deriva, aceleraciones y bits de freno. */
  vehicleClass?: string; vehicleId?: string;
  car?: { heading: number; slip: number; flags: number; at: number; latA?: number; lonA?: number; speed?: number; own?: boolean };
}
interface Rig {
  group: THREE.Group;
  chassis: THREE.Group;
  tail?: THREE.MeshStandardMaterial;
  model: CarModel;
  yaw: number; preferredYaw: number; speed: number; x: number; y: number;
  /** v0.45 · Balanceo y cabeceo de la carrocería (muelle con amortiguación: se nota el peso). */
  roll: number; rollV: number; pitch: number; pitchV: number; yawRate: number; rollK: number; pitchK: number; markAt: number; smokeAt: number;
}

// v0.45 · Marcas de neumático en el asfalto (se reutilizan las más viejas) y humo de rueda.
const MARKS = 900;
const markGeo = new THREE.PlaneGeometry(0.17, 0.42); markGeo.rotateX(-Math.PI / 2);
const markMat = new THREE.MeshBasicMaterial({ color: 0x07080b, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
let smokeTex: THREE.Texture | null = null;
function puffTexture() {
  if (smokeTex) return smokeTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!; const r = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  r.addColorStop(0, 'rgba(235,235,240,0.75)'); r.addColorStop(1, 'rgba(235,235,240,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  smokeTex = new THREE.CanvasTexture(c); return smokeTex;
}

const templates = new Map<CarModel, THREE.Group>();
const requested = new Set<CarModel>();

const shade = new THREE.CircleGeometry(1, 20);
shade.rotateX(-Math.PI / 2);
const shadeMaterial = new THREE.MeshBasicMaterial({ color: 0x060912, opacity: .3, transparent: true, depthWrite: false });

function requestModel(model: CarModel) {
  if (requested.has(model)) return;
  requested.add(model);
  new GLTFLoader().loadAsync('/models/vehiculos/' + model + '.glb').then(glb => {
    templates.set(model, glb.scene);
  }).catch(error => console.warn('[modelo de vehículo]', error));
}

export class Vehicles3D {
  readonly world = new THREE.Group();
  private models = new Map<number, Rig>();

  isReady(model: CarModel) { return templates.has(model); }

  private create(model: CarModel, template: THREE.Group, x: number, y: number, yaw: number) {
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
    return { group, chassis: car, tail, model, x, y, yaw, preferredYaw: yaw, speed: 0, roll: 0, rollV: 0, pitch: 0, pitchV: 0, yawRate: 0, rollK: 1, pitchK: 1, markAt: 0, smokeAt: 0 };
  }
  // ---------------------------------------------------------------- v0.45 · marcas y humo
  private marks: THREE.InstancedMesh | null = null;
  private markN = 0;
  private puffs: { s: THREE.Sprite; t: number; vx: number; vz: number }[] = [];
  private mark(x: number, z: number, yaw: number) {
    if (!this.marks) { this.marks = new THREE.InstancedMesh(markGeo, markMat, MARKS); this.marks.count = 0; this.marks.frustumCulled = false; this.world.add(this.marks); }
    const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0.012, z);
    this.marks.setMatrixAt(this.markN % MARKS, m);
    this.markN++; this.marks.count = Math.min(MARKS, this.markN);
    this.marks.instanceMatrix.needsUpdate = true;
  }
  private puff(x: number, z: number, vx: number, vz: number) {
    if (this.puffs.length > 70) { const old = this.puffs.shift()!; this.world.remove(old.s); old.s.material.dispose(); }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture(), transparent: true, depthWrite: false, opacity: 0.55 }));
    s.position.set(x, 0.25, z); s.scale.setScalar(0.5);
    this.world.add(s); this.puffs.push({ s, t: 0, vx, vz });
  }
  private tickPuffs(dt: number) {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i]; p.t += dt;
      p.s.position.x += p.vx * dt; p.s.position.z += p.vz * dt; p.s.position.y += dt * 0.55;
      p.s.scale.setScalar(0.5 + p.t * 2.2); (p.s.material as THREE.SpriteMaterial).opacity = Math.max(0, 0.55 * (1 - p.t / 1.6));
      if (p.t > 1.6) { this.world.remove(p.s); p.s.material.dispose(); this.puffs.splice(i, 1); }
    }
  }
  /** Posición del coche de una entidad (para la cámara de persecución). */
  groupOf(id: number) { return this.models.get(id)?.group; }

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
        rig = this.create(model, template, e.x, e.y, Math.PI / 2 - (e.s.facing ?? 0) * Math.PI / 4);
        this.models.set(id, rig);
      }
      const dx = e.x - rig.x, dy = e.y - rig.y, distance = Math.hypot(dx, dy);
      const nextSpeed = distance < 2 ? distance / dt : 0;
      const car = e.car && now - e.car.at < 700 ? e.car : undefined;
      if (car) rig.preferredYaw = Math.PI / 2 - car.heading; // rumbo real (con derrape el morro no apunta a donde va)
      else if (distance > .003 && distance < 2) rig.preferredYaw = Math.atan2(dx, dy);
      const yawBefore = rig.yaw;
      const angle = rig.preferredYaw - rig.yaw;
      rig.yaw += Math.atan2(Math.sin(angle), Math.cos(angle)) * (car?.own ? 1 : Math.min(1, dt * 11));
      const dYaw = Math.atan2(Math.sin(rig.yaw - yawBefore), Math.cos(rig.yaw - yawBefore));
      rig.yawRate += (dYaw / dt - rig.yawRate) * Math.min(1, dt * 8);
      const prevSpeed = rig.speed;
      rig.speed += (nextSpeed - rig.speed) * Math.min(1, dt * 7);
      const braking = car ? (car.flags & 1) !== 0 : rig.speed - nextSpeed > .85;
      // Balanceo y cabeceo con muelle y amortiguador: al frenar el morro se hunde, al acelerar se agacha la cola y en curva
      // la carrocería se inclina hacia fuera (una moto se inclina hacia dentro). Los pesados y blandos se mueven más.
      if (e.vehicleClass) { const pr = carProfile({ class: e.vehicleClass, id: e.vehicleId }); rig.rollK = pr.roll; rig.pitchK = pr.pitch; }
      const latA = car?.latA ?? rig.speed * rig.yawRate;
      const lonA = car?.lonA ?? (rig.speed - prevSpeed) / dt;
      const rollT = reduceMotion ? 0 : THREE.MathUtils.clamp(latA * 0.016 * rig.rollK, -0.16, 0.16) * (rig.rollK < 0 ? -2.2 : 1);
      const pitchT = reduceMotion ? 0 : THREE.MathUtils.clamp(-lonA * 0.011 * rig.pitchK, -0.07, 0.08);
      rig.rollV += ((rollT - rig.roll) * 70 - rig.rollV * 9) * dt; rig.roll += rig.rollV * dt;
      rig.pitchV += ((pitchT - rig.pitch) * 80 - rig.pitchV * 10) * dt; rig.pitch += rig.pitchV * dt;
      rig.chassis.rotation.set(rig.pitch, 0, rig.roll);
      rig.chassis.position.y = (e.vehicleHover ? .13 + (reduceMotion ? 0 : Math.sin(now * .0035 + id) * .023) : 0) + Math.abs(rig.roll) * 0.25;
      rig.group.position.set(e.x, 0, e.y);
      rig.group.rotation.y = rig.yaw;
      rig.x = e.x;
      rig.y = e.y;
      if (rig.tail) rig.tail.emissiveIntensity += ((braking ? 1.9 : .75) - rig.tail.emissiveIntensity) * Math.min(1, dt * 8);
      // Marcas y humo: derrape, freno de mano, ruedas que patinan o frenada fuerte (los vehículos que levitan no dejan marca).
      const slip = Math.abs(car?.slip ?? 0), hb = !!car && (car.flags & 2) !== 0, spin = !!car && (car.flags & 4) !== 0;
      const scrubbing = !e.vehicleHover && rig.speed > 2 && (slip > 0.2 || (hb && rig.speed > 2.5) || spin || (braking && (car?.lonA ?? 0) < -7));
      if (scrubbing && now - rig.markAt > 45) {
        rig.markAt = now;
        const fx = Math.sin(rig.yaw), fz = Math.cos(rig.yaw), rx = -fz, rz = fx, back = 0.95, side = 0.58;
        for (const sd of [-1, 1]) this.mark(e.x - fx * back + rx * side * sd, e.y - fz * back + rz * side * sd, rig.yaw);
        if ((slip > 0.35 || spin || hb) && now - rig.smokeAt > 90 && !reduceMotion) { rig.smokeAt = now; this.puff(e.x - fx * back, e.y - fz * back, -fx * 0.6 + (Math.random() - 0.5), -fz * 0.6 + (Math.random() - 0.5)); }
      }
    }
    this.tickPuffs(dt);
    for (const id of this.models.keys()) if (!seen.has(id)) this.remove(id);
  }

  private remove(id: number) {
    const rig = this.models.get(id);
    if (!rig) return;
    this.world.remove(rig.group);
    rig.tail?.dispose();
    this.models.delete(id);
  }

  /** v0.40 · Tráfico de la calle con los modelos 3D (en las cámaras cercanas; en la cenital van sus dibujos 2D). */
  private traffic = new Map<number, Rig>();
  syncTraffic(cars: readonly { uid: number; x: number; y: number; yaw: number; alpha: number; model: CarModel; hover: boolean }[], now: number) {
    const seen = new Set<number>();
    for (const c of cars) {
      const template = templates.get(c.model);
      if (!template) { requestModel(c.model); continue; }
      seen.add(c.uid);
      let rig = this.traffic.get(c.uid);
      if (rig && rig.model !== c.model) { this.dropTraffic(c.uid); rig = undefined; }
      if (!rig) { rig = this.create(c.model, template, c.x, c.y, c.yaw); this.traffic.set(c.uid, rig); }
      rig.group.position.set(c.x, 0, c.y);
      rig.group.rotation.y = c.yaw;
      // Entra y se va escalando un poco (los modelos son opacos: sin transparencias que cuesten).
      rig.group.scale.setScalar(0.6 + 0.4 * Math.min(1, c.alpha));
      rig.chassis.position.y = c.hover ? .13 + Math.sin(now * .0035 + c.uid) * .023 : 0;
    }
    for (const id of [...this.traffic.keys()]) if (!seen.has(id)) this.dropTraffic(id);
  }
  private dropTraffic(id: number) { const rig = this.traffic.get(id); if (!rig) return; this.world.remove(rig.group); rig.tail?.dispose(); this.traffic.delete(id); }

  clear() { for (const id of this.models.keys()) this.remove(id); for (const id of [...this.traffic.keys()]) this.dropTraffic(id); }
}
