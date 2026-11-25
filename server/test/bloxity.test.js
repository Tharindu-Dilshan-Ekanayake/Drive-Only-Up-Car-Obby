import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { createProfile, progressFor } from '../../shared/logic.js'
import { loadStage } from '../../shared/stages/index.js'
import { asGuestId, resolveIdentity, verifyAdReward } from '../src/bloxityApi.js'
import { readBloxityEnv } from '../src/bloxityEnv.js'
import { BLOXITY_LEADERBOARDS, changedScores, chunk, leaderboardScores, sendScores } from '../src/bloxityLeaderboards.js'
import {
  carryOverGuest,
  closeStorage,
  loadProfile,
  openStorage,
  saveProfile,
  topPlayers,
  topSplits,
} from '../src/db.js'

const STAGE1 = await loadStage('sky-docks')

/**
 * A stand-in for fetch: answers each call with `reply(url, init)` -> `{ status, body }`
 * (or throws, like a network failure), and remembers the calls.
 */
function fakeFetch(reply) {
  const calls = []
  const fn = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) })
    const { status = 200, body = {} } = await reply(url, init)
    return { status, json: async () => body }
  }
  fn.calls = calls
  return fn
}

const hosted = readBloxityEnv({ BLOXITY_ENV: 'stage', BLOXITY_API_URL: 'https://api.stage.example/', BLOXITY_GAME_ID: 'tire' })
const local = readBloxityEnv({})

// --- Environment -----------------------------------------------------------------

test('Boxity URLs come from the environment, production only as the fallback', () => {
  assert.equal(local.env, 'prod')
  assert.equal(local.apiUrl, 'https://api.bloxity.io')
  assert.equal(local.matchmakerUrl, 'https://play.bloxity.io')
  assert.equal(local.portalUrl, 'https://bloxity.io')
  assert.equal(local.staticUrl, 'https://static.bloxity.io')
  assert.equal(local.gameSlug, 'drive-only-up-car-obby')
  assert.equal(local.hosted, false)
  assert.equal(hosted.apiUrl, 'https://api.stage.example', 'trailing slash trimmed')
  assert.equal(hosted.gameSlug, 'tire')
  assert.equal(hosted.hosted, true)
  assert.equal(readBloxityEnv({ BLOXITY_GAME_SLUG: 's', BLOXITY_GAME_ID: 'g' }).gameSlug, 's')
  assert.equal(readBloxityEnv({ NODE_ENV: 'production' }).hosted, true)
  assert.equal(readBloxityEnv({ BLOXITY_MATCHMAKER_URL: 'https://play.stage.bloxity.io' }).playHost, 'play.stage.bloxity.io')
})

// --- Identity --------------------------------------------------------------------

test('a valid token makes the Boxity account id the save key', async () => {
  const fetchImpl = fakeFetch(() => ({ body: { valid: true, user: { _id: 'acc1', username: 'Real' }, carriedFrom: ['g1'] } }))
  const id = await resolveIdentity({ playerId: 'someone-else', token: 'tok', name: 'Fake' }, { fetchImpl, settings: hosted })
  assert.deepEqual(id, { playerId: 'acc1', verified: true, name: 'Real', carriedFrom: ['g1'] })
  const [call] = fetchImpl.calls
  assert.equal(call.url, 'https://api.stage.example/v1/auth/game-token/verify')
  assert.equal(call.init.headers.Authorization, 'Bearer tok')
  assert.deepEqual(call.body, { gameSlug: 'tire' })
})

test('a token Boxity rejects refuses the join', async () => {
  const fetchImpl = fakeFetch(() => ({ status: 401, body: { valid: false } }))
  await assert.rejects(resolveIdentity({ playerId: 'acc1', token: 'bad' }, { fetchImpl, settings: hosted }))
})

test('guests: their own guest id, anything else made into one when hosted', async () => {
  const fetchImpl = fakeFetch(() => assert.fail('no token, no call'))
  const opts = { fetchImpl, settings: hosted }
  assert.deepEqual(await resolveIdentity({ playerId: 'guest-abc' }, opts), { playerId: 'guest-abc', verified: false, carriedFrom: [] })
  assert.equal((await resolveIdentity({ playerId: 'acc1', token: null }, opts)).playerId, 'guest-acc1')
  assert.equal((await resolveIdentity({ playerId: 'acc1' }, { fetchImpl, settings: local })).playerId, 'acc1', 'any id off Boxity')
  await assert.rejects(resolveIdentity({}, opts))
  assert.equal(asGuestId('x'.repeat(200)).length, 80)
})

