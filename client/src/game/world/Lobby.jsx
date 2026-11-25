import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { BufferAttribute, BufferGeometry, CanvasTexture, DoubleSide, LinearFilter, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, Quaternion, SRGBColorSpace, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { BOARDS, DECK_Y, PADS, PARKED, PORTAL, PORTALS, PROMO_BOARDS, PROPS, START_GATE } from '@shared/lobby'
import { chapterLabel, chapterTitle, unlockedByFinishing } from '@shared/chapters'
import { stageInfo } from '@shared/stages/index'

import { useGame } from '../../store/game'
import { useQuality } from '../../store/quality'
import { PALETTE } from '../palette'
import { buildBannerMesh } from '../render/banners'
import { paintBoardFrame, paintBoardRow } from '../render/boardPaint'
import { buildSignMesh, fontReady } from '../render/signs'
import { getWorldMaterial } from '../render/worldMaterial'
import { getCarModel } from '../cars/carModels'
import { getCarMaterial } from '../cars/carMaterial'
import { CarRig, wheelBatch } from '../cars/CarRig'
import { carLights } from '../fx/carLights'
import { lockedPortalKey, portalStages } from '../portals'
import { buildGarageGlass, buildPier, buildPoliceMarks, PORTAL_PAD_HALF, PORTAL_SIGN, PORTAL_SIGN_Y, SHOWROOM } from './pierGeometry'
import { acquirePortalMaterial, buildPortalGeometry, releasePortalMaterial, tickPortalFx } from './portalFx'

/**
 * Pier Zero, the lobby: always loaded (it's where you spawn), so it's kept to one merged
 * mesh (pierGeometry.js), one sign mesh, one leaderboard mesh + texture and one mesh
 * for the map portals' swirls. The harbour town around it is Harbour.jsx. Every map
 * shares it: the Start sign names the map you're on, the portals lead to the others.
 */

/**
 * The lobby's signs on map `stageId` (Start gate and portal boards follow the map; a
 * portal to a chapter still locked - `locked`: lockedPortalKey - says so).
 */
function lobbySigns(stageId, locked) {
  const kiosk = PROPS.find((p) => p.kind === 'spinKiosk')
  const garage = PROPS.find((p) => p.kind === 'garage')
  const spin = PADS.find((p) => p.id === 'spin')
  const gar = PADS.find((p) => p.id === 'garage')
  const shop = PROPS.find((p) => p.kind === 'store')
  const shopPad = PADS.find((p) => p.id === 'store')
  const signs = [
    // The Dockside Store: the big board on its roof, facing its pad (east).
    { text: shopPad.label, sub: 'DOCKSIDE · COINS · SPINS · PERKS', center: [shop.x + shop.hx - 1.28, DECK_Y + shop.h + 2.2, shop.z], right: [0, 0, -1], up: [0, 1, 0], width: 8, height: 1.9, bg: shopPad.color, fg: '#ffffff' },
    // Above the awning, on the green header over the glass.
    { text: 'OPEN', center: [shop.x + shop.hx + 0.01, DECK_Y + shop.h - 0.26, shop.z], right: [0, 0, -1], up: [0, 1, 0], width: 1.6, height: 0.42, bg: '#1f9e57', fg: '#fff3a0' },
    // Painted on the car parks, read from the boulevard.
    { text: 'PARKING', center: [-12.4, DECK_Y + 0.045, -8.5], right: [0, 0, -1], up: [-1, 0, 0], width: 6, height: 1.5, bg: 'rgba(0,0,0,0)', fg: '#f2f4f7' },
    { text: 'PARKING', center: [12.4, DECK_Y + 0.045, 3.5], right: [0, 0, 1], up: [1, 0, 0], width: 6, height: 1.5, bg: 'rgba(0,0,0,0)', fg: '#f2f4f7' },
    // Car Spin: a board on the kiosk's front, facing the spawn.
    { text: spin.label, sub: 'DRIVE IN', center: [kiosk.x, DECK_Y + 4.75, kiosk.z + 3.75], right: [1, 0, 0], up: [0, 1, 0], width: 5, height: 1.25, bg: spin.color, fg: '#ffffff' },
    // Garage: on the canopy fascia over the pad side, and over the spawn side.
    { text: gar.label, sub: 'DRIVE IN · CHOOSE YOUR CAR', center: [garage.x - garage.hx - 1.85, DECK_Y + garage.h + 1.4, garage.z], right: [0, 0, 1], up: [0, 1, 0], width: 8.4, height: 1.6, bg: gar.color, fg: '#ffffff' },
    { text: 'UP WE DRIVE GARAGE', center: [garage.x - 0.6, DECK_Y + garage.h + 1.4, garage.z + garage.hz + 1.85], right: [1, 0, 0], up: [0, 1, 0], width: 7.2, height: 1.6, bg: gar.color, fg: '#ffffff' },
    // Inside, on the back wall.
    { text: 'SHOWROOM', sub: 'RARE · EPIC · LEGENDARY', center: [garage.x + garage.hx - 0.44, DECK_Y + 4.6, garage.z + 1], right: [0, 0, 1], up: [0, 1, 0], width: 5.6, height: 1.4, bg: PALETTE.uiNavy },
    {
      text: 'START',
      sub: chapterTitle(stageId) || 'SKY DOCKS',
      center: [START_GATE.x, DECK_Y + 11.4, START_GATE.z + 1.25],
      right: [1, 0, 0],
      up: [0, 1, 0],
      width: START_GATE.width + 3.6,
      height: 2.6,
      bg: PALETTE.gateOrange,
    },
    { text: 'THE FIRST CLIMB', sub: 'PIER ZERO', center: [-24, DECK_Y + 0.66, 22 + 3.3], right: [1, 0, 0], up: [0, 1, 0], width: 3.2, height: 0.8, bg: '#e09a10' },
    // Lettering painted on the boulevard, read driving north.
    { text: 'UP WE DRIVE', center: [0, DECK_Y + 0.045, 4], right: [1, 0, 0], up: [0, 0, -1], width: 12, height: 3, bg: 'rgba(0,0,0,0)', fg: '#f2f4f7' },
    { text: 'START', center: [0, DECK_Y + 0.045, -27], right: [1, 0, 0], up: [0, 0, -1], width: 10, height: 2.5, bg: 'rgba(0,0,0,0)', fg: '#ffc41f' },
  ]
  // The map portal's board, over its arch, facing the lobby (south).
  const to = portalStages(stageId)
  for (const p of PORTALS) {
    const info = to[p.slot]
    if (!info) continue
    const at = { center: [p.x, PORTAL_SIGN_Y, p.z + 0.01], right: [1, 0, 0], up: [0, 1, 0], width: PORTAL_SIGN.width, height: PORTAL_SIGN.height, fg: '#ffffff' }
    // The apron's name, painted on the pad (read driving north, like START).
    signs.push({ text: info.short, center: [p.x, DECK_Y + 0.09, p.z + (PORTAL.apron.from + PORTAL.apron.to) / 2], right: [1, 0, 0], up: [0, 0, -1], width: 6.6, height: 1.65, bg: 'rgba(0,0,0,0)', fg: lockedIds(locked).includes(info.id) ? '#c3cad6' : '#ffffff' })
    const chapter = chapterLabel(info.id)
    if (lockedIds(locked).includes(info.id)) {
      signs.push({ ...at, text: `${info.short} · LOCKED`, sub: `${chapter} · FINISH ${stageInfo(unlockedByFinishing(info.id))?.short || 'THE LAST MAP'}`, bg: '#565d6b' })
    } else {
      signs.push({ ...at, text: info.short, sub: chapter ? `${chapter} · PORTAL · DRIVE IN` : 'PORTAL · DRIVE IN', bg: info.color })
    }
  }
  return signs
}

const lockedIds = (key) => (key ? key.split(',') : [])

/**
 * The swirl planes and pads for map `stageId`'s portals (colours of the maps they lead
 * to; a locked one in the locked look): one geometry, one draw call (portalFx.js).
 */
function lobbyPortalGeometry(stageId, locked) {
  const to = portalStages(stageId)
  const ids = lockedIds(locked)
  const list = PORTALS.map((p) => ({ x: p.x, y: DECK_Y, z: p.z, normal: [0, 0, 1], across: [-1, 0, 0], info: to[p.slot], locked: Boolean(to[p.slot] && ids.includes(to[p.slot].id)) }))
  return buildPortalGeometry(list, { w: PORTAL.w, d: PORTAL.d, height: PORTAL.height, padHalf: PORTAL_PAD_HALF, apron: PORTAL.apron })
}

const BOARD_TITLES = { altitude: 'HIGHEST CLIMB', coins: 'MOST COINS', finishes: 'SUMMIT FINISHES' }
const BOARD_UNITS = { altitude: 'm', coins: '', finishes: '' }

/** The three leaderboards, drawn into one canvas texture across three quads. */
function useBoards(scene, maxTexture) {
  const boards = useGame((s) => s.leaderboards)
  const res = useMemo(() => {
    const w = Math.min(1024, maxTexture)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = w / 2
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    texture.minFilter = LinearFilter
    texture.generateMipmaps = false
    const material = new MeshBasicMaterial({ map: texture })
    // All three boards in one geometry (one draw call); each shows a third of the canvas.
    const pos = []
    const uvs = []
    BOARDS.forEach((b, i) => {
      const x0 = b.x + 6.7
      const x1 = b.x - 6.7
      const y0 = DECK_Y + 3.8
      const y1 = DECK_Y + 12.4
      const z = b.z + 0.25
      // Facing -z (north, towards the spawn): left edge is +x.
      pos.push(x0, y0, z, x1, y0, z, x1, y1, z, x0, y0, z, x1, y1, z, x0, y1, z)
      const u0 = i / 3
      const u1 = (i + 1) / 3
      uvs.push(u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1)
    })
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
    geo.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
    geo.computeBoundingSphere()
    const meshes = [new Mesh(geo, material)]
    return { canvas, texture, material, meshes }
  }, [maxTexture])

  useEffect(() => {
    for (const m of res.meshes) scene.add(m)
    return () => {
      for (const m of res.meshes) {
        scene.remove(m)
        m.geometry.dispose()
      }
      res.material.dispose()
      res.texture.dispose()
    }
  }, [scene, res])

  useEffect(() => {
    let cancelled = false
    fontReady().then(() => {
      if (cancelled) return
      const { canvas } = res
      const ctx = canvas.getContext('2d')
      const W = canvas.width / 3
      const H = canvas.height
      const s = W / 341
      ctx.clearRect(0, 0, canvas.width, H)
      BOARDS.forEach((b, i) => {
        const x0 = i * W
        const top = paintBoardFrame(ctx, x0, 0, W, H, BOARD_TITLES[b.id], 'TOP 10 · ALL PLAYERS', s)
        const rows = boards?.[b.id] || []
        const rowH = (H - top - 10 * s) / 10
        for (let r = 0; r < 10; r += 1) {
          const row = rows[r]
          const value = row ? `${Math.round(row.score).toLocaleString()}${BOARD_UNITS[b.id]}` : ''
          paintBoardRow(ctx, x0, top + r * rowH, W, rowH, r + 1, row ? String(row.name).slice(0, 16) : '-', value, s)
        }
      })
      res.texture.needsUpdate = true
    })
    return () => {
      cancelled = true
    }
  }, [boards, res])
}

/**
 * The garage showroom's see-through glass and its two display cars turning on their
 * turntables. Module-level: the frame loop owns these objects.
 */
const showroom = { rigs: [], angle: 0 }
const _pos = new Vector3()
const _quat = new Quaternion()
const _up = new Vector3(0, 1, 0)
const TURN_SPEED = 0.35

function poseShowroom(dt) {
  showroom.angle += dt * TURN_SPEED
  showroom.rigs.forEach(({ rig, x, y, z }, i) => {
    _pos.set(x, y, z)
    _quat.setFromAxisAngle(_up, showroom.angle * (i % 2 ? -1 : 1) + i * 1.7)
    rig.pose(_pos, _quat)
  })
}

/** Parked cars' wheel matrices and body poses (static), queued each frame while the lobby is near (wheels; night lights). */
const parked = { wheels: [], cars: [], low: false }
const PARKED_WHEELS_RANGE = 220

function pushParkedWheels(camera) {
  const c = camera.position
  if (c.x * c.x + c.z * c.z > PARKED_WHEELS_RANGE * PARKED_WHEELS_RANGE || c.y > 120) return
  // Static wheels: the same matrix with and without spin (near ones get callipers).
  for (const w of parked.wheels) wheelBatch.push(w.matrix, w.rim, w.matrix, parked.low)
  for (const c of parked.cars) carLights.car(c.matrix, c.model, 0, false, -c.model.wheels.radius)
}

export default function Lobby() {
  const scene = useThree((s) => s.scene)
  const maxTexture = useQuality((s) => s.settings.maxTexture)
  // LOW: the parked cars use their low-detail bodies (they sit 15-60 m from the spawn).
  const parkedLow = useQuality((s) => s.level === 'LOW')
  const realtime = useQuality((s) => s.settings.shadows === 'realtime')
  const stageId = useGame((s) => s.stageId)
  // Portals to chapters you haven't opened yet (re-renders when one opens).
  const locked = useGame((s) => lockedPortalKey(s.profile, s.stageId))

  useEffect(() => {
    const pier = new Mesh(buildPier().geometry, getWorldMaterial())
    pier.matrixAutoUpdate = false
    pier.name = 'pier'
    pier.receiveShadow = realtime
    pier.castShadow = realtime
    scene.add(pier)
    return () => {
      scene.remove(pier)
      pier.geometry.dispose()
    }
  }, [scene, realtime])

  useEffect(() => {
    let signs = null
    let cancelled = false
    fontReady().then(() => {
      if (cancelled) return
      signs = buildSignMesh(lobbySigns(stageId, locked), maxTexture)
      scene.add(signs.mesh)
    })
    return () => {
      cancelled = true
      if (signs) {
        scene.remove(signs.mesh)
        signs.dispose()
      }
    }
  }, [scene, maxTexture, stageId, locked])

  // The portal material lives as long as the lobby (a portal unlocking rebuilds only the
  // geometry below, never recompiles the shader).
  useEffect(() => {
    acquirePortalMaterial()
    return releasePortalMaterial
  }, [])
  // The map portals' swirls (their colours follow the map you're on, locked ones dimmed).
  useEffect(() => {
    const material = acquirePortalMaterial()
    const mesh = new Mesh(lobbyPortalGeometry(stageId, locked), material)
    mesh.name = 'portals'
    mesh.matrixAutoUpdate = false
    mesh.renderOrder = 1
    scene.add(mesh)
    return () => {
      scene.remove(mesh)
      mesh.geometry.dispose()
      releasePortalMaterial()
    }
  }, [scene, stageId, locked])

  // Police marks (a light bar and a sheriff's star) over the portal that leads to Heat Run.
  useEffect(() => {
    const to = portalStages(stageId)
    const gates = PORTALS.filter((p) => to[p.slot]?.id === 'heat-run')
    if (!gates.length) return undefined
    const marks = new Mesh(buildPoliceMarks(gates), getWorldMaterial())
    marks.name = 'police-marks'
    marks.matrixAutoUpdate = false
    scene.add(marks)
    return () => {
      scene.remove(marks)
      marks.geometry.dispose()
    }
  }, [scene, stageId])

  // The showroom: glass panes and display cars.
  useEffect(() => {
    const glass = new Mesh(
      buildGarageGlass(),
      new MeshLambertMaterial({ color: '#cfefff', transparent: true, opacity: 0.2, depthWrite: false, side: DoubleSide }),
    )
    glass.name = 'garage-glass'
    glass.matrixAutoUpdate = false
    glass.renderOrder = 1
    scene.add(glass)
    // Turntable top: floor (0.15) + disc (0.18); wheels rest on it.
    const deck = DECK_Y + 0.33
    showroom.rigs = SHOWROOM.turntables.map((t) => {
      const rig = new CarRig(t.car)
      rig.body.castShadow = false
      // Indoors on a turntable: no headlight beams sweeping the showroom.
      rig.lights = false
      scene.add(rig.body)
      return { rig, x: t.x, y: deck + getCarModel(t.car).wheels.radius, z: t.z }
    })
    poseShowroom(0)
    return () => {
      scene.remove(glass)
      glass.geometry.dispose()
      glass.material.dispose()
      for (const { rig } of showroom.rigs) rig.dispose()
      showroom.rigs = []
    }
  }, [scene])

  // The giant promo billboards (their own small atlas: one draw call, one texture).
  useEffect(() => {
    const promos = buildBannerMesh(
      PROMO_BOARDS.map((b) => ({
        art: b.art,
        center: [b.x, DECK_Y + b.bottom + b.height / 2, b.z],
        right: [b.face[1], 0, -b.face[0]],
        up: [0, 1, 0],
        width: b.width,
        height: b.height,
      })),
      maxTexture,
      'promo',
    )
    scene.add(promos.mesh)
    return () => {
      scene.remove(promos.mesh)
      promos.dispose()
    }
  }, [scene, maxTexture])

  // Parked cars: every body merged into one static mesh; wheels go in the shared batch.
  useEffect(() => {
    const m = new Matrix4()
    const q = new Quaternion()
    const p = new Vector3()
    const one = new Vector3(1, 1, 1)
    const up = new Vector3(0, 1, 0)
    const parts = []
    parked.wheels = []
    parked.cars = []
    parked.low = parkedLow
    // LOW: low-detail bodies and wheels, and only 7 of the 11 (a crowded lobby must stay under 100k triangles).
    for (const car of parkedLow ? PARKED.filter((_, i) => i % 3 !== 1) : PARKED) {
      const model = getCarModel(car.car)
      p.set(car.x, DECK_Y + model.wheels.radius, car.z)
      q.setFromAxisAngle(up, car.yaw)
      m.compose(p, q, one)
      parts.push((parkedLow ? model.lodGeometry : model.geometry).clone().applyMatrix4(m))
      parked.cars.push({ matrix: m.clone(), model })
      const w = model.wheels
      for (const wp of w.positions) {
        const wm = new Matrix4().compose(new Vector3(...wp), new Quaternion(), new Vector3(w.width, w.radius, w.radius)).premultiply(m)
        parked.wheels.push({ matrix: wm, rim: model.rim })
      }
    }
    const geometry = mergeGeometries(parts)
    for (const g of parts) g.dispose()
    const mesh = new Mesh(geometry, getCarMaterial())
    mesh.name = 'parked-cars'
    mesh.matrixAutoUpdate = false
    scene.add(mesh)
    return () => {
      scene.remove(mesh)
      geometry.dispose()
      parked.wheels = []
      parked.cars = []
    }
  }, [scene, parkedLow])

  useFrame(({ camera, clock }, dt) => {
    poseShowroom(Math.min(dt, 0.1))
    pushParkedWheels(camera)
    tickPortalFx(clock.elapsedTime)
  })

  useBoards(scene, maxTexture)
  return null
}
