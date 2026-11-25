import { Quaternion, Vector3 } from 'three'

import { BUMP_COOLDOWN_MS, BUMP_MIN_SPEED, BUMP_REACT, bumpImpulse } from '@shared/bump'

import { GRAVITY, SUS_REST } from './tuning'

/**
 * Arcade car: a rigid body (unit mass) held up by four raycast springs, driven and
 * steered the arcade way (velocity along the ground and yaw rate set directly, which
 * is stable and toy-like), with free rotation in the air for flips, and five body
 * spheres that collide with the world and get knocked about by moving obstacles.
 *
 * Fixed 120 Hz substeps (`update` runs the accumulator). No allocation per step.
 */

export const STEP = 1 / 120
const MAX_STEPS = 6
const MAX_SPEED = 75
const AIR_SPIN_ACCEL = 9
const AIR_SPIN_MAX = 6.2
const DOWNFORCE = 10
const STABILISER = 38
/**
 * Loop assist (momentum, not downforce - extra downforce only scrubs speed): with two or
 * more wheels on a loop and rolling forwards faster than LOOP_CARRY_FROM m/s but slower
 * than LOOP_CARRY m/s, the car is pushed forwards towards LOOP_CARRY, so a car that
 * arrives slowly still makes it round. A car stopped in a loop still drops out.
 */
const LOOP_CARRY = 17
const LOOP_CARRY_FROM = 3
const LOOP_CARRY_GAIN = 5
const KNOCK_COOLDOWN = 0.45
const TRICK_TURN = Math.PI * 1.6
/** Hung up on an edge this long (s) while trying to drive: hop free (sideways, up; m/s). */
const PERCH_TIME = 0.9
const PERCH_HOP = [3, 2.6]
/** One bump per other car this often (s); see shared/bump.js. */
const BUMP_COOLDOWN = BUMP_COOLDOWN_MS / 1000
/** Another player's car rammed you: their 'bump' throws you; the contact itself only parts you this much (m/s). */
const BUMPED_PART = 4
/** Thrown by a bump: no trick score for the airtime that follows (s). */
const BUMP_NO_TRICKS = 3

const _up = new Vector3()
const _fwd = new Vector3()
const _right = new Vector3()
const _force = new Vector3()
const _torque = new Vector3()
const _anchor = new Vector3()
const _arm = new Vector3()
const _dir = new Vector3()
const _f = new Vector3()
const _n = new Vector3()
const _fg = new Vector3()
const _rg = new Vector3()
const _vrel = new Vector3()
const _surf = new Vector3()
const _pv = new Vector3()
const _tmp = new Vector3()
const _tmp2 = new Vector3()
const _q = new Quaternion()
const _qi = new Quaternion()
const _cn = new Vector3()
/** A bump's throw, handed to events.onBump (reused). */
const _imp = { x: 0, y: 0, z: 0 }
const _hit = { dist: 0, normal: new Vector3(), grip: 1, dynamic: null, kind: '' }
const WORLD_UP = new Vector3(0, 1, 0)

export class Car {
  /** @param {ReturnType<import('./tuning').carTuning>} tuning */
  constructor(tuning) {
    this.t = tuning
    this.pos = new Vector3()
    this.vel = new Vector3()
    this.quat = new Quaternion()
    this.angVel = new Vector3()
    this.acc = 0

    // Per wheel.
    this.comp = [0, 0, 0, 0]
    this.contact = [false, false, false, false]
    /** Wheel centre height offset (local y) for drawing, and spin angle. */
    this.wheelY = [0, 0, 0, 0]
    this.wheelSpin = 0
    this.steerAngle = 0

    this.grounded = 0
    this.groundNormal = new Vector3(0, 1, 0)
    this.forwardSpeed = 0
    this.lateralSpeed = 0
    this.airTime = 0
    this.nitro = 1
    this.boosting = false
    this.drifting = false
    this.trick = { pitch: 0, yaw: 0, roll: 0 }
    this.stuckTime = 0
    this.perchTime = 0
    /** Car time of the last bump that threw this car (no tricks off someone else's ram). */
    this.bumpedAt = -10
    /** Seconds left on temporary effects. */
    this.effects = { shield: 0, anchor: 0, glider: 0, oil: 0, flat: 0, slow: 0, emp: 0 }
    /** Top-speed factor while `effects.slow` lasts (Heat Run's foam / net hits, applyHazard). */
    this.slowTop = 1
    /** Simulation clock, seconds: cooldowns are stamped on the bodies/triggers themselves. */
    this.time = 0
    this.events = null

    // Bound once: no closure per step.
    this.sphere = new Vector3()
    this.sphereR = 0
    this.world = null
    this.onContact = this.onContact.bind(this)
  }

