import { useEffect, useRef, useState } from 'react'

import { useMapProgress } from '../../game/stageRuntime'
import { useGame } from '../../store/game'
import { flatOf } from '../flatFill'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { IS_TOUCH } from '../touch'
import { KEY_LABEL, PANEL_CODES, skipKey } from './hotkeys'
import { buildMenuArt } from './menuArt'
import { KeyHint } from './parts'
import { requestLobby, requestRespawn } from './requests'
import { GRADIENTS } from './style'

/** Each button's face colour (meaningful per button) and the glow of its icon well. */
const PANELS = [
  { id: 'garage', icon: 'garage', label: 'Garage', gradient: GRADIENTS.tealButton, glow: '#9ff6ff' },
  { id: 'spin', icon: 'spin', label: 'Spin', gradient: GRADIENTS.goldButton, glow: '#fff27a' },
  { id: 'store', icon: 'store', label: 'Store', gradient: GRADIENTS.greenButton, glow: '#c8ff8a' },
  { id: 'leaderboards', icon: 'trophy', label: 'Boards', gradient: 'linear-gradient(180deg, #c9a6ff 0%, #8a52f0 50%, #5a2cc0 100%)', glow: '#e2ccff' },
  { id: 'settings', icon: 'gear', label: 'Settings', gradient: 'linear-gradient(180deg, #8fb4ff 0%, #4a78e0 50%, #2a4fb0 100%)', glow: '#cfe0ff' },
]

/**
 * A dock tag: a glossy coloured face in an ink frame with a rivet in each top corner,
 * the icon popping up out of a soft glow well, and the name on a navy plate across the
 * bottom (readable at any size). Its key sits on a keycap at the top-right corner.
 * Hover lifts it and tilts the icon, pressing squashes it, an open panel lights it
 * (white ring + a tab pointing out of the column). All CSS (.hud-mb in index.css).
 */
function MenuButton({ icon, label, gradient, glow, onClick, active, hotkey, warn, art }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hotkey ? `${label} (${hotkey})` : label}
      aria-label={label}
      aria-pressed={active || undefined}
      className="hud-mb pp-btn pointer-events-auto relative"
      data-active={active ? '1' : '0'}
      data-warn={warn ? '1' : '0'}
      data-art={art ? '1' : '0'}
      style={{ '--mb-face': gradient, '--mb-flat': flatOf(gradient), '--mb-glow': glow || '#ffffff', '--mb-art': art ? `url(${art})` : undefined }}
    >
      <span className="hud-mb-face absolute" aria-hidden="true">
        <span className="hud-mb-shine absolute" />
      </span>
      <span className="hud-mb-icon absolute" aria-hidden="true">
        <Icon name={icon} size="100%" />
      </span>
      <span className="hud-mb-plate absolute flex items-center justify-center">
        <StrokeText stroke="0.24em">{label}</StrokeText>
      </span>
      <KeyHint k={hotkey} className="hud-menu-key absolute" />
    </button>
  )
}

/**
 * The painted faces (menuArt.js), once they're ready: until then (or without canvas) the
 * buttons wear their flat colours.
 */
function useMenuArt() {
  const [art, setArt] = useState(null)
  useEffect(() => {
    let alive = true
    buildMenuArt().then((a) => {
      if (alive) setArt(a)
    })
    return () => {
      alive = false
    }
  }, [])
  return art
}

/**
 * Phones: the full dock would cover the road (upright) or run into the nitro bar and the steering
 * pad (short landscape), so a MENU button stands in for it until it is opened.
 */
const COMPACT_QUERY = '(orientation: landscape) and (max-height: 520px), (orientation: portrait) and (max-width: 700px)'

