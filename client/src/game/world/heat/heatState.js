/**
 * Heat Run's live state (module-level, mutated by the police sim every frame - never
 * React or zustand state): the HUD's heat stars and BUSTED meter read it from the shared
 * live loop (ui/hud/useLive.js), the audio and the debug hooks too.
 */

/** Heat levels 1-5 are `1 + floor(value)`; value runs 0..HEAT_MAX. */
export const HEAT_MAX = 4.99

export const heat = {
  /** The police sim is running (Heat Run mounted). */
  on: false,
  /** Heat 0..HEAT_MAX, and its level 1..5. */
  value: 0,
  level: 1,
  /** BUSTED meter 0..1, and seconds left on the BUSTED! moment (> 0: showing). */
  busted: 0,
  bustedT: 0,
  /** Seconds of police grace left (after a bust / respawn: none within 60 m). */
  grace: 0,
  /** Seconds spent outrunning them (nearest > ESCAPE_DIST); at 4 s the heat drops. */
  escape: 0,
  /** Pursuers on the road now, and the nearest one's distance (m, Infinity: none). */
  pursuers: 0,
  nearest: Infinity,
  /** Units within the BUSTED ranges right now (6 m / 8 m) - for the HUD's "boxed in" cue. */
  close: 0,
  boxed: false,
  /** Seconds left on a telegraphed shot / drop aimed at you (HUD warning), and what it is. */
  warn: 0,
  warnKind: '',
  /**
   * Line of sight: does any unit (or the helicopter) see you; seconds unseen and the
   * seconds needed to slip them (the evade countdown; heat drops when it runs out).
   */
  seen: false,
  evade: 0,
  evadeNeed: 4,
  /** The police radio line on the HUD (./radio.js): text, seconds left, a counter bumped per line. */
  radio: '',
  radioT: 0,
  radioSeq: 0,
  /** Bounty points: unbanked (lost when BUSTED), banked this run (at each checkpoint plaza and the finish). */
  bounty: 0,
  banked: 0,
  /** The last bounty award on the HUD ("+90 CLOSE CALL") and seconds left. */
  bountyPop: '',
  bountyPopT: 0,
  /**
   * Radar blips (HUD): x (right), y (ahead) in -1..1 of the radar range, kind (0 unit,
   * 1 roadblock, 2 helicopter, 3 traffic, 4 unit searching), `blipCount` of them.
   */
  blips: new Float32Array(24 * 3),
  blipCount: 0,
  /** A telegraphed PIT on you (s left), for the HUD chip. */
  pit: 0,
  /** Moving bodies enabled right now, everything included (the live 30-body budget). */
  bodies: 0,
  traffic: 0,
  /** Counters (debug / verification). */
  busts: 0,
  hits: { foam: 0, net: 0, emp: 0, spikes: 0, ram: 0, pit: 0 },
  stats: { pits: 0, pitsDodged: 0, evades: 0, blocks: 0, boxes: 0, wrecks: 0, crashes: 0, avoids: 0, pullouts: 0, rbSpikes: 0, radio: 0, budgetCuts: 0 },
  radioLog: 0,
  spawned: { patrol: 0, cab: 0, jeep: 0, bike: 0, tank: 0, heli: 0 },
  /** Highest level reached each kind was first seen at (debug: the spawn table works). */
  firstLevel: {},
}

export function resetHeat() {
  heat.value = 0
  heat.level = 1
  heat.busted = 0
  heat.bustedT = 0
  heat.grace = 0
  heat.escape = 0
  heat.pursuers = 0
  heat.nearest = Infinity
  heat.close = 0
  heat.boxed = false
  heat.warn = 0
  heat.warnKind = ''
  heat.seen = false
  heat.evade = 0
  heat.radio = ''
  heat.radioT = 0
  heat.bounty = 0
  heat.banked = 0
  heat.bountyPop = ''
  heat.bountyPopT = 0
  heat.blipCount = 0
  heat.pit = 0
}
