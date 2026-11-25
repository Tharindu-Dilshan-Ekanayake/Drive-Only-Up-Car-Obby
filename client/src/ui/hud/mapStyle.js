/**
 * A map's colours as a button / banner background: a map of zones (the Grand Tour) runs
 * through its zones' colours left to right, any other map is its accent colour.
 */
export function mapGradient(info) {
  const zones = info?.zones
  if (zones?.length > 1) return `linear-gradient(100deg, ${zones.map((z, k) => `${z.color} ${Math.round((k * 100) / (zones.length - 1))}%`).join(', ')})`
  return `linear-gradient(180deg, #ffffff -40%, ${info?.color || '#ff7a1a'} 45%, #0d1530 160%)`
}

/** The locked look (a chapter you haven't opened). */
export const LOCKED_GRADIENT = 'linear-gradient(180deg, #c3c9d2 -30%, #6b7380 45%, #2a303a 150%)'
