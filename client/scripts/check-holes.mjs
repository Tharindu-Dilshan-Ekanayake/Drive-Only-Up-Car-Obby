// Finds holes in the road: places where the road you SEE (the ribbons) has no solid
// collider under it, or the collider is at a different height (a step or dip you'd fall
// through or trip on). Casts a ray down every metre along every ribbon, across its
// whole drivable width (curbs excluded), and reports misses and mismatches > 12 cm.
// Also checks for sharp slope breaks along the path (bumps that launch a car).
//
//   cd client && node --import ./scripts/node-loader.mjs scripts/check-holes.mjs
import { Vector3 } from 'three'

import { lobbyBoxes } from '@shared/lobby'
import { loadStage } from '@shared/stages/index'
import { CURB_WIDTH } from '@shared/track'

import { PhysicsWorld } from '../src/game/physics/world.js'
import { createObstacles, obstacleStaticBoxes } from '../src/game/track/obstacleSim.js'

// STAGE=<map id> (shared/stages/index.js), default Sky Docks.
const STAGE = await loadStage(process.env.STAGE || 'sky-docks')

const stage = STAGE
const world = new PhysicsWorld()
world.addStaticBoxes(lobbyBoxes(), 'lobby')
world.addStaticBoxes(stage.boxes, 'stage')
world.addStaticBoxes(obstacleStaticBoxes(stage), 'stage-static')

const origin = new Vector3()
const dir = new Vector3()
const hit = { normal: new Vector3(), dist: 0, grip: 1, dynamic: null, kind: '' }
const TOL = 0.12
const problems = []

for (const rib of stage.ribbons) {
  const cs = rib.cs
  for (let i = 0; i < cs.length - 1; i += 1) {
    const a = cs[i]
    const b = cs[i + 1]
    const len = Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2])
    const steps = Math.max(1, Math.ceil(len))
    for (let k = 0; k <= steps; k += 1) {
      const t = k / steps
      const lerp = (u, v) => u + (v - u) * t
      const p = [0, 1, 2].map((j) => lerp(a.p[j], b.p[j]))
      const r = [0, 1, 2].map((j) => lerp(a.r[j], b.r[j]))
      const u = [0, 1, 2].map((j) => lerp(a.u[j], b.u[j]))
      const ul = Math.hypot(...u)
      const w = lerp(a.w, b.w)
      const inner = w / 2 - (rib.curbs ? CURB_WIDTH : 0) - 0.4
      for (let lane = -inner; lane <= inner + 1e-6; lane += Math.max(0.5, inner / 4)) {
        const surf = [p[0] + r[0] * lane, p[1] + r[1] * lane, p[2] + r[2] * lane]
        origin.set(surf[0] + (u[0] / ul) * 1.5, surf[1] + (u[1] / ul) * 1.5, surf[2] + (u[2] / ul) * 1.5)
        dir.set(-u[0] / ul, -u[1] / ul, -u[2] / ul)
        const found = world.raycast(origin, dir, 4, hit)
        const off = found ? hit.dist - 1.5 : Infinity
        // A miss: measure how long the hole is along the road (a hairline crack at a
        // joint is still a hole for a wheel ray, but a wide one swallows the car).
        let holeLen = 0
        if (!found) {
          const f = [b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]].map((v) => v / (len || 1))
          for (const sgn of [-1, 1]) {
            for (let d = 0.02; d <= 3; d += 0.02) {
              origin.set(surf[0] + f[0] * d * sgn + (u[0] / ul) * 1.5, surf[1] + f[1] * d * sgn + (u[1] / ul) * 1.5, surf[2] + f[2] * d * sgn + (u[2] / ul) * 1.5)
              if (world.raycast(origin, dir, 4, hit)) break
              holeLen += 0.02
            }
          }
        }
        if (!found || Math.abs(off) > TOL) {
          problems.push({ holeLen, section: rib.section, s: lerp(a.s, b.s), lane, off, kind: found ? hit.kind : 'NONE', x: surf[0], y: surf[1], z: surf[2], style: rib.style })
        }
      }
    }
  }
}

