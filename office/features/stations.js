// Stations (see ../features.js for the hooks a feature may answer): two corners where work happens away from the desk.
//
//   - The blueprint table (left of the front pod): a drafting table with a tilted top, a stool, a clamp lamp and a
//     basket of rolled blueprints. When a session goes into plan mode, its Claude walks over, unrolls a blue sheet and
//     sketches a floor plan that draws itself line by line until plan mode ends. While ExitPlanMode waits for the
//     person's OK she stays at the table and waves now and then (the bell on her desk rings as usual). Approved: she
//     rolls the sheet up, carries it back and cheers at her desk. Refused: she crumples the sheet into the basket, sighs
//     and goes back. One Claude at the table at a time; the others plan at their desks.
//   - The library corner (front right): a bookcase of colourful books, a reading armchair, a floor lamp and a globe.
//     Whoever does web research (the lead or an agent) walks to the bookcase, pulls a book and reads, in the armchair
//     or standing, until they have done no web look-up for 12 seconds (they stay at least 8). Two readers at most. A
//     skill sends the lead for the manual with that skill's name on its spine; she reads it at her desk for a minute.
//
// Nobody is taken whose desk burns, who is away for another feature, or whose session waits for an OK (except the lead
// whose ExitPlanMode is that OK). Hovering the table or the bookcase says what they are for.
//
// The mod sends extras.stations = { plan: { id, who, since, phase: 'on' | 'asking' | 'off', outcome?, at? } | null,
// research: [{ id, who, kind, detail, at }], skills: [{ id, who, name, at }] } (hooks/features/stations.ts).
// Demo: ?stations on a demo page fakes a plan (approved, then refused on the next round), a burst of web research for
// Claude and the first agent, and a skill, every 80 seconds. ?stations=plan or ?stations=library shows one of them;
// ?stations=look turns the camera to the table and the library.

import * as THREE from 'three'
import { brass, cyl, mat, put, rbox, seeded, sph } from '../kit.js'
import { TILE } from '../fx.js'

/** Where the props stand. Both face the camera (yaw π/4: their front looks towards +x +z). */
const TABLE = { x: 0.85, z: 3.7, yaw: Math.PI / 4 }
const SHELF = { x: 7.8, z: 2.1, yaw: Math.PI / 4 }
const CHAIR = { x: 7.75, z: 4.15, yaw: Math.PI / 4 }
const LAMP = { x: 7.17, z: 4.59 }
const GLOBE = { x: 7.16, z: 2.95 }
/** The board's tilt (radians) and the top's front edge height. */
const TILT = 0.36
const TOP_Y = 0.84
const SHEET_W = 0.84
const SHEET_D = 0.52
/** A reader goes back after this long with no web look-up, and stays at least MIN_STAY. */
const QUIET_MS = 12000
const MIN_STAY_MS = 8000
/** After a visit, this long before the same person comes again (no ping-pong). */
const REST_MS = 6000
const MOST_READERS = 2
const MANUAL_ON_DESK_MS = 60000
/** How long a skill trip waits for a busy lead before the manual just appears on her desk. */
const SKILL_WAIT_MS = 20000
const REWAVE_S = 25
const STROKE_S = 1.25
const DEMO_CYCLE = 80

const rnd = (a, b) => a + Math.random() * (b - a)
const pick = list => list[Math.floor(Math.random() * list.length)]
const ease = u => u * u * (3 - 2 * u)
const short = (text, max) => {
  const one = String(text ?? '').replace(/\s+/g, ' ').trim()
  return one.length > max ? one.slice(0, max - 1) + '…' : one
}
const sound = name => window.dispatchEvent(new CustomEvent('studio:sound', { detail: { name } }))

const APPROVED = ['Plan approved. Let us build it!', 'Green light! Off we go.', 'Signed off. Time to build.', 'The plan is a go!']
const REFUSED = ['Back to the drawing board…', 'Hmm. Not quite right yet.', 'Sigh. Let me rethink that.', 'Fair enough. A new sheet, then.']
const ASKING = ['The plan is ready: your call!', 'Have a look at my plan?', 'Plan drawn up. OK to go?']
const READING = ['Let me look this up.', 'To the books!', 'Research time.', 'Somewhere in here…']

const CSS = `
.st-tip { position: fixed; z-index: 45; pointer-events: none; background: #fff8ec; color: #3f332c; border: 2px solid #2f63a8;
  border-radius: 10px; padding: 3px 9px; font: 700 12px "Segoe UI", sans-serif; box-shadow: 0 4px 12px rgba(63, 51, 44, 0.22);
  white-space: nowrap; display: none; max-width: 70vw; overflow: hidden; text-overflow: ellipsis; }
`

// ------------------------------------------------------------------------------------------------ textures

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** A spine with the title written along it, for the skill manual. */
function drawSpine(g, w, h, title) {
  g.fillStyle = '#2f5e9e'
  g.fillRect(0, 0, w, h)
  g.fillStyle = '#e8c56a'
  g.fillRect(0, 10, w, 6)
  g.fillRect(0, h - 16, w, 6)
  g.save()
  g.translate(w / 2, h / 2)
  g.rotate(-Math.PI / 2)
  g.fillStyle = '#fff6df'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  let size = 30
  g.font = `800 ${size}px "Segoe UI", sans-serif`
  while (size > 14 && g.measureText(title).width > h - 44) g.font = `800 ${(size -= 2)}px "Segoe UI", sans-serif`
  g.fillText(short(title, 22), 0, 1)
  g.restore()
}

/** Blue ocean with a few green-gold land blobs, for the globe. */
function globeTexture() {
  return canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = '#4f86b8'
    g.fillRect(0, 0, w, h)
    const r = seeded(9)
    g.fillStyle = '#9cbf7a'
    for (let i = 0; i < 9; i++) {
      const x = r() * w
      const y = 20 + r() * (h - 40)
      for (let k = 0; k < 6; k++) {
        g.beginPath()
        g.ellipse(x + (r() - 0.5) * 40, y + (r() - 0.5) * 22, 8 + r() * 18, 5 + r() * 10, r() * 3, 0, Math.PI * 2)
        g.fill()
      }
    }
    g.strokeStyle = 'rgba(255,255,255,0.25)'
    g.lineWidth = 1
    for (let y = 16; y < h; y += 16) {
      g.beginPath()
      g.moveTo(0, y)
      g.lineTo(w, y)
      g.stroke()
    }
  })
}

// ------------------------------------------------------------------------------------------------ the blueprint

const BW = 512
const BH = 318

