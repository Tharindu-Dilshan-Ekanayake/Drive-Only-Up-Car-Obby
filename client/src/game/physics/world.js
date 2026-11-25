import { Vector3 } from 'three'

/**
 * The collision world for the arcade car physics. No physics engine: everything solid
 * is an oriented box (OBB) or a sphere, which is all a car obby needs, and it keeps
 * the game free of a 1.6 MB WASM download.
 *
 * - Static boxes (road, curbs, plazas, the pier) live in flat typed arrays and a 3D
 *   spatial hash, so a query only looks at the few boxes near the car.
 * - Dynamic bodies (swinging hooks, sliding containers, lifts, CPU racers...) are a
 *   short list the obstacle systems move every frame; each carries the velocity it
 *   moves with, so a hit can knock the car the right way.
 * - Triggers (boost pads, bounce pads, oil) are boxes the car's centre can be inside.
 *
 * Runs under node too (scripts/sim-drive.mjs drives the track headless).
 */

const CELL = 12
const INV_CELL = 1 / CELL

/** Static box data, 16 floats each: c(3) ax(3) ay(3) az(3) h(3) grip(1). */
const STRIDE = 16

const _v = new Vector3()
const _l = new Vector3()
const _d = new Vector3()
const _n = new Vector3()

const cellKey = (ix, iy, iz) => ((ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)) | 0

/** Surface grip by kind: oil and loops aside, everything grips the same. */
// `ice` (the Grand Tour's Snowy Mountain patches): slippery but controllable - the car still
// steers, but sideways sliding bleeds off slowly, so it drifts wide in a bend (car.js drive).
export const ICE_GRIP = 0.36
// `sand` (the Grand Tour's Tropical Island sand bars): a little loose - the car drifts
// slightly wide in a bend but keeps all its drive, braking and steering (car.js drive).
export const SAND_GRIP = 0.7
const KIND_GRIP = { road: 1, plaza: 1, deck: 1, loop: 1.15, curb: 0.6, rail: 0.6, loopwall: 0.6, kerb: 1, ice: ICE_GRIP, sand: SAND_GRIP }

export class PhysicsWorld {
  constructor() {
    this.data = new Float32Array(0)
    this.kinds = []
    this.sections = []
    this.count = 0
    /** cell key -> box indices */
    this.grid = new Map()
    /** Per-box query stamp, to visit each box once per query. */
    this.stamp = new Int32Array(0)
    this.query = 0
    /** Kinematic obstacles; see addDynamic. */
    this.dynamics = []
    /** Trigger volumes: `{ id, type, power, c, ax, ay, az, h, section, enabled }`. */
    this.triggers = []
    /** Index ranges of static boxes per group (lobby, stage1...). */
    this.groups = []
    /** Reused result buffer for gather(). */
    this.found = new Int32Array(256)
  }

  /**
   * Adds boxes in the shared format (`{ c, h, ax, ay, az, kind, section, grip? }`).
   * Returns the index range so a stage can be removed again.
   */
  addStaticBoxes(boxes, group = 'default') {
    const start = this.count
    const total = this.count + boxes.length
    const data = new Float32Array(total * STRIDE)
    data.set(this.data)
    const stamp = new Int32Array(total)
    stamp.set(this.stamp)
    this.data = data
    this.stamp = stamp
    for (let i = 0; i < boxes.length; i += 1) {
      const b = boxes[i]
      const o = (start + i) * STRIDE
      data.set(b.c, o)
      data.set(b.ax, o + 3)
      data.set(b.ay, o + 6)
      data.set(b.az, o + 9)
      data.set(b.h, o + 12)
      data[o + 15] = b.grip ?? KIND_GRIP[b.kind] ?? 1
      this.kinds[start + i] = b.kind
      this.sections[start + i] = b.section
      this.insert(start + i)
    }
    this.count = total
    this.groups.push({ group, start, end: total })
    return { start, end: total }
  }

  /** World AABB of static box i, into min/max arrays. */
  boxAabb(i, min, max) {
    const d = this.data
    const o = i * STRIDE
    for (let k = 0; k < 3; k += 1) {
      const e = Math.abs(d[o + 3 + k]) * d[o + 12] + Math.abs(d[o + 6 + k]) * d[o + 13] + Math.abs(d[o + 9 + k]) * d[o + 14]
      min[k] = d[o + k] - e
      max[k] = d[o + k] + e
    }
  }

