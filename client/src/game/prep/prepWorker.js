/**
 * The prep worker: builds a map's stage data and its heavy geometry off the main thread,
 * so a map can be got ready while you drive round the lobby without a single long frame.
 *
 * Messages in:
 * - `{ type: 'stage', id }`: builds stage `id` (shared/stages) and sends it back in parts
 *   (`stage-part`, then `stage-end`): one big structured clone would be one long task to
 *   unpack on the main thread, slices are a few ms each.
 * - `{ type: 'build', key, job: { kind, stageId, zoneId, opts } }`: runs that builder on the
 *   worker's copy of the stage and sends `built` with the result, geometries as transferable
 *   typed arrays (decoded by ./prepClient.js). A drawn-ground `heightAt(x, z)` function can't
 *   cross: it is sampled onto a grid (`__height`) and becomes a bilinear lookup again there.
 */
import { loadStage, stageInfo } from '@shared/stages/index'

import { zoneView } from '../world/zoneView'

/** Array items per stage-part message. */
const SLICE = 500
/** Grid step (m) a heightAt is sampled at. */
const HEIGHT_STEP = 2

const BUILDERS = {
  stage: async (stage) => {
    const { buildStageGeometry } = await import('../track/buildTrack')
    const info = stageInfo(stage.id)
    return buildStageGeometry(stage, info?.theme?.track, info?.zones)
  },
  city: async (stage, job) => (await import('../world/cityGeometry')).buildTrackCity(stage, job.opts.density, job.opts.detail),
  neon: async (stage, job) => (await import('../world/neon/neonCityGeometry')).buildNeonCity(zoneView(stage, job.zoneId), job.opts),
  snow: async (stage, job) => (await import('../world/snow/snowGeometry')).buildSnowWorld(zoneView(stage, job.zoneId), job.opts),
  tropic: async (stage, job) => (await import('../world/tropic/tropicGeometry')).buildTropicWorld(zoneView(stage, job.zoneId), job.opts),
  canyon: async (stage, job) => (await import('../world/canyon/canyonGeometry')).buildCanyonWorld(zoneView(stage, job.zoneId), job.opts),
  heat: async (stage, job) => (await import('../world/heat/heatGeometry')).buildHeatCity(stage, job.opts),
}

/** Sends stage `id` in slices: small fields together, big arrays a slice at a time. */
async function sendStage(id) {
  const stage = await loadStage(id)
  const small = {}
  for (const [k, v] of Object.entries(stage)) {
    if (Array.isArray(v) && v.length > SLICE) {
      for (let i = 0; i < v.length; i += SLICE) self.postMessage({ type: 'stage-part', id, key: k, from: i, total: v.length, items: v.slice(i, i + SLICE) })
    } else small[k] = v
  }
  self.postMessage({ type: 'stage-part', id, small })
  self.postMessage({ type: 'stage-end', id })
}

/** The xz bounds of every geometry in `value` (where a sampled heightAt can matter). */
function boundsOf(value) {
  const b = [Infinity, Infinity, -Infinity, -Infinity]
  const seen = new Set()
  const walk = (o) => {
    if (!o || typeof o !== 'object' || seen.has(o) || ArrayBuffer.isView(o)) return
    seen.add(o)
    if (o.isBufferGeometry) {
      if (!o.boundingBox) o.computeBoundingBox()
      const { min, max } = o.boundingBox
      if (Number.isFinite(min.x)) {
        b[0] = Math.min(b[0], min.x)
        b[1] = Math.min(b[1], min.z)
        b[2] = Math.max(b[2], max.x)
        b[3] = Math.max(b[3], max.z)
      }
      return
    }
    for (const v of Object.values(o)) walk(v)
  }
  walk(value)
  return b
}

function sampleHeight(fn, b) {
  const x0 = Math.floor(b[0] - HEIGHT_STEP)
  const z0 = Math.floor(b[1] - HEIGHT_STEP)
  const nx = Math.ceil((b[2] - x0) / HEIGHT_STEP) + 2
  const nz = Math.ceil((b[3] - z0) / HEIGHT_STEP) + 2
  const h = new Float32Array(nx * nz)
  for (let j = 0; j < nz; j += 1) for (let i = 0; i < nx; i += 1) h[j * nx + i] = fn(x0 + i * HEIGHT_STEP, z0 + j * HEIGHT_STEP)
  return { __height: { x0, z0, nx, nz, step: HEIGHT_STEP, h, outside: fn(1e7, 1e7) } }
}

/** Plain-data copy of a builder result plus the buffers to transfer. */
function encode(result) {
  const transfer = new Set()
  const bounds = { b: null }
  // Always a copy: the builders keep layouts (and arrays inside them) cached for the next
  // build, and a transferred buffer is gone from this side.
  const arr = (a) => {
    const copy = a.slice()
    transfer.add(copy.buffer)
    return copy
  }
  const seen = new Map()
  const walk = (o) => {
    if (typeof o === 'function') {
      bounds.b ||= boundsOf(result)
      return sampleHeight(o, bounds.b)
    }
    if (!o || typeof o !== 'object') return o
    if (seen.has(o)) return seen.get(o)
    if (ArrayBuffer.isView(o)) {
      const out = arr(o)
      seen.set(o, out)
      return out
    }
    if (o.isBufferGeometry) {
      const attrs = {}
      for (const [name, a] of Object.entries(o.attributes)) attrs[name] = [arr(a.array), a.itemSize, a.normalized]
      if (!o.boundingSphere) o.computeBoundingSphere()
      const s = o.boundingSphere
      const bb = o.boundingBox
      const out = {
        __geo: {
          name: o.name,
          attrs,
          index: o.index ? arr(o.index.array) : null,
          groups: o.groups,
          draw: [o.drawRange.start, o.drawRange.count],
          bs: [s.center.x, s.center.y, s.center.z, s.radius],
          bb: bb ? [bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z] : null,
          userData: o.userData,
        },
      }
      seen.set(o, out)
      return out
    }
    const out = Array.isArray(o) ? [] : {}
    seen.set(o, out)
    for (const [k, v] of Object.entries(o)) out[k] = walk(v)
    return out
  }
  const value = walk(result)
  return { value, transfer: [...transfer] }
}

let queue = Promise.resolve()

self.onmessage = (e) => {
  const msg = e.data
  queue = queue
    .then(async () => {
      if (msg.type === 'stage') await sendStage(msg.id)
      else if (msg.type === 'build') {
        const stage = await loadStage(msg.job.stageId)
        const t0 = performance.now()
        const result = await BUILDERS[msg.job.kind](stage, msg.job)
        const { value, transfer } = encode(result)
        self.postMessage({ type: 'built', key: msg.key, value, ms: Math.round(performance.now() - t0) }, transfer)
      }
    })
    .catch((err) => self.postMessage({ type: 'error', key: msg.key, id: msg.id, message: String(err?.stack || err) }))
}
