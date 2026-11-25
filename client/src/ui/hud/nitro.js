/**
 * Which nitro state the HUD shows (the gauge's inner arc and the nitro bar, as a
 * data-nitro attribute styled in index.css): '' | 'full' | 'boost' | 'empty'.
 */
export function nitroState(car, input) {
  const tank = Math.min(1, Math.max(0, car.nitro))
  if (input.nitro && tank < 0.02 && !car.boosting) return 'empty'
  if (car.boosting) return 'boost'
  return tank >= 0.995 ? 'full' : ''
}
