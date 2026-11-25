import { BufferAttribute, BufferGeometry, CanvasTexture, Group, Mesh, MeshBasicMaterial, SRGBColorSpace } from 'three'

import { CARS } from '@shared/cars'

/**
 * Painted billboards for the harbour town (the big ads and banners on the buildings).
 * Each design is painted once into a slot of one canvas atlas (2 x 4 slots, 2:1), and
 * every billboard in the world is a quad of one mesh: all the town's artwork is one
 * draw call and one texture (1024 px). On LOW (512 px textures) the art keeps the same
 * detail: one full-size slot column, two to a page, so a set takes a few pages (a few draw
 * calls) instead of being painted at half the size.
 *
 * A billboard: `{ art, center: [x,y,z], right: [x,y,z], up: [x,y,z], width, height }`.
 * Quads should keep the 2:1 aspect of the art.
 */

const FONT = '"Fredoka One", "Arial Rounded MT Bold", sans-serif'
const INK = '#0d1530'

export const BANNER_ARTS = ['logo', 'summit', 'ferries', 'cola', 'tyres', 'radio', 'market', 'wheel']
/** The lobby's giant promo boards (the game's own features): a second, smaller atlas. */
export const PROMO_ARTS = ['pearls', 'rings', 'tricks', 'cars']
/** Rooftop signs of the neon resort towers (dark panels, glowing letters): a third small atlas. */
export const RESORT_ARTS = ['harbourHotel', 'skyInn', 'docksideSuites', 'gullBayResort', 'craneView', 'sunsetPier']
/** Is this art one of the resort signs (they live in their own atlas)? */
export const isResortArt = (art) => RESORT_ARTS.includes(art)
const ART_SETS = { town: BANNER_ARTS, promo: PROMO_ARTS, resort: RESORT_ARTS }

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function grad(ctx, h, top, bottom) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, top)
  g.addColorStop(1, bottom)
  return g
}

/** Outlined text, shrunk to fit `maxW`. */
function text(ctx, str, x, y, size, maxW, fill, { align = 'center', stroke = INK, weight = 0.16 } = {}) {
  let s = size
  ctx.font = `${s}px ${FONT}`
  while (ctx.measureText(str).width > maxW && s > 8) {
    s -= 1
    ctx.font = `${s}px ${FONT}`
  }
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  if (stroke) {
    ctx.lineWidth = s * weight
    ctx.strokeStyle = stroke
    ctx.strokeText(str, x, y)
  }
  ctx.fillStyle = fill
  ctx.fillText(str, x, y)
}

/** Board shape shared by every design: rounded panel with an ink rim. */
function board(ctx, w, h, fill) {
  ctx.fillStyle = INK
  rr(ctx, 0, 0, w, h, h * 0.09)
  ctx.fill()
  ctx.fillStyle = fill
  rr(ctx, w * 0.018, h * 0.035, w * 0.964, h * 0.93, h * 0.07)
  ctx.fill()
}

function gull(ctx, x, y, s, color) {
  ctx.strokeStyle = color
  ctx.lineWidth = s * 0.16
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x - s, y)
  ctx.quadraticCurveTo(x - s * 0.5, y - s * 0.6, x, y)
  ctx.quadraticCurveTo(x + s * 0.5, y - s * 0.6, x + s, y)
  ctx.stroke()
}

