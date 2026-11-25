import { useEffect, useRef } from 'react'

import { chapterLabel } from '@shared/chapters'
import { isStageUnlocked } from '@shared/logic'
import { stageInfo } from '@shared/stages/index'

import { travelWhenUnlocked } from '../../game/stageRuntime'
import { heat } from '../../game/world/heat/heatState'
import { useGame } from '../../store/game'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { IS_TOUCH } from '../touch'
import { mapGradient } from './mapStyle'
import { ChunkyButton, CoinAmount, Keycap } from './parts'
import { requestLobby } from './requests'
import { card, formatTime, GRADIENTS, HAZARD_TRIM, INSET, u } from './style'
import { setStyle, setText, useLive } from './useLive'

/** One stat on the finish card: a caption over a recessed value box. */
function Stat({ label, children }) {
  return (
    <div className="hud-finish-stat flex flex-col items-center" style={{ ...INSET, borderRadius: u(18), padding: `${u(10)} ${u(22)} ${u(14)}`, gap: u(4), minWidth: u(250) }}>
      <span className="pp-stroke" style={{ fontSize: u(22), color: '#9fe9ff' }}>
        {label}
      </span>
      {children}
    </div>
  )
}

/**
 * Heat Run's bounty for the run (banked at every checkpoint plaza and cashed in at the
 * finish, game/world/heat/policeSim.js): read live, since the last of it is banked the frame
 * after the finish.
 */
function BountyStat() {
  const boxRef = useRef(null)
  const valueRef = useRef(null)
  useLive(() => {
    setStyle(boxRef.current, 'display', heat.banked > 0 ? 'flex' : 'none')
    setText(valueRef.current, heat.banked.toLocaleString())
  })
  return (
    <div ref={boxRef} style={{ display: 'none' }}>
      <Stat label="BOUNTY">
        <span ref={valueRef} className="pp-stroke tabular-nums" style={{ fontSize: u(52), lineHeight: 1.1, color: '#ffd23a' }} />
      </Stat>
    </div>
  )
}

/**
 * The finish: your stage time, coins earned this run and whether it's a new best
 * (`store.finishResult`, `best` is true for a new record or the old best in ms).
 * A medal pops in over slowly turning sun rays; the stats sit in recessed boxes.
 * The first finish of a chapter that opens the next one (`result.unlock`) says so -
 * "CHAPTER 2 UNLOCKED: GRAND TOUR!" - with a button (and Enter) to travel there now
 * (it waits a moment for the server to confirm the unlock if it hasn't yet).
 */