// Round platforms (Stunt Bowl, sweeper deck; shared/track.js roundPiece) aren't ribbons:
// check their drawn surfaces the same way - the floor wedges (bar the kickers and the
// hub), the quarter-pipe facets along their own normals, and the deck ring.
let roundPts = 0
const roundBad = []
for (const r of stage.rounds || []) {
  const tanH = Math.tan(Math.PI / r.n)
  const f = [-Math.sin(r.yaw), 0, -Math.cos(r.yaw)]
  const rt = [Math.cos(r.yaw), 0, -Math.sin(r.yaw)]
  const probe = (p, nrm, what) => {
    roundPts += 1
    origin.set(p[0] + nrm[0] * 1.5, p[1] + nrm[1] * 1.5, p[2] + nrm[2] * 1.5)
    dir.set(-nrm[0], -nrm[1], -nrm[2])
    const found = world.raycast(origin, dir, 4, hit)
    const off = found ? hit.dist - 1.5 : Infinity
    if (!found || Math.abs(off) > TOL) roundBad.push({ kind: r.kind, what, off, hit: found ? hit.kind : 'NONE', at: p.map(Math.round) })
  }
  const onKicker = (p) =>
    r.kickers.some((k) => {
      const dx = p[0] - r.c[0]
      const dz = p[2] - r.c[2]
      const lat = dx * rt[0] + dz * rt[2]
      const along = dx * f[0] + dz * f[2]
      return Math.abs(lat - k.lat) < k.width / 2 + 0.5 && along > k.along - 0.5 && along < k.along + k.length + k.back + 0.5
    })
  for (let i = 0; i < r.n; i += 1) {
    const a = (i * 2 * Math.PI) / r.n
    const d = [f[0] * Math.cos(a) + rt[0] * Math.sin(a), 0, f[2] * Math.cos(a) + rt[2] * Math.sin(a)]
    const t = [-f[0] * Math.sin(a) + rt[0] * Math.cos(a), 0, -f[2] * Math.sin(a) + rt[2] * Math.cos(a)]
    const P = (dd, q, y) => [r.c[0] + d[0] * dd + t[0] * q, r.c[1] + y, r.c[2] + d[2] * dd + t[2] * q]
    const A = r.open[i] && r.rim ? r.Ro : r.R
    // (Not under a wall: the spinner's walled edges, and the arena aprons' outer edge.)
    const walled = !r.rim || r.open[i]
    for (let dd = 2.5; dd < A - (walled ? r.wall.t + 0.3 : 0.3); dd += 1.5) {
      for (let q = -(dd * tanH - 0.3); q <= dd * tanH - 0.3 + 1e-6; q += Math.max(0.5, dd * tanH - 0.3)) {
        const p = P(dd, q, 0)
        if (onKicker(p)) continue
        probe(p, [0, 1, 0], 'floor')
      }
    }
    if (!r.rim || r.open[i]) continue
    const rq = r.rim.Rq
    for (let deg = 4; deg < r.rim.deg - 1; deg += 6) {
      const th = (deg * Math.PI) / 180
      // The drawn facet (a chord) lies a little inside the arc: measure on the chord.
      const k0 = Math.floor(deg / r.rim.facet) * r.rim.facet
      const t0 = (k0 * Math.PI) / 180
      const t1 = (Math.min(r.rim.deg, k0 + r.rim.facet) * Math.PI) / 180
      const u = (th - t0) / (t1 - t0)
      const cd = r.R + rq * (Math.sin(t0) + (Math.sin(t1) - Math.sin(t0)) * u)
      const cy = rq * (1 - Math.cos(t0) + (Math.cos(t0) - Math.cos(t1)) * u)
      const nrm = [-d[0] * Math.sin((t0 + t1) / 2), Math.cos((t0 + t1) / 2), -d[2] * Math.sin((t0 + t1) / 2)]
      for (const qf of [-0.85, 0, 0.85]) probe(P(cd, qf * cd * tanH, cy), nrm, 'rim')
    }
    for (const qf of [-0.8, 0, 0.8]) probe(P((r.Dq + r.Ro - r.wall.t) / 2, qf * r.Dq * tanH, r.H), [0, 1, 0], 'deck')
  }
}
console.log(`round platforms (${(stage.rounds || []).length}): ${roundPts} surface samples, ${roundBad.length} with no collider / wrong height`)
for (const b of roundBad.slice(0, 20)) console.log(`  ${b.kind} ${b.what} @${b.at} ${Number.isFinite(b.off) ? `off ${b.off.toFixed(2)} m (hit ${b.hit})` : 'NO FLOOR'}`)

// Group nearby problems into spots.
const spots = []
for (const p of problems) {
  const near = spots.find((s) => s.section === p.section && Math.abs(s.s1 - p.s) < 6)
  if (near) {
    near.s1 = Math.max(near.s1, p.s)
    near.n += 1
    near.worst = Math.abs(p.off) > Math.abs(near.worst) ? p.off : near.worst
    near.hole = Math.max(near.hole, p.holeLen)
    near.lanes.add(Math.round(p.lane))
    near.kinds.add(p.kind)
  } else spots.push({ hole: p.holeLen, section: p.section, s0: p.s, s1: p.s, n: 1, worst: p.off, lanes: new Set([Math.round(p.lane)]), kinds: new Set([p.kind]), at: [p.x, p.y, p.z].map(Math.round), style: p.style })
}

