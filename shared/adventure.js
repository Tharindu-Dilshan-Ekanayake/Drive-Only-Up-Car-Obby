/**
 * Adventure on every road: placed automatically on a finished stage, deterministic, so
 * the client and the server agree on every position.
 *
 * - Sky Pearls (`stage.pearls`): ONE per section, a glowing pearl in an open shell.
 *   Collecting one is permanent (saved in your profile); all of them pays a big bonus.
 *   Each road hides it differently: above a stunt-ramp jump (fly through it), over a
 *   hill crest (catch air), or tucked at the road's edge.
 * - Treasure chests (`stage.chests`): one per section at the roadside; drive into it for
 *   a coin bonus, once per run.
 * - Stunt ramps (`stage.ramps`, plus a collider box of kind 'ramp'): kickers on clear,
 *   wide straights, off to one side so you can choose to take them.
 * - Star rings (`stage.rings`): sets of floating hoops along a ramp's flight or over a
 *   hill crest - or a Stunt Bowl kicker's (shared/track.js ARENA); fly through a whole
 *   set in one jump for a bonus. A section with a Stunt Bowl hangs its pearl in the
 *   middle ring over one of its kickers.
 *
 * Nothing goes near an obstacle, a pad or a gap, or onto a checkpoint plaza or a round
 * platform.
 */

const RAMP = { length: 7.5, height: 1.8, width: 4.2 }
/** Rings are high enough that you only pass through them in the air. */
const RING_R = 1.8

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
const round = (v) => Math.round(v * 1000) / 1000

/** Frame of a path sample: forward, up, right. */
function frame(p) {
  const f = norm([p.fx, p.fy, p.fz])
  const u = norm([p.ux, p.uy, p.uz])
  const r = norm(cross(f, u))
  return { f, u, r, p: [p.x, p.y, p.z] }
}

/** A point `lane` right of and `lift` above sample p. */
function at(p, lane, lift) {
  const { u, r } = frame(p)
  const q = add(add([p.x, p.y, p.z], mul(r, lane)), mul(u, lift))
  return { x: round(q[0]), y: round(q[1]), z: round(q[2]), yaw: round(Math.atan2(-p.fx, -p.fz)) }
}

