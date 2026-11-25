import { MAX_SLOTS, SLOT_COSTS } from '@shared/balance'

import { sfx } from '../../audio/sfx'
import { actions } from '../../net/actions'
import { useGame } from '../../store/game'

/** Price of item slot `index` (0-based), or null if it's free / doesn't exist. */
export function slotCost(index) {
  const cost = SLOT_COSTS?.[index + 1]
  return index < (MAX_SLOTS || 3) && Number.isFinite(cost) && cost > 0 ? cost : null
}

/** Cost of unlocking the next slot when you have `slots` unlocked, or null at max. */
export function nextSlotCost(slots) {
  // SLOT_COSTS is indexed by the slot count you'd end up with.
  const cost = SLOT_COSTS?.[slots + 1]
  return slots < (MAX_SLOTS || 3) && Number.isFinite(cost) ? cost : null
}

/** Buys the next item slot, or says why not. */
export function buyNextSlot() {
  const { profile, showToast } = useGame.getState()
  const cost = nextSlotCost(profile.slots || 1)
  if (cost == null) return
  if ((profile.coins || 0) < cost) {
    sfx.error()
    showToast('Not enough coins', 'error', `Item slot ${(profile.slots || 1) + 1} costs ${cost}`)
    return
  }
  sfx.buy()
  actions.unlockSlot()
}

