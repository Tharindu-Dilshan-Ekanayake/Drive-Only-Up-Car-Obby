import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { addExitPortal, chapterOf, chapterTitle, EXIT_PORTAL, lockedMessage, onExitPortal, STAGE_LOCKED } from '../../shared/chapters.js'
import { createProfile, isStageUnlocked, lastCheckpoint, normalizeProfile, progressFor, toSaveData } from '../../shared/logic.js'
import { SPAWN } from '../../shared/lobby.js'
import { inSafeZone } from '../../shared/safeZones.js'
import { PlayerSession } from '../../shared/session.js'
import { loadAllStages, getStage, STAGES } from '../../shared/stages/index.js'
import { closeStorage, loadProfile, openStorage, saveProfile } from '../src/db.js'
import { activePlayers } from '../src/registry.js'
import { GameRoom } from '../src/rooms/GameRoom.js'
import { GameState } from '../src/rooms/schema.js'

// Chapters (shared/chapters.js): Sky Docks is CHAPTER 1, the Grand Tour CHAPTER 2 - locked
// until Sky Docks is finished (shared/logic.js isStageUnlocked) - and Heat Run a mode,
// always open. The room refuses a locked map's join (GameRoom.checkUnlocked).

await loadAllStages()
const SKY = getStage('sky-docks')

/** Drives a session on `stage` through checkpoints 1..n (the last with a finish time). */
function finishRun(profile, stage, n = lastCheckpoint(stage)) {
  const events = []
  const pos = { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z }
  const session = new PlayerSession(profile, { now: 0, emit: (type, payload) => events.push({ type, payload }), getPosition: () => pos, stage })
  for (let i = 1; i <= n; i += 1) {
    Object.assign(pos, { x: stage.checkpoints[i].x, y: stage.checkpoints[i].y, z: stage.checkpoints[i].z })
    session.handle('checkpoint', { index: i, splitMs: 10000 + i, totalMs: i === lastCheckpoint(stage) ? 300000 : undefined })
  }
  return events.filter((e) => e.type === 'checkpoint').map((e) => e.payload)
}

test('chapters: Sky Docks is chapter 1, the Grand Tour chapter 2 (locked behind Sky Docks), Heat Run a mode', () => {
  assert.equal(chapterOf('sky-docks'), 1)
  assert.equal(chapterOf('grand-tour'), 2)
  assert.equal(chapterOf('heat-run'), 0)
  assert.equal(chapterTitle('sky-docks'), 'CHAPTER 1 · SKY DOCKS')
  assert.equal(chapterTitle('grand-tour'), 'CHAPTER 2 · GRAND TOUR')
  assert.equal(chapterTitle('heat-run'), 'HEAT RUN')
  assert.deepEqual(STAGES.filter((s) => s.unlock).map((s) => [s.id, s.unlock.finish]), [['grand-tour', 'sky-docks']])
  assert.match(lockedMessage('grand-tour'), /Crane Summit in Sky Docks to unlock Chapter 2/)
})

test('unlock rule: a fresh profile may play Sky Docks and Heat Run, not the Grand Tour (nor an unknown map)', () => {
  const p = createProfile('fresh', 'Fresh')
  assert.equal(isStageUnlocked(p, 'sky-docks'), true)
  assert.equal(isStageUnlocked(p, 'heat-run'), true)
  assert.equal(isStageUnlocked(p, 'grand-tour'), false)
  assert.equal(isStageUnlocked(p, 'atlantis'), false)
  assert.equal(isStageUnlocked(null, 'sky-docks'), true, 'no profile yet: the open maps are open')
  assert.equal(isStageUnlocked(null, 'grand-tour'), false)
  // Progress short of the finish isn't enough.
  progressFor(p, SKY).best = { checkpoint: lastCheckpoint(SKY) - 1, altitude: 1200, finishMs: 0 }
  assert.equal(isStageUnlocked(p, 'grand-tour'), false)
})

test('finishing Sky Docks opens the Grand Tour for good, and says so once', () => {
  const p = createProfile('climber', 'Climber')
  const events = finishRun(p, SKY)
  const finish = events.at(-1)
  assert.equal(finish.finish, true)
  assert.deepEqual(finish.unlocked, ['grand-tour'], 'the finish event names the chapter it opened')
  assert.ok(p.maps['sky-docks'].best.finishMs > 0)
  assert.deepEqual(p.unlocks, ['grand-tour'])
  assert.equal(isStageUnlocked(p, 'grand-tour'), true)
  // Another finish: nothing new to open.
  finishRun(p, SKY)
  assert.deepEqual(progressFor(p, SKY).checkpoint, lastCheckpoint(SKY))
  p.maps['sky-docks'].checkpoint = 0
  assert.deepEqual(finishRun(p, SKY).at(-1).unlocked, [])
  assert.deepEqual(p.unlocks, ['grand-tour'], 'recorded once')
  // Kept through a save round trip; junk and unknown ids are dropped on load.
  const stored = JSON.parse(JSON.stringify(toSaveData(p)))
  stored.unlocks.push('atlantis', 7, 'grand-tour')
  const back = normalizeProfile(stored, 'climber', 'Climber')
  assert.deepEqual(back.unlocks, ['grand-tour'])
  assert.equal(isStageUnlocked(back, 'grand-tour'), true)
  // Forever: even if the finish time were somehow gone, the unlock stays.
  back.maps['sky-docks'].best.finishMs = 0
  assert.equal(isStageUnlocked(back, 'grand-tour'), true)
  // A finish without a usable time (no totalMs) still opens it.
  const q = createProfile('untimed', 'Untimed')
  const pos = { x: 0, y: 0, z: 0 }
  const s = new PlayerSession(q, { now: 0, emit: () => {}, getPosition: () => pos, stage: SKY })
  for (let i = 1; i <= lastCheckpoint(SKY); i += 1) {
    Object.assign(pos, SKY.checkpoints[i])
    s.handle('checkpoint', { index: i, splitMs: 9000 })
  }
  assert.equal(q.maps['sky-docks'].best.finishMs, 0)
  assert.equal(isStageUnlocked(q, 'grand-tour'), true)
})

