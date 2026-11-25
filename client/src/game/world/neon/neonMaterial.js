import { MeshLambertMaterial } from 'three'

/**
 * The Neon Night City scenery material: Lambert with vertex colours (like the shared world
 * material, render/worldMaterial.js) and its own night-time patterns, picked per vertex by
 * the `aPattern` attribute (x = pattern id, y = a coordinate along the surface in metres;
 * render/meshBuilder.js writes both). No textures: zero texture memory, one program for
 * every neon building, the city grid and the set pieces.
 */
export const NEON_PATTERN = {
  /** Lit by the scene's (moon)light. */
  PLAIN: 0,
  /** Self-lit (neon strips, signs' frames, lamps). */
  GLOW: 5,
  /** Self-lit, pulsing in a ripple that runs upwards. */
  PULSE: 8,
  /**
   * Night facade: a grid of windows along the wall (y = metres along it), about a third of
   * them lit warm / cool / now and then neon, the rest dark glass; vertex colour = the wall.
   */
  WINDOWS: 20,
  /** LED curtain wall: dark glass with bands of the vertex colour sweeping up it. */
  LED: 21,
  /** The city grid far below: dark blocks, streets every 64 m with traffic light trails. */
  STREETS: 22,
  /** Neon chase: self-lit dashes running along y. */
  CHASE: 23,
}

const VERTEX_COMMON = `#include <common>
attribute vec2 aPattern;
varying vec2 vPattern;
varying vec3 vWorldPos;`

const VERTEX_BEGIN = `#include <begin_vertex>
vPattern = aPattern;
vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`

const FRAGMENT_COMMON = `#include <common>
uniform float uTime;
varying vec2 vPattern;
varying vec3 vWorldPos;
float nh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`

// Each pattern sets the surface colour and, for what glows, `emis` (colour) and `lit`
// (0-1): the light it gives off replaces the lit result by that much.
const FRAGMENT_COLOR = `#include <color_fragment>
int pat = int(vPattern.x + 0.5);
vec3 emis = vec3(0.0);
float lit = 0.0;
if (pat == 5 || pat == 8) {
  emis = diffuseColor.rgb;
  lit = 1.0;
  if (pat == 8) emis *= 0.65 + 0.45 * sin(uTime * 4.0 - vWorldPos.y * 0.35);
} else if (pat == 20) {
  vec2 g = vec2(vPattern.y / 3.2, vWorldPos.y / 3.6);
  vec2 cell = floor(g);
  vec2 w = fract(g);
  float win = step(0.18, w.x) * step(w.x, 0.82) * step(0.22, w.y) * step(w.y, 0.84);
  float r = nh(cell + floor(vWorldPos.xz / 97.0) * 7.31);
  // A few windows switch on and off over time.
  float r2 = nh(cell * 1.7 + floor(uTime * 0.07 + r * 9.0));
  float on = step(0.66, r) * step(0.06, r2);
  vec3 warm = vec3(1.0, 0.78, 0.48);
  vec3 cool = vec3(0.62, 0.86, 1.0);
  vec3 neon = mix(vec3(1.0, 0.3, 0.9), vec3(0.25, 0.95, 1.0), step(0.5, fract(r * 13.0)));
  vec3 lamp = r > 0.95 ? neon : (fract(r * 31.0) > 0.45 ? warm : cool);
  vec3 glass = vec3(0.05, 0.07, 0.13) + vec3(0.04, 0.05, 0.1) * w.y;
  diffuseColor.rgb = mix(diffuseColor.rgb, glass, win);
  emis = lamp * (0.75 + 0.35 * fract(r * 57.0));
  lit = win * on;
} else if (pat == 21) {
  vec2 g = vec2(vPattern.y / 2.4, vWorldPos.y / 3.0);
  float mull = max(step(fract(g.x), 0.08), step(fract(g.y), 0.1));
  float band = pow(0.5 + 0.5 * sin(vWorldPos.y * 0.09 - uTime * 1.3 + vPattern.y * 0.05), 6.0);
  float spark = step(0.985, nh(floor(g) + floor(uTime * 2.0)));
  diffuseColor.rgb = mix(vec3(0.04, 0.05, 0.1), vec3(0.12, 0.13, 0.2), mull);
  emis = vColor.rgb * (0.12 + 0.9 * band) + vec3(spark * 0.6);
  lit = 1.0 - mull * 0.8;
} else if (pat == 22) {
  vec2 q = vWorldPos.xz / 64.0;
  vec2 f = fract(q);
  // street.x: a street running along z (an x band), street.y: one along x.
  vec2 street = step(f, vec2(14.0 / 64.0));
  float onStreet = max(street.x, street.y);
  // Traffic: white heads along x, red tails along z, staggered per street.
  float a = step(0.82, fract(vWorldPos.x / 23.0 - uTime * 0.9 + floor(q.y) * 0.37)) * street.y * (1.0 - street.x);
  float b = step(0.86, fract(vWorldPos.z / 19.0 + uTime * 0.8 + floor(q.x) * 0.53)) * street.x * (1.0 - street.y);
  // Tiny lit specks on the blocks (windows seen from far above), and the centre lines.
  float speck = step(0.93, nh(floor(vWorldPos.xz / 4.0))) * (1.0 - onStreet) * 0.6;
  float line = (step(abs(f.x * 64.0 - 7.0), 0.25) * street.x + step(abs(f.y * 64.0 - 7.0), 0.25) * street.y) * 0.5;
  diffuseColor.rgb = mix(vec3(0.035, 0.035, 0.07), vec3(0.06, 0.06, 0.1), onStreet);
  lit = clamp(a + b + speck + line, 0.0, 1.0);
  emis = (vec3(1.0, 0.85, 0.6) * a + vec3(1.0, 0.18, 0.25) * b + vec3(0.9, 0.6, 1.0) * speck + vec3(0.25, 0.7, 1.0) * line) / max(lit, 0.001);
} else if (pat == 23) {
  float c = step(0.5, fract(vPattern.y / 3.0 - uTime * 1.8));
  emis = diffuseColor.rgb * (0.35 + 0.85 * c);
  lit = 1.0;
}`

const FRAGMENT_OUT = `outgoingLight = mix(outgoingLight, emis, lit);
#include <opaque_fragment>`

let shared = null

/** The neon scenery material (create once; shared by every neon scenery mesh). */
export function getNeonMaterial() {
  if (shared) return shared
  const material = new MeshLambertMaterial({ vertexColors: true })
  material.userData.uniforms = { uTime: { value: 0 } }
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, material.userData.uniforms)
    shader.vertexShader = shader.vertexShader.replace('#include <common>', VERTEX_COMMON).replace('#include <begin_vertex>', VERTEX_BEGIN)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', FRAGMENT_COMMON)
      .replace('#include <color_fragment>', FRAGMENT_COLOR)
      .replace('#include <opaque_fragment>', FRAGMENT_OUT)
  }
  material.customProgramCacheKey = () => 'uwd-neon'
  shared = material
  return material
}

/** Advances the animated patterns. Call once per frame (outside React state). */
export function tickNeonMaterial(time) {
  if (shared) shared.userData.uniforms.uTime.value = time
}

/** Frees the material (the scenery unmounts: travelling to another map). */
export function disposeNeonMaterial() {
  shared?.dispose()
  shared = null
}
