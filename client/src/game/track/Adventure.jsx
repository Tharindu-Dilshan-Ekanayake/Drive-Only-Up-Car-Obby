import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three'

import { progressOf } from '@shared/logic'

import { sfx } from '../../audio/sfx'
import { actions } from '../../net/actions'
import { getGame } from '../../store/game'
import { defer } from '../defer'
import { burst } from '../fx/fxQueue'
import { MeshBuilder } from '../render/meshBuilder'
import { getWorldMaterial, PATTERN } from '../render/worldMaterial'
import { runtime } from '../runtime'
import { pickups } from './pickups'

/**
 * Adventure on every road (placement: shared/adventure.js):
 * - Sky Pearls: a glowing pearl in an open shell under a tall light beam, bobbing and
 *   turning. Drive (or fly) through it; the server makes it permanent.
 * - Treasure chests: drive into one and it bursts open (coins, once per run).
 * - Star rings: fly through every ring of a set in one jump for a RING RUN bonus.
 * Six instanced draws for the whole stage, transforms updated only for what's near.
 * Module-level state: the frame loop owns it.
 */

/** Pick-up distance from the car's centre: airborne pearls need you airborne. */
const PEARL_RADIUS = 1.8
const CHEST_RADIUS = 3.2
/** A ring set must be finished within this long of its first ring, s. */
const RING_WINDOW = 4
const RING_POINTS = 450

const C = {
  shellOut: new Color('#f7d6e6'),
  shellIn: new Color('#ffe9f3'),
  rim: new Color('#e9a9c4'),
  wood: new Color('#9a6a3c'),
  woodDark: new Color('#6e4724'),
  gold: new Color('#ffc41f'),
  goldDark: new Color('#d99a12'),
  ring: new Color('#ffd84a'),
  ringDone: new Color('#5fe3ff'),
  halo: new Color('#ff9fd2'),
  coins: new Color('#ffe27a'),
}
const all = (c) => ({ top: c, side: c, end: c, bottom: c })

/** An open clam shell, hinge at the back, opening upwards. */
function shellGeometry() {
  const mb = new MeshBuilder()
  const n = 7
  const fan = (y, tilt, color, flip) => {
    for (let i = 0; i < n; i += 1) {
      const a0 = Math.PI * (0.08 + (0.84 * i) / n)
      const a1 = Math.PI * (0.08 + (0.84 * (i + 1)) / n)
      const p = (a, r) => [Math.cos(a) * r, y + Math.sin(a) * r * tilt, -Math.sin(a) * r * (1 - tilt) + 0.6]
      const c = [0, y, 0.6]
      const ridge = i % 2 ? color : C.rim
      if (flip) mb.tri(c, p(a0, 1.25), p(a1, 1.25), ridge)
      else mb.tri(c, p(a1, 1.25), p(a0, 1.25), ridge)
      if (flip) mb.tri(c, p(a1, 1.25), p(a0, 1.25), color)
      else mb.tri(c, p(a0, 1.25), p(a1, 1.25), color)
    }
  }
  fan(0, 0, C.shellOut, false) // lower half, flat
  fan(0.05, 0.85, C.shellIn, true) // upper half, raised
  // A little pedestal.
  mb.prism(0, 0.3, -0.5, 0, 0.5, 8, C.rim, C.shellOut)
  return mb.build()
}

/** A treasure chest body (wood with gold bands). Lid is separate. Front faces -Z. */
function chestGeometry() {
  const mb = new MeshBuilder()
  mb.aabb([-0.9, 0, -0.6], [0.9, 0.85, 0.6], { top: C.woodDark, side: C.wood, end: C.wood, bottom: C.woodDark }, { side: PATTERN.PLANKS, end: PATTERN.PLANKS })
  for (const x of [-0.62, 0.62]) mb.aabb([x - 0.08, -0.01, -0.62], [x + 0.08, 0.87, 0.62], all(C.gold))
  mb.aabb([-0.18, 0.45, -0.64], [0.18, 0.75, -0.6], all(C.goldDark))
  // Coins heaped inside (seen when the lid is open).
  mb.aabb([-0.78, 0.6, -0.48], [0.78, 0.86, 0.48], C.coins, all(PATTERN.GLOW))
  return mb.build()
}

