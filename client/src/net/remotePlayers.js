import { Color, Quaternion, Vector3 } from 'three'

import { startRespawnGhost, TELEPORT_JUMP } from '@shared/bump'
import { carById } from '@shared/cars'
import { paintColor } from '@shared/cosmetics'
import { POSE_BYTES, readPose } from '@shared/poseCodec'

import { CarRig } from '../game/cars/CarRig'
import { getCarModel } from '../game/cars/carModels'
import { addCarBody, setCarBodyShape } from '../game/physics/carBody'
import { physicsWorld } from '../game/physics/instance'
import { runtime } from '../game/runtime'

/**
 * Other players' cars, as the network last described them. Who is in the room comes
 * from the synced state (upsertRemotePlayer); where their cars are comes from the
 * room's binary 'P' pose batches (applyPoseBatch, shared/poseCodec.js). Network
 * callbacks write here; game/remote/RemoteCars.jsx reads it each frame, interpolates
 * between snapshots and picks how each car is drawn (full car, proxy, or not at all).
 *
 * Nothing here runs per frame, and snapshots are pooled per player: a steady stream of
 * poses allocates nothing.
 */

/** sessionId -> remote player */
export const remotePlayers = new Map()
/** Every remote player, sorted nearest the camera first by RemoteCars each frame. */
export const remoteOrder = []
/** Pose slot -> remote player. */
const bySlot = []
/** Poses that arrived before the state said whose slot it is: slot -> snapshot. */
const early = []

const MAX_SNAPSHOTS = 12
/** Shortest interpolation delay (ms), for cars relayed at the full 10 Hz. */
export const MIN_DELAY_MS = 120
/** A gap this much longer than usual means the car was parked (reports slow to 1 Hz). */
const PARKED_GAP = 2.5

const _pose = { slot: 0, boost: false, x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 }

/**
 * After we ram another player's car, it is drawn thrown at once (RemoteCars adds this
 * offset) for the round trip until its owner's own thrown poses arrive, then the
 * offset fades out. Seconds the offset grows / fades over:
 */
export const KICK_GROW = 0.3
export const KICK_FADE = 0.45
/** After a player's bump threw us, their car is a ghost to ours this long (ms): their stale pose can't hit us again. */
const BUMPED_GHOST_MS = 700

/** Size and paint of the low-poly stand-in for a car id (and Store paint): its body's bounding box. */
const proxyLooks = new Map()
function proxyLook(carId, paintId) {
  const key = `${carId}:${paintId || ''}`
  let look = proxyLooks.get(key)
  if (look) return look
  const geometry = getCarModel(carId).geometry
  if (!geometry.boundingBox) geometry.computeBoundingBox()
  const box = geometry.boundingBox
  look = {
    size: box.getSize(new Vector3()),
    // Bottom centre of the box, in the car's own frame.
    offset: new Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2),
    paint: new Color(paintColor(paintId) || carById(carId)?.colors?.body || '#b8c4cf'),
  }
  proxyLooks.set(key, look)
  return look
}

function pushSnapshot(r, t, p) {
  const snaps = r.snaps
  const last = snaps[snaps.length - 1]
  // A jump this long is a respawn: their car is a ghost for a moment (shared/bump.js).
  if (last && (p.x - last.x) ** 2 + (p.y - last.y) ** 2 + (p.z - last.z) ** 2 > TELEPORT_JUMP * TELEPORT_JUMP) startRespawnGhost(r.protect, t)
  if (last) {
    const gap = t - last.t
    if (gap > Math.max(250, r.interval * PARKED_GAP)) {
      // Parked, then moving again: hold the old pose until one interval before this,
      // rather than sliding there over the whole pause.
      const hold = takeSnapshot(r)
      Object.assign(hold, last)
      hold.t = t - r.interval
      snaps.push(hold)
    } else {
      r.interval += (Math.min(600, Math.max(50, gap)) - r.interval) * 0.2
    }
  }
  const s = takeSnapshot(r)
  s.t = t
  s.x = p.x
  s.y = p.y
  s.z = p.z
  s.qx = p.qx
  s.qy = p.qy
  s.qz = p.qz
  s.qw = p.qw
  snaps.push(s)
}

/** A snapshot object to fill: the oldest one recycled once the list is full. */
function takeSnapshot(r) {
  if (r.snaps.length >= MAX_SNAPSHOTS) return r.snaps.shift()
  return r.spare.pop() || { t: 0, x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 }
}

function applyPose(r, t, p) {
  if (!r.hasPose) {
    r.hasPose = true
    r.position.set(p.x, p.y, p.z)
    r.quaternion.set(p.qx, p.qy, p.qz, p.qw)
  }
  r.boosting = p.boost
  pushSnapshot(r, t, p)
}

