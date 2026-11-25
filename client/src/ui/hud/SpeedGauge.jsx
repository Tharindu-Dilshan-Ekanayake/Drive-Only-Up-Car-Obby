import { useRef } from 'react'

import { runtime } from '../../game/runtime'
import Icon from '../Icon'
import { nitroState } from './nitro'
import { setData, setStyle, setText, useLive } from './useLive'

/** The dial's scale: full sweep at this speed. */
const MAX_KMH = 220
/** The dials cover 270 degrees, open at the bottom. */
const SWEEP = 0.75
const R_SPEED = 80
const R_NITRO = 62
const C_SPEED = 2 * Math.PI * R_SPEED
const C_NITRO = 2 * Math.PI * R_NITRO
/** The AIR tag shows once you've been airborne this long, s... */
const AIR_SHOW_S = 0.6
/** ...and keeps your final airtime up this long after landing, ms. */
const AIR_HOLD_MS = 900

/**
 * Static dial art (computed once): notches across the speed track every 10 km/h so the
 * arc reads as a segmented bar, and a red zone from REDLINE up just outside it.
 * Angles follow the arcs: 0 km/h at bottom-left, sweeping clockwise.
 */
const REDLINE = 180
const angle = (kmh) => ((135 + (kmh / MAX_KMH) * 270) * Math.PI) / 180
const at = (a, r) => `${(100 + Math.cos(a) * r).toFixed(1)} ${(100 + Math.sin(a) * r).toFixed(1)}`
function tickPaths() {
  let notches = ''
  for (let v = 10; v < MAX_KMH; v += 10) notches += `M${at(angle(v), 72.5)}L${at(angle(v), 87.5)}`
  const red = `M${at(angle(REDLINE), 90.5)}A90.5 90.5 0 0 1 ${at(angle(MAX_KMH), 90.5)}`
  return { notches, red }
}
const TICKS = tickPaths()

/**
 * Speedometer with the nitro tank as an inner arc. The arcs are SVG circles whose
 * dash offset the live loop moves - no re-renders while you drive. State the CSS
 * animates (nitro full / empty, boosting, braking) goes on data attributes:
 * - nitro full: the arc and the nitro icon pulse
 * - nitro empty while you press it: the tank track flashes red and the icon shakes
 * - boosting: a cyan ring fades in around the dial
 * - braking: the number turns red
 * - past the red line: the speed arc turns orange-red
 * A white needle tip rides the front of the speed arc so the dial reads at a glance.
 * Above the dial, an "AIR 1.4s" tag counts long jumps.
 */
