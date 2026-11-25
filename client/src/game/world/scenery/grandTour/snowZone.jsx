import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, InstancedMesh, Matrix4, Mesh, Points, Quaternion, ShaderMaterial, Vector3 } from 'three'

import { useQuality } from '../../../../store/quality'
import { getWorldMaterial } from '../../../render/worldMaterial'
import { runtime } from '../../../runtime'
import { ground } from '../../groundHeight'
import { buildSnowWorld, gondolaGeometry, treeGeometry } from '../../snow/snowGeometry'
import { zoneView } from '../../zoneView'

/**
 * The Grand Tour's Snowy Mountain zone scenery (props `{ stage, info, zone }`, see
 * ../grandTour.jsx): the mountain round the zone's roads with its set pieces - ski village,
 * cable car, frozen waterfalls, ice cave, frozen lake, summit observatory - as one geometry
 * per terrain tile (world/snow/snowGeometry.js), snow-capped pines (one instanced draw, only
 * the ones near the car), the cable car's gondolas (one instanced draw, moving) and light
 * snowfall (one points draw, MEDIUM/HIGH only, while you're in the zone).
 *
 * Presets: LOW - pines within 170 m (at most 420, ~45% of them), 6 gondolas, no snowfall;
 * MEDIUM - pines within 260 m (900), 12 gondolas, 900 flakes; HIGH - pines within 360 m
 * (1600), 16 gondolas, 1800 flakes. Tiles past the fog are hidden. Unmounting disposes
 * every geometry and material it made.
 */

const SNOW_BOX = [140, 70, 140]

const snowVertex = /* glsl */ `
  uniform float uTime;
  uniform vec3 uCam;
  uniform float uFade;
  uniform float uSize;
  attribute float aSeed;
  varying float vA;
  void main() {
    vec3 box = vec3(${SNOW_BOX.map((v) => v.toFixed(1)).join(', ')});
    vec3 p = position;
    p.y -= uTime * (2.0 + aSeed * 1.6);
    p.x += uTime * 1.3 + sin(uTime * 0.7 + aSeed * 30.0) * 1.5;
    p.z += cos(uTime * 0.5 + aSeed * 20.0) * 1.2;
    p = mod(p - uCam + box * 0.5, box) - box * 0.5 + uCam;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (0.6 + aSeed) / max(1.0, -mv.z);
    vA = uFade * clamp(1.0 - (-mv.z) / 70.0, 0.0, 1.0);
  }
`
const snowFragment = /* glsl */ `
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    gl_FragColor = vec4(1.0, 1.0, 1.0, vA * (1.0 - d * 1.6) * 0.9);
  }
`

function buildSnowfall(n) {
  const pos = new Float32Array(n * 3)
  const seed = new Float32Array(n)
  let s = 12345
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647
  for (let i = 0; i < n; i += 1) {
    pos[i * 3] = r() * SNOW_BOX[0]
    pos[i * 3 + 1] = r() * SNOW_BOX[1]
    pos[i * 3 + 2] = r() * SNOW_BOX[2]
    seed[i] = r()
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(pos, 3))
  geo.setAttribute('aSeed', new BufferAttribute(seed, 1))
  const material = new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uCam: { value: new Vector3() }, uFade: { value: 0 }, uSize: { value: 70 } },
    vertexShader: snowVertex,
    fragmentShader: snowFragment,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
  const points = new Points(geo, material)
  points.frustumCulled = false
  points.visible = false
  points.renderOrder = 2
  points.name = 'snowfall'
  return points
}

/** What the frame loop drives (module-level, frame-owned; set by the effect below). */
const live = {
  meshes: [],
  cull: Infinity,
  trees: null,
  treeTiles: [],
  treeRange: 0,
  gondolas: null,
  line: null,
  lineLength: 0,
  snow: null,
  fade: 0,
  zone: null,
  frame: 0,
}
const _m = new Matrix4()
const _q = new Quaternion()
const _p = new Vector3()
const _s = new Vector3(1, 1, 1)
const _up = new Vector3(0, 1, 0)

/** Rewrites the pine instances from the tiles near the car. */
function cullTrees(car) {
  const t = live.trees
  const r2 = (live.treeRange + 85) ** 2
  const arr = t.instanceMatrix.array
  const cap = t.instanceMatrix.count
  let n = 0
  for (const tile of live.treeTiles) {
    if ((tile.x - car.x) ** 2 + (tile.z - car.z) ** 2 > r2) continue
    const k = Math.min(tile.count, cap - n)
    if (k <= 0) break
    arr.set(k === tile.count ? tile.matrices : tile.matrices.subarray(0, k * 16), n * 16)
    n += k
  }
  t.count = n
  t.instanceMatrix.needsUpdate = true
}

