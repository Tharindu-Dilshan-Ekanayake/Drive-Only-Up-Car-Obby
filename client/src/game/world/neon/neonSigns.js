import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, ShaderMaterial, SRGBColorSpace } from 'three'

/**
 * Neon Night City's signs: rooftop signs (dark panels with glowing letters) and floating
 * holographic billboards, all painted by us for our own fictional brands. Like the
 * harbour's billboards (render/banners.js): every design is painted once into a slot of
 * one canvas atlas (2 x 4 slots, 2:1; 1024 px, 512 on LOW) and every sign of a kind is a
 * quad of one mesh - the rooftop signs one opaque draw call, the holograms one additive,
 * flickering, scan-lined draw call, both on the same texture.
 *
 * A sign: `{ art, center: [x,y,z], right: [x,y,z], up: [x,y,z], width, height }` (2:1).
 */

const FONT = '"Fredoka One", "Arial Rounded MT Bold", sans-serif'

export const NEON_ARTS = ['voltCola', 'pixelArcade', 'novaBank', 'skywaveFm', 'hyperNoodle', 'orbitTaxi', 'lunaHotel', 'upWeDrive']

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Glowing neon letters (a soft halo, the coloured tube, a pale core), shrunk to fit `maxW`. */
function neon(ctx, str, x, y, size, maxW, color, { align = 'center', core = '#ffffff' } = {}) {
  let s = size
  ctx.font = `${s}px ${FONT}`
  while (ctx.measureText(str).width > maxW && s > 8) {
    s -= 1
    ctx.font = `${s}px ${FONT}`
  }
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.save()
  ctx.shadowColor = color
  ctx.shadowBlur = s * 0.45
  ctx.lineWidth = s * 0.14
  ctx.strokeStyle = color
  ctx.strokeText(str, x, y)
  ctx.restore()
  ctx.fillStyle = core
  ctx.globalAlpha = 0.85
  ctx.fillText(str, x, y)
  ctx.globalAlpha = 1
}

/** A glowing tube outline: stroke `path()` with a halo. */
function tube(ctx, color, width, path) {
  ctx.save()
  ctx.shadowColor = color
  ctx.shadowBlur = width * 3
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  path()
  ctx.stroke()
  ctx.restore()
}

/** The board every design shares: near-black with a neon frame (black reads as clear in a hologram). */
function frame(ctx, w, h, color) {
  ctx.fillStyle = '#05060d'
  rr(ctx, 0, 0, w, h, h * 0.08)
  ctx.fill()
  tube(ctx, color, h * 0.022, () => rr(ctx, w * 0.03, h * 0.07, w * 0.94, h * 0.86, h * 0.07))
}

