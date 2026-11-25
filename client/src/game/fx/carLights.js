import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
} from 'three'

import { night } from '../world/nightLight'
import { runtime } from '../runtime'

/**
 * Cheap fake lighting for every car at night, and any other little light that wants a glow
 * or a pool on the road (police strobes, the helicopter's searchlight spot, street lights):
 *
 * - `beams`: an additive light cone in front of each car (one instanced draw for all cars;
 *   MEDIUM/HIGH only - `setBeams`);
 * - `pools`: soft additive light pools on the road (headlights ahead of each car, police
 *   strobes, street lights, the searchlight spot) - one instanced draw;
 * - `glows`: camera-facing additive flares (head lamps, red tail lamps that brighten when
 *   braking, police strobes) that keep a minimum on-screen size, so they read from far
 *   away - one instanced draw.
 *
 * Batched like the wheels (cars/CarRig.js wheelBatch): `begin()` at the start of every
 * frame (GameScene FrameStart), then whoever draws a car pushes it while posing it
 * (`car()`: CarRig.pose does it for the player, CPU racers, remote cars and the showroom;
 * Lobby / police / traffic push their own). Intensity is baked into the instance colour
 * from world/nightLight.js `night.lamps` (0 in daylight: nothing is pushed). Preallocated,
 * no allocation per frame; the three meshes live for the page (NightLights.jsx adds them).
 */

const MAX_CARS = 64
const MAX_POOLS = 128
const MAX_GLOWS = 288
/** Beams and pools are skipped past this distance from the camera (m, squared below); glows further. */
const NEAR = 150
const FAR = 320

const HEAD = new Color('#fff1d0')
const TAIL = new Color('#ff2a2a')
const BRAKE = new Color('#ff1a1a')
const POOL_TINT = new Color('#ffe7b8')

const fogUniforms = () => UniformsUtils.clone(UniformsLib.fog)

/** Fades an additive colour into the fog (additive light must vanish, not turn fog-coloured). */
const FOG_FADE = /* glsl */ `
  #ifdef USE_FOG
    float fogK = smoothstep(fogNear, fogFar, vFogDepth);
    col *= 1.0 - fogK;
  #endif
`

const beamVertex = /* glsl */ `
  varying float vAlong;
  varying float vEdge;
  varying vec3 vColor;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    vAlong = uv.y;
    vColor = instanceColor;
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * mat3(instanceMatrix) * normal);
    // Bright where the cone is seen face on, fading to nothing at its silhouette.
    vEdge = abs(dot(n, normalize(-mvPosition.xyz)));
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`
const beamFragment = /* glsl */ `
  varying float vAlong;
  varying float vEdge;
  varying vec3 vColor;
  #include <common>
  #include <fog_pars_fragment>
  void main() {
    float a = pow(1.0 - vAlong, 1.7) * smoothstep(0.0, 0.08, vAlong) * pow(vEdge, 1.6);
    vec3 col = vColor * a * 0.32;
    ${FOG_FADE}
    gl_FragColor = vec4(col, 1.0);
  }
`

const poolVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vColor;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vColor = instanceColor;
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`
const poolFragment = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vColor;
  #include <common>
  #include <fog_pars_fragment>
  void main() {
    float r = length(vUv * 2.0 - 1.0);
    float a = pow(max(0.0, 1.0 - r), 1.8);
    vec3 col = vColor * a;
    ${FOG_FADE}
    gl_FragColor = vec4(col, 1.0);
  }
`

const glowVertex = /* glsl */ `
  uniform float uMinSize;
  varying vec2 vUv;
  varying vec3 vColor;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vColor = instanceColor;
    vec4 mvPosition = modelViewMatrix * vec4(instanceMatrix[3].xyz, 1.0);
    float size = length(instanceMatrix[0].xyz);
    // Far away a glow keeps a minimum angular size (a strobe reads a long way off).
    size = max(size, -mvPosition.z * uMinSize);
    // Nudged towards the camera so the lamp's own body never hides its flare.
    mvPosition.xyz += normalize(-mvPosition.xyz) * min(0.6, size * 0.5);
    mvPosition.xy += position.xy * size;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`
const glowFragment = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vColor;
  #include <common>
  #include <fog_pars_fragment>
  void main() {
    float r = length(vUv * 2.0 - 1.0);
    float a = 0.55 * pow(max(0.0, 1.0 - r), 1.5) + 0.8 * pow(max(0.0, 1.0 - r * 2.4), 2.0);
    vec3 col = vColor * a;
    #ifdef USE_FOG
      col *= 1.0 - 0.75 * smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    gl_FragColor = vec4(col, 1.0);
  }
