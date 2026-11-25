import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  AD_REWARDS,
  CHECKPOINT_COINS,
  COIN_RATE,
  DUPLICATE_REFUND,
  FINISH_BONUS,
  MIN_FINISH_MS,
  PITY_SPINS,
  PRODUCTS,
  SLOT_COSTS,
  SPIN_COST,
  TRICK_COINS_PER_MIN,
} from '../../shared/balance.js'
import { CARS, RARITIES, RARITY_INFO, STARTER_CAR } from '../../shared/cars.js'
import { mulberry32 } from '../../shared/rng.js'
import { createProfile, lastCheckpoint, normalizeProfile, progressFor, rollSpin } from '../../shared/logic.js'
import { PlayerSession } from '../../shared/session.js'
import { NITRO_BY_ID, PAINT_BY_ID } from '../../shared/cosmetics.js'
import { SPAWN } from '../../shared/lobby.js'
import { loadStage } from '../../shared/stages/index.js'
import { acceptMove, clampY, isTeleportPoint, maxY } from '../src/movement.js'

const STAGE1 = await loadStage('sky-docks')
const LAST_CHECKPOINT = lastCheckpoint(STAGE1)

/** A session with a movable position and every emitted event recorded. */
function harness(profile = createProfile('p1', 'Pat'), { rand = Math.random } = {}) {
  const events = []
  const pos = { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z }
  const session = new PlayerSession(profile, { now: 0, emit: (type, payload) => events.push({ type, payload }), getPosition: () => pos, rand, stage: STAGE1 })
  const of = (type) => events.filter((e) => e.type === type).map((e) => e.payload)
  const moveTo = (p) => Object.assign(pos, { x: p.x, y: p.y, z: p.z })
  // Sky Docks progress (profile.maps['sky-docks']), the map this harness plays.
  return { profile, progress: session.progress, session, events, of, moveTo }
}

/** Drives a harness through checkpoints 1..n, standing at each gate. */
function reach(h, n, splitMs = 20000) {
  for (let i = 1; i <= n; i += 1) {
    h.moveTo(STAGE1.checkpoints[i])
    h.session.handle('checkpoint', { index: i, splitMs, totalMs: i === LAST_CHECKPOINT ? 300000 : undefined })
  }
}

// --- Profiles ------------------------------------------------------------------------

test('a new profile starts with the starter car, one slot and nothing else', () => {
  const p = createProfile('a', 'A', 5)
  assert.deepEqual(p.cars, [STARTER_CAR])
  assert.equal(p.car, STARTER_CAR)
  assert.equal(p.slots, 1)
  assert.equal(p.coins, 0)
  assert.deepEqual(p.maps, {}, 'no map visited yet')
  assert.equal(p.createdAt, 5)
})

test('saves from the old game, or junk, become fresh profiles', () => {
  const old = { id: 'a', name: 'A', rebirths: 9, wins: 1e9, health: 5, ownedTires: ['x'], stats: { totalWins: 5 } }
  for (const raw of [null, undefined, 'nope', 42, [], old]) {
    const p = normalizeProfile(raw, 'a', 'A')
    assert.equal(p.coins, 0)
    assert.equal(p.version, 2)
    assert.equal('rebirths' in p, false)
  }
})