  insert(i) {
    const min = [0, 0, 0]
    const max = [0, 0, 0]
    this.boxAabb(i, min, max)
    const x0 = Math.floor(min[0] * INV_CELL)
    const y0 = Math.floor(min[1] * INV_CELL)
    const z0 = Math.floor(min[2] * INV_CELL)
    const x1 = Math.floor(max[0] * INV_CELL)
    const y1 = Math.floor(max[1] * INV_CELL)
    const z1 = Math.floor(max[2] * INV_CELL)
    for (let x = x0; x <= x1; x += 1) {
      for (let y = y0; y <= y1; y += 1) {
        for (let z = z0; z <= z1; z += 1) {
          const key = cellKey(x, y, z)
          let list = this.grid.get(key)
          if (!list) {
            list = []
            this.grid.set(key, list)
          }
          list.push(i)
        }
      }
    }
  }

  /** Removes a group of static boxes (a stage being unloaded) from the grid. */
  removeGroup(group) {
    const g = this.groups.find((x) => x.group === group)
    if (!g) return
    for (const [key, list] of this.grid) {
      const kept = list.filter((i) => i < g.start || i >= g.end)
      if (kept.length) this.grid.set(key, kept)
      else this.grid.delete(key)
    }
    // Indices stay allocated (cheap); they're simply unreachable now.
    this.groups = this.groups.filter((x) => x !== g)
  }

  /**
   * Collects every static box whose cells overlap the AABB into `this.found` (no
   * allocation: the buffer is reused) and returns how many there are.
   */
  gather(minX, minY, minZ, maxX, maxY, maxZ) {
    this.query += 1
    const q = this.query
    let n = 0
    const x0 = Math.floor(minX * INV_CELL)
    const y0 = Math.floor(minY * INV_CELL)
    const z0 = Math.floor(minZ * INV_CELL)
    const x1 = Math.floor(maxX * INV_CELL)
    const y1 = Math.floor(maxY * INV_CELL)
    const z1 = Math.floor(maxZ * INV_CELL)
    for (let x = x0; x <= x1; x += 1) {
      for (let y = y0; y <= y1; y += 1) {
        for (let z = z0; z <= z1; z += 1) {
          const list = this.grid.get(cellKey(x, y, z))
          if (!list) continue
          for (let k = 0; k < list.length; k += 1) {
            const i = list[k]
            if (this.stamp[i] === q) continue
            this.stamp[i] = q
            if (n >= this.found.length) {
              const grown = new Int32Array(this.found.length * 2)
              grown.set(this.found)
              this.found = grown
            }
            this.found[n] = i
            n += 1
          }
        }
      }
    }
    return n
  }

  // --- Dynamic bodies ------------------------------------------------------------

  /**
   * Registers a moving obstacle. The owner mutates it every frame:
   * `{ type: 'box'|'sphere', c: Vector3, r (sphere), h: [hx,hy,hz] (box),
   *    ax/ay/az: Vector3 (box axes), vel: Vector3 (linear), angVel: Vector3 (about c),
   *    knock (extra knock-back, 0 = none), enabled, grip, kind, owner }`
   * Other cars add `car: true` (no wheel raycasts; car.js bumps) and `ghost` (no
   * collisions at all), see physics/carBody.js.
   */
  addDynamic(body) {
    const full = {
      enabled: true,
      knock: 0,
      grip: 1,
      vel: new Vector3(),
      angVel: new Vector3(),
      ...body,
    }
    if (full.type === 'box') {
      full.ax = full.ax || new Vector3(1, 0, 0)
      full.ay = full.ay || new Vector3(0, 1, 0)
      full.az = full.az || new Vector3(0, 0, 1)
    }
    this.dynamics.push(full)
    return full
  }

  removeDynamic(body) {
    const i = this.dynamics.indexOf(body)
    if (i >= 0) this.dynamics.splice(i, 1)
  }

  /** Velocity of dynamic body `b` at world point p (linear + spin about its centre). */
  pointVelocity(b, p, out) {
    out.copy(b.vel)
    if (b.angVel.lengthSq() > 0) {
      _v.subVectors(p, b.c)
      _l.crossVectors(b.angVel, _v)
      out.add(_l)
    }
    return out
  }

  // --- Queries -----------------------------------------------------------------

