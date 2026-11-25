import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CRATE_ITEMS, createItemDealer } from '../../shared/crateItems.js'
import { loadAllStages, loadStage, STAGE_IDS } from '../../shared/stages/index.js'

await loadAllStages()

test('every item crate holds an item; the three crates of a row hold three different ones', async () => {
  for (const id of STAGE_IDS) {
    const stage = await loadStage(id)
    const rows = new Map()
    for (const crate of stage.items) {
      assert.ok(CRATE_ITEMS.includes(crate.item), `${id} crate ${crate.id} item ${crate.item}`)
      assert.ok(Number.isInteger(crate.row), `${id} crate ${crate.id} has a row`)
      if (!rows.has(crate.row)) rows.set(crate.row, [])
      rows.get(crate.row).push(crate)
    }
    for (const [row, crates] of rows) {
      assert.equal(crates.length, 3, `${id} row ${row} has three crates`)
      assert.equal(new Set(crates.map((c) => c.item)).size, 3, `${id} row ${row}: three different items`)
      assert.equal(new Set(crates.map((c) => c.section)).size, 1, `${id} row ${row} is in one section`)
    }
  }
})

test('the same stage always deals the same crates', async () => {
  const a = await loadStage('sky-docks')
  const b = await loadStage('sky-docks')
  assert.deepEqual(
    a.items.map((c) => c.item),
    b.items.map((c) => c.item),
  )
})

test('missiles turn up regularly, but less often than the other items', () => {
  const deal = createItemDealer('crate-stats')
  const counts = Object.fromEntries(CRATE_ITEMS.map((id) => [id, 0]))
  let dry = 0
  let longest = 0
  let rowsWithMissile = 0
  const ROWS = 3000
  for (let i = 0; i < ROWS; i += 1) {
    const row = deal(3)
    for (const id of row) counts[id] += 1
    if (row.includes('missile')) {
      rowsWithMissile += 1
      dry = 0
    } else {
      dry += 1
      longest = Math.max(longest, dry)
    }
  }
  assert.ok(longest <= 3, `a missile within every 4 rows (longest drought ${longest})`)
  assert.ok(rowsWithMissile / ROWS > 0.2 && rowsWithMissile / ROWS < 0.5, `about one row in three has a missile (${rowsWithMissile / ROWS})`)
  const others = CRATE_ITEMS.filter((id) => id !== 'missile').map((id) => counts[id])
  assert.ok(counts.missile < Math.min(...others), `missile rarer than every other item (${JSON.stringify(counts)})`)
})