const PAINTERS = {
  voltCola(ctx, w, h) {
    frame(ctx, w, h, '#2de2ff')
    // A can with a lightning bolt.
    tube(ctx, '#2de2ff', h * 0.025, () => rr(ctx, w * 0.08, h * 0.24, w * 0.1, h * 0.56, h * 0.05))
    tube(ctx, '#ffe23a', h * 0.03, () => {
      ctx.beginPath()
      ctx.moveTo(w * 0.145, h * 0.3)
      ctx.lineTo(w * 0.11, h * 0.52)
      ctx.lineTo(w * 0.14, h * 0.52)
      ctx.lineTo(w * 0.115, h * 0.72)
    })
    neon(ctx, 'VOLT COLA', w * 0.6, h * 0.42, h * 0.3, w * 0.7, '#2de2ff')
    neon(ctx, 'CHARGED WITH FIZZ', w * 0.6, h * 0.74, h * 0.11, w * 0.66, '#ffe23a', { core: '#fff8c0' })
  },
  pixelArcade(ctx, w, h) {
    frame(ctx, w, h, '#ff3df0')
    // A blocky pixel critter of our own.
    const px = h * 0.06
    const grid = ['0011100', '0111110', '1101011', '1111111', '1011101', '1000001']
    ctx.save()
    ctx.shadowColor = '#7cff5a'
    ctx.shadowBlur = px * 1.5
    ctx.fillStyle = '#7cff5a'
    grid.forEach((row, j) => [...row].forEach((v, i) => v === '1' && ctx.fillRect(w * 0.07 + i * px, h * 0.3 + j * px, px * 0.9, px * 0.9)))
    ctx.restore()
    neon(ctx, 'PIXEL ARCADE', w * 0.62, h * 0.42, h * 0.27, w * 0.66, '#ff3df0')
    neon(ctx, 'INSERT COIN · OPEN 24/7', w * 0.62, h * 0.74, h * 0.1, w * 0.62, '#7cff5a', { core: '#e6ffe0' })
  },
  novaBank(ctx, w, h) {
    frame(ctx, w, h, '#ffd23a')
    // A star burst.
    tube(ctx, '#ffd23a', h * 0.025, () => {
      ctx.beginPath()
      for (let i = 0; i < 16; i += 1) {
        const a = (i / 16) * Math.PI * 2 - Math.PI / 2
        const k = i % 2 ? h * 0.1 : h * 0.26
        ctx.lineTo(w * 0.15 + Math.cos(a) * k, h * 0.5 + Math.sin(a) * k)
      }
      ctx.closePath()
    })
    neon(ctx, 'NOVA BANK', w * 0.62, h * 0.42, h * 0.3, w * 0.66, '#ffd23a', { core: '#fffbe8' })
    neon(ctx, 'YOUR MONEY, SKY HIGH', w * 0.62, h * 0.74, h * 0.11, w * 0.62, '#ffffff', { core: '#ffffff' })
  },
  skywaveFm(ctx, w, h) {
    frame(ctx, w, h, '#9b6bff')
    for (let i = 1; i <= 3; i += 1) {
      tube(ctx, '#2de2ff', h * 0.025, () => {
        ctx.beginPath()
        ctx.arc(w * 0.12, h * 0.55, h * 0.09 * i, -Math.PI * 0.32, Math.PI * 0.32)
      })
    }
    neon(ctx, 'SKYWAVE FM', w * 0.6, h * 0.42, h * 0.29, w * 0.7, '#9b6bff', { core: '#efe6ff' })
    neon(ctx, '101.7 · NIGHT DRIVE HITS', w * 0.6, h * 0.74, h * 0.1, w * 0.64, '#2de2ff', { core: '#e0fbff' })
  },
  hyperNoodle(ctx, w, h) {
    frame(ctx, w, h, '#ff7a2d')
    // A steaming bowl with chopsticks.
    tube(ctx, '#ff7a2d', h * 0.028, () => {
      ctx.beginPath()
      ctx.arc(w * 0.15, h * 0.5, h * 0.2, 0, Math.PI)
      ctx.closePath()
    })
    tube(ctx, '#ffd23a', h * 0.02, () => {
      ctx.beginPath()
      ctx.moveTo(w * 0.1, h * 0.2)
      ctx.lineTo(w * 0.17, h * 0.46)
      ctx.moveTo(w * 0.14, h * 0.18)
      ctx.lineTo(w * 0.19, h * 0.46)
    })
    neon(ctx, 'HYPER NOODLE', w * 0.62, h * 0.42, h * 0.27, w * 0.66, '#ff7a2d', { core: '#fff0e0' })
    neon(ctx, 'HOT BOWLS · OPEN ALL NIGHT', w * 0.62, h * 0.74, h * 0.1, w * 0.62, '#ff3d6e', { core: '#ffe6ec' })
  },
  orbitTaxi(ctx, w, h) {
    frame(ctx, w, h, '#ffe23a')
    // A little car inside an orbit ring.
    tube(ctx, '#ffe23a', h * 0.025, () => {
      ctx.beginPath()
      ctx.ellipse(w * 0.15, h * 0.52, h * 0.27, h * 0.12, -0.25, 0, Math.PI * 2)
    })
    ctx.save()
    ctx.shadowColor = '#ffe23a'
    ctx.shadowBlur = h * 0.04
    ctx.fillStyle = '#ffe23a'
    rr(ctx, w * 0.1, h * 0.46, w * 0.1, h * 0.1, h * 0.03)
    ctx.fill()
    rr(ctx, w * 0.125, h * 0.38, w * 0.05, h * 0.1, h * 0.03)
    ctx.fill()
    ctx.restore()
    neon(ctx, 'ORBIT TAXI', w * 0.62, h * 0.42, h * 0.3, w * 0.66, '#ffe23a', { core: '#fffbe0' })
    neon(ctx, 'RIDE THE SKYLINE', w * 0.62, h * 0.74, h * 0.11, w * 0.62, '#2de2ff', { core: '#e0fbff' })
  },
  lunaHotel(ctx, w, h) {
    frame(ctx, w, h, '#ff6ec7')
    // A crescent moon and a star.
    tube(ctx, '#ffffff', h * 0.025, () => {
      ctx.beginPath()
      ctx.arc(w * 0.15, h * 0.5, h * 0.22, Math.PI * 0.35, Math.PI * 1.65)
      ctx.arc(w * 0.19, h * 0.45, h * 0.17, Math.PI * 1.5, Math.PI * 0.5, true)
    })
    neon(ctx, 'LUNA HOTEL', w * 0.62, h * 0.42, h * 0.3, w * 0.66, '#ff6ec7', { core: '#fff0fa' })
    neon(ctx, 'ROOMS ABOVE THE CLOUDS', w * 0.62, h * 0.74, h * 0.1, w * 0.62, '#ffffff', { core: '#ffffff' })
  },
  upWeDrive(ctx, w, h) {
    frame(ctx, w, h, '#2de2ff')
    // A road climbing to the right with glowing kerbs.
    tube(ctx, '#ff3df0', h * 0.025, () => {
      ctx.beginPath()
      ctx.moveTo(w * 0.06, h * 0.84)
      ctx.lineTo(w * 0.3, h * 0.2)
    })
    tube(ctx, '#2de2ff', h * 0.025, () => {
      ctx.beginPath()
      ctx.moveTo(w * 0.2, h * 0.84)
      ctx.lineTo(w * 0.36, h * 0.2)
    })
    neon(ctx, 'UP WE DRIVE', w * 0.64, h * 0.4, h * 0.28, w * 0.6, '#2de2ff')
    neon(ctx, 'NEON NIGHT CITY', w * 0.64, h * 0.72, h * 0.14, w * 0.58, '#ff3df0', { core: '#ffe6fb' })
  },
}

