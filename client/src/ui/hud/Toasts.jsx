import { useEffect, useState } from 'react'

import { useGame } from '../../store/game'
import StrokeText from '../StrokeText'
import Icon from '../Icon'
import { GRADIENTS, u } from './style'

const MAX = 3
/** How long each kind stays up, ms. */
const LIFE = { trick: 2000, drift: 1600, checkpoint: 2600, success: 2400, error: 2400, info: 2200 }

const KIND_STYLE = {
  trick: { gradient: GRADIENTS.cyan, size: 58, band: false, icon: null },
  drift: { gradient: 'linear-gradient(180deg, #fff3d6 0%, #ffb02e 55%, #ff6a1a 100%)', size: 54, band: false, icon: null },
  checkpoint: { gradient: GRADIENTS.green, size: 60, band: true, icon: 'flag' },
  success: { gradient: GRADIENTS.title, size: 52, band: true, icon: 'star' },
  error: { gradient: GRADIENTS.red, size: 40, band: true, icon: 'warn' },
  info: { gradient: null, size: 40, band: true, icon: 'info' },
}

/** A few toasts carry their own picture (Sky Pearls, treasure) whatever their kind. */
function iconFor(t, k) {
  const text = String(t.text || '').toUpperCase()
  if (text.includes('PEARL')) return 'pearl'
  if (text.includes('TREASURE')) return 'coin'
  return k.icon
}

/**
 * Centre banners from `store.toast` (tricks, checkpoints, rewards, errors). Each new
 * toast stacks on top of the last few and fades out by itself.
 */
export function Toasts() {
  const toast = useGame((s) => s.toast)
  const [list, setList] = useState([])

  // A new toast joins the stack with its own expiry time.
  useEffect(() => {
    if (!toast) return undefined
    const until = performance.now() + (LIFE[toast.kind] || LIFE.info)
    const id = setTimeout(() => setList((l) => [...l.filter((t) => t.id !== toast.id).slice(-(MAX - 1)), { ...toast, until }]), 0)
    return () => clearTimeout(id)
  }, [toast])

  // Drop each one when its time is up.
  useEffect(() => {
    if (!list.length) return undefined
    const wait = Math.max(16, Math.min(...list.map((t) => t.until)) - performance.now())
    const id = setTimeout(() => setList((l) => l.filter((t) => t.until > performance.now() + 16)), wait)
    return () => clearTimeout(id)
  }, [list])

  if (!list.length) return null
  return (
    <div className="hud-toasts flex flex-col-reverse items-center" style={{ gap: u(8) }}>
      {list
        .slice()
        .reverse()
        .map((t, i) => {
          const k = KIND_STYLE[t.kind] || KIND_STYLE.info
          // The newest is full size; older ones shrink and dim smoothly (CSS transitions
          // on font-size / opacity) instead of jumping when a new one lands.
          const scale = i === 0 ? 1 : 0.72
          const icon = iconFor(t, k)
          return (
            <div
              key={t.id}
              className="hud-toast"
              style={{
                fontSize: u(k.size * scale),
                ['--life']: `${LIFE[t.kind] || LIFE.info}ms`,
              }}
            >
              <div
                className={`hud-toast-body flex items-center ${k.band ? 'hud-toast-band' : ''}`}
                data-kind={t.kind}
                style={{
                  gap: '0.3em',
                  padding: k.band ? `${u(8)} ${u(30)} ${u(10)} ${icon ? u(18) : u(30)}` : 0,
                  opacity: i === 0 ? 1 : 0.8,
                }}
              >
                {icon && (
                  <span className="hud-toast-icon shrink-0" style={{ fontSize: t.sub ? '1.05em' : '0.85em' }}>
                    <Icon name={icon} size="1em" />
                  </span>
                )}
                <span className="flex flex-col items-center text-center">
                  <StrokeText stroke="0.18em" gradient={k.gradient || undefined}>
                    {t.text}
                  </StrokeText>
                  {t.sub && (
                    <span style={{ fontSize: '0.48em', marginTop: '0.05em' }}>
                      <StrokeText stroke="0.2em">{t.sub}</StrokeText>
                    </span>
                  )}
                  {t.detail && i === 0 && (
                    <span className="hud-toast-detail pp-stroke" style={{ fontSize: '0.3em' }}>
                      {t.detail}
                    </span>
                  )}
                </span>
              </div>
            </div>
          )
        })}
    </div>
  )
}

export default Toasts
