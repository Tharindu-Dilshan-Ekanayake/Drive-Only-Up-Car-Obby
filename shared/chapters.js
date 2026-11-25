/**
 * Chapters: the story maps are played in order. Sky Docks is CHAPTER 1, the Grand Tour
 * CHAPTER 2 (registry `chapter` in each <map>.meta.js); Heat Run is a separate mode with
 * no chapter, always open. A map with `unlock: { finish: <map id> }` opens once you have
 * finished that map (logic.js isStageUnlocked - the rule itself lives with the profile
 * rules), and the finish plaza of the map it follows gets an exit portal that drives
 * you straight on to it (`next` in that map's meta; `addExitPortal` below).
 *
 * Pure data and maths: the server, the offline stand-in, the client and the tests share it.
 */

import { forwardOf, rightOf } from './track.js'
import { stageInfo } from './stages/index.js'

/**
 * The close code / error code a join refused because the room's map is still locked
 * carries (Colyseus ServerError; its own codes are 4210-4217, ours 4100 = replaced).
 */
export const STAGE_LOCKED = 4403

/** Map `id`'s chapter number, or 0 (a mode, like Heat Run). */
export const chapterOf = (id) => stageInfo(id)?.chapter || 0

/** "CHAPTER 2" for a chapter map, '' for a mode. */
export const chapterLabel = (id) => (chapterOf(id) ? `CHAPTER ${chapterOf(id)}` : '')

/** "CHAPTER 1 · SKY DOCKS" for a chapter map, just "HEAT RUN" for a mode. */
export function chapterTitle(id) {
  const info = stageInfo(id)
  if (!info) return ''
  return info.chapter ? `CHAPTER ${info.chapter} · ${info.short}` : info.short
}

/** The map `id` must be finished before (null = always open). */
export const unlockedByFinishing = (id) => stageInfo(id)?.unlock?.finish || null

/** What a locked map's portal / refusal says: "Reach the Crane Summit in Sky Docks to unlock Chapter 2". */
export function lockedMessage(id) {
  const need = stageInfo(unlockedByFinishing(id))
  const goal = need?.goal || (need ? `the finish of ${need.name}` : 'the finish')
  const chapter = chapterOf(id)
  return `Reach ${goal} in ${need?.name || 'the last map'} to unlock ${chapter ? `Chapter ${chapter}` : stageInfo(id)?.name || 'this map'}`
}

/**
 * The exit portal's size: the lobby portal's (shared/lobby.js PORTAL) - a pad `w` deep
 * (along the drive), an opening `d` wide, posts `post` half-thick, `height` to the lintel.
 * `padHalf`: the glowing pad's half width inside its frame.
 */
export const EXIT_PORTAL = { w: 8, d: 8.4, post: 0.6, height: 9, padHalf: 8.4 / 2 - 0.75 }
/** Where on the finish plaza: half way along it, `out` metres left of the centre line. */
const EXIT_AT = { along: 0.5, out: 22 }

/**
 * Puts the exit portal to map `to` on `stage`'s finish plaza (left side, where the
 * other plazas have their pit garage - the finish has none), facing the centre line:
 * `stage.exitPortal = { to, section, x, y, z, normal, across }`, where `normal` (unit,
 * horizontal) is the way the arch faces - you drive in against it - and `across` runs
 * along the opening. Its two posts become colliders (kind 'portalPost', drawn by the
 * client's track builder with the arch); the pad is just paint. In place; returns `stage`.
 */
export function addExitPortal(stage, to) {
  const cp = stage.checkpoints.at(-1)
  if (!cp?.finish || !stageInfo(to)) return stage
  const fwd = forwardOf(cp.yaw)
  const right = rightOf(cp.yaw)
  const a = cp.length * EXIT_AT.along
  const x = cp.x + fwd[0] * a - right[0] * EXIT_AT.out
  const z = cp.z + fwd[2] * a - right[2] * EXIT_AT.out
  const r = (v) => Math.round(v * 1000) / 1000
  const portal = { to, section: stage.sections.length - 1, x: r(x), y: cp.y, z: r(z), normal: right, across: fwd }
  const { d, post, height } = EXIT_PORTAL
  for (const s of [-1, 1]) {
    const k = s * (d / 2 + post)
    stage.boxes.push({
      c: [r(x + fwd[0] * k), r(cp.y + height / 2), r(z + fwd[2] * k)],
      h: [post, height / 2, post],
      ax: right,
      ay: [0, 1, 0],
      az: fwd,
      kind: 'portalPost',
      section: portal.section,
    })
  }
  stage.exitPortal = portal
  return stage
}

/** True when (x, y, z) is on `portal`'s pad (stage.exitPortal). */
export function onExitPortal(portal, x, y, z) {
  if (!portal) return false
  const dy = y - portal.y
  if (dy < -1.5 || dy > 5) return false
  const dx = x - portal.x
  const dz = z - portal.z
  const n = dx * portal.normal[0] + dz * portal.normal[2]
  const c = dx * portal.across[0] + dz * portal.across[2]
  return Math.abs(n) < EXIT_PORTAL.w / 2 && Math.abs(c) < EXIT_PORTAL.d / 2
}
