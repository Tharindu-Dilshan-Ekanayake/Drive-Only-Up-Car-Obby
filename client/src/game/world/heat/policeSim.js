import {
  AdditiveBlending,
  Color,
  ConeGeometry,
  DoubleSide,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { carById } from '@shared/cars'
import { inLobby } from '@shared/lobby'
import { BURN_TIME } from '@shared/missile'
import { plazaAt } from '@shared/safeZones'

import { MAX_TRICK_SCORE } from '@shared/balance'

import { heatSfx, heatSiren } from '../../../audio/heatSfx'
import { actions } from '../../../net/actions'
import { getGame } from '../../../store/game'
import { useQuality } from '../../../store/quality'
import { createKit, finishPaint } from '../../cars/carModels'
import { getCarMaterial } from '../../cars/carMaterial'
import { wheelBatch } from '../../cars/CarRig'
import { defer } from '../../defer'
import { carLights } from '../../fx/carLights'
import { burst } from '../../fx/fxQueue'
import { ignite, registerMissileTargets } from '../../fx/missileHub'
import { addCarBody } from '../../physics/carBody'
import { physicsWorld } from '../../physics/instance'
import { getWorldMaterial, sirenOn } from '../../render/worldMaterial'
import { runtime } from '../../runtime'
import { night } from '../nightLight'
import { HEAT_MAX, heat, resetHeat } from './heatState'
import { getPoliceModel, getRotorModel, POLICE_KINDS } from './policeModels'
import { radio, resetRadio } from './radio'
import { createTraffic } from './traffic'

/**
 * Heat Run's police: client-side AI, one set per player (nobody else sees or fights your
 * police; other players are ghosts on this map). Everything here is plain mutable state
 * the frame loop owns - no React state, no allocation per frame.
 *
 * PURSUERS ride the stage path the way the CPU racers do (bots/Bots.jsx: a distance `s`
 * along it and a `lane` across it, so they never fall off and cost no physics sim), at a
 * pace set by the gap to you: they close in from behind at up to their kind's top speed,
 * line up with your lane when they're near and then steer straight at you and ram -
 * their car-sized collision box (physics/carBody.js, kind 'bot') hits your car and the
 * bump system (shared/bump.js via physics/car.js carContact) throws you. Ram one yourself:
 * a hard ram (closing speed x your car's weight factor over the kind's `throw`) sends it
 * flying off the road - a takedown - and a lighter one shoves it across the road (past the
 * edge: thrown too), once per RAM_COOL s; the jeep and the tank are heavy (only a very hard
 * hit moves the tank). A Rocket Missile (game/fx/missiles.js) burns a unit and throws it off
 * the road at once (`missileHit`), the way it burns a CPU racer. They never drive onto the plaza you're on (checkpoint plazas are safe
 * zones): they wait at its edge. They steer round moving obstacles and traffic (or brake
 * short), take the inside of bends, and from heat 3 work in FORMATIONS - a rolling block
 * (one overtakes and brakes in front of you) and a box (two on your flanks); from heat 2 a
 * unit on your rear quarter may line up a telegraphed PIT (a spin you can drive out of).
 *
 * HEAT 1-5 (heatState.js) rises as you go (+0.75 per checkpoint, +0.035/s with police
 * within 40 m, +0.15 per police car you ram) and decides what spawns (TABLE). Break their
 * LINE OF SIGHT (distance, a bend, a tunnel or the car park's roof; the helicopter: any
 * cover) for the EVADE time (4 s at heat 1 .. 9 s at heat 5) and it drops a level and the
 * units that lost you give up; while you're unseen they search at a steady pace.
 *
 * GADGETS (non-lethal, telegraphed: the unit's lights strobe white and a charge glows at
 * its muzzle for 0.8 s, with a warning beep, before it fires; the shot flies at ~22 m/s
 * relative to you at where you'd be, so a swerve dodges it): foam balls (patrol cars at
 * heat 3+, the tank) slow you, the net (jeep) slows you harder for a moment, the EMP bolt
 * (cab) knocks the nitro out for 2 s (physics/car.js applyHazard). The HELICOPTER (heat
 * 4+) follows overhead with a searchlight and every ~9 s drops a spike strip (a real
 * `spikes` trigger, half the road) or an EMP mine ahead of you.
 *
 * ROADBLOCKS (stage.heat.roadblocks, from heat 2): parked police cars across part of the
 * road ~110 m before a checkpoint, a gap left on one side (from heat 3 wider, with a spike
 * strip across its inner 3 m); once you're through, its cars pull out and chase.
 *
 * TRAFFIC (./traffic.js): civilian cars on the wide roads, which units crash into.
 * BOUNTY: points for a live pursuit and for close calls, dodges, takedowns, roadblocks and
 * evades, banked at each checkpoint plaza (coins via the trick message, server-capped),
 * lost when BUSTED. RADIO (./radio.js): dispatch lines on the HUD.
 *
 * BUSTED: the meter fills while a unit is within 6 m and you're slower than 25 km/h (2 s,
 * 1.3 s if also boxed) or boxed in at speed (2+ units within 8 m: 3.2 s), empties when you
 * break free; full -> BUSTED! (1.5 s, the
 * car held) -> respawn at your last checkpoint (runtime.input.respawn, the usual path),
 * heat down a level, the police reset behind you with a 3 s grace (none within 60 m).
 *
 * Budgets: <= 6 pursuers (LOW 3, MEDIUM 5), traffic LOW 2 / MEDIUM 4 / HIGH 6, and never
 * more than 30 enabled moving bodies in all (counted live every frame: enforceBudget); one
 * draw per vehicle kind on screen (instanced), one for every projectile, one for spike
 * strips, the helicopter's two meshes and its cone (MEDIUM+ only); siren flares, strobe
 * and searchlight pools go in the shared night-lights batch (fx/carLights.js).
 */

// --- Rules --------------------------------------------------------------------------

/**
 * Per kind: top speed (m/s), extra closing speed when ramming, lane speed, gadget, how
 * often (s), and `throw`: how hard you must ram it (closing speed x your car's weight
 * factor, m/s) to throw it off the road instead of just shoving it - see onBump.
 */
export const KIND = {
  patrol: { cap: 33, ram: 6.5, laneRate: 4, weapon: 'foam', weaponLevel: 3, every: [7, 10], throw: 7.5 },
  cab: { cap: 37, ram: 7, laneRate: 4.5, weapon: 'emp', weaponLevel: 3, every: [7, 10], throw: 7.5 },
  jeep: { cap: 31.5, ram: 10, laneRate: 3.5, weapon: 'net', weaponLevel: 3, every: [6, 8], throw: 10 },
  bike: { cap: 36, ram: 5, laneRate: 6.5, weapon: null, swerve: 1.8, throw: 5 },
  tank: { cap: 23, ram: 4, laneRate: 2.2, weapon: 'foam', weaponLevel: 4, every: [3.5, 5], big: true, throw: 20 },
}
/** A shoved unit slides sideways at (ram throw x its knock x your weight) x this; the same unit can't be shoved again for RAM_COOL s. */
const SHOVE_GAIN = 1.5
const RAM_COOL = 0.9
/** A unit thrown off the road leaves at least this fast sideways (m/s) and this high (m/s); a missile's throw. */
const THROW_SIDE = 11
const THROW_LIFT = 4
const MISSILE_SIDE = 14
const MISSILE_LIFT = 9

/** Spawn table by heat level: at most `max` pursuers, picked by weight (`tank` at most one). */
export const TABLE = [
  null,
  { max: 2, w: { bike: 1, patrol: 2 } },
  { max: 3, w: { bike: 1.2, patrol: 2 } },
  { max: 4, w: { bike: 1, patrol: 1.5, jeep: 1.5, cab: 1.5 } },
  { max: 5, w: { bike: 1, patrol: 1.2, jeep: 1.5, cab: 1.5, tank: 1 }, heli: true },
  { max: 6, w: { bike: 1, patrol: 1, jeep: 1.6, cab: 1.6, tank: 1.2 }, heli: true },
]
/** Kinds each level brings in: the first spawns after reaching it are these. */
const INTRO = [[], ['bike', 'patrol'], [], ['jeep', 'cab'], ['tank'], []]
/** Pursuers at most per quality preset (LOW: 3). */
const QUALITY_MAX = { LOW: 3, MEDIUM: 5, HIGH: 6 }
/** Moving rigid bodies at most, everything included (perf contract). */
const BODY_BUDGET = 30

const HEAT_PER_CHECKPOINT = 0.75
const HEAT_PER_SECOND_NEAR = 0.035
const HEAT_NEAR = 40
const HEAT_PER_RAM = 0.15
/** Engaged: a unit has seen you within this (m) - from then on, slipping out of sight counts (EVADE_*). */
const ESCAPE_DIST = 150
/** BUSTED: ranges (m), slow speed (km/h), fill and drain times (s), the moment's length. */
const BUST_NEAR = 6
const BUST_BOX = 8
const BUST_SLOW = 25
const BUST_FILL = 2
const BUST_FILL_FAST = 1.3
/** Boxed in at speed (2+ units within 8 m, you're not slow): a slower fill - you can still brake or ram out. */
const BUST_FILL_BOXED = 3.2
const BUST_DRAIN = 1.2
const BUSTED_TIME = 1.5
/** After a bust or respawn: no police within GRACE_DIST m for GRACE s. */
const GRACE = 3
const GRACE_DIST = 60
/** Collision boxes are switched on within this distance of your car (m). */
const COLLIDE = 25
const SPAWN_GAP = [3.5, 2.5]
/** Gadget shots: relative speed (m/s), gravity on foam (m/s^2), hit radii (m). */
const SHOT_SPEED = 22
const SHOT_G = 14
const HIT_R = { foam: 1.9, net: 2.4, emp: 1.8, mine: 3.2 }
const SHOT_COLORS = { foam: '#ff7ad8', net: '#8dff5a', emp: '#5fe3ff', mine: '#5fe3ff', drop: '#ffc41f' }
const CHARGE = 0.8
const HELI_EVERY = [8, 11]
const HELI_WARN = 1.2
const SPIKE_LIFE = 9
const MINE_LIFE = 9
const ROADBLOCK_GAP = 5.5
/** From heat RB_SPIKE_LEVEL a roadblock leaves a wider gap with a spike strip across RB_SPIKE_COVER m of it (>= 4.5 m stays clear). */
const RB_SPIKE_LEVEL = 3
const ROADBLOCK_GAP_SPIKED = 7.6
const RB_SPIKE_COVER = 3
/** Roadblock cars pull out and chase once you're this far past them (m), or slow within RB_PULL_NEAR. */
const RB_PULL_PAST = 6
const RB_PULL_NEAR = 14
const TOASTS = { foam: 'FOAMED!', net: 'NETTED!', emp: 'EMP! NITRO OFFLINE' }

/**
 * Line of sight: a unit sees you within SIGHT m unless the road bends more than SIGHT_BEND
 * radians between you (alley corners, hairpins) or one of you is under a roof the other
 * isn't (tunnels, the car park); always within SIGHT_CLOSE. Unseen for EVADE_BASE +
 * EVADE_PER_LEVEL x (level - 1) s (4 s at heat 1 .. 9 s at heat 5) and you've evaded: heat
 * drops a level. Meanwhile they search (no catch-up pace, no ramming) towards where they
 * last saw you. The helicopter sees you anywhere but under cover (tunnels, alleys, car park).
 */
const SIGHT = 130
const SIGHT_CLOSE = 22
const SIGHT_BEND = 0.6
const EVADE_BASE = 4
const EVADE_PER_LEVEL = 1.25
const SEARCH_PACE = 0.72
/** Heli re-acquires you out of cover within this horizontal distance (m) while searching. */
const HELI_SPOT = 42
/**
 * Formations (heat >= FORM_LEVEL, 3+ pursuers, a road >= FORM_WIDTH m wide, you faster than
 * 12 m/s): one unit overtakes and brakes in front of you (rolling block, BLOCK_TIME s, then
 * BLOCK_COOL s before the next), two take your flanks BOX_LAT m out (BOX_TIME s).
 */
const FORM_LEVEL = 3
const FORM_WIDTH = 12
const BLOCK_TIME = 5
const BLOCK_COOL = 12
const BLOCK_AHEAD = 15
const BOX_TIME = 6
const BOX_COOL = 8
const BOX_LAT = 3.1
/**
 * PIT (heat >= PIT_LEVEL, you faster than PIT_SPEED m/s): a unit alongside your rear quarter
 * (0.5-4.5 m behind your middle, 1.2-3.2 m to the side) lines up for PIT_TELEGRAPH s (HUD
 * chip, radio, it edges in), then taps you if still there: a spin (physics/car.js
 * applyHazard 'pit') you can drive out of. PIT_COOL s between any two, PIT_UNIT_COOL per unit.
 */
const PIT_LEVEL = 2
const PIT_SPEED = 14
const PIT_TELEGRAPH = 0.75
const PIT_COOL = 9
const PIT_UNIT_COOL = 14
/**
 * Bounty points (100 = 1 coin when banked): per second in a seen pursuit x level, and per
 * event x level. Banked at each checkpoint plaza and the finish (as a trick score: the
 * server caps it at MAX_TRICK_SCORE per message and the trick coins per minute); lost when
 * BUSTED.
 */
const BOUNTY = { perSec: 6, close: 30, pitDodge: 60, wreck: 80, roadblock: 100, evade: 150, dodge: 15 }
/** Radar range (m) for the HUD blips. */
const RADAR_RANGE = 120

const POOL = 6
const RB_POOL = 3
const SHOTS = 14
const SPIKE_POOL = 4
const OBS_MAX = 32

const rand = (a, b) => a + Math.random() * (b - a)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

// Scratch (frame loop only).
const _f = new Vector3()
const _u = new Vector3()
const _r = new Vector3()
const _h = new Vector3()
const _v = new Vector3()
const _w = new Vector3()
const _p = new Vector3()
const _s = new Vector3(1, 1, 1)
const _q = new Quaternion()
const _q2 = new Quaternion()
const _m = new Matrix4()
const _m2 = new Matrix4()
const _basis = new Matrix4()
const UP = new Vector3(0, 1, 0)
const DOWN = new Vector3(0, -1, 0)
const X_AXIS = new Vector3(1, 0, 0)
const RIM = new Color('#d7dde3')
const RED = new Color('#ff2a3a')
const BLUE = new Color('#2a6bff')
const WHITE = new Color('#ffffff')
const SEARCH = new Color('#fff1c8')
const AMBER = new Color('#ffb020')
const SHOT_COLOR = Object.fromEntries(Object.entries(SHOT_COLORS).map(([k, v]) => [k, new Color(v)]))
const ZERO_SCALE = new Matrix4().makeScale(0, 0, 0)
const SPIKE_ENDS = [-0.5, 0.5]

/** Height of a jump's arc above the straight line across a gap, at sample i (as the bots). */
function airLift(path, i) {
  let from = i
  let to = i
  while (from > 0 && path[from - 1].air) from -= 1
  while (to < path.length - 1 && path[to + 1].air) to += 1
  const len = path[to].s - path[from].s || 1
  const u = (path[i].s - path[from].s) / len
  return 4 * 3.5 * u * (1 - u)
}

const CONE_VERTEX = /* glsl */ `
  varying float vAlong;
  varying float vEdge;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    vAlong = 1.0 - uv.y;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    vEdge = abs(dot(n, normalize(-mvPosition.xyz)));
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`
const CONE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uK;
  varying float vAlong;
  varying float vEdge;
  #include <common>
  #include <fog_pars_fragment>
  void main() {
    float a = (0.3 + 0.7 * pow(1.0 - vAlong, 1.3)) * pow(vEdge, 1.1) * smoothstep(1.0, 0.85, vAlong);
    vec3 col = uColor * a * 0.3 * uK;
    #ifdef USE_FOG
      col *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    gl_FragColor = vec4(col, 1.0);
  }
`

/** The spike strip's model: a dark base with a row of teeth, 1 m across x 3.6 m (scaled across per strip). */
function spikeGeometry() {
  const k = createKit()
  k.box(1, 0.08, 3.4, 0, 0.04, 0, '#2b2f36')
  k.box(1, 0.1, 0.18, 0, 0.06, -1.6, '#ffc41f', { stripe: [0, 0, 0] })
  k.box(1, 0.1, 0.18, 0, 0.06, 1.6, '#ffc41f')
  for (let row = 0; row < 3; row += 1) {
    for (let i = 0; i < 4; i += 1) k.cyl(0.07, 0.28, -0.375 + i * 0.25, 0.2, -1 + row, '#c9ced4', { segs: 4, radiusTop: 0 })
  }
  const g = mergeGeometries(k.parts, false)
  for (const p of k.parts) p.dispose()
  g.computeBoundingBox()
  finishPaint(g, { glass: '#000001' })
  return g
}

/**
 * Builds the police for `stage` into `scene` and returns `{ update(dt), dispose(), debug }`.
 * Called from an effect (Police.jsx); dispose removes every mesh, body and trigger.
 */
export function createPolice(stage, scene) {
  const path = stage.path
  const last = path.length - 1
  const plazas = stage.checkpoints.filter((c) => c.length > 0).map((c) => ({ index: c.index, s0: c.s - 4, s1: c.s + c.length + 4 }))
  const obstacleSections = new Set(stage.obstacles.map((o) => o.section))
  const material = getCarMaterial()
  const objects = []
  const add = (o) => {
    scene.add(o)
    objects.push(o)
    return o
  }

  // --- Meshes: one instanced mesh per ground kind, the helicopter, glows, shots, spikes.
  const meshes = {}
  for (const kind of POLICE_KINDS) {
    if (kind === 'heli') continue
    const m = new InstancedMesh(getPoliceModel(kind).geometry, material, POOL + RB_POOL)
    m.count = 0
    m.frustumCulled = false
    m.castShadow = true
    m.name = `police-${kind}`
    m.visible = false
    meshes[kind] = add(m)
  }
  const heliModel = getPoliceModel('heli')
  const heliMesh = add(new Mesh(heliModel.geometry, material))
  heliMesh.matrixAutoUpdate = false
  heliMesh.visible = false
  heliMesh.name = 'police-heli'
  const rotor = add(new Mesh(getRotorModel().geometry, material))
  rotor.matrixAutoUpdate = false
  rotor.visible = false
  // The searchlight's beam (MEDIUM+): an open cone, apex at the lamp, its base on the road;
  // brightest near the lamp and seen face-on, fading to nothing at its rim and the ground.
  const coneGeo = new ConeGeometry(1, 1, 18, 1, true)
  coneGeo.translate(0, -0.5, 0)
  const coneMat = new ShaderMaterial({
    vertexShader: CONE_VERTEX,
    fragmentShader: CONE_FRAGMENT,
    uniforms: { ...UniformsUtils.clone(UniformsLib.fog), uColor: { value: new Color('#fff1c8') }, uK: { value: 1 } },
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
  })
  const cone = add(new Mesh(coneGeo, coneMat))
  cone.matrixAutoUpdate = false
  cone.visible = false
  cone.frustumCulled = false
  cone.renderOrder = 2
  cone.name = 'police-searchlight'
  // Siren flares and strobe pools go in the shared night-lights batch (fx/carLights.js).

  const shotGeo = new IcosahedronGeometry(1, 1)
  const shotMat = new MeshBasicMaterial({ toneMapped: false })
  const shotMesh = add(new InstancedMesh(shotGeo, shotMat, SHOTS))
  shotMesh.instanceColor = new InstancedBufferAttribute(new Float32Array(SHOTS * 3), 3)
  shotMesh.count = 0
  shotMesh.frustumCulled = false
  shotMesh.name = 'police-shots'

  const spikeGeo = spikeGeometry()
  const spikeMesh = add(new InstancedMesh(spikeGeo, material, SPIKE_POOL))
  spikeMesh.count = 0
  spikeMesh.frustumCulled = false
  spikeMesh.name = 'police-spikes'

  // --- Units (pursuers, then roadblock cars), each with a collision body made once.
  const myBodies = new Set()
  const makeUnit = (index, roadblock) => {
    const u = {
      index,
      roadblock,
      active: false,
      kind: 'patrol',
      model: null,
      spec: null,
      s: 0,
      i: 0,
      lane: 0,
      laneRate: 0,
      laneVel: 0,
      speed: 0,
      slot: 0,
      cool: 0,
      weaponT: 0,
      charge: 0,
      swerve: Math.random() * 6,
      fly: false,
      flyT: 0,
      /** Hit by a Rocket Missile: flies off burning (gone after BURN_TIME + 0.5 s); `ramCool`: seconds before another ram can shove it; `mt`: its missile target. */
      burn: false,
      ramCool: 0,
      mt: null,
      flyVel: new Vector3(),
      flyAxis: new Vector3(1, 0, 0),
      flySpin: 0,
      dist: Infinity,
      spin: 0,
      pos: new Vector3(0, -500, 0),
      quat: new Quaternion(),
      fwd: new Vector3(0, 0, -1),
      right: new Vector3(1, 0, 0),
      yaw: 0,
      body: null,
      /** Formation role ('chase' | 'block' | 'boxL' | 'boxR') and seconds left in it. */
      role: 'chase',
      roleT: 0,
      /** PIT: seconds left lining up (> 0), and the unit's own cooldown. */
      pit: 0,
      pitCool: 0,
      pitSide: 1,
      /** Pulling out of a roadblock: 1 -> 0 as it turns from across the road to along it (turnDir: which way it faced). */
      turnIn: 0,
      turnDir: 1,
      /** Sees you now (line of sight); close-call bounty cooldown; an obstacle-dodge lane (and how long it holds). */
      sees: false,
      closeCool: 0,
      avoidLane: 0,
      avoidT: 0,
      /** Debug (tests): parked where it is - no pace, no lane changes (debug.place). */
      pin: false,
    }
    u.body = addCarBody(physicsWorld, 'bot', u)
    u.body.heat = true
    u.body.onBump = (imp, closing, role) => onBump(u, imp, closing, role)
    myBodies.add(u.body)
    return u
  }
  const units = Array.from({ length: POOL }, (_, i) => makeUnit(i, false))
  const blockers = Array.from({ length: RB_POOL }, (_, i) => makeUnit(POOL + i, true))
  const all = [...units, ...blockers]

  // Rocket Missile targets (game/fx/missileHub.js): every unit on the road - pursuers and
  // roadblock cars, not the helicopter - that isn't already flying, on a plaza or parked in a parade.
  const missileProvider = {
    each(visit) {
      if (st.frozen) return
      for (let k = 0; k < all.length; k += 1) {
        const u = all[k]
        if (u.active && !u.fly && plazaOf(u.s) < 0) visit(u.mt)
      }
    },
    hit: (t) => missileHit(t.ref),
  }
  for (const u of all) u.mt = { pos: u.pos, provider: missileProvider, ref: u }
  const unregisterMissiles = registerMissileTargets(missileProvider)

  const shots = Array.from({ length: SHOTS }, () => ({ active: false, kind: 'foam', state: 'fly', pos: new Vector3(), vel: new Vector3(), from: new Vector3(), to: new Vector3(), t: 0, life: 0, scale: 0.4, owner: null, gravity: 0, spike: null, minD: Infinity }))
  const spikes = Array.from({ length: SPIKE_POOL }, () => ({ active: false, life: 0, matrix: new Matrix4(), hit: false, trigger: null, block: false }))

  // `spot`: where the searchlight is pointing (it trails your car a little); `seen` / `last`:
  // whether it has you, and where it last did.
  const heli = { active: false, pos: new Vector3(0, -500, 0), quat: new Quaternion(), yaw: 0, cool: 6, warn: 0, rotor: 0, target: new Vector3(), spot: new Vector3(), seen: false, last: new Vector3(), sweep: 0, lamp: new Vector3() }

  // --- Line of sight data: each path sample's heading (unwrapped) and cover (0 open,
  // 1..49 a tunnel, 50+ the car park - both roofed -, 100+ an alley: walled, open above).
  const yawAt = new Float32Array(path.length)
  const cover = new Uint8Array(path.length)
  {
    let prev = 0
    for (let i = 0; i <= last; i += 1) {
      let y = Math.atan2(path[i].fx, path[i].fz)
      if (i > 0) {
        while (y - prev > Math.PI) y -= Math.PI * 2
        while (y - prev < -Math.PI) y += Math.PI * 2
      }
      yawAt[i] = y
      prev = y
    }
    const decor = stage.decor || {}
    const mark = (list, base) => (list || []).forEach((r, k) => {
      for (let i = Math.max(0, r.from); i <= Math.min(last, r.to); i += 1) cover[i] = base + k
    })
    mark(decor.tunnels, 1)
    mark(decor.garage, 50)
    mark(decor.alleys, 100)
  }
  const roofed = (c) => c > 0 && c < 100

  // --- Moving obstacles (and traffic) projected onto the path each frame, for the
  // avoidance: `{ s, lat, halfS, halfLat, vlat, traffic }` (preallocated).
  const obs = Array.from({ length: OBS_MAX }, () => ({ s: 0, lat: 0, halfS: 0, halfLat: 0, vlat: 0, traffic: null }))
  const obsHint = new Map()
  let nObs = 0

  const roadblocks = (stage.heat?.roadblocks || []).map((rb) => ({ ...rb, s: path[rb.pi].s, used: false }))
  let activeBlock = null

  // --- Per-run state.
  const st = {
    lastPos: new Vector3(),
    hasLast: false,
    checkpoint: 0,
    spawnT: 3,
    intro: [],
    lastLevel: 1,
    frame: 0,
    obstacleBodies: 0,
    pS: 0,
    pLat: 0,
    pI: 0,
    pSpeed: 0,
    running: false,
    finished: false,
    held: false,
    /** The police have been within ESCAPE_DIST since the last heat drop (so getting away counts). */
    engaged: false,
    /** Debug parade: pursuers stand still where they are (screenshots). */
    frozen: false,
    /** Debug: no automatic spawns (a controlled test). */
    noSpawn: false,
    /** Formation / PIT cooldowns (s), the last time anyone saw you (path s), radio flags. */
    blockCool: 4,
    boxCool: 2,
    formT: 0,
    pitCool: 4,
    lastSeenS: 0,
    wasSeen: false,
    announced: false,
    heliAnnounced: false,
    blockPassed: false,
    /** Traffic bodies switched on this frame (the live body budget). */
    trafficBodies: 0,
  }

  // --- Helpers --------------------------------------------------------------------

  /** Which plaza (index into plazas) path distance s is on, or -1. */
  const plazaOf = (s) => {
    for (let k = 0; k < plazas.length; k += 1) if (s >= plazas[k].s0 && s <= plazas[k].s1) return k
    return -1
  }
  const indexAt = (s, hint = 0) => {
    let i = clamp(hint, 0, last)
    while (i < last && path[i + 1].s <= s) i += 1
    while (i > 0 && path[i].s > s) i -= 1
    return i
  }

  function toast(text, kind = 'error', sub) {
    defer(() => getGame().showToast(text, kind, sub))
  }

  const traffic = createTraffic(stage, scene, { plazaOf, indexAt })
  const placeName = () => stage.sections[Math.min(stage.sections.length - 1, runtime.race.section + 1)]?.name || 'the harbour'
  const unitNo = (u) => u.index + 1

  /** Bounty: `pts` x heat level, with a HUD pop naming why (unbanked until the next plaza). */
  function award(pts, why) {
    const n = pts * heat.level
    if (n <= 0) return
    heat.bounty += n
    if (why) {
      heat.bountyPop = `+${Math.round(n)} ${why}`
      heat.bountyPopT = 1.8
    }
  }

  /** Banks the unbanked bounty (a checkpoint plaza, the finish): coins through the trick path (server-capped). */
  function bank(finish = false) {
    const pts = Math.floor(heat.bounty)
    if (pts <= 0) return
    heat.banked += pts
    heat.bounty = 0
    actions.trick('bounty', Math.min(pts, MAX_TRICK_SCORE))
    toast(finish ? 'BOUNTY CASHED' : 'BOUNTY BANKED', 'trick', `+${pts.toLocaleString()}`)
  }

  /**
   * Projects the moving obstacles near you (enabled kinematic bodies that stand on the road:
   * crossing trucks, pop-up bollards, sliding crates, drones - not decks or other cars) and
   * the traffic onto the path: `obs[0..nObs)`.
   */
  function projectObstacles() {
    nObs = 0
    const car = runtime.car.position
    const dyn = physicsWorld.dynamics
    for (let k = 0; k < dyn.length && nObs < OBS_MAX; k += 1) {
      const b = dyn[k]
      if (!b.enabled || b.car || myBodies.has(b)) continue
      if (Math.abs(b.c.x - car.x) > 150 || Math.abs(b.c.z - car.z) > 150) continue
      // Nearest path sample: hill-climb from last frame's (or from you).
      let i = obsHint.get(b) ?? st.pI
      const d2 = (j) => (path[j].x - b.c.x) ** 2 + (path[j].y - b.c.y) ** 2 + (path[j].z - b.c.z) ** 2
      let d = d2(i)
      for (let guard = 0; guard < 400; guard += 1) {
        if (i < last && d2(i + 1) < d) {
          i += 1
          d = d2(i)
        } else if (i > 0 && d2(i - 1) < d) {
          i -= 1
          d = d2(i)
        } else break
      }
      obsHint.set(b, i)
      const p = path[i]
      _f.set(p.fx, p.fy, p.fz)
      _u.set(p.ux, p.uy, p.uz)
      _r.crossVectors(_f, _u).normalize()
      _v.set(b.c.x - p.x, b.c.y - p.y, b.c.z - p.z)
      let hS
      let hL
      let hU
      if (b.type === 'sphere') {
        hS = hL = hU = b.r
      } else {
        const h = b.h
        hS = Math.abs(b.ax.dot(_f)) * h[0] + Math.abs(b.ay.dot(_f)) * h[1] + Math.abs(b.az.dot(_f)) * h[2]
        hL = Math.abs(b.ax.dot(_r)) * h[0] + Math.abs(b.ay.dot(_r)) * h[1] + Math.abs(b.az.dot(_r)) * h[2]
        hU = Math.abs(b.ax.dot(_u)) * h[0] + Math.abs(b.ay.dot(_u)) * h[1] + Math.abs(b.az.dot(_u)) * h[2]
      }
      const up = _v.dot(_u)
      // A deck (its top at the road) or something overhead is no obstacle.
      if (up + hU < 0.45 || up - hU > 2.6) continue
      const o = obs[nObs++]
      o.s = p.s + _v.dot(_f)
      o.lat = _v.dot(_r)
      o.halfS = hS
      o.halfLat = hL
      o.vlat = b.vel.dot(_r)
      o.traffic = null
    }
    for (const c of traffic.cars) {
      if (!c.active || c.fly || nObs >= OBS_MAX) continue
      const o = obs[nObs++]
      o.s = c.s
      o.lat = c.lane
      o.halfS = c.halfS
      o.halfLat = c.halfW
      o.vlat = c.laneVel
      o.traffic = c
    }
  }

  /** Does unit u see you (line of sight, see SIGHT)? */
  function sees(u) {
    if (u.fly) return false
    const d = u.dist
    if (d < SIGHT_CLOSE) return true
    if (d > SIGHT) return false
    const a = u.i
    const b = st.pI
    if (cover[a] !== cover[b] && (roofed(cover[a]) || roofed(cover[b]))) return false
    const y0 = yawAt[a]
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    for (let k = 1; k <= 4; k += 1) {
      const j = lo + Math.round(((hi - lo) * k) / 4)
      if (Math.abs(yawAt[j] - y0) > SIGHT_BEND) return false
    }
    return true
  }

  function deactivate(u) {
    u.active = false
    u.fly = false
    u.burn = false
    u.pin = false
    u.ramCool = 0
    u.charge = 0
    u.pit = 0
    u.role = 'chase'
    u.turnIn = 0
    u.body.enabled = false
    u.pos.y = -500
  }

  function clearAll() {
    st.engaged = false
    heat.escape = 0
    heat.evade = 0
    heat.pit = 0
    for (const u of all) deactivate(u)
    for (const s of shots) s.active = false
    for (const sp of spikes) removeSpike(sp)
    heli.active = false
    activeBlock = null
    heat.pursuers = 0
    heat.nearest = Infinity
    heat.close = 0
    heat.boxed = false
  }

  function setKind(u, kind) {
    u.kind = kind
    u.model = getPoliceModel(kind)
    u.spec = KIND[kind] || KIND.patrol
    const b = u.body
    b.h[0] = u.model.half[0]
    b.h[1] = u.model.half[1]
    b.h[2] = u.model.half[2]
    b.offset.set(u.model.offset[0], u.model.offset[1], u.model.offset[2])
    b.carId = kind
  }

  /** Puts unit u on the path at its s / lane and works out its pose and frame. */
  function place(u, dt) {
    u.i = indexAt(u.s, u.i)
    const a = path[u.i]
    const n = path[Math.min(last, u.i + 1)]
    const span = n.s - a.s || 1
    const k = clamp((u.s - a.s) / span, 0, 1)
    _f.set(a.fx + (n.fx - a.fx) * k, a.fy + (n.fy - a.fy) * k, a.fz + (n.fz - a.fz) * k).normalize()
    _u.set(a.ux + (n.ux - a.ux) * k, a.uy + (n.uy - a.uy) * k, a.uz + (n.uz - a.uz) * k).normalize()
    _r.crossVectors(_f, _u).normalize()
    u.pos.set(a.x + (n.x - a.x) * k, a.y + (n.y - a.y) * k, a.z + (n.z - a.z) * k)
    if (a.air) u.pos.y += airLift(path, u.i)
    u.pos.addScaledVector(_r, u.lane).addScaledVector(_u, u.model.wheels.radius || 0.5)
    // Heading: the path's, turned the way it's moving across the road.
    _h.copy(_f).multiplyScalar(Math.max(5, u.speed)).addScaledVector(_r, u.laneRate + u.laneVel)
    if (u.roadblock) _h.copy(_r).multiplyScalar(u.slot % 2 ? 1 : -1).addScaledVector(_f, 0.25)
    else if (u.turnIn > 0) {
      // Pulling out of a roadblock: turns from across the road to along it.
      _h.normalize().multiplyScalar(1 - u.turnIn)
      _h.addScaledVector(_r, u.turnDir * u.turnIn).addScaledVector(_f, 0.25 * u.turnIn)
      u.turnIn = Math.max(0, u.turnIn - dt * 1.2)
    }
    _h.normalize()
    u.fwd.copy(_h)
    u.right.crossVectors(_h, _u).normalize()
    _basis.makeBasis(u.right, _u, _w.copy(_h).negate())
    u.quat.setFromRotationMatrix(_basis)
    u.spin += (u.speed / Math.max(0.3, u.model.wheels.radius || 0.4)) * dt
  }

  function spawn(kind, ahead = false) {
    const u = units.find((x) => !x.active)
    if (!u) return null
    setKind(u, kind)
    let s = ahead ? st.pS + rand(100, 130) : st.pS - rand(60, 85)
    if (heat.grace > 0) s = Math.min(s, st.pS - GRACE_DIST - 15)
    s = clamp(s, 2, path[last].s - 2)
    // Never on a plaza or a jump: shuffle back off it.
    for (let tries = 0; tries < 30; tries += 1) {
      const pk = plazaOf(s)
      const i = indexAt(s)
      if (pk < 0 && !path[i].air) break
      s -= pk >= 0 ? s - plazas[pk].s0 + 6 : 6
    }
    if (s < 2) return null
    u.active = true
    u.fly = false
    u.s = s
    u.i = indexAt(s)
    u.slot = units.filter((x) => x.active).length - 1
    u.lane = (u.slot % 3 === 1 ? -1 : u.slot % 3 === 2 ? 1 : 0) * Math.min(3, path[u.i].w / 2 - 1.5)
    u.laneRate = 0
    u.laneVel = 0
    u.speed = ahead ? 0 : Math.min(u.spec.cap, st.pSpeed)
    u.cool = 0
    u.charge = 0
    u.weaponT = u.spec.every ? rand(2.5, u.spec.every[1]) : 0
    u.dist = Infinity
    u.role = 'chase'
    u.roleT = 0
    u.pit = 0
    u.pitCool = rand(3, 6)
    u.turnIn = 0
    u.avoidT = 0
    u.closeCool = 0
    place(u, 0)
    heat.spawned[kind] = (heat.spawned[kind] || 0) + 1
    if (heat.firstLevel[kind] === undefined) heat.firstLevel[kind] = heat.level
    return u
  }

  function pickKind(level) {
    while (st.intro.length) {
      const k = st.intro.shift()
      if (TABLE[level].w[k] && !(k === 'tank' && units.some((x) => x.active && x.kind === 'tank'))) return k
    }
    const w = TABLE[level].w
    const tankOut = units.some((x) => x.active && x.kind === 'tank')
    let total = 0
    for (const k in w) if (!(k === 'tank' && tankOut)) total += w[k]
    let r = Math.random() * total
    for (const k in w) {
      if (k === 'tank' && tankOut) continue
      r -= w[k]
      if (r <= 0) return k
    }
    return 'patrol'
  }

  /** How many pursuers may be out now (table, preset, and the moving-body budget). */
  function allowed() {
    const level = heat.level
    const q = QUALITY_MAX[useQuality.getState().level] ?? 3
    const blockCars = blockers.filter((b) => b.active).length
    return Math.max(0, Math.min(TABLE[level].max, q, BODY_BUDGET - st.obstacleBodies - blockCars))
  }

  // --- Bumps ----------------------------------------------------------------------

  /** physics/car.js carContact: role 1, you rammed unit u (throw it); role 2, it rammed you. */
  function onBump(u, imp, closing, role) {
    if (!u.active || u.fly) return
    if (role === 2) {
      u.cool = 1.4
      u.speed = Math.max(0, u.speed - closing * 0.35)
      heat.hits.ram += 1
      return
    }
    // Your ram: its power is the closing speed x your car's weight factor (a heavy car hits
    // harder). A hard ram THROWS the unit off the road (a takedown); a lighter one SHOVES it
    // sideways - over the edge if it's near enough - and the same unit can't be shoved again
    // for RAM_COOL s. A heavy unit (the jeep, the tank) has a higher throw threshold and
    // shrugs off shoves (its `knock`), so only a very hard hit - or a missile - moves a tank.
    const rw = clamp((carById(runtime.car.carId)?.stats.weight ?? 100) / 100, 0.8, 1.45)
    const power = closing * rw
    if (power < u.spec.throw && u.ramCool > 0) return
    heat.value = Math.min(HEAT_MAX, heat.value + HEAT_PER_RAM)
    const p = path[u.i]
    _f.set(p.fx, p.fy, p.fz)
    _u.set(p.ux, p.uy, p.uz)
    _r.crossVectors(_f, _u).normalize()
    // Which way across the road it goes: away from you, else the side it's on.
    const across = imp.x * _r.x + imp.y * _r.y + imp.z * _r.z
    const side = Math.abs(across) > 0.3 ? Math.sign(across) : u.lane >= 0 ? 1 : -1
    if (power >= u.spec.throw) {
      throwUnit(u, side, Math.max(THROW_SIDE, Math.abs(across) * 1.2), THROW_LIFT + Math.min(6, Math.max(0, power - u.spec.throw) * 0.5), false)
      burst({ x: u.pos.x, y: u.pos.y + 1, z: u.pos.z, count: 12, palette: 'spark', speed: 7 })
      takedown(u)
      return
    }
    const k = u.model.knock * SHOVE_GAIN * rw
    const along = imp.x * _f.x + imp.y * _f.y + imp.z * _f.z
    u.laneVel += across * k
    u.speed = Math.max(0, u.speed + along * u.model.knock)
    u.cool = 1
    u.ramCool = RAM_COOL
  }

  /**
   * Sends unit u flying off the road to the `side` (+1 right of the path, -1 left) at `lat`
   * m/s with `lift` m/s up, tumbling; it is recycled once it lands or falls out of sight
   * (stepUnit / stepRoadblocks). `burn`: on fire (a missile), gone after BURN_TIME + 0.5 s.
   */
  function throwUnit(u, side, lat, lift, burn) {
    const p = path[u.i]
    _f.set(p.fx, p.fy, p.fz)
    _u.set(p.ux, p.uy, p.uz)
    _r.crossVectors(_f, _u).normalize()
    u.fly = true
    u.flyT = 0
    u.burn = burn
    u.flyVel.copy(u.fwd).multiplyScalar(u.speed * (burn ? 0.7 : 1)).addScaledVector(_r, side * lat)
    u.flyVel.y += lift
    u.flyAxis.copy(u.fwd)
    u.flySpin = side * (burn ? 6 : 3 + lat * 0.2)
    u.laneVel = 0
    u.charge = 0
    u.pit = 0
    u.body.enabled = false
  }

  /** A Rocket Missile hit unit u (game/fx/missiles.js): it burns, is thrown off the road and is recycled. False if it can't be hit. */
  function missileHit(u) {
    if (!u.active || u.fly) return false
    throwUnit(u, u.lane >= 0 ? 1 : -1, MISSILE_SIDE, MISSILE_LIFT, true)
    heat.value = Math.min(HEAT_MAX, heat.value + HEAT_PER_RAM)
    ignite(u.pos, BURN_TIME + 0.1)
    takedown(u)
    return true
  }

  // --- Gadgets --------------------------------------------------------------------

  function freeShot() {
    for (const s of shots) if (!s.active) return s
    return null
  }

  /** Unit u starts charging its gadget (the telegraph). */
  function startCharge(u) {
    u.charge = CHARGE
    heat.warn = CHARGE + 0.2
    heat.warnKind = u.spec.weapon
    heatSfx.charge()
  }

  function muzzle(u, out) {
    const m = u.model.muzzle
    return out.set(m[0], m[1], m[2]).applyQuaternion(u.quat).add(u.pos)
  }

  /** Fires unit u's gadget at where the player will be. */
  function fire(u) {
    const shot = freeShot()
    if (!shot) return
    const kind = u.spec.weapon
    const car = runtime.car
    muzzle(u, shot.pos)
    const dist = shot.pos.distanceTo(car.position)
    const T = clamp(dist / SHOT_SPEED, 0.4, 2.4)
    _p.copy(car.position).addScaledVector(car.velocity, T)
    _p.y += 0.6
    shot.vel.subVectors(_p, shot.pos).multiplyScalar(1 / T)
    shot.gravity = kind === 'foam' ? SHOT_G : 0
    if (shot.gravity) shot.vel.y += 0.5 * SHOT_G * T
    shot.active = true
    shot.state = 'fly'
    shot.kind = kind
    shot.t = 0
    shot.life = T + 0.7
    shot.scale = kind === 'foam' ? (u.spec.big ? 0.75 : 0.5) : kind === 'net' ? 0.9 : 0.42
    shot.owner = u
    shot.minD = Infinity
    if (kind === 'foam') heatSfx.foamShot()
    else if (kind === 'net') heatSfx.netShot()
    else heatSfx.emp()
  }

  /** A gadget hit your car. */
  function hitPlayer(kind, at) {
    const car = runtime.car
    heat.hits[kind] = (heat.hits[kind] || 0) + 1
    if (car.shield > 0) {
      toast('BLOCKED', 'info')
      return
    }
    runtime.input.hazard = kind
    if (kind === 'emp') heatSfx.emp()
    else heatSfx.splat()
    burst({ x: at.x, y: at.y, z: at.z, count: 18, palette: kind === 'emp' ? 'spark' : 'splash', speed: 6 })
    runtime.camera.shake = Math.max(runtime.camera.shake || 0, 0.3)
    toast(TOASTS[kind] || 'HIT!', 'error')
  }

  function removeSpike(sp) {
    if (sp.trigger) {
      const i = physicsWorld.triggers.indexOf(sp.trigger)
      if (i >= 0) physicsWorld.triggers.splice(i, 1)
    }
    sp.trigger = null
    sp.active = false
  }

  /** The helicopter drops a spike strip (half the road, on your side) or an EMP mine (in your lane) ahead of you. */
  function heliDrop() {
    const shot = freeShot()
    if (!shot) return
    const s = Math.min(path[last].s - 5, st.pS + 48)
    if (plazaOf(s) >= 0) return
    const i = indexAt(s)
    const p = path[i]
    if (p.air) return
    _f.set(p.fx, p.fy, p.fz)
    _u.set(p.ux, p.uy, p.uz)
    _r.crossVectors(_f, _u).normalize()
    const mine = Math.random() < 0.45
    const drive = p.w - 1.2
    let lane
    let span = 0
    if (mine) lane = clamp(st.pLat, -drive / 2 + 1, drive / 2 - 1)
    else {
      span = Math.min(drive * 0.5, drive - 4.5)
      const side = st.pLat >= 0 ? 1 : -1
      lane = side * (drive / 2 - span / 2)
    }
    shot.to.set(p.x, p.y, p.z).addScaledVector(_r, lane).addScaledVector(_u, 0.1)
    shot.from.copy(heli.pos)
    shot.pos.copy(heli.pos)
    shot.active = true
    shot.state = 'drop'
    shot.kind = mine ? 'mine' : 'drop'
    shot.t = 0
    shot.life = 1.0
    shot.scale = mine ? 0.5 : 0.4
    shot.gravity = 0
    shot.spike = mine ? null : { span, i, lane }
    heatSfx.drop()
  }

  /** A dropped strip lands: a real `spikes` trigger (physics/car.js) for SPIKE_LIFE s, drawn. */
  function landSpike(spec) {
    placeSpike(spec.i, spec.lane, spec.span, SPIKE_LIFE, false)
  }

  /**
   * A spike strip across `span` m centred `lane` m right of path sample i: a real `spikes`
   * trigger (physics/car.js) for `life` s, drawn. `block`: a roadblock's (removed with it).
   * Returns false if the pool is used up.
   */
  function placeSpike(i, lane, span, life, block) {
    const sp = spikes.find((x) => !x.active)
    if (!sp) return false
    const p = path[i]
    _f.set(p.fx, p.fy, p.fz)
    _u.set(p.ux, p.uy, p.uz)
    _r.crossVectors(_f, _u).normalize()
    _p.set(p.x, p.y, p.z).addScaledVector(_r, lane)
    sp.active = true
    sp.life = life
    sp.hit = false
    sp.block = block
    sp.trigger = {
      id: 'heat-spikes',
      type: 'spikes',
      power: 1,
      dir: 1,
      c: [_p.x + _u.x * 0.8, _p.y + _u.y * 0.8, _p.z + _u.z * 0.8],
      h: [span / 2, 1, 1.8],
      ax: [_r.x, _r.y, _r.z],
      ay: [_u.x, _u.y, _u.z],
      az: [-_f.x, -_f.y, -_f.z],
      lane,
      span,
    }
    physicsWorld.triggers.push(sp.trigger)
    _basis.makeBasis(_r, _u, _w.copy(_f).negate())
    _q.setFromRotationMatrix(_basis)
    _s.set(span, 1, 1)
    sp.matrix.compose(_p, _q, _s)
    _s.set(1, 1, 1)
    return true
  }

  // --- The frame ------------------------------------------------------------------

  function update(rawDt) {
    const dt = Math.min(rawDt, 0.05)
    const t = performance.now() / 1000
    const car = runtime.car
    const race = runtime.race
    const game = getGame()
    st.frame += 1
    heat.on = true
    heat.radioT = Math.max(0, heat.radioT - dt)
    heat.bountyPopT = Math.max(0, heat.bountyPopT - dt)

    // Not on the road (pier, loading, finished): no police; a new run starts cool.
    const lobby = inLobby(car.position.x, car.position.y, car.position.z)
    const running = race.running && game.stageReady && game.stage === stage && !lobby
    if (!running) {
      // The finish: what's left of the bounty is cashed in (the finish card shows the run's total).
      if (st.running && race.checkpoint > st.checkpoint) {
        st.checkpoint = race.checkpoint
        bank(true)
      }
      if (st.running || heat.pursuers || heliActiveOrBlocks()) clearAll()
      traffic.clear()
      heat.traffic = 0
      if (!race.running && race.checkpoint === 0) {
        resetHeat()
        st.checkpoint = 0
        st.intro = []
        for (const rb of roadblocks) rb.used = false
      }
      if (heat.bustedT > 0) endBusted()
      st.running = false
      st.hasLast = false
      heat.blipCount = 0
      heatSiren.set(Infinity, false, 0)
      draw(t)
      return
    }
    if (!st.running) {
      st.running = true
      st.spawnT = 3
      st.intro = [...INTRO[1]]
      st.announced = false
      st.heliAnnounced = false
      st.wasSeen = false
      resetRadio()
    }

    // Where you are along the path, how far across it, how fast.
    const pi = clamp(race.pathIndex, 0, last)
    const ps = path[pi]
    _f.set(ps.fx, ps.fy, ps.fz)
    _u.set(ps.ux, ps.uy, ps.uz)
    _r.crossVectors(_f, _u).normalize()
    _v.subVectors(car.position, _w.set(ps.x, ps.y, ps.z))
    st.pS = ps.s + _v.dot(_f)
    st.pLat = _v.dot(_r)
    st.pI = pi
    st.pSpeed = Math.max(0, car.velocity.dot(_f))
    const safe = car.safe
    const onPlaza = plazaAt(stage, car.position.x, car.position.y, car.position.z) !== null

    // A respawn / teleport (a jump of 40+ m): start over behind you, with a grace.
    if (st.hasLast && st.lastPos.distanceToSquared(car.position) > 40 * 40) {
      clearAll()
      traffic.clear()
      heat.grace = GRACE
      st.spawnT = GRACE
    }
    st.lastPos.copy(car.position)
    st.hasLast = true

    // Count the stage's moving bodies now and then (the budget the police fit into).
    if (st.frame % 15 === 1) {
      let n = 0
      for (const b of physicsWorld.dynamics) if (b.enabled && !myBodies.has(b) && !traffic.bodies.has(b)) n += 1
      st.obstacleBodies = n
    }

    // --- Heat; a checkpoint plaza banks the bounty.
    heat.grace = Math.max(0, heat.grace - dt)
    heat.warn = Math.max(0, heat.warn - dt)
    if (race.checkpoint > st.checkpoint) {
      heat.value = Math.min(HEAT_MAX, heat.value + HEAT_PER_CHECKPOINT * (race.checkpoint - st.checkpoint))
      st.checkpoint = race.checkpoint
      bank()
    }
    if (heat.nearest < HEAT_NEAR) heat.value = Math.min(HEAT_MAX, heat.value + HEAT_PER_SECOND_NEAR * dt)
    setLevel()

    // --- BUSTED! moment, then the respawn.
    if (heat.bustedT > 0) {
      heat.bustedT -= dt
      if (heat.bustedT <= 0) {
        endBusted()
        runtime.input.respawn = true
        heat.value = Math.max(0, heat.value - 1)
        setLevel(true)
        clearAll()
        traffic.clear()
        heat.grace = GRACE
        st.spawnT = GRACE
        st.hasLast = false
      }
    }

    projectObstacles()

    // --- Spawning.
    st.spawnT -= dt
    let out = 0
    for (const u of units) if (u.active) out += 1
    // (Not while you're slipping them: getting away is what drops the heat.)
    const escaping = st.engaged && !heat.seen
    if (st.spawnT <= 0 && !onPlaza && heat.bustedT <= 0 && !escaping && !st.noSpawn) {
      st.spawnT = SPAWN_GAP[heat.level >= 5 ? 1 : 0]
      if (out < allowed()) spawn(pickKind(heat.level), heat.level >= 2 && heat.grace <= 0 && Math.random() < 0.25)
    }

    formations(dt)

    // --- Pursuers.
    let nearest = Infinity
    let nearestU = null
    let near6 = 0
    let near8 = 0
    let pursuers = 0
    let seen = false
    heat.pit = 0
    for (const u of units) {
      if (!u.active) continue
      stepUnit(u, dt, t, onPlaza, safe)
      if (!u.active) continue
      pursuers += 1
      if (u.fly) {
        u.sees = false
        continue
      }
      u.dist = u.pos.distanceTo(car.position)
      u.sees = sees(u)
      if (u.sees) seen = true
      if (u.dist < nearest) {
        nearest = u.dist
        nearestU = u
      }
      if (u.dist < BUST_NEAR) near6 += 1
      if (u.dist < BUST_BOX) near8 += 1
      // A close call at speed (no bust building): bounty.
      u.closeCool = Math.max(0, u.closeCool - dt)
      if (u.dist < 3.4 && car.speedKmh > 55 && heat.busted < 0.3 && u.closeCool <= 0 && !safe) {
        u.closeCool = 4
        award(BOUNTY.close, 'CLOSE CALL')
      }
    }
    // --- Roadblocks.
    stepRoadblocks(dt, safe)
    for (const b of blockers) {
      if (!b.active || b.fly) continue
      b.dist = b.pos.distanceTo(car.position)
      if (b.dist < BUST_NEAR) near6 += 1
      if (b.dist < BUST_BOX) near8 += 1
      if (b.dist < SIGHT_CLOSE * 2) seen = true
    }

    // --- Civilian traffic, inside what's left of the moving-body budget; units that run into it crash.
    let policeBodies = 0
    for (const u of all) if (u.body.enabled) policeBodies += 1
    st.trafficBodies = traffic.update(dt, { pS: st.pS, pLat: st.pLat, pSpeed: st.pSpeed, running: true, safe, obs, nObs, bodyRoom: Math.max(0, BODY_BUDGET - st.obstacleBodies - policeBodies) })
    let tc = 0
    for (const c of traffic.cars) if (c.active) tc += 1
    heat.traffic = tc
    if (tc) trafficCrashes()

    heat.pursuers = pursuers
    heat.nearest = nearest
    heat.close = near6
    heat.boxed = near8 >= 2

    // --- Line of sight and the evade countdown.
    seen = seen || (heli.active && heli.seen)
    heat.seen = seen
    heat.evadeNeed = EVADE_BASE + EVADE_PER_LEVEL * (heat.level - 1)
    if (seen) {
      st.lastSeenS = st.pS
      if (!st.wasSeen && st.engaged && heat.evade > 1) radio('spotted', { u: nearestU ? unitNo(nearestU) : 1, place: placeName() })
      heat.evade = 0
      if (nearest < ESCAPE_DIST) st.engaged = true
      if (!st.announced && nearestU) {
        st.announced = true
        radio('pursuit', { u: unitNo(nearestU), place: placeName() }, true)
      }
    }
    if (st.engaged && !seen && heat.bustedT <= 0 && !onPlaza) {
      if (st.wasSeen) radio('lost', {}, true)
      heat.evade += dt
      if (heat.evade >= heat.evadeNeed) {
        heat.evade = 0
        st.engaged = false
        const was = heat.level
        heat.value = Math.max(0, Math.floor(heat.value) - 1 + 0.4)
        for (const u of units) if (u.active && (u.fly || !u.sees || u.dist > ESCAPE_DIST)) deactivate(u)
        st.spawnT = 8
        setLevel(true)
        heatSfx.heatDown()
        heat.stats.evades += 1
        award(BOUNTY.evade, 'EVADED')
        radio('evaded', {}, true)
        toast(was > 1 ? `EVADED · HEAT ${heat.level}` : 'LOST THEM!', 'trick')
      }
    } else if (!st.engaged) heat.evade = 0
    st.wasSeen = seen
    heat.escape = heat.evade

    // --- Bounty for every second of a live pursuit.
    if (seen && pursuers > 0 && heat.bustedT <= 0 && !safe) award(BOUNTY.perSec * dt)

    // --- BUSTED meter.
    if (heat.bustedT <= 0) {
      const slow = car.speedKmh < BUST_SLOW
      const filling = !safe && heat.grace <= 0 && near6 > 0 && (slow || near8 >= 2)
      const fill = slow ? (near8 >= 2 ? BUST_FILL_FAST : BUST_FILL) : BUST_FILL_BOXED
      if (filling) heat.busted = Math.min(1, heat.busted + dt / fill)
      else heat.busted = Math.max(0, heat.busted - dt / BUST_DRAIN)
      if (heat.busted >= 1) startBusted()
    }

    stepShots(dt)
    stepSpikes(dt)
    stepHeli(dt, t, safe)
    blips()
    enforceBudget()
    // The siren: the nearest unit (or the helicopter); pitched by how fast it's closing on you.
    let closing = 0
    if (nearestU) closing = st.pS - nearestU.s >= 0 ? nearestU.speed - st.pSpeed : st.pSpeed - nearestU.speed
    heatSiren.set(Math.min(nearest, heli.active ? heli.pos.distanceTo(car.position) + 40 : Infinity), nearest < 18, closing)
    draw(t)
  }

  /** Pursuers running into civilian traffic: a hard hit wrecks the unit and shoves the car; a soft one stops it behind. */
  function trafficCrashes() {
    for (const u of units) {
      if (!u.active || u.fly) continue
      const hs = u.model.half[2]
      const hw = u.model.half[0]
      for (const c of traffic.cars) {
        if (!c.active || c.fly) continue
        const ds = c.s - u.s
        const dl = c.lane - u.lane
        if (Math.abs(ds) > hs + c.halfS || Math.abs(dl) > hw + c.halfW) continue
        const closing = Math.abs(u.speed - c.speed) + Math.abs(u.laneRate - c.laneVel)
        if (closing > 6) {
          const side = dl >= 0 ? 1 : -1
          traffic.struck(c, closing, -side)
          u.fly = true
          u.flyT = 0
          u.flyVel.copy(u.fwd).multiplyScalar(u.speed * 0.4).addScaledVector(u.right, -side * 4)
          u.flyVel.y += 4
          u.flyAxis.copy(u.fwd)
          u.flySpin = -side * 5
          u.body.enabled = false
          heat.stats.crashes += 1
          burst({ x: u.pos.x, y: u.pos.y + 1, z: u.pos.z, count: 12, palette: 'spark', speed: 7 })
          radio('crash', { u: unitNo(u) })
          award(BOUNTY.wreck * 0.5, 'POLICE CRASH')
          break
        }
        // Bumper to bumper: it waits behind.
        u.speed = Math.min(u.speed, c.speed)
        u.s = ds > 0 ? Math.min(u.s, c.s - hs - c.halfS) : u.s
      }
    }
  }

  /** HUD radar: every unit, roadblock car, the helicopter and the traffic, in your car's frame. */
  function blips() {
    heat.blipCount = 0
    for (const u of units) if (u.active && !u.fly) blip(u.pos, u.sees ? 0 : 4)
    for (const u of blockers) if (u.active && !u.fly) blip(u.pos, 1)
    if (heli.active) blip(heli.pos, 2)
    for (const c of traffic.cars) if (c.active && !c.fly) blip(c.pos, 3)
  }
  /** One radar blip at world point p (your heading up), clamped to the rim. */
  function blip(p, kind) {
    const n = heat.blipCount
    if (n >= 24) return
    const car = runtime.car
    const fx = -Math.sin(car.yaw)
    const fz = -Math.cos(car.yaw)
    const dx = p.x - car.position.x
    const dz = p.z - car.position.z
    let ax = (dx * -fz + dz * fx) / RADAR_RANGE
    let ay = (dx * fx + dz * fz) / RADAR_RANGE
    const l = Math.hypot(ax, ay)
    if (l > 1) {
      ax /= l
      ay /= l
    }
    heat.blips[n * 3] = ax
    heat.blips[n * 3 + 1] = ay
    heat.blips[n * 3 + 2] = kind
    heat.blipCount = n + 1
  }

  /**
   * The live moving-body budget (perf contract: <= BODY_BUDGET enabled at once, everything
   * included): over it, switch off the farthest traffic first, then roadblock cars, then
   * pursuers (they're far beyond reach by then anyway).
   */
  const budgetGroups = [traffic.cars, blockers, units]
  function enforceBudget() {
    let n = 0
    for (const b of physicsWorld.dynamics) if (b.enabled) n += 1
    while (n > BODY_BUDGET) {
      let worst = null
      let wd = -1
      for (const group of budgetGroups) {
        for (const x of group) {
          if (!x.body.enabled) continue
          const d = x.pos.distanceToSquared(runtime.car.position)
          if (d > wd) {
            wd = d
            worst = x
          }
        }
        if (worst) break
      }
      if (!worst) break
      worst.body.enabled = false
      heat.stats.budgetCuts += 1
      n -= 1
    }
    heat.bodies = n
  }

  /** Formations: one rolling block and one pair boxing your flanks at a time (see FORM_LEVEL). */
  function formations(dt) {
    st.blockCool = Math.max(0, st.blockCool - dt)
    st.boxCool = Math.max(0, st.boxCool - dt)
    st.pitCool = Math.max(0, st.pitCool - dt)
    let blocker = null
    let boxers = 0
    for (const u of units) {
      if (!u.active || u.fly) continue
      if (u.role !== 'chase') {
        u.roleT -= dt
        if (u.roleT <= 0 || !heat.seen || heat.bustedT > 0) {
          if (u.role === 'block') st.blockCool = BLOCK_COOL
          else st.boxCool = BOX_COOL
          u.role = 'chase'
        }
      }
      if (u.role === 'block') blocker = u
      else if (u.role !== 'chase') boxers += 1
    }
    st.formT -= dt
    if (st.formT > 0) return
    st.formT = 0.5
    if (st.frozen || heat.level < FORM_LEVEL || !heat.seen || path[st.pI].w < FORM_WIDTH || st.pSpeed < 12 || heat.bustedT > 0 || heat.grace > 0) return
    let n = 0
    for (const u of units) if (u.active && !u.fly && u.dist < 70) n += 1
    if (n < 3) return
    if (!blocker && st.blockCool <= 0) {
      // The fastest unit within 60 m behind you (never the tank).
      let best = null
      for (const u of units) {
        if (!u.active || u.fly || u.role !== 'chase' || u.spec.big || u.pit > 0) continue
        const gap = st.pS - u.s
        if (gap < -5 || gap > 60) continue
        if (!best || u.spec.cap > best.spec.cap) best = u
      }
      if (best) {
        best.role = 'block'
        best.roleT = BLOCK_TIME + 3
        heat.stats.blocks += 1
        radio('block', { u: unitNo(best) })
      }
    }
    if (boxers === 0 && st.boxCool <= 0) {
      // The two nearest chasers behind you take a flank each.
      let a = null
      let b = null
      for (const u of units) {
        if (!u.active || u.fly || u.role !== 'chase' || u.pit > 0) continue
        const gap = st.pS - u.s
        if (gap < -4 || gap > 45) continue
        if (!a || gap < st.pS - a.s) {
          b = a
          a = u
        } else if (!b || gap < st.pS - b.s) b = u
      }
      if (a && b) {
        const left = a.lane < b.lane ? a : b
        const right = left === a ? b : a
        left.role = 'boxL'
        right.role = 'boxR'
        left.roleT = BOX_TIME
        right.roleT = BOX_TIME
        heat.stats.boxes += 1
        radio('box', { u: unitNo(left), v: unitNo(right) })
      }
    }
  }

  function heliActiveOrBlocks() {
    if (heli.active) return true
    for (const b of blockers) if (b.active) return true
    return false
  }

  function setLevel(quiet = false) {
    heat.level = 1 + Math.floor(clamp(heat.value, 0, HEAT_MAX))
    if (heat.level !== st.lastLevel) {
      if (heat.level > st.lastLevel) {
        for (let l = st.lastLevel + 1; l <= heat.level; l += 1) st.intro.push(...INTRO[l])
        if (!quiet) {
          heatSfx.heatUp()
          toast(`HEAT LEVEL ${heat.level}`, 'error', heat.level >= 4 ? 'Helicopter inbound' : heat.level === 3 ? 'Jeeps and interceptors' : undefined)
          radio('level', { lvl: heat.level })
        }
      }
      st.lastLevel = heat.level
    }
  }

  function startBusted() {
    heat.bustedT = BUSTED_TIME
    heat.busted = 1
    heat.busts += 1
    runtime.input.hold = true
    heatSfx.busted()
    runtime.camera.shake = Math.max(runtime.camera.shake || 0, 0.4)
    // The unbanked bounty is lost.
    const lost = Math.floor(heat.bounty)
    heat.bounty = 0
    if (lost > 0) {
      heat.bountyPop = `-${lost} BOUNTY LOST`
      heat.bountyPopT = 2.5
    }
    radio('busted', {}, true)
  }

  function endBusted() {
    heat.bustedT = 0
    heat.busted = 0
    runtime.input.hold = false
  }

  /** Thrown off the road (shoved past the edge by you): a takedown. */
  function takedown(u) {
    heat.stats.wrecks += 1
    award(BOUNTY.wreck, 'TAKEDOWN')
    radio('down', { u: unitNo(u) })
  }

  /** One pursuer's frame: pace, lane (role, obstacles, the inside of bends), PIT, ram, gadget, or tumbling after a throw. */
  function stepUnit(u, dt, t, onPlaza, safe) {
    if (st.frozen) {
      place(u, 0)
      return
    }
    if (u.fly) {
      u.flyT += dt
      u.flyVel.y -= 22 * dt
      u.pos.addScaledVector(u.flyVel, dt)
      _q.setFromAxisAngle(u.flyAxis, u.flySpin * dt)
      u.quat.premultiply(_q)
      u.body.enabled = false
      if (u.flyT > (u.burn ? BURN_TIME + 0.5 : 2.6) || u.pos.y < path[u.i].y - 25) deactivate(u)
      return
    }
    u.ramCool = Math.max(0, u.ramCool - dt)
    const sp = u.spec
    const gap = st.pS - u.s
    const here = path[u.i]
    const ahead = path[Math.min(last, u.i + 14)]
    const turn = 1 - (here.fx * ahead.fx + here.fz * ahead.fz)
    // They don't see you (and did): searching at a steady pace, no ramming, no gadgets.
    const searching = st.engaged && !heat.seen
    // Falling behind: extra pace (up to 25% at 110 m) so they catch up - but pull further
    // away than that (boost pads, nitro, a clean line) and they lose you: slower past
    // 120 m (85% at 150 m), which is how you escape.
    let catchUp = 1
    if (gap > 20 && gap <= 110) catchUp = 1 + Math.min(0.25, (gap - 20) / 360)
    else if (gap > 110) catchUp = 1.25 - Math.min(0.4, (gap - 110) / 100)
    const cap = sp.cap * catchUp * (1 - Math.min(0.35, turn)) * (obstacleSections.has(here.section) ? 0.92 : 1)
    let want
    if (heat.bustedT > 0) want = 0
    else if (searching) want = Math.min(cap, sp.cap * SEARCH_PACE * (1 - Math.min(0.35, turn)))
    else if (u.pit > 0) want = Math.min(cap + sp.ram, Math.max(0, st.pSpeed + clamp((gap - 2) * 1.2, -4, 4)))
    else if (u.role === 'block') {
      // Overtake, then sit BLOCK_AHEAD m in front of you and brake.
      if (gap > -BLOCK_AHEAD + 3) want = Math.min(cap * 1.12 + 4, st.pSpeed + 9)
      else want = Math.max(0, st.pSpeed - 3.5 + (gap + BLOCK_AHEAD) * 0.6)
    } else if (u.role !== 'chase') {
      // Boxing: alongside you, a metre behind your middle, matching your pace.
      want = Math.min(cap + sp.ram, Math.max(0, st.pSpeed + clamp((gap - 1) * 0.9, -6, 10)))
    } else if (gap > 14) want = Math.min(cap, st.pSpeed + clamp(gap * 0.3, 4, 18))
    else if (gap > -2) want = u.cool > 0 ? st.pSpeed - 2.5 : Math.min(cap + sp.ram, st.pSpeed + sp.ram)
    else if (gap > -40) want = Math.max(0, st.pSpeed - 5)
    else want = st.pSpeed * 0.5
    // Grace after a bust: keep well back.
    if (heat.grace > 0 && gap < GRACE_DIST + 5) want = Math.min(want, st.pSpeed * 0.6)
    if (u.pin) want = 0

    // A moving obstacle (crossing truck, pop-up bollard, sliding crate, traffic) in its lane
    // ahead: steer round it to the nearer clear side, or brake to stop short if neither is.
    const uw = u.model.half[0]
    const look = 5 + u.speed * 0.9
    let block = null
    let bds = 0
    let blat = 0
    for (let k = 0; k < nObs; k += 1) {
      const o = obs[k]
      const ds = o.s - u.s
      if (ds < -(o.halfS + u.model.half[2]) || ds > look) continue
      const lat = o.lat + o.vlat * Math.min(1.5, Math.max(0, ds) / Math.max(4, u.speed))
      if (Math.abs(lat - u.lane) >= o.halfLat + uw + 0.5) continue
      if (!block || ds < bds) {
        block = o
        bds = ds
        blat = lat
      }
    }
    if (block) {
      const lim = Math.max(0.5, path[u.i].w / 2 - 1.1)
      const clear = block.halfLat + uw + 0.9
      const l1 = blat - clear
      const l2 = blat + clear
      const ok1 = l1 >= -lim
      const ok2 = l2 <= lim
      let lane = null
      if (ok1 && ok2) lane = Math.abs(l1 - u.lane) < Math.abs(l2 - u.lane) ? l1 : l2
      else if (ok1) lane = l1
      else if (ok2) lane = l2
      if (lane !== null && bds > 1.5) {
        if (u.avoidT <= 0) heat.stats.avoids += 1
        u.avoidLane = lane
        u.avoidT = 0.45
        // Too close to get round at this pace: ease off while swerving.
        if (bds < u.speed * 0.45) want = Math.min(want, u.speed * 0.85)
      } else want = Math.min(want, Math.max(0, (bds - block.halfS - u.model.half[2] - 2) * 1.6))
    }

    // You're on a plaza: wait at its edge (never onto it).
    let hold = Infinity
    if (onPlaza) {
      const pk = plazaOf(st.pS)
      if (pk >= 0 && u.s < plazas[pk].s0) hold = plazas[pk].s0 - 6 - u.slot * 6
    }
    u.cool = Math.max(0, u.cool - dt)
    const acc = want > u.speed ? 11 : 18
    u.speed += clamp(want - u.speed, -acc * dt, acc * dt)
    u.speed = Math.max(0, u.speed)
    let ns = u.s + u.speed * dt
    if (ns > hold) {
      ns = Math.max(u.s, hold)
      u.speed = Math.min(u.speed, 3)
    }
    // Don't drive through you: stop at your bumper when right behind you.
    const dLat = st.pLat - u.lane
    if (Math.abs(dLat) < 1.9 && gap > 0 && st.pS - ns < 4.2 && (u.cool > 0 || searching)) ns = Math.min(ns, st.pS - 4.2)
    u.s = clamp(ns, 0, path[last].s)
    u.i = indexAt(u.s, u.i)

    // Lane: line up with you when near (the slot offsets box you in), straight at you to
    // ram; a role's own line; the inside of a bend when chasing from further back.
    const w = path[u.i].w
    const lim = Math.max(0.5, w / 2 - 1.3)
    let target
    const absGap = Math.abs(gap)
    const slotOff = u.slot % 3 === 1 ? -1 : u.slot % 3 === 2 ? 1 : 0
    if (searching) target = slotOff * 0.3 * w
    else if (u.pit > 0) target = st.pLat + u.pitSide * 1.9
    else if (u.role === 'block') target = gap > -8 ? st.pLat + (st.pLat > 0 ? -4.4 : 4.4) : st.pLat
    else if (u.role === 'boxL') target = st.pLat - BOX_LAT
    else if (u.role === 'boxR') target = st.pLat + BOX_LAT
    else if (absGap < 12 && u.cool <= 0) target = st.pLat
    else if (absGap < 45) target = st.pLat + slotOff * 2.6
    else target = slotOff * 0.3 * w
    if (!searching && u.role === 'chase' && absGap >= 12 && u.pit <= 0) {
      const far = path[Math.min(last, u.i + 25)]
      const bend = here.fx * far.fz - here.fz * far.fx
      const k = clamp((Math.abs(bend) - 0.08) * 3, 0, 0.7)
      if (k > 0) target += (Math.sign(bend) * (lim - 0.4) - target) * k
    }
    if (sp.swerve && u.role === 'chase' && u.pit <= 0) target += Math.sin(t * 2.4 + u.swerve) * sp.swerve
    let rate = sp.laneRate
    if (u.avoidT > 0) {
      u.avoidT -= dt
      target = u.avoidLane
      rate *= 1.5
    }
    if (u.pin) target = u.lane
    target = clamp(target, -lim, lim)
    const lr = clamp((target - u.lane) * 2.2, -rate, rate)
    u.laneRate += (lr - u.laneRate) * Math.min(1, dt * 6)
    u.lane += u.laneRate * dt
    // Shoved: slide (off the road if pushed past its edge).
    if (u.laneVel !== 0) {
      u.lane += u.laneVel * dt
      u.laneVel *= Math.max(0, 1 - 2.5 * dt)
      if (Math.abs(u.laneVel) < 0.2) u.laneVel = 0
      if (Math.abs(u.lane) > w / 2 + 0.8) {
        u.fly = true
        u.flyT = 0
        u.flyVel.copy(u.fwd).multiplyScalar(u.speed).addScaledVector(u.right, u.laneVel)
        u.flyVel.y += 1
        u.flyAxis.copy(u.fwd)
        u.flySpin = Math.sign(u.laneVel || 1) * 4
        u.laneVel = 0
        takedown(u)
        return
      }
    }
    // Keep apart from the other pursuers.
    for (const o of units) {
      if (o === u || !o.active || o.fly) continue
      if (Math.abs(o.s - u.s) < 6 && Math.abs(o.lane - u.lane) < 2.3) u.lane += (u.lane >= o.lane ? 1 : -1) * 2.5 * dt
    }
    // (A shoved unit isn't held in: the clamp is what kept a ram from ever pushing one past the edge. Once the slide ends it eases back.)
    const held = clamp(u.lane, -lim - 0.3, lim + 0.3)
    u.lane = u.laneVel !== 0 ? u.lane : u.lane + (held - u.lane) * Math.min(1, dt * 6)
    place(u, dt)

    // Collision box: near you only; a ghost while you're safe (plaza, just respawned).
    const body = u.body
    body.enabled = u.pos.distanceToSquared(runtime.car.position) < COLLIDE * COLLIDE
    if (body.enabled) {
      const o = body.offset
      body.ax.set(1, 0, 0).applyQuaternion(u.quat)
      body.ay.set(0, 1, 0).applyQuaternion(u.quat)
      body.az.set(0, 0, 1).applyQuaternion(u.quat)
      body.c.copy(u.pos).addScaledVector(body.ax, o.x).addScaledVector(body.ay, o.y).addScaledVector(body.az, o.z)
      body.ghost = safe || plazaOf(u.s) >= 0 || heat.grace > 0
      body.vel.copy(u.fwd).multiplyScalar(u.speed).addScaledVector(u.right, u.laneVel)
    }

    // Way behind or way ahead: gives up (recycled).
    if (gap > 260 || gap < -220) {
      deactivate(u)
      return
    }

    // PIT: line up on your rear quarter (telegraphed), then the tap - if you're still there.
    u.pitCool = Math.max(0, u.pitCool - dt)
    if (u.pit > 0) {
      u.pit -= dt
      heat.pit = Math.max(heat.pit, u.pit)
      if (u.pit <= 0) {
        const lat = u.lane - st.pLat
        if (gap > -0.8 && gap < 5 && Math.abs(lat) < 2.9 && !safe && heat.grace <= 0 && heat.bustedT <= 0) {
          runtime.input.hazard = 'pit'
          runtime.input.hazardSide = lat > 0 ? 1 : -1
          heat.hits.pit += 1
          heat.stats.pits += 1
          heatSfx.screech()
          runtime.camera.shake = Math.max(runtime.camera.shake || 0, 0.35)
          radio('pitHit', {}, true)
          u.cool = 1.6
        } else {
          heat.stats.pitsDodged += 1
          award(BOUNTY.pitDodge, 'PIT DODGED')
          radio('pitMiss', {}, true)
        }
        u.pit = 0
        u.pitCool = PIT_UNIT_COOL
        st.pitCool = PIT_COOL
      }
    } else if (heat.level >= PIT_LEVEL && st.pitCool <= 0 && u.pitCool <= 0 && u.sees && u.role !== 'block' && u.charge <= 0 && st.pSpeed > PIT_SPEED && heat.bustedT <= 0 && heat.grace <= 0 && !safe && !st.frozen) {
      const lat = u.lane - st.pLat
      if (gap > 0.5 && gap < 4.5 && Math.abs(lat) > 1.2 && Math.abs(lat) < 3.2) {
        u.pit = PIT_TELEGRAPH
        u.pitSide = lat > 0 ? 1 : -1
        st.pitCool = PIT_COOL
        heat.warn = PIT_TELEGRAPH + 0.15
        heat.warnKind = 'pit'
        heatSfx.charge()
        radio('pit', { u: unitNo(u) }, true)
      }
    }

    // Gadget: charge (telegraph), then fire.
    if (u.charge > 0) {
      u.charge -= dt
      if (u.charge <= 0) fire(u)
    } else if (sp.weapon && heat.level >= sp.weaponLevel && heat.bustedT <= 0 && u.sees && u.pit <= 0) {
      u.weaponT -= dt
      const d = u.pos.distanceTo(runtime.car.position)
      if (u.weaponT <= 0 && d > 12 && d < 58 && !safe && heat.grace <= 0) {
        u.weaponT = rand(sp.every[0], sp.every[1])
        startCharge(u)
      }
    }
  }

  /** A roadblock car pulls out and joins the chase (if a pursuer slot and the budget allow). */
  function pullOut(b) {
    let out = 0
    for (const x of units) if (x.active) out += 1
    const u = units.find((x) => !x.active)
    if (!u || out >= allowed() + 1) return false
    setKind(u, b.kind)
    u.active = true
    u.fly = false
    u.s = b.s
    u.i = b.i
    u.lane = b.lane
    u.laneRate = 0
    u.laneVel = 0
    u.speed = 0
    u.cool = 0.8
    u.charge = 0
    u.weaponT = u.spec.every ? rand(3, u.spec.every[1]) : 0
    u.role = 'chase'
    u.roleT = 0
    u.pit = 0
    u.pitCool = 6
    u.avoidT = 0
    u.closeCool = 0
    u.turnIn = 1
    u.turnDir = b.slot % 2 ? 1 : -1
    u.slot = out
    u.dist = b.dist
    place(u, 0)
    deactivate(b)
    heat.stats.pullouts += 1
    return true
  }

  function stepRoadblocks(dt, safe) {
    // The next roadblock ahead of you, from heat 2, until you're past it.
    if (activeBlock) {
      const rb = activeBlock
      // Through it (not busted): bounty, and its cars pull out after you.
      let near = false
      for (const b of blockers) if (b.active && !b.fly && b.dist < RB_PULL_NEAR && st.pSpeed < 8) near = true
      if (!st.blockPassed && (st.pS > rb.s + RB_PULL_PAST || near)) {
        st.blockPassed = true
        if (st.pS > rb.s + RB_PULL_PAST && heat.bustedT <= 0) award(BOUNTY.roadblock, 'ROADBLOCK')
        let pulled = 0
        for (const b of blockers) if (b.active && !b.fly && pullOut(b)) pulled += 1
        if (pulled) radio('pullout', {}, true)
      }
      if (st.pS > rb.s + 45 || st.pS < rb.s - 320 || runtime.race.checkpoint >= rb.checkpoint) {
        for (const b of blockers) deactivate(b)
        for (const sp of spikes) if (sp.block) removeSpike(sp)
        activeBlock = null
      }
    }
    if (!activeBlock && heat.level >= 2) {
      for (const rb of roadblocks) {
        if (rb.used || runtime.race.checkpoint >= rb.checkpoint) continue
        if (st.pS < rb.s - 280 || st.pS > rb.s - 60) continue
        activeBlock = rb
        rb.used = true
        st.blockPassed = false
        const p = path[rb.pi]
        const spiked = heat.level >= RB_SPIKE_LEVEL
        const gapW = spiked ? ROADBLOCK_GAP_SPIKED : ROADBLOCK_GAP
        const block = p.w - 1.2 - gapW
        const n = clamp(Math.round(block / 4.4), 1, RB_POOL)
        const span = block / n
        for (let k = 0; k < n; k += 1) {
          const b = blockers[k]
          setKind(b, k === 1 ? 'jeep' : 'patrol')
          b.active = true
          b.fly = false
          b.slot = k
          b.s = rb.s + k * 1.6
          b.i = rb.pi
          b.lane = -rb.side * (p.w / 2 - 0.6 - span * (k + 0.5))
          b.speed = 0
          b.laneRate = 0
          b.laneVel = 0
          b.dist = Infinity
          place(b, 0)
        }
        // Higher heat: a spike strip across the inner RB_SPIKE_COVER m of the gap (the edge side stays clear).
        if (spiked) {
          const lane = rb.side * (p.w / 2 - 0.6 - gapW + RB_SPIKE_COVER / 2)
          if (placeSpike(indexAt(rb.s + 1.6, rb.pi), lane, RB_SPIKE_COVER, 600, true)) {
            heat.stats.rbSpikes += 1
            radio('spikes', {}, true)
          }
        } else radio('roadblock', { place: placeName() }, true)
        toast('ROADBLOCK AHEAD', 'error', `Gap on the ${rb.side > 0 ? 'right' : 'left'}${spiked ? ' - spikes!' : ''}`)
        break
      }
    }
    for (const b of blockers) {
      if (!b.active) continue
      if (b.fly) {
        b.flyT += dt
        b.flyVel.y -= 22 * dt
        b.pos.addScaledVector(b.flyVel, dt)
        _q.setFromAxisAngle(b.flyAxis, b.flySpin * dt)
        b.quat.premultiply(_q)
        b.body.enabled = false
        if (b.flyT > (b.burn ? BURN_TIME + 0.5 : 2.6)) deactivate(b)
        continue
      }
      b.ramCool = Math.max(0, b.ramCool - dt)
      if (b.laneVel !== 0) {
        b.lane += b.laneVel * dt
        b.laneVel *= Math.max(0, 1 - 3 * dt)
        if (Math.abs(b.laneVel) < 0.2) b.laneVel = 0
        place(b, 0)
        // Shoved past the edge of the road: thrown off it (a takedown), like a pursuer.
        if (Math.abs(b.lane) > path[b.i].w / 2 + 0.8) {
          throwUnit(b, b.lane >= 0 ? 1 : -1, THROW_SIDE, 2, false)
          takedown(b)
          continue
        }
      }
      const body = b.body
      body.enabled = b.pos.distanceToSquared(runtime.car.position) < COLLIDE * COLLIDE
      if (body.enabled) {
        const o = body.offset
        body.ax.set(1, 0, 0).applyQuaternion(b.quat)
        body.ay.set(0, 1, 0).applyQuaternion(b.quat)
        body.az.set(0, 0, 1).applyQuaternion(b.quat)
        body.c.copy(b.pos).addScaledVector(body.ax, o.x).addScaledVector(body.ay, o.y).addScaledVector(body.az, o.z)
        body.ghost = safe
        body.vel.set(0, 0, 0)
      }
    }
  }

  function stepShots(dt) {
    const car = runtime.car.position
    for (const s of shots) {
      if (!s.active) continue
      s.t += dt
      if (s.state === 'drop') {
        // Falling from the helicopter onto the road ahead.
        const k = Math.min(1, s.t / s.life)
        s.pos.lerpVectors(s.from, s.to, k)
        s.pos.y += (1 - k) * k * 6
        if (k >= 1) {
          if (s.kind === 'mine') {
            s.state = 'mine'
            s.t = 0
            s.life = MINE_LIFE
          } else {
            landSpike(s.spike)
            s.active = false
          }
        }
        continue
      }
      if (s.state === 'mine') {
        if (s.pos.distanceTo(car) < HIT_R.mine) {
          hitPlayer('emp', s.pos)
          s.active = false
        } else if (s.t > s.life) s.active = false
        continue
      }
      s.vel.y -= s.gravity * dt
      s.pos.addScaledVector(s.vel, dt)
      _p.copy(car)
      _p.y += 0.6
      const d = s.pos.distanceTo(_p)
      s.minD = Math.min(s.minD, d)
      if (d < HIT_R[s.kind] + s.scale * 0.5) {
        hitPlayer(s.kind, s.pos)
        s.active = false
      } else if (s.t > s.life) {
        if (useQuality.getState().settings.particles) burst({ x: s.pos.x, y: s.pos.y, z: s.pos.z, count: 6, palette: s.kind === 'emp' ? 'spark' : 'splash', speed: 3 })
        // A near miss: bounty.
        if (s.minD < 6) award(BOUNTY.dodge, 'DODGED')
        s.active = false
      }
    }
  }

  function stepSpikes(dt) {
    const car = runtime.car.position
    for (const sp of spikes) {
      if (!sp.active) continue
      sp.life -= dt
      if (!sp.hit && sp.trigger) {
        const tr = sp.trigger
        const dx = car.x - tr.c[0]
        const dy = car.y - tr.c[1]
        const dz = car.z - tr.c[2]
        if (Math.abs(dx * tr.ax[0] + dy * tr.ax[1] + dz * tr.ax[2]) < tr.h[0] && Math.abs(dy) < 2 && Math.abs(dx * tr.az[0] + dy * tr.az[1] + dz * tr.az[2]) < tr.h[2]) {
          sp.hit = true
          heat.hits.spikes += 1
        }
      }
      if (sp.life <= 0) removeSpike(sp)
    }
  }

  function stepHeli(dt, t, safe) {
    const want = TABLE[heat.level].heli && heat.bustedT <= 0
    const car = runtime.car
    if (want && !heli.active) {
      heli.active = true
      heli.pos.copy(car.position).addScaledVector(_f.set(-Math.sin(car.yaw), 0, -Math.cos(car.yaw)), -90)
      heli.pos.y += 30
      heli.cool = rand(4, 6)
      heli.warn = 0
      heli.seen = true
      heli.spot.copy(car.position)
      heli.last.copy(car.position)
      heat.spawned.heli += 1
      if (heat.firstLevel.heli === undefined) heat.firstLevel.heli = heat.level
      if (!st.heliAnnounced) {
        st.heliAnnounced = true
        radio('heli', {}, true)
      }
    }
    if (!want && heli.active) {
      // Peels off and away (simply gone once out of sight).
      heli.pos.y += 12 * dt
      if (heli.pos.distanceTo(car.position) > 160) heli.active = false
      else heli.pos.addScaledVector(_f.set(Math.sin(heli.yaw), 0, Math.cos(heli.yaw)), 25 * dt)
    }
    if (!heli.active) return
    // Sight: under cover (tunnel, alley, car park) it loses you; searching, it finds you
    // again once you're out in the open within HELI_SPOT m of it.
    const covered = cover[st.pI] > 0
    if (covered) heli.seen = false
    else if (!heli.seen) heli.seen = Math.hypot(heli.pos.x - car.position.x, heli.pos.z - car.position.z) < HELI_SPOT
    if (heli.seen) heli.last.copy(car.position)
    if (want && !heli.seen) {
      // Searching: circles where it last had you, drifting on along the road, the light sweeping.
      heli.sweep += dt
      _f.set(-Math.sin(car.yaw), 0, -Math.cos(car.yaw))
      heli.target.copy(heli.last)
      heli.target.x += Math.cos(heli.sweep * 0.7) * 14
      heli.target.z += Math.sin(heli.sweep * 0.7) * 14
      heli.target.y += 22
      heli.pos.lerp(heli.target, Math.min(1, dt * 0.7))
      _p.copy(heli.last)
      _p.x += Math.cos(heli.sweep * 1.9) * 9
      _p.z += Math.sin(heli.sweep * 1.3) * 9
      heli.spot.lerp(_p, Math.min(1, dt * 3))
      heli.warn = 0
    } else if (want) {
      // Hover ahead of you, off to one side and ~19 m up, nose turned back at you (the
      // searchlight then crosses the view instead of filling it).
      _f.set(-Math.sin(car.yaw), 0, -Math.cos(car.yaw))
      heli.target.copy(car.position).addScaledVector(_f, 15).addScaledVector(_r.set(-_f.z, 0, _f.x), 11).addScaledVector(car.velocity, 0.5)
      heli.target.y += 19
      heli.pos.lerp(heli.target, Math.min(1, dt * 1.6))
      // The light stays on you (aimed a little ahead, as an operator leads a moving car).
      _p.copy(car.position).addScaledVector(car.velocity, 0.15)
      heli.spot.lerp(_p, Math.min(1, dt * 6))
      const dx = car.position.x - heli.pos.x
      const dz = car.position.z - heli.pos.z
      const yaw = Math.atan2(-dx, -dz)
      let d = yaw - heli.yaw
      d = Math.atan2(Math.sin(d), Math.cos(d))
      heli.yaw += d * Math.min(1, dt * 2)
      if (heli.warn > 0) {
        heli.warn -= dt
        if (heli.warn <= 0) heliDrop()
      } else if (!safe && heat.grace <= 0) {
        heli.cool -= dt
        if (heli.cool <= 0) {
          heli.cool = rand(HELI_EVERY[0], HELI_EVERY[1])
          heli.warn = HELI_WARN
          heat.warn = HELI_WARN + 0.3
          heat.warnKind = 'heli'
          heatSfx.charge()
        }
      }
    }
    heli.rotor += dt * 26
    // Nose down a touch when moving.
    _q.setFromAxisAngle(UP, heli.yaw)
    _q2.setFromAxisAngle(X_AXIS, -0.12)
    heli.quat.copy(_q).multiply(_q2)
  }

  // --- Drawing --------------------------------------------------------------------

  function draw(t) {
    wheelsAndBodies(t)
    // Shots.
    let n = 0
    for (const s of shots) {
      if (!s.active) continue
      let sc = s.scale
      if (s.state === 'mine') sc *= 1 + 0.25 * Math.sin(t * 12)
      _s.set(sc, s.kind === 'net' ? sc * 0.35 : sc, sc)
      _m.compose(s.pos, _q.identity(), _s)
      shotMesh.setMatrixAt(n, _m)
      shotMesh.setColorAt(n, SHOT_COLOR[s.kind] || WHITE)
      n += 1
    }
    // Charging gadgets: a glow growing at the muzzle.
    for (const u of units) {
      if (!u.active || u.charge <= 0 || n >= SHOTS) continue
      muzzle(u, _p)
      const k = 1 - u.charge / CHARGE
      const sc = (0.2 + 0.45 * k) * (0.8 + 0.2 * Math.sin(t * 40))
      _s.set(sc, sc, sc)
      _m.compose(_p, _q.identity(), _s)
      shotMesh.setMatrixAt(n, _m)
      shotMesh.setColorAt(n, SHOT_COLOR[u.spec.weapon] || WHITE)
      n += 1
    }
    shotMesh.count = n
    shotMesh.visible = n > 0
    if (n) {
      shotMesh.instanceMatrix.needsUpdate = true
      shotMesh.instanceColor.needsUpdate = true
    }
    _s.set(1, 1, 1)
    // Spike strips.
    let k = 0
    for (const sp of spikes) if (sp.active) spikeMesh.setMatrixAt(k++, sp.matrix)
    spikeMesh.count = k
    spikeMesh.visible = k > 0
    if (k) spikeMesh.instanceMatrix.needsUpdate = true
  }

  /** Instances written per kind this frame (reused). */
  const counts = {}
  function wheelsAndBodies(t) {
    for (const kind in meshes) counts[kind] = 0
    const strobe = Math.floor(t * 12) % 2 === 0
    // The light bars flash on the shader clock (render/worldMaterial.js sirenOn), so the
    // flares and pools here flash with the lenses.
    const ts = getWorldMaterial().userData.uniforms.uTime.value
    const lamps = night.lamps
    const nightK = Math.max(0.25, lamps)
    for (const u of all) {
      if (!u.active) continue
      const mesh = meshes[u.kind]
      _m.compose(u.pos, u.quat, _s.set(1, 1, 1))
      mesh.setMatrixAt(counts[u.kind]++, _m)
      // Wheels (the shared batch).
      const w = u.model.wheels
      for (let i = 0; i < w.positions.length; i += 1) {
        const p = w.positions[i]
        _p.set(p[0], p[1], p[2])
        _q2.setFromAxisAngle(X_AXIS, u.spin)
        _w.set(w.width, w.radius, w.radius)
        _m2.compose(_p, _q2, _w).premultiply(_m)
        wheelBatch.push(_m2, RIM)
      }
      if (u.fly) continue
      // Head / tail lamps after dark (parked roadblock cars too).
      carLights.car(_m, u.model, u.roadblock ? 0 : u.speed < st.pSpeed - 3 ? 0.6 : 0, false, -(w.radius || 0.45))
      // The light bar: red / blue flares (white strobe while charging a gadget), seen from
      // far off; after dark each flash also throws a coloured pool on the road beside it.
      for (let j = 0; j < 2; j += 1) {
        const b = u.model.bar[j]
        _p.set(b[0], b[1], b[2]).applyMatrix4(_m)
        const on = u.charge > 0 ? strobe : sirenOn(ts, j === 1)
        const col = u.charge > 0 ? WHITE : j === 0 ? RED : BLUE
        carLights.glowAt(_p, on ? 2.4 : 0.6, col, on ? 1.4 * nightK + 0.3 : 0.15)
        if (on && lamps > 0.05) {
          _p.set(j === 0 ? -1.6 : 1.6, -(w.radius || 0.45) + 0.06, 0).applyMatrix4(_m)
          carLights.poolAt(_p, u.quat, 8, 9, col, 0.5 * lamps)
        }
      }
    }
    for (const kind in meshes) {
      const mesh = meshes[kind]
      mesh.count = counts[kind]
      mesh.visible = counts[kind] > 0
      if (counts[kind]) mesh.instanceMatrix.needsUpdate = true
    }
    // The helicopter.
    const showHeli = heli.active
    heliMesh.visible = showHeli
    rotor.visible = showHeli
    const lowQ = useQuality.getState().level === 'LOW'
    cone.visible = showHeli && !lowQ
    if (showHeli) {
      heliMesh.matrix.compose(heli.pos, heli.quat, _s.set(1, 1, 1))
      heliMesh.matrixWorldNeedsUpdate = true
      _p.set(0, 1.25, 0).applyQuaternion(heli.quat).add(heli.pos)
      _q2.setFromAxisAngle(UP, heli.rotor)
      _q.copy(heli.quat).multiply(_q2)
      rotor.matrix.compose(_p, _q, _s)
      rotor.matrixWorldNeedsUpdate = true
      for (let j = 0; j < 2; j += 1) {
        const b = heliModel.bar[j]
        _p.set(b[0], b[1], b[2]).applyMatrix4(heliMesh.matrix)
        const on = sirenOn(ts, j === 1)
        carLights.glowAt(_p, on ? 2.8 : 0.7, j === 0 ? RED : BLUE, on ? 1.4 * nightK + 0.3 : 0.15)
      }
      // The searchlight: from the belly down to its spot on the road (it trails your car; it
      // sweeps round while searching; red while aiming a drop). LOW: the spot only.
      const aiming = heli.warn > 0 && Math.floor(t * 8) % 2 === 1
      const col = aiming ? RED : SEARCH
      heli.lamp.set(0, -1.1, -1.6).applyQuaternion(heli.quat).add(heli.pos)
      // (The car's origin rides ~0.35 m over the road on its springs.)
      _p.copy(heli.spot)
      _p.y -= 0.28
      carLights.poolAt(_p, _q.identity(), 8.5, 8.5, col, 0.35 + 0.65 * lamps)
      carLights.glowAt(heli.lamp, 1.2, col, 0.6 + lamps)
      if (cone.visible) {
        _v.copy(_p).sub(heli.lamp)
        const len = _v.length()
        _v.multiplyScalar(1 / (len || 1))
        _q.setFromUnitVectors(DOWN, _v)
        _w.set(3.6, len, 3.6)
        cone.matrix.compose(heli.lamp, _q, _w)
        cone.matrixWorldNeedsUpdate = true
        coneMat.uniforms.uColor.value.copy(col)
        coneMat.uniforms.uK.value = 0.35 + 0.65 * lamps
      }
    }
    // Roadblock spike strips: a hazard glow on each end after dark.
    if (lamps > 0.05) {
      for (const sp of spikes) {
        if (!sp.active || !sp.block) continue
        for (const e of SPIKE_ENDS) {
          _p.set(e, 0.3, 0).applyMatrix4(sp.matrix)
          carLights.glowAt(_p, 0.6, AMBER, strobe ? 1.2 : 0.4)
        }
      }
    }
  }

  function dispose() {
    warmGone = true
    clearAll()
    endBusted()
    heatSiren.stop()
    for (const u of all) {
      physicsWorld.removeDynamic(u.body)
      u.body.onBump = null
    }
    for (const o of objects) {
      scene.remove(o)
      if (o.isInstancedMesh) o.dispose()
    }
    unregisterMissiles()
    traffic.dispose()
    for (const g of [coneGeo, shotGeo, spikeGeo]) g.dispose()
    for (const m of [coneMat, shotMat]) m.dispose()
    // Hide every matrix slot so a stale instance never flashes if the meshes are reused.
    for (const kind in meshes) meshes[kind].setMatrixAt(0, ZERO_SCALE)
    heat.on = false
    resetHeat()
  }

  /**
   * Compiles every program the chase will need (the instanced fleet / traffic, spikes,
   * shots, the searchlight) now, while the map loads, instead of in the frame the first
   * unit shows up: compileAsync only sees visible objects, so the hidden ones are shown for
   * the call (it gathers them synchronously); the next draw() hides them again.
   */
  function warm(gl, camera) {
    const all = [...objects, ...traffic.meshes]
    const show = () => {
      const hidden = all.filter((o) => !o.visible)
      for (const o of hidden) o.visible = true
      return hidden
    }
    let hidden = show()
    let ready
    try {
      ready = gl.compileAsync(scene, camera)
    } finally {
      for (const o of hidden) o.visible = false
    }
    // Then one real draw of each (ANGLE / D3D builds a program's vertex-layout variant at its
    // first draw call, which would still stall the frame the first unit appears in).
    ready
      ?.then(() => {
        if (warmGone) return
        hidden = show()
        const counts = all.map((o) => (o.isInstancedMesh ? o.count : -1))
        for (const o of all) if (o.isInstancedMesh && o.count === 0) o.count = 1
        try {
          gl.render(scene, camera)
        } finally {
          all.forEach((o, k) => {
            if (counts[k] >= 0) o.count = counts[k]
          })
          for (const o of hidden) o.visible = false
        }
      })
      .catch(() => {})
  }
  let warmGone = false

  /** Debug / verification hooks (window.__heat with ?debug). */
  const debug = {
    heat,
    units: () => all.filter((u) => u.active).map((u) => ({ n: unitNo(u), kind: u.kind, roadblock: u.roadblock, role: u.role, pit: +u.pit.toFixed(2), sees: u.sees, s: Math.round(u.s), lane: +u.lane.toFixed(1), speed: +u.speed.toFixed(1), dist: +u.dist.toFixed(1), fly: u.fly, burn: u.burn, body: u.body.enabled, ghost: u.body.ghost })),
    heli: () => ({ active: heli.active, seen: heli.seen, y: +heli.pos.y.toFixed(1), dist: +heli.pos.distanceTo(runtime.car.position).toFixed(1), cool: +heli.cool.toFixed(1) }),
    /** Civilian traffic now: `{ s, lane, speed, body }`, and the stretches it runs on. */
    traffic: () => traffic.cars.filter((c) => c.active).map((c) => ({ s: Math.round(c.s), lane: +c.lane.toFixed(1), speed: +c.speed.toFixed(1), fly: c.fly, body: c.body.enabled, x: +c.pos.x.toFixed(1), y: +c.pos.y.toFixed(1), z: +c.pos.z.toFixed(1), fx: +c.fwd.x.toFixed(3), fz: +c.fwd.z.toFixed(3) })),
    trafficRanges: () => traffic.ranges.map((r) => [Math.round(r.s0), Math.round(r.s1)]),
    roadblocks: () => roadblocks.map((r) => ({ pi: r.pi, s: Math.round(r.s), side: r.side, checkpoint: r.checkpoint, used: r.used })),
    /** Moving obstacles the units see on the road right now (projected). */
    obstacles: () => obs.slice(0, nObs).map((o) => ({ s: Math.round(o.s), lat: +o.lat.toFixed(1), halfS: +o.halfS.toFixed(1), halfLat: +o.halfLat.toFixed(1), traffic: Boolean(o.traffic) })),
    /** Formations may start at the next check (cooldowns cleared). */
    form: () => {
      st.blockCool = 0
      st.boxCool = 0
      st.formT = 0
    },
    /** The nearest pursuer lines up a PIT now if it's alongside your rear quarter (cooldowns cleared). */
    pitNow: () => {
      st.pitCool = 0
      for (const u of units) u.pitCool = 0
    },
    sight: () => ({ seen: heat.seen, evade: +heat.evade.toFixed(2), need: heat.evadeNeed, engaged: st.engaged, cover: cover[st.pI] }),
    setHeat: (v) => {
      heat.value = clamp(v, 0, HEAT_MAX)
      setLevel()
    },
    spawn: (kind, ahead = false) => Boolean(spawn(kind, ahead)),
    /** Tests: no automatic spawns while on. */
    noSpawn: (on = true) => {
      st.noSpawn = on
    },
    /** Tests: a unit of `kind` `ahead` m along the road from you (negative: behind), `lane` m right of the middle, going `speed` m/s. */
    place: (kind, ahead, lane = 0, speed = 0, pin = false) => {
      const u = spawn(kind)
      if (!u) return false
      u.s = clamp(st.pS + ahead, 2, path[last].s - 2)
      u.i = indexAt(u.s, u.i)
      u.lane = lane
      u.speed = speed
      u.pin = pin
      place(u, 0)
      return true
    },
    /** Every active pursuer with a gadget charges it now (and the helicopter its drop). */
    fire: () => {
      for (const u of units) if (u.active && u.spec.weapon && !u.fly) startCharge(u)
    },
    drop: () => {
      if (heli.active) heli.warn = 0.05
    },
    clear: clearAll,
    /** Lines every kind up on the road ahead of you, standing still (screenshots); parade(false) lets them go. */
    parade: (on = true, start = 16, step = 9) => {
      st.frozen = on
      if (!on) return
      clearAll()
      const kinds = ['patrol', 'cab', 'jeep', 'bike', 'tank'].slice(0, QUALITY_MAX[useQuality.getState().level] ?? 3)
      kinds.forEach((k, n) => {
        const u = spawn(k)
        if (!u) return
        u.s = st.pS + start + n * step
        u.lane = (n % 2 ? 1 : -1) * 3
        u.speed = 0
        u.i = indexAt(u.s)
        place(u, 0)
      })
      heat.value = 3.5
      setLevel(true)
    },
    /** Moves every pursuer `m` metres further back along the road (tests the escape rule). */
    pushBack: (m) => {
      for (const u of units) if (u.active) u.s = Math.max(0, u.s - m)
    },
    bodies: () => all.filter((u) => u.body.enabled).length,
    obstacleBodies: () => st.obstacleBodies,
    allowed,
    spikes: () => spikes.filter((s) => s.active).length,
    shots: () => shots.filter((s) => s.active).map((s) => s.kind + ':' + s.state),
  }

  return { update, dispose, warm, debug }
}
