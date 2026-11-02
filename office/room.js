// The office loft itself: the diorama base, the cut-away walls with morning windows and a doorway, the floors, the
// lounge, the coffee counter, the desk pods and the plants. `buildRoom(scene)` makes it all and returns the seats
// people can take, the door they come through, and an `update` for the small things that move (door, clock, steam,
// dust, lamps, the cat).

import * as THREE from 'three'
import { mergeGeometries } from './vendor/BufferGeometryUtils.js'
import {
  P,
  aluminum,
  artTexture,
  boucleBump,
  brass,
  capsule,
  clockFace,
  concrete,
  cyl,
  glowTexture,
  group,
  herringbone,
  mat as baseMat,
  put,
  rbox,
  roundRugTexture,
  rugTexture,
  seeded,
  nightSkyTexture,
  skyTexture,
  sph,
  textTexture,
} from './kit.js'
import { extinguisherProp } from './motion.js'
import { COLOR_KEYS, DEFAULT_DESIGN, checkDesign } from './design.js'

export const ROOM = { x0: -9, x1: 9, z0: -7, z1: 7, h: 4, wall: 0.3 }
export const SUN_FROM = new THREE.Vector3(5, 13, -15) // where the morning sun sits, relative to the room's centre
const WINDOWS = [
  [0.8, 3.0],
  [3.8, 6.0],
  [6.8, 8.4],
]
const WIN_Y = [0.75, 3.35]
const DOOR_Z = [-0.55, 0.95]
const DOOR_H = 2.45

// ------------------------------------------------------------------------------------------------------ design roles
//
// A design (design.js) recolours the room by role. Every palette colour listed here belongs to one colour of the
// design, and keeps its distance from that colour's loft value (a darker wood stays a darker wood), so the loft's own
// colours come out exactly as before. The room's `mat` below gives such colours a material of their own to recolour;
// other colours go through the shared cache as usual. The merge into few meshes keeps working: it merges by material,
// and a recoloured material is still one material.

const ROLE_BASE = Object.fromEntries(Object.entries(DEFAULT_DESIGN.colors).map(([k, v]) => [k, parseInt(v.slice(1), 16)]))
const ROLE_OF = new Map()
for (const [key, hexes] of Object.entries({
  walls: [P.wallBack, P.wallLeft, P.wallCap, P.trim, P.base],
  wood: [P.oak, P.oakLight, P.oakDark],
  accent: [P.terracotta, P.terracottaDeep, P.apricot, P.peach],
  accent2: [P.sage, P.sageDeep, 0xc5d0bd, 0xa9bba3, 0xb3c3ad],
  sofa: [P.boucle, P.oat],
  plants: [P.leaf, P.leafDeep, P.leafLight, 0x7f9d63, 0x6f8f58, 0x5d8a4f],
})) {
  for (const hex of hexes) ROLE_OF.set(hex, key)
}
/** The role materials made so far: { m, key, hex } each, recoloured by the design. */
let roleMats = new Map()

/** `base` moved by the loft's own distance between `hex` and the role's loft colour, kept inside the colour range. */
function offsetColour(base, key, hex) {
  const lo = ROLE_BASE[key]
  let out = 0
  for (const shift of [16, 8, 0]) {
    const v = Math.max(0, Math.min(255, ((base >> shift) & 255) + (((hex >> shift) & 255) - ((lo >> shift) & 255))))
    out = (out << 8) | v
  }
  return out
}

/** A material of the given role (the design colour `key`), whose loft colour is `hex`. */
function roleMat(key, hex, opts = {}) {
  const id = `${key}|${hex}|` + Object.entries(opts).map(([k, v]) => `${k}=${v && v.uuid ? v.uuid : v}`).join(',')
  let r = roleMats.get(id)
  if (!r) {
    r = { key, hex, m: new THREE.MeshStandardMaterial({ color: hex, roughness: 0.82, metalness: 0, ...opts }) }
    roleMats.set(id, r)
  }
  return r.m
}

/** The room's material: a palette colour with a design role gets a role material, anything else the shared one. */
function mat(color, opts = {}) {
  const key = ROLE_OF.get(color)
  return key ? roleMat(key, color, opts) : baseMat(color, opts)
}

/** A small tiling canvas texture for the floors that kit.js has no picture for. */
function floorCanvas(size, draw) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  draw(c.getContext('2d'), size)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

/** The floors a design may lay: how to draw them, how often they repeat per metre, and their surface. */
const FLOOR_KINDS = {
  concrete: { make: () => concrete(), rep: 4.5, rough: 0.38, metal: 0.02, mult: 0xffffff },
  oak: { make: () => herringbone(), rep: 3.2, turn: Math.PI / 4, rough: 0.6, metal: 0, mult: 0xf4ece2 },
  carpet: {
    make: () =>
      floorCanvas(256, (g, W) => {
        const rnd = seeded(21)
        g.fillStyle = '#e3e0db'
        g.fillRect(0, 0, W, W)
        for (let i = 0; i < 9000; i++) {
          const v = 190 + Math.floor(rnd() * 60)
          g.fillStyle = `rgba(${v},${v - 2},${v - 6},0.55)`
          g.fillRect(rnd() * W, rnd() * W, 2, 2)
        }
      }),
    rep: 2.4,
    rough: 1,
    metal: 0,
    mult: 0xffffff,
  },
  tiles: {
    make: () =>
      floorCanvas(256, (g, W) => {
        const rnd = seeded(33)
        g.fillStyle = '#b7b3ab'
        g.fillRect(0, 0, W, W)
        for (let x = 0; x < 2; x++)
          for (let y = 0; y < 2; y++) {
            const v = 236 + Math.floor(rnd() * 14)
            g.fillStyle = `rgb(${v},${v - 1},${v - 4})`
            g.fillRect(x * 128 + 3, y * 128 + 3, 122, 122)
          }
      }),
    rep: 1.6,
    rough: 0.28,
    metal: 0.04,
    mult: 0xffffff,
  },
}

let glowTex = null
const glow = () => (glowTex ??= glowTexture())
/** The room's lamps (pendants, floor and table lamps): they glow brighter after dark. Filled by buildRoom. */
let lampGlows = []

/** A soft additive glow sprite (lamps, lanterns). */
function glowSprite(parent, x, y, z, size, opacity = 0.7) {
  const m = new THREE.SpriteMaterial({ map: glow(), color: 0xffd9a8, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending })
  const s = new THREE.Sprite(m)
  s.position.set(x, y, z)
  s.scale.setScalar(size)
  parent.add(s)
  return s
}

// ------------------------------------------------------------------------------------------------------ plants

const leafGeos = new Map()
function leafGeo(len, wid, holes = 0, droop = 0.12) {
  const key = `${len},${wid},${holes},${droop}`
  if (leafGeos.has(key)) return leafGeos.get(key)
  const s = new THREE.Shape()
  s.moveTo(0, 0)
  s.bezierCurveTo(wid * 0.78, len * 0.1, wid * 0.62, len * 0.8, 0, len)
  s.bezierCurveTo(-wid * 0.62, len * 0.8, -wid * 0.78, len * 0.1, 0, 0)
  for (let i = 0; i < holes; i++) {
    const y = len * (0.3 + 0.45 * (i / Math.max(1, holes - 1)))
    for (const side of [-1, 1]) {
      const h = new THREE.Path()
      h.absellipse(side * wid * 0.26, y, wid * 0.07, len * 0.045, 0, Math.PI * 2, false, side * 0.5)
      s.holes.push(h)
    }
  }
  const g = new THREE.ShapeGeometry(s, 10)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    p.setZ(i, -((x * x) / wid) * 0.9 - droop * (y / len) ** 2 * len)
  }
  g.computeVertexNormals()
  leafGeos.set(key, g)
  return g
}

function leafMat(color) {
  return mat(color, { side: THREE.DoubleSide, roughness: 0.7 })
}

/** One leaf on `parent`, its stalk at (x, y, z), pointing out at yaw `a` and elevation `e`. */
function leaf(parent, geo, color, x, y, z, a, e, roll = 0) {
  const m = new THREE.Mesh(geo, leafMat(color))
  m.position.set(x, y, z)
  m.rotation.order = 'YXZ'
  m.rotation.set(Math.PI / 2 - e, a, roll)
  m.castShadow = true
  m.receiveShadow = true
  parent.add(m)
  return m
}

function pot(parent, x, z, r, h, color = P.pot, y = 0) {
  const pts = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(r * 0.72, 0),
    new THREE.Vector2(r * 0.86, h * 0.08),
    new THREE.Vector2(r * 0.98, h * 0.55),
    new THREE.Vector2(r, h * 0.94),
    new THREE.Vector2(r * 0.9, h),
    new THREE.Vector2(r * 0.86, h * 0.9),
    new THREE.Vector2(0, h * 0.9),
  ]
  const g = new THREE.LatheGeometry(pts, 32)
  put(parent, g, color === P.terracotta || color === P.pot ? roleMat('pots', color, { roughness: 0.6 }) : mat(color, { roughness: 0.6 }), x, y, z)
  put(parent, cyl(r * 0.84, r * 0.84, 0.02, 24), mat(0x6b5444), x, y + h * 0.86, z, { cast: false })
  return y + h * 0.88
}

function fiddleLeafFig(parent, x, z, seed, height = 2.3) {
  const rnd = seeded(seed)
  const g = group(parent, x, 0, z)
  const top = pot(g, 0, 0, 0.3, 0.55, P.terracotta)
  const trunk = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, top, 0),
    new THREE.Vector3(0.04, top + 0.6, 0.02),
    new THREE.Vector3(-0.03, height - 0.5, -0.02),
    new THREE.Vector3(0.02, height, 0.03),
  ])
  put(g, new THREE.TubeGeometry(trunk, 20, 0.03, 6), mat(0x8a6a4e), 0, 0, 0)
  for (let i = 0; i < 40; i++) {
    const t = 0.35 + 0.65 * (i / 40) + rnd() * 0.04
    const p = trunk.getPoint(Math.min(1, t))
    const a = rnd() * Math.PI * 2
    const len = 0.3 + rnd() * 0.14
    leaf(g, leafGeo(len, len * 0.75, 0, 0.1), rnd() > 0.45 ? P.leaf : P.leafDeep, p.x, p.y, p.z, a, -0.15 + rnd() * 0.9, rnd() - 0.5)
  }
  return g
}

function monstera(parent, x, z, seed, height = 2.5) {
  const rnd = seeded(seed)
  const g = group(parent, x, 0, z)
  const top = pot(g, 0, 0, 0.36, 0.5, P.pot)
  const stem = mat(0x6f8f58)
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + rnd() * 0.4
    const reach = 0.25 + rnd() * 0.45
    const hgt = top + 0.6 + rnd() * (height - top - 0.8)
    const end = new THREE.Vector3(Math.cos(a) * reach, hgt, Math.sin(a) * reach)
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, top, 0), new THREE.Vector3(end.x * 0.3, hgt * 0.75, end.z * 0.3), end)
    put(g, new THREE.TubeGeometry(curve, 12, 0.014, 5), stem, 0, 0, 0)
    const len = 0.5 + rnd() * 0.25
    leaf(g, leafGeo(len, len * 0.95, 3, 0.2), rnd() > 0.5 ? P.leafDeep : P.leaf, end.x, end.y, end.z, Math.PI / 2 - a, 0.1 + rnd() * 0.5, rnd() * 0.6 - 0.3)
  }
  return g
}

