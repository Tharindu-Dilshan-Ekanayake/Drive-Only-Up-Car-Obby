/**
 * Runs `fn` after the current frame, outside the render loop. Frame callbacks must
 * never set React/zustand state directly (it would re-render mid-frame); they queue
 * the change here instead. Batched: one timer per frame however many are queued.
 */
const queue = []
let scheduled = false

function flush() {
  scheduled = false
  const jobs = queue.splice(0)
  for (const job of jobs) job()
}

export function defer(fn) {
  queue.push(fn)
  if (!scheduled) {
    scheduled = true
    setTimeout(flush, 0)
  }
}
