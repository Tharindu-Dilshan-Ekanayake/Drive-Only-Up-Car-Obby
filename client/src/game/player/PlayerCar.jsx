import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Vector3 } from 'three'

import { carById } from '@shared/cars'
import { inLobby, SPAWN, START_GATE, START_RESPAWN } from '@shared/lobby'
import { respawnGhost, startRespawnGhost } from '@shared/bump'
import { BURN_TIME } from '@shared/missile'
import { isStageUnlocked, progressOf } from '@shared/logic'
import { inSafeZone } from '@shared/safeZones'
import { stageInfo } from '@shared/stages/index'
import { nearestSample } from '@shared/track'

import { ambience, engine, setMusicIntensity, sfx, skid } from '../../audio/sfx'
import { actions } from '../../net/actions'
import { kickRemote } from '../../net/remotePlayers'
import { getGame, useGame } from '../../store/game'
import { getCarModel } from '../cars/carModels'
import { CarRig, wheelBatch } from '../cars/CarRig'
import { defer } from '../defer'
import { burst } from '../fx/fxQueue'
import { hub as missileHub, ignite } from '../fx/missileHub'
import { beginSection, endSection, recordSample, stopGhost } from '../ghost/ghostTape'
import { Car } from '../physics/car'
import { physicsWorld } from '../physics/instance'
import { carTuning } from '../physics/tuning'
import { runtime } from '../runtime'
import { resetRun } from '../track/pickups'
import { groundUnder } from '../world/groundHeight'
import { DRIFT_LOSE_HIT, loseDrift, updateDrift } from './drift'
import { installKeyboard } from './keyboard'

/**
 * Your car: physics, controls, the run (Start gate, checkpoints, finish), falls and
 * respawns, items, tricks and the engine sound. Everything per-frame goes to
 * `runtime`; anything the UI shows is handed over with `defer`.
 */

const SEA_FALL_Y = 0.6
const RESPAWN_DELAY = 0.9
/** Fallen this far (m) below the nearest road point = off the road for good: respawn at once instead of falling to the sea (or the section's floor) far below. */
const FALL_BELOW_ROAD = 70
/**
 * Stranded: further than this (m) from the road, outside the safe zones, for STRAND_SECONDS (twice as
 * fast while you're hardly moving) - landed on a ledge, a bank or another road piece you can't
 * drive back from, or rolling about in a loop's bowl: you respawn instead of sitting there.
 */
const STRAND_DIST = 22
const STRAND_SECONDS = 6
/**
 * Falling away: in the air, sinking faster than FALL_AWAY_SPEED (m/s) while further than
 * FALL_AWAY_DIST (m) from the road, for FALL_AWAY_SECONDS - you went over the edge (or were
 * thrown clear) and are not coming back onto it, so you respawn about two seconds after
 * leaving the road instead of tumbling down towards the sea.
 */
const FALL_AWAY_DIST = 14
const FALL_AWAY_SPEED = 12
const FALL_AWAY_SECONDS = 1.2
const NO_INPUT = { steer: 0, throttle: 0, brake: 0, nitro: false, handbrake: false }

const TRICK_NAMES = {
  frontflip: 'FRONTFLIP',
  backflip: 'BACKFLIP',
  barrel: 'BARREL ROLL',
  spin: '360 SPIN',
  air: 'BIG AIR',
  landing: 'PERFECT LANDING',
}
/** The same, for the itemised line under a combo. */
const TRICK_LABELS = {
  frontflip: 'Frontflip',
  backflip: 'Backflip',
  barrel: 'Barrel Roll',
  spin: '360 Spin',
  air: 'Big Air',
  landing: 'Perfect Landing',
}

const _fwd = new Vector3()

/**
 * The pose a respawn puts you at: your last checkpoint of the current map's stage, the
 * Start gate, or the pier (also while the stage is still loading).
 */
function respawnPoint(stage) {
  const race = runtime.race
  if (race.checkpoint > 0 && stage?.checkpoints[race.checkpoint]) return stage.checkpoints[race.checkpoint].respawn
  if (race.running) return START_RESPAWN
  return SPAWN
}

/**
 * The controller lives outside React (one per page): its car, rig and per-frame state
 * are plain mutable objects the frame loop owns.
 */
let controller = null

