import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { Matrix4, Quaternion, Vector3 } from 'three'

import { BUMP_REACT } from '@shared/bump'
import { CARS, carById } from '@shared/cars'
import { respawnGhost, startRespawnGhost } from '@shared/bump'
import { BURN_TIME } from '@shared/missile'
import { inSafeZone } from '@shared/safeZones'
import { stageInfo } from '@shared/stages/index'

import { useGame } from '../../store/game'
import { useQuality } from '../../store/quality'
import { CarRig } from '../cars/CarRig'
import { ignite, registerMissileTargets } from '../fx/missileHub'
import { addCarBody, poseCarBody, setCarBodyShape } from '../physics/carBody'
import { physicsWorld } from '../physics/instance'
import { PhysicsWorld } from '../physics/world'
import { runtime } from '../runtime'
import { doorLanes } from '../track/doorState'

/**
 * CPU racers. Not physics cars (that would cost a full simulation each): they ride the
 * stage path at their own pace and lane, slow for bends, sometimes wipe out at an
 * obstacle section (tumble off, then reappear at their checkpoint), and loop back to
 * the Start after the summit. Each near you carries a car-sized collision box
 * (physics/carBody.js), so you can ram them and they ram you: a shove pushes one
 * across the road (over the edge if hard enough), a real ram throws it (botBumped) -
 * it flies, lands back on the road if it comes down on it, else falls and reappears at
 * its checkpoint. In the lobby and on checkpoint plazas (shared/safeZones.js) they're
 * ghosts. How many depends on the quality preset, less one per other player in the
 * room.
 */

const NAMES = ['Barnacle', 'Captain Cog', 'Dockside Dee', 'Rusty Hull', 'Skipper', 'Tidewater', 'Bilge', 'Marlin']
const COLORS = ['#ff7a1a', '#18c3d6', '#b05cff', '#3fd97a', '#ff4a3d', '#ffc41f', '#3aa0ff', '#ff3d7f']

/**
 * What the bots need to know about a stage (once per stage): its path, which sections
 * have obstacles, the cargo door gantries (they line up with whichever door is open) and
 * the sample index of each section's first sample. Every bot carries it (`b.ctx`).
 */
const contexts = new WeakMap()
function stageContext(stage) {
  let ctx = contexts.get(stage)
  if (!ctx) {
    const path = stage.path
    ctx = {
      stage,
      path,
      obstacleSections: new Set(stage.obstacles.map((o) => o.section)),
      doors: stage.obstacles.filter((o) => o.type === 'doors').map((o) => ({ id: o.id, pi: o.pi })),
      sectionStart: stage.sections.map((sec) => Math.max(0, path.findIndex((p) => p.s >= sec.sStart))),
    }
    contexts.set(stage, ctx)
  }
  return ctx
}
/** Bots within this distance of your car collide with it (m, squared below). */
const COLLIDE_DIST = 25
const COLLIDE_DIST2 = COLLIDE_DIST * COLLIDE_DIST
/** A ram whose throw has no lift and less sideways push than this (m/s) only shoves. */
const SHOVE_MAX = 9
/** Shoved across the road: the push dies off at this rate (1/s). */
const SHOVE_DAMP = 2.5
/** Thrown: how long it may fly before giving up and reappearing at its checkpoint (s). */
const FLY_MAX = 4
/** Gravity while flying (matches the car physics). */
const BOT_GRAVITY = 22

const _fwd = new Vector3()
const _up = new Vector3()
const _right = new Vector3()
const _basis = new Matrix4()
const _q = new Quaternion()
const _spin = new Quaternion()
const _wheels = { spin: 0 }

/** Small deterministic PRNG so every client's bots start the same way. */
function rng(seed) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
}

