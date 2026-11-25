import { chapterLabel } from '@shared/chapters'
import { stageInfo } from '@shared/stages/index'

import { sfx } from '../audio/sfx'
import { burst } from '../game/fx/fxQueue'
import { currentStageInfo, stageRefused } from '../game/stageRuntime'
import { runtime } from '../game/runtime'
import { getGame } from '../store/game'

/** A point just above your car, for effects. */
const atCar = (dy = 2) => {
  const p = runtime.car.position
  return { x: p.x, y: p.y + dy, z: p.z }
}

/**
 * Applies one authority event to the client: updates the store and kicks off any
 * feedback. The same handler serves the Colyseus connection and offline play.
 * Payloads are documented in shared/session.js.
 */
export function handleServerEvent(type, payload) {
  const game = getGame()
  switch (type) {
    case 'profile':
      game.setProfile(payload.profile)
      break

    case 'reward':
      // Coins from driving through coins and tricks just tick the counter up.
      if (typeof payload.total === 'number') game.patchProfile({ coins: payload.total })
      break

    case 'purchased': {
      // A store product paid for with pearls (the profile sync carries the new balances).
      sfx.buy()
      burst({ ...atCar(), count: 40, palette: 'gold', speed: 8 })
      if (payload.coins > 0) game.showToast(`+${payload.coins.toLocaleString()} COINS!`, 'success', payload.name, `Paid ${payload.pearls} pearls`)
      else if (payload.slots) game.showToast(`ITEM SLOT ${payload.slots} UNLOCKED!`, 'success', payload.name, `Paid ${payload.pearls} pearls`)
      else game.showToast(payload.name, 'success')
      break
    }

    case 'checkpoint':
      // The car already celebrated crossing the gate; this is the pay-out.
      if (payload.coins > 0) {
        sfx.coin()
        // A finish that opened the next chapter says so (the finish card celebrates it too).
        const opened = payload.finish && Array.isArray(payload.unlocked) ? stageInfo(payload.unlocked[0]) : null
        if (opened) game.showToast(`${chapterLabel(opened.id) || opened.short} UNLOCKED!`, 'success', `${opened.short} · +${payload.coins} coins`)
        else if (payload.finish) game.showToast('SUMMIT REACHED!', 'success', `+${payload.coins} coins`)
        else game.showToast(`+${payload.coins} COINS`, 'checkpoint')
      }
      break

    case 'pearl': {
      // A Sky Pearl found for the first time (the HUD counter follows the profile).
      sfx.split(true)
      burst({ ...atCar(), count: 60, palette: 'confetti', speed: 10 })
      if (payload.complete) game.showToast('ALL SKY PEARLS!', 'success', `+${payload.coins.toLocaleString()} coins`, `Every pearl in ${currentStageInfo()?.name || 'this map'} found`)
      else game.showToast(`SKY PEARL ${payload.found}/${payload.total}`, 'checkpoint', `+${payload.coins} coins`)
      break
    }

    case 'locked':
      // Offline: the stand-in refused a map this save hasn't unlocked (net/localServer.js).
      stageRefused(payload.stage, payload.text)
      break

    case 'spin':
      game.setSpinResult({ ...payload, id: Date.now() })
      break

    case 'error':
      sfx.error()
      if (payload.type === 'spin' || payload.type === 'purchase') game.setSpinning(false)
      game.showToast(payload.text || 'Something went wrong', 'error')
      break

    default:
      break
  }
}
