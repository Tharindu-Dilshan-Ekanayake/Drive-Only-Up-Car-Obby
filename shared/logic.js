/**
 * Up We Drive's rules as pure functions over a profile: creating and repairing saves,
 * checkpoints, coins, tricks, car spins, slots and store grants. No I/O, no clocks of
 * their own (callers pass `now` and `rand`), so the server, the offline stand-in and
 * the tests all run exactly the same code.
 *
 * Functions that can fail return `{ ok: false, error }` with a message fit to show the
 * player; successful ones return `{ ok: true, ... }` and change the profile in place.
 */

import {
  AD_REWARDS,
  CHECKPOINT_COINS,
  COIN_VALUE,
  DUPLICATE_REFUND,
  FINISH_BONUS,
  MAX_SLOTS,
  MAX_TRICK_SCORE,
  MIN_FINISH_MS,
  PITY_SPINS,
  PRODUCT_BY_ID,
  SLOT_COSTS,
  SPIN_COST,
  TRICK_POINTS_PER_COIN,
  CHEST_COINS,
  PEARL_COINS,
  PEARL_SET_BONUS,
} from './balance.js'
import { CAR_BY_ID, CARS, RARITIES, RARITY_INFO, STARTER_CAR } from './cars.js'
import { COSMETIC_KINDS, DEFAULT_NITRO, DEFAULT_PAINT } from './cosmetics.js'
import { DEFAULT_STAGE, STAGE_IDS, STAGES, stageInfo } from './stages/index.js'

/**
 * Still 2: per-map progress (`maps`) came in without a version bump. A save without
 * `maps` (or a newer save read by an older server, which ignores `maps`) keeps working:
 * the old top-level `checkpoint / best / splits / pearls` are Sky Docks progress, and
 * every save written now carries them too (toSaveData).
 */
export const PROFILE_VERSION = 2

/** A stage's last checkpoint index: reaching it is the finish. */
export const lastCheckpoint = (stage) => stage.checkpoints.length - 1

/**
 * Bounds a save is repaired to before its map is known (normalizeProgress); fitProgress
 * then trims to the actual stage. Sky Pearls are one bit per section (<= 31 roads).
 */
const MAX_CHECKPOINTS = 63
const MAX_PEARL_BITS = 0x7fffffff

const SETTINGS_DEFAULTS = { music: true, sfx: true, ghost: true, sunset: true }

export function createProfile(id, name, now = Date.now()) {
  return {
    id: String(id),
    name: String(name || 'Player'),
    version: PROFILE_VERSION,
    coins: 0,
    cars: [STARTER_CAR],
    car: STARTER_CAR,
    slots: 1,
    /** Spendable Sky Pearls: +1 per pearl found the first time, spent in the store (buyProduct). */
    pearlBank: 0,
    /** Store cosmetics: owned paints / nitro colours and the equipped ones (shared/cosmetics.js). */
    paints: [DEFAULT_PAINT],
    paint: DEFAULT_PAINT,
    nitros: [DEFAULT_NITRO],
    nitro: DEFAULT_NITRO,
    /** Progress per map: stage id -> emptyProgress(), made on first visit (progressFor). */
    maps: {},
    /** Locked maps (chapters) opened for good: stage ids (isStageUnlocked). */
    unlocks: [],
    stats: { totalCoins: 0, finishes: 0, tricks: 0, spins: 0, falls: 0, playtime: 0 },
    pity: 0,
    settings: { ...SETTINGS_DEFAULTS },
    createdAt: now,
    lastSeen: now,
  }
}

const wholeAtLeast0 = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0)
const at0 = (v) => (Number.isFinite(v) && v > 0 ? v : 0)
const clampInt = (v, lo, hi, fallback) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.floor(v))) : fallback)

// --- Progress per map ------------------------------------------------------------------

/**
 * One map's progress: the run's `checkpoint` (0 = not started / back in the lobby), your
 * `best` there, best `splits` per checkpoint (ms) and the Sky Pearls found (a bit per
 * section, shared/adventure.js).
 */
export const emptyProgress = () => ({ checkpoint: 0, best: { checkpoint: 0, altitude: 0, finishMs: 0 }, splits: {}, pearls: 0 })

/** How many Sky Pearls a pearl bitmask holds (every bit is one pearl). */
function popcount(bits) {
  let n = 0
  for (let m = bits; m; m &= m - 1) n += 1
  return n
}