function makeBot(i, rand, ctx) {
  const path = ctx.path
  const commons = CARS.filter((c) => c.rarity === 'common' || c.rarity === 'rare')
  const car = rand() < 0.2 ? CARS[Math.floor(rand() * CARS.length)] : commons[Math.floor(rand() * commons.length)]
  const startIndex = Math.floor(rand() * path.length * 0.55)
  return {
    ctx,
    id: `bot-${i}`,
    name: NAMES[i % NAMES.length],
    color: COLORS[i % COLORS.length],
    carId: car.id,
    maxSpeed: 26 * (carById(car.id).stats.speed / 100),
    skill: 0.72 + rand() * 0.22,
    i: startIndex,
    s: path[startIndex].s,
    speed: 0,
    lane: 0,
    laneTarget: 0,
    laneTimer: 0,
    section: path[startIndex].section,
    checkpoint: Math.max(0, path[startIndex].section),
    /** Wiping out: `fail` is true while tumbling; the rest is preallocated state for it. */
    fail: false,
    failT: 0,
    /** Respawn protection (shared/bump.js): no bumps for a moment after reappearing. */
    protect: { pending: false, until: 0 },
    failVel: new Vector3(),
    failAxis: new Vector3(),
    failSpin: 0,
    failAt: 0,
    /** Thrown by a ram (not a scripted wipe-out): may land back on the road. */
    thrown: false,
    /** Set on fire by a Rocket Missile (burnBot): a wreck on the road for BURN_TIME, then back at its checkpoint. */
    burn: false,
    burnY: 0,
    /** Its missile target (game/fx/missileHub.js), made with the bot. */
    target: null,
    /** Sideways speed from a shove (m/s along the road's right). */
    laneVel: 0,
    /** Heavier cars get thrown less (as tuning.js knockScale). */
    knockScale: 100 / carById(car.id).stats.weight,
    finishedFor: 0,
    position: new Vector3(),
    quaternion: new Quaternion(),
    spin: 0,
    rand,
  }
}

/** Puts a bot on the track or takes it off (scene, blob shadow, collisions). */
function setBotActive(b, scene, on) {
  if (on) {
    scene.add(b.rig.body)
    runtime.shadowCasters.add(b.shadow)
  } else {
    scene.remove(b.rig.body)
    runtime.shadowCasters.delete(b.shadow)
    b.body.enabled = false
  }
}

/** The CPU racers of the current map's `stage` (mounted with it, so a new map gets new bots). */
export default function Bots({ stage }) {
  const scene = useThree((s) => s.scene)
  const count = useQuality((s) => s.settings.bots)
  // CPU racers fill the race when you're alone: each other player in the room takes
  // one's place, so a full room has none (and no extra cars to draw).
  const others = useGame((s) => (s.net.mode === 'online' ? Math.max(0, s.net.players - 1) : 0))
  // A map without CPU racers (`bots: false` in its registry entry: Heat Run's police replace them).
  const active = stageInfo(stage.id)?.bots === false ? 0 : Math.max(0, count - others)

  // Bodies are made in a private staging world (render must not touch the real physics:
  // React may render twice and keep one result, and the other copy's bodies would stay in
  // the world for good); the effect below moves them into the real world and back out.
  const bots = useMemo(() => {
    const rand = rng(20261123)
    const ctx = stageContext(stage)
    const staging = new PhysicsWorld()
    return Array.from({ length: count }, (_, i) => {
      const bot = makeBot(i, rand, ctx)
      bot.rig = new CarRig(bot.carId)
      // Posed 0.55 m over the road (step): where its light pool goes.
      bot.rig.ground = -0.55
      // Enabled by step() while it races near you.
      bot.body = addCarBody(staging, 'bot', bot)
      setCarBodyShape(bot.body, bot.carId)
      // Your car hit it (role 1: you rammed it) or it rammed you (2): see physics/car.js.
      bot.body.onBump = (imp, closing, role) => botBumped(bot, imp, closing, role)
      bot.shadow = { position: bot.position, size: 1.6, visible: true }
      bot.target = { pos: bot.position, provider: botProvider, ref: bot }
      return bot
    })
  }, [count, stage])

  // Physics bodies (into the real world) and car rigs live as long as the bot list.
  useEffect(() => {
    // (Made switched off: step() enables the ones near you.)
    for (const b of bots) physicsWorld.dynamics.push(b.body)
    return () => {
      for (const b of bots) {
        physicsWorld.removeDynamic(b.body)
        b.rig.dispose()
      }
    }
  }, [bots])

  // The first `active` bots race; the rest wait off the track, keeping their place.
  useEffect(() => {
    const racing = bots.slice(0, active)
    for (const b of racing) setBotActive(b, scene, true)
    runtime.bots = racing
    return () => {
      for (const b of racing) setBotActive(b, scene, false)
      runtime.bots = []
    }
  }, [scene, bots, active])

  // The racers are Rocket Missile targets while they race.
  useEffect(() => registerMissileTargets(botProvider), [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const racing = runtime.bots
    for (let k = 0; k < racing.length; k += 1) step(racing[k], dt)
  })

  return null
}

