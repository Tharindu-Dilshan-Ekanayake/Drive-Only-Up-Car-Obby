import { useFrame } from '@react-three/fiber'
import { useEffect } from 'react'
import { InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, Vector3 } from 'three'

import { runtime } from '../runtime'

/**
 * Tyre marks: while you drift, brake hard or handbrake, each rear tyre lays a strip of
 * flat quads on the road. A fixed ring of segments (the oldest are reused), one draw
 * call, nothing allocated after start-up.
 */

const POOL = 260
const MIN_STEP = 0.7
const _m = new Matrix4()
const _x = new Vector3()
const _y = new Vector3()
const _z = new Vector3()
const _mid = new Vector3()
const _scale = new Vector3()

let system = null

function createSystem() {
  const geometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
  const material = new MeshBasicMaterial({
    color: '#1d2026',
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  const mesh = new InstancedMesh(geometry, material, POOL)
  mesh.count = 0
  mesh.frustumCulled = false
  mesh.renderOrder = 1
  const last = [new Vector3(), new Vector3()]
  const state = { next: 0, used: 0, active: false }

  function update() {
    const car = runtime.car
    if (!car.skidding) {
      state.active = false
      return
    }
    for (let i = 0; i < 2; i += 1) {
      const p = car.rearWheels[i]
      if (!state.active) {
        last[i].copy(p)
        continue
      }
      const len = p.distanceTo(last[i])
      if (len < MIN_STEP) continue
      if (len > 6) {
        // Teleported or flew: start a new strip.
        last[i].copy(p)
        continue
      }
      // A quad from the last point to this one, lying flat on the road.
      _z.subVectors(p, last[i]).normalize()
      _y.set(0, 1, 0).applyQuaternion(car.quaternion)
      _x.crossVectors(_y, _z).normalize()
      _y.crossVectors(_z, _x)
      _mid.addVectors(p, last[i]).multiplyScalar(0.5)
      _m.makeBasis(_x, _y, _z).scale(_scale.set(0.32, 1, len + 0.05)).setPosition(_mid)
      mesh.setMatrixAt(state.next, _m)
      state.next = (state.next + 1) % POOL
      state.used = Math.min(POOL, state.used + 1)
      last[i].copy(p)
    }
    state.active = true
    mesh.count = state.used
    mesh.instanceMatrix.needsUpdate = true
  }

  function dispose() {
    geometry.dispose()
    material.dispose()
  }

  return { mesh, update, dispose }
}

export default function SkidMarks() {
  system ||= createSystem()
  useEffect(() => () => system.dispose(), [])
  useFrame(() => system.update())
  return <primitive object={system.mesh} />
}
