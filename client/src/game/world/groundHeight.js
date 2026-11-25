/**
 * The height of drawn ground that isn't a collider (the Grand Tour's mountain): a scenery
 * module that draws terrain sets `ground.at(x, z)` while it is mounted (null otherwise).
 * The player's car (player/PlayerCar.jsx) counts sinking below it as a fall, so a car off
 * the road respawns instead of sliding down inside the mountain. Terrain is always capped
 * under every road, so a car on a road is never below it.
 *
 * `ground.layers`: more drawn ground, added side by side instead of wrapping `ground.at`
 * (a zone adds its `heightAt` while mounted and deletes it on unmount - the Desert Canyon;
 * wrapping would fight the zones that re-wrap `ground.at`). `groundUnder` is the highest of
 * all of them.
 */
export const ground = { at: null, layers: new Set() }

/** The highest drawn ground under (x, z) (`ground.at` and every layer), or null if there is none. */
export function groundUnder(x, z) {
  let h = ground.at !== null ? ground.at(x, z) : null
  for (const fn of ground.layers) {
    const v = fn(x, z)
    if (h === null || v > h) h = v
  }
  return h
}
