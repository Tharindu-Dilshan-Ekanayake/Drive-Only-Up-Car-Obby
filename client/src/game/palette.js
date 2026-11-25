/**
 * Sky Docks palette: bright midday harbour. Every system (world, cars' fallbacks, HUD,
 * panels) takes its colours from here so the game reads as one place.
 * sRGB hex, as picked in an image editor.
 */
export const PALETTE = {
  // Sky and sea
  skyTop: '#2f8fe8',
  skyHorizon: '#c4ecff',
  sun: '#fff6d8',
  sea: '#13b6c9',
  seaDeep: '#0a6f9c',
  foam: '#eafcff',

  // Track
  asphalt: '#4b5058',
  asphaltLine: '#f2f4f7',
  hazardYellow: '#ffc41f',
  /** Road kerbs: pink and white stripes. */
  kerb: '#ff4f9a',
  hazardBlack: '#24282e',
  steel: '#2e7383',
  steelDark: '#1f4e5a',
  concrete: '#c9ced4',
  plaza: '#d8dde2',
  gateOrange: '#ff7a1a',
  rope: '#8b6b45',

  // Shipping containers
  containers: ['#e2453b', '#2f6fe0', '#19a974', '#ffb020', '#8a5cf6', '#ff7a1a', '#1fb5c9'],

  // Pickups and FX
  coin: '#ffcc2e',
  coinEdge: '#e09a10',
  item: '#3fd9ff',
  boost: '#ff7a1a',
  bounce: '#7cf25a',
  oil: '#1b1d22',
  nitro: '#5fe3ff',

  // UI
  uiNavy: '#14234f',
  uiNavyLight: '#1f3570',
  uiYellow: '#ffc41f',
  uiOrange: '#ff7a1a',
  uiTeal: '#18c3d6',
  uiRed: '#ff4a3d',
  uiGreen: '#3fd97a',
  uiWhite: '#f4f7fb',
  uiInk: '#0d1530',
}

/**
 * The skies: Sky Docks' two (Settings > Golden hour) and one per other map (its
 * registry entry's `theme.sky`, see world/skyTheme.js). Everything that depends on the light reads
 * one of these: the sky dome, sun, fog, sea, the hemisphere/sun lights and the car
 * paint's reflection. `sunDir` points from the world towards the sun. `darkness` (0-1) is
 * how dark the scene reads: it blends with the sky (world/nightLight.js) and turns the car
 * lights on past ~0.3 (head and tail lamps, beams, light pools; world/Environment.jsx).
 */
