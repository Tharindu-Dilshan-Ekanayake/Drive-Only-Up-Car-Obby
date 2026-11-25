import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'

import { runtime } from '../runtime'

/**
 * Third-person chase camera. Follows a smoothed heading (so flips and spins don't whip
 * the view round), pulls back and widens the lens with speed and boost, shakes on
 * hits, and lets you drag with the mouse to look around (it eases back behind you).
 */

const DISTANCE = 8.2
const HEIGHT = 3.3
const LOOK_AHEAD = 5
const BOOST_FOV = 10
const SPEED_FOV = 8

const _target = new Vector3()
const _desired = new Vector3()
const _look = new Vector3()
const _fwd = new Vector3()

/** 60 degrees landscape; wider when the screen is held upright. */
const fovForAspect = (aspect) => (aspect >= 1 ? 62 : Math.min(86, 62 / Math.sqrt(Math.max(0.3, aspect))))

export default function ChaseCamera() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const state = useRef({ heading: 0, fov: 62, look: new Vector3(), drag: null })

  // Mouse drag to look around (touch screens use the on-screen controls instead).
  useEffect(() => {
    const el = gl.domElement
    const s = state.current
    const down = (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      s.drag = { x: e.clientX, y: e.clientY }
    }
    const move = (e) => {
      if (!s.drag) return
      runtime.camera.yawOffset -= (e.clientX - s.drag.x) * 0.006
      runtime.camera.pitchOffset = Math.max(-0.35, Math.min(0.9, runtime.camera.pitchOffset + (e.clientY - s.drag.y) * 0.004))
      s.drag = { x: e.clientX, y: e.clientY }
    }
    const up = () => {
      s.drag = null
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [gl])

  useEffect(() => {
    runtime.camera.object = camera
    return () => {
      runtime.camera.object = null
    }
  }, [camera])

  useFrame((frame, rawDt) => follow(frame.camera, frame.size, state.current, Math.min(rawDt, 0.05)))

  return null
}

/** One frame of camera work (outside the component: it mutates the camera). */
function follow(camera, size, s, dt) {
  const car = runtime.car
  const cam = runtime.camera

  // Heading: the car's when grounded, its direction of travel in the air.
  _fwd.set(0, 0, -1).applyQuaternion(car.quaternion)
  let heading = Math.atan2(-_fwd.x, -_fwd.z)
  const flat = Math.hypot(car.velocity.x, car.velocity.z)
  if (!car.grounded && flat > 4) heading = Math.atan2(-car.velocity.x, -car.velocity.z)
  let dh = heading - s.heading
  while (dh > Math.PI) dh -= Math.PI * 2
  while (dh < -Math.PI) dh += Math.PI * 2
  s.heading += dh * Math.min(1, dt * (car.grounded ? 5 : 2.2))

  if (!s.drag) {
    cam.yawOffset *= 1 - Math.min(1, dt * 1.5)
    cam.pitchOffset *= 1 - Math.min(1, dt * 1.5)
  }
  const yaw = s.heading + cam.yawOffset
  const speed = Math.abs(car.speedKmh) / 3.6
  const dist = DISTANCE + Math.min(3, speed * 0.06) + (car.boosting ? 1 : 0)
  const pitchLift = cam.pitchOffset * dist
  _target.copy(car.position)
  _desired.set(_target.x + Math.sin(yaw) * dist, _target.y + HEIGHT + pitchLift, _target.z + Math.cos(yaw) * dist)
  _look.set(_target.x - Math.sin(s.heading) * LOOK_AHEAD, _target.y + 1.2, _target.z - Math.cos(s.heading) * LOOK_AHEAD)

  if (cam.snap) {
    cam.snap = false
    camera.position.copy(_desired)
    s.look.copy(_look)
    s.heading = heading
  } else {
    const k = 1 - Math.exp(-dt * 7)
    camera.position.lerp(_desired, k)
    // Never sink below the car's deck level by much (looking up through the road).
    if (camera.position.y < _target.y + 0.8) camera.position.y = _target.y + 0.8
    s.look.lerp(_look, 1 - Math.exp(-dt * 10))
  }

  // Shake on hits, decaying.
  const shake = cam.shake || 0
  if (shake > 0.01) {
    camera.position.x += (Math.random() - 0.5) * shake * 0.7
    camera.position.y += (Math.random() - 0.5) * shake * 0.5
    cam.shake = shake * (1 - Math.min(1, dt * 6))
  }
  // Hard landing: the camera sinks a little and springs back.
  if (cam.dip > 0.01) {
    camera.position.y -= cam.dip * 0.9
    cam.dip *= 1 - Math.min(1, dt * 5)
  }
  camera.lookAt(s.look)

  // Lens: wider with speed and boost.
  const base = fovForAspect(size.width / Math.max(1, size.height))
  const want = base + Math.min(1, speed / 40) * SPEED_FOV + (car.boosting ? BOOST_FOV : 0) + cam.kick * 9
  cam.kick *= 1 - Math.min(1, dt * 2.5)
  s.fov += (want - s.fov) * Math.min(1, dt * 3)
  if (Math.abs(camera.fov - s.fov) > 0.05) {
    camera.fov = s.fov
    camera.updateProjectionMatrix()
  }
}
