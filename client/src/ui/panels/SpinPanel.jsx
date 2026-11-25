import { useEffect, useRef, useState } from 'react'

import { AD_REWARDS, PITY_SPINS, SPIN_COST } from '@shared/balance'
import { carById, CARS, RARITIES, RARITY_INFO } from '@shared/cars'

import { sfx } from '../../audio/sfx'
import { isRewardedAvailable, watchRewardedAd } from '../../bloxity/services'
import { actions } from '../../net/actions'
import { useGame } from '../../store/game'
import StrokeText from '../StrokeText'
import { ChunkyButton, CoinAmount, SectionLabel } from '../hud/parts'
import { GRADIENTS, RARITY_GRADIENT, u } from '../hud/style'
import CarThumb from './CarThumb'
import RarityTag from './RarityTag'
import Panel, { Well } from './Panel'

/** Shortest time the reel rolls before it may start landing, ms. */
const MIN_ROLL_MS = 1400
/** Give up waiting for the authority after this long, ms. */
const TIMEOUT_MS = 8000
const ROLL_STEP_MS = 75
/** The landing slows down over these steps, the last one showing your car. */
const LANDING_STEPS = [95, 125, 165, 215, 280, 360]
/** Rewarded-ad placement that grants a free spin (shared/balance.js AD_REWARDS). */
const FREE_SPIN_PLACEMENT = Object.keys(AD_REWARDS || {}).find((k) => AD_REWARDS[k]?.grant?.spin) || 'free-spin'

/** Wall clock for the reel (kept out of the component body). */
const clock = () => performance.now()

const TOTAL_WEIGHT = RARITIES.reduce((sum, r) => sum + (RARITY_INFO[r]?.weight || 0), 0)
const COUNT_BY_RARITY = Object.fromEntries(RARITIES.map((r) => [r, CARS.filter((c) => c.rarity === r).length]))

const randomCar = (not) => {
  let c = CARS[Math.floor(Math.random() * CARS.length)]
  if (c.id === not) c = CARS[(CARS.indexOf(c) + 1) % CARS.length]
  return c.id
}

/**
 * Car Spin: pay coins, the reel rolls through every car and lands on what the
 * authority picked (store.spinResult). Odds and pity progress alongside.
 */
