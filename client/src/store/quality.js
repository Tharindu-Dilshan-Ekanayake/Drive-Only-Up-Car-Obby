import { create } from 'zustand'

/**
 * Graphics quality presets. Every visual feature reads its settings from here rather
 * than deciding for itself, so dropping a preset reliably sheds load everywhere.
 *
 * LOW is the mobile / weak-PC baseline: no realtime shadows, no particles, no clouds,
 * no post-processing, fewer CPU racers and less scenery, a short view distance and
 * textures capped at 512px.
 */
export const QUALITY_LEVELS = ['LOW', 'MEDIUM', 'HIGH']

export const PRESETS = {
  LOW: {
    dpr: 1,
    antialias: false,
    /** 'blob' = fake contact shadows only; 'realtime' = shadow-mapped sun. */
    shadows: 'blob',
    shadowMapSize: 0,
    particles: false,
    clouds: false,
    // Far enough (and the fog late enough) that the towers along the track still show: at 260 m
    // with the fog from 90 m they melted into the sky. Measured on all three maps: at most 85k
    // triangles and 53 draw calls.
    viewDistance: 340,
    fogNear: 150,
    /** Max side of any generated texture (signs, leaderboards). */
    maxTexture: 512,
    /** CPU racers on the track. */
    bots: 3,
    /** How much harbour scenery to place (0-1). */
    // Just under 0.6 (the line where rooftop clutter and spires switch on): about a building
    // every 90 m along the track, without the clutter.
    sceneryDensity: 0.58,
    /** Other players' names fade out past this. */
    nameDistance: 60,
    /** Name tags shown at most (nearest first). */
    nameplates: 6,
    /**
     * Other players drawn as their full car (nearest first); the rest within view
     * distance are one instanced low-poly proxy draw (game/remote/RemoteCars.jsx).
     */
    fullCars: 5,
    /**
     * Cars past this distance (m) draw their low-detail body and far wheels
     * (game/cars/CarRig.js); on LOW the lobby's parked cars are always low detail.
     */
    carLod: 18,
    /** At most this many other cars in full detail per frame (nearest first where the caller sorts), the rest low detail. */
    carFull: 2,
  },
  MEDIUM: {
    dpr: 1.25,
    antialias: true,
    shadows: 'blob',
    shadowMapSize: 0,
    particles: true,
    clouds: true,
    viewDistance: 420,
    fogNear: 150,
    maxTexture: 1024,
    bots: 5,
    sceneryDensity: 0.75,
    nameDistance: 90,
    nameplates: 10,
    fullCars: 14,
    carLod: 45,
    carFull: 12,
  },
  HIGH: {
    dpr: 1.5,
    antialias: true,
    shadows: 'realtime',
    shadowMapSize: 1024,
    particles: true,
    clouds: true,
    viewDistance: 600,
    fogNear: 220,
    maxTexture: 1024,
    bots: 7,
    sceneryDensity: 1,
    nameDistance: 120,
    nameplates: 16,
    fullCars: 24,
    carLod: 60,
    carFull: 30,
  },
}

const STORAGE_KEY = 'pp.quality'

/**
 * Resolution steps, as a fraction of the preset's pixel ratio. Below LOW, a weak PC or
 * phone still under 45 FPS renders fewer pixels: the scene is the same, only softer.
 * Shading every pixel is what an integrated GPU runs out of first, so this is the
 * biggest single saving there is.
 */
export const RENDER_SCALES = [1, 0.85, 0.7, 0.6]

function isMobileDevice() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua)) return true
  // iPadOS reports itself as a Mac; touch points give it away.
  return navigator.maxTouchPoints > 1 && /Macintosh/.test(ua)
}

function readSaved() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return QUALITY_LEVELS.includes(saved) ? saved : null
  } catch {
    return null
  }
}

/**
 * Phones and small CPUs (4 cores or fewer) start on LOW, the safe choice; anything bigger
 * starts on MEDIUM, and the performance monitor drops it to LOW by itself if FPS stays
 * under 45 (`degrade`, auto-picked levels only). A level picked in Settings is
 * remembered on this device and wins over both.
 */
export const DEFAULT_LEVEL = 'LOW'

function detectLevel() {
  if (typeof navigator === 'undefined') return DEFAULT_LEVEL
  // LOW for everyone to begin with (the smoothest everywhere); Settings > Graphics picks a higher level
  // and remembers it on this device.
  return DEFAULT_LEVEL
}

const initialLevel = readSaved() || detectLevel()

export const useQuality = create((set, get) => ({
  level: initialLevel,
  /** True when the player picked the level by hand; auto-drop then stays out of it. */
  manual: readSaved() !== null,
  isMobile: isMobileDevice(),
  /** Antialiasing can't change without recreating the WebGL context (see `rebuild`). */
  antialias: PRESETS[initialLevel].antialias,
  settings: PRESETS[initialLevel],
  /**
   * Bumped when the player picks a new level by hand: the 3D view is rebuilt from
   * scratch, so things set when it's made (antialiasing, scenery density, CPU racers)
   * take the new level at once.
   */
  rebuild: 0,
  /** Index into RENDER_SCALES: how far resolution has been dropped to keep FPS up. */
  renderStep: 0,

  setLevel: (level, manual = true) => {
    if (!QUALITY_LEVELS.includes(level)) return
    if (manual) {
      try {
        localStorage.setItem(STORAGE_KEY, level)
      } catch {
        // Private mode: the choice just won't persist.
      }
    }
    const changed = level !== get().level
    set((s) => ({
      level,
      manual,
      settings: PRESETS[level],
      ...(manual && changed ? { antialias: PRESETS[level].antialias, rebuild: s.rebuild + 1 } : {}),
    }))
  },

  /**
   * Called by the performance monitor when FPS stays under budget: drops a preset if it
   * can (not one the player picked by hand), and once on LOW (or a hand-picked level),
   * renders at a lower resolution instead, a step at a time.
   */
  degrade: () => {
    const { level, manual, renderStep } = get()
    const index = QUALITY_LEVELS.indexOf(level)
    if (!manual && index > 0) {
      const next = QUALITY_LEVELS[index - 1]
      console.info(`[quality] FPS under budget, dropping ${level} -> ${next}`)
      set({ level: next, settings: PRESETS[next] })
      return
    }
    if (renderStep + 1 < RENDER_SCALES.length) {
      console.info(`[quality] FPS under budget, rendering at ${RENDER_SCALES[renderStep + 1] * 100}%`)
      set({ renderStep: renderStep + 1 })
    }
  },

  /** Called when FPS has plenty of headroom again: resolution comes back a step. */
  recover: () => {
    const { renderStep } = get()
    if (renderStep > 0) set({ renderStep: renderStep - 1 })
  },
}))

/** Non-reactive read, safe inside useFrame. */
export const getQuality = () => useQuality.getState().settings
