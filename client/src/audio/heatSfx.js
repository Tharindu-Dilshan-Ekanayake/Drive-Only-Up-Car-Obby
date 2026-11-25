import { audioBus, duckMusic } from './sfx'

/**
 * Heat Run's sounds, synthesised like ./sfx.js (no files): the police siren - one
 * continuous voice built the first time police are near, steered with setTargetAtTime
 * (a slow wail far off, a fast yelp when they're on you, silent when none are within
 * earshot; pitched up while it closes on you and down as it falls back - a cheap Doppler -
 * and muffled with distance) - and the one-shots: the BUSTED! sting, a gadget's charge-up
 * warning, the foam cannon, the net launcher, the EMP zap, a hit splat, a spike strip
 * dropping, heat up / heat down, the police radio's squelch chirp, a PIT's tyre screech. Only what's happening is played; `heatSiren.stop()` tears the voice down when
 * the map unmounts.
 */

let siren = null
let sirenSetAt = 0

function buildSiren(bus) {
  const { ctx, master } = bus
  // Two detuned saws through a band-pass (a horn-ish tone), pitch swept by an LFO.
  const a = ctx.createOscillator()
  const b = ctx.createOscillator()
  a.type = 'sawtooth'
  b.type = 'square'
  a.frequency.value = 760
  b.frequency.value = 763
  const lfo = ctx.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = 0.4
  const depth = ctx.createGain()
  depth.gain.value = 260
  lfo.connect(depth)
  depth.connect(a.frequency)
  depth.connect(b.frequency)
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 1100
  filter.Q.value = 0.9
  const mixB = ctx.createGain()
  mixB.gain.value = 0.35
  const gain = ctx.createGain()
  gain.gain.value = 0.0001
  a.connect(filter)
  b.connect(mixB).connect(filter)
  filter.connect(gain).connect(master)
  a.start()
  b.start()
  lfo.start()
  return { a, b, lfo, depth, gain, filter, nodes: [a, b, lfo] }
}

export const heatSiren = {
  /**
   * `dist`: metres to the nearest pursuer (Infinity: none); `close`: they're on you (yelp);
   * `closing`: how fast it's closing on you (m/s, negative: falling back) - the Doppler-ish
   * pitch shift. Cheap to call every frame (throttled to ~15 Hz, never allocates once built).
   */
  set(dist, close, closing = 0) {
    const bus = audioBus()
    if (!bus) return
    const loud = Number.isFinite(dist) ? Math.max(0, 1 - dist / 170) : 0
    if (!siren) {
      if (loud <= 0) return
      siren = buildSiren(bus)
    }
    const now = performance.now()
    if (now - sirenSetAt < 66) return
    sirenSetAt = now
    const t = bus.ctx.currentTime
    siren.gain.gain.setTargetAtTime(0.0001 + loud * loud * 0.055, t, 0.15)
    siren.lfo.frequency.setTargetAtTime(close ? 4.2 : 0.42, t, 0.2)
    siren.depth.gain.setTargetAtTime(close ? 170 : 260, t, 0.2)
    // Doppler (exaggerated a little so it reads): f' = f * c / (c - v), as cents on both voices.
    const v = Math.max(-40, Math.min(40, closing || 0))
    const cents = 1200 * Math.log2(343 / (343 - v * 2.2))
    siren.a.detune.setTargetAtTime(cents, t, 0.12)
    siren.b.detune.setTargetAtTime(cents, t, 0.12)
    // Further off: duller (less of the bright band).
    siren.filter.frequency.setTargetAtTime(650 + 750 * loud, t, 0.2)
  },
  stop() {
    if (!siren) return
    for (const n of siren.nodes) {
      try {
        n.stop()
      } catch {
        // already stopped
      }
    }
    siren.gain.disconnect()
    siren = null
  },
}

