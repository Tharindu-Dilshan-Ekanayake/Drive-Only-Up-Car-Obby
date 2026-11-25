import { memo } from 'react'

import { carById, RARITY_INFO } from '@shared/cars'

import { useCarIcon } from '../../game/cars/carIcons'

/**
 * A car's picture: its rendered thumbnail (carIcons.js) when ready, otherwise a car
 * silhouette in its colours. `hidden` (not owned) draws a dark mystery silhouette in
 * the rarity's colour instead.
 */
export const CarThumb = memo(function CarThumb({ carId, size = '100%', hidden = false, style }) {
  const car = carById(carId)
  const icon = useCarIcon(carId)
  const rarityColor = RARITY_INFO[car.rarity]?.color || '#b8c4cf'
  const box = { width: size, height: size, ...style }

  if (icon && !hidden) {
    return <img src={icon} alt={car.name} draggable={false} className="pointer-events-none select-none object-contain" style={box} />
  }
  if (icon && hidden) {
    // The real shape, blacked out.
    return (
      <img
        src={icon}
        alt="Locked car"
        draggable={false}
        className="pointer-events-none select-none object-contain"
        style={{ ...box, filter: `brightness(0) drop-shadow(0 0 6px ${rarityColor})`, opacity: 0.85 }}
      />
    )
  }
  const body = hidden ? '#1b2338' : car.colors.body
  const trim = hidden ? '#1b2338' : car.colors.trim
  const glass = hidden ? '#2a3555' : car.colors.glass
  return (
    <svg viewBox="0 0 100 70" style={box} aria-label={hidden ? 'Locked car' : car.name}>
      <path d="M8 50V38l10-4 12-16h34l14 16 12 4v12z" fill={body} stroke={hidden ? rarityColor : '#0d1530'} strokeWidth="4" strokeLinejoin="round" />
      <path d="M36 22h12v12H28zM54 22h8l10 12H54z" fill={glass} stroke="#0d1530" strokeWidth="3" strokeLinejoin="round" />
      <path d="M8 44h84" stroke={trim} strokeWidth="5" />
      <circle cx="28" cy="52" r="10" fill="#2b2f36" stroke="#0d1530" strokeWidth="4" />
      <circle cx="72" cy="52" r="10" fill="#2b2f36" stroke="#0d1530" strokeWidth="4" />
      {hidden && (
        <text x="50" y="36" textAnchor="middle" fontSize="22" fontFamily="'Fredoka One', sans-serif" fill={rarityColor}>
          ?
        </text>
      )}
    </svg>
  )
})

export default CarThumb
