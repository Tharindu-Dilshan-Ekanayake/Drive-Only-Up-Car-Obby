import { useEffect, useRef } from 'react'

import { useMapProgress } from '../../game/stageRuntime'
import { runtime } from '../../game/runtime'
import { getGame, useGame } from '../../store/game'
import Icon from '../Icon'
import CarThumb from '../panels/CarThumb'
import { card, ordinalSuffix, u } from './style'
import { replayClass, setData, setStyle, setText, useLive } from './useLive'

/** Racer markers in the pool: you are drawn separately, these are everyone else. */
const MAX_DOTS = 12
const MAX_OTHERS = MAX_DOTS - 1
/** Only the racers nearest you on the stage get a name tag (keeps the rail tidy). */
const NAME_TAGS = 3
const NO_PIPS = []
const pipCache = new WeakMap()
/** Checkpoint pips along the rail for `stage`, as 0..1 from the bottom (Start and the finish excluded). */
function pipsOf(stage) {
  if (!stage) return NO_PIPS
  let pips = pipCache.get(stage)
  if (!pips) {
    const length = stage.length || 1
    pips = stage.checkpoints.slice(1).filter((c) => !c.finish).map((c) => ({ index: c.index, at: c.s / length }))
    pipCache.set(stage, pips)
  }
  return pips
}

/** Label rows (px) that may sit this close before the lower-priority one hides. */
const LABEL_GAP_PX = 16
/** Scratch list of label positions placed this frame (reused, no per-frame garbage). */
const placed = []
/** Scratch: indices into runtime.racers of the nearest others, nearest first. */
const nearest = [-1, -1, -1]
const nearGap = [0, 0, 0]

/** True if a label at rail fraction `at` would collide with one already placed. */
function crowded(at, gap) {
  for (let i = 0; i < placed.length; i += 1) if (Math.abs(placed[i] - at) < gap) return true
  return false
}

/** Fills `nearest` with the NAME_TAGS racers (index >= 1) closest to `progress`. */
function findNearest(racers, progress) {
  for (let k = 0; k < NAME_TAGS; k += 1) {
    nearest[k] = -1
    nearGap[k] = Infinity
  }
  for (let i = 1; i < racers.length && i <= MAX_OTHERS; i += 1) {
    const g = Math.abs(racers[i].progress - progress)
    for (let k = 0; k < NAME_TAGS; k += 1) {
      if (g < nearGap[k]) {
        for (let m = NAME_TAGS - 1; m > k; m -= 1) {
          nearest[m] = nearest[m - 1]
          nearGap[m] = nearGap[m - 1]
        }
        nearest[k] = i
        nearGap[k] = g
        break
      }
    }
  }
}

const lift = (p) => `translateY(calc(var(--rail) * ${(-Math.min(1, Math.max(0, p))).toFixed(4)}))`

/**
 * Right edge: your altitude, big (with your best under it) and your race position
 * ("2nd / 6", once there's someone to race), over the climbing rail: a glossy navy tube
 * between a START cap and a hazard-striped finish cap with the chequered flag, a gold
 * pip per checkpoint (numbered every 5th, lit once reached), a gold-to-teal fill up to
 * you, your car on a glowing disc with your altitude beside it, and a small coloured
 * dot per other racer - name tags only for the few nearest you.
 * Racers come from runtime.racers ([0] is you); the markers are a fixed pool of DOM
 * nodes moved by transform from the shared live loop.
 */
