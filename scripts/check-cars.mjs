// Builds every car model under node and checks the triangle budgets:
// <= 1200 per car body, <= 80 per wheel. Run: node scripts/check-cars.mjs
import { registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@shared/')) {
      const file = path.join(root, 'shared', specifier.slice(8) + '.js')
      return next(pathToFileURL(file).href, context)
    }
    if (specifier === 'three' || specifier.startsWith('three/')) {
      return next(specifier, { ...context, parentURL: pathToFileURL(path.join(root, 'client', 'package.json')).href })
    }
    return next(specifier, context)
  },
})

const { CARS } = await import('../shared/cars.js')
const { getCarModel, WHEEL_GEOMETRY, triangleCount } = await import('../client/src/game/cars/carModels.js')

let failed = false
const wheelTris = triangleCount(WHEEL_GEOMETRY)
console.log(`wheel: ${wheelTris} tris ${wheelTris <= 80 ? 'OK' : 'OVER'}`)
if (wheelTris > 80) failed = true
for (const car of CARS) {
  const m = getCarModel(car.id)
  const t = triangleCount(m.geometry)
  const attrs = Object.keys(m.geometry.attributes).join(',')
  const bb = m.geometry.boundingBox
  const dims = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z].map((v) => v.toFixed(2)).join('x')
  const ok = t <= 1200 && attrs === 'position,normal,color'
  if (!ok) failed = true
  console.log(`${car.id.padEnd(11)} ${String(t).padStart(5)} tris  body ${dims}  wheels r=${m.wheels.radius} ${ok ? 'OK' : 'FAIL ' + attrs}`)
}
if (failed) {
  console.error('budget check FAILED')
  process.exit(1)
}
console.log('all cars within budget')
