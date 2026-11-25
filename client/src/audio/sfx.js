import { useQuality } from '../store/quality'
import { createMusic } from './music'

/**
 * Sound effects, the engine and the background music for Up We Drive, all synthesised
 * with WebAudio: no audio files to download.
 *
 * Browsers only allow audio after a user gesture. The audio engine (AudioContext, echo,
 * noise, music) is built while the game loads (prepareAudio), where it costs nothing
 * anyone sees. It starts suspended; the first tap/click/key resumes it and starts the
 * music, and every one-shot before that is silently skipped.
 *
 * Continuous voices (`engine`, `skid`, `ambience`) are built once and then only steered
 * with setTargetAtTime: their per-frame setters never allocate. The engine's backfire
 * pops, turbo blow-off and gear-shift dips are fired the same way, by automating gains
 * on voices that already exist.
 */

const MUTE_KEY = 'pp.muted'
/** Master gain at full volume; everything is mixed to sit under this. */
const BASE_GAIN = 0.5

let ctx = null
let master = null
/** Input of the echo the chimes ring out into (see createEcho). */
let echo = null
let noiseBuffer = null
let music = null
/** The player's own mute button (persisted). */
let muted = readMuted()
/** Muted for a Boxity ad break; kept apart from `muted` so the player's choice survives. */
let adMuted = false
/** Boxity's master_volume / music_volume settings, 0..1. */
let masterVolume = 1
let musicVolume = 1
/** How busy the music is, 0..1 (see setMusicIntensity). */
let musicIntensity = 0
const lastPlayed = new Map()
const muteListeners = new Set()

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

const silent = () => muted || adMuted

function applyMaster() {
  if (master) master.gain.value = silent() ? 0 : BASE_GAIN * masterVolume
}

/** LOW preset: lighter music (fewer voices per beat). */
const lite = () => useQuality.getState().level === 'LOW'

/**
 * Builds the audio engine, suspended: the context, the master gain, the echo, the noise
 * and the music. Call while loading (GameScene does); the first gesture then only has
 * to resume it. Safe to call again.
 */
export function prepareAudio() {
  if (ctx) return
  const Ctor = window.AudioContext || window.webkitAudioContext
  if (!Ctor) return
  ctx = new Ctor()
  if (ctx.state === 'running') ctx.suspend()
  master = ctx.createGain()
  applyMaster()
  master.connect(ctx.destination)
  echo = createEcho()
  // One second of white noise, reused by every whoosh, splash and tyre squeal.
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const data = noiseBuffer.getChannelData(0)
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1
  music = createMusic(ctx, master, noiseBuffer, lite)
  music.setVolume(musicVolume)
  music.setIntensity(musicIntensity)
  // The car asked for its engine (or the world for its ambience) before the context
  // existed: build them now.
  if (engineWanted) buildEngine()
  if (ambienceWanted) buildAmbience()
}

let musicStarted = false
function unlock() {
  prepareAudio()
  if (!ctx) return
  if (!musicStarted) {
    musicStarted = true
    music.start()
  }
  if (adMuted) ctx.suspend()
  else if (ctx.state === 'suspended') ctx.resume()
}

/** A short, darkening echo for the chimes to ring out into. Built once. */
function createEcho() {
  const input = ctx.createGain()
  input.gain.value = 0.25
  const delay = ctx.createDelay(1)
  delay.delayTime.value = 0.13
  const damp = ctx.createBiquadFilter()
  damp.type = 'lowpass'
  damp.frequency.value = 3200
  const feedback = ctx.createGain()
  feedback.gain.value = 0.32
  input.connect(delay)
  delay.connect(damp).connect(feedback).connect(delay)
  damp.connect(master)
  return input
}

/** Installs the first-gesture unlock. Call once at startup. */
export function installAudioUnlock() {
  const events = ['pointerdown', 'keydown', 'touchend']
  const handler = () => {
    unlock()
    for (const e of events) window.removeEventListener(e, handler, true)
  }
  for (const e of events) window.addEventListener(e, handler, true)
  // Mobile browsers suspend audio in the background; resume on return.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ctx?.state === 'suspended' && !adMuted && musicStarted) ctx.resume()
  })
}

export function isMuted() {
  return muted
}

export function setMuted(value) {
  muted = Boolean(value)
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
  } catch {
    // Not persisted; fine.
  }
  applyMaster()
  for (const listener of muteListeners) listener(muted)
}

const clampVolume = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1)

/** Overall volume 0..1 (Boxity's master_volume setting). */
export function setMasterVolume(volume) {
  masterVolume = clampVolume(volume)
  applyMaster()
}

/** Music volume 0..1 (Boxity's music_volume setting), on top of the master volume. */
export function setMusicVolume(volume) {
  musicVolume = clampVolume(volume)
  music?.setVolume(musicVolume)
}

/**
 * Silences everything for a Boxity ad break and suspends the audio clock. Ending the
 * break restores the player's own mute choice and volumes exactly as they were.
 */
export function setAdBreakMuted(on) {
  adMuted = Boolean(on)
  applyMaster()
  if (!ctx) return
  if (adMuted) ctx.suspend()
  else if (ctx.state === 'suspended' && document.visibilityState === 'visible' && musicStarted) ctx.resume()
}

/** Calls `listener(muted)` on every change; returns the unsubscribe. */
export function onMutedChange(listener) {
  muteListeners.add(listener)
  return () => muteListeners.delete(listener)
}

/**
 * How intense the music is, 0..1: above 0 an extra layer of percussion and a rippling
 * arpeggio fades in (smoothly, over a second or so). Cheap: may be called every frame,
 * it only acts on real changes. LOW quality skips the layer.
 */
