import { Quaternion } from 'three'

import { DEFAULT_STAGE } from '@shared/stages/index'

import { getGame } from '../../store/game'

/**
 * Ghost tapes: your fastest drive through each section of the stage, recorded as you
 * go and replayed from the moment you leave the checkpoint before it, so you race your
 * own best split.
 *
 * Section `n` is the stretch that ends at checkpoint `n` (1 = Start gate to CP1). A tape
 * is samples of [t (s), x, y, z, qx, qy, qz, qw, wheel lift (m), steer (rad)] at RATE Hz, kept in localStorage per
 * section together with the split time and the car you drove. Plain module state; the
 * player controller drives the recorder and Ghost.jsx reads the player.
 */

const RATE = 8
const STRIDE = 10
/** Longest section we keep a tape for, s (a slower split just isn't recorded past it). */
const MAX_SECONDS = 240
const MAX_SAMPLES = MAX_SECONDS * RATE + 2
/** Consecutive samples further apart than this are a respawn: snap, don't glide. */
const JUMP = 25
/** Storage key of section `n`'s tape on the current map (Sky Docks keeps the pre-maps keys). */
const KEY = (n) => {
  const map = getGame().stageId
  return map === DEFAULT_STAGE ? `uwd.ghost.v1.${n}` : `uwd.ghost.v1.${map}.${n}`
}
const _q = new Quaternion()

/** Fingerprints of each stage's sections' roads (the stage object is never mutated, so cached per stage). */
const sigs = new WeakMap()

/**
 * A fingerprint of section `n`'s road on the current map (a hash of its centre line,
 * to the nearest half metre). A tape only plays if it was recorded on this exact road: the
 * maps get rebuilt (longer, narrower, new obstacles) and an old tape would drive its ghost
 * through the air where the road used to be. '' while the stage isn't loaded.
 */
function sectionSig(section) {
  const stage = getGame().stage
  if (!stage?.path?.length) return ''
  let bySection = sigs.get(stage)
  if (!bySection) sigs.set(stage, (bySection = new Map()))
  let sig = bySection.get(section)
  if (sig === undefined) {
    let h = 2166136261
    const mix = (v) => {
      h = Math.imul(h ^ (Math.round(v * 2) | 0), 16777619)
    }
    let n = 0
    for (const p of stage.path) {
      if (p.section !== section - 1) continue
      if (n++ % 6 === 0) {
        mix(p.x)
        mix(p.y)
        mix(p.z)
      }
    }
    mix(n)
    mix(STRIDE)
    sig = (h >>> 0).toString(36)
    bySection.set(section, sig)
  }
  return sig
}

/** The recorder: the section being driven and the samples so far. */
const rec = { section: 0, carId: '', data: new Float32Array(MAX_SAMPLES * STRIDE), count: 0, last: -1, full: false, lift: 0, steer: 0 }

/** The playing ghost's wheels right now (written by sampleGhost): how far the suspension has lifted them, and the front wheels' steer. */
export const ghostWheels = { lift: 0, steer: 0 }

/** What's playing: the best tape for the current section (or none). */
const play = { section: 0, carId: '', data: null, count: 0, ms: 0, cursor: 0 }

/** Tapes already read from storage this session, by storage key (null = none saved). */
const cache = new Map()

function storage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function toBase64(f32) {
  const bytes = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

function fromBase64(b64) {
  const s = atob(b64)
  const bytes = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i += 1) bytes[i] = s.charCodeAt(i)
  return new Float32Array(bytes.buffer)
}

/** The saved best for a section: `{ ms, carId, data, count }` or null. */
export function loadTape(section) {
  const sig = sectionSig(section)
  if (!sig) return null
  const key = KEY(section)
  const ck = `${key}|${sig}`
  if (cache.has(ck)) return cache.get(ck)
  let tape = null
  try {
    const raw = storage()?.getItem(key)
    if (raw) {
      const t = JSON.parse(raw)
      // A tape from another version of the road (or from before tapes were fingerprinted) is dropped.
      const data = t.sig === sig ? fromBase64(t.data) : new Float32Array(0)
      if (Number.isFinite(t.ms) && data.length >= STRIDE * 2) tape = { ms: t.ms, carId: String(t.carId || ''), data, count: Math.floor(data.length / STRIDE) }
    }
  } catch {
    tape = null
  }
  cache.set(ck, tape)
  return tape
}

function saveTape(section, tape) {
  const sig = sectionSig(section)
  if (!sig) return
  cache.set(`${KEY(section)}|${sig}`, tape)
  try {
    storage()?.setItem(KEY(section), JSON.stringify({ ms: Math.round(tape.ms), carId: tape.carId, sig, data: toBase64(tape.data) }))
  } catch {
    // Storage full or blocked: the tape still plays for the rest of this session.
  }
}

