import { useRef } from 'react'

import { runtime } from '../../game/runtime'
import Icon from '../Icon'
import { KEY_LABEL } from './hotkeys'
import { nitroState } from './nitro'
import { KeyHint } from './parts'
import { setData, setStyle, setText, useLive } from './useLive'

/**
 * The nitro tank as a long bar over the item slots (bottom centre): a canister badge,
 * the tank filling left to right with tick marks every 10 %, its percentage, and the
 * key that fires it. Written by the shared live loop (no re-renders): the fill is a
 * scaleX transform, the state a data attribute the CSS animates -
 * full: the fill pulses; boost: stripes race along it and the frame glows cyan;
 * empty while you press it: the track flashes red.
 */
export function NitroBar() {
  const rootRef = useRef(null)
  const fillRef = useRef(null)
  const pctRef = useRef(null)

  useLive(() => {
    const car = runtime.car
    const tank = Math.min(1, Math.max(0, car.nitro || 0))
    setStyle(fillRef.current, 'transform', `scaleX(${tank.toFixed(3)})`)
    setText(pctRef.current, `${Math.round(tank * 100)}%`)
    setData(rootRef.current, 'nitro', nitroState(car, runtime.input))
  })

  return (
    <div ref={rootRef} className="hud-nitro pointer-events-none relative flex items-center" data-nitro="">
      <span className="hud-nitro-badge relative flex shrink-0 items-center justify-center">
        <Icon name="nitro" size="78%" />
      </span>
      <div className="hud-nitro-track relative flex-1 overflow-hidden">
        <div ref={fillRef} className="hud-nitro-fill absolute inset-0" />
        <div className="hud-nitro-ticks absolute inset-0" />
        <span className="hud-nitro-label pp-stroke absolute">NITRO</span>
        <span ref={pctRef} className="hud-nitro-pct pp-stroke absolute tabular-nums">
          100%
        </span>
      </div>
      <KeyHint k={KEY_LABEL.nitro} className="hud-nitro-key shrink-0" />
    </div>
  )
}

export default NitroBar