const holoVertex = /* glsl */ `
  attribute float aSeed;
  varying vec2 vUv;
  varying float vSeed;
  varying float vY;
  varying float vDist;
  void main() {
    vUv = uv;
    vSeed = aSeed;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vY = wp.y;
    vec4 mv = viewMatrix * wp;
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`
const holoFragment = /* glsl */ `
  uniform sampler2D map;
  uniform float uTime;
  uniform float uNear;
  uniform float uFar;
  varying vec2 vUv;
  varying float vSeed;
  varying float vY;
  varying float vDist;
  void main() {
    vec3 t = texture2D(map, vUv).rgb;
    // Scan lines rolling up, a shimmer, and now and then a dropout.
    float scan = 0.7 + 0.3 * sin(vY * 7.0 - uTime * 6.0);
    float shimmer = 0.9 + 0.1 * sin(uTime * 13.0 + vSeed * 40.0);
    float drop = step(0.97, fract(sin(floor(uTime * 6.0) + vSeed * 91.7) * 43758.5));
    float fade = 1.0 - smoothstep(uNear, uFar, vDist);
    vec3 col = t * 1.35 * scan * shimmer * (1.0 - 0.7 * drop) + vec3(0.02, 0.06, 0.09) * (1.0 - drop);
    gl_FragColor = vec4(col * fade, 1.0);
    #include <colorspace_fragment>
  }
`