test('a current save is repaired field by field', () => {
  const raw = {
    ...createProfile('a', 'A'),
    coins: -50,
    cars: ['seajet', 'seajet', 'nonsense', 7],
    car: 'diver',
    slots: 99,
    checkpoint: 500,
    best: { checkpoint: 'x', altitude: 123.5, finishMs: -1 },
    splits: { 1: 25000, 0: 5, 99: 100, foo: 3, 2: 'fast' },
    stats: { totalCoins: 12.7, finishes: NaN, playtime: 61.5 },
    pity: -3,
    settings: { music: false, sfx: 'yes' },
  }
  const p = normalizeProfile(raw, 'a', 'A')
  assert.equal(p.coins, 0)
  assert.deepEqual(p.cars, [STARTER_CAR, 'seajet'])
  assert.equal(p.car, STARTER_CAR, 'cannot have a car it does not own equipped')
  assert.equal(p.slots, 3)
  // The old top-level progress fields are Sky Docks progress, trimmed to the stage.
  const sky = progressFor(p, STAGE1)
  assert.equal(sky.checkpoint, LAST_CHECKPOINT)
  assert.deepEqual(sky.best, { checkpoint: 0, altitude: 123.5, finishMs: 0 })
  assert.deepEqual(sky.splits, { 1: 25000 })
  assert.equal(p.stats.totalCoins, 12)
  assert.equal(p.stats.finishes, 0)
  assert.equal(p.stats.playtime, 61.5)
  assert.equal(p.pity, 0)
  assert.deepEqual(p.settings, { music: false, sfx: true, ghost: true, sunset: true })
})

// --- Checkpoints ---------------------------------------------------------------------

test('checkpoints count in order, at the gate, and pay once per run', () => {
  const h = harness()
  h.moveTo(STAGE1.checkpoints[2])
  h.session.handle('checkpoint', { index: 2, splitMs: 1000 })
  assert.equal(h.progress.checkpoint, 0, 'cannot skip checkpoint 1')
  assert.equal(h.of('error').length, 1)

  h.session.handle('checkpoint', { index: 1, splitMs: 1000 })
  assert.equal(h.progress.checkpoint, 0, 'too far from gate 1')

  h.moveTo(STAGE1.checkpoints[1])
  h.session.handle('checkpoint', { index: 1, splitMs: 31000 })
  assert.equal(h.progress.checkpoint, 1)
  assert.equal(h.profile.coins, CHECKPOINT_COINS(1))
  assert.deepEqual(h.of('checkpoint')[0], { index: 1, coins: CHECKPOINT_COINS(1), splitMs: 31000, best: true, finish: false })
  assert.equal(h.progress.splits[1], 31000)
  assert.equal(h.progress.best.altitude, STAGE1.checkpoints[1].y)

  const errors = h.of('error').length
  h.session.handle('checkpoint', { index: 1, splitMs: 1000 })
  assert.equal(h.profile.coins, CHECKPOINT_COINS(1), 'crossing it again after a respawn pays nothing')
  assert.equal(h.of('error').length, errors, '...and is not an error')

  for (const bad of [0, -1, 1.5, 999, '2', null]) h.session.handle('checkpoint', { index: bad })
  assert.equal(h.progress.checkpoint, 1)
})

test('a restart starts the run over and pays checkpoints again; best splits stay the best', () => {
  const h = harness()
  reach(h, 2, 30000)
  h.session.handle('restart')
  assert.equal(h.progress.checkpoint, 0)
  reach(h, 1, 40000)
  assert.equal(h.profile.coins, CHECKPOINT_COINS(1) * 2 + CHECKPOINT_COINS(2))
  assert.equal(h.progress.splits[1], 30000, 'a slower split does not replace the best')
  assert.equal(h.of('checkpoint').at(-1).best, false)
})

test('reaching the summit pays the finish bonus and records the time', () => {
  const h = harness()
  reach(h, LAST_CHECKPOINT)
  const finish = h.of('checkpoint').at(-1)
  assert.equal(finish.finish, true)
  assert.equal(finish.totalMs, 300000)
  assert.equal(finish.coins, CHECKPOINT_COINS(LAST_CHECKPOINT) + FINISH_BONUS)
  assert.equal(h.profile.stats.finishes, 1)
  assert.equal(h.progress.best.finishMs, 300000)
  assert.equal(h.progress.best.checkpoint, LAST_CHECKPOINT)

  h.session.handle('restart')
  for (let i = 1; i < LAST_CHECKPOINT; i += 1) {
    h.moveTo(STAGE1.checkpoints[i])
    h.session.handle('checkpoint', { index: i })
  }
  h.moveTo(STAGE1.checkpoints[LAST_CHECKPOINT])
  h.session.handle('checkpoint', { index: LAST_CHECKPOINT, totalMs: 5 })
  assert.equal(h.of('checkpoint').at(-1).totalMs, MIN_FINISH_MS, 'impossible times are clamped')
  assert.equal(h.progress.best.finishMs, MIN_FINISH_MS)
  assert.equal(h.profile.stats.finishes, 2)
})