/** Pothos or ivy falling from a shelf or a pot: small heart leaves along a hanging stem. */
function trailingVine(parent, x, y, z, length, seed, outX = 0, outZ = 0.08) {
  const rnd = seeded(seed)
  const pts = []
  const n = Math.max(3, Math.round(length / 0.12))
  for (let i = 0; i <= n; i++) {
    const t = i / n
    pts.push(new THREE.Vector3(x + outX * Math.sin(t * 2) + Math.sin(t * 6 + seed) * 0.03, y - t * length, z + outZ * Math.sin(t * 1.6)))
  }
  const curve = new THREE.CatmullRomCurve3(pts)
  put(parent, new THREE.TubeGeometry(curve, n * 2, 0.006, 4), mat(0x5d8a4f), 0, 0, 0, { cast: false })
  const geo = leafGeo(0.1, 0.09, 0, 0.03)
  for (let i = 0; i < n * 2; i++) {
    const p = curve.getPoint(i / (n * 2))
    leaf(parent, geo, rnd() > 0.4 ? P.leafLight : P.leaf, p.x, p.y, p.z, rnd() * Math.PI * 2, -0.6 + rnd() * 0.5, rnd() - 0.5)
  }
}

function deskPlant(parent, x, y, z, kind, seed) {
  const rnd = seeded(seed)
  const top = pot(parent, x, z, 0.07, 0.1, kind % 2 ? P.terracotta : P.pot, y)
  if (kind % 3 === 0) {
    for (let i = 0; i < 6; i++)
      put(parent, cyl(0.001, 0.025, 0.16 + rnd() * 0.1, 6), mat(P.leafDeep, { roughness: 0.6 }), x + (rnd() - 0.5) * 0.06, top + 0.09, z + (rnd() - 0.5) * 0.06, {
        rx: (rnd() - 0.5) * 0.4,
        rz: (rnd() - 0.5) * 0.4,
      })
  } else {
    for (let i = 0; i < 7; i++) leaf(parent, leafGeo(0.11, 0.1, 0, 0.04), i % 2 ? P.leaf : P.leafLight, x, top, z, (i / 7) * Math.PI * 2, 0.4 + rnd() * 0.5)
    if (kind % 3 === 2) trailingVine(parent, x + 0.05, top, z + 0.03, 0.18, seed, 0.04, 0.05)
  }
}

// ------------------------------------------------------------------------------------------------------ furniture

export function mug(parent, x, y, z, color, ry = 0) {
  const g = group(parent, x, y, z, ry)
  put(g, cyl(0.042, 0.038, 0.085, 18), mat(color, { roughness: 0.45 }), 0, 0.0425, 0)
  put(g, cyl(0.034, 0.034, 0.005, 16), mat(0x6b4a36, { roughness: 0.3 }), 0, 0.08, 0, { cast: false })
  put(g, new THREE.TorusGeometry(0.024, 0.008, 6, 14), mat(color, { roughness: 0.45 }), 0.048, 0.045, 0, { cast: false })
  return g
}

function arcSlab(r1, r2, a0, a1, h, bevel = 0.05) {
  const s = new THREE.Shape()
  s.absarc(0, 0, r2, a0, a1, false)
  s.absarc(0, 0, r1, a1, a0, true)
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 40 })
  g.rotateX(-Math.PI / 2)
  g.translate(0, bevel, 0)
  return g
}

function discSlab(r, h, bevel = 0.05) {
  const s = new THREE.Shape()
  s.absarc(0, 0, r, 0, Math.PI * 2, false)
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 40 })
  g.rotateX(-Math.PI / 2)
  g.translate(0, bevel, 0)
  return g
}

let boucleTex = null
function boucle(color = P.boucle) {
  if (!boucleTex) {
    boucleTex = boucleBump()
    boucleTex.repeat.set(3, 3)
  }
  return mat(color, { roughness: 0.95, bumpMap: boucleTex, bumpScale: 1.2 })
}

/** The curved bouclé sofa, wrapped around a centre point, its back towards -z. */
function curvedSofa(parent, cx, cz) {
  const g = group(parent, cx, 0, cz)
  const a0 = Math.PI / 2 - 0.95
  const a1 = Math.PI / 2 + 0.95
  put(g, arcSlab(1.3, 1.95, a0 + 0.02, a1 - 0.02, 0.06, 0.02), mat(P.oakDark), 0, 0.02, 0)
  put(g, arcSlab(1.25, 1.9, a0, a1, 0.18, 0.07), boucle(), 0, 0.1, 0)
  put(g, arcSlab(1.68, 1.95, a0 - 0.02, a1 + 0.02, 0.38, 0.08), boucle(), 0, 0.3, 0)
  for (const a of [a0 + 0.35, Math.PI / 2, a1 - 0.35]) {
    const px = Math.cos(a) * 1.6
    const pz = -Math.sin(a) * 1.6
    put(g, rbox(0.34, 0.3, 0.12, 0.06), mat(a === Math.PI / 2 ? P.sage : P.terracotta, { roughness: 0.95 }), px, 0.5, pz, { ry: Math.PI / 2 + a, rx: -0.25 })
  }
  return g
}

/** A round bouclé tub chair facing +z. */
function tubChair(parent, x, z, ry, color = P.boucle) {
  const g = group(parent, x, 0, z, ry)
  put(g, discSlab(0.38, 0.22, 0.07), boucle(color, 1.5), 0, 0.04, 0)
  put(g, arcSlab(0.3, 0.46, -0.5, Math.PI + 0.5, 0.4, 0.07), boucle(color, 1.5), 0, 0.2, 0)
  put(g, rbox(0.3, 0.1, 0.3, 0.05), mat(P.apricot, { roughness: 0.95 }), 0, 0.37, 0.05)
  return g
}

/** A low modular sofa with terracotta throw pillows, facing +z in its own frame. */
function modularSofa(parent, x, z, ry) {
  const g = group(parent, x, 0, z, ry)
  const fabric = mat(P.oat, { roughness: 0.95 })
  put(g, rbox(2.7, 0.2, 0.9, 0.06), fabric, 0, 0.12, 0)
  put(g, rbox(1.3, 0.14, 0.72, 0.07), fabric, -0.66, 0.29, 0.06)
  put(g, rbox(1.3, 0.14, 0.72, 0.07), fabric, 0.66, 0.29, 0.06)
  put(g, rbox(2.7, 0.42, 0.22, 0.1), fabric, 0, 0.42, -0.36)
  put(g, rbox(0.2, 0.32, 0.9, 0.09), fabric, -1.38, 0.3, 0)
  put(g, rbox(0.2, 0.32, 0.9, 0.09), fabric, 1.38, 0.3, 0)
  for (let i = 0; i < 4; i++) put(g, cyl(0.03, 0.025, 0.05, 10), mat(P.oakDark), -1.2 + i * 0.8, 0.0, 0.32)
  put(g, rbox(0.42, 0.4, 0.13, 0.07), mat(P.terracotta, { roughness: 0.95 }), -0.95, 0.53, -0.18, { rx: -0.2, rz: 0.12 })
  put(g, rbox(0.38, 0.36, 0.12, 0.07), mat(P.apricot, { roughness: 0.95 }), -0.58, 0.51, -0.16, { rx: -0.2, rz: -0.08 })
  put(g, rbox(0.42, 0.4, 0.13, 0.07), mat(P.terracottaDeep, { roughness: 0.95 }), 0.95, 0.53, -0.18, { rx: -0.2, rz: -0.12 })
  put(g, rbox(0.9, 0.06, 0.5, 0.03), mat(P.sage, { roughness: 1 }), 0.55, 0.38, 0.12, { ry: 0.25 }) // a throw blanket
  return g
}

/** An asymmetric Memphis-style coffee table: a soft blob top on a sage column and a terracotta sphere. */
function memphisTable(parent, x, z) {
  const g = group(parent, x, 0, z, 0.3)
  const pts = []
  for (let i = 0; i < 14; i++) {
    const t = (i / 14) * Math.PI * 2
    const r = 1 + 0.18 * Math.sin(2 * t + 0.6) + 0.08 * Math.sin(3 * t)
    pts.push(new THREE.Vector2(Math.cos(t) * r * 0.72, Math.sin(t) * r * 0.46))
  }
  const s = new THREE.Shape()
  s.moveTo(pts[0].x, pts[0].y)
  s.splineThru([...pts.slice(1), pts[0]])
  const top = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 3, curveSegments: 40 })
  top.rotateX(-Math.PI / 2)
  put(g, top, mat(P.travertine, { roughness: 0.55 }), 0, 0.36, 0)
  put(g, cyl(0.13, 0.13, 0.34, 24), mat(P.sage), -0.32, 0.17, 0.05)
  put(g, sph(0.15), mat(P.terracotta), 0.36, 0.15, -0.05)
  put(g, cyl(0.22, 0.22, 0.03, 32), mat(P.apricot), 0.36, 0.015, -0.05)
  // books, a bowl and a vase with a dried branch
  put(g, rbox(0.3, 0.04, 0.22, 0.01), mat(P.dustyBlue), 0.2, 0.46, 0.1, { ry: 0.2 })
  put(g, rbox(0.27, 0.035, 0.2, 0.01), mat(P.peach), 0.2, 0.497, 0.1, { ry: 0.1 })
  put(g, new THREE.SphereGeometry(0.11, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(P.oakLight, { side: THREE.DoubleSide }), -0.25, 0.53, -0.06)
  put(g, sph(0.04), mat(P.apricot), -0.27, 0.47, -0.04)
  put(g, sph(0.035), mat(P.terracotta), -0.21, 0.465, -0.08)
  const vase = new THREE.LatheGeometry(
    [new THREE.Vector2(0, 0), new THREE.Vector2(0.06, 0.01), new THREE.Vector2(0.075, 0.08), new THREE.Vector2(0.03, 0.17), new THREE.Vector2(0.035, 0.2), new THREE.Vector2(0, 0.2)],
    20,
  )
  put(g, vase, mat(P.boucle, { roughness: 0.5 }), 0.02, 0.41, -0.18)
  const branch = new THREE.CatmullRomCurve3([new THREE.Vector3(0.02, 0.58, -0.18), new THREE.Vector3(0.06, 0.8, -0.2), new THREE.Vector3(0.0, 1.0, -0.15)])
  put(g, new THREE.TubeGeometry(branch, 8, 0.006, 4), mat(0x9a7b5c), 0, 0, 0, { cast: false })
  for (let i = 0; i < 6; i++) {
    const p = branch.getPoint(0.4 + i * 0.1)
    put(g, sph(0.018, 8, 6), mat(P.beige), p.x + (i % 2 ? 0.03 : -0.03), p.y, p.z, { cast: false })
  }
  return g
}

