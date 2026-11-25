// Sanity checks for the stage layout: stats, and places where the road passes over
// itself with too little headroom (non-adjacent sections, < 7 m apart vertically).
import { loadStage } from '../shared/stages/index.js'
import { lobbyBoxes } from '../shared/lobby.js'
import { footprintDistance, ROAD_THICKNESS, stageFootprints, TUBE } from '../shared/track.js'

// STAGE=<map id> (shared/stages/index.js), default Sky Docks.
const st = await loadStage(process.env.STAGE || 'sky-docks')
console.log(`stage ${st.id}: length ${st.length.toFixed(0)} m, max altitude ${st.maxAltitude.toFixed(1)} m`)
console.log(`boxes ${st.boxes.length}, path ${st.path.length}, cps ${st.checkpoints.length}, coins ${st.coins.length}, items ${st.items.length}, obstacles ${st.obstacles.length}, triggers ${st.triggers.length}, supports ${st.supports.length}`)
const crateRows = new Set(st.items.map((c) => c.row))
console.log(`crates: ${crateRows.size} rows, missile in ${new Set(st.items.filter((c) => c.item === 'missile').map((c) => c.row)).size}`)
for (const c of st.checkpoints) console.log(`  CP${c.index} ${c.name.padEnd(14)} y=${c.y.toFixed(1)} s=${c.s.toFixed(0)}`)
const path = st.path
let problems = 0
for (let i = 0; i < path.length; i += 3) {
  for (let j = i + 40; j < path.length; j += 3) {
    const a = path[i], b = path[j]
    const dxz = Math.hypot(a.x - b.x, a.z - b.z)
    const minW = (a.w + b.w) / 2
    if (dxz < minW && Math.abs(a.y - b.y) < 7 && Math.abs(a.s - b.s) > 60) {
      problems += 1
      if (problems < 15) console.log(`  OVERLAP s=${a.s.toFixed(0)} (sec ${a.section}) vs s=${b.s.toFixed(0)} (sec ${b.section}) dxz=${dxz.toFixed(1)} dy=${(b.y - a.y).toFixed(1)}`)
    }
  }
}
// Glass tubes are taller than the 7 m headroom above: no other road may pass through one
// (within its width and from its floor to its glass apex, plus a little).
const tubeTop = TUBE.radius + TUBE.floor / 2 + TUBE.radius + 1.5
const tubeHalf = TUBE.floor / 2 + TUBE.radius + 1
let tubeHits = 0
for (const rib of st.ribbons.filter((r) => r.tube)) {
  for (const c of rib.cs) {
    for (const p of path) {
      if (p.section === rib.section) continue
      const dx = p.x - c.p[0]
      const dz = p.z - c.p[2]
      const dy = p.y - c.p[1]
      if (Math.hypot(dx, dz) < tubeHalf + p.w / 2 && dy > -ROAD_THICKNESS - 2 && dy < tubeTop) {
        tubeHits += 1
        if (tubeHits < 5) console.log(`  ROAD THROUGH GLASS TUBE (sec ${rib.section}) at s=${c.s.toFixed(0)}: road s=${p.s.toFixed(0)} (sec ${p.section}) dy=${dy.toFixed(1)}`)
      }
    }
  }
}
problems += tubeHits
console.log(`glass tube headroom: ${tubeHits ? `${tubeHits} conflicts` : 'clear'}`)
// Wide pieces - the checkpoint plazas (safe zones) and the round platforms (Stunt Bowl,
// sweeper deck): no other road may pass through one (within its footprint plus the
// road's half width, less than 8 m above or below it), and no two may overlap.
const fps = stageFootprints(st)
let fpHits = 0
for (const fp of fps) {
  for (const p of path) {
    if (p.s > fp.sFrom - 25 && p.s < fp.sTo + 25) continue
    if (footprintDistance(fp, p.x, p.z) < p.w / 2 + 1 && Math.abs(p.y - fp.y) < 8) {
      fpHits += 1
      if (fpHits < 10) console.log(`  ROAD THROUGH ${fp.kind.toUpperCase()}${fp.index !== undefined ? ` CP${fp.index}` : ''}: road s=${p.s.toFixed(0)} (sec ${p.section}) dy=${(p.y - fp.y).toFixed(1)}`)
      break
    }
  }
}
for (let i = 0; i < fps.length; i += 1) {
  for (let j = i + 1; j < fps.length; j += 1) {
    const a = fps[i]
    const b = fps[j]
    if (Math.abs(a.y - b.y) > 8) continue
    // Sample b's outline (or centre for a circle) against a.
    const pts = b.radius !== undefined
      ? Array.from({ length: 24 }, (_, k) => [b.x + Math.cos((k / 24) * Math.PI * 2) * b.radius, b.z + Math.sin((k / 24) * Math.PI * 2) * b.radius])
      : [-1, -0.5, 0, 0.5, 1].flatMap((u) => [-1, -0.5, 0, 0.5, 1].map((v) => [b.x + b.fx * b.hl * u + b.fz * b.hw * v, b.z + b.fz * b.hl * u - b.fx * b.hw * v]))
    if (pts.some(([x, z]) => footprintDistance(a, x, z) < 2)) {
      fpHits += 1
      console.log(`  ${a.kind} ${a.index ?? ''} OVERLAPS ${b.kind} ${b.index ?? ''}`)
    }
  }
}
problems += fpHits
console.log(`plaza / round platform footprints (${fps.length}): ${fpHits ? `${fpHits} conflicts` : 'clear'}`)
// Track over the lobby pier?
for (const p of path) if (Math.abs(p.x) < 42 && p.z > -40 && p.z < 42 && p.y < 14) { problems++; console.log('  over lobby at s=', p.s); break }
console.log(problems ? `${problems} overlap samples` : 'no overlaps')
console.log('lobby boxes', lobbyBoxes().length)
