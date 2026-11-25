/**
 * Shared look for the world's leaderboard boards (checkpoint best times, the pier's
 * three boards): a navy glass face, an orange header with a hazard band, medal discs
 * for the top three and alternating row pills. Plain canvas 2D, drawn once per change.
 */

export const BOARD_FONT = '"Fredoka One", "Arial Rounded MT Bold", sans-serif'
const INK = '#0d1530'
const MEDALS = [
  ['#fff3a0', '#ffc41f', '#c98a00'],
  ['#ffffff', '#d5dde6', '#8f99a4'],
  ['#ffd2a8', '#e0914f', '#9c5a24'],
]

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Outlined text shrunk to fit `maxW`. */
export function boardText(ctx, text, x, y, size, maxW, fill, align = 'left', stroke = INK) {
  let s = size
  ctx.font = `${s}px ${BOARD_FONT}`
  while (s > 8 && ctx.measureText(text).width > maxW) {
    s -= 1
    ctx.font = `${s}px ${BOARD_FONT}`
  }
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  if (stroke) {
    ctx.lineWidth = Math.max(2, s * 0.22)
    ctx.strokeStyle = stroke
    ctx.strokeText(text, x, y)
  }
  ctx.fillStyle = fill
  ctx.fillText(text, x, y)
}

/** The board face and header. Returns the y where rows can start. */
export function paintBoardFrame(ctx, x, y, w, h, title, subtitle, k = 1) {
  const bg = ctx.createLinearGradient(0, y, 0, y + h)
  bg.addColorStop(0, '#24468f')
  bg.addColorStop(0.35, '#1a3070')
  bg.addColorStop(1, '#0f1d47')
  ctx.fillStyle = INK
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = bg
  roundRect(ctx, x + 4 * k, y + 4 * k, w - 8 * k, h - 8 * k, 12 * k)
  ctx.fill()
  // Header.
  const hh = 64 * k
  const hg = ctx.createLinearGradient(0, y, 0, y + hh)
  hg.addColorStop(0, '#ffb04a')
  hg.addColorStop(0.6, '#ff7a1a')
  hg.addColorStop(1, '#e0560a')
  ctx.fillStyle = hg
  roundRect(ctx, x + 4 * k, y + 4 * k, w - 8 * k, hh, 12 * k)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  ctx.fillRect(x + 10 * k, y + 8 * k, w - 20 * k, hh * 0.32)
  // Hazard band under the header.
  const by = y + 4 * k + hh
  ctx.fillStyle = '#ffc41f'
  ctx.fillRect(x + 4 * k, by, w - 8 * k, 7 * k)
  ctx.fillStyle = '#24282e'
  for (let i = 0; i < w; i += 18 * k) {
    ctx.beginPath()
    ctx.moveTo(x + i, by + 7 * k)
    ctx.lineTo(x + i + 9 * k, by + 7 * k)
    ctx.lineTo(x + i + 16 * k, by)
    ctx.lineTo(x + i + 7 * k, by)
    ctx.fill()
  }
  boardText(ctx, title, x + 16 * k, y + 4 * k + hh * (subtitle ? 0.36 : 0.5), 30 * k, w - 32 * k, '#ffffff')
  if (subtitle) boardText(ctx, subtitle, x + 16 * k, y + 4 * k + hh * 0.78, 16 * k, w - 32 * k, '#fff3d6', 'left', 'rgba(13,21,48,0.6)')
  return by + 14 * k
}

/** One row: rank (medal for the top three), name, value; `me` highlights it. */
export function paintBoardRow(ctx, x, y, w, rowH, rank, name, value, k = 1, me = false) {
  const pad = 8 * k
  if (me || rank % 2 === 1) {
    ctx.fillStyle = me ? 'rgba(255,196,31,0.3)' : 'rgba(255,255,255,0.07)'
    roundRect(ctx, x + pad, y + 1.5 * k, w - pad * 2, rowH - 3 * k, (rowH - 3 * k) / 2)
    ctx.fill()
  }
  const cy = y + rowH / 2
  const mx = x + pad + 16 * k
  if (rank <= 3) {
    const [hi, mid, lo] = MEDALS[rank - 1]
    const g = ctx.createRadialGradient(mx - 3 * k, cy - 3 * k, 1, mx, cy, 11 * k)
    g.addColorStop(0, hi)
    g.addColorStop(0.6, mid)
    g.addColorStop(1, lo)
    ctx.fillStyle = INK
    ctx.beginPath()
    ctx.arc(mx, cy, Math.min(12.5 * k, rowH * 0.48), 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(mx, cy, Math.min(10.5 * k, rowH * 0.4), 0, Math.PI * 2)
    ctx.fill()
    boardText(ctx, String(rank), mx, cy + 0.5 * k, 14 * k, 20 * k, INK, 'center', null)
  } else {
    boardText(ctx, `#${rank}`, mx, cy, 15 * k, 30 * k, '#9fd8ff', 'center')
  }
  boardText(ctx, name, x + pad + 38 * k, cy, 17 * k, w * 0.58, me ? '#ffe27a' : '#ffffff')
  boardText(ctx, value, x + w - pad - 10 * k, cy, 17 * k, w * 0.3, rank <= 3 ? '#ffe27a' : '#ffffff', 'right')
}
