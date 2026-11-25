import { useEffect } from 'react'

import { sfx } from '../../audio/sfx'
import { ITEMS, requestItem } from '../../game/player/items'
import { useGame } from '../../store/game'
import Icon from '../Icon'
import { SLOT_CODES, SLOT_LABELS, skipKey } from './hotkeys'
import { CoinAmount, KeyHint } from './parts'
import { buyNextSlot, slotCost } from './slots'
import { HAZARD_TRIM, u } from './style'

/**
 * One slot: a little shipping container with its key on the door. Empty, holding an
 * item (press it or its key to use), or locked: "UNLOCK" and the price - gold when it's
 * the next one and you can afford it (press to buy), dimmed while an earlier slot is
 * still locked.
 */
function Slot({ index, item, state, cost, coins }) {
  const def = item ? ITEMS[item] : null
  const locked = state === 'buy' || state === 'later'
  const onClick = () => {
    if (state === 'buy') buyNextSlot()
    else if (state === 'later') {
      sfx.error()
      useGame.getState().showToast(`Unlock slot ${index} first`, 'info')
    } else if (def) requestItem(index)
  }
  const face = def ? def.color : '#2e7383'
  const key = SLOT_LABELS[index]
  return (
    <button
      type="button"
      onClick={onClick}
      className="hud-slot pp-btn pointer-events-auto relative flex flex-col items-center justify-center"
      data-state={def ? 'item' : state}
      title={def ? `${def.name} (${key})` : locked ? `Unlock item slot ${index + 1}` : `Empty slot (${key})`}
      style={{
        width: 'var(--slot)',
        height: 'var(--slot)',
        borderRadius: u(16),
        border: `${u(4)} solid #0d1530`,
        // Flat (no gloss gradient over the slats): see ../flatFill.js.
        background: locked
          ? 'repeating-linear-gradient(90deg, #3a4150 0 8%, #2c323e 8% 16%)'
          : `repeating-linear-gradient(90deg, ${face} 0 8%, rgba(0,0,0,0.2) 8% 9%, ${face} 9% 16%)`,
      }}
    >
      <span className="hud-slot-trim absolute left-0 right-0 top-0" style={{ height: u(9), background: HAZARD_TRIM }} />
      {!locked && <KeyHint k={key} className="hud-slot-key absolute" />}
      {def && (
        <span className="hud-slot-icon">
          <Icon name={def.id} size="calc(var(--slot) * 0.5)" />
        </span>
      )}
      {def && (
        <span className="pp-stroke max-w-full truncate" style={{ fontSize: 'calc(var(--slot) * 0.13)', padding: `0 ${u(4)}` }}>
          {def.name}
        </span>
      )}
      {!def && !locked && <span className="hud-slot-empty" />}
      {locked && (
        <>
          <Icon name="lock" size="calc(var(--slot) * 0.3)" style={{ marginTop: u(6) }} />
          <span className="hud-slot-unlock pp-stroke" style={{ fontSize: 'calc(var(--slot) * 0.16)' }}>
            UNLOCK
          </span>
          {cost != null && <CoinAmount amount={cost} size={20} afford={state === 'buy' && coins >= cost} />}
        </>
      )}
    </button>
  )
}

/**
 * Item slots, bottom centre under the nitro bar. Q / E / F (or 1 / 2 / 3) use them. On
 * touch devices the TouchControls draw their own item buttons and this row is hidden
 * by CSS.
 */
export function ItemSlots() {
  const items = useGame((s) => s.items)
  const slots = useGame((s) => s.profile.slots || 1)
  const coins = useGame((s) => s.profile.coins || 0)

  useEffect(() => {
    const onKey = (e) => {
      if (skipKey(e) || useGame.getState().panel) return
      const i = SLOT_CODES[e.code]
      if (i === undefined) return
      const { items: held, profile } = useGame.getState()
      if (i < (profile.slots || 1) && held[i]) requestItem(i)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="hud-items pointer-events-none flex" style={{ gap: 'var(--slot-gap)' }}>
      {[0, 1, 2].map((i) => (
        <Slot key={i} index={i} item={i < slots ? items[i] : null} state={i < slots ? 'open' : i === slots ? 'buy' : 'later'} cost={i < slots ? null : slotCost(i)} coins={coins} />
      ))}
    </div>
  )
}

export default ItemSlots
