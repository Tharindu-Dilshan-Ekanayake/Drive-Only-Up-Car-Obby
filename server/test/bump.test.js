import assert from 'node:assert/strict'
import { test } from 'node:test'

import { BUMP_COOLDOWN_MS, BUMP_MAX_LIFT, BUMP_MAX_PUSH, BUMP_MIN_SPEED, bumpImpulse, clampBump, maxPushFor, RESPAWN_GHOST_MS, respawnGhost, startRespawnGhost } from '../../shared/bump.js'
import { SPAWN } from '../../shared/lobby.js'
import { inSafeZone, plazaAt, plazaZones } from '../../shared/safeZones.js'
import { loadStage } from '../../shared/stages/index.js'
import { BUMP_RANGE, BUMP_TARGET_PER_SEC, GameRoom } from '../src/rooms/GameRoom.js'
import { acceptMove, BUMP_EXTRA_SPEED, MAX_CAR_SPEED, MOVE_SLACK } from '../src/movement.js'

const STAGE1 = await loadStage('sky-docks')

const forwardOf = (yaw) => [-Math.sin(yaw), -Math.cos(yaw)]
const rightOf = (yaw) => [Math.cos(yaw), -Math.sin(yaw)]

/** A point on checkpoint `cp`'s plaza: `along` m on from the gate, `across` m to the right, `up` m above. */
function onPlaza(cp, along, across = 0, up = 0.6) {
  const [fx, fz] = forwardOf(cp.yaw)
  const [rx, rz] = rightOf(cp.yaw)
  return { x: cp.x + fx * along + rx * across, y: cp.y + up, z: cp.z + fz * along + rz * across }
}

/** A path sample in the middle of section `n` (open road, well away from any plaza). */
function midRoad(n) {
  const sec = STAGE1.sections[n]
  const s = (sec.sStart + sec.sEnd) / 2
  return STAGE1.path.find((p) => p.s >= s)
}

test('safe zones: the lobby pier is safe', () => {
  assert.ok(inSafeZone(STAGE1, SPAWN.x, SPAWN.y + 1, SPAWN.z))
  assert.ok(inSafeZone(STAGE1, 30, 3, -30))
  // Below the deck (in the sea) or high above it isn't the lobby.
  assert.ok(!inSafeZone(STAGE1, 0, -5, 0))
  assert.ok(!inSafeZone(STAGE1, 0, 40, 0))
})

test('safe zones: every checkpoint plaza is safe, the road between them is not', () => {
  const zones = plazaZones(STAGE1)
  // One per checkpoint after the Start (which is the lobby's edge), finish included.
  assert.equal(zones.length, STAGE1.checkpoints.length - 1)
  for (const cp of STAGE1.checkpoints.slice(1)) {
    const mid = onPlaza(cp, cp.length / 2)
    assert.equal(plazaAt(STAGE1, mid.x, mid.y, mid.z)?.index, cp.index, `centre of plaza ${cp.index}`)
    // Its corners (just inside), the respawn point, and a car jumping over it.
    for (const p of [onPlaza(cp, 1, cp.width / 2 - 0.5), onPlaza(cp, cp.length - 1, -cp.width / 2 + 0.5), onPlaza(cp, cp.length / 2, 0, 6)]) {
      assert.ok(inSafeZone(STAGE1, p.x, p.y, p.z), `inside plaza ${cp.index}`)
    }
    assert.ok(inSafeZone(STAGE1, cp.respawn.x, cp.respawn.y + 0.8, cp.respawn.z))
    // Off to the side, well past the far end, under it, high above it.
    for (const p of [onPlaza(cp, cp.length / 2, cp.width / 2 + 6), onPlaza(cp, cp.length + 8), onPlaza(cp, cp.length / 2, 0, -8), onPlaza(cp, cp.length / 2, 0, 30)]) {
      assert.ok(!plazaAt(STAGE1, p.x, p.y, p.z) || plazaAt(STAGE1, p.x, p.y, p.z).index !== cp.index, `outside plaza ${cp.index}`)
    }
  }
  for (let n = 1; n < STAGE1.sections.length - 1; n += 1) {
    const p = midRoad(n)
    assert.ok(!inSafeZone(STAGE1, p.x, p.y + 0.6, p.z), `road in section ${n} is not safe`)
  }
})