function arcFloorLamp(parent, x, z, ry, lights) {
  const g = group(parent, x, 0, z, ry)
  put(g, cyl(0.2, 0.22, 0.06, 32), mat(P.travertine, { roughness: 0.5 }), 0, 0.03, 0)
  const curve = new THREE.CubicBezierCurve3(new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(0, 2.1, 0), new THREE.Vector3(0.5, 2.35, 0), new THREE.Vector3(1.25, 1.9, 0))
  put(g, new THREE.TubeGeometry(curve, 40, 0.018, 8), brass(), 0, 0, 0)
  const shade = new THREE.SphereGeometry(0.24, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2)
  put(g, shade, mat(P.apricot, { side: THREE.DoubleSide, roughness: 0.6 }), 1.25, 1.88, 0, { cast: true })
  put(g, sph(0.07), mat(0xfff3dc, { emissive: 0xffd9a0, emissiveIntensity: 2.2 }), 1.25, 1.8, 0, { cast: false })
  lampGlows.push(glowSprite(g, 1.25, 1.75, 0, 1.4, 0.55))
  const light = new THREE.PointLight(0xffc98f, 5, 5.5, 1.6)
  light.position.set(1.25, 1.65, 0)
  g.add(light)
  lights.push(light)
}

function pendant(parent, x, z, y, r, color, lights, withLight = true) {
  put(parent, cyl(0.004, 0.004, ROOM.h - y - r, 4), mat(P.ink), x, (ROOM.h + y + r) / 2, z, { cast: false })
  put(parent, cyl(0.07, 0.07, 0.03, 16), brass(), x, ROOM.h - 0.015, z, { cast: false })
  const shell = new THREE.SphereGeometry(r, 32, 20)
  put(parent, shell, mat(color, { emissive: 0xffe2b8, emissiveIntensity: 0.9, roughness: 0.9 }), x, y, z, { cast: false, s: [1, 0.92, 1] })
  for (let i = -2; i <= 2; i++)
    put(parent, new THREE.TorusGeometry(r * Math.cos((i * 0.3) / 1), 0.004, 4, 40), mat(0xe8dcc8), x, y + i * r * 0.3, z, { rx: Math.PI / 2, cast: false })
  lampGlows.push(glowSprite(parent, x, y, z, r * 4.4, 0.32))
  if (withLight) {
    const light = new THREE.PointLight(0xffd6a0, 3.2, 5, 1.6)
    light.position.set(x, y - r - 0.1, z)
    parent.add(light)
    lights.push(light)
  }
}

// ------------------------------------------------------------------------------------------------------ the room

