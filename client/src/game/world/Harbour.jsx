import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Color, InstancedMesh, Matrix4, Mesh } from 'three'

import { useQuality } from '../../store/quality'
import { buildBannerMesh, isResortArt } from '../render/banners'
import { fontReady } from '../render/signs'
import { getWorldMaterial } from '../render/worldMaterial'
import { buildCabin, buildHarbour, buildSkyline, buildWheel, WHEEL } from './harbourGeometry'

/**
 * The harbour town around Pier Zero (see harbourGeometry.js): the town (one draw), its
 * billboards (one draw, one atlas), the far skyline on presets that can see that far
 * (one draw) and the Harbour Wheel (rim + cabins, two draws) turning slowly.
 *
 * LOW drops the rooftop clutter, half the trees, the boats and the skyline, and the
 * billboard atlas is 512 px.
 */

const CABIN_COLORS = ['#ffc41f', '#ff4a3d', '#1fb5c9', '#7cf25a', '#ff7a1a', '#8a5cf6'].map((h) => new Color(h))
/** Wheel speed, rad/s (a lap every ~3.5 minutes). */
const SPIN = 0.03

/** The turning wheel: rim mesh and cabins, posed from `angle` (module-level, frame-owned). */
const wheel = { rim: null, cabins: null, angle: 0 }
const _m = new Matrix4()

function poseWheel(dt) {
  if (!wheel.rim) return
  wheel.angle += dt * SPIN
  wheel.rim.rotation.x = wheel.angle
  const n = WHEEL.cabins
  for (let i = 0; i < n; i += 1) {
    const a = wheel.angle + (i / n) * Math.PI * 2
    // Cabins hang from the rim and stay level.
    _m.makeTranslation(WHEEL.x, WHEEL.y + Math.cos(a) * WHEEL.r, WHEEL.z + Math.sin(a) * WHEEL.r)
    wheel.cabins.setMatrixAt(i, _m)
  }
  wheel.cabins.instanceMatrix.needsUpdate = true
}

export default function Harbour() {
  const scene = useThree((s) => s.scene)
  const detail = useQuality((s) => s.settings.sceneryDensity >= 0.6)
  const farView = useQuality((s) => s.settings.viewDistance >= 500)
  const maxTexture = useQuality((s) => s.settings.maxTexture)

  // The town and its billboards.
  useEffect(() => {
    const { geometry, banners: placements } = buildHarbour(detail)
    const town = new Mesh(geometry, getWorldMaterial())
    town.name = 'harbour'
    town.matrixAutoUpdate = false
    scene.add(town)
    let banners = null
    let signs = null
    let cancelled = false
    fontReady().then(() => {
      if (cancelled) return
      banners = buildBannerMesh(placements.filter((b) => !isResortArt(b.art)), Math.min(1024, maxTexture))
      scene.add(banners.mesh)
      const resortSigns = placements.filter((b) => isResortArt(b.art))
      if (resortSigns.length) {
        signs = buildBannerMesh(resortSigns, Math.min(1024, maxTexture), 'resort')
        scene.add(signs.mesh)
      }
    })
    return () => {
      cancelled = true
      scene.remove(town)
      geometry.dispose()
      if (banners) {
        scene.remove(banners.mesh)
        banners.dispose()
      }
      if (signs) {
        scene.remove(signs.mesh)
        signs.dispose()
      }
    }
  }, [scene, detail, maxTexture])

  // The far skyline, only where the view reaches it.
  useEffect(() => {
    if (!farView) return undefined
    const { geometry } = buildSkyline()
    const mesh = new Mesh(geometry, getWorldMaterial())
    mesh.name = 'skyline'
    mesh.matrixAutoUpdate = false
    scene.add(mesh)
    return () => {
      scene.remove(mesh)
      geometry.dispose()
    }
  }, [scene, farView])

  // The Harbour Wheel.
  useEffect(() => {
    const rimGeo = buildWheel()
    const rim = new Mesh(rimGeo, getWorldMaterial())
    rim.name = 'harbour-wheel'
    rim.position.set(WHEEL.x, WHEEL.y, WHEEL.z)
    const cabinGeo = buildCabin()
    const cabins = new InstancedMesh(cabinGeo, getWorldMaterial(), WHEEL.cabins)
    cabins.name = 'wheel-cabins'
    cabins.frustumCulled = false
    for (let i = 0; i < WHEEL.cabins; i += 1) cabins.setColorAt(i, CABIN_COLORS[i % CABIN_COLORS.length])
    scene.add(rim, cabins)
    wheel.rim = rim
    wheel.cabins = cabins
    poseWheel(0)
    return () => {
      scene.remove(rim, cabins)
      rimGeo.dispose()
      cabinGeo.dispose()
      cabins.dispose()
      wheel.rim = null
      wheel.cabins = null
    }
  }, [scene])

  useFrame((_, dt) => poseWheel(Math.min(dt, 0.1)))

  return null
}