test('old saves: a Sky Docks finish time (also from an older, shorter Sky Docks) unlocks the Grand Tour', () => {
  // Per-map save from before chapters: a finish time, no `unlocks`.
  const p = createProfile('veteran', 'Vet')
  progressFor(p, SKY).best = { checkpoint: lastCheckpoint(SKY), altitude: 1343, finishMs: 412345 }
  const stored = JSON.parse(JSON.stringify(toSaveData(p)))
  delete stored.unlocks
  const back = normalizeProfile(stored, 'veteran', 'Vet')
  assert.deepEqual(back.unlocks, [])
  assert.equal(isStageUnlocked(back, 'grand-tour'), true)
  // A v2 save from before `maps`, finished on an older Sky Docks of 20 checkpoints: the
  // top-level fields are Sky Docks progress, and the finish time survives the trim.
  const v2 = {
    id: 'og', name: 'OG', version: 2, coins: 10, cars: [], car: 'x', slots: 1,
    checkpoint: 0, best: { checkpoint: 20, altitude: 800, finishMs: 254000 }, splits: { 1: 30000 }, pearls: 0,
    stats: {}, pity: 0, settings: {},
  }
  const og = normalizeProfile(JSON.parse(JSON.stringify(v2)), 'og', 'OG')
  progressFor(og, SKY)
  assert.equal(og.maps['sky-docks'].best.finishMs, 254000)
  assert.equal(isStageUnlocked(og, 'grand-tour'), true)
  // ...and one that never finished it stays locked.
  const never = normalizeProfile({ ...v2, best: { checkpoint: 20, altitude: 800, finishMs: 0 } }, 'nf', 'NF')
  assert.equal(isStageUnlocked(never, 'grand-tour'), false)
})

test('the summit exit portal: on the Sky Docks finish plaza, to the Grand Tour, posts solid, pad clear and safe', () => {
  const portal = SKY.exitPortal
  assert.ok(portal, 'Sky Docks has an exit portal')
  assert.equal(portal.to, 'grand-tour')
  assert.equal(portal.section, SKY.sections.length - 1)
  const cp = SKY.checkpoints.at(-1)
  assert.equal(portal.y, cp.y)
  assert.ok(onExitPortal(portal, portal.x, portal.y + 0.6, portal.z))
  assert.equal(onExitPortal(portal, portal.x, portal.y + 20, portal.z), false, 'not from high above')
  assert.equal(onExitPortal(portal, cp.respawn.x, cp.respawn.y, cp.respawn.z), false, 'not where you respawn')
  // Its pad is in the finish plaza's safe zone, clear of the finish gate.
  assert.ok(inSafeZone(SKY, portal.x, portal.y + 0.6, portal.z))
  assert.ok(Math.hypot(portal.x - cp.x, portal.z - cp.z) > 20)
  const posts = SKY.boxes.filter((b) => b.kind === 'portalPost')
  assert.equal(posts.length, 2)
  for (const b of posts) {
    assert.equal(b.section, portal.section)
    // Beside the pad, never on it.
    assert.equal(onExitPortal(portal, b.c[0], portal.y + 0.6, b.c[2]), false)
    assert.ok(Math.abs(Math.hypot(b.c[0] - portal.x, b.c[2] - portal.z) - (EXIT_PORTAL.d / 2 + EXIT_PORTAL.post)) < 0.01)
  }
  // Only the chapter maps' finishes lead on: the Grand Tour and Heat Run have none.
  for (const st of [getStage('grand-tour'), getStage('heat-run')]) assert.equal(st.exitPortal, undefined, st.id)
  // A stage that doesn't end at a finish gets nothing.
  assert.equal(addExitPortal({ checkpoints: [{}], sections: [], boxes: [] }, 'grand-tour').exitPortal, undefined)
})

// --- The room refuses a locked chapter -------------------------------------------------------