export function buildRoom(scene) {
  const room = group(scene)
  lampGlows = []
  roleMats = new Map()
  const lights = []
  const animated = []
  // Furniture that a design can swap or hide lives in slots: a group per slot (kept out of the room-wide merge) with a
  // group per style, each merged on its own. See `world.design` at the end.
  const slots = {}
  const slotOf = (slot, style) => {
    const s = (slots[slot] ??= { group: group(room), styles: {} })
    s.group.userData.dynamic = true
    return (s.styles[style] ??= group(s.group))
  }
  // rugs take the design's rug colour as a tint over their picture (or over `mult`, for a plain rug)
  const rugMats = []
  const rugMat = (map, mult = 0xffffff) => {
    const m = new THREE.MeshStandardMaterial({ color: mult, map, roughness: 1 })
    rugMats.push({ m, mult })
    return m
  }
  const { x0, x1, z0, z1, h, wall } = ROOM

  // the diorama base, its two visible sides a shade darker
  put(room, rbox(x1 - x0 + 0.9, 0.5, z1 - z0 + 0.9, 0.14), mat(P.base), (x0 + x1) / 2 - 0.15, -0.25, (z0 + z1) / 2 - 0.15)
  put(room, rbox(x1 - x0 + 0.6, 0.08, z1 - z0 + 0.6, 0.04), mat(P.trim), (x0 + x1) / 2 - 0.15, -0.04, (z0 + z1) / 2 - 0.15)

  // floors: polished concrete for the café and lounge side, oak herringbone where people work. A design may lay one
  // kind (oak, concrete, carpet, tiles) over both, and tint it; the planes keep their own materials so it can change.
  const split = -0.4
  const floorSpan = [
    { w: split - x0, cx: (x0 + split) / 2 },
    { w: x1 - split, cx: (split + x1) / 2 },
  ]
  const floorMats = floorSpan.map(() => new THREE.MeshStandardMaterial({ color: 0xffffff }))
  floorSpan.forEach((f, i) => {
    const m = put(room, new THREE.PlaneGeometry(f.w, z1 - z0), floorMats[i], f.cx, 0.002, (z0 + z1) / 2, { rx: -Math.PI / 2, cast: false })
    m.userData.floor = i
  })
  const floorTextures = new Map()
  /** Lays `kind` ('mixed' or one floor) with `tint` ('#rrggbb') on both planes. */
  const setFloor = (kind, tint) => {
    floorMats.forEach((m, i) => {
      const k = kind === 'mixed' ? (i === 0 ? 'concrete' : 'oak') : kind
      const spec = FLOOR_KINDS[k]
      const key = `${k}|${i}`
      let tex = floorTextures.get(key)
      if (!tex) {
        tex = spec.make()
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping
        tex.repeat.set(floorSpan[i].w / spec.rep, (z1 - z0) / spec.rep)
        if (spec.turn) tex.rotation = spec.turn
        floorTextures.set(key, tex)
      }
      m.map = tex
      m.roughness = spec.rough
      m.metalness = spec.metal
      m.color.set(tint).multiply(new THREE.Color(spec.mult))
      m.needsUpdate = true
    })
  }
  setFloor('mixed', '#ffffff')
  put(room, rbox(0.08, 0.012, z1 - z0, 0.004), brass(), split, 0.006, (z0 + z1) / 2, { cast: false })

  // ---------------------------------------------------------------- walls (back wall with windows, left wall with door)
  const wallMat = mat(P.wallBack, { roughness: 0.95 })
  const wallMatL = mat(P.wallLeft, { roughness: 0.95 })
  const capMat = mat(P.wallCap, { roughness: 0.9 })
  const backZ = z0 - wall / 2
  const wallPiece = (m, cx, cy, cz, w, hh, d) => {
    put(room, new THREE.BoxGeometry(w, hh, d), m, cx, cy, cz)
  }
  // back wall: below the sills, above the windows, and the piers between
  wallPiece(wallMat, (x0 - wall + x1) / 2, WIN_Y[0] / 2, backZ, x1 - x0 + wall, WIN_Y[0], wall)
  wallPiece(wallMat, (x0 - wall + x1) / 2, (WIN_Y[1] + h) / 2, backZ, x1 - x0 + wall, h - WIN_Y[1], wall)
  const piers = [[x0 - wall, WINDOWS[0][0]], ...WINDOWS.slice(0, -1).map((w, i) => [w[1], WINDOWS[i + 1][0]]), [WINDOWS[WINDOWS.length - 1][1], x1]]
  for (const [a, b] of piers) wallPiece(wallMat, (a + b) / 2, (WIN_Y[0] + WIN_Y[1]) / 2, backZ, b - a, WIN_Y[1] - WIN_Y[0], wall)
  put(room, new THREE.BoxGeometry(x1 - x0 + wall + 0.04, 0.06, wall + 0.04), capMat, (x0 - wall + x1) / 2 + 0.02, h + 0.03, backZ)
  // left wall with a doorway
  const leftX = x0 - wall / 2
  wallPiece(wallMatL, leftX, h / 2, (z0 + DOOR_Z[0]) / 2, wall, h, DOOR_Z[0] - z0)
  wallPiece(wallMatL, leftX, h / 2, (DOOR_Z[1] + z1) / 2, wall, h, z1 - DOOR_Z[1])
  wallPiece(wallMatL, leftX, (DOOR_H + h) / 2, (DOOR_Z[0] + DOOR_Z[1]) / 2, wall, h - DOOR_H, DOOR_Z[1] - DOOR_Z[0])
  put(room, new THREE.BoxGeometry(wall + 0.04, 0.06, z1 - z0 + wall), capMat, leftX, h + 0.03, (z0 + z1) / 2 - wall / 2)
  // the cut edges of the walls, a little darker, so the cutaway reads clearly
  put(room, new THREE.BoxGeometry(wall + 0.02, h + 0.06, 0.02), capMat, leftX, (h + 0.06) / 2, z1 + 0.01, { cast: false })
  put(room, new THREE.BoxGeometry(0.02, h + 0.06, wall + 0.02), capMat, x1 + 0.01, (h + 0.06) / 2, backZ, { cast: false })
  // baseboards
  put(room, rbox(x1 - x0, 0.1, 0.03, 0.01), mat(P.trim), (x0 + x1) / 2, 0.05, z0 + 0.015, { cast: false })
  put(room, rbox(0.03, 0.1, DOOR_Z[0] - z0, 0.01), mat(P.trim), x0 + 0.015, 0.05, (z0 + DOOR_Z[0]) / 2, { cast: false })
  put(room, rbox(0.03, 0.1, z1 - DOOR_Z[1], 0.01), mat(P.trim), x0 + 0.015, 0.05, (DOOR_Z[1] + z1) / 2, { cast: false })
  // sage wainscot on the lounge wall
  put(room, new THREE.BoxGeometry(0.02, 1.05, z1 - DOOR_Z[1] - 0.1), mat(0xc5d0bd, { roughness: 0.9 }), x0 + 0.012, 0.6, (DOOR_Z[1] + z1) / 2 + 0.05, { cast: false })
  put(room, rbox(0.05, 0.04, z1 - DOOR_Z[1] - 0.1, 0.015), mat(P.oakLight), x0 + 0.03, 1.13, (DOOR_Z[1] + z1) / 2 + 0.05)

  // ---------------------------------------------------------------- windows onto the morning
  // kept low and short of the wall's end, so it shows only through the glass
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(9.4, 3.6), new THREE.MeshBasicMaterial({ map: skyTexture() }))
  sky.position.set(3.3, 1.1, z0 - 0.9)
  room.add(sky)
  const nightSky = new THREE.Mesh(sky.geometry, new THREE.MeshBasicMaterial({ map: nightSkyTexture(), transparent: true, opacity: 0, depthWrite: false }))
  nightSky.position.set(3.3, 1.1, z0 - 0.89)
  nightSky.renderOrder = 1
  room.add(nightSky)
  const frame = mat(P.oakLight, { roughness: 0.6 })
  const glass = new THREE.MeshStandardMaterial({ color: 0xe6f1f2, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0, depthWrite: false })
  for (const [a, b] of WINDOWS) {
    const cx = (a + b) / 2
    const w = b - a
    const cy = (WIN_Y[0] + WIN_Y[1]) / 2
    const hh = WIN_Y[1] - WIN_Y[0]
    const fz = z0 - 0.06
    put(room, rbox(w + 0.1, 0.08, 0.14, 0.02), frame, cx, WIN_Y[1], fz)
    put(room, rbox(0.08, hh, 0.14, 0.02), frame, a, cy, fz)
    put(room, rbox(0.08, hh, 0.14, 0.02), frame, b, cy, fz)
    put(room, rbox(0.05, hh, 0.08, 0.015), frame, cx, cy, fz)
    put(room, rbox(w, 0.05, 0.08, 0.015), frame, cx, WIN_Y[0] + hh * 0.7, fz)
    put(room, rbox(w + 0.24, 0.06, 0.26, 0.02), mat(P.travertine, { roughness: 0.5 }), cx, WIN_Y[0], z0 + 0.06)
    const pane = put(room, new THREE.PlaneGeometry(w, hh), glass, cx, cy, z0 - 0.1, { cast: false, receive: false })
    pane.renderOrder = 2
  }
  // little pots on the sills
  deskPlant(room, 1.3, WIN_Y[0] + 0.03, z0 + 0.08, 0, 31)
  deskPlant(room, 5.4, WIN_Y[0] + 0.03, z0 + 0.08, 1, 32)
  pot(room, 4.3, z0 + 0.08, 0.06, 0.12, P.sage, WIN_Y[0] + 0.03)

  // sunbeams: faint warm shafts from each window down to its patch of light on the floor
  const sunlit = [] // materials that fade away after dark
  {
    const d = SUN_FROM.clone().normalize().negate()
    const toFloor = (x, y) => new THREE.Vector3(x + (d.x / -d.y) * y, 0.01, z0 + (d.z / -d.y) * y)
    const positions = []
    const colours = []
    const warm = [1.0, 0.82, 0.55]
    const quad = (p0, p1, p2, p3, f0, f1) => {
      for (const [p, f] of [
        [p0, f0],
        [p1, f0],
        [p2, f1],
        [p0, f0],
        [p2, f1],
        [p3, f1],
      ]) {
        positions.push(p.x, p.y, p.z)
        colours.push(warm[0] * f, warm[1] * f, warm[2] * f)
      }
    }
    for (const [a, b] of WINDOWS) {
      const TL = new THREE.Vector3(a, WIN_Y[1], z0)
      const TR = new THREE.Vector3(b, WIN_Y[1], z0)
      const BL = new THREE.Vector3(a, WIN_Y[0], z0)
      const BR = new THREE.Vector3(b, WIN_Y[0], z0)
      const tl = toFloor(a, WIN_Y[1])
      const tr = toFloor(b, WIN_Y[1])
      const bl = toFloor(a, WIN_Y[0])
      const br = toFloor(b, WIN_Y[0])
      quad(TL, TR, tr, tl, 0.045, 0.006)
      quad(BL, BR, br, bl, 0.03, 0.006)
      quad(TL, BL, bl, tl, 0.025, 0.0)
      quad(TR, BR, br, tr, 0.025, 0.0)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3))
    const beams = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    )
    beams.renderOrder = 3
    room.add(beams)
    sunlit.push(beams.material)

    // dust drifting in the light
    const rnd = seeded(77)
    const count = 110
    const pts = new Float32Array(count * 3)
    const seeds = []
    for (let i = 0; i < count; i++) {
      const [a, b] = WINDOWS[i % WINDOWS.length]
      const y = 0.3 + rnd() * 3
      const base = toFloor(a + rnd() * (b - a), y)
      const p = new THREE.Vector3(base.x, y, base.z - rnd() * 0.6)
      seeds.push({ p, k: rnd() * 10 })
      pts.set([p.x, p.y, p.z], i * 3)
    }
    const dustGeo = new THREE.BufferGeometry()
    dustGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3))
    const dust = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({ map: glow(), size: 5, sizeAttenuation: false, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
    )
    room.add(dust)
    sunlit.push(dust.material)
    animated.push(t => {
      for (let i = 0; i < count; i++) {
        const s = seeds[i]
        pts[i * 3] = s.p.x + Math.sin(t * 0.21 + s.k) * 0.12
        pts[i * 3 + 1] = s.p.y + Math.sin(t * 0.13 + s.k * 2) * 0.18
        pts[i * 3 + 2] = s.p.z + Math.cos(t * 0.17 + s.k) * 0.12
      }
      dustGeo.attributes.position.needsUpdate = true
    })
  }

  // ---------------------------------------------------------------- doorway, hallway and the door itself
  const doorMid = (DOOR_Z[0] + DOOR_Z[1]) / 2
  put(room, new THREE.PlaneGeometry(1.3, DOOR_Z[1] - DOOR_Z[0] + 0.1), mat(0xcfc5b7, { roughness: 0.6 }), x0 - 0.95, 0.003, doorMid, { rx: -Math.PI / 2, cast: false })
  put(room, new THREE.BoxGeometry(0.1, 2.6, DOOR_Z[1] - DOOR_Z[0] + 0.3), mat(0xf6e3c9, { emissive: 0xffe0b0, emissiveIntensity: 0.25 }), x0 - 1.55, 1.3, doorMid)
  put(room, new THREE.BoxGeometry(1.3, 2.6, 0.08), mat(P.wallLeft), x0 - 0.95, 1.3, DOOR_Z[0] - 0.08)
  put(room, new THREE.BoxGeometry(1.3, 2.6, 0.08), mat(P.wallLeft), x0 - 0.95, 1.3, DOOR_Z[1] + 0.08)
  put(room, new THREE.BoxGeometry(1.3, 0.08, DOOR_Z[1] - DOOR_Z[0] + 0.3), mat(P.wallLeft), x0 - 0.95, 2.62, doorMid)
  // trim around the opening
  put(room, rbox(0.08, DOOR_H + 0.08, 0.1, 0.02), frame, x0 + 0.03, (DOOR_H + 0.08) / 2, DOOR_Z[0] - 0.04)
  put(room, rbox(0.08, DOOR_H + 0.08, 0.1, 0.02), frame, x0 + 0.03, (DOOR_H + 0.08) / 2, DOOR_Z[1] + 0.04)
  put(room, rbox(0.08, 0.1, DOOR_Z[1] - DOOR_Z[0] + 0.18, 0.02), frame, x0 + 0.03, DOOR_H + 0.04, doorMid)
  // the leaf, hinged at the far side of the opening, opening into the room
  const hinge = group(room, x0 + 0.06, 0, DOOR_Z[1])
  hinge.userData.dynamic = true
  const leafW = DOOR_Z[1] - DOOR_Z[0] - 0.04
  put(hinge, rbox(0.05, DOOR_H - 0.04, leafW, 0.02), mat(P.sage, { roughness: 0.7 }), 0, (DOOR_H - 0.04) / 2, -leafW / 2)
  put(hinge, rbox(0.06, 0.6, leafW - 0.3, 0.02), mat(0xb3c3ad, { roughness: 0.7 }), 0.005, 1.65, -leafW / 2)
  put(hinge, rbox(0.06, 0.6, leafW - 0.3, 0.02), mat(0xb3c3ad, { roughness: 0.7 }), 0.005, 0.75, -leafW / 2)
  put(hinge, sph(0.035), brass(), 0.05, 1.1, -leafW + 0.12)
  const door = { open: 0, target: 0 }
  animated.push((t, dt) => {
    door.open += (door.target - door.open) * (1 - Math.exp(-dt * 5))
    hinge.rotation.y = -door.open * Math.PI * 0.5
  })

  // ---------------------------------------------------------------- the coffee counter on the back wall
  const ctr = group(room, -6.0, 0, z0 + 0.36)
  put(ctr, rbox(3.8, 0.74, 0.66, 0.04), mat(P.sage, { roughness: 0.75 }), 0, 0.37, 0)
  for (let i = 0; i < 5; i++) put(ctr, rbox(0.7, 0.6, 0.02, 0.01), mat(0xa9bba3, { roughness: 0.75 }), -1.52 + i * 0.76, 0.38, 0.335, { cast: false })
  for (let i = 0; i < 5; i++) put(ctr, rbox(0.3, 0.025, 0.025, 0.01), brass(), -1.52 + i * 0.76, 0.6, 0.355, { cast: false })
  put(ctr, rbox(3.9, 0.06, 0.72, 0.02), mat(P.travertine, { roughness: 0.45 }), 0, 0.77, 0.02)
  // espresso machine
  const em = group(ctr, -0.85, 0.8, -0.05)
  put(em, rbox(0.66, 0.46, 0.42, 0.06), mat(0xf1e8da, { roughness: 0.4 }), 0, 0.23, 0)
  put(em, rbox(0.6, 0.05, 0.38, 0.02), brass(), 0, 0.48, 0)
  put(em, rbox(0.5, 0.04, 0.2, 0.015), brass(), 0, 0.02, 0.27)
  for (const dx of [-0.14, 0.14]) {
    put(em, cyl(0.045, 0.05, 0.08, 14), brass(), dx, 0.22, 0.24)
    put(em, rbox(0.04, 0.03, 0.16, 0.01), mat(P.ink), dx, 0.17, 0.32)
    mug(em, dx, 0.04, 0.27, 0xfbf6ee)
  }
  put(em, cyl(0.05, 0.05, 0.01, 20), mat(0xfbf6ee, { emissive: 0xfff0d8, emissiveIntensity: 0.2 }), 0, 0.36, 0.215, { rx: Math.PI / 2, cast: false })
  put(em, cyl(0.006, 0.006, 0.2, 6), brass(), 0.27, 0.2, 0.22, { rz: 0.3 })
  for (let i = 0; i < 3; i++) put(em, cyl(0.035, 0.03, 0.06, 14), mat([P.terracotta, P.sage, P.boucle][i], { roughness: 0.4 }), -0.18 + i * 0.18, 0.54, 0)
  // grinder, mugs, cake stand, fruit
  const gr = group(ctr, -1.55, 0.8, -0.08)
  put(gr, rbox(0.22, 0.3, 0.24, 0.04), mat(P.graphite, { roughness: 0.5 }), 0, 0.15, 0)
  put(gr, cyl(0.1, 0.05, 0.2, 18), mat(0x8a6a50, { transparent: true, opacity: 0.85, roughness: 0.2 }), 0, 0.4, 0)
  ;[P.terracotta, P.sage, P.apricot, P.boucle].forEach((c, i) => mug(ctr, 0.05 + i * 0.16, 0.8, 0.1, c, -0.6 + i * 0.4))
  put(ctr, cyl(0.16, 0.16, 0.015, 28), mat(P.boucle, { roughness: 0.4 }), 1.05, 0.9, 0)
  put(ctr, cyl(0.025, 0.04, 0.1, 12), mat(P.boucle, { roughness: 0.4 }), 1.05, 0.84, 0)
  const dome = new THREE.SphereGeometry(0.15, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)
  put(ctr, dome, new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.05 }), 1.05, 0.91, 0, { cast: false })
  put(ctr, cyl(0.1, 0.1, 0.07, 20), mat(P.apricot), 1.05, 0.945, 0)
  put(ctr, new THREE.SphereGeometry(0.14, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(P.oakLight, { side: THREE.DoubleSide }), 1.55, 0.94, 0)
  for (let i = 0; i < 4; i++) put(ctr, sph(0.045), mat([P.apricot, P.terracotta, 0xd9c45a, P.peach][i]), 1.5 + (i % 2) * 0.08, 0.86 + (i > 1 ? 0.05 : 0), (i > 1 ? 0.03 : -0.03))
  // steam over the espresso cups
  const steam = []
  for (let i = 0; i < 4; i++) {
    const s = glowSprite(room, -6.85 + (i % 2) * 0.28, 1.2, z0 + 0.6, 0.18, 0)
    s.material.color.set(0xffffff)
    s.material.blending = THREE.NormalBlending
    steam.push({ s, k: i * 0.5, x: s.position.x })
  }
  animated.push(t => {
    for (const st of steam) {
      const f = (t * 0.5 + st.k) % 1
      st.s.position.y = 1.05 + f * 0.45
      st.s.position.x = st.x + Math.sin(t * 2 + st.k * 5) * 0.03
      st.s.material.opacity = Math.sin(f * Math.PI) * 0.35
      st.s.scale.setScalar(0.1 + f * 0.18)
    }
  })
  // floating oak shelves with jars and pothos
  for (const [y, w] of [
    [1.75, 3.3],
    [2.35, 2.4],
  ])
    put(room, rbox(w, 0.06, 0.3, 0.02), mat(P.oak), -6.0, y, z0 + 0.15)
  ;[
    [-7.4, P.boucle],
    [-7.15, P.terracotta],
    [-6.6, P.sage],
  ].forEach(([x, c], i) => put(room, cyl(0.07, 0.07, 0.18 + i * 0.03, 16), mat(c, { roughness: 0.45 }), x, 1.78 + (0.18 + i * 0.03) / 2, z0 + 0.15))
  for (let i = 0; i < 6; i++) put(room, rbox(0.05, 0.22 + (i % 3) * 0.03, 0.18, 0.01), mat([P.dustyBlue, P.peach, P.oat, P.terracotta, P.sage, P.lavender][i]), -5.4 + i * 0.07, 2.49 + (i % 3) * 0.015, z0 + 0.14)
  const shelfPot = pot(room, -4.65, z0 + 0.16, 0.1, 0.14, P.terracotta, 1.78)
  trailingVine(room, -4.6, shelfPot, z0 + 0.22, 1.0, 3, 0.06, 0.06)
  trailingVine(room, -4.72, shelfPot, z0 + 0.18, 0.7, 4, -0.04, 0.05)
  const shelfPot2 = pot(room, -6.4, z0 + 0.16, 0.1, 0.14, P.pot, 2.38)
  trailingVine(room, -6.45, shelfPot2, z0 + 0.24, 0.9, 5, 0.05, 0.07)
  trailingVine(room, -6.3, shelfPot2, z0 + 0.2, 0.55, 6, 0.04, 0.04)
  for (let i = 0; i < 3; i++) mug(room, -7.3 + i * 0.22, 2.38, z0 + 0.16, [P.apricot, P.boucle, P.sage][i])

  // wall clock over the counter, showing the local time
  const clock = group(room, -6.0, 3.2, z0 + 0.03)
  clock.userData.dynamic = true
  put(clock, new THREE.CircleGeometry(0.34, 48), new THREE.MeshStandardMaterial({ map: clockFace(), roughness: 0.6 }), 0, 0, 0.01, { cast: false })
  put(clock, new THREE.TorusGeometry(0.35, 0.03, 10, 48), brass(), 0, 0, 0.01)
  const hourHand = group(clock, 0, 0, 0.03)
  put(hourHand, rbox(0.035, 0.2, 0.012, 0.005), mat(P.ink), 0, 0.08, 0, { cast: false })
  const minuteHand = group(clock, 0, 0, 0.04)
  put(minuteHand, rbox(0.024, 0.28, 0.012, 0.005), mat(P.ink), 0, 0.12, 0, { cast: false })
  put(clock, sph(0.025), mat(P.terracotta), 0, 0, 0.05, { cast: false })
  animated.push(() => {
    const now = new Date()
    const m = now.getMinutes() + now.getSeconds() / 60
    const hh = (now.getHours() % 12) + m / 60
    minuteHand.rotation.z = -(m / 60) * Math.PI * 2
    hourHand.rotation.z = -(hh / 12) * Math.PI * 2
  })

  // bistro table with three stools on a round woven rug
  put(room, new THREE.CylinderGeometry(1.45, 1.45, 0.02, 64), rugMat(roundRugTexture(P.oat, P.sage)), -4.7, 0.012, -3.4, { cast: false })
  put(room, discSlab(0.45, 0.04, 0.02), mat(P.travertine, { roughness: 0.5 }), -4.7, 0.6, -3.4)
  put(room, cyl(0.035, 0.035, 0.6, 12), brass(), -4.7, 0.3, -3.4)
  put(room, cyl(0.24, 0.26, 0.03, 28), brass(), -4.7, 0.025, -3.4)
  for (const [x, z, c] of [
    [-5.45, -3.05, P.sage],
    [-4.0, -3.85, P.apricot],
    [-4.35, -2.65, P.terracotta],
  ]) {
    put(room, discSlab(0.2, 0.1, 0.04), boucle(c, 1), x, 0.36, z)
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2
      put(room, cyl(0.016, 0.016, 0.38, 6), mat(P.oakDark), x + Math.cos(a) * 0.12, 0.18, z + Math.sin(a) * 0.12, { rx: Math.sin(a) * 0.15, rz: -Math.cos(a) * 0.15 })
    }
  }
  mug(room, -4.55, 0.66, -3.3, P.terracotta, 0.4)
  mug(room, -4.85, 0.66, -3.5, P.boucle, 2.2)

  // a rolling whiteboard covered in sticky notes, angled towards the room
  {
    const wb = group(room, -1.9, 0, -4.9, 0.55)
    for (const s of [-1, 1]) {
      put(wb, rbox(0.06, 1.75, 0.06, 0.02), mat(P.oakLight), s * 0.78, 0.95, 0)
      put(wb, rbox(0.06, 0.04, 0.5, 0.02), mat(P.oakLight), s * 0.78, 0.07, 0)
      for (const dz of [-0.22, 0.22]) put(wb, sph(0.035, 10, 8), mat(P.graphite), s * 0.78, 0.035, dz)
    }
    const boardFace = put(wb, rbox(1.5, 1.0, 0.03, 0.02), mat(0xfbf8f3, { roughness: 0.35 }), 0, 1.25, 0)
    room.userData.whiteboard = { group: wb, face: boardFace, width: 1.5, height: 1.0 }
    put(wb, rbox(1.56, 0.04, 0.08, 0.015), mat(P.oakLight), 0, 0.73, 0.02)
    const notes = [0xf6d68a, P.peach, 0xbfd6b5, 0xc9d8e0, P.apricot, 0xe7c8dd]
    const nr = seeded(61)
    for (let i = 0; i < 14; i++) {
      const col = i % 4
      const row = Math.floor(i / 4)
      put(wb, new THREE.PlaneGeometry(0.15, 0.15), mat(notes[Math.floor(nr() * notes.length)], { roughness: 0.9 }), -0.55 + col * 0.36 + nr() * 0.05, 1.6 - row * 0.21, 0.017, {
        rz: (nr() - 0.5) * 0.15,
        cast: false,
      })
    }
    for (let i = 0; i < 3; i++) put(wb, new THREE.PlaneGeometry(0.3 + i * 0.08, 0.012), mat([P.terracotta, P.sageDeep, P.ink][i]), 0.35, 1.0 - i * 0.06, 0.017, { cast: false })
    put(wb, cyl(0.012, 0.012, 0.12, 8), mat(P.terracotta), 0.5, 0.77, 0.04, { rz: Math.PI / 2 })
  }
  // a cluster of snake plants by the work area
  {
    const more = slotOf('plants', 'more')
    const top = pot(more, -1.3, -2.2, 0.26, 0.4, P.boucle)
    const sr = seeded(62)
    for (let i = 0; i < 14; i++) {
      const a = sr() * Math.PI * 2
      const r = sr() * 0.14
      put(more, new THREE.ConeGeometry(0.045, 0.6 + sr() * 0.5, 4), mat(i % 3 ? P.leafDeep : 0x7f9d63, { roughness: 0.6 }), -1.3 + Math.cos(a) * r, top + 0.3, -2.2 + Math.sin(a) * r, {
        rx: (sr() - 0.5) * 0.3,
        rz: (sr() - 0.5) * 0.3,
        s: [1, 1, 0.35],
      })
    }
  }

  // bookshelf on the left wall
  const bs = group(room, x0 + 0.2, 0, -3.3)
  const oakM = mat(P.oak)
  put(bs, rbox(0.36, 2.0, 0.05, 0.015), oakM, 0, 1.0, -1.2)
  put(bs, rbox(0.36, 2.0, 0.05, 0.015), oakM, 0, 1.0, 1.2)
  put(bs, rbox(0.36, 0.05, 0.05, 0.015), oakM, 0, 1.0, 0)
  for (let s = 0; s < 5; s++) put(bs, rbox(0.36, 0.04, 2.44, 0.015), oakM, 0, 0.04 + s * 0.48, 0)
  const brnd = seeded(8)
  const bookCols = [P.sage, P.terracotta, P.apricot, P.peach, P.dustyBlue, P.lavender, P.oat, P.sageDeep]
  for (let s = 0; s < 4; s++) {
    let z = -1.15
    while (z < 1.1) {
      if (Math.abs(z) < 0.06) {
        z += 0.08
        continue
      }
      if (brnd() < 0.12) {
        deskPlant(bs, 0, 0.06 + s * 0.48, z + 0.1, s, 50 + s)
        z += 0.24
        continue
      }
      const w = 0.04 + brnd() * 0.04
      const hh = 0.26 + brnd() * 0.14
      put(bs, rbox(0.26, hh, w, 0.008), mat(bookCols[Math.floor(brnd() * bookCols.length)]), 0, 0.06 + s * 0.48 + hh / 2, z + w / 2, { rx: brnd() < 0.1 ? 0.15 : 0 })
      z += w + 0.006
    }
  }
  const topPot = pot(bs, 0, 0.7, 0.11, 0.16, P.sage, 1.98)
  trailingVine(bs, 0.05, topPot, 0.72, 1.1, 9, 0.08, 0.05)
  trailingVine(bs, 0.08, topPot, 0.62, 0.8, 10, 0.07, -0.05)
  put(bs, cyl(0.06, 0.08, 0.22, 16), mat(P.boucle, { roughness: 0.4 }), 0, 2.11, -0.6)

  // ---------------------------------------------------------------- lounge
  const rug = rugTexture()
  const rugWoven = slotOf('rug', 'woven')
  put(rugWoven, rbox(6.0, 0.025, 4.3, 0.012), rugMat(rug), -4.9, 0.0125, 4.55, { cast: false })
  put(rugWoven, new THREE.CylinderGeometry(1.1, 1.1, 0.02, 64), rugMat(roundRugTexture(P.apricot, P.sage)), -2.75, 0.03, 5.55, { cast: false })
  const rugPlain = slotOf('rug', 'plain')
  put(rugPlain, rbox(6.0, 0.025, 4.3, 0.012), rugMat(null, 0xd9cdbb), -4.9, 0.0125, 4.55, { cast: false })
  put(rugPlain, new THREE.CylinderGeometry(1.1, 1.1, 0.02, 64), rugMat(null, 0xc9bba6), -2.75, 0.03, 5.55, { cast: false })
  curvedSofa(slotOf('sofa', 'curved'), -4.9, 4.75)
  modularSofa(slotOf('sofa', 'straight'), -4.9, 3.45, 0)
  memphisTable(room, -4.9, 4.7)
  tubChair(room, -2.6, 5.35, -2.1, P.boucle)
  put(room, discSlab(0.3, 0.26, 0.08), boucle(P.terracotta, 1.2), -5.2, 0.0, 6.35)
  modularSofa(room, x0 + 0.55, 4.45, Math.PI / 2)
  const floorLamps = slotOf('lamps', 'floor')
  arcFloorLamp(floorLamps, x0 + 0.5, 6.45, 0.45, lights)
  // side table by the sofa, with a lamp
  put(room, discSlab(0.24, 0.04, 0.02), mat(P.oakLight), x0 + 0.5, 0.5, 2.55)
  put(room, cyl(0.03, 0.03, 0.5, 10), mat(P.oakDark), x0 + 0.5, 0.25, 2.55)
  put(floorLamps, sph(0.12), mat(P.terracotta, { roughness: 0.4 }), x0 + 0.5, 0.66, 2.55, { s: [1, 0.85, 1] })
  put(floorLamps, new THREE.SphereGeometry(0.16, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(P.boucle, { emissive: 0xffe0b0, emissiveIntensity: 0.6, side: THREE.DoubleSide }), x0 + 0.5, 0.86, 2.55)
  lampGlows.push(glowSprite(floorLamps, x0 + 0.5, 0.88, 2.55, 0.8, 0.5))
  // prints over the sofa
  for (const [z, k] of [
    [3.65, 0],
    [4.85, 1],
  ]) {
    put(room, rbox(0.05, 0.92, 0.76, 0.015), mat(P.oakLight), x0 + 0.03, 2.25, z)
    put(room, new THREE.PlaneGeometry(0.64, 0.8), new THREE.MeshStandardMaterial({ map: artTexture(k), roughness: 0.9 }), x0 + 0.06, 2.25, z, { ry: Math.PI / 2, cast: false })
  }
  put(room, rbox(0.04, 0.6, 0.48, 0.015), mat(P.oakLight), x0 + 0.03, 2.05, -5.6)
  put(room, new THREE.PlaneGeometry(0.4, 0.52), new THREE.MeshStandardMaterial({ map: artTexture(2), roughness: 0.9 }), x0 + 0.06, 2.05, -5.6, { ry: Math.PI / 2, cast: false })

  // the studio cat, asleep on the sofa
  const cat = group(room, x0 + 0.62, 0.36, 3.75, 0.4)
  cat.userData.dynamic = true
  const fur = mat(0xdc9c68, { roughness: 1 })
  const body = put(cat, sph(0.2), fur, 0, 0.1, 0, { s: [1, 0.62, 0.78] })
  put(cat, sph(0.11), fur, 0.15, 0.1, 0.1)
  for (const dz of [-0.05, 0.05]) put(cat, new THREE.ConeGeometry(0.035, 0.07, 8), fur, 0.18, 0.2, 0.1 + dz, { rz: -0.3 })
  put(cat, sph(0.07), mat(0xf6e8d6, { roughness: 1 }), 0.2, 0.06, 0.13)
  put(cat, new THREE.TorusGeometry(0.17, 0.035, 8, 20, Math.PI * 1.1), fur, -0.02, 0.05, 0.02, { rx: Math.PI / 2, rz: 1.6 })
  animated.push(t => {
    const b = 1 + Math.sin(t * 1.6) * 0.035
    body.scale.set(1, 0.62 * b, 0.78 * b)
  })

  // fluted glass partition between the lounge and the front pod, on an oak planter
  {
    const len = 4.4
    const cz = 4.05
    const px = -0.6
    put(room, rbox(0.3, 0.32, len + 0.1, 0.05), mat(P.oak), px, 0.16, cz)
    for (let i = 0; i < 9; i++) leaf(room, leafGeo(0.18, 0.16, 0, 0.08), i % 2 ? P.leaf : P.leafLight, px, 0.3, cz - len / 2 + 0.25 + i * 0.5, (i % 2 ? 1 : -1) * Math.PI * 0.5, 0.35)
    put(room, rbox(0.1, 0.08, len, 0.02), mat(P.oakLight), px, 2.5, cz)
    for (const dz of [-len / 2, 0, len / 2]) put(room, rbox(0.1, 2.2, 0.08, 0.02), mat(P.oakLight), px, 1.4, cz + dz)
    const n = Math.round(len / 0.065)
    const flute = new THREE.CylinderGeometry(0.034, 0.034, 2.14, 10, 1, false, 0, Math.PI)
    const fm = new THREE.MeshStandardMaterial({ color: 0xeaf2ef, transparent: true, opacity: 0.38, roughness: 0.18, metalness: 0, depthWrite: false })
    const inst = new THREE.InstancedMesh(flute, fm, n * 2)
    const m4 = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    for (let i = 0; i < n; i++) {
      const z = cz - len / 2 + 0.04 + i * (len - 0.08) / (n - 1)
      for (const side of [0, 1]) {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), side ? -Math.PI / 2 : Math.PI / 2)
        m4.compose(new THREE.Vector3(px + (side ? -0.005 : 0.005), 1.4, z), q, new THREE.Vector3(1, 1, 1))
        inst.setMatrixAt(i * 2 + side, m4)
      }
    }
    inst.renderOrder = 2
    room.add(inst)
  }

  // ---------------------------------------------------------------- tall plants
  // (the design keeps these in two slots: the first three always stay unless the plants are 'none', the rest are 'lush')
  const plantsCore = slotOf('plants', 'core')
  const plantsMore = slotOf('plants', 'more')
  fiddleLeafFig(plantsCore, x0 + 0.55, z0 + 0.6, 12, 2.4)
  fiddleLeafFig(plantsMore, x1 - 0.6, z1 - 0.7, 13, 2.2)
  monstera(plantsCore, x1 - 0.55, z0 + 0.6, 14, 2.6)
  monstera(plantsMore, -1.5, 6.4, 15, 1.7)
  fiddleLeafFig(plantsCore, -0.15, z0 + 0.55, 16, 1.9)
  const doorPot = pot(plantsMore, x0 + 0.4, 1.55, 0.24, 0.42, P.sage)
  for (let i = 0; i < 12; i++) leaf(plantsMore, leafGeo(0.36, 0.2, 0, 0.18), i % 2 ? P.leaf : P.leafDeep, x0 + 0.4, doorPot, 1.55, (i / 12) * Math.PI * 2, 0.9 - (i % 3) * 0.15)

  // ---------------------------------------------------------------- pendants
  const pendants = slotOf('lamps', 'pendants')
  pendant(pendants, -4.9, 4.7, 2.75, 0.4, 0xfbf3e6, lights)
  pendant(pendants, -6.0, -5.9, 2.6, 0.28, 0xfbf3e6, lights, false)
  pendant(pendants, -5.9, -3.9, 2.45, 0.24, 0xfbf3e6, lights, false)
  pendant(pendants, 1.8, -3.8, 2.7, 0.36, 0xfbf3e6, lights)
  pendant(pendants, 6.0, -3.8, 2.7, 0.36, 0xfbf3e6, lights)
  pendant(pendants, 4.4, 4.2, 2.7, 0.36, 0xfbf3e6, lights)

  // ---------------------------------------------------------------- the token rack, the extinguisher, the poster
  const rack = tokenRack(room, 6.4, z0 + 0.32, animated)
  const extinguisher = extinguisherStand(room, -0.95, -0.8)
  const poster = posterFrame(slotOf('poster', 'on'), 3.4, 2.15, z0)

  // ---------------------------------------------------------------- desk pods
  const seats = []
  const pods = [
    { cx: 1.8, cz: -3.8, rug: false },
    { cx: 6.0, cz: -3.8, rug: false },
    { cx: 4.4, cz: 4.2, rug: true },
  ]
  const chairCols = [P.sage, P.terracotta, P.apricot, P.oat, P.dustyBlue, P.peach]
  let n = 0
  for (const pod of pods) {
    if (pod.rug)
      put(room, new THREE.CylinderGeometry(2.25, 2.25, 0.02, 72), rugMat(roundRugTexture(P.peach, P.terracotta)), pod.cx, 0.012, pod.cz, { cast: false })
    // the shared travertine spine down the middle of the pod
    put(room, rbox(0.06, 0.16, 2.5, 0.02), mat(P.travertineDeep), pod.cx, 0.7, pod.cz)
    for (const rowZ of [pod.cz - 0.65, pod.cz + 0.65])
      for (const face of [1, -1]) {
        const seat = makeSeat(room, pod.cx - face * 1.05, rowZ, face, n, chairCols[n % chairCols.length], animated)
        seat.pod = { x: pod.cx, z: pod.cz }
        seat.desk = new THREE.Vector3(seat.x + face * 0.7, 0.62, rowZ)
        seats.push(seat)
        n++
      }
  }

  const doorway = { inside: new THREE.Vector3(x0 + 1.0, 0, doorMid), outside: new THREE.Vector3(x0 - 1.25, 0, doorMid), z: doorMid }
  // where someone stands with a coffee when every desk is taken
  const lounge = [
    new THREE.Vector3(-3.0, 0, -1.4),
    new THREE.Vector3(-4.4, 0, -1.9),
    new THREE.Vector3(-2.0, 0, 1.4),
    new THREE.Vector3(-6.8, 0, -1.6),
    new THREE.Vector3(-3.6, 0, 1.6),
  ]

  // The lamps' lights stay in the room itself, so hiding a lamp never changes the number of lights (which would make
  // every material compile again); a hidden lamp's light is turned down instead.
  room.updateMatrixWorld(true)
  const lightOwner = lights.map(l => {
    for (let p = l.parent; p; p = p.parent) if (p === slots.lamps.styles.pendants) return 'pendants'
    return 'floor'
  })
  for (const l of lights) room.attach(l)
  // each style of each slot is merged on its own, then everything else
  for (const slot of Object.values(slots)) for (const style of Object.values(slot.styles)) batchStatic(style)
  batchStatic(room)

  const lightBase = lights.map(l => l.intensity)
  const lightColour = lights.map(l => l.color.clone())
  const lightScale = lights.map(() => 1)
  const glowBase = lampGlows.map(s => s.material.opacity)
  const glowColour = lampGlows.map(s => s.material.color.clone())
  const sunBase = sunlit.map(m => m.opacity)
  let night = 0
  let current = null

  /**
   * Restyles the room live from a design (see design.js): recolours the role materials, lays the floor, swaps or hides
   * the furniture slots and warms or cools the lamps. Returns '' when it worked, or the reason a design was refused.
   */
  function applyDesign(input) {
    const got = checkDesign(input)
    if (!got.ok) return got.error
    const d = got.design
    const num = hex => parseInt(hex.slice(1), 16)
    for (const r of roleMats.values()) r.m.color.set(offsetColour(num(d.colors[r.key]), r.key, r.hex))
    for (const { m, mult } of rugMats) m.color.set(d.colors.rug).multiply(new THREE.Color(mult))
    setFloor(d.floor, d.colors.floor)
    const v = d.variants
    const show = (slot, style, on) => (slots[slot].styles[style].visible = on)
    for (const style of ['curved', 'straight']) show('sofa', style, v.sofa === style)
    for (const style of ['woven', 'plain']) show('rug', style, v.rug === style)
    show('plants', 'core', v.plants !== 'none')
    show('plants', 'more', v.plants === 'lush')
    show('lamps', 'pendants', v.lamps === 'all' || v.lamps === 'pendants')
    show('lamps', 'floor', v.lamps === 'all' || v.lamps === 'floor')
    slots.poster.group.visible = v.poster
    // light warmth: 0.5 is the loft's own light, below it turns towards cool white, above it towards amber
    const shift = (d.light - 0.5) * 2
    const target = new THREE.Color(shift > 0 ? 0xff9a4a : 0xc4dcff)
    const amount = Math.abs(shift) * 0.75
    lights.forEach((l, i) => {
      l.color.copy(lightColour[i]).lerp(target, amount)
      lightScale[i] = slots.lamps.styles[lightOwner[i]].visible ? 1 : 0
    })
    lampGlows.forEach((s, i) => s.material.color.copy(glowColour[i]).lerp(target, amount))
    current = d
    world.setNight(night)
    return ''
  }

  const world = {
    seats,
    doorway,
    lounge,
    lights,
    door,
    rack,
    extinguisher,
    poster,
    /** The studio cat's group, and the lamp glow sprites (the interact feature moves and switches them). */
    cat,
    lampGlows,
    /** The rolling whiteboard: its group, the board mesh and the board's size. */
    whiteboard: room.userData.whiteboard,
    /** The windows, for the weather: their x ranges, the sill and head heights, the wall's z, the two skies and the glass. */
    windows: { list: WINDOWS, y: WIN_Y, z: z0, sky, nightSky, glass },
    /** A multiplier on the sunbeams and dust (the weather weakens or strengthens them). */
    sunGain: 1,
    /** 0 = full day, 1 = night: the sky in the windows, the sunbeams and dust, and how bright the lamps are. */
    setNight(n) {
      nightSky.material.opacity = n
      nightSky.visible = n > 0.002
      sunlit.forEach((m, i) => (m.opacity = Math.min(1, sunBase[i] * (1 - n) * (this.sunGain ?? 1))))
      night = n
      lights.forEach((l, i) => (l.intensity = lightBase[i] * (1 + n * 1.6) * lightScale[i]))
      lampGlows.forEach((s, i) => (s.material.opacity = Math.min(1, glowBase[i] * (1 + n * 1.3))))
    },
    update(t, dt) {
      for (const f of animated) f(t, dt)
    },
    /**
     * The room's look. `apply(design)` restyles it live (returns '' or the reason a design was refused), `defaults` is the
     * loft as it has always looked, `current()` the design now showing.
     */
    design: { defaults: DEFAULT_DESIGN, apply: applyDesign, current: () => current ?? DEFAULT_DESIGN },
  }
  return world
}