function step(b, dt) {
  const { path, stage, obstacleSections, doors, sectionStart } = b.ctx
  // Wiping out / thrown: tumble through the air; back on the road if it lands on it,
  // else back at the checkpoint.
  if (b.fail) {
    b.failT += dt
    b.failVel.y -= BOT_GRAVITY * dt
    b.position.addScaledVector(b.failVel, dt)
    // A burning wreck hops, then settles on the road till it's gone.
    if (b.burn && b.failVel.y < 0 && b.position.y < b.burnY) {
      b.position.y = b.burnY
      b.failVel.set(0, 0, 0)
      b.failSpin = 0
    }
    _spin.setFromAxisAngle(b.failAxis, b.failSpin * dt)
    b.quaternion.premultiply(_spin)
    b.body.enabled = false
    if (b.thrown && b.failT > 0.3 && b.failVel.y < 0 && tryLand(b)) {
      pose(b)
      return
    }
    const sample = path[b.i]
    if (b.failT > (b.burn ? BURN_TIME : b.thrown ? FLY_MAX : 1.8) || (b.thrown && b.position.y < sample.y - 25)) {
      b.fail = false
      b.thrown = false
      b.burn = false
      b.laneVel = 0
      startRespawnGhost(b.protect, performance.now())
      b.i = sectionStart[b.checkpoint] + 4
      b.s = path[b.i].s
      b.speed = 0
      b.lane = 0
      b.laneTarget = 0
    }
    pose(b)
    return
  }

  // Parked at the summit for a bit, then back to the Start.
  if (b.i >= path.length - 3) {
    b.finishedFor += dt
    if (b.finishedFor > 6) {
      b.finishedFor = 0
      b.i = 0
      b.s = 0
      b.speed = 0
      b.checkpoint = 0
    }
    pose(b)
    return
  }

  // Pace: slow for bends ahead and through obstacle fields.
  const here = path[b.i]
  const ahead = path[Math.min(path.length - 1, b.i + 16)]
  const turn = 1 - (here.fx * ahead.fx + here.fz * ahead.fz)
  let want = b.maxSpeed * b.skill * (1 - Math.min(0.55, turn * 1.4))
  if (obstacleSections.has(here.section)) want *= 0.75
  b.speed += Math.sign(want - b.speed) * Math.min(Math.abs(want - b.speed), (b.speed < want ? 9 : 16) * dt)
  b.s += b.speed * dt
  while (b.i < path.length - 1 && path[b.i + 1].s <= b.s) b.i += 1

  // New section: maybe this is where it goes wrong.
  const sec = path[b.i].section
  if (sec !== b.section) {
    if (sec > b.section && stage.checkpoints[sec]) b.checkpoint = sec
    b.section = sec
    if (obstacleSections.has(sec) && b.rand() < (1 - b.skill) * 0.9) b.failAt = b.s + 20 + b.rand() * 50
  }
  if (b.failAt && b.s >= b.failAt) {
    b.failAt = 0
    const side = b.rand() < 0.5 ? -1 : 1
    _fwd.set(here.fx, here.fy, here.fz)
    _up.set(here.ux, here.uy, here.uz)
    _right.crossVectors(_fwd, _up).normalize()
    b.fail = true
    b.failT = 0
    b.failVel.copy(_right).multiplyScalar(side * 9).addScaledVector(_up, 7).addScaledVector(_fwd, b.speed * 0.5)
    b.failAxis.copy(_fwd)
    b.failSpin = side * 7
    pose(b)
    return
  }

  // Wander between lanes.
  b.laneTimer -= dt
  if (b.laneTimer <= 0) {
    b.laneTimer = 2 + b.rand() * 3
    b.laneTarget = (b.rand() - 0.5) * Math.max(0, path[b.i].w - 5)
  }
  // A cargo door gantry coming up: head for the open door (and hold it till through).
  for (let d = 0; d < doors.length; d += 1) {
    const ahead = doors[d].pi - b.i
    if (ahead < -2 || ahead > 24) continue
    const lane = doorLanes.get(doors[d].id)
    if (lane === undefined) continue
    b.laneTarget = lane
    b.laneTimer = Math.max(b.laneTimer, 0.6)
    if (ahead < 8) b.lane += (lane - b.lane) * Math.min(1, dt * 4)
  }
  b.lane += (b.laneTarget - b.lane) * Math.min(1, dt * 1.2)
  // Shoved: slides across the road, and off it if pushed past the edge.
  if (b.laneVel !== 0) {
    b.lane += b.laneVel * dt
    b.laneVel *= Math.max(0, 1 - SHOVE_DAMP * dt)
    if (Math.abs(b.laneVel) < 0.2) b.laneVel = 0
    if (Math.abs(b.lane) > path[b.i].w / 2 + 0.8) {
      const a = path[b.i]
      _fwd.set(a.fx, a.fy, a.fz)
      _up.set(a.ux, a.uy, a.uz)
      _right.crossVectors(_fwd, _up).normalize()
      b.fail = true
      b.thrown = true
      b.failT = 0
      b.failVel.copy(_fwd).multiplyScalar(b.speed).addScaledVector(_right, b.laneVel).addScaledVector(_up, 1)
      b.failAxis.copy(_fwd)
      b.failSpin = Math.sign(b.laneVel || 1) * 4
      b.laneVel = 0
      pose(b)
      return
    }
  }

  // Place on the path (interpolated), lifted over jumps.
  const a = path[b.i]
  const n = path[Math.min(path.length - 1, b.i + 1)]
  const span = n.s - a.s || 1
  const u = Math.min(1, Math.max(0, (b.s - a.s) / span))
  _fwd.set(a.fx + (n.fx - a.fx) * u, a.fy + (n.fy - a.fy) * u, a.fz + (n.fz - a.fz) * u).normalize()
  _up.set(a.ux + (n.ux - a.ux) * u, a.uy + (n.uy - a.uy) * u, a.uz + (n.uz - a.uz) * u).normalize()
  _right.crossVectors(_fwd, _up).normalize()
  b.position.set(a.x + (n.x - a.x) * u, a.y + (n.y - a.y) * u, a.z + (n.z - a.z) * u)
  if (a.air) b.position.y += airLift(path, b.i)
  b.position.addScaledVector(_right, b.lane).addScaledVector(_up, 0.55)
  // Orientation: forward along the path, up off the road (also upside down in the loop).
  _basis.makeBasis(_right, _up, _fwd.negate())
  b.quaternion.setFromRotationMatrix(_basis)
  b.spin += (b.speed / 0.45) * dt

  // Only bots near your car collide (moving-body budget), and none in a safe zone.
  const car = runtime.car
  const body = b.body
  body.enabled = b.position.distanceToSquared(car.position) < COLLIDE_DIST2
  if (body.enabled) {
    poseCarBody(body, b.position, b.quaternion)
    const zone = inSafeZone(stage, b.position.x, b.position.y, b.position.z)
    body.ghost = respawnGhost(b.protect, zone, performance.now()) || car.safe || zone
    body.vel.set(-_fwd.x * b.speed, -_fwd.y * b.speed, -_fwd.z * b.speed).addScaledVector(_right, b.laneVel)
  }
  pose(b)
}

