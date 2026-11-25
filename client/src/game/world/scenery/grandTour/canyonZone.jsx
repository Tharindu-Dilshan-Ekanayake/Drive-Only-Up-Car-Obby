import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { BufferAttribute, BufferGeometry, InstancedMesh, Matrix4, Mesh, Points, ShaderMaterial, Vector3 } from 'three'

import { useQuality } from '../../../../store/quality'
import { PhysicsWorld } from '../../../physics/world'
import { getWorldMaterial } from '../../../render/worldMaterial'
import { buildSignMesh, fontReady } from '../../../render/signs'
import { runtime } from '../../../runtime'
import { createObstacles, SEPARATE_LOOKS } from '../../../track/obstacleSim'
import { buildCanyonWorld } from '../../canyon/canyonGeometry'
import { CANYON_LOOKS, cactusGeometry, disposeCanyonProps, rockGeometry } from '../../canyon/canyonProps'
import { ground } from '../../groundHeight'
import { zoneView } from '../../zoneView'

/**
 * The Grand Tour's Desert Canyon zone scenery (props `{ stage, info, zone }`, see
 * ../grandTour.jsx): the sandstone canyon round the zone's roads with its set pieces - rock
 * arches, trestles, the ghost town, the old mine and its tunnel, the storm ridge, the gorge,
 * the grand finish arch on the summit - as one geometry per terrain tile
 * (world/canyon/canyonGeometry.js), plus:
 * - saguaros (one instanced draw) and, on MEDIUM/HIGH, rocks (one more), only those near the car;
 * - the town, mine, gorge and finish signs: one draw (sign atlas, preset max texture);
 * - the zone's obstacle looks (tumbleweeds, sandstone boulders, ore buckets on mine cranes,
 *   mine carts and their adits): a draw-only copy of the obstacle sim on the same clock
 *   (obstacleSim SEPARATE_LOOKS, geometry world/canyon/canyonProps.js), one instanced draw
 *   per kind while any is near;
 * - the dust storm on the Dust Storm road: the fog closes in (eased, every preset) and, on
 *   MEDIUM/HIGH, blowing dust (one points draw; a few motes elsewhere in the zone).
 *
 * Presets: LOW - cacti within 140 m (at most 300, ~45% of them), no rocks, no dust, tiles
 * hidden a little short of the fog's end; MEDIUM - cacti within 220 m (700), rocks within
 * 160 m (300), 900 dust grains; HIGH - cacti within 300 m (1200), rocks within 220 m (600),
 * 1800 grains. Measured (every 40 m, both directions): LOW <= 45 calls / 71k triangles, HIGH
 * <= 74 calls / 109k (the worst at the zone's first plaza, the volcano in view). Falls: the
 * canyon's drawn ground is a `ground.layers` entry while mounted.
 * Unmounting disposes every geometry, material and texture it made and puts the fog back.
 */

const DUST_BOX = [150, 40, 150]

const dustVertex = /* glsl */ `
  uniform float uTime;
  uniform vec3 uCam;
  uniform float uFade;
  uniform float uSize;
  uniform float uWind;
  attribute float aSeed;
  varying float vA;
  void main() {
    vec3 box = vec3(${DUST_BOX.map((v) => v.toFixed(1)).join(', ')});
    vec3 p = position;
    float gust = uWind * (0.7 + 0.3 * sin(uTime * 0.9 + aSeed * 6.0));
    p.x += uTime * gust * (0.8 + aSeed * 0.5);
    p.z += uTime * gust * 0.35 + sin(uTime * 1.3 + aSeed * 40.0) * 1.2;
    p.y += sin(uTime * 0.8 + aSeed * 25.0) * 1.6;
    p = mod(p - uCam + box * 0.5, box) - box * 0.5 + uCam;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (0.5 + aSeed) / max(1.0, -mv.z);
    vA = uFade * clamp(1.0 - (-mv.z) / 75.0, 0.0, 1.0);
  }
`
const dustFragment = /* glsl */ `
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    gl_FragColor = vec4(0.93, 0.66, 0.42, vA * (1.0 - d * 1.8) * 0.8);
  }
`

function buildDust(n) {
  const pos = new Float32Array(n * 3)
  const seed = new Float32Array(n)
  let s = 4242
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647
  for (let i = 0; i < n; i += 1) {
    pos[i * 3] = r() * DUST_BOX[0]
    pos[i * 3 + 1] = r() * DUST_BOX[1]
    pos[i * 3 + 2] = r() * DUST_BOX[2]
    seed[i] = r()
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(pos, 3))
  geo.setAttribute('aSeed', new BufferAttribute(seed, 1))
  const material = new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uCam: { value: new Vector3() }, uFade: { value: 0 }, uSize: { value: 150 }, uWind: { value: 14 } },
    vertexShader: dustVertex,
    fragmentShader: dustFragment,
    transparent: true,
    depthWrite: false,
  })
  const points = new Points(geo, material)
  points.frustumCulled = false
  // (Visible until the first frame hides it, so the loading screen's warm-up compiles it.)
  points.renderOrder = 2
  points.name = 'canyon-dust'
  return points
}

