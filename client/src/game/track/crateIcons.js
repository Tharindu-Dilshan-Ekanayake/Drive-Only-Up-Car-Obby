import { CanvasTexture, InstancedBufferAttribute, InstancedMesh, LinearFilter, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three'

import { iconUrl } from '../../ui/icons'
import { ITEM_IDS } from '../player/items'

/**
 * The item icons that float over the item crates, so you can see what each crate of a row
 * holds before you drive through it: ONE instanced quad mesh (one draw call for every icon
 * on the stage) over a small canvas atlas painted once from the HUD's own icons (4 x 2
 * cells of 96 px = 384 x 192: well inside the LOW 512 px texture budget, 144 KB). Each
 * instance picks its cell with the `aIcon` attribute; the quads are billboarded by the
 * stage's frame loop (Stage.jsx). Opaque pass with an alpha test: no sorting, no blending.
 */

const CELL = 96
const COLS = 4
const ROWS = 2
/** Item id -> its cell number in the atlas. */
export const ICON_CELL = Object.fromEntries(ITEM_IDS.map((id, i) => [id, i]))

/** Paints the atlas: a blank canvas texture whose cells fill in as each icon image decodes. */
function paintAtlas() {
  const canvas = document.createElement('canvas')
  canvas.width = CELL * COLS
  canvas.height = CELL * ROWS
  const ctx = canvas.getContext('2d')
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.generateMipmaps = false
  texture.minFilter = texture.magFilter = LinearFilter
  ITEM_IDS.forEach((id, i) => {
    const url = iconUrl(id)
    if (!url) return
    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, (i % COLS) * CELL + 4, Math.floor(i / COLS) * CELL + 4, CELL - 8, CELL - 8)
      texture.needsUpdate = true
    }
    img.src = url
  })
  return texture
}

/**
 * The icon mesh for a stage with up to `capacity` crates (starts empty: count 0), and its
 * `dispose()`. Set `mesh.geometry.attributes.aIcon` / the instance matrices per frame.
 */
export function createCrateIcons(capacity) {
  const map = paintAtlas()
  const material = new MeshBasicMaterial({ map, alphaTest: 0.4, fog: false, toneMapped: false })
  // Each instance shows its own cell of the atlas.
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aIcon;')
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
#ifdef USE_MAP
  vMapUv = (vMapUv + vec2(mod(aIcon, ${COLS}.0), ${ROWS - 1}.0 - floor(aIcon / ${COLS}.0))) / vec2(${COLS}.0, ${ROWS}.0);
#endif`,
      )
  }
  material.customProgramCacheKey = () => 'crate-icons'
  const geometry = new PlaneGeometry(1, 1)
  const cells = new InstancedBufferAttribute(new Float32Array(Math.max(1, capacity)), 1)
  geometry.setAttribute('aIcon', cells)
  const mesh = new InstancedMesh(geometry, material, Math.max(1, capacity))
  mesh.name = 'crate-icons'
  mesh.count = 0
  mesh.frustumCulled = false
  return {
    mesh,
    cells,
    dispose() {
      mesh.dispose()
      geometry.dispose()
      material.dispose()
      map.dispose()
    },
  }
}
