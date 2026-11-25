import { useProgress } from '@react-three/drei'
import { useEffect, useState } from 'react'

import StrokeText from './StrokeText'
import RasterWarmup from './RasterWarmup'
import { HAZARD_TRIM } from './hud/style'

const TIPS = [
  'Hold NITRO on the straights - it refills while you cruise.',
  'Fell in the sea? You restart from your last checkpoint, never from the bottom.',
  'Flip in the air and land on your wheels for bonus coins!',
  'Item crates hold Spring Jumps, Turbo Cans, Shields and more.',
  'Spend coins at the Car Spin - 44 cars, from an ice-cream van to a hypercar.',
  'Beat your best split at every checkpoint to climb the boards.',
  'Bounce pads launch you over the gaps - hit them with speed.',
  'Giant hammers swing in a rhythm. Go while the head is up at one side!',
]

const INK = '#1a1530'
const asset = (name) => `${import.meta.env.BASE_URL}loading/${name}.webp`

/**
 * Two of the game's own cars, drawn from the real models (client/src/dev/carshot.js: a side view
 * in the golden hour's light; the body and one wheel, public/loading/). `w`/`h` the body picture's
 * size in pixels, `wheels` the near-side wheel centres in it (front first), `wheel` the wheel
 * picture's size.
 */
const REAL_CARS = {
  razorline: { w: 1029, h: 373, wheels: [[796, 280], [236, 280]], wheel: 203 },
  squall: { w: 905, h: 439, wheels: [[695, 353], [195, 353]], wheel: 190 },
}

/** A real car as SVG images in a group (the body and its two wheels, which turn). */
function RealCarArt({ id }) {
  const c = REAL_CARS[id]
  return (
    <g>
      <image href={asset(`${id}-body`)} width={c.w} height={c.h} />
      {c.wheels.map(([cx, cy], i) => (
        <image key={i} className="load-wheel" href={asset(`${id}-wheel`)} x={cx - c.wheel / 2} y={cy - c.wheel / 2} width={c.wheel} height={c.wheel} />
      ))}
    </g>
  )
}

/** The cars that drive across the pier while the game loads: width in scene units, the wheels' ground line, speed. */
const ROAD_CARS = [
  { id: 'squall', width: 400, ground: 590, dur: 8.6, delay: 2.4 },
  { id: 'razorline', width: 470, ground: 604, dur: 6.2, delay: 0.2 },
]

/**
 * The harbour at golden hour in one inline SVG: the game's own sky (a deep blue zenith through
 * apricot to a pale gold horizon), a low sun with its glow, dusk-lit cranes and containers, the sea
 * with the sun's glitter, and a pier whose near lane the two cars drive along.
 */