export function setMusicIntensity(value) {
  musicIntensity = Math.min(1, Math.max(0, Number(value) || 0))
  music?.setIntensity(musicIntensity)
}

/** Ducks the music under something loud (a big moment), or brings it back. */
export function duckMusic(on) {
  music?.duck(on)
}

// --- one-shot building blocks ----------------------------------------------------------

function ready(name, minGapMs = 0) {
  if (!ctx || silent() || ctx.state !== 'running') return false
  const now = performance.now()
  if (minGapMs && now - (lastPlayed.get(name) || 0) < minGapMs) return false
  lastPlayed.set(name, now)
  return true
}

/**
 * The audio engine for sounds made elsewhere (Heat Run's sirens, ./heatSfx.js): the
 * context, the master gain and the shared noise buffer - or null before prepareAudio.
 * `ready(name, minGapMs)` throttles one-shots the same way as here.
 */
export const audioBus = () => (ctx ? { ctx, master, noise: noiseBuffer, ready } : null)

/** How early (s) a deferred sound is built before it's due. */
const LEAD = 0.06

/**
 * Runs `build(t)` for a sound due `at` seconds from now: straight away when it's due
 * soon, otherwise just before it's due, so a fanfare doesn't create dozens of audio
 * nodes in the one frame that asked for it.
 */
export function whenDue(at, build) {
  if (!ctx) return
  const due = ctx.currentTime + at
  if (at <= LEAD) {
    build(due)
    return
  }
  setTimeout(() => {
    if (ctx) build(Math.max(ctx.currentTime, due))
  }, (at - LEAD) * 1000)
}

/** A short enveloped oscillator note; `echo` also sends it into the echo. */
function tone(freq, opts = {}) {
  whenDue(opts.at ?? 0, (t) => toneAt(freq, t, opts))
}

function toneAt(freq, t, { type = 'sine', duration = 0.12, volume = 0.3, slideTo = null, attack = 0.01, echo: wet = false, cutoff = 0 } = {}) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration)
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(volume, t + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  if (cutoff) {
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = cutoff
    osc.connect(filter).connect(gain)
  } else {
    osc.connect(gain)
  }
  gain.connect(master)
  if (wet) gain.connect(echo)
  osc.start(t)
  osc.stop(t + duration + 0.02)
}

/** A struck bell: the note, a quieter octave and a glassy strike, ringing into the echo. */
function bell(freq, { at = 0, volume = 0.1, decay = 0.4 } = {}) {
  tone(freq, { at, duration: decay, volume, echo: true })
  tone(freq * 2, { at, duration: decay * 0.6, volume: volume * 0.35, echo: true })
  tone(freq * 3.01, { type: 'triangle', at, duration: 0.05, volume: volume * 0.3 })
}

/** Filtered noise: whooshes, splashes, crunches. */
function noise(opts = {}) {
  whenDue(opts.at ?? 0, (t) => noiseAt(t, opts))
}

function noiseAt(t, { duration = 0.3, volume = 0.25, from = 400, to = 2400, q = 1.2, type = 'bandpass', attack = 0.3 } = {}) {
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer
  src.loop = true
  const filter = ctx.createBiquadFilter()
  filter.type = type
  filter.Q.value = q
  filter.frequency.setValueAtTime(from, t)
  filter.frequency.exponentialRampToValueAtTime(to, t + duration)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(volume, t + Math.max(0.005, duration * attack))
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  src.connect(filter).connect(gain).connect(master)
  src.start(t, Math.random() * 0.5)
  src.stop(t + duration + 0.02)
}

/** Note number -> Hz. */
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12)

/** A quick rising arpeggio of MIDI notes, `step` seconds apart. */
function arpeggio(notes, { step = 0.07, type = 'square', volume = 0.07, duration = 0.16, at = 0, echo: wet = true } = {}) {
  notes.forEach((n, i) => tone(hz(n), { type, at: at + i * step, duration, volume, echo: wet, cutoff: 3200 }))
}

/** Sparkles: a fast run of high bells. */
function sparkle(count, { at = 0, base = 84, volume = 0.04 } = {}) {
  const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]
  for (let i = 0; i < count; i += 1) bell(hz(base + scale[i % scale.length]), { at: at + i * 0.045, volume, decay: 0.25 })
}

// --- the engine ------------------------------------------------------------------------

let engineWanted = false
/** The engine's nodes once built (see buildEngine). */
let eng = null
let engineSetAt = 0
/** Per-engine state the setter steers by (plain numbers: the setter never allocates). */
let lastGear = 0
let throttlePeak = 0
let turboSpool = 0
let lastPopAt = 0

/** Gear changes at these speeds (fractions of top speed): the revs drop at each. */
const GEARS = [0, 0.18, 0.38, 0.6, 0.82, 1.01]