/** The strokes of a made-up floor plan, in the order she draws them. Each is drawn by `drawStroke(g, s, u)`. */
function planStrokes(seed) {
  const r = seeded(seed)
  const L = 30
  const T = 26
  const R = BW - 128
  const B = BH - 30
  const out = [{ k: 'rect', x: L, y: T, w: R - L, h: B - T, wide: 3 }]
  // inner walls: one across, two down, at made-up places
  const midY = Math.round(T + (B - T) * (0.42 + r() * 0.16))
  const x1 = Math.round(L + (R - L) * (0.3 + r() * 0.1))
  const x2 = Math.round(L + (R - L) * (0.62 + r() * 0.1))
  out.push({ k: 'line', a: [L, midY], b: [R, midY], wide: 2.4 })
  out.push({ k: 'line', a: [x1, T], b: [x1, midY], wide: 2.4 })
  out.push({ k: 'line', a: [x2, midY], b: [x2, B], wide: 2.4 })
  // doors: quarter arcs
  for (const [cx, cy, start] of [
    [x1 + 4, midY, -Math.PI / 2],
    [x2 + 4, midY, 0],
    [L + 50 + r() * 60, midY, Math.PI],
  ])
    out.push({ k: 'arc', x: cx, y: cy, r: 22, from: start, to: start + Math.PI / 2 })
  // windows on the outer walls: short double lines
  for (let i = 0; i < 4; i++) {
    const x = L + 30 + r() * (R - L - 80)
    const y = i % 2 ? B : T
    out.push({ k: 'line', a: [x, y - 3], b: [x + 34, y - 3], wide: 1.2 }, { k: 'line', a: [x, y + 3], b: [x + 34, y + 3], wide: 1.2 })
  }
  // furniture: boxes and round tables in the rooms
  const rooms = [
    [L, T, x1, midY],
    [x1, T, R, midY],
    [L, midY, x2, B],
    [x2, midY, R, B],
  ]
  for (const [ax, ay, bx, by] of rooms) {
    const n = 1 + Math.floor(r() * 2)
    for (let i = 0; i < n; i++) {
      const w = 18 + r() * 26
      const h = 12 + r() * 18
      const x = ax + 10 + r() * Math.max(4, bx - ax - w - 20)
      const y = ay + 10 + r() * Math.max(4, by - ay - h - 20)
      out.push(r() < 0.35 ? { k: 'circle', x: x + w / 2, y: y + h / 2, r: Math.min(w, h) / 2 } : { k: 'rect', x, y, w, h, wide: 1.4 })
    }
  }
  // dimension lines along the outside, and a few notes
  out.push({ k: 'dim', a: [L, T - 12], b: [R, T - 12] }, { k: 'dim', a: [L - 14, T], b: [L - 14, B] })
  for (const [ax, ay, bx, by] of rooms) out.push({ k: 'note', x: ax + (bx - ax) / 2 - 16, y: ay + (by - ay) / 2 + 2, w: 32, seed: Math.floor(r() * 999) })
  // the title block, last
  out.push({ k: 'note', x: R + 22, y: B - 40, w: 70, seed: 7 }, { k: 'note', x: R + 22, y: B - 22, w: 50, seed: 8 })
  return out
}

function drawPaper(g) {
  g.fillStyle = '#1f4f8f'
  g.fillRect(0, 0, BW, BH)
  g.strokeStyle = 'rgba(190, 220, 255, 0.10)'
  g.lineWidth = 1
  for (let x = 0.5; x < BW; x += 16) {
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x, BH)
    g.stroke()
  }
  for (let y = 0.5; y < BH; y += 16) {
    g.beginPath()
    g.moveTo(0, y)
    g.lineTo(BW, y)
    g.stroke()
  }
  g.strokeStyle = 'rgba(220, 238, 255, 0.75)'
  g.lineWidth = 2
  g.strokeRect(8, 8, BW - 16, BH - 16)
  // the title block's box
  g.lineWidth = 1.5
  g.strokeRect(BW - 112, BH - 74, 100, 62)
}

/** Draws stroke `s`, `u` (0..1) of the way. */
function drawStroke(g, s, u) {
  g.strokeStyle = '#eaf4ff'
  g.lineWidth = s.wide ?? 1.4
  g.lineCap = 'round'
  g.beginPath()
  if (s.k === 'line') {
    g.moveTo(s.a[0], s.a[1])
    g.lineTo(s.a[0] + (s.b[0] - s.a[0]) * u, s.a[1] + (s.b[1] - s.a[1]) * u)
  } else if (s.k === 'rect') {
    // around the edge, `u` of the perimeter
    const pts = [
      [s.x, s.y],
      [s.x + s.w, s.y],
      [s.x + s.w, s.y + s.h],
      [s.x, s.y + s.h],
      [s.x, s.y],
    ]
    let left = u * 2 * (s.w + s.h)
    g.moveTo(s.x, s.y)
    for (let i = 1; i < pts.length && left > 0; i++) {
      const [ax, ay] = pts[i - 1]
      const [bx, by] = pts[i]
      const len = Math.hypot(bx - ax, by - ay)
      const f = Math.min(1, left / len)
      g.lineTo(ax + (bx - ax) * f, ay + (by - ay) * f)
      left -= len
    }
  } else if (s.k === 'arc') {
    g.lineWidth = 1
    g.arc(s.x, s.y, s.r, s.from, s.from + (s.to - s.from) * u)
  } else if (s.k === 'circle') {
    g.arc(s.x, s.y, s.r, 0, Math.PI * 2 * u)
  } else if (s.k === 'dim') {
    g.lineWidth = 1
    g.strokeStyle = '#9fd0ff'
    const [ax, ay] = s.a
    const bx = ax + (s.b[0] - ax) * u
    const by = ay + (s.b[1] - ay) * u
    g.moveTo(ax, ay)
    g.lineTo(bx, by)
    const across = ay === s.b[1] ? [0, 5] : [5, 0]
    g.moveTo(ax - across[0], ay - across[1])
    g.lineTo(ax + across[0], ay + across[1])
    if (u >= 1) {
      g.moveTo(bx - across[0], by - across[1])
      g.lineTo(bx + across[0], by + across[1])
    }
  } else if (s.k === 'note') {
    // handwriting: a little wavy line
    g.lineWidth = 1.3
    const r = seeded(s.seed)
    g.moveTo(s.x, s.y)
    const n = Math.max(1, Math.floor(16 * u))
    for (let i = 1; i <= n; i++) g.lineTo(s.x + (s.w * i) / 16, s.y + Math.sin(i * 2.1 + r() * 2) * 2.6)
  }
  g.stroke()
}

// ------------------------------------------------------------------------------------------------ the props

/** The room's wood and accent colours for the theme on show, so the new furniture matches the others. */
function themeMats() {
  return {
    wood: new THREE.MeshStandardMaterial({ color: 0xdccbb2, roughness: 0.7 }),
    woodDark: new THREE.MeshStandardMaterial({ color: 0xb8936b, roughness: 0.7 }),
    accent: new THREE.MeshStandardMaterial({ color: 0xc8775a, roughness: 0.95 }),
    shade: new THREE.MeshStandardMaterial({ color: 0x9fb39a, roughness: 0.6, side: THREE.DoubleSide }),
  }
}

/** A warm bulb that glows more at night, and an additive halo sprite around it. */
function makeBulb(parent, x, y, z, r = 0.03) {
  const bulb = put(parent, sph(r, 12, 8), new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffd590, emissiveIntensity: 0.6 }), x, y, z, { cast: false })
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color: 0xffd08a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }))
  halo.scale.setScalar(r * 14)
  halo.position.set(x, y, z)
  parent.add(halo)
  return { bulb, halo }
}

let halo = null
function haloTexture() {
  if (halo) return halo
  halo = canvasTexture(64, 64, (g, w) => {
    const grad = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, w, w)
  })
  return halo
}

