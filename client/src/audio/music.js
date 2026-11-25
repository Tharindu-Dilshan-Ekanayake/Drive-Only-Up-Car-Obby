/**
 * Background music, made live with WebAudio like the sound effects: a sunny harbour
 * loop in F - a bouncy calypso bass, soft kick, shaker and claves, off-beat marimba
 * chords, and a steel-drum melody over F - Dm - Bb - C. Every other time round the
 * steel drum rests and the marimba plays a rippling arpeggio instead, so it doesn't nag.
 *
 * An optional intensity layer (setIntensity 0..1) adds 16th-note hats, a conga figure
 * and a plucked chord arpeggio on its own bus, crossfaded in and out; weak devices
 * (lite) never schedule it.
 *
 * Notes are scheduled a little ahead on the audio clock by a timer (the usual
 * look-ahead scheduler), never from the render loop. Kept quiet under the engine.
 */

const BPM = 108
const EIGHTH = 60 / BPM / 2
const LOOKAHEAD_S = 0.35
const TICK_MS = 100

/** One chord per bar: bass root (MIDI) and the marimba's three voices. */
const BARS = [
  { root: 41, chord: [65, 69, 72] }, // F
  { root: 38, chord: [62, 65, 69] }, // Dm
  { root: 34, chord: [62, 65, 70] }, // Bb
  { root: 36, chord: [64, 67, 72] }, // C
]

/** Bass per bar, in eighths: [eighth, semitones above the root]. Root, push, fifth, octave. */
const BASS = [
  [0, 0],
  [3, 0],
  [4, 7],
  [6, 12],
  [7, 7],
]

/** Marimba chord stabs on the off-beats. */
const COMP = [1, 3, 5, 7]

/** Claves in a 3-3-2 pattern. */
const CLAVE = [0, 3, 6]

/** The steel-drum melody, 4 bars: [eighth within the 32, MIDI note, length in eighths]. */
const MELODY = [
  [0, 72, 1],
  [1, 74, 1],
  [2, 77, 2],
  [5, 76, 1],
  [6, 74, 2],
  [8, 72, 1],
  [9, 69, 1],
  [10, 74, 3],
  [14, 72, 2],
  [16, 70, 1],
  [17, 72, 1],
  [18, 74, 2],
  [21, 72, 1],
  [22, 70, 2],
  [24, 67, 1],
  [25, 69, 1],
  [26, 72, 3],
  [30, 76, 1],
  [31, 77, 1],
]

const freq = (midi) => 440 * 2 ** ((midi - 69) / 12)

/**
 * @param {AudioContext} ctx
 * @param {AudioNode} destination
 * @param {AudioBuffer} noiseBuffer
 * @param {() => boolean} [lite] true on weak devices: fewer voices per beat
 */
