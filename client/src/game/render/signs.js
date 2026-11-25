import { BufferAttribute, BufferGeometry, CanvasTexture, Group, LinearMipmapLinearFilter, Mesh, MeshBasicMaterial, SRGBColorSpace } from 'three'

/**
 * Flat world signs (checkpoint banners, section signposts, pier signs): every sign's
 * text is drawn once into a canvas atlas page and the signs are quads of one mesh per page.
 * A page is at most `maxTexture` px (512 on LOW), so a map with many signs gets a few pages
 * (draw calls) - up to 4 on LOW, 3 on HIGH - and each sign is painted as big as its size in
 * the world asks for (about 28 px per metre on LOW, 40 on HIGH) instead of everything
 * being shrunk into one texture until the lettering is mush.
 *
 * A sign: `{ text, sub?, center: [x,y,z], right: [x,y,z], up: [x,y,z], width, height,
 *            bg, fg, subFg? }` - the quad faces along right x up.
 */

const FONT = '"Fredoka One", "Arial Rounded MT Bold", sans-serif'
/** A painted slot is 4:1; its width (px) runs from SLOT_MIN to SLOT_MAX; gutters keep neighbours from bleeding in. */
const SLOT_ASPECT = 4
const SLOT_MIN = 64
const SLOT_MAX = 512
const GUTTER = 2

/** Waits (briefly) for the game font so the atlas isn't drawn in a fallback face. */
export async function fontReady() {
  if (typeof document === 'undefined' || !document.fonts?.load) return
  await Promise.race([document.fonts.load(`64px ${FONT}`), new Promise((r) => setTimeout(r, 1500))])
}

/**
 * Shelf-packs one slot per entry of `widths` (sign widths, m) into square pages of `page`
 * px, each slot `ppm` px per metre wide (within SLOT_MIN..SLOT_MAX).
 * @returns {{ at: { page: number, x: number, y: number, w: number, h: number }[], heights: number[] } | null} null if it needs more than `maxPages`
 */
function packSlots(widths, page, maxPages, ppm) {
  const dims = widths.map((m) => {
    const w = Math.max(SLOT_MIN, Math.min(SLOT_MAX, Math.round((m * ppm) / 16) * 16))
    return { w, h: Math.round(w / SLOT_ASPECT) }
  })
  const order = dims.map((_, i) => i).sort((p, q) => dims[q].h - dims[p].h || dims[q].w - dims[p].w)
  const pages = []
  const at = new Array(dims.length)
  for (const i of order) {
    const { w, h } = dims[i]
    let placed = false
    for (let p = 0; p < pages.length && !placed; p += 1) {
      const pg = pages[p]
      for (const sh of pg.shelves) {
        if (sh.h >= h && sh.x + w <= page) {
          at[i] = { page: p, x: sh.x, y: sh.y, w, h }
          sh.x += w + GUTTER
          placed = true
          break
        }
      }
      if (!placed && pg.y + h <= page) {
        pg.shelves.push({ y: pg.y, h, x: w + GUTTER })
        at[i] = { page: p, x: 0, y: pg.y, w, h }
        pg.y += h + GUTTER
        placed = true
      }
    }
    if (!placed) {
      if (pages.length >= maxPages) return null
      pages.push({ y: h + GUTTER, shelves: [{ y: 0, h, x: w + GUTTER }] })
      at[i] = { page: pages.length - 1, x: 0, y: 0, w, h }
    }
  }
  return { at, heights: pages.map((pg) => pg.y) }
}

export function buildSignMesh(signs, maxTexture = 1024) {
  // Signs with the same artwork share one atlas slot (e.g. a "SAFE ZONE" on every plaza).
  const slotKey = (s) => `${s.text}|${s.sub || ''}|${s.bg || ''}|${s.fg || ''}|${s.subFg || ''}`
  const slotOf = new Map()
  const slots = []
  for (const s of signs) {
    const k = slotKey(s)
    const i = slotOf.get(k)
    if (i === undefined) {
      slotOf.set(k, slots.length)
      slots.push({ sign: s, width: s.width })
    } else slots[i].width = Math.max(slots[i].width, s.width)
  }
  const page = Math.min(1024, maxTexture)
  const ppm = page >= 1024 ? 40 : 28
  const maxPages = page >= 1024 ? 3 : 4
  const widths = slots.map((sl) => sl.width)
  // As big as the world size asks for; shrunk step by step until it fits the page budget.
  let layout = null
  for (let k = 1; k > 0.15 && !layout; k *= 0.85) layout = packSlots(widths, page, maxPages, ppm * k)
  layout ||= packSlots(widths, page, Infinity, ppm * 0.15)
  const { at, heights } = layout
  const canvases = heights.map((h) => {
    const c = document.createElement('canvas')
    c.width = page
    c.height = Math.min(page, 2 ** Math.ceil(Math.log2(Math.max(16, h))))
    return c
  })
  const ctxs = canvases.map((c) => c.getContext('2d'))

  slots.forEach((slot, i) => {
    const { page: pg, x, y, w, h } = at[i]
    const s = slot.sign
    const ctx = ctxs[pg]
    const scale = w / SLOT_MAX
    paintBoard(ctx, x, y, w, h, scale, s.bg || '#ff7a1a')
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const hasSub = Boolean(s.sub)
    fitText(ctx, s.text, x + w / 2, y + h * (hasSub ? 0.4 : 0.52), w - 30 * scale, (hasSub ? 58 : 72) * scale, s.fg || '#ffffff')
    if (hasSub) fitText(ctx, s.sub, x + w / 2, y + h * 0.78, w - 40 * scale, 30 * scale, s.subFg || 'rgba(255,255,255,0.85)')
  })

  const pos = canvases.map(() => [])
  const uv = canvases.map(() => [])
  for (const s of signs) {
    const a = at[slotOf.get(slotKey(s))]
    const W = canvases[a.page].width
    const H = canvases[a.page].height
    // Quad, with a small aspect-correct inset.
    const hw = s.width / 2
    const hh = s.height / 2
    const c = s.center
    const corner = (sx, sy) => [
      c[0] + s.right[0] * hw * sx + s.up[0] * hh * sy,
      c[1] + s.right[1] * hw * sx + s.up[1] * hh * sy,
      c[2] + s.right[2] * hw * sx + s.up[2] * hh * sy,
    ]
    const p0 = corner(-1, -1)
    const p1 = corner(1, -1)
    const p2 = corner(1, 1)
    const p3 = corner(-1, 1)
    pos[a.page].push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3)
    const u0 = (a.x + 1) / W
    const u1 = (a.x + a.w - 1) / W
    const v0 = 1 - (a.y + a.h - 1) / H
    const v1 = 1 - (a.y + 1) / H
    uv[a.page].push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1)
  }

  const parts = canvases.map((canvas, i) => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos[i]), 3))
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uv[i]), 2))
    geometry.computeBoundingSphere()
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    // Mipmapped, so the lettering stays smooth (not sparkling) at a distance.
    texture.minFilter = LinearMipmapLinearFilter
    texture.generateMipmaps = true
    texture.anisotropy = 4
    const material = new MeshBasicMaterial({ map: texture, alphaTest: 0.35 })
    const mesh = new Mesh(geometry, material)
    mesh.name = 'signs'
    return { mesh, geometry, material, texture }
  })
  let mesh = parts[0].mesh
  if (parts.length > 1) {
    mesh = new Group()
    mesh.name = 'signs'
    for (const p of parts) mesh.add(p.mesh)
  }
  return {
    mesh,
    dispose() {
      for (const p of parts) {
        p.geometry.dispose()
        p.material.dispose()
        p.texture.dispose()
      }
    },
  }
}

