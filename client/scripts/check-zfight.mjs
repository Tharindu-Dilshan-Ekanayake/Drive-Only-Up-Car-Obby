// Finds z-fighting in the static world: pairs of triangles that face the same way, lie
// on the same plane (within 1.5 cm) and overlap by more than a sliver, across the
// stage, the pier, the harbour town and the track city. Differently coloured or
// patterned pairs are what flickers on screen.
//
//   cd client && node --import ./scripts/node-loader.mjs scripts/check-zfight.mjs [--all]
import { loadStage, stageInfo } from '@shared/stages/index'

import { buildStageGeometry } from '../src/game/track/buildTrack.js'
import { buildTrackCity } from '../src/game/world/cityGeometry.js'
import { buildHarbour } from '../src/game/world/harbourGeometry.js'
import { buildGarageGlass, buildPier } from '../src/game/world/pierGeometry.js'

// STAGE=<map id> (shared/stages/index.js), default Sky Docks.
const STAGE = await loadStage(process.env.STAGE || 'sky-docks')

const PLANE_TOL = 0.015
const OVERLAP = 0.02 // metres the triangles must interpenetrate (not just share an edge)
const showAll = process.argv.includes('--all')

const meshes = []
const info = stageInfo(STAGE.id)
const stage = buildStageGeometry(STAGE, info?.theme?.track, info?.zones)
stage.sections.forEach((s) => meshes.push({ name: `stage:${s.index}`, g: s.geometry }))
// The glass tube panels: a see-through mesh of their own (overlapping each other is fine).
stage.glass.forEach((s) => meshes.push({ name: `tube-glass:${s.index}`, g: s.geometry, skipSelf: true }))
meshes.push({ name: 'pier', g: buildPier().geometry })
meshes.push({ name: 'garage-glass', g: buildGarageGlass(), skipSelf: true })
meshes.push({ name: 'harbour', g: buildHarbour(true).geometry })
// The map's scenery: the Grand Tour's zones have their own (neon city, snowy mountain,
// tropical island, desert canyon), the
// docks the track city.
const scenery = info?.theme?.scenery
if (scenery === 'grandTour') {
  const { zoneView } = await import('../src/game/world/zoneView.js')
  const { buildNeonCity } = await import('../src/game/world/neon/neonCityGeometry.js')
  const { buildSnowWorld } = await import('../src/game/world/snow/snowGeometry.js')
  const neon = buildNeonCity(zoneView(STAGE, 'neon'), { density: 1, detail: true, lowRise: true })
  for (const c of neon.chunks) meshes.push({ name: `neon:${c.key}`, g: c.geometry })
  meshes.push({ name: 'neon:ground', g: neon.ground })
  for (const c of buildSnowWorld(zoneView(STAGE, 'snow'), { density: 1 }).chunks) meshes.push({ name: `snow:${c.key}`, g: c.geometry })
  // The Tropical Island (world/tropic/tropicGeometry.js): terrain tiles with the set pieces,
  // and the water (lagoons, waterfall, lava) checked against them (its kind as the pattern).
  const { buildTropicWorld } = await import('../src/game/world/tropic/tropicGeometry.js')
  const tropic = buildTropicWorld(zoneView(STAGE, 'tropic'), { density: 1 })
  for (const c of tropic.chunks) meshes.push({ name: `tropic:${c.key}`, g: c.geometry })
  const water = tropic.water
  const kinds = water.attributes.aWater.array
  const pat = new Float32Array((kinds.length / 3) * 2)
  for (let i = 0; i < kinds.length / 3; i += 1) pat[i * 2] = 100 + kinds[i * 3]
  meshes.push({ name: 'tropic:water', g: { attributes: { position: water.attributes.position, color: water.attributes.color, aPattern: { array: pat } } } })
  // The Desert Canyon (world/canyon/canyonGeometry.js): terrain tiles with the set pieces.
  const { buildCanyonWorld } = await import('../src/game/world/canyon/canyonGeometry.js')
  for (const c of buildCanyonWorld(zoneView(STAGE, 'canyon'), { density: 1 }).chunks) meshes.push({ name: `canyon:${c.key}`, g: c.geometry })
} else if (scenery === 'heat') {
  // Heat Run's Rustport (world/heat/heatGeometry.js).
  const { buildHeatCity } = await import('../src/game/world/heat/heatGeometry.js')
  for (const c of buildHeatCity(STAGE, { density: 1, detail: true }).chunks) meshes.push({ name: `heat:${c.key}`, g: c.geometry })
} else if (scenery === 'docks' || !scenery) for (const c of buildTrackCity(STAGE, 1, true).chunks) meshes.push({ name: `city:${c.chunk}`, g: c.geometry })