export function AltitudeRail() {
  const altRef = useRef(null)
  const fillRef = useRef(null)
  const dotRefs = useRef([])
  const pipRefs = useRef([])
  const youRef = useRef(null)
  const youAltRef = useRef(null)
  const lastCp = useRef(-1)
  const lastPips = useRef(null)
  const rankRef = useRef(null)
  const rankNumRef = useRef(null)
  const rankSufRef = useRef(null)
  const rankOfRef = useRef(null)
  // Last rank the badge showed (0 = hidden), for the pop when you overtake.
  const lastRank = useRef(0)
  const railRef = useRef(null)
  // The rail's height in px (ResizeObserver), so labels can be spaced without reading
  // layout inside the live loop.
  const railPx = useRef(400)

  useEffect(() => {
    const el = railRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(() => {
      railPx.current = el.clientHeight || railPx.current
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // Your best on this map, and its checkpoints (re-rendered when you travel).
  const bestAltitude = useMapProgress().best.altitude
  const stage = useGame((s) => s.stage)
  const PIPS = pipsOf(stage)
  const carId = useGame((s) => s.profile.car)
  const bestAt = Math.min(1, bestAltitude / (stage?.maxAltitude || 1))

  useLive(() => {
    setText(altRef.current, String(Math.max(0, Math.round(runtime.car.altitude))))
    setStyle(fillRef.current, 'transform', `scaleY(${Math.min(1, Math.max(0, runtime.race.progress)).toFixed(4)})`)

    // Race position: "2nd / 6", popping when you move up a place.
    const rank = Math.round(runtime.race.rank) || 0
    const count = Math.round(runtime.race.racerCount) || 0
    const showRank = count > 1 && rank > 0
    setStyle(rankRef.current, 'display', showRank ? 'flex' : 'none')
    if (showRank) {
      setText(rankNumRef.current, String(rank))
      setText(rankSufRef.current, ordinalSuffix(rank))
      setText(rankOfRef.current, `/ ${count}`)
      setData(rankRef.current, 'place', rank <= 3 ? String(rank) : 'n')
      if (lastRank.current && rank < lastRank.current) replayClass(rankRef.current, 'hud-rank-pop')
    }
    lastRank.current = showRank ? rank : 0
    // Checkpoint pips: lit up to the last one reached (only rewritten when it changes).
    const cp = runtime.race.checkpoint
    const pips = pipsOf(getGame().stage)
    if (cp !== lastCp.current || pips !== lastPips.current) {
      lastCp.current = cp
      lastPips.current = pips
      for (let i = 0; i < pips.length; i += 1) setData(pipRefs.current[i], 'reached', pips[i].index <= cp ? '1' : '0')
    }

    const racers = runtime.racers
    const youProgress = racers[0]?.you ? racers[0].progress : runtime.race.progress
    setStyle(youRef.current, 'transform', lift(youProgress))
    setText(youAltRef.current, `${Math.max(0, Math.round(runtime.car.altitude))} m`)

    // Name tags: only the nearest few, and only where they don't overlap your chip or
    // a tag already placed.
    findNearest(racers, youProgress)
    const gap = LABEL_GAP_PX / Math.max(40, railPx.current)
    placed.length = 0
    placed.push(youProgress)
    for (let i = 0; i < MAX_OTHERS; i += 1) {
      const el = dotRefs.current[i]
      if (!el) continue
      const r = racers[i + 1]
      if (!r) {
        setStyle(el, 'display', 'none')
        continue
      }
      setStyle(el, 'display', 'flex')
      setStyle(el, 'transform', lift(r.progress))
      const dot = el.firstChild
      const tag = el.lastChild
      setStyle(dot, 'background', r.color || '#fff')
      let show = false
      for (let k = 0; k < NAME_TAGS; k += 1) if (nearest[k] === i + 1) show = true
      if (show && !crowded(r.progress, gap)) placed.push(r.progress)
      else show = false
      if (show) {
        setText(tag, `${r.bot ? 'CPU ' : ''}${r.name || ''}`)
        setStyle(tag, 'borderColor', r.color || '#0d1530')
      }
      setStyle(tag, 'display', show ? 'block' : 'none')
    }
  })

  return (
    <div className="hud-alt pointer-events-none relative flex flex-col items-end" style={{ gap: u(10) }}>
      <div className="flex flex-col items-end" style={{ ...card(14), padding: `${u(5)} ${u(13)} ${u(7)}` }}>
        <span className="flex items-center" style={{ fontSize: u(15), gap: u(5), color: '#ffc41f' }}>
          <Icon name="up" size={u(17)} />
          <span className="pp-stroke">ALTITUDE</span>
        </span>
        <span className="flex items-baseline leading-none" style={{ gap: u(4) }}>
          <span ref={altRef} className="hud-alt-num pp-stroke tabular-nums" style={{ fontSize: u(64) }}>
            0
          </span>
          <span className="pp-stroke" style={{ fontSize: u(28), color: '#ffc41f' }}>
            m
          </span>
        </span>
        {bestAltitude > 0 && (
          <span className="hud-alt-best pp-stroke tabular-nums" style={{ fontSize: u(13), marginTop: u(1) }}>
            {`BEST ${Math.round(bestAltitude)} m`}
          </span>
        )}
        <div ref={rankRef} className="hud-rank items-center justify-end self-stretch" style={{ display: 'none', gap: u(6), marginTop: u(3), paddingTop: u(4), borderTop: `${u(2)} solid rgba(255,255,255,0.14)` }}>
          <Icon name="flag" size={u(27)} />
          <span className="hud-rank-pos pp-stroke flex items-baseline leading-none">
            <span ref={rankNumRef} className="tabular-nums" style={{ fontSize: u(33) }}>
              1
            </span>
            <span ref={rankSufRef} style={{ fontSize: u(17) }}>
              st
            </span>
          </span>
          <span ref={rankOfRef} className="pp-stroke tabular-nums" style={{ fontSize: u(18), color: '#9fb0d6' }}>
            / 1
          </span>
        </div>
      </div>

      <div className="hud-rail relative">
        {/* Finish: a hazard-striped cap and the chequered flag on top of the tube. */}
        <div className="hud-rail-finish absolute flex flex-col items-center">
          <Icon name="flag" className="hud-rail-flag" size={u(30)} />
          <span className="hud-rail-cap" />
        </div>
        <div ref={railRef} className="hud-rail-tube absolute overflow-hidden">
          <div ref={fillRef} className="hud-rail-fill absolute inset-0" />
          <span className="hud-rail-gloss absolute" />
        </div>
        <span className="hud-rail-start pp-stroke absolute">START</span>

        {/* Everything placed along the tube lives in the lane (same box, not clipped). */}
        <div className="hud-rail-lane absolute">
          {PIPS.map((p, i) => (
            <span
              key={p.index}
              ref={(el) => {
                pipRefs.current[i] = el
              }}
              className="hud-rail-pip absolute"
              data-reached="0"
              data-major={p.index % 5 === 0 ? '1' : '0'}
              style={{ bottom: `${(p.at * 100).toFixed(2)}%` }}
            >
              {p.index % 5 === 0 && <span className="hud-rail-pipnum hud-rail-label pp-stroke absolute">{p.index}</span>}
            </span>
          ))}

          {bestAltitude > 0 && (
            <span className="hud-rail-best hud-rail-label pp-stroke absolute" style={{ bottom: `${(bestAt * 100).toFixed(2)}%` }}>
              BEST
            </span>
          )}

          {Array.from({ length: MAX_OTHERS }, (_, i) => (
            <div
              key={i}
              ref={(el) => {
                dotRefs.current[i] = el
              }}
              className="hud-rail-mark absolute items-center"
              style={{ display: 'none' }}
            >
              <span className="hud-rail-dot shrink-0 rounded-full" />
              <span className="hud-rail-tag hud-rail-label pp-stroke truncate" style={{ display: 'none' }} />
            </div>
          ))}

          <div ref={youRef} className="hud-rail-you absolute flex items-center">
            <span className="hud-rail-disc relative flex shrink-0 items-center justify-center">
              <CarThumb carId={carId} size="84%" />
            </span>
            <span ref={youAltRef} className="hud-rail-chip hud-rail-label pp-stroke tabular-nums">
              0 m
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AltitudeRail