/** The drafting table, with its stool, clamp lamp and basket. Returns the parts the feature moves. */
function makeTable(scene, M) {
  const g = new THREE.Group()
  g.position.set(TABLE.x, 0, TABLE.z)
  g.rotation.y = TABLE.yaw
  scene.add(g)
  // legs splayed a little, a frame, and a foot rail
  for (const x of [-0.44, 0.44])
    for (const z of [-0.24, 0.24]) put(g, rbox(0.05, 0.8, 0.05, 0.012), M.wood, x, 0.4, z, { rz: x * 0.06, rx: -z * 0.08 })
  put(g, rbox(0.94, 0.05, 0.5, 0.015), M.woodDark, 0, 0.79, 0)
  put(g, rbox(0.9, 0.03, 0.03, 0.01), M.woodDark, 0, 0.16, 0.24)
  // the tilted top, hinged at its front edge, and the sheet's pivot at the top's back edge
  const top = new THREE.Group()
  top.position.set(0, TOP_Y, 0.3)
  top.rotation.x = TILT
  g.add(top)
  put(top, rbox(1.0, 0.03, 0.64, 0.012), mat(0xf3eee4, { roughness: 0.6 }), 0, 0, -0.32)
  put(top, rbox(0.98, 0.03, 0.035, 0.01), M.woodDark, 0, 0.025, 0.0) // the pencil ledge
  put(top, rbox(0.12, 0.012, 0.012, 0.004), mat(0xe2b23a), 0.26, 0.045, 0.0, { cast: false }) // a pencil on it
  put(top, rbox(0.3, 0.006, 0.03, 0.003), mat(0x8a96a3, { metalness: 0.4, roughness: 0.4 }), -0.2, 0.019, -0.08, { ry: 0.5, cast: false }) // a ruler
  const pivot = new THREE.Group()
  pivot.position.set(0, 0.018, -0.6)
  top.add(pivot)
  const canvas = document.createElement('canvas')
  canvas.width = BW
  canvas.height = BH
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(SHEET_W, SHEET_D), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.18 }))
  sheet.rotation.x = -Math.PI / 2
  sheet.position.z = SHEET_D / 2
  sheet.receiveShadow = true
  pivot.add(sheet)
  pivot.scale.z = 0.001
  pivot.visible = false
  // the roll that runs down the sheet as it unrolls (and up as it rolls back)
  const rollMat = new THREE.MeshStandardMaterial({ color: 0x2c5f9e, roughness: 0.7 })
  const roll = put(top, cyl(0.022, 0.022, SHEET_W + 0.02, 14), rollMat, 0, 0.04, -0.6, { rz: Math.PI / 2 })
  roll.visible = false

  // the clamp lamp on the back-left corner: a post, an arm reaching over the board and a shade looking down
  const lamp = new THREE.Group()
  lamp.position.set(-0.47, 0.8, -0.22)
  g.add(lamp)
  put(lamp, rbox(0.06, 0.05, 0.06, 0.01), M.woodDark, 0, 0.0, 0)
  put(lamp, cyl(0.012, 0.012, 0.6, 8), brass(), 0, 0.3, 0)
  const arm = new THREE.Group()
  arm.position.set(0, 0.6, 0)
  arm.rotation.z = -1.05
  lamp.add(arm)
  put(arm, cyl(0.01, 0.01, 0.34, 8), brass(), 0, 0.17, 0)
  const head = new THREE.Group()
  head.position.set(0, 0.34, 0)
  head.rotation.z = 2.4
  arm.add(head)
  put(head, new THREE.CylinderGeometry(0.035, 0.085, 0.11, 18, 1, true), M.shade, 0, 0.0, 0)
  const lampBulb = makeBulb(head, 0, -0.02, 0, 0.026)

  // the stool, tucked in at the front right
  const stool = new THREE.Group()
  stool.position.set(0.45, 0, 0.45)
  g.add(stool)
  put(stool, cyl(0.17, 0.17, 0.05, 20), M.accent, 0, 0.62, 0)
  put(stool, cyl(0.03, 0.03, 0.6, 10), brass(), 0, 0.31, 0)
  put(stool, new THREE.TorusGeometry(0.12, 0.012, 8, 20), brass(), 0, 0.25, 0, { rx: Math.PI / 2 })
  put(stool, cyl(0.16, 0.18, 0.03, 20), M.woodDark, 0, 0.015, 0)

  // the basket of rolled blueprints, front left; crumpled sheets land in it
  const basket = new THREE.Group()
  basket.position.set(-0.8, 0, 0.2)
  g.add(basket)
  const weave = new THREE.MeshStandardMaterial({ color: 0xc9a46c, roughness: 0.95, side: THREE.DoubleSide })
  put(basket, new THREE.CylinderGeometry(0.17, 0.14, 0.32, 20, 1, true), weave, 0, 0.16, 0)
  put(basket, cyl(0.14, 0.14, 0.02, 20), weave, 0, 0.01, 0)
  put(basket, new THREE.TorusGeometry(0.17, 0.012, 6, 24), M.woodDark, 0, 0.32, 0, { rx: Math.PI / 2 })
  const blue = [0x2c5f9e, 0x3d74b8, 0x26507f, 0xe9e2d0]
  ;[
    [-0.05, 0.04, 0.2, -0.1],
    [0.05, -0.03, -0.15, 0.12],
    [0.0, 0.06, 0.05, 0.22],
    [-0.06, -0.05, -0.28, -0.05],
  ].forEach(([x, z, rx, rz], i) => {
    const r = put(basket, cyl(0.03, 0.03, 0.56, 12), mat(blue[i]), x, 0.32, z, { rx, rz })
    put(r, cyl(0.031, 0.031, 0.02, 12), mat(0xf4efe4), 0, 0.28, 0, { cast: false })
  })
  return { group: g, top, pivot, sheet, roll, canvas, tex, lampBulb, basket }
}

/** A crumpled paper ball: a lumpy little sphere. */
function makeBall() {
  const geo = new THREE.IcosahedronGeometry(0.055, 1)
  const pos = geo.attributes.position
  const r = seeded(Math.floor(Math.random() * 1e6))
  for (let i = 0; i < pos.count; i++) {
    const f = 0.8 + r() * 0.35
    pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f, pos.getZ(i) * f)
  }
  geo.computeVertexNormals()
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x5f8fc9, roughness: 0.9, flatShading: true }))
  m.castShadow = true
  return m
}

const BOOK_COLOURS = [0xc8775a, 0x9fb39a, 0x2f5e9e, 0xe2b23a, 0x7f5a8c, 0xd9a0a0, 0x3e7a6b, 0xeab68f, 0x5b6e8c, 0xa95f45, 0xc3b6d6, 0x8a9e4f]

/** The bookcase with its shelves of books; one gap on the middle shelf holds the skill manual. */
function makeBookcase(scene, M) {
  const g = new THREE.Group()
  g.position.set(SHELF.x, 0, SHELF.z)
  g.rotation.y = SHELF.yaw
  scene.add(g)
  const W = 1.5
  const H = 1.75
  const D = 0.34
  for (const x of [-W / 2 + 0.02, W / 2 - 0.02]) put(g, rbox(0.04, H, D, 0.012), M.wood, x, H / 2, 0)
  put(g, rbox(W, 0.04, D + 0.02, 0.012), M.wood, 0, H - 0.02, 0)
  put(g, rbox(W - 0.06, 0.012, 0.02, 0.004), M.woodDark, 0, 0.04, -D / 2 + 0.01) // the back's foot
  put(g, rbox(W - 0.04, H - 0.04, 0.012, 0.004), M.woodDark, 0, H / 2, -D / 2 + 0.006)
  const shelves = [0.06, 0.48, 0.9, 1.32]
  for (const y of shelves) put(g, rbox(W - 0.06, 0.03, D - 0.02, 0.008), M.wood, 0, y, 0.0)
  // books: an instanced row on each shelf, each its own colour, some leaning
  const geo = new THREE.BoxGeometry(1, 1, 1)
  const bookMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 })
  const books = new THREE.InstancedMesh(geo, bookMat, 120)
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const c = new THREE.Color()
  const r = seeded(21)
  let n = 0
  const MANUAL_X = -0.3
  shelves.forEach((y, row) => {
    let x = -W / 2 + 0.07
    while (x < W / 2 - 0.1 && n < 120) {
      const w = 0.032 + r() * 0.03
      const h = 0.24 + r() * 0.12
      // the middle shelf keeps a gap for the manual
      if (row === 2 && x > MANUAL_X - 0.07 && x < MANUAL_X + 0.05) {
        x = MANUAL_X + 0.06
        continue
      }
      // now and then an empty stretch with a leaning book
      if (r() < 0.05) {
        x += 0.1
        continue
      }
      const lean = r() < 0.08 ? 0.22 : 0
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), lean)
      m4.compose(new THREE.Vector3(x + w / 2 + lean * 0.12, y + 0.015 + h / 2, 0.01 + r() * 0.03), q, new THREE.Vector3(w, h, 0.2 + r() * 0.06))
      books.setMatrixAt(n, m4)
      books.setColorAt(n, c.setHex(BOOK_COLOURS[Math.floor(r() * BOOK_COLOURS.length)]))
      n++
      x += w + 0.004 + lean * 0.2
    }
  })
  books.count = n
  books.castShadow = true
  books.receiveShadow = true
  g.add(books)
  // the manual: its spine (facing out) shows the last skill's name
  const spineCanvas = document.createElement('canvas')
  spineCanvas.width = 64
  spineCanvas.height = 320
  const spine = new THREE.CanvasTexture(spineCanvas)
  spine.colorSpace = THREE.SRGBColorSpace
  spine.anisotropy = 4
  drawSpine(spineCanvas.getContext('2d'), 64, 320, 'Skills')
  const cover = mat(0x2f5e9e, { roughness: 0.7 })
  const pages = mat(0xf4efe4)
  const faces = [cover, cover, pages, pages, new THREE.MeshStandardMaterial({ map: spine, roughness: 0.7 }), cover]
  const manual = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.34, 0.24), faces)
  manual.position.set(MANUAL_X, 0.9 + 0.015 + 0.17, 0.03)
  manual.castShadow = true
  g.add(manual)
  return { group: g, manual, spineCanvas, spine, faces }
}

