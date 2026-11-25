import { useEffect } from 'react'

import { chapterLabel, chapterTitle, lockedMessage, unlockedByFinishing } from '@shared/chapters'
import { isStageUnlocked, lastCheckpoint, progressOf } from '@shared/logic'
import { getStage, stageInfo } from '@shared/stages/index'

import { sfx } from '../../audio/sfx'
import { runtime } from '../../game/runtime'
import { travelTo } from '../../game/stageRuntime'
import { useGame } from '../../store/game'
import { IS_TOUCH } from '../touch'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { LOCKED_GRADIENT, mapGradient } from './mapStyle'
import { ChunkyButton, Keycap } from './parts'
import { GRADIENTS, u } from './style'

const PADS = {
  spin: { title: 'CAR SPIN', icon: 'spin', gradient: GRADIENTS.goldButton },
  garage: { title: 'GARAGE', icon: 'garage', gradient: GRADIENTS.tealButton },
  store: { title: 'STORE', icon: 'store', gradient: GRADIENTS.greenButton },
}

/** The map a portal pad leads to: `'portal:<id>'` (lobby) or `'exit:<id>'` (a finish plaza). */
function padMap(pad) {
  if (typeof pad !== 'string') return null
  const id = pad.startsWith('portal:') ? pad.slice(7) : pad.startsWith('exit:') ? pad.slice(5) : null
  return id ? stageInfo(id) : null
}

/**
 * A locked chapter's prompt: how to unlock it, with your progress on the map that
 * unlocks it ("Checkpoint 12 / 29" - the total once that map's stage is loaded).
 */
function lockedDef(info, profile) {
  const need = unlockedByFinishing(info.id)
  const best = progressOf(profile, need).best.checkpoint
  const stage = getStage(need)
  const progress = stage ? `Checkpoint ${best} / ${lastCheckpoint(stage)}` : `Best: checkpoint ${best}`
  return {
    title: 'LOCKED',
    sub: lockedMessage(info.id),
    detail: `${stageInfo(need)?.name || 'Progress'}: ${progress}`,
    icon: 'lock',
    gradient: LOCKED_GRADIENT,
    locked: true,
  }
}

/**
 * A map portal's prompt: `'portal:<map id>'` -> travel there; `'exit:<map id>'` (a
 * finish plaza's exit portal) travels by itself (game/stageRuntime.js) - the prompt only
 * shows while the server is still confirming the unlock you just earned. A chapter you
 * haven't unlocked shows how to (no travel).
 */
function portalDef(pad, profile) {
  const info = padMap(pad)
  if (!info) return null
  if (!isStageUnlocked(profile, info.id)) {
    // Just finished the map that unlocks it: the server's word is on its way.
    const stage = getStage(unlockedByFinishing(info.id))
    if (pad.startsWith('exit:') && stage && runtime.race.checkpoint >= lastCheckpoint(stage)) {
      return { title: `UNLOCKING ${chapterLabel(info.id) || info.short}…`, sub: chapterTitle(info.id), icon: 'lock', gradient: mapGradient(info), waiting: true }
    }
    return lockedDef(info, profile)
  }
  // A map of zones (the Grand Tour) lists them, in its zones' colours.
  const zones = info.zones || null
  const chapter = chapterLabel(info.id)
  const about = zones ? zones.map((z) => z.name).join(' · ') : info.tagline
  return {
    title: pad.startsWith('exit:') ? `ON TO ${info.name.toUpperCase()}!` : `TRAVEL TO ${info.name.toUpperCase()}?`,
    sub: chapter ? `${chapter} · ${about}` : about,
    icon: 'flag',
    gradient: mapGradient(info),
    go: () => travelTo(info.id),
  }
}

/** What Enter / the button does on `pad`. */
function activate(pad) {
  const s = useGame.getState()
  if (s.panel || !pad || s.travel) return
  const portal = portalDef(pad, s.profile)
  if (portal?.go) portal.go()
  else if (portal?.locked) sfx.error()
  else if (!portal) s.openPanel(pad)
}

/**
 * Parked on a drive-in pad (store.pad): a big button to open its panel - or, on a map
 * portal, to travel to that map. Enter does it too. Hidden while a panel is open.
 */
export function PadPrompt() {
  const pad = useGame((s) => s.pad)
  const panel = useGame((s) => s.panel)
  const profile = useGame((s) => s.profile)
  const def = PADS[pad] || portalDef(pad, profile)

  useEffect(() => {
    if (!def) return undefined
    const onKey = (e) => {
      if (e.key !== 'Enter' || e.repeat) return
      activate(useGame.getState().pad)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [def])

  if (!def || panel) return null
  return (
    <div className="hud-pad pointer-events-none absolute">
      <div className="hud-pad-float flex flex-col items-center" style={{ gap: u(10) }}>
        <ChunkyButton
          onClick={() => activate(pad)}
          gradient={def.gradient}
          radius={24}
          border={5}
          ready={!def.locked && !def.waiting}
          className="hud-pad-btn"
          style={{ height: u(104), padding: `0 ${u(38)} 0 ${u(26)}`, gap: u(14) }}
        >
          <Icon name={def.icon} size={u(76)} />
          <span style={{ fontSize: u(def.sub ? 40 : 48) }}>
            <StrokeText stroke={u(10)}>{def.title}</StrokeText>
          </span>
        </ChunkyButton>
        {def.sub && (
          <span className="hud-pad-hint pp-stroke" style={{ fontSize: u(22) }}>
            {def.sub}
          </span>
        )}
        {def.detail && (
          <span className="hud-pad-hint pp-stroke tabular-nums" style={{ fontSize: u(24), color: '#ffd52a' }}>
            {def.detail}
          </span>
        )}
        {!def.locked && !def.waiting && (
          <span className="hud-pad-hint pp-stroke flex items-center" style={{ fontSize: u(24), gap: u(8) }}>
            {IS_TOUCH ? (
              def.go ? 'Tap to travel' : 'Tap to open'
            ) : (
              <>
                Press <Keycap size={20}>ENTER</Keycap> or click{def.go ? ' to travel' : ''}
              </>
            )}
          </span>
        )}
      </div>
    </div>
  )
}

export default PadPrompt
