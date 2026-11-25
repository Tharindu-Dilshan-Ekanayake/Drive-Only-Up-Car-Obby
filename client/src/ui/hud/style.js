import { PALETTE } from '../../game/palette'

/**
 * Shared HUD styling for the Sky Docks look: navy panels trimmed with yellow/black
 * hazard stripes. Sizes are in reference-layout pixels (1920x1080) scaled by the --px
 * CSS variable (index.css), so the HUD keeps its proportions on any screen.
 */

/** `u(48)` -> a CSS length equal to 48 reference pixels. */
export const u = (n) => `calc(var(--px) * ${n})`

export const GRADIENTS = {
  gold: 'linear-gradient(180deg, #fff6b0 0%, #ffd52a 45%, #ff9c00 100%)',
  goldButton: 'linear-gradient(180deg, #fff27a 0%, #ffcb1f 48%, #ff9a0a 100%)',
  orangeButton: 'linear-gradient(180deg, #ffc07a 0%, #ff8a2a 50%, #e8590c 100%)',
  tealButton: 'linear-gradient(180deg, #9ff6ff 0%, #2fd3e6 50%, #128fb0 100%)',
  greenButton: 'linear-gradient(180deg, #b6ff6a 0%, #57e83a 50%, #19b52a 100%)',
  greyButton: 'linear-gradient(180deg, #e2e6ea 0%, #a9b0b8 55%, #7d858e 100%)',
  redButton: 'linear-gradient(180deg, #ff8a7a 0%, #ff3b3b 50%, #d4142a 100%)',
  navyButton: `linear-gradient(180deg, #34508f 0%, ${PALETTE.uiNavyLight} 50%, ${PALETTE.uiNavy} 100%)`,
  panel: `linear-gradient(180deg, rgb(31 53 112 / var(--panel-alpha, 0.95)), rgb(20 35 79 / var(--panel-alpha, 0.95)))`,
  hud: 'linear-gradient(180deg, rgba(31, 53, 112, 0.92), rgba(16, 28, 66, 0.92))',
  /** Pale-gold to orange, for the big headline lettering. */
  title: 'linear-gradient(180deg, #ffffff 0%, #fff4b8 30%, #ffd52a 58%, #ff9c00 100%)',
  green: 'linear-gradient(180deg, #f0ffd8 0%, #9cff6e 45%, #2fc95a 100%)',
  red: 'linear-gradient(180deg, #ffd0c8 0%, #ff6a55 50%, #e2242c 100%)',
  cyan: 'linear-gradient(180deg, #ffffff 0%, #b4f6ff 40%, #3fc8f0 100%)',
  /** Pale pink, the Sky Pearl count (the HUD's PearlCounter uses the same). */
  pearl: 'linear-gradient(180deg, #ffffff 0%, #ffe6f3 55%, #f3a9d2 100%)',
  nitro: 'linear-gradient(90deg, #9ff0ff 0%, #5fe3ff 50%, #18a3c6 100%)',
}

/** Diagonal yellow/black hazard stripes (a background). */
export const HAZARD = `repeating-linear-gradient(-45deg, ${PALETTE.hazardYellow} 0 ${u(14)}, ${PALETTE.hazardBlack} ${u(14)} ${u(28)})`

/**
 * Hazard stripes with a soft top sheen and a dark bottom edge, so a trim strip reads
 * as a painted steel band rather than a flat sticker.
 */
export const HAZARD_TRIM = `linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 45%, rgba(0,0,0,0.28) 100%), ${HAZARD}`

/**
 * The dock-office panel face: a glossy sheen over the top third, a faint diagonal
 * brushed-steel texture, then the navy body. All static gradients (no filters), so it
 * costs nothing per frame.
 */
