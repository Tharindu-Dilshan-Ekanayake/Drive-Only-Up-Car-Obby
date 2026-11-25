import { Color, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, Quaternion, Vector3 } from 'three'

import { getQuality } from '../../store/quality'
import { WHEEL_REST_LIFT, WHEEL_RISE_MAX } from '../physics/tuning'
import { carLights } from '../fx/carLights'
import { runtime } from '../runtime'
import { getCarMaterial } from './carMaterial'
import { CALIPER_GEOMETRY, getCarModel, WHEEL_GEOMETRY, WHEEL_LOD_GEOMETRY } from './carModels'

/**
 * Draws cars: a body mesh per car (its own merged geometry, one draw call) and every
 * car's wheels in one shared instanced batch (`wheelBatch`: near wheels, far wheels and
 * brake callipers - three draw calls for all of them). A rig is posed each frame from
 * position/quaternion plus wheel state; it never allocates while posing. Posing also
 * hands the car to the night lights batch (fx/carLights.js: head / tail lamps, beam,
 * light pool) unless `lights` is false; set `brake` (0..1) for brighter tail lamps and
 * `player` on your own car.
 *
 * A sprung rig (your car, remote players: positions are the physics origin, whose wheels
 * ride WHEEL_REST_LIFT above their modelled centres) draws the body that much higher and the
 * wheels where the springs put them relative to it, so the tyres stay under the arches.
 *
 * Level of detail: past the quality preset's `carLod` distance from the camera (or once
 * the frame's `carFull` full-detail cars are used up) a rig draws its model's
 * `lodGeometry` (~1/3 of the triangles) and its wheels go in the far wheel batch (~90
 * triangles, no callipers). Swapping is a geometry reference change:
 * same material, same program, nothing allocated.
 */

// 36 full-detail cars (player, bots, nearest remotes, showroom) + the 11 parked in the lobby.
const MAX_WHEELS = 4 * (36 + 11)
const _m = new Matrix4()
const _w = new Matrix4()
const _f = new Matrix4()
const _q = new Quaternion()
const _qs = new Quaternion()
const _p = new Vector3()
const _s = new Vector3()
const _eye = new Vector3()
const WHITE = new Color(1, 1, 1)
const X = new Vector3(1, 0, 0)
const Y = new Vector3(0, 1, 0)

/** This frame's LOD: squared distance (quality preset `carLod`, m) and full-detail cars left (`carFull`). */
const lod = { d2: 45 * 45, eye: false, full: 30 }

function batchMesh(geometry, name) {
  const mesh = new InstancedMesh(geometry, getCarMaterial(), MAX_WHEELS)
  // Per-wheel rim colour (instance colour tints the near-white rim; rubber stays black).
  mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(MAX_WHEELS * 3).fill(1), 3)
  mesh.count = 0
  mesh.frustumCulled = false
  mesh.name = name
  return mesh
}

export const wheelBatch = (() => {
  const mesh = batchMesh(WHEEL_GEOMETRY, 'wheels')
  const far = batchMesh(WHEEL_LOD_GEOMETRY, 'wheels-far')
  const calipers = batchMesh(CALIPER_GEOMETRY, 'calipers')
  // Children: whoever adds the batch to the scene adds all three.
  mesh.add(far)
  mesh.add(calipers)
  let used = 0
  let usedFar = 0
  let usedCal = 0
  return {
    mesh,
    /** Call once per frame (early: useFrame priority < 0) before rigs write wheels. */
    begin() {
      used = 0
      usedFar = 0
      usedCal = 0
      mesh.count = 0
      far.count = 0
      calipers.count = 0
      const cam = runtime.camera.object
      lod.eye = Boolean(cam)
      if (cam) _eye.copy(cam.position)
      const q = getQuality()
      const d = q.carLod || 45
      lod.d2 = d * d
      lod.full = q.carFull ?? 30
    },
    /**
     * Queues one wheel; `color` tints its rim (defaults to white). `fixed` (optional) is
     * the same wheel's matrix without its spin: a near wheel then gets a brake calliper.
     * `low` forces the far wheel (the lobby's low-detail parked cars).
     */
    push(matrix, color = WHITE, fixed = null, low = false) {
      const e = matrix.elements
      if (low || isFar(e[12], e[13], e[14])) {
        if (usedFar >= MAX_WHEELS) return
        far.setMatrixAt(usedFar, matrix)
        far.setColorAt(usedFar, color)
        usedFar += 1
        far.count = usedFar
        far.instanceMatrix.needsUpdate = true
        far.instanceColor.needsUpdate = true
        return
      }
      if (used >= MAX_WHEELS) return
      mesh.setMatrixAt(used, matrix)
      mesh.setColorAt(used, color)
      used += 1
      mesh.count = used
      mesh.instanceMatrix.needsUpdate = true
      mesh.instanceColor.needsUpdate = true
      if (fixed) {
        calipers.setMatrixAt(usedCal, fixed)
        usedCal += 1
        calipers.count = usedCal
        calipers.instanceMatrix.needsUpdate = true
      }
    },
  }
})()

