// Shared building blocks for the studio scene: the palette, cached materials and geometries, small mesh helpers, and
// the textures painted on canvases at start (oak herringbone, polished concrete, rugs, bouclé, art, the sky outside).

import * as THREE from 'three'
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js'

export const P = {
  wallBack: 0xf3ebdf,
  wallLeft: 0xefe5d6,
  wallCap: 0xdccdb8,
  trim: 0xe4d6c2,
  base: 0xcdb99c,
  baseSide: 0xbfa98a,
  oak: 0xdccbb2,
  oakLight: 0xe6c9a3,
  oakDark: 0xb8936b,
  ash: 0xe8d4b5,
  travertine: 0xebdfcb,
  travertineDeep: 0xdccbb0,
  concrete: 0xd8d0c4,
  terracotta: 0xc8775a,
  terracottaDeep: 0xa95f45,
  claude: 0xd97757,
  sage: 0x9fb39a,
  sageDeep: 0x7f977a,
  apricot: 0xeab68f,
  peach: 0xf2c9ad,
  beige: 0xe9dcc6,
  oat: 0xe4d8c4,
  boucle: 0xf4eee4,
  brass: 0xc9a05a,
  aluminum: 0xd3d6da,
  graphite: 0x55504c,
  leaf: 0x6e9a62,
  leafDeep: 0x4f7c4b,
  leafLight: 0x8db67c,
  pot: 0xece4d7,
  dustyBlue: 0x9cb0bb,
  lavender: 0xc3b6d6,
  ink: 0x3f332c,
}

const mats = new Map()
/** A matte standard material, cached by its settings so the scene shares them. */
export function mat(color, opts = {}) {
  const key = color + '|' + Object.entries(opts).map(([k, v]) => `${k}=${v && v.uuid ? v.uuid : v}`).join(',')
  let m = mats.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, ...opts })
    mats.set(key, m)
  }
  return m
}
export const brass = () => mat(P.brass, { metalness: 0.85, roughness: 0.32 })
export const aluminum = () => mat(P.aluminum, { metalness: 0.65, roughness: 0.3 })

