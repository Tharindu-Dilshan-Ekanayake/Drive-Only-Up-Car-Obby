import { BufferAttribute, BufferGeometry, Color, DoubleSide, ShaderMaterial } from 'three'

/**
 * The map portals' glow: a disc of light turning in each arch's opening and a glowing
 * pad under it, in the colour of the map it leads to (a map of zones - the Grand Tour -
 * swirls through its four zones' colours). Shared by the lobby portals (Lobby.jsx) and
 * the exit portal on a finish plaza (track/ExitPortal.jsx): one small shader, and each
 * user builds ONE geometry for all its portals (vertex attributes per quad), so a set of
 * portals is a single draw call.
 *
 * A LOCKED portal (a chapter you haven't opened yet: shared/logic.js isStageUnlocked) is
 * the same quads with `locked = 1`: the swirl drained of colour and dimmed, turning
 * slowly, with a few slow dark bars drifting across the opening, and a dim pad without
 * the chevron pulse. No extra meshes either way.
 *
 * The material is module-level and reference-counted (acquirePortalMaterial /
 * releasePortalMaterial: disposed when the last user lets go); the frame loops advance its
 * clock with tickPortalFx (no allocation).
 */

const fx = { material: null, users: 0 }

const vertex = /* glsl */ `
  attribute vec3 color;
  attribute float pad;
  attribute float multi;
  attribute float locked;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vPad;
  varying float vMulti;
  varying float vLocked;
  void main() {
    vUv = uv;
    vColor = color;
    vPad = pad;
    vMulti = multi;
    vLocked = locked;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const fragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uZ0;
  uniform vec3 uZ1;
  uniform vec3 uZ2;
  uniform vec3 uZ3;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vPad;
  varying float vMulti;
  varying float vLocked;
  vec3 zones(float s) {
    s = fract(s / 4.0) * 4.0;
    return uZ0 * max(0.0, 1.0 - abs(s)) + uZ1 * max(0.0, 1.0 - abs(s - 1.0)) + uZ2 * max(0.0, 1.0 - abs(s - 2.0))
      + uZ3 * max(0.0, 1.0 - abs(s - 3.0)) + uZ0 * max(0.0, 1.0 - abs(s - 4.0));
  }
  // Locked: grey-blue, dim.
  vec3 drained(vec3 c) {
    return vec3(dot(c, vec3(0.299, 0.587, 0.114))) * vec3(0.5, 0.54, 0.62) + vec3(0.03, 0.04, 0.07);
  }
  void main() {
    bool locked = vLocked > 0.5;
    float t = uTime * (locked ? 0.2 : 1.0);
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p * vec2(1.0, 0.85));
    float a = atan(p.y, p.x);
    vec3 base = vColor;
    if (vPad > 0.5) {
      // The pad: soft chevron pulses towards the arch (none while locked).
      float band = locked ? 0.0 : 0.5 + 0.5 * sin(vUv.x * 14.0 - t * 4.0);
      if (vMulti > 0.5) base = zones(vUv.y * 4.0 - t * 0.5);
      vec3 pc = mix(base, vec3(1.0), band * 0.25);
      gl_FragColor = locked ? vec4(drained(pc), 0.38) : vec4(pc, 0.55 + band * 0.2);
      return;
    }
    float swirl = 0.5 + 0.5 * sin(a * 3.0 + r * 11.0 - t * 3.2);
    float core = smoothstep(0.95, 0.0, r);
    if (vMulti > 0.5) base = zones(a / 1.5708 + r * 1.6 - t * 0.35);
    vec3 c = mix(base * 0.8, vec3(1.0), swirl * 0.3 + core * 0.45);
    float alpha = (0.62 + 0.3 * core) * smoothstep(1.08, 0.9, r);
    if (locked) {
      c = drained(c);
      alpha *= 0.7;
      // A few dark bars across the opening, drifting slowly down.
      float f = fract(vUv.y * 3.5 + uTime * 0.05);
      float bar = smoothstep(0.7, 0.73, f) - smoothstep(0.95, 0.98, f);
      c = mix(c, vec3(0.1, 0.12, 0.17), bar);
      alpha = mix(alpha, 0.9, bar);
    }
    gl_FragColor = vec4(c, alpha);
  }
`

