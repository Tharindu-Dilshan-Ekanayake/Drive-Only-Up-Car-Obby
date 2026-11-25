import { DEFAULT_STAGE, stageInfo } from '@shared/stages/index'

import { useGame } from '../../store/game'
import { SKY_THEMES } from '../palette'

/**
 * The current sky (palette.js SKY_THEMES): the current map's `theme.sky`. Sky Docks
 * follows Settings > Golden hour (golden hour unless turned off: midday).
 */
export const useSkyTheme = () =>
  useGame((s) => {
    if (s.stageId === DEFAULT_STAGE) return s.profile.settings?.sunset === false ? SKY_THEMES.midday : SKY_THEMES.golden
    return SKY_THEMES[stageInfo(s.stageId)?.theme?.sky] || SKY_THEMES.golden
  })
