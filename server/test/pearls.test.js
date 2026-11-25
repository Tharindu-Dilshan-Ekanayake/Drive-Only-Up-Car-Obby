import assert from 'node:assert/strict'
import { test } from 'node:test'

import { MAX_SLOTS, PEARL_COINS, PRODUCT_BY_ID, PRODUCTS } from '../../shared/balance.js'
import { createProfile, foundPearls, normalizeProfile, PROFILE_VERSION, toSaveData } from '../../shared/logic.js'
import { PlayerSession } from '../../shared/session.js'
import { getStage, loadAllStages, loadStage, STAGE_IDS } from '../../shared/stages/index.js'

await loadAllStages()
const STAGE1 = await loadStage('sky-docks')

/** A session on Sky Docks standing wherever it is told to, with every event recorded. */
function harness(profile = createProfile('p1', 'Pat')) {
  const events = []
  const pos = { x: 0, y: 0, z: 0 }
  const session = new PlayerSession(profile, { now: 0, emit: (type, payload) => events.push({ type, payload }), getPosition: () => pos, stage: STAGE1 })
  const of = (type) => events.filter((e) => e.type === type).map((e) => e.payload)
  const findPearl = (pearl) => {
    Object.assign(pos, { x: pearl.x, y: pearl.y, z: pearl.z })
    session.handle('pearl', { index: pearl.index })
  }
  return { profile, session, events, of, findPearl }
}

const pearlProducts = PRODUCTS.filter((p) => p.kind === 'pearls')

// --- Economy ----------------------------------------------------------------------------

test('the four former Gems products are pearl-priced and Gems are gone from the catalog', () => {
  assert.deepEqual(pearlProducts.map((p) => p.id).sort(), ['coins_big', 'coins_medium', 'coins_small', 'slot_pass'])
  assert.equal(PRODUCTS.some((p) => p.kind === 'gems' || /gem/i.test(p.priceLabel)), false)
  for (const p of pearlProducts) {
    assert.ok(Number.isInteger(p.price) && p.price > 0, `${p.id} price`)
    assert.equal(p.priceLabel, `${p.price} Pearls`)
  }
})

test('prices fit the pearls that exist: every product affordable, the biggest a large share', () => {
  const total = STAGE_IDS.reduce((sum, id) => sum + getStage(id).pearls.length, 0)
  assert.equal(total, 68, 'update shared/balance.js price notes if maps gain or lose pearls')
  const price = (id) => PRODUCT_BY_ID[id].price
  assert.ok(price('coins_small') <= getStage('heat-run').pearls.length, 'cheapest pack: within reach on the smallest map')
  assert.ok(price('coins_medium') <= getStage('sky-docks').pearls.length, 'a map is enough for the mid pack')
  assert.ok(price('coins_big') <= total * 0.8 && price('coins_big') >= total * 0.6, 'the big pack takes a large share of all pearls')
  assert.ok(price('coins_small') + price('slot_pass') + price('coins_medium') + price('coins_big') > total, 'not everything at once')
})

// --- The bank -------------------------------------------------------------------------

test('a new profile has an empty bank', () => {
  assert.equal(createProfile('a', 'A').pearlBank, 0)
})

test('the bank gains one pearl the first time each is found, never again', () => {
  const h = harness()
  const [a, b] = STAGE1.pearls
  h.findPearl(a)
  assert.equal(h.profile.pearlBank, 1)
  assert.equal(h.profile.coins, PEARL_COINS, 'the pearl still pays its coins')
  assert.equal(h.of('pearl')[0].bank, 1)
  h.findPearl(a)
  h.findPearl(a)
  assert.equal(h.profile.pearlBank, 1, 'found again: nothing')
  assert.equal(h.profile.coins, PEARL_COINS)
  h.findPearl(b)
  assert.equal(h.profile.pearlBank, 2)
  assert.equal(foundPearls(h.profile), 2, 'and the collection still counts them')
  // Spending doesn't un-find a pearl, and finding it again doesn't refill the bank.
  h.profile.pearlBank = 0
  h.findPearl(a)
  assert.equal(h.profile.pearlBank, 0)
})

test('a pearl out of reach counts for nothing', () => {
  const h = harness()
  h.session.handle('pearl', { index: STAGE1.pearls[0].index })
  assert.equal(h.profile.pearlBank, 0)
})

test('an old save (no bank) starts with every pearl found so far, on all maps, once', () => {
  const sky = STAGE1.pearls.slice(0, 5).reduce((m, p) => m | (1 << p.index), 0)
  const tour = getStage('grand-tour').pearls.slice(0, 3).reduce((m, p) => m | (1 << p.index), 0)
  const old = { ...toSaveData(createProfile('a', 'A')), maps: { 'sky-docks': { pearls: sky }, 'grand-tour': { pearls: tour } } }
  delete old.pearlBank
  const p = normalizeProfile(old, 'a', 'A')
  assert.equal(p.pearlBank, 8)
  assert.equal(normalizeProfile(toSaveData(p), 'a', 'A').pearlBank, 8, 'idempotent: saving and loading again changes nothing')
  // Spend some; a later load keeps the spent bank instead of refilling it.
  p.pearlBank = 3
  assert.equal(normalizeProfile(JSON.parse(JSON.stringify(toSaveData(p))), 'a', 'A').pearlBank, 3)
})