  /** Puts the car at (x, y, z) facing `yaw`, at rest. */
  reset(x, y, z, yaw) {
    this.pos.set(x, y, z)
    this.vel.set(0, 0, 0)
    this.angVel.set(0, 0, 0)
    this.quat.setFromAxisAngle(WORLD_UP, yaw)
    this.comp.fill(0)
    this.airTime = 0
    this.stuckTime = 0
    this.trick.pitch = 0
    this.trick.yaw = 0
    this.trick.roll = 0
    this.acc = 0
    this.effects.oil = 0
    this.effects.flat = 0
  }

  /**
   * Advances by a frame's `dt` in fixed substeps.
   * @param {object} input runtime.input-shaped controls
   * @param {import('./world').PhysicsWorld} world
   * @param {object} events callbacks: onLand(air, impact), onTrick(kind, n, score),
   *   onHit(intensity, body), onTrigger(trigger), onBump(body, closing, impulse, role)
   *   (role 1: you rammed `body`, throw it by `impulse`; 2: a CPU racer rammed you)
   */
  update(dt, input, world, events) {
    this.events = events
    this.world = world
    this.acc = Math.min(this.acc + dt, STEP * MAX_STEPS)
    while (this.acc >= STEP) {
      this.step(STEP, input, world)
      this.acc -= STEP
    }
    const fx = this.effects
    fx.shield = Math.max(0, fx.shield - dt)
    fx.anchor = Math.max(0, fx.anchor - dt)
    fx.glider = Math.max(0, fx.glider - dt)
    fx.oil = Math.max(0, fx.oil - dt)
    fx.flat = Math.max(0, fx.flat - dt)
    fx.slow = Math.max(0, fx.slow - dt)
    fx.emp = Math.max(0, fx.emp - dt)
  }

