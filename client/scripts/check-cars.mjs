// Checks every procedural car model against its budgets and contracts:
//   cd client && node --import ./scripts/node-loader.mjs scripts/check-cars.mjs
// Body <= BODY_TRIS triangles and its LOD body <= LOD_TRIS, wheels <= WHEEL_TRIS (far
// wheel <= WHEEL_LOD_TRIS), position/normal/color/aPattern attributes all present and
// the same length, glowing lamps on every car, lights and exhausts listed (electric cars
// have none), no NaNs, and the body (and LOD) roughly inside the declared physics size.
import { CARS } from '@shared/cars'
import { CALIPER_GEOMETRY, getCarModel, triangleCount, WHEEL_GEOMETRY, WHEEL_LOD_GEOMETRY } from '../src/game/cars/carModels.js'

const BODY_TRIS = 3600
/** The low-detail body (CarRig past the quality preset's carLod distance, lobby parked cars on LOW, traffic). */
const LOD_TRIS = 1600
/** The shared wheel is ~320 triangles (carModels.js buildWheel), the far wheel ~96, callipers 24. */
const WHEEL_TRIS = 330
const WHEEL_LOD_TRIS = 100
/** How far (m) the drawn body may poke out of the physics box before we complain. */
const SIZE_SLACK = 0.45

let failures = 0
const r0 = (v) => Math.round(v * 100) / 100
const fail = (msg) => {
  failures += 1
  console.log(`  FAIL ${msg}`)
}

function checkAttributes(name, geometry) {
  const { position, normal, color, aPattern } = geometry.attributes
  if (!position || !normal || !color) fail(`${name}: missing position/normal/color`)
  if (!aPattern) fail(`${name}: missing aPattern`)
  else if (aPattern.itemSize !== 2) fail(`${name}: aPattern itemSize ${aPattern.itemSize} (want 2)`)
  for (const attr of [normal, color, aPattern]) {
    if (attr && attr.count !== position.count) fail(`${name}: attribute length mismatch (${attr.count} vs ${position.count})`)
  }
  for (let i = 0; i < position.array.length; i += 1) {
    if (!Number.isFinite(position.array[i])) {
      fail(`${name}: non-finite position`)
      break
    }
  }
  const counts = {}
  if (aPattern) {
    for (let i = 0; i < aPattern.count; i += 3) {
      const id = Math.round(aPattern.getX(i))
      counts[id] = (counts[id] || 0) + 1
    }
  }
  return counts
}

/** Container gates (track/obstacleSim.js SLOT_BOX) leave 2.6 m under their top box. */
const GATE_CLEARANCE = 2.6
/** carTuning's roof sphere (physics/tuning.js) over the road at rest (springs ~0.145 m in). */
function roofTop([w, h], r) {
  const cy = Math.max(Math.min(0.62, w * 0.3) - r + 0.38, 0.3)
  return r - 0.145 + Math.max(cy + 0.3, h - r - 0.45) + 0.6
}
const warnings = []