test('the very old top-level Sky Docks pearls (before maps) migrate too', () => {
  const legacy = { version: PROFILE_VERSION, coins: 10, pearls: 0b10110 }
  assert.equal(normalizeProfile(legacy, 'a', 'A').pearlBank, 3)
})

test('a save with no pearls, or from another game, starts at 0', () => {
  assert.equal(normalizeProfile({ version: PROFILE_VERSION }, 'a', 'A').pearlBank, 0)
  assert.equal(normalizeProfile(null, 'a', 'A').pearlBank, 0)
  assert.equal(normalizeProfile({ version: 1, pearls: 7 }, 'a', 'A').pearlBank, 0)
})

test('a tampered bank is repaired: whole, never negative, never above the pearls found', () => {
  const raw = (bank, pearls = 0b111) => ({ version: PROFILE_VERSION, maps: { 'sky-docks': { pearls } }, pearlBank: bank })
  assert.equal(normalizeProfile(raw(999), 'a', 'A').pearlBank, 3)
  assert.equal(normalizeProfile(raw(-5), 'a', 'A').pearlBank, 0)
  assert.equal(normalizeProfile(raw(2.9), 'a', 'A').pearlBank, 2)
  assert.equal(normalizeProfile(raw(Infinity), 'a', 'A').pearlBank, 3)
  assert.equal(normalizeProfile(raw('lots'), 'a', 'A').pearlBank, 3, 'junk counts as "no bank yet"')
  assert.equal(normalizeProfile(raw(5, 0), 'a', 'A').pearlBank, 0)
})

// --- Buying ---------------------------------------------------------------------------

test('each pearl product pays for itself in pearls and refuses without enough', () => {
  for (const product of pearlProducts.filter((p) => p.id !== 'slot_pass')) {
    const h = harness()
    h.profile.pearlBank = product.price - 1
    h.session.handle('purchase', { productId: product.id })
    assert.equal(h.of('error').at(-1).type, 'purchase', `${product.id}: refused one pearl short`)
    assert.match(h.of('error').at(-1).text, /Not enough pearls/)
    assert.equal(h.profile.pearlBank, product.price - 1, 'nothing taken')
    assert.equal(h.profile.coins, 0)

    h.profile.pearlBank = product.price + 2
    h.session.handle('purchase', { productId: product.id })
    assert.equal(h.profile.pearlBank, 2, `${product.id}: price deducted`)
    assert.equal(h.profile.coins, product.coins, `${product.id}: coins granted`)
    assert.equal(h.profile.stats.totalCoins, 0, 'not counted as coins earned (the leaderboard)')
    assert.deepEqual(h.of('purchased').at(-1), { productId: product.id, name: product.name, pearls: product.price, coins: product.coins, slots: undefined })
    assert.equal(h.of('profile').at(-1).profile.pearlBank, 2, 'the new balance is synced')
  }
})

test('the item slot opens the next slot for pearls; with every slot open it is refused and free', () => {
  const slot = PRODUCT_BY_ID.slot_pass
  const h = harness()
  h.profile.pearlBank = slot.price * 3
  h.session.handle('purchase', { productId: 'slot_pass' })
  assert.equal(h.profile.slots, 2)
  h.session.handle('purchase', { productId: 'slot_pass' })
  assert.equal(h.profile.slots, MAX_SLOTS)
  assert.equal(h.profile.pearlBank, slot.price, 'two paid, one left')
  h.session.handle('purchase', { productId: 'slot_pass' })
  assert.equal(h.profile.slots, MAX_SLOTS)
  assert.equal(h.profile.pearlBank, slot.price, 'refused: no pearls taken')
  assert.equal(h.profile.coins, 0, 'and no refund-coins either')
  assert.equal(h.of('error').at(-1).text, 'All item slots are open')
})

test('the item slot refuses without enough pearls', () => {
  const h = harness()
  h.profile.pearlBank = PRODUCT_BY_ID.slot_pass.price - 1
  h.session.handle('purchase', { productId: 'slot_pass' })
  assert.equal(h.profile.slots, 1)
  assert.equal(h.of('error').at(-1).type, 'purchase')
})

test('buying twice in a row can only spend the bank once (no double spend)', () => {
  const h = harness()
  const product = PRODUCT_BY_ID.coins_small
  h.profile.pearlBank = product.price
  for (let i = 0; i < 5; i += 1) h.session.handle('purchase', { productId: 'coins_small' })
  assert.equal(h.profile.coins, product.coins, 'one pack, not five')
  assert.equal(h.profile.pearlBank, 0)
  assert.equal(h.of('error').length, 4)
})

test('coins cannot buy a pearl product and pearls cannot buy a coin product', () => {
  const h = harness()
  h.profile.coins = 1e6
  h.session.handle('purchase', { productId: 'coins_small' })
  assert.equal(h.profile.coins, 1e6, 'coins untouched: it costs pearls')
  assert.equal(h.of('error').at(-1).type, 'purchase')
  const h2 = harness()
  h2.profile.pearlBank = 100
  h2.session.handle('purchase', { productId: 'mega_spin' })
  assert.equal(h2.profile.pearlBank, 100, 'the Mega Spin costs coins')
})

test('a broken bank (NaN, negative) buys nothing', () => {
  for (const bad of [NaN, -3, undefined, '9']) {
    const h = harness()
    h.profile.pearlBank = bad
    h.session.handle('purchase', { productId: 'coins_small' })
    assert.equal(h.profile.coins, 0, `bank ${String(bad)}`)
  }
})
