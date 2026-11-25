import { useEffect, useRef } from 'react'

import { MAX_SLOTS } from '@shared/balance'

import { ITEMS, requestItem } from '../game/player/items'
import { runtime } from '../game/runtime'
import { useGame } from '../store/game'
import Icon from './Icon'
import { IS_TOUCH } from './touch'

const INK = '#0d1530'
const HAZARD_RING = `repeating-conic-gradient(from 0deg, #ffc41f 0 10deg, ${INK} 10deg 20deg)`

/** How far from the pad's centre (fraction of its half-width) a thumb steers fully. */
const STEER_FULL = 0.75
const STEER_DEADZONE = 0.08

const mark = (el, down) => {
  if (el) el.dataset.down = down ? '1' : '0'
}

/**
 * Pointer handlers for a hold-to-act button: `set(true)` while a finger is on it,
 * `set(false)` when it lifts, slides off the screen or the browser cancels it. The
 * pointer is captured, so sliding the thumb a little never drops the press.
 */
function holdHandlers(set) {
  const release = (e) => {
    mark(e.currentTarget, false)
    set(false)
  }
  return {
    onPointerDown: (e) => {
      e.preventDefault()
      e.currentTarget.setPointerCapture?.(e.pointerId)
      mark(e.currentTarget, true)
      set(true)
    },
    onPointerUp: release,
    onPointerCancel: release,
    onLostPointerCapture: release,
    onContextMenu: (e) => e.preventDefault(),
  }
}

function resetInput() {
  const input = runtime.input
  input.steer = 0
  input.throttle = 0
  input.brake = 0
  input.noReverse = false
  input.nitro = false
}

/** Left thumb: a wide pad - where your thumb sits on it is how hard you steer. */
function SteerPad() {
  const padRef = useRef(null)
  const knobRef = useRef(null)
  const active = useRef(null)

  const steerFrom = (e) => {
    const rect = padRef.current.getBoundingClientRect()
    const half = rect.width / 2
    let x = (e.clientX - (rect.left + half)) / (half * STEER_FULL)
    x = Math.max(-1, Math.min(1, x))
    if (Math.abs(x) < STEER_DEADZONE) x = 0
    runtime.input.steer = x
    if (knobRef.current) knobRef.current.style.transform = `translateX(${(x * half * 0.62).toFixed(1)}px)`
  }
  const end = (e) => {
    if (active.current !== e.pointerId) return
    active.current = null
    runtime.input.steer = 0
    if (knobRef.current) knobRef.current.style.transform = 'translateX(0)'
    mark(padRef.current, false)
  }

  return (
    <div
      ref={padRef}
      className="touch-btn touch-steer pointer-events-auto absolute flex items-center justify-between"
      data-down="0"
      style={{
        // Half the screen at most, so it never runs under the pedals on a narrow phone.
        width: 'min(236px, calc(50vw - 22px))',
        height: 112,
        padding: '0 14px',
        borderRadius: 56,
      }}
      onPointerDown={(e) => {
        e.preventDefault()
        if (active.current !== null) return
        active.current = e.pointerId
        padRef.current.setPointerCapture?.(e.pointerId)
        mark(padRef.current, true)
        steerFrom(e)
      }}
      onPointerMove={(e) => {
        if (active.current === e.pointerId) steerFrom(e)
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Arrow dir={-1} />
      <div
        ref={knobRef}
        className="touch-knob pointer-events-none absolute rounded-full"
        style={{ left: 'calc(50% - 32px)', width: 64, height: 64, background: `radial-gradient(circle at 50% 38%, #ffffff 0 22%, transparent 23%), ${HAZARD_RING}`, border: `4px solid ${INK}` }}
      />
      <Arrow dir={1} />
    </div>
  )
}

function Arrow({ dir }) {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true" style={{ transform: dir < 0 ? 'scaleX(-1)' : 'none', opacity: 0.95 }}>
      <path d="M14 10l30 18-30 18z" fill="#f4f7fb" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
    </svg>
  )
}

/** A round hold button: glossy dome, inner ring, icon over its label. */
function HoldButton({ size, label, color, icon, onHold, style, fontSize }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="touch-btn touch-hold pointer-events-auto absolute flex flex-col items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 50% 30%, #ffffff 0%, ${color} 34%, ${color} 62%, ${color}aa 100%)`,
        border: `4px solid ${INK}`,
        opacity: 0.86,
        ...style,
      }}
      {...holdHandlers(onHold)}
    >
      <span className="touch-hold-ring" aria-hidden="true" />
      {icon && <Icon name={icon} size={size * 0.36} className="relative" />}
      <span className="pp-stroke relative" style={{ fontSize: fontSize || Math.max(13, size * 0.17), lineHeight: 1, marginTop: icon ? 2 : 0 }}>
        {label}
      </span>
    </button>
  )
}

