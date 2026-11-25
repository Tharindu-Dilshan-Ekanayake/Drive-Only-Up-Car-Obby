import { schema, t } from '@colyseus/schema'

/**
 * Synced state, kept deliberately small: only who is in the room and what car they
 * drive. Poses go separately, as binary 'P' messages (GameRoom.relayPoses). Everything
 * private (coins, garage, splits...) goes to its owner alone as 'profile' messages,
 * never through the shared state.
 */
export const PlayerState = schema(
  {
    name: t.string(),
    /** Their verified Boxity account id ('' for guests), so chat can be matched to them. */
    uid: t.string(),
    /**
     * Index into the binary pose stream (shared/poseCodec.js, 0..63): where this car
     * is comes from 'P' messages, not from this state, so 50 cars moving don't turn
     * every state patch into a pose dump.
     */
    slot: t.uint8(),
    /** Equipped car id (shared/cars.js), from their profile. */
    car: t.string(),
    /** Equipped paint and nitro colour ids (shared/cosmetics.js), from their profile. */
    paint: t.string(),
    nitro: t.string(),
    /** Checkpoint reached this run, from their profile. */
    cp: t.uint16(),
    /** What their Bloxity avatar wears, as JSON `{ equipped, proportions }` ('' = base). */
    look: t.string(),
  },
  'PlayerState',
)

export const GameState = schema(
  {
    /** sessionId -> player */
    players: t.map(PlayerState),
    /** Short code for private lobbies ('' for public ones). */
    code: t.string(),
    isPrivate: t.boolean(),
    /** The map this room plays (a shared/stages/index.js id). */
    stage: t.string(),
  },
  'GameState',
)
