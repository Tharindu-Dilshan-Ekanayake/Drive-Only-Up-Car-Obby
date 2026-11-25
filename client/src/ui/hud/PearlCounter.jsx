import { useEffect, useRef } from 'react'

import { countPearls } from '@shared/logic'

import { useMapProgress } from '../../game/stageRuntime'
import { useGame } from '../../store/game'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { GRADIENTS, u } from './style'
import { replayClass } from './useLive'

/**
 * Sky Pearls found (one hidden on every road; shared/adventure.js), under the coins in
 * the brand card.
 * Bumps when a new one is found. Re-renders only when the count changes.
 */
export function PearlCounter() {
  const pearls = useMapProgress().pearls
  const stage = useGame((s) => s.stage)
  const total = stage ? stage.pearls.length : 0
  const found = stage ? countPearls(pearls, stage) : 0
  const prev = useRef(found)
  const ref = useRef(null)

  useEffect(() => {
    if (found > prev.current) replayClass(ref.current, 'pp-bump')
    prev.current = found
  }, [found])

  const done = total > 0 && found === total
  return (
    <div
      ref={ref}
      className="hud-pearls hud-chip pp-bump-wrap pointer-events-none relative flex items-center"
      data-done={done ? '1' : '0'}
      title="Sky Pearls: one is hidden on every road"
      style={{ gap: u(8) }}
    >
      <span className="hud-pearls-icon absolute" style={{ left: u(-12), top: '50%', marginTop: u(-25) }}>
        <Icon name="pearl" size={u(50)} />
      </span>
      <span className="tabular-nums" style={{ fontSize: u(28), lineHeight: 1 }}>
        <StrokeText stroke={u(6)} gradient={done ? GRADIENTS.green : 'linear-gradient(180deg, #ffffff 0%, #ffe6f3 55%, #f3a9d2 100%)'}>
          {total ? `${found}/${total}` : '-'}
        </StrokeText>
      </span>
      <span className="hud-pearls-label pp-stroke" style={{ fontSize: u(15), lineHeight: 1 }}>
        {done ? 'ALL FOUND!' : 'PEARLS'}
      </span>
    </div>
  )
}

export default PearlCounter
