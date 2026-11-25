import { Vector3 } from 'three'

/**
 * Car stats (shared/cars.js, 60-140 scale, 100 = baseline) mapped to physics numbers.
 * Everything is per unit mass: forces are accelerations.
 */

export const GRAVITY = 22
/** Suspension travel above the wheel's modelled centre, metres. */
export const SUS_REST = 0.32
/**
 * How far the springs lift a parked car's wheels above their modelled centres (m): the
 * suspension settles about this compressed (measured: scripts/check-wheels.mjs). The models
 * (game/cars) are drawn with their wheels at the modelled centres - tyres tucked under the
 * arches - so a sprung rig (game/cars/CarRig.js) raises the body by this much instead of
 * pushing the wheels up into it.
 */
export const WHEEL_REST_LIFT = 0.145
/** The most (m) a sprung wheel is drawn above its modelled centre: a hard hit sinks the tyre into the road for a moment rather than up through the arch. */
export const WHEEL_RISE_MAX = 0.04

const DEFAULT_MODEL = {
  wheels: {
    radius: 0.45,
    width: 0.35,
    positions: [
      [-0.95, 0, -1.35],
      [0.95, 0, -1.35],
      [-0.95, 0, 1.35],
      [0.95, 0, 1.35],
    ],
  },
  size: [2.1, 1.5, 4.2],
}

/** Tallest a car counts as for its roof collision sphere (m): clears the 2.6 m container gates. */
const ROOF_MAX_H = 2.4

/**
 * @param {{ stats: object }} car from shared/cars.js
 * @param {{ wheels, size }} [model] from game/cars/carModels.js (defaults if absent, e.g. under node)
 */
export function carTuning(car, model = DEFAULT_MODEL) {
  const s = car.stats
  const m = model?.wheels ? model : DEFAULT_MODEL
  const [w, h, l] = m.size
  const wheelRadius = m.wheels.radius
  const wheels = m.wheels.positions.map((p) => new Vector3(p[0], p[1], p[2]))
  // Body spheres: four corners low, and the cabin roof (so a flipped car lands on it).
  // Low enough to hit walls, high enough to clear the road by ~0.2 m at rest (the
  // springs settle ~0.15 m compressed).
  const cr = Math.min(0.62, w * 0.3)
  const cy = Math.max(cr - wheelRadius + 0.38, 0.3)
  const cz = l / 2 - cr * 0.95
  const cx = Math.max(0, w / 2 - cr * 1.05)
  const spheres = [
    { p: new Vector3(-cx, cy, -cz), r: cr },
    { p: new Vector3(cx, cy, -cz), r: cr },
    { p: new Vector3(-cx, cy, cz), r: cr },
    { p: new Vector3(cx, cy, cz), r: cr },
    // The roof sphere follows the model's height, capped (ROOF_MAX_H) so tall cars
    // (forklift mast, lighthouse lamp, monster) still fit under the 2.6 m container gates.
    { p: new Vector3(0, Math.max(cy + 0.3, Math.min(h, ROOF_MAX_H) - wheelRadius - 0.45), 0.1), r: 0.6 },
  ]
  // Solid-box inertia (unit mass), padded for stability.
  const k = 1.6 / 12
  const inertia = new Vector3((h * h + l * l) * k, (w * w + l * l) * k, (w * w + h * h) * k)
  return {
    maxSpeed: 30 * (s.speed / 100),
    accel: 15 * (s.accel / 100),
    brake: 26,
    reverseMax: 11,
    reverseAccel: 12,
    coast: 2.5,
    steerRate: 2.3 * (s.handling / 100),
    grip: 9.5 * (s.handling / 100),
    /** Knock-back scale: heavier cars get shoved less. */
    knockScale: 100 / s.weight,
    nitroSeconds: 3.2 * (s.nitro / 100),
    nitroAccel: 13 * (s.boost / 100),
    nitroTop: 1.32 + (s.boost - 100) / 400,
    nitroRegen: 0.07,
    susK: 38,
    susC: 3.4,
    wheelRadius,
    wheels,
    spheres,
    inertia,
    size: [w, h, l],
  }
}
