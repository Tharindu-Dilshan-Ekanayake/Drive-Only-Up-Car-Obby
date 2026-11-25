import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, ShaderMaterial } from 'three'

/**
 * Searchlight beams sweeping the night sky from the rooftops: long soft cones, all in one
 * additive mesh (one draw call), swung by the vertex shader from the clock (no per-frame
 * JavaScript but a uniform). Beam: `{ x, y, z, phase, speed, tilt, color }` - base on a roof,
 * sweeping round (`speed` rad/s, + one way) leaning `tilt` radians off upright.
 */

const SIDES = 10
const LENGTH = 420
const R0 = 0.9
const R1 = 16

const vertex = /* glsl */ `
  attribute vec3 aBase;
  attribute vec3 aBeam;
  attribute vec3 aColor;
  uniform float uTime;
  varying float vAlong;
  varying vec3 vColor;
  varying float vDist;
  varying float vFacing;
  void main() {
    // Sweeps back and forth round the vertical, leaning out by the tilt.
    float az = aBeam.x + sin(uTime * aBeam.y + aBeam.x * 3.0) * 1.4;
    float tilt = aBeam.z;
    vec3 d = vec3(sin(tilt) * cos(az), cos(tilt), sin(tilt) * sin(az));
    vec3 e1 = normalize(cross(d, vec3(0.0, 0.0, 1.0)));
    vec3 e2 = cross(d, e1);
    vec3 wp = aBase + d * position.y + e1 * position.x + e2 * position.z;
    vAlong = position.y / ${LENGTH.toFixed(1)};
    vColor = aColor;
    vec4 mv = viewMatrix * vec4(wp, 1.0);
    vDist = -mv.z;
    // Softer where the cone's side is seen edge on.
    vec3 n = normalize(e1 * position.x + e2 * position.z);
    vFacing = abs(dot(normalize(mat3(viewMatrix) * n), normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv;
  }
`
const fragment = /* glsl */ `
  uniform float uNear;
  uniform float uFar;
  varying float vAlong;
  varying vec3 vColor;
  varying float vDist;
  varying float vFacing;
  void main() {
    float a = pow(1.0 - vAlong, 1.6) * (0.25 + 0.75 * vFacing) * 0.22;
    a *= 1.0 - smoothstep(uNear, uFar, vDist);
    gl_FragColor = vec4(vColor * a, 1.0);
    #include <colorspace_fragment>
  }
`

const _c = new Color()

/**
 * Builds the beams' mesh. `fade` = [near, far] metres from the camera they fade out over.
 * @returns {{ mesh: Mesh, tick: (t: number) => void, dispose: () => void }}
 */
export function buildSearchlights(beams, fade = [250, 600]) {
  const pos = []
  const base = []
  const beam = []
  const col = []
  for (const b of beams) {
    _c.set(b.color || '#bfe6ff')
    for (let i = 0; i < SIDES; i += 1) {
      const a0 = (i / SIDES) * Math.PI * 2
      const a1 = ((i + 1) / SIDES) * Math.PI * 2
      const p = (r, a, y) => [Math.cos(a) * r, y, Math.sin(a) * r]
      const q = [p(R0, a0, 0), p(R0, a1, 0), p(R1, a1, LENGTH), p(R1, a0, LENGTH)]
      for (const k of [0, 1, 2, 0, 2, 3]) {
        pos.push(...q[k])
        base.push(b.x, b.y, b.z)
        beam.push(b.phase, b.speed, b.tilt)
        col.push(_c.r, _c.g, _c.b)
      }
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  geometry.setAttribute('aBase', new BufferAttribute(new Float32Array(base), 3))
  geometry.setAttribute('aBeam', new BufferAttribute(new Float32Array(beam), 3))
  geometry.setAttribute('aColor', new BufferAttribute(new Float32Array(col), 3))
  const material = new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uNear: { value: fade[0] }, uFar: { value: fade[1] } },
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  })
  const mesh = new Mesh(geometry, material)
  mesh.name = 'neon-searchlights'
  // Swung in the shader: the CPU can't know where they are.
  mesh.frustumCulled = false
  mesh.matrixAutoUpdate = false
  mesh.renderOrder = 3
  return {
    mesh,
    tick(t) {
      material.uniforms.uTime.value = t
    },
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
}