/** The designs. Each paints into a w x h box at the origin. */
const PAINTERS = {
  logo(ctx, w, h) {
    board(ctx, w, h, grad(ctx, h, '#4fb6ff', '#1f6fd6'))
    // A road climbing to the right, hazard-striped kerb.
    ctx.fillStyle = '#2b3038'
    ctx.beginPath()
    ctx.moveTo(w * 0.05, h * 0.92)
    ctx.lineTo(w * 0.62, h * 0.92)
    ctx.lineTo(w * 0.95, h * 0.28)
    ctx.lineTo(w * 0.83, h * 0.28)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#ffc41f'
    ctx.lineWidth = h * 0.035
    ctx.setLineDash([h * 0.07, h * 0.06])
    ctx.beginPath()
    ctx.moveTo(w * 0.33, h * 0.92)
    ctx.lineTo(w * 0.89, h * 0.28)
    ctx.stroke()
    ctx.setLineDash([])
    text(ctx, 'UP WE', w * 0.36, h * 0.3, h * 0.3, w * 0.6, '#ffffff', { weight: 0.2 })
    text(ctx, 'DRIVE!', w * 0.4, h * 0.62, h * 0.38, w * 0.66, '#ffc41f', { weight: 0.2 })
  },
  summit(ctx, w, h) {
    board(ctx, w, h, grad(ctx, h, '#ffb02e', '#ff6a1a'))
    // Crane silhouette.
    ctx.fillStyle = INK
    ctx.fillRect(w * 0.82, h * 0.2, w * 0.025, h * 0.68)
    ctx.fillRect(w * 0.68, h * 0.2, w * 0.26, h * 0.05)
    ctx.fillRect(w * 0.7, h * 0.25, w * 0.008, h * 0.22)
    ctx.fillRect(w * 0.685, h * 0.47, w * 0.04, h * 0.05)
    text(ctx, 'CLIMB TO THE', w * 0.38, h * 0.27, h * 0.16, w * 0.62, '#fff3d6')
    text(ctx, 'CRANE SUMMIT', w * 0.38, h * 0.5, h * 0.24, w * 0.64, '#ffffff', { weight: 0.2 })
    text(ctx, '601 m UP · ARE YOU READY?', w * 0.38, h * 0.76, h * 0.12, w * 0.62, '#ffe27a')
  },
  ferries(ctx, w, h) {
    board(ctx, w, h, grad(ctx, h, '#24468f', '#14234f'))
    ctx.fillStyle = '#1fb5c9'
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath()
      const y = h * (0.78 + i * 0.05)
      ctx.moveTo(w * 0.04, y)
      for (let x = 0; x <= 12; x += 1) ctx.quadraticCurveTo(w * (0.04 + x * 0.077 + 0.038), y - h * 0.04, w * (0.04 + (x + 1) * 0.077), y)
      ctx.lineTo(w * 0.96, h * 0.93)
      ctx.lineTo(w * 0.04, h * 0.93)
      ctx.fill()
    }
    gull(ctx, w * 0.86, h * 0.24, h * 0.08, '#ffffff')
    text(ctx, 'SKY DOCKS FERRIES', w * 0.47, h * 0.3, h * 0.2, w * 0.8, '#ffffff', { weight: 0.18 })
    text(ctx, 'DEPARTURES EVERY HOUR', w * 0.47, h * 0.55, h * 0.12, w * 0.7, '#9fe9ff')
  },
  cola(ctx, w, h) {
    board(ctx, w, h, grad(ctx, h, '#ff5a4a', '#c81e2c'))
    // Bottle.
    ctx.fillStyle = '#ffffff'
    rr(ctx, w * 0.08, h * 0.32, w * 0.09, h * 0.52, h * 0.05)
    ctx.fill()
    ctx.fillRect(w * 0.105, h * 0.15, w * 0.04, h * 0.2)
    ctx.fillStyle = '#c81e2c'
    ctx.fillRect(w * 0.08, h * 0.5, w * 0.09, h * 0.12)
    gull(ctx, w * 0.82, h * 0.22, h * 0.07, '#ffffff')
    text(ctx, 'GULL COLA', w * 0.56, h * 0.42, h * 0.3, w * 0.7, '#ffffff', { weight: 0.2 })
    text(ctx, 'ICE COLD AT EVERY CHECKPOINT', w * 0.56, h * 0.74, h * 0.1, w * 0.72, '#ffe0d8')
  },
  tyres(ctx, w, h) {
    board(ctx, w, h, grad(ctx, h, '#ffd84a', '#ffb020'))
    // Tyre.
    const cx = w * 0.17
    const cy = h * 0.5
    ctx.fillStyle = '#24282e'
    ctx.beginPath()
    ctx.arc(cx, cy, h * 0.34, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#c9ced4'
    ctx.beginPath()
    ctx.arc(cx, cy, h * 0.16, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#ffb020'
    ctx.lineWidth = h * 0.03
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * h * 0.26, cy + Math.sin(a) * h * 0.26)
      ctx.lineTo(cx + Math.cos(a) * h * 0.33, cy + Math.sin(a) * h * 0.33)
      ctx.stroke()
    }
    text(ctx, 'ANCHOR TYRES', w * 0.62, h * 0.4, h * 0.24, w * 0.62, '#24282e', { stroke: '#ffffff', weight: 0.14 })
    text(ctx, 'GRIP FOR EVERY CLIMB', w * 0.62, h * 0.7, h * 0.12, w * 0.6, '#ffffff')
  },
  radio(ctx, w, h) {
    board(ctx, w, h, grad(ctx, h, '#8a5cf6', '#4b2aa8'))
    ctx.strokeStyle = '#5fe3ff'
    ctx.lineWidth = h * 0.04
    for (let i = 1; i <= 3; i += 1) {
      ctx.beginPath()
      ctx.arc(w * 0.15, h * 0.55, h * 0.1 * i, -Math.PI * 0.35, Math.PI * 0.35)
      ctx.stroke()
    }
    ctx.fillStyle = '#5fe3ff'
    ctx.beginPath()
    ctx.arc(w * 0.15, h * 0.55, h * 0.05, 0, Math.PI * 2)
    ctx.fill()
    text(ctx, 'TIDE FM', w * 0.55, h * 0.36, h * 0.3, w * 0.6, '#ffffff', { weight: 0.2 })
    text(ctx, '98.4 · HARBOUR HITS ALL DAY', w * 0.55, h * 0.7, h * 0.11, w * 0.7, '#c9f6ff')
  },
  market(ctx, w, h) {
    board(ctx, w, h, '#fff8e6')
    // Awning scallops.
    for (let i = 0; i < 10; i += 1) {
      ctx.fillStyle = i % 2 ? '#ffffff' : '#19a974'
      ctx.fillRect(w * (0.018 + i * 0.0964), h * 0.035, w * 0.0964, h * 0.2)
      ctx.beginPath()
      ctx.arc(w * (0.018 + i * 0.0964 + 0.0482), h * 0.235, w * 0.0482, 0, Math.PI)
      ctx.fill()
    }
    text(ctx, 'HARBOUR MARKET', w * 0.5, h * 0.55, h * 0.22, w * 0.86, '#19a974', { stroke: INK, weight: 0.12 })
    text(ctx, 'FRESH FISH · FRUIT · DONUTS', w * 0.5, h * 0.8, h * 0.11, w * 0.8, '#ff7a1a', { stroke: null })
  },
  wheel(ctx, w, h) {
    board(ctx, w, h, grad(ctx, h, '#1fb5c9', '#13819c'))
    const cx = w * 0.15
    const cy = h * 0.5
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = h * 0.03
    ctx.beginPath()
    ctx.arc(cx, cy, h * 0.3, 0, Math.PI * 2)
    ctx.stroke()
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(a) * h * 0.3, cy + Math.sin(a) * h * 0.3)
      ctx.stroke()
      ctx.fillStyle = ['#ffc41f', '#ff4a3d', '#7cf25a', '#ff7a1a'][i % 4]
      ctx.beginPath()
      ctx.arc(cx + Math.cos(a) * h * 0.3, cy + Math.sin(a) * h * 0.3, h * 0.055, 0, Math.PI * 2)
      ctx.fill()
    }
    text(ctx, 'HARBOUR WHEEL', w * 0.6, h * 0.38, h * 0.22, w * 0.64, '#ffffff', { weight: 0.2 })
    text(ctx, 'THE BEST VIEW IN THE DOCKS', w * 0.6, h * 0.68, h * 0.11, w * 0.64, '#fff3a0')
  },
}

