import { Color, Matrix4, Quaternion, Vector3 } from 'three'

import { doorLanes } from './doorState'

/**
 * Moving obstacles of a stage, as physics bodies driven by a clock. Pure functions of
 * time (no state carried between frames), so they never drift, can skip frames when
 * far away and need no network sync.
 *
 * The exceptions react to the viewer, so `update` also takes the viewer's position: the
 * cargo doors (which door is open is re-rolled every time you leave a gantry behind -
 * drove through, fell, respawned) and the driftwood bridge's loose pontoons (they give
 * while you're on them and float back up after).
 *
 * `createObstacles(stage, world, { random })` registers bodies with the physics world
 * and returns `{ list, update(time, minSection, maxSection, viewer) }`. Each list entry
 * has the obstacle spec `o`, its `bodies`, and a `parts` array the renderer draws:
 * `{ kind, position: Vector3, quaternion: Quaternion, scale: Vector3, visible, tint? }`
 * (`tint`, a Color, is the instance colour for tinted kinds such as door lamps).
 *
 * Static bits (bollards, boom hubs, door gantries) are returned as boxes to add to the
 * static world.
 */

const TAU = Math.PI * 2
const _basis = new Matrix4()
const _q = new Quaternion()
const _q2 = new Quaternion()
const Y_AXIS = new Vector3(0, 1, 0)

/** Cargo doors: post width and door height (m). */
export const DOOR_POST = 0.8
export const DOOR_HEIGHT = 4.6
/** Within this distance (m, before the gantry) the lamps light and the open shutter lifts. */
const DOOR_HINT = 17
/** You're "at" a gantry from this far before it until a little past it; leaving re-rolls it. */
const DOOR_NEAR = 42
const LAMP_IDLE = new Color('#ffb020')
const LAMP_OPEN = new Color('#3fff6a')
const LAMP_SHUT = new Color('#ff3b30')

/** Opening width and the lane (m right of centre) of each of a gantry's three doors. */
export function doorLayout(width) {
  const opening = (width - 4 * DOOR_POST) / 3
  const step = opening + DOOR_POST
  return { opening, lanes: [-step, 0, step] }
}

/** Forklift collision half extents: along its travel (across the road), up, along the road. */
export const FORKLIFT_HALF = [1.6, 1.1, 0.85]
/** Rolling pipe radius; its length is a share of the road width. */
const PIPE_R = 0.95
/** Pipe chute guard wall: thickness and height (m). */
const CHUTE_WALL = [0.7, 1.3]
export const pipeLength = (width) => Math.round(width * 0.46 * 10) / 10
/** Which side each pipe in the sequence blocks (-1 left, 1 right): mostly alternating. */
export const PIPE_SIDES = [-1, 1, -1, 1, 1, -1, 1, -1, -1, 1]
/**
 * Swinging hammer: pivot height above the road, arm (pivot to the head's centre), the
 * head's half extents (along the swing, along the handle, along the road), and the
 * road width its gantry is modelled for (scaled across to the real one).
 */
export const HAMMER = { pivot: 9.4, arm: 7.6, head: [1.8, 1.25, 1.25], frameWidth: 14 }
/** Hammer swing angle (radians, + swings towards the road's left) at time t. */
export const hammerAngle = (o, t) => (((o.amp ?? 58) * Math.PI) / 180) * Math.sin((TAU * t) / (o.period || 3.2) + (o.phase || 0))
/** Cargo truck collision half extents (it crosses like a forklift, from bigger sheds). */
export const TRUCK_HALF = [3.2, 1.6, 1.25]
/** Drone collision sphere and hover height above the road. */
const DRONE_R = 0.95
const DRONE_Y = 1.1
/** Rolling ball radius: buoys, and the heavy iron ballast balls (`buoys` with `heavy`). */
const BUOY_R = 1.5
export const IRONBALL_R = 2.4
/** Lanes (share of the road width, right of centre) the balls roll down, in turn. */
const BUOY_LANES = [-0.3, 0.25, -0.05, 0.35, -0.38, 0.1]
// Iron balls always keep to one side (mostly alternating): the other side is the way up.
const IRONBALL_LANES = [-0.25, 0.26, -0.24, 0.25, 0.24, -0.26]
/**
 * Moving pontoon planks (driftwood bridge): deck thickness (as the road's), how long the
 * full give takes while you're on it and the float back up once you're off (s), the
 * tilt angle (deg) and the dip of the near end (m; the far end dips a third as much).
 */
export const PONTOON = { thick: 1.2, give: 1.5, recover: 2.4, tilt: 13, dip: 1.0, model: [8, 6] }
/**
 * Sweeper deck arm (`spinbar`; reach and counterweight tail from the obstacle): height of
 * its centre line above the deck, half thickness (up and across), and the hub's collider
 * half extents. Bottom 0.55 m, top 1.45 m: too low to drive under, low enough to hop
 * with a Spring Jump.
 */
export const SPINBAR = { lift: 1.0, half: 0.45, hub: [1.25, 1.6, 1.25], hubScale: 1.35 }
/** Bar angle (radians, about the deck's up; 0 = across the road) at time t. */
export const spinbarAngle = (o, t) => t * (o.speed || 0.6) + (o.phase || 0)
/** Container gate (`slot`): container width/height (m). */
export const SLOT_BOX = 2.6
/**
 * Laser gate (`laser`): the light curtain's height and depth (its collider), how long it
 * flickers before it lights (s), its knock, and the gantry (modelled `frameWidth` wide,
 * scaled across to the road; top beam at `frameHeight`).
 */
export const LASER = { height: 5.4, depth: 0.5, warn: 0.55, knock: 0.75, frameWidth: 14, frameHeight: 5.6 }
/** Is laser curtain `o` lit at time t, or flickering (`warn`) just before it lights? */
export function laserState(o, t) {
  const period = o.period || 3.2
  const u = (((t / period + (o.phase || 0) / TAU) % 1) + 1) % 1
  const lit = u < (o.duty ?? 0.5)
  return { lit, warn: !lit && u > 1 - LASER.warn / period }
}

/** Road frame at an obstacle: forward, right and up unit vectors. */
function frameOf(o) {
  const cp = Math.cos(o.pitch)
  const fwd = new Vector3(-Math.sin(o.yaw) * cp, Math.sin(o.pitch), -Math.cos(o.yaw) * cp)
  const right = new Vector3(Math.cos(o.yaw), 0, -Math.sin(o.yaw))
  const up = new Vector3().crossVectors(right, fwd).normalize()
  const base = new Vector3(o.x, o.y, o.z)
  // Orientation whose local axes are (right, up, -fwd).
  const back = fwd.clone().negate()
  const quat = new Quaternion().setFromRotationMatrix(_basis.makeBasis(right, up, back))
  return { fwd, right, up, base, quat }
}

/**
 * Part kinds of the later zones' obstacle looks (the Tropical Island's coconuts, lava
 * boulders, palm logs on bamboo gantries, crabs): not drawn by the stage's obstacle meshes
 * (track/Stage.jsx) but by the zone's own scenery, which runs a draw-only copy of the sim
 * (`createObstacles(..., { looks: true })`: only these parts, on the same clock, so they
 * line up with the bodies exactly). Geometry: propGeometry LOOK_KINDS.
 */
