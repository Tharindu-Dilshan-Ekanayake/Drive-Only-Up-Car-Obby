import { RARITY_INFO } from '@shared/cars'

import StrokeText from '../StrokeText'
import { RARITY_GRADIENT, u } from '../hud/style'

/** A rarity's coloured label: COMMON, RARE, EPIC, LEGENDARY, MYTHIC. */
export function RarityTag({ rarity, size = 22 }) {
  return (
    <span
      className="inline-flex items-center"
      style={{ padding: `${u(3)} ${u(12)}`, borderRadius: u(10), background: RARITY_GRADIENT[rarity], border: `${u(3)} solid #0d1530`, fontSize: u(size) }}
    >
      <StrokeText stroke={u(size * 0.22)}>{RARITY_INFO[rarity]?.label.toUpperCase() || rarity}</StrokeText>
    </span>
  )
}

export default RarityTag
