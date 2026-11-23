import { stepWithCollision, type ZoneGrid } from './zonegrid.js';

export interface CarTuning {
  acceleration: number; // losetas/s²
  braking: number; // losetas/s²
  handling: number; // agarre de 0 a 100
}
export interface CarMotion { speed: number; heading: number }

export function stepCar(grid: ZoneGrid, x: number, y: number, motion: CarMotion,
  dx: number, dy: number, maxSpeed: number, tuning: CarTuning, dt: number) {
  const throttle = dx !== 0 || dy !== 0;
  const previous = Math.min(motion.speed, maxSpeed);
  let speed = Math.max(0, previous - tuning.braking * dt);
  let heading = motion.heading;
  if (throttle) {
    const target = Math.atan2(dy, dx);
    const diff = target - heading;
    const delta = Math.atan2(Math.sin(diff), Math.cos(diff));
    const traction = tuning.handling / 100;
    const turn = (2.6 + 6 * traction) * (1 - .58 * previous / Math.max(maxSpeed, 1)) * dt;
    heading = previous < .2 ? target : heading + Math.max(-turn, Math.min(turn, delta));
    speed = Math.abs(delta) > .8 && previous > .2 ? speed : Math.min(maxSpeed, previous + tuning.acceleration * dt);
  }
  const distance = (previous + speed) * dt * .5;
  const next = stepWithCollision(grid, x, y, Math.cos(heading) * distance, Math.sin(heading) * distance);
  if (Math.hypot(next.x - x, next.y - y) + .001 < distance * .8) speed = 0;
  return { ...next, speed, heading };
}
