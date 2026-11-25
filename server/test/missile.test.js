import assert from 'node:assert/strict'
import { test } from 'node:test'

import { RESPAWN_GHOST_MS, respawnGhost, startRespawnGhost } from '../../shared/bump.js'
import { SPAWN } from '../../shared/lobby.js'
import { MISSILE_COOLDOWN_MS, MISSILE_HIT_WINDOW_MS, MISSILE_RANGE, MISSILE_SHOW_RANGE, MISSILE_SPEED, MISSILE_TARGET_COOLDOWN_MS } from '../../shared/missile.js'
import { loadStage } from '../../shared/stages/index.js'
import { GameRoom } from '../src/rooms/GameRoom.js'

const SKY = await loadStage('sky-docks')
const HEAT = await loadStage('heat-run')

/** A path sample in the middle of section `n` of `stage` (open road, away from plazas). */
function midRoad(stage, n) {
  const sec = stage.sections[n]
  const s = (sec.sStart + sec.sEnd) / 2
  return stage.path.find((p) => p.s >= s)
}

/** A room on `stage` with fake members at `positions`; `inbox` collects what each is sent. */
function missileRoom(stage, positions) {
  const room = new GameRoom()
  room.stageId = stage.id
  const members = positions.map(([x, y, z], i) => {
    const member = {
      slot: room.freeSlot(),
      pose: { x, y, z, qx: 0, qy: 0, qz: 0, qw: 1, b: false, seq: ++room.poseSeq },
      speed: 30,
      inbox: [],
      client: { sessionId: `s${i}`, send: (type, payload) => member.inbox.push({ type, payload }) },
    }
    room.members.set(`s${i}`, member)
    return member
  })
  room.memberList = [...room.members.values()]
  return { room, members }
}

/** Cars on the open road of Sky Docks, `gaps[i]` m along it from the first. */
function road(gaps, stage = SKY, section = 4) {
  const p = midRoad(stage, section)
  return missileRoom(
    stage,
    gaps.map((g) => [p.x + p.fx * g, p.y + p.fy * g + 0.6, p.z + p.fz * g]),
  )
}

/** Fire from s0 at s1 at time `t`, then report the hit `flight` ms later. */
function shoot(room, a, t = 10_000, flight = 1200) {
  const fired = room.handleMissile(a.client, { to: 's1' }, t)
  return { fired, hit: room.handleMissileHit(a.client, { to: 's1' }, t + flight) }
}

test('a fired missile is relayed to nearby cars; a hit burns the target', () => {
  const { room, members } = road([0, 60, 90])
  const [a, b, c] = members
  assert.equal(room.handleMissile(a.client, { to: 's1' }, 10_000), 'ok')
  assert.equal(a.inbox.length, 0, 'nothing back to the shooter')
  assert.deepEqual(b.inbox[0], { type: 'shot', payload: { from: 's0', to: 's1', you: true } })
  assert.deepEqual(c.inbox[0], { type: 'shot', payload: { from: 's0', to: 's1', you: false } })
  assert.equal(room.handleMissileHit(a.client, { to: 's1' }, 11_200), 'ok')
  assert.deepEqual(b.inbox.at(-1), { type: 'burn', payload: { from: 's0' } })
  assert.equal(c.inbox.length, 1, 'only the victim hears of the burn')
  assert.ok(b.bumpedUntil > 11_200, 'its respawn jump is not snapped back')
})

test('missiles are rate limited per shooter', () => {
  const { room, members } = road([0, 60])
  const [a] = members
  assert.equal(room.handleMissile(a.client, { to: 's1' }, 10_000), 'ok')
  assert.equal(room.handleMissile(a.client, { to: 's1' }, 10_000 + MISSILE_COOLDOWN_MS - 1), 'rate')
  assert.equal(room.handleMissile(a.client, { to: 's1' }, 10_000 + MISSILE_COOLDOWN_MS), 'ok')
  assert.equal(members[1].inbox.length, 2, 'the refused shot was not relayed')
})