  step(dt, input, world) {
    const t = this.t
    this.time += dt
    const q = this.quat
    _up.set(0, 1, 0).applyQuaternion(q)
    _fwd.set(0, 0, -1).applyQuaternion(q)
    _right.set(1, 0, 0).applyQuaternion(q)

    _force.set(0, -GRAVITY, 0)
    _torque.set(0, 0, 0)

    // --- Suspension ---------------------------------------------------------------
    let grounded = 0
    let gripSum = 0
    _n.set(0, 0, 0)
    _surf.set(0, 0, 0)
    let onDynamic = 0
    let onLoop = 0
    _dir.copy(_up).negate()
    const reach = SUS_REST + t.wheelRadius
    for (let i = 0; i < 4; i += 1) {
      const w = t.wheels[i]
      _anchor.set(w.x, w.y + SUS_REST, w.z).applyQuaternion(q).add(this.pos)
      if (world.raycast(_anchor, _dir, reach, _hit)) {
        const x = reach - _hit.dist
        const xv = (x - this.comp[i]) / dt
        this.comp[i] = x
        let f = t.susK * x + t.susC * xv
        // Bump stop: stiffen sharply past full travel.
        if (x > SUS_REST) f += (x - SUS_REST) * t.susK * 6
        f = Math.max(0, Math.min(f, GRAVITY * 6))
        _f.copy(_up).multiplyScalar(f)
        _force.add(_f)
        _arm.subVectors(_anchor, this.pos)
        _torque.add(_tmp.crossVectors(_arm, _f))
        grounded += 1
        gripSum += _hit.grip
        if (_hit.kind === 'loop') onLoop += 1
        _n.add(_hit.normal)
        if (_hit.dynamic) {
          world.pointVelocity(_hit.dynamic, _anchor, _pv)
          _surf.add(_pv)
          onDynamic += 1
        }
        this.contact[i] = true
        this.wheelY[i] = w.y + Math.min(x, SUS_REST)
      } else {
        this.comp[i] = 0
        this.contact[i] = false
        this.wheelY[i] = w.y
      }
    }
    if (onDynamic) _surf.multiplyScalar(1 / onDynamic)
    this.onLoop = onLoop

    const wasAirborne = this.grounded === 0
    this.grounded = grounded
    // An EMP pulse (Heat Run) knocks the nitro out for a moment.
    const boostWanted = input.nitro && this.nitro > 0.01 && this.effects.emp <= 0
    this.boosting = boostWanted
    if (boostWanted) this.nitro = Math.max(0, this.nitro - dt / t.nitroSeconds)
    else this.nitro = Math.min(1, this.nitro + t.nitroRegen * dt)

    if (grounded > 0) {
      _n.normalize()
      this.groundNormal.copy(_n)
      if (wasAirborne && this.airTime > 0.25) this.land()
      this.airTime = 0
      this.drive(dt, input, grounded, gripSum / grounded)
      this.unperch(dt, input, grounded)
    } else {
      this.airTime += dt
      this.forwardSpeed = this.vel.dot(_fwd)
      this.drifting = false
      this.airControl(dt, input)
    }

    // Integrate velocities.
    this.vel.addScaledVector(_force, dt)
    this.applyInvInertia(_torque, _tmp)
    this.angVel.addScaledVector(_tmp, dt)

    // Gull Glider: float down gently.
    if (this.effects.glider > 0 && grounded === 0 && this.vel.y < -3) this.vel.y += (-3 - this.vel.y) * Math.min(1, 6 * dt)

    // --- Body contacts --------------------------------------------------------------
    for (let i = 0; i < t.spheres.length; i += 1) {
      const s = t.spheres[i]
      this.sphere.copy(s.p).applyQuaternion(q).add(this.pos)
      this.sphereR = s.r
      world.sphereContacts(this.sphere, s.r, this.onContact)
    }

    // Triggers (boost / bounce / oil) at the car's centre.
    const trig = world.triggers.length ? world.triggerAt(this.pos) : null
    if (trig) this.trigger(trig, dt)

    // Clamp and integrate positions.
    const speed = this.vel.length()
    if (speed > MAX_SPEED) this.vel.multiplyScalar(MAX_SPEED / speed)
    this.pos.addScaledVector(this.vel, dt)

    const w = this.angVel
    _q.set(w.x, w.y, w.z, 0).multiply(q)
    q.x += 0.5 * dt * _q.x
    q.y += 0.5 * dt * _q.y
    q.z += 0.5 * dt * _q.z
    q.w += 0.5 * dt * _q.w
    q.normalize()
    w.multiplyScalar(grounded ? 1 - 1.5 * dt : 1 - 0.25 * dt)

    // Trick bookkeeping while airborne (rates in the car's own frame).
    if (grounded === 0) {
      this.trick.pitch += w.dot(_right) * dt
      this.trick.yaw += w.dot(_up) * dt
      this.trick.roll += w.dot(_fwd) * dt
    }

    this.wheelSpin += (this.forwardSpeed / t.wheelRadius) * dt
    this.steerAngle += (-input.steer * 0.5 - this.steerAngle) * Math.min(1, 14 * dt)

    // Flipped and stuck: put it back on its wheels.
    if (_up.y < 0.35 && speed < 4) {
      this.stuckTime += dt
      if (this.stuckTime > 1.4) this.selfRight()
    } else {
      this.stuckTime = 0
    }
  }

