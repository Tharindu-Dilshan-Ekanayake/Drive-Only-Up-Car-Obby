import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, DoubleSide, InstancedMesh, Matrix4, Mesh, MeshLambertMaterial, Object3D, Quaternion, Vector3 } from 'three'

import { chapterTitle } from '@shared/chapters'
import { stageInfo } from '@shared/stages/index'
import { forwardOf, PIT, rightOf } from '@shared/track'

import { sfx } from '../../audio/sfx'
import { actions } from '../../net/actions'
import { getGame, useGame } from '../../store/game'
import { getQuality, useQuality } from '../../store/quality'
import { defer } from '../defer'
import { burst } from '../fx/fxQueue'
import { PALETTE } from '../palette'
import { physicsWorld, startBarrier } from '../physics/instance'
import { PhysicsWorld } from '../physics/world'
import { ITEMS } from '../player/items'
import { getWorldMaterial } from '../render/worldMaterial'
import { buildSignMesh, fontReady } from '../render/signs'
import { runtime } from '../runtime'
import { buildStageGeometry, EXIT_SIGN } from './buildTrack'
import { createObstacles, obstacleStaticBoxes } from './obstacleSim'
import { pickups } from './pickups'
import * as props from './propGeometry'
import Adventure from './Adventure'
import { createCrateIcons, ICON_CELL } from './crateIcons'

/**
 * The current map's stage, loaded as its own chunk once the pier is on screen (and
 * remounted for another map when you travel). Owns everything about
 * the stage while mounted: its meshes (one per section, culled by distance from your
 * section), its colliders and moving obstacles in the physics world, coins and item
 * crates, and its signs. Unmounting gives it all back (geometry, textures, bodies).
 */

const COIN_RADIUS = 2.6
const MAGNET_RADIUS = 11
const CRATE_RADIUS = 2.6
const CRATE_RESPAWN_MS = 8000
const UP = new Vector3(0, 1, 0)
/** Mystery cubes wobble about this tilted axis as they spin (a gem turning on its point). */
const WOBBLE = new Vector3(1, 0, 0.4).normalize()
const _m = new Matrix4()
const _q = new Quaternion()
const _q2 = new Quaternion()
const _p = new Vector3()
const _s = new Vector3()
const _one = new Vector3(1, 1, 1)
const _color = new Color()
const _ip = new Vector3()
/** An item icon over its crate: this big (m), this high above the crate's centre, seen from this near (m). */
const ICON_SIZE = new Vector3(2, 2, 2)
const ICON_LIFT = 2.3
const ICON_RANGE = 80
/** What each item tints its crate (ITEMS colours). */
const TINT = Object.fromEntries(Object.values(ITEMS).map((def) => [def.id, new Color(def.color)]))

const OBSTACLE_KINDS = {
  bollard: props.bollardGeometry,
  hammer: props.hammerGeometry,
  hammerFrame: props.hammerFrameGeometry,
  container: props.containerGeometry,
  boom: props.boomGeometry,
  spinbar: props.spinbarGeometry,
  hub: props.hubGeometry,
  buoy: props.buoyGeometry,
  ironball: props.ironballGeometry,
  pontoon: props.pontoonGeometry,
  post: props.postGeometry,
  lift: props.liftGeometry,
  fanHousing: props.fanHousingGeometry,
  fanBlades: props.fanBladesGeometry,
  piston: props.pistonGeometry,
  pistonBase: props.pistonBaseGeometry,
  gantry: props.gantryGeometry,
  shutter: props.shutterGeometry,
  lamp: props.lampGeometry,
  forklift: props.forkliftGeometry,
  truck: props.truckGeometry,
  shed: props.shedGeometry,
  pipe: props.pipeGeometry,
  chute: props.chuteGeometry,
  drone: props.droneGeometry,
  laser: props.laserCurtainGeometry,
  laserFrame: props.laserFrameGeometry,
  // The Grand Tour's Snowy Mountain looks (obstacle `look`).
  snowball: props.snowballGeometry,
  icicle: props.icicleGeometry,
  logHammer: props.logGeometry,
  timberFrame: props.timberFrameGeometry,
  plough: props.ploughGeometry,
}
/** Kinds drawn with per-instance colours (containers by index, the rest by `part.tint`). */
const TINTED = new Set(['container', 'lamp'])

