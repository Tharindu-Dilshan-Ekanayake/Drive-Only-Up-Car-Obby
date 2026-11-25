/**
 * Cosmetics sold in the Store for coins: car paints and nitro flame colours. Looks only,
 * never stats. Shared by the authority (prices, ownership) and the client (drawing).
 *
 * A paint replaces your car's body colour on whichever car you drive ('stock' keeps each
 * car's own colours). A nitro colour tints your exhaust flames ('rainbow' cycles).
 * The first entry of each list is free and owned by everyone.
 */

export const PAINTS = [
  { id: 'stock', name: 'Factory', color: null, price: 0 },
  { id: 'cherry', name: 'Cherry Red', color: '#e2343b', price: 300 },
  { id: 'sunburst', name: 'Sunburst', color: '#ffc21f', price: 300 },
  { id: 'lagoon', name: 'Lagoon', color: '#16b8b0', price: 300 },
  { id: 'ocean', name: 'Ocean Blue', color: '#2f6fe0', price: 300 },
  { id: 'lime', name: 'Lime Zest', color: '#7bdc2e', price: 500 },
  { id: 'grape', name: 'Grape Soda', color: '#8a4fe0', price: 500 },
  { id: 'bubblegum', name: 'Bubblegum', color: '#ff7cc2', price: 500 },
  { id: 'tangerine', name: 'Tangerine', color: '#ff8a1f', price: 500 },
  { id: 'snow', name: 'Snow White', color: '#eef2f7', price: 800 },
  { id: 'midnight', name: 'Midnight', color: '#262a33', price: 800 },
  { id: 'gold', name: 'Harbour Gold', color: '#e5ae2c', price: 2500 },
]

export const NITROS = [
  { id: 'classic', name: 'Sky Blue', color: '#5fe3ff', price: 0 },
  { id: 'inferno', name: 'Inferno', color: '#ff6a1a', price: 400 },
  { id: 'toxic', name: 'Toxic Green', color: '#6cff3a', price: 400 },
  { id: 'royal', name: 'Royal Purple', color: '#b45cff', price: 600 },
  { id: 'hotpink', name: 'Hot Pink', color: '#ff4fae', price: 600 },
  { id: 'solar', name: 'Solar Gold', color: '#ffd23a', price: 1000 },
  { id: 'ghost', name: 'Ghost White', color: '#eef4ff', price: 1000 },
  { id: 'rainbow', name: 'Rainbow', color: null, rainbow: true, price: 3000 },
]

export const PAINT_BY_ID = Object.fromEntries(PAINTS.map((p) => [p.id, p]))
export const NITRO_BY_ID = Object.fromEntries(NITROS.map((n) => [n.id, n]))
export const DEFAULT_PAINT = PAINTS[0].id
export const DEFAULT_NITRO = NITROS[0].id

/** Per kind: the catalogue and the profile fields (owned list, equipped id). */
export const COSMETIC_KINDS = {
  paint: { byId: PAINT_BY_ID, owned: 'paints', equipped: 'paint', fallback: DEFAULT_PAINT },
  nitro: { byId: NITRO_BY_ID, owned: 'nitros', equipped: 'nitro', fallback: DEFAULT_NITRO },
}

/** The body colour to paint `paintId` with, or null for the car's own. */
export const paintColor = (paintId) => PAINT_BY_ID[paintId]?.color || null