// Slope breaks: a sudden change of the road's pitch between consecutive path samples.
const breaks = []
const path = stage.path
for (let i = 1; i < path.length - 1; i += 1) {
  const a = path[i - 1]
  const b = path[i + 1]
  if (a.air || b.air || a.section !== b.section) continue
  const d = Math.asin(Math.max(-1, Math.min(1, b.fy))) - Math.asin(Math.max(-1, Math.min(1, a.fy)))
  if (Math.abs(d) > 0.09) breaks.push({ section: path[i].section, s: Math.round(path[i].s), deg: +((d * 180) / Math.PI).toFixed(1) })
}

console.log(`road samples with no collider / wrong height: ${problems.length} in ${spots.length} spots`)
for (const s of spots.slice(0, 60)) {
  const sec = stage.sections[s.section]?.name
  console.log(`  sec ${s.section} ${sec?.padEnd(18)} s ${s.s0.toFixed(0)}-${s.s1.toFixed(0)}  ${s.n} pts  worst ${Number.isFinite(s.worst) ? s.worst.toFixed(2) + ' m' : `NO FLOOR (hole ${s.hole.toFixed(2)} m long)`}  lanes ${[...s.lanes].join(',')}  hit ${[...s.kinds].join('/')}  ${s.style}  @${s.at}`)
}
console.log(`sharp slope breaks (> 5 deg within 4 m): ${breaks.length}`)
for (const b of breaks.slice(0, Number(process.env.BREAKS || 30))) console.log(`  sec ${b.section} s ${b.s}  ${b.deg} deg`)

// Pontoon bridges: the moving planks have no ribbon (they're drawn instanced), so check
// them here - at rest each must be a floor, flush (within the swell) with the path - and
// list the intentional gaps between planks (the path runs on over them; none may be
// wider than a stride).
const sim = createObstacles(stage, world)
sim.update(0, -Infinity, Infinity, null)
const pontoons = sim.list.filter((e) => e.o.type === 'pontoon')
let badPlanks = 0
for (const e of pontoons) {
  const { o, f } = e
  for (const [along, lane] of [[0, 0], [o.length * 0.4, o.width * 0.4], [-o.length * 0.4, -o.width * 0.4]]) {
    const p = f.base.clone().addScaledVector(f.fwd, along).addScaledVector(f.right, lane)
    origin.copy(p).addScaledVector(f.up, 1.5)
    dir.copy(f.up).negate()
    const found = world.raycast(origin, dir, 4, hit)
    const off = found ? hit.dist - 1.5 : Infinity
    if (!found || !hit.dynamic || Math.abs(off) > TOL) {
      badPlanks += 1
      console.log(`  pontoon ${o.id} (sec ${o.section}) at ${along.toFixed(1)}/${lane.toFixed(1)}: ${found ? `${hit.dynamic ? 'deck' : hit.kind} off ${off.toFixed(2)} m` : 'NO FLOOR'}`)
    }
  }
}
const gaps = []
// (Drawbridges, the turntable and the lifts span their gaps only part of the time: the
// headless drive covers those.)
const timed = stage.obstacles.filter((o) => ['drawbridge', 'turntable', 'lift'].includes(o.type))
// (The last sample sits on the finish plaza's far edge: nothing is expected beyond it.)
for (let i = 1; i < path.length - 1; i += 1) {
  const p = path[i]
  if (p.air || timed.some((o) => i >= o.piStart - 2 && i <= o.piEnd + 2)) continue
  origin.set(p.x + p.ux * 1.5, p.y + p.uy * 1.5, p.z + p.uz * 1.5)
  dir.set(-p.ux, -p.uy, -p.uz)
  if (world.raycast(origin, dir, 4, hit)) continue
  // Off the floor: how far along the road until there's floor again?
  let gap = 0
  for (let d = -1.5; d <= 1.5; d += 0.05) {
    origin.set(p.x + p.fx * d + p.ux * 1.5, p.y + p.fy * d + p.uy * 1.5, p.z + p.fz * d + p.uz * 1.5)
    if (!world.raycast(origin, dir, 4, hit)) gap += 0.05
  }
  gaps.push({ section: p.section, s: p.s, gap })
}
const wide = gaps.filter((g) => g.gap > 1.2)
console.log(`moving pontoons: ${pontoons.length} checked, ${badPlanks} not flush at rest`)
console.log(`intentional plank gaps under the path: ${gaps.length}, widest ${Math.max(0, ...gaps.map((g) => g.gap)).toFixed(2)} m${wide.length ? `, ${wide.length} WIDER THAN A STRIDE` : ''}`)
for (const g of wide.slice(0, 10)) console.log(`  sec ${g.section} s ${g.s.toFixed(0)} gap ${g.gap.toFixed(2)} m`)
process.exitCode = spots.length || badPlanks || wide.length || roundBad.length ? 1 : 0
