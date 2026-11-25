import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'

import { createPolice } from './policeSim'
import { disposePoliceModels } from './policeModels'

/**
 * Mounts Heat Run's police (./policeSim.js) for `stage`: made in an effect (not during
 * render), stepped every frame, torn down - meshes, bodies, triggers, siren - on unmount.
 * The sim lives in a module-level slot the frame loop reads (no React state per frame).
 * With ?debug it's on `window.__heat` (spawn, setHeat, fire, units...) for the checks.
 */

const live = { police: null }

export default function Police({ stage }) {
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)

  useEffect(() => {
    const police = createPolice(stage, scene)
    live.police = police
    // Shader programs for the chase are built now (behind the loading screen), not mid-chase.
    police.warm(gl, camera)
    const debug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')
    if (debug) window.__heat = police.debug
    return () => {
      live.police = null
      police.dispose()
      disposePoliceModels()
      if (debug) delete window.__heat
    }
  }, [stage, scene, gl, camera])

  useFrame((_, dt) => live.police?.update(dt))

  return null
}