test('safe zones follow the plaza size in the stage data (bigger plazas, no hard-coded size)', () => {
  const big = { checkpoints: [{ index: 0, x: 500, y: 50, z: 500, yaw: 0, width: 12 }, { index: 1, x: 500, y: 50, z: 500, yaw: Math.PI / 2, length: 90, width: 70 }] }
  const cp = big.checkpoints[1]
  const deep = onPlaza(cp, 80, 30)
  assert.ok(inSafeZone(big, deep.x, deep.y, deep.z))
  assert.ok(!inSafeZone(big, ...Object.values(onPlaza(cp, 100))))
  // An explicit `forward` wins over the yaw.
  const fwd = { checkpoints: [{ index: 1, x: 0, y: 300, z: 0, yaw: 0, forward: [1, 0, 0], length: 50, width: 30 }] }
  assert.ok(inSafeZone(fwd, 45, 300.5, 10))
  assert.ok(!inSafeZone(fwd, 0, 300.5, -45))
})

test('bump impulse grows with closing speed, is capped, and points away from the rammer', () => {
  const out = { x: 0, y: 0, z: 0 }
  bumpImpulse(BUMP_MIN_SPEED, 0, -1, 0, -BUMP_MIN_SPEED, out)
  assert.ok(out.y === 0 && Math.hypot(out.x, out.z) < 5, 'a gentle touch is a small shove, no lift')
  bumpImpulse(30, 0, -1, 0, -30, out)
  assert.ok(Math.hypot(out.x, out.z) > 20 && out.y > 6, 'a fast ram throws it')
  assert.ok(out.z < 0, 'away from the rammer')
  bumpImpulse(500, 1, 0, 500, 0, out)
  assert.ok(Math.hypot(out.x, out.z) <= BUMP_MAX_PUSH + 1e-9 && out.y <= BUMP_MAX_LIFT)
  // Leaning with the rammer's heading, never back towards it.
  bumpImpulse(20, 1, 0, -20, 0, out)
  assert.ok(out.x > 0 && Math.abs(out.z) < 1e-9)

  const imp = { x: 300, y: -5, z: 400 }
  assert.ok(clampBump(imp, 10))
  assert.ok(Math.abs(Math.hypot(imp.x, imp.z) - 10) < 1e-9 && imp.y === 0)
  assert.equal(clampBump({ x: NaN, y: 0, z: 0 }), false)
  assert.equal(clampBump({ x: 'a', y: 0, z: 0 }), false)
})

/** A room with fake members (no network) standing at `positions`; `inbox` collects each one's messages. */
function bumpRoom(positions, speed = 30) {
  const room = new GameRoom()
  const members = positions.map(([x, y, z], i) => {
    const member = {
      slot: room.freeSlot(),
      pose: { x, y, z, qx: 0, qy: 0, qz: 0, qw: 1, b: false, seq: ++room.poseSeq },
      speed,
      inbox: [],
      client: { sessionId: `s${i}`, send: (type, payload) => member.inbox.push({ type, payload }) },
    }
    room.members.set(`s${i}`, member)
    return member
  })
  room.memberList = [...room.members.values()]
  return { room, members }
}

/** Two cars on the open road, `gap` m apart along it. */
function roadPair(gap = 4, speed = 30) {
  const p = midRoad(4)
  return bumpRoom(
    [
      [p.x, p.y + 0.6, p.z],
      [p.x + p.fx * gap, p.y + p.fy * gap + 0.6, p.z + p.fz * gap],
    ],
    speed,
  )
}

test('server forwards a valid bump to the car that was hit', () => {
  const { room, members } = roadPair()
  const [a, b] = members
  const p = midRoad(4)
  const imp = { x: p.fx * 20, y: 6, z: p.fz * 20 }
  assert.equal(room.handleBump(a.client, { to: 's1', ...imp, v: 25 }, 10_000), 'ok')
  assert.equal(b.inbox.length, 1)
  const got = b.inbox[0]
  assert.equal(got.type, 'bump')
  assert.equal(got.payload.from, 's0')
  assert.ok(Math.abs(got.payload.x - imp.x) < 0.01 && Math.abs(got.payload.z - imp.z) < 0.01 && got.payload.y === 6)
  assert.equal(a.inbox.length, 0, 'nothing back to the sender')
  // Its moves may now be faster for a moment (thrown).
  assert.ok(b.bumpedUntil > 10_000)
})