export const SKY_THEMES = {
  // Late afternoon: a low sun in the north-west (ahead and left of the spawn), a
  // dusky-blue zenith fading through apricot to a pale gold horizon, peach clouds with
  // rose undersides, and a gold glitter path on a deeper sea.
  golden: {
    top: '#4a74c2',
    mid: '#ffb27c',
    horizon: '#ffe3ab',
    sun: '#fff1c9',
    glow: '#ffae5a',
    cloud: '#ffe9cf',
    cloudShade: '#d98a8f',
    fog: '#f8d2a6',
    sea: '#1890aa',
    seaDeep: '#0c4b78',
    foam: '#ffe2b8',
    glitter: '#ffcf7a',
    sunDir: [-0.62, 0.3, -0.72],
    light: '#ffcf9e',
    lightIntensity: 2.45,
    hemiSky: '#ffe2c6',
    hemiGround: '#46809a',
    hemiIntensity: 1.45,
    carSkyTop: '#ffd7b0',
    carSkyLow: '#6a7f9a',
    darkness: 0.15,
  },
  // Bright midday harbour (the original look).
  midday: {
    top: PALETTE.skyTop,
    mid: PALETTE.skyHorizon,
    horizon: PALETTE.skyHorizon,
    sun: PALETTE.sun,
    glow: PALETTE.sun,
    cloud: '#ffffff',
    cloudShade: '#dfeaf3',
    fog: PALETTE.skyHorizon,
    sea: PALETTE.sea,
    seaDeep: PALETTE.seaDeep,
    foam: PALETTE.foam,
    glitter: PALETTE.foam,
    sunDir: [-0.45, 0.75, 0.35],
    light: '#fff4dc',
    lightIntensity: 2.3,
    hemiSky: '#dff4ff',
    hemiGround: '#3a8fa0',
    hemiIntensity: 1.5,
    carSkyTop: '#bfe6ff',
    carSkyLow: '#5d8f9c',
    darkness: 0,
  },
  // --- The Grand Tour's zones (shared/stages/grandTour.meta.js GRAND_TOUR_ZONES `sky`; the
  // sky blends from one to the next as you drive into a zone). `stars` (0-1) sprinkles stars
  // over the sky dome. `canyon` is the sunset at the finish.
  // Neon City: dark navy night, a cool moon, stars, a black-violet sea.
  night: {
    top: '#060b26',
    mid: '#14194a',
    horizon: '#3a2a6e',
    sun: '#dfe8ff',
    glow: '#7a5cff',
    cloud: '#2a2f5a',
    cloudShade: '#0d1030',
    fog: '#1b1a46',
    sea: '#141a4a',
    seaDeep: '#070a22',
    foam: '#6c7bd8',
    glitter: '#b9c4ff',
    sunDir: [0.4, 0.35, -0.85],
    light: '#a9b6ff',
    lightIntensity: 1.3,
    hemiSky: '#6a6fd0',
    hemiGround: '#1a1440',
    hemiIntensity: 1.25,
    carSkyTop: '#5a5fb8',
    carSkyLow: '#1a1a3a',
    darkness: 1,
    stars: 1,
  },
  // Grand Tour - Snowy Mountain: a crisp, clear alpine morning - a deep blue zenith over a
  // pale ice-white horizon, a low warm sun to the north-east (ahead as the road climbs) with
  // a soft gold glow, cool blue shade, thin white clouds, icy water far below.
  snow: {
    top: '#2f6fd0',
    mid: '#9fcdf2',
    horizon: '#eaf3fa',
    sun: '#fff7e6',
    glow: '#ffd9a8',
    cloud: '#ffffff',
    cloudShade: '#b9cbe0',
    fog: '#d6e6f4',
    sea: '#4f8fb5',
    seaDeep: '#1f4f75',
    foam: '#ffffff',
    glitter: '#fff2d8',
    sunDir: [0.5, 0.36, -0.79],
    light: '#fff1dc',
    lightIntensity: 2.15,
    hemiSky: '#dcebff',
    hemiGround: '#8ea6be',
    hemiIntensity: 1.35,
    carSkyTop: '#d4e8ff',
    carSkyLow: '#7f97b0',
    darkness: 0,
  },
  // Grand Tour - Tropical Island: a bright cyan midday - a deep clear blue zenith over a pale
  // aqua horizon, the sun high overhead (a little ahead as the zone runs north), white
  // cumulus with soft blue shade, a turquoise lagoon sea, warm white light and a sea-green
  // bounce from below.
  tropic: {
    top: '#0d8cff',
    mid: '#55cfff',
    horizon: '#d4f8ff',
    sun: '#fffbe8',
    glow: '#fff1b8',
    cloud: '#ffffff',
    cloudShade: '#cfeaff',
    fog: '#c6f1ff',
    sea: '#1fd6c6',
    seaDeep: '#0b93b8',
    foam: '#f4fffd',
    glitter: '#ffffff',
    sunDir: [0.25, 0.88, -0.4],
    light: '#fff7e2',
    lightIntensity: 2.5,
    hemiSky: '#dcfaff',
    hemiGround: '#3cbfa8',
    hemiIntensity: 1.55,
    carSkyTop: '#c4f2ff',
    carSkyLow: '#4aa8a0',
    darkness: 0,
  },
  // Grand Tour - Desert Canyon: a golden-red sunset (the tour's finish) - a dusky purple zenith
  // through flaming orange to a gold horizon, the sun low in the west-north-west (to your left
  // up the canyon, on your right on the summit as you look back over the tour), rose-and-violet
  // cloud undersides, a warm dusty haze, a dusk-violet sea far below, deep plum shade.
  // `darkness` 0.35: head and tail lamps glow on as you arrive.
  canyon: {
    top: '#3a2a6a',
    mid: '#ff6a3a',
    horizon: '#ffc46e',
    sun: '#fff0c4',
    glow: '#ff7a2c',
    cloud: '#ffb88e',
    cloudShade: '#a8467c',
    fog: '#e99a6e',
    sea: '#6e4058',
    seaDeep: '#2c1a32',
    foam: '#ffc9a2',
    glitter: '#ffb24e',
    sunDir: [-0.8, 0.16, -0.46],
    light: '#ffb27c',
    lightIntensity: 2.45,
    hemiSky: '#ffbc9c',
    hemiGround: '#6e3628',
    hemiIntensity: 1.35,
    carSkyTop: '#ffb88e',
    carSkyLow: '#5a2e3c',
    darkness: 0.35,
  },
  // Heat Run: a dramatic dusk over the port - a deep indigo zenith, a smouldering red band
  // low in the west where the sun has just gone, a violet-blue haze (police-light red and
  // blue in the air), the first stars, a dark steel sea.
  heat: {
    top: '#14123a',
    mid: '#5a2a6e',
    horizon: '#ff4a4f',
    sun: '#ffc2a0',
    glow: '#ff3b4e',
    cloud: '#6a4a8a',
    cloudShade: '#2a1f5a',
    fog: '#4a3a7a',
    sea: '#232a52',
    seaDeep: '#0e1230',
    foam: '#8a8ad8',
    glitter: '#ff8a7a',
    sunDir: [-0.75, 0.12, 0.65],
    light: '#ffb0a0',
    lightIntensity: 1.7,
    hemiSky: '#8a8ae8',
    hemiGround: '#3a1f3a',
    hemiIntensity: 1.35,
    carSkyTop: '#8a7ad8',
    carSkyLow: '#3a2040',
    darkness: 0.7,
    stars: 0.5,
  },
}