const tris = []
for (const m of meshes) {
  const p = m.g.attributes.position.array
  const c = m.g.attributes.color.array
  const pat = m.g.attributes.aPattern.array
  for (let i = 0; i < p.length; i += 9) {
    const a = [p[i], p[i + 1], p[i + 2]]
    const b = [p[i + 3], p[i + 4], p[i + 5]]
    const d = [p[i + 6], p[i + 7], p[i + 8]]
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]]
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    const len = Math.hypot(...n)
    if (len < 1e-6) continue
    n = n.map((x) => x / len)
    const vi = i / 3
    tris.push({
      mesh: m.name,
      skipSelf: m.skipSelf,
      a,
      b,
      c: d,
      n,
      d: n[0] * a[0] + n[1] * a[1] + n[2] * a[2],
      color: `${c[vi * 3].toFixed(2)},${c[vi * 3 + 1].toFixed(2)},${c[vi * 3 + 2].toFixed(2)}`,
      pat: pat[vi * 2],
    })
  }
}

// Bucket by quantised normal and plane distance.
const buckets = new Map()
const keyOf = (t, dd) => `${Math.round(t.n[0] * 20)},${Math.round(t.n[1] * 20)},${Math.round(t.n[2] * 20)}|${Math.round(t.d / 2) + dd}`
for (const t of tris) {
  const k = keyOf(t, 0)
  if (!buckets.has(k)) buckets.set(k, [])
  buckets.get(k).push(t)
}

/** 2D projection dropping the normal's dominant axis. */
function project(t) {
  const ax = Math.abs(t.n[0])
  const ay = Math.abs(t.n[1])
  const az = Math.abs(t.n[2])
  const [i, j] = ax >= ay && ax >= az ? [1, 2] : ay >= az ? [0, 2] : [0, 1]
  return [t.a, t.b, t.c].map((p) => [p[i], p[j]])
}

/** Interpenetration depth of two 2D triangles by SAT (negative = separated). */
function overlapDepth(A, B) {
  let min = Infinity
  for (const T of [A, B]) {
    for (let e = 0; e < 3; e += 1) {
      const p = T[e]
      const q = T[(e + 1) % 3]
      const ax = [-(q[1] - p[1]), q[0] - p[0]]
      const l = Math.hypot(...ax)
      if (l < 1e-9) continue
      ax[0] /= l
      ax[1] /= l
      const proj = (P) => P.map((v) => v[0] * ax[0] + v[1] * ax[1])
      const pa = proj(A)
      const pb = proj(B)
      const o = Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb))
      min = Math.min(min, o)
    }
  }
  return min
}

const found = new Map()
for (const [k, list] of buckets) {
  const [nk, dk] = k.split('|')
  const near = [...list, ...(buckets.get(`${nk}|${Number(dk) + 1}`) || [])]
  for (let i = 0; i < list.length; i += 1) {
    const t = list[i]
    const P = project(t)
    const box = (Q) => [Math.min(...Q.map((q) => q[0])), Math.min(...Q.map((q) => q[1])), Math.max(...Q.map((q) => q[0])), Math.max(...Q.map((q) => q[1]))]
    const bt = box(P)
    for (let j = list === near ? i + 1 : 0; j < near.length; j += 1) {
      const o = near[j]
      if (o === t || (j < list.length && j <= i)) continue
      if (t.n[0] * o.n[0] + t.n[1] * o.n[1] + t.n[2] * o.n[2] < 0.9995) continue
      // Every vertex of each within PLANE_TOL of the other's plane (the plane constant
      // alone is unreliable far from the origin).
      const off = (P, T) => Math.abs(T.n[0] * P[0] + T.n[1] * P[1] + T.n[2] * P[2] - T.d)
      if ([o.a, o.b, o.c].some((q) => off(q, t) > PLANE_TOL) || [t.a, t.b, t.c].some((q) => off(q, o) > PLANE_TOL)) continue
      if (t.mesh === o.mesh && t.skipSelf) continue
      const Q = project(o)
      const bo = box(Q)
      if (bo[0] > bt[2] || bo[2] < bt[0] || bo[1] > bt[3] || bo[3] < bt[1]) continue
      if (overlapDepth(P, Q) < OVERLAP) continue
      const differs = t.color !== o.color || t.pat !== o.pat
      if (!differs && !showAll) continue
      const where = t.a.map((x) => Math.round(x)).join(',')
      const key = `${t.mesh} x ${o.mesh} @${Math.round(t.a[0] / 5) * 5},${Math.round(t.a[1] / 5) * 5},${Math.round(t.a[2] / 5) * 5}`
      if (process.env.DUMP && key.includes(process.env.DUMP)) console.log(JSON.stringify({ t: [t.a, t.b, t.c, t.d], o: [o.a, o.b, o.c, o.d] }))
      if (!found.has(key)) found.set(key, { count: 0, where, a: `${t.color} p${t.pat}`, b: `${o.color} p${o.pat}` })
      found.get(key).count += 1
    }
  }
}

console.log(`triangles checked: ${tris.length}`)
console.log(`z-fighting spots: ${found.size}`)
for (const [k, v] of [...found].slice(0, 60)) console.log(`  ${k}  (${v.count} pairs) near ${v.where}  [${v.a}] vs [${v.b}]`)
process.exitCode = found.size ? 1 : 0