/** The lid, hinged at its back edge at the origin, closed position extends to -Z. */
function lidGeometry() {
  const mb = new MeshBuilder()
  mb.box([0, 0.2, -0.6], [0.92, 0.2, 0.62], [1, 0, 0], [0, 1, 0], [0, 0, 1], { top: C.wood, side: C.wood, end: C.wood, bottom: C.woodDark }, { top: PATTERN.PLANKS })
  for (const x of [-0.62, 0.62]) mb.box([x, 0.21, -0.6], [0.09, 0.215, 0.64], [1, 0, 0], [0, 1, 0], [0, 0, 1], all(C.gold))
  return mb.build()
}

/** A star ring: a glowing torus facing along Z, unit radius (scaled per instance). */
function ringGeometry() {
  const mb = new MeshBuilder()
  const seg = 20
  const tube = 0.09
  const sides = 5
  for (let i = 0; i < seg; i += 1) {
    const a0 = (i / seg) * Math.PI * 2
    const a1 = ((i + 1) / seg) * Math.PI * 2
    for (let j = 0; j < sides; j += 1) {
      const b0 = (j / sides) * Math.PI * 2
      const b1 = ((j + 1) / sides) * Math.PI * 2
      const p = (a, b) => [Math.cos(a) * (1 + Math.cos(b) * tube), Math.sin(a) * (1 + Math.cos(b) * tube), Math.sin(b) * tube]
      mb.quad(p(a0, b0), p(a1, b0), p(a1, b1), p(a0, b1), '#ffffff', PATTERN.PULSE)
    }
  }
  return mb.build()
}

/** The runtime state of every adventure thing on the stage. */
const adv = {
  stage: null,
  meshes: null,
  pending: new Set(),
  chestsOpen: new Map(), // chest index -> open amount 0..1 (animating)
  run: -1,
  ringPassed: [], // per ring: time passed (s) or -1
  setStart: new Map(), // set id -> first pass time
  setRings: new Map(), // set id -> ring indices
  prev: new Vector3(),
  hasPrev: false,
}

const _o = new Object3D()
const _q = new Quaternion()
const _v = new Vector3()
const _n = new Vector3()
const _up = new Vector3(0, 1, 0)

function build(stage) {
  const material = getWorldMaterial()
  const glow = new MeshBasicMaterial({ color: '#ffd9ef', fog: true })
  const beamMat = new MeshBasicMaterial({ color: '#ffd1ec', transparent: true, opacity: 0.22, blending: AdditiveBlending, depthWrite: false, fog: true })
  const np = stage.pearls.length
  const nc = stage.chests.length
  const nr = stage.rings.length
  const pearls = new InstancedMesh(new IcosahedronGeometry(0.62, 1), glow, np)
  const shells = new InstancedMesh(shellGeometry(), material, np)
  const beamGeo = new CylinderGeometry(0.55, 1.1, 60, 8, 1, true)
  beamGeo.translate(0, 30, 0)
  const beams = new InstancedMesh(beamGeo, beamMat, np)
  const chests = new InstancedMesh(chestGeometry(), material, nc)
  const lids = new InstancedMesh(lidGeometry(), material, nc)
  const ringGeo = ringGeometry()
  const rings = new InstancedMesh(ringGeo, material, nr)
  // Pearls in the air get a spinning halo instead of a shell.
  const halos = new InstancedMesh(ringGeo, material, np)
  halos.instanceColor = new InstancedBufferAttribute(new Float32Array(np * 3), 3)
  for (let i = 0; i < np; i += 1) halos.setColorAt(i, C.halo)
  rings.instanceColor = new InstancedBufferAttribute(new Float32Array(nr * 3), 3)
  for (let i = 0; i < nr; i += 1) rings.setColorAt(i, C.ring)
  // Static placements: rings (chests are posed by poseChests).
  stage.rings.forEach((r, i) => {
    _o.position.set(r.x, r.y, r.z)
    _o.rotation.set(0, r.yaw, 0)
    _o.scale.setScalar(r.r)
    _o.updateMatrix()
    rings.setMatrixAt(i, _o.matrix)
    if (!adv.setRings.has(r.set)) adv.setRings.set(r.set, [])
    adv.setRings.get(r.set).push(i)
  })
  for (const m of [pearls, shells, beams, chests, lids, rings, halos]) {
    m.frustumCulled = false
    m.matrixAutoUpdate = false
  }
  adv.ringPassed = new Array(nr).fill(-1)
  return { pearls, shells, beams, chests, lids, rings, halos, glow, beamMat }
}

