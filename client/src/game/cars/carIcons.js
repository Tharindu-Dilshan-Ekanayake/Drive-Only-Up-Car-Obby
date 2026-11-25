import { useSyncExternalStore } from 'react'
import {
  Color,
  DirectionalLight,
  Euler,
  Group,
  HemisphereLight,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
  WebGLRenderTarget,
} from 'three'

import { CARS } from '@shared/cars'

import { getCarMaterial } from './carMaterial'
import { getCarModel, WHEEL_GEOMETRY } from './carModels'

/**
 * Car portraits for the garage and the car spin, rendered from the very models the
 * world drives, with the main renderer (no image assets, no second WebGL context).
 *
 * Queued once the game is on screen (queueCarIcons, from GameScene) and made one a
 * frame from the frame loop (processIconQueue); each is read back asynchronously so
 * the main thread never waits on the GPU, then kept as a PNG data URL for <img>.
 *
 * Wiring (GameScene, inside the Canvas):
 *   attachIconRenderer(gl)     once the renderer exists (onCreated / an effect)
 *   processIconQueue()         every frame (a useFrame)
 *   queueCarIcons()            once the game is playable
 */

const SIZE = 192
/** Car id -> PNG data URL. */
const icons = new Map()
const queue = []
const listeners = new Set()
let renderer = null
let rig = null
let busy = false
let notifyScheduled = false
const _previousClear = new Color()
const _wm = new Matrix4()
const _wq = new Quaternion()
const _we = new Euler()
const _wp = new Vector3()
const _ws = new Vector3()

/** linear -> sRGB byte lookup: render targets come back in linear light. */
const TO_SRGB = new Uint8Array(256)
for (let i = 0; i < 256; i += 1) {
  const c = i / 255
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
  TO_SRGB[i] = Math.round(Math.min(1, Math.max(0, s)) * 255)
}

function buildRig() {
  const scene = new Scene()
  scene.add(new HemisphereLight('#ffffff', '#9fb6c4', 2.2))
  const sun = new DirectionalLight('#fff6e8', 1.9)
  sun.position.set(-3, 5, -2)
  scene.add(sun)
  const rim = new DirectionalLight('#bfe9ff', 0.8)
  rim.position.set(3, 2, 4)
  scene.add(rim)
  const camera = new PerspectiveCamera(24, 1, 0.1, 80)
  // The cars' own paint, so lamps glow and hazard stripes show as in the game.
  const material = getCarMaterial()
  const car = new Group()
  const body = new Mesh(getCarModel(CARS[0].id).geometry, material)
  car.add(body)
  const wheels = new InstancedMesh(WHEEL_GEOMETRY, material, 4)
  wheels.instanceColor = new InstancedBufferAttribute(new Float32Array(12).fill(1), 3)
  car.add(wheels)
  scene.add(car)
  const target = new WebGLRenderTarget(SIZE, SIZE, { samples: 4 })
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  return { scene, camera, car, body, wheels, target, canvas, pixels: new Uint8Array(SIZE * SIZE * 4) }
}

/** Poses `id` in the rig and frames it: a front three-quarter view from above. */
function pose(id) {
  const model = getCarModel(id)
  rig.body.geometry = model.geometry
  const { radius, width, positions } = model.wheels
  positions.forEach((p, i) => {
    // A touch of steering on the front wheels, for life.
    _wq.setFromEuler(_we.set(0, i < 2 ? 0.3 : 0, 0))
    rig.wheels.setMatrixAt(i, _wm.compose(_wp.fromArray(p), _wq, _ws.set(width, radius, radius)))
    rig.wheels.setColorAt(i, model.rim)
  })
  rig.wheels.instanceMatrix.needsUpdate = true
  rig.wheels.instanceColor.needsUpdate = true
  const [sw, sh, sl] = model.size
  const extent = Math.max(sw, sh, sl)
  const cy = sh / 2 - radius
  rig.car.position.set(0, 0, 0)
  const d = extent * 2.55
  rig.camera.position.set(-d * 0.62, cy + d * 0.42, -d * 0.66)
  rig.camera.lookAt(0, cy * 0.9, 0)
}

