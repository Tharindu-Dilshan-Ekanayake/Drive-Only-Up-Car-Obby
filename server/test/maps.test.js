import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { CHECKPOINT_COINS, PEARL_COINS, PEARL_SET_BONUS } from '../../shared/balance.js'
import { STARTER_CAR } from '../../shared/cars.js'
import { bestAltitude, createProfile, lastCheckpoint, normalizeProfile, progressFor, progressOf, toSaveData } from '../../shared/logic.js'
import { SPAWN } from '../../shared/lobby.js'
import { inSafeZone } from '../../shared/safeZones.js'
import { PlayerSession } from '../../shared/session.js'
import { DEFAULT_STAGE, getStage, isStageId, loadAllStages, loadStage, STAGE_IDS, STAGES, stageInfo, validStageId } from '../../shared/stages/index.js'
import { STAGE1 } from '../../shared/stages/stage1.js'
import { closeStorage, loadProfile, openStorage, saveProfile, topSplits } from '../src/db.js'
import { acceptMove, isTeleportPoint, maxY } from '../src/movement.js'
import { GameRoom } from '../src/rooms/GameRoom.js'

await loadAllStages()
const SKY = getStage('sky-docks')
const TOUR = getStage('grand-tour')

/** A session on `stage` with a movable position and every emitted event recorded. */
function harness(profile, stage) {
  const events = []
  const pos = { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z }
  const session = new PlayerSession(profile, { now: 0, emit: (type, payload) => events.push({ type, payload }), getPosition: () => pos, stage })
  const reach = (n) => {
    for (let i = 1; i <= n; i += 1) {
      Object.assign(pos, { x: stage.checkpoints[i].x, y: stage.checkpoints[i].y, z: stage.checkpoints[i].z })
      session.handle('checkpoint', { index: i, splitMs: 10000 + i, totalMs: i === lastCheckpoint(stage) ? 200000 : undefined })
    }
  }
  return { session, events, pos, reach, of: (type) => events.filter((e) => e.type === type).map((e) => e.payload) }
}

// --- Registry ---------------------------------------------------------------------------

