/**
 * Grand Tour - registry entry (see ./index.js). Stage: ./grandTour.js (the zones are
 * ./grandTour/<zone>.js).
 *
 * One long map that is a journey through four zones, in order: Neon City at night, the
 * Snowy Mountain in the early morning, the Tropical Island at midday and the Desert Canyon
 * at sunset (the finish). Every section of the stage carries its `zone` (an id below); the
 * client dresses each section from its zone: the sky (`sky`: a SKY_THEMES key, blended over
 * a few seconds when you drive into the next zone), the road colours (`track`: PALETTE
 * overrides, client/src/game/track/buildTrack.js) and the scenery (`scenery`: a sub-module
 * of client/src/game/world/scenery/grandTour.jsx that only builds round its own sections).
 * `color` is the zone's accent (the lobby portal's swirl blends all four).
 */

/** The zones in driving order. */
export const GRAND_TOUR_ZONES = [
  {
    id: 'neon',
    name: 'Neon City',
    color: '#ff3df0',
    sky: 'night',
    scenery: 'neon',
    // Glossy dark asphalt with cyan lane lines, light-strip kerbs (cyan on the right,
    // magenta on the left), violet steel, dark plazas with violet hazard rails.
    track: {
      asphalt: '#262a3b',
      asphaltLine: '#7fe8ff',
      kerb: '#2de2ff',
      kerbLeft: '#ff3df0',
      kerbGlow: 'glow',
      steel: '#3b2c78',
      steelDark: '#1d1542',
      plaza: '#3a3f58',
      hazardYellow: '#9b6bff',
      gateOrange: '#ff3df0',
    },
  },
  {
    id: 'snow',
    name: 'Snowy Mountain',
    color: '#7fd8ff',
    sky: 'snow',
    scenery: 'snow',
    // Frost-grey asphalt with white lines, ice-blue kerbs striped with snow white, slate
    // steel, snow-dusted plazas with ice-blue rails, red gates (they read against the snow).
    track: {
      asphalt: '#59626e',
      asphaltLine: '#f4f8fc',
      kerb: '#5fb8f0',
      steel: '#5c7287',
      steelDark: '#3a4a5c',
      plaza: '#e6edf4',
      hazardYellow: '#5fb8f0',
      gateOrange: '#e8414f',
    },
  },
  {
    id: 'tropic',
    name: 'Tropical Island',
    color: '#3fe0a0',
    sky: 'tropic',
    scenery: 'tropic',
    // Warm sun-baked asphalt with cream lines, coral kerbs on the right and sand-gold ones on
    // the left (striped with white), sandstone road sides and piers, sandy plazas with
    // turquoise rails, coral gates.
    track: {
      asphalt: '#5f5751',
      asphaltLine: '#fff4dc',
      kerb: '#ff7a5c',
      kerbLeft: '#ffc35c',
      steel: '#b8a283',
      steelDark: '#86725a',
      plaza: '#f3e4c2',
      hazardYellow: '#2fd6c8',
      gateOrange: '#ff7a5c',
    },
  },
  {
    id: 'canyon',
    name: 'Desert Canyon',
    color: '#ff6a2b',
    sky: 'canyon',
    scenery: 'canyon',
    // Dusty red-brown asphalt with cream lines, red kerbs on the right and sand ones on the
    // left (striped with white), weathered-timber road sides, girders and trestles, sandy
    // plazas with sunset-orange rails, flame-orange gates.
    track: {
      asphalt: '#6a5246',
      asphaltLine: '#ffe6bc',
      kerb: '#d8432c',
      kerbLeft: '#e8c48c',
      steel: '#9a6040',
      steelDark: '#5f3a25',
      plaza: '#e8c99c',
      hazardYellow: '#ff9a3c',
      gateOrange: '#ff5a2b',
    },
  },
]

export default {
  id: 'grand-tour',
  name: 'Grand Tour',
  short: 'GRAND TOUR',
  tagline: 'City lights to canyon sunset',
  /** Story order (../chapters.js): CHAPTER 2 ... */
  chapter: 2,
  /** ... locked until you have finished Sky Docks (shared/logic.js isStageUnlocked). */
  unlock: { finish: 'sky-docks' },
  color: '#ff3df0',
  theme: {
    /** The first zone's sky (the lobby and the start); each zone has its own (`zones`). */
    sky: 'night',
    /** The first zone's road colours: sections without a zone fall back to these. */
    track: GRAND_TOUR_ZONES[0].track,
    scenery: 'grandTour',
    ground: 'sea',
  },
  /** The zones, in driving order (a section's `zone` is one of these ids). */
  zones: GRAND_TOUR_ZONES,
  load: () => import('./grandTour.js').then((m) => m.build()),
}
