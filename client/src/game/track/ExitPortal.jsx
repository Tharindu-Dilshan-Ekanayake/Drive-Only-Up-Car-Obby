import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Mesh } from 'three'

import { EXIT_PORTAL } from '@shared/chapters'
import { isStageUnlocked } from '@shared/logic'
import { stageInfo } from '@shared/stages/index'

import { useGame } from '../../store/game'
import { acquirePortalMaterial, buildPortalGeometry, releasePortalMaterial, tickPortalFx } from '../world/portalFx'

/** Drawn within this many metres of the camera (it's 4 triangles, but off is free). */
const CULL_RANGE = 350

/**
 * The exit portal's swirl and pad on a finish plaza (`stage.exitPortal`, shared/chapters.js):
 * the lobby portal's glow (world/portalFx.js) in the next chapter's colours - one mesh,
 * one draw call, 4 triangles. The arch is part of the finish section's mesh
 * (buildTrack.js), its sign in the stage's sign atlas (Stage.jsx). Locked look until that
 * chapter is open for you (finishing here opens it). Driving onto the pad travels
 * (game/ticker.js pad 'exit:<id>', game/stageRuntime.js).
 */
export default function ExitPortal({ portal }) {
  const scene = useThree((s) => s.scene)
  const locked = useGame((s) => !isStageUnlocked(s.profile, portal.to))
  const meshRef = useRef(null)

  // The shared material for as long as the stage is mounted (an unlock only rebuilds the geometry).
  useEffect(() => {
    acquirePortalMaterial()
    return releasePortalMaterial
  }, [])

  useEffect(() => {
    const material = acquirePortalMaterial()
    const geometry = buildPortalGeometry([{ ...portal, info: stageInfo(portal.to), locked }], EXIT_PORTAL)
    const mesh = new Mesh(geometry, material)
    mesh.name = 'exit-portal'
    mesh.matrixAutoUpdate = false
    mesh.renderOrder = 1
    scene.add(mesh)
    meshRef.current = mesh
    return () => {
      scene.remove(mesh)
      geometry.dispose()
      releasePortalMaterial()
      meshRef.current = null
    }
  }, [scene, portal, locked])

  useFrame(({ camera, clock }) => {
    tickPortalFx(clock.elapsedTime)
    const mesh = meshRef.current
    if (!mesh) return
    const c = camera.position
    const dx = c.x - portal.x
    const dy = c.y - portal.y
    const dz = c.z - portal.z
    mesh.visible = dx * dx + dy * dy + dz * dz < CULL_RANGE * CULL_RANGE
  })

  return null
}