  drive(dt, input, grounded, groundGrip) {
    const t = this.t
    // On ice (ground grip under ~0.55) the tyres also spin up and lock a little: less drive
    // and braking, and a touch less steering (ordinary surfaces are unaffected).
    const slick = Math.min(1, 0.45 + groundGrip)
    const traction = (grounded / 4) * slick
    _fg.copy(_fwd).addScaledVector(this.groundNormal, -_fwd.dot(this.groundNormal)).normalize()
    _rg.crossVectors(_fg, this.groundNormal)
    _vrel.copy(this.vel).sub(_surf)
    const vf = _vrel.dot(_fg)
    const vr = _vrel.dot(_rg)
    this.forwardSpeed = vf
    this.lateralSpeed = vr

    const top = t.maxSpeed * (this.boosting ? t.nitroTop : 1) * (this.effects.slow > 0 ? this.slowTop : 1)
    let a = 0
    if (input.throttle > 0) {
      if (vf < 0) a += t.brake * input.throttle
      else a += t.accel * input.throttle * Math.max(0, Math.min(1, ((top - vf) / top) * 3))
    }
    if (input.brake > 0) {
      if (vf > 0.5) a -= t.brake * input.brake
      else if (input.noReverse) {
        // Brake only (the touch BRAKE button): stop a car rolling backwards, never drive it backwards.
        if (vf < -0.5) a += t.brake * input.brake
      } else if (vf > -t.reverseMax) a -= t.reverseAccel * input.brake
    }
    if (input.throttle <= 0 && input.brake <= 0) {
      a -= Math.sign(vf) * Math.min(Math.abs(vf) / dt, t.coast + (input.handbrake ? 8 : 0))
    }
    if (this.boosting && vf < top) a += t.nitroAccel
    // Past top speed (downhill, after a boost pad): ease back to it.
    if (vf > top && !this.boosting) a -= Math.min((vf - top) * 0.8, 7)
    this.vel.addScaledVector(_fg, a * dt * traction)

    // Lateral grip: bleed off sideways sliding. Handbrake / oil make it slide.
    let grip = t.grip * groundGrip
    if (input.handbrake) grip *= 0.22
    if (this.effects.oil > 0) grip *= 0.12
    // Punctured by a spike strip: slides about for a moment.
    if (this.effects.flat > 0) grip *= 0.35
    if (this.effects.anchor > 0) grip *= 1.8
    const dv = -vr * Math.min(1, grip * dt)
    this.vel.addScaledVector(_rg, dv * traction)
    this.drifting = Math.abs(vr) > 4 && Math.abs(vf) > 9

    // Steering: set the yaw rate about the ground normal directly.
    if (grounded >= 2) {
      const sp = Math.abs(vf)
      const lowSpeed = Math.min(1, sp / 4.5)
      const highSpeed = 1 - 0.38 * Math.min(1, sp / t.maxSpeed)
      const dirSign = vf < -0.5 ? -1 : 1
      const drift = input.handbrake ? 1.35 : 1
      const target = -input.steer * t.steerRate * lowSpeed * highSpeed * dirSign * drift * Math.min(1, 0.55 + groundGrip)
      const wn = this.angVel.dot(this.groundNormal)
      this.angVel.addScaledVector(this.groundNormal, (target - wn) * Math.min(1, 12 * dt))
      // Damp pitch/roll wobble and lean the car back onto its wheels.
      _tmp.copy(this.angVel).addScaledVector(this.groundNormal, -this.angVel.dot(this.groundNormal))
      this.angVel.addScaledVector(_tmp, -Math.min(1, 3 * dt))
      _tmp2.crossVectors(_up, this.groundNormal).multiplyScalar(STABILISER)
      _torque.add(_tmp2)
    }

    // Downforce: keeps you glued through the loop and over crests.
    const df = DOWNFORCE * Math.min(1.6, Math.abs(vf) / 18) * (this.effects.anchor > 0 ? 2 : 1)
    _force.addScaledVector(this.groundNormal, -df)
    if (this.onLoop >= 2 && vf > LOOP_CARRY_FROM && vf < LOOP_CARRY) _force.addScaledVector(_fwd, (LOOP_CARRY - vf) * LOOP_CARRY_GAIN)
  }

  /**
   * Hung up on an edge - one or two wheels on the ground, the rest over a drop or a gap
   * between planks, the body resting on the edge - and going nowhere while the driver
   * tries to: after a moment, a small hop towards the grounded wheels (off a side edge
   * back onto the road), or the way you're driving when a whole axle hangs.
   */
  unperch(dt, input, grounded) {
    const trying = input.throttle > 0 || input.brake > 0
    if (grounded > 2 || !trying || this.vel.lengthSq() > 1) {
      this.perchTime = 0
      return
    }
    this.perchTime = (this.perchTime || 0) + dt
    if (this.perchTime < PERCH_TIME) return
    this.perchTime = 0
    // Which side the grounded wheels are on (an axle hanging leaves this near zero).
    let side = 0
    for (let i = 0; i < 4; i += 1) if (this.contact[i]) side += this.t.wheels[i].x
    if (Math.abs(side) > 0.3) this.vel.addScaledVector(_right, Math.sign(side) * PERCH_HOP[0])
    else this.vel.addScaledVector(_fwd, (input.throttle > 0 ? 1 : -1) * PERCH_HOP[0])
    this.vel.addScaledVector(_up, PERCH_HOP[1])
  }

