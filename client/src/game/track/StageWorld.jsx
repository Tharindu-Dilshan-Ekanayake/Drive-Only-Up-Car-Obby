import { Suspense } from 'react'

import { stageInfo } from '@shared/stages/index'

import Bots from '../bots/Bots'
import { Stagger, WarmHold } from '../StageWarmup'
import CheckpointBoards from '../world/CheckpointBoards'
// (explicit index: on Windows '../world/scenery' would resolve to Scenery.jsx)
import { StageScenery } from '../world/scenery/index'
import ExitPortal from './ExitPortal'
import Stage from './Stage'

/**
 * Everything that belongs to one map's stage, as one lazy chunk mounted once the stage
 * is built (GameScene keys it by stage id): the track itself (Stage: meshes, colliders,
 * obstacles, coins, adventure), the finish plaza's exit portal to the next chapter, its best-time boards, the CPU racers riding its path,
 * and the map's scenery generator (theme.scenery). Travelling unmounts all of it, and
 * each part frees its GPU resources and physics bodies on unmount.
 */
export default function StageWorld({ stage }) {
  const info = stageInfo(stage.id)
  // A part per frame (each builds its meshes as it mounts: no long frame in the lobby);
  // WarmHold: the GPU warm-up waits for the scenery chunk.
  return (
    <Stagger>
      <Stage stage={stage} />
      {stage.exitPortal && <ExitPortal portal={stage.exitPortal} />}
      <CheckpointBoards stage={stage} />
      <Bots stage={stage} />
      <Suspense fallback={<WarmHold />}>
        <StageScenery stage={stage} info={info} />
      </Suspense>
    </Stagger>
  )
}
