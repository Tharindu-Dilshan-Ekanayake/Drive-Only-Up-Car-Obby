import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { InstancedMesh, Matrix4, Mesh } from 'three'

import { useQuality } from '../../../../store/quality'
import { PhysicsWorld } from '../../../physics/world'
import { getWorldMaterial } from '../../../render/worldMaterial'
import { buildSignMesh, fontReady } from '../../../render/signs'
import { runtime } from '../../../runtime'
import { createObstacles, SEPARATE_LOOKS } from '../../../track/obstacleSim'
import { LOOK_KINDS } from '../../../track/propGeometry'
import { ground } from '../../groundHeight'
import { buildTropicWorld, jungleTreeGeometry, palmGeometry, volcanoFarGeometry } from '../../tropic/tropicGeometry'
import { createVolcanoFarMaterial, disposeTropicWater, getTropicWaterMaterial, tickTropicWater } from '../../tropic/tropicWater'
import { zoneView } from '../../zoneView'

/**
 * The Grand Tour's Tropical Island zone scenery (props `{ stage, info, zone }`, see
 * ../grandTour.jsx): the islands round the zone's roads with their set pieces - lagoons,
 * beaches, huts and tiki bars, boardwalks and rope bridges, the seaplane dock, the reef
 * lighthouse, the waterfall gap, the jungle tunnel, the giant shell, the volcano - as one
 * geometry per terrain tile (world/tropic/tropicGeometry.js), plus:
 * - the water (lagoons, waterfall, lava streams): one draw (world/tropic/tropicWater.js);
 * - palms (one instanced draw) and, on MEDIUM/HIGH, jungle trees (one more), only the
 *   ones near the car;
 * - the hut and dock signs: one draw (sign atlas, preset max texture);
 * - the volcano on the horizon while the real one is out of view: one draw;
 * - the zone's obstacle looks (coconuts, lava boulders, palm logs, crabs): a draw-only copy
 *   of the obstacle sim on the same clock (obstacleSim SEPARATE_LOOKS), one instanced draw
 *   per kind while any is near.
 *
 * Presets: LOW - palms within 150 m (at most 260, ~45% of them), no jungle trees, no far
 * volcano, tiles hidden a little short of the fog's end; MEDIUM - palms within 230 m (650), jungle trees
 * within 200 m (300); HIGH - palms within 320 m (1100), jungle trees within 280 m (600).
 * Measured worst case anywhere in the zone: LOW ~44 calls / 79k triangles, HIGH ~61 / 120k.
 * Unmounting disposes every geometry, material and texture it made.
 */

/** What the frame loop drives (module-level, frame-owned; set by the effect below). */
const live = {
  meshes: [],
  cull: Infinity,
  water: null,
  palms: null,
  palmTiles: [],
  palmRange: 0,
  jungle: null,
  jungleTiles: [],
  jungleRange: 0,
  far: null,
  volcano: null,
  zone: null,
  looks: null,
  lookMeshes: null,
  lookKinds: [],
  lookCounts: null,
  ground: null,
  groundPrev: null,
  frame: 0,
}
const _m = new Matrix4()

