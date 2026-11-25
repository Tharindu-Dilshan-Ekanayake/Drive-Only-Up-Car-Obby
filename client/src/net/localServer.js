import { lockedMessage } from '@shared/chapters'
import { isStageUnlocked, normalizeProfile, toSaveData } from '@shared/logic'
import { PlayerSession } from '@shared/session'
import { loadStage, STAGES } from '@shared/stages/index'

import { runtime } from '../game/runtime'

const SAVE_KEY = 'uwd.save.v1'
const TICK_MS = 100
const SAVE_MS = 5000

function loadSave() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null')
  } catch {
    return null
  }
}

/**
 * Offline stand-in for the game server: runs the same PlayerSession the Colyseus room
 * runs, against a save in localStorage. Used when no server is configured or it can't
 * be reached, so the game is always playable.
 *
 * The session needs its map's stage, which loads lazily: the profile is sent at once
 * (the HUD and garage don't need a stage), messages sent before the stage is there
 * wait in a short queue. `switchStage(id)` moves the session to another map (travel).
 * A map still locked for this save (a chapter: shared/logic.js isStageUnlocked) is
 * refused as the room refuses it: a 'locked' event `{ stage, text }`, and the session
 * stays where it was (the client goes back to Sky Docks).
 *
 * @param {{ id: string, name: string, stageId: string, onEvent: (type: string, payload: object) => void }} options
 * @returns {{ send: (type: string, payload?: object) => void, switchStage: (id: string) => void, unlockAll: () => void, close: () => void }}
 */
export function createLocalServer({ id, name, stageId, onEvent }) {
  const profile = normalizeProfile(loadSave(), id, name)
  // The session mutates its profile in place; the UI must get its own copy or it would
  // never see a change (same reference) and could edit server state.
  const emit = (type, payload) => onEvent(type, payload ? structuredClone(payload) : payload)
  let session = null
  let closed = false
  /** Messages that arrived before the stage was loaded. */
  const queue = []
  /** The map the session should be on (the last asked for). */
  let wanted = stageId

  const save = () => {
    try {
      profile.lastSeen = Date.now()
      localStorage.setItem(SAVE_KEY, JSON.stringify(toSaveData(profile)))
    } catch {
      // Storage full or blocked: progress just won't persist this session.
    }
  }

  const handle = (type, payload) => {
    // Offline there is no server to verify Boxity's word, so the host-only grant is
    // taken here. It is only ever sent by bloxity/services.js, after Boxity reported a
    // completed rewarded ad.
    if (type === 'adReward') {
      if (typeof payload?.placement === 'string') session.grantAdReward(payload.placement, Date.now())
      save()
      return
    }
    session.handle(type, payload, Date.now())
  }

  /** Puts the session on map `sid` once its stage is built (ignored if overtaken). */
  const goTo = (sid) => {
    if (!isStageUnlocked(profile, sid)) {
      // Next tick: at start-up (`?map=`) the connection isn't wired up yet.
      setTimeout(() => {
        if (!closed) emit('locked', { stage: sid, text: lockedMessage(sid) })
      }, 0)
      return
    }
    wanted = sid
    loadStage(sid).then((stage) => {
      if (closed || wanted !== sid) return
      if (!session) {
        session = new PlayerSession(profile, { now: Date.now(), emit, getPosition: () => runtime.car.position, stage })
        session.sendProfile()
      } else if (session.stage !== stage) {
        session.setStage(stage)
      }
      for (const [type, payload] of queue.splice(0)) handle(type, payload)
      save()
    })
  }

  emit('profile', { profile })
  goTo(stageId)

  let last = performance.now()
  const tickId = setInterval(() => {
    const t = performance.now()
    session?.tick(Math.min(0.5, (t - last) / 1000), Date.now())
    last = t
  }, TICK_MS)
  const saveId = setInterval(save, SAVE_MS)
  const onHide = () => {
    if (document.visibilityState === 'hidden') save()
  }
  window.addEventListener('beforeunload', save)
  document.addEventListener('visibilitychange', onHide)

  return {
    send(type, payload) {
      if (!session || session.stage.id !== wanted) {
        if (queue.length < 64) queue.push([type, payload])
        return
      }
      handle(type, payload)
    },
    switchStage(sid) {
      // A restart for the map we're leaving may still be queued: apply it there first.
      if (session && queue.length && session.stage.id !== sid) for (const [type, payload] of queue.splice(0)) handle(type, payload)
      goTo(sid)
    },
    /**
     * Testing only (`?debug`: `__pp.unlockAll()`, offline): opens every locked chapter in
     * this local save. There is no online counterpart - the server only ever unlocks a
     * chapter at a finish it recorded itself.
     */
    unlockAll() {
      profile.unlocks = STAGES.filter((s) => s.unlock).map((s) => s.id)
      emit('profile', { profile })
      save()
    },
    close() {
      closed = true
      clearInterval(tickId)
      clearInterval(saveId)
      window.removeEventListener('beforeunload', save)
      document.removeEventListener('visibilitychange', onHide)
      save()
    },
  }
}
