/**
 * Sky Docks: the original map (the default). Registry entry - see ./index.js for the
 * fields. The stage itself is ./stage1.js, built when first loaded.
 */
export default {
  id: 'sky-docks',
  name: 'Sky Docks',
  short: 'SKY DOCKS',
  tagline: 'Up through the harbour cranes to Crane Summit',
  /** Story order (../chapters.js): CHAPTER 1, always open. */
  chapter: 1,
  /** Where the finish is, for "reach ... to unlock" (../chapters.js lockedMessage). */
  goal: 'the Crane Summit',
  /** The next chapter: the finish plaza's exit portal leads there (../chapters.js addExitPortal). */
  next: 'grand-tour',
  /** Portal swirl / UI accent. */
  color: '#ffb020',
  theme: {
    /** SKY_THEMES key (client/src/game/palette.js). Sky Docks follows Settings > Golden hour instead. */
    sky: 'golden',
    /** buildTrack.js colour overrides (PALETTE keys); empty = the Sky Docks palette. */
    track: {},
    /** Scenery generator (client/src/game/world/scenery/index.js). */
    scenery: 'docks',
    /** What the world stands in: 'sea' | 'ice' | 'lagoon' | 'sand' (only 'sea' is drawn so far). */
    ground: 'sea',
  },
  load: () => import('./stage1.js').then((m) => m.STAGE1),
}