/** Rewrites an instanced tree mesh from the tiles near the car. */
function cullTrees(mesh, tiles, range, car) {
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

/** The far volcano: on the horizon (inside the far plane, scaled) while the real cone is beyond view. */
function placeFarVolcano(camera, scene) {
  const far = live.far
  const v = live.volcano
  const sec = runtime.race.section
  const near = live.zone && sec >= live.zone.from - 1 && sec <= live.zone.to + 3
  const dx = v.x - camera.position.x
  const dy = v.base - camera.position.y
  const dz = v.z - camera.position.z
  const d = Math.hypot(dx, dy, dz)
  const D = camera.far * 0.8
  far.visible = near && d > camera.far * 0.97
  if (!far.visible) return
  const k = D / d
  far.position.set(camera.position.x + dx * k, camera.position.y + dy * k, camera.position.z + dz * k)
  far.scale.setScalar(k)
  if (scene.fog) far.material.uniforms.uHaze.value.copy(scene.fog.color)
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

function tickTropic(t, camera, scene) {
  tickTropicWater(t, camera)
  // Terrain falls: keep our ground (the larger of ours and whatever was there - the snow
  // zone's mountain) in `ground.at`, even if another zone's scenery set it after us.
  if (live.ground && ground.at !== live.ground) {
    live.groundPrev = ground.at
    ground.at = live.ground
  }
  const car = runtime.car.position
  live.frame += 1
  if (live.frame % 15 === 0) {
    let any = false
    for (const m of live.meshes) {
      const b = m.geometry.boundingSphere
      m.visible = Math.hypot(b.center.x - car.x, b.center.y - car.y, b.center.z - car.z) - b.radius < live.cull
      any ||= m.visible
    }
    if (live.water) live.water.visible = any
    if (live.palms) cullTrees(live.palms, live.palmTiles, live.palmRange, car)
    if (live.jungle) cullTrees(live.jungle, live.jungleTiles, live.jungleRange, car)
  }
  if (live.far) placeFarVolcano(camera, scene)
  if (live.looks) tickLooks(t)
}

export default function TropicZoneScenery({ stage, zone }) {
  const scene = useThree((s) => s.scene)
  const density = useQuality((s) => s.settings.sceneryDensity)
  const viewDistance = useQuality((s) => s.settings.viewDistance)
  const fogNear = useQuality((s) => s.settings.fogNear)
  const maxTexture = useQuality((s) => s.settings.maxTexture)
  const realtime = useQuality((s) => s.settings.shadows === 'realtime')

  useEffect(() => {
    const low = density < 0.6
    const high = viewDistance >= 560
    const world = buildTropicWorld(zoneView(stage, zone.id), { density })
    const material = getWorldMaterial()
    const meshes = world.chunks.map(({ key, geometry }) => {
      const m = new Mesh(geometry, material)
      m.name = `tropic-${key}`
      m.matrixAutoUpdate = false
      m.receiveShadow = realtime
      scene.add(m)
      return m
    })
    live.meshes = meshes
    live.cull = low ? fogNear + (viewDistance * 0.95 - fogNear) * 0.85 : viewDistance
    live.zone = zone
    live.frame = 14

    // The water: lagoons, the waterfall, the lava streams.
    const water = new Mesh(world.water, getTropicWaterMaterial())
    water.name = 'tropic-water'
    water.matrixAutoUpdate = false
    scene.add(water)
    live.water = water

    // Terrain falls (a car in a lagoon or sunk into the islands respawns).
    live.groundPrev = ground.at
    live.ground = (x, z) => {
      const h = world.heightAt(x, z)
      const o = live.groundPrev ? live.groundPrev(x, z) : -Infinity
      return h > o ? h : o
    }
    ground.at = live.ground

    // Palms and jungle trees: instanced, rewritten from the tiles near the car.
    const palmGeo = palmGeometry()
    const palms = new InstancedMesh(palmGeo, material, low ? 260 : high ? 1100 : 650)
    palms.count = 0
    palms.frustumCulled = false
    palms.name = 'tropic-palms'
    scene.add(palms)
    live.palms = palms
    live.palmTiles = world.palms
    live.palmRange = low ? 150 : high ? 320 : 230
    let jungle = null
    let jungleGeo = null
    if (!low) {
      jungleGeo = jungleTreeGeometry()
      jungle = new InstancedMesh(jungleGeo, material, high ? 600 : 300)
      jungle.count = 0
      jungle.frustumCulled = false
      jungle.name = 'tropic-jungle'
      scene.add(jungle)
      live.jungle = jungle
      live.jungleTiles = world.jungle
      live.jungleRange = high ? 280 : 200
    }

    // The volcano on the horizon (MEDIUM / HIGH: LOW keeps to what's in view).
    let far = null
    if (world.volcano && !low) {
      far = new Mesh(volcanoFarGeometry(world.volcano), createVolcanoFarMaterial())
      far.name = 'tropic-volcano-far'
      far.frustumCulled = false
      far.renderOrder = -0.5
      // (Visible until the first frame places or hides it, so the loading screen's warm-up
      // compiles its shader with the rest.)
      scene.add(far)
      live.far = far
      live.volcano = world.volcano
    }

    // The obstacle looks, drawn from a draw-only copy of the sim (no bodies in the real world).
    const lookObstacles = stage.obstacles.filter((o) => o.look && o.section >= zone.from && o.section <= zone.to)
    const looks = lookObstacles.length ? createObstacles({ ...stage, obstacles: lookObstacles }, new PhysicsWorld(), { looks: true }) : null
    const lookMeshes = {}
    if (looks) {
      const counts = {}
      for (const e of looks.list) for (const p of e.parts) if (SEPARATE_LOOKS.has(p.kind)) counts[p.kind] = (counts[p.kind] || 0) + 1
      for (const [kind, n] of Object.entries(counts)) {
        const m = new InstancedMesh(LOOK_KINDS[kind](), material, n)
        m.count = 0
        m.frustumCulled = false
        m.name = `tropic-look-${kind}`
        m.receiveShadow = realtime
        scene.add(m)
        lookMeshes[kind] = m
      }
      live.looks = looks
      live.lookMeshes = lookMeshes
      live.lookKinds = Object.keys(lookMeshes)
      live.lookCounts = Object.fromEntries(live.lookKinds.map((k) => [k, 0]))
    }

    // Hut and dock signs (once the font is in, so the atlas isn't painted in a fallback face).
    let signs = null
    let cancelled = false
    fontReady().then(() => {
      if (cancelled || !world.signs.length) return
      signs = buildSignMesh(world.signs, maxTexture)
      signs.mesh.name = 'tropic-signs'
      scene.add(signs.mesh)
    })

    return () => {
      cancelled = true
      for (const m of meshes) {
        scene.remove(m)
        m.geometry.dispose()
      }
      scene.remove(water)
      water.geometry.dispose()
      disposeTropicWater()
      scene.remove(palms)
      palms.dispose()
      palmGeo.dispose()
      if (jungle) {
        scene.remove(jungle)
        jungle.dispose()
        jungleGeo.dispose()
      }
      if (far) {
        scene.remove(far)
        far.geometry.dispose()
        far.material.dispose()
      }
      // (The look geometries are propGeometry's shared cache: kept.)
      for (const m of Object.values(lookMeshes)) {
        scene.remove(m)
        m.dispose()
      }
      if (signs) {
        scene.remove(signs.mesh)
        signs.dispose()
      }
      // (Not back to the previous one: on a stage unmount the snow zone has already gone and
      // its function would be stale. If only we re-run, the snow zone's is re-wrapped below.)
      if (ground.at === live.ground) ground.at = null
      Object.assign(live, {
        meshes: [],
        water: null,
        palms: null,
        palmTiles: [],
        jungle: null,
        jungleTiles: [],
        far: null,
        volcano: null,
        zone: null,
        looks: null,
        lookMeshes: null,
        lookKinds: [],
        lookCounts: null,
        ground: null,
        groundPrev: null,
      })
    }
  }, [scene, stage, zone, density, viewDistance, fogNear, maxTexture, realtime])

  useFrame((state) => tickTropic(state.clock.elapsedTime, state.camera, state.scene))

  return null
}