/** Every Sky Pearl `profile` has found, on all maps (its bank can never hold more). */
export const foundPearls = (profile) => Object.values(profile?.maps || {}).reduce((sum, p) => sum + popcount((p?.pearls || 0) & MAX_PEARL_BITS), 0)

/** Read-only stand-in for a map not visited yet (never mutate it). */
export const NO_PROGRESS = Object.freeze({
  checkpoint: 0,
  best: Object.freeze({ checkpoint: 0, altitude: 0, finishMs: 0 }),
  splits: Object.freeze({}),
  pearls: 0,
})

/** Map `stageId`'s progress in `profile`, or NO_PROGRESS (for reading: the UI). */
export const progressOf = (profile, stageId) => profile?.maps?.[stageId] || NO_PROGRESS

/** A progress record from whatever was stored, repaired to generic bounds. */
function normalizeProgress(raw) {
  const p = emptyProgress()
  if (!raw || typeof raw !== 'object') return p
  p.checkpoint = clampInt(raw.checkpoint, 0, MAX_CHECKPOINTS, 0)
  const best = raw.best && typeof raw.best === 'object' ? raw.best : {}
  p.best = {
    checkpoint: clampInt(best.checkpoint, 0, MAX_CHECKPOINTS, 0),
    altitude: at0(best.altitude),
    finishMs: wholeAtLeast0(best.finishMs),
  }
  if (raw.splits && typeof raw.splits === 'object') {
    for (const [key, ms] of Object.entries(raw.splits)) {
      const index = Number(key)
      if (Number.isInteger(index) && index >= 1 && index <= MAX_CHECKPOINTS && Number.isFinite(ms) && ms > 0) p.splits[index] = Math.round(ms)
    }
  }
  p.pearls = clampInt(raw.pearls, 0, MAX_PEARL_BITS, 0) & MAX_PEARL_BITS
  return p
}

/** The old (pre-`maps`) top-level Sky Docks fields. */
const LEGACY_KEYS = ['checkpoint', 'best', 'splits', 'pearls']
const hasLegacyProgress = (raw) => LEGACY_KEYS.some((k) => raw[k] !== undefined)

/**
 * Sky Docks progress from a save's `maps['sky-docks']` and its top-level fields. The
 * top-level ones are the newer whenever they differ (an older server, which only knows
 * those, played the save last), so the run's checkpoint comes from them; the bests are
 * merged, so nothing is lost either way.
 */
function mergeProgress(mapped, legacy) {
  if (!mapped) return legacy
  const out = emptyProgress()
  out.checkpoint = legacy.checkpoint
  out.best.checkpoint = Math.max(mapped.best.checkpoint, legacy.best.checkpoint)
  out.best.altitude = Math.max(mapped.best.altitude, legacy.best.altitude)
  const times = [mapped.best.finishMs, legacy.best.finishMs].filter((t) => t > 0)
  out.best.finishMs = times.length ? Math.min(...times) : 0
  for (const src of [mapped.splits, legacy.splits]) {
    for (const [cp, ms] of Object.entries(src)) if (!out.splits[cp] || ms < out.splits[cp]) out.splits[cp] = ms
  }
  out.pearls = mapped.pearls | legacy.pearls
  return out
}

/** Per-stage lookups (coins, pearls, chests by id; all its pearl bits), once per stage. */
const lookups = new WeakMap()
export function stageLookups(stage) {
  let l = lookups.get(stage)
  if (!l) {
    l = {
      coinById: new Map(stage.coins.map((c) => [c.id, c])),
      pearlByIndex: new Map(stage.pearls.map((p) => [p.index, p])),
      chestById: new Map(stage.chests.map((c) => [c.id, c])),
      allPearls: stage.pearls.reduce((m, p) => m | (1 << p.index), 0),
    }
    lookups.set(stage, l)
  }
  return l
}

/** Trims a progress record to `stage` (the checkpoints and pearls it has). In place. */
export function fitProgress(progress, stage) {
  const last = lastCheckpoint(stage)
  progress.checkpoint = Math.min(progress.checkpoint, last)
  progress.best.checkpoint = Math.min(progress.best.checkpoint, last)
  for (const key of Object.keys(progress.splits)) if (Number(key) > last) delete progress.splits[key]
  progress.pearls &= stageLookups(stage).allPearls
  return progress
}

