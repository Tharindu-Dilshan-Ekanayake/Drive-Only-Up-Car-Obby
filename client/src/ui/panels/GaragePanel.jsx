import { useState } from 'react'

import { carById, CARS, RARITIES, RARITY_INFO } from '@shared/cars'

import { sfx } from '../../audio/sfx'
import { actions } from '../../net/actions'
import { useGame } from '../../store/game'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { ChunkyButton } from '../hud/parts'
import { GRADIENTS, RARITY_GRADIENT, u } from '../hud/style'
import CarThumb from './CarThumb'
import RarityTag from './RarityTag'
import Panel, { Well } from './Panel'

const STATS = [
  ['speed', 'Top speed'],
  ['accel', 'Acceleration'],
  ['handling', 'Handling'],
  ['weight', 'Weight'],
  ['nitro', 'Nitro tank'],
  ['boost', 'Nitro power'],
]
/** Stats run 60-140; 100 is the starter's baseline. */
const STAT_MIN = 60
const STAT_MAX = 140

/** Cars grouped by rarity, commons first. */
const SORTED = [...CARS].sort((a, b) => RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity))
/**
 * Side by side (md and up) the car grid and the details each scroll on their own, capped
 * to the room the panel has (viewport minus its header, borders and padding), so the
 * selected car's stats and DRIVE IT stay in view however many cars there are.
 */
const COLUMN = 'md:max-h-[calc(100dvh_-_24px_-_var(--px)*176)] md:overflow-y-auto'
const THIN_SCROLL = { scrollbarWidth: 'thin', scrollbarColor: 'rgba(159, 233, 255, 0.4) transparent' }

function StatBar({ label, value, compare }) {
  const at = (v) => Math.max(0.04, Math.min(1, (v - STAT_MIN) / (STAT_MAX - STAT_MIN)))
  const better = compare != null && value > compare
  const worse = compare != null && value < compare
  return (
    <div className="flex items-center" style={{ gap: u(12) }}>
      <span className="pp-stroke shrink-0" style={{ width: u(190), fontSize: u(22) }}>
        {label}
      </span>
      <div className="pp-bar relative flex-1 overflow-hidden" style={{ height: u(22), borderRadius: u(11) }}>
        <div
          className="pp-bar-fill absolute inset-y-0 left-0"
          data-tone={better ? 'up' : worse ? 'down' : 'base'}
          style={{ width: `${at(value) * 100}%`, borderRadius: u(9) }}
        />
        {/* The baseline car's 100, for reference. */}
        <div className="absolute inset-y-0" style={{ left: `${at(100) * 100}%`, width: u(3), background: 'rgba(255,255,255,0.75)', boxShadow: `0 0 0 ${u(1)} rgba(13,21,48,0.6)` }} />
      </div>
      <span className="pp-stroke shrink-0 text-right tabular-nums" style={{ width: u(54), fontSize: u(22), color: better ? '#7cf25a' : worse ? '#ffa27a' : '#ffffff' }}>
        {value}
      </span>
    </div>
  )
}

/**
 * Garage: every car, the ones you own in colour (pick one to drive), the rest as
 * mystery silhouettes you can win from the Car Spin. Stat bars compare the selected car
 * with the one you drive.
 */
