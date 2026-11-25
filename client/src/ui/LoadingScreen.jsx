import { useProgress } from '@react-three/drei'
import { useEffect, useState } from 'react'

import StrokeText from './StrokeText'
import Icon from './Icon'
import RasterWarmup from './RasterWarmup'
import { HAZARD_TRIM } from './hud/style'

const TIPS = [
  'Hold NITRO on the straights - it refills while you cruise.',
  'Fell in the sea? You restart from your last checkpoint, never from the bottom.',
  'Flip in the air and land on your wheels for bonus coins!',
  'Item crates hold Spring Jumps, Turbo Cans, Shields and more.',
  'Spend coins at the Car Spin - 30 cars, from an ice-cream van to a dragon.',
  'Beat your best split at every checkpoint to climb the boards.',
  'Bounce pads launch you over the gaps - hit them with speed.',
  'Giant hammers swing in a rhythm. Go while the head is up at one side!',
]

/**
 * The harbour at midday in one inline SVG (no download): sky, sun, sea, two cranes, a
 * stack of containers and a pier with a hazard-striped edge.
 */
function Backdrop() {
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="ld-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2f8fe8" />
          <stop offset="0.62" stopColor="#8fd3f7" />
          <stop offset="0.7" stopColor="#c4ecff" />
        </linearGradient>
        <linearGradient id="ld-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#13b6c9" />
          <stop offset="1" stopColor="#0a6f9c" />
        </linearGradient>
        <radialGradient id="ld-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fffbe8" />
          <stop offset="0.45" stopColor="#fff6d8" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff6d8" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#ld-sky)" />
      <circle cx="1240" cy="170" r="160" fill="url(#ld-sun)" />
      {/* Puffy clouds. */}
      <g fill="#ffffff" opacity="0.9">
        <ellipse cx="260" cy="150" rx="120" ry="34" />
        <ellipse cx="320" cy="128" rx="70" ry="38" />
        <ellipse cx="880" cy="230" rx="140" ry="30" />
        <ellipse cx="930" cy="210" rx="70" ry="32" />
      </g>
      <rect y="610" width="1600" height="290" fill="url(#ld-sea)" />
      <g stroke="#eafcff" strokeWidth="5" strokeLinecap="round" opacity="0.55">
        <path d="M120 660h90M420 700h120M760 650h70M1040 690h140M1380 660h80M240 760h110M640 790h90M1200 780h120" />
      </g>

      {/* Crane 1 (left), steel teal with a yellow boom. */}
      <g stroke="#0d1530" strokeWidth="7" strokeLinejoin="round">
        <path d="M200 610V250h40v360z" fill="#2e7383" />
        <path d="M200 250L120 330M240 250L330 330" fill="none" />
        <path d="M110 230h480v34H110z" fill="#ffc41f" />
        <path d="M200 230l20-60 20 60z" fill="#2e7383" />
        <path d="M520 264v150" fill="none" strokeWidth="5" />
        <path d="M500 414h40v28h-40z" fill="#e2453b" />
      </g>
      {/* Crane 2 (right). */}
      <g stroke="#0d1530" strokeWidth="7" strokeLinejoin="round">
        <path d="M1330 610V300h34v310z" fill="#1f4e5a" />
        <path d="M1050 282h420v30H1050z" fill="#ff7a1a" />
        <path d="M1330 282l17-50 17 50z" fill="#1f4e5a" />
        <path d="M1110 312v120" fill="none" strokeWidth="5" />
        <path d="M1090 432h40v24h-40z" fill="#2f6fe0" />
      </g>

      {/* Container stack on the pier. */}
      <g stroke="#0d1530" strokeWidth="6" strokeLinejoin="round">
        <rect x="980" y="470" width="190" height="70" fill="#e2453b" />
        <rect x="1170" y="470" width="190" height="70" fill="#19a974" />
        <rect x="1070" y="400" width="190" height="70" fill="#2f6fe0" />
        <rect x="1260" y="400" width="190" height="70" fill="#ffb020" />
        <rect x="1160" y="330" width="190" height="70" fill="#8a5cf6" />
      </g>
      <g stroke="rgba(13,21,48,0.35)" strokeWidth="5">
        <path d="M1010 480v50M1040 480v50M1070 480v50M1200 480v50M1230 480v50M1260 480v50M1100 410v50M1130 410v50M1290 410v50M1320 410v50M1190 340v50M1220 340v50" />
      </g>

      {/* The pier and a road climbing away from it. */}
      <path d="M0 540h1600v70H0z" fill="#c9ced4" stroke="#0d1530" strokeWidth="6" />
      <path d="M0 610h1600v14H0z" fill="#0d1530" />
      <path d="M560 540L760 330h120L760 540z" fill="#4b5058" stroke="#0d1530" strokeWidth="6" strokeLinejoin="round" />
      <path d="M660 540L800 360" stroke="#f2f4f7" strokeWidth="6" strokeDasharray="22 18" />
      <path d="M760 330L880 330L870 342H752z" fill="#ffc41f" stroke="#0d1530" strokeWidth="4" />
    </svg>
  )
}