/** What the frame loop drives (module-level, frame-owned; set by the effect below). */
const live = {
  meshes: [],
  cull: Infinity,
  cacti: null,
  cactusTiles: [],
  cactusRange: 0,
  rocks: null,
  rockTiles: [],
  rockRange: 0,
  zone: null,
  storms: [],
  looks: null,
  lookMeshes: null,
  lookKinds: [],
  lookCounts: null,
  dust: null,
  dustFade: 0,
  fogK: 0,
  fogNear: 0,
  fogFar: 0,
  frame: 0,
}
const _m = new Matrix4()

/** Rewrites an instanced scatter mesh from the tiles near the car. */
function cullScatter(mesh, tiles, range, car) {
  const r2 = (range + 85) ** 2
  const arr = mesh.instanceMatrix.array
  const cap = mesh.instanceMatrix.count
  let n = 0
  for (const tile of tiles) {
    if ((tile.x - car.x) ** 2 + (tile.z - car.z) ** 2 > r2) continue
    const k = Math.min(tile.count, cap - n)
    if (k <= 0) break
    arr.set(k === tile.count ? tile.matrices : tile.matrices.subarray(0, k * 16), n * 16)
    n += k
  }
  mesh.count = n
  mesh.visible = n > 0
  mesh.instanceMatrix.needsUpdate = true
}

/** The draw-only obstacle looks near the car: same clock and window as the stage's sim. */
function tickLooks(t) {
  const sec = runtime.race.section
  live.looks.update(t, sec - 1, sec + 2)
  const counts = live.lookCounts
  for (const k of live.lookKinds) counts[k] = 0
  for (const e of live.looks.list) {
    if (!e.active) continue
    for (const p of e.parts) {
      if (!p.visible) continue
      const mesh = live.lookMeshes[p.kind]
      _m.compose(p.position, p.quaternion, p.scale)
      mesh.setMatrixAt(counts[p.kind], _m)
      counts[p.kind] += 1
    }
  }
  for (const k of live.lookKinds) {
    const mesh = live.lookMeshes[k]
    mesh.count = counts[k]
    mesh.visible = counts[k] > 0
    mesh.instanceMatrix.needsUpdate = true
  }
}

/** Is the car on (or just about to reach) the storm ridge? */
function inStorm() {
  const i = runtime.race.pathIndex
  for (const r of live.storms) if (i >= r.from - 30 && i <= r.to + 40) return true
  return false
}

function tickCanyon(t, dt, camera, scene) {
  const car = runtime.car.position
  live.frame += 1
  if (live.frame % 15 === 0) {
    for (const m of live.meshes) {
      const b = m.geometry.boundingSphere
      m.visible = Math.hypot(b.center.x - car.x, b.center.y - car.y, b.center.z - car.z) - b.radius < live.cull
    }
    if (live.cacti) cullScatter(live.cacti, live.cactusTiles, live.cactusRange, car)
    if (live.rocks) cullScatter(live.rocks, live.rockTiles, live.rockRange, car)
  }
  if (live.looks) tickLooks(t)
  const sec = runtime.race.section
  const zoneHere = !!live.zone && sec >= live.zone.from && sec <= live.zone.to
  const storm = zoneHere && inStorm()
  const step = Math.min(0.1, dt) / 2.5
  // The storm's fog: closing in while you're on the ridge, opening out after.
  const fogTarget = storm ? 1 : 0
  if (live.fogK !== fogTarget || live.fogK > 0) {
    live.fogK = fogTarget > live.fogK ? Math.min(fogTarget, live.fogK + step) : Math.max(fogTarget, live.fogK - step)
    const fog = scene.fog
    if (fog) {
      const k = live.fogK * live.fogK * (3 - 2 * live.fogK)
      fog.near = live.fogNear * (1 - 0.8 * k)
      fog.far = live.fogFar * (1 - 0.5 * k)
    }
  }
  // Blowing dust: thick in the storm, a few motes elsewhere in the zone.
  if (live.dust) {
    const target = storm ? 1 : zoneHere ? 0.2 : 0
    live.dustFade += (target - live.dustFade) * Math.min(1, dt * 1.5)
    const u = live.dust.material.uniforms
    u.uTime.value = t
    u.uCam.value.copy(camera.position)
    u.uFade.value = live.dustFade
    u.uWind.value = storm ? 16 : 5
    live.dust.visible = live.dustFade > 0.01
  }
}