test('a hit needs a recent shot at that target, and counts once', () => {
  const { room, members } = road([0, 60, 90])
  const [a] = members
  // No shot at all, then one at somebody else, then too late, then twice.
  assert.equal(room.handleMissileHit(a.client, { to: 's1' }, 10_000), 'noshot')
  assert.equal(room.handleMissile(a.client, { to: 's2' }, 10_000), 'ok')
  assert.equal(room.handleMissileHit(a.client, { to: 's1' }, 11_500), 'noshot')
  assert.equal(room.handleMissile(a.client, { to: 's1' }, 20_000), 'ok')
  assert.equal(room.handleMissileHit(a.client, { to: 's1' }, 20_000 + MISSILE_HIT_WINDOW_MS + 1), 'noshot')
  assert.equal(room.handleMissile(a.client, { to: 's1' }, 40_000), 'ok')
  assert.equal(room.handleMissileHit(a.client, { to: 's1' }, 41_300), 'ok')
  assert.equal(room.handleMissileHit(a.client, { to: 's1' }, 41_400), 'noshot', 'one hit per shot')
  // A shot with no target, or at a stranger, can never hit.
  assert.equal(room.handleMissile(a.client, { to: '' }, 60_000), 'ok')
  assert.equal(room.handleMissileHit(a.client, { to: 's1' }, 61_000), 'noshot')
  assert.equal(room.handleMissile(a.client, { to: 'nobody' }, 80_000), 'ok')
  assert.equal(room.handleMissileHit(a.client, { to: 'nobody' }, 81_000), 'unknown')
  assert.equal(room.handleMissileHit(a.client, { to: 's0' }, 81_000), 'unknown', 'never yourself')
})

test('a hit reported faster than the missile can fly there is refused', () => {
  const { room, members } = road([0, 120])
  assert.equal(room.handleMissile(members[0].client, { to: 's1' }, 10_000), 'ok')
  const flight = (120 / MISSILE_SPEED) * 1000
  assert.equal(room.handleMissileHit(members[0].client, { to: 's1' }, 10_000 + flight * 0.2), 'early')
  assert.equal(members[1].inbox.filter((m) => m.type === 'burn').length, 0)
})

test('a target out of range is dropped at the shot, and a hit out of range is refused', () => {
  let { room, members } = road([0, MISSILE_RANGE + 20])
  assert.equal(room.handleMissile(members[0].client, { to: 's1' }, 10_000), 'ok')
  assert.equal(members[1].inbox[0].payload.to, '', 'flies straight: no target')
  assert.equal(room.handleMissileHit(members[0].client, { to: 's1' }, 11_000), 'noshot')

  // In range when fired, then the pose moves out of range before the hit.
  ;({ room, members } = road([0, MISSILE_RANGE - 5]))
  assert.equal(room.handleMissile(members[0].client, { to: 's1' }, 10_000), 'ok')
  members[1].pose.x += 40 * Math.sign(members[1].pose.x - members[0].pose.x || 1)
  members[1].pose.z += 40
  const d = Math.hypot(members[1].pose.x - members[0].pose.x, members[1].pose.z - members[0].pose.z)
  assert.ok(d > MISSILE_RANGE)
  assert.equal(room.handleMissileHit(members[0].client, { to: 's1' }, 12_500), 'far')
})

test('cars far from the shooter are not told about the shot', () => {
  const { room, members } = road([0, 60, MISSILE_SHOW_RANGE + 40])
  assert.equal(room.handleMissile(members[0].client, { to: 's1' }, 10_000), 'ok')
  assert.equal(members[1].inbox.length, 1)
  assert.equal(members[2].inbox.length, 0)
})