/**
 * One workstation: a rounded ash-and-travertine desk with a screen, a lamp, a plant and a mug, and its chair. The
 * desk faces the sitter, who sits at (x, z) looking along +x (`face` 1) or -x (`face` -1).
 */
function makeSeat(room, x, z, face, index, chairColour, animated) {
  const deskX = x + face * 0.7
  const desk = group(room, deskX, 0, z, -face * (Math.PI / 2)) // local +z points at the sitter
  const top = 0.62
  const deskAsh = roleMat('desks', P.ash, { roughness: 0.6 })
  put(desk, rbox(1.25, 0.05, 0.7, 0.025), roleMat('desks', P.travertine, { roughness: 0.5 }), 0, top - 0.025, 0)
  put(desk, rbox(1.27, 0.035, 0.72, 0.017), deskAsh, 0, top - 0.065, 0)
  for (const dx of [-0.56, 0.56]) put(desk, rbox(0.06, top - 0.08, 0.6, 0.03), deskAsh, dx, (top - 0.08) / 2, 0)
  put(desk, rbox(1.0, 0.26, 0.03, 0.015), deskAsh, 0, top - 0.25, -0.3)

  // the screen: people who face the camera (face 1) get a low laptop so their faces stay in view; people with their
  // backs to the camera get a slim aluminium monitor
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x1c1a19, roughness: 0.25, metalness: 0.1, emissive: 0xffffff, emissiveIntensity: 0 })
  const hasMonitor = face === -1
  if (hasMonitor) {
    put(desk, rbox(0.2, 0.012, 0.14, 0.005), aluminum(), 0, top + 0.006, -0.16)
    put(desk, rbox(0.04, 0.2, 0.02, 0.01), aluminum(), 0, top + 0.1, -0.2)
    put(desk, rbox(0.56, 0.34, 0.025, 0.012), aluminum(), 0, top + 0.31, -0.19)
    put(desk, new THREE.PlaneGeometry(0.52, 0.3), screenMat, 0, top + 0.31, -0.176, { cast: false })
    put(desk, rbox(0.4, 0.012, 0.12, 0.005), mat(0xf4f1ec, { roughness: 0.5 }), 0, top + 0.006, 0.08)
  }
  if (!hasMonitor) {
    const lx = 0
    const lz = -0.02
    put(desk, rbox(0.34, 0.014, 0.24, 0.006), aluminum(), lx, top + 0.007, lz)
    const lid = group(desk, lx, top + 0.014, lz - 0.12)
    lid.rotation.x = -0.25
    put(lid, rbox(0.34, 0.22, 0.012, 0.006), aluminum(), 0, 0.11, -0.006)
    put(lid, new THREE.PlaneGeometry(0.31, 0.19), screenMat, 0, 0.112, 0.001, { cast: false })
  }
  // lamp: brass arm, sage or cream shade, warm bulb
  const lampSide = index % 2 ? -0.5 : 0.5
  const lamp = group(desk, lampSide, top, -0.22)
  put(lamp, cyl(0.06, 0.07, 0.02, 20), brass(), 0, 0.01, 0)
  put(lamp, cyl(0.008, 0.008, 0.34, 6), brass(), 0, 0.17, 0, { rx: 0.15 })
  put(lamp, cyl(0.008, 0.008, 0.2, 6), brass(), 0, 0.36, 0.08, { rx: -1.0 })
  const shade = new THREE.ConeGeometry(0.075, 0.1, 20, 1, true)
  put(lamp, shade, mat(index % 3 ? P.sage : P.boucle, { side: THREE.DoubleSide, roughness: 0.6 }), 0, 0.4, 0.17, { rx: 0.5 })
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff3dc, emissive: 0xffcf8a, emissiveIntensity: 0.1 })
  put(lamp, sph(0.025, 10, 8), bulbMat, 0, 0.37, 0.19, { cast: false })
  const lampGlow = glowSprite(lamp, 0, 0.32, 0.22, 0.75, 0)

  deskPlant(desk, -lampSide * 0.95, top, -0.22, index, 100 + index)
  const deskMug = mug(desk, index % 2 ? 0.42 : -0.42, top, 0.18, [P.terracotta, P.sage, P.boucle, P.apricot][index % 4], index)
  deskMug.userData.dynamic = true
  if (index % 3 === 1) put(desk, rbox(0.2, 0.025, 0.14, 0.006), mat(P.dustyBlue), -lampSide * 0.4, top + 0.012, 0.12, { ry: 0.2 })
  if (index === 0) {
    // Claude's desk: a notebook with a pen, and sticky notes
    put(desk, rbox(0.22, 0.02, 0.16, 0.008), mat(P.terracotta), 0.3, top + 0.01, 0.1, { ry: -0.25 })
    put(desk, rbox(0.2, 0.004, 0.15, 0.002), mat(0xfbf6ee), 0.3, top + 0.022, 0.1, { ry: -0.25, cast: false })
    put(desk, cyl(0.006, 0.006, 0.15, 6), brass(), 0.26, top + 0.03, 0.12, { rz: Math.PI / 2, ry: 0.5 })
    for (let i = 0; i < 3; i++) put(desk, rbox(0.06, 0.004, 0.06, 0.002), mat([0xf6d68a, P.peach, 0xbfd6b5][i]), -0.28 + i * 0.075, top + 0.004, 0.2 - (i % 2) * 0.03, { ry: i * 0.3, cast: false })
  }

  // chair: a soft rounded seat and back on a brass stem; local +z is behind the sitter
  const chair = group(room, x, 0, z, -face * (Math.PI / 2))
  chair.userData.dynamic = true
  const side = index % 4 < 2 ? -1 : 1
  const fabric = mat(chairColour, { roughness: 0.95 })
  put(chair, cyl(0.24, 0.26, 0.03, 24), brass(), 0, 0.03, 0)
  put(chair, cyl(0.025, 0.025, 0.24, 10), brass(), 0, 0.15, 0)
  put(chair, rbox(0.46, 0.08, 0.44, 0.04), fabric, 0, 0.29, 0)
  put(chair, arcSlab(0.17, 0.25, Math.PI + 0.35, Math.PI * 2 - 0.35, 0.3, 0.035), fabric, 0, 0.33, 0)

  const seat = {
    index,
    x,
    z,
    face,
    approach: new THREE.Vector3(x - face * 0.75, 0, z),
    chair,
    chairHome: chair.position.clone(),
    deskMug,
    occupant: null,
    power: 0, // 0 = screen and lamp off, 1 = on
    want: 0,
    pulled: 0,
    pullWant: 0,
  }
  const screens = [screenMat]
  desk.traverse(o => {
    if (o.isMesh && o.material !== screenMat && o.material.emissive && o.material.color?.getHex() === 0x1c1a19) screens.push(o.material)
  })
  seat.screens = screens
  animated.push((t, dt) => {
    seat.power += (seat.want - seat.power) * (1 - Math.exp(-dt * 3))
    seat.pulled += (seat.pullWant - seat.pulled) * (1 - Math.exp(-dt * 7))
    for (const s of seat.screens) s.emissiveIntensity = seat.power * 1.05
    bulbMat.emissiveIntensity = 0.1 + seat.power * 2.4
    lampGlow.material.opacity = seat.power * 0.6
    // the chair rolls aside (away from the other row) while someone gets in or out
    chair.position.copy(seat.chairHome)
    chair.position.z += side * 0.5 * seat.pulled
    chair.rotation.y = -face * (Math.PI / 2) + side * face * 0.35 * seat.pulled
  })
  return seat
}

