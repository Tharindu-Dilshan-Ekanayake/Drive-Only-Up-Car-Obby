/**
 * The Grand Tour: one long map through four zones - Neon City (night), the Snowy Mountain
 * (early morning), the Tropical Island (midday) and the Desert Canyon (sunset, the finish)
 * - climbing all the way: the city's rooftops lead onto a sky-bridge into the mountains,
 * the mountain road climbs to an observatory on the summit ridge, and the island and the
 * canyon carry on above that.
 *
 * Each zone's roads are in their own module (./grandTour/<zone>.js: `<zone>Zone(b, cp, next)`
 * lays its roads on the shared builder and ends at the checkpoint into the next zone - the
 * last zone at the finish - returning the set pieces its scenery builds round the road).
 * This file strings them together and stamps every section with its zone (`section.zone`,
 * an id of ./grandTour.meta.js GRAND_TOUR_ZONES); `stage.zones` lists each zone's section
 * range and `stage.decor[zone]` its set pieces.
 *
 * Roads are capped at 31 (Sky Pearls are one bit per section): ~7 per zone. Neon City, the
 * Snowy Mountain and the Tropical Island are built (21 roads); the Desert Canyon is a short
 * placeholder for now (two roads), to be replaced.
 *
 * Built once on load (deterministic), so the client and the server agree on everything.
 */

import { placeAdventure } from '../adventure.js'
import { START_GATE } from '../lobby.js'
import { createTrackBuilder } from '../track.js'
import { canyonZone } from './grandTour/canyon.js'
import { neonZone } from './grandTour/neon.js'
import { snowZone } from './grandTour/snow.js'
import { tropicZone } from './grandTour/tropic.js'

/** Every straight and bend comes out this much longer (and higher, at the same slopes) than its spec. */
const STRETCH = 1.15

/** The zones in order, with their builders and the name of each zone's first road. */
const ZONES = [
  { id: 'neon', build: neonZone, first: 'Neon Strip' },
  { id: 'snow', build: snowZone, first: 'Ski Village' },
  { id: 'tropic', build: tropicZone, first: 'Lagoon Causeway' },
  { id: 'canyon', build: canyonZone, first: 'Mesa Road' },
]

export function build() {
  const b = createTrackBuilder({ id: 'grand-tour', name: 'Grand Tour', start: START_GATE, stretch: STRETCH })
  let cps = 0
  const cp = () => `Checkpoint ${(cps += 1)}`
  const decor = {}
  const zones = []
  ZONES.forEach((z, k) => {
    const first = b.stage.sections.length - 1
    b.stage.sections[first].name = z.first
    decor[z.id] = z.build(b, cp, ZONES[k + 1]?.first || null)
    // The last zone ends at the finish: its summit section is the zone's too.
    const last = k === ZONES.length - 1 ? b.stage.sections.length - 1 : b.stage.sections.length - 2
    for (let i = first; i <= last; i += 1) b.stage.sections[i].zone = z.id
    zones.push({ id: z.id, from: first, to: last })
  })
  const stage = b.build()
  stage.decor = decor
  stage.zones = zones
  // Ramps, star rings, a Sky Pearl and a treasure chest on every road (shared/adventure.js).
  return placeAdventure(stage)
}