/** `profile`'s progress on `stage`, made on the first visit and trimmed to the stage. Mutable. */
export function progressFor(profile, stage) {
  profile.maps ||= {}
  profile.maps[stage.id] ||= emptyProgress()
  return fitProgress(profile.maps[stage.id], stage)
}

// --- Chapters: locked maps -------------------------------------------------------------

/**
 * May `profile` play map `stageId`? A map whose registry entry has `unlock: { finish: id }`
 * (the Grand Tour: Sky Docks) opens once that map has been finished - its best finish
 * time is set, which also counts a finish of an older, shorter version of it - and stays
 * open for good (`profile.unlocks`, recorded at the finish). Every other map (Sky Docks,
 * Heat Run) is always open; an unknown id never is. The one rule the server, the offline
 * stand-in and the client all check (shared/chapters.js has the wording).
 */
export function isStageUnlocked(profile, stageId) {
  const info = stageInfo(stageId)
  if (!info) return false
  const need = info.unlock?.finish
  if (!need) return true
  if (Array.isArray(profile?.unlocks) && profile.unlocks.includes(stageId)) return true
  return progressOf(profile, need).best.finishMs > 0
}

/**
 * Records, at a finish of `stage`, every map that finishing it opens (in `profile.unlocks`,
 * for good). Returns the ids that were still locked before - the "CHAPTER 2 UNLOCKED"
 * moment. Call before the finish time is stored (it decides what was locked).
 */
function unlockAfterFinish(profile, stage) {
  const opened = []
  for (const info of STAGES) {
    if (info.unlock?.finish !== stage.id) continue
    if (!isStageUnlocked(profile, info.id)) opened.push(info.id)
    profile.unlocks ||= []
    if (!profile.unlocks.includes(info.id)) profile.unlocks.push(info.id)
  }
  return opened
}

/** Highest altitude reached on any map (the global altitude board). */
export const bestAltitude = (profile) => Object.values(profile?.maps || {}).reduce((m, p) => Math.max(m, p?.best?.altitude || 0), 0)

/**
 * What goes into storage: the profile plus its Sky Docks progress mirrored at the top
 * level (the pre-`maps` layout), so a server or client still on the old code reads the
 * right Sky Docks progress from a new save.
 */
export function toSaveData(profile) {
  const sky = progressOf(profile, DEFAULT_STAGE)
  return { ...profile, checkpoint: sky.checkpoint, best: { ...sky.best }, splits: { ...sky.splits }, pearls: sky.pearls }
}

/**
 * A profile safe to play with, from whatever was stored: a current save repaired field
 * by field (junk becomes defaults, unknown cars are dropped), anything else - nothing
 * at all, or a save from the "+1 Arm Length" game this server used to run - a fresh one.
 */
export function normalizeProfile(raw, id, name, now = Date.now()) {
  const fresh = createProfile(id, name || raw?.name, now)
  if (!raw || typeof raw !== 'object' || raw.version !== PROFILE_VERSION) return fresh

  const p = fresh
  p.coins = wholeAtLeast0(raw.coins)
  const cars = Array.isArray(raw.cars) ? raw.cars.filter((c) => typeof c === 'string' && CAR_BY_ID[c]) : []
  p.cars = [...new Set([STARTER_CAR, ...cars])]
  p.car = p.cars.includes(raw.car) ? raw.car : STARTER_CAR
  p.slots = clampInt(raw.slots, 1, MAX_SLOTS, 1)
  for (const kind of Object.values(COSMETIC_KINDS)) {
    const owned = Array.isArray(raw[kind.owned]) ? raw[kind.owned].filter((c) => typeof c === 'string' && kind.byId[c]) : []
    p[kind.owned] = [...new Set([kind.fallback, ...owned])]
    p[kind.equipped] = p[kind.owned].includes(raw[kind.equipped]) ? raw[kind.equipped] : kind.fallback
  }
  // Progress per known map; the old top-level fields are Sky Docks progress.
  const maps = raw.maps && typeof raw.maps === 'object' && !Array.isArray(raw.maps) ? raw.maps : {}
  for (const id of STAGE_IDS) {
    let progress = maps[id] && typeof maps[id] === 'object' ? normalizeProgress(maps[id]) : null
    if (id === DEFAULT_STAGE && hasLegacyProgress(raw)) progress = mergeProgress(progress, normalizeProgress(raw))
    if (progress) p.maps[id] = progress
  }
  // Opened chapters: known map ids only, once each.
  if (Array.isArray(raw.unlocks)) p.unlocks = [...new Set(raw.unlocks.filter((id) => typeof id === 'string' && STAGE_IDS.includes(id)))]
  // The pearl bank. A save from before it existed has none: it starts with every pearl
  // found so far (once; after that the field is there). It can never exceed the pearls
  // found, which also keeps a tampered offline save in bounds.
  const found = foundPearls(p)
  p.pearlBank = Number.isFinite(raw.pearlBank) ? Math.min(wholeAtLeast0(raw.pearlBank), found) : found
  const stats = raw.stats && typeof raw.stats === 'object' ? raw.stats : {}
  for (const key of Object.keys(p.stats)) p.stats[key] = key === 'playtime' ? at0(stats[key]) : wholeAtLeast0(stats[key])
  p.pity = clampInt(raw.pity, 0, PITY_SPINS, 0)
  const settings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {}
  for (const key of Object.keys(SETTINGS_DEFAULTS)) if (typeof settings[key] === 'boolean') p.settings[key] = settings[key]
  if (Number.isFinite(raw.createdAt)) p.createdAt = raw.createdAt
  if (Number.isFinite(raw.lastSeen)) p.lastSeen = raw.lastSeen
  return p
}

