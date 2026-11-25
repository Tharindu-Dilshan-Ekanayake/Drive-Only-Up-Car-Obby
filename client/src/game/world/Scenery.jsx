import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { Color, InstancedMesh, Object3D } from 'three'

import { footprintDistance, stageFootprints } from '@shared/track'

import { useQuality } from '../../store/quality'
import { PALETTE } from '../palette'
import { MeshBuilder } from '../render/meshBuilder'
import { HARBOUR_ZONES } from './harbourGeometry'
import { trackCityLayout } from './cityGeometry'
import { getWorldMaterial, PATTERN } from '../render/worldMaterial'

/**
 * The harbour around the course: gantry cranes standing in the water, container ships
 * and buoys (the towers along the track are TrackCity). Each kind is one instanced
 * draw; how many depends on the preset's `sceneryDensity`. Placement is seeded, so
 * everyone sees the same harbour, and kept clear of the road.
 */

const col = (hex) => new Color(hex)

function rng(seed) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

/** Ship-to-shore crane: legs, a long boom, a machinery house. ~unit height 1 = 40 m. */
function craneGeometry() {
  const mb = new MeshBuilder()
  const red = col('#e2453b')
  const white = col('#f4f7fb')
  const leg = (x, z) => mb.box([x, 0.5, z], [0.025, 0.5, 0.025], [1, 0, 0], [0, 1, 0], [0, 0, 1], { side: red, top: red, end: red }, { side: PATTERN.HAZARD, end: PATTERN.HAZARD }, { along: [0, 30, 0] })
  leg(-0.3, -0.2)
  leg(0.3, -0.2)
  leg(-0.3, 0.2)
  leg(0.3, 0.2)
  mb.aabb([-0.34, 0.62, -0.24], [0.34, 0.68, 0.24], red)
  mb.aabb([-0.34, 0.98, -0.24], [0.34, 1.02, 0.24], red)
  // Boom out over the water, and a backstay.
  mb.aabb([-0.05, 1.02, -1.3], [0.05, 1.08, 0.6], white)
  mb.aabb([-0.15, 1.02, 0.25], [0.15, 1.16, 0.55], col('#2b3038'))
  mb.box([0, 1.25, -0.4], [0.015, 0.015, 0.95], [1, 0, 0], [0, 0.97, -0.24], [0, 0.24, 0.97], { side: white, top: white, end: white })
  mb.aabb([-0.04, 1.08, -0.05], [0.04, 1.45, 0.05], red)
  // Cabin under the boom.
  mb.aabb([-0.07, 0.9, -0.62], [0.07, 1.0, -0.5], col('#9fe3ff'), { side: PATTERN.GLOW })
  return mb.build()
}

/** Container ship: hull, bridge, rows of containers. Unit = 10 m. */
function shipGeometry() {
  const mb = new MeshBuilder()
  const hull = col('#1f3570')
  const deck = col('#e2453b')
  mb.aabb([-1.3, -0.4, -9], [1.3, 1.2, 8], { top: deck, side: hull, end: hull, bottom: hull })
  mb.box([0, 0.4, -9.8], [1.0, 0.8, 0.9], [1, 0, 0], [0, 1, 0], [0, 0, 1], { side: hull, top: deck, end: hull })
  mb.aabb([-1.1, 1.2, 5.5], [1.1, 4.2, 7.6], col('#f4f7fb'), { side: PATTERN.WINDOWS, end: PATTERN.WINDOWS })
  let k = 0
  for (let z = -8; z < 5; z += 1.3) {
    for (let x = -1; x <= 0.6; x += 0.8) {
      const h = 1 + ((k * 7) % 3)
      const c = col(PALETTE.containers[k % PALETTE.containers.length])
      mb.aabb([x, 1.2, z], [x + 0.75, 1.2 + h * 0.26, z + 1.2], c)
      k += 1
    }
  }
  return mb.build()
}

