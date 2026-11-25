import { lastCheckpoint } from '../../shared/logic.js'
import { getStage, STAGE_IDS } from '../../shared/stages/index.js'

import { saveProfile, topPlayers, topSplits } from './db.js'
import { activePlayers, liveRooms } from './registry.js'

const REFRESH_MS = 60_000
let players = { altitude: [], coins: [], finishes: [], playtime: [] }
/** stage id -> `{ [checkpoint]: [{ name, ms }] }` */
let splitsByStage = {}
let updatedAt = 0

/**
 * Latest top-10 boards for a room on map `stageId`, as sent to clients:
 * `{ altitude: [{ name, score }], coins, finishes, playtime (minutes)` - global, every
 * map together - `splits: { [checkpoint]: [{ name, ms }] }` (fastest section times on
 * that map), `stage, updatedAt }`.
 */
export function getLeaderboards(stageId) {
  return { ...players, splits: splitsByStage[stageId] || {}, stage: stageId, updatedAt }
}

async function refresh() {
  try {
    // Fold in progress from people still playing here, so the boards aren't a save
    // behind. Other pods do the same for theirs.
    await Promise.all(
      [...activePlayers.values()].map(({ room, client }) => {
        const member = room.members.get(client.sessionId)
        return member ? saveProfile(member.session.profile, member.owner) : null
      }),
    )
    const stages = STAGE_IDS.map(getStage).filter(Boolean)
    const [top, ...splits] = await Promise.all([topPlayers(10), ...stages.map((st) => topSplits(10, st.id, lastCheckpoint(st)))])
    players = top
    splitsByStage = Object.fromEntries(stages.map((st, i) => [st.id, splits[i]]))
    updatedAt = Date.now()
    // Each room gets its own map's split boards.
    for (const room of liveRooms) room.broadcast('leaderboards', getLeaderboards(room.stageId))
  } catch (err) {
    console.error('[leaderboards] refresh failed', err)
  }
}

export function startLeaderboards() {
  refresh()
  const id = setInterval(refresh, REFRESH_MS)
  return () => clearInterval(id)
}