/** Pays `amount` coins (whole, never negative); returns what was paid. */
export function addCoins(profile, amount) {
  const n = wholeAtLeast0(amount)
  profile.coins += n
  profile.stats.totalCoins += n
  return n
}

// --- Checkpoints ---------------------------------------------------------------------

/**
 * Checkpoint `index` of `stage` was reached. Only the next one counts (no skipping
 * ahead); the first time in a run it pays, records the split and lifts your bests on
 * that map. The last one is the finish: the summit bonus, your whole-stage time
 * (`totalMs`, never under MIN_FINISH_MS) and the maps it opens (`unlocked`: the ids that
 * were locked until now, isStageUnlocked).
 *
 * Crossing a checkpoint you already have (after a respawn) is not an error, just
 * nothing: `{ ok: false, quiet: true }`.
 */
export function reachCheckpoint(profile, stage, index, { splitMs, totalMs } = {}) {
  const last = lastCheckpoint(stage)
  if (!Number.isInteger(index) || index < 1 || index > last) return { ok: false, error: 'Unknown checkpoint' }
  const progress = progressFor(profile, stage)
  if (index <= progress.checkpoint) return { ok: false, quiet: true }
  if (index > progress.checkpoint + 1) return { ok: false, error: 'Missed a checkpoint' }

  progress.checkpoint = index
  const cp = stage.checkpoints[index]
  let coins = addCoins(profile, CHECKPOINT_COINS(index))
  progress.best.checkpoint = Math.max(progress.best.checkpoint, index)
  progress.best.altitude = Math.max(progress.best.altitude, cp.y)

  let best = false
  const split = Number.isFinite(splitMs) && splitMs > 0 ? Math.round(splitMs) : 0
  if (split && (!progress.splits[index] || split < progress.splits[index])) {
    progress.splits[index] = split
    best = true
  }

  const result = { ok: true, index, coins, splitMs: split, best, finish: false }
  if (cp.finish) {
    // Maps this finish opens (the next chapter), decided before the time is stored.
    result.unlocked = unlockAfterFinish(profile, stage)
    coins += addCoins(profile, FINISH_BONUS)
    profile.stats.finishes += 1
    const total = Number.isFinite(totalMs) ? Math.max(MIN_FINISH_MS, Math.round(totalMs)) : 0
    if (total && (!progress.best.finishMs || total < progress.best.finishMs)) progress.best.finishMs = total
    Object.assign(result, { coins, finish: true, totalMs: total })
  }
  return result
}

/** Back to the lobby: the run on `stage` starts again from the Start gate. */
export function restartRun(profile, stage) {
  progressFor(profile, stage).checkpoint = 0
}

// --- Coins and tricks ----------------------------------------------------------------

/** How many of `stage`'s Sky Pearls the bitmask `pearls` holds. */
export function countPearls(pearls, stage) {
  let n = 0
  for (let m = (pearls || 0) & stageLookups(stage).allPearls; m; m &= m - 1) n += 1
  return n
}

