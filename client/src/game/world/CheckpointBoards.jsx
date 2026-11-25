import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { CanvasTexture, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from 'three'

import { progressOf } from '@shared/logic'
import { forwardOf, rightOf } from '@shared/track'

import { useGame } from '../../store/game'
import { formatTime } from '../../ui/hud/style'
import { PALETTE } from '../palette'
import { boardText, paintBoardFrame, paintBoardRow, roundRect } from '../render/boardPaint'
import { MeshBuilder } from '../render/meshBuilder'
import { getWorldMaterial } from '../render/worldMaterial'

/**
 * Best-time boards: every checkpoint plaza has a board facing the arriving car with the
 * ten fastest times for the section that ends there, and your own best.
 *
 * The frames and posts of all boards are one merged mesh (one draw call). Only two
 * boards are ever close enough to read - the plaza you just left and the one you're
 * driving to - so there are just two live panels (512px canvas textures) that move to
 * those two checkpoints and redraw when the section, the boards or your times change.
 */

const W = 7.2
const H = 4.8
const CENTRE_Y = 4.2
const TEX_W = 512
const TEX_H = Math.round((TEX_W * H) / W)
const TURN = (25 * Math.PI) / 180

/** Where checkpoint `cp`'s board stands: `{ centre, right, up, normal }`. */
function boardPose(cp) {
  const fwd = forwardOf(cp.yaw)
  const right = rightOf(cp.yaw)
  // Right-hand side of the plaza (the kiosk is on the left), turned towards the road.
  const base = [cp.x + fwd[0] * 15 + right[0] * (cp.width / 2 - 4.5), cp.y, cp.z + fwd[2] * 15 + right[2] * (cp.width / 2 - 4.5)]
  const c = Math.cos(TURN)
  const s = Math.sin(TURN)
  const normal = [-fwd[0] * c - right[0] * s, 0, -fwd[2] * c - right[2] * s]
  const len = Math.hypot(normal[0], normal[2]) || 1
  normal[0] /= len
  normal[2] /= len
  // Viewer's right when looking at the board: up x normal.
  const pr = [normal[2], 0, -normal[0]]
  return { base, centre: [base[0], base[1] + CENTRE_Y, base[2]], right: pr, up: [0, 1, 0], normal }
}

/** `stage`'s boards: one per checkpoint after the Start. */
const boardsOf = (stage) => stage.checkpoints.filter((cp) => cp.index > 0).map((cp) => ({ index: cp.index, pose: boardPose(cp) }))

function buildFrames(boards) {
  const mb = new MeshBuilder()
  const frame = PALETTE.uiNavy
  const post = PALETTE.steelDark
  const trim = PALETTE.gateOrange
  for (const { pose } of boards) {
    const { base, centre, right, up, normal } = pose
    const back = [-normal[0], 0, -normal[2]]
    const at = (p, d, k) => [p[0] + d[0] * k, p[1] + d[1] * k, p[2] + d[2] * k]
    // Backing frame, an orange trim strip on top, and two posts.
    mb.box(at(centre, back, 0.14), [W / 2 + 0.25, H / 2 + 0.25, 0.12], right, up, normal, { top: frame, side: frame, end: frame, bottom: frame })
    mb.box(at(at(centre, up, H / 2 + 0.38), back, 0.14), [W / 2 + 0.35, 0.14, 0.16], right, up, normal, { top: trim, side: trim, end: trim, bottom: trim })
    const postH = (CENTRE_Y - H / 2) / 2
    for (const side of [-1, 1]) {
      mb.box(at(at(at(base, right, side * (W / 2 - 0.6)), up, postH), back, 0.2), [0.16, postH, 0.16], right, up, normal, { top: post, side: post, end: post, bottom: post })
    }
  }
  return mb.build()
}

function makePanel() {
  const canvas = document.createElement('canvas')
  canvas.width = TEX_W
  canvas.height = TEX_H
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 2
  const mesh = new Mesh(new PlaneGeometry(W, H), new MeshBasicMaterial({ map: texture, fog: true }))
  mesh.matrixAutoUpdate = false
  mesh.visible = false
  return { canvas, texture, mesh, index: 0, key: '' }
}

/** The mounted stage's boards: `{ stage, boardByIndex, frames, panels }` (one stage at a time). */
let scenery = null

function getScenery(stage) {
  if (!scenery || scenery.stage !== stage) {
    const boards = boardsOf(stage)
    const frames = new Mesh(buildFrames(boards), getWorldMaterial())
    frames.name = 'checkpoint-boards'
    scenery = { stage, boardByIndex: new Map(boards.map((b) => [b.index, b])), frames, panels: [makePanel(), makePanel()] }
  }
  return scenery
}

const _m = new Matrix4()
const _x = new Vector3()
const _y = new Vector3()
const _z = new Vector3()

/** Puts `panel` on checkpoint `index`'s board (or hides it). */
function placePanel(sc, panel, index) {
  const board = sc.boardByIndex.get(index)
  panel.index = board ? index : 0
  panel.mesh.visible = Boolean(board)
  if (!board) return
  const { centre, right, up, normal } = board.pose
  _x.fromArray(right)
  _y.fromArray(up)
  _z.fromArray(normal)
  _m.makeBasis(_x, _y, _z).setPosition(centre[0] + normal[0] * 0.03, centre[1], centre[2] + normal[2] * 0.03)
  panel.mesh.matrix.copy(_m)
  panel.mesh.matrixWorldNeedsUpdate = true
}

/** Draws checkpoint `index`'s board: title, top 10, your best. */
function drawPanel(stage, panel, index, rows, mine, myName) {
  const ctx = panel.canvas.getContext('2d')
  const w = TEX_W
  const h = TEX_H
  const section = stage.sections[index - 1]?.name || ''
  const top = paintBoardFrame(ctx, 0, 0, w, h, `CHECKPOINT ${index} · BEST TIMES`, `${section.toUpperCase()} · TOP 10`)
  const footH = 34
  const rowH = (h - top - footH - 10) / 10
  if (!rows.length) boardText(ctx, 'No times yet - set the first one!', w / 2, top + rowH * 4, 18, w - 40, 'rgba(255,255,255,0.8)', 'center')
  for (let i = 0; i < Math.min(10, rows.length); i += 1) {
    const r = rows[i]
    paintBoardRow(ctx, 0, top + i * rowH, w, rowH, i + 1, String(r.name || 'Player').slice(0, 22), formatTime(r.ms), 1, Boolean(myName) && r.name === myName)
  }
  // Your best, in a gold bar at the foot.
  const fy = h - footH - 6
  const g = ctx.createLinearGradient(0, fy, 0, fy + footH)
  g.addColorStop(0, '#ffe27a')
  g.addColorStop(1, '#ffb020')
  ctx.fillStyle = '#0d1530'
  roundRect(ctx, 8, fy - 2, w - 16, footH + 4, 12)
  ctx.fill()
  ctx.fillStyle = g
  roundRect(ctx, 10, fy, w - 20, footH, 10)
  ctx.fill()
  let foot = 'no time yet'
  if (mine) {
    const place = rows.findIndex((r) => r.ms >= mine)
    const ranked = rows.length && place >= 0 && place < 10 ? `  ·  #${place + 1}` : rows.length >= 10 ? '  ·  not in the top 10 yet' : ''
    foot = `${formatTime(mine)}${ranked}`
  }
  boardText(ctx, 'YOUR BEST', 22, fy + footH / 2, 18, 140, '#0d1530', 'left', null)
  boardText(ctx, foot, w - 22, fy + footH / 2, 18, w - 180, '#0d1530', 'right', null)
  panel.texture.needsUpdate = true
}

/** The current map's best-time boards (`stage`: its built stage; mounted with it). */
export function CheckpointBoards({ stage }) {
  const scene = useThree((s) => s.scene)
  const section = useGame((s) => s.section)
  // This map's boards from the server (a room only gets its own map's split boards).
  const splits = useGame((s) => (s.leaderboards && (s.leaderboards.stage ?? stage.id) === stage.id ? s.leaderboards.splits : null))
  const mySplits = useGame((s) => progressOf(s.profile, stage.id).splits)
  const myName = useGame((s) => s.profile.name)

  useEffect(() => {
    const sc = getScenery(stage)
    scene.add(sc.frames, ...sc.panels.map((p) => p.mesh))
    return () => {
      scene.remove(sc.frames, ...sc.panels.map((p) => p.mesh))
    }
  }, [scene, stage])

  // Free GPU resources when the scene goes (context loss / quality rebuild).
  useEffect(
    () => () => {
      if (!scenery) return
      scenery.frames.geometry.dispose()
      for (const p of scenery.panels) {
        p.texture.dispose()
        p.mesh.geometry.dispose()
        p.mesh.material.dispose()
      }
      scenery = null
    },
    [],
  )

  // The board behind you (the plaza you left) and the one ahead.
  useEffect(() => {
    const sc = getScenery(stage)
    const wanted = [section, section + 1]
    sc.panels.forEach((panel, i) => {
      const index = wanted[i]
      placePanel(sc, panel, index)
      if (!panel.index) return
      const rows = splits?.[index] || []
      const mine = mySplits?.[index] || 0
      const key = `${index}|${mine}|${myName}|${rows.map((r) => `${r.name}:${r.ms}`).join(',')}`
      if (panel.key === key) return
      panel.key = key
      drawPanel(stage, panel, index, rows, mine, myName)
    })
  }, [stage, section, splits, mySplits, myName])

  return null
}

export default CheckpointBoards
