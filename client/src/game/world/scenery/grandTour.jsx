import { createElement, lazy, Suspense } from 'react'

import { Stagger, WarmHold } from '../../StageWarmup'
import { zoneOf } from '../zoneView'

/**
 * The Grand Tour's scenery: one sub-module per zone (the zone's `scenery` id in
 * shared/stages/grandTour.meta.js GRAND_TOUR_ZONES), each its own lazy chunk, mounted with
 * the stage and given `{ stage, info, zone }` - `zone` is `{ id, from, to }`, the zone's
 * section range (stage.zones). A sub-module builds only round its own sections (see
 * ../zoneView.js; its set pieces are `stage.decor[zone.id]`), chunked and distance-culled,
 * preset-aware, and disposes everything on unmount.
 *
 * To build a zone's scenery: fill in its ./grandTour/<zone>Zone.jsx (the Tropical Island
 * and Desert Canyon ones are empty placeholders for now).
 */
// Every zone is mounted with the map, so all their chunks are fetched at once (in
// parallel, as soon as this module runs) rather than one round trip after another.
const ZONE_LOADS = {
  neon: () => import('./grandTour/neonZone'),
  snow: () => import('./grandTour/snowZone'),
  tropic: () => import('./grandTour/tropicZone'),
  canyon: () => import('./grandTour/canyonZone'),
}
const ZONE_SCENERY = Object.fromEntries(
  Object.entries(ZONE_LOADS).map(([id, load]) => {
    const started = load()
    started.catch(() => null)
    return [id, lazy(() => started)]
  }),
)

export default function GrandTourScenery({ stage, info }) {
  // One zone per frame: each builds its scenery as it mounts.
  return <Stagger>{zones(stage, info)}</Stagger>
}

function zones(stage, info) {
  return (info?.zones || []).map((z) => {
    const zone = zoneOf(stage, z.id)
    const Module = ZONE_SCENERY[z.scenery]
    if (!zone || !Module) return null
    return (
      // WarmHold: the loading screen's GPU warm-up (game/StageWarmup.jsx) waits for every zone's chunk.
      <Suspense key={z.id} fallback={<WarmHold />}>
        {createElement(Module, { stage, info, zone })}
      </Suspense>
    )
  })
}