/** Painted atlases by size (refcounted, shared by the sign and the hologram meshes). */
const atlases = new Map()

function acquireAtlas(size) {
  let a = atlases.get(size)
  if (!a) {
    const rows = Math.ceil(NEON_ARTS.length / 2)
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = (size / 4) * rows
    const H = canvas.height
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, size, H)
    const sw = size / 2
    const sh = size / 4
    const pad = Math.max(2, size / 256)
    const slot = {}
    NEON_ARTS.forEach((art, i) => {
      const x = (i % 2) * sw
      const y = Math.floor(i / 2) * sh
      ctx.save()
      ctx.translate(x + pad, y + pad)
      PAINTERS[art](ctx, sw - pad * 2, sh - pad * 2)
      ctx.restore()
      slot[art] = [(x + pad) / size, 1 - (y + sh - pad) / H, (x + sw - pad) / size, 1 - (y + pad) / H]
    })
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = 4
    a = { slot, texture, users: 0 }
    atlases.set(size, a)
  }
  a.users += 1
  return a
}

function releaseAtlas(size) {
  const a = atlases.get(size)
  if (!a) return
  a.users -= 1
  if (a.users > 0) return
  a.texture.dispose()
  atlases.delete(size)
}

/**
 * Builds one mesh of signs: `kind` 'sign' (opaque rooftop signs) or 'holo' (holograms:
 * additive, double-sided, scan-lined; `fade` = [near, far] metres they fade out over).
 * `maxTexture` caps the atlas (1024, or 512 on LOW).
 * @returns {{ mesh: Mesh, tick: (t: number) => void, dispose: () => void }}
 */
export function buildNeonSignMesh(signs, kind, maxTexture = 1024, fade = [200, 560]) {
  const size = Math.min(1024, maxTexture)
  const atlas = acquireAtlas(size)
  const pos = []
  const uv = []
  const seed = []
  signs.forEach((b, k) => {
    const [u0, v0, u1, v1] = atlas.slot[b.art] || atlas.slot[NEON_ARTS[0]]
    const hw = b.width / 2
    const hh = b.height / 2
    const c = b.center
    const corner = (sx, sy) => [c[0] + b.right[0] * hw * sx + b.up[0] * hh * sy, c[1] + b.right[1] * hw * sx + b.up[1] * hh * sy, c[2] + b.right[2] * hw * sx + b.up[2] * hh * sy]
    const a = corner(-1, -1)
    const bb = corner(1, -1)
    const cc = corner(1, 1)
    const d = corner(-1, 1)
    pos.push(...a, ...bb, ...cc, ...a, ...cc, ...d)
    uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1)
    for (let i = 0; i < 6; i += 1) seed.push((k * 0.618) % 1)
  })
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  geometry.setAttribute('aSeed', new BufferAttribute(new Float32Array(seed), 1))
  geometry.computeBoundingSphere()
  let material
  if (kind === 'holo') {
    material = new ShaderMaterial({
      uniforms: { map: { value: atlas.texture }, uTime: { value: 0 }, uNear: { value: fade[0] }, uFar: { value: fade[1] } },
      vertexShader: holoVertex,
      fragmentShader: holoFragment,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    })
  } else {
    material = new MeshBasicMaterial({ map: atlas.texture })
  }
  const mesh = new Mesh(geometry, material)
  mesh.name = kind === 'holo' ? 'neon-holograms' : 'neon-signs'
  mesh.matrixAutoUpdate = false
  if (kind === 'holo') mesh.renderOrder = 2
  return {
    mesh,
    tick(t) {
      if (material.uniforms) material.uniforms.uTime.value = t
    },
    dispose() {
      geometry.dispose()
      material.dispose()
      releaseAtlas(size)
    },
  }
}