/** Signs: a banner on every gate, a board on every section signpost, the kiosks. */
function stageSigns(stage) {
  const signs = []
  const add = (o) => signs.push(o)
  for (const cp of stage.checkpoints) {
    if (cp.index === 0) continue
    const fwd = forwardOf(cp.yaw)
    const right = rightOf(cp.yaw)
    const next = stage.sections[cp.index]?.name
    add({
      text: cp.finish ? 'FINISH' : `CHECKPOINT ${cp.index}`,
      sub: cp.finish ? (cp.name || 'SUMMIT').toUpperCase() : next?.toUpperCase(),
      center: [cp.x - fwd[0] * 0.85, cp.y + 8.9, cp.z - fwd[2] * 0.85],
      right,
      up: [0, 1, 0],
      width: Math.min(cp.width + 1, 16),
      height: 2.1,
      bg: cp.finish ? '#24282e' : PALETTE.gateOrange,
    })
    // The plaza: SAFE ZONE painted across the entry, the pit garage's fascia sign.
    const L = cp.length
    const P = (along, out, y) => [cp.x + fwd[0] * along + right[0] * (out - cp.width / 2), cp.y + y, cp.z + fwd[2] * along + right[2] * (out - cp.width / 2)]
    add({ text: 'SAFE ZONE', center: P(4.8, cp.width / 2, 0.035), right, up: fwd, width: 14, height: 3.5, bg: 'rgba(0,0,0,0)', fg: '#7cf25a' })
    if (!cp.finish) {
      const front = PIT.back + PIT.depth + 2.62
      add({ text: 'PIT GARAGE', sub: 'CAR SPIN · DRIVE IN', center: P(L * 0.5, front, PIT.height + 0.5), right: fwd, up: [0, 1, 0], width: 7.2, height: 1.8, bg: PALETTE.gateOrange })
    }
  }
  // The finish plaza's exit portal board (its arch: buildTrack.js), facing the plaza.
  const exit = stage.exitPortal
  if (exit) {
    const n = exit.normal
    add({ text: `${chapterTitle(exit.to)} »`, sub: 'DRIVE IN', center: [exit.x + n[0] * 0.01, exit.y + EXIT_SIGN.y, exit.z + n[2] * 0.01], right: exit.across, up: [0, 1, 0], width: EXIT_SIGN.width, height: EXIT_SIGN.height, bg: stageInfo(exit.to)?.color || PALETTE.gateOrange })
  }
  for (const s of stage.signs) {
    const fwd = forwardOf(s.yaw)
    const right = rightOf(s.yaw)
    add({
      text: s.text.toUpperCase(),
      center: [s.x - right[0] * 2.4 - fwd[0] * 0.14, s.y + 5.2, s.z - right[2] * 2.4 - fwd[2] * 0.14],
      right,
      up: [0, 1, 0],
      width: 5.2,
      height: 1.3,
      bg: PALETTE.gateOrange,
    })
  }
  return signs
}

function instanced(geometry, capacity, material) {
  const mesh = new InstancedMesh(geometry, material, Math.max(1, capacity))
  mesh.count = 0
  mesh.frustumCulled = false
  return mesh
}