/** Gondolas along the cable line: half going up one cable, half coming down the other. */
function moveGondolas(t, car) {
  const g = live.gondolas
  const line = live.line
  const n = g.instanceMatrix.count
  // Far from the cable car: nothing to draw.
  const [lx, , lz] = line[Math.floor(line.length / 2)]
  if ((lx - car.x) ** 2 + (lz - car.z) ** 2 > (live.lineLength / 2 + 700) ** 2) {
    g.count = 0
    return
  }
  for (let k = 0; k < n; k += 1) {
    const dir = k % 2 ? 1 : -1
    let d = ((t * 4 + (k * live.lineLength) / n) % live.lineLength + live.lineLength) % live.lineLength
    if (dir < 0) d = live.lineLength - d
    // Walk the polyline to distance d.
    let i = 0
    while (i < line.length - 2 && d > line[i][4]) {
      d -= line[i][4]
      i += 1
    }
    const a = line[i]
    const b = line[i + 1]
    const u = Math.min(1, d / a[4])
    const off = 3.6 * dir
    _p.set(a[0] + (b[0] - a[0]) * u + Math.cos(a[3]) * off, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u + Math.sin(a[3]) * off)
    _q.setFromAxisAngle(_up, -a[3])
    g.setMatrixAt(k, _m.compose(_p, _q, _s))
  }
  g.count = n
  g.instanceMatrix.needsUpdate = true
}

function tickSnow(t, dt, camera) {
  const car = runtime.car.position
  live.frame += 1
  if (live.frame % 15 === 0) {
    for (const m of live.meshes) {
      const b = m.geometry.boundingSphere
      m.visible = Math.hypot(b.center.x - car.x, b.center.y - car.y, b.center.z - car.z) - b.radius < live.cull
    }
    if (live.trees) cullTrees(car)
  }
  if (live.gondolas && live.line) moveGondolas(t, car)
  if (live.snow) {
    const sec = runtime.race.section
    const want = live.zone && sec >= live.zone.from && sec <= live.zone.to ? 1 : 0
    live.fade += Math.sign(want - live.fade) * Math.min(Math.abs(want - live.fade), Math.min(dt, 0.1) * 0.5)
    const u = live.snow.material.uniforms
    u.uFade.value = live.fade
    u.uTime.value = t
    u.uCam.value.copy(camera.position)
    live.snow.visible = live.fade > 0.01
  }
}

export default function SnowZoneScenery({ stage, zone }) {
  const scene = useThree((s) => s.scene)
  const density = useQuality((s) => s.settings.sceneryDensity)
  const viewDistance = useQuality((s) => s.settings.viewDistance)
  const fogNear = useQuality((s) => s.settings.fogNear)
  const particles = useQuality((s) => s.settings.particles)
  const realtime = useQuality((s) => s.settings.shadows === 'realtime')

  useEffect(() => {
    const low = density < 0.6
    const high = viewDistance >= 560
    const world = buildSnowWorld(zoneView(stage, zone.id), { density })
    const material = getWorldMaterial()
    const meshes = world.chunks.map(({ key, geometry }) => {
      const m = new Mesh(geometry, material)
      m.name = `snow-${key}`
      m.matrixAutoUpdate = false
      m.receiveShadow = realtime
      scene.add(m)
      return m
    })
    live.meshes = meshes
    live.cull = low ? fogNear + (viewDistance * 0.95 - fogNear) * 0.85 : viewDistance
    live.zone = zone
    ground.at = world.heightAt

    // Pines: one instanced draw, rewritten from the tiles near the car.
    const treeGeo = treeGeometry()
    const trees = new InstancedMesh(treeGeo, material, low ? 420 : high ? 1600 : 900)
    trees.count = 0
    trees.frustumCulled = false
    trees.name = 'snow-pines'
    scene.add(trees)
    live.trees = trees
    live.treeTiles = world.trees
    live.treeRange = low ? 170 : high ? 360 : 260
    live.frame = 14

    // Gondolas on the cable car.
    let gondolas = null
    if (world.cable) {
      const line = world.cable.map((p, k) => {
        const n = world.cable[Math.min(world.cable.length - 1, k + 1)]
        return [p[0], p[1], p[2], p[3], Math.hypot(n[0] - p[0], n[1] - p[1], n[2] - p[2])]
      })
      live.line = line
      live.lineLength = line.reduce((a, p) => a + p[4], 0)
      gondolas = new InstancedMesh(gondolaGeometry(), material, low ? 6 : high ? 16 : 12)
      gondolas.count = 0
      gondolas.frustumCulled = false
      gondolas.name = 'snow-gondolas'
      scene.add(gondolas)
      live.gondolas = gondolas
    }

    // Snowfall (MEDIUM / HIGH: the preset's particles).
    const snow = particles ? buildSnowfall(high ? 1800 : 900) : null
    if (snow) scene.add(snow)
    live.snow = snow
    live.fade = 0

    return () => {
      for (const m of meshes) {
        scene.remove(m)
        m.geometry.dispose()
      }
      scene.remove(trees)
      trees.dispose()
      treeGeo.dispose()
      if (gondolas) {
        scene.remove(gondolas)
        gondolas.geometry.dispose()
        gondolas.dispose()
      }
      if (snow) {
        scene.remove(snow)
        snow.geometry.dispose()
        snow.material.dispose()
      }
      if (ground.at === world.heightAt) ground.at = null
      Object.assign(live, { meshes: [], trees: null, treeTiles: [], gondolas: null, line: null, snow: null, zone: null })
    }
  }, [scene, stage, zone, density, viewDistance, fogNear, particles, realtime])

  useFrame((state, dt) => tickSnow(state.clock.elapsedTime, dt, state.camera))

  return null
}