const rows = []
for (const car of CARS) {
  const model = getCarModel(car.id)
  const tris = triangleCount(model.geometry)
  const lodTris = triangleCount(model.lodGeometry)
  const patterns = checkAttributes(car.id, model.geometry)
  checkAttributes(`${car.id} lod`, model.lodGeometry)
  if (tris > BODY_TRIS) fail(`${car.id}: ${tris} triangles > ${BODY_TRIS}`)
  if (lodTris > LOD_TRIS) fail(`${car.id}: LOD ${lodTris} triangles > ${LOD_TRIS}`)
  if (lodTris > tris * 0.6) fail(`${car.id}: LOD ${lodTris} triangles is not much cheaper than ${tris}`)
  // Self-lit parts: GLOW (5), or head / tail lenses that finishPaint turned into HEADLAMP (17) / TAILLAMP (18).
  const glow = (patterns[5] || 0) + (patterns[17] || 0) + (patterns[18] || 0)
  if (!glow) fail(`${car.id}: no glowing lamps`)
  const { head, tail } = model.lights || {}
  if (!Array.isArray(model.lights)) fail(`${car.id}: lights is not an array`)
  if (!head?.length || !tail?.length) fail(`${car.id}: lights.head / lights.tail missing`)
  if (!model.exhausts?.length && !model.electric) fail(`${car.id}: no exhausts`)
  const { radius, width, positions } = model.wheels
  if (!(radius > 0 && width > 0) || positions.length !== 4) fail(`${car.id}: bad wheels`)
  const bb = model.geometry.boundingBox
  const [w, h, l] = model.size
  const over = [
    bb.max.x - bb.min.x - w,
    bb.max.y - bb.min.y - h,
    bb.max.z - bb.min.z - l,
  ]
  if (over.some((o) => o > SIZE_SLACK)) {
    fail(`${car.id}: body ${over.map((o) => o.toFixed(2)).join('/')} m over size [${model.size}]`)
  }
  const lb = model.lodGeometry.boundingBox
  const lodOff = Math.max(Math.abs(lb.min.y - bb.min.y), Math.abs(lb.max.y - bb.max.y), Math.abs(lb.min.z - bb.min.z), Math.abs(lb.max.z - bb.max.z))
  if (lodOff > 0.15) fail(`${car.id}: LOD body box differs from the full body by ${lodOff.toFixed(2)} m`)
  // Physics roof sphere and the drawn body's top, over the road, against the gates.
  const sphereTop = r0(roofTop(model.size, radius))
  const drawnTop = r0(radius - 0.145 + bb.max.y)
  if (sphereTop > GATE_CLEARANCE - 0.02) warnings.push(`${car.id}: roof sphere reaches ${sphereTop} m over the road - can snag the ${GATE_CLEARANCE} m container gates`)
  else if (drawnTop > GATE_CLEARANCE) warnings.push(`${car.id}: body top ${drawnTop} m over the road - pokes through ${GATE_CLEARANCE} m container gates (visual only)`)
  rows.push({
    car: car.id,
    rarity: car.rarity,
    tris,
    lodTris,
    glowTris: glow,
    stripeTris: patterns[1] || 0,
    head: head?.length || 0,
    tail: tail?.length || 0,
    exhausts: model.exhausts.length,
  })
}

const wheelTris = triangleCount(WHEEL_GEOMETRY)
const wheelLodTris = triangleCount(WHEEL_LOD_GEOMETRY)
const caliperTris = triangleCount(CALIPER_GEOMETRY)
checkAttributes('wheel', WHEEL_GEOMETRY)
checkAttributes('wheel lod', WHEEL_LOD_GEOMETRY)
checkAttributes('callipers', CALIPER_GEOMETRY)
if (wheelTris > WHEEL_TRIS) fail(`wheel: ${wheelTris} triangles > ${WHEEL_TRIS}`)
if (wheelLodTris > WHEEL_LOD_TRIS) fail(`far wheel: ${wheelLodTris} triangles > ${WHEEL_LOD_TRIS}`)

console.table(rows)
for (const w of warnings) console.log(`  WARN ${w}`)
const max = Math.max(...rows.map((r) => r.tris))
const maxLod = Math.max(...rows.map((r) => r.lodTris))
const avg = (key) => Math.round(rows.reduce((s, r) => s + r[key], 0) / rows.length)
console.log(`body max ${max} / ${BODY_TRIS} tris (avg ${avg('tris')}), LOD max ${maxLod} / ${LOD_TRIS} (avg ${avg('lodTris')}), wheel ${wheelTris} / ${WHEEL_TRIS}, far wheel ${wheelLodTris} / ${WHEEL_LOD_TRIS}, callipers ${caliperTris}`)
console.log(`worst car up close (body + 4 wheels + callipers): ${max + (wheelTris + caliperTris) * 4} tris; far: ${maxLod + wheelLodTris * 4} tris`)
if (failures) {
  console.log(`${failures} failure(s)`)
  process.exit(1)
}
console.log('all cars OK')