/** Channel buoy: a float and a light. */
function buoyGeometry() {
  const mb = new MeshBuilder()
  mb.prism(0, 0, -0.4, 0.7, 0.9, 8, col('#ff4a3d'), col('#ff4a3d'))
  mb.prism(0, 0, 0.7, 2.6, 0.18, 6, col('#2b3038'))
  mb.aabb([-0.3, 2.6, -0.3], [0.3, 3.1, 0.3], col('#fff1a8'), { side: PATTERN.GLOW, top: PATTERN.GLOW, end: PATTERN.GLOW })
  return mb.build()
}

/** Seeded positions round `stage`'s track, at least `clear` metres (xz) from any road (and from the plazas' and round platforms' edges). */
function placeAround(stage, footprints, rand, count, minOff, maxOff, clear, city = []) {
  const path = stage.path
  const out = []
  let guard = 0
  while (out.length < count && guard < count * 30) {
    guard += 1
    const p = path[Math.floor(rand() * path.length)]
    const side = rand() < 0.5 ? -1 : 1
    const off = minOff + rand() * (maxOff - minOff)
    // Perpendicular to the road there.
    const len = Math.hypot(p.fx, p.fz) || 1
    const x = p.x + (-p.fz / len) * off * side + (rand() - 0.5) * 30
    const z = p.z + (p.fx / len) * off * side + (rand() - 0.5) * 30
    // Off the lobby pier too.
    if (Math.abs(x) < 60 && Math.abs(z) < 60) continue
    // ...and out of the harbour town.
    // ...and clear of the track's towers (TrackCity).
    if (city.some((b) => Math.hypot(b.x - x, b.z - z) < b.r + 22)) continue
    if (HARBOUR_ZONES.some(([x0, z0, x1, z1]) => x > x0 - 25 && x < x1 + 25 && z > z0 - 25 && z < z1 + 25)) continue
    let ok = footprints.every((fp) => footprintDistance(fp, x, z) >= clear * 0.6)
    for (let i = 0; ok && i < path.length; i += 3) {
      const q = path[i]
      if ((q.x - x) ** 2 + (q.z - z) ** 2 < clear * clear) {
        ok = false
        break
      }
    }
    if (ok) out.push({ x, z, y: p.y, rot: rand() * Math.PI * 2, r: rand() })
  }
  return out
}

function instancedOf(geometry, items, place) {
  const mesh = new InstancedMesh(geometry, getWorldMaterial(), Math.max(1, items.length))
  const dummy = new Object3D()
  items.forEach((it, i) => {
    place(dummy, it)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
  })
  mesh.count = items.length
  mesh.computeBoundingSphere()
  return mesh
}

export default function Scenery({ stage }) {
  const scene = useThree((s) => s.scene)
  const density = useQuality((s) => s.settings.sceneryDensity)

  const meshes = useMemo(() => {
    const rand = rng(1123)
    const n = (base) => Math.max(1, Math.round(base * density))
    const city = trackCityLayout(stage, density)
    const footprints = stageFootprints(stage)
    const cranes = placeAround(stage, footprints, rand, n(22), 45, 140, 30, city)
    const ships = placeAround(stage, footprints, rand, n(7), 140, 320, 70, city)
    const buoys = placeAround(stage, footprints, rand, n(30), 20, 90, 14, city)
    return [
      instancedOf(craneGeometry(), cranes, (d, it) => {
        const h = 32 + it.r * 30
        d.position.set(it.x, 0, it.z)
        d.rotation.set(0, it.rot, 0)
        d.scale.set(h, h, h)
      }),
      instancedOf(shipGeometry(), ships, (d, it) => {
        d.position.set(it.x, 0, it.z)
        d.rotation.set(0, it.rot, 0)
        d.scale.setScalar(9 + it.r * 4)
      }),
      instancedOf(buoyGeometry(), buoys, (d, it) => {
        d.position.set(it.x, 0, it.z)
        d.rotation.set(0, it.rot, 0)
        d.scale.setScalar(1)
      }),
    ]
  }, [stage, density])

  useEffect(() => {
    for (const m of meshes) scene.add(m)
    return () => {
      for (const m of meshes) {
        scene.remove(m)
        m.geometry.dispose()
        m.dispose()
      }
    }
  }, [scene, meshes])

  return null
}