/**
 * Merges every mesh that never moves into one mesh per material, so the whole room draws in about a hundred calls
 * instead of well over a thousand. Groups marked `userData.dynamic` (the door, the clock, the cat, chairs, mugs) and
 * transparent things stay as they are.
 */
function batchStatic(root) {
  root.updateMatrixWorld(true)
  const buckets = new Map()
  const merged = []
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh) return
    for (let p = o; p && p !== root; p = p.parent) if (p.userData.dynamic) return
    const m = o.material
    if (Array.isArray(m) || m.transparent || m.vertexColors) return
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name)
    if (!g.attributes.normal || !g.attributes.uv) return
    g.clearGroups()
    g.applyMatrix4(o.matrixWorld)
    const key = `${m.uuid}|${o.castShadow}|${o.receiveShadow}`
    let b = buckets.get(key)
    if (!b) buckets.set(key, (b = { material: m, cast: o.castShadow, receive: o.receiveShadow, geos: [] }))
    b.geos.push(g)
    merged.push(o)
  })
  for (const o of merged) o.parent.remove(o)
  for (const b of buckets.values()) {
    const geo = mergeGeometries(b.geos, false)
    if (!geo) continue
    const mesh = new THREE.Mesh(geo, b.material)
    mesh.castShadow = b.cast
    mesh.receiveShadow = b.receive
    root.add(mesh)
  }
}

