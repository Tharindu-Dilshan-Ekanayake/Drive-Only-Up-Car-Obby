import { Vector4 } from 'three'

import { linkPrograms } from './linkPrograms'

/**
 * Warms the GPU for everything in the scene, behind a loading screen, so that nothing
 * the player can reach later costs a frame the first time it is drawn.
 *
 * Three costs land on the first frame an object is drawn, and each can stall it for
 * 50-400 ms on a cold browser (measured with ANGLE / D3D11):
 * - linking its shader program (three compiles a program on first use; the driver's
 *   HLSL compile of the world material alone is ~120 ms);
 * - ANGLE building the program's vertex / pixel "executables" for the attribute layout of
 *   that draw - at the first real draw call, on the GPU thread, so the frame stalls with
 *   the main thread idle. Linking alone (compile / compileAsync) doesn't do it, and an
 *   instanced mesh with count 0 never issues a draw;
 * - uploading its geometry buffers and textures.
 *
 * `warmScene` does all three for every mesh, instanced mesh, points, line and sprite in
 * the scene - visible or not, culled or not, empty instance lists included:
 * 1. `compileAsync` with everything shown (programs linked in parallel where
 *    KHR_parallel_shader_compile exists; the main thread stays free meanwhile);
 * 2. one real draw of everything into a 1x1 viewport of the canvas (frustum culling
 *    off, an instanced mesh with no instances drawn with one), which uploads the
 *    buffers and textures and makes the driver build every draw-time variant. The
 *    canvas is under a loading screen while this runs, and the next frame repaints it.
 * Every visibility / culling / count change is undone right after each step.
 *
 * Generic on purpose: anything a module adds to the scene before the warm-up runs is
 * covered - a new zone's scenery included - with no list to keep up to date.
 */

/** Layer the main camera draws (ShaderWarmup points it elsewhere while it compiles). */
const MAIN_LAYER = 0
const _viewport = new Vector4()
const _scissor = new Vector4()

/**
 * Shows every drawable object (and its parents; not lights) for one synchronous step,
 * then puts everything back exactly as it was.
 *
 * @param {import('three').Object3D} scene
 * @param {boolean} draw also turn off frustum culling and give empty instanced meshes one instance
 * @param {() => void} fn
 */
