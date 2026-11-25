import { AdditiveBlending, Color, ConeGeometry, CylinderGeometry, IcosahedronGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { inSafeZone, pvpEnabled } from '@shared/safeZones'
import {
  MISSILE_CONE,
  MISSILE_FRONT_RANGE,
  MISSILE_HIT_RADIUS,
  MISSILE_LIFE,
  MISSILE_REAR_RANGE,
  MISSILE_SPEED,
  MISSILE_TURN,
} from '@shared/missile'

import { sfx } from '../../audio/sfx'
import { actions } from '../../net/actions'
import { remoteOrder, remotePlayers } from '../../net/remotePlayers'
import { getGame } from '../../store/game'
import { getQuality } from '../../store/quality'
import { defer } from '../defer'
import { physicsWorld } from '../physics/instance'
import { runtime } from '../runtime'
import { currentStage } from '../stageRuntime'
import { burstAt } from './fxQueue'
import { hub } from './missileHub'

/**
 * The Rocket Missile item. Everything is pooled and module-level: at most MAX_MISSILES in
 * flight (yours, and a few other players' - drawn from the room's 'shot' message), a ring
 * of trail puffs, a few burners (flames on a burning car) and explosion cores, all drawn
 * by TWO instanced meshes (the missile bodies, and one additive "glow" mesh that is every
 * flame, trail and fireball) - so a missile is two draw calls whatever the preset, and the
 * LOW preset (no particles) still shows a visible missile, trail and fire. MEDIUM and HIGH
 * add particle flames and smoke on top (fx/Particles.jsx, through `burstAt`). Nothing here
 * allocates per frame.
 *
 * Firing (`fire`, from game/player/PlayerCar.jsx): the nearest valid target in a forward
 * cone, else in a rear cone, else straight ahead; the missile flies MISSILE_SPEED with
 * turn-rate-limited homing for MISSILE_LIFE s and explodes on the first valid car it
 * touches, on a solid, or when it runs out. What counts as a valid target comes from the
 * registered providers (./missileHub.js): CPU racers, police, and other players here.
 * Another player hit: the room is told ('missileHit'), validates it and burns them.
 */

const MAX_MISSILES = 8
/** Own missiles in flight at most (the item has a cooldown anyway). */
const MAX_MINE = 3
const TRAIL = 56
const BURNERS = 6
const BOOMS = 4
const GLOW_MAX = MAX_MISSILES * 2 + TRAIL + BURNERS * 3 + BOOMS
const COS_CONE = Math.cos(MISSILE_CONE)
const HIT_R2 = MISSILE_HIT_RADIUS * MISSILE_HIT_RADIUS
/** Where on a car the missile aims (m above its position). */
const AIM_UP = 0.6

const _p = new Vector3()
const _s = new Vector3()
const _q = new Quaternion()
const _qi = new Quaternion()
const _m = new Matrix4()
const _c = new Color()
const _fwd = new Vector3()
const _to = new Vector3()
const FWD = new Vector3(0, 0, -1)
const _rayHit = { dist: 0, normal: new Vector3(), grip: 1, dynamic: null, kind: '' }

const missiles = Array.from({ length: MAX_MISSILES }, () => ({
  active: false,
  mine: false,
  t: 0,
  trailT: 0,
  pos: new Vector3(),
  prev: new Vector3(),
  dir: new Vector3(0, 0, -1),
  /** The target it homes on (`{ pos, provider, ref }`) or null. */
  target: null,
}))
const trail = Array.from({ length: TRAIL }, () => ({ life: 0, max: 0.4, size: 0.5, pos: new Vector3() }))
const burners = Array.from({ length: BURNERS }, () => ({ active: false, t: 0, seed: 0, puffT: 0, pos: null }))
const booms = Array.from({ length: BOOMS }, () => ({ life: 0, max: 0.5, size: 4, pos: new Vector3() }))
let trailAt = 0
let boomAt = 0
let clock = 0
/** How the last missile ended (debug hooks): 'hit' | 'solid:<kind>' | 'expired', and its age (s). */
let lastEnd = ''
let lastAge = 0

/** You, as another player's missile sees you (`{ pos, provider, ref }`). */
const meTarget = { pos: runtime.car.position, provider: null, ref: null }

// --- Targets -------------------------------------------------------------------------

/**
 * Other players as targets. Valid when the map has player-vs-player at all, they have a
 * pose, aren't respawn-protected or in a safe zone, and we haven't just hit them. The
 * room checks all of it again (shared/missile.js).
 */
const remoteTargetOf = (r) => (r.missileTarget ||= { pos: r.position, provider: remoteProvider, ref: r })
const remoteProvider = {
  each(visit) {
    const stage = currentStage()
    if (!pvpEnabled(stage)) return
    const now = performance.now()
    for (let i = 0; i < remoteOrder.length; i += 1) {
      const r = remoteOrder[i]
      if (!r.hasPose || r.rank === Infinity || now < r.protect.until || now < (r.missileUntil || 0)) continue
      const p = r.position
      if (inSafeZone(stage, p.x, p.y, p.z)) continue
      visit(remoteTargetOf(r))
    }
  },
  hit(t) {
    const r = t.ref
    r.missileUntil = performance.now() + 4500
    actions.missileHit(r.sessionId)
    return true
  },
}

// Target choice while firing (module state so the visitor needs no closure).
let _ox = 0
let _oy = 0
let _oz = 0
let _fx = 0
let _fz = 0
let front = null
let frontD = Infinity
let rear = null
let rearD = Infinity

function consider(t) {
  const dx = t.pos.x - _ox
  const dz = t.pos.z - _oz
  if (Math.abs(t.pos.y - _oy) > 22) return
  const d = Math.hypot(dx, dz)
  if (d < 1) return
  const cos = (dx * _fx + dz * _fz) / d
  if (cos >= COS_CONE) {
    if (d <= MISSILE_FRONT_RANGE && d < frontD) {
      front = t
      frontD = d
    }
  } else if (cos <= -COS_CONE && d <= MISSILE_REAR_RANGE && d < rearD) {
    rear = t
    rearD = d
  }
}

function eachTarget(visit) {
  remoteProvider.each(visit)
  const providers = hub.providers
  for (let i = 0; i < providers.length; i += 1) providers[i].each(visit)
}

// Segment test while flying (module state, as above).
let _hitT = null
let _hitD = Infinity
let _ax = 0
let _ay = 0
let _az = 0
let _bx = 0
let _by = 0
let _bz = 0

/** The nearest valid target the missile's last step passed within MISSILE_HIT_RADIUS of. */
function touch(t) {
  const px = t.pos.x
  const py = t.pos.y + AIM_UP
  const pz = t.pos.z
  const sx = _bx - _ax
  const sy = _by - _ay
  const sz = _bz - _az
  const len2 = sx * sx + sy * sy + sz * sz || 1
  const k = Math.max(0, Math.min(1, ((px - _ax) * sx + (py - _ay) * sy + (pz - _az) * sz) / len2))
  const dx = _ax + sx * k - px
  const dy = _ay + sy * k - py
  const dz = _az + sz * k - pz
  const d2 = dx * dx + dy * dy + dz * dz
  if (d2 < HIT_R2 && d2 < _hitD) {
    _hitD = d2
    _hitT = t
  }
}

// --- Effects ---------------------------------------------------------------------------

const particlesOn = () => getQuality().particles

/** Distance from your car, for how loud / shaky an explosion is. */
const distToMe = (x, y, z) => Math.hypot(x - runtime.car.position.x, y - runtime.car.position.y, z - runtime.car.position.z)

/** A fireball at (x, y, z): glow core, particles where the preset has them, the boom, a shake. `size` 1 = a hit, less = a fizzle. */
function explode(x, y, z, size = 1) {
  const b = booms[boomAt]
  boomAt = (boomAt + 1) % BOOMS
  b.life = b.max = 0.35 + size * 0.2
  b.size = 2.2 + size * 3.2
  b.pos.set(x, y, z)
  if (particlesOn()) {
    burstAt(x, y, z, Math.round(10 + size * 14), 'flame', 8 * size + 2)
    burstAt(x, y, z, Math.round(4 + size * 8), 'spark', 9)
    if (size > 0.6) burstAt(x, y + 0.5, z, 8, 'smoke', 3)
  }
  const d = distToMe(x, y, z)
  sfx.explosion(size * Math.max(0, 1 - d / 160))
  if (d < 70) runtime.camera.shake = Math.max(runtime.camera.shake || 0, size * 0.45 * (1 - d / 70))
}

/** Flames on a car at `pos` (a live Vector3) for `seconds`. */
function ignite(pos, seconds) {
  let slot = null
  for (let i = 0; i < BURNERS; i += 1) {
    const b = burners[i]
    if (b.active && b.pos === pos) {
      b.t = Math.max(b.t, seconds)
      return
    }
    if (!b.active && !slot) slot = b
  }
  if (!slot) return
  slot.active = true
  slot.t = seconds
  slot.pos = pos
  slot.seed = Math.random() * 6.28
  slot.puffT = 0
}

// --- Flight ------------------------------------------------------------------------------

function freeMissile(mine) {
  let live = 0
  let free = null
  for (let i = 0; i < MAX_MISSILES; i += 1) {
    const m = missiles[i]
    if (!m.active) free ||= m
    else if (m.mine) live += 1
  }
  if (mine && live >= MAX_MINE) return null
  return free
}

function launch(m, mine, target, dx, dy, dz) {
  m.active = true
  m.mine = mine
  m.t = 0
  m.trailT = 0
  m.target = target
  m.dir.set(dx, dy, dz).normalize()
  m.prev.copy(m.pos)
}

/**
 * Fires your missile from `car` (runtime.car). False if it can't go (the chunk is up but
 * the pool is full). The caller has checked the safe zone.
 */
function fire(car) {
  const m = freeMissile(true)
  if (!m) return false
  const stage = currentStage()
  _fx = -Math.sin(car.yaw)
  _fz = -Math.cos(car.yaw)
  _ox = car.position.x
  _oy = car.position.y
  _oz = car.position.z
  front = null
  frontD = Infinity
  rear = null
  rearD = Infinity
  eachTarget(consider)
  const behind = !front && rear
  const target = front || rear || null
  const sign = behind ? -1 : 1
  // Along the way the car points (the road climbs: a level missile would hit it), not too steeply.
  _fwd.copy(FWD).applyQuaternion(car.quaternion)
  _fwd.y = Math.max(-0.45, Math.min(0.45, _fwd.y))
  _fwd.normalize()
  m.pos.set(_ox + _fwd.x * 2.6 * sign, _oy + _fwd.y * 2.6 * sign + 0.9, _oz + _fwd.z * 2.6 * sign)
  launch(m, true, target, _fwd.x * sign, _fwd.y * sign, _fwd.z * sign)
  sfx.missileLaunch()
  runtime.camera.shake = Math.max(runtime.camera.shake || 0, 0.1)
  if (pvpEnabled(stage)) actions.missile(target?.provider === remoteProvider ? target.ref.sessionId : '')
  if (particlesOn()) burstAt(m.pos.x, m.pos.y, m.pos.z, 8, 'smoke', 3)
  return true
}

/** The room says another player fired (`you`: at us): draws their missile. */
function remoteShot(fromId, toId, you) {
  const r = remotePlayers.get(fromId)
  const m = freeMissile(false)
  if (!r || !r.hasPose || !m) return
  const to = toId && !you ? remotePlayers.get(toId) : null
  const target = you ? meTarget : to ? remoteTargetOf(to) : null
  _fwd.copy(FWD).applyQuaternion(r.quaternion)
  _fwd.y = 0
  if (_fwd.lengthSq() < 1e-4) _fwd.set(0, 0, -1)
  _fwd.normalize()
  m.pos.set(r.position.x + _fwd.x * 2.6, r.position.y + 0.9, r.position.z + _fwd.z * 2.6)
  let dx = _fwd.x
  let dz = _fwd.z
  // Aimed behind them: it goes that way.
  if (target && (target.pos.x - r.position.x) * dx + (target.pos.z - r.position.z) * dz < 0) {
    dx = -dx
    dz = -dz
    m.pos.set(r.position.x + dx * 2.6, r.position.y + 0.9, r.position.z + dz * 2.6)
  }
  launch(m, false, target, dx, 0, dz)
  if (distToMe(m.pos.x, m.pos.y, m.pos.z) < 80) sfx.missileLaunch()
}

function toast(text, kind) {
  defer(() => getGame().showToast(text, kind))
}

/** Advances one missile; returns after it may have exploded (`active` false). */
function step(m, dt) {
  const tg = m.target
  if (tg) {
    _to.set(tg.pos.x - m.pos.x, tg.pos.y + AIM_UP - m.pos.y, tg.pos.z - m.pos.z)
    const d = _to.length()
    if (d > 0.01) {
      _to.multiplyScalar(1 / d)
      const ang = Math.acos(Math.max(-1, Math.min(1, m.dir.dot(_to))))
      const turn = MISSILE_TURN * dt
      if (ang <= turn) m.dir.copy(_to)
      else {
        m.dir.lerp(_to, turn / ang)
        if (m.dir.lengthSq() < 1e-6) m.dir.copy(_to)
        m.dir.normalize()
      }
    }
  }
  m.prev.copy(m.pos)
  const len = MISSILE_SPEED * dt
  m.pos.addScaledVector(m.dir, len)
  m.t += dt

  if (m.mine) {
    // Touching a valid car on this step, else a solid (a wall, a rail, an obstacle).
    _hitT = null
    _hitD = Infinity
    _ax = m.prev.x
    _ay = m.prev.y
    _az = m.prev.z
    _bx = m.pos.x
    _by = m.pos.y
    _bz = m.pos.z
    eachTarget(touch)
    if (_hitT) {
      m.active = false
      lastEnd = 'hit'
      lastAge = m.t
      explode(m.pos.x, m.pos.y, m.pos.z, 1)
      if (_hitT.provider.hit(_hitT) && _hitT.provider !== remoteProvider) toast('HIT!', 'success')
      return
    }
    if (physicsWorld.raycast(m.prev, m.dir, len + 0.4, _rayHit)) {
      const n = _rayHit.normal
      const into = m.dir.dot(n)
      if (n.y > 0.6 && into > -0.8) {
        // A floor (the road, a plaza) it meets at a shallow angle: it skims along it, a little above.
        m.pos.set(m.prev.x + m.dir.x * _rayHit.dist + n.x * 0.7, m.prev.y + m.dir.y * _rayHit.dist + n.y * 0.7, m.prev.z + m.dir.z * _rayHit.dist + n.z * 0.7)
        m.dir.addScaledVector(n, -into).normalize()
      } else {
        m.active = false
        lastEnd = `solid:${_rayHit.kind}`
        lastAge = m.t
        explode(m.prev.x + m.dir.x * _rayHit.dist, m.prev.y + m.dir.y * _rayHit.dist, m.prev.z + m.dir.z * _rayHit.dist, 0.7)
        toast('MISSED', 'info')
        return
      }
    }
  } else if (tg) {
    // Another player's missile: it just flies up to its target and blows up.
    const dx = tg.pos.x - m.pos.x
    const dy = tg.pos.y + AIM_UP - m.pos.y
    const dz = tg.pos.z - m.pos.z
    if (dx * dx + dy * dy + dz * dz < HIT_R2 * 1.4) {
      m.active = false
      explode(m.pos.x, m.pos.y, m.pos.z, 1)
      return
    }
  }
  if (m.t >= MISSILE_LIFE) {
    m.active = false
    lastEnd = 'expired'
    lastAge = m.t
    explode(m.pos.x, m.pos.y, m.pos.z, 0.35)
    if (m.mine) toast('MISSED', 'info')
  }
}

// --- The system: two instanced meshes ----------------------------------------------------

export function createMissileSystem() {
  // The missile: a capsule-ish body with a nose cone, pointing down -z, ~1.9 m long.
  const body = new CylinderGeometry(0.15, 0.15, 1.1, 8).rotateX(-Math.PI / 2)
  const nose = new ConeGeometry(0.15, 0.55, 8).rotateX(-Math.PI / 2).translate(0, 0, -0.82)
  const fins = new CylinderGeometry(0.02, 0.2, 0.38, 3, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.46)
  const bodyGeo = mergeGeometries([body, nose, fins])
  body.dispose()
  nose.dispose()
  fins.dispose()
  const bodyMat = new MeshBasicMaterial({ color: '#ff5a2a' })
  const bodyMesh = new InstancedMesh(bodyGeo, bodyMat, MAX_MISSILES)
  bodyMesh.count = 0
  bodyMesh.frustumCulled = false
  bodyMesh.visible = false
  bodyMesh.name = 'missiles'

  const glowGeo = new IcosahedronGeometry(1, 1)
  const glowMat = new MeshBasicMaterial({ color: '#ffffff', blending: AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, fog: false })
  const glow = new InstancedMesh(glowGeo, glowMat, GLOW_MAX)
  glow.setColorAt(0, _c.set('#ffffff'))
  glow.count = 0
  glow.frustumCulled = false
  glow.visible = false
  glow.renderOrder = 3
  glow.name = 'missile-glow'

  let nGlow = 0
  /**
   * One glow sphere from `G` (x, y, z, size, age 0 white-hot .. 1 dull red, brightness): the
   * arguments go through a typed array, not call parameters, so nothing is boxed per call.
   */
  const G = new Float64Array(6)
  const put = () => {
    const size = G[3]
    if (nGlow >= GLOW_MAX || size <= 0.01) return
    const age = G[4]
    const k = G[5]
    _m.compose(_p.set(G[0], G[1], G[2]), _qi, _s.setScalar(size))
    glow.setMatrixAt(nGlow, _m)
    _c.setRGB(k, k * (1 - age * 0.78), k * Math.max(0, 0.55 - age) * 0.9)
    glow.setColorAt(nGlow, _c)
    nGlow += 1
  }

  function update(rawDt) {
    const dt = Math.min(rawDt, 0.05)
    clock += dt
    nGlow = 0
    let nBody = 0
    const rich = getQuality().particles
    const puffEvery = rich ? 0.03 : 0.045

    for (let i = 0; i < MAX_MISSILES; i += 1) {
      const m = missiles[i]
      if (!m.active) continue
      step(m, dt)
      if (!m.active) continue
      _q.setFromUnitVectors(FWD, m.dir)
      _m.compose(m.pos, _q, _s.set(1.2, 1.2, 1.2))
      bodyMesh.setMatrixAt(nBody, _m)
      nBody += 1
      // Exhaust glow behind it, flickering, and a trail puff every few frames.
      const flick = 1 + Math.sin(clock * 60 + i) * 0.18
      G[0] = m.pos.x - m.dir.x * 1.1
      G[1] = m.pos.y - m.dir.y * 1.1
      G[2] = m.pos.z - m.dir.z * 1.1
      G[3] = 0.75 * flick
      G[4] = 0.05
      G[5] = 1
      put()
      G[0] = m.pos.x - m.dir.x * 1.9
      G[1] = m.pos.y - m.dir.y * 1.9
      G[2] = m.pos.z - m.dir.z * 1.9
      G[3] = 0.5 * flick
      G[4] = 0.35
      G[5] = 0.9
      put()
      m.trailT -= dt
      if (m.trailT <= 0) {
        m.trailT = puffEvery
        const p = trail[trailAt]
        trailAt = (trailAt + 1) % TRAIL
        p.pos.copy(m.pos).addScaledVector(m.dir, -1.6)
        p.life = p.max = 0.45
        p.size = 0.55
        if (rich) burstAt(p.pos.x, p.pos.y, p.pos.z, 1, 'smoke', 1)
      }
    }
    bodyMesh.count = nBody
    bodyMesh.visible = nBody > 0
    if (nBody) bodyMesh.instanceMatrix.needsUpdate = true

    for (let i = 0; i < TRAIL; i += 1) {
      const p = trail[i]
      if (p.life <= 0) continue
      p.life -= dt
      const u = 1 - Math.max(0, p.life) / p.max
      G[0] = p.pos.x
      G[1] = p.pos.y
      G[2] = p.pos.z
      G[3] = p.size * (1 - u * 0.5)
      G[4] = 0.2 + u * 0.8
      G[5] = (1 - u) * 0.8
      put()
    }

    for (let i = 0; i < BURNERS; i += 1) {
      const b = burners[i]
      if (!b.active) continue
      b.t -= dt
      if (b.t <= 0 || !b.pos) {
        b.active = false
        b.pos = null
        continue
      }
      const fade = Math.min(1, b.t * 3)
      for (let k = 0; k < 3; k += 1) {
        const ph = clock * 9 + b.seed + k * 2.1
        const rise = (Math.sin(ph * 1.3) * 0.5 + 0.5) * 0.5
        G[0] = b.pos.x + Math.sin(ph * 1.7) * 0.55
        G[1] = b.pos.y + 0.55 + k * 0.5 + rise
        G[2] = b.pos.z + Math.cos(ph * 1.4) * 0.75
        G[3] = (1.05 - k * 0.22 + Math.sin(ph * 2.3) * 0.2) * fade
        G[4] = 0.28 + k * 0.26
        G[5] = 0.95
        put()
      }
      if (rich) {
        b.puffT -= dt
        if (b.puffT <= 0) {
          b.puffT = 0.06
          burstAt(b.pos.x, b.pos.y + 0.8, b.pos.z, 2, 'flame', 2.5)
          if (Math.random() < 0.4) burstAt(b.pos.x, b.pos.y + 1.4, b.pos.z, 1, 'soot', 2)
        }
      }
    }

    for (let i = 0; i < BOOMS; i += 1) {
      const b = booms[i]
      if (b.life <= 0) continue
      b.life -= dt
      const u = 1 - Math.max(0, b.life) / b.max
      G[0] = b.pos.x
      G[1] = b.pos.y
      G[2] = b.pos.z
      G[3] = b.size * (0.35 + u * 0.75)
      G[4] = u * 0.9
      G[5] = 1 - u * u
      put()
    }

    glow.count = nGlow
    glow.visible = nGlow > 0
    if (nGlow) {
      glow.instanceMatrix.needsUpdate = true
      if (glow.instanceColor) glow.instanceColor.needsUpdate = true
    }
  }

  /** Live counts (debug hooks and the perf report). */
  const stats = () => ({
    missiles: missiles.filter((m) => m.active).length,
    mine: missiles.filter((m) => m.active && m.mine).length,
    burners: burners.filter((b) => b.active).length,
    booms: booms.filter((b) => b.life > 0).length,
    glow: nGlow,
    bodies: bodyMesh.count,
    lastEnd,
    lastAge: +lastAge.toFixed(2),
  })

  /** Hooks the system up (for the mounted component's lifetime); returns the undo. */
  function install() {
    hub.fire = fire
    hub.remoteShot = remoteShot
    hub.ignite = ignite
    hub.stats = stats
    return () => {
      if (hub.fire === fire) hub.fire = null
      if (hub.remoteShot === remoteShot) hub.remoteShot = null
      if (hub.ignite === ignite) hub.ignite = null
      if (hub.stats === stats) hub.stats = null
      for (const m of missiles) m.active = false
      for (const p of trail) p.life = 0
      for (const b of burners) {
        b.active = false
        b.pos = null
      }
      for (const b of booms) b.life = 0
    }
  }

  // Disposing frees the GPU copies; three re-uploads them if the canvas comes back.
  const dispose = () => {
    bodyGeo.dispose()
    bodyMat.dispose()
    glowGeo.dispose()
    glowMat.dispose()
  }

  return { bodyMesh, glow, update, install, dispose, stats }
}
