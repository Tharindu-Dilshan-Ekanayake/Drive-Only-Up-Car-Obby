import { BufferAttribute, BufferGeometry, Color } from 'three'

/**
 * Collects flat-shaded triangles (position, normal, colour, pattern) and turns them
 * into one BufferGeometry, so a whole section of track, the pier, or a kind of
 * scenery is a single draw call with the shared world material.
 */

const _c = new Color()

export class MeshBuilder {
  constructor() {
    this.pos = []
    this.nrm = []
    this.col = []
    this.pat = []
  }

  get triangles() {
    return this.pos.length / 9
  }

  /** One triangle with a flat normal. `color` is a Color or css string. */
  tri(a, b, c, color, pattern = 0, coords = [0, 0, 0]) {
    const ux = b[0] - a[0]
    const uy = b[1] - a[1]
    const uz = b[2] - a[2]
    const vx = c[0] - a[0]
    const vy = c[1] - a[1]
    const vz = c[2] - a[2]
    let nx = uy * vz - uz * vy
    let ny = uz * vx - ux * vz
    let nz = ux * vy - uy * vx
    const l = Math.hypot(nx, ny, nz) || 1
    nx /= l
    ny /= l
    nz /= l
    const col = typeof color === 'string' ? _c.set(color) : color
    for (let i = 0; i < 3; i += 1) {
      const p = i === 0 ? a : i === 1 ? b : c
      this.pos.push(p[0], p[1], p[2])
      this.nrm.push(nx, ny, nz)
      this.col.push(col.r, col.g, col.b)
      this.pat.push(pattern, coords[i])
    }
  }

  /** Quad a-b-c-d (counter-clockwise seen from the front). */
  quad(a, b, c, d, color, pattern = 0, coords = [0, 0, 0, 0]) {
    this.tri(a, b, c, color, pattern, [coords[0], coords[1], coords[2]])
    this.tri(a, c, d, color, pattern, [coords[0], coords[2], coords[3]])
  }

  /**
   * An oriented box: centre c, half extents h, axes ax/ay/az (arrays).
   * `colors`: { top, side, bottom, end } (end = the faces across the length axis).
   * `patterns`: same keys, pattern ids; the pattern coordinate is the distance along
   * `along` (defaults to the box's az axis) so stripes run along the box.
   * `skip`: face names to leave out ('bottom', 'top', 'end').
   */
  box(c, h, ax, ay, az, colors, patterns = {}, opts = {}) {
    const along = opts.along || az
    const corner = (sx, sy, sz) => [
      c[0] + ax[0] * h[0] * sx + ay[0] * h[1] * sy + az[0] * h[2] * sz,
      c[1] + ax[1] * h[0] * sx + ay[1] * h[1] * sy + az[1] * h[2] * sz,
      c[2] + ax[2] * h[0] * sx + ay[2] * h[1] * sy + az[2] * h[2] * sz,
    ]
    const coord = (p) => p[0] * along[0] + p[1] * along[1] + p[2] * along[2]
    const face = (name, a, b, cc, d) => {
      if (opts.skip?.includes(name)) return
      const color = colors[name] || colors.side
      const pattern = patterns[name] ?? patterns.side ?? 0
      this.quad(a, b, cc, d, color, pattern, [coord(a), coord(b), coord(cc), coord(d)])
    }
    const p = [
      corner(-1, -1, -1),
      corner(1, -1, -1),
      corner(1, 1, -1),
      corner(-1, 1, -1),
      corner(-1, -1, 1),
      corner(1, -1, 1),
      corner(1, 1, 1),
      corner(-1, 1, 1),
    ]
    face('top', p[3], p[7], p[6], p[2])
    face('bottom', p[0], p[1], p[5], p[4])
    face('side', p[0], p[4], p[7], p[3]) // -x
    face('side', p[1], p[2], p[6], p[5]) // +x
    face('end', p[4], p[5], p[6], p[7]) // +z
    face('end', p[0], p[3], p[2], p[1]) // -z
  }

  /** Axis-aligned box from min/max corners, a convenience for props. */
  aabb(min, max, colors, patterns) {
    const c = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
    const h = [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2]
    // A single colour (css string or Color) paints every face.
    const single = typeof colors === 'string' || colors?.isColor
    this.box(c, h, [1, 0, 0], [0, 1, 0], [0, 0, 1], single ? { top: colors, side: colors, bottom: colors, end: colors } : colors, patterns)
  }

  /** Upright n-sided prism (cylinder) from y0 to y1 at (x, z). */
  prism(x, z, y0, y1, r, n, color, capColor = color, pattern = 0) {
    for (let i = 0; i < n; i += 1) {
      const a0 = (i / n) * Math.PI * 2
      const a1 = ((i + 1) / n) * Math.PI * 2
      const p0 = [x + Math.cos(a0) * r, y0, z + Math.sin(a0) * r]
      const p1 = [x + Math.cos(a1) * r, y0, z + Math.sin(a1) * r]
      const p2 = [x + Math.cos(a1) * r, y1, z + Math.sin(a1) * r]
      const p3 = [x + Math.cos(a0) * r, y1, z + Math.sin(a0) * r]
      this.quad(p0, p3, p2, p1, color, pattern, [y0, y1, y1, y0])
      this.tri([x, y1, z], p2, p3, capColor)
    }
  }

  /** Appends another builder's triangles. */
  merge(other) {
    this.pos.push(...other.pos)
    this.nrm.push(...other.nrm)
    this.col.push(...other.col)
    this.pat.push(...other.pat)
  }

  build() {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3))
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nrm), 3))
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3))
    g.setAttribute('aPattern', new BufferAttribute(new Float32Array(this.pat), 2))
    g.computeBoundingSphere()
    g.computeBoundingBox()
    return g
  }
}
