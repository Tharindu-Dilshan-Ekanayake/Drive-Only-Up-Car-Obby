/**
 * Binary car poses: what the room relays about every other car, packed into one 'P'
 * message per tick per client instead of riding the synced state. One entry is
 * POSE_BYTES (14) bytes, little-endian:
 *
 *   u8   slot (low 6 bits) | boost (bit 6)   - slot: the player's PlayerState.slot
 *   i24  x, y, z                              - metres * POSE_SCALE (1/64 m steps)
 *   u32  orientation                          - "smallest three" quaternion: 2 bits for
 *                                               the largest component, 3 x 10 bits for
 *                                               the others (~0.1 degree)
 *
 * A message is just entries back to back (its length / POSE_BYTES of them). Shared by
 * the server (writes) and the client (reads); nothing here allocates.
 */

export const POSE_BYTES = 14
export const POSE_SCALE = 64
/** Slots fit in 6 bits, so a room can hold at most this many players. */
export const MAX_SLOTS = 64
/** Players per room (the server's MAX_CLIENTS; the lobby UI shows it). */
export const ROOM_CAPACITY = 50

const I24_MAX = 0x7fffff
const Q_MAX = 1023
const SQRT1_2 = Math.SQRT1_2
const SQRT2 = Math.SQRT2

function writeI24(view, o, value) {
  const v = Math.max(-I24_MAX, Math.min(I24_MAX, Math.round(value * POSE_SCALE)))
  view.setUint16(o, v & 0xffff, true)
  view.setInt8(o + 2, v >> 16)
}

const readI24 = (view, o) => ((view.getInt8(o + 2) << 16) | view.getUint16(o, true)) / POSE_SCALE

const packQ = (v) => Math.max(0, Math.min(Q_MAX, Math.round(((v * SQRT2 + 1) / 2) * Q_MAX)))
const unpackQ = (bits) => ((bits / Q_MAX) * 2 - 1) * SQRT1_2

/** Writes one entry at byte `o` of `view` (a DataView). */
export function writePose(view, o, slot, boost, x, y, z, qx, qy, qz, qw) {
  view.setUint8(o, (slot & 63) | (boost ? 64 : 0))
  writeI24(view, o + 1, x)
  writeI24(view, o + 4, y)
  writeI24(view, o + 7, z)
  // Largest component dropped (rebuilt from the unit length), sign folded into it.
  const ax = Math.abs(qx)
  const ay = Math.abs(qy)
  const az = Math.abs(qz)
  const aw = Math.abs(qw)
  let big = 3
  let max = aw
  if (ax > max) {
    big = 0
    max = ax
  }
  if (ay > max) {
    big = 1
    max = ay
  }
  if (az > max) big = 2
  const s = (big === 0 ? qx : big === 1 ? qy : big === 2 ? qz : qw) < 0 ? -1 : 1
  // The other three, in x, y, z, w order.
  const a = big === 0 ? qy : qx
  const b = big <= 1 ? qz : qy
  const c = big === 3 ? qz : qw
  const bits = ((big << 30) | (packQ(a * s) << 20) | (packQ(b * s) << 10) | packQ(c * s)) >>> 0
  view.setUint32(o + 10, bits, true)
}

/**
 * Reads the entry at byte `o` into `out` ({ slot, boost, x, y, z, qx, qy, qz, qw }).
 * @returns {object} out
 */
export function readPose(view, o, out) {
  const head = view.getUint8(o)
  out.slot = head & 63
  out.boost = (head & 64) !== 0
  out.x = readI24(view, o + 1)
  out.y = readI24(view, o + 4)
  out.z = readI24(view, o + 7)
  const bits = view.getUint32(o + 10, true)
  const big = bits >>> 30
  const a = unpackQ((bits >>> 20) & Q_MAX)
  const b = unpackQ((bits >>> 10) & Q_MAX)
  const c = unpackQ(bits & Q_MAX)
  const d = Math.sqrt(Math.max(0, 1 - a * a - b * b - c * c))
  out.qx = big === 0 ? d : a
  out.qy = big === 0 ? a : big === 1 ? d : b
  out.qz = big <= 1 ? b : big === 2 ? d : c
  out.qw = big === 3 ? d : c
  return out
}
