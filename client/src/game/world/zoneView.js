/**
 * Zones of a zoned map (the Grand Tour): each zone's scenery builds only round its own
 * sections. `zoneView(stage, id)` is the stage as that zone's scenery sees it: the whole
 * stage (every road, so nothing is built through another zone's road), with `zone`
 * (`{ id, from, to }`: its section range, from `stage.zones`) and `decor` (the zone's own set
 * pieces, `stage.decor[id]`). Cached per stage, so layouts cached per stage object work.
 */

const cache = new WeakMap()

/** The zone record `{ id, from, to }` of zone `id` on `stage`, or null. */
export const zoneOf = (stage, id) => stage.zones?.find((z) => z.id === id) || null

export function zoneView(stage, id) {
  let views = cache.get(stage)
  if (!views) cache.set(stage, (views = new Map()))
  let v = views.get(id)
  if (!v) {
    v = { ...stage, zone: zoneOf(stage, id), decor: stage.decor?.[id] || {} }
    views.set(id, v)
  }
  return v
}

/** Is path sample (or anything with a `section`) `p` in zone record `zone`? */
export const inZoneRange = (zone, p) => !!zone && p.section >= zone.from && p.section <= zone.to
