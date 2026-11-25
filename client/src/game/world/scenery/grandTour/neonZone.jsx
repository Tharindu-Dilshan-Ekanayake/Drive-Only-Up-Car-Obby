import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Mesh } from 'three'

import { useQuality } from '../../../../store/quality'
import { fontReady } from '../../../render/signs'
import { runtime } from '../../../runtime'
import { buildNeonCity } from '../../neon/neonCityGeometry'
import { disposeNeonMaterial, getNeonMaterial, tickNeonMaterial } from '../../neon/neonMaterial'
import { buildNeonSignMesh } from '../../neon/neonSigns'
import { buildSearchlights } from '../../neon/searchlights'
import { zoneView } from '../../zoneView'

/**
 * The Grand Tour's Neon City zone scenery (props `{ stage, info, zone }`, see ../grandTour.jsx):
 * built only round the zone's own sections (zoneView) - the towers along the coiling
 * highway, the set pieces round the road (plaza rooftops, the Rooftop Leap's towers, the
 * Laser Grid's tunnel tower, the helix core, neon rings, the Sky Bridge's pylons; read from
 * `stage.decor.neon`), the city grid far below with its low-rise blocks, rooftop signs,
 * holograms and searchlights (world/neon/*). One draw per tile (culled out of view and past
 * the fog), plus the ground, the signs, the holograms and the beams: one draw each.
 *
 * Presets: LOW has ~45% of the towers without bands, spires or rooftop clutter, no low-rise
 * blocks, no holograms and no searchlights, a 512 px sign atlas; MEDIUM adds the blocks and
 * holograms and 8 searchlights; HIGH every tower and 16 searchlights. Unmounting (travel)
 * disposes every geometry, material and texture it made.
 */

/** What the frame loop animates and culls (module-level, frame-owned; set by the effect below). */
const live = { holos: null, beams: null, meshes: [], ground: null, cull: Infinity, frame: 0 }

/**
 * Animates the patterns, holograms and beams; every 15 frames hides the scenery tiles
 * wholly further than `live.cull` from the car (lost in the fog anyway) - the ground too
 * once the car is far out in another zone.
 */
function tickNeon(t) {
  tickNeonMaterial(t)
  live.holos?.tick(t)
  live.beams?.tick(t)
  live.frame += 1
  if (live.frame % 15 !== 0) return
  const car = runtime.car.position
  for (const m of live.meshes) {
    const b = m.geometry.boundingSphere
    const d = Math.hypot(b.center.x - car.x, b.center.y - car.y, b.center.z - car.z) - b.radius
    m.visible = d < live.cull
  }
  const far = live.meshes.length > 0 && live.meshes.every((m) => !m.visible)
  if (live.ground) live.ground.visible = !far
  if (live.holos) live.holos.mesh.visible = !far
  if (live.beams) live.beams.mesh.visible = !far
}

export default function NeonZoneScenery({ stage, zone }) {
  const scene = useThree((s) => s.scene)
  const density = useQuality((s) => s.settings.sceneryDensity)
  const maxTexture = useQuality((s) => s.settings.maxTexture)
  const viewDistance = useQuality((s) => s.settings.viewDistance)
  const fogNear = useQuality((s) => s.settings.fogNear)
  const realtime = useQuality((s) => s.settings.shadows === 'realtime')

  useEffect(() => {
    const low = density < 0.6
    const view = zoneView(stage, zone.id)
    const city = buildNeonCity(view, { density, detail: !low, lowRise: !low })
    const material = getNeonMaterial()
    const meshes = city.chunks.map(({ key, geometry }) => {
      const m = new Mesh(geometry, material)
      m.name = `neon-${key}`
      m.matrixAutoUpdate = false
      m.receiveShadow = realtime
      return m
    })
    const ground = new Mesh(city.ground, material)
    ground.name = 'neon-ground'
    ground.matrixAutoUpdate = false
    for (const m of meshes) scene.add(m)
    // Tiles past the fog's far end (LOW: past 80% of the way into it) are hidden.
    live.meshes = [...meshes]
    live.ground = ground
    live.cull = low ? fogNear + (viewDistance * 0.95 - fogNear) * 0.8 : viewDistance
    meshes.push(ground)
    scene.add(ground)

    // Searchlights (MEDIUM: the 8 tallest roofs' beams, HIGH: 16).
    const nBeams = viewDistance >= 560 ? 16 : low ? 0 : 8
    const beams = nBeams ? buildSearchlights(city.beams.slice(0, nBeams), [fogNear, viewDistance * 0.95]) : null
    if (beams) scene.add(beams.mesh)
    live.beams = beams

    // Rooftop signs and holograms (once the font is in, so the atlas isn't painted in a fallback face).
    let signs = null
    let holos = null
    let cancelled = false
    fontReady().then(() => {
      if (cancelled) return
      if (city.signs.length) {
        signs = buildNeonSignMesh(city.signs, 'sign', maxTexture)
        scene.add(signs.mesh)
      }
      if (!low && city.holos.length) {
        holos = buildNeonSignMesh(city.holos, 'holo', maxTexture, [fogNear, viewDistance * 0.95])
        scene.add(holos.mesh)
        live.holos = holos
      }
    })
    return () => {
      cancelled = true
      live.holos = null
      live.beams = null
      live.meshes = []
      live.ground = null
      for (const m of meshes) {
        scene.remove(m)
        m.geometry.dispose()
      }
      for (const s of [signs, holos, beams]) {
        if (!s) continue
        scene.remove(s.mesh)
        s.dispose()
      }
      disposeNeonMaterial()
    }
  }, [scene, stage, zone, density, maxTexture, viewDistance, fogNear, realtime])

  useFrame((state) => tickNeon(state.clock.elapsedTime))

  return null
}