  /**
   * In the air: S (brake) backflips; Space + W frontflips; Space + A/D barrel-rolls;
   * A/D alone spins. Gas alone does NOT pitch (holding W through a jump is normal), and
   * with no trick input the car gently levels itself so jumps land on their wheels.
   */
  airControl(dt, input) {
    const trick = input.handbrake
    const pitchIn = (input.brake > 0 ? input.brake : 0) - (trick && input.throttle > 0 ? input.throttle : 0)
    const steer = -input.steer
    const accel = AIR_SPIN_ACCEL * dt
    if (pitchIn) this.angVel.addScaledVector(_right, pitchIn * accel)
    if (steer) this.angVel.addScaledVector(trick ? _fwd : _up, (trick ? -steer : steer) * accel)
    if (!pitchIn && !steer && this.airTime > 0.15) {
      // Self-levelling: turn the car's up towards world up (keeps its heading).
      _tmp.crossVectors(_up, WORLD_UP)
      this.angVel.addScaledVector(_tmp, Math.min(1, 5 * dt) * 2.2)
      // Bleed off pitch/roll spin that isn't being asked for.
      _tmp2.copy(_up).multiplyScalar(this.angVel.dot(_up))
      _tmp.copy(this.angVel).sub(_tmp2)
      this.angVel.addScaledVector(_tmp, -Math.min(1, 2.5 * dt))
    }
    const spin = this.angVel.length()
    if (spin > AIR_SPIN_MAX) this.angVel.multiplyScalar(AIR_SPIN_MAX / spin)
  }

  /** Touchdown after real airtime: score whatever got rotated. */
  land() {
    const ev = this.events
    const air = this.airTime
    const impact = Math.max(0, -this.vel.dot(this.groundNormal))
    const turns = (v) => Math.floor((Math.abs(v) + Math.PI * 0.4) / (Math.PI * 2))
    let score = 0
    const tricks = []
    if (Math.abs(this.trick.pitch) > TRICK_TURN) {
      const n = turns(this.trick.pitch)
      // Nose-down rotation is negative about the right axis.
      tricks.push([this.trick.pitch < 0 ? 'frontflip' : 'backflip', n, 1000 * n])
      score += 1000 * n
    }
    if (Math.abs(this.trick.roll) > TRICK_TURN) {
      const n = turns(this.trick.roll)
      tricks.push(['barrel', n, 800 * n])
      score += 800 * n
    }
    if (Math.abs(this.trick.yaw) > TRICK_TURN) {
      const n = turns(this.trick.yaw)
      tricks.push(['spin', n, 500 * n])
      score += 500 * n
    }
    if (air > 1.6) {
      tricks.push(['air', Math.round(air * 10) / 10, Math.round(air * 40)])
      score += Math.round(air * 40)
    }
    const upright = _up.dot(this.groundNormal) > 0.9
    if (air > 0.7 && upright && score > 0) {
      tricks.push(['landing', 1, 200])
      score += 200
    }
    ev?.onLand?.(air, impact)
    // Airtime someone else's ram gave you doesn't score.
    if (score > 0 && this.time - this.bumpedAt > BUMP_NO_TRICKS) ev?.onTrick?.(tricks, score)
    this.trick.pitch = 0
    this.trick.yaw = 0
    this.trick.roll = 0
  }

