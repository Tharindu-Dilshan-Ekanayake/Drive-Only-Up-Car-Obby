/**
 * Geometry built ahead of time in the prep worker (./prepWorker.js), waiting for the
 * builder call that will ask for it.
 *
 * The heavy builders (track sections, the track-side city, every zone's terrain and set
 * pieces, Heat Run's city) cost 50-1300 ms each on the main thread - far too long for a
 * frame while you drive round the lobby. So the prep worker runs them first, with the same
 * arguments the scenery modules will use, and ./prepClient.js files the results here; each
 * builder starts with `takePrebuilt(...)` and returns the ready result when there is one
 * (else it builds as before). No imports: the worker loads this module too, and finds the
 * registry empty.
 */

const ready = new Map()

/** Canonical key: builder `kind`, stage id, zone id, the options that change the output. */
export function prebuiltKey(kind, stageId, zoneId, opts) {
  const o = opts || {}
  const parts = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${k}=${o[k]}`)
  return `${kind}|${stageId}|${zoneId || ''}|${parts.join(',')}`
}

/**
 * The prebuilt result for this builder call, or null (build it here). Kept, not consumed:
 * a module that remounts (StrictMode, a preset change back) gets it again.
 *
 * @param {string} kind
 * @param {{ id?: string, zone?: { id: string } | null } | null | undefined} stage the stage (or zone view) passed to the builder
 * @param {object} [opts]
 */
export function takePrebuilt(kind, stage, opts) {
  if (!ready.size || !stage) return null
  return ready.get(prebuiltKey(kind, stage.id, stage.zone?.id, opts)) || null
}

export function putPrebuilt(key, value) {
  ready.set(key, value)
}

/** Forgets every prebuilt result (another map is being prepared). */
export function clearPrebuilt() {
  ready.clear()
}