/** A room on map `stageId` with just enough state for onJoin (no matchmaker). */
function roomOn(stageId) {
  const room = new GameRoom()
  room.stageId = stageId
  room.state = new GameState()
  room.state.stage = stageId
  room.setMetadata = () => {}
  return room
}
const fakeClient = (sessionId) => {
  const inbox = []
  return { sessionId, inbox, send: (type, payload) => inbox.push({ type, payload }), sendBytes: () => {}, leave: () => {} }
}

test('joining a Grand Tour room: refused before Sky Docks is finished, allowed after; codes too; nobody evicted', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'uwd-chapters-'))
  try {
    await openStorage({ path: join(dir, 'chapters.db') })

    // A fresh player: refused, with the code and message the client shows.
    const tour = roomOn('grand-tour')
    const c1 = fakeClient('a1')
    await assert.rejects(tour.onJoin(c1, { stage: 'grand-tour' }, { playerId: 'newbie', name: 'Newbie' }), (err) => {
      assert.equal(err.code, STAGE_LOCKED)
      assert.match(err.message, /Crane Summit in Sky Docks to unlock Chapter 2/)
      return true
    })
    assert.equal(tour.members.size, 0)
    assert.equal(tour.state.players.size, 0)
    assert.equal(activePlayers.has('newbie'), false)
    assert.equal(c1.inbox.length, 0, 'nothing sent: no profile, no spawn')
    // The same player is welcome on Sky Docks and Heat Run.
    for (const id of ['sky-docks', 'heat-run']) {
      const room = roomOn(id)
      const c = fakeClient(`ok-${id}`)
      await room.onJoin(c, { stage: id }, { playerId: 'newbie', name: 'Newbie' })
      assert.equal(room.members.size, 1, id)
      await room.onLeave(c)
    }

    // A private lobby's code leads to the same onJoin: a private Grand Tour room refuses too.
    const priv = roomOn('grand-tour')
    priv.state.isPrivate = true
    priv.state.code = 'ABCDE'
    await assert.rejects(priv.onJoin(fakeClient('a2'), { stage: 'grand-tour' }, { playerId: 'newbie', name: 'Newbie' }), { code: STAGE_LOCKED })

    // Playing Sky Docks in another window with a locked profile: refused without being
    // thrown out of the Sky Docks room.
    const sky = roomOn('sky-docks')
    const skyClient = fakeClient('s1')
    await sky.onJoin(skyClient, { stage: 'sky-docks' }, { playerId: 'newbie', name: 'Newbie' })
    await assert.rejects(roomOn('grand-tour').onJoin(fakeClient('a3'), { stage: 'grand-tour' }, { playerId: 'newbie', name: 'Newbie' }), { code: STAGE_LOCKED })
    assert.equal(sky.members.get('s1').kicked, undefined, 'not evicted')
    assert.equal(activePlayers.get('newbie').room, sky)

    // ...finishes Sky Docks there (the room's session records it), leaves (saved), and the
    // Grand Tour lets them in.
    const member = sky.members.get('s1')
    finishRunOn(member)
    assert.equal(isStageUnlocked(member.session.profile, 'grand-tour'), true)
    assert.ok(skyClient.inbox.some((m) => m.type === 'checkpoint' && m.payload.finish && m.payload.unlocked?.includes('grand-tour')))
    await sky.onLeave(skyClient)
    const tour2 = roomOn('grand-tour')
    const c4 = fakeClient('a4')
    await tour2.onJoin(c4, { stage: 'grand-tour' }, { playerId: 'newbie', name: 'Newbie' })
    assert.equal(tour2.members.size, 1)
    assert.deepEqual(c4.inbox.find((m) => m.type === 'spawn').payload.stage, 'grand-tour')
    await tour2.onLeave(c4)

    // A save that finished an older Sky Docks (finish time, no `unlocks`) is let in too.
    const vet = createProfile('vet', 'Vet')
    vet.maps['sky-docks'] = { checkpoint: 0, best: { checkpoint: 20, altitude: 800, finishMs: 254000 }, splits: {}, pearls: 0 }
    delete vet.unlocks
    await saveProfile(vet, 'seed')
    assert.equal((await loadProfile('vet', 'Vet', 'peek')).maps['sky-docks'].best.finishMs, 254000)
    const tour3 = roomOn('grand-tour')
    const c5 = fakeClient('a5')
    await tour3.onJoin(c5, { stage: 'grand-tour' }, { playerId: 'vet', name: 'Vet' })
    assert.equal(tour3.members.size, 1)
    await tour3.onLeave(c5)
  } finally {
    activePlayers.clear()
    await closeStorage()
    rmSync(dir, { recursive: true, force: true })
  }
})

/** Reaches every Sky Docks checkpoint through a room member's session (positions as accepted poses). */
function finishRunOn(member) {
  const last = lastCheckpoint(SKY)
  for (let i = 1; i <= last; i += 1) {
    Object.assign(member.pose, { x: SKY.checkpoints[i].x, y: SKY.checkpoints[i].y, z: SKY.checkpoints[i].z })
    member.session.handle('checkpoint', { index: i, splitMs: 10000 + i, totalMs: i === last ? 333000 : undefined })
  }
}