function buildEngine() {
  if (!ctx || eng) return
  const t = ctx.currentTime
  const oscA = ctx.createOscillator()
  oscA.type = 'sawtooth'
  oscA.frequency.value = 55
  const oscB = ctx.createOscillator()
  oscB.type = 'square'
  oscB.frequency.value = 55
  oscB.detune.value = 14
  const sub = ctx.createOscillator()
  sub.type = 'sine'
  sub.frequency.value = 27.5
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 420
  filter.Q.value = 2.2
  const mixA = ctx.createGain()
  mixA.gain.value = 0.55
  const mixB = ctx.createGain()
  mixB.gain.value = 0.3
  const mixSub = ctx.createGain()
  mixSub.gain.value = 0.8
  const gain = ctx.createGain()
  gain.gain.value = 0.0001
  // Gear shifts dip this one (the setter keeps re-aiming `gain`, so the dip lives apart).
  const shift = ctx.createGain()
  shift.gain.value = 1
  oscA.connect(mixA).connect(filter)
  oscB.connect(mixB).connect(filter)
  sub.connect(mixSub).connect(gain)
  filter.connect(gain).connect(shift).connect(master)
  // Turbo whistle: a faint sine that spools up with throttle and revs.
  const turbo = ctx.createOscillator()
  turbo.type = 'sine'
  turbo.frequency.value = 1800
  const turboGain = ctx.createGain()
  turboGain.gain.value = 0.0001
  turbo.connect(turboGain).connect(shift)
  // Pops (backfires) and the blow-off hiss: one silent noise voice, two filters, fired
  // by gain automation, so nothing is created when they go off.
  const pops = ctx.createBufferSource()
  pops.buffer = noiseBuffer
  pops.loop = true
  const popFilter = ctx.createBiquadFilter()
  popFilter.type = 'lowpass'
  popFilter.frequency.value = 900
  popFilter.Q.value = 4
  const popGain = ctx.createGain()
  popGain.gain.value = 0
  pops.connect(popFilter).connect(popGain).connect(master)
  const bovFilter = ctx.createBiquadFilter()
  bovFilter.type = 'highpass'
  bovFilter.frequency.value = 2600
  const bovGain = ctx.createGain()
  bovGain.gain.value = 0
  pops.connect(bovFilter).connect(bovGain).connect(master)
  // A little grit, plus the boost's hiss on top.
  const hiss = ctx.createBufferSource()
  hiss.buffer = noiseBuffer
  hiss.loop = true
  const hissFilter = ctx.createBiquadFilter()
  hissFilter.type = 'bandpass'
  hissFilter.frequency.value = 900
  hissFilter.Q.value = 0.7
  const hissGain = ctx.createGain()
  hissGain.gain.value = 0.0001
  hiss.connect(hissFilter).connect(hissGain).connect(master)
  oscA.start(t)
  oscB.start(t)
  sub.start(t)
  hiss.start(t)
  turbo.start(t)
  pops.start(t, 0.37)
  eng = { oscA, oscB, sub, filter, gain, shift, hissGain, hissFilter, hiss, turbo, turboGain, pops, popFilter, popGain, bovGain }
  lastGear = 0
  throttlePeak = 0
  turboSpool = 0
}

/** A short burst on a persistent voice's gain: up in 4 ms, back to silence by `end`. */
function burst(param, t, peak, end) {
  param.setValueAtTime(0, t)
  param.linearRampToValueAtTime(peak, t + 0.004)
  param.linearRampToValueAtTime(0, t + end)
}

/** One to three exhaust pops on lift-off. Only automation: allocation-free. */
function backfire(t) {
  eng.popGain.gain.cancelScheduledValues(t)
  const count = 1 + Math.floor(Math.random() * 3)
  let at = t + 0.03
  for (let i = 0; i < count; i += 1) {
    eng.popFilter.frequency.setValueAtTime(450 + Math.random() * 700, at)
    burst(eng.popGain.gain, at, 0.1 + Math.random() * 0.06, 0.035 + Math.random() * 0.03)
    at += 0.07 + Math.random() * 0.08
  }
}

/** The turbo dumping its pressure: a quick, fading hiss. */
function blowOff(t, volume) {
  const g = eng.bovGain.gain
  g.cancelScheduledValues(t)
  g.setValueAtTime(0, t)
  g.linearRampToValueAtTime(volume, t + 0.012)
  g.setTargetAtTime(0, t + 0.03, 0.06)
}

/**
 * Your car's engine. `start()` once you're driving, `set()` every frame (cheap: it only
 * re-aims the existing nodes, at most ~30 times a second), `stop()` when you leave.
 */
