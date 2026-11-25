import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { Color, Mesh } from 'three'

import { DECK_Y, START_GATE } from '@shared/lobby'

import { startBarrier } from '../physics/instance'
import { MeshBuilder } from '../render/meshBuilder'
import { getWorldMaterial, PATTERN } from '../render/worldMaterial'

/**
 * The Start gate's boom: a hazard-striped bar across the gate while its barrier is shut
 * (physics/instance.js startBarrier - the map's track is still being prepared, or there is
 * none yet), lifting with a little bounce the moment it opens (StageWarmup) and dropping
 * again when the map goes. One small mesh with the world material (no extra program).
 */

const POST = START_GATE.width / 2 + 0.2
const LENGTH = POST * 2
const OPEN = 1.38
const live = { angle: 0, speed: 0 }

function boomGeometry() {
  const mb = new MeshBuilder()
  const yellow = new Color('#ffc41f')
  const dark = new Color('#24282e')
  mb.box([LENGTH / 2, 0, 0], [LENGTH / 2, 0.17, 0.17], [1, 0, 0], [0, 1, 0], [0, 0, 1], { side: yellow, top: yellow, end: yellow, bottom: yellow }, { side: PATTERN.HAZARD, top: PATTERN.HAZARD, bottom: PATTERN.HAZARD }, { along: [1, 0, 0] })
  // Counterweight at the pivot, a glowing tip at the far end.
  mb.box([-0.35, 0, 0], [0.45, 0.32, 0.3], [1, 0, 0], [0, 1, 0], [0, 0, 1], { side: dark, top: dark, end: dark, bottom: dark })
  mb.box([LENGTH - 0.15, 0, 0], [0.15, 0.22, 0.22], [1, 0, 0], [0, 1, 0], [0, 0, 1], { side: new Color('#ff4a3d'), top: new Color('#ff4a3d'), end: new Color('#ff4a3d') }, { side: PATTERN.PULSE, top: PATTERN.PULSE, end: PATTERN.PULSE })
  return mb.build()
}

/** Springs the boom towards shut (0) or open; a slight overshoot reads as a flourish. */
function tickBoom(mesh, dt) {
  const target = startBarrier.enabled ? 0 : OPEN
  const k = 38
  const damping = 7.5
  live.speed += ((target - live.angle) * k - live.speed * damping) * dt
  live.angle += live.speed * dt
  if (live.angle < 0) {
    live.angle = 0
    live.speed = 0
  }
  mesh.rotation.z = live.angle
  mesh.updateMatrix()
}

export default function StartGateBar() {
  const scene = useThree((s) => s.scene)
  const mesh = useMemo(() => {
    const m = new Mesh(boomGeometry(), getWorldMaterial())
    m.name = 'start-gate-boom'
    m.position.set(START_GATE.x - POST, DECK_Y + 1.15, START_GATE.z - 0.6)
    m.matrixAutoUpdate = false
    m.updateMatrix()
    return m
  }, [])
  useEffect(() => {
    scene.add(mesh)
    return () => {
      scene.remove(mesh)
      mesh.geometry.dispose()
    }
  }, [scene, mesh])
  useFrame((_, dt) => tickBoom(mesh, Math.min(dt, 0.05)))
  return null
}
