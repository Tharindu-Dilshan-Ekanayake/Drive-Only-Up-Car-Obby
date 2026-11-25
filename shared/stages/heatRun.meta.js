/**
 * Heat Run - registry entry (see ./index.js). Stage: ./heatRun.js.
 *
 * A police-chase getaway: drive the route through Rustport's elevated freeways, alleys,
 * construction site, rail yard and canals to the safehouse on the harbour while your own
 * police (client-side AI, game/world/heat/) chase you. Players are always ghosts to each
 * other here (`pvp: false`: no car-to-car bumps between players anywhere, on the client
 * and in the room), and there are no CPU racers (`bots: false`) - the police take their
 * place. Getting BUSTED puts you back at your last checkpoint; the finish time is the
 * escape time.
 */
export default {
  id: 'heat-run',
  name: 'Heat Run',
  short: 'HEAT RUN',
  tagline: 'Outrun the heat across Rustport to the harbour safehouse',
  color: '#ff3b4e',
  /** The game mode the client runs on this map (police, heat, BUSTED): game/world/heat/. */
  mode: 'heat',
  /** No player-vs-player bumps anywhere on this map (shared/safeZones.js pvpEnabled). */
  pvp: false,
  /** No CPU racers (game/bots/Bots.jsx): the police are the opposition. */
  bots: false,
  theme: {
    sky: 'heat',
    // Dark asphalt with white lane lines, red-and-white kerbs, gunmetal steel, concrete
    // plazas with yellow hazard rails, red gates.
    track: {
      asphalt: '#2c2f36',
      asphaltLine: '#e9edf2',
      kerb: '#e8343f',
      steel: '#4a5462',
      steelDark: '#2b313b',
      plaza: '#8e949c',
      hazardYellow: '#ffc41f',
      gateOrange: '#e8343f',
    },
    scenery: 'heat',
    ground: 'sea',
  },
  load: () => import('./heatRun.js').then((m) => m.build()),
}