export default function Stage({ stage }) {
  const scene = useThree((s) => s.scene)
  const maxTexture = useQuality((s) => s.settings.maxTexture)
  const realtimeShadows = useQuality((s) => s.settings.shadows === 'realtime')
  const cull = useRef({ section: -99, frame: 0 })

  // Everything visual, built once per stage.
  const built = useMemo(() => {
    const material = getWorldMaterial()
    // The map's road colours (its theme; a zoned map's: each section its zone's), else the Sky Docks palette.
    const info = stageInfo(stage.id)
    const { sections, glass } = buildStageGeometry(stage, info?.theme?.track, info?.zones)
    const sectionMeshes = sections.map(({ index, geometry }) => {
      const mesh = new Mesh(geometry, material)
      mesh.name = `section-${index}`
      mesh.matrixAutoUpdate = false
      mesh.updateMatrix()
      return mesh
    })
    // Glass tube panels: see-through, drawn after the opaque world, shown with their section.
    const glassMaterial = new MeshLambertMaterial({ color: '#9fdcff', transparent: true, opacity: 0.32, depthWrite: false, side: DoubleSide })
    const glassMeshes = glass.map(({ index, geometry }) => {
      const mesh = new Mesh(geometry, glassMaterial)
      mesh.name = `glass-${index}`
      mesh.matrixAutoUpdate = false
      mesh.updateMatrix()
      mesh.renderOrder = 1
      mesh.userData.section = sectionMeshes[index]
      return mesh
    })

    // Support pillars down to the water, one instanced draw.
    const pillars = new InstancedMesh(props.pillarGeometry(), material, Math.max(1, stage.supports.length))
    // Drawn: the ones near the car (cullPillars); all of them until the first cull.
    const dummy = new Object3D()
    const pillarMatrices = stage.supports.map((s, i) => {
      dummy.position.set(s.x, 0, s.z)
      dummy.scale.set(s.width, Math.max(0.1, s.top), s.width)
      dummy.updateMatrix()
      pillars.setMatrixAt(i, dummy.matrix)
      return dummy.matrix.clone()
    })
    pillars.computeBoundingSphere()

    const coins = instanced(props.coinGeometry(), stage.coins.length, material)
    const crates = instanced(props.crateGeometry(), stage.items.length, material)
    // Tinted by what each holds (an instance colour: same single draw), with its icon floating above.
    crates.setColorAt(0, TINT.jump)
    const crateIcons = createCrateIcons(stage.items.length)

    // Index ranges per section, for coins and crates (the builder emits them in order).
    const ranges = (list) => {
      const out = stage.sections.map(() => [Infinity, -1])
      list.forEach((it, i) => {
        const r = out[it.section]
        r[0] = Math.min(r[0], i)
        r[1] = Math.max(r[1], i)
      })
      return out
    }
    return { material, sectionMeshes, glassMaterial, glassMeshes, pillars, pillarMatrices, coins, crates, crateIcons, coinRanges: ranges(stage.coins), crateRanges: ranges(stage.items) }
  }, [stage])

  // Obstacles are built against a private staging world (render must not touch the
  // real physics: React may render twice and keep only one result - in development it
  // always does - and the discarded copy's bodies would haunt the track, invisible and
  // never moving). The effect below moves them into the real world and back out.
  const obstacles = useMemo(() => {
    const triggers = stage.triggers.map((t) => ({ ...t }))
    const staging = new PhysicsWorld()
    const sim = createObstacles(stage, staging)
    // Instanced meshes per obstacle part kind.
    const meshes = {}
    const counts = {}
    for (const e of sim.list) for (const p of e.parts) counts[p.kind] = (counts[p.kind] || 0) + 1
    for (const [kind, n] of Object.entries(counts)) {
      meshes[kind] = instanced(OBSTACLE_KINDS[kind](), n, built.material)
      // Create the colour buffer up front so the shader variant compiles with the rest.
      if (TINTED.has(kind)) meshes[kind].setColorAt(0, _color.set('#ffffff'))
    }
    const kinds = Object.keys(meshes)
    return { sim, bodies: staging.dynamics, meshes, kinds, meshList: kinds.map((k) => meshes[k]), counters: Object.fromEntries(kinds.map((k) => [k, 0])), triggers }
  }, [stage, built])

  // Physics: colliders, obstacle bodies and triggers in (and back out on unmount). The
  // Start gate's barrier stays shut until the map is warmed on the GPU (StageWarmup opens
  // it), and shuts again on unmount. Obstacle bodies start switched off; the section
  // window turns on the ones near you (sim.update).
  useEffect(() => {
    attachPhysics(stage, obstacles)
    defer(() => useGame.getState().setStageReady(true))
    return () => {
      startBarrier.enabled = true
      detachPhysics(obstacles)
      for (const m of Object.values(obstacles.meshes)) m.dispose()
      useGame.getState().setStageReady(false)
    }
  }, [stage, obstacles])

  // Meshes into the scene.
  useEffect(() => {
    const group = [...built.sectionMeshes, built.pillars, built.coins, built.crates, built.crateIcons.mesh, ...Object.values(obstacles.meshes)]
    for (const m of group) {
      m.receiveShadow = realtimeShadows
      scene.add(m)
    }
    for (const m of built.glassMeshes) scene.add(m)
    return () => {
      for (const m of group) scene.remove(m)
      for (const m of built.glassMeshes) scene.remove(m)
    }
  }, [scene, built, obstacles, realtimeShadows])

  // Release geometry when the stage goes away.
  useEffect(
    () => () => {
      for (const m of built.sectionMeshes) m.geometry.dispose()
      for (const m of built.glassMeshes) m.geometry.dispose()
      built.glassMaterial.dispose()
      built.pillars.dispose()
      built.coins.dispose()
      built.crates.dispose()
      built.crateIcons.dispose()
    },
    [built],
  )

  // Signs (wait for the font so the atlas isn't drawn in a fallback face).
  useEffect(() => {
    let signs = null
    let cancelled = false
    fontReady().then(() => {
      if (cancelled) return
      signs = buildSignMesh(stageSigns(stage), maxTexture)
      scene.add(signs.mesh)
    })
    return () => {
      cancelled = true
      if (signs) {
        scene.remove(signs.mesh)
        signs.dispose()
      }
    }
  }, [scene, stage, maxTexture])

  useFrame((state) => tickStage(stage, built, obstacles, cull.current, state.clock.elapsedTime, state.camera.quaternion))

  // Pearls, treasure chests and star rings on every road.
  return <Adventure stage={stage} />
}

