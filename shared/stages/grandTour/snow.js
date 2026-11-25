/**
 * Grand Tour, zone 2 - Snowy Mountain (early morning): off the end of the city's sky-bridge
 * into a ski village on the mountain's foot, then a winding road up the mountain - pine
 * switchbacks, an icicle gorge between frozen waterfalls, a frozen lake, an avalanche chute,
 * an ice cave and the summit ridge - to an observatory on the top, where the Tropical Island
 * zone takes over.
 *
 * Signature: ICE. Road pieces marked `ICE` are a low-grip surface (kind 'ice': the car keeps
 * steering but slides wide - client/src/game/physics/world.js KIND_GRIP), drawn pale and glassy
 * (style 'ice'). They come in gently (a wide, straight, flat patch first), then on the gorge
 * floor, across the lake (with snowploughs) and in the cave. Also: snow ramps and kicker jumps,
 * giant snowballs rolling down the avalanche chute (`buoys` with `heavy` and `look: 'snowball'`),
 * swinging icicles and logs (`hammer` with `look`), snowploughs (`sweeper` with `look: 'plough'`),
 * ice-spike strips (`spikes`), single-lane (4.2 m) ridges and hairpin switchbacks.
 *
 * The scenery (client/src/game/world/scenery/grandTour/snowZone.jsx) builds the mountain round
 * the zone's sections and reads `stage.decor.snow` for its set pieces (path-index ranges).
 */

import { scaledWidth } from '../../track.js'
import { sweepers } from '../pieces.js'

/** A low-grip ice surface (collider kind 'ice', drawn as ice). */
const ICE = { kind: 'ice', style: 'ice' }
/** Snowploughs: the sliding containers dressed as ploughs. */
const ploughs = (list, travel) => sweepers(list, travel).map((o) => ({ ...o, look: 'plough' }))

/**
 * How wide this zone's roads come out against their specs below (the builder's
 * `widthScale`, shared/track.js; the same narrowing as Sky Docks): 12 m -> 9.36 m, 14 -> 10.9,
 * 16 -> 12.5. Single-lane 4.2 m spots, plazas and loops keep their size. Specs read at the old
 * widths; whatever lays things out across the road is given the width as built, `W(spec)`.
 */
const WIDTH_SCALE = 0.78
const W = (w) => scaledWidth(w, WIDTH_SCALE)
/**
 * The ploughs' `travel` on the narrowed roads: on the 10.9 m village road they stop ~2.7 m
 * short of the kerbs (shoved, never pinned) and leave 3.5 m either side as they pass the
 * middle; on the 14 m lake 2.1 m and 4.5 m.
 */
const PLOUGH = { road: 1.8, lake: 6 }