  onContact(n, depth, body) {
    if (body && body.car) {
      this.carContact(n, depth, body)
      return
    }
    const t = this.t
    // Contact point on the sphere, and its arm from the centre of mass.
    _pv.copy(this.sphere).addScaledVector(n, -this.sphereR)
    _arm.subVectors(_pv, this.pos)
    // Velocity of that point, relative to whatever it hit.
    _vrel.crossVectors(this.angVel, _arm).add(this.vel)
    if (body) {
      this.world.pointVelocity(body, _pv, _tmp2)
      _vrel.sub(_tmp2)
    }
    const vn = _vrel.dot(n)
    // Positional correction.
    this.pos.addScaledVector(n, depth * 0.7)
    if (vn < 0) {
      // Effective mass along n.
      _tmp.crossVectors(_arm, n)
      this.applyInvInertia(_tmp, _tmp)
      _tmp.cross(_arm)
      const k = 1 + _tmp.dot(n)
      const e = body ? 0.3 : 0.12
      const j = (-(1 + e) * vn) / k
      this.applyImpulse(_arm, n, j)
      // Friction.
      _tmp.copy(_vrel).addScaledVector(n, -vn)
      const vt = _tmp.length()
      if (vt > 1e-3) {
        const jt = Math.min(vt / k, 0.5 * j)
        this.applyImpulse(_arm, _tmp.multiplyScalar(-1 / vt), jt)
      }
      if (!body && vn < -7) this.events?.onHit?.(Math.min(1, -vn / 26), null)
    }
    // Moving obstacles throw you about (unless shielded).
    if (body && body.knock > 0 && this.effects.shield <= 0) {
      if ((body.knockUntil || 0) <= this.time) {
        const bodySpeed = this.world.pointVelocity(body, _pv, _tmp2).length()
        const strength = body.knock * (4 + bodySpeed * 0.55) * t.knockScale * (this.effects.anchor > 0 ? 0.4 : 1)
        if (body.fling) {
          // Fling bodies (hammers, drones, vehicles) throw you sideways off the road:
          // the way they're moving across it, or away from them if they barely are.
          const across = _tmp2.dot(body.fling)
          let side = Math.sign(across)
          if (Math.abs(across) < 2) side = Math.sign(_tmp.subVectors(this.pos, body.c).dot(body.fling)) || 1
          _tmp.copy(body.fling).multiplyScalar(side * 0.85)
          _tmp.y += body.flingUp ?? 0.55
        } else {
          _tmp.copy(n).multiplyScalar(0.85)
          _tmp.y += 0.5
        }
        this.vel.addScaledVector(_tmp.normalize(), strength)
        // A tumble, from where it hit.
        _tmp.crossVectors(_arm, n).multiplyScalar(strength * 0.5)
        this.angVel.add(_tmp)
        body.knockUntil = this.time + KNOCK_COOLDOWN
        this.events?.onHit?.(Math.min(1, strength / 18), body)
      }
    }
  }

  /**
   * Your car touching another car (physics/carBody.js; never in a safe zone - those are
   * `ghost` and skipped by the world). Slow: the cars part. Closing at BUMP_MIN_SPEED or
   * more: whichever was driving into the other harder is the rammer. You rammed it:
   * you lose BUMP_REACT of the closing speed and events.onBump throws the other car
   * (a CPU racer directly, another player via a 'bump' message). A CPU racer rammed
   * you: you're thrown here. Another player rammed you: their client sends the throw,
   * so the contact only parts the cars (one throw per hit, never two).
   */
  carContact(nIn, depth, body) {
    // A fast hit can carry a sphere past the other car's middle in one step, where the
    // push-out normal flips and would shove it on through: keep the side it came from.
    _cn.copy(nIn)
    if (body.contactAt >= this.time - STEP * 1.5 && _cn.dot(body.lastN) < 0) _cn.copy(body.lastN)
    body.lastN.copy(_cn)
    body.contactAt = this.time
    const n = _cn
    this.pos.addScaledVector(n, depth * 0.7)
    _pv.copy(this.sphere).addScaledVector(n, -this.sphereR)
    _arm.subVectors(_pv, this.pos)
    _vrel.crossVectors(this.angVel, _arm).add(this.vel).sub(body.vel)
    const vn = _vrel.dot(n)
    if (vn >= 0) return
    const closing = -vn
    // You just rammed it and it's on its way: only keep out of it.
    if (body.bumpUntil > this.time && body.bumpRole === 1) return
    if (closing >= BUMP_MIN_SPEED && body.bumpUntil <= this.time) {
      body.bumpUntil = this.time + BUMP_COOLDOWN
      const mine = -this.vel.dot(n)
      const theirs = body.vel.dot(n)
      if (mine >= theirs) {
        body.bumpRole = 1
        bumpImpulse(closing, body.c.x - this.pos.x, body.c.z - this.pos.z, this.vel.x, this.vel.z, _imp)
        this.vel.addScaledVector(n, closing * BUMP_REACT)
        this.events?.onBump?.(body, closing, _imp, 1)
        return
      }
      body.bumpRole = 2
      if (body.kind === 'bot') {
        bumpImpulse(closing, this.pos.x - body.c.x, this.pos.z - body.c.z, body.vel.x, body.vel.z, _imp)
        this.applyBump(_imp.x, _imp.y, _imp.z)
        this.events?.onBump?.(body, closing, _imp, 2)
        return
      }
    }
    // Part the cars: an even split of the closing speed (equal masses, no bounce).
    const part = body.kind === 'player' && body.bumpRole === 2 && body.bumpUntil > this.time ? Math.min(closing, BUMPED_PART) : closing
    _tmp.crossVectors(_arm, n)
    this.applyInvInertia(_tmp, _tmp)
    _tmp.cross(_arm)
    const k = 1 + _tmp.dot(n)
    this.applyImpulse(_arm, n, (part * 0.5) / k)
  }