  /**
   * Ray cast against everything solid. Fills `hit` with
   * `{ dist, normal: Vector3, grip, dynamic (body or null), kind }`; returns true on a hit.
   * `dir` must be normalised.
   */
  raycast(origin, dir, maxDist, hit) {
    let best = maxDist
    let found = false
    const ex = origin.x + dir.x * maxDist
    const ey = origin.y + dir.y * maxDist
    const ez = origin.z + dir.z * maxDist
    const d = this.data
    const n = this.gather(
      Math.min(origin.x, ex), Math.min(origin.y, ey), Math.min(origin.z, ez),
      Math.max(origin.x, ex), Math.max(origin.y, ey), Math.max(origin.z, ez),
    )
    for (let k = 0; k < n; k += 1) {
      const i = this.found[k]
      const o = i * STRIDE
      const t = rayObb(origin, dir, best, d[o], d[o + 1], d[o + 2], d, o + 3, o + 6, o + 9, d[o + 12], d[o + 13], d[o + 14], _n)
      if (t >= 0 && t < best) {
        best = t
        found = true
        hit.normal.copy(_n)
        hit.grip = d[o + 15]
        hit.dynamic = null
        hit.kind = this.kinds[i]
      }
    }
    for (let k = 0; k < this.dynamics.length; k += 1) {
      const b = this.dynamics[k]
      // Other cars (physics/carBody.js) are bumped into, not driven on.
      if (!b.enabled || b.type !== 'box' || b.car) continue
      const t = rayObbVec(origin, dir, best, b, _n)
      if (t >= 0 && t < best) {
        best = t
        found = true
        hit.normal.copy(_n)
        hit.grip = b.grip
        hit.dynamic = b
        hit.kind = b.kind || 'platform'
      }
    }
    hit.dist = best
    return found
  }

  /**
   * Every solid thing a sphere at `center` (radius r) overlaps:
   * `onContact(normal, depth, body)` with the normal pointing out of the obstacle
   * towards the sphere. `body` is null for static boxes.
   */
  sphereContacts(center, r, onContact) {
    const d = this.data
    const n = this.gather(center.x - r, center.y - r, center.z - r, center.x + r, center.y + r, center.z + r)
    for (let k = 0; k < n; k += 1) {
      const o = this.found[k] * STRIDE
      const depth = sphereObb(center, r, d[o], d[o + 1], d[o + 2], d, o + 3, o + 6, o + 9, d[o + 12], d[o + 13], d[o + 14], _n)
      if (depth > 0) onContact(_n, depth, null)
    }
    for (let k = 0; k < this.dynamics.length; k += 1) {
      const b = this.dynamics[k]
      // `ghost`: a car in a safe zone (shared/safeZones.js) - cars pass through there.
      if (!b.enabled || b.ghost) continue
      let depth
      if (b.type === 'sphere') {
        _d.subVectors(center, b.c)
        const dist = _d.length()
        depth = r + b.r - dist
        if (depth > 0) _n.copy(dist > 1e-6 ? _d.multiplyScalar(1 / dist) : _d.set(0, 1, 0))
      } else {
        depth = sphereObbVec(center, r, b, _n)
      }
      if (depth > 0) onContact(_n, depth, b)
    }
  }

  /** The first enabled trigger whose box contains point p, or null. */
  triggerAt(p) {
    for (let k = 0; k < this.triggers.length; k += 1) {
      const t = this.triggers[k]
      if (t.enabled === false) continue
      const dx = p.x - t.c[0]
      const dy = p.y - t.c[1]
      const dz = p.z - t.c[2]
      if (Math.abs(dx * t.ax[0] + dy * t.ax[1] + dz * t.ax[2]) > t.h[0]) continue
      if (Math.abs(dx * t.ay[0] + dy * t.ay[1] + dz * t.ay[2]) > t.h[1]) continue
      if (Math.abs(dx * t.az[0] + dy * t.az[1] + dz * t.az[2]) > t.h[2]) continue
      return t
    }
    return null
  }
}

// --- Geometry kernels (no allocation) -----------------------------------------------

const _offs = [0, 0, 0]
const _hs = [0, 0, 0]

/**
 * Ray vs OBB slab test. Axes are read from `axes` at offsets ax/ay/az (Float32Array).
 * Returns the hit distance (or -1) and writes the world-space surface normal.
 */
