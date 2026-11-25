import { Vector3 } from 'three'

import { getCarModel } from '../cars/carModels'

/**
 * Collision bodies for the other cars your car can hit: other players' cars
 * (net/remotePlayers.js) and the CPU racers (bots/Bots.jsx). Each is a dynamic OBB the
 * size of the car's body, turned with it, so a car is as long as it looks (a sphere
 * was only 2.5 m across). The owner poses it every frame (poseCarBody).
 *
 * `car: true` makes the world skip it for wheel raycasts (you don't drive on roofs) and
 * the car physics treat a hit as a car-to-car bump (physics/car.js carContact);
 * `ghost` (set by the owner from shared/safeZones.js) turns collisions off.
 */

/** carId -> { h: [hx, hy, hz], offset: Vector3 } (box half sizes, centre in the car's frame). */
const shapes = new Map()

function shapeOf(carId) {
  let shape = shapes.get(carId)
  if (shape) return shape
  const geometry = getCarModel(carId).geometry
  if (!geometry.boundingBox) geometry.computeBoundingBox()
  const box = geometry.boundingBox
  shape = {
    // A touch narrower/shorter than the drawn body: mirrors and bumpers don't snag.
    h: [((box.max.x - box.min.x) / 2) * 0.92, (box.max.y - box.min.y) / 2, ((box.max.z - box.min.z) / 2) * 0.94],
    offset: new Vector3((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2),
  }
  shapes.set(carId, shape)
  return shape
}

/**
 * Adds a (disabled) car body to `world`. `kind` is 'player' or 'bot'; `owner` is the
 * remote player / bot it belongs to. Made once per car, outside the frame loop.
 */
export function addCarBody(world, kind, owner) {
  return world.addDynamic({
    type: 'box',
    c: new Vector3(),
    h: [1, 0.7, 2.1],
    ax: new Vector3(1, 0, 0),
    ay: new Vector3(0, 1, 0),
    az: new Vector3(0, 0, 1),
    knock: 0,
    kind,
    owner,
    car: true,
    enabled: false,
    /** In a safe zone (or either car is): pass through. */
    ghost: false,
    /** Box centre in the car's own frame (from setCarBodyShape). */
    offset: new Vector3(),
    carId: '',
    /** Last contact normal and when (car time): keeps a fast hit from pushing through. */
    lastN: new Vector3(0, 1, 0),
    contactAt: -1,
    /** Bump cooldown (car time) and your car's role in that bump: 1 rammer, 2 hit. */
    bumpUntil: 0,
    bumpRole: 0,
  })
}

/** Sizes the body to car `carId` (cheap when unchanged). */
export function setCarBodyShape(body, carId) {
  if (body.carId === carId) return
  const shape = shapeOf(carId)
  body.carId = carId
  body.h[0] = shape.h[0]
  body.h[1] = shape.h[1]
  body.h[2] = shape.h[2]
  body.offset.copy(shape.offset)
}

/** Puts the body where the car is drawn: `position` (rig origin) turned by `quaternion`. No allocation. */
export function poseCarBody(body, position, quaternion) {
  body.ax.set(1, 0, 0).applyQuaternion(quaternion)
  body.ay.set(0, 1, 0).applyQuaternion(quaternion)
  body.az.set(0, 0, 1).applyQuaternion(quaternion)
  const o = body.offset
  body.c.copy(position).addScaledVector(body.ax, o.x).addScaledVector(body.ay, o.y).addScaledVector(body.az, o.z)
}
