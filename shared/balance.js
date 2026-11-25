/**
 * Up We Drive's numbers: what everything pays and costs. Shared by the authority (which
 * enforces them) and the client (which shows them).
 *
 * The economy in one run of Stage 1: ~156 track coins, ~620 from checkpoints and 500
 * for reaching the summit - about 1,300 coins, six or seven car spins. Tricks top that
 * up, capped so they can't be farmed.
 */

/** One track coin. */
export const COIN_VALUE = 1

/** Coins for reaching checkpoint `index` (1..N) for the first time in a run. */
export const CHECKPOINT_COINS = (index) => 20 + 4 * Math.max(0, index)

/** Extra coins for reaching the summit (the last checkpoint). */
export const FINISH_BONUS = 500

/** A whole-stage time faster than this is impossible; anything quicker is clamped. */
export const MIN_FINISH_MS = 60_000

/** Coins per car spin. */
export const SPIN_COST = 200

/** Spins without a Legendary or better before one is guaranteed. */
export const PITY_SPINS = 40

/** Coins back for a car you already own, by its rarity. */
export const DUPLICATE_REFUND = { common: 40, rare: 80, epic: 150, legendary: 300, mythic: 600 }

/** Item slots: everyone has 1, two more can be bought. */
export const MAX_SLOTS = 3

/**
 * Cost of having `n` item slots, indexed by the slot count you'd end up with:
 * buying the next slot costs `SLOT_COSTS[profile.slots + 1]`. The first is free.
 */
export const SLOT_COSTS = [0, 0, 1500, 6000]

/** Trick points per coin, and the most coins tricks can pay in a minute. */
export const TRICK_POINTS_PER_COIN = 100
export const TRICK_COINS_PER_MIN = 60
/** A single trick worth more than this is a lie; it's clamped. */
export const MAX_TRICK_SCORE = 5000

// --- Validation distances and rates (authority) -------------------------------------

/** How close (m) you must be to a checkpoint gate for it to count. */
export const CHECKPOINT_RADIUS = 30
/** How close (m) you must be to a coin to pick it up (position reports lag a little). */
export const COIN_RADIUS = 8
/** Coins per second you can pick up at most (a burst of this many is allowed). */
export const COIN_RATE = 25

// --- Adventure (shared/adventure.js) --------------------------------------------------

/** Coins for each Sky Pearl the first time you find it, and for finding them all. */
export const PEARL_COINS = 150
export const PEARL_SET_BONUS = 3000
/** Coins in a treasure chest (each chest once per run). */
export const CHEST_COINS = 40
/** How close (m) you must be to a pearl or a chest (position reports lag a little). */
export const ADVENTURE_RADIUS = 9

// --- Store ---------------------------------------------------------------------------

/**
 * What the store sells, all bought in-game through the 'purchase' message: `kind: 'coins'`
 * products cost coins, `kind: 'pearls'` ones cost Sky Pearls from the spendable bank
 * (`profile.pearlBank`, +1 per pearl found for the first time). `price` is in that
 * currency; `coins` is what a pearl product pays out.
 *
 * Pearl prices: the game hides 68 Sky Pearls (Sky Docks 29, Grand Tour 28, Heat Run 11).
 * The Bucket (5) is within reach after the first few roads, the Item Slot (10) is a mid
 * goal, the Crate (20) about one map's worth, and the Container (50) takes about three
 * quarters of every pearl in the game. Bigger packs pay more coins per pearl (200, 250,
 * 300; a pearl itself pays 150 when found), so saving up is rewarded but nothing here
 * can be farmed: every pearl is found once.
 */
export const PRODUCTS = [
  { id: 'mega_spin', name: 'Mega Spin', kind: 'coins', coins: 0, price: 1500, priceLabel: '1,500 coins', blurb: 'A car spin that lands Epic or better.' },
  { id: 'coins_small', name: 'Bucket of Coins', kind: 'pearls', coins: 1000, price: 5, priceLabel: '5 Pearls', blurb: '1,000 coins.' },
  { id: 'coins_medium', name: 'Crate of Coins', kind: 'pearls', coins: 5000, price: 20, priceLabel: '20 Pearls', blurb: '5,000 coins.' },
  { id: 'coins_big', name: 'Container of Coins', kind: 'pearls', coins: 15000, price: 50, priceLabel: '50 Pearls', blurb: '15,000 coins.' },
  { id: 'slot_pass', name: 'Item Slot', kind: 'pearls', coins: 0, price: 10, priceLabel: '10 Pearls', blurb: 'Unlocks your next item slot.' },
]

export const PRODUCT_BY_ID = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]))

/**
 * Rewarded ads (Boxity): watch one to earn this. Placement names are lowercase, digits
 * and hyphens (Boxity's rule). `cooldownMs` keeps a player from chaining them.
 */
export const AD_REWARDS = {
  'free-spin': { label: 'Free Spin', icon: 'spin', grant: { spin: true }, cooldownMs: 5 * 60 * 1000 },
}