export const engine = {
  start() {
    engineWanted = true
    buildEngine()
  },
  /**
   * @param {number} speed01 speed as a fraction of top speed (0..1+)
   * @param {number} throttle01 how hard you're on the gas (0..1)
   * @param {boolean} boosting nitro on
   */
  set(speed01, throttle01, boosting) {
    if (!eng) {
      if (engineWanted && ctx) buildEngine()
      return
    }
    const now = performance.now()
    if (now - engineSetAt < 33) return
    engineSetAt = now
    const s = Math.min(1.3, Math.max(0, speed01))
    let gear = 0
    while (gear < GEARS.length - 2 && s >= GEARS[gear + 1]) gear += 1
    const span = GEARS[gear + 1] - GEARS[gear]
    const inGear = Math.min(1, (s - GEARS[gear]) / span)
    const throttle = Math.min(1, Math.max(0, throttle01))
    // Revs climb through each gear and drop back at the change; higher gears sit higher.
    const rpm = 0.25 + inGear * 0.75 + gear * 0.06
    const base = 42 + rpm * 78 + throttle * 6
    const t = ctx.currentTime
    eng.oscA.frequency.setTargetAtTime(base, t, 0.05)
    eng.oscB.frequency.setTargetAtTime(base * 1.5, t, 0.05)
    eng.sub.frequency.setTargetAtTime(base / 2, t, 0.05)
    eng.filter.frequency.setTargetAtTime(380 + rpm * 900 + throttle * 900 + (boosting ? 900 : 0), t, 0.06)
    eng.gain.gain.setTargetAtTime(0.045 + throttle * 0.055 + s * 0.02, t, 0.08)
    eng.hissGain.gain.setTargetAtTime(boosting ? 0.07 : 0.004 + s * 0.006, t, boosting ? 0.05 : 0.2)
    eng.hissFilter.frequency.setTargetAtTime(boosting ? 2400 : 700, t, 0.1)

    // Turbo: spools toward throttle x revs, whistles higher as it spins up.
    const spoolTarget = throttle * (0.3 + rpm * 0.7) * (boosting ? 1.2 : 1)
    turboSpool += (spoolTarget - turboSpool) * (spoolTarget > turboSpool ? 0.1 : 0.25)
    eng.turbo.frequency.setTargetAtTime(1500 + turboSpool * 2900 + rpm * 300, t, 0.08)
    eng.turboGain.gain.setTargetAtTime(0.0001 + turboSpool * turboSpool * 0.011, t, 0.1)

    // Upshift: the drive cuts for a beat (a dip), with a little turbo chirp on full gas.
    if (gear !== lastGear) {
      if (gear > lastGear && s > 0.05) {
        const g = eng.shift.gain
        g.cancelScheduledValues(t)
        g.setValueAtTime(1, t)
        g.linearRampToValueAtTime(0.28, t + 0.045)
        g.linearRampToValueAtTime(1, t + 0.22)
        if (throttle > 0.6 && turboSpool > 0.3) blowOff(t, 0.012 * turboSpool)
      }
      lastGear = gear
    }

    // Lift-off: the turbo dumps, and at high revs the exhaust sometimes pops.
    throttlePeak = Math.max(throttle, throttlePeak * 0.88)
    if (throttlePeak > 0.6 && throttle < 0.2) {
      throttlePeak = 0
      if (turboSpool > 0.35) blowOff(t, 0.022 * turboSpool)
      if (rpm > 0.72 && now - lastPopAt > 1400 && Math.random() < 0.4) {
        lastPopAt = now
        backfire(t)
      }
    }
  },
  stop() {
    engineWanted = false
    if (!eng) return
    const { oscA, oscB, sub, hiss, gain, hissGain, turbo, turboGain, pops, popGain, bovGain } = eng
    eng = null
    const t = ctx.currentTime
    gain.gain.setTargetAtTime(0.0001, t, 0.08)
    hissGain.gain.setTargetAtTime(0.0001, t, 0.08)
    turboGain.gain.setTargetAtTime(0.0001, t, 0.08)
    popGain.gain.cancelScheduledValues(t)
    popGain.gain.setValueAtTime(0, t)
    bovGain.gain.cancelScheduledValues(t)
    bovGain.gain.setValueAtTime(0, t)
    for (const n of [oscA, oscB, sub, hiss, turbo, pops]) n.stop(t + 0.5)
  },
}

// --- ambience ----------------------------------------------------------------------------

let ambienceWanted = false
/** The bed's nodes once built (see buildAmbience). */
let amb = null
let ambienceSetAt = 0
let ambAltitude = 0
let gullTimer = 0

/**
 * The harbour around you: sea swells (noise under a low-pass, its level and brightness
 * rolled by two slow, out-of-step LFOs so the waves never line up), a wind that rises
 * with speed and height, and now and then a distant gull. Built once, then only steered.
 */
function buildAmbience() {
  if (!ctx || amb) return
  const t = ctx.currentTime
  const out = ctx.createGain()
  out.gain.value = 0.0001
  out.gain.setTargetAtTime(1, t, 1.2)
  out.connect(master)

  const sea = ctx.createBufferSource()
  sea.buffer = noiseBuffer
  sea.loop = true
  const seaFilter = ctx.createBiquadFilter()
  seaFilter.type = 'lowpass'
  seaFilter.frequency.value = 520
  seaFilter.Q.value = 0.4
  const seaGain = ctx.createGain()
  seaGain.gain.value = 0.03
  const swellA = ctx.createOscillator()
  swellA.frequency.value = 0.085
  const swellB = ctx.createOscillator()
  swellB.frequency.value = 0.137
  const swellDepth = ctx.createGain()
  swellDepth.gain.value = 0.009
  swellA.connect(swellDepth)
  swellB.connect(swellDepth)
  swellDepth.connect(seaGain.gain)
  const surf = ctx.createGain()
  surf.gain.value = 240
  swellA.connect(surf).connect(seaFilter.frequency)
  sea.connect(seaFilter).connect(seaGain).connect(out)

  const wind = ctx.createBufferSource()
  wind.buffer = noiseBuffer
  wind.loop = true
  const windFilter = ctx.createBiquadFilter()
  windFilter.type = 'bandpass'
  windFilter.frequency.value = 420
  windFilter.Q.value = 0.8
  const windGain = ctx.createGain()
  windGain.gain.value = 0.003
  const gust = ctx.createOscillator()
  gust.frequency.value = 0.23
  const gustDepth = ctx.createGain()
  gustDepth.gain.value = 110
  gust.connect(gustDepth).connect(windFilter.frequency)
  wind.connect(windFilter).connect(windGain).connect(out)

  sea.start(t, 0.1)
  wind.start(t, 0.6)
  for (const o of [swellA, swellB, gust]) o.start(t)
  amb = { out, seaGain, swellDepth, windGain, windFilter, sources: [sea, wind, swellA, swellB, gust] }
  scheduleGull()
}

function scheduleGull() {
  clearTimeout(gullTimer)
  gullTimer = setTimeout(() => {
    if (!amb) return
    // Gulls stay near the water: fewer of them the higher you climb.
    if (Math.random() > ambAltitude * 0.6) gullCall()
    scheduleGull()
  }, 6000 + Math.random() * 9000)
}

/** A gull's "kyow": a nasal FM chirp that leaps up and falls away, 1-3 times. */
function gullCall() {
  if (!ready('gull')) return
  const calls = 1 + Math.floor(Math.random() * 3)
  const pan = Math.random() * 1.6 - 0.8
  const k = 0.9 + Math.random() * 0.25
  let at = 0
  for (let i = 0; i < calls; i += 1) {
    const pitch = k * (1 - i * 0.05)
    whenDue(at, (t) => gullAt(t, pitch, pan))
    at += 0.3 + Math.random() * 0.12
  }
}

