/**
 * The menu buttons' faces, painted once into small bitmaps (canvas 2D) instead of CSS.
 *
 * The HUD is drawn flat because every kind of CSS gradient, blur and filter costs the browser
 * a GPU shader compile the first time it paints (ui/flatFill.js, hud/hudFlat.css): ~3 s on a
 * cold browser, right after the loading screen. A bitmap background is the plain image
 * paint the HUD already uses for its icons, so these faces can have all the finish a flat
 * colour can't - a glossy gradient, a sunburst behind the icon, a glow well, bevels, rivets -
 * for the price of a few small decoded images (about 4 ms of canvas work in all).
 *
 * `buildMenuArt()` paints one face per colour set plus the shared name plate, decodes them,
 * and resolves `{ faces: { [key]: dataUrl }, plate: dataUrl }` (cached; null where canvas or
 * decoding isn't available - the CSS falls back to the flat colours).
 */

/** Face and plate bitmap sizes (px): about 3x the buttons' CSS size, same proportions. */
const FACE = { w: 216, h: 168 }
const PLATE = { w: 216, h: 62 }

/** Every face's colours: [top, middle, bottom] of its body and the glow of the icon's well. */
export const MENU_COLOURS = {
  garage: { body: ['#9ff6ff', '#2fd3e6', '#128fb0'], glow: '#d6fbff' },
  spin: { body: ['#fff27a', '#ffcb1f', '#ff9a0a'], glow: '#fffbc2' },
  store: { body: ['#b6ff6a', '#57e83a', '#19b52a'], glow: '#e6ffc0' },
  leaderboards: { body: ['#c9a6ff', '#8a52f0', '#5a2cc0'], glow: '#eadbff' },
  settings: { body: ['#8fb4ff', '#4a78e0', '#2a4fb0'], glow: '#dce8ff' },
  respawn: { body: ['#ffc07a', '#ff8a2a', '#e8590c'], glow: '#ffe3c2' },
  lobby: { body: ['#e2e6ea', '#a9b0b8', '#7d858e'], glow: '#ffffff' },
  lobbyWarn: { body: ['#ff8a7a', '#ff3b3b', '#d4142a'], glow: '#ffd0c8' },
}

const INK = '#0d1530'

function make(w, h) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  return canvas
}

function rivet(ctx, x, y, r) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = INK
  ctx.fill()
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r * 0.78)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(1, '#aeb8c6')
  ctx.beginPath()
  ctx.arc(x, y, r * 0.72, 0, Math.PI * 2)
  ctx.fillStyle = g
  ctx.fill()
}

