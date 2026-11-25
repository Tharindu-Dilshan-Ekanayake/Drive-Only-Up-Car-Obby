import { ADVENTURE_RADIUS, CHECKPOINT_RADIUS, COIN_RADIUS, COIN_RATE, TRICK_COINS_PER_MIN } from './balance.js'
import {
  addCoins,
  applyAdReward,
  applySetting,
  buyProduct,
  buySpin,
  collectChest,
  collectCoin,
  collectPearl,
  buyCosmetic,
  equipCar,
  equipCosmetic,
  progressFor,
  reachCheckpoint,
  restartRun,
  stageLookups,
  trickCoins,
  unlockSlot,
} from './logic.js'

/** Seconds between profile syncs for small changes (coins), which also go as 'reward'. */
const SYNC_EVERY = 2

const distSq = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2

/**
 * One player's authoritative session on one map (`stage`): validates intents against
 * where the player is on that map, keeps per-run state (coins already taken, rate
 * limits) and reports through `emit`. Progress goes to `profile.maps[stage.id]`; coins,
 * cars, cosmetics, slots, stats and settings are the profile's own (every map shares them).
 *
 * Transport-agnostic on purpose. The Colyseus room wraps one of these per client; the
 * offline mode wraps one for the local player. Either way the same rules run.
 *
 * Events emitted (type, payload):
 * - 'profile'    { profile }  full state, after anything structural, and every
 *                  SYNC_EVERY s while small changes are pending
 * - 'reward'     { coins, total, reason }  coins just paid; `total` is the new balance.
 *                  reason: 'coin' | 'trick' | 'refund' | 'ad' | 'slot' | 'pearl' | 'chest'
 * - 'pearl'      { index, found, total, coins, complete, bank }  a Sky Pearl found (first
 *                  time); `bank` is the spendable pearl balance after it
 * - 'purchased'  { productId, name, pearls, coins, slots? }  a store product paid for with
 *                  pearls (coins products are spent and shown by the client as before)
 * - 'checkpoint' { index, coins, splitMs, best, finish, totalMs?, unlocked? }  first time
 *                  this run; at a finish `unlocked` lists the maps it just opened (chapters)
 * - 'spin'       { carId, rarity, isNew, refund }  a car spin's result (coins, Mega
 *                  Spin, or the free-spin ad)
 * - 'error'      { text, type }  an intent was refused; `type` is the message refused
 *                  (e.g. 'spin', so the client can stop waiting for a result)
 */
export class PlayerSession {
  /**
   * @param {object} profile normalized profile (logic.normalizeProfile); changed in place
   * @param {{ now: number, emit: (type: string, payload?: object) => void,
   *           getPosition: () => {x: number, y: number, z: number},
   *           stage: object, rand?: () => number }} options `stage`: the built stage
   *           (shared/stages/index.js loadStage) this session plays on
   */
  constructor(profile, { now, emit, getPosition, stage, rand = Math.random }) {
    if (!stage?.checkpoints) throw new Error('PlayerSession needs a stage')
    this.profile = profile
    this.emit = emit
    this.getPosition = getPosition
    this.rand = rand
    /** When each rewarded-ad placement last paid (cooldowns). */
    this.adAt = {}
    /** Coin and chest ids taken this run. */
    this.collected = new Set()
    this.setStage(stage, { quiet: true })
    /** Token buckets: coins that may still be picked up now / trick coins this minute. */
    this.coinTokens = COIN_RATE
    this.trickTokens = TRICK_COINS_PER_MIN
    this.dirty = false
    this.syncTimer = 0
    this.lastTick = now
  }

  /**
   * Moves this session to another map (offline play travels this way; online, a new
   * room makes a new session). The new map's run state starts fresh. `quiet` skips the
   * profile sync (the constructor).
   */
  setStage(stage, { quiet = false } = {}) {
    this.stage = stage
    this.lookups = stageLookups(stage)
    /** This map's progress (profile.maps[stage.id]). */
    this.progress = progressFor(this.profile, stage)
    this.collected.clear()
    this.markPassedCoins()
    if (!quiet) this.sendProfile()
  }

  /**
   * A run resumed mid-stage (a reconnect) can't re-take the coins behind its
   * checkpoint, or reconnecting would be a way to farm them.
   */
  markPassedCoins() {
    for (const coin of this.stage.coins) if (coin.section < this.progress.checkpoint) this.collected.add(coin.id)
  }

  // --- Plumbing --------------------------------------------------------------------

  sendProfile() {
    this.dirty = false
    this.syncTimer = 0
    this.emit('profile', { profile: this.profile })
  }

  refuse(type, text) {
    this.emit('error', { text, type })
  }

  reward(coins, reason) {
    if (!coins) return
    this.dirty = true
    this.emit('reward', { coins, total: this.profile.coins, reason })
  }

  near(point, radius) {
    const p = this.getPosition()
    if (!p || ![p.x, p.y, p.z].every(Number.isFinite)) return false
    return distSq(p, point) <= radius * radius
  }

  // --- Intents ---------------------------------------------------------------------

  /**
   * Applies one client message. Unknown types and malformed payloads are ignored;
   * refusals the player should hear about come back as 'error'.
   */
  handle(type, payload = {}, _now) {
    const handler = this.handlers[type]
    if (handler) handler.call(this, payload || {})
  }

