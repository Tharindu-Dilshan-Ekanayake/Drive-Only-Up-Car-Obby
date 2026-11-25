import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import { BackSide, Color, PlaneGeometry, ShaderMaterial, SphereGeometry, UniformsLib, UniformsUtils, Vector3 } from 'three'

import { stageInfo } from '@shared/stages/index'

import { getGame } from '../../store/game'
import { useQuality } from '../../store/quality'
import { setCarSky } from '../cars/carMaterial'
import { SKY_THEMES } from '../palette'
import { tickWorldMaterial } from '../render/worldMaterial'
import { runtime } from '../runtime'
import { setDarkness } from './nightLight'
import { useSkyTheme } from './skyTheme'

/**
 * Sky Docks weather: the sky dome (three-colour gradient, sun disc and glow, lit clouds
 * on MEDIUM and up), a sea that follows the camera with a sun-glitter path, and the
 * sun + sky light. All shader work, no textures. The colours come from the current sky
 * theme (palette.js SKY_THEMES: the map's, or on the Grand Tour the current zone's),
 * blended smoothly when the zone changes (see "The sky in use" below).
 */

const SUN_DIRECTION = new Vector3(-0.45, 0.75, 0.35).normalize()

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`
const skyFragment = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uSun;
  uniform vec3 uGlow;
  uniform vec3 uCloud;
  uniform vec3 uCloudShade;
  uniform vec3 uSunDir;
  uniform float uTime;
  uniform float uStars;
  varying vec3 vDir;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), u.x), u.y);
  }
  void main() {
    vec3 d = normalize(vDir);
    float h = max(d.y, 0.0);
    vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.16, h));
    col = mix(col, uTop, smoothstep(0.06, 0.5, h));
    float sun = max(dot(d, uSunDir), 0.0);
    // A wide warm glow round the sun, strongest along the horizon, then the disc.
    col = mix(col, uGlow, pow(sun, 5.0) * 0.55 * (1.0 - smoothstep(0.0, 0.5, h)));
    col += uSun * (pow(sun, 900.0) * 1.6 + pow(sun, 60.0) * 0.32 + pow(sun, 8.0) * 0.07);
    #ifdef CLOUDS
    if (d.y > 0.0) {
      // Stretched noise: long bands of cloud, lit on top and towards the sun.
      vec2 uv = d.xz / (d.y + 0.18) * vec2(0.9, 2.1) + vec2(uTime * 0.008, 0.0);
      float n = noise(uv) * 0.6 + noise(uv * 2.3) * 0.3 + noise(uv * 5.1) * 0.1;
      float cloud = smoothstep(0.56, 0.78, n) * smoothstep(0.0, 0.14, d.y);
      float lit = clamp((n - 0.56) * 3.2 + pow(sun, 3.0) * 0.55, 0.0, 1.0);
      vec3 cc = mix(uCloudShade, uCloud, lit) + uGlow * pow(sun, 10.0) * 0.45;
      col = mix(col, cc, cloud * 0.9);
    }
    #endif
    // Night skies (theme.stars): a sparse field of stars, twinkling, fading out low down.
    if (uStars > 0.0 && d.y > 0.0) {
      vec2 cell = floor(d.xz / (d.y + 0.35) * 160.0);
      float star = step(0.9965, hash(cell)) * (0.6 + 0.4 * sin(uTime * 2.0 + hash(cell + 7.0) * 40.0));
      col += vec3(star) * uStars * smoothstep(0.08, 0.35, d.y);
    }
    gl_FragColor = vec4(col, 1.0);
  }
`

/** Shared by both sky materials (the sky blend writes these while it changes). */
const skyUniforms = {
  uTop: { value: new Color() },
  uMid: { value: new Color() },
  uHorizon: { value: new Color() },
  uSun: { value: new Color() },
  uGlow: { value: new Color() },
  uCloud: { value: new Color() },
  uCloudShade: { value: new Color() },
  uSunDir: { value: SUN_DIRECTION },
  uTime: { value: 0 },
  uStars: { value: 0 },
}

/** Sky materials by cloud setting (module-level: their time uniform ticks every frame). */
const skyMaterials = {}
function skyMaterial(clouds) {
  skyMaterials[clouds] ||= new ShaderMaterial({
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
    uniforms: skyUniforms,
    defines: clouds ? { CLOUDS: '' } : {},
    side: BackSide,
    depthWrite: false,
    fog: false,
  })
  return skyMaterials[clouds]
}
const skyGeometry = new SphereGeometry(1, 24, 12)