function paintFace({ body, glow }) {
  const { w, h } = FACE
  const canvas = make(w, h)
  const ctx = canvas.getContext('2d')
  // Body: the button's colour, light at the top to deep at the bottom.
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, body[0])
  g.addColorStop(0.5, body[1])
  g.addColorStop(1, body[2])
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  // A sunburst behind the icon: alternating light wedges fading outwards.
  const cx = w / 2
  const cy = h * 0.5
  ctx.save()
  const rays = 14
  const reach = Math.hypot(w, h)
  const fade = ctx.createRadialGradient(cx, cy, 6, cx, cy, reach * 0.62)
  fade.addColorStop(0, 'rgba(255,255,255,0.34)')
  fade.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = fade
  for (let i = 0; i < rays; i += 1) {
    const a0 = (i / rays) * Math.PI * 2 + 0.12
    const a1 = a0 + (Math.PI * 2) / rays / 2
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(a0) * reach, cy + Math.sin(a0) * reach)
    ctx.lineTo(cx + Math.cos(a1) * reach, cy + Math.sin(a1) * reach)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()

  // The icon's glow well.
  ctx.save()
  ctx.translate(cx, h * 0.52)
  ctx.scale(1, 0.88)
  const well = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.4)
  well.addColorStop(0, glow)
  well.addColorStop(0.55, glow + 'aa')
  well.addColorStop(1, glow + '00')
  ctx.fillStyle = well
  ctx.beginPath()
  ctx.arc(0, 0, w * 0.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // Fine diagonal grain, like brushed metal.
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'
  ctx.lineWidth = 2
  for (let x = -h; x < w + h; x += 11) {
    ctx.beginPath()
    ctx.moveTo(x, h)
    ctx.lineTo(x + h, 0)
    ctx.stroke()
  }
  ctx.restore()

  // Corner vignette: the edges a little deeper than the middle.
  const vig = ctx.createRadialGradient(cx, cy, h * 0.35, cx, cy, Math.hypot(w, h) * 0.62)
  vig.addColorStop(0, 'rgba(0,0,0,0)')
  vig.addColorStop(1, 'rgba(0,0,0,0.26)')
  ctx.fillStyle = vig
  ctx.fillRect(0, 0, w, h)

  // Gloss: a white cap over the top third, brightest at its top edge.
  const gloss = ctx.createLinearGradient(0, 0, 0, h * 0.42)
  gloss.addColorStop(0, 'rgba(255,255,255,0.7)')
  gloss.addColorStop(1, 'rgba(255,255,255,0.04)')
  ctx.fillStyle = gloss
  ctx.beginPath()
  ctx.moveTo(w * 0.07, h * 0.4)
  ctx.quadraticCurveTo(w * 0.07, h * 0.05, w * 0.3, h * 0.05)
  ctx.lineTo(w * 0.7, h * 0.05)
  ctx.quadraticCurveTo(w * 0.93, h * 0.05, w * 0.93, h * 0.4)
  ctx.quadraticCurveTo(w * 0.5, h * 0.3, w * 0.07, h * 0.4)
  ctx.closePath()
  ctx.fill()

  // Bevel: a light line along the top inside edge, a deeper band along the bottom.
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.fillRect(0, 0, w, 6)
  ctx.fillStyle = 'rgba(0,0,0,0.2)'
  ctx.fillRect(0, h - 12, w, 12)
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  ctx.fillRect(0, h - 12, w, 3)

  // Rivets in the top corners.
  rivet(ctx, w * 0.12, h * 0.16, w * 0.045)
  rivet(ctx, w * 0.88, h * 0.16, w * 0.045)

  // A couple of sparkles near the glow.
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  for (const [x, y, r] of [[0.24, 0.62, 3.2], [0.8, 0.5, 2.6], [0.7, 0.74, 2]]) {
    ctx.beginPath()
    ctx.arc(w * x, h * y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  return canvas.toDataURL('image/png')
}

function paintPlate() {
  const { w, h } = PLATE
  const canvas = make(w, h)
  const ctx = canvas.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#36559c')
  g.addColorStop(0.55, '#1a2f66')
  g.addColorStop(1, '#0f1c44')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  // A light edge on top and a faint sheen.
  ctx.fillStyle = 'rgba(255,255,255,0.28)'
  ctx.fillRect(0, 0, w, 5)
  const sheen = ctx.createLinearGradient(0, 0, 0, h * 0.55)
  sheen.addColorStop(0, 'rgba(255,255,255,0.14)')
  sheen.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = sheen
  ctx.fillRect(0, 5, w, h * 0.5)
  // Hazard-stripe nick at the very bottom.
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.fillRect(0, h - 6, w, 6)
  return canvas.toDataURL('image/png')
}

let cached = null

/** Decodes a data URL so its first paint doesn't hitch. */
function decoded(url) {
  const img = new Image()
  img.src = url
  return (img.decode ? img.decode() : Promise.resolve()).then(
    () => url,
    () => url,
  )
}

/** @returns {Promise<{ faces: Record<string, string>, plate: string } | null>} */
export function buildMenuArt() {
  if (cached) return cached
  cached = (async () => {
    try {
      const keys = Object.keys(MENU_COLOURS)
      const urls = keys.map((k) => paintFace(MENU_COLOURS[k]))
      const plateUrl = paintPlate()
      const all = await Promise.all([...urls, plateUrl].map(decoded))
      const faces = {}
      keys.forEach((k, i) => {
        faces[k] = all[i]
      })
      return { faces, plate: all[all.length - 1] }
    } catch {
      return null
    }
  })()
  return cached
}