/**
 * Your car hit bot `b` (physics/car.js carContact). Role 1, you rammed it: the throw
 * `imp` (m/s, shared/bump.js) scaled by its weight - no lift and not much push is a
 * shove across the road (and its speed along it), anything more throws it into the air.
 * Role 2, it rammed you: it loses some speed.
 */
function botBumped(b, imp, closing, role) {
  const path = b.ctx.path
  if (b.fail) return
  if (role === 2) {
    b.speed = Math.max(0, b.speed - closing * BUMP_REACT)
    return
  }
  const k = b.knockScale
  const ix = imp.x * k
  const iy = imp.y * k
  const iz = imp.z * k
  const a = path[b.i]
  _fwd.set(a.fx, a.fy, a.fz)
  _up.set(a.ux, a.uy, a.uz)
  _right.crossVectors(_fwd, _up).normalize()
  const along = ix * _fwd.x + iy * _fwd.y + iz * _fwd.z
  const side = ix * _right.x + iy * _right.y + iz * _right.z
  const push = Math.hypot(ix, iz)
  if (iy <= 0.01 && push < SHOVE_MAX) {
    b.laneVel += side
    b.speed = Math.max(0, Math.min(b.maxSpeed * 1.3, b.speed + along))
    return
  }
  b.fail = true
  b.thrown = true
  b.failT = 0
  b.failAt = 0
  b.failVel.copy(_fwd).multiplyScalar(b.speed)
  b.failVel.x += ix
  b.failVel.y += iy
  b.failVel.z += iz
  // Tumbles about the horizontal axis across the throw.
  b.failAxis.set(iz, 0, -ix).normalize()
  b.failSpin = Math.min(9, 3 + push * 0.25)
  b.laneVel = 0
  b.body.enabled = false
}