export function snowZone(b, cp, next) {
  const decor = { caves: [], lakes: [], falls: [], ice: [], jumps: [], ridges: [] }
  const prevScale = b.widthScale
  b.setWidthScale(WIDTH_SCALE)
  const mark = () => b.stage.path.length - 1
  const from = () => b.stage.path.length
  /** Runs `fn` (pieces) and records its path range in `list`. */
  const span = (list, fn) => {
    const a = from()
    fn()
    list.push({ from: a, to: mark() })
  }

  // Ski Village: out of the village square up the lower slopes - the first ice patch
  // (wide, straight and flat: feel it slide), snowploughs crossing, a snow ramp.
  b.straight(30, 2, { coins: { n: 3 } })
    .straight(70, 5, { width: [12, 14], coins: { n: 5 } })
    .curve(60, 45, 4, { width: 14, bank: 8, coins: { n: 4, lane: -3 } })
    .straight(30, 1, { width: 14 })
  span(decor.ice, () => b.straight(70, 2, { width: 14, ...ICE, coins: { n: 5 } }))
  // (The ploughs' road is 10.9 m, wider than the standard: as one passes the middle there's
  // 3.5 m either side, room for the widest car.)
  b.straight(30, 2, { width: 14 })
    .straight(90, 8, { width: 14, obstacles: ploughs([[0.3, 0, 4.6], [0.7, 1.6, 4.2]], PLOUGH.road), coins: { n: 4, weave: 3 } })
    .curve(-90, 40, 6, { width: [14, 12], bank: 10, coins: { n: 5 } })
    .stunt(70, 4, { coins: { n: 3, lane: -3 } })
    .straight(40, 4, { items: 0.5 })
  span(decor.ridges, () => b.squeeze(42, 4, { narrow: 4.2, open: true }))
  b.checkpoint(cp(), 'Pine Switchbacks')

  // Pine Switchbacks: three hairpins up through the forest, ice-spike strips on the legs
  // between them, and a single-lane ridge to the top.
  b.straight(30, 3, { width: [12, 15], coins: { n: 3 } })
    .straight(50, 6, { width: 15, coins: { n: 4 } })
    .curve(170, 24, 8, { width: 15, bank: 10, chord: 1.25, coins: { n: 6, lane: 4, arc: -8, from: 0.06, to: 0.94 } })
    .straight(60, 7, { width: 15, spikes: [{ at: 0.45, side: 1, cover: 0.45 }], coins: { n: 4, lane: -3 } })
    .curve(-170, 24, 8, { width: 15, bank: 10, chord: 1.25, coins: { n: 6, lane: -4, arc: 8, from: 0.06, to: 0.94 } })
    .straight(60, 7, { width: 15, spikes: [{ at: 0.5, side: -1, cover: 0.45 }], coins: { n: 4, lane: 3 } })
    .curve(170, 24, 8, { width: 15, bank: 10, chord: 1.25, items: 0.5, coins: { n: 6, lane: 4, arc: -8, from: 0.06, to: 0.94 } })
    .straight(40, 4, { width: [15, 12] })
  span(decor.ridges, () => b.squeeze(48, 5, { narrow: 4.2, open: true }))
  b.straight(30, 2, { coins: { n: 3 } })
    .checkpoint(cp(), 'Icicle Gorge')

  // Icicle Gorge: a narrow gorge between frozen waterfalls, giant icicles swinging across
  // the road from timber gantries - go while one is out at the side - then the gorge's
  // frozen floor (ice) and a climb out.
  b.straight(30, 3, { width: [12, 11], coins: { n: 3 } })
  span(decor.falls, () =>
    b.straight(90, 10, {
      fixed: true,
      width: 11,
      obstacles: [
        { type: 'hammer', look: 'icicle', at: 0.22, phase: 0, period: 3.2 },
        { type: 'hammer', look: 'icicle', at: 0.5, phase: 1.1, period: 3.2 },
        { type: 'hammer', look: 'icicle', at: 0.78, phase: 2.2, period: 3.2 },
      ],
      coins: { n: 7 },
    }),
  )
  b.curve(-90, 34, 8, { width: 11, bank: 12, coins: { n: 6, lane: 2 } })
    .straight(50, 3, { width: [11, 13] })
  span(decor.ice, () => b.straight(70, 3, { width: 13, ...ICE, coins: { n: 4 } }))
  decor.falls.push(decor.ice[decor.ice.length - 1])
  b.straight(30, 2, { width: [13, 12] })
    .curve(80, 40, 6, { bank: 8, items: 0.5 })
    .straight(60, 6, { coins: { n: 4 } })
  span(decor.ridges, () => b.squeeze(42, 4, { narrow: 4.2, open: true }))
  b.checkpoint(cp(), 'Frozen Lake')

  // Frozen Lake: straight across a frozen mountain lake - all ice, 18 m wide, with two
  // snowploughs sliding across it - then a banked climb away from the shore.
  b.straight(30, 2, { width: [12, 18], coins: { n: 3 } })
  span(decor.lakes, () =>
    b.straight(160, 0, { width: 18, ...ICE, obstacles: ploughs([[0.3, 0.4, 4.8], [0.66, 2, 4.4]], PLOUGH.lake), coins: { n: 6, weave: 4 } }),
  )
  decor.ice.push(decor.lakes[0])
  b.straight(30, 1, { width: [18, 12] })
    .curve(-100, 40, 5, { bank: 8, coins: { n: 5 } })
    .straight(70, 8, { coins: { n: 4 } })
    .curve(60, 45, 5, { bank: 8 })
    .straight(50, 5, { items: 0.5 })
    .checkpoint(cp(), 'Avalanche Chute')

  // Avalanche Chute: a steep, narrow chute with giant snowballs rolling down it - always on
  // one side, the other is the way up. Read which side each one takes. (Both ramps the
  // standard road, 9.4 m, the snowballs' lanes pushed out towards the kerbs - `spread`, they
  // overhang the edge half a metre - so each leaves 4.5 m clear on the other side.)
  b.straight(30, 2, { coins: { n: 3 } })
    .straight(80, 15, { obstacles: [{ type: 'buoys', heavy: true, spread: 1.2, look: 'snowball', at: 0.98, interval: 3.8, speed: 11 }], coins: { n: 6, weave: 3 } })
    .curve(-80, 30, 8, { bank: 10, items: 0.5 })
    .straight(70, 14, { obstacles: [{ type: 'buoys', heavy: true, spread: 1.2, look: 'snowball', at: 0.98, interval: 3.5, speed: 12 }], coins: { n: 5, weave: 2.5 } })
    .curve(60, 36, 7)
    .straight(50, 4, { coins: { n: 3 } })
    .straight(50, 4, { items: 0.5 })
    .checkpoint(cp(), 'Ice Cave')

  // Ice Cave: into the mountain through a glowing ice cave (crash barriers), an ice patch
  // and a spike strip inside, then out onto two single-lane ridges with the drop either side.
  b.straight(30, 3, { width: [12, 13], coins: { n: 3 } })
  span(decor.caves, () => {
    b.straight(60, 4, { width: 13, barrier: true, coins: { n: 4 } })
      .curve(40, 60, 3, { width: 13, barrier: true })
    span(decor.ice, () => b.straight(60, 2, { width: 13, barrier: true, ...ICE, coins: { n: 3 } }))
    b.straight(50, 4, { width: 13, barrier: true, spikes: [{ at: 0.5, side: 1, cover: 0.45 }] })
  })
  b.straight(30, 2, { width: [13, 12] })
    .curve(-70, 40, 6, { bank: 10, coins: { n: 5 } })
  span(decor.ridges, () => b.squeeze(60, 6, { narrow: 4.2, open: true, items: 0.5 }))
  b.straight(40, 4, { coins: { n: 3 } })
  span(decor.ridges, () => b.squeeze(54, 6, { narrow: 4.2, open: true }))
  b.straight(30, 2)
    .checkpoint(cp(), 'Summit Ridge')

  // Summit Ridge: logs swinging across the ridge road, two snow kicker jumps over gaps in
  // the ridge, and the last climb to the observatory on the summit.
  b.straight(30, 3, { width: [12, 14], coins: { n: 3 } })
    .straight(80, 8, {
      fixed: true,
      width: 14,
      obstacles: [
        { type: 'hammer', look: 'log', at: 0.3, phase: 0.4, period: 3.4 },
        { type: 'hammer', look: 'log', at: 0.72, phase: 2, period: 3.2 },
      ],
      coins: { n: 5 },
    })
    .curve(90, 36, 8, { width: 14, bank: 10, coins: { n: 5 } })
    .straight(30, 2, { width: [14, 10] })
  const kicker = (gap, rise) => {
    span(decor.jumps, () => b.straight(18, 0, { width: 10, style: 'snow', fixed: true, triggers: [{ type: 'bounce', at: 0.72, size: [W(9), 4] }] }))
    b.gap(gap, rise)
  }
  kicker(22, 4)
  b.straight(40, 2, { width: 10, fixed: true, coins: { n: 3 } })
  kicker(24, 4)
  b.straight(50, 4, { width: [10, 12], coins: { n: 4 } })
    .curve(-80, 40, 7, { bank: 8, items: 0.5 })
    .straight(70, 8, { coins: { n: 4 } })
    .straight(40, 3)
    .checkpoint(cp(), next)
  b.setWidthScale(prevScale)
  return decor
}
