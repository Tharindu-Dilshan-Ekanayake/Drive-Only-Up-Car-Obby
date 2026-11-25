/**
 * Pickup state for the current run, outside React: which coins you've taken (they stay
 * gone until you go back to the lobby and start over) and when each item crate comes
 * back. The stage's frame loop reads and writes it; nothing here re-renders anything.
 */
export const pickups = {
  /** Coin ids taken this run. */
  coins: new Set(),
  /** Crate id -> performance.now() it reappears. */
  crates: new Map(),
  /** Bumped when a run starts over, so systems can reset. */
  run: 0,
}

export function resetRun() {
  pickups.coins.clear()
  pickups.crates.clear()
  pickups.run += 1
}