`

function additive(vertexShader, fragmentShader, extra = {}) {
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: { ...fogUniforms(), ...extra },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    fog: true,
    side: DoubleSide,
  })
}

/**
 * The beam: an open, flattened cone from the lamps (radius 0.18 at z 0) to the far end
 * (radius 1 at z -1), uv.y 0 -> 1 along it. Scaled per car (width, height, length).
 */
function beamGeometry() {
  const segs = 12
  const pos = []
  const nrm = []
  const uv = []
  const idx = []
  for (let i = 0; i <= segs; i += 1) {
    const a = (i / segs) * Math.PI * 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    for (const [r, z, v] of [
      [0.18, 0, 0],
      [1, -1, 1],
    ]) {
      pos.push(c * r, s * r, z)
      nrm.push(c, s, 0.4)
      uv.push(i / segs, v)
    }
  }
  for (let i = 0; i < segs; i += 1) {
    const a = i * 2
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  g.setIndex(idx)
  return g
}

function instanced(geometry, material, count, name) {
  const m = new InstancedMesh(geometry, material, count)
  m.instanceColor = new InstancedBufferAttribute(new Float32Array(count * 3), 3)
  m.count = 0
  m.frustumCulled = false
  m.name = name
  m.renderOrder = 2
  return m
}

// Scratch.
const _m = new Matrix4()
const _p = new Vector3()
const _s = new Vector3()
const _q = new Quaternion()
const _cam = new Vector3()

/** Per car model: the beam and pool matrices (car-local) and the lamp centres. */
const layouts = new WeakMap()
function layoutOf(model) {
  let l = layouts.get(model)
  if (l) return l
  const head = model.lights?.head || []
  const tail = model.lights?.tail || []
  let hx = 0
  let hy = 0.5
  let hz = -2
  let spread = 0.6
  if (head.length) {
    hx = 0
    hy = 0
    hz = 0
    let minX = Infinity
    let maxX = -Infinity
    for (const h of head) {
      hy += h[1] / head.length
      hz += h[2] / head.length
      minX = Math.min(minX, h[0])
      maxX = Math.max(maxX, h[0])
    }
    spread = Math.max(0.15, (maxX - minX) / 2)
  }
  const ground = -(model.wheels?.radius || 0.45)
  // Beam: from the lamps, slightly down, out to 15 m.
  const tilt = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.075)
  const beam = new Matrix4().compose(new Vector3(hx, hy, hz - 0.05), tilt, new Vector3(1.7 + spread, 0.42, 14))
  // Pool: on the road ahead, 6.5 m wide x 13 m long, its middle ~8.5 m in front of the lamps.
  const pool = new Matrix4().compose(new Vector3(hx, ground + 0.07, hz - 8.5), new Quaternion(), new Vector3(6.5 + spread * 2, 1, 13))
  l = {
    beam,
    pool,
    ground,
    head: head.map((h) => new Vector3(h[0], h[1], h[2] - 0.08)),
    tail: tail.map((t) => new Vector3(t[0], t[1], t[2] + 0.08)),
    headSize: 0.5,
  }
  layouts.set(model, l)
  return l
}

let meshes = null
const state = { beams: 0, pools: 0, glows: 0, beamsOn: true, spot: false }

function create() {
  const beams = instanced(beamGeometry(), additive(beamVertex, beamFragment), MAX_CARS, 'car-beams')
  const pool = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
  const poolMat = additive(poolVertex, poolFragment)
  poolMat.polygonOffset = true
  poolMat.polygonOffsetFactor = -2
  poolMat.polygonOffsetUnits = -4
  const pools = instanced(pool, poolMat, MAX_POOLS, 'light-pools')
  const glows = instanced(new PlaneGeometry(1, 1), additive(glowVertex, glowFragment, { uMinSize: { value: 0.008 } }), MAX_GLOWS, 'light-glows')
  glows.renderOrder = 3
  return { beams, pools, glows }
}

function camPos() {
  const cam = runtime.camera.object
  return cam ? _cam.copy(cam.position) : _cam.copy(runtime.car.position)
}

/** Writes instance `key`'s next slot (matrix `m`, colour * k) and counts it. */
function put(key, m, color, k) {
  const mesh = meshes[key]
  const i = state[key]
  mesh.setMatrixAt(i, m)
  const a = mesh.instanceColor.array
  a[i * 3] = color.r * k
  a[i * 3 + 1] = color.g * k
  a[i * 3 + 2] = color.b * k
  state[key] = i + 1
  mesh.count = i + 1
  mesh.instanceMatrix.needsUpdate = true
  mesh.instanceColor.needsUpdate = true
}

export const carLights = {
  /** The three meshes (made once). */
  meshes() {
    meshes ||= create()
    return meshes
  },
  /** Start of the frame (before any car is posed): empties the batches. */
  begin() {
    if (!meshes) return
    state.beams = 0
    state.pools = 0
    state.glows = 0
    meshes.beams.count = 0
    meshes.pools.count = 0
    meshes.glows.count = 0
    camPos()
  },
  /** Light cones on (MEDIUM/HIGH) or off (LOW). */
  setBeams(on) {
    state.beamsOn = on
  },
  /** The player's real headlight is on (its pool is then fainter: the spotlight lights the road). */
  setSpot(on) {
    state.spot = on
  },

  /**
   * A car's lights: `matrix` its body's world matrix, `model` its car model (needs
   * `lights.head` / `lights.tail` and `wheels.radius`), `brake` 0..1 (the tail lamps
   * brighten), `player` for your own car, `ground` the road's height in the car's frame
   * (where its light pool goes; default: a wheel radius down).
   */
  car(matrix, model, brake = 0, player = false, ground = null) {
    if (!meshes) return
    const lamps = night.lamps
    if (lamps <= 0.01 && brake <= 0) return
    const e = matrix.elements
    const dx = e[12] - _cam.x
    const dy = e[13] - _cam.y
    const dz = e[14] - _cam.z
    const d2 = dx * dx + dy * dy + dz * dz
    if (d2 > FAR * FAR) return
    const l = layoutOf(model)
    const near = d2 < NEAR * NEAR
    if (lamps > 0.01 && near) {
      if (state.beamsOn && state.beams < MAX_CARS) {
        put('beams', _m.multiplyMatrices(matrix, l.beam), HEAD, lamps * (player ? 1.15 : 1))
      }
      if (state.pools < MAX_POOLS) {
        _m.multiplyMatrices(matrix, l.pool)
        if (ground !== null) {
          // Up the car's own Y to the road (layout pools sit a wheel radius down).
          const dy = ground + 0.07 - l.ground
          const e2 = _m.elements
          e2[12] += e[4] * dy
          e2[13] += e[5] * dy
          e2[14] += e[6] * dy
        }
        put('pools', _m, POOL_TINT, lamps * (player && state.spot ? 0.3 : 0.55))
      }
    }
    if (lamps > 0.01) {
      for (const h of l.head) {
        if (state.glows >= MAX_GLOWS) break
        _p.copy(h).applyMatrix4(matrix)
        this.glowAt(_p, l.headSize, HEAD, lamps * 0.8)
      }
    }
    const tailK = lamps * 0.5 + brake * (0.45 + lamps * 0.6)
    if (tailK > 0.01) {
      for (const t of l.tail) {
        if (state.glows >= MAX_GLOWS) break
        _p.copy(t).applyMatrix4(matrix)
        this.glowAt(_p, brake > 0 ? 0.55 : 0.4, brake > 0 ? BRAKE : TAIL, tailK)
      }
    }
  },

  /** A flat pool of light: centre `pos`, turned by `quat` (its local Y is the surface normal), `sx` x `sz` m. */
  poolAt(pos, quat, sx, sz, color, k) {
    if (!meshes || state.pools >= MAX_POOLS || k <= 0.005) return
    const dx = pos.x - _cam.x
    const dy = pos.y - _cam.y
    const dz = pos.z - _cam.z
    if (dx * dx + dy * dy + dz * dz > NEAR * NEAR * 1.6) return
    put('pools', _m.compose(pos, quat, _s.set(sx, 1, sz)), color, k)
  },

  /** A camera-facing flare at `pos`, `size` m across (more when far: a minimum angular size). */
  glowAt(pos, size, color, k) {
    if (!meshes || state.glows >= MAX_GLOWS || k <= 0.005) return
    put('glows', _m.compose(pos, _q.identity(), _s.set(size, size, size)), color, k)
  },

  /** Debug: how many of each were drawn last frame. */
  counts: () => ({ beams: meshes?.beams.count || 0, pools: meshes?.pools.count || 0, glows: meshes?.glows.count || 0 }),
  /** Debug: last frame's instances of one batch - position, size and colour. */
  dump(key = 'pools') {
    const m = meshes?.[key]
    if (!m) return []
    const out = []
    for (let i = 0; i < m.count; i += 1) {
      m.getMatrixAt(i, _m)
      const e = _m.elements
      const c = m.instanceColor.array
      out.push({ p: [e[12], e[13], e[14]].map((v) => +v.toFixed(1)), sx: +Math.hypot(e[0], e[1], e[2]).toFixed(1), c: [c[i * 3], c[i * 3 + 1], c[i * 3 + 2]].map((v) => +v.toFixed(2)) })
    }
    return out
  },

  /**
   * Frees the GPU side (scene unmounted: context loss, rebuild). The meshes object stays
   * (three uploads it again if the scene comes back), as fx/CarFx.jsx does.
   */
  dispose() {
    if (!meshes) return
    for (const m of Object.values(meshes)) {
      m.geometry.dispose()
      m.material.dispose()
    }
  },
}