function useCompactMenu() {
  const [compact, setCompact] = useState(() => IS_TOUCH && typeof window !== 'undefined' && window.matchMedia(COMPACT_QUERY).matches)
  useEffect(() => {
    if (!IS_TOUCH) return undefined
    const mq = window.matchMedia(COMPACT_QUERY)
    const on = () => setCompact(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return compact
}

/** The one small button that stands in for the menu until it is opened (compact screens). */
function MenuToggle({ onClick }) {
  return (
    <button type="button" aria-label="Menu" onClick={onClick} className="hud-menu-toggle pp-btn pointer-events-auto">
      <span className="hud-menu-bars" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="pp-stroke hud-menu-toggle-label">MENU</span>
    </button>
  )
}

/**
 * The menu, under the brand card (BrandCorner): a riveted navy dock panel holding the
 * panels' tags in two rows, then
 * Respawn (back to the last checkpoint) and Lobby (back to Pier Zero - asks twice,
 * since it ends the run). Each button wears its keyboard shortcut (hotkeys.js): G garage, P spin, B store, K boards, M settings,
 * R respawn (handled by the car's own controls), L lobby (press twice).
 */
export function MenuBar() {
  const panel = useGame((s) => s.panel)
  const togglePanel = useGame((s) => s.togglePanel)
  const running = useMapProgress().checkpoint > 0
  const [confirmLobby, setConfirmLobby] = useState(false)
  const art = useMenuArt()
  // Compact screens (short landscape phones): a MENU button opens the dock (upright: the usual two columns; landscape: two short rows).
  const compact = useCompactMenu()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!confirmLobby) return undefined
    const id = setTimeout(() => setConfirmLobby(false), 3000)
    return () => clearTimeout(id)
  }, [confirmLobby])

  const onLobby = () => {
    if (running && !confirmLobby) {
      setConfirmLobby(true)
      return
    }
    setConfirmLobby(false)
    requestLobby()
  }
  // The key listener is installed once; it calls whatever onLobby is current.
  const lobbyRef = useRef(onLobby)
  useEffect(() => {
    lobbyRef.current = onLobby
  })

  useEffect(() => {
    const onKey = (e) => {
      if (skipKey(e)) return
      const id = PANEL_CODES[e.code]
      if (id) {
        e.preventDefault()
        useGame.getState().togglePanel(id)
      } else if (e.code === 'KeyL' && !useGame.getState().panel) {
        lobbyRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (compact && !open) return <MenuToggle onClick={() => setOpen(true)} />
  // Choosing something closes the compact menu (Lobby's first tap only asks "Sure?", so it stays).
  const then = (fn) => () => {
    if (compact) setOpen(false)
    fn()
  }
  const lobbyTap = () => {
    const leaving = !(running && !confirmLobby)
    onLobby()
    if (compact && leaving) setOpen(false)
  }

  return (
    <div className="hud-menu pointer-events-none relative flex" data-compact={compact ? '1' : '0'} data-art={art ? '1' : '0'} style={{ gap: 'var(--menu-gap)', '--mb-plate-art': art ? `url(${art.plate})` : undefined }}>
      {compact && (
        <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="hud-menu-close pp-btn pointer-events-auto">
          <i />
        </button>
      )}
      {PANELS.map((p) => (
        <MenuButton key={p.id} {...p} art={art?.faces[p.id]} hotkey={KEY_LABEL[p.id]} active={panel === p.id} onClick={then(() => togglePanel(p.id))} />
      ))}
      <MenuButton icon="respawn" label="Respawn" art={art?.faces.respawn} hotkey={KEY_LABEL.respawn} gradient={GRADIENTS.orangeButton} glow="#ffd29a" onClick={then(requestRespawn)} />
      <MenuButton
        icon="home"
        label={confirmLobby ? 'Sure?' : 'Lobby'}
        hotkey={KEY_LABEL.lobby}
        gradient={confirmLobby ? GRADIENTS.redButton : GRADIENTS.greyButton}
        glow={confirmLobby ? '#ffb0a6' : '#ffffff'}
        warn={confirmLobby}
        art={art?.faces[confirmLobby ? 'lobbyWarn' : 'lobby']}
        onClick={lobbyTap}
      />
    </div>
  )
}

export default MenuBar