test('no missiles from or at a safe zone (the lobby, a checkpoint plaza)', () => {
  // Shooter on the pier.
  let { room, members } = missileRoom(SKY, [
    [SPAWN.x, SPAWN.y + 0.6, SPAWN.z],
    [SPAWN.x + 30, SPAWN.y + 0.6, SPAWN.z],
  ])
  assert.equal(room.handleMissile(members[0].client, { to: 's1' }, 10_000), 'safe')
  assert.equal(members[1].inbox.length, 0)

  // Target on a plaza: the shot goes, the hit is refused.
  const cp = SKY.checkpoints[5]
  const fx = -Math.sin(cp.yaw)
  const fz = -Math.cos(cp.yaw)
  const plaza = [cp.x + fx * 4, cp.y + 0.6, cp.z + fz * 4]
  const road = [cp.x - fx * 60, cp.y + 0.6, cp.z - fz * 60]
  ;({ room, members } = missileRoom(SKY, [road, plaza]))
  assert.equal(room.handleMissile(members[0].client, { to: 's1' }, 10_000), 'ok')
  assert.equal(room.handleMissileHit(members[0].client, { to: 's1' }, 11_500), 'safe')
  assert.equal(members[1].inbox.filter((m) => m.type === 'burn').length, 0)
})

test('no missile hits on a map without player-vs-player (Heat Run)', () => {
  const { room, members } = road([0, 60], HEAT, 2)
  assert.equal(room.handleMissile(members[0].client, { to: 's1' }, 10_000), 'nopvp')
  assert.equal(room.handleMissileHit(members[0].client, { to: 's1' }, 11_000), 'nopvp')
  assert.equal(members[1].inbox.length, 0)
})

test('respawn protection: no missiles from or at a car that just respawned', () => {
  const { room, members } = road([0, 60])
  const [a, b] = members
  b.protect = { pending: false, until: 0 }
  startRespawnGhost(b.protect, 10_000)
  respawnGhost(b.protect, false, 10_000)
  assert.equal(room.handleMissile(a.client, { to: 's1' }, 10_500), 'ok')
  assert.equal(room.handleMissileHit(a.client, { to: 's1' }, 11_800), 'protected')
  // It can't fire either.
  assert.equal(room.handleMissile(b.client, { to: 's0' }, 11_000), 'protected')
  // Once the protection is over the same pair works again.
  const t = 10_000 + RESPAWN_GHOST_MS + 1
  const r = shoot(room, a, t + MISSILE_COOLDOWN_MS)
  assert.deepEqual(r, { fired: 'ok', hit: 'ok' })
})

test('a burned player cannot be burned again at once', () => {
  const { room, members } = road([0, 60, 70])
  const [a, , c] = members
  assert.deepEqual(shoot(room, a, 10_000), { fired: 'ok', hit: 'ok' })
  // Another player's shot, a few seconds later but inside the target's own cooldown.
  assert.equal(room.handleMissile(c.client, { to: 's1' }, 12_000), 'ok')
  assert.equal(room.handleMissileHit(c.client, { to: 's1' }, 13_200), 'rate')
  // After the cooldown it works.
  const t = 10_000 + 1200 + MISSILE_TARGET_COOLDOWN_MS
  assert.equal(room.handleMissile(c.client, { to: 's1' }, t), 'ok')
  assert.equal(room.handleMissileHit(c.client, { to: 's1' }, t + 1100), 'ok')
})

test('the victim answers a burn once; the shooter hears HIT or BLOCKED', () => {
  const { room, members } = road([0, 60])
  const [a, b] = members
  assert.deepEqual(shoot(room, a, 10_000), { fired: 'ok', hit: 'ok' })
  // Only the shooter named in the burn can be answered, only once.
  assert.equal(room.handleMissileAck(b.client, { from: 'nobody', ok: true }, 11_500), 'unknown')
  assert.equal(room.handleMissileAck(a.client, { from: 's1', ok: true }, 11_500), 'noburn', 'not the victim')
  assert.equal(room.handleMissileAck(b.client, { from: 's0', ok: false }, 11_500), 'ok')
  assert.deepEqual(a.inbox.at(-1), { type: 'missileResult', payload: { to: 's1', ok: false } })
  assert.equal(room.handleMissileAck(b.client, { from: 's0', ok: true }, 11_600), 'noburn')
  assert.equal(a.inbox.length, 1)
})