  /**
   * Thrown by a bump: adds `(ix, iy, iz)` (m/s, shared/bump.js), scaled by this car's
   * weight, plus a tumble away from the hit. A Bubble Shield ignores it; the Anchor
   * Drop shrugs most of it off. Returns how hard it hit (0..1; 0 = ignored).
   */
  applyBump(ix, iy, iz) {
    if (this.effects.shield > 0) return 0
    const s = this.t.knockScale * (this.effects.anchor > 0 ? 0.4 : 1)
    this.vel.x += ix * s
    this.vel.y += iy * s
    this.vel.z += iz * s
    const push = Math.hypot(ix, iz) * s
    if (push > 1e-3) {
      // Turns about the horizontal axis across the throw, top first, more with lift.
      const rate = Math.min(4.5, push * 0.15) * (iy > 0 ? 1 : 0.3)
      _tmp.set(iz, 0, -ix).multiplyScalar((rate * s) / push)
      this.angVel.add(_tmp)
    }
    this.bumpedAt = this.time
    const intensity = Math.min(1, Math.max(0.05, (push + iy * s) / 24))
    this.events?.onHit?.(intensity, null)
    return intensity
  }

  /** Impulse of size j along unit `dir`, at `arm` from the centre of mass. */
  applyImpulse(arm, dir, j) {
    this.vel.addScaledVector(dir, j)
    _tmp2.crossVectors(arm, dir).multiplyScalar(j)
    this.applyInvInertia(_tmp2, _tmp2)
    this.angVel.add(_tmp2)
  }

  /** out = I^-1 v, with I the body-frame diagonal inertia rotated into the world. */
  applyInvInertia(v, out) {
    _qi.copy(this.quat).invert()
    out.copy(v).applyQuaternion(_qi)
    out.x /= this.t.inertia.x
    out.y /= this.t.inertia.y
    out.z /= this.t.inertia.z
    return out.applyQuaternion(this.quat)
  }