function tickSky(mesh, camera, time) {
  mesh.position.copy(camera.position)
  skyUniforms.uTime.value = time
  tickWorldMaterial(time)
}

function Sky() {
  const clouds = useQuality((s) => s.settings.clouds)
  const far = useQuality((s) => s.settings.viewDistance)
  const ref = useRef()
  const material = skyMaterial(clouds)
  useFrame(({ camera, clock }) => tickSky(ref.current, camera, clock.elapsedTime))
  return <mesh ref={ref} geometry={skyGeometry} material={material} scale={far * 0.9} renderOrder={-1} frustumCulled={false} />
}

const seaVertex = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`
const seaFragment = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform vec3 uSea;
  uniform vec3 uDeep;
  uniform vec3 uFoam;
  uniform vec3 uGlitter;
  uniform vec3 uSunDir;
  uniform float uTime;
  uniform vec3 uCam;
  varying vec3 vWorld;
  void main() {
    vec2 p = vWorld.xz;
    float w = sin(p.x * 0.11 + uTime * 0.9) + sin(p.y * 0.13 - uTime * 0.7) + sin((p.x + p.y) * 0.07 + uTime * 0.5);
    float sparkle = smoothstep(2.4, 2.9, w + sin(p.x * 0.9 + uTime * 2.0) * 0.4);
    float dist = length(vWorld.xz - uCam.xz);
    vec3 col = mix(uSea, uDeep, smoothstep(40.0, 400.0, dist) * 0.6 + 0.12 * w / 3.0);
    col = mix(col, uFoam, sparkle * 0.55);
    // Sun glitter: the sun reflected off a rippled surface (the waves' slopes plus a
    // fine chop), so it breaks up into a shimmering path towards the sun.
    float sx = cos(p.x * 0.11 + uTime * 0.9) * 0.11 + cos((p.x + p.y) * 0.07 + uTime * 0.5) * 0.07 + sin(p.x * 1.3 + p.y * 0.4 + uTime * 2.1) * 0.22;
    float sz = -cos(p.y * 0.13 - uTime * 0.7) * 0.13 + cos((p.x + p.y) * 0.07 + uTime * 0.5) * 0.07 + sin(p.y * 1.7 - p.x * 0.5 - uTime * 1.8) * 0.22;
    vec3 n = normalize(vec3(-sx, 1.0, -sz));
    vec3 r = reflect(normalize(vWorld - uCam), n);
    float g = pow(max(dot(r, uSunDir), 0.0), 140.0);
    col += uGlitter * g * 1.6;
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
  }
`

let seaMaterial = null
function getSeaMaterial() {
  seaMaterial ||= new ShaderMaterial({
    vertexShader: seaVertex,
    fragmentShader: seaFragment,
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        uSea: { value: new Color() },
        uDeep: { value: new Color() },
        uFoam: { value: new Color() },
        uGlitter: { value: new Color() },
        uSunDir: { value: new Vector3() },
        uTime: { value: 0 },
        uCam: { value: new Vector3() },
      },
    ]),
    fog: true,
  })
  return seaMaterial
}
const seaGeometry = new PlaneGeometry(2, 2).rotateX(-Math.PI / 2)

function tickSea(mesh, camera, time) {
  // Follows the camera in 50 m steps so the pattern doesn't swim.
  mesh.position.set(Math.round(camera.position.x / 50) * 50, 0, Math.round(camera.position.z / 50) * 50)
  seaMaterial.uniforms.uTime.value = time
  seaMaterial.uniforms.uCam.value.copy(camera.position)
}

function Sea() {
  const far = useQuality((s) => s.settings.viewDistance)
  const ref = useRef()
  const material = getSeaMaterial()
  useFrame(({ camera, clock }) => tickSea(ref.current, camera, clock.elapsedTime))
  return <mesh ref={ref} geometry={seaGeometry} material={material} scale={[far * 1.2, 1, far * 1.2]} frustumCulled={false} />
}

// --- The sky in use, and blends between skies ---------------------------------------------
//
// The sky on screen is `blend.cur`: preallocated colours (and the sun direction and light
// intensities) that the frame loop writes into the sky dome, the sea, the fog, the clear
// colour, the lights and the car paint's reflection. It eases towards the sky the car's
// position asks for (`wantedSky`): the map's own (theme.sky; Sky Docks: Settings > Golden
// hour), or on a zoned map (the Grand Tour) the sky of the zone of the section the car is in.
// Driving into the next zone blends over BLEND_SECONDS; a spawn, respawn, teleport, travel or
// a settings change snaps. The sky's `darkness` blends the same way and is handed to
// world/nightLight.js every frame (the car lights fade in and out with the sky).

