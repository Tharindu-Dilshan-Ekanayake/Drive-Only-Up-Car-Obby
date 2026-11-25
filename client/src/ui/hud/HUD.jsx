import { lazy, Suspense } from 'react'

import { stageInfo } from '@shared/stages/index'

import { useGame } from '../../store/game'
import { FlatFill } from '../flatFill'
import { IS_TOUCH } from '../touch'
import AltitudeRail from './AltitudeRail'
import BrandCorner from './BrandCorner'
import CheckpointCard from './CheckpointCard'
import DriftMeter from './DriftMeter'
import FinishCard from './FinishCard'
import ItemSlots from './ItemSlots'
import NameTag from './NameTag'
import NitroBar from './NitroBar'
import PadPrompt from './PadPrompt'
import SectionBanner from './SectionBanner'
import SpeedFX from './SpeedFX'
import SpeedGauge from './SpeedGauge'
import SplitCard from './SplitCard'
import Toasts from './Toasts'
import { u } from './style'
import './hudFlat.css'

/** Heat Run's heat stars / BUSTED meter (its own lazy chunk), only on a `mode: 'heat'` map. */
const HeatHud = lazy(() => import('./HeatHud'))
function ModeHud() {
  const mode = useGame((s) => stageInfo(s.stageId)?.mode)
  if (mode !== 'heat') return null
  return (
    <Suspense fallback={null}>
      <HeatHud />
    </Suspense>
  )
}

/** A small "Reconnecting…" chip while the connection is down mid-game. */
function NetChip() {
  const mode = useGame((s) => s.net.mode)
  const message = useGame((s) => s.net.message)
  if (mode !== 'connecting' || !message) return null
  return (
    <div
      className="hud-net pp-stroke"
      style={{ fontSize: u(22), padding: `${u(4)} ${u(14)}`, borderRadius: u(12), background: 'rgba(13,21,48,0.75)' }}
    >
      {message}
    </div>
  )
}

/**
 * The in-game HUD, laid out for Up We Drive (positions live in index.css so the media
 * queries and the touch layout can move them):
 *
 * - behind everything: the speed-lines / vignette layer (SpeedFX)
 * - top left: the brand card (logo, coins, pearls) over the menu dock, every button
 *   wearing its keyboard shortcut (BrandCorner)
 * - top centre: the timer card (next checkpoint, section, split timer, best) and, for
 *   a few seconds after each checkpoint, the split card under it
 * - right edge: your name tag (opens the garage), altitude + race position and the
 *   climbing rail with every racer on it
 * - bottom left: the speedometer (AIR tag above it)
 * - bottom centre: the nitro bar (SHIFT) over the item slots (Q / E / F)
 *   (touch: gauge bottom centre with the nitro bar over it, items on the TouchControls)
 * - upper middle: one column - connection chip, live drift meter, section banner, toasts - so they
 *   stack instead of overlapping when a checkpoint fires them all at once
 * - centre: the drive-in pad prompt and the finish card
 *
 * Everything that changes per frame is written by the live loop (useLive.js), so this
 * tree only re-renders on real game events.
 */
/**
 * The HUD draws flat (FlatFill, ./hudFlat.css): solid fills, hard offset shadows and the
 * hazard stripes - no smooth gradients, blurs, filters or idle animations - so the browser
 * has only a handful of GPU raster shaders to build the first time it paints it (they cost
 * ~3 s of GPU time on a cold browser, a freeze right after the loading screen).
 */
export function HUD() {
  return (
    <FlatFill.Provider value>
      <div className="hud-root pp-font pointer-events-none absolute inset-0 z-20 select-none" data-touch={IS_TOUCH ? '1' : '0'}>
        <SpeedFX />
        <BrandCorner />
        <div className="hud-top pointer-events-none absolute">
          <CheckpointCard />
          <SplitCard />
        </div>
        <div className="hud-right pointer-events-none absolute flex flex-col items-end">
          <NameTag />
          <AltitudeRail />
        </div>
        <SpeedGauge />
        <div className="hud-dock pointer-events-none absolute flex flex-col items-center">
          <NitroBar />
          <ItemSlots />
        </div>
        <div className="hud-center pointer-events-none absolute flex flex-col items-center" style={{ gap: u(10) }}>
          <NetChip />
          <DriftMeter />
          <SectionBanner />
          <Toasts />
        </div>
        <ModeHud />
        <PadPrompt />
        <FinishCard />
      </div>
    </FlatFill.Provider>
  )
}

export default HUD