test('Boxity down: the player still gets in, as an unverified guest', async () => {
  const down = fakeFetch(() => {
    throw new Error('ECONNREFUSED')
  })
  const failing = fakeFetch(() => ({ status: 503, body: null }))
  for (const fetchImpl of [down, failing]) {
    const id = await resolveIdentity({ playerId: 'acc1', token: 'tok' }, { fetchImpl, settings: hosted })
    assert.deepEqual(id, { playerId: 'guest-acc1', verified: false, carriedFrom: [] })
  }
})

test('an ad pays only when Boxity says the token is valid', async () => {
  const yes = fakeFetch(() => ({ body: { valid: true } }))
  assert.equal(await verifyAdReward('r1', { fetchImpl: yes, settings: hosted }), true)
  assert.equal(yes.calls[0].url, 'https://api.stage.example/v1/ads/reward/verify')
  assert.deepEqual(yes.calls[0].body, { gameSlug: 'tire', rewardToken: 'r1' })
  assert.equal(await verifyAdReward('r1', { fetchImpl: fakeFetch(() => ({ body: { valid: 'true' } })), settings: hosted }), false)
  const down = fakeFetch(() => {
    throw new Error('timeout')
  })
  assert.equal(await verifyAdReward('r1', { fetchImpl: down, settings: hosted }), false)
})

// --- Leaderboards ----------------------------------------------------------------

test('leaderboard scores are whole numbers from the profile', () => {
  const p = createProfile('a', 'A')
  progressFor(p, STAGE1).best.altitude = 282.9
  Object.assign(p.stats, { totalCoins: 1234, finishes: 3, playtime: 3599 })
  assert.deepEqual(leaderboardScores(p), { altitude: 282, coins: 1234, finishes: 3, playtime: 59 })
  assert.deepEqual(
    BLOXITY_LEADERBOARDS.map((b) => b.id),
    Object.keys(leaderboardScores(p)),
  )
})

test('only changed scores are reported, as legion_<id>', () => {
  const p = createProfile('a', 'A')
  p.stats.finishes = 2
  const lastSent = new Map([
    ['legion_a|altitude', 0],
    ['legion_a|coins', 0],
    ['legion_a|finishes', 2],
  ])
  assert.deepEqual(changedScores([{ id: 'a', profile: p }], lastSent), [{ board: 'playtime', userId: 'legion_a', score: 0 }])
  assert.deepEqual(
    chunk([1, 2, 3, 4, 5], 2),
    [[1, 2], [3, 4], [5]],
  )
})

test('reports go in batches of 200; failed batches are retried later', async () => {
  const scores = Array.from({ length: 450 }, (_, i) => ({ board: 'coins', userId: `legion_${i}`, score: i }))
  let n = 0
  const fetchImpl = fakeFetch(() => {
    n += 1
    return n === 2 ? { status: 500 } : { body: { accepted: 1, dropped: { coins: 0 } } }
  })
  const lastSent = new Map()
  await sendScores(scores, lastSent, { token: 'rt', settings: hosted, fetchImpl })
  assert.deepEqual(
    fetchImpl.calls.map((c) => c.body.scores.length),
    [200, 200, 50],
  )
  assert.equal(fetchImpl.calls[0].url, 'https://api.stage.example/v1/leaderboards/hosted/tire/report')
  assert.equal(fetchImpl.calls[0].init.headers.Authorization, 'Bearer rt')
  assert.deepEqual(fetchImpl.calls[0].body.boards, BLOXITY_LEADERBOARDS)
  assert.equal(lastSent.size, 250, 'the failed batch is not marked as sent')
  assert.equal(lastSent.has('legion_250|coins'), false)
})

// --- Database (SQLite in memory) -------------------------------------------------

before(() => openStorage({ path: ':memory:' }))
after(() => closeStorage())