/**
 * Full-screen loading overlay. Progress is drei's asset loader progress, blended with a
 * time-based creep so a single large download never looks frozen, and it only reaches
 * 100% when the game reports ready (first frame drawn).
 *
 * Also the travel screen between maps (App.jsx): `label` replaces "LOADING THE DOCKS",
 * `tagline` the strapline, `progress` (0-100) is the trip's own progress (leave the
 * room, fetch and build the stage, mount it), and `tip` a fixed line.
 *
 * @param {{ done: boolean, label?: string, tagline?: string, progress?: number, tip?: string }} props
 */
export function LoadingScreen({ done, label, tagline, progress: stepProgress, tip: fixedTip }) {
  const { progress: assets } = useProgress()
  const progress = Math.max(assets, stepProgress || 0)
  const [creep, setCreep] = useState(0)
  const [hidden, setHidden] = useState(false)
  const [randomTip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)])
  const tip = fixedTip || randomTip

  useEffect(() => {
    if (done) return undefined
    const id = setInterval(() => setCreep((c) => Math.min(90, c + (90 - c) * 0.06)), 120)
    return () => clearInterval(id)
  }, [done])

  useEffect(() => {
    if (!done) return undefined
    const id = setTimeout(() => setHidden(true), 450)
    return () => clearTimeout(id)
  }, [done])

  if (hidden) return null
  const shown = done ? 100 : Math.max(creep, Math.min(95, progress * 0.95))

  return (
    <>
      {/* Builds the browser's raster shaders for the HUD's pop-ups now, not mid-drive (outside this fading group). */}
      {!done && <RasterWarmup />}
      <div
        className="pp-font absolute inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden transition-opacity duration-500"
        style={{ opacity: done ? 0 : 1, background: '#8fd3f7' }}
      >
        <Backdrop />

        <div className="load-layout relative flex h-full w-full flex-col items-center justify-between">
          <h1 className="load-title m-0 flex flex-col items-center text-center leading-none">
            <span className="load-drive" style={{ fontSize: 'clamp(40px, min(9vw, 13vh), 110px)' }}>
              <StrokeText stroke="0.16em" gradient="linear-gradient(180deg, #ffffff 0%, #ffffff 52%, #ffe36b 53%, #ffb21e 100%)">
                UP WE
              </StrokeText>
            </span>
            <span style={{ fontSize: 'clamp(52px, min(12vw, 17vh), 150px)', marginTop: '-0.1em' }}>
              <StrokeText stroke="0.15em" gradient="linear-gradient(180deg, #ffd0a0 0%, #ff8a2a 50%, #e8590c 100%)">
                DRIVE
              </StrokeText>
            </span>
            <span
              className="load-trim"
              style={{
                marginTop: '0.3em',
                height: 'clamp(10px, 1.6vw, 18px)',
                width: '100%',
                background: HAZARD_TRIM.replaceAll('var(--px)', '1px'),
              }}
            />
            <span className="load-tagline" style={{ marginTop: '0.55em' }}>
              <StrokeText stroke={5}>{tagline || 'DRIVE • CLIMB • DODGE • COLLECT'}</StrokeText>
            </span>
          </h1>

          <div className="load-card w-[min(600px,90vw)]">
            <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
              <span className="pp-stroke" style={{ fontSize: 18, color: '#9fe9ff' }}>
                {done ? 'ALL ABOARD!' : label || 'LOADING THE DOCKS'}
              </span>
              <span className="pp-stroke tabular-nums" style={{ fontSize: 22, color: '#ffc41f' }}>
                {`${Math.round(shown)}%`}
              </span>
            </div>
            <div className="load-bar relative h-9 rounded-2xl">
              <div className="absolute inset-0 overflow-hidden" style={{ borderRadius: 12 }}>
                <div
                  // Scaled, not resized: a transform never needs a layout.
                  className="load-stripes h-full origin-left transition-transform duration-200"
                  style={{
                    transform: `scaleX(${shown / 100})`,
                    backgroundImage:
                      'linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0.18) 100%), repeating-linear-gradient(-45deg, #ffc41f 0 14px, #ffdf6b 14px 28px)',
                  }}
                />
              </div>
              {/* A little car riding the front of the fill. */}
              <div className="pointer-events-none absolute inset-0 transition-transform duration-200" style={{ transform: `translateX(${shown}%)` }}>
                <span className="load-car absolute" style={{ left: -26, top: -26 }}>
                  <Icon name="car" size={52} />
                </span>
              </div>
            </div>
            <p className="m-0 flex items-start justify-center text-center" style={{ marginTop: 14, gap: 8, whiteSpace: 'normal' }}>
              <span className="load-tip-chip pp-stroke shrink-0">TIP</span>
              <span className="pp-stroke text-sm md:text-base" style={{ textAlign: 'left' }}>
                {tip}
              </span>
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

export default LoadingScreen