// (+ the Desert Canyon's tumbleweeds, sandstone boulders, ore buckets on mine cranes, mine carts
// and their adits: world/scenery/grandTour/canyonZone.jsx, geometry world/canyon/canyonProps.js.)
export const SEPARATE_LOOKS = new Set(['coconut', 'boulder', 'palmLog', 'bambooFrame', 'crab', 'tumbleweed', 'sandstone', 'mineBucket', 'mineCrane', 'mineCart', 'mineAdit'])

const part = (kind, scale) => ({
  kind,
  position: new Vector3(),
  quaternion: new Quaternion(),
  scale: new Vector3(...scale),
  visible: true,
})

/**
 * A container gate's solid parts in its road frame, from the middle of its gap (the
 * obstacle's position, already `lane` off the centre line): `[lateral, up, along, half
 * extents]` for the two stacks either side of the gap and the container across the top.
 */
function slotParts(o) {
  const L = o.length || 12
  const g = o.gap || 4.2
  const B = SLOT_BOX
  return [
    ...[-1, 1].map((side) => [side * (g / 2 + B / 2), B / 2, 0, [B / 2, B / 2, L / 2]]),
    [0, B * 1.5, 0, [g / 2 + B, B / 2, B / 2]],
  ]
}

/** Static boxes for bollards and spinner hubs, in the shared box format. */
export function obstacleStaticBoxes(stage) {
  const boxes = []
  for (const o of stage.obstacles) {
    if (o.type === 'doors') {
      boxes.push(...doorFrameBoxes(o))
      continue
    }
    if (o.type === 'slot') {
      const { right, up, fwd, base } = frameOf(o)
      for (const [x, y, z, h] of slotParts(o)) {
        const c = base.clone().addScaledVector(right, x).addScaledVector(up, y).addScaledVector(fwd, z)
        boxes.push({ c: c.toArray(), h, ax: right.toArray(), ay: up.toArray(), az: fwd.clone().negate().toArray(), kind: 'slot', section: o.section })
      }
      continue
    }
    if (o.type === 'spinbar') {
      const { right, up, fwd, base } = frameOf(o)
      const c = base.clone().addScaledVector(up, SPINBAR.hub[1])
      boxes.push({ c: c.toArray(), h: SPINBAR.hub, ax: right.toArray(), ay: up.toArray(), az: fwd.clone().negate().toArray(), kind: 'hub', section: o.section })
      continue
    }
    if (o.type === 'pipes') {
      for (const w of chuteWalls(stage, o)) boxes.push({ c: w.c.toArray(), h: w.h, ax: w.ax.toArray(), ay: w.ay.toArray(), az: w.az.toArray(), kind: 'rail', section: o.section })
      continue
    }
    if (o.type !== 'bollard' && o.type !== 'boom') continue
    const { right, up, fwd, base } = frameOf(o)
    const h = o.type === 'bollard' ? [0.55, 0.85, 0.55] : [0.9, 1.6, 0.9]
    const c = base.clone().addScaledVector(up, h[1])
    boxes.push({
      c: c.toArray(),
      h,
      ax: right.toArray(),
      ay: up.toArray(),
      az: fwd.clone().negate().toArray(),
      kind: o.type === 'bollard' ? 'bollard' : 'hub',
      section: o.section,
    })
  }
  return boxes
}

/**
 * Guard walls down both sides of a pipe chute (the straight the pipes roll down), over
 * the curbs: a clipped pipe end shoves you along the chute, not off it.
 */
function chuteWalls(stage, o) {
  const a = stage.path[o.piStart]
  const b = stage.path[o.pi]
  const fwd = new Vector3(b.x - a.x, b.y - a.y, b.z - a.z)
  const len = fwd.length()
  fwd.normalize()
  const up = new Vector3(a.ux, a.uy, a.uz)
  const right = new Vector3().crossVectors(fwd, up).normalize()
  const w = o.width || 13
  const h = [CHUTE_WALL[0] / 2, CHUTE_WALL[1] / 2, len / 2]
  return [-1, 1].map((side) => ({
    c: new Vector3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2).addScaledVector(right, side * (w / 2 - 0.3)).addScaledVector(up, h[1]),
    h,
    ax: right,
    ay: up,
    az: fwd.clone().negate(),
  }))
}

/** A door gantry's posts (outer two over the curbs, two between the doors) and lintel. */
function doorFrameBoxes(o) {
  const { right, up, fwd, base } = frameOf(o)
  const w = o.width || 16
  const { opening } = doorLayout(w)
  const az = fwd.clone().negate().toArray()
  const box = (x, y, h) => ({
    c: base.clone().addScaledVector(right, x).addScaledVector(up, y).toArray(),
    h,
    ax: right.toArray(),
    ay: up.toArray(),
    az,
    kind: 'gantry',
    section: o.section,
  })
  const postH = DOOR_HEIGHT + 0.6
  const out = []
  for (const x of [w / 2 - DOOR_POST / 2, opening / 2 + DOOR_POST / 2]) {
    for (const side of [-1, 1]) out.push(box(side * x, postH / 2, [DOOR_POST / 2, postH / 2, 0.45]))
  }
  out.push(box(0, DOOR_HEIGHT + 0.6, [w / 2, 0.6, 0.6]))
  return out
}

