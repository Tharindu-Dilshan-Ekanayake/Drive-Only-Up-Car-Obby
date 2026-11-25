import { PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { WebGLRenderer } from 'three'

import { useBloxity } from '../bloxity/BloxityContext'
import { useBloxityStore } from '../bloxity/store'
import { useGame } from '../store/game'
import { RENDER_SCALES, useQuality } from '../store/quality'
import ErrorBoundary from '../ui/ErrorBoundary'
import ChaseCamera from './camera/ChaseCamera'
import { attachIconRenderer, processIconQueue } from './cars/carIcons'
import { wheelBatch } from './cars/CarRig'
import { iconGate } from './iconGate'
import CarFx from './fx/CarFx'
import NightLights from './fx/NightLights'
import { carLights } from './fx/carLights'
import Particles from './fx/Particles'
import Ghost from './ghost/Ghost'
import SkidMarks from './fx/SkidMarks'
import { SKY_THEMES } from './palette'
import PerfProbe from './PerfProbe'
import PlayerCar from './player/PlayerCar'
import RemoteCars from './remote/RemoteCars'
import ShaderWarmup from './ShaderWarmup'
import StageWarmup, { LobbyWarmup, WarmHold } from './StageWarmup'
import StartGateBar from './world/StartGateBar'
import { stageInfo } from '@shared/stages/index'

import { loadCurrentStage } from './stageRuntime'
import Environment from './world/Environment'
import Harbour from './world/Harbour'
import Lobby from './world/Lobby'
import { useSkyTheme } from './world/skyTheme'
import { preloadScenery } from './world/scenery/index'
import Seagulls from './world/Seagulls'

// r3f-perf is a dev-only overlay (?perf in the URL). The DEV check is static, so the
// import and the package are dropped from production builds entirely.
const DevPerf = import.meta.env.DEV ? lazy(() => import('r3f-perf').then((m) => ({ default: m.Perf }))) : null
const showDevPerf = import.meta.env.DEV && new URLSearchParams(window.location.search).has('perf')

// The map's stage world (track, boards, CPU racers, scenery) is its own chunk, and the
// map's stage data another (shared/stages/index.js). The loading screen goes as soon as
// the LOBBY is built and warmed (LobbyWarmup); the current map is then prepared in the
// background while you drive round the pier - stage data and heavy geometry in the prep
// worker (game/prep), the stage world mounted a part per frame, warmed on the GPU in small
// batches (StageWarmup) - and the Start gate opens once it's all done, so neither the lobby
// nor the track ever stalls. Keyed by map: travelling unmounts (and disposes) the old one.
const loadStageWorld = () => import('./track/StageWorld')
const StageWorld = lazy(loadStageWorld)
// The Rocket Missile system (its own small chunk, fetched once the lobby is up; items fire through game/fx/missileHub.js).
const MissileFx = lazy(() => import('./fx/MissileFx'))

/** Prepares the current map in the background whenever there's a map without one (start-up once the lobby is up, travel). */
function StageLoader() {
  const stageId = useGame((s) => s.stageId)
  const loaded = useGame((s) => Boolean(s.stage))
  useEffect(() => {
    if (!loaded) loadCurrentStage()
  }, [stageId, loaded])
  // The map's code chunks, fetched in parallel with its stage data (not one after another).
  useEffect(() => {
    loadStageWorld().catch(() => null)
    preloadScenery(stageInfo(stageId)?.theme?.scenery)
  }, [stageId])
  return null
}

/**
 * Fires `onFirstFrame` after the renderer has actually drawn once.
 * "Ready" should mean "the player can see the game", not "React mounted".
 */
function FirstFrameSignal({ onFirstFrame }) {
  const fired = useRef(false)
  useFrame(() => {
    if (fired.current) return
    fired.current = true
    performance.mark('pp:first-frame')
    setTimeout(onFirstFrame, 0)
  })
  return null
}

/** Keeps the camera's far plane in step with the preset's view distance. */
function ViewDistance({ far }) {
  const get = useThree((s) => s.get)
  useEffect(() => {
    const { camera } = get()
    camera.far = far
    camera.updateProjectionMatrix()
  }, [get, far])
  return null
}

/** Start of every frame (before any car is posed): resets the shared wheel and night-light batches, renders queued car icons. */
function FrameStart() {
  useFrame(() => {
    wheelBatch.begin()
    carLights.begin()
    if (iconGate.open) processIconQueue()
  }, -1)
  return null
}

/**
 * The 3D view. Owns the renderer lifecycle: quality-driven settings, automatic preset
 * drops when FPS falls under budget, and recovery from a lost WebGL context.
 *
 * @param {{ onReady?: () => void, onPierDrawn?: () => void }} props `onReady`: called once
 *   the lobby is drawn and readied (LobbyWarmup) - the map is then prepared in the background;
 *   `onPierDrawn`: the pier's first frame is drawn
 */
export function GameScene({ onReady, onPierDrawn }) {
  const { game } = useBloxity()
  const settings = useQuality((s) => s.settings)
  const sky = useSkyTheme()
  const antialias = useQuality((s) => s.antialias)
  const rebuild = useQuality((s) => s.rebuild)
  const degrade = useQuality((s) => s.degrade)
  const recover = useQuality((s) => s.recover)
  const renderScale = useQuality((s) => RENDER_SCALES[s.renderStep])
  const adBreak = useBloxityStore((s) => s.adBreak)
  const stage = useGame((s) => s.stage)
  // The loading screen is gone (App): only then does the background map prep start, so it
  // doesn't compete with the lobby's last steps under the screen.
  const playable = useGame((s) => s.playable)

  const [warmedUp, setWarmedUp] = useState(false)
  const [firstFrame, setFirstFrame] = useState(false)
  const [lobbyWarm, setLobbyWarm] = useState(false)
  const [lobbyReady, setLobbyReady] = useState(false)
  const [contextKey, setContextKey] = useState(0)
  const [contextLost, setContextLost] = useState(false)
  const [warmedRebuild, setWarmedRebuild] = useState(0)
  const rebuilding = rebuild !== warmedRebuild
  const readySent = useRef(false)

  const handleWarmedUp = useCallback(() => {
    setWarmedUp(true)
    setWarmedRebuild(useQuality.getState().rebuild)
  }, [])
  const handleFirstFrame = useCallback(() => setFirstFrame(true), [])
  const handleLobbyWarm = useCallback(() => setLobbyWarm(true), [])

  useEffect(() => {
    game.loadingStep('Preparing the docks…')
  }, [game])

  useEffect(() => {
    if (warmedUp && firstFrame) onPierDrawn?.()
  }, [warmedUp, firstFrame, onPierDrawn])

  useEffect(() => {
    if (!warmedUp || !firstFrame || !lobbyWarm || readySent.current) return
    readySent.current = true
    performance.mark('pp:ready')
    game.loadingEnd()
    setLobbyReady(true)
    onReady?.()
  }, [warmedUp, firstFrame, lobbyWarm, game, onReady])

  // A lost context (GPU reset, too many tabs, backgrounded on mobile) is recovered by
  // remounting the canvas, which builds a fresh context and re-uploads everything.
  const handleCreated = useCallback(({ gl }) => {
    performance.mark('pp:gl-created')
    gl.setClearColor(SKY_THEMES.golden.fog)
    gl.debug.checkShaderErrors = import.meta.env.DEV
    attachIconRenderer(gl)
    const canvas = gl.domElement
    let remountTimer = null
    const remount = () => {
      clearTimeout(remountTimer)
      setContextLost(false)
      setContextKey((k) => k + 1)
    }
    canvas.addEventListener('webglcontextlost', (e) => {
      if (!canvas.isConnected) return
      e.preventDefault()
      setContextLost(true)
      remountTimer = setTimeout(remount, 1500)
    })
    canvas.addEventListener('webglcontextrestored', remount)
  }, [])

  const handleDecline = useCallback(() => setTimeout(degrade, 0), [degrade])
  const handleIncline = useCallback(() => setTimeout(recover, 0), [recover])

  const dpr = Math.min(settings.dpr, window.devicePixelRatio || 1) * renderScale

  const createRenderer = useMemo(
    () => (defaults) => {
      performance.mark('pp:gl-start')
      const renderer = new WebGLRenderer({ ...defaults, alpha: false, antialias, stencil: false, powerPreference: 'high-performance' })
      performance.mark('pp:gl-end')
      return renderer
    },
    [antialias],
  )

  return (
    <>
      <Canvas
        key={`${contextKey}:${rebuild}`}
        frameloop={adBreak ? 'never' : 'always'}
        dpr={dpr}
        gl={createRenderer}
        shadows={settings.shadows === 'realtime' ? 'percentage' : false}
        // No tone mapping: the palette is chosen to look right as-is.
        flat
        camera={{ position: [0, 8, 34], fov: 62, near: 0.3, far: settings.viewDistance }}
        onCreated={handleCreated}
      >
        <fog attach="fog" args={[sky.fog, settings.fogNear, settings.viewDistance * 0.95]} />
        <ViewDistance far={settings.viewDistance} />
        <PerformanceMonitor bounds={() => [45, 58]} flipflops={4} onDecline={handleDecline} onIncline={handleIncline} />

        <FrameStart />
        <Environment />
        <Lobby />
        <Harbour />
        <Seagulls />
        <PlayerCar />
        <Ghost />
        <RemoteCars />
        <CarFx />
        <NightLights />
        <Particles />
        <SkidMarks />
        {lobbyReady && playable && <StageLoader />}
        {lobbyReady && playable && (
          <Suspense fallback={null}>
            <MissileFx />
          </Suspense>
        )}
        {lobbyReady && playable && stage && (
          <Suspense fallback={<WarmHold />}>
            <StageWorld key={stage.id} stage={stage} />
          </Suspense>
        )}
        {warmedUp && firstFrame && <LobbyWarmup onDone={handleLobbyWarm} />}
        {lobbyReady && playable && <StageWarmup />}
        <StartGateBar />

        <ChaseCamera />
        <ShaderWarmup onDone={handleWarmedUp} />
        {warmedUp && <FirstFrameSignal onFirstFrame={handleFirstFrame} />}
        <PerfProbe />
        {showDevPerf && DevPerf && (
          <ErrorBoundary>
            <Suspense fallback={null}>
              <DevPerf position="bottom-right" minimal />
            </Suspense>
          </ErrorBoundary>
        )}
      </Canvas>

      {(contextLost || rebuilding) && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-sky-400/80 text-2xl text-white">
          <span className="pp-stroke">Reloading graphics…</span>
        </div>
      )}
    </>
  )
}

export default GameScene