function gullAt(t, k, pan) {
  const carrier = ctx.createOscillator()
  carrier.type = 'sawtooth'
  carrier.frequency.setValueAtTime(950 * k, t)
  carrier.frequency.linearRampToValueAtTime(1650 * k, t + 0.05)
  carrier.frequency.exponentialRampToValueAtTime(820 * k, t + 0.3)
  const mod = ctx.createOscillator()
  mod.frequency.value = 52
  const modDepth = ctx.createGain()
  modDepth.gain.value = 90 * k
  mod.connect(modDepth).connect(carrier.frequency)
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 1800
  filter.Q.value = 1.6
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(0.045, t + 0.03)
  gain.gain.exponentialRampToValueAtTime(0.025, t + 0.15)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32)
  carrier.connect(filter).connect(gain)
  let tail = gain
  if (ctx.createStereoPanner) {
    const panner = ctx.createStereoPanner()
    panner.pan.value = pan
    tail = gain.connect(panner)
  }
  tail.connect(master)
  tail.connect(echo)
  carrier.start(t)
  mod.start(t)
  carrier.stop(t + 0.35)
  mod.stop(t + 0.35)
}

/**
 * The ambience bed. `start()` once the world is on screen, `set()` every frame (cheap:
 * re-aims the existing nodes at most ~10 times a second, never allocates), `stop()`
 * when leaving the world.
 */
export const ambience = {
  start() {
    ambienceWanted = true
    buildAmbience()
  },
  /**
   * @param {number} speed01 your speed as a fraction of top speed (0..1)
   * @param {number} altitude01 how high you are on the course (0 = sea level, 1 = top)
   */
  set(speed01, altitude01) {
    if (!amb) {
      if (ambienceWanted && ctx) buildAmbience()
      return
    }
    const now = performance.now()
    if (now - ambienceSetAt < 100) return
    ambienceSetAt = now
    const s = Math.min(1, Math.max(0, speed01 || 0))
    const a = Math.min(1, Math.max(0, altitude01 || 0))
    ambAltitude = a
    const t = ctx.currentTime
    const sea = 0.03 * (1 - a * 0.75)
    amb.seaGain.gain.setTargetAtTime(sea, t, 0.6)
    amb.swellDepth.gain.setTargetAtTime(sea * 0.3, t, 0.6)
    amb.windGain.gain.setTargetAtTime(0.003 + a * 0.012 + s * s * 0.045, t, 0.25)
    amb.windFilter.frequency.setTargetAtTime(380 + s * 1400 + a * 300, t, 0.3)
  },
  stop() {
    ambienceWanted = false
    clearTimeout(gullTimer)
    if (!amb) return
    const { out, sources } = amb
    amb = null
    const t = ctx.currentTime
    out.gain.setTargetAtTime(0.0001, t, 0.25)
    for (const n of sources) n.stop(t + 1.2)
  },
}

// --- tyre squeal -----------------------------------------------------------------------

let squeal = null
let skidSetAt = 0

/** Tyres squealing while you drift or brake hard. `set(amount 0..1)` every frame. */
export const skid = {
  set(amount) {
    if (!ctx) return
    if (!squeal) {
      if (amount < 0.05) return
      const src = ctx.createBufferSource()
      src.buffer = noiseBuffer
      src.loop = true
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = 1700
      filter.Q.value = 3
      const gain = ctx.createGain()
      gain.gain.value = 0.0001
      src.connect(filter).connect(gain).connect(master)
      src.start()
      squeal = { filter, gain }
    }
    const now = performance.now()
    if (now - skidSetAt < 33) return
    skidSetAt = now
    const a = Math.min(1, Math.max(0, amount))
    const t = ctx.currentTime
    squeal.gain.gain.setTargetAtTime(a * 0.06, t, 0.06)
    squeal.filter.frequency.setTargetAtTime(1500 + a * 600, t, 0.1)
  },
}

// --- one-shots -------------------------------------------------------------------------

/** Rarity -> how lavish its reveal is. */
const RARITY_LEVEL = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 }

