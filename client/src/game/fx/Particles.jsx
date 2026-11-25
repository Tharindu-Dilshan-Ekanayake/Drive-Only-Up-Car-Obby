import { useFrame } from '@react-three/fiber'
import { useEffect } from 'react'
import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from 'three'

import { useQuality } from '../../store/quality'
import { PALETTE } from '../palette'
import { runtime } from '../runtime'
import { drainBursts } from './fxQueue'

/**
 * One fixed pool of little cubes for every burst (confetti, coin sparkle, splashes,
 * drift smoke): one draw call, no allocation after start-up. Off on presets without
 * particles (bursts are just drained).
 */

const POOL = 220
const PALETTES = {
  confetti: [PALETTE.uiYellow, PALETTE.uiTeal, PALETTE.uiOrange, PALETTE.uiGreen, '#ff3d7f', '#ffffff'],
  gold: [PALETTE.coin, '#fff3a8', PALETTE.coinEdge],
  item: [PALETTE.item, '#ffffff', PALETTE.uiTeal],
  splash: ['#eafcff', '#bdefff', '#7fd8ec'],
  smoke: ['#e8ecf0', '#d4dae0', '#c2c9d0'],
  spark: ['#fff1a8', '#ffc41f', '#ff7a1a'],
  // Missile flames and the embers / soot of a burning car (game/fx/missiles.js).
  flame: ['#fff1a8', '#ffb020', '#ff5a1a', '#ff3b1a'],
  soot: ['#4a4f57', '#2b2f36', '#6b7280'],
}
const GRAVITY = { confetti: 9, gold: 6, item: 4, splash: 18, smoke: -1.5, spark: 14, flame: -6, soot: -3 }

const _m = new Matrix4()
const _q = new Quaternion()
const _s = new Vector3()
const _c = new Color()
const _axis = new Vector3(1, 1, 0).normalize()

/** The one particle system (module-level: a single pool, mutated every frame). */
let system = null

function createSystem() {
  const geometry = new BoxGeometry(1, 1, 1)
  const material = new MeshBasicMaterial({ color: '#ffffff' })
  const mesh = new InstancedMesh(geometry, material, POOL)
  mesh.count = 0
  mesh.frustumCulled = false
  mesh.setColorAt(0, _c.set('#ffffff'))
  const pieces = Array.from({ length: POOL }, () => ({
    life: 0,
    max: 1,
    pos: new Vector3(),
    vel: new Vector3(),
    size: 0.2,
    spin: 0,
    gravity: 9,
    grow: 0,
    color: new Color(),
  }))
  let next = 0

  function spawn(x, y, z, palette, speed, smoke) {
    const p = pieces[next]
    next = (next + 1) % POOL
    const colors = PALETTES[palette] || PALETTES.confetti
    p.color.set(colors[Math.floor(Math.random() * colors.length)])
    p.pos.set(x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 0.6)
    const a = Math.random() * Math.PI * 2
    const up = palette === 'splash' ? 0.9 + Math.random() : 0.3 + Math.random() * 0.9
    p.vel.set(Math.cos(a) * speed * (0.3 + Math.random() * 0.7), up * speed, Math.sin(a) * speed * (0.3 + Math.random() * 0.7))
    p.gravity = GRAVITY[palette] ?? 9
    p.max = smoke ? 0.9 : 0.8 + Math.random() * 0.7
    p.life = p.max
    p.size = smoke ? 0.55 : palette === 'splash' ? 0.32 : 0.2
    p.grow = smoke ? 2 : 0
    p.spin = Math.random() * 4
  }

  function update(rawDt, enabled) {
    const dt = Math.min(rawDt, 0.05)
    // Drift smoke straight from the car, while sliding.
    const car = runtime.car
    if (enabled && car.drifting && car.grounded && Math.random() < 0.6) {
      spawn(car.position.x, car.position.y - 0.3, car.position.z, 'smoke', 1.5, 1)
    }
    drainBursts((b) => {
      if (!enabled) return
      for (let i = 0; i < (b.count || 12); i += 1) spawn(b.x, b.y, b.z, b.palette || 'confetti', b.speed || 6, 0)
    })
    if (!enabled) {
      mesh.count = 0
      return
    }
    let n = 0
    for (let i = 0; i < POOL; i += 1) {
      const p = pieces[i]
      if (p.life <= 0) continue
      p.life -= dt
      p.vel.y -= p.gravity * dt
      p.vel.multiplyScalar(1 - dt * 0.8)
      p.pos.addScaledVector(p.vel, dt)
      const t = p.life / p.max
      _s.setScalar(p.size * (p.grow ? 1 + (1 - t) * p.grow : Math.min(1, t * 3)))
      _q.setFromAxisAngle(_axis, p.spin * (1 - t) * 6)
      _m.compose(p.pos, _q, _s)
      mesh.setMatrixAt(n, _m)
      mesh.setColorAt(n, p.color)
      n += 1
    }
    mesh.count = n
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }

  // Disposing frees the GPU copies; three re-uploads them if the canvas comes back.
  const dispose = () => {
    geometry.dispose()
    material.dispose()
  }
  return { mesh, update, dispose }
}

export default function Particles() {
  const enabled = useQuality((s) => s.settings.particles)
  system ||= createSystem()
  useEffect(() => () => system.dispose(), [])
  useFrame((_, dt) => system.update(dt, enabled))
  return <primitive object={system.mesh} />
}
