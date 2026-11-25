import { Color, MeshLambertMaterial } from 'three'

import { night } from '../world/nightLight'

/**
 * The one material every static thing in the world shares (pier, track, gates,
 * scenery, obstacles): Lambert with vertex colours, plus a few procedural patterns
 * picked per vertex by the `aPattern` attribute (x = pattern id, y = a coordinate
 * along the surface in metres). No textures anywhere: zero texture memory, and one
 * shader program for the whole world.
 */
export const PATTERN = {
  PLAIN: 0,
  /** Yellow/black hazard stripes every 1.2 m along y (vertex colour = the yellow). */
  HAZARD: 1,
  /** Asphalt: a little speckle from world position. */
  ASPHALT: 2,
  /** Dashed centre line: visible dashes along y. */
  DASH: 3,
  /** Concrete plaza: 3 m tile grid from world position. */
  TILES: 4,
  /** Self-lit (signs, gate lights, boost pads): ignores lighting. */
  GLOW: 5,
  /** Glowing chevrons scrolling along y (boost pads). */
  CHEVRON: 6,
  /** Windows grid on building walls, from world position. */
  WINDOWS: 7,
  /** Self-lit and pulsing (gate light strips), phase from height so it ripples upwards. */
  PULSE: 8,
  /** Steel grating deck: a diamond mesh from world position. */
  GRATE: 9,
  /** Wooden dock planks running across the road, gaps every 0.7 m along y. */
  PLANKS: 10,
  /** Glass curtain wall: mullion grid, with sky reflections banding down the tower. */
  GLASS: 11,
  /** Building facade: framed windows per floor, some with warm curtains (vertex colour = wall). */
  FACADE: 12,
  /** Awning / chequer stripes: vertex colour alternating with white every 0.8 m along y. */
  STRIPES: 13,
  /** Car windows (car paint only): sky reflection and a highlight streak along y. */
  CARGLASS: 14,
  /** Ice (the Grand Tour's ice patches, frozen lake, icicles): pale streaks and white cracks from world position. */
  ICE: 15,
  /** Snow (snowfields, snow ramps, snowy roofs): a soft two-scale speckle from world position. */
  SNOW: 16,
  /**
   * Car lamps (car paint; cars/carModels.js finishPaint marks them): lit like a lens by day,
   * glowing brighter than GLOW as the night's `uLamps` (world/nightLight.js) comes up.
   */
  HEADLAMP: 17,
  TAILLAMP: 18,
  /** Police light-bar lenses (Heat Run): self-lit, flashing red / blue in turn (sirenOn below). */
  SIREN_RED: 19,
  SIREN_BLUE: 20,
}

/**
 * Whether a police light bar's red (blue = false) or blue lens is lit at shader time `t`
 * (the world material's uTime): a double flash each, red then blue, half a cycle apart. Mirrors
 * the GLSL in applyPatterns, so the fake glows and pools flash with the lenses.
 */
export const SIREN_RATE = 1.6
export function sirenOn(t, blue) {
  const ph = (((t * SIREN_RATE + (blue ? 0.5 : 0)) % 1) + 1) % 1
  return ph <= 0.2 || (ph >= 0.27 && ph <= 0.47)
}

const HAZARD_DARK = new Color('#24282e')

/**
 * Adds the pattern system (aPattern attribute, uTime, hazard colour) to a built-in
 * material's shader - shared by the world material and the car paint (cars/carMaterial.js).
 */