export function GaragePanel() {
  const owned = useGame((s) => s.profile.cars || [])
  const equipped = useGame((s) => s.profile.car)
  const openPanel = useGame((s) => s.openPanel)
  const [selected, setSelected] = useState(equipped)
  const car = carById(selected)
  const isOwned = owned.includes(car.id)
  const current = carById(equipped)

  return (
    <Panel title="GARAGE" icon="garage" width={1240}>
      <div className="flex flex-col md:flex-row" style={{ gap: u(20) }}>
        <div className={`grid flex-1 content-start ${COLUMN}`} style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${u(150)}, 1fr))`, gap: u(14), padding: `${u(12)} ${u(10)} ${u(4)} 0`, ...THIN_SCROLL }}>
          {SORTED.map((c) => {
            const has = owned.includes(c.id)
            const isSel = c.id === selected
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelected(c.id)}
                className="pp-btn pp-tile relative flex flex-col items-center"
                data-owned={has ? '1' : '0'}
                data-selected={isSel ? '1' : '0'}
                style={{
                  ['--rarity']: RARITY_INFO[c.rarity]?.color || '#b8c4cf',
                  padding: `${u(8)} ${u(6)} ${u(6)}`,
                  borderRadius: u(18),
                  background: has ? RARITY_GRADIENT[c.rarity] : undefined,
                  border: `${u(4)} solid #0d1530`,
                }}
              >
                <CarThumb carId={c.id} hidden={!has} size={u(116)} />
                <span className="pp-tile-name max-w-full truncate" style={{ fontSize: u(19) }}>
                  <StrokeText stroke={u(5)}>{has ? c.name : '???'}</StrokeText>
                </span>
                {c.id === equipped && (
                  <span className="pp-tile-badge pp-stroke absolute" style={{ top: u(-10), right: u(-6), fontSize: u(15) }}>
                    DRIVING
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <Well className={`flex w-full shrink-0 flex-col items-center md:w-[calc(var(--px)*470)] ${COLUMN}`} style={{ gap: u(10), ...THIN_SCROLL }}>
          <div className="pp-podium relative flex w-full items-center justify-center" style={{ ['--rarity']: RARITY_INFO[car.rarity]?.color || '#b8c4cf', height: u(250) }}>
            <CarThumb key={car.id} carId={car.id} hidden={!isOwned} size={u(250)} style={{ position: 'relative' }} />
          </div>
          <RarityTag rarity={car.rarity} />
          <span style={{ fontSize: u(42) }}>
            <StrokeText stroke={u(9)}>{isOwned ? car.name : 'Mystery car'}</StrokeText>
          </span>
          <span className="pp-stroke text-center" style={{ fontSize: u(20), whiteSpace: 'normal', lineHeight: 1.3, display: 'block', opacity: 0.9 }}>
            {isOwned ? car.blurb : `A ${RARITY_INFO[car.rarity].label} car. Win it from the Car Spin!`}
          </span>
          <div className="flex w-full flex-col" style={{ gap: u(8), marginTop: u(6) }}>
            {STATS.map(([key, label]) => (
              <StatBar key={key} label={label} value={isOwned ? car.stats[key] : 100} compare={isOwned && car.id !== current.id ? current.stats[key] : null} />
            ))}
          </div>
          {isOwned && car.id === equipped && (
            <span className="pp-stroke flex items-center" style={{ fontSize: u(28), color: '#7cf25a', marginTop: u(8), gap: u(8) }}>
              <Icon name="check" size={u(36)} />
              DRIVING THIS ONE
            </span>
          )}
          {isOwned && car.id !== equipped && (
            <ChunkyButton
              gradient={GRADIENTS.greenButton}
              radius={18}
              border={5}
              ready
              style={{ height: u(84), padding: `0 ${u(40)}`, marginTop: u(8) }}
              onClick={() => {
                sfx.buy()
                actions.equipCar(car.id)
              }}
            >
              <span style={{ fontSize: u(36) }}>
                <StrokeText stroke={u(8)}>DRIVE IT</StrokeText>
              </span>
            </ChunkyButton>
          )}
          {!isOwned && (
            <ChunkyButton gradient={GRADIENTS.goldButton} radius={18} border={5} style={{ height: u(84), padding: `0 ${u(40)}`, marginTop: u(8) }} onClick={() => openPanel('spin')}>
              <span style={{ fontSize: u(34) }}>
                <StrokeText stroke={u(8)}>GO TO CAR SPIN</StrokeText>
              </span>
            </ChunkyButton>
          )}
          <div className="flex w-full items-center" style={{ gap: u(10), marginTop: u(6) }}>
            <span className="pp-stroke shrink-0" style={{ fontSize: u(18), color: '#9fe9ff' }}>
              COLLECTED
            </span>
            <div className="pp-bar relative flex-1 overflow-hidden" style={{ height: u(16), borderRadius: u(8) }}>
              <div className="pp-bar-fill absolute inset-y-0 left-0" data-tone="gold" style={{ width: `${(owned.length / CARS.length) * 100}%`, borderRadius: u(6) }} />
            </div>
            <span className="pp-stroke shrink-0 tabular-nums" style={{ fontSize: u(18) }}>
              {`${owned.length} / ${CARS.length}`}
            </span>
          </div>
        </Well>
      </div>
    </Panel>
  )
}

export default GaragePanel
