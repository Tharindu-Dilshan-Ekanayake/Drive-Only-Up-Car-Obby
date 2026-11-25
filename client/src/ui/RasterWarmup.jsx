import { useEffect, useRef } from 'react'

import { FlatFill } from './flatFill'
import { GRADIENTS, u } from './hud/style'
import Icon from './Icon'
import StrokeText from './StrokeText'

/**
 * Warms the browser's own GPU rasteriser and compositor for the HUD's animated pop-ups,
 * while a loading screen is up.
 *
 * The first time a HUD element with a running animation, a filter or a blurred glow shows
 * up (the coin counter's flip and "+N" the first time you pick up a coin, a toast, the
 * speed lines, the nitro bar's boost glow and stripes), Chrome compiles the GPU shaders it
 * rasterises and composites it with - on the GPU thread, so the WebGL frame waits: a
 * one-off 100-350 ms freeze each (measured, ANGLE / D3D11), the first one about two
 * seconds into the first drive. Drawing a sample of each once while the loading screen is
 * up builds those shaders then.
 *
 * Mounted next to the loading screen, above it (a layer hidden under an opaque one is
 * never rasterised) and outside its fading group (content inside a group is composited
 * with other shaders), every sample at full opacity seen through a 4 px peephole in the
 * bottom-left corner: nothing anyone would notice. Only while the screen is up.
 */
function Peephole({ children, left, dx = 0, dy = 0 }) {
  return (
    <div className="absolute overflow-hidden" style={{ left, bottom: 0, width: 4, height: 4 }}>
      {/* Shifted so the peephole looks at painted pixels (ops wholly outside it aren't drawn at all). */}
      <div className="absolute whitespace-nowrap" style={{ left: -dx, bottom: -dy }}>
        {children}
      </div>
    </div>
  )
}

function ToastSample() {
  return (
    <span className="hud-toast-band inline-flex items-center" style={{ fontSize: u(40), padding: u(10), animation: 'pp-bump-b 0.35s ease-out infinite' }}>
      <span className="hud-toast-icon">
        <Icon name="star" size="1em" />
      </span>
      <StrokeText stroke="0.16em" gradient={GRADIENTS.title}>
        CHECKPOINT
      </StrokeText>
    </span>
  )
}

/**
 * The coin / pearl wallet: a blurred drop shadow over the lot (.hud-wallet). While a
 * child animates (a coin pick-up) the compositor draws that shadow, otherwise the
 * rasteriser does: both, so `animate` on one sample and off on another.
 */
function WalletSample({ animate }) {
  return (
    <div className="hud-wallet flex items-center" style={{ fontSize: u(38) }}>
      <span className="hud-coins-icon inline-block" style={animate ? { animation: 'hud-coins-flip-b 0.45s ease-out infinite' } : undefined}>
        <Icon name="coin" size={u(62)} />
      </span>
      <span className="pp-bump-wrap" style={animate ? { animation: 'pp-bump-b 0.35s ease-out infinite' } : undefined}>
        <StrokeText stroke={u(9)} gradient={GRADIENTS.gold}>
          1,250
        </StrokeText>
      </span>
    </div>
  )
}
const WalletAnimated = () => <WalletSample animate />
const WalletStill = () => <WalletSample animate={false} />

/**
 * States the live HUD switches between (data-* attributes, toggled by RasterWarmup's
 * timer like the live writer does): each switch starts the transitions / animations the
 * real one would, so their layers are rasterised and composited the same way.
 */
const CYCLES = {
  nitro: ['', 'boost', 'full', 'boost', 'empty'],
  boost: ['0', '1'],
  gauge: ['', 'full', 'empty'],
}

/** The nitro bar (its real markup and size): boosting (glowing track, racing stripes over the fill), full, empty. */
function NitroSample() {
  return (
    <div className="hud-nitro relative flex items-center" data-nitro="boost" data-cycle="nitro">
      <span className="hud-nitro-badge relative flex shrink-0 items-center justify-center">
        <Icon name="nitro" size="78%" />
      </span>
      <div className="hud-nitro-track relative flex-1 overflow-hidden">
        <div className="hud-nitro-fill absolute inset-0" style={{ transform: 'scaleX(0.6)' }} />
        <div className="hud-nitro-ticks absolute inset-0" />
        <span className="hud-nitro-label pp-stroke absolute">NITRO</span>
        <span className="hud-nitro-pct pp-stroke absolute tabular-nums">60%</span>
      </div>
    </div>
  )
}