export function SpeedGauge() {
  const speedArc = useRef(null)
  const nitroArc = useRef(null)
  const numRef = useRef(null)
  const rootRef = useRef(null)
  const airRef = useRef(null)
  const airNumRef = useRef(null)
  const needleRef = useRef(null)
  // Airtime bookkeeping for the live writer only: last value shown and when it lands.
  const air = useRef({ last: 0, until: 0 })

  useLive((now) => {
    const car = runtime.car
    const root = rootRef.current
    const kmh = Math.abs(car.speedKmh) || 0
    const s = Math.min(1, kmh / MAX_KMH)
    setStyle(speedArc.current, 'strokeDashoffset', String((C_SPEED * (1 - s * SWEEP)).toFixed(1)))
    setStyle(nitroArc.current, 'strokeDashoffset', String((C_NITRO * (1 - Math.min(1, Math.max(0, car.nitro)) * SWEEP)).toFixed(1)))
    setText(numRef.current, String(Math.round(kmh)))
    setStyle(needleRef.current, 'transform', `rotate(${(-135 + s * 270).toFixed(1)}deg)`)
    setData(root, 'red', kmh >= REDLINE ? '1' : '0')
    setData(root, 'nitro', nitroState(car, runtime.input))
    setData(root, 'boost', car.boosting ? '1' : '0')
    setData(root, 'brake', car.braking && kmh > 3 ? '1' : '0')

    // AIR tag: live while airborne, then holds the final time briefly after landing.
    const a = air.current
    const t = car.airTime || 0
    if (t > AIR_SHOW_S) {
      a.last = t
      a.until = now + AIR_HOLD_MS
    } else if (a.last && now > a.until) {
      a.last = 0
    }
    const showing = a.last > 0
    setStyle(airRef.current, 'display', showing ? 'flex' : 'none')
    if (showing) {
      setText(airNumRef.current, a.last.toFixed(1))
      setData(airRef.current, 'landed', t > AIR_SHOW_S ? '0' : '1')
    }
  })

  return (
    <div ref={rootRef} className="hud-gauge pointer-events-none absolute">
      <div className="hud-gauge-ring" />
      <svg viewBox="0 0 200 200" className="relative h-full w-full" aria-hidden="true">
        {/* Flat fills (no SVG gradients): the HUD draws flat, see ../flatFill.js. */}
        <circle cx="100" cy="100" r="96" fill="#172b62" stroke="#0d1530" strokeWidth="6" />
        <circle cx="100" cy="100" r="92.5" fill="none" stroke="#3d86c4" strokeWidth="2" opacity="0.85" />
        <path d={TICKS.red} fill="none" stroke="#ff5a4a" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="100" cy="100" r="44" fill="rgba(6,12,34,0.45)" />
        {/* Tracks, then the live arcs over them. Rotated so the gap sits at the bottom. */}
        <g transform="rotate(135 100 100)" fill="none" strokeLinecap="round">
          <circle cx="100" cy="100" r={R_SPEED} stroke="rgba(6,12,34,0.6)" strokeWidth="14" strokeDasharray={`${C_SPEED * SWEEP} ${C_SPEED}`} />
          <circle
            ref={speedArc}
            className="hud-speed-arc"
            cx="100"
            cy="100"
            r={R_SPEED}
            stroke="#ffc41f"
            strokeWidth="14"
            strokeDasharray={`${C_SPEED} ${C_SPEED}`}
            strokeDashoffset={C_SPEED}
          />
          <circle
            className="hud-nitro-track"
            cx="100"
            cy="100"
            r={R_NITRO}
            stroke="rgba(95,227,255,0.18)"
            strokeWidth="9"
            strokeDasharray={`${C_NITRO * SWEEP} ${C_NITRO}`}
          />
          <circle
            ref={nitroArc}
            className="hud-nitro-arc"
            cx="100"
            cy="100"
            r={R_NITRO}
            stroke="#5fe3ff"
            strokeWidth="9"
            strokeDasharray={`${C_NITRO} ${C_NITRO}`}
            strokeDashoffset={C_NITRO * (1 - SWEEP)}
          />
        </g>
        <path d={TICKS.notches} stroke="rgba(13,21,48,0.85)" strokeWidth="2" />
        {/* Needle tip riding the front of the speed arc (turned by the live loop). */}
        <g ref={needleRef} className="hud-needle" style={{ transformOrigin: '100px 100px', transform: 'rotate(-135deg)' }}>
          <path d="M100 6L100 30" stroke="#0d1530" strokeWidth="9" strokeLinecap="round" />
          <path d="M100 8L100 28" stroke="#ffffff" strokeWidth="4.5" strokeLinecap="round" />
        </g>
        {/* Glass: a soft highlight over the top of the dial. */}
        <path d="M30 78A72 72 0 0 1 170 78Q100 58 30 78z" fill="#ffffff" fillOpacity="0.1" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span ref={numRef} className="hud-gauge-num pp-stroke leading-none tabular-nums" style={{ fontSize: 'calc(var(--gauge) * 0.3)' }}>
          0
        </span>
        <span className="pp-stroke" style={{ fontSize: 'calc(var(--gauge) * 0.1)', color: '#ffc41f', marginTop: 'calc(var(--gauge) * -0.01)' }}>
          KM/H
        </span>
      </div>
      <div className="absolute flex items-center justify-center" style={{ left: 0, right: 0, bottom: '6%' }}>
        <span className="hud-nitro-icon inline-flex">
          <Icon name="nitro" size="calc(var(--gauge) * 0.15)" />
        </span>
      </div>
      <div ref={airRef} className="hud-air pp-stroke absolute items-baseline" style={{ display: 'none' }}>
        <span className="hud-air-label">AIR</span>
        <span ref={airNumRef} className="tabular-nums">
          0.0
        </span>
        <span className="hud-air-label">s</span>
      </div>
    </div>
  )
}

export default SpeedGauge