export function SpinPanel() {
  const coins = useGame((s) => s.profile.coins || 0)
  const pity = useGame((s) => s.profile.pity || 0)
  const spinning = useGame((s) => s.spinning)

  /** 'idle' | 'rolling' | 'done' */
  const [phase, setPhase] = useState('idle')
  const [reel, setReel] = useState(() => ({ carId: useGame.getState().profile.car, step: 0 }))
  const [landed, setLanded] = useState(null)
  const timer = useRef(0)
  const run = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const stopRun = () => {
    clearTimeout(timer.current)
    run.current = null
  }

  const step = (carId) => setReel((r) => ({ carId, step: r.step + 1 }))

  /** One reel tick: keep rolling, start landing, or give up. */
  const tick = () => {
    const r = run.current
    if (!r) return
    const now = clock()
    const { spinResult, spinning: waiting } = useGame.getState()
    const fresh = spinResult && spinResult.id !== r.startId ? spinResult : null

    if (r.landing) {
      const i = r.landingIndex
      if (i < LANDING_STEPS.length - 1) {
        sfx.spinTick()
        step(randomCar(r.target.carId))
        r.landingIndex += 1
        timer.current = setTimeout(tick, LANDING_STEPS[i])
        return
      }
      // Land.
      step(r.target.carId)
      setLanded(r.target)
      setPhase('done')
      sfx.spinWin(r.target.rarity)
      stopRun()
      return
    }

    if (fresh && now - r.startedAt >= MIN_ROLL_MS) {
      r.landing = true
      r.landingIndex = 0
      r.target = fresh
      timer.current = setTimeout(tick, LANDING_STEPS[0])
      return
    }
    // The authority said no (not enough coins, an error) or never answered.
    if ((!waiting && !fresh && now - r.startedAt > 300) || now - r.startedAt > TIMEOUT_MS) {
      stopRun()
      setPhase('idle')
      if (waiting) useGame.getState().setSpinning(false)
      if (now - r.startedAt > TIMEOUT_MS) useGame.getState().showToast('No answer from the spin', 'error', 'Try again in a moment')
      return
    }
    sfx.spinTick()
    step(randomCar())
    timer.current = setTimeout(tick, ROLL_STEP_MS)
  }

  const startReel = () => {
    stopRun()
    setLanded(null)
    setPhase('rolling')
    run.current = { startedAt: clock(), startId: useGame.getState().spinResult?.id ?? null, landing: false }
    timer.current = setTimeout(tick, ROLL_STEP_MS)
  }

  // Opened mid-spin (a Mega Spin from the Store, an ad's free spin): roll the reel.
  const result = useGame((s) => s.spinResult)
  const seenResult = useRef(useGame.getState().spinResult?.id ?? null)
  useEffect(() => {
    if (!useGame.getState().spinning) return undefined
    const id = setTimeout(startReel, 0)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on open
  }, [])
  // A result the reel didn't roll for (it arrived before the panel opened): show it.
  useEffect(() => {
    if (!result || result.id === seenResult.current) return undefined
    seenResult.current = result.id
    if (run.current) return undefined
    const id = setTimeout(() => {
      setReel((r) => ({ carId: result.carId, step: r.step + 1 }))
      setLanded(result)
      setPhase('done')
      sfx.spinWin(result.rarity)
    }, 0)
    return () => clearTimeout(id)
  }, [result])

  const onSpin = () => {
    if (phase === 'rolling' || spinning) return
    if (coins < SPIN_COST) {
      sfx.error()
      useGame.getState().showToast('Not enough coins', 'error', `A spin costs ${SPIN_COST} coins - drive higher to earn more!`)
      return
    }
    useGame.getState().setSpinning(true)
    // Reel first: it notes the last result's id, and the offline server answers at once.
    startReel()
    actions.spin()
  }

  const onFreeSpin = async () => {
    if (phase === 'rolling' || spinning) return
    const res = await watchRewardedAd(FREE_SPIN_PLACEMENT)
    if (!res.ok) return
    useGame.getState().setSpinning(true)
    startReel()
  }

  const reelCar = carById(reel.carId)
  const shown = phase === 'done' && landed ? landed : null
  const rarity = shown ? shown.rarity : reelCar.rarity
  const pityLeft = Math.max(0, (PITY_SPINS || 0) - pity)
  const canAfford = coins >= SPIN_COST
  const busy = phase === 'rolling' || spinning
  const adAvailable = isRewardedAvailable()

  return (
    <Panel title="CAR SPIN" icon="spin" width={1180}>
      <div className="flex flex-col md:flex-row" style={{ gap: u(20) }}>
        {/* The reel. */}
        <Well className="pp-stage relative flex flex-1 flex-col items-center justify-center overflow-hidden" style={{ minHeight: u(520), gap: u(12), ['--rarity']: RARITY_INFO[rarity].color }}>
          {shown && (
            <div
              className="spin-rays pointer-events-none absolute"
              style={{
                width: u(900),
                height: u(900),
                background: `repeating-conic-gradient(from 0deg, ${RARITY_INFO[rarity].color}55 0 12deg, transparent 12deg 24deg)`,
                borderRadius: '50%',
              }}
            />
          )}
          <div key={shown ? `land-${shown.id}` : reel.step} className={shown ? 'spin-land relative' : phase === 'rolling' ? 'spin-step relative' : 'relative'}>
            <div className="pp-reel relative flex items-center justify-center overflow-hidden" style={{ width: u(340), height: u(300), borderRadius: u(30), background: RARITY_GRADIENT[rarity], border: `${u(6)} solid #0d1530` }}>
              <CarThumb carId={reel.carId} size={u(290)} style={{ position: 'relative' }} />
            </div>
            {shown?.isNew && (
              <span className="pp-new-tag pp-stroke absolute" style={{ top: u(-22), right: u(-30), fontSize: u(34) }}>
                NEW!
              </span>
            )}
          </div>
          <RarityTag rarity={rarity} size={26} />
          <span style={{ fontSize: u(46) }}>
            <StrokeText stroke={u(10)}>{phase === 'rolling' ? 'Spinning…' : reelCar.name}</StrokeText>
          </span>
          {shown && !shown.isNew && (
            <span className="flex items-center" style={{ gap: u(10) }}>
              <span className="pp-stroke" style={{ fontSize: u(24) }}>
                Already yours - coins back
              </span>
              <CoinAmount amount={shown.refund || 0} size={30} />
            </span>
          )}
          {shown?.isNew && (
            <span className="pp-stroke" style={{ fontSize: u(24), color: '#c4ecff' }}>
              Added to your garage and ready to drive!
            </span>
          )}
        </Well>

        {/* Odds, pity and the button. */}
        <div className="flex w-full shrink-0 flex-col md:w-[calc(var(--px)*440)]" style={{ gap: u(14) }}>
          <Well>
            <SectionLabel right={<span className="pp-stroke" style={{ fontSize: u(17), opacity: 0.7 }}>chance · cars</span>}>CHANCES</SectionLabel>
            <div className="flex flex-col" style={{ gap: u(6) }}>
              {RARITIES.map((r) => {
                const pct = (RARITY_INFO[r].weight / TOTAL_WEIGHT) * 100
                return (
                  <div key={r} className="pp-odds-row relative flex items-center justify-between overflow-hidden" style={{ fontSize: u(23), padding: `${u(4)} ${u(10)}`, borderRadius: u(10), ['--rarity']: RARITY_INFO[r].color }}>
                    <span className="pp-odds-fill absolute inset-y-0 left-0" style={{ width: `${Math.max(3, pct)}%` }} />
                    <span className="pp-stroke relative flex items-center" style={{ color: RARITY_INFO[r].color, gap: u(8) }}>
                      <span className="pp-odds-dot" style={{ background: RARITY_GRADIENT[r] }} />
                      {RARITY_INFO[r].label}
                    </span>
                    <span className="relative flex items-center" style={{ gap: u(18) }}>
                      <span className="pp-stroke tabular-nums">{`${pct.toFixed(1)}%`}</span>
                      <span className="pp-stroke tabular-nums text-right" style={{ width: u(30), opacity: 0.7 }}>
                        {COUNT_BY_RARITY[r]}
                      </span>
                    </span>
                  </div>
                )
              })}
            </div>
          </Well>

          {PITY_SPINS > 0 && (
            <Well>
              <span className="pp-stroke" style={{ fontSize: u(20), whiteSpace: 'normal', lineHeight: 1.3, display: 'block' }}>
                {pityLeft > 0 ? `Legendary or better guaranteed within ${pityLeft} spin${pityLeft === 1 ? '' : 's'}` : 'Next spin is Legendary or better!'}
              </span>
              <div className="pp-bar relative overflow-hidden" style={{ marginTop: u(10), height: u(20), borderRadius: u(10) }}>
                <div className="pp-bar-fill absolute inset-y-0 left-0" data-tone="pity" style={{ width: `${Math.max(2, Math.min(100, (pity / PITY_SPINS) * 100))}%`, borderRadius: u(8) }} />
              </div>
            </Well>
          )}

          <Well className="flex items-center justify-between">
            <span className="pp-stroke" style={{ fontSize: u(22) }}>
              YOU HAVE
            </span>
            <CoinAmount amount={coins} size={32} afford={canAfford} />
          </Well>

          <ChunkyButton onClick={onSpin} disabled={busy} ready={canAfford} gradient={canAfford ? GRADIENTS.goldButton : GRADIENTS.greyButton} radius={22} border={5} style={{ height: u(110), gap: u(14) }}>
            <span style={{ fontSize: u(46) }}>
              <StrokeText stroke={u(10)}>SPIN</StrokeText>
            </span>
            <CoinAmount amount={SPIN_COST} size={36} afford={canAfford} />
          </ChunkyButton>
          {adAvailable && (
            <ChunkyButton onClick={onFreeSpin} disabled={busy} gradient={GRADIENTS.tealButton} radius={18} border={4} style={{ height: u(76) }}>
              <span style={{ fontSize: u(28) }}>
                <StrokeText stroke={u(6)}>FREE SPIN (WATCH AD)</StrokeText>
              </span>
            </ChunkyButton>
          )}
          {!canAfford && (
            <span className="pp-stroke text-center" style={{ fontSize: u(20), whiteSpace: 'normal', lineHeight: 1.3, display: 'block', opacity: 0.85 }}>
              Collect coins on the track, hit checkpoints and land tricks to earn more.
            </span>
          )}
        </div>
      </div>
    </Panel>
  )
}

export default SpinPanel