export function applyPatterns(shader, uniforms) {
  Object.assign(shader.uniforms, uniforms)
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
attribute vec2 aPattern;
varying vec2 vPattern;
varying vec3 vWorldPos;`,
    )
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
vPattern = aPattern;
vec4 wp = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
wp = instanceMatrix * wp;
#endif
vWorldPos = (modelMatrix * wp).xyz;`,
    )
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
uniform float uTime;
uniform float uLamps;
uniform vec3 uHazardDark;
varying vec2 vPattern;
varying vec3 vWorldPos;
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`,
    )
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
int pat = int(vPattern.x + 0.5);
if (pat == 1) {
float s = step(0.5, fract(vPattern.y / 2.4));
diffuseColor.rgb = mix(diffuseColor.rgb, uHazardDark, s);
} else if (pat == 2) {
float n = hash2(floor(vWorldPos.xz * 3.0));
diffuseColor.rgb *= 0.93 + 0.1 * n;
} else if (pat == 3) {
if (fract(vPattern.y / 6.0) > 0.55) discard;
} else if (pat == 4) {
vec2 g = abs(fract(vWorldPos.xz / 3.0) - 0.5);
float line = step(0.47, max(g.x, g.y));
diffuseColor.rgb *= 1.0 - 0.13 * line;
} else if (pat == 9) {
vec2 g = abs(fract(vec2(vWorldPos.x + vWorldPos.z, vWorldPos.x - vWorldPos.z) * 1.4) - 0.5);
diffuseColor.rgb *= 0.78 + 0.3 * step(0.36, max(g.x, g.y));
} else if (pat == 10) {
float plank = fract(vPattern.y / 0.7);
float grain = hash2(vec2(floor(vPattern.y / 0.7), 3.0));
diffuseColor.rgb *= (0.86 + 0.18 * grain) * (1.0 - 0.45 * step(0.9, plank));
} else if (pat == 11) {
float hx = (vWorldPos.x + vWorldPos.z) / 2.6;
vec2 g = vec2(fract(hx), fract(vWorldPos.y / 3.6));
float mull = max(step(g.x, 0.07), step(g.y, 0.09));
float band = 0.5 + 0.5 * sin(vWorldPos.y * 0.045 + (vWorldPos.x - vWorldPos.z) * 0.012);
vec3 glass = diffuseColor.rgb * (0.78 + 0.42 * band) + vec3(0.06, 0.08, 0.1) * step(0.55, hash2(floor(vec2(hx, vWorldPos.y / 3.6))));
diffuseColor.rgb = mix(glass, vec3(0.88, 0.92, 0.95), mull);
} else if (pat == 12) {
float hx = (vWorldPos.x + vWorldPos.z) / 3.1;
vec2 cell = vec2(floor(hx), floor(vWorldPos.y / 3.4));
vec2 w = vec2(fract(hx), fract(vWorldPos.y / 3.4));
float win = step(0.24, w.x) * step(w.x, 0.76) * step(0.3, w.y) * step(w.y, 0.82);
float frame = step(0.19, w.x) * step(w.x, 0.81) * step(0.24, w.y) * step(w.y, 0.86) - win;
float r = hash2(cell);
vec3 pane = mix(vec3(0.36, 0.55, 0.72), vec3(0.72, 0.86, 0.96), w.y);
pane = mix(pane, vec3(0.98, 0.84, 0.58), step(0.88, r));
pane *= 0.86 + 0.22 * r;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.96, 0.96, 0.94), frame * 0.85);
diffuseColor.rgb = mix(diffuseColor.rgb, pane, win);
} else if (pat == 13) {
float s = step(0.5, fract(vPattern.y / 1.6));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.97, 0.97, 0.95), s);
} else if (pat == 15) {
vec2 q = vWorldPos.xz;
float streak = hash2(floor(vec2(q.x * 0.35 + q.y * 0.9, q.y * 0.06 - q.x * 0.02)));
vec2 cq = q * 0.09;
float warp = hash2(floor(cq)) * 2.0 + hash2(floor(cq + 7.3)) * 1.3;
float crack = step(0.982, fract(q.x * 0.23 + q.y * 0.17 + warp)) + step(0.986, fract(q.y * 0.29 - q.x * 0.13 + warp * 1.7));
diffuseColor.rgb *= 0.9 + 0.14 * streak;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), min(1.0, crack) * 0.4);
} else if (pat == 16) {
float n = hash2(floor(vWorldPos.xz * 1.3)) * 0.5 + hash2(floor(vWorldPos.xz * 0.21)) * 0.5;
diffuseColor.rgb *= 0.95 + 0.07 * n;
} else if (pat == 7) {
vec2 w = vec2(fract((vWorldPos.x + vWorldPos.z) / 3.2), fract(vWorldPos.y / 3.4));
float win = step(0.2, w.x) * step(w.x, 0.75) * step(0.25, w.y) * step(w.y, 0.8);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.84, 0.95), win * 0.85);
}`,
    )
    .replace(
      '#include <opaque_fragment>',
      `if (pat == 5) outgoingLight = diffuseColor.rgb;
if (pat == 17) outgoingLight = mix(outgoingLight * 0.8, diffuseColor.rgb * 1.7, uLamps);
if (pat == 18) outgoingLight = mix(outgoingLight * 0.8, diffuseColor.rgb * 1.5, uLamps);
if (pat == 19 || pat == 20) {
float ph = fract(uTime * ${SIREN_RATE.toFixed(2)} + (pat == 20 ? 0.5 : 0.0));
float on = step(ph, 0.2) + step(0.27, ph) * step(ph, 0.47);
outgoingLight = diffuseColor.rgb * (0.16 + 1.6 * on);
}
if (pat == 8) outgoingLight = diffuseColor.rgb * (0.7 + 0.45 * sin(uTime * 5.0 - vWorldPos.y * 0.9));
if (pat == 6) {
float c = fract(vPattern.y / 3.0 - uTime * 1.6);
outgoingLight = diffuseColor.rgb * (0.55 + 0.75 * step(0.5, c));
}
#include <opaque_fragment>`,
    )
}

let shared = null

/** Shared world material (create once). */
export function getWorldMaterial() {
  if (shared) return shared
  const material = new MeshLambertMaterial({ vertexColors: true })
  material.userData.uniforms = { uTime: { value: 0 }, uLamps: night.uLamps, uHazardDark: { value: HAZARD_DARK } }
  material.onBeforeCompile = (shader) => applyPatterns(shader, material.userData.uniforms)
  // One program for every mesh using it (instanced or not compiles twice, fine).
  material.customProgramCacheKey = () => 'uwd-world'
  shared = material
  return material
}

/** Advances animated patterns (chevrons). Call once per frame. */
export function tickWorldMaterial(time) {
  if (shared) shared.userData.uniforms.uTime.value = time
}

export function disposeWorldMaterial() {
  shared?.dispose()
  shared = null
}