/** `#rrggbb` scaled by k (k < 1 darker, k > 1 lighter); null for anything else. */
function shadeHex(hex, k) {
  if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return null
  const n = parseInt(hex.slice(1), 16)
  const ch = (v) => Math.max(0, Math.min(255, Math.round(k > 1 ? v + (255 - v) * (k - 1) : v * k)))
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`
}

/**
 * A sign board: an ink rim, a glossy gradient face in the sign's colour, a thin light
 * inner bevel, a gloss band over the top and a hazard-striped foot. Transparent or
 * non-hex backgrounds (painted lettering) get no board.
 */
function paintBoard(ctx, x, y, w, h, scale, bg) {
  const top = shadeHex(bg, 1.22)
  if (!top) return
  const r = 20 * scale
  ctx.fillStyle = '#0d1530'
  roundRect(ctx, x + 2, y + 2, w - 4, h - 4, r)
  ctx.fill()
  const g = ctx.createLinearGradient(0, y + 6 * scale, 0, y + h - 6 * scale)
  g.addColorStop(0, top)
  g.addColorStop(0.55, bg)
  g.addColorStop(1, shadeHex(bg, 0.72))
  ctx.fillStyle = g
  roundRect(ctx, x + 7 * scale, y + 7 * scale, w - 14 * scale, h - 14 * scale, r * 0.75)
  ctx.fill()
  ctx.save()
  ctx.clip()
  // Hazard-striped foot.
  const footH = 9 * scale
  ctx.fillStyle = '#ffc41f'
  ctx.fillRect(x, y + h - 7 * scale - footH, w, footH)
  ctx.fillStyle = '#24282e'
  for (let k = -h; k < w + h; k += 22 * scale) {
    ctx.beginPath()
    ctx.moveTo(x + k, y + h - 7 * scale)
    ctx.lineTo(x + k + 11 * scale, y + h - 7 * scale)
    ctx.lineTo(x + k + 11 * scale + footH, y + h - 7 * scale - footH)
    ctx.lineTo(x + k + footH, y + h - 7 * scale - footH)
    ctx.fill()
  }
  // Gloss band.
  const gl = ctx.createLinearGradient(0, y, 0, y + h * 0.5)
  gl.addColorStop(0, 'rgba(255,255,255,0.32)')
  gl.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gl
  ctx.fillRect(x, y, w, h * 0.46)
  ctx.restore()
  ctx.lineWidth = 3 * scale
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'
  roundRect(ctx, x + 10 * scale, y + 10 * scale, w - 20 * scale, h - 20 * scale, r * 0.6)
  ctx.stroke()
}

function fitText(ctx, text, x, y, maxW, size, fill) {
  let s = size
  ctx.font = `${s}px ${FONT}`
  while (ctx.measureText(text).width > maxW && s > 10) {
    s -= 2
    ctx.font = `${s}px ${FONT}`
  }
  ctx.lineJoin = 'round'
  // Drop shadow, then the ink outline, then the letters.
  ctx.lineWidth = Math.max(2, s * 0.16)
  ctx.strokeStyle = 'rgba(13,21,48,0.55)'
  ctx.strokeText(text, x, y + s * 0.07)
  ctx.fillStyle = 'rgba(13,21,48,0.55)'
  ctx.fillText(text, x, y + s * 0.07)
  ctx.strokeStyle = 'rgba(13,21,48,0.95)'
  ctx.strokeText(text, x, y)
  ctx.fillStyle = fill
  ctx.fillText(text, x, y)
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
