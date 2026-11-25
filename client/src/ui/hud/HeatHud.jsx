import { useRef } from 'react'

import { runtime } from '../../game/runtime'
import { heat } from '../../game/world/heat/heatState'
import './heatHud.css'
import { replayClass, setData, setStyle, setText, useLive } from './useLive'

const STARS = [1, 2, 3, 4, 5]
const WARN = { foam: 'FOAM CANNON!', net: 'NET LAUNCHER!', emp: 'EMP CHARGING!', heli: 'CHOPPER DROP!', pit: 'PIT INCOMING!' }
/** Radar dots (heatState.js blips: at most 24). */
const DOTS = Array.from({ length: 24 }, (_, i) => i)
const DOT_KIND = ['unit', 'block', 'heli', 'car', 'search']

/**
 * Heat Run's pursuit HUD (mounted by HUD.jsx only on a `mode: 'heat'` map): a compact block
 * with the police radio line on top; a small radar (police round you, your heading up:
 * units red, units that lost you grey-blue, roadblock cars amber, the helicopter big,
 * traffic white; the ring glows red while you're seen) beside the heat stars plate; under
 * the plate the bounty (unbanked, and banked this run, with the last award popping up),
 * the BUSTED meter (while it moves), the EVADE countdown (while they've lost sight of you)
 * and chips for what's on you (EMP: nitro offline, FOAMED, BOXED IN, an incoming gadget or
 * PIT); and the big BUSTED! overlay for its 1.5 s. Desktop: bottom left (free there);
 * touch: top right, under the name tag (the steering pad owns the bottom left). The top-left
 * corner stays empty. Everything is written by the shared live loop from heatState.js and
 * runtime - no React state per frame.
 */
