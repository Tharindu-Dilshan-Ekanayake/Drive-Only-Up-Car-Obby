import { useCallback, useEffect, useRef, useState } from 'react'

import { chapterLabel } from '@shared/chapters'
import { stageInfo } from '@shared/stages/index'

import GameController from './GameController'
import { useGame } from './store/game'
import { queueCarIcons, warmIconRenderer } from './game/cars/carIcons'
import GameScene from './game/GameScene'
import { allowCarIcons } from './game/iconGate'
import HUD from './ui/hud/HUD'
import LoadingScreen from './ui/LoadingScreen'
import Nameplates from './ui/Nameplates'
import { prefetchPanels } from './ui/panels/panelLoaders'
import Panels from './ui/panels/Panels'
import ReplacedOverlay from './ui/ReplacedOverlay'
import ScreenFade from './ui/ScreenFade'
import TouchControls from './ui/TouchControls'

/** The loading screen while travelling to another map (game/stageRuntime.js travelTo). */
function TravelScreen() {
  const travel = useGame((s) => s.travel)
  if (!travel) return null
  const to = stageInfo(travel.to)
  return (
    <LoadingScreen
      key={travel.id}
      done={travel.progress >= 1}
      label={`TRAVELLING TO ${to.name.toUpperCase()}`}
      tagline={[chapterLabel(to.id), to.tagline.toUpperCase()].filter(Boolean).join(' · ')}
      progress={travel.progress * 100}
      tip="Every map keeps its own checkpoints, best times and Sky Pearls. Coins and cars go everywhere with you."
    />
  )
}

/**
 * Resolves once the page has drawn `calm` frames in a row at a steady rate (or after
 * `maxMs`): the browser has finished rasterising whatever was just put on screen.
 */
function settleFrames(calm = 8, maxMs = 5000) {
  return new Promise((resolve) => {
    const start = performance.now()
    let last = start
    let streak = 0
    const step = (t) => {
      streak = t - last < 40 ? streak + 1 : 0
      last = t
      if (streak >= calm || t - start > maxMs) resolve()
      else requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  })
}

/** The HUD while the loading screen is still up: above it, 1% opaque, inert. */
/** Longest the loading screen waits for the HUD's first raster after the lobby is ready. */
const HUD_SETTLE_MS = 250
const HUD_PREWARM = { position: 'absolute', inset: 0, zIndex: 102, opacity: 0.01, pointerEvents: 'none' }

function App() {
  // The lobby is built and warmed (GameScene onReady; the map is then prepared in the
  // background) / the loading screen goes.
  const [hudUp, setHudUp] = useState(false)
  const [sceneReady, setSceneReady] = useState(false)
  const [ready, setReady] = useState(false)
  const handlePierDrawn = useCallback(() => setHudUp(true), [])
  const handleReady = useCallback(() => {
    setHudUp(true)
    setSceneReady(true)
  }, [])

  // The HUD goes up once the pier is drawn (not at start-up: its first raster - the browser
  // compiling its raster shaders, ~1-2 s of GPU time on a cold browser - would hold up the
  // WebGL context itself), under cover of the loading screen: at 1% opacity, above it (layers
  // under an opaque one are never rasterised). The screen goes when the lobby is ready and
  // frames are steady again - waiting at most HUD_SETTLE_MS, to keep time to playable.
  useEffect(() => {
    if (!sceneReady || ready) return undefined
    let cancelled = false
    // (A wall-clock cap too: while the GPU is busy no frame comes to count.)
    Promise.race([settleFrames(6, HUD_SETTLE_MS), new Promise((r) => setTimeout(r, HUD_SETTLE_MS))]).then(() => {
      if (cancelled) return
      setReady(true)
      useGame.getState().setPlayable()
    })
    return () => {
      cancelled = true
    }
  }, [sceneReady, ready])

  useEffect(() => {
    if (!ready) return undefined
    requestAnimationFrame(() => performance.mark('pp:hud-shown'))
    prefetchPanels()
  }, [ready])

  // Nothing on screen needs these yet: car thumbnails for the garage (one a frame, each
  // read back from the GPU) - once the track is ready and a few seconds have passed.
  const trackWarm = useGame((s) => s.stageWarm)
  const iconsQueued = useRef(false)
  useEffect(() => {
    if (!ready || !trackWarm || iconsQueued.current) return undefined
    const id = setTimeout(() => {
      iconsQueued.current = true
      // (And a little longer: compileAsync can report a material ready while another of its
      // variants - the instanced wheels' - is still linking.)
      warmIconRenderer().then(() =>
        setTimeout(() => {
          allowCarIcons()
          queueCarIcons()
        }, 2000),
      )
    }, 3000)
    return () => clearTimeout(id)
  }, [ready, trackWarm])

  return (
    <div className="relative h-full w-full select-none overflow-hidden">
      <GameController />
      <GameScene onReady={handleReady} onPierDrawn={handlePierDrawn} />
      <TouchControls />
      {hudUp && (
        <div inert={!ready} style={ready ? undefined : HUD_PREWARM}>
          <Nameplates />
          <HUD />
          <Panels />
        </div>
      )}
      <ScreenFade />
      <ReplacedOverlay />
      <LoadingScreen done={ready} />
      <TravelScreen />
    </div>
  )
}

export default App