/** The shared portal material (made on first use); pair every call with releasePortalMaterial. */
export function acquirePortalMaterial() {
  fx.users += 1
  fx.material ||= new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uZ0: { value: new Color() }, uZ1: { value: new Color() }, uZ2: { value: new Color() }, uZ3: { value: new Color() } },
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  })
  return fx.material
}

export function releasePortalMaterial() {
  fx.users = Math.max(0, fx.users - 1)
  if (fx.users || !fx.material) return
  fx.material.dispose()
  fx.material = null
}

/** Advances the swirl (any frame loop may call it; the last call in a frame wins). */
export function tickPortalFx(t) {
  if (fx.material) fx.material.uniforms.uTime.value = t
}

/**
 * One geometry for a set of portals. Each: `{ x, y, z, normal, across, info, locked }` -
 * the floor centre under the arch, `normal` (unit, horizontal) the way the arch faces
 * (you drive in against it), `across` along the opening, `info` the registry entry of
 * the map it leads to (its `color`, or its `zones`' colours), `locked` the locked look.
 * `size`: `{ w, d, height, padHalf }` - pad depth along the drive, opening width, lintel
 * height, the pad's half width.
 */
export function buildPortalGeometry(portals, size) {
  const pos = []
  const uv = []
  const colors = []
  const pads = []
  const multis = []
  const lockeds = []
  const color = new Color()
  const quad = (a, b, c, d, isPad, multi, locked) => {
    // a b c d counter-clockwise from (0,0) uv.
    pos.push(...a, ...b, ...c, ...a, ...c, ...d)
    uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1)
    for (let i = 0; i < 6; i += 1) {
      colors.push(color.r, color.g, color.b)
      pads.push(isPad ? 1 : 0)
      multis.push(multi)
      lockeds.push(locked ? 1 : 0)
    }
  }
  const { w, d, height, padHalf } = size
  for (const p of portals) {
    const { info, normal: n, across: c } = p
    if (!info) continue
    color.set(info.color)
    // A map of zones swirls through its zones' colours (the material's uZ0..uZ3).
    const multi = info.zones?.length >= 4 ? 1 : 0
    if (multi && fx.material) info.zones.slice(0, 4).forEach((z, k) => fx.material.uniforms[`uZ${k}`].value.set(z.color))
    const P = (along, up, side) => [p.x + n[0] * along + c[0] * side, p.y + up, p.z + n[2] * along + c[2] * side]
    // In the opening (a plane across the arch), a little inside the posts and lintel.
    quad(P(0, 0.15, d / 2 - 0.05), P(0, 0.15, -d / 2 + 0.05), P(0, height - 0.1, -d / 2 + 0.05), P(0, height - 0.1, d / 2 - 0.05), false, multi, p.locked)
    // The pad inside its white frame (uv.x runs towards the arch's far side).
    quad(P(w / 2, 0.07, padHalf), P(-w / 2, 0.07, padHalf), P(-w / 2, 0.07, -padHalf), P(w / 2, 0.07, -padHalf), true, multi, p.locked)
    // The apron in front of the arch (lobby portals): the same glowing pad, running towards the arch.
    if (size.apron) {
      const { from, to, half } = size.apron
      quad(P(to, 0.07, half), P(from, 0.07, half), P(from, 0.07, -half), P(to, 0.07, -half), true, multi, p.locked)
    }
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  geo.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  geo.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))
  geo.setAttribute('pad', new BufferAttribute(new Float32Array(pads), 1))
  geo.setAttribute('multi', new BufferAttribute(new Float32Array(multis), 1))
  geo.setAttribute('locked', new BufferAttribute(new Float32Array(lockeds), 1))
  geo.computeBoundingSphere()
  return geo
}
