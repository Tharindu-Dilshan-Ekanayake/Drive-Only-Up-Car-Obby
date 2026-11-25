import { Color, MeshPhongMaterial } from 'three'

import { applyPatterns, getWorldMaterial } from '../render/worldMaterial'

/**
 * Car paint: glossy Phong with the world's pattern system (lamps glow, hazard bars
 * stripe), plus a cheap clear-coat - a sky/sea reflection that grows towards grazing
 * angles (Fresnel) - so bodies read as shiny toy cars instead of matte clay. No
 * environment map, no textures; one extra shader program shared by every car body and
 * the wheels. Self-lit parts (GLOW / PULSE, lamps, siren lenses) skip the reflection.
 */

let shared = null

export function getCarMaterial() {
  if (shared) return shared
  const material = new MeshPhongMaterial({ vertexColors: true, shininess: 70, specular: new Color('#5a5a5a') })
  // The world material's uniforms: one clock for every animated pattern.
  const uniforms = {
    ...getWorldMaterial().userData.uniforms,
    uSkyTop: { value: carSky.top },
    uSkyLow: { value: carSky.low },
    uCoat: { value: 0.42 },
  }
  material.onBeforeCompile = (shader) => {
    applyPatterns(shader, uniforms)
    // Instance colour tints only the bright parts (wheel rims), never the rubber.
    shader.vertexShader = shader.vertexShader.replace(
      '#include <color_vertex>',
      `vColor = vec4(1.0);
#ifdef USE_COLOR
vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
vColor.rgb *= mix(vec3(1.0), instanceColor.rgb, smoothstep(0.12, 0.3, dot(vColor.rgb, vec3(0.2126, 0.7152, 0.0722))));
#endif`,
    )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uSkyTop;
uniform vec3 uSkyLow;
uniform float uCoat;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `if (pat != 5 && pat != 8 && pat != 6 && pat < 17) {
  vec3 vV = normalize(vViewPosition);
  vec3 wN = inverseTransformDirection(normal, viewMatrix);
  vec3 wV = inverseTransformDirection(vV, viewMatrix);
  vec3 wR = reflect(-wV, wN);
  vec3 env = mix(uSkyLow, uSkyTop, smoothstep(-0.25, 0.45, wR.y));
  float fres = pow(1.0 - clamp(dot(normal, vV), 0.0, 1.0), 4.0);
  // Glossy paint; dark trim and rubber stay closer to matte.
  float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  float coat = uCoat * (0.05 + 0.95 * fres) * (0.35 + 0.65 * smoothstep(0.02, 0.25, lum));
  if (pat == 14) {
    // Windows: mostly sky, with a bright diagonal streak.
    coat = 0.32 + 0.6 * fres;
    float streak = smoothstep(0.0, 0.05, fract(vPattern.y * 0.9) - 0.62) * (1.0 - smoothstep(0.0, 0.05, fract(vPattern.y * 0.9) - 0.74));
    outgoingLight += vec3(0.55) * streak;
  }
  outgoingLight = mix(outgoingLight, env, clamp(coat, 0.0, 1.0));
}
#include <opaque_fragment>`,
      )
  }
  material.customProgramCacheKey = () => 'uwd-car'
  shared = material
  return material
}

/** The sky the clear-coat reflects (Environment.jsx applies the current sky theme). */
const carSky = { top: new Color('#bfe6ff'), low: new Color('#5d8f9c') }
export function setCarSky(top, low) {
  carSky.top.set(top)
  carSky.low.set(low)
}

export function disposeCarMaterial() {
  shared?.dispose()
  shared = null
}
