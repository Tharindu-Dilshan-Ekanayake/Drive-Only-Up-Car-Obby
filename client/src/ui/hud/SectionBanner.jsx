import { useEffect, useState } from 'react'

import { useGame } from '../../store/game'
import StrokeText from '../StrokeText'
import { GRADIENTS, HAZARD, HUD_FLAT, SHADOW_FLAT, u } from './style'

/** How long the banner stays up, ms (matches the hud-banner keyframes in index.css). */
const BANNER_MS = 2600

/**
 * "SECTION 5 / WIND TUNNEL", a small plate just under the timer (kept small and high so it never covers the road ahead), when you drive into a new section
 * (`store.section`), with a hazard stripe swiping across ahead of the navy band.
 *
 * Only the furthest section reached this run announces itself: falling back onto an
 * earlier stretch and driving out again stays quiet, and section 0 (and going back to
 * the pier) only resets that.
 */
export function SectionBanner() {
  const [banner, setBanner] = useState(null)

  useEffect(() => {
    let furthest = useGame.getState().section || 0
    let timer = 0
    const unsubscribe = useGame.subscribe((state, prev) => {
      const s = state.section
      if (s === prev.section) return
      if (!(s > 0)) {
        furthest = 0
        return
      }
      if (s <= furthest) return
      furthest = s
      // The finish's index: the summit "section" after it gets the finish card instead.
      const stage = state.stage
      const name = stage?.sections[s]?.name
      if (!stage || s >= stage.checkpoints.length - 1 || !name) return
      clearTimeout(timer)
      setBanner({ index: s, name: name.toUpperCase(), id: Date.now() })
      timer = setTimeout(() => setBanner(null), BANNER_MS)
    })
    return () => {
      unsubscribe()
      clearTimeout(timer)
    }
  }, [])

  if (!banner) return null
  return (
    <div key={banner.id} className="hud-banner relative flex flex-col items-center" style={{ padding: `0 ${u(34)}`, minWidth: u(300) }}>
      {/* Notched ribbon ends tucked behind the band, then the band itself: it unrolls
          behind the swipe (scaleX) while the stripe races across ahead of it. */}
      <div className="hud-banner-band absolute inset-0">
        <span className="hud-banner-tail" data-side="l" />
        <span className="hud-banner-tail" data-side="r" />
        {/* Flat face, hard shadow, bare stripes: the HUD draws flat (../flatFill.js). */}
        <div className="absolute inset-0 overflow-hidden" style={{ background: HUD_FLAT, borderRadius: u(18), border: `${u(4)} solid #0d1530`, boxShadow: SHADOW_FLAT }}>
          <div className="absolute left-0 right-0 top-0" style={{ height: u(10), background: HAZARD }} />
          <div className="absolute bottom-0 left-0 right-0" style={{ height: u(10), background: HAZARD }} />
          <div className="hud-banner-shine" />
        </div>
      </div>
      <div className="absolute left-0 right-0 overflow-hidden" style={{ top: u(-10), bottom: u(-10) }}>
        <div className="hud-banner-swipe absolute inset-0">
          <div className="hud-banner-stripe" style={{ background: HAZARD, borderLeft: `${u(4)} solid #0d1530`, borderRight: `${u(4)} solid #0d1530` }} />
        </div>
      </div>
      <span className="hud-banner-sub pp-stroke relative flex items-center" style={{ fontSize: u(18), color: '#9fe9ff', marginTop: u(12), gap: u(8) }}>
        <span className="hud-banner-rule" />
        {`SECTION ${banner.index}`}
        <span className="hud-banner-rule" />
      </span>
      <span className="hud-banner-title relative" style={{ fontSize: `min(${u(44)}, 4vw)`, lineHeight: 1.05, marginBottom: u(12) }}>
        <StrokeText stroke="0.16em" gradient={GRADIENTS.title}>
          {banner.name}
        </StrokeText>
      </span>
    </div>
  )
}

export default SectionBanner
