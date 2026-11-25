import Scenery from '../Scenery'
import TrackCity from '../TrackCity'

/**
 * The Sky Docks scenery: gantry cranes, container ships and buoys round the track
 * (Scenery.jsx) and the towers along it (TrackCity.jsx), both laid out from the stage.
 * Props (every scenery module gets the same): `{ stage, info }` - the built stage and
 * its registry entry (shared/stages/<map>.meta.js, `info.theme` for colours).
 */
export default function DocksScenery({ stage }) {
  return (
    <>
      <Scenery stage={stage} />
      <TrackCity stage={stage} />
    </>
  )
}
