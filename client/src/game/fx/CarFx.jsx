import { useFrame } from '@react-three/fiber'
import { useEffect } from 'react'
import {
  AdditiveBlending,
  ConeGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  UniformsLib,
  UniformsUtils,
  Vector3,
} from 'three'

import { NITRO_BY_ID } from '@shared/cosmetics'

import { useGame } from '../../store/game'
import { useQuality } from '../../store/quality'
import { getCarModel } from '../cars/carModels'
import { PALETTE } from '../palette'
import { runtime } from '../runtime'

/**
 * Car effects that need no particles: nitro flames out of your exhausts (two additive
 * cones per pipe, one draw), the Bubble Shield, and blob shadows under every car on
 * presets without realtime shadows (one instanced draw for all of them).
 */

const MAX_FLAMES = 8
/** Your car, CPU racers and the full-detail remote cars (RemoteCars: at most 24). */
const MAX_BLOBS = 32
const _m = new Matrix4()
const _p = new Vector3()
const _s = new Vector3()
const _q = new Quaternion()
const _flip = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2)
const _down = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2)

const blobVertex = /* glsl */ `
  varying vec2 vUv;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`
const blobFragment = /* glsl */ `
  varying vec2 vUv;
  #include <common>
  #include <fog_pars_fragment>
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float a = (1.0 - smoothstep(0.35, 1.0, d)) * 0.4;
    gl_FragColor = vec4(0.04, 0.12, 0.2, a);
    #include <fog_fragment>
  }
`

/** Module-level: one set of car effects, mutated every frame. */
let fx = null
/** The equipped nitro colour (Store, shared/cosmetics.js): 'rainbow' cycles its hue. */
const nitroLook = { rainbow: false }

function applyNitro(id) {
  const n = NITRO_BY_ID[id] || NITRO_BY_ID.classic
  nitroLook.rainbow = Boolean(n.rainbow)
  if (!n.rainbow) fx.flames.material.color.set(n.color)
}

function createFx() {
    const flameMat = new MeshBasicMaterial({ color: PALETTE.nitro, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false })
    const flames = new InstancedMesh(new ConeGeometry(0.22, 1.4, 8, 1, true), flameMat, MAX_FLAMES)
    flames.frustumCulled = false
    flames.count = 0
    const shieldMat = new MeshBasicMaterial({ color: PALETTE.nitro, transparent: true, opacity: 0.22, depthWrite: false })
    const shield = new InstancedMesh(new SphereGeometry(2.8, 16, 10), shieldMat, 1)
    shield.frustumCulled = false
    shield.count = 0
    const blobMat = new ShaderMaterial({ vertexShader: blobVertex, fragmentShader: blobFragment, transparent: true, depthWrite: false, fog: true, uniforms: UniformsUtils.clone(UniformsLib.fog) })
    const blob = new InstancedMesh(new PlaneGeometry(1, 1), blobMat, MAX_BLOBS)
    blob.frustumCulled = false
    blob.count = 0
    blob.renderOrder = 1
    return { flames, shield, blob }
}

function updateFx(time, blobs) {
    const car = runtime.car
    // Nitro flames.
    let n = 0
    if (car.boosting) {
      if (nitroLook.rainbow) fx.flames.material.color.setHSL((time * 0.6) % 1, 1, 0.6)
      const model = getCarModel(car.carId)
      const flicker = 0.85 + Math.sin(time * 60) * 0.15
      for (const e of model.exhausts) {
        if (n >= MAX_FLAMES) break
        _p.set(e[0], e[1], e[2] + 0.7).applyQuaternion(car.quaternion).add(car.position)
        _q.copy(car.quaternion).multiply(_flip)
        _s.set(1, flicker * 1.2, 1)
        _m.compose(_p, _q, _s)
        fx.flames.setMatrixAt(n, _m)
        n += 1
      }
    }
    fx.flames.count = n
    fx.flames.instanceMatrix.needsUpdate = true

    // Bubble shield.
    if (car.shield > 0) {
      _s.setScalar(1 + Math.sin(time * 8) * 0.03)
      _m.compose(car.position, car.quaternion, _s)
      fx.shield.setMatrixAt(0, _m)
      fx.shield.count = 1
      fx.shield.instanceMatrix.needsUpdate = true
    } else fx.shield.count = 0

    // Blob shadows: flat on the ground under each caster (a short way down).
    let b = 0
    if (blobs) {
      for (const c of runtime.shadowCasters) {
        if (b >= MAX_BLOBS || c.visible === false) continue
        _p.set(c.position.x, c.position.y - 0.42, c.position.z)
        _s.set(c.size * 2, c.size * 2.6, 1)
        _m.compose(_p, _down, _s)
        fx.blob.setMatrixAt(b, _m)
        b += 1
      }
    }
    fx.blob.count = b
    fx.blob.instanceMatrix.needsUpdate = true
}

export default function CarFx() {
  const blobs = useQuality((s) => s.settings.shadows !== 'realtime')
  const nitro = useGame((s) => s.profile.nitro)
  fx ||= createFx()
  useEffect(() => applyNitro(nitro), [nitro])
  useEffect(
    () => () => {
      for (const m of Object.values(fx)) {
        m.geometry.dispose()
        m.material.dispose()
      }
    },
    [],
  )
  useFrame((state) => updateFx(state.clock.elapsedTime, blobs))
  return (
    <>
      <primitive object={fx.flames} />
      <primitive object={fx.shield} />
      <primitive object={fx.blob} />
    </>
  )
}
