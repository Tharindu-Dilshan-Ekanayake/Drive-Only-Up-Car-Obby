import assert from 'node:assert/strict'
import { test } from 'node:test'

import { MAX_SLOTS, POSE_BYTES, readPose, writePose } from '../../shared/poseCodec.js'
import { GameRoom, MAX_CLIENTS, POSE_FAR_EVERY, POSE_MID, POSE_NEAR } from '../src/rooms/GameRoom.js'
import { loadStage } from '../../shared/stages/index.js'

await loadStage('sky-docks')

/** A room with fake members (no network): `sent` collects each one's 'P' messages. */
function relayRoom(positions) {
  const room = new GameRoom()
  const members = positions.map(([x, y, z], i) => {
    const slot = room.freeSlot()
    const member = {
      slot,
      pose: { x, y, z, qx: 0, qy: 0, qz: 0, qw: 1, b: false, seq: ++room.poseSeq },
      sent: new Uint32Array(MAX_SLOTS),
      inbox: [],
      client: { sendBytes: (type, bytes) => member.inbox.push({ type, bytes: Uint8Array.from(bytes) }) },
    }
    room.members.set(`s${i}`, member)
    room.memberList = [...room.members.values()]
    return member
  })
  return { room, members }
}

const decode = (bytes) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const out = []
  for (let o = 0; o < bytes.byteLength; o += POSE_BYTES) out.push(readPose(view, o, {}))
  return out
}

test('a room holds 50 players, each with its own pose slot', () => {
  assert.equal(MAX_CLIENTS, 50)
  assert.equal(new GameRoom().maxClients, 50)
  const { room, members } = relayRoom(Array.from({ length: MAX_CLIENTS }, () => [0, 0, 0]))
  assert.equal(new Set(members.map((m) => m.slot)).size, MAX_CLIENTS)
  // A freed slot isn't handed straight back out (round-robin).
  room.members.delete('s3')
  room.memberList = [...room.members.values()]
  assert.notEqual(room.freeSlot(), members[3].slot)
})

test('poses are relayed as one batched binary message per player per tick', () => {
  const { room, members } = relayRoom([
    [0, 2, 0],
    [5, 2, -3],
    [-10, 2, 8],
  ])
  members[1].pose.b = true
  room.relayPoses()
  for (const m of members) {
    assert.equal(m.inbox.length, 1, 'one message per tick')
    assert.equal(m.inbox[0].type, 'P')
    const got = decode(m.inbox[0].bytes)
    assert.equal(got.length, 2, 'everyone but yourself')
    assert.ok(!got.some((p) => p.slot === m.slot))
  }
  const seen = decode(members[0].inbox[0].bytes).find((p) => p.slot === members[1].slot)
  assert.ok(Math.abs(seen.x - 5) < 0.02 && Math.abs(seen.z + 3) < 0.02 && seen.boost)

  // Nothing new: nothing sent. One car moves: only it goes out, to the other two.
  room.relayPoses()
  assert.ok(members.every((m) => m.inbox.length === 1))
  members[2].pose.x = -9
  members[2].pose.seq = ++room.poseSeq
  room.relayPoses()
  assert.equal(members[2].inbox.length, 1)
  assert.equal(decode(members[0].inbox[1].bytes).length, 1)
  assert.equal(decode(members[1].inbox[1].bytes)[0].slot, members[2].slot)
})

test('far cars are relayed less often than near ones', () => {
  const far = POSE_MID + 50
  const { room, members } = relayRoom([
    [0, 2, 0],
    [POSE_NEAR / 2, 2, 0],
    [far, 2, 0],
  ])
  const count = { near: 0, far: 0 }
  const ticks = POSE_FAR_EVERY * 10
  for (let t = 0; t < ticks; t += 1) {
    for (const m of members.slice(1)) m.pose.seq = ++room.poseSeq
    room.relayPoses()
    const msg = members[0].inbox.pop()
    for (const p of msg ? decode(msg.bytes) : []) {
      if (p.slot === members[1].slot) count.near += 1
      if (p.slot === members[2].slot) count.far += 1
    }
  }
  assert.equal(count.near, ticks)
  assert.equal(count.far, ticks / POSE_FAR_EVERY)
})

test('pose codec round-trips position and orientation', () => {
  const view = new DataView(new ArrayBuffer(POSE_BYTES))
  const q = [0.3, -0.5, 0.7, 0.4]
  const len = Math.hypot(...q)
  writePose(view, 0, 49, false, -2665.17, 601.2, -2944.99, ...q.map((v) => v / len))
  const p = readPose(view, 0, {})
  assert.equal(p.slot, 49)
  assert.equal(p.boost, false)
  assert.ok(Math.abs(p.x + 2665.17) < 0.01 && Math.abs(p.y - 601.2) < 0.01 && Math.abs(p.z + 2944.99) < 0.01)
  const dot = Math.abs(p.qx * q[0] + p.qy * q[1] + p.qz * q[2] + p.qw * q[3]) / len
  assert.ok(dot > 0.99999)
})
