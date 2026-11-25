import { useEffect } from 'react'

import { useGame } from '../../store/game'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { ChunkyButton } from '../hud/parts'
import { GRADIENTS, HAZARD_TRIM, INSET, u } from '../hud/style'

/** The red X on every panel's top-right corner. */
export function CloseButton({ onClick, style }) {
  return (
    <ChunkyButton onClick={onClick} title="Close" gradient={GRADIENTS.redButton} radius={20} border={5} className="pp-close" style={{ position: 'absolute', width: u(80), height: u(80), ...style }}>
      <Icon name="close" size={u(46)} />
    </ChunkyButton>
  )
}

/**
 * The game's modal panel: a navy dock-office board with a hazard-striped top edge, a
 * raised header plate (icon on a round badge, the title in gold) and the red X on the
 * corner. The body has a faint rivet-dot texture. Escape or a click outside closes it.
 *
 * @param {{ title: string, icon?: string, width?: number, children: React.ReactNode,
 *           onClose?: () => void }} props `width` in reference pixels
 */
export function Panel({ title, icon, width = 980, children, onClose }) {
  const closePanel = useGame((s) => s.closePanel)
  const close = onClose || closePanel

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  return (
    <div
      className="pp-backdrop pp-font pointer-events-auto absolute inset-0 z-40 flex items-center justify-center"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="pp-panel-in relative flex flex-col" style={{ width: `min(${u(width)}, calc(100% - 24px))`, maxHeight: 'calc(100% - 24px)' }}>
        <div
          className="pp-panel relative flex min-h-0 w-full flex-col overflow-hidden"
          style={{ borderRadius: u(28), border: `${u(6)} solid #0d1530` }}
        >
          <div className="w-full shrink-0" style={{ height: u(16), background: HAZARD_TRIM }} />
          <div className="pp-panel-head flex shrink-0 items-center" style={{ gap: u(14), padding: `${u(12)} ${u(116)} ${u(12)} ${u(22)}` }}>
            {icon && (
              <span className="pp-panel-badge flex shrink-0 items-center justify-center" style={{ width: u(78), height: u(78) }}>
                <Icon name={icon} size={u(56)} />
              </span>
            )}
            <span className="truncate" style={{ fontSize: u(56), lineHeight: 1.15 }}>
              <StrokeText stroke={u(11)} gradient={GRADIENTS.title}>
                {title}
              </StrokeText>
            </span>
          </div>
          <div className="pp-panel-body min-h-0 overflow-y-auto" style={{ padding: `${u(18)} ${u(24)} ${u(28)}` }}>
            {children}
          </div>
        </div>
        <CloseButton onClick={close} style={{ right: u(20), top: u(32) }} />
      </div>
    </div>
  )
}

/** A rounded recessed box for grouping content inside a panel. */
export function Well({ children, style, className = '' }) {
  return (
    <div
      className={`pp-well ${className}`}
      style={{
        ...INSET,
        borderRadius: u(20),
        padding: u(16),
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export default Panel
