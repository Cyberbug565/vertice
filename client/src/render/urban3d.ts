import * as THREE from 'three';
import { hashString, seededRng } from '@vertice/shared';
import { FACADES, urbanPoint, type UrbanBuilding, type UrbanForm, type UrbanLook } from './urban-form';
import { NeonBuilder, neonNight } from './neon3d';

const forms = new WeakMap<UrbanForm, THREE.BufferGeometry>();

export function urbanGeometry(form: UrbanForm): THREE.BufferGeometry {
  const cached = forms.get(form);
  if (cached) return cached;
  const points = new Float32Array(form.faces.length * 3);
  form.faces.forEach((index, i) => {
    const offset = index * 3;
    points.set(form.points.slice(offset, offset + 3), i * 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(points, 3));
  geometry.computeVertexNormals();
  forms.set(form, geometry);
  return geometry;
}

export function urbanFacade(kind: UrbanLook['facade'], ghost = false): THREE.MeshStandardMaterial {
  const style = FACADES[kind];
  const material = new THREE.MeshStandardMaterial({
    roughness: style.rough, metalness: style.metal,
    transparent: ghost, opacity: ghost ? 0.2 : 1,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.urbanNight = neonNight;
    shader.uniforms.urbanGlass = { value: new THREE.Color(style.glass) };
    shader.uniforms.urbanLit = { value: new THREE.Color(style.lit) };
    shader.uniforms.urbanPitch = { value: new THREE.Vector4(...style.pitch) };
    shader.uniforms.urbanWear = { value: style.wear };
    shader.uniforms.urbanOccupancy = { value: style.occupancy };
    shader.vertexShader = `
varying vec3 urbanWorld;
varying vec3 urbanNormal;
` + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  urbanWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  urbanNormal = normalize(mat3(instanceMatrix) * normal);
#else
  urbanWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  urbanNormal = normal;
#endif`);
    shader.fragmentShader = `
varying vec3 urbanWorld;
varying vec3 urbanNormal;
uniform vec3 urbanGlass;
uniform vec3 urbanLit;
uniform vec4 urbanPitch;
uniform float urbanNight;
uniform float urbanWear;
uniform float urbanOccupancy;
float urbanHash(vec3 p) { return fract(sin(dot(p, vec3(70.31,17.91,46.74))) * 44317.1); }
` + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
vec3 un = normalize(urbanNormal);
vec2 tanXZ = vec2(un.z, -un.x) / max(0.01, length(un.xz));
vec2 facadeUV = vec2(dot(urbanWorld.xz, tanXZ) / urbanPitch.x, urbanWorld.y / urbanPitch.y);
vec2 centre = abs(fract(facadeUV) - 0.5);
vec2 soft = max(fwidth(facadeUV), vec2(0.013));
vec2 panes = 1.0 - smoothstep(urbanPitch.zw * 0.5 - soft, urbanPitch.zw * 0.5 + soft, centre);
float wall = 1.0 - smoothstep(0.13, 0.44, abs(un.y));
float litThreshold = urbanHash(vec3(floor(facadeUV), floor(dot(urbanWorld.xz, un.xz) * 1.5)));
float rust = urbanHash(floor(urbanWorld * vec3(2.8, 4.0, 2.8)));
float stains = urbanHash(floor(urbanWorld * vec3(0.73, 0.54, 0.73)));
float dirty = urbanWear * (0.23 * rust + 0.33 * stains + 0.14 * (1.0 - smoothstep(0.1, 2.2, urbanWorld.y)));
float glass = panes.x * panes.y * wall * smoothstep(0.28, 0.52, urbanWorld.y);
glass *= 1.0 - urbanWear * step(0.70, litThreshold) * 0.75;
float seam = 1.0 - smoothstep(0.0, 0.09, abs(fract(facadeUV.y) - 0.05));
vec3 tile = diffuseColor.rgb * (0.76 + 0.24 * wall + 0.24 * (1.0 - wall));
tile *= 1.0 - dirty - seam * wall * (0.08 + urbanWear * 0.12);
vec3 tint = urbanGlass * (0.48 + 0.72 * litThreshold) * (1.0 - dirty);
diffuseColor.rgb = mix(tile, tint, glass * 0.94);
`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float lamp = step(1.0 - urbanOccupancy, litThreshold);
totalEmissiveRadiance += glass * lamp * urbanNight * (1.0 - dirty) * urbanLit * 0.64;
`);
  };
  material.customProgramCacheKey = () => 'vertice-nueva-york-1';
  return material;
}

export function urbanTransform(b: UrbanBuilding, height: number) {
  const [x, y, width, depth] = b.rect;
  const turn = b.urban!.turn;
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn * Math.PI / 2);
  const w = 0.99 * width, d = 0.99 * depth;
  const scale = turn % 2 === 0 ? new THREE.Vector3(w, height, d) : new THREE.Vector3(d, height, w);
  return new THREE.Matrix4().compose(new THREE.Vector3(x + width / 2, 0, y + depth / 2), q, scale);
}

export function urbanLighting(neon: NeonBuilder, b: UrbanBuilding, form: UrbanForm, height: number, index: number) {
  const kind = b.urban!.facade;
  const rnd = seededRng(hashString(b.id));
  const rough = kind === 'ruina' || kind === 'industrial';
  if (kind === 'ruina' && rnd() < 0.75) return;
  const signage = b.signColor ?? FACADES[kind].led;
  const color = new THREE.Color(signage).multiplyScalar(kind === 'ruina' ? 0.62 : 1.27);
  const roof = form.cornices.slice(0, kind === 'corporativa' ? 12 : kind === 'comercial' ? 8 : rough ? 1 : 6);
  const placed = { ...b, height };
  for (const edge of roof) {
    const line = edge.map(i => new THREE.Vector3(...urbanPoint(placed, form, i)).add(new THREE.Vector3(0, 0.045, 0)));
    if (line[0].distanceTo(line[1]) < 0.28) continue;
    neon.tube(line, { color, b: index, ph: rnd() * 0.35, r: rough ? 0.035 : 0.062 });
  }
  if (kind === 'corporativa' || kind === 'comercial') {
    for (const edge of form.fins.slice(0, kind === 'corporativa' ? 3 : 2)) {
      const [a, c] = edge.map(i => new THREE.Vector3(...urbanPoint(placed, form, i)));
      const [x, y, w, h] = b.rect;
      const away = new THREE.Vector3(a.x + c.x - 2 * x - w, 0, a.z + c.z - 2 * y - h).normalize();
      const start = a.clone().lerp(c, 0.06).addScaledVector(away, 0.065);
      const end = c.clone().lerp(a, 0.06).addScaledVector(away, 0.065);
      neon.tube([start, end], { color, b: index, ph: rnd() * 0.35, r: 0.057, halo: 3.4 });
    }
  }
}
