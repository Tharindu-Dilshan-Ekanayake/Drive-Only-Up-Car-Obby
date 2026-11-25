import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { BoxGeometry, Float32BufferAttribute, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { respawnGhost } from '@shared/bump'
import { inSafeZone, pvpEnabled } from '@shared/safeZones'

import { KICK_FADE, KICK_GROW, MIN_DELAY_MS, remoteOrder, removedPlayers } from '../../net/remotePlayers'
import { getQuality } from '../../store/quality'
import { poseCarBody } from '../physics/carBody'
import { getWorldMaterial } from '../render/worldMaterial'
import { runtime } from '../runtime'
import { currentStage } from '../stageRuntime'

/**
 * Draws other players' cars, interpolated a little behind the newest snapshot, with a
 * level of detail that keeps 49 of them inside the draw-call budget:
 *
 * - the nearest `fullCars` (quality preset: 5 / 14 / 24) as their real car, one draw
 *   each (low-detail body past `carLod`, cars/CarRig.js), wheels in the shared wheel
 *   batch; only the nearest SHADOW_CARS cast realtime
 *   shadows;
 * - everyone else within view distance as ONE instanced draw of a low-poly car-shaped
 *   proxy (~36 triangles each), sized to their car and painted its colour;
 * - beyond view distance, nothing.
 *
 * Cars behind the camera rank as if further away, so the full-car slots go to what you
 * can see. Only cars near you get a collision box (physics/carBody.js: ramming one
 * throws it, see physics/car.js), and none while it or you is in a safe zone
 * (shared/safeZones.js: lobby, checkpoint plazas), where cars pass through each other.
 * The nearest-first order (remoteOrder) is shared with the nameplates. Nothing here
 * allocates per frame.
 */

/** Cars at most this far from yours have a collision sphere (m). */
const COLLIDE_DIST = 25
/**
 * At most this many remote cars collide at once (the nearest), so obstacles (worst 23
 * in the active window) + remote cars stay inside the 30 moving-body budget on LOW.
 */
const MAX_COLLIDERS = 6
/** Full cars that also cast realtime shadows (HIGH), nearest first. */
const SHADOW_CARS = 8
/** Behind the camera, distance counts this much more (squared) when ranking. */
const BEHIND_PENALTY = 4
/** A car drawn full keeps its place unless another is this much nearer (squared). */
const HYSTERESIS = 0.8
/** Proxy instances: every possible remote player. */
const MAX_PROXIES = 64
/** Gravity for a predicted throw (as the car physics). */
const KICK_GRAVITY = 22

const _qa = new Quaternion()
const _qb = new Quaternion()
const _prev = new Vector3()
const _dir = new Vector3()
const _off = new Vector3()
const _scale = new Vector3()
const _m = new Matrix4()
/** Wheel state handed to CarRig.pose (reused). */
const _wheels = { spin: 0 }

/**
 * A unit car (1 x 1 x 1, bottom centre at the origin, nose towards -z): wheel slab,
 * body and cabin. Vertex colours shade the parts; the instance colour paints them.
 */
function buildProxyGeometry() {
  const part = (w, h, d, x, y, z, shade) => {
    const g = new BoxGeometry(w, h, d).translate(x, y, z)
    g.deleteAttribute('uv')
    const n = g.attributes.position.count
    g.setAttribute('color', new Float32BufferAttribute(new Array(n * 3).fill(shade), 3))
    g.setAttribute('aPattern', new Float32BufferAttribute(new Array(n * 2).fill(0), 2))
    return g
  }
  const parts = [
    part(1, 0.38, 0.8, 0, 0.19, 0, 0.18),
    part(0.96, 0.4, 1, 0, 0.5, 0, 1),
    part(0.78, 0.3, 0.48, 0, 0.85, 0.08, 0.72),
  ]
  const geometry = mergeGeometries(parts, false)
  for (const g of parts) g.dispose()
  return geometry
}

/** Module-level: the one proxy batch, mutated every frame (see CarFx for the pattern). */
let proxies = null

function createProxies() {
  const mesh = new InstancedMesh(buildProxyGeometry(), getWorldMaterial(), MAX_PROXIES)
  mesh.name = 'remote-proxies'
  mesh.count = 0
  mesh.frustumCulled = false
  mesh.castShadow = false
  mesh.receiveShadow = true
  // Allocates the per-instance colour buffer once.
  for (let i = 0; i < MAX_PROXIES; i += 1) mesh.setColorAt(i, getWorldMaterial().color)
  return mesh
}

/** Interpolates r between the two snapshots around its render time; returns false with none. */
function interpolate(r, now, dt) {
  const snaps = r.snaps
  if (!snaps.length) return false
  // Far cars are relayed less often: wait long enough to always have two snapshots.
  const want = Math.max(MIN_DELAY_MS, r.interval * 1.3 + 20)
  r.delay += (want - r.delay) * Math.min(1, dt * 2)
  const renderAt = now - r.delay
  let i = snaps.length - 1
  while (i > 0 && snaps[i - 1].t > renderAt) i -= 1
  const b = snaps[i]
  const a = snaps[Math.max(0, i - 1)]
  const span = b.t - a.t || 1
  const u = Math.max(0, Math.min(1, (renderAt - a.t) / span))
  _prev.copy(r.position)
  r.position.set(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u)
  _qa.set(a.qx, a.qy, a.qz, a.qw)
  _qb.set(b.qx, b.qy, b.qz, b.qw)
  r.quaternion.slerpQuaternions(_qa, _qb, u)
  return true
}

/**
 * The predicted throw after we rammed r (net/remotePlayers.js kickRemote): an offset
 * that flies for KICK_GROW s, then fades over KICK_FADE s while its owner's real
 * (thrown) poses take over. Added to the interpolated position.
 */
function applyKick(r, dt) {
  const k = r.kick
  if (k.t < 0) return
  k.t += dt
  if (k.t < KICK_GROW) {
    k.vel.y -= KICK_GRAVITY * dt
    k.off.addScaledVector(k.vel, dt)
    if (k.off.y < 0) k.off.y = 0
  } else if (k.t < KICK_GROW + KICK_FADE) {
    k.off.multiplyScalar(Math.max(0, 1 - dt / Math.max(0.01, KICK_GROW + KICK_FADE - k.t + dt)))
  } else {
    k.t = -1
    k.off.set(0, 0, 0)
    return
  }
  r.position.add(k.off)
}

/** Insertion sort by rank (nearly sorted from last frame, so ~linear). */
function sortByRank(list) {
  for (let i = 1; i < list.length; i += 1) {
    const r = list[i]
    let j = i - 1
    while (j >= 0 && list[j].rank > r.rank) {
      list[j + 1] = list[j]
      j -= 1
    }
    list[j + 1] = r
  }
}

function updateRemoteCars(scene, dt) {
  // Players who left: take their car away.
  while (removedPlayers.length) scene.remove(removedPlayers.pop().rig.body)

  const now = performance.now()
  const cam = runtime.camera.object
  const eye = cam ? cam.position : runtime.car.position
  if (cam) cam.getWorldDirection(_dir)
  else _dir.set(0, 0, -1)
  const quality = getQuality()
  const view2 = quality.viewDistance * quality.viewDistance
  const inv = dt > 0 ? 1 / dt : 0

  // Where everyone is now, and how near (for the level of detail).
  for (let k = 0; k < remoteOrder.length; k += 1) {
    const r = remoteOrder[k]
    if (!r.added) {
      r.added = true
      scene.add(r.rig.body)
    }
    if (!r.hasPose || !interpolate(r, now, dt)) {
      r.rank = Infinity
      continue
    }
    applyKick(r, dt)
    const dx = r.position.x - eye.x
    const dy = r.position.y - eye.y
    const dz = r.position.z - eye.z
    let d2 = dx * dx + dy * dy + dz * dz
    r.dist2 = d2
    if (dx * _dir.x + dy * _dir.y + dz * _dir.z < 0) d2 *= BEHIND_PENALTY
    r.rank = r.lod === 2 ? d2 * HYSTERESIS : d2
    // Their velocity, for knocks and wheel spin.
    r.body.vel.set((r.position.x - _prev.x) * inv, (r.position.y - _prev.y) * inv, (r.position.z - _prev.z) * inv)
  }
  sortByRank(remoteOrder)

  const car = runtime.car.position
  const youSafe = runtime.car.safe
  // A map without player-vs-player bumps (Heat Run): other players are pure ghosts - no bodies at all.
  const pvp = pvpEnabled(currentStage())
  let full = 0
  let proxy = 0
  let colliders = 0
  for (let k = 0; k < remoteOrder.length; k += 1) {
    const r = remoteOrder[k]
    const shown = r.rank !== Infinity && r.dist2 < view2
    r.lod = !shown ? 0 : full < quality.fullCars ? 2 : 1
    if (r.lod === 2) {
      full += 1
      r.rig.visible = true
      r.rig.body.castShadow = full <= SHADOW_CARS
      r.rig.setCar(r.carId, r.paint)
      r.spin += (r.body.vel.length() / 0.45) * dt
      _wheels.spin = r.spin
      r.rig.pose(r.position, r.quaternion, _wheels)
    } else {
      r.rig.visible = false
      r.rig.body.visible = false
    }
    if (r.lod === 1 && proxy < MAX_PROXIES) {
      const look = r.look
      _off.copy(look.offset).applyQuaternion(r.quaternion).add(r.position)
      _m.compose(_off, r.quaternion, _scale.copy(look.size))
      proxies.setMatrixAt(proxy, _m)
      proxies.setColorAt(proxy, look.paint)
      proxy += 1
    }
    r.shadow.visible = r.lod === 2
    const body = r.body
    body.enabled = pvp && colliders < MAX_COLLIDERS && r.lod === 2 && r.position.distanceToSquared(car) < COLLIDE_DIST * COLLIDE_DIST
    if (body.enabled) {
      colliders += 1
      poseCarBody(body, r.position, r.quaternion)
      const p = r.position
      const zone = inSafeZone(currentStage(), p.x, p.y, p.z)
      body.ghost = respawnGhost(r.protect, zone, now) || youSafe || now < r.ghostUntil || zone
    }
  }
  proxies.count = proxy
  if (proxy) {
    proxies.instanceMatrix.needsUpdate = true
    proxies.instanceColor.needsUpdate = true
  }
}

export default function RemoteCars() {
  const scene = useThree((s) => s.scene)
  proxies ||= createProxies()

  useEffect(
    () => () => {
      // The material is the shared world one: only the geometry is ours (three uploads
      // it again if the scene comes back).
      proxies?.geometry.dispose()
    },
    [],
  )

  useFrame((_, dt) => updateRemoteCars(scene, dt))

  return <primitive object={proxies} />
}
