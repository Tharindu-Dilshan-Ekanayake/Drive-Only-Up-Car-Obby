import { useState } from 'react'

import { useGame } from '../../store/game'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { ChunkyButton } from '../hud/parts'
import { formatCoins, GRADIENTS, u } from '../hud/style'
import Panel, { Well } from './Panel'

const BOARDS = [
  { id: 'altitude', label: 'Highest', icon: 'up', unit: (v) => `${formatCoins(v)} m` },
  { id: 'coins', label: 'Coins', icon: 'coin', unit: (v) => formatCoins(v) },
  { id: 'finishes', label: 'Finishes', icon: 'flag', unit: (v) => formatCoins(v) },
  { id: 'playtime', label: 'Playtime', icon: 'respawn', unit: (v) => `${formatCoins(v)} min` },
]

const MEDALS = [
  'radial-gradient(circle at 35% 30%, #fff6b0 0%, #ffcf2e 45%, #e08a00 100%)',
  'radial-gradient(circle at 35% 30%, #ffffff 0%, #d8dde2 45%, #8f9aa6 100%)',
  'radial-gradient(circle at 35% 30%, #ffd9b0 0%, #e0904a 50%, #a8551c 100%)',
]

/** Top players on four boards (store.leaderboards, refreshed by the server). */
export function LeaderboardsPanel() {
  const boards = useGame((s) => s.leaderboards)
  const myName = useGame((s) => s.profile.name)
  const [tab, setTab] = useState('altitude')
  const board = BOARDS.find((b) => b.id === tab)
  const rows = Array.isArray(boards?.[tab]) ? boards[tab] : []

  return (
    <Panel title="LEADERBOARDS" icon="trophy" width={900}>
      <div className="pp-tabs flex flex-wrap" style={{ gap: u(8), marginBottom: u(16), padding: u(8), borderRadius: u(22) }}>
        {BOARDS.map((b) => (
          <ChunkyButton
            key={b.id}
            onClick={() => setTab(b.id)}
            gradient={tab === b.id ? GRADIENTS.goldButton : GRADIENTS.navyButton}
            radius={16}
            className={tab === b.id ? 'pp-tab-on' : ''}
            style={{ height: u(66), padding: `0 ${u(18)}`, gap: u(8), flex: '1 1 auto' }}
          >
            <Icon name={b.icon} size={u(40)} />
            <span style={{ fontSize: u(26) }}>
              <StrokeText stroke={u(6)}>{b.label}</StrokeText>
            </span>
          </ChunkyButton>
        ))}
      </div>
      <Well style={{ padding: u(10) }}>
        {rows.length === 0 && (
          <div className="pp-stroke flex flex-col items-center text-center" style={{ fontSize: u(26), padding: u(30), gap: u(12), opacity: 0.85 }}>
            <Icon name="trophy" size={u(90)} style={{ opacity: 0.6 }} />
            {boards ? 'Nobody on this board yet - be the first!' : 'Loading the boards…'}
          </div>
        )}
        <div className="flex flex-col" style={{ gap: u(6) }}>
          {rows.slice(0, 10).map((row, i) => {
            const me = row.name === myName
            const top = i < 3
            return (
              <div
                key={`${tab}-${row.name}-${i}`}
                className="pp-lb-row flex items-center"
                data-me={me ? '1' : '0'}
                data-top={top ? String(i + 1) : '0'}
                style={{ gap: u(14), padding: `${u(top ? 10 : 7)} ${u(14)} ${u(top ? 10 : 7)} ${u(10)}`, borderRadius: u(14), ['--i']: i }}
              >
                <span
                  className="pp-stroke flex shrink-0 items-center justify-center rounded-full"
                  style={{
                    width: u(top ? 52 : 44),
                    height: u(top ? 52 : 44),
                    fontSize: u(top ? 26 : 22),
                    background: MEDALS[i] || 'rgba(255,255,255,0.1)',
                    border: `${u(3)} solid #0d1530`,
                    boxShadow: top ? `0 ${u(3)} 0 #0d1530, inset 0 ${u(-3)} 0 rgba(0,0,0,0.2)` : 'none',
                  }}
                >
                  {i + 1}
                </span>
                <span className="pp-stroke min-w-0 flex-1 truncate" style={{ fontSize: u(top ? 30 : 26) }}>
                  {row.name || 'Player'}
                </span>
                {me && (
                  <span className="pp-you-tag pp-stroke shrink-0" style={{ fontSize: u(16) }}>
                    YOU
                  </span>
                )}
                <span className="pp-stroke shrink-0 tabular-nums" style={{ fontSize: u(top ? 30 : 26), color: '#ffc41f' }}>
                  {board.unit(Number(row.score) || 0)}
                </span>
              </div>
            )
          })}
        </div>
      </Well>
    </Panel>
  )
}

export default LeaderboardsPanel