export function createMusic(ctx, destination, noiseBuffer, lite = () => false) {
  const out = ctx.createGain()
  out.gain.value = 0
  out.connect(destination)
  // A gentle low-pass over everything keeps it warm and out of the effects' way.
  const bus = ctx.createBiquadFilter()
  bus.type = 'lowpass'
  bus.frequency.value = 3600
  bus.connect(out)
  // The intensity layer's own fader, into the same warm bus.
  const layer = ctx.createGain()
  layer.gain.value = 0
  layer.connect(bus)
  let intensity = 0
  /** Keep scheduling the layer until this audio time, so a fade-out isn't cut short. */
  let layerUntil = 0

  let step = 0
  let nextAt = 0
  let timer = null
  const level = { base: 0.5, ducked: 1, volume: 1 }

  function note(midi, t, { type = 'sine', length = 0.3, volume = 0.05, attack = 0.008, to = bus } = {}) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq(midi)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(volume, t + attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length)
    osc.connect(gain).connect(to)
    osc.start(t)
    osc.stop(t + length + 0.05)
  }

  /**
   * A steel drum: a bright fundamental with the pan's characteristic inharmonic
   * overtones, all ringing down quickly.
   */
  function steel(midi, t, length) {
    const ring = Math.max(0.35, length)
    note(midi, t, { type: 'sine', length: ring, volume: 0.03 })
    note(midi + 12, t, { type: 'sine', length: ring * 0.6, volume: 0.014 })
    if (!lite()) note(midi + 19.02, t, { type: 'sine', length: ring * 0.3, volume: 0.007 })
  }

  /** A marimba: a woody sine blip plus a faint octave tick. */
  function marimba(midi, t, volume = 0.02) {
    note(midi, t, { type: 'sine', length: 0.22, volume, attack: 0.004 })
    if (!lite()) note(midi + 24, t, { type: 'sine', length: 0.04, volume: volume * 0.4, attack: 0.002 })
  }

  /** Filtered noise: shakers and the clap. */
  function hiss(t, { type = 'highpass', frequency = 6000, q = 0.7, volume = 0.01, length = 0.05, to = bus } = {}) {
    const src = ctx.createBufferSource()
    src.buffer = noiseBuffer
    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = frequency
    filter.Q.value = q
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(volume, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length)
    src.connect(filter).connect(gain).connect(to)
    src.start(t, Math.random() * 0.5)
    src.stop(t + length + 0.01)
  }

  /** A conga: a short sine with a quick pitch drop. */
  function conga(t, from, volume) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.setValueAtTime(from, t)
    osc.frequency.exponentialRampToValueAtTime(from * 0.7, t + 0.08)
    gain.gain.setValueAtTime(volume, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14)
    osc.connect(gain).connect(layer)
    osc.start(t)
    osc.stop(t + 0.16)
  }

  /** The intensity layer for eighth `inBar` of `bar`: hats on 16ths, congas, a 16th arpeggio. */
  function playLayer(t, inBar, bar) {
    if (lite() || (intensity < 0.02 && t > layerUntil)) return
    const half = EIGHTH / 2
    hiss(t, { frequency: 8000, volume: 0.006, length: 0.03, to: layer })
    hiss(t + half, { frequency: 8000, volume: 0.0035, length: 0.025, to: layer })
    if (inBar === 2 || inBar === 3) conga(t + half, 330, 0.035)
    if (inBar === 6) conga(t, 240, 0.04)
    if (inBar === 7) conga(t, 200, 0.04)
    const a = bar.chord[(inBar * 2) % 3] + 12
    const b = bar.chord[(inBar * 2 + 1) % 3] + (inBar >= 4 ? 24 : 12)
    note(a, t, { type: 'triangle', length: 0.11, volume: 0.009, attack: 0.003, to: layer })
    note(b, t + half, { type: 'triangle', length: 0.1, volume: 0.007, attack: 0.003, to: layer })
  }

  /** A soft kick: a sine dropping fast. */
  function kick(t, volume = 0.1) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.setValueAtTime(120, t)
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.1)
    gain.gain.setValueAtTime(volume, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
    osc.connect(gain).connect(bus)
    osc.start(t)
    osc.stop(t + 0.2)
  }

  /** A wooden clave click. */
  function clave(t) {
    note(91, t, { type: 'triangle', length: 0.05, volume: 0.012, attack: 0.002 })
  }

  /** Everything that sounds on eighth `step` (of a 64-eighth, two-pass loop) at time t. */
  function play(t) {
    const inBar = step % 8
    const bar = BARS[Math.floor(step / 8) % BARS.length]
    const pass = Math.floor(step / 32) % 2

    if (inBar === 0 || inBar === 4) kick(t)
    if (inBar === 4) hiss(t, { type: 'bandpass', frequency: 1600, q: 0.9, volume: 0.02, length: 0.06 })
    hiss(t, { volume: inBar % 2 ? 0.008 : 0.004, length: 0.035 })
    if (CLAVE.includes(inBar)) clave(t)

    for (const [at, interval] of BASS) {
      if (at === inBar) note(bar.root + interval, t, { type: 'triangle', length: EIGHTH * 0.85, volume: 0.075 })
    }

    if (COMP.includes(inBar)) {
      const voices = lite() ? bar.chord.slice(0, 2) : bar.chord
      for (const n of voices) marimba(n, t, 0.012)
    }

    if (pass === 0) {
      for (const [at, midi, length] of MELODY) {
        if (at === step % 32) steel(midi, t, EIGHTH * length)
      }
    } else {
      // The answer: the chord rippled up on the marimba, an octave higher.
      const n = bar.chord[inBar % 3] + 12 + (inBar >= 6 ? 12 : 0)
      if (inBar % 2 === 0) marimba(n, t, 0.018)
    }

    playLayer(t, inBar, bar)
  }

  function schedule() {
    // After the page was hidden (the context suspended), pick up from now.
    nextAt = Math.max(nextAt, ctx.currentTime + 0.05)
    while (nextAt < ctx.currentTime + LOOKAHEAD_S) {
      play(nextAt)
      nextAt += EIGHTH
      step = (step + 1) % 64
    }
  }

  const applyLevel = (seconds) =>
    out.gain.setTargetAtTime(level.base * level.ducked * level.volume, ctx.currentTime, seconds)

  return {
    start() {
      if (timer) return
      nextAt = ctx.currentTime + 0.1
      timer = setInterval(schedule, TICK_MS)
      schedule()
      applyLevel(1.2)
    },
    /** Quieter while something else should be heard (a fanfare, a big reveal). */
    duck(on) {
      level.ducked = on ? 0.4 : 1
      applyLevel(0.3)
    },
    /**
     * Intensity 0..1: crossfades the extra layer in (or out) over about a second.
     * Ignores changes under 0.02, so it can be called every frame.
     */
    setIntensity(value) {
      const v = Math.min(1, Math.max(0, Number(value) || 0))
      if (Math.abs(v - intensity) < 0.02 && !(v === 0 && intensity !== 0)) return
      if (v < 0.02 && intensity >= 0.02) layerUntil = ctx.currentTime + 3
      intensity = v
      layer.gain.setTargetAtTime(v, ctx.currentTime, 0.7)
    },
    /** The player's music volume, 0..1 (Boxity's music_volume setting). */
    setVolume(volume) {
      level.volume = Math.min(1, Math.max(0, Number(volume) || 0))
      if (timer) applyLevel(0.15)
    },
  }
}