function rayObb(o, dir, maxT, cx, cy, cz, axes, ax, ay, az, hx, hy, hz, outN) {
  const px = o.x - cx
  const py = o.y - cy
  const pz = o.z - cz
  let tMin = 0
  let tMax = maxT
  let axis = -1
  let sign = 1
  const offs = _offs
  const hs = _hs
  offs[0] = ax
  offs[1] = ay
  offs[2] = az
  hs[0] = hx
  hs[1] = hy
  hs[2] = hz
  for (let k = 0; k < 3; k += 1) {
    const a = offs[k]
    const e = axes[a] * px + axes[a + 1] * py + axes[a + 2] * pz
    const f = axes[a] * dir.x + axes[a + 1] * dir.y + axes[a + 2] * dir.z
    const h = hs[k]
    if (Math.abs(f) < 1e-9) {
      if (e < -h || e > h) return -1
      continue
    }
    let t1 = (-h - e) / f
    let t2 = (h - e) / f
    let s = -1
    if (t1 > t2) {
      const tmp = t1
      t1 = t2
      t2 = tmp
      s = 1
    }
    if (t1 > tMin) {
      tMin = t1
      axis = k
      sign = s
    }
    if (t2 < tMax) tMax = t2
    if (tMin > tMax) return -1
  }
  if (axis < 0) return -1 // started inside: ignore (the body contacts handle that)
  const a = offs[axis]
  outN.set(axes[a] * sign, axes[a + 1] * sign, axes[a + 2] * sign)
  return tMin
}

const _axes = new Float32Array(9)
function loadAxes(b) {
  _axes[0] = b.ax.x
  _axes[1] = b.ax.y
  _axes[2] = b.ax.z
  _axes[3] = b.ay.x
  _axes[4] = b.ay.y
  _axes[5] = b.ay.z
  _axes[6] = b.az.x
  _axes[7] = b.az.y
  _axes[8] = b.az.z
}

function rayObbVec(o, dir, maxT, b, outN) {
  loadAxes(b)
  return rayObb(o, dir, maxT, b.c.x, b.c.y, b.c.z, _axes, 0, 3, 6, b.h[0], b.h[1], b.h[2], outN)
}

/** Sphere vs OBB: penetration depth (<= 0 = apart) and the push-out normal. */
function sphereObb(p, r, cx, cy, cz, axes, ax, ay, az, hx, hy, hz, outN) {
  const px = p.x - cx
  const py = p.y - cy
  const pz = p.z - cz
  const lx = axes[ax] * px + axes[ax + 1] * py + axes[ax + 2] * pz
  const ly = axes[ay] * px + axes[ay + 1] * py + axes[ay + 2] * pz
  const lz = axes[az] * px + axes[az + 1] * py + axes[az + 2] * pz
  // Quick reject.
  if (Math.abs(lx) > hx + r || Math.abs(ly) > hy + r || Math.abs(lz) > hz + r) return 0
  const qx = Math.max(-hx, Math.min(hx, lx))
  const qy = Math.max(-hy, Math.min(hy, ly))
  const qz = Math.max(-hz, Math.min(hz, lz))
  let dx = lx - qx
  let dy = ly - qy
  let dz = lz - qz
  const distSq = dx * dx + dy * dy + dz * dz
  let depth
  if (distSq > 1e-10) {
    if (distSq >= r * r) return 0
    const dist = Math.sqrt(distSq)
    depth = r - dist
    dx /= dist
    dy /= dist
    dz /= dist
  } else {
    // Centre inside the box: push out through the nearest face.
    const fx = hx - Math.abs(lx)
    const fy = hy - Math.abs(ly)
    const fz = hz - Math.abs(lz)
    dx = 0
    dy = 0
    dz = 0
    if (fy <= fx && fy <= fz) {
      dy = Math.sign(ly) || 1
      depth = r + fy
    } else if (fx <= fz) {
      dx = Math.sign(lx) || 1
      depth = r + fx
    } else {
      dz = Math.sign(lz) || 1
      depth = r + fz
    }
  }
  outN.set(
    axes[ax] * dx + axes[ay] * dy + axes[az] * dz,
    axes[ax + 1] * dx + axes[ay + 1] * dy + axes[az + 1] * dz,
    axes[ax + 2] * dx + axes[ay + 2] * dy + axes[az + 2] * dz,
  )
  return depth
}

function sphereObbVec(p, r, b, outN) {
  loadAxes(b)
  return sphereObb(p, r, b.c.x, b.c.y, b.c.z, _axes, 0, 3, 6, b.h[0], b.h[1], b.h[2], outN)
}