export function createObstacles(stage, world, { random = Math.random, looks = false } = {}) {
  const list = []
  const path = stage.path

  for (const o of stage.obstacles) {
    const f = frameOf(o)
    const entry = { o, f, bodies: [], parts: [], active: true }

    if (o.type === 'bollard') {
      const p = part('bollard', [1, 1, 1])
      p.position.copy(f.base)
      p.quaternion.copy(f.quat)
      entry.parts.push(p)
      entry.update = null
    } else if (o.type === 'hammer') {
      // A giant mallet hanging from a gantry over the road, swinging right across it like
      // a pendulum (in the road's cross plane). The head is low and fast in the middle of
      // its swing and up out of the way at either end: go while it's out at one side.
      // A hit flings you sideways off the road, the way it was swinging.
      const amp = ((o.amp ?? 58) * Math.PI) / 180
      const period = o.period || 3.2
      const pivot = f.base.clone().addScaledVector(f.up, HAMMER.pivot)
      const body = world.addDynamic({
        type: 'box',
        c: pivot.clone().addScaledVector(f.up, -HAMMER.arm),
        h: HAMMER.head,
        ax: f.right.clone(),
        ay: f.up.clone(),
        az: f.fwd.clone().negate(),
        knock: o.knock ?? 1.05,
        fling: f.right,
        kind: 'hammer',
      })
      entry.bodies.push(body)
      // The gantry spans the road as wide as it is right here (tapering pieces carry their widest).
      // (`look`: the Snowy Mountain's swinging icicles and logs hang from a timber gantry, the
      // Tropical Island's palm logs from a bamboo one.)
      // (The Desert Canyon's ore buckets, `look: 'bucket'`, hang from a timber mine crane.)
      const frame = part(o.look === 'palmlog' ? 'bambooFrame' : o.look === 'bucket' ? 'mineCrane' : o.look ? 'timberFrame' : 'hammerFrame', [(path[o.pi]?.w || o.width || 12) / HAMMER.frameWidth, 1, 1])
      frame.position.copy(f.base)
      frame.quaternion.copy(f.quat)
      // The mallet's origin is the pivot; it hangs down its local -y.
      const mallet = part(o.look === 'icicle' ? 'icicle' : o.look === 'log' ? 'logHammer' : o.look === 'palmlog' ? 'palmLog' : o.look === 'bucket' ? 'mineBucket' : 'hammer', [1, 1, 1])
      mallet.position.copy(pivot)
      entry.parts.push(frame, mallet)
      const arm = new Vector3()
      entry.lastSide = 0
      entry.update = (t) => {
        const ph = (TAU * t) / period + (o.phase || 0)
        const th = amp * Math.sin(ph)
        const dth = (amp * TAU * Math.cos(ph)) / period
        _q.setFromAxisAngle(f.fwd, th)
        arm.copy(f.up).multiplyScalar(-HAMMER.arm).applyQuaternion(_q)
        body.c.copy(pivot).add(arm)
        body.ax.copy(f.right).applyQuaternion(_q)
        body.ay.copy(f.up).applyQuaternion(_q)
        body.angVel.copy(f.fwd).multiplyScalar(dth)
        body.vel.crossVectors(body.angVel, arm)
        mallet.quaternion.copy(_q).multiply(f.quat)
        // A whoosh each time it sweeps through the bottom.
        const side = th > 0 ? 1 : -1
        if (side !== entry.lastSide && entry.lastSide !== 0) entry.cue = 'hammer'
        entry.lastSide = side
      }
    } else if (o.type === 'sweeper') {
      const travel = o.travel ?? Math.max(2, (o.width || 12) - 4)
      const period = o.period || 3.2
      const h = [1.3, 1.3, 3]
      const body = world.addDynamic({ type: 'box', c: new Vector3(), h, ax: f.right.clone(), ay: f.up.clone(), az: f.fwd.clone().negate(), knock: 0.7, kind: 'sweeper' })
      entry.bodies.push(body)
      // (`look: 'plough'`: a snowplough instead of a container; `'crab'`: a giant crab.)
      const box = part(o.look === 'plough' ? 'plough' : o.look === 'crab' ? 'crab' : 'container', [h[0] * 2, h[1] * 2, h[2] * 2])
      box.quaternion.copy(f.quat)
      box.color = Math.floor(Math.abs(o.x * 7 + o.z * 3)) % 7
      entry.parts.push(box)
      entry.update = (t) => {
        const ph = (TAU * t) / period + (o.phase || 0)
        const x = (travel / 2) * Math.sin(ph)
        const v = ((travel / 2) * TAU * Math.cos(ph)) / period
        body.c.copy(f.base).addScaledVector(f.right, x).addScaledVector(f.up, h[1])
        body.vel.copy(f.right).multiplyScalar(v)
        box.position.copy(body.c)
      }
    } else if (o.type === 'boom') {
      // Leaves a ~2.2 m lane along each edge: hug the curb to sneak past. (`half`: the
      // spec's own half length - a shorter bar on a narrow road.)
      const half = o.half ?? Math.max(3, (o.width || 12) / 2 - 2.8)
      const h = [half, 0.45, 0.45]
      const body = world.addDynamic({ type: 'box', c: f.base.clone().addScaledVector(f.up, 1.1), h, ax: f.right.clone(), ay: f.up.clone(), az: f.fwd.clone().negate(), knock: 0.95, kind: 'boom' })
      body.angVel.copy(f.up).multiplyScalar(o.speed || 1.2)
      entry.bodies.push(body)
      const bar = part('boom', [h[0] * 2, h[1] * 2, h[2] * 2])
      bar.position.copy(body.c)
      const hub = part('hub', [1, 1, 1])
      hub.position.copy(f.base)
      hub.quaternion.copy(f.quat)
      entry.parts.push(bar, hub)
      entry.update = (t) => {
        const a = t * (o.speed || 1.2)
        _q.setFromAxisAngle(f.up, a)
        body.ax.copy(f.right).applyQuaternion(_q)
        body.az.copy(f.fwd).negate().applyQuaternion(_q)
        bar.quaternion.copy(_q).multiply(f.quat)
      }
    } else if (o.type === 'spinbar') {
      // The sweeper deck: a long arm turning about a hub in the middle of a round
      // platform at bumper height (with a short counterweight tail) - too low to drive
      // under: time it and slip past. On this first obstacle a hit shoves you about (low
      // knock, no fling); the platform's low wall keeps you on it. The collider is one
      // box from the tail's end to the tip, turning about the hub (not its own centre).
      const reach = o.reach || 12
      const tail = o.tail ?? 2
      const h = [(reach + tail) / 2, SPINBAR.half, SPINBAR.half]
      const offset = (reach - tail) / 2
      const pivot = f.base.clone().addScaledVector(f.up, SPINBAR.lift)
      const body = world.addDynamic({ type: 'box', c: pivot.clone().addScaledVector(f.right, offset), h, ax: f.right.clone(), ay: f.up.clone(), az: f.fwd.clone().negate(), knock: o.knock ?? 0.4, kind: 'spinbar' })
      body.angVel.copy(f.up).multiplyScalar(o.speed || 0.6)
      entry.bodies.push(body)
      // The arm is modelled at its true size, its origin on the pivot.
      const arm = part('spinbar', [1, 1, 1])
      arm.position.copy(pivot)
      const hub = part('hub', [SPINBAR.hubScale, 1, SPINBAR.hubScale])
      hub.position.copy(f.base)
      hub.quaternion.copy(f.quat)
      entry.parts.push(arm, hub)
      const lever = new Vector3()
      entry.update = (t) => {
        _q.setFromAxisAngle(f.up, spinbarAngle(o, t))
        body.ax.copy(f.right).applyQuaternion(_q)
        body.az.copy(f.fwd).negate().applyQuaternion(_q)
        lever.copy(body.ax).multiplyScalar(offset)
        body.c.copy(pivot).add(lever)
        body.vel.crossVectors(body.angVel, lever)
        arm.quaternion.copy(_q).multiply(f.quat)
      }
    } else if (o.type === 'slot') {
      // A container gate (static; colliders from obstacleStaticBoxes): two containers
      // end to end on each side of the gap, one across the top.
      const L = o.length || 12
      const B = SLOT_BOX
      const tint = Math.floor(Math.abs(o.x * 7 + o.z * 3))
      let k = 0
      for (const [x, y, , hh] of slotParts(o)) {
        const across = hh[0] > hh[2]
        const pieces = across ? [0] : [-L / 4, L / 4]
        for (const z of pieces) {
          const p = part('container', across ? [B, B, hh[0] * 2] : [B, B, L / 2])
          p.position.copy(f.base).addScaledVector(f.right, x).addScaledVector(f.up, y).addScaledVector(f.fwd, z)
          p.quaternion.copy(f.quat)
          // The top one lies across the road (its long axis along the road's right).
          if (across) p.quaternion.multiply(_q.setFromAxisAngle(Y_AXIS, Math.PI / 2))
          p.color = (tint + k * 3) % 7
          k += 1
          entry.parts.push(p)
        }
      }
      entry.update = null
    } else if (o.type === 'buoys') {
      // Balls rolling down the piece from its top, pooled. `heavy`: giant iron ballast
      // balls instead of buoys - bigger, and a hit knocks you much harder.
      const heavy = !!o.heavy
      const speed = o.speed || 16
      const interval = o.interval || 1.6
      const from = o.pi
      const to = o.piStart
      const length = path[from].s - path[to].s
      const travel = length / speed
      const pool = Math.ceil(travel / interval) + 1
      const r = heavy ? IRONBALL_R : BUOY_R
      const kind = heavy ? 'ironball' : 'buoy'
      const balls = []
      // (`look: 'snowball'`: a giant snowball drawn instead of the iron ball; `'boulder'`: a
      // lava boulder; a light ball with `look: 'coconut'`: a giant coconut.)
      // (The Desert Canyon's: heavy `'sandstone'` boulders, light `'tumbleweed'`s.)
      const look = (heavy ? { snowball: 'snowball', boulder: 'boulder', sandstone: 'sandstone' }[o.look] : { coconut: 'coconut', tumbleweed: 'tumbleweed' }[o.look]) || null
      for (let k = 0; k < pool; k += 1) {
        const body = world.addDynamic({ type: 'sphere', c: new Vector3(0, -999, 0), r, knock: o.knock ?? (heavy ? 0.9 : 0.5), kind, enabled: false })
        const p = part(look || kind, [r, r, r])
        p.visible = false
        balls.push({ body, p })
        entry.bodies.push(body)
        entry.parts.push(p)
      }
      // (`lanes`: the spec's own lane shares - the Tropical Island's coconuts keep to one side, like the iron balls.)
      const lanes = o.lanes || (heavy ? IRONBALL_LANES : BUOY_LANES)
      entry.update = (t) => {
        const first = Math.floor((t - travel) / interval) + 1
        for (let k = 0; k < pool; k += 1) {
          const ball = balls[k]
          // Which spawn this pool slot carries now.
          const n = first + ((((k - first) % pool) + pool) % pool)
          const age = t - n * interval
          if (age < 0 || age >= travel) {
            ball.body.enabled = false
            ball.p.visible = false
            continue
          }
          const dist = path[from].s - age * speed
          // Walk down the path to that distance.
          let i = from
          while (i > to && path[i - 1].s > dist) i -= 1
          const a = path[Math.max(to, i - 1)]
          const b = path[i]
          const span = b.s - a.s || 1
          const u = Math.max(0, Math.min(1, (dist - a.s) / span))
          // (`spread` > 1 pushes the lanes out towards the kerbs: on a narrow road an iron ball
          // still leaves the other side clear, overhanging the edge a little instead.)
          const lane = lanes[n % lanes.length] * (o.width || 12) * (o.spread ?? 1)
          const rx = Math.cos(o.yaw)
          const rz = -Math.sin(o.yaw)
          ball.body.c.set(a.x + (b.x - a.x) * u + rx * lane, a.y + (b.y - a.y) * u + r, a.z + (b.z - a.z) * u + rz * lane)
          // A big ball on a steep ramp sits on it along the road's normal, not straight up.
          if (heavy) ball.body.c.set(ball.body.c.x + b.ux * r, ball.body.c.y + (b.uy - 1) * r, ball.body.c.z + b.uz * r)
          ball.body.vel.set(-b.fx * speed, -b.fy * speed, -b.fz * speed)
          ball.body.enabled = true
          ball.p.visible = true
          ball.p.position.copy(ball.body.c)
          // Rolling: spin about the road's right axis (an iron ball's band stays round it).
          ball.p.quaternion.setFromAxisAngle(f.right, (-age * speed) / r)
          if (heavy || look) ball.p.quaternion.multiply(f.quat)
        }
      }
    } else if (o.type === 'post') {
      const period = o.period || 2.4
      const h = [0.75, 1.3, 0.75]
      const body = world.addDynamic({ type: 'box', c: new Vector3(), h, ax: f.right.clone(), ay: f.up.clone(), az: f.fwd.clone().negate(), knock: 0.9, kind: 'post' })
      entry.bodies.push(body)
      const post = part('post', [h[0] * 2, h[1] * 2, h[2] * 2])
      post.quaternion.copy(f.quat)
      entry.parts.push(post)
      entry.update = (t) => {
        // 0..1 through the cycle: up 45% of the time, quick pop, slower sink.
        const u = ((t / period + (o.phase || 0) / TAU) % 1 + 1) % 1
        let lift
        let vel
        if (u < 0.1) {
          lift = u / 0.1
          vel = 1 / (0.1 * period)
        } else if (u < 0.5) {
          lift = 1
          vel = 0
        } else if (u < 0.7) {
          lift = 1 - (u - 0.5) / 0.2
          vel = -1 / (0.2 * period)
        } else {
          lift = 0
          vel = 0
        }
        const range = h[1] * 2 + 0.2
        const off = -h[1] - 0.2 + lift * range
        body.c.copy(f.base).addScaledVector(f.up, off)
        body.vel.copy(f.up).multiplyScalar(vel * range)
        body.enabled = lift > 0.05
        post.position.copy(body.c)
        post.visible = lift > 0.02
      }
    } else if (o.type === 'lift') {
      const period = o.period || 4
      const travel = o.travel || 1.5
      const h = [5, 0.5, (o.length || 14) / 2]
      const body = world.addDynamic({ type: 'box', c: new Vector3(), h, ax: f.right.clone(), ay: f.up.clone(), az: f.fwd.clone().negate(), knock: 0, kind: 'platform' })
      entry.bodies.push(body)
      const plat = part('lift', [h[0] * 2, h[1] * 2, h[2] * 2])
      plat.quaternion.copy(f.quat)
      entry.parts.push(plat)
      entry.update = (t) => {
        const ph = (TAU * t) / period + (o.phase || 0)
        const off = travel * Math.sin(ph)
        body.c.copy(f.base).addScaledVector(f.up, off - h[1])
        body.vel.copy(f.up).multiplyScalar((travel * TAU * Math.cos(ph)) / period)
        plat.position.copy(body.c)
      }
    } else if (o.type === 'fan') {
      // Visual only: the gust itself is a 'wind' trigger. A housing at the roadside and
      // blades spinning about the axis that points across the road.
      const housing = part('fanHousing', [1, 1, 1])
      housing.position.copy(f.base).addScaledVector(f.up, 3.2)
      // Housing faces across the road: its local +Z along the blow direction.
      const across = f.right.clone().multiplyScalar(o.dir || 1)
      const fq = new Quaternion().setFromRotationMatrix(_basis.makeBasis(f.up.clone().cross(across).normalize(), f.up, across))
      housing.quaternion.copy(fq)
      const blades = part('fanBlades', [1, 1, 1])
      blades.position.copy(housing.position)
      entry.parts.push(housing, blades)
      entry.update = (t) => {
        blades.quaternion.setFromAxisAngle(across, t * 9).multiply(fq)
      }
    } else if (o.type === 'piston') {
      // A ram punching out of the side wall across part of the road, then retracting.
      const w = o.width || 9
      const side = o.side || 1
      // Stops just short of the centre line: the far half of the road is always safe.
      const reach = w * 0.45
      const h = [reach / 2, 0.9, 1.3]
      const period = o.period || 3
      const out = (w / 2 + h[0]) * side
      const inn = (w / 2 + h[0] - reach) * side
      const body = world.addDynamic({ type: 'box', c: new Vector3(), h, ax: f.right.clone(), ay: f.up.clone(), az: f.fwd.clone().negate(), knock: 0.8, kind: 'piston' })
      entry.bodies.push(body)
      const ram = part('piston', [h[0] * 2, h[1] * 2, h[2] * 2])
      ram.quaternion.copy(f.quat)
      const base = part('pistonBase', [1, 1, 1])
      base.position.copy(f.base).addScaledVector(f.right, (w / 2 + 1.1) * side).addScaledVector(f.up, 1)
      base.quaternion.copy(f.quat)
      entry.parts.push(ram, base)
      entry.update = (t) => {
        // rest 40%, punch 12% (fast), hold 18%, retract 30%.
        const u = ((t / period + (o.phase || 0) / TAU) % 1 + 1) % 1
        let k
        let dk
        if (u < 0.4) {
          k = 0
          dk = 0
        } else if (u < 0.52) {
          k = (u - 0.4) / 0.12
          dk = 1 / (0.12 * period)
        } else if (u < 0.7) {
          k = 1
          dk = 0
        } else {
          k = 1 - (u - 0.7) / 0.3
          dk = -1 / (0.3 * period)
        }
        const x = out + (inn - out) * k
        body.c.copy(f.base).addScaledVector(f.right, x).addScaledVector(f.up, h[1] + 0.05)
        body.vel.copy(f.right).multiplyScalar((inn - out) * dk)
        // Only dangerous while it's out on the road.
        body.enabled = k > 0.02
        body.knock = dk > 0 ? 0.8 : 0.4
        if (dk > 0 && !entry.punching) entry.cue = 'piston'
        entry.punching = dk > 0
        ram.position.copy(body.c)
      }
    } else if (o.type === 'drawbridge') {
      // Two leaves hinged at either end of the gap, lifting together then lowering flat.
      const gapLen = path[o.piEnd].s - path[o.piStart].s + 2
      const L = gapLen / 2 - 0.2
      const period = o.period || 6
      const maxAngle = (55 * Math.PI) / 180
      const h = [(o.width || 12) / 2, 0.45, L / 2]
      const leaves = [-1, 1].map((end) => {
        // Hinge at the gap end; the leaf extends towards the middle.
        const hinge = f.base.clone().addScaledVector(f.fwd, (end * gapLen) / 2).addScaledVector(f.up, -h[1])
        const body = world.addDynamic({ type: 'box', c: new Vector3(), h, ax: f.right.clone(), ay: f.up.clone(), az: f.fwd.clone().negate(), knock: 0, kind: 'platform' })
        const leaf = part('lift', [h[0] * 2, h[1] * 2, h[2] * 2])
        entry.bodies.push(body)
        entry.parts.push(leaf)
        return { end, hinge, body, leaf, toMid: f.fwd.clone().multiplyScalar(-end), arm: new Vector3() }
      })
      entry.update = (t) => {
        // Flat 45% of the cycle, rise 20%, stay up 15%, lower 20%. Creaks as it starts moving.
        const moving = ((((t / period + (o.phase || 0) / TAU) % 1) + 1) % 1) >= 0.45
        if (moving && !entry.moving) entry.cue = 'bridge'
        entry.moving = moving
        const u = ((t / period + (o.phase || 0) / TAU) % 1 + 1) % 1
        let a
        let da
        if (u < 0.45) {
          a = 0
          da = 0
        } else if (u < 0.65) {
          a = ((u - 0.45) / 0.2) * maxAngle
          da = maxAngle / (0.2 * period)
        } else if (u < 0.8) {
          a = maxAngle
          da = 0
        } else {
          a = (1 - (u - 0.8) / 0.2) * maxAngle
          da = -maxAngle / (0.2 * period)
        }
        for (const lf of leaves) {
          // Rotating about the right axis so the leaf's middle end lifts: +angle lifts a
          // forward-pointing arm (near leaf), -angle a backward-pointing one (far leaf).
          const axisSign = -lf.end
          _q.setFromAxisAngle(f.right, a * axisSign)
          lf.arm.copy(lf.toMid).multiplyScalar(L / 2).applyQuaternion(_q)
          lf.body.c.copy(lf.hinge).add(lf.arm)
          lf.body.ay.copy(f.up).applyQuaternion(_q)
          lf.body.az.copy(f.fwd).negate().applyQuaternion(_q)
          lf.body.ax.copy(f.right)
          lf.body.angVel.copy(f.right).multiplyScalar(da * axisSign)
          lf.body.vel.crossVectors(lf.body.angVel, lf.arm)
          lf.leaf.position.copy(lf.body.c)
          lf.leaf.quaternion.copy(_q).multiply(f.quat)
        }
      }
    } else if (o.type === 'turntable') {
      // A square deck turning slowly in the middle of a gap.
      const size = (o.width || 12) + 3
      const h = [size / 2, 0.5, size / 2]
      const body = world.addDynamic({ type: 'box', c: f.base.clone().addScaledVector(f.up, -h[1]), h, ax: f.right.clone(), ay: f.up.clone(), az: f.fwd.clone().negate(), knock: 0, kind: 'platform' })
      body.angVel.copy(f.up).multiplyScalar(o.speed || 0.6)
      entry.bodies.push(body)
      const deck = part('lift', [size, h[1] * 2, size])
      deck.position.copy(body.c)
      entry.parts.push(deck)
      entry.update = (t) => {
        _q.setFromAxisAngle(f.up, t * (o.speed || 0.6))
        body.ax.copy(f.right).applyQuaternion(_q)
        body.az.copy(f.fwd).negate().applyQuaternion(_q)
        deck.quaternion.copy(_q).multiply(f.quat)
      }
    } else if (o.type === 'doors') {
      // Three roller doors; one (re-rolled each visit) is open, the other two are solid.
      // A shut one is a soft stop: no knock-back beyond the bump itself.
      const w = o.width || 16
      const { opening, lanes } = doorLayout(w)
      const gantry = part('gantry', [w / 16, 1, 1])
      gantry.position.copy(f.base)
      gantry.quaternion.copy(f.quat)
      entry.parts.push(gantry)
      const doors = lanes.map((lane) => {
        const body = world.addDynamic({
          type: 'box',
          c: f.base.clone().addScaledVector(f.right, lane).addScaledVector(f.up, DOOR_HEIGHT / 2),
          h: [opening / 2, DOOR_HEIGHT / 2, 0.25],
          ax: f.right.clone(),
          ay: f.up.clone(),
          az: f.fwd.clone().negate(),
          knock: 0,
          kind: 'door',
        })
        entry.bodies.push(body)
        // The shutter's origin is its top edge: scaling y rolls it up into the lintel.
        const shutter = part('shutter', [opening, DOOR_HEIGHT, 1])
        shutter.position.copy(f.base).addScaledVector(f.right, lane).addScaledVector(f.up, DOOR_HEIGHT)
        shutter.quaternion.copy(f.quat)
        const lamp = part('lamp', [1, 1, 1])
        lamp.position.copy(f.base).addScaledVector(f.right, lane).addScaledVector(f.up, DOOR_HEIGHT + 0.6).addScaledVector(f.fwd, -0.62)
        lamp.quaternion.copy(f.quat)
        lamp.tint = LAMP_IDLE
        entry.parts.push(shutter, lamp)
        return { body, shutter, lamp }
      })
      const roll = () => {
        entry.open = Math.min(2, Math.floor(random() * 3))
        entry.openLane = lanes[entry.open]
        doorLanes.set(o.id, entry.openLane)
      }
      roll()
      entry.near = false
      entry.revealed = false
      entry.update = (t, viewer) => {
        // Where the viewer is relative to the gantry: along the road, across it, above it.
        let along = -1e9
        let across = 1e9
        let above = 1e9
        if (viewer) {
          const dx = viewer.x - f.base.x
          const dy = viewer.y - f.base.y
          const dz = viewer.z - f.base.z
          along = dx * f.fwd.x + dy * f.fwd.y + dz * f.fwd.z
          across = dx * f.right.x + dy * f.right.y + dz * f.right.z
          above = dx * f.up.x + dy * f.up.y + dz * f.up.z
        }
        const near = along > -DOOR_NEAR && along < 6 && Math.abs(across) < w && Math.abs(above) < 8
        // Left it behind (through it, or fell / respawned): a different door next time.
        if (entry.near && !near) roll()
        entry.near = near
        const reveal = near && along > -DOOR_HINT
        if (reveal && !entry.revealed) entry.cue = 'door'
        entry.revealed = reveal
        // The open shutter: a lit gap at the bottom once revealed, then it rolls right up
        // as you arrive (and stays up until you've gone).
        let lift = 1
        if (reveal) lift = along < -8 ? 0.86 : Math.max(0.06, 0.86 - ((along + 8) / 5) * 0.8)
        for (let k = 0; k < 3; k += 1) {
          const d = doors[k]
          const open = k === entry.open
          d.body.enabled = !open
          d.shutter.scale.y = DOOR_HEIGHT * (open ? lift : 1)
          d.lamp.tint = reveal ? (open ? LAMP_OPEN : LAMP_SHUT) : LAMP_IDLE
        }
      }
    } else if (o.type === 'traffic') {
      // Forklifts (or, with `vehicle: 'truck'`, cargo trucks) shuttling across the road
      // from a shed on one side into a shed on the other, `interval` seconds apart
      // (pooled). A hit flings you off the road, the way it was going.
      const w = o.width || 14
      const dir = o.dir || 1
      const isTruck = o.vehicle === 'truck'
      const speed = o.speed || 5.5
      const interval = o.interval || 3.4
      const offset = o.phase || 0
      const h = isTruck ? TRUCK_HALF : FORKLIFT_HALF
      // Trucks come out of longer sheds (the forklift shed stretched to 7.5 m deep).
      const shedDepth = isTruck ? 1.5 : 1
      // Doorways sit 0.8 m off the road edge; a vehicle is out of sight once wholly inside.
      const hidden = w / 2 + 0.8 + h[0]
      const reach = w / 2 + 4.6
      const travel = (2 * reach) / speed
      const pool = Math.ceil(travel / interval) + 1
      // The model faces +X (its travel direction): turned round for the other way.
      const quat = f.quat.clone()
      if (dir < 0) quat.multiply(new Quaternion().setFromAxisAngle(Y_AXIS, Math.PI))
      for (const side of [-1, 1]) {
        // The shed's doorway (+X in the model) faces the road.
        // (`look: 'minecart'`, the Desert Canyon's: mine carts out of a timbered mine adit.)
        const shed = part(o.look === 'minecart' ? 'mineAdit' : 'shed', [shedDepth, 1, 1])
        shed.position.copy(f.base).addScaledVector(f.right, side * (w / 2 + 0.8 + 2.5 * shedDepth))
        shed.quaternion.copy(f.quat)
        if (side > 0) shed.quaternion.multiply(new Quaternion().setFromAxisAngle(Y_AXIS, Math.PI))
        entry.parts.push(shed)
      }
      const trucks = []
      for (let k = 0; k < pool; k += 1) {
        const body = world.addDynamic({ type: 'box', c: new Vector3(0, -999, 0), h, ax: f.right.clone(), ay: f.up.clone(), az: f.fwd.clone().negate(), knock: o.knock ?? (isTruck ? 1.5 : 1.4), fling: f.right, kind: isTruck ? 'truck' : 'forklift', enabled: false })
        const p = part(o.look === 'minecart' ? 'mineCart' : isTruck ? 'truck' : 'forklift', [1, 1, 1])
        p.quaternion.copy(quat)
        p.visible = false
        // Per trip: which spawn it carries, whether it has hit you, how long it has waited.
        trucks.push({ body, p, n: null, hit: false, delay: 0, knock: 0 })
        entry.bodies.push(body)
        entry.parts.push(p)
      }
      // A forklift that has hit you stops while you're in its way, as long as it can
      // without the next one catching it up (then it carries on, no longer solid).
      const maxDelay = Math.max(0, pool * interval - travel - 0.3)
      entry.lastSpawn = null
      entry.lastT = null
      entry.update = (t, viewer) => {
        const tt = t - offset
        const dt = entry.lastT === null ? 0 : Math.max(0, Math.min(0.1, t - entry.lastT))
        entry.lastT = t
        // A reversing beep as each one sets off.
        const latest = Math.floor(tt / interval)
        if (latest !== entry.lastSpawn) {
          if (entry.lastSpawn !== null) entry.cue = 'beep'
          entry.lastSpawn = latest
        }
        const first = Math.floor((tt - travel - maxDelay) / interval) + 1
        for (let k = 0; k < pool; k += 1) {
          const truck = trucks[k]
          const n = first + ((((k - first) % pool) + pool) % pool)
          if (n !== truck.n) {
            truck.n = n
            truck.hit = false
            truck.delay = 0
            truck.knock = truck.body.knockUntil || 0
          }
          if ((truck.body.knockUntil || 0) !== truck.knock) {
            truck.knock = truck.body.knockUntil
            truck.hit = true
          }
          const age = tt - n * interval - truck.delay
          if (age < 0 || age >= travel) {
            truck.body.enabled = false
            truck.body.c.y = -999
            truck.p.visible = false
            continue
          }
          let x = dir * (-reach + speed * age)
          let waiting = false
          if (truck.hit && viewer && truck.delay < maxDelay) {
            const dx = viewer.x - truck.body.c.x
            const dy = viewer.y - truck.body.c.y
            const dz = viewer.z - truck.body.c.z
            const ahead = (dx * f.right.x + dy * f.right.y + dz * f.right.z) * dir
            const beside = dx * f.fwd.x + dy * f.fwd.y + dz * f.fwd.z
            waiting = ahead > -0.5 && ahead < h[0] + 3.5 && Math.abs(beside) < h[2] + 2.6 && Math.abs(dy) < 4
          }
          if (waiting) {
            truck.delay = Math.min(maxDelay, truck.delay + dt)
            x = dir * (-reach + speed * (tt - n * interval - truck.delay))
          }
          truck.body.c.copy(f.base).addScaledVector(f.right, x).addScaledVector(f.up, h[1] + 0.05)
          truck.body.vel.copy(f.right).multiplyScalar(waiting ? 0 : dir * speed)
          // Only solid where it can touch the road (out of sight inside the sheds), and
          // not once it has had to give up waiting for you.
          truck.body.enabled = Math.abs(x) - h[0] < w / 2 + 0.5 && !(truck.hit && truck.delay >= maxDelay)
          truck.p.visible = Math.abs(x) < hidden
          truck.p.position.copy(f.base).addScaledVector(f.right, x)
        }
      }
    } else if (o.type === 'pipes') {
      // Steel pipes rolling down the ramp from the top of the piece, each blocking one
      // side of the road (pooled, like the buoys). The collider is a box that doesn't
      // turn with the pipe: close enough to a cylinder at this size.
      const w = o.width || 13
      const speed = o.speed || 9
      const interval = o.interval || 3
      const from = o.pi
      const to = o.piStart
      const length = path[from].s - path[to].s
      const travel = length / speed
      const pool = Math.ceil(travel / interval) + 1
      const L = pipeLength(w)
      const laneOff = w / 2 - 0.75 - L / 2
      // The chute's guard walls (their colliders are static boxes).
      for (const cw of chuteWalls(stage, o)) {
        const wall = part('chute', [cw.h[0] * 2, cw.h[1] * 2, cw.h[2] * 2])
        wall.position.copy(cw.c)
        wall.quaternion.setFromRotationMatrix(_basis.makeBasis(cw.ax, cw.ay, cw.az))
        entry.parts.push(wall)
      }
      const pipes = []
      for (let k = 0; k < pool; k += 1) {
        const body = world.addDynamic({ type: 'box', c: new Vector3(0, -999, 0), h: [L / 2, PIPE_R * 0.92, PIPE_R * 0.92], ax: f.right.clone(), ay: f.up.clone(), az: f.fwd.clone().negate(), knock: 0.55, kind: 'pipe', enabled: false })
        const p = part('pipe', [L, PIPE_R, PIPE_R])
        p.visible = false
        // Per trip: which spawn it carries, and when (age) it hit you, if it has.
        pipes.push({ body, p, n: null, hitAt: -1, knock: 0 })
        entry.bodies.push(body)
        entry.parts.push(p)
      }
      entry.update = (t) => {
        const first = Math.floor((t - travel) / interval) + 1
        for (let k = 0; k < pool; k += 1) {
          const pipe = pipes[k]
          const n = first + ((((k - first) % pool) + pool) % pool)
          const age = t - n * interval
          if (n !== pipe.n) {
            pipe.n = n
            pipe.hitAt = -1
            pipe.knock = pipe.body.knockUntil || 0
          }
          // It knocked you: it bounces over you instead of bulldozing you down the ramp.
          if ((pipe.body.knockUntil || 0) !== pipe.knock) {
            pipe.knock = pipe.body.knockUntil
            if (pipe.hitAt < 0) pipe.hitAt = age
          }
          if (age < 0 || age >= travel) {
            pipe.body.enabled = false
            pipe.body.c.y = -999
            pipe.p.visible = false
            continue
          }
          const dist = path[from].s - age * speed
          let i = from
          while (i > to && path[i - 1].s > dist) i -= 1
          const a = path[Math.max(to, i - 1)]
          const b = path[i]
          const span = b.s - a.s || 1
          const u = Math.max(0, Math.min(1, (dist - a.s) / span))
          const lane = PIPE_SIDES[((n % PIPE_SIDES.length) + PIPE_SIDES.length) % PIPE_SIDES.length] * laneOff
          pipe.body.c
            .set(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u)
            .addScaledVector(f.right, lane)
            .addScaledVector(f.up, PIPE_R)
          pipe.body.vel.set(-b.fx * speed, -b.fy * speed, -b.fz * speed)
          pipe.body.enabled = pipe.hitAt < 0
          pipe.p.visible = true
          pipe.p.position.copy(pipe.body.c)
          const hop = pipe.hitAt < 0 ? 1 : (age - pipe.hitAt) / 0.8
          if (hop < 1) pipe.p.position.addScaledVector(f.up, 2.8 * Math.sin(Math.PI * hop))
          _q.setFromAxisAngle(f.right, (-age * speed) / PIPE_R)
          pipe.p.quaternion.copy(_q).multiply(f.quat)
        }
      }
    } else if (o.type === 'drone') {
      // A cargo drone hovering at bumper height, strafing across the road (`sweep` m
      // either side of its lane) or circling (`radius`), bobbing a little.
      const period = o.period || 3.2
      const w = TAU / period
      // A hit flings you off the road, the way it was strafing.
      const body = world.addDynamic({ type: 'sphere', c: new Vector3(), r: DRONE_R, knock: o.knock ?? 2.2, fling: f.right, kind: 'drone' })
      entry.bodies.push(body)
      const drone = part('drone', [1, 1, 1])
      entry.parts.push(drone)
      entry.update = (t) => {
        const ph = w * t + (o.phase || 0)
        let x
        let z
        let vx
        let vz
        if (o.pattern === 'circle') {
          const R = o.radius || 3.5
          x = R * Math.cos(ph)
          z = R * Math.sin(ph)
          vx = -R * w * Math.sin(ph)
          vz = R * w * Math.cos(ph)
        } else {
          const A = o.sweep ?? 3
          x = A * Math.sin(ph)
          z = 0
          vx = A * w * Math.cos(ph)
          vz = 0
        }
        const bob = t * 2.7 + (o.phase || 0) * 3
        const y = DRONE_Y + 0.16 * Math.sin(bob)
        const vy = 0.16 * 2.7 * Math.cos(bob)
        // f.base already sits on the drone's lane.
        body.c.copy(f.base).addScaledVector(f.right, x).addScaledVector(f.fwd, z).addScaledVector(f.up, y)
        body.vel.copy(f.right).multiplyScalar(vx).addScaledVector(f.fwd, vz).addScaledVector(f.up, vy)
        drone.position.copy(body.c)
        // Leans into where it's going.
        _q.setFromAxisAngle(f.fwd, vx * 0.045)
        _q2.setFromAxisAngle(f.right, -vz * 0.045)
        drone.quaternion.copy(_q).multiply(_q2).multiply(f.quat)
      }
    } else if (o.type === 'pontoon') {
      // A loose plank of the driftwood bridge that gives under you: `mode: 'tilt'` rolls
      // it towards `side` (+1: the right edge goes down), 'sink' dips it near end first
      // (the far end a third as much, so the step up off it stays small). It gives while
      // you're on it and floats back up once you're off, and bobs on the swell all the
      // time. Its one piece of state, like the doors': how far it has given (`load`).
      const L = o.length || 6
      const W = o.width || 8
      const h = [W / 2, PONTOON.thick / 2, L / 2 + 0.04]
      const tilt = o.mode === 'tilt'
      const amp = (((o.amp ?? PONTOON.tilt) * Math.PI) / 180) * (o.side || 1)
      // Dip of the deck's middle (the mean of both ends) and its pitch, at full give.
      const sink = ((o.depth ?? PONTOON.dip) * 2) / 3
      const swell = (o.x * 0.37 + o.z * 0.23) % TAU
      const body = world.addDynamic({ type: 'box', c: f.base.clone().addScaledVector(f.up, -h[1]), h, ax: f.right.clone(), ay: f.up.clone(), az: f.fwd.clone().negate(), knock: 0, kind: 'platform' })
      entry.bodies.push(body)
      // The deck's origin is the middle of its top face.
      const deck = part('pontoon', [W / PONTOON.model[0], 1, L / PONTOON.model[1]])
      deck.position.copy(f.base)
      deck.quaternion.copy(f.quat)
      entry.parts.push(deck)
      const top = new Vector3()
      const arm = new Vector3()
      entry.load = 0
      entry.lastT = null
      entry.update = (t, viewer) => {
        // A gap in the updates (out of the active window): it has long floated back.
        const fresh = entry.lastT === null || t - entry.lastT > 0.5 || t < entry.lastT
        const dt = fresh ? 0 : t - entry.lastT
        if (fresh) entry.load = 0
        entry.lastT = t
        // Is the viewer's car on the deck? (Measured in its resting frame, generously.)
        let on = false
        if (viewer) {
          const dx = viewer.x - f.base.x
          const dy = viewer.y - f.base.y
          const dz = viewer.z - f.base.z
          const along = dx * f.fwd.x + dy * f.fwd.y + dz * f.fwd.z
          const across = dx * f.right.x + dy * f.right.y + dz * f.right.z
          const above = dx * f.up.x + dy * f.up.y + dz * f.up.z
          on = Math.abs(along) < L / 2 + 0.3 && Math.abs(across) < W / 2 + 0.3 && above > -1.8 && above < 2.6
        }
        const k0 = entry.load
        const k = on ? Math.min(1, k0 + dt / PONTOON.give) : Math.max(0, k0 - dt / PONTOON.recover)
        entry.load = k
        if (on && k0 === 0 && k > 0) entry.cue = 'bridge'
        const dk = dt > 0 ? (k - k0) / dt : 0
        // Eased, so it starts and stops giving gently.
        const e = k * k * (3 - 2 * k)
        const de = 6 * k * (1 - k) * dk
        let lift = 0.05 * Math.sin(t * 1.6 + swell)
        let dLift = 0.08 * Math.cos(t * 1.6 + swell)
        let dAngle
        if (tilt) {
          _q.setFromAxisAngle(f.fwd, amp * e)
          dAngle = amp * de
        } else {
          lift -= sink * e
          dLift -= sink * de
          const slope = (sink * e) / L
          _q.setFromAxisAngle(f.right, Math.atan(slope))
          dAngle = ((sink * de) / L) / (1 + slope * slope)
        }
        top.copy(f.base).addScaledVector(f.up, lift)
        arm.copy(f.up).multiplyScalar(-h[1]).applyQuaternion(_q)
        body.c.copy(top).add(arm)
        body.ax.copy(f.right).applyQuaternion(_q)
        body.ay.copy(f.up).applyQuaternion(_q)
        body.az.copy(f.fwd).negate().applyQuaternion(_q)
        body.angVel.copy(tilt ? f.fwd : f.right).multiplyScalar(dAngle)
        body.vel.crossVectors(body.angVel, arm).addScaledVector(f.up, dLift)
        deck.position.copy(top)
        deck.quaternion.copy(_q).multiply(f.quat)
      }
    } else if (o.type === 'laser') {
      // A laser gate's light curtain (shared/stages/pieces.js laserGate): hanging from a
      // gantry over `span` m of the road, solid while lit (`duty` of every `period` s),
      // flickering for LASER.warn s before it lights. A hit zaps you back the way you
      // came (no fling). The gate's first curtain also carries the gantry (`frame`).
      const span = o.span || 4
      const h = [span / 2, LASER.height / 2, LASER.depth / 2]
      const body = world.addDynamic({ type: 'box', c: f.base.clone().addScaledVector(f.up, h[1]), h, ax: f.right.clone(), ay: f.up.clone(), az: f.fwd.clone().negate(), knock: o.knock ?? LASER.knock, kind: 'laser', enabled: false })
      entry.bodies.push(body)
      const curtain = part('laser', [span, 1, 1])
      curtain.position.copy(f.base)
      curtain.quaternion.copy(f.quat)
      curtain.visible = false
      entry.parts.push(curtain)
      if (o.frame) {
        // Centred on the road (the curtain sits `lane` off it), as wide as the road here.
        const frame = part('laserFrame', [(path[o.pi]?.w || o.width || 12) / LASER.frameWidth, 1, 1])
        frame.position.copy(f.base).addScaledVector(f.right, -(o.lane || 0))
        frame.quaternion.copy(f.quat)
        entry.parts.push(frame)
      }
      entry.lit = false
      entry.update = (t) => {
        const { lit, warn } = laserState(o, t)
        body.enabled = lit
        // Flickers (12 Hz) while it warns, steady once lit.
        curtain.visible = lit || (warn && Math.floor(t * 24) % 2 === 0)
        if (lit && !entry.lit) entry.cue = 'laser'
        entry.lit = lit
      }
    }
    // The separately drawn looks' parts only in a draw-only copy (`looks`), the rest only in the real one.
    if (looks || entry.parts.some((p) => SEPARATE_LOOKS.has(p.kind))) entry.parts = entry.parts.filter((p) => SEPARATE_LOOKS.has(p.kind) === looks)
    list.push(entry)
  }

  return {
    list,
    /**
     * Moves every obstacle in sections [minSection, maxSection]; parks the rest.
     * `viewer` ({x, y, z}, optional) is the player's car, for the cargo doors.
     */
    update(time, minSection = -Infinity, maxSection = Infinity, viewer = null) {
      for (let i = 0; i < list.length; i += 1) {
        const e = list[i]
        const on = e.o.section >= minSection && e.o.section <= maxSection
        if (on !== e.active) {
          e.active = on
          for (const b of e.bodies) b.enabled = on
        }
        if (on && e.update) e.update(time, viewer)
      }
    },
    dispose() {
      for (const e of list) for (const b of e.bodies) world.removeDynamic(b)
    },
  }
}

export { frameOf }
