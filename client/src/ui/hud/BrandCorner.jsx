import CoinCounter from './CoinCounter'
import MenuBar from './MenuBar'
import PearlCounter from './PearlCounter'

/**
 * The top-left corner, one column: an EMPTY gap at the very top, then your coins and
 * Sky Pearls as plain outlined text (no card behind them), then the menu dock.
 *
 * The gap is on purpose: when the game is hosted, the host site draws its own logo and
 * buttons in the top-left corner, so nothing of ours goes there (its size is
 * --host-gap-h in index.css). The counters re-render only when their totals change.
 */
export function BrandCorner() {
  return (
    <div className="hud-corner pointer-events-none absolute flex flex-col items-stretch">
      <div className="hud-host-gap" aria-hidden="true" />
      <div className="hud-wallet flex flex-col">
        <CoinCounter />
        <PearlCounter />
      </div>
      <MenuBar />
    </div>
  )
}

export default BrandCorner