function tone(bus, freq, { at = 0, type = 'sine', duration = 0.15, volume = 0.1, slideTo = 0, attack = 0.01, cutoff = 0 } = {}) {
  const { ctx, master } = bus
  const t = ctx.currentTime + at
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(volume, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  let out = osc
  if (cutoff) {
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = cutoff
    out = osc.connect(f)
  }
  out.connect(g).connect(master)
  osc.start(t)
  osc.stop(t + duration + 0.02)
}

function noise(bus, { at = 0, duration = 0.3, volume = 0.1, from = 400, to = 2400, q = 1, attack = 0.2 } = {}) {
  const { ctx, master } = bus
  const t = ctx.currentTime + at
  const src = ctx.createBufferSource()
  src.buffer = bus.noise
  src.loop = true
  const f = ctx.createBiquadFilter()
  f.type = 'bandpass'
  f.Q.value = q
  f.frequency.setValueAtTime(from, t)
  f.frequency.exponentialRampToValueAtTime(to, t + duration)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(volume, t + Math.max(0.005, duration * attack))
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  src.connect(f).connect(g).connect(master)
  src.start(t, Math.random() * 0.5)
  src.stop(t + duration + 0.02)
}

/** Plays `fn(bus)` if audio is up and `name` hasn't played in the last `gap` ms. */
function play(name, gap, fn) {
  const bus = audioBus()
  if (bus && bus.ready(name, gap)) fn(bus)
}

export const heatSfx = {
  /** BUSTED!: a siren swooping down, two heavy stabs and a cell-door clang. */
  busted() {
    play('h-busted', 1200, (bus) => {
      duckMusic(true)
      setTimeout(() => duckMusic(false), 1600)
      tone(bus, 1100, { type: 'sawtooth', duration: 0.5, volume: 0.07, slideTo: 380, cutoff: 2600 })
      tone(bus, 1500, { type: 'square', duration: 0.5, volume: 0.03, slideTo: 500, cutoff: 2200 })
      for (const [at, f] of [
        [0.45, 98],
        [0.75, 73],
      ]) {
        tone(bus, f, { at, type: 'sawtooth', duration: 0.42, volume: 0.12, cutoff: 900 })
        tone(bus, f * 1.5, { at, type: 'square', duration: 0.42, volume: 0.04, cutoff: 1200 })
        noise(bus, { at, duration: 0.18, volume: 0.08, from: 1600, to: 300, q: 0.7, attack: 0.05 })
      }
      tone(bus, 420, { at: 1.1, type: 'triangle', duration: 0.5, volume: 0.06 })
      tone(bus, 631, { at: 1.1, type: 'square', duration: 0.3, volume: 0.02, cutoff: 2400 })
    })
  },
  /** A gadget charging up to fire at you: three rising beeps (the telegraph). */
  charge() {
    play('h-charge', 400, (bus) => {
      for (let i = 0; i < 3; i += 1) tone(bus, 880 + i * 220, { at: i * 0.16, type: 'square', duration: 0.08, volume: 0.035, cutoff: 3000 })
    })
  },
  /** The foam cannon: a deep pneumatic thump and a hiss. */
  foamShot() {
    play('h-foam', 150, (bus) => {
      tone(bus, 120, { duration: 0.22, volume: 0.14, slideTo: 55 })
      noise(bus, { duration: 0.35, volume: 0.07, from: 3000, to: 900, q: 0.6, attack: 0.05 })
    })
  },
  /** The net launcher: a spring twang and a whoosh. */
  netShot() {
    play('h-net', 150, (bus) => {
      tone(bus, 300, { type: 'triangle', duration: 0.25, volume: 0.08, slideTo: 140 })
      noise(bus, { duration: 0.3, volume: 0.06, from: 600, to: 2600, q: 1, attack: 0.3 })
    })
  },
  /** An EMP bolt / pulse: a zappy downward sweep with crackle. */
  emp() {
    play('h-emp', 200, (bus) => {
      tone(bus, 2400, { type: 'sawtooth', duration: 0.35, volume: 0.05, slideTo: 90, cutoff: 5000 })
      tone(bus, 60, { type: 'square', duration: 0.3, volume: 0.06, cutoff: 600 })
      noise(bus, { duration: 0.3, volume: 0.06, from: 6000, to: 1500, q: 2, attack: 0.02 })
    })
  },
  /** Hit by foam / a net: a wet splat. */
  splat() {
    play('h-splat', 150, (bus) => {
      noise(bus, { duration: 0.28, volume: 0.13, from: 1200, to: 250, q: 0.8, attack: 0.03 })
      tone(bus, 180, { duration: 0.12, volume: 0.08, slideTo: 70 })
    })
  },
  /** The helicopter dropping something: a falling whistle. */
  drop() {
    play('h-drop', 300, (bus) => tone(bus, 1400, { type: 'sine', duration: 0.7, volume: 0.04, slideTo: 300 }))
  },
  /** Heat level up: a two-note alarm; down: a falling relieved chime. */
  heatUp() {
    play('h-up', 800, (bus) => {
      tone(bus, 660, { type: 'square', duration: 0.12, volume: 0.05, cutoff: 3000 })
      tone(bus, 990, { at: 0.13, type: 'square', duration: 0.16, volume: 0.05, cutoff: 3000 })
    })
  },
  /** The police radio keying up before a line: a squelch burst and a double chirp. */
  radio() {
    play('h-radio', 500, (bus) => {
      noise(bus, { duration: 0.12, volume: 0.035, from: 2600, to: 1800, q: 1.4, attack: 0.05 })
      tone(bus, 1650, { at: 0.06, type: 'square', duration: 0.05, volume: 0.022, cutoff: 3200 })
      tone(bus, 2100, { at: 0.13, type: 'square', duration: 0.05, volume: 0.022, cutoff: 3200 })
    })
  },
  /** A PIT tap: a short metal thud and a long tyre screech. */
  screech() {
    play('h-screech', 600, (bus) => {
      tone(bus, 110, { duration: 0.16, volume: 0.1, slideTo: 60 })
      noise(bus, { duration: 0.75, volume: 0.09, from: 2400, to: 1500, q: 6, attack: 0.08 })
      noise(bus, { at: 0.05, duration: 0.6, volume: 0.05, from: 3400, to: 2600, q: 9, attack: 0.1 })
    })
  },
  heatDown() {
    play('h-down', 800, (bus) => {
      tone(bus, 990, { type: 'triangle', duration: 0.2, volume: 0.06 })
      tone(bus, 740, { at: 0.15, type: 'triangle', duration: 0.25, volume: 0.06 })
      tone(bus, 554, { at: 0.32, type: 'triangle', duration: 0.4, volume: 0.06 })
    })
  },
}
