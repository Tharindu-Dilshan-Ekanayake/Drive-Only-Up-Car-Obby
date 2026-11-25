import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Color, Mesh, Quaternion, Vector3 } from 'three'

import { useQuality } from '../../../store/quality'
import { carLights } from '../../fx/carLights'
import { getWorldMaterial } from '../../render/worldMaterial'
import { buildSignMesh, fontReady } from '../../render/signs'
import { runtime } from '../../runtime'
import { night } from '../nightLight'
import { buildHeatCity } from '../heat/heatGeometry'
import Police from '../heat/Police.jsx'

/**
 * Heat Run's scenery (props `{ stage, info }`, like every scenery module): Rustport - the
 * yards, warehouses and blocks along the route, the tunnels, alleys, construction site,
 * rail yard, drawbridge towers, car park and safehouse (world/heat/heatGeometry.js), street
 * lights and billboards - and the mode itself: the police (world/heat/Police.jsx), mounted
 * from here so the map's chunk carries everything Heat Run needs.
 *
 * One draw per 200 m tile (culled out of view by the renderer, and every 15 frames
 * hidden past the fog) plus one for every billboard / sign; after dark the street lights
 * near you add warm pools on the road (the shared night-lights batch, no extra draw).
 * Presets: LOW has ~45% of the
 * buildings, no skyline, no fire escapes or roof clutter, a 512 px sign atlas; MEDIUM
 * 75%; HIGH all. Unmounting (travel) disposes every geometry and texture it made.
 */

/** What the frame loop culls (module-level, frame-owned; set by the effect below). */
const live = { meshes: [], cull: Infinity, frame: 0, lamps: null }
const LAMP_RANGE = 110
const LAMP_COLOR = new Color('#ffcf8a')
const _lp = new Vector3()
const _lq = new Quaternion()

/** After dark, the street lights near you throw a warm pool on the road (night-lights batch). */
function lampPools() {
  const lamps = live.lamps
  const k = night.lamps
  if (!lamps || k < 0.05) return
  const car = runtime.car.position
  for (let i = 0; i < lamps.length; i += 6) {
    const dx = lamps[i + 3] - car.x
    const dz = lamps[i + 5] - car.z
    if (dx * dx + dz * dz > LAMP_RANGE * LAMP_RANGE || Math.abs(lamps[i + 4] - car.y) > 30) continue
    _lp.set(lamps[i + 3], lamps[i + 4], lamps[i + 5])
    carLights.poolAt(_lp, _lq, 8, 8, LAMP_COLOR, 0.28 * k)
    _lp.set(lamps[i], lamps[i + 1], lamps[i + 2])
    carLights.glowAt(_lp, 1.6, LAMP_COLOR, 0.45 * k)
  }
}

function tickHeat() {
  lampPools()
  live.frame += 1
  if (live.frame % 15 !== 0) return
  const car = runtime.car.position
  for (const m of live.meshes) {
    const b = m.geometry.boundingSphere
    const d = Math.hypot(b.center.x - car.x, b.center.y - car.y, b.center.z - car.z) - b.radius
    m.visible = d < live.cull
  }
}

export default function HeatScenery({ stage }) {
  const scene = useThree((s) => s.scene)
  const density = useQuality((s) => s.settings.sceneryDensity)
  const maxTexture = useQuality((s) => s.settings.maxTexture)
  const viewDistance = useQuality((s) => s.settings.viewDistance)
  const fogNear = useQuality((s) => s.settings.fogNear)
  const realtime = useQuality((s) => s.settings.shadows === 'realtime')

  useEffect(() => {
    const low = density < 0.6
    const city = buildHeatCity(stage, { density, detail: !low })
    const material = getWorldMaterial()
    const meshes = city.chunks.map(({ key, geometry }) => {
      const m = new Mesh(geometry, material)
      m.name = `heat-${key}`
      m.matrixAutoUpdate = false
      m.receiveShadow = realtime
      scene.add(m)
      return m
    })
    live.meshes = meshes
    live.lamps = city.lamps
    live.cull = low ? fogNear + (viewDistance * 0.95 - fogNear) * 0.8 : viewDistance
    let signs = null
    let cancelled = false
    fontReady().then(() => {
      if (cancelled || !city.signs.length) return
      signs = buildSignMesh(city.signs, maxTexture)
      signs.mesh.name = 'heat-billboards'
      scene.add(signs.mesh)
    })
    return () => {
      cancelled = true
      live.meshes = []
      live.lamps = null
      for (const m of meshes) {
        scene.remove(m)
        m.geometry.dispose()
      }
      if (signs) {
        scene.remove(signs.mesh)
        signs.dispose()
      }
    }
  }, [scene, stage, density, maxTexture, viewDistance, fogNear, realtime])

  useFrame(tickHeat)

  return <Police stage={stage} />
}
