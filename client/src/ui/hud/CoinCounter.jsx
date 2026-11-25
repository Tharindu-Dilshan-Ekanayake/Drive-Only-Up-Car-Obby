import { useEffect, useRef, useState } from 'react'

import { useGame } from '../../store/game'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { TickNumber } from './parts'
import { formatCoins, GRADIENTS, u } from './style'
import { replayClass } from './useLive'

/**
 * Your coins, in the brand card (BrandCorner). When the total grows the number
 * counts up to it (TickNumber, on the live loop), the coin flips, the counter bumps and
 * a "+N" chip floats up.
 * Re-renders only when the coin total changes.
 */
export function CoinCounter() {
  const coins = useGame((s) => s.profile.coins || 0)
  const loaded = useGame((s) => s.profileLoaded)
  const prev = useRef(coins)
  const numRef = useRef(null)
  const iconRef = useRef(null)
  const [gains, setGains] = useState([])
  // Becomes true just after the profile first loads: that first jump snaps, later ones count.
  const [live, setLive] = useState(false)

  useEffect(() => {
    if (!loaded || live) return undefined
    const id = setTimeout(() => setLive(true), 0)
    return () => clearTimeout(id)
  }, [loaded, live])

  useEffect(() => {
    const diff = coins - prev.current
    prev.current = coins
    if (!live || diff <= 0) return undefined
    const id = Date.now() + Math.random()
    replayClass(numRef.current, 'pp-bump')
    replayClass(iconRef.current, 'hud-coins-flip')
    // Deferred so the state change doesn't land inside this effect's render pass.
    const t0 = setTimeout(() => setGains((g) => [...g.slice(-3), { id, amount: diff }]), 0)
    const t1 = setTimeout(() => setGains((g) => g.filter((x) => x.id !== id)), 1100)
    return () => {
      clearTimeout(t0)
      clearTimeout(t1)
    }
  }, [coins, live])

  return (
    <div className="hud-coins hud-chip pointer-events-none relative flex items-center" title="Coins">
      <span ref={iconRef} className="hud-coins-icon absolute" style={{ left: u(-14), top: '50%', marginTop: u(-31) }}>
        <Icon name="coin" size={u(62)} />
      </span>
      <span ref={numRef} className="pp-bump-wrap" style={{ fontSize: u(38), lineHeight: 1 }}>
        <TickNumber value={coins} animate={live} stroke={u(9)} gradient={GRADIENTS.gold} />
      </span>
      {gains.map((g) => (
        <span key={g.id} className="hud-coin-gain absolute" style={{ left: u(48), top: u(-18), fontSize: u(28) }}>
          <StrokeText stroke={u(7)} gradient={GRADIENTS.green}>{`+${formatCoins(g.amount)}`}</StrokeText>
        </span>
      ))}
    </div>
  )
}

export default CoinCounter