/** The speed gauge's boost ring (a blurred glow) and nitro icon, coming and going. */
function GaugeSample() {
  return (
    <div className="hud-gauge relative" data-boost="1" data-cycle="boost" style={{ width: 'var(--gauge)', height: 'var(--gauge)' }}>
      <div className="hud-gauge-ring" />
      <div className="absolute flex items-center justify-center" style={{ left: 0, right: 0, bottom: '6%' }} data-cycle="gauge">
        <span className="hud-nitro-icon inline-flex">
          <Icon name="nitro" size="calc(var(--gauge) * 0.15)" />
        </span>
      </div>
    </div>
  )
}

/** [left, dx, dy, sample]: peepholes onto the band's edge and corner, the lettering, the bar, the ring, the wallet. */
const SPOTS = [
  [16, 30, 18, ToastSample],
  [20, 2, 2, ToastSample],
  [24, 70, 22, ToastSample],
  [28, 120, 12, NitroSample],
  [32, 50, 12, NitroSample],
  [56, 250, 4, NitroSample],
  [36, 2, 80, GaugeSample],
  [52, 78, 12, GaugeSample],
  [40, 20, 20, WalletAnimated],
  [44, 60, 12, WalletAnimated],
  [48, 20, 20, WalletStill],
]

export function RasterWarmup() {
  const ref = useRef(null)
  // Step every cycling sample to its next state now and then (DOM only, no React state).
  useEffect(() => {
    let step = 0
    const id = setInterval(() => {
      step += 1
      for (const el of ref.current?.querySelectorAll('[data-cycle]') || []) {
        const states = CYCLES[el.dataset.cycle]
        const value = states[step % states.length]
        if (el.dataset.cycle === 'gauge') el.parentElement.dataset.nitro = value
        else if (el.dataset.cycle === 'boost') el.dataset.boost = value
        else el.dataset.nitro = value
      }
    }, 250)
    return () => clearInterval(id)
  }, [])
  return (
    <FlatFill.Provider value>
      {/* .hud-root: the samples are drawn like the (flat) HUD - ./hud/hudFlat.css. */}
      <div ref={ref} aria-hidden="true" className="hud-root pointer-events-none fixed inset-0 z-[101]">
        {/* The speed lines (conic gradients under a mask), both colourings. */}
        <div className="absolute overflow-hidden" style={{ left: 0, bottom: 0, width: 4, height: 4 }}>
          <div className="hud-speedfx" style={{ display: 'block', opacity: 0.9 }} />
        </div>
        <div className="absolute overflow-hidden" style={{ left: 4, bottom: 0, width: 4, height: 4 }}>
          <div className="hud-speedfx" data-boost="1" style={{ display: 'block', opacity: 0.9 }} />
        </div>
        {/* The coin counter's flip: a drop-shadowed icon, animating. */}
        <Peephole left={8} dx={20} dy={20}>
          <span className="hud-coins-icon inline-block" style={{ animation: 'hud-coins-flip-a 0.45s ease-out infinite' }}>
            <Icon name="coin" size={u(62)} />
          </span>
        </Peephole>
        {/* A "+N": outlined gradient lettering, animating. */}
        <Peephole left={12} dx={9} dy={8}>
          <span className="hud-coin-gain inline-block" style={{ fontSize: u(28), animationIterationCount: 'infinite' }}>
            <StrokeText stroke={u(7)} gradient={GRADIENTS.green}>
              +25
            </StrokeText>
          </span>
        </Peephole>
        {SPOTS.map(([left, dx, dy, Sample]) => (
          <Peephole key={left} left={left} dx={dx} dy={dy}>
            <Sample />
          </Peephole>
        ))}
      </div>
    </FlatFill.Provider>
  )
}

export default RasterWarmup