const COLOR_KEYS = ['top', 'mid', 'horizon', 'sun', 'glow', 'cloud', 'cloudShade', 'fog', 'sea', 'seaDeep', 'foam', 'glitter', 'light', 'hemiSky', 'hemiGround', 'carSkyTop', 'carSkyLow']
const BLEND_SECONDS = 3.5
/** A car moving further than this in one frame was teleported (respawn, checkpoint jump): snap. */
const JUMP = 40

function makeSky() {
  const s = { sunDir: new Vector3(0, 1, 0), lightIntensity: 1, hemiIntensity: 1, stars: 0, darkness: 0 }
  for (const k of COLOR_KEYS) s[k] = new Color()
  return s
}
function loadSky(dst, theme) {
  for (const k of COLOR_KEYS) dst[k].set(theme[k])
  dst.sunDir.set(theme.sunDir[0], theme.sunDir[1], theme.sunDir[2]).normalize()
  dst.lightIntensity = theme.lightIntensity
  dst.hemiIntensity = theme.hemiIntensity
  dst.stars = theme.stars || 0
  dst.darkness = theme.darkness || 0
}
function copySky(dst, src) {
  for (const k of COLOR_KEYS) dst[k].copy(src[k])
  dst.sunDir.copy(src.sunDir)
  dst.lightIntensity = src.lightIntensity
  dst.hemiIntensity = src.hemiIntensity
  dst.stars = src.stars
  dst.darkness = src.darkness
}
function lerpSky(dst, a, b, k) {
  for (const key of COLOR_KEYS) dst[key].lerpColors(a[key], b[key], k)
  dst.sunDir.lerpVectors(a.sunDir, b.sunDir, k).normalize()
  dst.lightIntensity = a.lightIntensity + (b.lightIntensity - a.lightIntensity) * k
  dst.hemiIntensity = a.hemiIntensity + (b.hemiIntensity - a.hemiIntensity) * k
  dst.stars = a.stars + (b.stars - a.stars) * k
  dst.darkness = a.darkness + (b.darkness - a.darkness) * k
}

/** Module-level, frame-owned (the effects below only hand it the map's sky). */
const blend = {
  cur: makeSky(),
  from: makeSky(),
  to: makeSky(),
  /** The SKY_THEMES entry being blended to (null: nothing applied yet). */
  target: null,
  t: 1,
  /** The map's own sky (useSkyTheme); `snap`: it just changed (travel, settings). */
  base: null,
  snap: true,
  /** The stage the zone skies are for, and each section's zone sky (null: not a zoned map). */
  stage: null,
  zoneSky: null,
  pos: new Vector3(),
  dirty: true,
  frame: 0,
}

/** Each section's zone sky on a zoned map (registry `zones`), else null. */
function zoneSkies(stage) {
  const zones = stage && stageInfo(stage.id)?.zones
  if (!zones) return null
  const sky = new Map(zones.map((z) => [z.id, SKY_THEMES[z.sky] || null]))
  return stage.sections.map((s) => sky.get(s.zone) || null)
}

function wantedSky() {
  const stage = getGame().stage
  if (stage !== blend.stage) {
    blend.stage = stage
    blend.zoneSky = zoneSkies(stage)
  }
  return blend.zoneSky?.[runtime.race.section] || blend.base
}

/** Writes the current sky into every shared uniform, the clear colour and the car paint. */
function applySky(s, gl) {
  const u = skyUniforms
  u.uTop.value.copy(s.top)
  u.uMid.value.copy(s.mid)
  u.uHorizon.value.copy(s.horizon)
  u.uSun.value.copy(s.sun)
  u.uGlow.value.copy(s.glow)
  u.uCloud.value.copy(s.cloud)
  u.uCloudShade.value.copy(s.cloudShade)
  u.uStars.value = s.stars
  SUN_DIRECTION.copy(s.sunDir)
  const sea = getSeaMaterial().uniforms
  sea.uSea.value.copy(s.sea)
  sea.uDeep.value.copy(s.seaDeep)
  sea.uFoam.value.copy(s.foam)
  sea.uGlitter.value.copy(s.glitter)
  sea.uSunDir.value.copy(SUN_DIRECTION)
  gl.setClearColor(s.fog)
  setCarSky(s.carSkyTop, s.carSkyLow)
}

