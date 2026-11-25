import {
  Color,
  DirectionalLight,
  HemisphereLight,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'

import { CARS } from '@shared/cars'

import { getCarMaterial } from '../game/cars/carMaterial'
import { CALIPER_GEOMETRY, getCarModel, triangleCount, WHEEL_GEOMETRY, WHEEL_LOD_GEOMETRY } from '../game/cars/carModels'
import { PALETTE } from '../game/palette'

/**
 * Car Lab (dev only, /carlab.html): every car in a grid under the game's sun and sky,
 * for reviewing the models. `?id=rally` shows one car large; `?view=rear|side|front|top`
 * (or `?yaw=<deg>&pitch=<deg>`); `?ids=a,b,c` a chosen few (or `?from=14` every car from
 * that index on), `?cols=n`; `?lod=1` the level-of-detail bodies and far wheels;
 * `?dist=` camera distance; `?steer=<rad>` turns the front wheels; `?lift=<m>` raises the wheels
 * like the suspension does in the game (0.145 at rest; the rig now draws that as 0).
 */
const params = new URLSearchParams(window.location.search)
const only = params.get('id')
const view = params.get('view') || 'front'
const pick = params.get('ids')?.split(',').filter(Boolean)
const from = Number(params.get('from') || 0)
const lod = params.get('lod') === '1'
const steer = Number(params.get('steer') || 0)
const lift = Number(params.get('lift') || 0)

const renderer = new WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)
const scene = new Scene()
scene.background = new Color(PALETTE.skyHorizon)
scene.add(new HemisphereLight('#dff4ff', '#3a8fa0', 1.5))
const sun = new DirectionalLight('#fff4dc', 2.3)
sun.position.set(-40, 60, -30)
scene.add(sun)
const ground = new Mesh(new PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new MeshLambertMaterial({ color: '#d8dde2' }))
scene.add(ground)

const material = getCarMaterial()
const m4 = new Matrix4()
const qs = new Quaternion()
const up = new Vector3(0, 1, 0)
let cars = only ? CARS.filter((c) => c.id === only) : CARS.slice(from)
if (pick) cars = pick.map((id) => CARS.find((c) => c.id === id)).filter(Boolean)
const cols = only ? 1 : Number(params.get('cols')) || 4
const wheels = new InstancedMesh(lod ? WHEEL_LOD_GEOMETRY : WHEEL_GEOMETRY, material, cars.length * 4)
wheels.instanceColor = new InstancedBufferAttribute(new Float32Array(cars.length * 12).fill(1), 3)
const calipers = new InstancedMesh(CALIPER_GEOMETRY, material, cars.length * 4)
calipers.instanceColor = new InstancedBufferAttribute(new Float32Array(cars.length * 12).fill(1), 3)
const stats = []
cars.forEach((car, i) => {
  const model = getCarModel(car.id)
  const x = (i % cols) * 6.5 - ((cols - 1) * 6.5) / 2
  const z = Math.floor(i / cols) * 7.5
  const r = model.wheels.radius
  const body = new Mesh(lod ? model.lodGeometry : model.geometry, material)
  body.position.set(x, r, z)
  scene.add(body)
  model.wheels.positions.forEach((p, k) => {
    qs.setFromAxisAngle(up, k < 2 ? steer : 0)
    m4.compose(new Vector3(x + p[0], r + p[1] + lift, z + p[2]), qs, new Vector3(model.wheels.width, r, r))
    wheels.setMatrixAt(i * 4 + k, m4)
    wheels.setColorAt(i * 4 + k, model.rim)
    calipers.setMatrixAt(i * 4 + k, m4)
  })
  stats.push(`${car.id}:${triangleCount(model.geometry)}/${triangleCount(model.lodGeometry)}`)
})
scene.add(wheels)
if (!lod) scene.add(calipers)
const rows = Math.ceil(cars.length / cols)
const camera = new PerspectiveCamera(only ? 30 : 24, window.innerWidth / window.innerHeight, 0.1, 500)
const cz = ((rows - 1) * 7.5) / 2
const dist = Number(params.get('dist')) || (only ? 9 : 10 + Math.max(cols * 6.5, rows * 7.5) * 1.45)
const dirs = { front: [-0.5, 0.75, -1], rear: [0.5, 0.75, 1], side: [-1, 0.45, 0.05], top: [0, 1, 0.02], low: [-0.7, 0.25, -1] }
let d = dirs[view] || dirs.front
if (params.has('yaw')) {
  const yaw = (Number(params.get('yaw')) * Math.PI) / 180
  const pitch = (Number(params.get('pitch') || 20) * Math.PI) / 180
  d = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)]
}
const len = Math.hypot(...d)
camera.position.set((d[0] / len) * dist, (d[1] / len) * dist + 1, cz + (d[2] / len) * dist)
camera.lookAt(0, only ? 0.5 : 0.6, cz)
renderer.render(scene, camera)
window.__carlabStats = stats
window.__carlabReady = true
