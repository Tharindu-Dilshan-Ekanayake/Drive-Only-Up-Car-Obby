import { onExitPortal } from '@shared/chapters'
import { padAt, portalAt } from '@shared/lobby'
import { nearestSample } from '@shared/track'

import { sfx } from '../audio/sfx'
import { remotePlayers } from '../net/remotePlayers'
import { getGame } from '../store/game'
import { runtime } from './runtime'
import { portalStage } from './portals'

const TICK_MS = 100
const KIOSK_RADIUS = 3.2
const YOU_COLOR = '#ffffff'
const PLAYER_COLORS = ['#ff7a1a', '#18c3d6', '#b05cff', '#3fd97a', '#ff4a3d', '#ffc41f', '#3aa0ff']
/** Dots on the altitude rail (ui/hud/AltitudeRail.jsx MAX_DOTS), you included. */
const MAX_RAIL = 12
const byGap = (a, b) => a.gap - b.gap

/**
 * The drive-in pad (lobby), map portal (`'portal:<map id>'`), a finish plaza's exit
 * portal to the next chapter (`'exit:<map id>'`, shared/chapters.js) or checkpoint
 * car-spin kiosk you're parked on.
 */
function padHere(stage, stageId) {
  const p = runtime.car.position
  const lobby = padAt(p.x, p.z)
  if (lobby && p.y < 6) return lobby
  const slot = p.y < 6 ? portalAt(p.x, p.z) : -1
  const to = slot >= 0 ? portalStage(stageId, slot) : null
  if (to) return `portal:${to.id}`
  if (onExitPortal(stage?.exitPortal, p.x, p.y, p.z)) return `exit:${stage.exitPortal.to}`
  const cp = stage?.checkpoints[runtime.race.checkpoint]
  const k = cp?.kiosk
  if (k && Math.hypot(p.x - k.x, p.z - k.z) < KIOSK_RADIUS && Math.abs(p.y - k.y) < 3) return 'spin'
  return null
}

/**
 * The 10 Hz bridge between the frame-rate world and the UI: which pad you're on (the
 * store, only when it changes) and the racers on the altitude rail (runtime.racers,
 * refreshed ~3 times a second, reusing its objects).
 *
 * @returns {() => void} stop
 */
export function startGameTicker() {
  let tick = 0
  const hints = new Map()
  const pool = []
  const others = []
  const racer = (i) => (pool[i] ||= { id: '', name: '', altitude: 0, progress: 0, gap: 0, color: '', bot: false, you: false })

  const id = setInterval(() => {
    const game = getGame()
    const stage = game.stage
    const pad = game.travel ? null : padHere(stage, game.stageId)
    if (pad !== game.pad) game.setPad(pad)
    if (runtime.race.section !== game.section) {
      // A sting for a new stretch of track (only going up, and only during a run).
      if (runtime.race.running && runtime.race.section > game.section) sfx.section()
      game.setSection(runtime.race.section)
    }

    tick += 1
    if (tick % 3) return
    let n = 0
    const you = racer(n++)
    you.id = 'you'
    you.name = game.profile.name || 'You'
    you.altitude = runtime.car.altitude
    you.progress = runtime.race.progress
    you.color = YOU_COLOR
    you.bot = false
    you.you = true
    const length = stage?.length || 1
    for (const b of runtime.bots) {
      const r = racer(n++)
      r.id = b.id
      r.name = b.name
      r.altitude = Math.max(0, b.position.y - 2)
      r.progress = b.ctx.path[b.i].s / b.ctx.stage.length
      r.color = b.color
      r.bot = true
      r.you = false
    }
    for (const p of remotePlayers.values()) {
      if (!p.hasPose) continue
      const r = racer(n++)
      const near = stage ? nearestSample(stage.path, p.position.x, p.position.y, p.position.z, hints.get(p.sessionId) ?? -1) : null
      if (near) hints.set(p.sessionId, near.index)
      const outside = !near || p.position.z > -40
      r.id = p.sessionId
      r.name = p.name
      r.altitude = Math.max(0, p.position.y - 2)
      r.progress = outside ? 0 : stage.path[near.index].s / length
      // By pose slot, so a player keeps their colour while others come and go.
      r.color = PLAYER_COLORS[Math.max(0, p.slot) % PLAYER_COLORS.length]
      r.bot = false
      r.you = false
    }
    for (const sessionId of hints.keys()) if (!remotePlayers.has(sessionId)) hints.delete(sessionId)

    // Your place, over everyone: all further up the stage are ahead of you.
    let ahead = 0
    for (let i = 1; i < n; i += 1) if (pool[i].progress > you.progress) ahead += 1
    if (runtime.race.running && n > 1 && ahead + 1 < runtime.race.rank) sfx.rankUp()
    runtime.race.rank = ahead + 1
    // Only a race once you're through the Start gate (the HUD hides the badge at 1).
    runtime.race.racerCount = runtime.race.running ? n : 1

    // The rail has room for MAX_RAIL dots: you, then whoever is nearest you on the
    // stage (the race you're actually in), however many are in the room.
    others.length = 0
    for (let i = 1; i < n; i += 1) {
      pool[i].gap = Math.abs(pool[i].progress - you.progress)
      others.push(pool[i])
    }
    if (others.length > MAX_RAIL - 1) others.sort(byGap)
    const shown = Math.min(others.length, MAX_RAIL - 1)
    runtime.racers.length = shown + 1
    runtime.racers[0] = you
    for (let i = 0; i < shown; i += 1) runtime.racers[i + 1] = others[i]
  }, TICK_MS)

  return () => clearInterval(id)
}