/** Chest facing: its front looks across the road (from whichever side it's on). */
function chestYaw(c) {
  return c.yaw + (c.face > 0 ? Math.PI / 2 : -Math.PI / 2)
}

function poseChests(stage, meshes) {
  stage.chests.forEach((c, i) => {
    const open = adv.chestsOpen.get(i) || 0
    _o.position.set(c.x, c.y, c.z)
    _o.rotation.set(0, chestYaw(c), 0)
    _o.scale.setScalar(1)
    _o.updateMatrix()
    meshes.chests.setMatrixAt(i, _o.matrix)
    // Lid hinged at the back top edge.
    _q.setFromAxisAngle(_up, chestYaw(c))
    _v.set(0, 0.85, 0.6).applyQuaternion(_q)
    _o.position.set(c.x + _v.x, c.y + _v.y, c.z + _v.z)
    _o.rotation.set(open * 1.9, chestYaw(c), 0, 'YXZ')
    _o.updateMatrix()
    meshes.lids.setMatrixAt(i, _o.matrix)
  })
  meshes.chests.instanceMatrix.needsUpdate = true
  meshes.lids.instanceMatrix.needsUpdate = true
}

/** Runs every frame: animation, pickups, ring passes. */
function tick(t, dt) {
  const stage = adv.stage
  const meshes = adv.meshes
  if (!stage || !meshes) return
  const car = runtime.car.position
  const game = getGame()
  // Pearls found on this map (profile.maps[stage.id]).
  const found = progressOf(game.profile, stage.id).pearls

  // A new run: chests close again.
  if (adv.run !== pickups.run) {
    adv.run = pickups.run
    adv.chestsOpen.clear()
    poseChests(stage, meshes)
  }

  // Pearls: bob and turn; hidden once found.
  stage.pearls.forEach((p, i) => {
    const have = (found >> p.index) & 1
    const hide = have || adv.pending.has(p.index)
    const s = hide ? 0 : 1
    _o.position.set(p.x, p.y + Math.sin(t * 2 + i) * 0.18, p.z)
    _o.rotation.set(0, t * 1.2 + i, 0)
    _o.scale.setScalar(s)
    _o.updateMatrix()
    meshes.pearls.setMatrixAt(i, _o.matrix)
    const grounded = p.how === 'edge'
    _o.position.set(p.x, p.y - 0.95, p.z)
    _o.rotation.set(0, p.yaw + Math.PI, 0)
    _o.scale.setScalar(hide || !grounded ? 0 : 1)
    _o.updateMatrix()
    meshes.shells.setMatrixAt(i, _o.matrix)
    _o.position.set(p.x, p.y + Math.sin(t * 2 + i) * 0.18, p.z)
    _o.rotation.set(0, t * 1.6 + i, 0)
    _o.scale.setScalar(hide || grounded ? 0 : 1.05)
    _o.updateMatrix()
    meshes.halos.setMatrixAt(i, _o.matrix)
    _o.position.set(p.x, p.y - 1, p.z)
    _o.rotation.set(0, 0, 0)
    _o.scale.set(s, s, s)
    _o.updateMatrix()
    meshes.beams.setMatrixAt(i, _o.matrix)
    if (!hide && car.distanceToSquared(_v.set(p.x, p.y, p.z)) < PEARL_RADIUS * PEARL_RADIUS) {
      adv.pending.add(p.index)
      actions.pearl(p.index)
      sfx.finish()
      burst({ x: p.x, y: p.y, z: p.z, count: 50, palette: 'confetti', speed: 9 })
    }
  })
  meshes.pearls.instanceMatrix.needsUpdate = true
  meshes.shells.instanceMatrix.needsUpdate = true
  meshes.beams.instanceMatrix.needsUpdate = true
  meshes.halos.instanceMatrix.needsUpdate = true
  // A pearl the server confirmed (or refused) is no longer pending.
  for (const idx of adv.pending) if ((found >> idx) & 1) adv.pending.delete(idx)

  // Chests: open on contact, lid swings up.
  let moved = false
  stage.chests.forEach((c, i) => {
    const open = adv.chestsOpen.get(i)
    if (open === undefined) {
      if (car.distanceToSquared(_v.set(c.x, c.y + 0.5, c.z)) < CHEST_RADIUS * CHEST_RADIUS) {
        adv.chestsOpen.set(i, 0.01)
        actions.chest(c.id)
        sfx.coin()
        burst({ x: c.x, y: c.y + 1.2, z: c.z, count: 36, palette: 'gold', speed: 8 })
        defer(() => getGame().showToast('TREASURE!', 'success', '+40 coins'))
        moved = true
      }
    } else if (open < 1) {
      adv.chestsOpen.set(i, Math.min(1, open + dt * 3))
      moved = true
    }
  })
  if (moved) poseChests(stage, meshes)

  // Rings: passing through = crossing the ring's plane inside its radius.
  if (adv.hasPrev) {
    let recolor = false
    stage.rings.forEach((r, i) => {
      if (adv.ringPassed[i] >= 0) return
      _n.set(-Math.sin(r.yaw), 0, -Math.cos(r.yaw))
      const d0 = _n.x * (adv.prev.x - r.x) + _n.y * (adv.prev.y - r.y) + _n.z * (adv.prev.z - r.z)
      const d1 = _n.x * (car.x - r.x) + _n.y * (car.y - r.y) + _n.z * (car.z - r.z)
      if (d0 > 0 === d1 > 0) return
      const k = d0 / (d0 - d1)
      const cx = adv.prev.x + (car.x - adv.prev.x) * k - r.x
      const cy = adv.prev.y + (car.y - adv.prev.y) * k - r.y
      const cz = adv.prev.z + (car.z - adv.prev.z) * k - r.z
      if (cx * cx + cy * cy + cz * cz > r.r * r.r) return
      adv.ringPassed[i] = t
      meshes.rings.setColorAt(i, C.ringDone)
      recolor = true
      sfx.item()
      burst({ x: r.x, y: r.y, z: r.z, count: 14, palette: 'item', speed: 5 })
      if (!adv.setStart.has(r.set)) adv.setStart.set(r.set, t)
      const set = adv.setRings.get(r.set)
      if (set.every((j) => adv.ringPassed[j] >= 0)) {
        const score = RING_POINTS * set.length
        actions.trick('rings', score)
        sfx.trick()
        defer(() => getGame().showToast('RING RUN!', 'trick', `+${score.toLocaleString()}`, `${set.length} star rings in one jump`))
      }
    })
    // Sets not finished in time reset (so you can try again).
    if (adv.setStart.size) for (const [set, start] of adv.setStart) {
      const rings = adv.setRings.get(set)
      const done = rings.every((j) => adv.ringPassed[j] >= 0)
      if (t - start > (done ? 6 : RING_WINDOW)) {
        adv.setStart.delete(set)
        for (const j of rings) {
          adv.ringPassed[j] = -1
          meshes.rings.setColorAt(j, C.ring)
        }
        recolor = true
      }
    }
    if (recolor) meshes.rings.instanceColor.needsUpdate = true
  }
  adv.prev.copy(car)
  adv.hasPrev = true
}

export default function Adventure({ stage }) {
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    adv.stage = stage
    adv.meshes = build(stage)
    const m = adv.meshes
    const list = [m.pearls, m.shells, m.beams, m.chests, m.lids, m.rings, m.halos]
    poseChests(stage, m)
    scene.add(...list)
    return () => {
      scene.remove(...list)
      for (const mesh of list) {
        if (mesh !== m.halos) mesh.geometry.dispose()
        mesh.dispose()
      }
      m.glow.dispose()
      m.beamMat.dispose()
      adv.meshes = null
      adv.stage = null
      adv.pending.clear()
      adv.setRings.clear()
      adv.setStart.clear()
      adv.hasPrev = false
    }
  }, [scene, stage])

  useFrame((state, dt) => tick(state.clock.elapsedTime, Math.min(dt, 0.1)))
  return null
}