/**
 * Finds Sky Pearl `index` of `stage` (the caller has checked distance). The first time
 * it pays PEARL_COINS and adds one to the spendable pearl bank, plus PEARL_SET_BONUS for
 * the last one of that map's set.
 */
export function collectPearl(profile, stage, index) {
  if (!stageLookups(stage).pearlByIndex.has(index)) return { ok: false, quiet: true }
  const progress = progressFor(profile, stage)
  const bit = 1 << index
  if (progress.pearls & bit) return { ok: false, quiet: true }
  progress.pearls |= bit
  profile.pearlBank = wholeAtLeast0(profile.pearlBank) + 1
  let coins = addCoins(profile, PEARL_COINS)
  const found = countPearls(progress.pearls, stage)
  const total = stage.pearls.length
  const complete = found === total
  if (complete) coins += addCoins(profile, PEARL_SET_BONUS)
  return { ok: true, index, found, total, coins, complete, bank: profile.pearlBank }
}

/** Pays one treasure chest (the caller has checked distance and once-per-run). */
export const collectChest = (profile) => addCoins(profile, CHEST_COINS)

/** Pays one track coin (the caller has checked distance, once-per-run and rate). */
export const collectCoin = (profile) => addCoins(profile, COIN_VALUE)

/** Coins a trick of `score` points is worth before the per-minute cap. */
export const trickCoins = (score) => (Number.isFinite(score) && score > 0 ? Math.floor(Math.min(score, MAX_TRICK_SCORE) / TRICK_POINTS_PER_COIN) : 0)

// --- Car spins -----------------------------------------------------------------------

const PITY_RARITIES = ['legendary', 'mythic']

/** Picks a rarity by RARITY_INFO weight from those in `allowed`. */
function pickRarity(allowed, rand) {
  const total = allowed.reduce((sum, r) => sum + RARITY_INFO[r].weight, 0)
  let roll = rand() * total
  for (const r of allowed) {
    roll -= RARITY_INFO[r].weight
    if (roll < 0) return r
  }
  return allowed[allowed.length - 1]
}

/**
 * One car spin (already paid for). Rarity by weight, with pity: the PITY_SPINS-th spin
 * in a row without a Legendary or better is guaranteed one. `minRarity` limits the
 * draw to that rarity and up (the Mega Spin). A new car joins your garage; a car you
 * have pays back at least `paid` (what the spin cost; 0 for a free spin) or its
 * DUPLICATE_REFUND, whichever is more.
 *
 * @returns {{ ok: true, carId: string, rarity: string, isNew: boolean, refund: number }}
 */
export function rollSpin(profile, rand = Math.random, { minRarity = 'common', paid = 0 } = {}) {
  let allowed = RARITIES.slice(Math.max(0, RARITIES.indexOf(minRarity)))
  if (profile.pity + 1 >= PITY_SPINS) allowed = allowed.filter((r) => PITY_RARITIES.includes(r))
  const rarity = pickRarity(allowed, rand)
  const pool = CARS.filter((c) => c.rarity === rarity)
  const car = pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]

  profile.stats.spins += 1
  profile.pity = PITY_RARITIES.includes(rarity) ? 0 : profile.pity + 1
  const isNew = !profile.cars.includes(car.id)
  let refund = 0
  if (isNew) profile.cars.push(car.id)
  // A car you already have: your coins back - at least what this spin cost (`paid`),
  // or the rarity's refund if that's more (free spins pay just the rarity refund).
  else refund = addCoins(profile, Math.max(DUPLICATE_REFUND[rarity], paid))
  return { ok: true, carId: car.id, rarity, isNew, refund }
}

/** A coin spin: SPIN_COST, then rollSpin. */
export function buySpin(profile, rand = Math.random) {
  if (profile.coins < SPIN_COST) return { ok: false, error: `A spin costs ${SPIN_COST} coins` }
  profile.coins -= SPIN_COST
  return rollSpin(profile, rand, { paid: SPIN_COST })
}

export function equipCar(profile, id) {
  if (!profile.cars.includes(id)) return { ok: false, error: "You don't own that car yet" }
  profile.car = id
  return { ok: true }
}

