import { mulberry32 } from './rng.js'

/**
 * What an item crate holds. Every crate carries ONE fixed item, decided when the stage is
 * built (so every client sees the same): the crates of a row across the road hold three
 * DIFFERENT items, and you choose by which one you drive through. The ids are the keys of the
 * client's ITEMS table (client/src/game/player/items.js).
 */
export const CRATE_ITEMS = ['jump', 'turbo', 'shield', 'magnet', 'anchor', 'glider', 'missile']

/** How likely each item is when a row is drawn (default 1): the missile is the rare one. */
const WEIGHT = { missile: 0.5 }
const weight = (id) => WEIGHT[id] ?? 1

/** A row never goes longer than this many rows without a missile in it (it still shows up regularly). */
const MISSILE_DROUGHT = 3

/** A small stable hash of a string, as a PRNG seed. */
function seedOf(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

/**
 * The item dealer of one stage: `deal(count)` returns `count` different item ids for the next
 * row of crates (`count` 1 = a single crate). Seeded by the stage id, so the same stage always
 * deals the same crates; weighted by WEIGHT, drawn without repeats, with a missile forced into
 * any row that follows MISSILE_DROUGHT rows without one.
 */
export function createItemDealer(stageId) {
  const rand = mulberry32(seedOf(`crates:${stageId}`))
  let dry = 0
  return function deal(count = 3) {
    const pool = CRATE_ITEMS.slice()
    const out = []
    if (dry >= MISSILE_DROUGHT) {
      out.push('missile')
      pool.splice(pool.indexOf('missile'), 1)
    }
    while (out.length < count && pool.length) {
      let total = 0
      for (const id of pool) total += weight(id)
      let r = rand() * total
      let k = 0
      while (k < pool.length - 1) {
        r -= weight(pool[k])
        if (r < 0) break
        k += 1
      }
      out.push(pool[k])
      pool.splice(k, 1)
    }
    // The forced missile must not always sit in the first lane: shuffle (Fisher-Yates).
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    dry = out.includes('missile') ? 0 : dry + 1
    return out
  }
}
