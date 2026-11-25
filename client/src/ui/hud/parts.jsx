import { useContext, useEffect, useRef, useState } from 'react'

import { FlatFill, flatOf } from '../flatFill'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { SHOW_KEYS } from './hotkeys'
import { formatCoins, GRADIENTS, u } from './style'
import { setText, useLive } from './useLive'

const REDUCED_MOTION = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Outlined number (same look as StrokeText) that counts up or down to `value` instead
 * of jumping. The count runs on the shared HUD live loop and writes the two text nodes
 * directly - no React render per step. `animate` false snaps (first load, refunds).
 */
export function TickNumber({ value, format = formatCoins, duration = 650, animate = true, stroke = 6, gradient, fill = '#ffffff', className = '', style }) {
  const strokeRef = useRef(null)
  const fillRef = useRef(null)
  // What React rendered first; later values are written by the live loop only, so
  // React never fights it over the text node.
  const [initial] = useState(() => format(value))
  const anim = useRef({ from: value, to: value, start: 0, shown: value })

  useEffect(() => {
    const a = anim.current
    if (a.to === value) return
    a.from = a.shown
    a.to = value
    a.start = performance.now()
    if (!animate || REDUCED_MOTION) {
      a.shown = value
      const text = format(value)
      setText(strokeRef.current, text)
      setText(fillRef.current, text)
    }
  }, [value, animate, format])

  useLive((now) => {
    const a = anim.current
    if (a.shown === a.to) return
    const t = Math.min(1, (now - a.start) / duration)
    const eased = 1 - (1 - t) ** 3
    a.shown = t >= 1 ? a.to : Math.round(a.from + (a.to - a.from) * eased)
    const text = format(a.shown)
    setText(strokeRef.current, text)
    setText(fillRef.current, text)
  })

  const width = typeof stroke === 'number' ? `${stroke}px` : stroke
  const flat = useContext(FlatFill)
  const fillStyle = gradient && !flat ? { backgroundImage: gradient, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' } : { color: gradient ? flatOf(gradient) : fill }
  return (
    <span className={`pp-text tabular-nums ${className}`} style={style}>
      <span ref={strokeRef} aria-hidden="true" className="pp-text-stroke" style={{ WebkitTextStrokeWidth: width }}>
        {initial}
      </span>
      <span ref={fillRef} className="pp-text-fill" style={fillStyle}>
        {initial}
      </span>
    </span>
  )
}

/** A coin amount: the coin and the number, gold - or red while you can't afford it. */
export function CoinAmount({ amount, size = 34, afford = true, className = '', style }) {
  return (
    <span className={`inline-flex items-center ${className}`} style={{ gap: u(size * 0.15), fontSize: u(size), lineHeight: 1, ...style }}>
      <Icon name="coin" size={u(size * 1.1)} />
      <StrokeText stroke={u(size * 0.24)} gradient={afford ? GRADIENTS.gold : GRADIENTS.red}>
        {formatCoins(amount)}
      </StrokeText>
    </span>
  )
}

/**
 * The game's standard chunky button: gradient face with a glossy top, ink outline, and
 * a dark lip it presses down into (see .pp-chunky). A light streak sweeps across on
 * hover; `ready` makes it sweep by itself every few seconds (call-to-action buttons).
 * Children are laid out centred.
 */
export function ChunkyButton({ onClick, onPointerDown, gradient = GRADIENTS.goldButton, className = '', style, children, disabled, title, radius = 14, border = 4, ready = false }) {
  const flat = useContext(FlatFill)
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onContextMenu={onPointerDown ? (e) => e.preventDefault() : undefined}
      className={`pp-btn pp-chunky pointer-events-auto relative flex items-center justify-center ${ready && !disabled ? 'pp-ready' : ''} ${className}`}
      style={{
        background: flat ? flatOf(gradient) : gradient,
        borderRadius: u(radius),
        border: `${u(border)} solid #0d1530`,
        ...style,
      }}
    >
      <span className="pp-gloss" style={{ borderRadius: `${u(radius * 0.7)} ${u(radius * 0.7)} ${u(radius * 0.45)} ${u(radius * 0.45)}` }} />
      <span className="pp-sweep" style={{ borderRadius: u(Math.max(0, radius - border)) }} />
      {children}
    </button>
  )
}

/** A key name drawn as a little keyboard key ("ENTER", "1"). */
export function Keycap({ children, size = 20, style }) {
  return (
    <span className="pp-keycap pp-stroke" style={{ fontSize: u(size), ...style }}>
      {children}
    </span>
  )
}

/**
 * The keyboard shortcut of a HUD control, as a little keycap badge (hidden on touch
 * devices). Place it inside a `relative` parent; position it with `className`/`style`.
 */
export function KeyHint({ k, className = '', style }) {
  if (!SHOW_KEYS || !k) return null
  return (
    <span aria-hidden="true" className={`hud-key pp-keycap pp-stroke ${className}`} style={style}>
      {k}
    </span>
  )
}

/** Small yellow caps label with a short hazard tick before it, for panel sections. */
export function SectionLabel({ children, size = 24, right, style }) {
  return (
    <div className="flex items-center justify-between" style={{ gap: u(10), marginBottom: u(10), ...style }}>
      <span className="pp-section-label pp-stroke" style={{ fontSize: u(size) }}>
        {children}
      </span>
      {right}
    </div>
  )
}
