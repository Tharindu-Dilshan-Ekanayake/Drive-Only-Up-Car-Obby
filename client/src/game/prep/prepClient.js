import { Box3, BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three'

import { setStageLoader, stageInfo } from '@shared/stages/index'

import { prebuiltKey, putPrebuilt } from './prebuilt'

/**
 * The main thread's side of the prep worker (./prepWorker.js): stage data and heavy
 * geometry are built there, and arrive here in pieces small enough to unpack in a few ms
 * each, so a map gets ready while you drive round the lobby with no long frame.
 *
 * - `installStageLoader()` (main.jsx): from then on shared/stages `loadStage(id)` builds in
 *   the worker (the offline server, the client and travel all share that one cached load).
 * - `prebuildMap(stage, settings, onStep)`: runs every heavy builder the map's modules will
 *   call, with their exact arguments, and files the results (./prebuilt.js).
 * Without Workers (or if the worker fails) everything is built here as before.
 */

let worker = null
let failed = false
const waiting = new Map()
const stageParts = new Map()

function getWorker() {
  if (worker || failed) return worker
  try {
    worker = new Worker(new URL('./prepWorker.js', import.meta.url), { type: 'module' })
    worker.onmessage = onMessage
    worker.onerror = (e) => {
      console.warn('[prep] worker failed, building on the main thread', e.message)
      failed = true
      worker = null
      for (const w of waiting.values()) w.reject(new Error('prep worker failed'))
      waiting.clear()
    }
  } catch {
    failed = true
    worker = null
  }
  return worker
}

function onMessage(e) {
  const msg = e.data
  if (msg.type === 'stage-part') {
    const st = stageParts.get(msg.id)
    if (!st) return
    if (msg.small) Object.assign(st.stage, msg.small)
    else {
      const list = (st.stage[msg.key] ||= new Array(msg.total))
      for (let i = 0; i < msg.items.length; i += 1) list[msg.from + i] = msg.items[i]
    }
  } else if (msg.type === 'stage-end') {
    const st = stageParts.get(msg.id)
    stageParts.delete(msg.id)
    st?.resolve(st.stage)
  } else if (msg.type === 'built') {
    const w = waiting.get(msg.key)
    waiting.delete(msg.key)
    w?.resolve(decode(msg.value))
  } else if (msg.type === 'error') {
    console.warn('[prep] worker job failed', msg.message)
    const w = waiting.get(msg.key)
    waiting.delete(msg.key)
    w?.reject(new Error(msg.message))
    const st = stageParts.get(msg.id)
    stageParts.delete(msg.id)
    st?.reject(new Error(msg.message))
  }
}

/** Stage `id` built in the worker (resolves to the same data loadStage builds here). */
function loadStageOffThread(id, fallback) {
  const w = getWorker()
  if (!w) return fallback()
  return new Promise((resolve, reject) => {
    stageParts.set(id, { stage: {}, resolve, reject })
    w.postMessage({ type: 'stage', id })
  }).catch(() => fallback())
}

/** Main thread entry (once, before anything loads a stage). */
export function installStageLoader() {
  if (typeof Worker === 'undefined') return
  setStageLoader(loadStageOffThread)
}

const _v = new Vector3()

/** A bilinear lookup over a heightfield the worker sampled from a heightAt(x, z). */
function heightLookup({ x0, z0, nx, nz, step, h, outside }) {
  const x1 = x0 + (nx - 1) * step
  const z1 = z0 + (nz - 1) * step
  return (x, z) => {
    if (x < x0 || x > x1 || z < z0 || z > z1) return outside
    const fx = (x - x0) / step
    const fz = (z - z0) / step
    const i = Math.min(nx - 2, Math.floor(fx))
    const j = Math.min(nz - 2, Math.floor(fz))
    const u = fx - i
    const v = fz - j
    const a = j * nx + i
    return (h[a] * (1 - u) + h[a + 1] * u) * (1 - v) + (h[a + nx] * (1 - u) + h[a + nx + 1] * u) * v
  }
}

/** Turns the worker's plain copy back into geometries / functions. */
function decode(value) {
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value)) return value
  if (value.__geo) {
    const d = value.__geo
    const g = new BufferGeometry()
    g.name = d.name || ''
    for (const [name, [array, itemSize, normalized]] of Object.entries(d.attrs)) g.setAttribute(name, new BufferAttribute(array, itemSize, normalized))
    if (d.index) g.setIndex(new BufferAttribute(d.index, 1))
    for (const gr of d.groups) g.addGroup(gr.start, gr.count, gr.materialIndex)
    g.setDrawRange(d.draw[0], d.draw[1])
    g.boundingSphere = new Sphere(_v.set(d.bs[0], d.bs[1], d.bs[2]).clone(), d.bs[3])
    if (d.bb) g.boundingBox = new Box3(new Vector3(d.bb[0], d.bb[1], d.bb[2]), new Vector3(d.bb[3], d.bb[4], d.bb[5]))
    g.userData = d.userData || {}
    return g
  }
  if (value.__height) return heightLookup(value.__height)
  if (Array.isArray(value)) return value.map(decode)
  const out = {}
  for (const [k, v] of Object.entries(value)) out[k] = decode(v)
  return out
}

/**
 * The heavy builder calls map `stage`'s modules will make at these quality `settings`
 * (keep in step with the modules: Stage.jsx, TrackCity.jsx, scenery/heat.jsx and the Grand
 * Tour's zone modules). A call that doesn't match is simply built on the main thread.
 */
export function mapJobs(stage, settings) {
  const info = stageInfo(stage.id)
  const density = settings.sceneryDensity
  const low = density < 0.6
  const jobs = [{ kind: 'stage', opts: {} }]
  const scenery = info?.theme?.scenery
  if (scenery === 'grandTour') {
    for (const z of info.zones || []) {
      if (!stage.zones?.some((s) => s.id === z.id)) continue
      if (z.scenery === 'neon') jobs.push({ kind: 'neon', zoneId: z.id, opts: { density, detail: !low, lowRise: !low } })
      else if (z.scenery === 'snow' || z.scenery === 'tropic' || z.scenery === 'canyon') jobs.push({ kind: z.scenery, zoneId: z.id, opts: { density } })
    }
  } else if (scenery === 'heat') jobs.push({ kind: 'heat', opts: { density, detail: !low } })
  else jobs.push({ kind: 'city', opts: { density, detail: density >= 0.6 } })
  return jobs.map((j) => ({ ...j, stageId: stage.id }))
}

/**
 * Builds every heavy piece of `stage` in the worker and files it for its builder call.
 * `onStep(done, total)` after each. Resolves when all are in (failures are left to build
 * on the main thread).
 */
export async function prebuildMap(stage, settings, onStep) {
  const w = getWorker()
  if (!w) return
  const jobs = mapJobs(stage, settings)
  let done = 0
  await Promise.all(
    jobs.map((job) => {
      const key = prebuiltKey(job.kind, job.stageId, job.zoneId, job.opts)
      return new Promise((resolve, reject) => {
        waiting.set(key, { resolve, reject })
        w.postMessage({ type: 'build', key, job })
      })
        .then((result) => putPrebuilt(key, result))
        .catch(() => {})
        .finally(() => onStep?.((done += 1), jobs.length))
    }),
  )
}