const SHEEN = 'linear-gradient(180deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.04) 38%, rgba(255,255,255,0) 39%)'
const BRUSHED = 'repeating-linear-gradient(135deg, rgba(255,255,255,0.025) 0 2px, rgba(255,255,255,0) 2px 7px)'
export const HUD_FACE = `${SHEEN}, ${BRUSHED}, linear-gradient(180deg, rgba(42, 70, 140, 0.94) 0%, rgba(25, 43, 96, 0.94) 55%, rgba(16, 28, 66, 0.95) 100%)`

/**
 * The one drop shadow every HUD card uses: a hard ink lip under the card, a soft
 * ambient shadow so it lifts off a bright sky, a teal hairline rim just inside the ink
 * border and a bevel (light top edge, dark bottom edge).
 */
export const SHADOW = [
  `0 ${u(6)} 0 ${PALETTE.uiInk}`,
  `0 ${u(12)} ${u(18)} rgba(6, 12, 32, 0.3)`,
  `inset 0 0 0 ${u(2)} rgba(95, 227, 255, 0.16)`,
  `inset 0 ${u(3)} 0 rgba(255, 255, 255, 0.2)`,
  `inset 0 ${u(-5)} 0 rgba(4, 10, 30, 0.35)`,
].join(', ')

/** The flat HUD's versions (no gradient, no blur - see ../flatFill.js): a card face and its shadow. */
export const HUD_FLAT = 'rgba(25, 43, 96, 0.94)'
export const SHADOW_FLAT = [`0 ${u(6)} 0 ${PALETTE.uiInk}`, `inset 0 0 0 ${u(2)} rgba(95, 227, 255, 0.16)`, `inset 0 ${u(3)} 0 rgba(255, 255, 255, 0.2)`].join(', ')

/** A HUD card: glossy navy body, ink outline, lip shadow and bevel. */
export const card = (radius = 18) => ({
  background: HUD_FACE,
  borderRadius: u(radius),
  border: `${u(4)} solid ${PALETTE.uiInk}`,
  boxShadow: SHADOW,
})

/** A recessed slot inside a card or panel (for values, bars, lists). */
export const INSET = {
  background: 'linear-gradient(180deg, rgba(6, 12, 34, 0.62) 0%, rgba(13, 21, 48, 0.42) 100%)',
  boxShadow: `inset 0 ${u(4)} ${u(6)} rgba(0, 0, 0, 0.35), inset 0 ${u(-2)} 0 rgba(255, 255, 255, 0.08)`,
}

export const RARITY_GRADIENT = {
  common: 'linear-gradient(180deg, #e9edf2 0%, #a9b4c0 100%)',
  rare: 'linear-gradient(180deg, #9fd4ff 0%, #2f86ff 100%)',
  epic: 'linear-gradient(180deg, #e0b0ff 0%, #9a3bff 100%)',
  legendary: 'linear-gradient(180deg, #fff09a 0%, #ff9a10 100%)',
  mythic: 'linear-gradient(180deg, #ffb0cf 0%, #ff2d6f 100%)',
}

/** 12345 ms -> "00:12.3" */
export function formatTime(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '--:--.-'
  const total = Math.floor(ms / 100)
  const tenths = total % 10
  const secs = Math.floor(total / 10) % 60
  const mins = Math.min(99, Math.floor(total / 600))
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`
}

/** 12345 -> "12,345" */
export const formatCoins = (n) => Math.floor(Number(n) || 0).toLocaleString('en-US')

/** 1 -> "st", 2 -> "nd", 11 -> "th", 23 -> "rd" */
export function ordinalSuffix(n) {
  const m = Math.abs(n) % 100
  if (m >= 11 && m <= 13) return 'th'
  return ['th', 'st', 'nd', 'rd'][m % 10] || 'th'
}

/** -1340 -> "-1.3s", 820 -> "+0.8s" (a split delta vs your best). */
export function formatDelta(ms) {
  const s = (Math.abs(ms) / 1000).toFixed(1)
  if (s === '0.0') return '±0.0s'
  return `${ms < 0 ? '-' : '+'}${s}s`
}
