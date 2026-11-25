/**
 * How dark the scene is right now, and how far the car lights are on - module-level,
 * written once a frame by the sky blend (world/Environment.jsx tickSkyBlend) from the
 * blended sky's `darkness` (palette.js SKY_THEMES), read by anything that lights up at
 * night: the lamp faces of every car (the world / car material's `uLamps` uniform), the
 * fake beams, light pools and glows (fx/NightLights.jsx), the player's real headlight
 * (MEDIUM/HIGH), police strobe pools and street-light pools. No React, no allocation.
 */

/** Darkness at which the lights start to come on, and where they're fully on. */
export const LAMPS_FROM = 0.28
export const LAMPS_FULL = 0.62

export const night = {
  /** 0 (broad daylight) .. 1 (night), blended with the sky. */
  darkness: 0,
  /** Car lights on: 0 (off) .. 1 (full), a smoothstep of darkness. */
  lamps: 0,
  /** Shared by the world and car materials (render/worldMaterial.js): lamp faces glow with it. */
  uLamps: { value: 0 },
}

/** Called by the sky blend with the blended sky's darkness. */
export function setDarkness(d) {
  night.darkness = d
  const k = Math.min(1, Math.max(0, (d - LAMPS_FROM) / (LAMPS_FULL - LAMPS_FROM)))
  night.lamps = k * k * (3 - 2 * k)
  night.uLamps.value = night.lamps
}

/** Is there any sky on this map dark enough for the lights (so a real headlight is worth keeping in the scene)? */
export const darkEnough = (themes) => themes.some((t) => (t?.darkness || 0) > LAMPS_FROM)