/** True when a point is past this frame's car LOD distance from the camera. */
function isFar(x, y, z) {
  if (!lod.eye) return false
  const dx = x - _eye.x
  const dy = y - _eye.y
  const dz = z - _eye.z
  return dx * dx + dy * dy + dz * dz > lod.d2
}

export class CarRig {
  constructor(carId, paintId, sprung = false) {
    /** Is its position a physics car's origin (see above)? */
    this.sprung = sprung
    this.body = new Mesh(undefined, getCarMaterial())
    this.body.matrixAutoUpdate = false
    this.body.castShadow = true
    this.setCar(carId, paintId)
    this.visible = true
    /** Night lights (fx/carLights.js): on, brake lamps 0..1, your own car, the road's height in the car's frame (null: from the wheels). */
    this.lights = true
    this.brake = 0
    this.player = false
    this.ground = null
    /** Level of detail: 'auto' (by distance), 'full' or 'low'. */
    this.lod = 'auto'
  }

  /** Swaps the car (and its Store paint, shared/cosmetics.js; omitted = factory colours). */
  setCar(carId, paintId) {
    if (carId === this.carId && paintId === this.paintId) return
    this.carId = carId
    this.paintId = paintId
    this.model = getCarModel(carId, paintId)
    this.body.geometry = this.model.geometry
  }

  /**
   * Poses the body and queues its wheels.
   * @param {Vector3} position @param {Quaternion} quaternion
   * @param {{ wheelY?: number[], spin?: number, steer?: number }} wheels
   */
  pose(position, quaternion, wheels = {}) {
    this.body.visible = this.visible
    if (!this.visible) return
    let low = this.lod === 'low' || (this.lod === 'auto' && isFar(position.x, position.y, position.z))
    // A budget of full-detail cars per frame (LOW: 5); your own car ('full') doesn't count.
    if (!low && this.lod === 'auto') {
      if (lod.full > 0) lod.full -= 1
      else low = true
    }
    const geometry = low ? this.model.lodGeometry : this.model.geometry
    if (this.body.geometry !== geometry) this.body.geometry = geometry
    _s.set(1, 1, 1)
    const rest = this.sprung ? WHEEL_REST_LIFT : 0
    if (rest) this.body.matrix.compose(_p.set(0, rest, 0).applyQuaternion(quaternion).add(position), quaternion, _s)
    else this.body.matrix.compose(position, quaternion, _s)
    this.body.matrixWorldNeedsUpdate = true
    if (this.lights) {
      // The road under the car: the wheels' contact (a sprung car rides its origin ~0.35 m up).
      let ground = this.ground
      if (ground === null) ground = (wheels.wheelY ? (wheels.wheelY[0] + wheels.wheelY[1] + wheels.wheelY[2] + wheels.wheelY[3]) / 4 - rest : this.sprung ? this.model.wheels.positions[0][1] : 0.15) - this.model.wheels.radius
      carLights.car(this.body.matrix, this.model, this.brake, this.player, ground)
    }
    const w = this.model.wheels
    const spin = wheels.spin || 0
    const steer = wheels.steer || 0
    _m.copy(this.body.matrix)
    for (let i = 0; i < 4; i += 1) {
      const p = w.positions[i]
      let wy = p[1]
      if (wheels.wheelY) wy = rest ? Math.min(wheels.wheelY[i] - rest, p[1] + WHEEL_RISE_MAX) : wheels.wheelY[i]
      _p.set(p[0], wy, p[2])
      _s.set(w.width, w.radius, w.radius)
      // Without the spin (callipers), then with it.
      if (i < 2 && steer) _q.setFromAxisAngle(Y, steer)
      else _q.identity()
      _f.compose(_p, _q, _s).premultiply(_m)
      _qs.setFromAxisAngle(X, spin)
      _q.multiply(_qs)
      _w.compose(_p, _q, _s).premultiply(_m)
      wheelBatch.push(_w, this.model.rim, low ? null : _f, low)
    }
  }

  dispose() {
    this.body.removeFromParent()
  }
}
