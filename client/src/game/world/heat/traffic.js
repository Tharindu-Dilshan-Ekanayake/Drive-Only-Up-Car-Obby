import { InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three'

import { getQuality, useQuality } from '../../../store/quality'
import { getCarMaterial } from '../../cars/carMaterial'
import { getCarModel } from '../../cars/carModels'
import { wheelBatch } from '../../cars/CarRig'
import { carLights } from '../../fx/carLights'
import { addCarBody, poseCarBody, setCarBodyShape } from '../../physics/carBody'
import { physicsWorld } from '../../physics/instance'
import { runtime } from '../../runtime'

/**
 * Heat Run's civilian traffic: pooled cars cruising along the lanes of the wide roads
 * (Boulevard Breakout, the Interchange, the Harbour Run freeway - every stretch at least
 * TRAFFIC_WIDTH m wide, plazas excluded) in your direction at a modest 38-54 km/h, for you
 * to weave through and for the police to crash into (policeSim.js checks its units against
 * `cars`). They ride the stage path like the police (distance `s` + a lane), keep their
 * distance from each other and from you, brake for moving obstacles in their lane (the
 * crossing trucks), and show brake lights. Ram one and it's shoved or thrown off.
 *
 * Budgets: at most TRAFFIC_MAX[preset] cars (LOW 2, MEDIUM 4, HIGH 6), spawned out of
 * sight ahead of you (past the fog's near edge) and recycled behind; a collision body
 * only within 25 m of your car and only while the moving-body budget has room
 * (policeSim.js hands over how many it may switch on); one instanced draw per model
 * (3 models), wheels in the shared batch, lights in the night-lights batch. No
 * allocation per frame; dispose() removes every mesh and body.
 */

export const TRAFFIC_WIDTH = 17.5
export const TRAFFIC_MAX = { LOW: 2, MEDIUM: 4, HIGH: 6 }
const MODELS = ['hatch', 'van', 'pickup']
const POOL = 6
const COLLIDE = 25
const SPEED = [10.5, 15]
const AHEAD = [0, 260]
const BEHIND = 70
/** Lane centres as shares of the road width (right of centre). */
const LANES = [-0.375, -0.125, 0.125, 0.375]

const _f = new Vector3()
const _u = new Vector3()
const _r = new Vector3()
const _w = new Vector3()
const _p = new Vector3()
const _q = new Quaternion()
const _q2 = new Quaternion()
const _s = new Vector3(1, 1, 1)
const _m = new Matrix4()
const _m2 = new Matrix4()
const _basis = new Matrix4()
const X_AXIS = new Vector3(1, 0, 0)

const rand = (a, b) => a + Math.random() * (b - a)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

/**
 * Builds the traffic of `stage` into `scene`. `helpers`: `{ plazaOf(s), indexAt(s, hint) }`
 * from the police sim (path lookups). Returns `{ cars, update, draw, clear, dispose, ... }`.
 */
export function createTraffic(stage, scene, helpers) {
  const path = stage.path
  const last = path.length - 1
  const { plazaOf, indexAt } = helpers

  // Where traffic runs: long stretches of wide road off the plazas.
  const ranges = []
  let open = -1
  for (let i = 0; i <= last; i += 1) {
    const p = path[i]
    const ok = p.w >= TRAFFIC_WIDTH && !p.air && plazaOf(p.s) < 0
    if (ok && open < 0) open = i
    if ((!ok || i === last) && open >= 0) {
      const s0 = path[open].s + 6
      const s1 = path[ok ? i : i - 1].s - 6
      if (s1 - s0 > 150) ranges.push({ s0, s1 })
      open = -1
    }
  }
  const rangeOf = (s) => {
    for (let k = 0; k < ranges.length; k += 1) if (s >= ranges[k].s0 && s <= ranges[k].s1) return k
    return -1
  }

  const material = getCarMaterial()
  const meshes = MODELS.map((id) => {
    // Civilian traffic: the low-detail bodies (one instanced draw per model).
    const m = new InstancedMesh(getCarModel(id).lodGeometry, material, POOL)
    m.count = 0
    m.frustumCulled = false
    m.castShadow = true
    m.visible = false
    m.name = `traffic-${id}`
    scene.add(m)
    return m
  })

  const bodies = new Set()
  const cars = Array.from({ length: POOL }, (_, n) => {
    const c = {
      n,
      active: false,
      model: 0,
      carModel: null,
      s: 0,
      i: 0,
      laneK: 0,
      lane: 0,
      laneVel: 0,
      speed: 0,
      cruise: 12,
      brake: 0,
      range: -1,
      fly: false,
      flyT: 0,
      flyVel: new Vector3(),
      flyAxis: new Vector3(1, 0, 0),
      flySpin: 0,
      spin: 0,
      halfS: 2,
      halfW: 1,
      pos: new Vector3(0, -500, 0),
      quat: new Quaternion(),
      fwd: new Vector3(0, 0, -1),
      right: new Vector3(1, 0, 0),
      body: null,
      /** Hit by a pursuer (policeSim.js): seconds of hazard lights. */
      hit: 0,
    }
    c.body = addCarBody(physicsWorld, 'bot', c)
    c.body.onBump = (imp, closing, role) => bumped(c, imp, closing, role)
    bodies.add(c.body)
    return c
  })

  const st = { spawnT: 1 }

  function deactivate(c) {
    c.active = false
    c.fly = false
    c.body.enabled = false
    c.pos.y = -500
  }

  function place(c, dt) {
    c.i = indexAt(c.s, c.i)
    const a = path[c.i]
    const b = path[Math.min(last, c.i + 1)]
    const span = b.s - a.s || 1
    const k = clamp((c.s - a.s) / span, 0, 1)
    _f.set(a.fx + (b.fx - a.fx) * k, a.fy + (b.fy - a.fy) * k, a.fz + (b.fz - a.fz) * k).normalize()
    _u.set(a.ux + (b.ux - a.ux) * k, a.uy + (b.uy - a.uy) * k, a.uz + (b.uz - a.uz) * k).normalize()
    _r.crossVectors(_f, _u).normalize()
    c.pos.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k)
    c.pos.addScaledVector(_r, c.lane).addScaledVector(_u, c.carModel.wheels.radius)
    _w.copy(_f).multiplyScalar(Math.max(4, c.speed)).addScaledVector(_r, c.laneVel * 0.6).normalize()
    c.fwd.copy(_w)
    c.right.crossVectors(_w, _u).normalize()
    _basis.makeBasis(c.right, _u, _p.copy(_w).negate())
    c.quat.setFromRotationMatrix(_basis)
    c.spin += (c.speed / Math.max(0.3, c.carModel.wheels.radius)) * dt
  }

  function spawn(pS, minAhead) {
    const c = cars.find((x) => !x.active)
    if (!c) return
    for (let tries = 0; tries < 6; tries += 1) {
      const s = pS + rand(Math.max(minAhead, AHEAD[0]), AHEAD[1])
      const rk = rangeOf(s)
      if (rk < 0) continue
      const laneK = LANES[Math.floor(Math.random() * LANES.length)]
      const i = indexAt(s)
      const lane = laneK * path[i].w
      // Not on top of another car in that lane.
      if (cars.some((o) => o.active && !o.fly && Math.abs(o.s - s) < 18 && Math.abs(o.lane - lane) < 2.4)) continue
      c.model = Math.floor(Math.random() * MODELS.length)
      c.carModel = getCarModel(MODELS[c.model])
      setCarBodyShape(c.body, MODELS[c.model])
      c.halfS = c.body.h[2]
      c.halfW = c.body.h[0]
      c.active = true
      c.fly = false
      c.s = s
      c.i = i
      c.laneK = laneK
      c.lane = lane
      c.laneVel = 0
      c.cruise = rand(SPEED[0], SPEED[1])
      c.speed = c.cruise
      c.range = rk
      c.hit = 0
      place(c, 0)
      return
    }
  }

  /** Your car hit it (role 1: shove or throw) or it ran into you (2: it slows). */
  function bumped(c, imp, closing, role) {
    if (!c.active || c.fly) return
    if (role === 2) {
      c.speed = Math.max(0, c.speed - closing * 0.4)
      return
    }
    const push = Math.hypot(imp.x, imp.z)
    if (imp.y <= 0.01 && push < 9) {
      c.laneVel += imp.x * c.right.x + imp.z * c.right.z
      c.speed = Math.max(0, c.speed + imp.x * c.fwd.x + imp.z * c.fwd.z)
      c.hit = 3
      return
    }
    throwCar(c, imp.x, imp.y + 2, imp.z, push)
  }

  function throwCar(c, ix, iy, iz, push) {
    c.fly = true
    c.flyT = 0
    c.flyVel.copy(c.fwd).multiplyScalar(c.speed)
    c.flyVel.x += ix
    c.flyVel.y += iy
    c.flyVel.z += iz
    c.flyAxis.set(iz, 0, -ix).normalize()
    if (c.flyAxis.lengthSq() < 0.5) c.flyAxis.copy(c.fwd)
    c.flySpin = Math.min(8, 3 + push * 0.25)
    c.body.enabled = false
  }

  /**
   * One frame. `ctx`: `{ pS, pLat, pSpeed, running, safe, obs, nObs, bodyRoom }` - your
   * place on the path, the moving obstacles projected onto it (policeSim.js), and how many
   * more collision bodies may be switched on. Returns how many it switched on.
   */
  function update(dt, ctx) {
    const level = useQuality.getState().level
    const max = ctx.running ? TRAFFIC_MAX[level] ?? 2 : 0
    let n = 0
    for (const c of cars) if (c.active) n += 1
    // Spawn out of sight: past the fog's near edge (it hides pop-in).
    st.spawnT -= dt
    if (st.spawnT <= 0) {
      st.spawnT = 0.6
      if (n < max) spawn(ctx.pS, getQuality().fogNear + 15)
    }
    let enabled = 0
    const car = runtime.car.position
    for (const c of cars) {
      if (!c.active) continue
      if (c.fly) {
        c.flyT += dt
        c.flyVel.y -= 22 * dt
        c.pos.addScaledVector(c.flyVel, dt)
        _q.setFromAxisAngle(c.flyAxis, c.flySpin * dt)
        c.quat.premultiply(_q)
        if (c.flyT > 2.6 || c.pos.y < path[c.i].y - 25) deactivate(c)
        continue
      }
      // Too many for the preset now (dropped a level), behind you, or past its stretch out of view: recycled.
      const ahead = c.s - ctx.pS
      const end = ranges[c.range]?.s1 ?? 0
      if (n > max || ahead < -BEHIND || ahead > 340 || (c.s > end && (ahead > 45 || ahead < -10))) {
        deactivate(c)
        n -= 1
        continue
      }
      c.hit = Math.max(0, c.hit - dt)
      // Pace: cruise, but keep a gap to whatever's ahead in the lane (another car, you, an obstacle).
      let want = c.hit > 0 ? 0 : c.cruise
      for (const o of cars) {
        if (o === c || !o.active || o.fly) continue
        const gap = o.s - c.s
        if (gap > 0 && gap < 18 && Math.abs(o.lane - c.lane) < 2.4) want = Math.min(want, Math.max(0, o.speed + (gap - 9) * 0.5))
      }
      const pg = ctx.pS - c.s
      if (pg > 0 && pg < 16 && Math.abs(ctx.pLat - c.lane) < 2.6) want = Math.min(want, Math.max(0, ctx.pSpeed + (pg - 8) * 0.6))
      for (let k = 0; k < ctx.nObs; k += 1) {
        const o = ctx.obs[k]
        if (o.traffic) continue
        const ds = o.s - c.s
        if (ds < -o.halfS || ds > 22) continue
        const lat = o.lat + o.vlat * Math.min(2, Math.max(0, ds) / Math.max(4, c.speed))
        if (Math.abs(lat - c.lane) < o.halfLat + c.halfW + 0.6) want = Math.min(want, Math.max(0, (ds - o.halfS - 5) * 0.8))
      }
      c.brake = want < c.speed - 0.4 ? 1 : 0
      c.speed += clamp(want - c.speed, -14 * dt, 5 * dt)
      c.speed = Math.max(0, c.speed)
      c.s += c.speed * dt
      // Lane: follows the road's width; a shove slides it (off the edge: thrown).
      c.i = indexAt(c.s, c.i)
      const w = path[c.i].w
      if (c.laneVel !== 0) {
        c.laneK += (c.laneVel * dt) / Math.max(4, w)
        c.laneVel *= Math.max(0, 1 - 2.5 * dt)
        if (Math.abs(c.laneVel) < 0.2) c.laneVel = 0
      }
      c.lane = c.laneK * w
      if (Math.abs(c.lane) > w / 2 + 0.6) {
        throwCar(c, c.right.x * c.laneVel, 1, c.right.z * c.laneVel, Math.abs(c.laneVel))
        continue
      }
      place(c, dt)
      const body = c.body
      body.enabled = enabled < ctx.bodyRoom && c.pos.distanceToSquared(car) < COLLIDE * COLLIDE
      if (body.enabled) {
        enabled += 1
        poseCarBody(body, c.pos, c.quat)
        body.ghost = ctx.safe || plazaOf(c.s) >= 0
        body.vel.copy(c.fwd).multiplyScalar(c.speed).addScaledVector(c.right, c.laneVel)
      }
    }
    return enabled
  }

  /** A pursuer ran into car c at `closing` m/s from side `side` (+1: from its right): shoved and slowed. */
  function struck(c, closing, side) {
    c.hit = 2.5
    c.speed = Math.max(0, c.speed - closing * 0.5)
    c.laneVel += -side * Math.min(8, 2 + closing * 0.3)
  }

  const counts = [0, 0, 0]
  function draw() {
    counts[0] = 0
    counts[1] = 0
    counts[2] = 0
    let active = 0
    for (const c of cars) {
      if (!c.active) continue
      active += 1
      _m.compose(c.pos, c.quat, _s)
      meshes[c.model].setMatrixAt(counts[c.model]++, _m)
      const w = c.carModel.wheels
      for (let i = 0; i < w.positions.length; i += 1) {
        const p = w.positions[i]
        _p.set(p[0], p[1], p[2])
        _q2.setFromAxisAngle(X_AXIS, c.spin)
        _w.set(w.width, w.radius, w.radius)
        _m2.compose(_p, _q2, _w).premultiply(_m)
        wheelBatch.push(_m2, c.carModel.rim)
      }
      // Hazard-blinking tail lamps after a knock, else brake lights.
      const blink = c.hit > 0 && Math.floor(performance.now() / 350) % 2 === 0
      carLights.car(_m, c.carModel, blink || c.brake ? 1 : 0, false, -w.radius)
    }
    for (let k = 0; k < meshes.length; k += 1) {
      meshes[k].count = counts[k]
      meshes[k].visible = counts[k] > 0
      if (counts[k]) meshes[k].instanceMatrix.needsUpdate = true
    }
    return active
  }

  function clear() {
    for (const c of cars) deactivate(c)
  }

  function dispose() {
    clear()
    for (const c of cars) {
      physicsWorld.removeDynamic(c.body)
      c.body.onBump = null
    }
    for (const m of meshes) {
      scene.remove(m)
      m.dispose()
    }
  }

  return { cars, bodies, ranges, meshes, update, draw, struck, clear, dispose }
}
