import { useFrame } from '@react-three/fiber'
import { useEffect } from 'react'
import { BufferAttribute, BufferGeometry, DoubleSide, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from 'three'

import { useQuality } from '../../store/quality'
import { runtime } from '../runtime'

/**
 * Seagulls wheeling above the harbour near you: three small flocks circling points
 * that drift along with your car, wings flapping in the vertex shader (per-instance
 * phase). One draw call for every bird.
 */

const MAX = 18
const _m = new Matrix4()
const _q = new Quaternion()
const _p = new Vector3()
const _s = new Vector3()
const UP = new Vector3(0, 1, 0)

/** A flat gull: two swept wings and a body, nose towards -Z. Wing tips have |x| near 1. */
function birdGeometry() {
  const v = [
    -0.12, 0, -0.1, -1.1, 0.05, 0.15, -0.12, 0, 0.25,
    0.12, 0, -0.1, 0.12, 0, 0.25, 1.1, 0.05, 0.15,
    0, 0.04, -0.55, -0.12, 0, 0.3, 0.12, 0, 0.3,
  ]
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(v), 3))
  return g
}

let system = null

function createSystem() {
  const material = new MeshBasicMaterial({ color: '#f4f7fb', side: DoubleSide })
  const uniforms = { uTime: { value: 0 } }
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
float wing = smoothstep(0.1, 1.1, abs(transformed.x));
transformed.y += sin(uTime * 9.0 + float(gl_InstanceID) * 1.7) * wing * 0.55;`,
    )
  }
  material.customProgramCacheKey = () => 'uwd-gull'
  const mesh = new InstancedMesh(birdGeometry(), material, MAX)
  mesh.count = 0
  mesh.frustumCulled = false
  const birds = Array.from({ length: MAX }, (_, i) => ({
    flock: i % 3,
    angle: (i / MAX) * Math.PI * 2 * 3.1,
    radius: 14 + ((i * 7) % 11),
    height: 12 + ((i * 5) % 9),
    speed: 0.35 + ((i * 3) % 5) * 0.05,
  }))
  // Flock centres trail your car, so there are always gulls about.
  const centres = [new Vector3(), new Vector3(), new Vector3()]
  const offsets = [new Vector3(-30, 0, -40), new Vector3(45, 6, 10), new Vector3(-15, 12, 55)]

  function update(time, dt, count) {
    const car = runtime.car.position
    for (let f = 0; f < 3; f += 1) {
      _p.copy(car).add(offsets[f])
      if (centres[f].lengthSq() === 0 || centres[f].distanceToSquared(_p) > 250 * 250) centres[f].copy(_p)
      else centres[f].lerp(_p, Math.min(1, dt * 0.25))
    }
    for (let i = 0; i < count; i += 1) {
      const b = birds[i]
      b.angle += b.speed * dt
      const c = centres[b.flock]
      _p.set(c.x + Math.cos(b.angle) * b.radius, c.y + b.height + Math.sin(time * 0.7 + i) * 1.5, c.z + Math.sin(b.angle) * b.radius)
      // Flying along the circle (its tangent).
      _q.setFromAxisAngle(UP, -b.angle)
      _s.setScalar(1.3)
      _m.compose(_p, _q, _s)
      mesh.setMatrixAt(i, _m)
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
    uniforms.uTime.value = time
  }

  function dispose() {
    mesh.geometry.dispose()
    material.dispose()
  }

  return { mesh, update, dispose }
}

export default function Seagulls() {
  const count = useQuality((s) => (s.level === 'LOW' ? 6 : s.level === 'MEDIUM' ? 12 : MAX))
  system ||= createSystem()
  useEffect(() => () => system.dispose(), [])
  useFrame((state, dt) => system.update(state.clock.elapsedTime, Math.min(dt, 0.05), count))
  return <primitive object={system.mesh} />
}