/** One frame of the stage: culling, obstacles, coins, crates. Outside React: it mutates the meshes. */
/** Puts the stage's colliders, triggers and (switched-off) obstacle bodies into the world. */
function attachPhysics(stage, obstacles) {
  physicsWorld.addStaticBoxes(stage.boxes, 'stage')
  physicsWorld.addStaticBoxes(obstacleStaticBoxes(stage), 'stage-static')
  physicsWorld.triggers.push(...obstacles.triggers)
  for (const e of obstacles.sim.list) e.active = false
  for (const b of obstacles.bodies) {
    b.enabled = false
    physicsWorld.dynamics.push(b)
  }
}

/** Takes everything attachPhysics added back out. */
function detachPhysics(obstacles) {
  physicsWorld.removeGroup('stage')
  physicsWorld.removeGroup('stage-static')
  physicsWorld.triggers = physicsWorld.triggers.filter((t) => !obstacles.triggers.includes(t))
  for (const b of obstacles.bodies) physicsWorld.removeDynamic(b)
}

/**
 * Support pillars within the view distance (horizontally) of the car: the instance list
 * is rewritten from the precomputed matrices, so far pillars cost nothing.
 */
function cullPillars(stage, built, car, view) {
  const { pillars, pillarMatrices } = built
  const v2 = view * view
  let n = 0
  for (let i = 0; i < stage.supports.length; i += 1) {
    const s = stage.supports[i]
    const dx = s.x - car.x
    const dz = s.z - car.z
    if (dx * dx + dz * dz > v2) continue
    pillars.setMatrixAt(n, pillarMatrices[i])
    n += 1
  }
  pillars.count = n
  pillars.instanceMatrix.needsUpdate = true
}

