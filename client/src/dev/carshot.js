import {
  CircleGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  Quaternion,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'

import { getCarMaterial, setCarSky } from '../game/cars/carMaterial'
import { CALIPER_GEOMETRY, getCarModel, WHEEL_GEOMETRY } from '../game/cars/carModels'

/**
 * Car Shot (dev only, /carshot.html): one car, or one of its wheels, from the side - orthographic,
 * on a transparent background, in the golden hour's light (warm low sun, apricot sky reflections).
 * scripts/make-loading-cars.mjs saves the pictures the loading screen drives across its pier.
 *
 *   ?id=<car>&part=body   the body with its brake callipers, a dark well behind each wheel
 *   ?id=<car>&part=wheel  one wheel (tyre and rim) - the loading screen spins it
 *   &px=<pixels per metre> (default 200)
 *
 * Publishes `window.__carshot = { width, height, wheels: [[cx, cy] ...], radius }` (in pixels,
 * measured from the picture's top-left; `wheels` are the car's two near-side wheel centres, front
 * first) and sets `window.__carshotReady`.
 */
const params = new URLSearchParams(window.location.search)
const id = params.get('id') || 'meridian'
const part = params.get('part') || 'body'
const px = Number(params.get('px')) || 200

const model = getCarModel(id)
const r = model.wheels.radius
// The golden hour's sky as the paint's reflection (game/palette.js SKY_THEMES.golden: top, horizon).
setCarSky('#4a74c2', '#ffe3ab')
const material = getCarMaterial()

const scene = new Scene()
scene.add(new HemisphereLight('#ffd9b4', '#7a5646', 1.35))
const sun = new DirectionalLight('#ffcf9e', 2.7)
// Low in front of the car and a little to the near side, like the lobby's sun.
sun.position.set(9, 6, -14)
scene.add(sun)
const fill = new DirectionalLight('#9fb8ff', 0.55)
fill.position.set(8, 3, 12)
scene.add(fill)

const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
renderer.setClearColor(new Color('#000000'), 0)
renderer.setPixelRatio(1)

let width
let height
let camera
const out = { radius: r * px }

if (part === 'wheel') {
  // One wheel, its axis along x, seen from +x.
  const size = Math.ceil(2.2 * r * px)
  width = size
  height = size
  const m = new Matrix4().compose(new Vector3(0, 0, 0), new Quaternion(), new Vector3(model.wheels.width, r, r))
  const mesh = new InstancedMesh(WHEEL_GEOMETRY, material, 1)
  mesh.instanceColor = new InstancedBufferAttribute(new Float32Array([1, 1, 1]), 3)
  mesh.setMatrixAt(0, m)
  mesh.setColorAt(0, model.rim)
  scene.add(mesh)
  camera = new OrthographicCamera(-1.1 * r, 1.1 * r, 1.1 * r, -1.1 * r, 0.1, 100)
  camera.position.set(20, 0, 0)
  camera.lookAt(0, 0, 0)
} else {
  // The body, standing so its wheels would touch y = 0.
  const body = new Mesh(model.geometry, material)
  body.position.set(0, r, 0)
  scene.add(body)
  model.geometry.computeBoundingBox()
  const bb = model.geometry.boundingBox
  const pad = 0.25
  const zLo = bb.min.z - pad
  const zHi = bb.max.z + pad
  const yHi = r + bb.max.y + pad
  const yLo = 0
  const near = model.wheels.positions.filter((p) => p[0] > 0)
  // Brake callipers (the near wheels) and a dark well behind each wheel, for the arches to show.
  const cal = new InstancedMesh(CALIPER_GEOMETRY, material, near.length)
  const wellMat = new MeshBasicMaterial({ color: '#0a0d14' })
  near.forEach((p, i) => {
    const m = new Matrix4().compose(new Vector3(p[0], r + p[1], p[2]), new Quaternion(), new Vector3(model.wheels.width, r, r))
    cal.setMatrixAt(i, m)
    const well = new Mesh(new CircleGeometry(r * 1.05, 40), wellMat)
    well.rotation.y = Math.PI / 2
    well.position.set(p[0] - model.wheels.width * 0.9, r + p[1], p[2])
    scene.add(well)
  })
  scene.add(cal)
  width = Math.ceil((zHi - zLo) * px)
  height = Math.ceil((yHi - yLo) * px)
  // Looking along -x, screen right is -z: the car (which drives towards -z) faces right.
  camera = new OrthographicCamera(-(zHi), -(zLo), yHi, yLo, 0.1, 100)
  camera.position.set(20, 0, 0)
  camera.lookAt(0, 0, 0)
  // OrthographicCamera's left/right are in camera space: right = -z, so left = -zHi, right = -zLo.
  camera.left = -zHi
  camera.right = -zLo
  camera.updateProjectionMatrix()
  out.wheels = near
    .sort((a, b) => a[2] - b[2])
    .map((p) => [Math.round((zHi - p[2]) * px), Math.round((yHi - (r + p[1])) * px)])
}

renderer.setSize(width, height)
document.body.appendChild(renderer.domElement)
renderer.render(scene, camera)
out.width = width
out.height = height
window.__carshot = out
window.__carshotReady = true
