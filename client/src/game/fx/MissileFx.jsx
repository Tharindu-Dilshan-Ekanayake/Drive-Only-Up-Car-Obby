import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'

import { createMissileSystem } from './missiles'

/**
 * Mounts the Rocket Missile system (./missiles.js): its two instanced meshes, its frame
 * step and the hooks the rest of the game fires through (./missileHub.js). A lazy chunk
 * (GameScene.jsx), loaded once the lobby is up.
 */

/** The one missile system (module-level: a single pool, mutated every frame). */
let system = null

export default function MissileFx() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  system ||= createMissileSystem()
  useEffect(() => {
    const uninstall = system.install()
    // Both meshes are hidden while idle, so their shader programs would first build in the
    // frame of the first launch: build them now (compileAsync gathers the visible objects
    // synchronously, so they are shown for the call only).
    const { bodyMesh, glow } = system
    bodyMesh.visible = true
    glow.visible = true
    gl.compileAsync(scene, camera).catch(() => {})
    bodyMesh.visible = false
    glow.visible = false
    return () => {
      uninstall()
      system.dispose()
    }
  }, [gl, scene, camera])
  useFrame((_, dt) => system.update(dt))
  return (
    <>
      <primitive object={system.bodyMesh} />
      <primitive object={system.glow} />
    </>
  )
}
