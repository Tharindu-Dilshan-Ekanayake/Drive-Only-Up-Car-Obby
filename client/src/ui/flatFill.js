import { createContext } from 'react'

/**
 * The HUD draws flat: one colour where the panels use a gradient. Every gradient kind,
 * blur and filter the browser meets the first time the HUD is painted costs it a GPU shader
 * compile - together ~3 s of GPU time on a cold browser, a freeze right after the loading
 * screen. The HUD (ui/hud/HUD.jsx) provides `FlatFill` = true; StrokeText, TickNumber and
 * ChunkyButton then fill with `flatOf(gradient)` instead of the gradient. Panels keep theirs.
 */
export const FlatFill = createContext(false)

const COLOR = /(#[0-9a-f]{3,8}|rgba?\([^)]*\)|color\([^)]*\))\s*(-?[\d.]+%)?/gi
const cache = new Map()

/**
 * A single colour standing for CSS gradient `css`: the stop nearest the middle of its last
 * non-repeating gradient layer (the base under any gloss). Plain colours pass through.
 */
export function flatOf(css) {
  if (!css || !css.includes('gradient')) return css
  if (cache.has(css)) return cache.get(css)
  const layers = css.split(/,(?![^(]*\))(?=\s*(?:repeating-)?(?:linear|radial|conic)-gradient)/)
  const base = [...layers].reverse().find((l) => !/repeating-/.test(l)) || layers[layers.length - 1]
  const stops = [...base.matchAll(COLOR)].map((m, i, all) => ({ color: m[1], at: m[2] ? parseFloat(m[2]) : (100 * i) / Math.max(1, all.length - 1) }))
  const mid = stops.reduce((best, s) => (Math.abs(s.at - 50) < Math.abs(best.at - 50) ? s : best), stops[0] || { color: css, at: 0 })
  cache.set(css, mid.color)
  return mid.color
}