test('the map registry: Sky Docks first and the default, then the Grand Tour; the old separate maps are gone', () => {
  assert.deepEqual(STAGE_IDS.slice(0, 2), ['sky-docks', 'grand-tour'])
  assert.equal(new Set(STAGE_IDS).size, STAGE_IDS.length, 'ids unique')
  for (const gone of ['neon-city', 'snow-peak', 'tropic-isle', 'desert-canyon']) assert.equal(isStageId(gone), false, gone)
  assert.equal(DEFAULT_STAGE, 'sky-docks')
  assert.equal(STAGES[0].name, 'Sky Docks')
  for (const info of STAGES) {
    assert.ok(info.name && info.short && info.tagline && /^#[0-9a-f]{6}$/i.test(info.color), info.id)
    assert.ok(info.theme && info.theme.sky && info.theme.scenery && info.theme.ground && typeof info.theme.track === 'object', info.id)
    assert.equal(typeof info.load, 'function')
  }
  assert.equal(isStageId('grand-tour'), true)
  assert.equal(isStageId('stage1'), false)
  assert.equal(validStageId('nope'), 'sky-docks')
  assert.equal(validStageId(undefined), 'sky-docks')
  assert.equal(stageInfo('grand-tour').name, 'Grand Tour')
})

test('stages load once (cached), carry their registry id, and Sky Docks is the STAGE1 export', async () => {
  assert.equal(await loadStage('grand-tour'), TOUR)
  assert.equal(getStage('sky-docks'), STAGE1, 'the registry hands out the same Sky Docks object')
  await assert.rejects(loadStage('atlantis'))
  for (const id of STAGE_IDS) {
    const st = getStage(id)
    assert.equal(st.id, id)
    const sections = st.sections.length - 1
    assert.ok(sections >= 3 && sections <= 31, `${id}: ${sections} roads (pearls are one bit per road)`)
    assert.equal(st.pearls.length, sections, `${id}: a pearl per road`)
    assert.equal(st.chests.length, sections, `${id}: a chest per road`)
    assert.equal(st.checkpoints.at(-1).finish, true, `${id} ends at a finish`)
    for (const cp of st.checkpoints.slice(1)) assert.ok(cp.respawn, `${id} cp ${cp.index} has a respawn point`)
    // Every map starts at the pier's Start gate.
    assert.deepEqual([st.path[0].x, st.path[0].z], [0, -40])
  }
})

test('the Grand Tour: four zones in order, every section in one, contiguous, <= 31 roads', () => {
  const info = stageInfo('grand-tour')
  assert.deepEqual(info.zones.map((z) => z.id), ['neon', 'snow', 'tropic', 'canyon'])
  for (const z of info.zones) assert.ok(z.name && /^#[0-9a-f]{6}$/i.test(z.color) && z.sky && z.scenery && typeof z.track === 'object', z.id)
  const roads = TOUR.sections.length - 1
  assert.ok(roads <= 31, `${roads} roads`)
  assert.deepEqual(TOUR.zones.map((z) => z.id), ['neon', 'snow', 'tropic', 'canyon'])
  let next = 0
  for (const z of TOUR.zones) {
    assert.equal(z.from, next, `${z.id} starts where the last zone ended`)
    for (let i = z.from; i <= z.to; i += 1) assert.equal(TOUR.sections[i].zone, z.id)
    next = z.to + 1
  }
  assert.equal(next, TOUR.sections.length, 'the finish section belongs to the last zone')
  assert.equal(TOUR.sections.at(-1).zone, 'canyon')
  // It climbs zone to zone, and the snow zone has its ice.
  const top = (z) => Math.max(...TOUR.path.filter((p) => TOUR.sections[p.section].zone === z).map((p) => p.y))
  assert.ok(top('neon') < top('snow') && top('snow') < top('tropic') && top('tropic') < top('canyon'))
  assert.ok(TOUR.boxes.some((b) => b.kind === 'ice' && TOUR.sections[b.section].zone === 'snow'))
})

test('saves with progress on removed maps load cleanly (dropped), keeping the rest', () => {
  const p = createProfile('old-maps', 'Old')
  progressFor(p, SKY).checkpoint = 3
  const stored = JSON.parse(JSON.stringify(toSaveData(p)))
  stored.maps['neon-city'] = { checkpoint: 5, best: { checkpoint: 9, altitude: 400, finishMs: 0 }, splits: { 1: 9000 }, pearls: 7 }
  stored.maps['snow-peak'] = 'junk'
  stored.maps['desert-canyon'] = null
  const back = normalizeProfile(stored, 'old-maps', 'Old')
  assert.deepEqual(Object.keys(back.maps), ['sky-docks'])
  assert.equal(progressOf(back, 'sky-docks').checkpoint, 3)
  assert.equal(progressOf(back, 'grand-tour').checkpoint, 0)
})

// --- Saves: per-map progress and migration ---------------------------------------------

test('a v2 save from before maps loads with all its progress, as Sky Docks progress', () => {
  const v2 = {
    id: 'old', name: 'Oldie', version: 2, coins: 4321, cars: [STARTER_CAR, 'seajet'], car: 'seajet', slots: 2,
    paints: ['stock', 'cherry'], paint: 'cherry', nitros: ['classic'], nitro: 'classic',
    checkpoint: 7, best: { checkpoint: 12, altitude: 512.5, finishMs: 0 }, splits: { 1: 31000, 2: 45000, 12: 61000 },
    stats: { totalCoins: 9000, finishes: 0, tricks: 40, spins: 3, falls: 9, playtime: 3600 }, pity: 2, pearls: 0b1011,
    settings: { music: false, sfx: true, ghost: true, sunset: false }, createdAt: 100, lastSeen: 200,
  }
  const p = normalizeProfile(JSON.parse(JSON.stringify(v2)), 'old', 'Oldie')
  // Global things stay global.
  assert.equal(p.coins, 4321)
  assert.deepEqual(p.cars, [STARTER_CAR, 'seajet'])
  assert.equal(p.car, 'seajet')
  assert.equal(p.slots, 2)
  assert.equal(p.paint, 'cherry')
  assert.equal(p.stats.totalCoins, 9000)
  assert.equal(p.settings.music, false)
  // Progress moved into maps['sky-docks'], nothing lost; no other map visited.
  assert.deepEqual(Object.keys(p.maps), ['sky-docks'])
  assert.deepEqual(progressFor(p, SKY), { checkpoint: 7, best: { checkpoint: 12, altitude: 512.5, finishMs: 0 }, splits: { 1: 31000, 2: 45000, 12: 61000 }, pearls: 0b1011 })
  assert.equal('checkpoint' in p || 'splits' in p || 'pearls' in p || 'best' in p, false, 'no top-level progress in memory')
  assert.equal(bestAltitude(p), 512.5)
  // Stored again, the Sky Docks progress is mirrored at the top level (older servers read
  // that), and a round trip changes nothing.
  const stored = toSaveData(p)
  assert.equal(stored.checkpoint, 7)
  assert.deepEqual(stored.splits, { 1: 31000, 2: 45000, 12: 61000 })
  assert.equal(stored.pearls, 0b1011)
  assert.deepEqual(normalizeProfile(JSON.parse(JSON.stringify(stored)), 'old', 'Oldie'), p)
})

test('a save played on an older server (top-level fields newer than maps) is merged, never losing a best', () => {
  const p = createProfile('m', 'M')
  progressFor(p, SKY).splits = { 1: 30000 }
  progressFor(p, SKY).best = { checkpoint: 4, altitude: 300, finishMs: 0 }
  progressFor(p, TOUR).checkpoint = 2
  const stored = JSON.parse(JSON.stringify(toSaveData(p)))
  // The old server only knew the top level: it moved on and improved split 2.
  Object.assign(stored, { checkpoint: 6, best: { checkpoint: 6, altitude: 420, finishMs: 0 }, splits: { 1: 32000, 2: 41000 } })
  const back = normalizeProfile(stored, 'm', 'M')
  const sky = progressFor(back, SKY)
  assert.equal(sky.checkpoint, 6)
  assert.deepEqual(sky.best, { checkpoint: 6, altitude: 420, finishMs: 0 })
  assert.deepEqual(sky.splits, { 1: 30000, 2: 41000 }, 'the faster of each split')
  assert.equal(progressOf(back, 'grand-tour').checkpoint, 2, 'other maps untouched')
})

test('progress is per map: checkpoints, bests, splits and pearls; coins and stats are shared', () => {
  const p = createProfile('pm', 'Pat')
  const sky = harness(p, SKY)
  sky.reach(3)
  assert.equal(progressOf(p, 'sky-docks').checkpoint, 3)
  const coinsAfterSky = p.coins
  assert.equal(coinsAfterSky, CHECKPOINT_COINS(1) + CHECKPOINT_COINS(2) + CHECKPOINT_COINS(3))

  // The same profile on the Grand Tour: a fresh run there, checkpoint 1 pays again.
  const neon = harness(p, TOUR)
  assert.equal(neon.session.progress.checkpoint, 0)
  neon.reach(lastCheckpoint(TOUR))
  const finish = neon.of('checkpoint').at(-1)
  assert.equal(finish.finish, true)
  assert.equal(p.stats.finishes, 1, 'finishes are a global stat')
  assert.equal(progressOf(p, 'grand-tour').best.finishMs, 200000)
  assert.equal(progressOf(p, 'sky-docks').best.finishMs, 0)
  assert.equal(progressOf(p, 'sky-docks').checkpoint, 3, 'Sky Docks run untouched')
  assert.ok(p.coins > coinsAfterSky)
  assert.deepEqual(Object.keys(progressOf(p, 'grand-tour').splits).map(Number), Array.from({ length: lastCheckpoint(TOUR) }, (_, i) => i + 1))

  // the Grand Tour's checkpoint 2 can't be claimed standing at Sky Docks' checkpoint 2.
  const p2 = createProfile('x', 'X')
  const h = harness(p2, TOUR)
  h.reach(1)
  Object.assign(h.pos, { x: SKY.checkpoints[2].x, y: SKY.checkpoints[2].y, z: SKY.checkpoints[2].z })
  h.session.handle('checkpoint', { index: 2, splitMs: 5000 })
  assert.equal(progressOf(p2, 'grand-tour').checkpoint, 1)

  // Pearls: each map has its own set, and its own set bonus.
  const p3 = createProfile('pearls', 'P')
  const hp = harness(p3, TOUR)
  for (const pearl of TOUR.pearls) {
    Object.assign(hp.pos, { x: pearl.x, y: pearl.y, z: pearl.z })
    hp.session.handle('pearl', { index: pearl.index })
  }
  assert.equal(hp.of('pearl').at(-1).complete, true)
  assert.equal(hp.of('pearl').at(-1).total, TOUR.pearls.length)
  assert.equal(p3.coins, PEARL_COINS * TOUR.pearls.length + PEARL_SET_BONUS)
  assert.equal(progressOf(p3, 'sky-docks').pearls, 0)
  // A pearl index Sky Docks has but the Grand Tour doesn't is refused on the Grand Tour.
  const skyOnly = SKY.pearls.find((x) => !TOUR.pearls.some((y) => y.index === x.index))
  Object.assign(hp.pos, { x: skyOnly.x, y: skyOnly.y, z: skyOnly.z })
  hp.session.handle('pearl', { index: skyOnly.index })
  assert.equal(progressOf(p3, 'grand-tour').pearls & (1 << skyOnly.index), 0)

  // A restart on one map leaves the other's run alone.
  sky.session.handle('restart')
  assert.equal(progressOf(p, 'sky-docks').checkpoint, 0)
  assert.equal(progressOf(p, 'grand-tour').checkpoint, lastCheckpoint(TOUR))
})

test('offline travel: one session switches maps (setStage) and keeps both maps progress', () => {
  const p = createProfile('off', 'Off')
  const h = harness(p, SKY)
  h.reach(2)
  h.session.setStage(TOUR)
  assert.equal(h.session.progress, p.maps['grand-tour'])
  assert.equal(h.of('profile').length > 0, true, 'the client hears about the switch')
  const cp1 = TOUR.checkpoints[1]
  Object.assign(h.pos, { x: cp1.x, y: cp1.y, z: cp1.z })
  h.session.handle('checkpoint', { index: 1, splitMs: 9000 })
  assert.equal(progressOf(p, 'grand-tour').checkpoint, 1)
  assert.equal(progressOf(p, 'sky-docks').checkpoint, 2)
  // Coins of the new map can be taken; Sky Docks coin ids mean nothing there.
  const coin = TOUR.coins.find((c) => c.section === 1)
  Object.assign(h.pos, { x: coin.x, y: coin.y, z: coin.z })
  const before = p.coins
  h.session.handle('coin', { id: coin.id })
  assert.equal(p.coins, before + 1)
})

// --- Server checks follow the room's map ---------------------------------------------------

test('movement limits and safe zones come from the room map', () => {
  assert.ok(maxY(SKY) > 1300 && maxY(TOUR) > TOUR.maxAltitude && maxY(TOUR) < maxY(SKY), `${maxY(SKY)} / ${maxY(TOUR)}`)
  const cp = TOUR.checkpoints[2].respawn
  assert.equal(isTeleportPoint(cp, TOUR), true)
  assert.equal(isTeleportPoint(cp, SKY), false)
  assert.equal(acceptMove({ x: 0, y: 2, z: 0 }, cp, 0.1, TOUR), true, 'respawn at a the Grand Tour checkpoint')
  // A plaza of one map is just open air (or road) on another.
  const plaza = TOUR.checkpoints[1]
  const on = { x: plaza.respawn.x, y: plaza.respawn.y + 0.6, z: plaza.respawn.z }
  assert.equal(inSafeZone(TOUR, on.x, on.y, on.z), true)
  assert.equal(inSafeZone(SKY, on.x, on.y, on.z), false)
  assert.equal(inSafeZone(null, SPAWN.x, SPAWN.y + 1, SPAWN.z), true, 'no stage loaded: the pier still is')

  // A the Grand Tour room calls a bump on a the Grand Tour plaza safe; a Sky Docks room doesn't.
  const bumpAt = (stageId) => {
    const room = new GameRoom()
    room.stageId = stageId
    const members = [0, 1].map((i) => {
      const member = { slot: room.freeSlot(), pose: { x: on.x + i * 2, y: on.y, z: on.z, qx: 0, qy: 0, qz: 0, qw: 1, b: false, seq: ++room.poseSeq }, speed: 20, inbox: [], client: { sessionId: `s${i}`, send: (type, payload) => member.inbox.push({ type, payload }) } }
      room.members.set(`s${i}`, member)
      return member
    })
    room.memberList = [...room.members.values()]
    return room.handleBump(members[0].client, { to: 's1', x: 5, y: 0, z: 0 }, 1000)
  }
  assert.equal(bumpAt('grand-tour'), 'safe')
  assert.equal(bumpAt('sky-docks'), 'ok')
})

// --- Storage: per-map split boards and the old splits table ---------------------------------

test('split boards are per map, and an old splits table becomes Sky Docks times', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'uwd-maps-'))
  const path = join(dir, 'old.db')
  try {
    // A database from before maps: splits keyed by (player, checkpoint).
    const { DatabaseSync } = await import('node:sqlite')
    const old = new DatabaseSync(path)
    old.exec(`CREATE TABLE splits (pid TEXT NOT NULL, cp INTEGER NOT NULL, ms INTEGER NOT NULL, name TEXT NOT NULL, PRIMARY KEY (pid, cp));
      CREATE INDEX splits_time ON splits (cp, ms);
      INSERT INTO splits VALUES ('veteran', 1, 21000, 'Veteran'), ('veteran', 2, 40000, 'Veteran');`)
    old.close()

    await openStorage({ path })
    let boards = await topSplits(10, 'sky-docks', 2)
    assert.deepEqual(boards[1], [{ name: 'Veteran', ms: 21000 }])
    assert.deepEqual((await topSplits(10, 'grand-tour', 2))[1], [])

    // A player with times on two maps: each board gets its own map's.
    const p = createProfile('both', 'Both')
    progressFor(p, SKY).splits = { 1: 25000 }
    progressFor(p, TOUR).splits = { 1: 9000, 2: 12000 }
    await saveProfile(p, 'x')
    boards = await topSplits(10, 'sky-docks', 2)
    assert.deepEqual(boards[1], [{ name: 'Veteran', ms: 21000 }, { name: 'Both', ms: 25000 }])
    const tour = await topSplits(10, 'grand-tour', 2)
    assert.deepEqual(tour[1], [{ name: 'Both', ms: 9000 }])
    assert.deepEqual(tour[2], [{ name: 'Both', ms: 12000 }])

    // Saved and loaded back: per-map progress intact, Sky Docks mirrored for old readers.
    const back = await loadProfile('both', 'Both', 'y')
    assert.deepEqual(progressOf(back, 'grand-tour').splits, { 1: 9000, 2: 12000 })
    assert.deepEqual(progressOf(back, 'sky-docks').splits, { 1: 25000 })
  } finally {
    await closeStorage()
    rmSync(dir, { recursive: true, force: true })
  }
})