  handlers = {
    checkpoint({ index, splitMs, totalMs }) {
      const cp = this.stage.checkpoints[index]
      if (!cp || !Number.isInteger(index) || index < 1) return
      if (!this.near(cp, CHECKPOINT_RADIUS)) return
      const result = reachCheckpoint(this.profile, this.stage, index, { splitMs: Number(splitMs), totalMs: Number(totalMs) })
      if (!result.ok) {
        if (!result.quiet) this.refuse('checkpoint', result.error)
        return
      }
      const { ok: _ok, ...event } = result
      this.emit('checkpoint', event)
      this.sendProfile()
    },

    coin({ id }) {
      const coin = typeof id === 'string' ? this.lookups.coinById.get(id) : null
      if (!coin || this.collected.has(id) || this.coinTokens < 1) return
      if (!this.near(coin, COIN_RADIUS)) return
      this.collected.add(id)
      this.coinTokens -= 1
      this.reward(collectCoin(this.profile), 'coin')
    },

    /** Found Sky Pearl `index` (permanent; see shared/adventure.js). */
    pearl({ index }) {
      const pearl = Number.isInteger(index) ? this.lookups.pearlByIndex.get(index) : null
      if (!pearl || !this.near(pearl, ADVENTURE_RADIUS)) return
      const result = collectPearl(this.profile, this.stage, index)
      if (!result.ok) return
      const { ok: _ok, ...event } = result
      this.emit('pearl', event)
      this.reward(result.coins, 'pearl')
      this.sendProfile()
    },

    /** Opened treasure chest `id` (once per run). */
    chest({ id }) {
      const chest = typeof id === 'string' ? this.lookups.chestById.get(id) : null
      if (!chest || this.collected.has(id) || !this.near(chest, ADVENTURE_RADIUS)) return
      this.collected.add(id)
      this.reward(collectChest(this.profile), 'chest')
    },

    trick({ score }) {
      this.profile.stats.tricks += 1
      this.dirty = true
      const coins = Math.min(trickCoins(Number(score)), Math.floor(this.trickTokens))
      if (coins <= 0) return
      this.trickTokens -= coins
      this.reward(addCoins(this.profile, coins), 'trick')
    },

    fell() {
      this.profile.stats.falls += 1
      this.dirty = true
    },

    restart() {
      restartRun(this.profile, this.stage)
      this.collected.clear()
      this.sendProfile()
    },

    spin() {
      this.spinResult(buySpin(this.profile, this.rand))
    },

    equipCar({ id }) {
      const result = equipCar(this.profile, String(id))
      if (!result.ok) return this.refuse('equipCar', result.error)
      this.sendProfile()
    },

    buyCosmetic({ kind, id }) {
      const result = buyCosmetic(this.profile, String(kind), String(id))
      if (!result.ok) return this.refuse('buyCosmetic', result.error)
      this.sendProfile()
    },

    equipCosmetic({ kind, id }) {
      const result = equipCosmetic(this.profile, String(kind), String(id))
      if (!result.ok) return this.refuse('equipCosmetic', result.error)
      this.sendProfile()
    },

    unlockSlot() {
      const result = unlockSlot(this.profile)
      if (!result.ok) return this.refuse('unlockSlot', result.error)
      this.sendProfile()
    },

    setting({ key, value }) {
      if (applySetting(this.profile, String(key), value).ok) this.sendProfile()
    },

    purchase({ productId }) {
      const result = buyProduct(this.profile, String(productId), this.rand)
      if (!result.ok) return this.refuse('purchase', result.error)
      if (result.spin) this.spinResult(result)
      else {
        if (result.pearls) this.emit('purchased', { productId: result.productId, name: result.name, pearls: result.pearls, coins: result.coins, slots: result.slots })
        this.sendProfile()
      }
    },
  }

  /** Reports a spin (or why it couldn't happen) and the profile it changed. */
  spinResult(result) {
    if (!result.ok) return this.refuse('spin', result.error)
    this.emit('spin', { carId: result.carId, rarity: result.rarity, isNew: result.isNew, refund: result.refund })
    this.sendProfile()
  }

  // --- Granted by the host, never by a client message --------------------------------

  /**
   * A rewarded ad the host has verified with Boxity (or, offline, that Boxity reported
   * watched). Not a handler: a client can't ask for it directly.
   */
  grantAdReward(placement, now) {
    const result = applyAdReward(this.profile, this.adAt, placement, now, this.rand)
    if (!result.ok) return result
    if (result.spin) this.spinResult(result)
    else this.sendProfile()
    return result
  }

  // --- Time ----------------------------------------------------------------------------

  /** Playtime, rate-limit refills, and the periodic profile sync for small changes. */
  tick(dt, now) {
    this.lastTick = now
    if (!(dt > 0)) return
    this.profile.stats.playtime += dt
    this.coinTokens = Math.min(COIN_RATE, this.coinTokens + COIN_RATE * dt)
    this.trickTokens = Math.min(TRICK_COINS_PER_MIN, this.trickTokens + (TRICK_COINS_PER_MIN / 60) * dt)
    if (this.dirty) {
      this.syncTimer += dt
      if (this.syncTimer >= SYNC_EVERY) this.sendProfile()
    }
  }
}
