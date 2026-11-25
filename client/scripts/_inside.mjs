import { loadStage } from '@shared/stages/index'

// STAGE=<map id> (shared/stages/index.js), default Sky Docks.
const S = await loadStage(process.env.STAGE || 'sky-docks')
// Boxes that contain a point 0.5 m above the road surface (= solid sticking up through the road).
const inside = (b, p) => {
  const d = [p[0] - b.c[0], p[1] - b.c[1], p[2] - b.c[2]]
  return [b.ax, b.ay, b.az].every((ax, i) => Math.abs(d[0] * ax[0] + d[1] * ax[1] + d[2] * ax[2]) <= b.h[i])
}
const bad = new Map()
for (const p of S.path) {
  if (p.air) continue
  const q = [p.x + p.ux * 0.5, p.y + p.uy * 0.5, p.z + p.uz * 0.5]
  for (const b of S.boxes) {
    if (b.kind === 'ramp' || b.kind === 'garage' || b.kind === 'loopwall') continue
    if (Math.abs(b.c[0] - q[0]) > 40 || Math.abs(b.c[2] - q[2]) > 40) continue
    if (inside(b, q)) {
      const k = `${b.kind} sec${b.section} c=${b.c.map((v) => v.toFixed(1))}`
      if (!bad.has(k)) bad.set(k, { s: p.s, n: 0, h: b.h.map((v) => v.toFixed(2)), ay: b.ay.map((v) => v.toFixed(2)) })
      bad.get(k).n += 1
    }
  }
}
console.log('boxes poking up through the road:', bad.size)
for (const [k, v] of [...bad].slice(0, 30)) console.log(' ', k, 'at s', v.s, 'samples', v.n, 'h', v.h, 'ay', v.ay)