/** One frame of the sky: pick the wanted sky, start / advance / snap the blend, apply it. */
function tickSkyBlend(dt, scene, gl) {
  if (!blend.base) return
  const want = wantedSky()
  const p = runtime.car.position
  const jumped = blend.pos.distanceToSquared(p) > JUMP * JUMP || runtime.camera.snap
  blend.pos.copy(p)
  if (want !== blend.target) {
    const snap = blend.target === null || blend.snap || jumped
    blend.target = want
    loadSky(blend.to, want)
    if (snap) {
      copySky(blend.cur, blend.to)
      blend.t = 1
    } else {
      copySky(blend.from, blend.cur)
      blend.t = 0
    }
    blend.dirty = true
  } else if (blend.t < 1 && (jumped || blend.snap)) {
    copySky(blend.cur, blend.to)
    blend.t = 1
    blend.dirty = true
  } else if (blend.snap && blend.target) {
    // (The same sky object, re-applied: e.g. the renderer's clear colour after a remount.)
    blend.dirty = true
  }
  blend.snap = false
  if (blend.t < 1) {
    blend.t = Math.min(1, blend.t + Math.min(dt, 0.1) / BLEND_SECONDS)
    const k = blend.t * blend.t * (3 - 2 * blend.t)
    lerpSky(blend.cur, blend.from, blend.to, k)
    blend.dirty = true
  }
  blend.frame += 1
  if (blend.dirty || blend.frame % 30 === 0) {
    applySky(blend.cur, gl)
    blend.dirty = false
  }
  // The fog is GameScene's (rebuilt when the quality changes): coloured every frame.
  if (scene.fog) scene.fog.color.copy(blend.cur.fog)
  // How dark it is (car lights: world/nightLight.js), blended and snapped with the sky.
  setDarkness(blend.cur.darkness)
}

/** The sun and sky lights follow the blended sky (and the sun follows the car). */
function tickLights(hemi, sun) {
  const s = blend.cur
  hemi.color.copy(s.hemiSky)
  hemi.groundColor.copy(s.hemiGround)
  hemi.intensity = s.hemiIntensity
  sun.color.copy(s.light)
  sun.intensity = s.lightIntensity
  placeSun(sun)
}

const SHADOW_EXTENT = 26

function placeSun(light) {
  const p = runtime.car.position
  light.position.set(p.x + SUN_DIRECTION.x * 80, p.y + SUN_DIRECTION.y * 80, p.z + SUN_DIRECTION.z * 80)
  light.target.position.copy(p)
}

function Lights() {
  const realtime = useQuality((s) => s.settings.shadows === 'realtime')
  const mapSize = useQuality((s) => s.settings.shadowMapSize)
  const sun = useRef()
  const hemi = useRef()
  const scene = useThree((s) => s.scene)

  useLayoutEffect(() => {
    const light = sun.current
    scene.add(light.target)
    if (realtime) {
      const cam = light.shadow.camera
      cam.left = -SHADOW_EXTENT
      cam.right = SHADOW_EXTENT
      cam.top = SHADOW_EXTENT
      cam.bottom = -SHADOW_EXTENT
      cam.near = 1
      cam.far = 160
      cam.updateProjectionMatrix()
      light.shadow.bias = -0.0008
      light.shadow.normalBias = 0.04
    }
    return () => scene.remove(light.target)
  }, [scene, realtime])

  useFrame(() => tickLights(hemi.current, sun.current))

  // (Colours and intensities come from the blended sky every frame: tickLights.)
  return (
    <>
      <hemisphereLight ref={hemi} />
      <directionalLight
        ref={sun}
        castShadow={realtime}
        shadow-mapSize-width={mapSize || 512}
        shadow-mapSize-height={mapSize || 512}
      />
    </>
  )
}

/** Hands the frame loop the map's own sky; a change (travel, Settings > Golden hour) snaps. */
function setBaseSky(theme) {
  blend.base = theme
  blend.snap = true
}

export default function Environment() {
  const theme = useSkyTheme()
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)
  useLayoutEffect(() => setBaseSky(theme), [theme])
  useFrame((_, dt) => tickSkyBlend(dt, scene, gl))
  return (
    <>
      <Sky />
      <Sea />
      <Lights />
    </>
  )
}