function tickStage(stage, built, obstacles, cull, t, cameraQuat) {
  const section = runtime.race.section
  const view = getQuality().viewDistance
  const car = runtime.car.position

  // Section culling: sections further than the view distance aren't drawn. Checked
  // when your section changes and every 15 frames.
  cull.frame += 1
  if (section !== cull.section || cull.frame % 15 === 0) {
    cull.section = section
    for (const m of built.sectionMeshes) {
      const sec = stage.sections[Number(m.name.slice(8))]
      const dx = Math.max(sec.min[0] - car.x, 0, car.x - sec.max[0])
      const dy = Math.max(sec.min[1] - car.y, 0, car.y - sec.max[1])
      const dz = Math.max(sec.min[2] - car.z, 0, car.z - sec.max[2])
      m.visible = Math.hypot(dx, dy, dz) < view
    }
    for (const g of built.glassMeshes) g.visible = g.userData.section.visible
    cullPillars(stage, built, car, view)
  }

  // Moving obstacles near you.
  const lo = section - 1
  const hi = section + 2
  obstacles.sim.update(t, lo, hi, car)
  const { counters, kinds, meshList } = obstacles
  for (let k = 0; k < kinds.length; k += 1) counters[kinds[k]] = 0
  for (const e of obstacles.sim.list) {
    if (!e.active) continue
    for (const p of e.parts) {
      if (!p.visible) continue
      const mesh = obstacles.meshes[p.kind]
      const n = counters[p.kind]
      _m.compose(p.position, p.quaternion, p.scale)
      mesh.setMatrixAt(n, _m)
      if (p.kind === 'container') mesh.setColorAt(n, _color.set(PALETTE.containers[p.color || 0]))
      else if (p.tint) mesh.setColorAt(n, p.tint)
      counters[p.kind] = n + 1
    }
  }
  for (let k = 0; k < kinds.length; k += 1) {
    const mesh = meshList[k]
    mesh.count = counters[kinds[k]]
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }

  // Sound cues from obstacles near you (piston punches, bridges lifting, doors, forklifts, hammers).
  for (let i = 0; i < obstacles.sim.list.length; i += 1) {
    const e = obstacles.sim.list[i]
    if (!e.cue) continue
    const cue = e.cue
    e.cue = null
    const dx = e.o.x - car.x
    const dz = e.o.z - car.z
    if (dx * dx + dz * dz > 45 * 45) continue
    if (cue === 'piston') sfx.piston()
    else if (cue === 'bridge') sfx.bridge()
    else if (cue === 'door') sfx.shutter()
    else if (cue === 'beep' && dx * dx + dz * dz < 30 * 30) sfx.forklift()
    else if (cue === 'hammer' && dx * dx + dz * dz < 32 * 32) sfx.hammer()
  }

  // Coins: spin, and pick up the ones you drive through.
  const now = performance.now()
  const magnet = runtime.car.magnet > 0
  const pickR = magnet ? MAGNET_RADIUS : COIN_RADIUS
  let nCoins = 0
  for (let sec = Math.max(0, lo); sec <= Math.min(stage.sections.length - 1, hi); sec += 1) {
    const [from, to] = built.coinRanges[sec]
    for (let i = from; i <= to; i += 1) {
      const coin = stage.coins[i]
      if (pickups.coins.has(coin.id)) continue
      const dx = coin.x - car.x
      const dy = coin.y - car.y
      const dz = coin.z - car.z
      if (dx * dx + dy * dy + dz * dz < pickR * pickR) {
        pickups.coins.add(coin.id)
        actions.coin(coin.id)
        sfx.coin()
        burst({ x: coin.x, y: coin.y, z: coin.z, count: 8, palette: 'gold', speed: 4 })
        continue
      }
      _p.set(coin.x, coin.y + Math.sin(t * 2.4 + i) * 0.15, coin.z)
      _q.setFromAxisAngle(UP, t * 2.2 + i * 0.7)
      _m.compose(_p, _q, _one)
      built.coins.setMatrixAt(nCoins, _m)
      nCoins += 1
    }
  }
  built.coins.count = nCoins
  built.coins.instanceMatrix.needsUpdate = true

  // Item crates: each holds its own item (the three of a row differ), shown by its tint and icon.
  // Drive through one and you get THAT item: the nearest crate of its row; the row's other
  // crates go with it (one choice per row). They all come back after a while.
  let nCrates = 0
  let nIcons = 0
  const crates = built.crates
  const iconCells = built.crateIcons.cells
  const iconMesh = built.crateIcons.mesh
  const items = stage.items
  for (let sec = Math.max(0, lo); sec <= Math.min(stage.sections.length - 1, hi); sec += 1) {
    const [from, to] = built.crateRanges[sec]
    for (let i = from; i <= to; i += 1) {
      const crate = items[i]
      const back = pickups.crates.get(crate.id)
      if (back && back > now) continue
      const dx = crate.x - car.x
      const dy = crate.y - car.y
      const dz = crate.z - car.z
      const d2 = dx * dx + dy * dy + dz * dz
      if (d2 < CRATE_RADIUS * CRATE_RADIUS && isNearestOfRow(items, i, from, to, car, d2)) {
        takeRow(items, i, from, to, now, crate.item)
        continue
      }
      // Mystery cube: floats, spins on its point and wobbles a little, breathing.
      const bob = Math.sin(t * 2 + i) * 0.18
      _p.set(crate.x, crate.y + bob, crate.z)
      _q.setFromAxisAngle(UP, t * 1.9 + i)
      _q2.setFromAxisAngle(WOBBLE, Math.sin(t * 1.3 + i) * 0.16)
      _q.premultiply(_q2)
      _s.setScalar(0.92 + Math.sin(t * 3 + i) * 0.06)
      _m.compose(_p, _q, _s)
      crates.setMatrixAt(nCrates, _m)
      crates.setColorAt(nCrates, TINT[crate.item] || TINT.jump)
      nCrates += 1
      // Its icon, floating above and facing the camera (only the near ones).
      if (d2 < ICON_RANGE * ICON_RANGE) {
        _ip.set(crate.x, crate.y + bob + ICON_LIFT, crate.z)
        _m.compose(_ip, cameraQuat, ICON_SIZE)
        iconMesh.setMatrixAt(nIcons, _m)
        iconCells.array[nIcons] = ICON_CELL[crate.item] ?? 0
        nIcons += 1
      }
    }
  }
  crates.count = nCrates
  crates.instanceMatrix.needsUpdate = true
  if (crates.instanceColor) crates.instanceColor.needsUpdate = true
  iconMesh.count = nIcons
  iconMesh.instanceMatrix.needsUpdate = true
  iconCells.needsUpdate = true
}

