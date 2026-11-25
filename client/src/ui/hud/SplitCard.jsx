import { useEffect, useState } from 'react'

import { useGame } from '../../store/game'
import { card, formatDelta, formatTime, GRADIENTS, u } from './style'
import { flatOf } from '../flatFill'

/** How long the card stays up, ms (matches the hud-split keyframes in index.css). */
const SPLIT_MS = 3000

const DELTA = {
  faster: 'linear-gradient(180deg, #8dff6a 0%, #3fd97a 55%, #149a52 100%)',
  slower: 'linear-gradient(180deg, #ff9a8a 0%, #ff4a3d 55%, #c4162a 100%)',
  first: GRADIENTS.goldButton,
}

/**
 * Under the checkpoint card for ~3 s after each checkpoint (`store.lastSplit`): the
 * split you just drove and how it compares with your best there before this run.
 * Re-renders only when a checkpoint is reached.
 */
export function SplitCard() {
  const split = useGame((s) => s.lastSplit)
  const total = useGame((s) => (s.stage ? s.stage.checkpoints.length - 1 : Infinity))
  const [expired, setExpired] = useState(null)

  useEffect(() => {
    if (!split) return undefined
    const id = setTimeout(() => setExpired(split.id), SPLIT_MS)
    return () => clearTimeout(id)
  }, [split])

  if (!split || expired === split.id) return null

  const best = Number(split.bestMs) || 0
  const diff = split.splitMs - best
  const kind = !best ? 'first' : diff <= 0 ? 'faster' : 'slower'
  const label = split.index >= total ? 'FINISH' : `CP ${split.index}`

  return (
    <div className="hud-split">
      <div
        key={split.id}
        className="hud-split-in flex items-center"
        style={{ ...card(18), gap: u(14), padding: `${u(7)} ${u(8)} ${u(7)} ${u(10)}` }}
      >
        <span className="hud-cp-tag pp-stroke" style={{ fontSize: u(22) }}>
          {label}
        </span>
        <span className="pp-stroke tabular-nums leading-none" style={{ fontSize: u(40) }}>
          {formatTime(split.splitMs)}
        </span>
        <span
          className="pp-stroke hud-split-delta tabular-nums"
          data-kind={kind}
          style={{ background: flatOf(DELTA[kind]), fontSize: u(26), padding: `${u(4)} ${u(14)}`, borderRadius: u(12), border: `${u(3)} solid #0d1530` }}
        >
          {kind === 'first' ? 'FIRST TIME' : formatDelta(diff)}
        </span>
      </div>
    </div>
  )
}

export default SplitCard