/** The armchair, the floor lamp beside it and the globe by the bookcase. */
function makeReadingNook(scene, M) {
  const chair = new THREE.Group()
  chair.position.set(CHAIR.x, 0, CHAIR.z)
  chair.rotation.y = CHAIR.yaw
  scene.add(chair)
  for (const x of [-0.3, 0.3]) for (const z of [-0.28, 0.28]) put(chair, cyl(0.02, 0.015, 0.08, 8), M.woodDark, x, 0.04, z)
  put(chair, rbox(0.8, 0.18, 0.74, 0.06), M.accent, 0, 0.17, 0)
  put(chair, rbox(0.56, 0.08, 0.6, 0.04), M.accent, 0, 0.29, 0.04)
  put(chair, rbox(0.8, 0.5, 0.16, 0.07), M.accent, 0, 0.5, -0.3, { rx: -0.12 })
  for (const x of [-0.33, 0.33]) put(chair, rbox(0.14, 0.24, 0.7, 0.06), M.accent, x, 0.36, 0)
  put(chair, sph(0.16, 16, 10), mat(0xf4eee4, { roughness: 1 }), 0.14, 0.5, -0.17, { s: [1, 0.75, 0.38], rx: -0.25, rz: 0.2 }) // a cushion

  const lamp = new THREE.Group()
  lamp.position.set(LAMP.x, 0, LAMP.z)
  scene.add(lamp)
  put(lamp, cyl(0.15, 0.16, 0.03, 22), M.woodDark, 0, 0.015, 0)
  put(lamp, cyl(0.014, 0.014, 1.42, 8), brass(), 0, 0.73, 0)
  put(lamp, new THREE.CylinderGeometry(0.13, 0.2, 0.24, 22, 1, true), M.shade, 0, 1.48, 0)
  const lampBulb = makeBulb(lamp, 0, 1.42, 0, 0.04)
  lampBulb.halo.scale.setScalar(0.9)

  const globe = new THREE.Group()
  globe.position.set(GLOBE.x, 0, GLOBE.z)
  scene.add(globe)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    put(globe, cyl(0.015, 0.015, 0.62, 6), M.woodDark, Math.sin(a) * 0.1, 0.3, Math.cos(a) * 0.1, { rx: Math.cos(a) * 0.3, rz: -Math.sin(a) * 0.3 })
  }
  put(globe, cyl(0.12, 0.12, 0.03, 20), M.wood, 0, 0.6, 0)
  const tilt = new THREE.Group()
  tilt.position.set(0, 0.8, 0)
  tilt.rotation.z = 0.41
  globe.add(tilt)
  const ball = put(tilt, sph(0.16, 28, 18), new THREE.MeshStandardMaterial({ map: globeTexture(), roughness: 0.55 }), 0, 0, 0)
  put(tilt, new THREE.TorusGeometry(0.185, 0.008, 6, 36, Math.PI * 1.2), brass(), 0, 0, 0, { rz: -Math.PI * 0.1 })
  return { chair, lamp, lampBulb, globe, ball }
}

/** An open book held in both hands. */
function makeOpenBook(colour) {
  const g = new THREE.Group()
  const cover = mat(colour, { roughness: 0.7 })
  const paper = mat(0xfbf6ea)
  for (const s of [-1, 1]) {
    const half = new THREE.Group()
    half.rotation.z = s * 0.28
    g.add(half)
    put(half, rbox(0.11, 0.008, 0.15, 0.003), cover, s * 0.056, 0, 0, { cast: false })
    put(half, rbox(0.1, 0.012, 0.14, 0.003), paper, s * 0.052, 0.008, 0, { cast: false })
  }
  return g
}

/** A closed book (a manual) lying flat or carried, its cover in `colour`. */
function makeClosedBook(colour, w = 0.16, d = 0.22) {
  const g = new THREE.Group()
  put(g, rbox(w, 0.03, d, 0.004), mat(colour, { roughness: 0.7 }), 0, 0.015, 0)
  put(g, rbox(w - 0.012, 0.024, d - 0.01, 0.003), mat(0xf4efe4), 0.006, 0.015, 0, { cast: false })
  put(g, rbox(w * 0.6, 0.002, 0.04, 0.001), mat(0xe8c56a), 0, 0.031, -d * 0.2, { cast: false })
  return g
}

// ------------------------------------------------------------------------------------------------ the feature

