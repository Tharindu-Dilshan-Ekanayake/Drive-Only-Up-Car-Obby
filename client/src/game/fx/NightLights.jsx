import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { SpotLight, Vector3 } from 'three'

import { DEFAULT_STAGE, stageInfo } from '@shared/stages/index'

import { useGame } from '../../store/game'
import { useQuality } from '../../store/quality'
import { SKY_THEMES } from '../palette'
import { runtime } from '../runtime'
import { darkEnough, night } from '../world/nightLight'
import { carLights } from './carLights'

/**
 * Night lights in the scene: the batched fake beams / pools / glows of every car
 * (./carLights.js, three instanced draws in all) and - on MEDIUM/HIGH, on a map with a sky
 * dark enough to need it (the Grand Tour's Neon City, Heat Run) - ONE real SpotLight (no
 * shadows) for your own car, so its headlights really light the road and scenery round it
 * (the world and car materials are Lambert / Phong: they take spot lights).
 *
 * The spotlight stays in the scene for as long as the map and preset allow it, at
 * intensity 0 by day: adding or removing a light changes every lit shader program, so
 * toggling it would recompile the world mid-drive. It only comes or goes with a travel
 * (behind the loading screen) or a preset change.
 */

/** The spot: candela at full night, reach (m), cone half-angle, penumbra, decay. */
const SPOT = { intensity: 38, distance: 55, angle: 0.62, penumbra: 0.7, decay: 1.25 }

const _fwd = new Vector3()
const _up = new Vector3()

/** Does any sky of map `stageId` (its own, or a zone's) get dark enough for the lights? */
function mapIsDark(stageId) {
  if (stageId === DEFAULT_STAGE) return darkEnough([SKY_THEMES.golden, SKY_THEMES.midday])
  const info = stageInfo(stageId)
  const skies = [SKY_THEMES[info?.theme?.sky]]
  for (const z of info?.zones || []) skies.push(SKY_THEMES[z.sky])
  return darkEnough(skies)
}

function tickSpot(light) {
  const car = runtime.car
  _fwd.set(0, 0, -1).applyQuaternion(car.quaternion)
  _up.set(0, 1, 0).applyQuaternion(car.quaternion)
  light.position.copy(car.position).addScaledVector(_fwd, 1.6).addScaledVector(_up, 0.75)
  light.target.position.copy(car.position).addScaledVector(_fwd, 22).addScaledVector(_up, -2.2)
  light.target.updateMatrixWorld()
  light.intensity = night.lamps * SPOT.intensity
}

function PlayerHeadlight() {
  const scene = useThree((s) => s.scene)
  const light = useMemo(() => {
    const l = new SpotLight('#fff0d2', 0, SPOT.distance, SPOT.angle, SPOT.penumbra, SPOT.decay)
    l.castShadow = false
    l.name = 'player-headlight'
    return l
  }, [])
  useEffect(() => {
    scene.add(light)
    scene.add(light.target)
    carLights.setSpot(true)
    // ?debug: the perf checks switch it off / on to measure what it costs.
    if (import.meta.env.DEV) window.__ppSpot = light
    return () => {
      if (import.meta.env.DEV) delete window.__ppSpot
      carLights.setSpot(false)
      scene.remove(light)
      scene.remove(light.target)
      light.dispose()
    }
  }, [scene, light])
  useFrame(() => tickSpot(light))
  return null
}

export default function NightLights() {
  const low = useQuality((s) => s.level === 'LOW')
  const dark = useGame((s) => mapIsDark(s.stageId))
  const meshes = carLights.meshes()

  useEffect(() => carLights.setBeams(!low), [low])
  useEffect(() => () => carLights.dispose(), [])

  return (
    <>
      <primitive object={meshes.beams} />
      <primitive object={meshes.pools} />
      <primitive object={meshes.glows} />
      {!low && dark && <PlayerHeadlight />}
    </>
  )
}