/** A player in the synced state was added or changed (not their pose: see applyPoseBatch). */
export function upsertRemotePlayer(sessionId, state) {
  let r = remotePlayers.get(sessionId)
  if (!r) {
    r = {
      sessionId,
      name: '',
      uid: '',
      slot: -1,
      carId: 'buggy',
      paint: '',
      nitro: '',
      checkpoint: 0,
      boosting: false,
      /** False until the first pose arrives: not drawn, no collisions, not on the rail. */
      hasPose: false,
      snaps: [],
      spare: [],
      /** Smoothed time between snapshots (ms): far cars are relayed less often. */
      interval: 100,
      /** Interpolation delay (ms), eased towards what `interval` needs. */
      delay: MIN_DELAY_MS,
      position: new Vector3(),
      quaternion: new Quaternion(),
      /** Its car (added to the scene by RemoteCars) and physics body, made here, outside the frame loop. */
      rig: new CarRig(state.car || 'buggy', state.paint || undefined, true),
      added: false,
      body: null,
      /** Predicted throw after we rammed it: seconds since (-1 = none), velocity, offset. */
      kick: { t: -1, vel: new Vector3(), off: new Vector3() },
      /** performance.now() until which it doesn't collide with us (see bumpedBy). */
      ghostUntil: 0,
      /** Respawn protection (shared/bump.js respawnGhost). */
      protect: { pending: false, until: 0 },
      shadow: null,
      spin: 0,
      /** How RemoteCars draws it: 0 not at all, 1 proxy, 2 full car. Ranking key for that. */
      lod: 0,
      rank: Infinity,
      dist2: Infinity,
      look: null,
    }
    r.rig.visible = false
    // Off until RemoteCars finds it near: far cars don't cost collision checks.
    r.body = addCarBody(physicsWorld, 'player', r)
    r.shadow = { position: r.position, size: 1.6, visible: false }
    runtime.shadowCasters.add(r.shadow)
    remotePlayers.set(sessionId, r)
    remoteOrder.push(r)
  }
  r.name = state.name || 'Player'
  r.uid = state.uid || ''
  r.carId = state.car || 'buggy'
  r.paint = state.paint || undefined
  r.nitro = state.nitro || ''
  r.look = proxyLook(r.carId, r.paint)
  setCarBodyShape(r.body, r.carId)
  r.checkpoint = state.cp || 0
  const slot = Number.isInteger(state.slot) ? state.slot : -1
  if (slot !== r.slot) {
    if (r.slot >= 0 && bySlot[r.slot] === r) bySlot[r.slot] = null
    r.slot = slot
    if (slot >= 0) {
      bySlot[slot] = r
      const pending = early[slot]
      if (pending) {
        early[slot] = null
        if (performance.now() - pending.t < 2000) applyPose(r, pending.t, pending)
      }
    }
  }
}

/**
 * A 'P' message from the room: poses of the cars that moved, POSE_BYTES each
 * (shared/poseCodec.js).
 * @param {Uint8Array} bytes
 */
export function applyPoseBatch(bytes) {
  if (!bytes?.byteLength) return
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const t = performance.now()
  for (let o = 0; o + POSE_BYTES <= bytes.byteLength; o += POSE_BYTES) {
    readPose(view, o, _pose)
    const r = bySlot[_pose.slot]
    if (r) {
      applyPose(r, t, _pose)
      continue
    }
    // Pose before the state patch that adds its player: keep it for a moment.
    const pending = (early[_pose.slot] ||= { t: 0, slot: 0, boost: false, x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 })
    Object.assign(pending, _pose)
    pending.t = t
  }
}

/**
 * We rammed remote player `r` (physics/car.js): draw it thrown by `imp` (m/s) right
 * away instead of waiting a round trip for its owner's poses (RemoteCars applies it).
 */
export function kickRemote(r, imp) {
  r.kick.t = 0
  r.kick.vel.set(imp.x, imp.y, imp.z)
  r.kick.off.set(0, 0, 0)
}

/** Player `sessionId`'s bump just threw us: their car stops colliding with ours for a moment. Returns their name. */
export function bumpedBy(sessionId) {
  const r = remotePlayers.get(sessionId)
  if (!r) return ''
  r.ghostUntil = performance.now() + BUMPED_GHOST_MS
  return r.name
}

/** Called by RemoteCars when a player leaves, after it has tidied their rig. */
export const removedPlayers = []

export function removeRemotePlayer(sessionId) {
  const r = remotePlayers.get(sessionId)
  if (!r) return
  remotePlayers.delete(sessionId)
  const i = remoteOrder.indexOf(r)
  if (i >= 0) remoteOrder.splice(i, 1)
  if (r.slot >= 0 && bySlot[r.slot] === r) bySlot[r.slot] = null
  physicsWorld.removeDynamic(r.body)
  runtime.shadowCasters.delete(r.shadow)
  removedPlayers.push(r)
}

export function clearRemotePlayers() {
  for (const id of [...remotePlayers.keys()]) removeRemotePlayer(id)
  early.length = 0
}
