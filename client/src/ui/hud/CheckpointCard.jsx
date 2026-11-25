import { useRef } from 'react'

import { progressOf } from '@shared/logic'
import { chapterLabel } from '@shared/chapters'
import { stageInfo } from '@shared/stages/index'

import { runtime } from '../../game/runtime'
import { getGame, useGame } from '../../store/game'
import { formatTime, HAZARD_TRIM } from './style'
import { setData, setStyle, setText, useLive } from './useLive'

/**
 * What the card says for a given run state (strings only, compared before writing).
 * `stage` is null while the map loads; `stageId` is the map you're on. In the lobby it
 * names the map - "[CHAPTER 1] SKY DOCKS" (a mode: just "[HEAT RUN]") - with what to do
 * next in the chip under it (`hint`): while the map's track is still being prepared in the
 * background (the Start gate stays shut), how far along that is.
 */
function describe(race, stage, stageWarm, trackPrep, stageId) {
  const cp = race.checkpoint
  const total = stage ? stage.checkpoints.length - 1 : 1
  const mapName = stageInfo(stageId)?.short || 'PIER ZERO'
  if (stage && !race.running && cp >= total) return { tag: 'STAGE CLEAR', count: '', sub: `${stage.sections[total]?.name || mapName}!`, next: 0, done: total, total }
  if (!race.running && cp === 0) {
    const chapter = chapterLabel(stageId)
    return { tag: chapter || mapName, count: '', sub: chapter ? mapName : '', hint: stageWarm ? 'Drive to the START' : `PREPARING TRACK ${Math.round(Math.min(0.99, trackPrep) * 100)}%`, next: 0, done: 0, total }
  }
  const section = stage?.sections[cp]?.name || ''
  const nextIndex = Math.min(total, cp + 1)
  return { tag: nextIndex === total ? 'FINISH' : `CP ${nextIndex}`, count: `${cp}/${total}`, sub: section, next: nextIndex, done: cp, total }
}

/**
 * Top centre, the timer plate - small, so the view stays clear: one thin line with
 * "TO" + the next checkpoint as a gold chip, the progress count and the section's
 * name; under it the split timer since the last checkpoint with your best split for
 * this one beside it; a segmented progress strip along the bottom edge.
 * All written by the live loop - the timer changes every frame.
 */
export function CheckpointCard() {
  const rootRef = useRef(null)
  const toRef = useRef(null)
  const tagRef = useRef(null)
  const countRef = useRef(null)
  const subRef = useRef(null)
  const timeRef = useRef(null)
  const bestRef = useRef(null)
  const fillRef = useRef(null)
  // Segments on the progress strip: the current map's checkpoints (re-renders on travel only).
  const total = useGame((s) => (s.stage ? s.stage.checkpoints.length - 1 : 1))

  useLive((now) => {
    const race = runtime.race
    const { profile, stage, stageId, stageWarm, trackPrep } = getGame()
    const d = describe(race, stage, stageWarm, trackPrep, stageId)
    setText(toRef.current, d.next ? 'TO' : '')
    setText(tagRef.current, d.tag)
    setText(countRef.current, d.count)
    setText(subRef.current, d.sub)
    setStyle(fillRef.current, 'transform', `scaleX(${(d.done / d.total).toFixed(4)})`)
    const running = race.running && race.splitStart > 0
    const split = running ? now - race.splitStart : 0
    setText(timeRef.current, formatTime(split))
    const best = d.next ? progressOf(profile, stageId).splits[d.next] : 0
    setText(bestRef.current, best ? `BEST ${formatTime(best)}` : d.next ? 'NO BEST YET' : d.hint || '')
    // idle / on pace / slower than your best: the CSS tints the trim, time and best chip.
    setData(rootRef.current, 'pace', !running ? 'idle' : best && split > best ? 'slow' : 'ok')
    setData(rootRef.current, 'best', best ? '1' : '0')
  })

  return (
    <div ref={rootRef} className="hud-cp pointer-events-none relative flex flex-col" data-pace="idle">
      <div className="hud-cp-trim w-full" style={{ background: HAZARD_TRIM }} />
      <div className="hud-cp-body flex flex-col items-center">
        <div className="hud-cp-line flex max-w-full items-center">
          <span ref={toRef} className="hud-cp-to pp-stroke" />
          <span ref={tagRef} className="hud-cp-tag pp-stroke" />
          <span ref={countRef} className="hud-cp-count pp-stroke tabular-nums" />
          <span ref={subRef} className="hud-cp-sub pp-stroke min-w-0 truncate" />
        </div>
        <div className="hud-cp-row flex items-center">
          <span ref={timeRef} className="hud-cp-time pp-stroke leading-none tabular-nums">
            00:00.0
          </span>
          <span ref={bestRef} className="hud-cp-best pp-stroke tabular-nums" />
        </div>
      </div>
      <div className="hud-cp-progress w-full" style={{ ['--segs']: total }}>
        <div ref={fillRef} className="hud-cp-fill" />
      </div>
    </div>
  )
}

export default CheckpointCard
