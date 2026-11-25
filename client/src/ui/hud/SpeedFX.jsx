import { useRef } from 'react'

import { runtime } from '../../game/runtime'
import { useQuality } from '../../store/quality'
import { setData, setStyle, useLive } from './useLive'

/** Speed lines start showing here and are at full strength by FULL_KMH. */
const START_KMH = 110
const FULL_KMH = 170
/** Strength floor while boosting (nitro or a boost pad), so a boost always reads. */
const BOOST_FLOOR = 0.55
/** Max opacity of the layer: LOW keeps it subtler (small screens, weaker GPUs). */
const MAX_OPACITY = { LOW: 0.5, MEDIUM: 0.85, HIGH: 0.9 }

/**
 * Full-screen speed lines + edge vignette, CSS only (.hud-speedfx in index.css): one
 * element with static conic/radial gradients and a mask, faded by opacity and jittered
 * by a stepped transform - compositor work only, no blur or backdrop filters.
 *
 * Driven by the live loop (no React renders). Hidden with display:none below
 * START_KMH, which also stops its animation and frees its layer.
 */
export function SpeedFX() {
  const ref = useRef(null)
  // Smoothed strength 0..1; only the live writer touches it.
  const level = useRef(0)

  useLive(() => {
    const el = ref.current
    if (!el) return
    const car = runtime.car
    const kmh = Math.abs(car.speedKmh) || 0
    let target = Math.min(1, Math.max(0, (kmh - START_KMH) / (FULL_KMH - START_KMH)))
    if (car.boosting && kmh > 20) target = Math.max(target, BOOST_FLOOR + target * (1 - BOOST_FLOOR))
    // Quick to come in, slower to fade, so it doesn't flicker over bumps.
    const v = level.current + (target - level.current) * (target > level.current ? 0.3 : 0.12)
    level.current = v < 0.01 && target === 0 ? 0 : v
    const on = level.current > 0.01
    setStyle(el, 'display', on ? 'block' : 'none')
    if (!on) return
    const max = MAX_OPACITY[useQuality.getState().level] ?? MAX_OPACITY.LOW
    setStyle(el, 'opacity', (level.current * max).toFixed(2))
    setData(el, 'boost', car.boosting ? '1' : '0')
  })

  return <div ref={ref} className="hud-speedfx" aria-hidden="true" />
}

export default SpeedFX
