import { useFrame, useThree } from '@react-three/fiber'
import { Children, useEffect, useRef, useState } from 'react'

import { prepareAudio, sfx } from '../audio/sfx'
import { getGame, useGame } from '../store/game'
import { warmIconRenderer } from './cars/carIcons'
import { gradualWarm, hideUnwarmed, markVisibleWarmed, revealAll, splitSharedMaterials, warmHolds } from './gpuWarm'
import { startBarrier } from './physics/instance'
import { fontReady } from './render/signs'

/**
 * GPU warm-ups (./gpuWarm.js): every program linked, buffer and texture uploaded and
 * draw-time driver variant built before anything can be seen for the first time.
 *
 * - `LobbyWarmup`, under the loading screen: the audio engine, then what the lobby's first
 *   frames drew counts as warm (markVisibleWarmed) - the screen goes. Kept short: it's time
 *   to playable.
 * - `StageWarmup`, in the background while you drive round the lobby, a few ms a frame
 *   (gradualWarm): the current map's stage world, and with it the lobby's hidden effects
 *   (particles, skid marks, nitro flames, ghost...). It starts once the stage is mounted
 *   (`stageReady`), nothing holds it (`warmHolds`: lazy chunks still loading, a `<Stagger>`
 *   still mounting its parts) and the scene has settled; then `store.stageWarm` is set and the
 *   Start gate opens. Generic: whatever a map's modules add by then is covered.
 */

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()))

/** Waits until nothing holds the warm-up and `quiet` frames have passed since the last release. */
async function settle(isCancelled, quiet = 3) {
  let calm = 0
  while (calm < quiet) {
    await nextFrame()
    if (isCancelled()) return
    calm = warmHolds.count === 0 ? calm + 1 : 0
  }
}

/** Readies the lobby under the loading screen; `onDone` ends it (also if anything fails). */
export function LobbyWarmup({ onDone }) {
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      // The audio engine (~100 ms of noise buffers and voices on a slow machine) - here, not in the lobby.
      prepareAudio()
      // The car-portrait rig's programs, compiled in parallel under the screen (drawn later).
      warmIconRenderer()
      splitSharedMaterials(scene)
      await settle(() => cancelled, 1)
      if (cancelled) return
      markVisibleWarmed(scene)
      performance.mark('pp:lobby-warm-end')
    }
    run()
      .catch((err) => console.warn('[warm] lobby warm-up failed', err))
      .finally(() => {
        if (!cancelled) onDone()
      })
    return () => {
      cancelled = true
    }
  }, [scene, onDone])
  return null
}

/** The background warm-up under way (frame-owned): `stage` null = the lobby's leftovers. */
const live = { job: null, stage: null }

export function StageWarmup() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const stage = useGame((s) => s.stage)
  const stageReady = useGame((s) => s.stageReady)
  const stageWarm = useGame((s) => s.stageWarm)
  const lastShown = useRef(-1)

  useEffect(() => {
    if (!stage || !stageReady || stageWarm) return undefined
    let cancelled = false
    const isCancelled = () => cancelled || getGame().stage !== stage
    ;(async () => {
      await settle(isCancelled)
      await fontReady().catch(() => {})
      await settle(isCancelled, 2)
      if (isCancelled()) return
      performance.mark('pp:stage-warm-start')
      live.stage = stage
      live.job = gradualWarm(gl, scene, camera)
    })()
    return () => {
      cancelled = true
      if (live.stage === stage) {
        live.job = null
        live.stage = null
      }
      revealAll()
    }
  }, [gl, scene, camera, stage, stageReady, stageWarm])

  // Before the frame's own render (negative priority: auto-rendering stays on). While the
  // map is being prepared, nothing of it is drawn before it's warmed.
  useFrame(() => {
    const g = getGame()
    if (g.stage && !g.stageWarm) hideUnwarmed(scene)
    const job = live.job
    if (!job) return
    let done
    try {
      done = job.step()
    } catch (err) {
      console.warn('[warm] warm-up failed, carrying on', err)
      done = 1
    }
    if (!live.stage) {
      if (done >= 1) live.job = null
      return
    }
    // Progress on the timer plate in 5% steps (store writes deferred out of the frame).
    const shown = 0.72 + 0.27 * done
    if (done < 1) {
      const step = Math.floor(shown * 20)
      if (step !== lastShown.current) {
        lastShown.current = step
        setTimeout(() => getGame().stage === live.stage && getGame().setTrackPrep(step / 20), 0)
      }
      return
    }
    const finished = live.stage
    live.job = null
    live.stage = null
    revealAll()
    performance.mark('pp:stage-warm-end')
    setTimeout(() => {
      const g = getGame()
      if (g.stage !== finished) return
      g.setStageWarm(true)
      // The Start gate opens (StartGateBar lifts its boom) - the track is ready.
      startBarrier.enabled = false
      if (!g.travel) {
        sfx.checkpoint()
        g.showToast('TRACK READY', 'success', 'The Start gate is open')
      }
    }, 0)
  }, -2)

  return null
}

/** A Suspense fallback that holds the warm-up while its boundary is suspended (a lazy chunk loading). */
export function WarmHold() {
  useEffect(() => warmHolds.add(), [])
  return null
}

/**
 * Mounts its children one per frame instead of all in one commit (each part of a map's
 * stage world builds its meshes as it mounts), holding the warm-up until the last is in.
 */
export function Stagger({ children }) {
  const list = Children.toArray(children)
  const [shown, setShown] = useState(1)
  const more = shown < list.length
  useEffect(() => {
    if (!more) return undefined
    const release = warmHolds.add()
    const id = requestAnimationFrame(() => setShown((n) => n + 1))
    return () => {
      cancelAnimationFrame(id)
      release()
    }
  }, [more, shown])
  return list.slice(0, shown)
}

export default StageWarmup