/** Buys cosmetic `id` of `kind` ('paint' | 'nitro') with coins and puts it on. */
export function buyCosmetic(profile, kind, id) {
  const k = COSMETIC_KINDS[kind]
  const item = k?.byId[id]
  if (!item) return { ok: false, error: 'Unknown item' }
  if (profile[k.owned].includes(id)) return { ok: false, error: 'You already own that' }
  if (profile.coins < item.price) return { ok: false, error: `${item.name} costs ${item.price} coins` }
  profile.coins -= item.price
  profile[k.owned].push(id)
  profile[k.equipped] = id
  return { ok: true, kind, id, cost: item.price }
}

/** Puts on a cosmetic you own. */
export function equipCosmetic(profile, kind, id) {
  const k = COSMETIC_KINDS[kind]
  if (!k || !profile[k.owned].includes(id)) return { ok: false, error: "You don't own that yet" }
  profile[k.equipped] = id
  return { ok: true }
}

export function unlockSlot(profile) {
  if (profile.slots >= MAX_SLOTS) return { ok: false, error: 'All item slots are open' }
  const cost = SLOT_COSTS[profile.slots + 1]
  if (profile.coins < cost) return { ok: false, error: `The next slot costs ${cost} coins` }
  profile.coins -= cost
  profile.slots += 1
  return { ok: true, slots: profile.slots, cost }
}

export function applySetting(profile, key, value) {
  if (!(key in SETTINGS_DEFAULTS) || typeof value !== 'boolean') return { ok: false, error: 'Unknown setting' }
  profile.settings[key] = value
  return { ok: true }
}

// --- Store and Boxity grants ---------------------------------------------------------

/**
 * A store product ('purchase'): paid for with coins or, for `kind: 'pearls'`, with Sky
 * Pearls from the bank. Checked and charged in one step, so nothing is taken from a
 * player who can't pay (or, for the item slot, who has every slot open already).
 *
 * @returns {{ ok: true, spin?: true, pearls?: number, coins?: number, slots?: number } | { ok: false, error: string }}
 */
export function buyProduct(profile, productId, rand = Math.random) {
  const product = Object.hasOwn(PRODUCT_BY_ID, productId) ? PRODUCT_BY_ID[productId] : null
  if (!product) return { ok: false, error: 'Unknown product' }
  if (product.kind === 'pearls') return buyPearlProduct(profile, product)
  if (product.kind !== 'coins') return { ok: false, error: 'Unknown product' }
  if (profile.coins < product.price) return { ok: false, error: `${product.name} costs ${product.priceLabel}` }
  profile.coins -= product.price
  if (productId === 'mega_spin') return { ...rollSpin(profile, rand, { minRarity: 'epic', paid: product.price }), spin: true }
  return { ok: true }
}

/** A pearl-priced product: coin packs pay their coins, the slot pass opens the next slot. */
function buyPearlProduct(profile, product) {
  if (product.id === 'slot_pass' && profile.slots >= MAX_SLOTS) return { ok: false, error: 'All item slots are open' }
  const bank = wholeAtLeast0(profile.pearlBank)
  if (bank < product.price) return { ok: false, error: `Not enough pearls: ${product.name} costs ${product.priceLabel}` }
  profile.pearlBank = bank - product.price
  const result = { ok: true, productId: product.id, name: product.name, pearls: product.price, coins: 0 }
  if (product.id === 'slot_pass') {
    profile.slots += 1
    result.slots = profile.slots
  } else if (product.coins > 0) {
    // A conversion of pearls already counted when found, not new earnings: the coins
    // leaderboard (stats.totalCoins) doesn't move.
    profile.coins += product.coins
    result.coins = product.coins
  }
  return result
}

/**
 * A rewarded ad's grant, within the placement's cooldown. `adAt` is the session's
 * record of when each placement last paid (not saved: a cooldown, not a balance).
 */
export function applyAdReward(profile, adAt, placement, now, rand = Math.random) {
  const reward = AD_REWARDS[placement]
  if (!reward) return { ok: false, error: 'Unknown reward' }
  if (now - (adAt[placement] || 0) < reward.cooldownMs) return { ok: false, error: 'Not ready yet' }
  adAt[placement] = now
  const result = { ok: true, placement, label: reward.label }
  if (reward.grant.spin) Object.assign(result, rollSpin(profile, rand), { spin: true, label: reward.label })
  return result
}
