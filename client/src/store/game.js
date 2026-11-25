import { create } from 'zustand'

import { createProfile } from '@shared/logic'
import { ROOM_CAPACITY } from '@shared/poseCodec'
import { DEFAULT_STAGE, validStageId } from '@shared/stages/index'

/** The map to start on: Sky Docks, or `?map=<id>` in the URL (testing, links). */
const startStage = () => validStageId(typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('map') : DEFAULT_STAGE)

/**
 * Everything the UI renders from. Written by the network layer (profile, events), the
 * 10 Hz game ticker and the player controller's events - never from inside a frame
 * loop (they defer with setTimeout / queue for the ticker).
 *
 * Components must select narrowly (`useGame((s) => s.profile.coins)`).
 *
 * Per-frame values (speed, altitude, nitro, timer) are NOT here: they live in
 * `runtime` (game/runtime.js) and the HUD writes them to the DOM directly.
 */
export const useGame = create((set) => ({
  /**
   * Authoritative copy of the player's save, as last sent by the authority. Shape:
   * `{ id, name, coins, cars: string[], car, slots (1-3),
   *    maps: { [stageId]: { checkpoint, best: { checkpoint, altitude, finishMs }, splits: { [cp]: ms }, pearls } },
   *    unlocks: string[] (chapters opened for good),
   *    stats: { totalCoins, finishes, tricks, spins, falls, playtime }, pity,
   *    settings: { music, sfx, ghost, sunset }, createdAt, lastSeen }`
   * The current map's progress: `progressOf(profile, stageId)` (game/stageRuntime.js useMapProgress).
   */
  profile: createProfile('local', 'Player'),
  profileLoaded: false,
  /** True once the game is on screen; non-essential start-up work waits for it. */
  playable: false,

  net: {
    /** 'connecting' | 'online' | 'offline' */
    mode: 'connecting',
    lobbyId: null,
    code: null,
    isPrivate: false,
    players: 1,
    maxPlayers: ROOM_CAPACITY,
    message: null,
  },
  /** `{ altitude: [{ name, score }], coins: [...], finishes: [...], playtime: [...], updatedAt }` */
  leaderboards: null,

  /** The map you're on (shared/stages/index.js id): its lobby theme, Start gate, room and progress. */
  stageId: startStage(),
  /** That map's built stage once loaded (game/stageRuntime.js), null while loading. Never mutated. */
  stage: null,
  /** True once the stage's track is built and drivable (the Start gate opens). */
  stageReady: false,
  /**
   * True once that stage's GPU work is done behind the loading screen - every program
   * linked, buffer uploaded, driver variant built (game/StageWarmup.jsx) - so nothing on
   * the map costs a frame the first time it's seen. Ends the loading screen (start-up and travel).
   */
  stageWarm: false,
  /**
   * How far the current map's track is from ready (0-1) while it's prepared in the
   * background (game/stageRuntime.js loadCurrentStage, game/StageWarmup.jsx): the timer
   * plate's "PREPARING TRACK n%". Set at a few milestones, never per frame.
   */
  trackPrep: 0,
  /** Travelling to another map: `{ to, from, progress (0-1), id }`, null otherwise (the loading screen). */
  travel: null,

  /**
   * Item slots, client-side: `[itemId | null, itemId | null, itemId | null]`.
   * Only the first `profile.slots` are usable. Item ids: game/player/items.js ITEMS.
   */
  items: [null, null, null],

  /** The drive-in pad or checkpoint kiosk you're parked on: 'spin' | 'garage' | null. */
  pad: null,

  /** Which modal panel is open: 'spin' | 'garage' | 'settings' | 'leaderboards' | 'store' | null. */
  panel: null,
  panelData: null,

  /** Latest car-spin result: `{ carId, rarity, isNew, refund, id }` (id = Date.now()). */
  spinResult: null,
  /** True while a spin request is waiting for the authority. */
  spinning: false,

  /** Center banner: `{ text, sub?, kind: 'info'|'success'|'error'|'trick'|'checkpoint', id }`. */
  toast: null,
  /**
   * Run summary shown at the finish: `{ timeMs, coins, best, unlock, id }`; `unlock` is the
   * map id of the chapter this finish opened for the first time (else null).
   */
  finishResult: null,
  /**
   * The checkpoint just reached, for the split card: `{ index, splitMs, bestMs, id }`.
   * `bestMs` is your best split there BEFORE this run (0 = none yet).
   */
  lastSplit: null,
  /** Stage section you're driving (0 = Start..CP1); changes rarely (ticker). */
  section: 0,

  // --- Actions -----------------------------------------------------------------

  setProfile: (profile) => set({ profile, profileLoaded: true }),
  patchProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
  setNet: (patch) => set((s) => ({ net: { ...s.net, ...patch } })),
  setPlayable: () => set({ playable: true }),
  setLeaderboards: (leaderboards) => set({ leaderboards }),
  setStageReady: (stageReady) => set({ stageReady }),
  setStageWarm: (stageWarm) => set(stageWarm ? { stageWarm, trackPrep: 1 } : { stageWarm }),
  setTrackPrep: (trackPrep) => set({ trackPrep }),
  /** Map `stageId` with its built `stage` (null while it loads); a new stage isn't warmed yet. */
  setStage: (stageId, stage) =>
    set((s) => (s.stage === stage ? { stageId } : { stageId, stage, stageWarm: false, ...(stageId !== s.stageId ? { trackPrep: 0 } : {}) })),
  setTravel: (travel) => set({ travel }),
  setItems: (items) => set({ items }),
  setPad: (pad) => set({ pad }),

  openPanel: (panel, panelData = null) => set({ panel, panelData }),
  closePanel: () => set({ panel: null, panelData: null }),
  togglePanel: (panel) => set((s) => (s.panel === panel ? { panel: null, panelData: null } : { panel, panelData: null })),

  setSpinResult: (spinResult) => set({ spinResult, spinning: false }),
  setSpinning: (spinning) => set({ spinning }),
  showToast: (text, kind = 'info', sub = undefined, detail = undefined) => set({ toast: { text, sub, detail, kind, id: Date.now() + Math.random() } }),
  setFinishResult: (finishResult) => set({ finishResult }),
  setLastSplit: (lastSplit) => set({ lastSplit }),
  setSection: (section) => set({ section }),
}))

/** Non-reactive snapshot for timers and non-React code. */
export const getGame = () => useGame.getState()
