import { Quaternion, Vector3 } from 'three'

import { SPAWN } from '@shared/lobby'

/**
 * Per-frame mutable state shared between systems.
 *
 * Deliberately outside React and zustand: it changes every frame, nothing should
 * re-render because of it, and every reader lives in a `useFrame`, a timer or a DOM
 * writer (ui/hud/useLive.js). UI that needs React state from it gets it from the
 * 10 Hz game ticker, the only thing that copies from here into the store.
 */
export const runtime = {
  /** Your car. Written by the player car controller every frame. */
  car: {
    position: new Vector3(SPAWN.x, SPAWN.y + 1, SPAWN.z),
    quaternion: new Quaternion(),
    velocity: new Vector3(),
    /** Heading about +Y, radians (0 faces -Z). */
    yaw: SPAWN.yaw,
    /** Signed forward speed, km/h. */
    speedKmh: 0,
    /** Height above sea level, metres. */
    altitude: 0,
    /** Nitro tank 0..1. */
    nitro: 1,
    boosting: false,
    grounded: true,
    /** Seconds since all four wheels left the ground (0 when grounded). */
    airTime: 0,
    drifting: false,
    /** The drift being scored right now (game/player/drift.js); the HUD's drift meter. */
    drift: { active: false, score: 0, mult: 1, time: 0, grace: 0 },
    /** Equipped car id the controller is driving. */
    carId: 'buggy',
    /** Seconds left on the Coin Magnet / Bubble Shield items (for pickups and FX). */
    magnet: 0,
    shield: 0,
    /** Seconds left slowed by a Heat Run foam ball / net, and with the nitro knocked out by an EMP. */
    slow: 0,
    emp: 0,
    /** True while the brake/reverse input is held on the ground (brake lights). */
    braking: false,
    /** Rear tyre contact points (world) and whether they're leaving skid marks. */
    rearWheels: [new Vector3(), new Vector3()],
    skidding: false,
    /** In a safe zone (shared/safeZones.js: lobby, checkpoint plaza): cars pass through each other. */
    safe: true,
  },

  /**
   * Controls, written by the keyboard handler and the touch controls, read by the car
   * every frame. Analog values are -1..1 / 0..1.
   */
  input: {
    steer: 0,
    throttle: 0,
    brake: 0,
    /** Touch BRAKE only slows you down and holds you still; the REVERSE button (and the keyboard's S) drives backwards. */
    noReverse: false,
    nitro: false,
    handbrake: false,
    /** Set to a slot index (0-2) to use that item; the car clears it. */
    useItem: -1,
    /** Set true to respawn at the last checkpoint; the car clears it. */
    respawn: false,
    /** Set true to go back to the pier (the run starts over); the car clears it. */
    lobby: false,
    /** `{ x, y, z, yaw? }` to put the car somewhere (server spawn / correction); cleared. */
    teleport: null,
    /** `{ x, y, z, name }` another player's bump throwing your car (net 'bump'); the car applies and clears it. */
    bump: null,
    /** `{ name, from }`: another player's Rocket Missile burning your car (net 'burn'); the car applies and clears it. */
    burn: null,
    /** A Heat Run police gadget hitting your car: 'foam' | 'net' | 'emp' (game/world/heat/); the car applies and clears it. */
    hazard: null,
    /** Which side a 'pit' hazard came from (+1 right, -1 left). */
    hazardSide: 1,
    /** True while the car is held still (Heat Run's BUSTED! moment). */
    hold: false,
    horn: false,
  },

  /** The current run, written by the player controller. */
  race: {
    /** Highest checkpoint index reached this run (0 = not started / at the Start gate). */
    checkpoint: 0,
    /** performance.now() when the current checkpoint was reached (timer start), or 0. */
    splitStart: 0,
    /** True from crossing the Start gate until the finish (or back to the lobby). */
    running: false,
    /** Fraction of the stage driven, 0..1 (for the altitude rail). */
    progress: 0,
    /** Stage section you're in (0 = from the Start gate to CP1), and nearest path sample. */
    section: 0,
    pathIndex: 0,
    /** performance.now() the run started at the Start gate (for the finish time). */
    runStart: 0,
    /** Your place among everyone on the stage (1 = highest progress) and how many racers. */
    rank: 1,
    racerCount: 1,
  },

  /**
   * Everyone on the altitude rail, refreshed ~4x a second:
   * `{ id, name, altitude, progress (0..1), color, bot: bool, you: bool }`.
   */
  racers: [],

  camera: {
    /** 'chase' behind the car; 'orbit' for the garage/finish; 'free' while dragging. */
    mode: 'chase',
    /** Extra yaw/pitch from dragging the view (eases back to 0). */
    yawOffset: 0,
    pitchOffset: 0,
    /** Set to jump the camera straight to its target next frame (respawns). */
    snap: true,
    /** Screen shake amount (0..1), decays by itself. */
    shake: 0,
    /** Lens kick from a boost pad, and a downward dip from a hard landing (0..1, decay). */
    kick: 0,
    dip: 0,
  },

  /** CPU racers (game/bots/Bots.jsx), for the altitude rail and nameplates. */
  bots: [],

  /**
   * Things that get a blob shadow on low presets. Each entry is
   * `{ position: Vector3, size: number, visible?: boolean }`.
   */
  shadowCasters: new Set(),
}