/** Points a seat's screens at the shared code texture (done once the texture exists). */
export function wireScreens(seats, texture) {
  for (const seat of seats)
    for (const s of seat.screens) {
      s.map = texture
      s.emissiveMap = texture
      s.color.set(0x111010)
      s.needsUpdate = true
    }
}

// ------------------------------------------------------------------------------------------------------ token rack

/** Green while there is plenty left, amber in the middle, glowing hot pink near the limit. */
export function levelColour(percent) {
  if (percent >= 95) return 0xff2448
  if (percent >= 80) return 0xff2e86
  if (percent >= 50) return 0xffad2e
  return 0x45d98c
}

/**
 * A walnut server rack against the back wall, stacked with pastel modules, with two tall LED strips: the left one
 * fills with how much of the context window is used, the right one with how much of the five-hour usage limit is
 * gone. A neon "tokens" sign above it takes the colour of the fuller of the two. `set(context, fiveHour)` takes
 * percentages (0 to 100), or null for a reading Claude Code does not have.
 */
function tokenRack(room, x, z, animated) {
  const W = 0.7
  const H = 2.1
  const D = 0.46
  const base = group(room, x, 0, z)
  const walnut = mat(0x6e4b37, { roughness: 0.55 })
  put(base, rbox(W, H, D, 0.04), walnut, 0, H / 2 + 0.06, 0)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(base, cyl(0.025, 0.03, 0.06, 10), brass(), sx * (W / 2 - 0.07), 0.03, sz * (D / 2 - 0.07))
  put(base, rbox(W + 0.06, 0.05, D + 0.06, 0.02), mat(P.travertine, { roughness: 0.5 }), 0, H + 0.085, 0)
  put(base, rbox(W - 0.12, H - 0.16, 0.02, 0.01), mat(0x2b2624, { roughness: 0.4 }), 0, H / 2 + 0.06, D / 2 + 0.002)
  put(base, rbox(W - 0.06, 0.03, 0.03, 0.01), brass(), 0, H - 0.0, D / 2 + 0.01, { cast: false })

  const live = group(base, 0, 0, D / 2 + 0.014)
  live.userData.dynamic = true
  const faces = [P.sage, P.oat, P.terracotta, P.dustyBlue, P.peach, P.sage, P.oat]
  const leds = []
  for (let i = 0; i < faces.length; i++) {
    const y = 0.32 + i * 0.245
    put(live, rbox(0.3, 0.18, 0.02, 0.012), mat(faces[i], { roughness: 0.6 }), 0, y, 0)
    for (let j = 0; j < 3; j++) put(live, rbox(0.15, 0.008, 0.006, 0.002), mat(0x3a332e), -0.04, y - 0.035 + j * 0.035, 0.012, { cast: false })
    for (let j = 0; j < 2; j++) {
      const m = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: j ? 0x7fe3a8 : 0xffc26b, emissiveIntensity: 1 })
      put(live, sph(0.012, 8, 6), m, 0.07 + j * 0.04, y + 0.03, 0.014, { cast: false })
      leds.push({ m, phase: (i * 7 + j * 3) % 11, rate: 0.6 + ((i + j) % 4) * 0.45 })
    }
  }
  const N = 20
  const bottom = 0.22
  const segH = (H - 0.36) / N
  const STRIP_X = [-0.24, 0.24]
  const strips = STRIP_X.map(sx =>
    Array.from({ length: N }, (_, i) => {
      const m = new THREE.MeshStandardMaterial({ color: 0x1b1817, emissive: 0x000000, roughness: 0.3 })
      put(live, rbox(0.11, segH * 0.74, 0.025, 0.008), m, sx, bottom + (i + 0.5) * segH, 0.006, { cast: false })
      return m
    }),
  )
  // a soft glow along each strip, as tall as it is full
  const beams = STRIP_X.map(sx => {
    const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }))
    b.position.set(sx, bottom, 0.06)
    live.add(b)
    return b
  })
  for (const [sx, words] of [
    [STRIP_X[0], 'ctx'],
    [STRIP_X[1], '5h'],
  ]) {
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.05), new THREE.MeshBasicMaterial({ map: textTexture(words, { width: 256, height: 80, font: '700 56px "Segoe UI", sans-serif' }), transparent: true, color: 0xe8dcc8, depthWrite: false }))
    label.position.set(sx, 0.13, 0.012)
    live.add(label)
  }
  // the neon sign on the wall above
  const signMat = new THREE.MeshBasicMaterial({ map: textTexture('tokens', { font: 'italic 900 100px "Segoe Script", "Segoe UI", cursive', glow: 14 }), transparent: true, depthWrite: false, toneMapped: false })
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.175), signMat)
  sign.position.set(0, H + 0.55, -D / 2 + 0.02)
  live.add(sign)
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }))
  halo.scale.set(1.3, 0.6, 1)
  halo.position.set(0, H + 0.55, -D / 2 + 0.05)
  live.add(halo)
  const spill = new THREE.PointLight(0x45d98c, 0.6, 2.6, 1.8)
  spill.position.set(0, 1.2, 0.5)
  live.add(spill)

  const value = [null, null]
  const shown = [0, 0]
  const col = new THREE.Color()
  animated.push((t, dt) => {
    let top = -1
    for (let s = 0; s < 2; s++) {
      const v = value[s]
      shown[s] += ((v ?? 0) - shown[s]) * (1 - Math.exp(-dt * 2.5))
      const lit = (shown[s] / 100) * N
      const pulse = v !== null && v >= 85 ? 0.7 + 0.3 * Math.sin(t * 6) : 1
      col.set(levelColour(v ?? 0))
      strips[s].forEach((m, i) => {
        let on = Math.max(0, Math.min(1, lit - i))
        if (v === null) on = Math.abs(((t * 4) % (N * 2)) - N - i) < 0.6 ? 0.25 : 0 // no reading: a slow grey scan
        if (on > 0) {
          if (v === null) m.emissive.setRGB(0.5, 0.55, 0.65)
          else m.emissive.copy(col)
          m.emissiveIntensity = (0.35 + on * 1.25) * pulse
          m.color.set(0x302a28)
        } else {
          m.emissive.setRGB(0, 0, 0)
          m.color.set(0x1b1817)
        }
      })
      const tall = Math.max(0.05, (shown[s] / 100) * (H - 0.36))
      beams[s].scale.set(0.42, tall * 1.25 + 0.2, 1)
      beams[s].position.y = bottom + tall / 2
      beams[s].material.color.copy(col)
      beams[s].material.opacity = v === null ? 0 : 0.45 * pulse
      if (v !== null) top = Math.max(top, v)
    }
    const sc = new THREE.Color(top < 0 ? 0xd9c8b0 : levelColour(top))
    const flicker = top >= 85 ? 0.75 + 0.25 * Math.sin(t * 6) : 0.96 + 0.04 * Math.sin(t * 23)
    // a little darker than the light itself, so the tube reads against a sunny wall too
    signMat.color.copy(sc).multiplyScalar(0.8 * flicker)
    halo.material.color.copy(sc)
    halo.material.opacity = (top < 0 ? 0.15 : 0.4) * flicker
    spill.color.copy(sc)
    spill.intensity = top < 0 ? 0.2 : 0.7 * flicker
    for (const l of leds) l.m.emissiveIntensity = Math.sin(t * l.rate * 6 + l.phase) > 0.2 ? 1.4 : 0.15
  })
  return {
    set(context, fiveHour) {
      value[0] = Number.isFinite(context) ? Math.max(0, Math.min(100, context)) : null
      value[1] = Number.isFinite(fiveHour) ? Math.max(0, Math.min(100, fiveHour)) : null
    },
    /** For checks: what the strips are showing. */
    reading: () => ({ context: value[0], fiveHour: value[1] }),
  }
}