const geos = new Map()
function cached(key, make) {
  let g = geos.get(key)
  if (!g) {
    g = make()
    geos.set(key, g)
  }
  return g
}
/** A box with rounded edges; the radius is kept inside the box. */
export function rbox(w, h, d, r = 0.04, seg = 3) {
  const rr = Math.max(0.001, Math.min(r, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002))
  return cached(`rb${w},${h},${d},${rr},${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, rr))
}
export function cyl(rt, rb, h, seg = 28) {
  return cached(`cy${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg))
}
export function sph(r, ws = 24, hs = 16) {
  return cached(`sp${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs))
}
export function capsule(r, len, seg = 10) {
  return cached(`ca${r},${len},${seg}`, () => new THREE.CapsuleGeometry(r, len, 6, seg))
}

/** Adds a mesh to `parent` at (x, y, z); casts and receives soft shadows unless told otherwise. */
export function put(parent, geo, material, x = 0, y = 0, z = 0, o = {}) {
  const m = new THREE.Mesh(geo, material)
  m.position.set(x, y, z)
  if (o.rx) m.rotation.x = o.rx
  if (o.ry) m.rotation.y = o.ry
  if (o.rz) m.rotation.z = o.rz
  if (o.s) Array.isArray(o.s) ? m.scale.set(o.s[0], o.s[1], o.s[2]) : m.scale.setScalar(o.s)
  m.castShadow = o.cast ?? true
  m.receiveShadow = o.receive ?? true
  parent.add(m)
  return m
}

export function group(parent, x = 0, y = 0, z = 0, ry = 0) {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  g.rotation.y = ry
  parent.add(g)
  return g
}

/** A seeded random source, so the room looks the same every time it opens. */
export function seeded(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------------------------------------- canvas textures

function canvas(w, h, draw) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

const hex = n => '#' + n.toString(16).padStart(6, '0')
function shade(n, f) {
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)))
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)))
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)))
  return `rgb(${r},${g},${b})`
}

/** Oak planks laid in herringbone: L-shaped pairs along the diagonal, the strips 4 planks apart. */
export function herringbone() {
  return canvas(512, 512, (g, W) => {
    const u = 16
    const rnd = seeded(7)
    g.fillStyle = shade(P.oakDark, 0.95)
    g.fillRect(0, 0, W, W)
    const plank = (x, y, w, h) => {
      for (const dx of [-W, 0, W])
        for (const dy of [-W, 0, W]) {
          const px = x * u + dx
          const py = y * u + dy
          if (px > W || py > W || px + w * u < 0 || py + h * u < 0) continue
          const f = 0.93 + rnd() * 0.12
          g.fillStyle = shade(P.oak, f)
          g.fillRect(px + 0.6, py + 0.6, w * u - 1.2, h * u - 1.2)
          g.strokeStyle = 'rgba(120,80,40,0.10)'
          g.lineWidth = 1
          for (let k = 0; k < 3; k++) {
            g.beginPath()
            if (w > h) {
              const yy = py + 3 + rnd() * (h * u - 6)
              g.moveTo(px + 2, yy)
              g.bezierCurveTo(px + w * u * 0.3, yy + rnd() * 3 - 1.5, px + w * u * 0.6, yy + rnd() * 3 - 1.5, px + w * u - 2, yy)
            } else {
              const xx = px + 3 + rnd() * (w * u - 6)
              g.moveTo(xx, py + 2)
              g.bezierCurveTo(xx + rnd() * 3 - 1.5, py + h * u * 0.3, xx + rnd() * 3 - 1.5, py + h * u * 0.6, xx, py + h * u - 2)
            }
            g.stroke()
          }
        }
    }
    const n = W / u
    for (let s = -n; s <= n; s += 1)
      for (let i = -n; i <= 2 * n; i++) {
        const ox = i + 4 * s
        const oy = i - 4 * s
        if (ox < -6 || oy < -6 || ox > n + 2 || oy > n + 2) continue
        plank(ox, oy, 4, 1)
        plank(ox, oy + 1, 1, 4)
      }
  })
}

/** Warm polished concrete: soft clouds of tone and a fine speckle. */
export function concrete() {
  return canvas(512, 512, (g, W) => {
    const rnd = seeded(11)
    g.fillStyle = hex(P.concrete)
    g.fillRect(0, 0, W, W)
    for (let i = 0; i < 70; i++) {
      const x = rnd() * W
      const y = rnd() * W
      const r = 30 + rnd() * 90
      const grad = g.createRadialGradient(x, y, 0, x, y, r)
      const tone = rnd() > 0.5 ? '255,250,240' : '150,135,115'
      grad.addColorStop(0, `rgba(${tone},${0.05 + rnd() * 0.06})`)
      grad.addColorStop(1, `rgba(${tone},0)`)
      g.fillStyle = grad
      for (const dx of [-W, 0, W]) for (const dy of [-W, 0, W]) g.fillRect(x - r + dx, y - r + dy, r * 2, r * 2)
    }
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = rnd() > 0.5 ? 'rgba(110,95,80,0.18)' : 'rgba(255,255,250,0.25)'
      g.fillRect(rnd() * W, rnd() * W, 1.2, 1.2)
    }
  })
}

/** The lounge rug: sage field, apricot arches, terracotta dots, a cream border. */
export function rugTexture() {
  return canvas(1024, 768, (g, W, H) => {
    g.fillStyle = '#efe4d2'
    g.fillRect(0, 0, W, H)
    g.fillStyle = hex(P.sage)
    g.fillRect(36, 36, W - 72, H - 72)
    g.fillStyle = '#b9c7b2'
    g.fillRect(70, 70, W - 140, H - 140)
    const arch = (x, y, r, col) => {
      g.fillStyle = col
      g.beginPath()
      g.arc(x, y, r, Math.PI, 0)
      g.lineTo(x + r, y + r * 0.9)
      g.lineTo(x - r, y + r * 0.9)
      g.closePath()
      g.fill()
    }
    arch(250, 330, 120, hex(P.apricot))
    arch(250, 330, 70, '#f3dcc6')
    arch(760, 470, 140, hex(P.peach))
    arch(760, 470, 82, hex(P.terracotta))
    g.fillStyle = hex(P.terracotta)
    for (let i = 0; i < 9; i++) {
      g.beginPath()
      g.arc(430 + i * 34, 600, 9, 0, Math.PI * 2)
      g.fill()
    }
    g.strokeStyle = '#efe4d2'
    g.lineWidth = 10
    g.beginPath()
    g.moveTo(420, 150)
    for (let i = 0; i < 8; i++) g.quadraticCurveTo(450 + i * 40, i % 2 ? 120 : 185, 470 + i * 40, 150)
    g.stroke()
    g.fillStyle = 'rgba(255,250,240,0.12)'
    const rnd = seeded(5)
    for (let i = 0; i < 9000; i++) g.fillRect(rnd() * W, rnd() * H, 2, 2)
  })
}

/** A round wool rug under the pods: terracotta and peach rings. */
export function roundRugTexture(a = P.peach, b = P.terracotta) {
  return canvas(512, 512, (g, W) => {
    const c = W / 2
    const rings = [
      [250, '#efe4d2'],
      [236, hex(a)],
      [190, '#efe4d2'],
      [176, hex(b)],
      [120, hex(a)],
      [60, '#efe4d2'],
    ]
    for (const [r, col] of rings) {
      g.fillStyle = col
      g.beginPath()
      g.arc(c, c, r, 0, Math.PI * 2)
      g.fill()
    }
    const rnd = seeded(9)
    g.fillStyle = 'rgba(255,250,240,0.12)'
    for (let i = 0; i < 5000; i++) g.fillRect(rnd() * W, rnd() * W, 2, 2)
  })
}

/** Bouclé: small loops of wool, used as a bump map. */
export function boucleBump() {
  const t = canvas(256, 256, (g, W) => {
    const rnd = seeded(3)
    g.fillStyle = '#808080'
    g.fillRect(0, 0, W, W)
    for (let i = 0; i < 1800; i++) {
      const x = rnd() * W
      const y = rnd() * W
      const r = 2 + rnd() * 3.5
      g.strokeStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.35)'
      g.lineWidth = 1.4
      g.beginPath()
      g.arc(x, y, r, 0, Math.PI * 2)
      g.stroke()
    }
  })
  t.colorSpace = THREE.NoColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/** A framed abstract print: a sun, an arch and a hill in the room's colours. */
export function artTexture(kind) {
  return canvas(256, 320, (g, W, H) => {
    g.fillStyle = '#f6efe4'
    g.fillRect(0, 0, W, H)
    if (kind === 0) {
      g.fillStyle = hex(P.apricot)
      g.beginPath()
      g.arc(150, 110, 52, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = hex(P.sage)
      g.beginPath()
      g.ellipse(110, 300, 150, 110, 0, Math.PI, 0)
      g.fill()
      g.fillStyle = hex(P.terracotta)
      g.fillRect(60, 170, 26, 90)
    } else if (kind === 1) {
      g.fillStyle = hex(P.terracotta)
      g.beginPath()
      g.arc(W / 2, 200, 80, Math.PI, 0)
      g.lineTo(W / 2 + 80, 290)
      g.lineTo(W / 2 - 80, 290)
      g.fill()
      g.fillStyle = hex(P.peach)
      g.beginPath()
      g.arc(W / 2, 200, 45, Math.PI, 0)
      g.lineTo(W / 2 + 45, 290)
      g.lineTo(W / 2 - 45, 290)
      g.fill()
      g.fillStyle = hex(P.sageDeep)
      g.beginPath()
      g.arc(70, 70, 22, 0, Math.PI * 2)
      g.fill()
    } else {
      g.strokeStyle = hex(P.sageDeep)
      g.lineWidth = 9
      g.lineCap = 'round'
      g.beginPath()
      g.moveTo(40, 80)
      for (let i = 0; i < 5; i++) g.quadraticCurveTo(60 + i * 36, i % 2 ? 50 : 110, 76 + i * 36, 80)
      g.stroke()
      g.fillStyle = hex(P.apricot)
      g.fillRect(50, 150, 90, 120)
      g.fillStyle = hex(P.terracotta)
      g.beginPath()
      g.arc(170, 220, 46, 0, Math.PI * 2)
      g.fill()
    }
  })
}

/** What the windows look onto: a soft morning sky, distant sage trees and a low sun. */
export function skyTexture() {
  return canvas(1024, 512, (g, W, H) => {
    const sky = g.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#bcd3dc')
    sky.addColorStop(0.55, '#f1e3cf')
    sky.addColorStop(1, '#f6dcc2')
    g.fillStyle = sky
    g.fillRect(0, 0, W, H)
    const sun = g.createRadialGradient(760, 250, 0, 760, 250, 260)
    sun.addColorStop(0, 'rgba(255,240,210,0.95)')
    sun.addColorStop(0.2, 'rgba(255,226,180,0.55)')
    sun.addColorStop(1, 'rgba(255,226,180,0)')
    g.fillStyle = sun
    g.fillRect(0, 0, W, H)
    const rnd = seeded(21)
    for (const [y0, col, n] of [
      [340, '#b9c7ad', 26],
      [380, '#9fb39a', 20],
      [430, '#87a083', 16],
    ]) {
      g.fillStyle = col
      for (let i = 0; i < n; i++) {
        const x = rnd() * W
        const r = 30 + rnd() * 50
        g.beginPath()
        g.ellipse(x, y0 + rnd() * 20, r, r * 1.2, 0, 0, Math.PI * 2)
        g.fill()
      }
      g.fillRect(0, y0 + 30, W, H)
    }
    g.fillStyle = 'rgba(255,255,255,0.5)'
    for (const [x, y, w] of [
      [180, 90, 140],
      [520, 60, 110],
      [880, 120, 90],
    ]) {
      g.beginPath()
      g.ellipse(x, y, w, 16, 0, 0, Math.PI * 2)
      g.ellipse(x + w * 0.3, y - 10, w * 0.5, 16, 0, 0, Math.PI * 2)
      g.fill()
    }
  })
}

/** The same windows after dark: a deep blue sky with stars and a moon over a city skyline full of lit windows. */
export function nightSkyTexture() {
  return canvas(1024, 512, (g, W, H) => {
    const sky = g.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#0d1430')
    sky.addColorStop(0.5, '#1d2148')
    sky.addColorStop(0.78, '#3a2e52')
    sky.addColorStop(1, '#4a3348')
    g.fillStyle = sky
    g.fillRect(0, 0, W, H)
    const rnd = seeded(23)
    for (let i = 0; i < 140; i++) {
      g.fillStyle = `rgba(255,248,230,${0.25 + rnd() * 0.6})`
      const r = rnd() < 0.1 ? 1.6 : 0.9
      g.beginPath()
      g.arc(rnd() * W, rnd() * H * 0.55, r, 0, Math.PI * 2)
      g.fill()
    }
    // the moon, with a soft halo
    const halo = g.createRadialGradient(780, 110, 0, 780, 110, 120)
    halo.addColorStop(0, 'rgba(255,240,215,0.45)')
    halo.addColorStop(1, 'rgba(255,240,215,0)')
    g.fillStyle = halo
    g.fillRect(600, 0, 360, 260)
    g.fillStyle = '#fbf0d8'
    g.beginPath()
    g.arc(780, 110, 30, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#1d2148'
    g.beginPath()
    g.arc(794, 100, 27, 0, Math.PI * 2)
    g.fill()
    // a glow over the city
    const city = g.createLinearGradient(0, H * 0.55, 0, H)
    city.addColorStop(0, 'rgba(255,170,120,0)')
    city.addColorStop(1, 'rgba(255,170,120,0.28)')
    g.fillStyle = city
    g.fillRect(0, H * 0.55, W, H)
    // two rows of towers, the far one paler, each with warm windows
    for (const [base, col, lit, n] of [
      [330, '#2a2a4a', 'rgba(255,214,150,0.55)', 22],
      [380, '#191a33', 'rgba(255,205,130,0.9)', 16],
    ]) {
      let x = -20
      for (let i = 0; i < n && x < W; i++) {
        const w = 40 + rnd() * 70
        const h = 60 + rnd() * 170
        const top = base - h + (base === 330 ? 0 : 60)
        g.fillStyle = col
        g.fillRect(x, top, w, H - top)
        if (rnd() < 0.3) g.fillRect(x + w * 0.45, top - 18, 3, 18)
        for (let wy = top + 10; wy < H - 10; wy += 14)
          for (let wx = x + 6; wx < x + w - 8; wx += 11)
            if (rnd() < 0.42) {
              g.fillStyle = lit
              g.fillRect(wx, wy, 5, 7)
            }
        x += w + 4 + rnd() * 16
      }
    }
    // a red light on the tallest mast
    g.fillStyle = 'rgba(255,90,90,0.9)'
    g.beginPath()
    g.arc(312, 160, 3, 0, Math.PI * 2)
    g.fill()
  })
}

/** Words on a transparent canvas, for small signs (white, so a material can tint them). */
export function textTexture(text, { width = 512, height = 128, font = '700 72px "Segoe UI", sans-serif', glow = 0 } = {}) {
  return canvas(width, height, (g, W, H) => {
    g.font = font
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    if (glow) {
      g.shadowColor = 'rgba(255,255,255,0.9)'
      g.shadowBlur = glow
    }
    g.fillStyle = '#ffffff'
    g.fillText(text, W / 2, H / 2 + 4)
  })
}

/** A soft round glow for lamps, lanterns and dust. */
export function glowTexture() {
  return canvas(128, 128, (g, W) => {
    const grad = g.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2)
    grad.addColorStop(0, 'rgba(255,236,200,1)')
    grad.addColorStop(0.25, 'rgba(255,214,160,0.55)')
    grad.addColorStop(1, 'rgba(255,200,140,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, W, W)
  })
}

/** The face of the analog wall clock (the hands are meshes). */
export function clockFace() {
  return canvas(256, 256, (g, W) => {
    const c = W / 2
    g.fillStyle = '#fbf6ee'
    g.beginPath()
    g.arc(c, c, c, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = hex(P.ink)
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      const r0 = i % 3 === 0 ? 92 : 100
      g.save()
      g.translate(c + Math.sin(a) * r0, c - Math.cos(a) * r0)
      g.rotate(a)
      g.fillRect(-2.5, -(i % 3 === 0 ? 12 : 5), 5, i % 3 === 0 ? 20 : 10)
      g.restore()
    }
  })
}

/**
 * Code on the screens: a warm dark editor whose lines scroll while someone types. One texture serves every lit
 * screen; `tick` repaints it.
 */
export function codeScreen() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 160
  const g = c.getContext('2d')
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  const rnd = seeded(42)
  const colours = ['#e8b48f', '#a9c3a2', '#f1e6d6', '#d98a6c', '#c3b6d6', '#9cc2cf']
  const lines = []
  const newLine = () => {
    const indent = Math.floor(rnd() * 4) * 12
    const parts = []
    let x = 14 + indent
    const n = 1 + Math.floor(rnd() * 4)
    for (let i = 0; i < n && x < 230; i++) {
      const w = 12 + rnd() * 46
      parts.push([x, Math.min(w, 240 - x), colours[Math.floor(rnd() * colours.length)]])
      x += w + 6
    }
    return parts
  }
  for (let i = 0; i < 14; i++) lines.push(newLine())
  let offset = 0
  const paint = () => {
    g.fillStyle = '#2d2724'
    g.fillRect(0, 0, 256, 160)
    g.fillStyle = '#3a322e'
    g.fillRect(0, 0, 256, 14)
    for (const [i, col] of ['#d98a6c', '#e8b48f', '#a9c3a2'].entries()) {
      g.fillStyle = col
      g.beginPath()
      g.arc(10 + i * 10, 7, 3, 0, Math.PI * 2)
      g.fill()
    }
    lines.forEach((parts, i) => {
      const y = 22 + i * 10 - offset
      g.fillStyle = 'rgba(255,255,255,0.12)'
      g.fillRect(4, y, 6, 4)
      for (const [x, w, col] of parts) {
        g.fillStyle = col
        g.fillRect(x, y, w, 4)
      }
    })
    t.needsUpdate = true
  }
  paint()
  return {
    texture: t,
    tick() {
      offset += 2
      if (offset >= 10) {
        offset = 0
        lines.shift()
        lines.push(newLine())
      }
      paint()
    },
  }
}