function draw(id) {
  pose(id)
  const previousTarget = renderer.getRenderTarget()
  const previousClear = renderer.getClearColor(_previousClear)
  const previousAlpha = renderer.getClearAlpha()
  renderer.setRenderTarget(rig.target)
  renderer.setClearColor(0x000000, 0)
  renderer.clear()
  renderer.render(rig.scene, rig.camera)
  renderer.setRenderTarget(previousTarget)
  renderer.setClearColor(previousClear, previousAlpha)
}

/** The read-back pixels as an upright, sRGB, straight-alpha PNG for `id`. */
function store(id) {
  // A CPU-backed canvas: on a GPU one, toDataURL waits for a GPU readback (50-80 ms frames).
  const ctx2d = rig.canvas.getContext('2d', { willReadFrequently: true })
  const image = ctx2d.createImageData(SIZE, SIZE)
  const src = rig.pixels
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const from = ((SIZE - 1 - y) * SIZE + x) * 4
      const to = (y * SIZE + x) * 4
      const a = src[from + 3]
      const k = a > 0 ? 255 / a : 0
      image.data[to] = TO_SRGB[Math.min(255, Math.round(src[from] * k))]
      image.data[to + 1] = TO_SRGB[Math.min(255, Math.round(src[from + 1] * k))]
      image.data[to + 2] = TO_SRGB[Math.min(255, Math.round(src[from + 2] * k))]
      image.data[to + 3] = a
    }
  }
  ctx2d.putImageData(image, 0, 0)
  icons.set(id, rig.canvas.toDataURL('image/png'))
}

/** Called once the renderer exists (from inside the Canvas). Safe to call again after a context loss. */
export function attachIconRenderer(gl) {
  if (renderer && renderer !== gl && rig) {
    // A new context: the old render target belongs to the lost one.
    rig.target.dispose()
    rig.target = new WebGLRenderTarget(SIZE, SIZE, { samples: 4 })
  }
  renderer = gl
  if (!rig) {
    rig = buildRig()
    if (!import.meta.env?.DEV) gl.compileAsync?.(rig.scene, rig.camera).catch(() => null)
  }
}

/**
 * Compiles the rig's programs for its render target (they differ from the canvas's: linear
 * output), in parallel and without waiting - not in the frame the first portrait is drawn
 * (a ~450 ms stall, measured). Resolves when they're ready (App then lets portraits draw).
 */
export function warmIconRenderer() {
  if (!renderer || !rig) return Promise.resolve()
  // With a real car posed: its geometry's attributes pick the program variant too.
  pose(CARS[0].id)
  const previous = renderer.getRenderTarget()
  renderer.setRenderTarget(rig.target)
  const ready = renderer.compileAsync(rig.scene, rig.camera).catch(() => null)
  renderer.setRenderTarget(previous)
  return ready
}

/** Queues every car's portrait (call once the game is playable). */
export function queueCarIcons() {
  for (const car of CARS) request(car.id)
}

function notify() {
  if (notifyScheduled) return
  notifyScheduled = true
  setTimeout(() => {
    notifyScheduled = false
    for (const fn of listeners) fn()
  }, 0)
}

/**
 * Starts the next queued portrait, if none is under way. Call every frame; it does
 * nothing once the queue is empty. One small draw; the read-back finishes off-frame.
 */
export function processIconQueue() {
  if (busy || !renderer || !rig || queue.length === 0) return
  busy = true
  const id = queue.shift()
  draw(id)
  renderer
    .readRenderTargetPixelsAsync(rig.target, 0, 0, SIZE, SIZE, rig.pixels)
    .then(() => store(id))
    .catch((err) => console.warn('[carIcons] portrait failed', id, err))
    .finally(() => {
      busy = false
      notify()
    })
}

function request(id) {
  if (!id || icons.has(id) || queue.includes(id)) return
  queue.push(id)
}

function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** The portrait's data URL, or null until it has been rendered (queues it if needed). */
export function getCarIcon(id) {
  request(id)
  return icons.get(id) ?? null
}

/** React hook: the portrait's data URL for `id`, or null until it's ready. */
export function useCarIcon(id) {
  request(id)
  return useSyncExternalStore(subscribe, () => icons.get(id) ?? null)
}

export const CAR_ICON_SIZE = SIZE