/** Is crate i the one of its row (same row, within [from, to]) closest to the car? */
function isNearestOfRow(items, i, from, to, car, d2) {
  const row = items[i].row
  for (let j = Math.max(from, i - 2); j <= Math.min(to, i + 2); j += 1) {
    if (j === i || items[j].row !== row) continue
    const m = items[j]
    const dx = m.x - car.x
    const dy = m.y - car.y
    const dz = m.z - car.z
    if (dx * dx + dy * dy + dz * dz < d2) return false
  }
  return true
}

/** Takes crate i's item and spends its whole row (they all respawn together). */
function takeRow(items, i, from, to, now, item) {
  const row = items[i].row
  for (let j = Math.max(from, i - 2); j <= Math.min(to, i + 2); j += 1) {
    const m = items[j]
    if (m.row !== row) continue
    pickups.crates.set(m.id, now + CRATE_RESPAWN_MS)
    burst({ x: m.x, y: m.y, z: m.z, count: j === i ? 14 : 6, palette: 'item', speed: j === i ? 6 : 4 })
  }
  defer(() => giveItem(item))
}

/** Puts a crate's item in the first free unlocked slot ("ALL FULL" toast otherwise). */
function giveItem(item) {
  const def = ITEMS[item]
  if (!def) return
  const game = getGame()
  const slots = game.profile.slots || 1
  const items = [...game.items]
  const free = items.findIndex((it, i) => i < slots && !it)
  if (free < 0) {
    sfx.error()
    game.showToast('Item slots full - use one!', 'info')
    return
  }
  items[free] = item
  game.setItems(items)
  sfx.item()
  game.showToast(def.name.toUpperCase() + '!', 'info', def.blurb)
}
