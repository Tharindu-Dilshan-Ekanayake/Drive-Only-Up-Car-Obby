import { heatSfx } from '../../../audio/heatSfx'
import { heat } from './heatState'

/**
 * Heat Run's police radio: short dispatch lines (our own wording) shown on the pursuit HUD
 * (ui/hud/HeatHud.jsx reads `heat.radio` / `heat.radioT` / `heat.radioSeq`), each after a
 * squelch chirp (audio/heatSfx.js `radio`). Rate-limited so it reads as chatter, not spam:
 * a line waits out the one before unless it's urgent. Plain module state, no allocation
 * beyond the line's string.
 */

const LINES = {
  pursuit: ['Unit {u} in pursuit - suspect heading for {place}!', 'Unit {u} has eyes on, suspect running for {place}.', 'All units: suspect vehicle eastbound, {place} next.'],
  spotted: ['Eyes on! Unit {u} has the suspect again.', 'Suspect spotted near {place} - closing in!', 'Got him! Unit {u} back in pursuit.'],
  lost: ['Lost visual - all units, search the area.', 'Suspect lost - searching.', 'No eyes on the suspect. Fan out!'],
  evaded: ['Suspect is gone. Calling off the search.', 'We lost him. Units, stand down a notch.', 'Search negative. Suspect evaded.'],
  block: ['Unit {u}, get ahead and slow him down!', 'Unit {u} moving up for a rolling block.', 'Unit {u}: overtake and box his nose!'],
  box: ['Units {u} and {v}, box him in!', 'Pin him! Units {u} and {v} on his flanks.'],
  pit: ['Unit {u}, line up the PIT!', 'Unit {u} going for the tap - hold on!'],
  pitMiss: ['PIT missed! Suspect still mobile.', 'He shook the PIT - stay on him!'],
  pitHit: ['PIT successful - move in, move in!', 'He is spinning! Close the gap!'],
  roadblock: ['Roadblock up before {place}. Gap is tight.', 'Barricade in place ahead of {place}.'],
  spikes: ['Spikes out at the roadblock - watch the gap!', 'Strip deployed across the gap!'],
  pullout: ['Roadblock units, pull out and pursue!', 'He is through! Barricade units, go go go!'],
  heli: ['Air unit Skyhawk on station - light him up.', 'Skyhawk overhead, searchlight on the suspect.'],
  down: ['Unit {u} is down!', 'Unit {u} wrecked - need another car!', 'Lost Unit {u}, he rammed us off!'],
  crash: ['Unit {u} hit a civilian! Watch the traffic!', 'Unit {u} tangled with traffic - out of it!'],
  busted: ['Suspect in custody. Nice work, units.', 'Got him. Bring him in.'],
  level: ['Dispatch: threat level {lvl}, all units respond.', 'Threat level {lvl} - sending everything we have.'],
}

const GAP = 3.2
const SHOW = 4.2

const state = { last: 0, counter: {} }

/**
 * Says a line of `kind` (LINES) now, filling `{u}` `{v}` `{place}` `{lvl}` from `vars`.
 * `urgent` lines cut in; others are dropped if another line went out < GAP s ago.
 */
export function radio(kind, vars = {}, urgent = false) {
  const now = performance.now() / 1000
  if (!urgent && now - state.last < GAP) return false
  const list = LINES[kind]
  if (!list) return false
  const n = (state.counter[kind] = (state.counter[kind] || 0) + 1)
  let text = list[n % list.length]
  text = text.replace('{u}', vars.u ?? '1').replace('{v}', vars.v ?? '2').replace('{place}', vars.place || 'the docks').replace('{lvl}', vars.lvl ?? heat.level)
  heat.radio = text
  heat.radioT = SHOW
  heat.radioSeq += 1
  heat.radioLog += 1
  state.last = now
  heatSfx.radio()
  return true
}

export function resetRadio() {
  state.last = 0
}