/**
 * A fire point by the central aisle: an oak post on a travertine foot, with a red extinguisher on its hook and a
 * little "FIRE" sign on top. Close to every desk pod, so whoever goes to fetch it is quick about it.
 */
function extinguisherStand(room, x, z) {
  put(room, cyl(0.2, 0.22, 0.05, 24), mat(P.travertine, { roughness: 0.5 }), x, 0.025, z)
  put(room, rbox(0.1, 1.25, 0.1, 0.02), mat(P.oakLight), x, 0.65, z)
  put(room, rbox(0.3, 0.13, 0.02, 0.006), mat(0xd8342c), x, 1.33, z + 0.055, { cast: false })
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.1),
    new THREE.MeshBasicMaterial({ map: textTexture('FIRE', { width: 256, height: 100, font: '800 64px "Segoe UI", sans-serif' }), color: 0xffffff, transparent: true }),
  )
  plaque.position.set(x, 1.33, z + 0.067)
  room.add(plaque)
  const g = group(room, x, 0.74, z + 0.12)
  g.userData.dynamic = true
  put(g, rbox(0.16, 0.04, 0.08, 0.012), mat(P.graphite), 0, 0.02, -0.06)
  const ext = extinguisherProp()
  g.add(ext)
  return {
    /** The one on its hook: hidden while someone carries it. */
    onWall: ext,
    spot: new THREE.Vector3(x, 0, z + 0.75),
    yaw: Math.PI,
  }
}

/** A framed square poster on the back wall; `set(texture)` hangs the person's own picture in it. */
function posterFrame(room, x, y, z0) {
  put(room, rbox(0.68, 0.68, 0.04, 0.015), mat(P.oakLight), x, y, z0 + 0.02)
  const m = new THREE.MeshStandardMaterial({ map: artTexture(1), roughness: 0.85 })
  put(room, new THREE.PlaneGeometry(0.6, 0.6), m, x, y, z0 + 0.043, { cast: false })
  return {
    set(texture) {
      m.map = texture
      m.needsUpdate = true
    },
  }
}
