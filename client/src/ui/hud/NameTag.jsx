import { carById, RARITY_INFO } from '@shared/cars'
import { chapterTitle } from '@shared/chapters'
import { useMapProgress, useStageInfo } from '../../game/stageRuntime'
import { useGame } from '../../store/game'
import Icon from '../Icon'
import CarThumb from '../panels/CarThumb'

/**
 * Your name tag, top right over the altitude readout: an avatar disc showing your
 * equipped car (its rendered portrait once ready), your name, the car's name with its
 * rarity colour, and a flag chip with the furthest checkpoint you've reached. Click it
 * for the garage. Re-renders only when the profile's name / car / best change.
 */
export function NameTag() {
  const name = useGame((s) => s.profile.name || 'Player')
  const carId = useGame((s) => s.profile.car)
  const best = useMapProgress().best.checkpoint
  const total = useGame((s) => (s.stage ? s.stage.checkpoints.length - 1 : 0))
  const map = useStageInfo()
  const togglePanel = useGame((s) => s.togglePanel)
  const car = carById(carId)
  const rarity = RARITY_INFO[car.rarity] || RARITY_INFO.common
  const done = total > 0 && best >= total

  return (
    <button
      type="button"
      className="hud-tag pp-btn pointer-events-auto relative flex items-center"
      onClick={() => togglePanel('garage')}
      title={`${name} - ${car.name} (open the garage)`}
      style={{ '--rarity': rarity.color }}
    >
      <span className="hud-tag-stripe absolute" aria-hidden="true" />
      <span className="hud-tag-avatar relative flex shrink-0 items-center justify-center">
        <CarThumb carId={car.id} size="86%" />
      </span>
      <span className="hud-tag-text flex min-w-0 flex-col">
        <span className="hud-tag-name pp-stroke truncate">{name}</span>
        <span className="hud-tag-map pp-stroke truncate" style={{ color: map?.color }}>
          {map ? chapterTitle(map.id) : ''}
        </span>
        <span className="hud-tag-car flex min-w-0 items-center">
          <span className="hud-tag-gem shrink-0" aria-hidden="true" />
          <span className="pp-stroke truncate">{car.name}</span>
        </span>
      </span>
      <span className="hud-tag-best pp-stroke flex shrink-0 items-center tabular-nums" data-done={done ? '1' : '0'} title={`Furthest checkpoint reached on ${map?.name || 'this map'}`}>
        <Icon name="flag" size="1.3em" />
        {done ? 'TOP' : total ? `${best}/${total}` : '-'}
      </span>
    </button>
  )
}

export default NameTag