export default function CanyonZoneScenery({ stage, zone }) {
  const scene = useThree((s) => s.scene)
  const density = useQuality((s) => s.settings.sceneryDensity)
  const viewDistance = useQuality((s) => s.settings.viewDistance)
  const fogNear = useQuality((s) => s.settings.fogNear)
  const maxTexture = useQuality((s) => s.settings.maxTexture)
  const particles = useQuality((s) => s.settings.particles)
  const realtime = useQuality((s) => s.settings.shadows === 'realtime')

  useEffect(() => {
    const low = density < 0.6
    const high = viewDistance >= 560
    const world = buildCanyonWorld(zoneView(stage, zone.id), { density })
    const material = getWorldMaterial()
    const meshes = world.chunks.map(({ key, geometry }) => {
      const m = new Mesh(geometry, material)
      m.name = `canyon-${key}`
      m.matrixAutoUpdate = false
      m.receiveShadow = realtime
      scene.add(m)
      return m
    })
    live.meshes = meshes
    live.cull = low ? fogNear + (viewDistance * 0.95 - fogNear) * 0.85 : viewDistance
    live.zone = zone
    live.storms = world.storms
    live.frame = 14
    // The fog this preset gives (GameScene's): the storm scales it, and it goes back to this.
    live.fogNear = fogNear
    live.fogFar = viewDistance * 0.95
    live.fogK = 0

    // Terrain falls: our ground beside the other zones' (not wrapping `ground.at`).
    ground.layers.add(world.heightAt)

    // Cacti and rocks: instanced, rewritten from the tiles near the car.
    const cacti = new InstancedMesh(cactusGeometry(), material, low ? 300 : high ? 1200 : 700)
    cacti.count = 0
    cacti.frustumCulled = false
    cacti.name = 'canyon-cacti'
    scene.add(cacti)
    live.cacti = cacti
    live.cactusTiles = world.cacti
    live.cactusRange = low ? 140 : high ? 300 : 220
    let rocks = null
    if (!low) {
      rocks = new InstancedMesh(rockGeometry(), material, high ? 600 : 300)
      rocks.count = 0
      rocks.frustumCulled = false
      rocks.name = 'canyon-rocks'
      scene.add(rocks)
      live.rocks = rocks
      live.rockTiles = world.rocks
      live.rockRange = high ? 220 : 160
    }

    // The obstacle looks, drawn from a draw-only copy of the sim (no bodies in the real world).
    const lookObstacles = stage.obstacles.filter((o) => o.look && o.section >= zone.from && o.section <= zone.to)
    const looks = lookObstacles.length ? createObstacles({ ...stage, obstacles: lookObstacles }, new PhysicsWorld(), { looks: true }) : null
    const lookMeshes = {}
    if (looks) {
      const counts = {}
      for (const e of looks.list) for (const p of e.parts) if (SEPARATE_LOOKS.has(p.kind) && CANYON_LOOKS[p.kind]) counts[p.kind] = (counts[p.kind] || 0) + 1
      for (const [kind, n] of Object.entries(counts)) {
        const m = new InstancedMesh(CANYON_LOOKS[kind](), material, n)
        m.count = 0
        m.frustumCulled = false
        m.name = `canyon-look-${kind}`
        m.receiveShadow = realtime
        scene.add(m)
        lookMeshes[kind] = m
      }
      live.looks = looks
      live.lookMeshes = lookMeshes
      live.lookKinds = Object.keys(lookMeshes)
      live.lookCounts = Object.fromEntries(live.lookKinds.map((k) => [k, 0]))
    }

    // Blowing dust (MEDIUM / HIGH: the preset's particles).
    const dust = particles ? buildDust(high ? 1800 : 900) : null
    if (dust) scene.add(dust)
    live.dust = dust
    live.dustFade = 0

    // Town, mine, gorge and finish signs (once the font is in, so the atlas isn't painted in a fallback face).
    let signs = null
    let cancelled = false
    fontReady().then(() => {
      if (cancelled || !world.signs.length) return
      signs = buildSignMesh(world.signs, maxTexture)
      signs.mesh.name = 'canyon-signs'
      scene.add(signs.mesh)
    })

    return () => {
      cancelled = true
      for (const m of meshes) {
        scene.remove(m)
        m.geometry.dispose()
      }
      ground.layers.delete(world.heightAt)
      scene.remove(cacti)
      cacti.dispose()
      if (rocks) {
        scene.remove(rocks)
        rocks.dispose()
      }
      for (const m of Object.values(lookMeshes)) {
        scene.remove(m)
        m.dispose()
      }
      if (dust) {
        scene.remove(dust)
        dust.geometry.dispose()
        dust.material.dispose()
      }
      if (signs) {
        scene.remove(signs.mesh)
        signs.dispose()
      }
      // The props' geometries (cacti, rocks, looks) are this zone's own cache.
      disposeCanyonProps()
      // The fog back to the preset's, if the storm had it.
      if (live.fogK > 0 && scene.fog) {
        scene.fog.near = fogNear
        scene.fog.far = viewDistance * 0.95
      }
      Object.assign(live, {
        meshes: [],
        cacti: null,
        cactusTiles: [],
        rocks: null,
        rockTiles: [],
        zone: null,
        storms: [],
        looks: null,
        lookMeshes: null,
        lookKinds: [],
        lookCounts: null,
        dust: null,
        fogK: 0,
      })
    }
  }, [scene, stage, zone, density, viewDistance, fogNear, maxTexture, particles, realtime])

  useFrame((state, dt) => tickCanyon(state.clock.elapsedTime, dt, state.camera, state.scene))

  return null
}