function createController(carId) {
  const rig = new CarRig(carId, undefined, true)
  rig.player = true
  // Your own car is always drawn in full detail (CarRig level of detail).
  rig.lod = 'full'
  const car = new Car(carTuning(carById(carId), getCarModel(carId)))
  car.reset(SPAWN.x, SPAWN.y + 0.8, SPAWN.z, SPAWN.yaw)
  // `protect`: respawn protection (shared/bump.js) - no bumps for a moment after a respawn.
  // `burnT`: seconds left on fire from another player's Rocket Missile (then a respawn).
  const state = { hint: -1, lostT: 0, fallT: 0, roadDistSq: 0, respawnIn: 0, burnT: 0, wasBoosting: false, wasHorn: false, protect: { pending: false, until: 0 } }
  const shadow = { position: runtime.car.position, size: 1.7, visible: true }

  const events = {
    onHit: (intensity) => {
      sfx.crash(intensity)
      if (intensity >= DRIFT_LOSE_HIT && loseDrift(runtime.car.drift)) defer(() => getGame().showToast('DRIFT LOST', 'error'))
      runtime.camera.shake = Math.max(runtime.camera.shake || 0, intensity)
    },
    onLand: (air, impact) => {
      if (impact > 6) sfx.land()
      if (impact > 12) runtime.camera.shake = Math.max(runtime.camera.shake || 0, Math.min(0.6, impact / 40))
      if (impact > 8) runtime.camera.dip = Math.min(1, impact / 25)
    },
    onTrick: (tricks, score) => {
      const [top] = tricks
      // Headline: the biggest stunt; the line under it itemises every part of the score.
      const title = top[0] === 'air' ? TRICK_NAMES.air : `${TRICK_NAMES[top[0]]}${top[1] > 1 ? ` x${top[1]}` : ''}`
      const detail = tricks.map(([kind, n, pts]) => `${TRICK_LABELS[kind]}${kind === 'air' ? ` ${n}s` : n > 1 ? ` x${n}` : ''} ${pts.toLocaleString()}`).join('  ·  ')
      sfx.trick()
      actions.trick(top[0], score)
      defer(() => getGame().showToast(title, 'trick', `+${score.toLocaleString()}`, tricks.length > 1 ? detail : undefined))
    },
    /**
     * Car-to-car (physics/car.js carContact). Role 1, you rammed `body`: a CPU racer
     * takes the throw `imp` itself; another player's car is drawn thrown at once and
     * the throw goes to its owner as a 'bump' (the room checks it). Role 2, a CPU racer
     * rammed you (you've already been thrown): it slows down.
     */
    onBump: (body, closing, imp, role) => {
      if (body.onBump) body.onBump(imp, closing, role)
      else if (role === 1 && body.kind === 'player' && body.owner) {
        kickRemote(body.owner, imp)
        actions.bump(body.owner.sessionId, imp, closing)
      }
      if (role === 1) {
        sfx.crash(Math.min(1, closing / 30))
        runtime.camera.shake = Math.max(runtime.camera.shake || 0, Math.min(0.5, closing / 50))
      }
    },
    onTrigger: (tr) => {
      if (tr.type === 'wind') sfx.wind()
      else if (tr.type === 'conveyor') sfx.conveyor()
      else if (tr.type === 'boost') {
        sfx.boostPad()
        runtime.camera.kick = 1
      }
      else if (tr.type === 'bounce') sfx.bounce()
      else if (tr.type === 'spikes') {
        sfx.puncture()
        runtime.camera.shake = Math.max(runtime.camera.shake || 0, 0.45)
        burst({ x: car.pos.x, y: car.pos.y + 0.4, z: car.pos.z, count: 14, palette: 'spark', speed: 6 })
      }
    },
  }

  /** A drift ended cleanly: score it like a trick. */
  function bankDrift(score, mult) {
    sfx.trick()
    actions.trick('drift', score)
    defer(() => getGame().showToast(`DRIFT x${mult.toFixed(1)}`, 'drift', `+${score.toLocaleString()}`))
  }

  function placeAt(p) {
    loseDrift(runtime.car.drift)
    car.reset(p.x, p.y + 0.8, p.z, p.yaw)
    startRespawnGhost(state.protect, performance.now())
    state.burnT = 0
    state.hint = -1
    runtime.camera.snap = true
  }

  function reachCheckpoint(stage, index, now) {
    const race = runtime.race
    const split = now - race.splitStart
    const finish = index === stage.checkpoints.length - 1
    const total = finish ? now - race.runStart : 0
    race.checkpoint = index
    race.splitStart = now
    // Read before reporting the finish: offline the authority answers at once, and these
    // are about the run BEFORE this one (the old best; whether this finish opens the next
    // chapter - the finish card's "CHAPTER 2 UNLOCKED").
    let prevBest = 0
    let unlock = null
    if (finish) {
      const game = getGame()
      prevBest = progressOf(game.profile, game.stageId).best.finishMs || 0
      const next = stageInfo(game.stageId)?.next
      if (next && !isStageUnlocked(game.profile, next)) unlock = next
    }
    actions.checkpoint(index, split, total || undefined)
    // Keep this section's drive if it's your best there; the next section's ghost starts now.
    endSection(index, split, car.pos, car.quat)
    if (finish) stopGhost()
    else beginSection(index + 1, runtime.car.carId)
    // The split card compares against your best there before this run.
    defer(() => {
      const game = getGame()
      const bestMs = progressOf(game.profile, game.stageId).splits[index] || 0
      if (bestMs) sfx.split(split < bestMs)
      game.setLastSplit({ index, splitMs: split, bestMs, id: Date.now() })
    })
    if (finish) {
      race.running = false
      sfx.finish()
      burst({ x: car.pos.x, y: car.pos.y + 2, z: car.pos.z, count: 70, palette: 'confetti', speed: 11 })
      defer(() => {
        getGame().setFinishResult({ timeMs: total, best: !prevBest || total < prevBest ? true : prevBest, unlock, id: Date.now() })
      })
    } else {
      sfx.checkpoint()
      burst({ x: car.pos.x, y: car.pos.y + 2, z: car.pos.z, count: 30, palette: 'confetti', speed: 8 })
      // The split card and section banner (HUD) announce it; the pay-out toast follows.
    }
  }

  function setCar(id, paint) {
    rig.setCar(id, paint)
    car.t = carTuning(carById(id), getCarModel(id))
    runtime.car.carId = id
  }

  function attach(scene) {
    scene.add(rig.body)
    scene.add(wheelBatch.mesh)
    runtime.shadowCasters.add(shadow)
    engine.start()
    ambience.start()
    const uninstall = installKeyboard()
    return () => {
      scene.remove(rig.body)
      scene.remove(wheelBatch.mesh)
      runtime.shadowCasters.delete(shadow)
      uninstall()
      engine.stop()
      ambience.stop()
      skid.set(0)
    }
  }

  function update(rawDt) {
    const dt = Math.min(rawDt, 0.05)
    const now = performance.now()
    const input = runtime.input
    const race = runtime.race
    const game = getGame()
    // The map's stage: null while it loads (or while travelling) - then it's just the pier.
    const stage = game.stage

    // --- Requests from the HUD / keys -------------------------------------------------
    if (input.lobby) {
      input.lobby = false
      race.running = false
      race.checkpoint = 0
      race.splitStart = 0
      stopGhost()
      resetRun()
      placeAt(SPAWN)
      defer(() => {
        const g = getGame()
        g.setFinishResult(null)
      })
    }
    if (input.teleport) {
      const to = input.teleport
      input.teleport = null
      placeAt({ x: to.x, y: to.y, z: to.z, yaw: to.yaw ?? runtime.car.yaw })
    }
    if (input.respawn) {
      input.respawn = false
      sfx.respawn()
      placeAt(respawnPoint(stage))
    }
    if (input.useItem >= 0) {
      const slot = input.useItem
      input.useItem = -1
      const item = game.items[slot]
      if (item && slot < (game.profile.slots || 1)) {
        let used = true
        if (item === 'missile') {
          // Not from a safe zone (the lobby, a checkpoint plaza, just after a respawn): the item stays.
          used = !runtime.car.safe && Boolean(missileHub.fire?.(runtime.car))
          if (!used && runtime.car.safe) {
            sfx.error()
            defer(() => getGame().showToast("CAN'T FIRE HERE", 'info', 'No missiles in safe zones'))
          }
        } else {
          if (item === 'magnet') runtime.car.magnet = 8
          else car.applyItem(item)
          sfx.itemUse()
        }
        if (used) defer(() => {
          const items = [...getGame().items]
          items[slot] = null
          getGame().setItems(items)
        })
      }
    }
    if (input.bump) {
      // Another player rammed us (their 'bump', checked by the room). Never in a safe zone.
      const bump = input.bump
      input.bump = null
      if (!runtime.car.safe && state.respawnIn <= 0) {
        const hit = car.applyBump(bump.x, bump.y, bump.z)
        if (hit > 0.4) defer(() => getGame().showToast(bump.name ? `RAMMED BY ${bump.name.toUpperCase()}` : 'RAMMED!', 'error'))
      }
    }
    if (input.burn) {
      // Another player's missile hit us (their 'burn', checked by the room): a Bubble Shield
      // blocks it; else we're thrown up a little, burn for BURN_TIME and respawn at the checkpoint.
      const burn = input.burn
      input.burn = null
      if (state.respawnIn > 0 || state.burnT > 0 || runtime.car.safe) actions.missileAck(burn.from, false)
      else if (car.effects.shield > 0) {
        actions.missileAck(burn.from, false)
        sfx.crash(0.4)
        defer(() => getGame().showToast('MISSILE BLOCKED', 'info'))
      } else {
        state.burnT = BURN_TIME
        car.applyBump(0, 9, 0)
        ignite(runtime.car.position, BURN_TIME)
        actions.missileAck(burn.from, true)
        defer(() => getGame().showToast('HIT BY A MISSILE', 'error', burn.name ? burn.name.toUpperCase() : undefined))
      }
    }
    if (state.burnT > 0) {
      state.burnT -= dt
      if (state.burnT <= 0) {
        sfx.respawn()
        placeAt(respawnPoint(stage))
      }
    }
    if (input.hazard) {
      // A Heat Run police gadget hit us ('foam' | 'net' | 'emp' | 'pit', game/world/heat/): physics/car.js applyHazard.
      const kind = input.hazard
      input.hazard = null
      if (state.respawnIn <= 0) car.applyHazard(kind, runtime.input.hazardSide)
    }
    if (input.horn && !state.wasHorn) sfx.horn()
    state.wasHorn = input.horn

    // --- Physics ------------------------------------------------------------------------
    // (`input.hold`: the car is held - Heat Run's BUSTED! moment before the respawn.)
    const controls = game.panel || state.respawnIn > 0 || state.burnT > 0 || input.hold ? NO_INPUT : input
    car.update(dt, controls, physicsWorld, events)

    // --- Falls ---------------------------------------------------------------------------
    const p = car.pos
    if (state.respawnIn > 0) {
      state.respawnIn -= dt
      if (state.respawnIn <= 0) placeAt(respawnPoint(stage))
    } else {
      const sec = stage?.sections[Math.min(race.section, stage.sections.length - 1)]
      const offTrack = Boolean(sec) && !inLobby(p.x, p.y, p.z) && race.section > 0 && p.y < sec.min[1] - 30
      // Sunk into drawn terrain (the Grand Tour's mountain; never under a road): a fall too.
      // (`groundUnder`: `ground.at` and the zones' ground layers, world/groundHeight.js.)
      const below = inLobby(p.x, p.y, p.z) ? null : groundUnder(p.x, p.z)
      const inGround = below !== null && p.y < below - 1.5
      // Far below the road it was on (state.hint: the last frame's nearest path sample): a fall off the side.
      const road = stage && race.running && state.hint >= 0 ? stage.path[Math.min(state.hint, stage.path.length - 1)] : null
      const lostRoad = road !== null && !inLobby(p.x, p.y, p.z) && p.y < road.y - FALL_BELOW_ROAD
      const off = road !== null && !inLobby(p.x, p.y, p.z) && state.roadDistSq > STRAND_DIST * STRAND_DIST && !inSafeZone(stage, p.x, p.y, p.z)
      state.lostT = off ? state.lostT + dt * (Math.abs(car.forwardSpeed) < 0.9 ? 2 : 1) : 0
      const stranded = state.lostT > STRAND_SECONDS
      const sinking = road !== null && !inLobby(p.x, p.y, p.z) && car.grounded === 0 && car.vel.y < -FALL_AWAY_SPEED && state.roadDistSq > FALL_AWAY_DIST * FALL_AWAY_DIST
      state.fallT = sinking ? state.fallT + dt : 0
      const fallingAway = state.fallT > FALL_AWAY_SECONDS
      if (p.y < SEA_FALL_Y || offTrack || inGround || lostRoad || stranded || fallingAway) {
        state.lostT = 0
        state.fallT = 0
        state.respawnIn = RESPAWN_DELAY
        sfx.splash()
        burst({ x: p.x, y: Math.max(p.y, 0.3), z: p.z, count: 40, palette: 'splash', speed: 9 })
        loseDrift(runtime.car.drift)
        actions.fell()
      }
    }

    // --- The run ------------------------------------------------------------------------
    const pastGate = p.z < START_GATE.z - 0.5 && Math.abs(p.x - START_GATE.x) < START_GATE.width / 2 + 2
    if (stage && !race.running && race.checkpoint === 0 && pastGate && p.y < START_GATE.y + 4 && game.stageReady) {
      race.running = true
      race.runStart = now
      race.splitStart = now
      beginSection(1, runtime.car.carId)
      sfx.countdown()
    }
    if (stage && (!inLobby(p.x, p.y, p.z) || race.running)) {
      const near = nearestSample(stage.path, p.x, p.y, p.z, state.hint)
      state.hint = near.index
      state.roadDistSq = near.distSq
      const sample = stage.path[near.index]
      race.pathIndex = near.index
      race.section = sample.section
      race.progress = sample.s / stage.length
      const next = stage.checkpoints[race.checkpoint + 1]
      if (race.running && next && sample.s >= next.s - 1.5 && Math.hypot(p.x - next.x, p.z - next.z) < next.width / 2 + 3 && Math.abs(p.y - next.y) < 7) {
        reachCheckpoint(stage, race.checkpoint + 1, now)
      }
    } else {
      race.section = 0
      race.progress = 0
    }

    // --- Publish -----------------------------------------------------------------------
    const rc = runtime.car
    // In a safe zone, or just respawned: cars pass through you and bumps are ignored.
    const zone = inSafeZone(stage, p.x, p.y, p.z)
    rc.safe = respawnGhost(state.protect, zone, performance.now()) || zone
    rc.position.copy(p)
    rc.quaternion.copy(car.quat)
    rc.velocity.copy(car.vel)
    _fwd.set(0, 0, -1).applyQuaternion(car.quat)
    rc.yaw = Math.atan2(-_fwd.x, -_fwd.z)
    rc.speedKmh = car.forwardSpeed * 3.6
    rc.altitude = Math.max(0, p.y - 2)
    rc.nitro = car.nitro
    rc.boosting = car.boosting && controls.nitro
    rc.grounded = car.grounded > 0
    rc.airTime = car.airTime
    rc.drifting = car.drifting
    updateDrift(rc.drift, dt, car.drifting && car.grounded >= 3 && state.respawnIn <= 0, car.lateralSpeed, bankDrift)
    rc.shield = car.effects.shield
    rc.slow = car.effects.slow
    rc.emp = car.effects.emp
    rc.braking = controls.brake > 0 && car.grounded > 0 && car.forwardSpeed > 1
    // Rear tyre contact points, for skid marks.
    for (let i = 0; i < 2; i += 1) {
      const w = car.t.wheels[2 + i]
      rc.rearWheels[i].set(w.x, car.wheelY[2 + i] - car.t.wheelRadius + 0.03, w.z).applyQuaternion(car.quat).add(p)
    }
    rc.skidding =
      car.grounded >= 3 && (car.drifting || (rc.braking && car.forwardSpeed > 12) || (controls.handbrake && Math.abs(car.forwardSpeed) > 8))
    rc.magnet = Math.max(0, rc.magnet - dt)
    if (race.running) {
      // The ghost's wheels copy yours: the suspension's lift (average) and the steer.
      let lift = 0
      for (let i = 0; i < 4; i += 1) lift += car.wheelY[i] - car.t.wheels[i].y
      recordSample((now - race.splitStart) / 1000, p, car.quat, lift * 0.25, car.steerAngle)
    }

    // --- Sound -------------------------------------------------------------------------
    const top = car.t.maxSpeed * car.t.nitroTop
    engine.set(Math.min(1, Math.abs(car.forwardSpeed) / top), Math.max(controls.throttle, controls.brake), rc.boosting)
    skid.set(car.drifting && car.grounded ? Math.min(1, Math.abs(car.lateralSpeed) / 12) : 0)
    if (rc.boosting && !state.wasBoosting) sfx.nitroStart()
    else if (!rc.boosting && state.wasBoosting) sfx.nitroStop()
    state.wasBoosting = rc.boosting
    ambience.set(Math.min(1, Math.abs(car.forwardSpeed) / top), Math.min(1, rc.altitude / (stage?.maxAltitude || 100)))
    // The music builds as you climb, and kicks up while boosting.
    setMusicIntensity(Math.min(1, (race.running && stage ? 0.25 + (race.section / stage.sections.length) * 0.6 : 0) + (rc.boosting ? 0.2 : 0)))

    // --- Draw ----------------------------------------------------------------------------
    rig.visible = state.respawnIn <= 0 || p.y > SEA_FALL_Y
    rig.brake = rc.braking ? 1 : 0
    rig.pose(p, car.quat, { wheelY: car.wheelY, spin: car.wheelSpin, steer: car.steerAngle })
  }

  return { setCar, attach, update }
}

export function PlayerCar() {
  const scene = useThree((s) => s.scene)
  const carId = useGame((s) => s.profile.car)
  const paint = useGame((s) => s.profile.paint)
  controller ||= createController(carId)

  useEffect(() => controller.setCar(carId, paint), [carId, paint])
  useEffect(() => controller.attach(scene), [scene])
  useFrame((_, dt) => controller.update(dt))

  return null
}

export default PlayerCar
