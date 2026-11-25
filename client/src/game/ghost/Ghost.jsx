import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import {
  CanvasTexture,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three'

import { useGame } from '../../store/game'
import { getCarModel, hasCarModel, WHEEL_GEOMETRY } from '../cars/carModels'
import { WHEEL_REST_LIFT, WHEEL_RISE_MAX } from '../physics/tuning'
import { runtime } from '../runtime'
import { ghostCar, ghostWheels, sampleGhost } from './ghostTape'

/**
 * Your ghost: a see-through copy of your best drive through the section you're in,
 * starting the moment you leave the checkpoint before it. Three draw calls (body,
 * wheels, label), only while a tape is playing. Module-level singleton: one ghost.
 */

const COLOR = '#9fe9ff'
const _pos = new Vector3()
const _quat = new Quaternion()
const _m = new Matrix4()
const _w = new Matrix4()
const _p = new Vector3()
const _s = new Vector3(1, 1, 1)
const _one = new Vector3(1, 1, 1)
const _wq = new Quaternion()
const _spinQ = new Quaternion()
const _fwd = new Vector3()
const _step = new Vector3()
const _prev = new Vector3()
const X = new Vector3(1, 0, 0)
const Y = new Vector3(0, 1, 0)
/** The wheels' roll (rad), from the distance the ghost has covered; `rolling` once there's a previous position. */
const roll = { spin: 0, rolling: false }
/** Hide the ghost when you're right on top of it (it would just fill the screen). */
const NEAR = 3.2

let ghost = null

function labelTexture() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 64
  const ctx = c.getContext('2d')
  ctx.font = '44px "Fredoka One", "Arial Rounded MT Bold", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 10
  ctx.strokeStyle = '#0d1530'
  ctx.strokeText('GHOST', 128, 34)
  ctx.fillStyle = COLOR
  ctx.fillText('GHOST', 128, 34)
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  return tex
}

function makeGhost() {
  const material = new MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0.33, depthWrite: false, fog: true })
  const body = new Mesh(undefined, material)
  body.matrixAutoUpdate = false
  body.frustumCulled = false
  body.renderOrder = 2
  const wheels = new InstancedMesh(WHEEL_GEOMETRY, material, 4)
  wheels.frustumCulled = false
  wheels.renderOrder = 2
  const labelTex = labelTexture()
  const label = new Sprite(new SpriteMaterial({ map: labelTex, transparent: true, depthWrite: false, opacity: 0.9 }))
  label.scale.set(3.2, 0.8, 1)
  label.renderOrder = 3
  return { body, wheels, label, material, labelTex, carId: '', model: null }
}

function setVisible(g, on) {
  if (!on) roll.rolling = false
  g.body.visible = on
  g.wheels.visible = on
  g.label.visible = on
}

/** Poses the ghost for this frame (or hides it). Runs outside React. */
function poseGhost(g, enabled) {
  const race = runtime.race
  const carId = ghostCar()
  const t = (performance.now() - race.splitStart) / 1000
  if (!enabled || !race.running || !carId || !hasCarModel(carId) || !sampleGhost(t, _pos, _quat)) {
    setVisible(g, false)
    return
  }
  if (_pos.distanceTo(runtime.car.position) < NEAR) {
    setVisible(g, false)
    return
  }
  if (g.carId !== carId) {
    g.carId = carId
    g.model = getCarModel(carId)
    g.body.geometry = g.model.geometry
  }
  setVisible(g, true)
  // Like your own car (game/cars/CarRig.js): the body higher by the springs' rest lift, the wheels where they sat relative to it.
  g.body.matrix.compose(_p.set(0, WHEEL_REST_LIFT, 0).applyQuaternion(_quat).add(_pos), _quat, _one)
  g.body.matrixWorldNeedsUpdate = true
  const w = g.model.wheels
  // Roll: the distance covered along the car's heading (a respawn's jump doesn't count).
  _fwd.set(0, 0, -1).applyQuaternion(_quat)
  if (roll.rolling) {
    _step.subVectors(_pos, _prev)
    if (_step.lengthSq() < 25) roll.spin += _step.dot(_fwd) / w.radius
  }
  _prev.copy(_pos)
  roll.rolling = true
  _spinQ.setFromAxisAngle(X, roll.spin)
  for (let i = 0; i < 4; i += 1) {
    const p = w.positions[i]
    // Like your own car's wheels: lifted by the suspension, the front pair steered, all rolling.
    _p.set(p[0], p[1] + Math.min(ghostWheels.lift - WHEEL_REST_LIFT, WHEEL_RISE_MAX), p[2])
    _s.set(w.width, w.radius, w.radius)
    if (i < 2) _wq.setFromAxisAngle(Y, ghostWheels.steer).multiply(_spinQ)
    else _wq.copy(_spinQ)
    _w.compose(_p, _wq, _s).premultiply(_m.copy(g.body.matrix))
    g.wheels.setMatrixAt(i, _w)
  }
  g.wheels.instanceMatrix.needsUpdate = true
  g.label.position.set(_pos.x, _pos.y + 2.6, _pos.z)
}

export function Ghost() {
  const scene = useThree((s) => s.scene)
  const enabled = useGame((s) => s.profile.settings?.ghost !== false)

  useEffect(() => {
    ghost ||= makeGhost()
    const g = ghost
    scene.add(g.body, g.wheels, g.label)
    setVisible(g, false)
    return () => {
      scene.remove(g.body, g.wheels, g.label)
    }
  }, [scene])

  // Free the GPU copies when the scene goes (context loss / quality rebuild remounts).
  useEffect(
    () => () => {
      if (!ghost) return
      ghost.material.dispose()
      ghost.label.material.dispose()
      ghost.labelTex.dispose()
      ghost.wheels.dispose()
      ghost = null
    },
    [],
  )

  useFrame(() => {
    if (ghost) poseGhost(ghost, enabled)
  })

  return null
}

export default Ghost
