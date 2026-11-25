import { Color, ShaderMaterial, UniformsLib, UniformsUtils, Vector3 } from 'three'

import { SKY_THEMES } from '../../palette'

/**
 * The Tropical Island's water material (tropicGeometry.js buildWater): one shader for the
 * lagoons, the waterfall and the lava streams, picked per vertex by `aWater.x` -
 * 0 lagoon: the vertex colour (pale turquoise over sand, deep blue in the middle) with a
 * gentle ripple, sparkles and the sun's glitter; 1 waterfall: foam streaks pouring down
 * (`aWater.z`, metres down the fall); 2 lava: bright molten rock flowing down the stream
 * (`aWater.z` along it, `aWater.y` across) with a dark crust at the edges. Unlit (it reads
 * as bright midday water), fogged like everything else, opaque. One draw call for all of it.
 */

const vertex = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  attribute vec3 aWater;
  varying vec3 vColor;
  varying vec3 vWater;
  varying vec3 vWorld;
  void main() {
    vColor = color;
    vWater = aWater;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

const fragment = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uCam;
  varying vec3 vColor;
  varying vec3 vWater;
  varying vec3 vWorld;
  float hashW(float n) { return fract(sin(n * 91.7) * 43758.5453); }
  void main() {
    int kind = int(vWater.x + 0.5);
    vec3 col = vColor;
    if (kind == 0) {
      vec2 p = vWorld.xz;
      float w = sin(p.x * 0.21 + uTime * 1.1) + sin(p.y * 0.17 - uTime * 0.9) + sin((p.x + p.y) * 0.11 + uTime * 0.6);
      col *= 0.95 + 0.05 * w / 3.0;
      float sp = smoothstep(2.55, 2.95, w + sin(p.x * 1.3 + uTime * 2.2) * 0.35 + sin(p.y * 1.1 - uTime * 1.7) * 0.35);
      col = mix(col, vec3(1.0), sp * 0.4);
      // The sun's glitter off the ripples (as the sea's).
      float sx = cos(p.x * 0.21 + uTime * 1.1) * 0.21 + cos((p.x + p.y) * 0.11 + uTime * 0.6) * 0.11 + sin(p.x * 1.4 + p.y * 0.5 + uTime * 2.1) * 0.2;
      float sz = -cos(p.y * 0.17 - uTime * 0.9) * 0.17 + cos((p.x + p.y) * 0.11 + uTime * 0.6) * 0.11 + sin(p.y * 1.6 - p.x * 0.5 - uTime * 1.8) * 0.2;
      vec3 n = normalize(vec3(-sx, 1.0, -sz));
      vec3 r = reflect(normalize(vWorld - uCam), n);
      float g = pow(max(dot(r, uSunDir), 0.0), 120.0);
      col += vec3(1.0) * g * 1.3;
    } else if (kind == 1) {
      float lane = floor(vWater.y * 1.4);
      float streak = fract(vWater.z * 0.09 - uTime * 1.7 + hashW(lane) * 7.0);
      float s = smoothstep(0.0, 0.2, streak) * smoothstep(1.0, 0.55, streak);
      col = mix(vec3(0.62, 0.9, 0.97), vec3(1.0), 0.25 + s * 0.75);
    } else {
      float edge = abs(vWater.y);
      float n = sin(vWater.z * 0.35 - uTime * 1.4 + vWater.y * 2.0) * 0.5 + 0.5;
      vec3 hot = vec3(1.0, 0.85, 0.35);
      vec3 lava = vec3(1.0, 0.42, 0.08);
      vec3 crust = vec3(0.22, 0.1, 0.07);
      col = mix(lava, hot, n * (1.0 - edge));
      float plate = step(0.82, fract(vWater.z * 0.08 - uTime * 0.18 + n * 0.15));
      col = mix(col, crust, smoothstep(0.55, 1.0, edge) * 0.8 + plate * 0.45);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

let material = null

/** The shared water material (created on first use; `disposeTropicWater` frees it). */
export function getTropicWaterMaterial() {
  if (material) return material
  const sun = new Vector3(...SKY_THEMES.tropic.sunDir).normalize()
  material = new ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    vertexColors: true,
    uniforms: UniformsUtils.merge([UniformsLib.fog, { uTime: { value: 0 }, uSunDir: { value: sun }, uCam: { value: new Vector3() } }]),
    fog: true,
  })
  material.name = 'tropic-water'
  return material
}

/** Advances the ripples, falls and lava; `camera` for the glitter. No allocation. */
export function tickTropicWater(time, camera) {
  if (!material) return
  material.uniforms.uTime.value = time
  material.uniforms.uCam.value.copy(camera.position)
}

export function disposeTropicWater() {
  material?.dispose()
  material = null
}

// ---- The far volcano (drawn inside the far plane, behind everything, when the real one is out of view) ----

const farVertex = /* glsl */ `
  varying vec3 vColor;
  varying vec3 vNormal;
  varying float vGlow;
  attribute vec2 aPattern;
  void main() {
    vColor = color;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vGlow = step(4.5, aPattern.x) * step(aPattern.x, 5.5);
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`
const farFragment = /* glsl */ `
  uniform vec3 uHaze;
  uniform float uAmount;
  uniform vec3 uSunDir;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying float vGlow;
  void main() {
    vec3 lit = vColor * (0.6 + 0.5 * max(dot(normalize(vNormal), uSunDir), 0.0));
    vec3 col = mix(lit, vColor * 1.2, vGlow);
    col = mix(col, uHaze, uAmount * (1.0 - vGlow * 0.6));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

/**
 * The far volcano's material: lit simply by the tropic sun, hazed towards `uHaze` (the fog
 * colour, copied each frame) by `uAmount`; no depth test or write and drawn just after the
 * sky, so it sits on the horizon behind everything else.
 */
export function createVolcanoFarMaterial() {
  const m = new ShaderMaterial({
    vertexShader: farVertex,
    fragmentShader: farFragment,
    vertexColors: true,
    uniforms: { uHaze: { value: new Color() }, uAmount: { value: 0.45 }, uSunDir: { value: new Vector3(...SKY_THEMES.tropic.sunDir).normalize() } },
    depthTest: false,
    depthWrite: false,
    fog: false,
  })
  m.name = 'tropic-volcano-far'
  return m
}