export function HeatHud() {
  const rootRef = useRef(null)
  const starRefs = useRef([])
  const levelRef = useRef(null)
  const meterRef = useRef(null)
  const fillRef = useRef(null)
  const empRef = useRef(null)
  const slowRef = useRef(null)
  const boxRef = useRef(null)
  const warnRef = useRef(null)
  const bustRef = useRef(null)
  const radioRef = useRef(null)
  const radioTextRef = useRef(null)
  const radarRef = useRef(null)
  const dotRefs = useRef([])
  const bountyRef = useRef(null)
  const bankedRef = useRef(null)
  const popRef = useRef(null)
  const evadeRef = useRef(null)
  const evadeFillRef = useRef(null)
  const evadeTimeRef = useRef(null)
  const last = useRef({ level: 0, busted: false, radio: -1, bounty: -1, banked: -1, pop: '' })

  useLive(() => {
    const root = rootRef.current
    if (!root) return
    const car = runtime.car
    const prev = last.current
    const lv = heat.level
    if (lv !== prev.level) {
      for (let i = 0; i < 5; i += 1) setData(starRefs.current[i], 'on', i < lv ? '1' : '0')
      setText(levelRef.current, `LEVEL ${lv}`)
      setData(root, 'level', String(lv))
      if (prev.level) replayClass(root, 'heat-pop')
      prev.level = lv
    }
    // Radio.
    setStyle(radioRef.current, 'display', heat.radioT > 0 ? 'flex' : 'none')
    if (heat.radioSeq !== prev.radio) {
      prev.radio = heat.radioSeq
      setText(radioTextRef.current, heat.radio)
      if (heat.radioT > 0) replayClass(radioRef.current, 'heat-radio-in')
    }
    // Radar.
    setData(radarRef.current, 'seen', heat.seen ? '1' : '0')
    const b = heat.blips
    for (let i = 0; i < DOTS.length; i += 1) {
      const el = dotRefs.current[i]
      if (i >= heat.blipCount) {
        setStyle(el, 'display', 'none')
        continue
      }
      setStyle(el, 'display', 'block')
      setStyle(el, 'left', `${(50 + b[i * 3] * 44).toFixed(1)}%`)
      setStyle(el, 'top', `${(50 - b[i * 3 + 1] * 44).toFixed(1)}%`)
      setData(el, 'kind', DOT_KIND[b[i * 3 + 2]] || 'unit')
    }
    // Bounty.
    const bounty = Math.floor(heat.bounty)
    if (bounty !== prev.bounty) {
      prev.bounty = bounty
      setText(bountyRef.current, bounty.toLocaleString())
    }
    if (heat.banked !== prev.banked) {
      prev.banked = heat.banked
      setText(bankedRef.current, `BANKED ${heat.banked.toLocaleString()}`)
    }
    setStyle(popRef.current, 'display', heat.bountyPopT > 0 ? 'inline-flex' : 'none')
    if (heat.bountyPopT > 0 && heat.bountyPop !== prev.pop) {
      prev.pop = heat.bountyPop
      setText(popRef.current, heat.bountyPop)
      setData(popRef.current, 'lost', heat.bountyPop.startsWith('-') ? '1' : '0')
      replayClass(popRef.current, 'heat-pop-in')
    }
    if (heat.bountyPopT <= 0) prev.pop = ''
    // BUSTED meter.
    const m = heat.busted
    setStyle(meterRef.current, 'display', m > 0.01 || heat.bustedT > 0 ? 'flex' : 'none')
    setStyle(fillRef.current, 'transform', `scaleX(${m.toFixed(3)})`)
    setData(meterRef.current, 'hot', m > 0.6 ? '1' : '0')
    // Evade countdown.
    const evading = heat.evade > 0.05 && heat.bustedT <= 0
    setStyle(evadeRef.current, 'display', evading ? 'flex' : 'none')
    if (evading) {
      const k = Math.min(1, heat.evade / heat.evadeNeed)
      setStyle(evadeFillRef.current, 'transform', `scaleX(${k.toFixed(3)})`)
      setText(evadeTimeRef.current, `${Math.max(0, heat.evadeNeed - heat.evade).toFixed(1)}s`)
    }
    // Chips.
    setStyle(empRef.current, 'display', car.emp > 0 ? 'inline-flex' : 'none')
    if (car.emp > 0) setText(empRef.current, `EMP · NITRO OFF ${car.emp.toFixed(1)}s`)
    setStyle(slowRef.current, 'display', car.slow > 0 ? 'inline-flex' : 'none')
    setStyle(boxRef.current, 'display', heat.close > 0 && heat.boxed && heat.bustedT <= 0 ? 'inline-flex' : 'none')
    setStyle(warnRef.current, 'display', heat.warn > 0 ? 'inline-flex' : 'none')
    if (heat.warn > 0) setText(warnRef.current, WARN[heat.warnKind] || 'INCOMING!')
    // The BUSTED! overlay.
    const busted = heat.bustedT > 0
    if (busted !== prev.busted) {
      setStyle(bustRef.current, 'display', busted ? 'flex' : 'none')
      if (busted) replayClass(bustRef.current, 'heat-bust-in')
      prev.busted = busted
    }
  })

  return (
    <>
      <div ref={rootRef} className="heat-hud pp-stroke pointer-events-none absolute flex flex-col" data-level="1">
        <div ref={radioRef} className="heat-radio items-center" style={{ display: 'none' }}>
          <span className="heat-radio-tag">DISPATCH</span>
          <span ref={radioTextRef} className="heat-radio-text" />
        </div>
        <div className="heat-row flex items-start">
          <div ref={radarRef} className="heat-radar" data-seen="0">
            <span className="heat-radar-sweep" />
            <span className="heat-radar-ring" />
            <span className="heat-radar-you" />
            {DOTS.map((i) => (
              <span
                key={i}
                ref={(el) => {
                  dotRefs.current[i] = el
                }}
                className="heat-dot"
                style={{ display: 'none' }}
              />
            ))}
          </div>
          <div className="heat-col flex flex-col">
            <div className="heat-plate flex items-center">
              <span className="heat-title">HEAT</span>
              <span className="heat-stars flex">
                {STARS.map((n, i) => (
                  <span
                    key={n}
                    ref={(el) => {
                      starRefs.current[i] = el
                    }}
                    className="heat-star"
                    data-on={i === 0 ? '1' : '0'}
                  >
                    ★
                  </span>
                ))}
              </span>
              <span ref={levelRef} className="heat-level tabular-nums">
                LEVEL 1
              </span>
            </div>
            <div className="heat-bounty flex items-center">
              <span className="heat-bounty-label">BOUNTY</span>
              <span ref={bountyRef} className="heat-bounty-value tabular-nums">
                0
              </span>
              <span ref={bankedRef} className="heat-banked tabular-nums">
                BANKED 0
              </span>
              <span ref={popRef} className="heat-bounty-pop" style={{ display: 'none' }} />
            </div>
            <div ref={meterRef} className="heat-meter flex items-center" style={{ display: 'none' }}>
              <span className="heat-meter-label">BUSTED</span>
              <span className="heat-meter-track">
                <span ref={fillRef} className="heat-meter-fill" />
              </span>
            </div>
            <div ref={evadeRef} className="heat-meter heat-evade items-center" style={{ display: 'none' }}>
              <span className="heat-meter-label heat-evade-label">EVADING</span>
              <span className="heat-meter-track">
                <span ref={evadeFillRef} className="heat-meter-fill heat-evade-fill" />
              </span>
              <span ref={evadeTimeRef} className="heat-evade-time tabular-nums" />
            </div>
            <div className="heat-chips flex flex-wrap">
              <span ref={warnRef} className="heat-chip heat-chip-warn" style={{ display: 'none' }}>
                INCOMING!
              </span>
              <span ref={boxRef} className="heat-chip heat-chip-box" style={{ display: 'none' }}>
                BOXED IN!
              </span>
              <span ref={empRef} className="heat-chip heat-chip-emp" style={{ display: 'none' }}>
                EMP
              </span>
              <span ref={slowRef} className="heat-chip heat-chip-slow" style={{ display: 'none' }}>
                FOAMED · SLOWED
              </span>
            </div>
          </div>
        </div>
      </div>
      <div ref={bustRef} className="heat-bust pointer-events-none absolute inset-0 flex-col items-center justify-center" style={{ display: 'none' }}>
        <div className="heat-bust-band" />
        <div className="heat-bust-text pp-stroke">BUSTED!</div>
        <div className="heat-bust-sub pp-stroke">Back to your last checkpoint · unbanked bounty lost</div>
      </div>
    </>
  )
}

export default HeatHud