// --- Coins and tricks ----------------------------------------------------------------

test('a coin pays once per run, and only when you are at it', () => {
  const h = harness()
  const coin = STAGE1.coins[3]
  h.session.handle('coin', { id: coin.id })
  assert.equal(h.profile.coins, 0, 'too far away')
  h.moveTo({ x: coin.x + 3, y: coin.y, z: coin.z })
  h.session.handle('coin', { id: coin.id })
  h.session.handle('coin', { id: coin.id })
  assert.equal(h.profile.coins, 1)
  assert.deepEqual(h.of('reward'), [{ coins: 1, total: 1, reason: 'coin' }])
  h.session.handle('coin', { id: 'c999999' })
  h.session.handle('coin', { id: 5 })
  assert.equal(h.profile.coins, 1)
  h.session.handle('restart')
  h.session.handle('coin', { id: coin.id })
  assert.equal(h.profile.coins, 2, 'collectable again after a restart')
})

test('coins are rate limited, and refill over time', () => {
  const h = harness()
  // Teleporting from coin to coin: far faster than anyone drives.
  for (const coin of STAGE1.coins.slice(0, COIN_RATE + 10)) {
    h.moveTo(coin)
    h.session.handle('coin', { id: coin.id })
  }
  assert.equal(h.profile.coins, COIN_RATE)
  h.session.tick(1, 1000)
  const next = STAGE1.coins[COIN_RATE + 20]
  h.moveTo(next)
  h.session.handle('coin', { id: next.id })
  assert.equal(h.profile.coins, COIN_RATE + 1)
})

test('a resumed run cannot re-take the coins behind its checkpoint', () => {
  const p = createProfile('a', 'A')
  progressFor(p, STAGE1).checkpoint = 3
  const h = harness(p)
  const behind = STAGE1.coins.find((c) => c.section === 1)
  const ahead = STAGE1.coins.find((c) => c.section === 3)
  h.moveTo(behind)
  h.session.handle('coin', { id: behind.id })
  h.moveTo(ahead)
  h.session.handle('coin', { id: ahead.id })
  assert.equal(p.coins, 1)
})

test('tricks pay a coin per 100 points, capped per minute', () => {
  const h = harness()
  h.session.handle('trick', { kind: 'frontflip', score: 1250 })
  assert.equal(h.profile.coins, 12)
  assert.equal(h.profile.stats.tricks, 1)
  for (let i = 0; i < 20; i += 1) h.session.handle('trick', { kind: 'barrel', score: 1e9 })
  assert.equal(h.profile.coins, TRICK_COINS_PER_MIN, 'no more than the cap in a minute')
  h.session.tick(60, 60000)
  h.session.handle('trick', { kind: 'air', score: 300 })
  assert.equal(h.profile.coins, TRICK_COINS_PER_MIN + 3)
  h.session.handle('trick', { kind: 'air', score: -500 })
  h.session.handle('trick', { kind: 'air', score: 'lots' })
  assert.equal(h.profile.coins, TRICK_COINS_PER_MIN + 3)
})

test('small changes reach the client as a profile within a couple of seconds', () => {
  const h = harness()
  h.session.handle('fell')
  h.session.tick(1, 1000)
  assert.equal(h.of('profile').length, 0)
  h.session.tick(1.2, 2200)
  assert.equal(h.of('profile').length, 1)
  assert.equal(h.of('profile')[0].profile.stats.falls, 1)
  h.session.tick(5, 7200)
  assert.equal(h.of('profile').length, 1, 'nothing pending, nothing sent')
})

// --- Spins ---------------------------------------------------------------------------