/**
 * Starts recording section `section` (and loads its best tape to play). Call when you
 * leave the checkpoint before it, i.e. when its split timer starts.
 */
export function beginSection(section, carId) {
  rec.section = section
  rec.carId = carId
  rec.count = 0
  rec.last = -1
  rec.full = false
  const tape = loadTape(section)
  play.section = section
  play.cursor = 0
  if (tape) {
    play.data = tape.data
    play.count = tape.count
    play.ms = tape.ms
    play.carId = tape.carId
  } else {
    play.data = null
    play.count = 0
    play.ms = 0
    play.carId = ''
  }
}

/** Stops recording and playing (back to the pier, run abandoned). */
export function stopGhost() {
  rec.section = 0
  rec.count = 0
  play.data = null
  play.count = 0
}

/**
 * Adds a sample if it's time for one. `t` is seconds since the section started; `lift` is
 * how far the car's wheels sit above their modelled centres (average, m) and `steer` the
 * front wheels' angle. Omitted, they repeat the last sample's.
 */
export function recordSample(t, pos, quat, lift = rec.lift, steer = rec.steer) {
  if (!rec.section || rec.full) return
  rec.lift = lift
  rec.steer = steer
  if (rec.last >= 0 && t - rec.last < 1 / RATE) return
  if (rec.count >= MAX_SAMPLES) {
    rec.full = true
    return
  }
  const o = rec.count * STRIDE
  const d = rec.data
  d[o] = t
  d[o + 1] = pos.x
  d[o + 2] = pos.y
  d[o + 3] = pos.z
  d[o + 4] = quat.x
  d[o + 5] = quat.y
  d[o + 6] = quat.z
  d[o + 7] = quat.w
  d[o + 8] = lift
  d[o + 9] = steer
  rec.count += 1
  rec.last = t
}

/**
 * The section was finished in `ms`: keep the tape if it's your best there.
 * @returns {boolean} whether it was a new best tape
 */
export function endSection(section, ms, pos, quat) {
  if (rec.section !== section || rec.full || rec.count < 2) return false
  // The last sample is exactly at the line, whatever the sample rate says.
  rec.last = -1
  recordSample(Math.max(ms / 1000, rec.data[(rec.count - 1) * STRIDE] + 0.001), pos, quat)
  const best = loadTape(section)
  if (best && best.ms <= ms) return false
  const data = rec.data.slice(0, rec.count * STRIDE)
  saveTape(section, { ms, carId: rec.carId, data, count: rec.count })
  return true
}

/** The car the playing ghost drove, or '' when there's no ghost for this section. */
export const ghostCar = () => (play.data ? play.carId : '')

/** The playing ghost's best time for this section, ms (0 = none). */
export const ghostBestMs = () => (play.data ? play.ms : 0)

/** The section the ghost is for (0 = none). */
export const ghostSection = () => (play.data ? play.section : 0)

/**
 * Where the ghost is `t` seconds into the section. Writes into `outPos` / `outQuat`
 * (no allocation) and returns false once the tape has run out.
 */
export function sampleGhost(t, outPos, outQuat) {
  const d = play.data
  const n = play.count
  if (!d || n < 2 || t < 0) return false
  if (t > d[(n - 1) * STRIDE]) return false
  // Walk the cursor (time only moves forward between respawns; rewind if it didn't).
  let i = play.cursor
  if (i >= n - 1 || d[i * STRIDE] > t) i = 0
  while (i < n - 2 && d[(i + 1) * STRIDE] < t) i += 1
  play.cursor = i
  const a = i * STRIDE
  const b = a + STRIDE
  const span = d[b] - d[a]
  let k = span > 0 ? (t - d[a]) / span : 0
  const dx = d[b + 1] - d[a + 1]
  const dy = d[b + 2] - d[a + 2]
  const dz = d[b + 3] - d[a + 3]
  if (dx * dx + dy * dy + dz * dz > JUMP * JUMP) k = k < 0.5 ? 0 : 1
  outPos.set(d[a + 1] + dx * k, d[a + 2] + dy * k, d[a + 3] + dz * k)
  outQuat.set(d[a + 4], d[a + 5], d[a + 6], d[a + 7])
  _q.set(d[b + 4], d[b + 5], d[b + 6], d[b + 7])
  outQuat.slerp(_q, k)
  ghostWheels.lift = d[a + 8] + (d[b + 8] - d[a + 8]) * k
  ghostWheels.steer = d[a + 9] + (d[b + 9] - d[a + 9]) * k
  return true
}