function Backdrop() {
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="ld-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#35569c" />
          <stop offset="0.28" stopColor="#4a74c2" />
          <stop offset="0.5" stopColor="#ffb27c" />
          <stop offset="0.66" stopColor="#ffe3ab" />
        </linearGradient>
        <linearGradient id="ld-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1890aa" />
          <stop offset="1" stopColor="#0c4b78" />
        </linearGradient>
        <radialGradient id="ld-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff6dc" />
          <stop offset="0.2" stopColor="#fff1c9" />
          <stop offset="0.5" stopColor="#ffae5a" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffae5a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ld-shadow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#0c0f1c" stopOpacity="0.55" />
          <stop offset="1" stopColor="#0c0f1c" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ld-streak" gradientUnits="userSpaceOnUse" x1="-170" y1="0" x2="-14" y2="0">
          <stop offset="0" stopColor="#fff2d4" stopOpacity="0" />
          <stop offset="1" stopColor="#fff2d4" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="ld-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd9a6" stopOpacity="0" />
          <stop offset="1" stopColor="#ffd9a6" stopOpacity="0.65" />
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#ld-sky)" />
      {/* The sun, low, behind the container stack, with a wide glow. */}
      <circle cx="1130" cy="440" r="330" fill="url(#ld-sun)" />
      <circle cx="1130" cy="440" r="64" fill="#fff6dc" />
      {/* Clouds lit from below: apricot and rose. */}
      <g opacity="0.92">
        <ellipse cx="300" cy="190" rx="190" ry="26" fill="#ffd9bd" />
        <ellipse cx="360" cy="170" rx="100" ry="26" fill="#ffe9cf" />
        <ellipse cx="300" cy="206" rx="170" ry="14" fill="#d98a8f" opacity="0.7" />
        <ellipse cx="860" cy="270" rx="220" ry="22" fill="#ffd1a6" />
        <ellipse cx="930" cy="252" rx="110" ry="22" fill="#ffe9cf" />
        <ellipse cx="520" cy="360" rx="150" ry="16" fill="#ffc79a" opacity="0.8" />
        <ellipse cx="1430" cy="250" rx="150" ry="20" fill="#ffd1a6" opacity="0.85" />
      </g>
      {/* Far skyline in haze. */}
      <g fill="#c98f94" opacity="0.7">
        <rect x="40" y="430" width="70" height="110" />
        <rect x="120" y="400" width="54" height="140" />
        <rect x="182" y="440" width="90" height="100" />
        <rect x="660" y="430" width="60" height="110" />
        <rect x="730" y="410" width="48" height="130" />
        <rect x="1450" y="420" width="80" height="120" />
        <rect x="1540" y="445" width="70" height="95" />
      </g>
      <rect y="400" width="1600" height="142" fill="url(#ld-haze)" />

      {/* The sea, and the sun's glitter on it. */}
      <rect y="610" width="1600" height="290" fill="url(#ld-sea)" />
      <g stroke="#ffcf7a" strokeLinecap="round" opacity="0.8">
        <path d="M1060 640h140M1090 668h100M1040 700h170M1075 732h110M1020 770h200M1065 810h130M1000 850h230" strokeWidth="6" />
      </g>
      <g stroke="#ffe2b8" strokeWidth="4" strokeLinecap="round" opacity="0.4">
        <path d="M120 660h90M420 700h120M240 760h110M640 790h90M1380 670h80M1420 790h120" />
      </g>

      {/* Crane 1 (left) and crane 2 (right), dusk-lit. */}
      <g stroke={INK} strokeWidth="7" strokeLinejoin="round">
        <path d="M200 610V250h40v360z" fill="#4a5f86" />
        <path d="M200 250L120 330M240 250L330 330" fill="none" />
        <path d="M110 230h480v34H110z" fill="#d9942a" />
        <path d="M200 230l20-60 20 60z" fill="#4a5f86" />
        <path d="M520 264v150" fill="none" strokeWidth="5" />
        <path d="M500 414h40v28h-40z" fill="#b24a3f" />
      </g>
      <g stroke={INK} strokeWidth="7" strokeLinejoin="round">
        <path d="M1330 610V300h34v310z" fill="#3b4f73" />
        <path d="M1050 282h420v30H1050z" fill="#d86a24" />
        <path d="M1330 282l17-50 17 50z" fill="#3b4f73" />
        <path d="M1110 312v120" fill="none" strokeWidth="5" />
        <path d="M1090 432h40v24h-40z" fill="#3b5aa6" />
      </g>
      {/* Container stack, backlit. */}
      <g stroke={INK} strokeWidth="6" strokeLinejoin="round">
        <rect x="980" y="470" width="190" height="70" fill="#b24a3f" />
        <rect x="1170" y="470" width="190" height="70" fill="#2f8a6a" />
        <rect x="1070" y="400" width="190" height="70" fill="#3b5aa6" />
        <rect x="1260" y="400" width="190" height="70" fill="#c8892f" />
        <rect x="1160" y="330" width="190" height="70" fill="#6f4fb3" />
      </g>
      <g stroke="rgba(26,21,48,0.4)" strokeWidth="5">
        <path d="M1010 480v50M1040 480v50M1070 480v50M1200 480v50M1230 480v50M1260 480v50M1100 410v50M1130 410v50M1290 410v50M1320 410v50M1190 340v50M1220 340v50" />
      </g>

      {/* The pier: a kerb along its far edge, the asphalt deck, a moving lane line, the near edge. */}
      <path d="M0 540h1600v70H0z" fill="#454a58" stroke={INK} strokeWidth="6" />
      <path d="M0 540h1600v10H0z" fill="#f2f4f7" />
      <g fill="#ff4f9a">
        {Array.from({ length: 40 }, (_, i) => (
          <rect key={i} x={i * 80} y="540" width="40" height="10" />
        ))}
      </g>
      <path className="load-dash" d="M-80 584H1700" stroke="#f2f4f7" strokeWidth="5" strokeDasharray="46 34" opacity="0.8" />
      <path d="M0 610h1600v14H0z" fill={INK} />

      {/* The cars, driving in from the left and out on the right; they get a soft shadow and a few speed streaks. */}
      {ROAD_CARS.map((car) => {
        const c = REAL_CARS[car.id]
        const k = car.width / c.w
        const wheelY = c.wheels[0][1] + c.wheel / 2
        return (
          <g key={car.id} className="load-roll" style={{ '--dur': `${car.dur}s`, '--delay': `${car.delay}s` }}>
            <g transform={`translate(0 ${car.ground - wheelY * k})`}>
              <ellipse cx={car.width * 0.5} cy={wheelY * k + 2} rx={car.width * 0.5} ry="11" fill="url(#ld-shadow)" />
              <g stroke="url(#ld-streak)" strokeWidth="4" strokeLinecap="round" opacity="0.9">
                <path d={`M-130 ${c.h * k * 0.5}H-14M-90 ${c.h * k * 0.66}H-14M-170 ${c.h * k * 0.82}H-14`} stroke="url(#ld-streak)" />
              </g>
              <g className="load-bob">
                <g transform={`scale(${k})`}>
                  <RealCarArt id={car.id} />
                </g>
              </g>
            </g>
          </g>
        )
      })}
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
            <span className="load-drive" style={{ fontSize: 'clamp(38px, min(8vw, 12vh), 100px)' }}>
              <StrokeText stroke="0.16em" gradient="linear-gradient(180deg, #ffffff 0%, #ffffff 52%, #ffe36b 53%, #ffb21e 100%)">
                DRIVE ONLY
              </StrokeText>
            </span>
            <span style={{ fontSize: 'clamp(56px, min(13vw, 19vh), 170px)', marginTop: '-0.1em' }}>
              <StrokeText stroke="0.15em" gradient="linear-gradient(180deg, #ffd0a0 0%, #ff8a2a 50%, #e8590c 100%)">
                UP!
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
                <span className="load-car absolute" style={{ left: -34, top: -12 }}>
                  <svg width="68" height="25" viewBox="0 0 1029 373" aria-hidden="true">
                    <RealCarArt id="razorline" />
                  </svg>
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