/**
 * CPU racers as Rocket Missile targets (game/fx/missileHub.js): any racer that is racing, not
 * wiping out, not freshly respawned and not in a safe zone.
 */
const botProvider = {
  each(visit) {
    const racing = runtime.bots
    const now = performance.now()
    for (let k = 0; k < racing.length; k += 1) {
      const b = racing[k]
      if (b.fail || now < b.protect.until || b.i >= b.ctx.path.length - 3) continue
      const p = b.position
      if (inSafeZone(b.ctx.stage, p.x, p.y, p.z)) continue
      visit(b.target)
    }
  },
  hit: (t) => burnBot(t.ref),
}

/**
 * A missile hit bot `b`: it hops, burns on the road for BURN_TIME, then reappears at its
 * checkpoint (the same path as a wipe-out: step() below). False if it was already failing.
 */
function burnBot(b) {
  if (b.fail) return false
  const a = b.ctx.path[b.i]
  _fwd.set(a.fx, a.fy, a.fz)
  _up.set(a.ux, a.uy, a.uz)
  _right.crossVectors(_fwd, _up).normalize()
  const side = b.lane >= 0 ? 1 : -1
  b.fail = true
  b.thrown = false
  b.burn = true
  b.failT = 0
  b.failAt = 0
  b.laneVel = 0
  b.burnY = b.position.y
  b.failVel.copy(_fwd).multiplyScalar(b.speed * 0.3).addScaledVector(_up, 5.5).addScaledVector(_right, side * 1.5)
  b.failAxis.copy(_fwd)
  b.failSpin = side * 2.5
  b.body.enabled = false
  ignite(b.position, BURN_TIME)
  return true
}

/**
 * A thrown bot coming down: if it's over the road near where it was, it lands there and
 * races on from that spot (no allocation: a local scan of the path).
 */
function tryLand(b) {
  const { path, stage } = b.ctx
  const x = b.position.x
  const y = b.position.y
  const z = b.position.z
  let best = -1
  let bestD = Infinity
  const from = Math.max(0, b.i - 30)
  const to = Math.min(path.length - 1, b.i + 40)
  for (let i = from; i <= to; i += 1) {
    const p = path[i]
    const d = (p.x - x) ** 2 + (p.y - y) ** 2 + (p.z - z) ** 2
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  if (best < 0 || bestD > 400) return false
  const p = path[best]
  if (p.air) return false
  const dx = x - p.x
  const dy = y - p.y
  const dz = z - p.z
  // Right = forward x up (as step() builds it); height along the road's up.
  const rx = p.fy * p.uz - p.fz * p.uy
  const ry = p.fz * p.ux - p.fx * p.uz
  const rz = p.fx * p.uy - p.fy * p.ux
  const rl = Math.hypot(rx, ry, rz) || 1
  const lateral = (dx * rx + dy * ry + dz * rz) / rl
  const height = dx * p.ux + dy * p.uy + dz * p.uz
  if (Math.abs(lateral) > p.w / 2 - 0.5 || height > 0.9 || height < -1.5) return false
  b.fail = false
  b.thrown = false
  b.i = best
  b.s = p.s
  b.lane = lateral
  b.laneTarget = lateral
  b.laneVel = 0
  b.speed = Math.max(0, Math.min(b.maxSpeed, b.failVel.x * p.fx + b.failVel.y * p.fy + b.failVel.z * p.fz))
  if (p.section > b.section && stage.checkpoints[p.section]) b.checkpoint = p.section
  b.section = p.section
  return true
}

/** Height of a jump's arc above the straight line across a gap, at sample i. */
function airLift(path, i) {
  let from = i
  let to = i
  while (from > 0 && path[from - 1].air) from -= 1
  while (to < path.length - 1 && path[to + 1].air) to += 1
  const len = path[to].s - path[from].s || 1
  const u = (path[i].s - path[from].s) / len
  return 4 * 3.5 * u * (1 - u)
}

function pose(b) {
  _q.copy(b.quaternion)
  _wheels.spin = b.spin
  b.rig.pose(b.position, _q, _wheels)
}