/** Sunburst rays from (cx, cy), alternating two colours. */
function rays(ctx, w, h, cx, cy, a, b) {
  const n = 18
  const r = Math.hypot(w, h)
  for (let i = 0; i < n; i += 1) {
    ctx.fillStyle = i % 2 ? a : b
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, r, (i / n) * Math.PI * 2, ((i + 1) / n) * Math.PI * 2)
    ctx.closePath()
    ctx.fill()
  }
}

/** Clips to the board's inner panel, paints, restores. */
function inside(ctx, w, h, paint) {
  ctx.save()
  rr(ctx, w * 0.018, h * 0.035, w * 0.964, h * 0.93, h * 0.07)
  ctx.clip()
  paint()
  ctx.restore()
}

function star(ctx, x, y, r, fill) {
  ctx.fillStyle = fill
  ctx.strokeStyle = INK
  ctx.lineWidth = r * 0.22
  ctx.lineJoin = 'round'
  ctx.beginPath()
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const k = i % 2 ? r * 0.45 : r
    ctx.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k)
  }
  ctx.closePath()
  ctx.stroke()
  ctx.fill()
}

Object.assign(PAINTERS, {
  pearls(ctx, w, h) {
    board(ctx, w, h, grad(ctx, h, '#ff9ccf', '#a34fd6'))
    inside(ctx, w, h, () => rays(ctx, w, h, w * 0.2, h * 0.55, 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0)'))
    // A big glossy pearl in an open shell.
    ctx.fillStyle = '#ffd1e8'
    ctx.strokeStyle = INK
    ctx.lineWidth = h * 0.03
    ctx.beginPath()
    ctx.ellipse(w * 0.2, h * 0.72, w * 0.15, h * 0.14, 0, 0, Math.PI)
    ctx.fill()
    ctx.stroke()
    const g = ctx.createRadialGradient(w * 0.18, h * 0.42, h * 0.02, w * 0.2, h * 0.5, h * 0.24)
    g.addColorStop(0, '#ffffff')
    g.addColorStop(0.5, '#ffe6f3')
    g.addColorStop(1, '#e79ac9')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(w * 0.2, h * 0.5, h * 0.22, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    text(ctx, 'FIND THEM ALL', w * 0.64, h * 0.27, h * 0.15, w * 0.6, '#fff3a0')
    text(ctx, 'SKY PEARLS', w * 0.64, h * 0.5, h * 0.26, w * 0.62, '#ffffff', { weight: 0.2 })
    text(ctx, 'ONE HIDDEN ON EVERY ROAD', w * 0.64, h * 0.75, h * 0.1, w * 0.6, '#ffe6f3')
  },
  rings(ctx, w, h) {
    board(ctx, w, h, grad(ctx, h, '#2fd2ff', '#1f5fd6'))
    inside(ctx, w, h, () => rays(ctx, w, h, w * 0.8, h * 0.5, 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0)'))
    // Three gold rings in a row, receding.
    for (let i = 2; i >= 0; i -= 1) {
      const x = w * (0.66 + i * 0.1)
      const r = h * (0.3 - i * 0.06)
      ctx.lineWidth = h * (0.075 - i * 0.012)
      ctx.strokeStyle = INK
      ctx.beginPath()
      ctx.ellipse(x, h * 0.5, r * 0.55, r, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.lineWidth *= 0.6
      ctx.strokeStyle = '#ffc41f'
      ctx.stroke()
    }
    star(ctx, w * 0.9, h * 0.22, h * 0.08, '#fff3a0')
    text(ctx, 'RING RUN', w * 0.33, h * 0.36, h * 0.28, w * 0.56, '#ffffff', { weight: 0.2 })
    text(ctx, 'FLY THROUGH ALL THE RINGS', w * 0.33, h * 0.62, h * 0.1, w * 0.56, '#c4f4ff')
    text(ctx, 'BONUS COINS', w * 0.33, h * 0.8, h * 0.13, w * 0.5, '#ffc41f')
  },
  tricks(ctx, w, h) {
    board(ctx, w, h, grad(ctx, h, '#ffb02e', '#ff4a3d'))
    inside(ctx, w, h, () => rays(ctx, w, h, w * 0.5, h * 1.1, 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0)'))
    // A little car doing a flip: a curved arrow round a car shape.
    const cx = w * 0.16
    const cy = h * 0.52
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = h * 0.05
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(cx, cy, h * 0.3, Math.PI * 0.9, Math.PI * 2.3)
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    const ax = cx + Math.cos(Math.PI * 2.3) * h * 0.3
    const ay = cy + Math.sin(Math.PI * 2.3) * h * 0.3
    ctx.moveTo(ax + h * 0.09, ay - h * 0.02)
    ctx.lineTo(ax - h * 0.06, ay + h * 0.1)
    ctx.lineTo(ax - h * 0.05, ay - h * 0.09)
    ctx.fill()
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(-0.5)
    ctx.fillStyle = '#14234f'
    rr(ctx, -h * 0.17, -h * 0.07, h * 0.34, h * 0.12, h * 0.03)
    ctx.fill()
    rr(ctx, -h * 0.08, -h * 0.15, h * 0.16, h * 0.1, h * 0.03)
    ctx.fill()
    ctx.fillStyle = '#ffc41f'
    for (const x of [-0.1, 0.1]) {
      ctx.beginPath()
      ctx.arc(h * x, h * 0.06, h * 0.045, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
    text(ctx, 'FLIP · DRIFT · ROLL', w * 0.62, h * 0.3, h * 0.16, w * 0.64, '#fff3a0')
    text(ctx, 'TRICK BONUS', w * 0.62, h * 0.54, h * 0.26, w * 0.66, '#ffffff', { weight: 0.2 })
    text(ctx, 'LAND IT CLEAN FOR COINS', w * 0.62, h * 0.78, h * 0.1, w * 0.6, '#ffe0d8')
  },
  cars(ctx, w, h) {
    board(ctx, w, h, grad(ctx, h, '#3fd97a', '#13865a'))
    inside(ctx, w, h, () => rays(ctx, w, h, w * 0.82, h * 0.55, 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0)'))
    // Prize wheel.
    const cx = w * 0.82
    const cy = h * 0.52
    const r = h * 0.32
    const cols = ['#ffc41f', '#ff4a3d', '#18c3d6', '#8a5cf6', '#ff7a1a', '#7cf25a']
    for (let i = 0; i < 12; i += 1) {
      ctx.fillStyle = cols[i % cols.length]
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, r, (i / 12) * Math.PI * 2, ((i + 1) / 12) * Math.PI * 2)
      ctx.closePath()
      ctx.fill()
    }
    ctx.strokeStyle = INK
    ctx.lineWidth = h * 0.03
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.18, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    text(ctx, `${CARS.length} CARS TO COLLECT`, w * 0.37, h * 0.28, h * 0.14, w * 0.62, '#eafff0')
    text(ctx, 'SPIN TO WIN', w * 0.37, h * 0.52, h * 0.27, w * 0.64, '#ffffff', { weight: 0.2 })
    text(ctx, 'RARE · EPIC · LEGENDARY', w * 0.37, h * 0.76, h * 0.11, w * 0.6, '#fff3a0')
  },
})

/**
 * A resort sign: a dark panel with a glowing neon frame, a palm and two lines of letters
 * (`color` the neon, `accent` the second line).
 */
function resortSign(ctx, w, h, { top, bottom, color, accent, sub }) {
  board(ctx, w, h, grad(ctx, h, '#1b2236', '#0a101d'))
  ctx.save()
  ctx.shadowColor = color
  ctx.shadowBlur = h * 0.07
  ctx.strokeStyle = color
  ctx.lineWidth = h * 0.028
  rr(ctx, w * 0.045, h * 0.1, w * 0.91, h * 0.8, h * 0.07)
  ctx.stroke()
  ctx.restore()
  // A palm on the left.
  ctx.strokeStyle = '#c9a56a'
  ctx.lineWidth = h * 0.035
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(w * 0.12, h * 0.82)
  ctx.quadraticCurveTo(w * 0.14, h * 0.55, w * 0.1, h * 0.34)
  ctx.stroke()
  ctx.strokeStyle = '#4fe08a'
  ctx.lineWidth = h * 0.03
  for (const [dx, dy] of [[-0.07, 0.05], [0.07, 0.03], [-0.05, -0.04], [0.06, -0.05], [0, -0.07]]) {
    ctx.beginPath()
    ctx.moveTo(w * 0.1, h * 0.34)
    ctx.quadraticCurveTo(w * (0.1 + dx * 0.6), h * (0.34 + dy - 0.06), w * (0.1 + dx * 1.5), h * (0.34 + dy * 1.5))
    ctx.stroke()
  }
  ctx.save()
  ctx.shadowColor = color
  ctx.shadowBlur = h * 0.06
  text(ctx, top, w * 0.58, h * 0.36, h * 0.27, w * 0.66, color, { weight: 0.1, stroke: '#0a101d' })
  text(ctx, bottom, w * 0.58, h * 0.64, h * 0.27, w * 0.66, accent, { weight: 0.1, stroke: '#0a101d' })
  ctx.restore()
  text(ctx, sub, w * 0.58, h * 0.83, h * 0.09, w * 0.6, '#e8ecf5', { stroke: null })
}

Object.assign(PAINTERS, {
  harbourHotel: (ctx, w, h) => resortSign(ctx, w, h, { top: 'HARBOUR', bottom: 'HOTEL', color: '#5fe3ff', accent: '#ffd23a', sub: 'ROOMS · POOL · SEA VIEWS' }),
  skyInn: (ctx, w, h) => resortSign(ctx, w, h, { top: 'SKY', bottom: 'INN', color: '#ffd23a', accent: '#ff7a3a', sub: 'HIGHEST BEDS IN THE HARBOUR' }),
  docksideSuites: (ctx, w, h) => resortSign(ctx, w, h, { top: 'DOCKSIDE', bottom: 'SUITES', color: '#ff7a3a', accent: '#5fe3ff', sub: 'FRESH FISH · LATE CHECK-OUT' }),
  gullBayResort: (ctx, w, h) => resortSign(ctx, w, h, { top: 'GULL BAY', bottom: 'RESORT', color: '#5fe3ff', accent: '#ff7a3a', sub: 'PALMS · SPA · SUNSET DECK' }),
  craneView: (ctx, w, h) => resortSign(ctx, w, h, { top: 'CRANE', bottom: 'VIEW', color: '#ffd23a', accent: '#5fe3ff', sub: 'WAKE UP ABOVE THE CRANES' }),
  sunsetPier: (ctx, w, h) => resortSign(ctx, w, h, { top: 'SUNSET', bottom: 'PIER LODGE', color: '#ff7a3a', accent: '#ffd23a', sub: 'GOLDEN HOUR ALL DAY' }),
})

/** Painted atlases by size, shared by every billboard mesh (refcounted). */
const atlases = new Map()

function acquireAtlas(size, set) {
  const key = `${set}:${size}`
  let a = atlases.get(key)
  if (!a) {
    const arts = ART_SETS[set]
    // 1024 px: one page, two columns of 2:1 slots (each a quarter of the width tall).
    // Smaller: one column of the same 504 x 252 slots, two to a page.
    const cols = size >= 1024 ? 2 : 1
    const sw = size / cols
    const sh = sw / 2
    const perPage = size >= 1024 ? arts.length : 2
    const pad = Math.max(2, size / 256)
    const slot = {}
    const pages = []
    for (let first = 0; first < arts.length; first += perPage) {
      const group = arts.slice(first, first + perPage)
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = sh * Math.ceil(group.length / cols)
      const H = canvas.height
      const ctx = canvas.getContext('2d')
      group.forEach((art, i) => {
        const x = (i % cols) * sw
        const y = Math.floor(i / cols) * sh
        ctx.save()
        ctx.translate(x + pad, y + pad)
        PAINTERS[art](ctx, sw - pad * 2, sh - pad * 2)
        ctx.restore()
        slot[art] = { page: pages.length, uv: [(x + pad) / size, 1 - (y + sh - pad) / H, (x + sw - pad) / size, 1 - (y + pad) / H] }
      })
      const texture = new CanvasTexture(canvas)
      texture.colorSpace = SRGBColorSpace
      // Mipmapped: most billboards are seen from far away.
      texture.anisotropy = 4
      const material = new MeshBasicMaterial({ map: texture, alphaTest: 0.5 })
      pages.push({ texture, material })
    }
    a = { slot, pages, users: 0 }
    atlases.set(key, a)
  }
  a.users += 1
  return a
}

function releaseAtlas(key) {
  const a = atlases.get(key)
  if (!a) return
  a.users -= 1
  if (a.users > 0) return
  for (const p of a.pages) {
    p.material.dispose()
    p.texture.dispose()
  }
  atlases.delete(key)
}

/**
 * Builds a billboard mesh. `maxTexture` caps the atlas (1024 normally, 512 on LOW);
 * meshes of the same size and art set ('town', 'promo' or 'resort') share one texture and material.
 * @returns {{ mesh: Mesh, dispose: () => void }}
 */
export function buildBannerMesh(banners, maxTexture = 1024, set = 'town') {
  const size = Math.min(1024, maxTexture)
  const atlas = acquireAtlas(size, set)
  const { slot } = atlas

  const byPage = atlas.pages.map(() => ({ pos: [], uv: [] }))
  for (const b of banners) {
    const art = slot[b.art] || Object.values(slot)[0]
    const [u0, v0, u1, v1] = art.uv
    const out = byPage[art.page]
    const hw = b.width / 2
    const hh = b.height / 2
    const c = b.center
    const corner = (sx, sy) => [
      c[0] + b.right[0] * hw * sx + b.up[0] * hh * sy,
      c[1] + b.right[1] * hw * sx + b.up[1] * hh * sy,
      c[2] + b.right[2] * hw * sx + b.up[2] * hh * sy,
    ]
    const a = corner(-1, -1)
    const bb = corner(1, -1)
    const cc = corner(1, 1)
    const d = corner(-1, 1)
    out.pos.push(...a, ...bb, ...cc, ...a, ...cc, ...d)
    out.uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1)
  }
  // One mesh per atlas page that has billboards on it (a Group when there are several).
  const geometries = []
  const meshes = []
  byPage.forEach((g, i) => {
    if (!g.pos.length) return
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(g.pos), 3))
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(g.uv), 2))
    geometry.computeBoundingSphere()
    const mesh = new Mesh(geometry, atlas.pages[i].material)
    mesh.name = 'billboards'
    mesh.matrixAutoUpdate = false
    geometries.push(geometry)
    meshes.push(mesh)
  })
  let mesh = meshes[0]
  if (meshes.length !== 1) {
    mesh = new Group()
    mesh.name = 'billboards'
    for (const m of meshes) mesh.add(m)
  }
  return {
    mesh,
    dispose() {
      for (const g of geometries) g.dispose()
      releaseAtlas(`${set}:${size}`)
    },
  }
}