test('a spin costs SPIN_COST, and is refused without the coins', () => {
  const h = harness()
  h.profile.coins = SPIN_COST - 1
  h.session.handle('spin')
  assert.deepEqual(h.of('error'), [{ text: `A spin costs ${SPIN_COST} coins`, type: 'spin' }])
  h.profile.coins = SPIN_COST
  h.session.handle('spin')
  const [spin] = h.of('spin')
  assert.ok(CARS.some((c) => c.id === spin.carId && c.rarity === spin.rarity))
  assert.equal(h.profile.stats.spins, 1)
  assert.equal(h.profile.coins, spin.refund)
})

test('spin odds follow the rarity weights', () => {
  const rand = mulberry32(7)
  const counts = Object.fromEntries(RARITIES.map((r) => [r, 0]))
  const n = 40000
  for (let i = 0; i < n; i += 1) {
    const p = createProfile('a', 'A')
    counts[rollSpin(p, rand).rarity] += 1
  }
  const total = RARITIES.reduce((s, r) => s + RARITY_INFO[r].weight, 0)
  for (const r of RARITIES) {
    const expected = RARITY_INFO[r].weight / total
    assert.ok(Math.abs(counts[r] / n - expected) < 0.01 + expected * 0.15, `${r}: ${counts[r] / n} vs ${expected}`)
  }
})

test('the car catalog: 44 cars over every rarity, the original 14 kept, old and new saves load', () => {
  const ORIGINAL = ['buggy', 'hatch', 'pickup', 'van', 'forklift', 'wheelboat', 'tug', 'rally', 'monster', 'hauler', 'seajet', 'crab', 'lighthouse', 'diver']
  assert.equal(CARS.length, 44)
  assert.equal(new Set(CARS.map((c) => c.id)).size, CARS.length, 'unique ids')
  assert.deepEqual(CARS.slice(0, 14).map((c) => c.id), ORIGINAL, 'old ids stay first, in order')
  assert.equal(STARTER_CAR, 'buggy')
  const per = Object.fromEntries(RARITIES.map((r) => [r, CARS.filter((c) => c.rarity === r).length]))
  assert.deepEqual(per, { common: 10, rare: 10, epic: 11, legendary: 7, mythic: 6 })
  for (const c of CARS) {
    assert.ok(RARITIES.includes(c.rarity), c.id)
    assert.ok(c.name && c.kind && c.blurb && c.colors.body && c.colors.trim && c.colors.glass, c.id)
    for (const k of ['speed', 'accel', 'handling', 'weight', 'nitro', 'boost']) {
      assert.ok(c.stats[k] >= 60 && c.stats[k] <= 140, `${c.id}.${k}`)
    }
  }
  // An old save (original cars only) and one holding new cars both normalise unchanged.
  const old = normalizeProfile({ ...createProfile('a', 'A'), cars: ['buggy', 'monster', 'diver'], car: 'monster' }, 'a', 'A')
  assert.deepEqual(old.cars, ['buggy', 'monster', 'diver'])
  assert.equal(old.car, 'monster')
  const fresh = normalizeProfile({ ...createProfile('a', 'A'), cars: ['buggy', 'kraken', 'tuktuk', 'limo'], car: 'kraken' }, 'a', 'A')
  assert.deepEqual(fresh.cars, ['buggy', 'kraken', 'tuktuk', 'limo'])
  assert.equal(fresh.car, 'kraken')
  // The sports-car wave: appended after the first 30 (ids are saved), each stat inside its rarity's range.
  assert.deepEqual(CARS.slice(30).map((c) => c.id), ['squall', 'thunderhead', 'tidecutter', 'spindrift', 'meridian', 'razorline', 'aetherwing', 'lumen', 'ridgeback', 'pebble', 'longroof', 'palmcruiser', 'slidewinder', 'roamer'])
  const wave = normalizeProfile({ ...createProfile('a', 'A'), cars: ['buggy', 'aetherwing', 'lumen'], car: 'lumen' }, 'a', 'A')
  assert.deepEqual(wave.cars, ['buggy', 'aetherwing', 'lumen'])
  for (const c of CARS.slice(30)) {
    const peers = CARS.slice(0, 30).filter((p) => p.rarity === c.rarity)
    for (const k of ['speed', 'accel', 'handling', 'weight', 'nitro', 'boost']) {
      const lo = Math.min(...peers.map((p) => p.stats[k]))
      const hi = Math.max(...peers.map((p) => p.stats[k]))
      assert.ok(c.stats[k] >= lo - 2 && c.stats[k] <= hi + 2, `${c.id}.${k} ${c.stats[k]} outside ${c.rarity} ${lo}-${hi}`)
    }
  }
  // Every car can come out of a spin: the draw within a rarity is uniform over its pool.
  const seen = new Set()
  const rand = mulberry32(3)
  for (let i = 0; i < 30000 && seen.size < CARS.length; i += 1) seen.add(rollSpin(createProfile('a', 'A'), rand).carId)
  assert.equal(seen.size, CARS.length)
})

