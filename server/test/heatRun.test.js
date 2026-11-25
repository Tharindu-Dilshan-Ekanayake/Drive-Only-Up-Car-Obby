import assert from 'node:assert/strict'
import { test } from 'node:test'

import { pvpEnabled } from '../../shared/safeZones.js'
import { loadStage, stageInfo, STAGE_IDS } from '../../shared/stages/index.js'
import { GameRoom } from '../src/rooms/GameRoom.js'
import { acceptMove, isTeleportPoint } from '../src/movement.js'

// Heat Run (shared/stages/heatRun.meta.js): a police-chase map where players are always
// ghosts to each other - `pvp: false`, read by shared/safeZones.js pvpEnabled on the client
// (other players' collision bodies) and here in the room's bump check.

const HEAT = await loadStage('heat-run')
const SKY = await loadStage('sky-docks')

/** A room on map `stageId` with two cars `gap` m apart on the open road of section `n`. */
function roomWithPair(stageId, stage, n, gap = 4) {
  const sec = stage.sections[n]
  const p = stage.path.find((q) => q.s >= (sec.sStart + sec.sEnd) / 2)
  const room = new GameRoom()
  room.stageId = stageId
  const members = [0, 1].map((i) => {
    const member = {
      slot: room.freeSlot(),
      pose: { x: p.x + p.fx * gap * i, y: p.y + 0.6, z: p.z + p.fz * gap * i, qx: 0, qy: 0, qz: 0, qw: 1, b: false, seq: ++room.poseSeq },
      speed: 25,
      inbox: [],
      client: { sessionId: `s${i}`, send: (type, payload) => member.inbox.push({ type, payload }) },
    }
    room.members.set(`s${i}`, member)
    return member
  })
  room.memberList = [...room.members.values()]
  return { room, members, p }
}

test('heat run is a registered map with pvp off and no CPU racers', () => {
  assert.ok(STAGE_IDS.includes('heat-run'))
  const info = stageInfo('heat-run')
  assert.equal(info.pvp, false)
  assert.equal(info.bots, false)
  assert.equal(info.mode, 'heat')
  assert.equal(HEAT.id, 'heat-run')
  // 11 roads and a finish (the safehouse); Sky Pearls need <= 31 sections.
  assert.equal(HEAT.checkpoints.length, 12)
  assert.ok(HEAT.checkpoints.at(-1).finish)
  assert.ok(HEAT.sections.length <= 31)
  // Police roadblocks sit on the open road, never on a plaza.
  assert.ok(HEAT.heat.roadblocks.length >= 3)
  for (const r of HEAT.heat.roadblocks) {
    const p = HEAT.path[r.pi]
    assert.ok(p && !p.air && p.w >= 12)
    for (const c of HEAT.checkpoints) assert.ok(!(p.s >= c.s - 2 && p.s <= c.s + (c.length || 0) + 2))
  }
})

test('pvpEnabled: off on heat run only (and on the pier, with no stage, the usual rules)', () => {
  assert.equal(pvpEnabled(HEAT), false)
  assert.equal(pvpEnabled(SKY), true)
  assert.equal(pvpEnabled(null), true)
  assert.equal(pvpEnabled({ id: 'no-such-map' }), true)
})

test('a heat run room refuses every player bump, even on the open road', () => {
  const { room, members, p } = roomWithPair('heat-run', HEAT, 3)
  assert.equal(room.handleBump(members[0].client, { to: 's1', x: p.fx * 10, y: 2, z: p.fz * 10 }, 10_000), 'nopvp')
  assert.equal(room.handleBump(members[1].client, { to: 's0', x: -p.fx * 10, y: 0, z: -p.fz * 10 }, 20_000), 'nopvp')
  assert.equal(members[1].inbox.length, 0, 'nothing forwarded')
  assert.equal(members[0].inbox.length, 0)
  assert.ok(!members[1].bumpedUntil, 'no faster-moves allowance either')
  // The same pair on a Sky Docks room's open road: forwarded as usual.
  const sky = roomWithPair('sky-docks', SKY, 4)
  assert.equal(sky.room.handleBump(sky.members[0].client, { to: 's1', x: sky.p.fx * 10, y: 2, z: sky.p.fz * 10 }, 10_000), 'ok')
})

test('busted: respawning at a heat run checkpoint is a legal teleport', () => {
  // The police BUST you back to your last checkpoint (the ordinary respawn path).
  for (const c of HEAT.checkpoints.slice(1)) {
    const r = { x: c.respawn.x, y: c.respawn.y + 0.8, z: c.respawn.z }
    assert.ok(isTeleportPoint(r, HEAT))
    assert.equal(acceptMove({ x: r.x + 900, y: r.y, z: r.z }, r, 0.05, HEAT), true)
  }
})