export function makeStations(ctx) {
  const { scene, camera, people, fx, params, v3, aisleZ, standUp, sitDown, sayText } = ctx
  const mode = params.get('stations')
  const demo = !!ctx.isDemo && params.has('stations')
  const demoPlan = demo && mode !== 'library'
  const demoLibrary = demo && mode !== 'plan'

  const style = document.createElement('style')
  style.textContent = CSS
  document.head.appendChild(style)
  const tip = document.createElement('div')
  tip.className = 'st-tip'
  document.body.appendChild(tip)

  const M = themeMats()
  const table = makeTable(scene, M)
  const shelf = makeBookcase(scene, M)
  const nook = makeReadingNook(scene, M)
  const sketch = table.canvas.getContext('2d')

  // spots in the room, worked out from the props' own frames
  const local = (prop, lx, lz) => {
    const c = Math.cos(prop.yaw)
    const s = Math.sin(prop.yaw)
    return v3(prop.x + lx * c + lz * s, prop.z - lx * s + lz * c)
  }
  const AT_TABLE = local(TABLE, -0.25, 0.62)
  const TABLE_WAY = v3(2.0, 4.6)
  const AT_SHELF = [local(SHELF, -0.3, 0.62), local(SHELF, 0.4, 0.62)]
  const SHELF_WAY = v3(8.75, 2.6)
  const CHAIR_FRONT = local(CHAIR, 0, 0.75)
  const CHAIR_SEAT = local(CHAIR, 0, 0.1)
  const CHAIR_WAY = v3(8.75, 3.7)
  const FACE_PROP = yaw => yaw + Math.PI // turned towards a prop that faces `yaw`
  const FACE_OUT = Math.PI / 4 // towards the camera

  let clock = 0
  let tickClock = 0
  let demoStart = null
  const fliers = []
  /** The one Claude at the table: { sid, entry, planId, plan, phase, strokes, done, u, nextScribble, nextWave, ending } */
  let trip = null
  /** session id -> { ended (the plan id whose ending was played or skipped), trips (plan ids already taken to the table) } */
  const plans = new Map()
  /** person id -> a library visit { entry, kind: 'read' | 'skill', phase, seat ('chair' | 'stand'), since, lastAt, book } */
  const visits = new Map()
  /** person id -> when their last visit ended */
  const rested = new Map()
  /** session id -> skill ids seen; lead id -> a skill waiting for her { name, at, waited } */
  const skillsSeen = new Map()
  const skillWanted = new Map()
  /** lead id -> { obj, until } the manual lying on her desk */
  const deskManuals = new Map()
  let shelfTitle = ''
  let nextPageTurn = 0
  let crumpled = 0

  // ---------------------------------------------------------------- who is who
  const leadIdOf = sid => (sid ? `lead:${sid}` : 'claude')
  const personIdOf = (sid, who) => (who === 'main' ? leadIdOf(sid) : sid ? `${sid}/${who}` : who)
  const burning = e => !!ctx.chaos?.state?.().some(f => f.id === e.id && !f.out)
  const here = e => !!e && people.get(e.id) === e && e.state !== 'leaving'
  const free = e => here(e) && !e.friend && e.state === 'working' && !e.away && !!e.seat && e.p.seated && !e.p.isBusy() && !burning(e)
  const whoOf = e => (e.isLead ? 'main' : String(e.id).split('/').pop())

  /** Whether this person's session waits for the person's OK on one of their own calls (`except` a tool). */
  function needsOk(s, entry, except) {
    const w = s.state?.extras?.['your-turn']
    if (w?.waiting !== 'approve') return false
    if (except && w.tool === except) return false
    return entry.isLead ? !w.agent : w.agent === whoOf(entry)
  }

  // ---------------------------------------------------------------- the extras (and the made-up ones)
  function extrasOf(s, i) {
    if (demo && i === 0) {
      if (demoStart === null) demoStart = clock
      return demoExtras(clock - demoStart, s)
    }
    return s.state?.extras?.stations
  }

  /** One demo round: plan mode 3-30 s (asking until 36), research 44-56 s (and an agent's 6-18 s), a skill at 64 s. */
  function demoExtras(t, s) {
    const round = Math.floor(t / DEMO_CYCLE)
    const u = t % DEMO_CYCLE
    const now = Date.now()
    const back = sec => now - (u - sec) * 1000
    let plan = null
    if (demoPlan && u >= 3) {
      const id = `demo-plan-${round}`
      plan = { id, who: 'main', since: back(3), phase: u < 30 ? 'on' : u < 36 ? 'asking' : 'off' }
      if (u >= 36) Object.assign(plan, { outcome: round % 2 ? 'refused' : 'approved', at: back(36) })
    }
    const research = []
    const skills = []
    if (demoLibrary) {
      const agent = s.state?.helpers?.[0]?.id
      if (agent)
        for (const [sec, detail] of [
          [6, 'developer.mozilla.org'],
          [10, 'three.js canvas texture'],
          [14, 'threejs.org'],
          [18, 'stackoverflow.com'],
        ])
          if (u >= sec) research.push({ id: `d${round}a${sec}`, who: agent, kind: sec % 4 ? 'fetch' : 'search', detail, at: back(sec) })
      for (const [sec, detail] of [
        [44, 'drafting table history'],
        [48, 'en.wikipedia.org'],
        [52, 'blueprint paper colour'],
        [56, 'archive.org'],
      ])
        if (u >= sec) research.push({ id: `d${round}m${sec}`, who: 'main', kind: sec % 8 ? 'fetch' : 'search', detail, at: back(sec) })
      if (u >= 64) skills.push({ id: `d${round}s`, who: 'main', name: round % 2 ? 'frontend-design' : 'pdf', at: back(64) })
    }
    research.sort((a, b) => a.at - b.at)
    return { plan, research, skills }
  }

  // ---------------------------------------------------------------- things in the air
  function launch(obj, from, to, dur, arc, done) {
    obj.position.copy(from)
    scene.add(obj)
    fliers.push({ obj, from: from.clone(), to: to.clone(), t: 0, dur, arc, done })
  }
  function stepFliers(dt) {
    for (let i = fliers.length - 1; i >= 0; i--) {
      const f = fliers[i]
      f.t += dt
      const u = Math.min(1, f.t / f.dur)
      f.obj.position.lerpVectors(f.from, f.to, u)
      f.obj.position.y += f.arc * 4 * u * (1 - u)
      f.obj.rotation.x += dt * 6
      if (u >= 1) {
        fliers.splice(i, 1)
        f.obj.removeFromParent()
        try {
          f.done?.()
        } catch {}
      }
    }
  }
  function sparkle(at, n = 6, color = 0xffe08a) {
    for (let k = 0; k < n; k++)
      fx.emit(TILE.star, at, { vel: [rnd(-0.4, 0.4), rnd(0.3, 0.8), rnd(-0.4, 0.4)], gravity: 0.8, life: 0.7, size: 0.07, color, additive: true, spin: rnd(0, 3), spinRate: rnd(-4, 4) })
  }

  // ---------------------------------------------------------------- the sheet on the table
  function drawSheet(t) {
    drawPaper(sketch)
    const n = Math.min(t.done, t.strokes.length)
    for (let i = 0; i < n; i++) drawStroke(sketch, t.strokes[i], 1)
    if (n < t.strokes.length && t.u > 0) drawStroke(sketch, t.strokes[n], Math.min(1, t.u))
    table.tex.needsUpdate = true
  }

  /** How far the sheet is unrolled (0..1): the pivot stretches and the roll sits at its lower edge. */
  function setSheet(open) {
    const s = Math.max(0.001, open)
    table.pivot.scale.z = s
    table.pivot.visible = open > 0.002
    table.roll.visible = open > 0.002 && open < 0.995
    table.roll.position.z = -0.6 + SHEET_D * s
  }

  /** Eases the sheet open or closed over `secs`, then calls `then`. */
  function animateSheet(t, to, secs, then) {
    t.sheetAnim = { from: t.open ?? 0, to, t: 0, secs, then }
  }

  function stepSheet(t, dt) {
    const a = t.sheetAnim
    if (!a) return
    a.t += dt
    const u = Math.min(1, a.t / a.secs)
    t.open = a.from + (a.to - a.from) * ease(u)
    setSheet(t.open)
    if (u >= 1) {
      t.sheetAnim = null
      a.then?.()
    }
  }

  // ---------------------------------------------------------------- plan mode: the trip to the table
  function startTable(s, entry, plan) {
    const strokes = planStrokes([...plan.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7))
    const t = { sid: s.id, entry, planId: plan.id, plan, phase: 'out', strokes, done: 0, u: 0, open: 0, sheetAnim: null, nextScribble: rnd(2, 5), nextWave: 0, carry: null }
    trip = t
    const st = plans.get(s.id)
    st.trips.add(plan.id)
    const { p, seat } = entry
    entry.away = 'stations'
    standUp(entry)
    p.walk([v3(seat.approach.x, aisleZ), v3(TABLE_WAY.x, aisleZ), TABLE_WAY, AT_TABLE])
      .turn(FACE_PROP(TABLE.yaw) + 0.25, 0.35)
      .call(() => {
        if (trip !== t) return
        t.phase = 'unroll'
        drawSheet(t)
        sound('paper')
        animateSheet(t, 1, 0.9, () => {
          if (trip !== t) return
          t.phase = 'sketch'
          p.action = 'write'
        })
      })
  }

  /** Back to the desk from the table (carrying the rolled sheet when `carry`), then `atDesk` once seated. */
  function walkBack(t, carry, atDesk) {
    const { entry } = t
    const { p, seat } = entry
    t.phase = 'back'
    if (carry) {
      const roll = put(new THREE.Group(), cyl(0.024, 0.024, 0.6, 14), mat(0x2c5f9e), 0, 0, 0, { rz: Math.PI / 2 })
      roll.parent.position.set(0, 0.8, 0.26)
      t.carry = roll.parent
      p.root.add(t.carry)
      p.action = 'carry'
    }
    p.walk([TABLE_WAY, v3(TABLE_WAY.x, aisleZ), v3(seat.approach.x, aisleZ), seat.approach]).call(() => {
      t.carry?.removeFromParent()
      t.carry = null
      if (p.action === 'carry') p.action = null
    })
    sitDown(entry)
    p.call(() => {
      if (trip === t) trip = null
      atDesk?.()
    })
  }

  function cheerAtDesk(entry) {
    if (!here(entry)) return
    entry.p.cheer = 3
    const spot = entry.seat ? entry.seat.desk.clone().setY(1.35) : entry.p.anchor(new THREE.Vector3())
    fx.confetti(spot, 60)
    sound('cheer')
    sayText(entry, pick(APPROVED))
  }

  /** Plan mode ended while she was at the table: roll it up (approved, or ended) or crumple it (refused). */
  function endTable(t, outcome) {
    const { entry } = t
    const { p } = entry
    plans.get(t.sid).ended = t.planId
    t.phase = 'ending'
    p.clear()
    p.action = null
    t.done = t.strokes.length
    t.u = 0
    drawSheet(t)
    if (outcome === 'refused') {
      p.turn(FACE_PROP(TABLE.yaw) + 0.25, 0.2)
        .call(() => animateSheet(t, 0, 0.5, () => crumple(t)))
        .wait(1.6)
        .call(() => sayText(entry, pick(REFUSED)))
        .wait(1.4)
      walkBack(t, false, null)
      return
    }
    p.call(() => {
      sound('paper')
      animateSheet(t, 0, 0.8)
    })
      .wait(1.0)
      .call(() => {})
    walkBack(t, true, outcome === 'approved' ? () => cheerAtDesk(entry) : null)
  }

  /** The sheet crumples into a ball in her hands and is tossed into the basket. */
  function crumple(t) {
    const ball = makeBall()
    const hands = t.entry.p.root.localToWorld(new THREE.Vector3(0, 0.85, 0.25))
    const into = table.basket.localToWorld(new THREE.Vector3(rnd(-0.05, 0.05), 0.3, rnd(-0.05, 0.05)))
    sound('paper')
    launch(ball, hands, into, 0.7, 0.45, () => {
      // up to four stay in the basket
      if (crumpled < 4) {
        const kept = makeBall()
        kept.position.set(rnd(-0.06, 0.06), 0.3 + crumpled * 0.025, rnd(-0.06, 0.06))
        table.basket.add(kept)
      }
      crumpled++
      sparkle(into, 4, 0x9fd0ff)
    })
  }

  /** Drops the trip at once (she left, or something else took her): the sheet goes, the table is free. */
  function dropTable(t) {
    if (trip === t) trip = null
    t.carry?.removeFromParent()
    if (t.entry.away === 'stations') t.entry.away = null
    if (t.entry.p.action === 'write' || t.entry.p.action === 'carry' || t.entry.p.action === 'wave') t.entry.p.action = null
    t.open = 0
    setSheet(0)
  }

  function stepTable(dt) {
    const t = trip
    if (!t) return
    stepSheet(t, dt)
    const { entry } = t
    if (!here(entry) || entry.away !== 'stations' || (entry.state !== 'working' && entry.state !== 'returning')) return dropTable(t)
    if (t.phase === 'ending' || t.phase === 'back') return
    // the plan as the mod has it now: ended, or replaced by a newer one
    const plan = t.plan
    const over = !plan || plan.id !== t.planId || plan.phase === 'off' || burning(entry)
    if (over && (t.phase === 'sketch' || t.phase === 'asking')) return endTable(t, plan?.id === t.planId && !burning(entry) ? plan.outcome : 'left')
    if (t.phase === 'sketch' || t.phase === 'asking') sketchStep(t, dt)
  }

  /** At the table: the plan draws itself stroke by stroke; while it waits for the OK she waves now and then. */
  function sketchStep(t, dt) {
    const { p } = t.entry
    const asking = t.plan?.phase === 'asking'
    if (asking && t.phase !== 'asking') {
      t.phase = 'asking'
      t.nextWave = 0
    }
    if (!asking && t.phase === 'asking') t.phase = 'sketch'
    if (t.phase === 'asking') {
      t.nextWave -= dt
      if (t.nextWave <= 0 && !p.isBusy()) {
        t.nextWave = REWAVE_S
        p.action = null
        p.turn(FACE_OUT, 0.35)
          .call(() => {
            p.action = 'wave'
            sayText(t.entry, pick(ASKING))
          })
          .wait(3)
          .call(() => (p.action = 'write'))
          .turn(FACE_PROP(TABLE.yaw) + 0.25, 0.35)
      }
    }
    if (t.done >= t.strokes.length) return
    if (p.action !== 'write') return
    t.u += dt / STROKE_S
    if (t.u >= 1.3) {
      t.done++
      t.u = 0
    }
    if ((t.redraw = (t.redraw ?? 0) + dt) > 0.12) {
      t.redraw = 0
      drawSheet(t)
    }
    t.nextScribble -= dt
    if (t.nextScribble <= 0) {
      t.nextScribble = rnd(5, 9)
      sound('scribble')
    }
  }

  function tickPlans(s, i, ex) {
    let st = plans.get(s.id)
    const plan = ex?.plan ?? null
    if (!st) {
      // first sight: an ending that already happened is not played again
      st = { ended: plan?.phase === 'off' ? plan.id : '', trips: new Set() }
      plans.set(s.id, st)
    }
    if (trip?.sid === s.id) trip.plan = plan
    if (!plan || plan.who !== 'main') return
    const lead = people.get(leadIdOf(s.id))
    if (!lead) return
    const atTable = trip?.sid === s.id && trip.planId === plan.id
    if (plan.phase === 'on' && !trip && !st.trips.has(plan.id) && st.ended !== plan.id) {
      // the library hands her over: a reader in plan mode goes back first
      const v = visits.get(lead.id)
      if (v && v.phase === 'reading') return leaveLibrary(v)
      if (free(lead) && !needsOk(s, lead, 'ExitPlanMode')) startTable(s, lead, plan)
      return
    }
    // planned at the desk (the table was taken, or she was busy): the ending plays there
    if (plan.phase === 'off' && st.ended !== plan.id && !atTable) {
      st.ended = plan.id
      if (lead.state !== 'working' || lead.away) return
      if (plan.outcome === 'approved') cheerAtDesk(lead)
      else if (plan.outcome === 'refused') sayText(lead, pick(REFUSED))
    }
  }

  // ---------------------------------------------------------------- the library
  const readersIn = () => [...visits.values()].filter(v => v.kind === 'read')

  function startReading(entry, lastAt, detail) {
    const chairTaken = readersIn().some(v => v.seat === 'chair')
    const v = { entry, kind: 'read', phase: 'out', seat: chairTaken ? 'stand' : 'chair', since: Date.now(), lastAt, detail, book: null }
    visits.set(entry.id, v)
    const { p, seat } = entry
    entry.away = 'stations'
    const at = v.seat === 'chair' ? AT_SHELF[0] : AT_SHELF[1]
    standUp(entry)
    p.walk([v3(seat.approach.x, aisleZ), v3(SHELF_WAY.x, aisleZ), SHELF_WAY, at])
      .turn(FACE_PROP(SHELF.yaw), 0.3)
      .call(() => {
        if (Math.random() < 0.5) sayText(entry, pick(READING))
      })
      .wait(1.1)
      .call(() => {
        v.book = makeOpenBook(pick(BOOK_COLOURS))
        p.root.add(v.book)
        holdBook(v, false)
        p.action = 'carry'
        sound('page-turn')
      })
    if (v.seat === 'chair') {
      p.walk([CHAIR_WAY, CHAIR_FRONT])
        .turn(CHAIR.yaw, 0.3)
        .call(() => (p.action = null))
        .step(CHAIR_SEAT, 0.55)
        .sit()
        .call(() => holdBook(v, true))
    } else p.turn(FACE_OUT, 0.4)
    p.call(() => {
      if (visits.get(entry.id) === v) v.phase = 'reading'
    })
  }

  /** The open book in front of the chest, standing, or on the lap, seated. */
  function holdBook(v, seated) {
    if (!v.book) return
    v.book.position.set(0, seated ? 0.5 : 0.78, seated ? 0.22 : 0.24)
    v.book.rotation.set(seated ? -0.9 : -1.05, 0, 0)
  }

  function leaveLibrary(v) {
    if (v.phase === 'back') return
    v.phase = 'back'
    const { entry } = v
    const { p, seat } = entry
    p.clear()
    if (v.seat === 'chair' && p.seated) p.stand().step(CHAIR_FRONT, 0.5)
    p.call(() => {
      v.book?.removeFromParent()
      v.book = null
      if (p.action === 'carry') p.action = null
    })
    const via = v.seat === 'chair' && v.kind === 'read' ? [CHAIR_WAY] : [SHELF_WAY]
    p.walk([...via, v3(SHELF_WAY.x, aisleZ), v3(seat.approach.x, aisleZ), seat.approach])
    sitDown(entry)
    p.call(() => endVisit(v))
  }

  function endVisit(v) {
    if (visits.get(v.entry.id) === v) visits.delete(v.entry.id)
    v.book?.removeFromParent()
    v.book = null
    rested.set(v.entry.id, Date.now())
    if (v.entry.away === 'stations') v.entry.away = null
  }

  /** Drops a visit where it is (the person left, or something else took them). */
  function dropVisit(v) {
    endVisit(v)
    if (v.entry.p.action === 'carry') v.entry.p.action = null
  }

  function stepVisits(dt) {
    for (const v of [...visits.values()]) {
      const { entry } = v
      if (!here(entry) || entry.away !== 'stations' || entry.state !== 'working') {
        dropVisit(v)
        continue
      }
      if (v.kind !== 'read' || v.phase === 'back' || v.phase === 'out') continue
      if (burning(entry)) {
        leaveLibrary(v)
        continue
      }
      const now = Date.now()
      if (now - v.lastAt > QUIET_MS && now - v.since > MIN_STAY_MS) {
        leaveLibrary(v)
        continue
      }
      if (now > nextPageTurn) {
        nextPageTurn = now + rnd(6000, 10000)
        sound('page-turn')
        if (v.book) v.book.rotation.z = rnd(-0.08, 0.08)
      }
    }
  }

  function tickResearch(s, ex) {
    const latest = new Map()
    for (const r of Array.isArray(ex?.research) ? ex.research : []) {
      if (!r || typeof r.who !== 'string') continue
      const id = personIdOf(s.id, r.who)
      const at = Number(r.at) || 0
      if (!latest.has(id) || latest.get(id).at <= at) latest.set(id, { at, detail: r.detail || '' })
    }
    const now = Date.now()
    for (const [id, last] of latest) {
      const v = visits.get(id)
      if (v) {
        v.lastAt = Math.max(v.lastAt, last.at)
        v.detail = last.detail || v.detail
        continue
      }
      if (now - last.at > QUIET_MS || last.at <= (rested.get(id) ?? 0) || now - (rested.get(id) ?? 0) < REST_MS) continue
      if (readersIn().length >= MOST_READERS) continue
      const entry = people.get(id)
      if (!free(entry) || needsOk(s, entry)) continue
      // a lead whose plan wants the table goes there, not to the books
      if (entry.isLead && ex?.plan?.phase === 'on' && ex.plan.who === 'main') continue
      startReading(entry, last.at, last.detail)
    }
  }

  // ---------------------------------------------------------------- skills: the manual
  function setShelfTitle(name) {
    if (name === shelfTitle) return
    shelfTitle = name
    drawSpine(shelf.spineCanvas.getContext('2d'), 64, 320, name || 'Skills')
    shelf.spine.needsUpdate = true
  }

  function tickSkills(s, ex) {
    const list = Array.isArray(ex?.skills) ? ex.skills : []
    let seen = skillsSeen.get(s.id)
    const first = !seen
    if (!seen) skillsSeen.set(s.id, (seen = new Set()))
    for (const k of list) {
      if (!k?.id || seen.has(k.id)) continue
      seen.add(k.id)
      if (first) continue
      if (k.who === 'main') skillWanted.set(leadIdOf(s.id), { name: k.name, waited: 0, s })
      else setShelfTitle(k.name)
    }
    if (first && list.length) setShelfTitle(list[list.length - 1].name)
  }

  function stepSkills(dt) {
    for (const [id, want] of [...skillWanted]) {
      const lead = people.get(id)
      if (!here(lead)) {
        skillWanted.delete(id)
        continue
      }
      if (visits.has(id) || trip?.entry === lead) {
        want.waited += dt * 1000
        if (want.waited > SKILL_WAIT_MS) {
          skillWanted.delete(id)
          setShelfTitle(want.name)
        }
        continue
      }
      if (free(lead) && !needsOk(want.s, lead) && !(trip && trip.sid === want.s.id)) {
        skillWanted.delete(id)
        startSkillTrip(lead, want.name)
        continue
      }
      want.waited += dt * 1000
      if (want.waited > SKILL_WAIT_MS) {
        // she cannot get up: the manual turns up on her desk by itself
        skillWanted.delete(id)
        setShelfTitle(want.name)
        if (lead.seat && lead.state === 'working') placeManual(lead, want.name, true)
      }
    }
    const now = Date.now()
    for (const [id, m] of [...deskManuals]) {
      const lead = people.get(id)
      if (now > m.until || !here(lead) || lead.seat !== m.seat) {
        m.obj.removeFromParent()
        deskManuals.delete(id)
        if (!deskManuals.size) shelf.manual.visible = true
      }
    }
  }

  function startSkillTrip(entry, name) {
    setShelfTitle(name)
    const v = { entry, kind: 'skill', phase: 'out', seat: 'stand', since: Date.now(), lastAt: Date.now(), detail: name, book: null }
    visits.set(entry.id, v)
    const { p, seat } = entry
    entry.away = 'stations'
    standUp(entry)
    p.walk([v3(seat.approach.x, aisleZ), v3(SHELF_WAY.x, aisleZ), SHELF_WAY, AT_SHELF[0]])
      .turn(FACE_PROP(SHELF.yaw), 0.3)
      .wait(0.6)
      .call(() => {
        shelf.manual.visible = false
        v.book = makeClosedBook(0x2f5e9e, 0.24, 0.17)
        v.book.position.set(0, 0.8, 0.26)
        v.book.rotation.set(-0.3, 0, 0)
        p.root.add(v.book)
        p.action = 'carry'
        sound('page-turn')
        sayText(entry, `The ${short(name, 24)} manual!`)
      })
      .wait(0.8)
      .walk([SHELF_WAY, v3(SHELF_WAY.x, aisleZ), v3(seat.approach.x, aisleZ), seat.approach])
      .call(() => {
        v.book?.removeFromParent()
        v.book = null
        if (p.action === 'carry') p.action = null
        placeManual(entry, name, false)
      })
    v.phase = 'carrying'
    sitDown(entry)
    p.call(() => endVisit(v))
  }

  /** The manual lies on her desk, on the mug's side, for a minute. */
  function placeManual(lead, name, pop) {
    const seat = lead.seat
    if (!seat) return
    deskManuals.get(lead.id)?.obj.removeFromParent()
    const desk = new THREE.Group()
    desk.position.set(seat.desk.x, seat.desk.y, seat.desk.z)
    desk.rotation.y = -seat.face * (Math.PI / 2)
    const side = seat.index % 2 ? 1 : -1
    const book = makeClosedBook(0x2f5e9e)
    book.position.set(side * 0.27, 0.002, 0.2)
    book.rotation.y = side * 0.35
    desk.add(book)
    scene.add(desk)
    shelf.manual.visible = false
    deskManuals.set(lead.id, { obj: desk, until: Date.now() + MANUAL_ON_DESK_MS, seat, name })
    if (pop) sparkle(book.getWorldPosition(new THREE.Vector3()).setY(seat.desk.y + 0.1), 6)
  }

  // ---------------------------------------------------------------- the room's look: theme colours, the lamps at night
  let themeKey = ''
  function followTheme() {
    const c = ctx.world?.design?.current?.()?.colors
    if (!c) return
    const key = `${c.wood}|${c.accent}|${c.accent2}`
    if (key === themeKey) return
    themeKey = key
    M.wood.color.set(c.wood)
    M.woodDark.color.set(c.wood).multiplyScalar(0.72)
    M.accent.color.set(c.accent)
    M.shade.color.set(c.accent2 || c.accent)
  }

  function lightLamps(t) {
    const night = document.body.classList.contains('night') ? 1 : 0
    for (const b of [table.lampBulb, nook.lampBulb]) {
      b.bulb.material.emissiveIntensity = 0.5 + night * 1.6
      b.halo.material.opacity = 0.15 + night * 0.55
    }
    // the clamp lamp shines brighter while someone works under it
    if (trip && (trip.phase === 'sketch' || trip.phase === 'asking')) table.lampBulb.halo.material.opacity += 0.25 + 0.03 * Math.sin(t * 3)
    nook.ball.rotation.y += 0.002
  }

  // ---------------------------------------------------------------- hover
  const onTable = hit => hit.ray.intersectObject(table.group, true).length > 0
  const onShelf = hit => hit.ray.intersectObjects([shelf.group, nook.chair, nook.globe], true).length > 0

  function tableText() {
    const who = trip?.entry?.persona?.name
    if (trip && (trip.phase === 'sketch' || trip.phase === 'asking' || trip.phase === 'unroll'))
      return `Blueprint table: ${who} is drawing up a plan${trip.plan?.phase === 'asking' ? ' (waiting for your OK)' : ''}`
    return 'Blueprint table: Claude plans here'
  }

  function shelfText() {
    const sessions = ctx.sessions?.() ?? []
    const looked = []
    const used = []
    sessions.forEach((s, i) => {
      const ex = extrasOf(s, i)
      for (const r of ex?.research ?? []) if (r?.detail) looked.push(r)
      for (const k of ex?.skills ?? []) if (k?.name) used.push(k)
    })
    looked.sort((a, b) => b.at - a.at)
    used.sort((a, b) => b.at - a.at)
    const parts = ['Library']
    const words = [...new Set(looked.map(r => short(r.detail, 26)))].slice(0, 3)
    parts.push(words.length ? `looked up: ${words.join(', ')}` : 'web research and skills come here')
    const names = [...new Set(used.map(k => k.name))].slice(0, 3)
    if (names.length) parts.push(`skills: ${names.join(', ')}`)
    return parts.join(' · ')
  }

  function showTip(text, x, y) {
    if (!text) {
      tip.style.display = 'none'
      return
    }
    tip.textContent = text
    tip.style.display = 'block'
    tip.style.left = Math.max(8, Math.min(window.innerWidth - tip.offsetWidth - 8, x + 16)) + 'px'
    tip.style.top = y + 20 + 'px'
  }

  // ?interact puts hint bubbles on clickable things: the table and the bookcase get one too
  const hints = []
  if (params.has('interact')) {
    for (const [text, at] of [
      [() => tableText().replace('Blueprint table: ', ''), new THREE.Vector3(TABLE.x, 1.75, TABLE.z)],
      [() => 'Library', new THREE.Vector3(SHELF.x, 2.05, SHELF.z)],
    ]) {
      const el = document.createElement('div')
      el.className = 'ix-hint'
      document.body.appendChild(el)
      hints.push({ text, at, el })
    }
  }
  const hv = new THREE.Vector3()
  function placeHints() {
    for (const h of hints) {
      hv.copy(h.at).project(camera)
      const ok = hv.z < 1 && Math.abs(hv.x) < 1.05 && Math.abs(hv.y) < 1.05
      h.el.style.display = ok ? 'block' : 'none'
      if (!ok) continue
      h.el.textContent = h.text()
      h.el.style.left = (hv.x * 0.5 + 0.5) * window.innerWidth + 'px'
      h.el.style.top = (-hv.y * 0.5 + 0.5) * window.innerHeight + 'px'
    }
  }

  // ?stations=look: look at the two corners
  if (demo && mode === 'look')
    setTimeout(() => ctx.focusOn?.({ p: { root: { position: new THREE.Vector3(4.3, 0, 3.4) } } }, Number(params.get('zoom')) || 1.6), 1200)

  // ---------------------------------------------------------------- the hooks
  function tick() {
    const sessions = ctx.sessions?.() ?? []
    sessions.forEach((s, i) => {
      const ex = extrasOf(s, i)
      tickPlans(s, i, ex)
      tickResearch(s, ex)
      tickSkills(s, ex)
    })
    // a session that left takes its trip with it
    if (trip && !sessions.some(s => s.id === trip.sid)) trip.plan = null
  }

  setSheet(0)
  drawPaper(sketch)
  table.tex.needsUpdate = true

  return {
    step(dt, t) {
      clock += dt
      stepFliers(dt)
      stepTable(dt)
      if ((tickClock += dt) >= 0.4) {
        const d = tickClock
        tickClock = 0
        followTheme()
        tick()
        stepVisits(d)
        stepSkills(d)
      }
      lightLamps(t)
      if (hints.length) placeHints()
    },

    label(entry, label) {
      if (entry.away !== 'stations' || entry.state !== 'working') return undefined
      if (trip?.entry === entry) {
        // the your-turn badge says it needs the person's OK, when it knows
        if (trip.phase === 'asking') return /^Needs your OK/.test(label ?? '') ? undefined : 'Plan ready · needs your OK'
        if (trip.phase === 'ending' || trip.phase === 'back') {
          const o = trip.plan?.id === trip.planId ? trip.plan.outcome : ''
          return o === 'approved' ? 'Plan approved!' : o === 'refused' ? 'Back to the drawing board' : 'Plan done'
        }
        return 'Drawing up a plan'
      }
      const v = visits.get(entry.id)
      if (!v || v.phase === 'back') return undefined
      if (v.kind === 'skill') return `Fetching the ${short(v.detail, 24)} manual`
      return v.detail ? `Reading up · ${short(v.detail, 28)}` : 'Reading up'
    },

    gone(entry) {
      if (trip?.entry === entry) dropTable(trip)
      const v = visits.get(entry.id)
      if (v) dropVisit(v)
      skillWanted.delete(entry.id)
      rested.delete(entry.id)
      const m = deskManuals.get(entry.id)
      if (m) {
        m.obj.removeFromParent()
        deskManuals.delete(entry.id)
        if (!deskManuals.size) shelf.manual.visible = true
      }
    },

    hover(hit) {
      if (hit.person) return showTip('', 0, 0) ?? ''
      const text = onTable(hit) ? tableText() : onShelf(hit) ? shelfText() : ''
      showTip(text, hit.x, hit.y)
      return text ? 'default' : ''
    },
  }
}
