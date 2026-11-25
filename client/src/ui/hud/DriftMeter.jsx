import { useRef } from 'react'

import { runtime } from '../../game/runtime'
import { setData, setStyle, setText, useLive } from './useLive'

/** A slide has to last this long before the meter shows, s (no flicker on twitchy steering). */
const SHOW_AFTER = 0.35

/**
 * Live drift counter at the top of the centre column: multiplier, points so far and
 * how long you've held it. It dims while the drift is about to end (the grace period)
 * so you can see you need to keep sliding. Written by the live loop, no re-renders.
 */
export function DriftMeter() {
  const rootRef = useRef(null)
  const multRef = useRef(null)
  const scoreRef = useRef(null)
  const timeRef = useRef(null)

  useLive(() => {
    const d = runtime.car.drift
    const show = d.active && d.time > SHOW_AFTER
    setStyle(rootRef.current, 'display', show ? 'flex' : 'none')
    if (!show) return
    setText(multRef.current, `x${d.mult.toFixed(1)}`)
    setText(scoreRef.current, `+${Math.round(d.score).toLocaleString()}`)
    setText(timeRef.current, `${d.time.toFixed(1)}s`)
    setData(rootRef.current, 'fading', d.grace > 0 ? '1' : '0')
    setData(rootRef.current, 'hot', d.mult >= 2 ? '1' : '0')
  })

  return (
    <div ref={rootRef} className="hud-drift pp-stroke flex-col items-center" style={{ display: 'none' }}>
      <div className="hud-drift-title flex items-baseline">
        <span>DRIFT</span>
        <span ref={multRef} className="hud-drift-mult tabular-nums">
          x1.0
        </span>
      </div>
      <span ref={scoreRef} className="hud-drift-score tabular-nums">
        +0
      </span>
      <span ref={timeRef} className="hud-drift-time tabular-nums">
        0.0s
      </span>
    </div>
  )
}

export default DriftMeter