test('server refuses bumps between cars far apart, in a safe zone, too often, or made up', () => {
  // Far apart.
  let { room, members } = roadPair(BUMP_RANGE + 5)
  assert.equal(room.handleBump(members[0].client, { to: 's1', x: 5, y: 0, z: 0 }, 1000), 'far')
  assert.equal(members[1].inbox.length, 0)

  // Either car in the lobby or on a plaza.
  ;({ room, members } = bumpRoom([
    [SPAWN.x, SPAWN.y + 0.6, SPAWN.z],
    [SPAWN.x + 3, SPAWN.y + 0.6, SPAWN.z],
  ]))
  assert.equal(room.handleBump(members[0].client, { to: 's1', x: 5, y: 0, z: 0 }, 1000), 'safe')
  const cp = STAGE1.checkpoints[5]
  const onIt = onPlaza(cp, 2)
  const before = onPlaza(cp, -6)
  ;({ room, members } = bumpRoom([
    [before.x, before.y, before.z],
    [onIt.x, onIt.y, onIt.z],
  ]))
  assert.equal(room.handleBump(members[0].client, { to: 's1', x: 5, y: 0, z: 0 }, 1000), 'safe')
  assert.equal(members[1].inbox.length, 0)

  // Unknown target, yourself, garbage numbers.
  ;({ room, members } = roadPair())
  assert.equal(room.handleBump(members[0].client, { to: 'nobody', x: 5, y: 0, z: 0 }, 1000), 'unknown')
  assert.equal(room.handleBump(members[0].client, { to: 's0', x: 5, y: 0, z: 0 }, 1000), 'unknown')
  assert.equal(room.handleBump(members[0].client, { to: 's1', x: 'lots', y: 0, z: 0 }, 1000), 'invalid')

  // Once per pair per cooldown.
  assert.equal(room.handleBump(members[0].client, { to: 's1', x: 5, y: 0, z: 0 }, 1000), 'ok')
  assert.equal(room.handleBump(members[0].client, { to: 's1', x: 5, y: 0, z: 0 }, 1000 + BUMP_COOLDOWN_MS - 1), 'rate')
  assert.equal(room.handleBump(members[0].client, { to: 's1', x: 5, y: 0, z: 0 }, 1000 + BUMP_COOLDOWN_MS), 'ok')
  assert.equal(members[1].inbox.length, 2)
})

test('server caps how often one player can be bumped by a pack', () => {
  const p = midRoad(4)
  const { room, members } = bumpRoom(Array.from({ length: 6 }, (_, i) => [p.x + i * 0.5, p.y + 0.6, p.z]))
  const results = members.slice(1).map((m) => room.handleBump(m.client, { to: 's0', x: 3, y: 0, z: 0 }, 5000))
  assert.equal(results.filter((r) => r === 'ok').length, BUMP_TARGET_PER_SEC)
  assert.equal(members[0].inbox.length, BUMP_TARGET_PER_SEC)
  // A second later it can be hit again.
  assert.equal(room.handleBump(members[5].client, { to: 's0', x: 3, y: 0, z: 0 }, 6000), 'ok')
})

test('server clamps an oversized bump to what the cars speeds allow, pointing away from the sender', () => {
  // Both nearly parked: a huge throw shrinks to what ~8 m/s of closing could do.
  let { room, members } = roadPair(4, 0)
  const p = midRoad(4)
  assert.equal(room.handleBump(members[0].client, { to: 's1', x: p.fx * 1e6, y: 1e6, z: p.fz * 1e6 }, 1000), 'ok')
  let got = members[1].inbox[0].payload
  assert.ok(Math.hypot(got.x, got.z) <= maxPushFor(8) + 0.01, `push ${Math.hypot(got.x, got.z)}`)
  assert.ok(got.y <= 1.0)

  // Fast cars: still never more than the absolute maximum.
  ;({ room, members } = roadPair(4, 90))
  assert.equal(room.handleBump(members[0].client, { to: 's1', x: p.fx * 1e6, y: 1e6, z: p.fz * 1e6 }, 1000), 'ok')
  got = members[1].inbox[0].payload
  assert.ok(Math.hypot(got.x, got.z) <= BUMP_MAX_PUSH + 0.01 && got.y <= BUMP_MAX_LIFT)

  // A "bump" pulling the other car towards the sender is turned around.
  ;({ room, members } = roadPair(4, 30))
  assert.equal(room.handleBump(members[0].client, { to: 's1', x: -p.fx * 10, y: 0, z: -p.fz * 10 }, 1000), 'ok')
  got = members[1].inbox[0].payload
  assert.ok(got.x * p.fx + got.z * p.fz > 9.9, 'away from the sender, same size')
})

