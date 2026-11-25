import { useEffect, useState } from 'react'

import { isMuted, onMutedChange, setMuted } from '../../audio/sfx'
import { actions } from '../../net/actions'
import { useGame } from '../../store/game'
import { QUALITY_LEVELS, useQuality } from '../../store/quality'
import { IS_TOUCH } from '../touch'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { ChunkyButton, Keycap, SectionLabel } from '../hud/parts'
import { GRADIENTS, u } from '../hud/style'
import Panel, { Well } from './Panel'

const QUALITY_HELP = {
  LOW: 'Smoothest on phones: no shadows or particles.',
  MEDIUM: 'Particles, smoke and sharper edges.',
  HIGH: 'Real shadows and the longest view.',
}

const KEYS = [
  ['W / Up', 'Gas'],
  ['S / Down', 'Brake, reverse'],
  ['A D / Left Right', 'Steer'],
  ['Shift', 'Nitro'],
  ['Space', 'Handbrake / drift'],
  ['Q E F / 1 2 3', 'Use item slot 1 / 2 / 3'],
  ['H', 'Horn'],
  ['R', 'Back to last checkpoint'],
  ['G', 'Garage'],
  ['P', 'Car spin'],
  ['B', 'Store'],
  ['K', 'Leaderboards'],
  ['M', 'Settings'],
  ['L', 'Back to the lobby (press twice)'],
  ['Esc', 'Close a panel'],
  ['In the air', 'S backflip, Space+W frontflip, Space+A/D barrel roll, A/D spin'],
]

const TOUCH = [
  ['Left pad', 'Steer (slide your thumb)'],
  ['GAS / BRAKE', 'Drive, hold brake to reverse'],
  ['NITRO', 'Boost'],
  ['Item buttons', 'Use what you picked up'],
]

function Row({ icon, label, children }) {
  return (
    <Well className="flex flex-wrap items-center justify-between" style={{ gap: u(12) }}>
      <span className="flex items-center" style={{ gap: u(14) }}>
        <span className="pp-halo flex shrink-0 items-center justify-center" style={{ width: u(70), height: u(70) }}>
          <Icon name={icon} size={u(48)} />
        </span>
        <span style={{ fontSize: u(32) }}>
          <StrokeText stroke={u(7)}>{label}</StrokeText>
        </span>
      </span>
      <span className="flex flex-wrap" style={{ gap: u(10) }}>
        {children}
      </span>
    </Well>
  )
}

/** An on/off switch: a recessed track with a chunky knob that slides across. */
function Toggle({ on, onClick, labels = ['ON', 'OFF'] }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className="pp-btn pp-switch pointer-events-auto relative flex items-center"
      data-on={on ? '1' : '0'}
      style={{ width: u(150), height: u(66), borderRadius: u(33), border: `${u(4)} solid #0d1530` }}
    >
      <span className="pp-switch-label pp-stroke absolute" style={{ fontSize: u(24) }}>
        {on ? labels[0] : labels[1]}
      </span>
      <span className="pp-switch-knob absolute" style={{ width: u(50), height: u(50), top: u(4), left: u(4) }} />
    </button>
  )
}

/** Settings: graphics quality, sound, music and the controls. */
export function SettingsPanel() {
  const level = useQuality((s) => s.level)
  const setLevel = useQuality((s) => s.setLevel)
  const music = useGame((s) => s.profile.settings?.music !== false)
  const ghost = useGame((s) => s.profile.settings?.ghost !== false)
  const sunset = useGame((s) => s.profile.settings?.sunset !== false)
  const [muted, setMutedState] = useState(isMuted)

  useEffect(() => onMutedChange(setMutedState), [])

  return (
    <Panel title="SETTINGS" icon="gear" width={960}>
      <div className="flex flex-col" style={{ gap: u(14) }}>
        <Row icon="car" label="Graphics">
          <span className="pp-tabs flex" style={{ gap: u(6), padding: u(6), borderRadius: u(20) }}>
          {QUALITY_LEVELS.map((q) => (
            <ChunkyButton
              key={q}
              onClick={() => setLevel(q)}
              gradient={q === level ? GRADIENTS.goldButton : GRADIENTS.navyButton}
              radius={14}
              title={QUALITY_HELP[q]}
              className={q === level ? 'pp-tab-on' : ''}
              style={{ height: u(60), padding: `0 ${u(18)}` }}
            >
              <span style={{ fontSize: u(24) }}>
                <StrokeText stroke={u(6)}>{q}</StrokeText>
              </span>
            </ChunkyButton>
          ))}
          </span>
        </Row>
        <span className="pp-stroke flex items-center" style={{ fontSize: u(20), color: '#c4ecff', padding: `0 ${u(10)}`, gap: u(8), marginTop: u(-4), whiteSpace: 'normal', lineHeight: 1.3 }}>
          <Icon name="info" size={u(26)} />
          {QUALITY_HELP[level]}
        </span>
        <Row icon={muted ? 'soundOff' : 'sound'} label="Sound">
          <Toggle on={!muted} onClick={() => setMuted(!muted)} />
        </Row>
        <Row icon="music" label="Music">
          <Toggle on={music} onClick={() => actions.setSetting('music', !music)} />
        </Row>
        <Row icon="sunset" label="Golden hour">
          <Toggle on={sunset} onClick={() => actions.setSetting('sunset', !sunset)} />
        </Row>
        <Row icon="flag" label="Ghost">
          <Toggle on={ghost} onClick={() => actions.setSetting('ghost', !ghost)} />
        </Row>
        <Well>
          <SectionLabel>CONTROLS</SectionLabel>
          <div className="grid items-center" style={{ gridTemplateColumns: 'auto 1fr', columnGap: u(20), rowGap: u(10) }}>
            {(IS_TOUCH ? TOUCH : KEYS).map(([key, what]) => (
              <span key={key} className="contents">
                <span className="flex flex-wrap" style={{ gap: u(6) }}>
                  {key.split(' / ').map((k) => (
                    <Keycap key={k} size={18}>
                      {k}
                    </Keycap>
                  ))}
                </span>
                <span className="pp-stroke" style={{ fontSize: u(21), whiteSpace: 'normal', lineHeight: 1.3 }}>
                  {what}
                </span>
              </span>
            ))}
          </div>
        </Well>
      </div>
    </Panel>
  )
}

export default SettingsPanel