test('guest progress carries into a new account once', async () => {
  const guest = createProfile('guest-g1', 'Guesty')
  guest.coins = 777
  guest.stats.finishes = 2
  await saveProfile(guest, 'x')
  assert.equal(await carryOverGuest('acc7', ['nope', 'g1'], 'Seven'), 'guest-g1', 'found under its guest- spelling')
  const carried = await loadProfile('acc7', 'Seven', 'x')
  assert.equal(carried.id, 'acc7')
  assert.equal(carried.name, 'Seven')
  assert.equal(carried.coins, 777)
  assert.equal(carried.stats.finishes, 2)
  assert.equal(await carryOverGuest('acc8', ['guest-g1'], 'Eight'), null, 'never copied twice')
  assert.equal(await carryOverGuest('acc7', ['guest-g1'], 'Seven'), null)
  const boards = await topPlayers(10)
  assert.equal(boards.finishes.filter((r) => r.score === 2).length, 1, 'the used guest save is off the boards')

  // An account that already has progress keeps it.
  const other = createProfile('guest-g2', 'G2')
  other.coins = 5
  await saveProfile(other, 'x')
  assert.equal(await carryOverGuest('acc7', ['guest-g2'], 'Seven'), null)
  assert.equal(await carryOverGuest('acc10', ['guest-g2'], 'Ten'), 'guest-g2', 'still unused, so still available')
})

test('checkpoint boards list the fastest best splits, and carried guest times move', async () => {
  const a = createProfile('split-a', 'Alpha')
  progressFor(a, STAGE1).splits = { 1: 30000, 2: 52000 }
  const b = createProfile('guest-split-b', 'Bravo')
  progressFor(b, STAGE1).splits = { 1: 25000 }
  await saveProfile(a, 'x')
  await saveProfile(b, 'x')
  a.maps['sky-docks'].splits[1] = 28000
  await saveProfile(a, 'x')
  let boards = await topSplits(10, 'sky-docks', 3)
  assert.deepEqual(boards[1].filter((r) => r.name === 'Alpha' || r.name === 'Bravo'), [
    { name: 'Bravo', ms: 25000 },
    { name: 'Alpha', ms: 28000 },
  ])
  assert.deepEqual(boards[2].filter((r) => r.name === 'Alpha'), [{ name: 'Alpha', ms: 52000 }])
  assert.deepEqual(boards[3], [])
  assert.equal(await carryOverGuest('acc-split', ['guest-split-b'], 'Charlie'), 'guest-split-b')
  boards = await topSplits(10, 'sky-docks', 1)
  const names = boards[1].map((r) => r.name)
  assert.ok(names.includes('Charlie') && !names.includes('Bravo'), 'the guest time moved to the account')
})

// --- Open Rooms reporter -----------------------------------------------------------

test('the room reporter posts this pod\'s rooms to Boxity, and only when configured', async () => {
  const { installRoomReporter } = await import('../src/legionRoomReporter.js')
  const realFetch = globalThis.fetch
  const saved = { ...process.env }
  const calls = []
  const query = async () => [
    { roomId: 'abc', name: 'game', clients: 3, maxClients: 8, locked: false, private: false, metadata: { players: 3 } },
    { roomId: 'XYZ12', name: 'game', clients: 1, maxClients: 8, locked: false, private: true, metadata: {} },
  ]
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init })
    return { ok: true }
  }
  try {
    delete process.env.MATCHMAKER_REPORT_URL
    installRoomReporter({ query })()
    await new Promise((r) => setTimeout(r, 10))
    assert.equal(calls.length, 0, 'nothing without the platform variables')

    Object.assign(process.env, { MATCHMAKER_REPORT_URL: 'https://mm.test/report/', BLOXITY_REPORT_TOKEN: 'tok', BLOXITY_GAME_ID: 'tire', POD_NAME: 'pod-1' })
    const stop = installRoomReporter({ intervalMs: 60000, query })
    await new Promise((r) => setTimeout(r, 10))
    stop()
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://mm.test/report/tire/rooms')
    assert.equal(calls[0].init.headers.authorization, 'Bearer tok')
    const body = JSON.parse(calls[0].init.body)
    assert.equal(body.podName, 'pod-1')
    assert.equal(body.players, 4)
    assert.deepEqual(body.rooms[0], { colyseusRoomId: 'abc', name: 'game', clients: 3, maxClients: 8, locked: false, private: false, started: false, metadata: { players: 3 } })
    assert.equal(body.rooms[1].private, true)
  } finally {
    globalThis.fetch = realFetch
    process.env = saved
  }
})