export function FinishCard() {
  const result = useGame((s) => s.finishResult)
  const stageId = useGame((s) => s.stageId)
  const setFinishResult = useGame((s) => s.setFinishResult)
  const unlock = result?.unlock || null
  const confirmed = useGame((s) => (unlock ? isStageUnlocked(s.profile, unlock) : false))

  useEffect(() => {
    if (!unlock) return undefined
    const onKey = (e) => {
      if (e.key !== 'Enter' || e.repeat) return
      e.preventDefault()
      travelWhenUnlocked(unlock)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [unlock])

  if (!result) return null
  const next = unlock ? stageInfo(unlock) : null
  const newBest = result.best === true
  const oldBest = typeof result.best === 'number' && result.best > 0 ? result.best : 0

  const close = () => setFinishResult(null)
  const again = () => {
    close()
    requestLobby()
  }

  return (
    <div className="pp-backdrop pp-font pointer-events-auto absolute inset-0 z-30 flex items-center justify-center">
      <div className="relative flex items-center justify-center" style={{ width: `min(${u(860)}, 94vw)` }}>
        <div className="hud-finish-rays pointer-events-none absolute" aria-hidden="true" />
        <div className="pp-panel-in relative flex w-full flex-col items-center" style={{ ...card(28), marginTop: u(56) }}>
          <div className="w-full overflow-hidden" style={{ height: u(18), background: HAZARD_TRIM, borderRadius: `${u(24)} ${u(24)} 0 0` }} />
          <div className="hud-finish-medal absolute flex items-center justify-center" style={{ top: u(-62), width: u(124), height: u(124) }}>
            <Icon name="flag" size={u(78)} />
          </div>
          <div className="flex flex-col items-center text-center" style={{ padding: `${u(58)} ${u(30)} ${u(28)}`, gap: u(14) }}>
            <span className="hud-finish-title" style={{ fontSize: `min(${u(74)}, 9vw)`, lineHeight: 1 }}>
              <StrokeText stroke="0.18em" gradient={GRADIENTS.title}>
                CRANE SUMMIT!
              </StrokeText>
            </span>
            {newBest ? (
              <span className="hud-new-best hud-finish-ribbon" style={{ fontSize: u(30) }}>
                <StrokeText stroke={u(7)}>NEW BEST TIME!</StrokeText>
              </span>
            ) : (
              <span className="pp-stroke" style={{ fontSize: u(26), color: '#9fe9ff' }}>
                STAGE CLEAR
              </span>
            )}
            <div className="flex flex-wrap justify-center" style={{ gap: u(16) }}>
              <Stat label="TIME">
                <span className="tabular-nums" style={{ fontSize: u(60), lineHeight: 1 }}>
                  <StrokeText stroke={u(12)} gradient={newBest ? GRADIENTS.green : undefined}>
                    {formatTime(result.timeMs)}
                  </StrokeText>
                </span>
                {oldBest > 0 && (
                  <span className="pp-stroke tabular-nums" style={{ fontSize: u(20), color: '#9fb0d6' }}>
                    {`BEST ${formatTime(oldBest)}`}
                  </span>
                )}
              </Stat>
              {Number(result.coins) > 0 && (
                <Stat label="EARNED">
                  <CoinAmount amount={result.coins} size={52} style={{ minHeight: u(60) }} />
                </Stat>
              )}
              {stageInfo(stageId)?.mode === 'heat' && <BountyStat />}
            </div>
            {next && (
              <div className="hud-unlock pp-panel-in flex flex-col items-center" style={{ background: mapGradient(next), borderRadius: u(18), padding: `${u(10)} ${u(26)}`, border: `${u(4)} solid #0d1530`, gap: u(2) }}>
                <span className="hud-new-best" style={{ fontSize: `min(${u(36)}, 6vw)`, lineHeight: 1.05 }}>
                  <StrokeText stroke={u(8)}>{`${chapterLabel(next.id) || next.short} UNLOCKED: ${next.short}!`}</StrokeText>
                </span>
                <span className="pp-stroke" style={{ fontSize: u(20) }}>
                  {next.zones ? next.zones.map((z) => z.name).join(' · ') : next.tagline}
                </span>
              </div>
            )}
            <div className="flex flex-wrap justify-center" style={{ gap: u(18), marginTop: u(8) }}>
              {next && (
                <ChunkyButton onClick={() => travelWhenUnlocked(next.id)} gradient={GRADIENTS.goldButton} radius={20} border={5} ready style={{ height: u(92), padding: `0 ${u(30)}`, gap: u(12) }}>
                  <span style={{ fontSize: u(36) }}>
                    <StrokeText stroke={u(8)}>{confirmed ? `GO TO ${chapterLabel(next.id) || next.short}` : 'UNLOCKING…'}</StrokeText>
                  </span>
                  {!IS_TOUCH && <Keycap size={20}>ENTER</Keycap>}
                </ChunkyButton>
              )}
              <ChunkyButton onClick={again} gradient={GRADIENTS.greenButton} radius={20} border={5} ready={!next} style={{ height: u(92), padding: `0 ${u(36)}` }}>
                <span style={{ fontSize: u(38) }}>
                  <StrokeText stroke={u(8)}>DRIVE AGAIN</StrokeText>
                </span>
              </ChunkyButton>
              <ChunkyButton onClick={close} gradient={GRADIENTS.navyButton} radius={20} border={5} style={{ height: u(92), padding: `0 ${u(36)}` }}>
                <span style={{ fontSize: u(38) }}>
                  <StrokeText stroke={u(8)}>LOOK AROUND</StrokeText>
                </span>
              </ChunkyButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default FinishCard