test('pity guarantees a Legendary or better within PITY_SPINS spins', () => {
  // A rand that always lands on Common.
  const p = createProfile('a', 'A')
  let best = 'common'
  for (let i = 0; i < PITY_SPINS; i += 1) {
    const r = rollSpin(p, () => 0)
    if (i < PITY_SPINS - 1) assert.equal(r.rarity, 'common')
    best = r.rarity
  }
  assert.ok(['legendary', 'mythic'].includes(best))
  assert.equal(p.pity, 0, 'and the counter starts again')
})

test('a duplicate car pays its refund; a new one joins the garage and can be equipped', () => {
  const p = createProfile('a', 'A')
  const first = rollSpin(p, () => 0)
  assert.equal(first.isNew, first.carId !== STARTER_CAR)
  const again = rollSpin(p, () => 0)
  assert.equal(again.isNew, false)
  assert.equal(again.refund, DUPLICATE_REFUND[again.rarity])

  const h = harness(p)
  h.session.handle('equipCar', { id: 'diver' })
  assert.equal(h.of('error')[0].type, 'equipCar')
  h.session.handle('equipCar', { id: first.carId })
  assert.equal(p.car, first.carId)
})

test('the Mega Spin costs coins and lands Epic or better', () => {
  const mega = PRODUCTS.find((x) => x.id === 'mega_spin')
  const h = harness(createProfile('a', 'A'), { rand: () => 0 })
  h.session.handle('purchase', { productId: 'mega_spin' })
  assert.equal(h.of('error')[0].type, 'purchase')
  h.profile.coins = mega.price
  h.session.handle('purchase', { productId: 'mega_spin' })
  assert.equal(h.of('spin')[0].rarity, 'epic')
  h.session.handle('purchase', { productId: 'coins_big' })
  assert.match(h.of('error').at(-1).text, /Not enough pearls/, 'pearl products cannot be bought with coins')
  assert.equal(h.profile.coins, 0)
  h.session.handle('purchase', { productId: 'nope' })
  assert.equal(h.of('error').at(-1).text, 'Unknown product')
  h.session.handle('purchase', { productId: 'constructor' })
  assert.equal(h.of('error').at(-1).text, 'Unknown product')
})

// --- Slots, settings, grants ---------------------------------------------------------

test('item slots cost SLOT_COSTS and stop at 3', () => {
  const h = harness()
  h.profile.coins = SLOT_COSTS[2] - 1
  h.session.handle('unlockSlot')
  assert.equal(h.profile.slots, 1)
  h.profile.coins = SLOT_COSTS[2] + SLOT_COSTS[3]
  h.session.handle('unlockSlot')
  h.session.handle('unlockSlot')
  assert.equal(h.profile.slots, 3)
  assert.equal(h.profile.coins, 0)
  h.profile.coins = 1e6
  h.session.handle('unlockSlot')
  assert.equal(h.profile.slots, 3)
  assert.equal(h.of('error').at(-1).text, 'All item slots are open')
})

test('settings take booleans for known keys only', () => {
  const h = harness()
  h.session.handle('setting', { key: 'music', value: false })
  h.session.handle('setting', { key: 'music', value: 'on' })
  h.session.handle('setting', { key: 'coins', value: true })
  assert.deepEqual(h.profile.settings, { music: false, sfx: true, ghost: true, sunset: true })
})

