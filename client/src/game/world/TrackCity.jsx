import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Mesh } from 'three'

import { useQuality } from '../../store/quality'
import { buildBannerMesh, isResortArt } from '../render/banners'
import { fontReady } from '../render/signs'
import { getWorldMaterial } from '../render/worldMaterial'
import { buildTrackCity } from './cityGeometry'

/**
 * The towers along the current map's track (cityGeometry.js): one mesh per chunk of sections, so the
 * renderer culls the chunks out of view, and one billboard mesh sharing the harbour's
 * atlas. How many buildings follows the preset's scenery density; LOW also drops the
 * rooftop clutter and spires.
 */
export default function TrackCity({ stage }) {
  const scene = useThree((s) => s.scene)
  const density = useQuality((s) => s.settings.sceneryDensity)
  const maxTexture = useQuality((s) => s.settings.maxTexture)
  const realtime = useQuality((s) => s.settings.shadows === 'realtime')

  useEffect(() => {
    const city = buildTrackCity(stage, density, density >= 0.6)
    const meshes = city.chunks.map(({ chunk, geometry }) => {
      const m = new Mesh(geometry, getWorldMaterial())
      m.name = `city-${chunk}`
      m.matrixAutoUpdate = false
      m.receiveShadow = realtime
      return m
    })
    for (const m of meshes) scene.add(m)
    // Billboards: the town atlas, and the resort towers' rooftop signs in their own small one.
    let banners = null
    let signs = null
    let cancelled = false
    fontReady().then(() => {
      if (cancelled) return
      const ads = city.banners.filter((b) => !isResortArt(b.art))
      const resortSigns = city.banners.filter((b) => isResortArt(b.art))
      if (ads.length) {
        banners = buildBannerMesh(ads, Math.min(1024, maxTexture))
        scene.add(banners.mesh)
      }
      if (resortSigns.length) {
        signs = buildBannerMesh(resortSigns, Math.min(1024, maxTexture), 'resort')
        scene.add(signs.mesh)
      }
    })
    return () => {
      cancelled = true
      for (const m of meshes) {
        scene.remove(m)
        m.geometry.dispose()
      }
      if (banners) {
        scene.remove(banners.mesh)
        banners.dispose()
      }
      if (signs) {
        scene.remove(signs.mesh)
        signs.dispose()
      }
    }
  }, [scene, stage, density, maxTexture, realtime])

  return null
}