function withEverythingShown(scene, draw, fn) {
  const hidden = []
  const culled = []
  const empty = []
  scene.traverse((o) => {
    // Lights stay as they are: the programs must be built for the lights really in use.
    if (o.isLight) return
    if (!o.visible) {
      hidden.push(o)
      o.visible = true
    }
    if (!draw || !(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return
    if (o.frustumCulled) {
      culled.push(o)
      o.frustumCulled = false
    }
    if (o.isInstancedMesh && o.count === 0) {
      empty.push(o)
      o.count = 1
    }
  })
  try {
    fn()
  } finally {
    for (const o of hidden) o.visible = false
    for (const o of culled) o.frustumCulled = true
    for (const o of empty) o.count = 0
  }
}

/** Resolves after `ms`, or never rejects: a stuck compile mustn't keep the loading screen up. */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Compiles, uploads and first-draws everything in `scene` (see the module comment).
 * Call it while a loading screen covers the canvas. Resolves when done (at most a few
 * seconds even if the driver never reports a program ready).
 *
 * @param {import('three').WebGLRenderer} gl
 * @param {import('three').Scene} scene
 * @param {import('three').Camera} camera the main camera (cloned; it isn't changed)
 * @returns {Promise<{ programs: number, geometries: number, textures: number, ms: number }>}
 */
export async function warmScene(gl, scene, camera) {
  const start = performance.now()
  scene.traverse((o) => {
    if (isDrawable(o)) warmed.add(o)
  })
  const probe = camera.clone()
  probe.layers.set(MAIN_LAYER)
  probe.updateMatrixWorld()

  // 1. Link every program (in parallel where the driver can).
  let compiling = null
  withEverythingShown(scene, false, () => {
    compiling = gl.compileAsync(scene, probe)
  })
  await Promise.race([compiling.catch(() => {}), delay(8000)])
  linkPrograms(gl)

  // 2. One real draw of everything, into a single pixel.
  const target = gl.getRenderTarget()
  const scissorTest = gl.getScissorTest()
  gl.getViewport(_viewport)
  gl.getScissor(_scissor)
  try {
    gl.setRenderTarget(null)
    gl.setViewport(0, 0, 1, 1)
    gl.setScissor(0, 0, 1, 1)
    gl.setScissorTest(true)
    withEverythingShown(scene, true, () => gl.render(scene, probe))
  } finally {
    gl.setViewport(_viewport)
    gl.setScissor(_scissor)
    gl.setScissorTest(scissorTest)
    gl.setRenderTarget(target)
  }
  // Wait for the GPU to finish what that draw queued (the driver's variant builds), so
  // the loading screen covers them too - a tiny readback is the portable fence.
  const ctx = gl.getContext()
  ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, new Uint8Array(4))
  return {
    programs: gl.info.programs?.length ?? 0,
    geometries: gl.info.memory.geometries,
    textures: gl.info.memory.textures,
    ms: Math.round(performance.now() - start),
  }
}

/** What makes three pick another program for the same material, per object (its program-change checks). */
function variantOf(o) {
  const g = o.geometry
  const morph = g?.morphAttributes && (g.morphAttributes.position || g.morphAttributes.normal || g.morphAttributes.color) ? 'm' : ''
  const alphas = o.material.vertexColors && g?.attributes.color?.itemSize === 4 ? 'a' : ''
  if (o.isInstancedMesh) return `i${o.instanceColor ? 'c' : ''}${o.morphTexture ? 't' : ''}${morph}${alphas}`
  return `${o.isSkinnedMesh ? 's' : ''}${morph}${alphas}`
}

/** material -> Map(variant -> its twin). */
const twins = new WeakMap()

/**
 * A copy of `material` for objects of another program variant: same settings, the same
 * shader patch (onBeforeCompile and its uniforms) and program cache key, so it draws
 * the same and shares the very same compiled program; freed with the original.
 */
function twinOf(material, variant) {
  let byVariant = twins.get(material)
  if (!byVariant) {
    byVariant = new Map()
    twins.set(material, byVariant)
    material.addEventListener('dispose', () => {
      for (const t of byVariant.values()) t.dispose()
      byVariant.clear()
    })
  }
  let twin = byVariant.get(variant)
  if (!twin) {
    twin = material.clone()
    twin.onBeforeCompile = material.onBeforeCompile
    twin.customProgramCacheKey = material.customProgramCacheKey
    // By reference, not the copies clone() makes: patches and frame loops keep their
    // uniforms there (userData) and on ShaderMaterials (uniforms).
    twin.userData = material.userData
    if (material.uniforms) twin.uniforms = material.uniforms
    twin.name = material.name
    byVariant.set(variant, twin)
  }
  return twin
}

/**
 * Gives every material that's shared between objects of different program variants
 * (the one world material on merged meshes AND instanced meshes, the car paint on bodies
 * and the instanced wheels...) a twin per extra variant, so each material is always drawn
 * with the same program. Otherwise three notices the switch on every such object, every
 * frame, and looks the program up again - rebuilding its parameter object and cache-key
 * string each time: ~3 MB/s of garbage (and the GC pauses that come with it) for nothing.
 * The variant drawn first keeps the original. Idempotent; run it on everything in the
 * scene before warming it (StageWarmup).
 *
 * @param {import('three').Object3D} scene
 */
export function splitSharedMaterials(scene) {
  /** material -> Map(variant -> objects) */
  const users = new Map()
  scene.traverse((o) => {
    const m = o.material
    if (!(o.isMesh || o.isPoints || o.isLine) || !m || Array.isArray(m)) return
    let byVariant = users.get(m)
    if (!byVariant) users.set(m, (byVariant = new Map()))
    const v = variantOf(o)
    if (!byVariant.has(v)) byVariant.set(v, [])
    byVariant.get(v).push(o)
  })
  let split = 0
  for (const [material, byVariant] of users) {
    if (byVariant.size < 2) continue
    // The non-instanced users (usually the merged world meshes) keep the original.
    const keep = byVariant.has('') ? '' : byVariant.keys().next().value
    for (const [variant, objects] of byVariant) {
      if (variant === keep) continue
      const twin = twinOf(material, variant)
      for (const o of objects) o.material = twin
      split += objects.length
    }
  }
  return split
}

/** Everything already warmed (by warmScene or a finished warmSceneGradually batch). */
const warmed = new WeakSet()
const isDrawable = (o) => o.isMesh || o.isPoints || o.isLine || o.isSprite
/** Layer only the batch being drawn (and the lights) is on during a gradual warm draw. */
const WARM_LAYER = 30
const bytesOf = (o) => {
  let n = 0
  const g = o.geometry
  if (g) for (const a of Object.values(g.attributes)) n += a.array.byteLength
  if (g?.index) n += g.index.array.byteLength
  return n
}

/**
 * Counts what the frame just drawn showed as warm: every drawable that's visible (with its
 * parents) and not an empty instanced mesh. The lobby's first frame under the loading
 * screen draws those; whatever is hidden (effects waiting for their moment) is left to a
 * gradualWarm in the background.
 */
export function markVisibleWarmed(scene) {
  const walk = (o) => {
    if (!o.visible) return
    if (isDrawable(o) && !(o.isInstancedMesh && o.count === 0)) warmed.add(o)
    for (const c of o.children) walk(c)
  }
  walk(scene)
}

/** Layer unwarmed objects wait on, out of the main camera's sight, while a map is prepared. */
const PENDING_LAYER = 29
/** object -> its own layer mask, while it waits on PENDING_LAYER. */
const pending = new Map()

/**
 * Keeps everything not warmed yet out of the main camera's sight (on a layer it doesn't
 * draw) - the map's stage world mounting in the background, while you drive round the
 * lobby, must not be drawn (and so compiled and uploaded in one go) before gradualWarm has
 * got to it. Cheap; call it every frame while a map is being prepared.
 */
export function hideUnwarmed(scene) {
  scene.traverse((o) => {
    if (!isDrawable(o) || warmed.has(o) || pending.has(o)) return
    pending.set(o, o.layers.mask)
    o.layers.set(PENDING_LAYER)
  })
}

function reveal(o) {
  const mask = pending.get(o)
  if (mask === undefined) return
  o.layers.mask = mask
  pending.delete(o)
}

/** Puts every hidden object back in sight (the warm-up is done, or abandoned). */
export function revealAll() {
  for (const o of [...pending.keys()]) reveal(o)
}

/** One real draw of `batch` alone (and the lights) into the canvas's corner pixel. */
function drawBatch(gl, scene, probe, batch) {
  const lights = []
  scene.traverse((o) => {
    if (o.isLight) {
      lights.push([o, o.layers.mask])
      o.layers.enable(WARM_LAYER)
    }
  })
  const saved = batch.map((o) => [o, o.layers.mask, o.frustumCulled, o.isInstancedMesh ? o.count : -1])
  const hidden = []
  for (const o of batch) {
    o.layers.set(WARM_LAYER)
    o.frustumCulled = false
    if (o.isInstancedMesh && o.count === 0) o.count = 1
    for (let p = o; p; p = p.parent) {
      if (!p.visible) {
        hidden.push(p)
        p.visible = true
      }
    }
  }
  const target = gl.getRenderTarget()
  const scissorTest = gl.getScissorTest()
  const shadows = gl.shadowMap.autoUpdate
  gl.getViewport(_viewport)
  gl.getScissor(_scissor)
  try {
    gl.shadowMap.autoUpdate = false
    gl.setRenderTarget(null)
    gl.setViewport(0, 0, 1, 1)
    gl.setScissor(0, 0, 1, 1)
    gl.setScissorTest(true)
    gl.render(scene, probe)
  } finally {
    gl.shadowMap.autoUpdate = shadows
    gl.setViewport(_viewport)
    gl.setScissor(_scissor)
    gl.setScissorTest(scissorTest)
    gl.setRenderTarget(target)
    for (const p of hidden) p.visible = false
    for (const [o, mask, culled, count] of saved) {
      o.layers.mask = mask
      o.frustumCulled = culled
      if (count >= 0) o.count = count
    }
    for (const [o, mask] of lights) o.layers.mask = mask
  }
}

/**
 * warmScene for a scene that's in use - the map's stage world prepared in the background
 * while you drive round the lobby: the same work spread over many frames, a few ms each.
 * Only objects not warmed yet. Run it from a frame callback with a negative priority
 * (before the frame's own render, which repaints the corner pixel): `step()` does one
 * frame's share and returns the fraction done (1 = finished).
 * 1. Programs: compileAsync a few objects per frame (linked in parallel where the driver
 *    can; nothing waits for them), then frames pass until every one reports ready.
 * 2. Draws: each frame one small batch (a few objects / a few MB of new buffers) drawn
 *    alone into the corner pixel - uploads and driver variants a bit at a time.
 *
 * @returns {{ step: () => number }}
 */
export function gradualWarm(gl, scene, camera, { frameMs = 6, batchObjects = 2, batchBytes = 3 << 20 } = {}) {
  splitSharedMaterials(scene)
  const probe = camera.clone()
  probe.layers.set(WARM_LAYER)
  const todo = []
  scene.traverse((o) => {
    if (isDrawable(o) && !warmed.has(o) && o.material) todo.push(o)
  })
  const total = Math.max(1, todo.length)
  const compiling = []
  let compiled = 0
  let ready = false
  let readyCheck = null
  let drawn = 0
  const linkProbe = camera.clone()
  linkProbe.layers.set(MAIN_LAYER)
  const step = () => {
    const t0 = performance.now()
    // 1. Programs, a few objects at a time.
    while (compiled < todo.length && performance.now() - t0 < frameMs) {
      const o = todo[compiled]
      compiled += 1
      if (!o.parent) continue
      const p = gl.compileAsync(o, linkProbe, scene).catch(() => {})
      compiling.push(p)
    }
    if (compiled < todo.length) return (0.5 * compiled) / total
    if (!ready) {
      readyCheck ||= Promise.race([Promise.all(compiling), delay(8000)]).then(() => {
        ready = true
      })
      return 0.5
    }
    // 2. Draws, one small batch per frame.
    const batch = []
    let bytes = 0
    while (drawn < todo.length && batch.length < batchObjects && bytes < batchBytes) {
      const o = todo[drawn]
      drawn += 1
      if (!o.parent) continue
      batch.push(o)
      bytes += bytesOf(o)
    }
    if (batch.length) drawBatch(gl, scene, probe, batch)
    for (const o of batch) {
      warmed.add(o)
      reveal(o)
    }
    return drawn >= todo.length ? 1 : 0.5 + (0.5 * drawn) / total
  }
  return { step }
}

/**
 * Holds the warm-up back while something is still on its way into the scene (a lazy
 * scenery chunk loading): `warmHolds.add()` returns a release function. Mount
 * `<WarmHold />` as a Suspense fallback to hold for as long as the boundary is suspended.
 */
let holds = 0
export const warmHolds = {
  add() {
    holds += 1
    let released = false
    return () => {
      if (released) return
      released = true
      holds -= 1
    }
  },
  get count() {
    return holds
  },
}