test('the free-spin ad spins once per cooldown', () => {
  const h = harness()
  const placement = 'free-spin'
  const now = Date.UTC(2026, 10, 23)
  h.session.grantAdReward(placement, now)
  h.session.grantAdReward(placement, now + 1000)
  assert.equal(h.of('spin').length, 1)
  h.session.grantAdReward(placement, now + AD_REWARDS[placement].cooldownMs)
  assert.equal(h.of('spin').length, 2)
  assert.equal(h.profile.coins, h.of('spin').reduce((s, x) => s + x.refund, 0), 'free: no coins taken')
})

// --- Movement checks (server) --------------------------------------------------------

test('position reports: a car can be fast, but not that fast, unless it respawned', () => {
  const at = { x: 0, y: 2, z: 0 }
  const S = STAGE1
  assert.equal(acceptMove(at, { x: 0, y: 2, z: -9 }, 0.1, S), true, '90 m/s with slack')
  assert.equal(acceptMove(at, { x: 30, y: 2, z: -30 }, 0.1, S), false)
  assert.equal(acceptMove(at, { x: 30, y: 2, z: -30 }, 0.4, S), true)
  const cp = STAGE1.checkpoints[7].respawn
  assert.equal(acceptMove(at, cp, 0.1, S), true, 'respawn at a checkpoint')
  assert.equal(acceptMove({ x: 500, y: 200, z: -800 }, SPAWN, 0.1, S), true, 'back to the lobby')
  assert.equal(isTeleportPoint({ x: cp.x + 20, y: cp.y, z: cp.z }, S), false)
  assert.equal(clampY(9999, S), maxY(S))
  // Above the summit (cars up there must not be clamped down to a lower height).
  assert.ok(maxY(S) > Math.max(...STAGE1.path.map((p) => p.y)) + 100)
  assert.equal(clampY(-9999, S), -60)
})

// --- Adventure: Sky Pearls and treasure chests ----------------------------------------

test('every road has one Sky Pearl and one chest, and the stunt ramps are colliders', () => {
  const sections = STAGE1.sections.length - 1 // the summit plaza has none
  assert.equal(STAGE1.pearls.length, sections)
  assert.equal(new Set(STAGE1.pearls.map((p) => p.index)).size, sections)
  assert.equal(STAGE1.chests.length, sections)
  assert.ok(STAGE1.ramps.length >= 5)
  // Each ramp is a kicker plus a landing slope behind it.
  assert.equal(STAGE1.boxes.filter((b) => b.kind === 'ramp').length, STAGE1.ramps.length * 2)
})

test('a Sky Pearl pays once, only up close, and the whole set pays a bonus', () => {
  const h = harness()
  const [first, ...rest] = STAGE1.pearls
  h.moveTo({ x: first.x + 40, y: first.y, z: first.z })
  h.session.handle('pearl', { index: first.index })
  assert.equal(h.progress.pearls, 0, 'too far away')
  h.moveTo(first)
  h.session.handle('pearl', { index: first.index })
  h.session.handle('pearl', { index: first.index })
  assert.equal(h.of('pearl').length, 1, 'once only')
  assert.equal(h.of('pearl')[0].found, 1)
  assert.equal(h.profile.coins, 150)
  for (const p of rest) {
    h.moveTo(p)
    h.session.handle('pearl', { index: p.index })
  }
  const last = h.of('pearl').at(-1)
  assert.equal(last.complete, true)
  assert.equal(last.found, STAGE1.pearls.length)
  assert.equal(h.profile.coins, 150 * STAGE1.pearls.length + 3000)
  // Survives a save round trip, junk bits stripped.
  const raw = JSON.parse(JSON.stringify(h.profile))
  raw.maps['sky-docks'].pearls |= 1 << 30
  const saved = normalizeProfile(raw, 'p1', 'Pat')
  assert.equal(progressFor(saved, STAGE1).pearls, h.progress.pearls)
})