  trigger(tr, dt) {
    // Continuous pushes: wind across the road, conveyors along it.
    if (tr.type === 'wind') {
      _tmp.set(tr.ax[0], tr.ax[1], tr.ax[2]).multiplyScalar(tr.dir * 46 * tr.power * dt * (this.effects.anchor > 0 ? 0.3 : 1))
      this.vel.add(_tmp)
      if ((tr.cooldownUntil || 0) <= this.time) {
        tr.cooldownUntil = this.time + 1.5
        this.events?.onTrigger?.(tr)
      }
      return
    }
    if (tr.type === 'conveyor') {
      if (this.grounded > 0) {
        _tmp.set(-tr.az[0], -tr.az[1], -tr.az[2]).multiplyScalar(tr.dir * 16 * tr.power * dt)
        this.vel.add(_tmp)
      }
      if ((tr.cooldownUntil || 0) <= this.time) {
        tr.cooldownUntil = this.time + 2
        this.events?.onTrigger?.(tr)
      }
      return
    }
    if ((tr.cooldownUntil || 0) > this.time) return
    tr.cooldownUntil = this.time + 0.6
    const up = WORLD_UP
    if (tr.type === 'boost') {
      _tmp.set(-tr.az[0], -tr.az[1], -tr.az[2])
      const along = this.vel.dot(_tmp)
      const target = this.t.maxSpeed * 1.35 * tr.power
      if (along < target) this.vel.addScaledVector(_tmp, target - along)
      this.nitro = Math.min(1, this.nitro + 0.25)
    } else if (tr.type === 'bounce') {
      const vy = 22.5 * tr.power
      if (this.vel.y < vy) this.vel.addScaledVector(up, vy - this.vel.y)
      // A predictable arc: forward pace set into a window, so every car clears the gap
      // and none overshoots the landing.
      _tmp.set(-tr.az[0], 0, -tr.az[2]).normalize()
      const along = this.vel.dot(_tmp)
      const target = Math.min(28, Math.max(23, along))
      this.vel.addScaledVector(_tmp, target - along)
    } else if (tr.type === 'oil') {
      this.effects.oil = 1.4
      tr.cooldownUntil = 0
    } else if (tr.type === 'spikes') {
      // A spike strip: lose 60% of the speed along the ground, wobble and slide for a
      // second (towards the side of the strip's middle the car crossed, so it's
      // repeatable); no launch - it stays on the road.
      tr.cooldownUntil = this.time + 1.2
      const vy = this.vel.y
      this.vel.multiplyScalar(0.4)
      this.vel.y = vy < 0 ? vy : vy * 0.4
      _tmp.set(this.pos.x - tr.c[0], this.pos.y - tr.c[1], this.pos.z - tr.c[2])
      const side = _tmp.x * tr.ax[0] + _tmp.y * tr.ax[1] + _tmp.z * tr.ax[2] >= 0 ? 1 : -1
      this.angVel.addScaledVector(_up, side * 3.2)
      this.effects.flat = 1.1
    }
    this.events?.onTrigger?.(tr)
  }

  selfRight() {
    _fwd.set(0, 0, -1).applyQuaternion(this.quat)
    const yaw = Math.atan2(-_fwd.x, -_fwd.z)
    this.pos.y += 1.6
    this.quat.setFromAxisAngle(WORLD_UP, yaw)
    this.angVel.set(0, 0, 0)
    this.vel.multiplyScalar(0.2)
    this.stuckTime = 0
  }

  /**
   * Heat Run's police gadgets (game/world/heat/): 'foam' (a foam ball: top speed 60% for
   * 1.6 s, 20% of the speed gone at once), 'net' (stronger and shorter: 45% for 1.1 s, 40%
   * gone), 'emp' (nitro knocked out for 2 s), 'pit' (a police PIT tap on your rear quarter
   * from side `side` (+1 right): an 18% speed cut, a yaw kick of 4 rad/s and loose rear
   * grip for 0.6 s - a spin you can catch or drive out of, never a launch). A Bubble Shield
   * ignores them all. Returns whether it took effect.
   */
  applyHazard(kind, side = 1) {
    if (this.effects.shield > 0) return false
    if (kind === 'pit') {
      _up.set(0, 1, 0).applyQuaternion(this.quat)
      const vy = this.vel.y
      this.vel.multiplyScalar(0.82)
      this.vel.y = vy
      this.angVel.addScaledVector(_up, -side * 4)
      this.effects.flat = Math.max(this.effects.flat, 0.6)
      return true
    }
    if (kind === 'emp') {
      this.effects.emp = 2
      this.boosting = false
      return true
    }
    const net = kind === 'net'
    this.effects.slow = net ? 1.1 : 1.6
    this.slowTop = net ? 0.45 : 0.6
    const keep = net ? 0.6 : 0.8
    const vy = this.vel.y
    this.vel.multiplyScalar(keep)
    this.vel.y = vy
    return true
  }

  /** Item effects that act instantly. */
  applyItem(id) {
    _up.set(0, 1, 0).applyQuaternion(this.quat)
    _fwd.set(0, 0, -1).applyQuaternion(this.quat)
    if (id === 'jump') {
      this.vel.y = Math.max(this.vel.y, 0) + 13
    } else if (id === 'turbo') {
      this.nitro = 1
      _fwd.y = Math.max(0, _fwd.y)
      this.vel.addScaledVector(_fwd.normalize(), 14)
    } else if (id === 'shield') {
      this.effects.shield = 6
    } else if (id === 'anchor') {
      this.effects.anchor = 6
    } else if (id === 'glider') {
      this.effects.glider = 8
    }
  }
}