/**
 * Item buttons, one per unlocked slot: above the pedals in portrait, beside NITRO in
 * landscape (.touch-items in index.css) so they stay clear of the altitude rail.
 */
function TouchItems() {
  const items = useGame((s) => s.items)
  const slots = useGame((s) => s.profile.slots || 1)
  return (
    <div className="touch-items absolute flex" style={{ gap: 8 }}>
      {Array.from({ length: slots }, (_, i) => {
        const def = items[i] ? ITEMS[items[i]] : null
        return (
          <button
            key={i}
            type="button"
            aria-label={def ? def.name : 'Empty item slot'}
            className="touch-btn touch-item pointer-events-auto relative flex items-center justify-center"
            disabled={!def}
            data-full={def ? '1' : '0'}
            style={{
              width: 58,
              height: 58,
              borderRadius: 16,
              border: `4px solid ${INK}`,
              background: def ? `linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0.2) 100%), ${def.color}` : undefined,
            }}
            onPointerDown={(e) => {
              e.preventDefault()
              if (!def) return
              mark(e.currentTarget, true)
              requestItem(i)
            }}
            onPointerUp={(e) => mark(e.currentTarget, false)}
            onPointerCancel={(e) => mark(e.currentTarget, false)}
            onPointerLeave={(e) => mark(e.currentTarget, false)}
            onContextMenu={(e) => e.preventDefault()}
          >
            {def ? <Icon name={def.id} size={38} /> : <span className="pp-stroke" style={{ fontSize: 18 }}>{i + 1}</span>}
          </button>
        )
      })}
      {slots < MAX_SLOTS && (
        <button
          type="button"
          aria-label="Unlock another item slot"
          className="touch-btn touch-slot-plus pointer-events-auto relative"
          style={{ width: 58, height: 58, borderRadius: 16, border: `4px solid ${INK}` }}
          onClick={() => useGame.getState().togglePanel('store')}
          onContextMenu={(e) => e.preventDefault()}
        >
          <span className="pp-stroke" style={{ fontSize: 26, lineHeight: 0.9 }}>
            +
          </span>
          <span className="pp-stroke" style={{ fontSize: 10, lineHeight: 1 }}>
            SLOT
          </span>
        </button>
      )}
    </div>
  )
}

/**
 * On-screen driving for touch devices: a steering pad under the left thumb; GAS,
 * BRAKE (hold to reverse), NITRO and the item buttons under the right. In the air the
 * same controls tilt and spin the car. Writes runtime.input directly.
 */
export function TouchControls() {
  const panelOpen = useGame((s) => Boolean(s.panel))

  useEffect(() => {
    if (!IS_TOUCH) return undefined
    const onHide = () => resetInput()
    window.addEventListener('blur', onHide)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('blur', onHide)
      document.removeEventListener('visibilitychange', onHide)
      resetInput()
    }
  }, [])

  // A panel opening mid-press would otherwise leave the pedal held down.
  useEffect(() => {
    if (panelOpen) resetInput()
  }, [panelOpen])

  if (!IS_TOUCH || panelOpen) return null

  return (
    <div className="pp-font pointer-events-none absolute inset-0 z-[25] select-none">
      <SteerPad />
      <div className="touch-pedals pointer-events-none absolute" style={{ width: 210, height: 280 }}>
        <TouchItems />
        <HoldButton
          size={112}
          label="GAS"
          color="#3fd97a"
          icon="gas"
          onHold={(on) => {
            runtime.input.throttle = on ? 1 : 0
          }}
          style={{ right: 0, bottom: 0 }}
        />
        <HoldButton
          size={80}
          label="BRAKE"
          color="#ff4a3d"
          icon="brake"
          onHold={(on) => {
            runtime.input.brake = on ? 1 : 0
            runtime.input.noReverse = on
          }}
          style={{ right: 124, bottom: 0 }}
        />
        {/* Above BRAKE: hold to drive backwards. */}
        <HoldButton
          size={56}
          label="REVERSE"
          fontSize={10}
          color="#9b7bff"
          onHold={(on) => {
            runtime.input.brake = on ? 1 : 0
            runtime.input.noReverse = false
          }}
          style={{ right: 136, bottom: 83 }}
        />
        <HoldButton
          size={80}
          label="NITRO"
          color="#18c3d6"
          icon="nitro"
          onHold={(on) => {
            runtime.input.nitro = on
          }}
          style={{ right: 16, bottom: 124 }}
        />
      </div>
    </div>
  )
}

export default TouchControls