export const sfx = {
  click() {
    if (ready('click', 40)) tone(660, { type: 'triangle', duration: 0.05, volume: 0.15 })
  },
  /** A coin: a bright two-note ding, pitch nudged each time so a row doesn't drone. */
  coin() {
    if (!ready('coin', 45)) return
    const k = 1 + (Math.random() - 0.5) * 0.06
    tone(1319 * k, { type: 'square', duration: 0.07, volume: 0.05, cutoff: 4000 })
    tone(1976 * k, { type: 'square', at: 0.06, duration: 0.18, volume: 0.05, echo: true, cutoff: 4500 })
  },
  /** Through a checkpoint gate: a short brass-y fanfare. */
  checkpoint() {
    if (!ready('checkpoint', 300)) return
    arpeggio([65, 69, 72, 77], { step: 0.08, volume: 0.07, duration: 0.18 })
    tone(hz(77), { type: 'sawtooth', at: 0.32, duration: 0.45, volume: 0.05, cutoff: 2400 })
    tone(hz(81), { type: 'sawtooth', at: 0.32, duration: 0.45, volume: 0.04, cutoff: 2400 })
    bell(hz(89), { at: 0.34, volume: 0.05, decay: 0.6 })
  },
  /** Crossing the finish: a bigger fanfare, a held chord and a shower of sparkles. */
  finish() {
    if (!ready('finish', 1000)) return
    duckMusic(true)
    arpeggio([60, 64, 67, 72, 76, 79], { step: 0.09, volume: 0.07, duration: 0.2 })
    for (const n of [72, 76, 79, 84]) tone(hz(n), { type: 'sawtooth', at: 0.6, duration: 1.4, volume: 0.03, attack: 0.05, cutoff: 2600 })
    tone(hz(48), { type: 'triangle', at: 0.6, duration: 1.4, volume: 0.12 })
    noise({ at: 0.55, duration: 1.2, volume: 0.05, from: 2000, to: 6000, q: 0.5 })
    sparkle(10, { at: 0.7, base: 84 })
    setTimeout(() => duckMusic(false), 2400)
  },
  /** The car spin's reel ticking past a car. */
  spinTick() {
    if (ready('spinTick', 30)) tone(1250 + Math.random() * 80, { type: 'triangle', duration: 0.03, volume: 0.09 })
  },
  /** The spin landing: more lavish the rarer the car. */
  spinWin(rarity = 'common') {
    if (!ready('spinWin', 400)) return
    const level = RARITY_LEVEL[rarity] ?? 0
    if (level === 0) {
      bell(hz(79), { volume: 0.08 })
      bell(hz(84), { at: 0.1, volume: 0.08 })
      return
    }
    if (level >= 3) duckMusic(true)
    const notes = [[67, 72, 76], [67, 72, 76, 79], [65, 69, 72, 77, 81], [60, 64, 67, 72, 76, 79, 84], [60, 64, 67, 71, 74, 79, 83, 86]][level]
    arpeggio(notes, { step: 0.07 - level * 0.006, volume: 0.06 })
    const end = notes.length * 0.065
    if (level >= 2) sparkle(4 + level * 2, { at: end, base: 84, volume: 0.035 })
    if (level >= 3) {
      for (const n of notes.slice(-3)) tone(hz(n), { type: 'sawtooth', at: end, duration: 1.1, volume: 0.03, attack: 0.04, cutoff: 2800 })
      noise({ at: end - 0.1, duration: 1.0, volume: 0.05, from: 1500, to: 7000, q: 0.5 })
      setTimeout(() => duckMusic(false), 2000)
    }
    if (level >= 4) {
      tone(hz(36), { type: 'sawtooth', at: 0, duration: end + 0.3, volume: 0.05, slideTo: hz(60), cutoff: 1500 })
      arpeggio([84, 88, 91, 96], { at: end + 0.5, step: 0.06, volume: 0.04, type: 'triangle' })
    }
  },
  /** Bought something: a register bell and a tick. */
  buy() {
    if (!ready('buy', 120)) return
    bell(1568, { volume: 0.08, decay: 0.35 })
    bell(2093, { at: 0.08, volume: 0.07, decay: 0.45 })
    noise({ duration: 0.05, volume: 0.06, from: 4000, to: 3000, q: 2 })
  },
  error() {
    if (!ready('error', 200)) return
    tone(160, { type: 'square', duration: 0.13, volume: 0.06, cutoff: 1200 })
    tone(120, { type: 'square', at: 0.13, duration: 0.18, volume: 0.06, cutoff: 1200 })
  },
  /** Picked up an item crate: a quick sparkle up. */
  item() {
    if (!ready('item', 100)) return
    sparkle(4, { base: 79, volume: 0.05 })
  },
  /** Used an item: a whoosh up and a pop. */
  itemUse() {
    if (!ready('itemUse', 150)) return
    noise({ duration: 0.25, volume: 0.1, from: 400, to: 3200, q: 1 })
    tone(330, { type: 'triangle', duration: 0.22, volume: 0.09, slideTo: 990 })
    tone(1320, { type: 'sine', at: 0.2, duration: 0.08, volume: 0.06 })
  },
  /** A Rocket Missile leaving the rail: a hiss and a rising whoosh. */
  missileLaunch() {
    if (!ready('missileLaunch', 120)) return
    noise({ duration: 0.55, volume: 0.13, from: 900, to: 5200, q: 0.8, attack: 0.04 })
    tone(170, { type: 'sawtooth', duration: 0.4, volume: 0.06, slideTo: 520, cutoff: 1600 })
  },
  /** A missile blowing up; `volume` 0..1 (distance). A low boom and a crackle. */
  explosion(volume = 1) {
    const k = Math.min(1, Math.max(0.1, volume))
    if (!ready('explosion', 90)) return
    tone(95, { duration: 0.5, volume: 0.22 * k, slideTo: 32 })
    noise({ duration: 0.7, volume: 0.2 * k, from: 2200, to: 220, q: 0.6, attack: 0.02 })
    noise({ duration: 0.25, volume: 0.08 * k, from: 6000, to: 2500, q: 0.8, attack: 0.02 })
  },
  /** Over a boost pad: a rising rush. */
  boostPad() {
    if (!ready('boostPad', 250)) return
    noise({ duration: 0.45, volume: 0.13, from: 300, to: 3500, q: 0.9 })
    tone(140, { type: 'sawtooth', duration: 0.4, volume: 0.05, slideTo: 420, cutoff: 1800 })
  },
  /** A bounce pad: a cartoon boing. */
  bounce() {
    if (!ready('bounce', 200)) return
    whenDue(0, (t) => {
      const osc = ctx.createOscillator()
      const lfo = ctx.createOscillator()
      const lfoGain = ctx.createGain()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(160, t)
      osc.frequency.exponentialRampToValueAtTime(520, t + 0.35)
      lfo.frequency.value = 22
      lfoGain.gain.value = 40
      lfo.connect(lfoGain).connect(osc.frequency)
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.16, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45)
      osc.connect(gain).connect(master)
      osc.start(t)
      lfo.start(t)
      osc.stop(t + 0.47)
      lfo.stop(t + 0.47)
    })
  },
  /** Over a spike strip: a sharp pop, a hiss of escaping air and a rattle. */
  puncture() {
    if (!ready('puncture', 300)) return
    tone(190, { type: 'square', duration: 0.07, volume: 0.1, slideTo: 70, cutoff: 2200 })
    noise({ duration: 0.5, volume: 0.09, from: 7000, to: 2500, q: 0.7, attack: 0.02 })
    for (let i = 0; i < 3; i += 1) tone(600 + i * 120, { type: 'triangle', at: 0.06 + i * 0.07, duration: 0.05, volume: 0.04, slideTo: 300 })
  },
  /** A hit: a metal thud and clang, scaled by `intensity` 0..1. */
  crash(intensity = 0.5) {
    const k = Math.min(1, Math.max(0.05, intensity))
    if (!ready('crash', 110)) return
    tone(110 + k * 30, { duration: 0.18 + k * 0.15, volume: 0.1 + k * 0.15, slideTo: 40 })
    noise({ duration: 0.12 + k * 0.2, volume: 0.06 + k * 0.12, from: 1800, to: 400, q: 0.8, attack: 0.05 })
    if (k > 0.35) {
      // A clang: two inharmonic partials ringing briefly.
      tone(287 * (1 + Math.random() * 0.1), { type: 'square', duration: 0.22 * k + 0.05, volume: 0.03 * k, cutoff: 2500 })
      tone(431, { type: 'triangle', duration: 0.3 * k + 0.05, volume: 0.04 * k, echo: true })
    }
  },
  /** Into the sea: a big splash and a few bubbles. */
  splash() {
    if (!ready('splash', 400)) return
    noise({ duration: 0.7, volume: 0.2, from: 2500, to: 260, q: 0.6, attack: 0.04 })
    noise({ duration: 0.3, volume: 0.1, from: 6000, to: 3000, q: 0.8, attack: 0.05 })
    for (let i = 0; i < 4; i += 1) tone(300 + Math.random() * 300, { at: 0.25 + i * 0.09, duration: 0.07, volume: 0.05, slideTo: 900 + Math.random() * 400 })
  },
  /** Landed a trick. */
  trick() {
    if (!ready('trick', 200)) return
    tone(523, { type: 'square', duration: 0.12, volume: 0.05, slideTo: 1046, cutoff: 3000 })
    bell(1568, { at: 0.1, volume: 0.07 })
    bell(2093, { at: 0.18, volume: 0.06 })
  },
  /** Touching down from a jump. */
  land() {
    if (!ready('land', 150)) return
    tone(95, { duration: 0.16, volume: 0.16, slideTo: 48 })
    noise({ duration: 0.12, volume: 0.06, from: 900, to: 300, q: 0.7, attack: 0.05 })
  },
  /** The dock truck's two-tone air horn. */
  horn() {
    if (!ready('horn', 450)) return
    for (const f of [233, 294]) {
      tone(f, { type: 'sawtooth', duration: 0.42, volume: 0.05, attack: 0.03, cutoff: 1400 })
      tone(f * 1.005, { type: 'square', duration: 0.42, volume: 0.025, attack: 0.03, cutoff: 1100 })
    }
  },
  /** Respawned at the checkpoint: a reverse whoosh and a chime. */
  respawn() {
    if (!ready('respawn', 300)) return
    noise({ duration: 0.35, volume: 0.09, from: 3500, to: 500, q: 0.8, attack: 0.8 })
    bell(hz(84), { at: 0.3, volume: 0.06 })
  },
  /** A countdown beep. */
  countdown() {
    if (ready('countdown', 120)) tone(880, { type: 'square', duration: 0.12, volume: 0.06, cutoff: 3000 })
  },
  /** Nitro lit: an ignition whump and a whoosh (the engine adds the sustained hiss). */
  nitroStart() {
    if (!ready('nitroStart', 200)) return
    tone(90, { duration: 0.2, volume: 0.14, slideTo: 55 })
    noise({ duration: 0.4, volume: 0.12, from: 600, to: 4200, q: 0.9, attack: 0.1 })
  },
  /** Nitro out: a soft puff. */
  nitroStop() {
    if (!ready('nitroStop', 200)) return
    noise({ duration: 0.25, volume: 0.06, from: 1800, to: 300, q: 0.7, attack: 0.1 })
  },
  /** Rushing past an obstacle or through a gate; `intensity` 0..1 (closeness x speed). */
  whoosh(intensity = 0.5) {
    const k = Math.min(1, Math.max(0.05, intensity))
    if (!ready('whoosh', 90)) return
    const d = 0.22 + k * 0.18
    noise({ duration: d, volume: 0.03 + k * 0.09, from: 350 + k * 250, to: 1800 + k * 1600, q: 1.1, attack: 0.55 })
    noise({ at: d * 0.5, duration: d * 0.8, volume: 0.02 + k * 0.04, from: 2200, to: 500, q: 0.9, attack: 0.15 })
  },
  /** A fan's gust hitting the car: a swelling, airy rush. */
  wind() {
    if (!ready('wind', 400)) return
    noise({ duration: 0.9, volume: 0.1, from: 260, to: 1100, q: 0.7, attack: 0.35 })
    noise({ at: 0.1, duration: 0.7, volume: 0.035, from: 2600, to: 1500, q: 1.4, attack: 0.4 })
    tone(180, { type: 'sine', duration: 0.6, volume: 0.02, slideTo: 120, attack: 0.2 })
  },
  /** A hydraulic piston punching out: a thud and a clank, then the hiss of its release. */
  piston() {
    if (!ready('piston', 150)) return
    tone(92, { duration: 0.16, volume: 0.15, slideTo: 44 })
    tone(212 * (1 + Math.random() * 0.06), { type: 'square', duration: 0.14, volume: 0.035, cutoff: 2200 })
    tone(587, { type: 'triangle', duration: 0.22, volume: 0.03, echo: true })
    noise({ at: 0.06, duration: 0.32, volume: 0.07, from: 6500, to: 2800, q: 0.6, type: 'highpass', attack: 0.04 })
  },
  /** A drawbridge moving: a strained wooden creak, then a heavy clunk as it settles. */
  bridge() {
    if (!ready('bridge', 600)) return
    whenDue(0, (t) => {
      const osc = ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(78, t)
      osc.frequency.linearRampToValueAtTime(104, t + 0.35)
      osc.frequency.linearRampToValueAtTime(70, t + 0.65)
      const wobble = ctx.createOscillator()
      wobble.frequency.value = 13
      const wobbleDepth = ctx.createGain()
      wobbleDepth.gain.value = 9
      wobble.connect(wobbleDepth).connect(osc.frequency)
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = 620
      filter.Q.value = 5
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.09, t + 0.12)
      gain.gain.exponentialRampToValueAtTime(0.05, t + 0.5)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7)
      osc.connect(filter).connect(gain).connect(master)
      osc.start(t)
      wobble.start(t)
      osc.stop(t + 0.72)
      wobble.stop(t + 0.72)
    })
    tone(70, { at: 0.68, duration: 0.25, volume: 0.17, slideTo: 36 })
    noise({ at: 0.68, duration: 0.18, volume: 0.07, from: 1400, to: 300, q: 0.8, attack: 0.05 })
    tone(331, { type: 'square', at: 0.7, duration: 0.16, volume: 0.025, cutoff: 1800 })
  },
  /** Onto a conveyor: a low mechanical rumble with a rattle. */
  conveyor() {
    if (!ready('conveyor', 400)) return
    noise({ duration: 0.65, volume: 0.09, from: 140, to: 220, q: 0.9, type: 'lowpass', attack: 0.2 })
    whenDue(0, (t) => {
      const osc = ctx.createOscillator()
      osc.type = 'square'
      osc.frequency.value = 46
      const rattle = ctx.createOscillator()
      rattle.type = 'square'
      rattle.frequency.value = 17
      const rattleDepth = ctx.createGain()
      rattleDepth.gain.value = 0.5
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.03, t + 0.08)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6)
      const vca = ctx.createGain()
      vca.gain.value = 0.5
      rattle.connect(rattleDepth).connect(vca.gain)
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 380
      osc.connect(filter).connect(vca).connect(gain).connect(master)
      osc.start(t)
      rattle.start(t)
      osc.stop(t + 0.62)
      rattle.stop(t + 0.62)
    })
  },
  /** A cargo door giving itself away: a relay clunk, then a roller shutter rattling up. */
  shutter() {
    if (!ready('shutter', 500)) return
    tone(140, { duration: 0.08, volume: 0.08, slideTo: 90 })
    tone(392, { type: 'square', at: 0.02, duration: 0.06, volume: 0.02, cutoff: 1800 })
    for (let i = 0; i < 7; i += 1) {
      noise({ at: 0.1 + i * 0.055, duration: 0.05, volume: 0.05, from: 2600, to: 1400, q: 1.6, attack: 0.1 })
    }
  },
  /** A giant hammer sweeping through the bottom of its swing: a deep rush of air and a creak of the axle. */
  hammer() {
    if (!ready('hammer', 400)) return
    noise({ duration: 0.55, volume: 0.1, from: 180, to: 900, q: 0.8, attack: 0.45 })
    noise({ at: 0.2, duration: 0.35, volume: 0.04, from: 1600, to: 400, q: 1, attack: 0.2 })
    tone(64, { duration: 0.4, volume: 0.05, slideTo: 48, attack: 0.3 })
  },
  /** A forklift setting off: two short reversing beeps. */
  forklift() {
    if (!ready('forklift', 700)) return
    tone(1240, { type: 'square', duration: 0.12, volume: 0.025, cutoff: 3200 })
    tone(1240, { type: 'square', at: 0.24, duration: 0.12, volume: 0.025, cutoff: 3200 })
  },
  /** A checkpoint split: a bright rising pair if faster than your best, a soft fall if slower. */
  split(faster = true) {
    if (!ready('split', 300)) return
    if (faster) {
      bell(hz(88), { volume: 0.07, decay: 0.3 })
      bell(hz(93), { at: 0.09, volume: 0.07, decay: 0.45 })
    } else {
      tone(hz(69), { type: 'triangle', duration: 0.16, volume: 0.07 })
      tone(hz(65), { type: 'triangle', at: 0.13, duration: 0.28, volume: 0.06 })
    }
  },
  /** Climbed a place on the leaderboard: a quick rising run and a sparkle. */
  rankUp() {
    if (!ready('rankUp', 400)) return
    arpeggio([72, 76, 79, 84], { step: 0.06, volume: 0.055, duration: 0.14 })
    sparkle(5, { at: 0.24, base: 84, volume: 0.035 })
  },
  /** Entering a new section: a short two-chord brass sting. */
  section() {
    if (!ready('section', 800)) return
    for (const n of [65, 69, 72]) tone(hz(n), { type: 'sawtooth', duration: 0.2, volume: 0.03, attack: 0.01, cutoff: 2200 })
    for (const n of [70, 74, 77]) tone(hz(n), { type: 'sawtooth', at: 0.16, duration: 0.5, volume: 0.03, attack: 0.02, cutoff: 2400 })
    tone(hz(46), { type: 'triangle', at: 0.16, duration: 0.45, volume: 0.08 })
    bell(hz(89), { at: 0.18, volume: 0.045, decay: 0.5 })
  },
}
