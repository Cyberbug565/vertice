import { Color, type MeshStandardMaterial } from 'three';

export function applyHairDye(material: MeshStandardMaterial, pattern: string | undefined, tint: string | undefined, crown: number, length: number) {
  const mode = pattern === 'puntas' ? 1 : pattern === 'mechas' ? 2 : pattern === 'raices' ? 3 : 0;
  if (!mode || !tint) return;
  const prior = material.onBeforeCompile.bind(material);
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    prior(shader, renderer);
    Object.assign(shader.uniforms, {
      vtDyeColor: { value: new Color(tint) }, vtDyeMode: { value: mode },
      vtDyeTop: { value: crown }, vtDyeLength: { value: length },
    });
    shader.vertexShader = 'varying vec3 vtHairRest;\n' + shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvtHairRest = position;');
    shader.fragmentShader = `
      varying vec3 vtHairRest;
      uniform vec3 vtDyeColor;
      uniform float vtDyeMode, vtDyeTop, vtDyeLength;
    ` + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float stem = clamp(1.0 - (vtDyeTop - vtHairRest.y) / vtDyeLength, 0.0, 1.0);
      float streak = sin(atan(vtHairRest.x, vtHairRest.z + 0.001) * 13.0 + vtHairRest.y * 9.0);
      float colored = vtDyeMode < 1.5 ? 1.0 - smoothstep(0.24, 0.61, stem)
        : vtDyeMode < 2.5 ? smoothstep(0.34, 0.91, streak) * (0.65 + 0.35 * stem)
        : smoothstep(0.52, 0.94, stem);
      diffuseColor.rgb = mix(diffuseColor.rgb, vtDyeColor * (0.84 + 0.12 * streak), colored * 0.9);
    `);
  };
  material.customProgramCacheKey = () => key + ':tinte';
}
