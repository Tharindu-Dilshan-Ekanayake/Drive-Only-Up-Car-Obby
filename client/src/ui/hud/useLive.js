import { useEffect, useRef } from 'react'

/**
 * Per-frame HUD values (speed, altitude, nitro, timer, rail dots) are written straight
 * to the DOM by ONE shared requestAnimationFrame loop at ~30 Hz - never through React
 * state, so a moving car costs zero re-renders.
 *
 * A writer is `(now: number) => void` that reads `runtime` and touches refs
 * (textContent, style.transform). Writers should skip DOM writes when the value hasn't
 * changed (see `setText`).
 */

const writers = new Set()
const FRAME_MS = 1000 / 30
let rafId = 0
let lastRun = 0

function loop(now) {
  rafId = requestAnimationFrame(loop)
  if (now - lastRun < FRAME_MS - 1) return
  lastRun = now
  for (const write of writers) {
    try {
      write(now)
    } catch (err) {
      // One broken writer mustn't stop the rest of the HUD.
      console.warn('[hud] live writer failed', err)
      writers.delete(write)
    }
  }
}

function register(write) {
  writers.add(write)
  if (!rafId) rafId = requestAnimationFrame(loop)
  return () => {
    writers.delete(write)
    if (!writers.size && rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
  }
}

/**
 * Registers `write` with the shared HUD loop for the component's lifetime. The latest
 * `write` is always the one called, so it may close over props.
 */
export function useLive(write) {
  const ref = useRef(write)
  useEffect(() => {
    ref.current = write
  })
  useEffect(() => register((now) => ref.current(now)), [])
}

/** Sets an element's text only when it changed (cheap: no layout for equal strings). */
export function setText(el, text) {
  if (el && el.__liveText !== text) {
    el.__liveText = text
    el.textContent = text
  }
}

/** Sets one style property only when it changed. */
export function setStyle(el, prop, value) {
  if (!el) return
  const key = `__live_${prop}`
  if (el[key] !== value) {
    el[key] = value
    el.style[prop] = value
  }
}

/** Sets a data-* attribute only when it changed (`key` without the `data-` prefix). */
export function setData(el, key, value) {
  if (el && el.dataset[key] !== value) el.dataset[key] = value
}

/**
 * Restarts a one-shot CSS animation from a live writer without forcing a reflow: the
 * element alternates between two classes whose keyframes are identical copies
 * (`${base}-a` / `${base}-b`), so swapping them starts the animation over.
 */
export function replayClass(el, base) {
  if (!el) return
  const a = `${base}-a`
  const b = `${base}-b`
  if (el.classList.contains(a)) {
    el.classList.remove(a)
    el.classList.add(b)
  } else {
    el.classList.remove(b)
    el.classList.add(a)
  }
}