test('a treasure chest pays once per run', () => {
  const h = harness()
  const chest = STAGE1.chests[0]
  h.moveTo(chest)
  h.session.handle('chest', { id: chest.id })
  h.session.handle('chest', { id: chest.id })
  assert.equal(h.profile.coins, 40)
  h.session.handle('restart')
  h.session.handle('chest', { id: chest.id })
  assert.equal(h.profile.coins, 80)
  h.session.handle('chest', { id: 'nope' })
  assert.equal(h.profile.coins, 80)
})

test('paints and nitro colours: bought with coins, put on, kept, never doubled', () => {
  const h = harness()
  assert.deepEqual([h.profile.paints, h.profile.paint, h.profile.nitros, h.profile.nitro], [['stock'], 'stock', ['classic'], 'classic'])
  const cherry = PAINT_BY_ID.cherry
  h.profile.coins = cherry.price - 1
  h.session.handle('buyCosmetic', { kind: 'paint', id: 'cherry' })
  assert.equal(h.profile.paint, 'stock')
  assert.match(h.of('error').at(-1).text, /costs/)
  h.profile.coins = cherry.price + NITRO_BY_ID.rainbow.price
  h.session.handle('buyCosmetic', { kind: 'paint', id: 'cherry' })
  h.session.handle('buyCosmetic', { kind: 'nitro', id: 'rainbow' })
  assert.deepEqual([h.profile.paint, h.profile.nitro, h.profile.coins], ['cherry', 'rainbow', 0])
  // Owned ones go back on for free; unknown or unowned ones are refused.
  h.profile.coins = 1e6
  h.session.handle('buyCosmetic', { kind: 'paint', id: 'cherry' })
  assert.equal(h.profile.coins, 1e6)
  h.session.handle('equipCosmetic', { kind: 'paint', id: 'stock' })
  assert.equal(h.profile.paint, 'stock')
  h.session.handle('equipCosmetic', { kind: 'paint', id: 'gold' })
  h.session.handle('equipCosmetic', { kind: 'hat', id: 'cherry' })
  h.session.handle('buyCosmetic', { kind: 'paint', id: 'plaid' })
  assert.equal(h.profile.paint, 'stock')
  assert.deepEqual(h.profile.paints, ['stock', 'cherry'])
  // Saves are repaired: junk dropped, the free ones always there, equipped must be owned.
  const p = normalizeProfile({ ...createProfile('x', 'X'), paints: ['cherry', 'plaid', 7], paint: 'gold', nitros: 'lots', nitro: 'rainbow' }, 'x', 'X')
  assert.deepEqual([p.paints, p.paint, p.nitros, p.nitro], [['stock', 'cherry'], 'stock', ['classic'], 'classic'])
})

test('a paid spin that lands on a car you have gives back at least what it cost', () => {
  const p = createProfile('dup', 'Dup')
  // Own every car, so every spin is a duplicate.
  p.cars = CARS.map((c) => c.id)
  const h = harness(p)
  p.coins = SPIN_COST
  h.session.handle('spin')
  const [spin] = h.of('spin')
  assert.equal(spin.isNew, false)
  assert.equal(spin.refund, Math.max(SPIN_COST, DUPLICATE_REFUND[spin.rarity]))
  assert.ok(p.coins >= SPIN_COST, 'a normal spin on a duplicate costs nothing')
  // The Mega Spin (Epic or better): its price back, or more for a Legendary/Mythic refund.
  const mega = PRODUCTS.find((x) => x.id === 'mega_spin')
  p.coins = mega.price
  h.session.handle('purchase', { productId: 'mega_spin' })
  const megaSpin = h.of('spin').at(-1)
  assert.equal(megaSpin.refund, Math.max(mega.price, DUPLICATE_REFUND[megaSpin.rarity]))
  assert.ok(p.coins >= mega.price)
  // A free spin (no price) still pays just the rarity refund.
  const free = rollSpin(p, () => 0)
  assert.equal(free.refund, DUPLICATE_REFUND[free.rarity])
})
