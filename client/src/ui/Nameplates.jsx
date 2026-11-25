import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'

import { runtime } from '../game/runtime'
import { remoteOrder } from '../net/remotePlayers'
import { getQuality } from '../store/quality'

/**
 * Name tags over CPU racers and other players: a fixed pool of DOM labels moved by one
 * requestAnimationFrame loop (transform only, no React re-renders), fading with
 * distance and hidden behind the camera. At most the preset's `nameplates` at once,
 * nearest players first, so a full 50-player room doesn't bury the screen in names.
 */

const POOL = 16
const _v = new Vector3()

export default function Nameplates() {
  const root = useRef(null)

  useEffect(() => {
    const el = root.current
    const nodes = Array.from({ length: POOL }, () => {
      const n = document.createElement('div')
      n.className = 'uwd-nameplate'
      n.style.display = 'none'
      el.appendChild(n)
      return n
    })
    const texts = new Array(POOL).fill('')
    let raf = 0
    const place = (i, pos, name, bot) => {
      const cam = runtime.camera.object
      const node = nodes[i]
      if (!cam) return false
      _v.set(pos.x, pos.y + 2.6, pos.z)
      const dist = _v.distanceTo(cam.position)
      const max = getQuality().nameDistance
      if (dist > max) return false
      _v.project(cam)
      if (_v.z > 1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) return false
      const label = bot ? `CPU ${name}` : name
      if (texts[i] !== label) {
        texts[i] = label
        node.textContent = label
        node.dataset.bot = bot ? '1' : '0'
      }
      node.style.display = ''
      node.style.opacity = String(Math.min(1, (max - dist) / 20))
      node.style.transform = `translate(-50%, -100%) translate(${((_v.x + 1) / 2) * el.clientWidth}px, ${((1 - _v.y) / 2) * el.clientHeight}px)`
      return true
    }
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const max = Math.min(POOL, getQuality().nameplates)
      let i = 0
      // Players nearest first (RemoteCars keeps remoteOrder sorted), then CPU racers.
      for (let k = 0; k < remoteOrder.length && i < max; k += 1) {
        const r = remoteOrder[k]
        if (r.lod > 0 && place(i, r.position, r.name, false)) i += 1
      }
      for (let k = 0; k < runtime.bots.length && i < max; k += 1) {
        const b = runtime.bots[k]
        if (place(i, b.position, b.name, true)) i += 1
      }
      for (let k = i; k < POOL; k += 1) nodes[k].style.display = 'none'
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      for (const n of nodes) n.remove()
    }
  }, [])

  return <div ref={root} className="pointer-events-none absolute inset-0 overflow-hidden" />
}