export function placeAdventure(stage) {
  const path = stage.path
  stage.pearls = []
  stage.chests = []
  stage.ramps = []
  stage.rings = []

  // Samples that must stay clear: near obstacles and pads, in the air, on plazas.
  const blocked = new Uint8Array(path.length)
  const block = (i, r) => {
    for (let k = Math.max(0, i - r); k <= Math.min(path.length - 1, i + r); k += 1) blocked[k] = 1
  }
  for (const o of stage.obstacles) {
    block(o.pi, 22)
    if (o.piStart !== undefined) for (let k = o.piStart; k <= o.piEnd; k += 1) blocked[k] = 1
  }
  for (const t of stage.triggers) {
    let best = 0
    let bd = Infinity
    for (let k = 0; k < path.length; k += 1) {
      const d = (path[k].x - t.c[0]) ** 2 + (path[k].z - t.c[2]) ** 2 + (path[k].y - t.c[1]) ** 2
      if (d < bd) {
        bd = d
        best = k
      }
    }
    block(best, 18)
  }
  for (let k = 0; k < path.length; k += 1) if (path[k].air) block(k, 12)
  for (const cp of stage.checkpoints) {
    for (let k = 0; k < path.length; k += 1) {
      if (path[k].s >= cp.s - 12 && path[k].s <= cp.s + (cp.length || 0) + 12) blocked[k] = 1
    }
  }
  for (const r of stage.rounds || []) {
    for (let k = 0; k < path.length; k += 1) if (path[k].s >= r.sStart - 12 && path[k].s <= r.sEnd + 12) blocked[k] = 1
  }

  let rampSide = 1
  for (const sec of stage.sections) {
    const idx = []
    for (let k = 0; k < path.length; k += 1) if (path[k].section === sec.index && !blocked[k]) idx.push(k)
    if (idx.length < 10) continue

    // The section's stunt run, if it has one (track.js stunt()).
    const stunt = (stage.stunts || []).find((r) => r.section === sec.index)
    const rampRun = stunt ? { from: stunt.from + 2, to: stunt.to } : null

    // Hill crests: climbing steeply, then levelling or dropping.
    const crests = []
    for (const k of idx) {
      const p = path[k]
      const n = path[k + 3]
      if (n && !blocked[k + 3] && p.fy > 0.12 && n.fy < 0.05 && n.section === sec.index) {
        if (!crests.length || k - crests[crests.length - 1] > 12) crests.push(k)
      }
    }

    let pearlPlaced = false
    if (rampRun) {
      // A kicker 8 m into the run, a third of the way across; the jump lands ~35 m on.
      const k0 = rampRun.from + 4
      const p = path[k0]
      // (On a stunt run narrower than 16 m - a narrowed map, shared/track.js widthScale - the
      // kicker stands right against the kerb, so it stays clear of the middle of the road.)
      const lane = rampSide * (p.w / 2 - (p.w >= 16 ? 3.2 : 2.7))
      rampSide = -rampSide
      const { f, u, r } = frame(p)
      const theta = Math.atan2(RAMP.height, RAMP.length)
      const base = add([p.x, p.y, p.z], mul(r, lane))
      // Collider: a slab tilted up along the road, its top face the ramp.
      const az = norm(mul(add(mul(f, Math.cos(theta)), mul(u, Math.sin(theta))), -1))
      const ay = norm(sub(mul(u, Math.cos(theta)), mul(f, Math.sin(theta))))
      const slope = Math.hypot(RAMP.length, RAMP.height)
      const topMid = add(base, add(mul(f, RAMP.length / 2), mul(u, RAMP.height / 2)))
      const c = sub(topMid, mul(ay, 0.5))
      stage.boxes.push({ c: c.map(round), h: [RAMP.width / 2, 0.5, slope / 2], ax: r.map(round), ay: ay.map(round), az: az.map(round), kind: 'ramp', section: sec.index })
      // A short landing slope behind the lip, so a slow car rolls back down instead of
      // getting stuck on the edge (fast ones still fly off the top).
      const back = 5.5
      const lipTop = add(base, add(mul(f, RAMP.length), mul(u, RAMP.height)))
      const foot = add(base, mul(f, RAMP.length + back))
      const dDown = norm(sub(foot, lipTop))
      const ay2 = norm(cross(mul(dDown, -1), r))
      const len2 = Math.hypot(back, RAMP.height)
      const c2 = sub(mul(add(lipTop, foot), 0.5), mul(ay2, 0.5))
      stage.boxes.push({ c: c2.map(round), h: [RAMP.width / 2, 0.5, len2 / 2], ax: r.map(round), ay: ay2.map(round), az: mul(dDown, -1).map(round), kind: 'ramp', section: sec.index })
      stage.ramps.push({ id: `r${sec.index}`, ...at(p, lane, 0), section: sec.index, ...RAMP, f: f.map(round), u: u.map(round), r: r.map(round) })
      // Rings along the flight: 14, 22 and 30 m past the lip.
      const lip = k0 + Math.round(RAMP.length / 2)
      const set = `s${sec.index}r`
      for (const [dk, lift] of [
        [7, 2.9],
        [11, 3.4],
        [15, 2.9],
      ]) {
        const q = path[Math.min(rampRun.to, lip + dk)]
        stage.rings.push({ set, ...at(q, lane, lift), r: RING_R, section: sec.index })
      }
      // The pearl hangs in the middle ring: take the jump to get it.
      const q = path[Math.min(rampRun.to, lip + 11)]
      stage.pearls.push({ index: sec.index, id: `p${sec.index}`, ...at(q, lane, 3.4), how: 'jump', section: sec.index })
      pearlPlaced = true
    }
    // A Stunt Bowl: rings along each kicker's flight (5, 10 and 15 m past the lip, for a
    // car leaving it at ~85 km/h), the pearl in the middle ring of the first.
    for (const r of (stage.rounds || []).filter((rr) => rr.section === sec.index && rr.kickers.length)) {
      const f = [-Math.sin(r.yaw), 0, -Math.cos(r.yaw)]
      const rt = [Math.cos(r.yaw), 0, -Math.sin(r.yaw)]
      r.kickers.forEach((kk, j) => {
        const set = `s${sec.index}k${j}`
        for (const [d, lift] of [
          [5, 4.0],
          [10, 4.2],
          [15, 3.4],
        ]) {
          const along = kk.along + kk.length + d
          const q = add(add(r.c, mul(f, along)), mul(rt, kk.lat))
          const ring = { set, x: round(q[0]), y: round(q[1] + lift), z: round(q[2]), yaw: round(r.yaw), r: RING_R, section: sec.index }
          stage.rings.push(ring)
          if (j === 0 && d === 10 && !pearlPlaced) {
            stage.pearls.push({ index: sec.index, id: `p${sec.index}`, x: ring.x, y: ring.y, z: ring.z, yaw: ring.yaw, how: 'jump', section: sec.index })
            pearlPlaced = true
          }
        }
      })
    }
    for (const k of crests.slice(0, 2)) {
      const p = path[k]
      const set = `s${sec.index}c${k}`
      for (const [dk, lift] of [
        [3, 2.6],
        [6, 2.8],
      ]) {
        const q = path[Math.min(path.length - 1, k + dk)]
        stage.rings.push({ set, ...at(q, 0, lift), r: RING_R, section: sec.index })
      }
    }
    if (!pearlPlaced && crests.length) {
      const q = path[Math.min(path.length - 1, crests[0] + 3)]
      stage.pearls.push({ index: sec.index, id: `p${sec.index}`, ...at(q, 0, 2.6), how: 'crest', section: sec.index })
      pearlPlaced = true
    }
    // Clear spots for the edge pearl and the chest: a third and two thirds through.
    const clear = idx.filter((k) => path[k].w >= 8 && Math.abs(path[k].fy) < 0.2)
    if (!clear.length) continue
    if (!pearlPlaced) {
      const p = path[clear[Math.floor(clear.length * 0.35)]]
      const side = sec.index % 2 ? 1 : -1
      stage.pearls.push({ index: sec.index, id: `p${sec.index}`, ...at(p, side * (p.w / 2 - 1.6), 1.3), how: 'edge', section: sec.index })
    }
    const cp = path[clear[Math.floor(clear.length * 0.7)]]
    const cside = sec.index % 2 ? -1 : 1
    stage.chests.push({ id: `h${sec.index}`, ...at(cp, cside * (cp.w / 2 - 1.7), 0), face: cside, section: sec.index })
  }
  return stage
}

/** All pearls as a bitmask (pearl `index` = section). */
export const ALL_PEARLS = (stage) => stage.pearls.reduce((m, p) => m | (1 << p.index), 0)