test('a car thrown by a bump is not snapped back, within a bound', () => {
  const last = { x: 0, y: 50, z: 0 }
  const dt = 0.1
  const thrown = { x: (MAX_CAR_SPEED + 30) * dt + MOVE_SLACK, y: 50, z: 0 }
  assert.equal(acceptMove(last, thrown, dt, STAGE1), false)
  assert.equal(acceptMove(last, thrown, dt, STAGE1, BUMP_EXTRA_SPEED), true)
  // The allowance is capped however much is asked for.
  const teleportish = { x: (MAX_CAR_SPEED + BUMP_EXTRA_SPEED + 50) * dt + MOVE_SLACK, y: 50, z: 0 }
  assert.equal(acceptMove(last, teleportish, dt, STAGE1, 1e9), false)

  // End to end through handlePosition: after a bump the room accepts the fast move.
  const { room, members } = roadPair()
  const b = members[1]
  b.lastPos = { x: b.pose.x, y: b.pose.y, z: b.pose.z }
  b.lastPosAt = Date.now() - 100
  room.state = { players: new Map([['s1', {}]]) }
  const far = { x: b.pose.x + 17.5, y: b.pose.y + 3, z: b.pose.z }
  room.handlePosition(b.client, far)
  assert.equal(b.inbox.at(-1)?.type, 'correct', 'too fast without a bump')
  assert.equal(room.handleBump(members[0].client, { to: 's1', x: 20, y: 5, z: 0 }, Date.now()), 'ok')
  b.lastPosAt = Date.now() - 100
  room.handlePosition(b.client, far)
  assert.notEqual(b.inbox.at(-1)?.type, 'correct', 'accepted once thrown')
  assert.equal(b.pose.x, far.x)
})

test('respawn protection: 3 s of no bumps, counted from leaving the safe zone you respawned in', () => {
  const p = { pending: false, until: 0 }
  assert.equal(respawnGhost(p, false, 0), false)
  startRespawnGhost(p, 1000)
  // Still on the plaza for 10 s: protected the whole time, and the 3 s haven't started.
  assert.equal(respawnGhost(p, true, 5000), true)
  assert.equal(respawnGhost(p, true, 11_000), true)
  // Leaves the plaza at 11 s: protected until 14 s, then not.
  assert.equal(respawnGhost(p, false, 13_900), true)
  assert.equal(respawnGhost(p, false, 11_000 + RESPAWN_GHOST_MS), false)
  assert.equal(p.pending, false)
  // A later visit to a plaza doesn't bring it back without a new respawn.
  assert.equal(respawnGhost(p, true, 20_000), false)
})

test('server refuses bumps to or from a player who has just respawned', () => {
  const { room, members } = roadPair()
  const [a, b] = members
  b.protect = { pending: false, until: 0 }
  startRespawnGhost(b.protect, 10_000)
  respawnGhost(b.protect, false, 10_000)
  assert.equal(room.handleBump(a.client, { to: 's1', x: 5, y: 0, z: 0 }, 10_500), 'protected')
  assert.equal(room.handleBump(b.client, { to: 's0', x: -5, y: 0, z: 0 }, 11_000), 'protected')
  assert.equal(b.inbox.length + a.inbox.length, 0)
  assert.equal(room.handleBump(a.client, { to: 's1', x: 5, y: 0, z: 0 }, 10_000 + RESPAWN_GHOST_MS + 1), 'ok')
})
