// The built-in people of the studio: soft chibi figures with big anime eyes. Claude is a young woman with silver-lilac
// hair, gold eyes and a terracotta cape; each agent comes with a look of its own. These bodies stand in when no
// character model is set up (or while one loads); motion.js moves them, the same way it moves the models.

import * as THREE from 'three'
import { P, capsule, cyl, group, mat, put, rbox, sph } from './kit.js'
import { makeActor } from './motion.js'

export const CLAUDE_LOOK = {
  style: 'long',
  skin: 0xf7dcc9,
  hair: 0xd9cde6,
  eye: 0xd99a3a,
  ears: 'elf',
  circlet: true,
  cape: 0xa95f45,
  orbs: true,
  top: P.claude,
  inner: 0xf6efe4,
  bottom: 0xeadfcb,
  skirt: true,
  legs: 0x5e4c47,
  shoes: 0x8a5a44,
  ahoge: true,
  clip: P.sage,
  colour: '#d97757',
}

export const AGENT_LOOKS = [
  { style: 'bob', skin: 0xf3cfb6, hair: 0x2f2a33, eye: 0x4f5f80, top: P.sage, inner: 0xf6efe4, bottom: 0x6f675f, legs: 0x6f675f, shoes: 0x5a4a40, catEars: true, colour: '#7f977a' },
  { style: 'bun', skin: 0xeec1a0, hair: 0xd8b27c, eye: 0x6a8a5a, top: 0xf3ead8, inner: P.terracotta, bottom: P.terracotta, skirt: true, legs: 0xe8d8c4, shoes: 0xa95f45, glasses: true, witchHat: 0x55705a, colour: '#c8775a' },
  { style: 'short', skin: 0xd9a07a, hair: 0x3a2a22, eye: 0x3a2a22, top: 0x8ea5b4, inner: 0xf6efe4, bottom: 0x5f5a55, legs: 0x5f5a55, shoes: 0xf2ece2, ears: 'elf', cape: 0x6f8a68, colour: '#7f98a6' },
  { style: 'curly', skin: 0xb97a55, hair: 0x2a211d, eye: 0x3a2a22, top: P.terracotta, inner: P.beige, bottom: P.beige, legs: P.beige, shoes: 0x6b4a36, horns: true, colour: '#a95f45' },
  { style: 'beanie', skin: 0xf6d7c3, hair: 0x8a5a3a, eye: 0x5a6a3a, top: P.peach, inner: 0xf6efe4, bottom: 0x5d6b7a, legs: 0x5d6b7a, shoes: 0x8a6a50, hat: P.sage, colour: '#e0a98a' },
  { style: 'twintails', skin: 0xf8e0d0, hair: 0xcbb8da, eye: 0x7a5a9a, top: 0xf6efe6, inner: P.lavender, bottom: P.sage, skirt: true, legs: 0xf3ece4, shoes: 0x9a86b0, halo: true, cape: 0xb3a2cf, colour: '#9a86b0' },
  { style: 'long', skin: 0xf0c8ae, hair: 0x1f1c22, eye: 0x5a3a3a, top: 0x8b8fb0, inner: 0xf6efe4, bottom: 0xe9dcc6, skirt: true, legs: 0x4e4a50, shoes: 0x4e4a50, ears: 'elf', circlet: true, colour: '#8b8fb0' },
  { style: 'short', skin: 0xf3cdb4, hair: 0xa8754e, eye: 0x5a7a8a, top: 0xe6d3b3, inner: P.sage, bottom: 0x8a6f5a, legs: 0x8a6f5a, shoes: 0x5a4a40, glasses: true, cape: 0x7f98a6, colour: '#b48a5f' },
]
const LOOK_BY_TYPE = { Explore: 0, Plan: 1, 'general-purpose': 2, teammate: 6, 'claude-code-guide': 5, 'statusline-setup': 3 }

/** A look for an agent of `type`, avoiding looks already in the room. */
export function lookFor(type, taken) {
  const own = LOOK_BY_TYPE[type]
  if (own !== undefined && !taken.has(own)) return own
  for (let i = 0; i < AGENT_LOOKS.length; i++) if (!taken.has(i)) return i
  let h = 0
  for (const c of type) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h % AGENT_LOOKS.length
}

const UP = new THREE.Vector3(0, 1, 0)
const R = 0.27 // head radius
const HR = 0.292 // hair shell radius

function dirOnHead(a, b, r = R) {
  return new THREE.Vector3(Math.sin(a) * Math.cos(b) * r, Math.sin(b) * r, Math.cos(a) * Math.cos(b) * r)
}

/** A group sitting on the head's surface at yaw `a`, pitch `b`, its +z pointing out of the face. */
function patch(head, a, b, r = R) {
  const g = new THREE.Group()
  const p = dirOnHead(a, b, r)
  g.position.copy(p)
  // the head's own frame: +z out of the surface, +y as near to up as it can be (what Object3D.lookAt does)
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(p.clone().multiplyScalar(3), p, UP))
  head.add(g)
  return g
}

function shell(r, phiStart, phiLength, thetaStart, thetaLength) {
  return new THREE.SphereGeometry(r, 36, 22, phiStart, phiLength, thetaStart, thetaLength)
}

function buildHair(head, look, hairMat) {
  const front = Math.PI / 2
  const add = (geo, x = 0, y = 0, z = 0, o = {}) => put(head, geo, hairMat, x, y, z, { cast: true, ...o })
  const strand = (a, b, sx, sy, tilt) => {
    const g = patch(head, a, b, HR * 0.985)
    const m = new THREE.Mesh(sph(1, 14, 10), hairMat)
    m.scale.set(sx, sy, 0.035)
    m.rotation.z = tilt
    m.position.y = -sy * 0.3
    m.castShadow = true
    g.add(m)
  }
  const bangs = (n, spread, b = 0.53, len = 0.08) => {
    for (let k = 0; k < n; k++) {
      const t = n === 1 ? 0 : k / (n - 1) - 0.5
      strand(t * spread, b, 0.06, len + (Math.abs(t) < 0.2 ? 0 : 0.012), -t * 0.5)
    }
  }
  switch (look.style) {
    case 'long':
    case 'twintails': {
      add(shell(HR, 0, Math.PI * 2, 0, 1.05))
      add(shell(HR, front + 0.72, Math.PI * 2 - 1.44, 0.9, 1.15))
      bangs(5, 1.3)
      for (const s of [-1, 1]) add(capsule(0.045, 0.26), s * 0.255, -0.13, 0.08, { rz: s * 0.06 })
      if (look.style === 'long') add(capsule(0.2, 0.42), 0, -0.32, -0.12, { s: [1.18, 1, 0.55] })
      else
        for (const s of [-1, 1]) {
          add(capsule(0.07, 0.36), s * 0.32, -0.2, -0.05, { rz: s * 0.22 })
          put(head, sph(0.04), mat(P.terracotta), s * 0.29, 0.03, -0.05)
        }
      break
    }
    case 'bob': {
      add(shell(HR, 0, Math.PI * 2, 0, 1.0))
      add(shell(HR * 1.05, front + 0.68, Math.PI * 2 - 1.36, 0.85, 1.12))
      add(shell(HR * 1.015, front - 0.86, 1.72, 0.5, 0.75))
      break
    }
    case 'short': {
      add(shell(HR * 1.02, 0, Math.PI * 2, 0, 1.18))
      add(shell(HR * 1.02, front + 0.9, Math.PI * 2 - 1.8, 1.0, 0.65))
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        const p = dirOnHead(a, 0.95 + (i % 2) * 0.2, HR)
        add(new THREE.ConeGeometry(0.06, 0.13, 8), p.x, p.y, p.z, { rx: Math.cos(a) * 0.9, rz: -Math.sin(a) * 0.9 })
      }
      strand(0.25, 0.55, 0.07, 0.08, -0.6)
      break
    }
    case 'bun': {
      add(shell(HR, 0, Math.PI * 2, 0, 1.05))
      add(shell(HR, front + 0.8, Math.PI * 2 - 1.6, 0.9, 0.8))
      add(sph(0.11), 0, 0.25, -0.15)
      put(head, new THREE.TorusGeometry(0.07, 0.018, 8, 18), mat(P.terracotta), 0, 0.2, -0.1, { rx: 1.0 })
      strand(-0.4, 0.5, 0.07, 0.1, 0.5)
      strand(-0.12, 0.55, 0.06, 0.08, 0.35)
      for (const s of [-1, 1]) add(capsule(0.03, 0.14), s * 0.26, -0.08, 0.07)
      break
    }
    case 'curly': {
      for (let i = 0; i < 46; i++) {
        const a = i * 2.39996
        const b = Math.asin(1 - (i / 46) * 1.15)
        const p = dirOnHead(a, b, HR * 1.02)
        if (p.z > 0.12 && p.y < 0.17) continue
        add(sph(0.075, 12, 10), p.x, p.y, p.z)
      }
      break
    }
    case 'beanie': {
      put(head, shell(HR * 1.08, 0, Math.PI * 2, 0, 1.2), mat(look.hat, { roughness: 1 }), 0, 0.02, 0)
      put(head, new THREE.TorusGeometry(HR * 1.08 * Math.sin(1.2), 0.035, 8, 40), mat(look.hat, { roughness: 1 }), 0, 0.02 + HR * 1.08 * Math.cos(1.2), 0, { rx: Math.PI / 2 })
      put(head, sph(0.065, 14, 10), mat(P.boucle, { roughness: 1 }), 0, 0.34, 0)
      add(shell(HR, front + 0.9, Math.PI * 2 - 1.8, 1.1, 0.7))
      strand(0.62, 0.3, 0.06, 0.08, -0.5)
      break
    }
  }
  const gold = mat(P.brass, { metalness: 0.85, roughness: 0.3 })
  const glowGem = c => mat(c, { emissive: c, emissiveIntensity: 1.6, roughness: 0.2 })
  if (look.circlet) {
    put(head, new THREE.TorusGeometry(HR * 0.955, 0.01, 6, 48), gold, 0, 0.1, 0.01, { rx: Math.PI / 2 + 0.3 })
    put(head, sph(0.028, 12, 8), glowGem(0x7fd6c8), 0, 0.2, HR * 0.96)
  }
  if (look.catEars)
    for (const s of [-1, 1]) {
      put(head, new THREE.ConeGeometry(0.075, 0.15, 4), hairMat, s * 0.16, 0.3, -0.02, { rz: -s * 0.35 })
      put(head, new THREE.ConeGeometry(0.045, 0.1, 4), mat(0xf2b8b0), s * 0.157, 0.29, 0.012, { rz: -s * 0.35 })
    }
  if (look.horns)
    for (const s of [-1, 1]) put(head, new THREE.ConeGeometry(0.035, 0.16, 10), mat(0xf2ead8, { roughness: 0.4 }), s * 0.13, 0.33, 0.06, { rz: -s * 0.3, rx: -0.3 })
  if (look.halo) put(head, new THREE.TorusGeometry(0.17, 0.014, 8, 40), glowGem(0xffd98a), 0, 0.46, -0.03, { rx: Math.PI / 2 - 0.2 })
  if (look.witchHat) {
    const hatMat = mat(look.witchHat, { roughness: 0.85 })
    put(head, cyl(0.44, 0.44, 0.02, 40), hatMat, 0, 0.22, 0, { rx: -0.12 })
    put(head, new THREE.ConeGeometry(0.22, 0.5, 28), hatMat, 0, 0.47, -0.05, { rx: -0.3 })
    put(head, cyl(0.225, 0.235, 0.05, 28), mat(P.terracotta), 0, 0.26, -0.01, { rx: -0.12 })
    put(head, sph(0.03, 10, 8), glowGem(0xffd98a), 0.0, 0.28, 0.23)
  }
  if (look.ahoge) put(head, new THREE.TorusGeometry(0.06, 0.012, 6, 14, Math.PI * 1.25), hairMat, 0.02, HR + 0.05, 0.02, { ry: Math.PI / 2, rz: -0.4 })
  if (look.clip) {
    const g = patch(head, 0.72, 0.42, HR)
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(sph(1, 10, 8), mat(look.clip))
      m.scale.set(0.035, 0.025, 0.02)
      m.position.x = s * 0.03
      g.add(m)
    }
    const knot = new THREE.Mesh(sph(0.013, 8, 6), mat(P.terracotta))
    knot.position.z = 0.01
    g.add(knot)
  }
}

function buildFace(head, look, hairMat) {
  const eyes = []
  const dark = mat(0x2d211d, { roughness: 0.4 })
  const iris = mat(look.eye, { roughness: 0.35 })
  const white = mat(0xffffff, { roughness: 0.2, emissive: 0xffffff, emissiveIntensity: 0.4 })
  for (const s of [-1, 1]) {
    const g = patch(head, s * 0.37, -0.07)
    const lid = new THREE.Group()
    g.add(lid)
    const e = new THREE.Mesh(sph(1, 16, 12), dark)
    e.scale.set(0.06, 0.085, 0.016)
    lid.add(e)
    const ir = new THREE.Mesh(sph(1, 16, 12), iris)
    ir.scale.set(0.045, 0.056, 0.01)
    ir.position.set(0, -0.016, 0.009)
    lid.add(ir)
    const hl = new THREE.Mesh(sph(1, 10, 8), white)
    hl.scale.set(0.02, 0.024, 0.006)
    hl.position.set(s * 0.016, 0.022, 0.016)
    lid.add(hl)
    const hl2 = new THREE.Mesh(sph(1, 8, 6), white)
    hl2.scale.setScalar(0.007)
    hl2.position.set(-s * 0.015, -0.028, 0.016)
    lid.add(hl2)
    const lash = new THREE.Mesh(capsule(0.009, 0.075, 6), dark)
    lash.rotation.z = Math.PI / 2 + s * 0.18
    lash.position.set(s * 0.006, 0.064, 0.008)
    g.add(lash)
    eyes.push(lid)
    const brow = patch(head, s * 0.36, 0.2)
    const bm = new THREE.Mesh(capsule(0.008, 0.05, 6), hairMat)
    bm.rotation.z = Math.PI / 2 - s * 0.15
    brow.add(bm)
    const blush = patch(head, s * 0.56, -0.24)
    const bl = new THREE.Mesh(new THREE.CircleGeometry(0.045, 20), mat(0xf2a69a, { transparent: true, opacity: 0.5, depthWrite: false }))
    bl.position.z = 0.004
    bl.scale.y = 0.65
    blush.add(bl)
    if (look.glasses) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.007, 6, 28), mat(P.brass, { metalness: 0.7, roughness: 0.35 }))
      rim.position.z = 0.035
      g.add(rim)
    }
  }
  if (look.glasses) put(head, cyl(0.006, 0.006, 0.07, 6), mat(P.brass, { metalness: 0.7, roughness: 0.35 }), 0, -0.02, R + 0.03, { rz: Math.PI / 2, cast: false })
  const mouth = patch(head, 0, -0.33)
  const mm = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, 6, 14, Math.PI), mat(0x8a4a3c))
  mm.rotation.z = Math.PI
  mouth.add(mm)
  return eyes
}

function legMesh(parent, look, side) {
  const leg = group(parent, side * 0.078, 0, 0)
  const legMat = mat(look.skirt ? look.legs : look.bottom, { roughness: 0.9 })
  put(leg, capsule(0.072, 0.13), legMat, 0, -0.13, 0)
  const knee = group(leg, 0, -0.25, 0)
  put(knee, capsule(0.064, 0.13), legMat, 0, -0.1, 0)
  put(knee, rbox(0.12, 0.075, 0.19, 0.035), mat(look.shoes, { roughness: 0.6 }), 0, -0.235, 0.035)
  return { leg, knee }
}

/** Builds a chibi person: the body below, moved by the shared actor in motion.js. */
export function makePerson(look, id) {
  return makeActor(id, chibiRig(look, id))
}

/**
 * The built-in body: soft chibi shapes with big anime eyes. As a rig it takes the actor's joint angles; it has no
 * elbows, so a bent elbow swings the whole arm a little further instead.
 */
export function chibiRig(look, id) {
  const object = new THREE.Group()
  const body = group(object, 0, 0.52, 0)
  const skin = mat(look.skin, { roughness: 0.75 })
  const hairMat = mat(look.hair, { roughness: 0.55 })
  const top = mat(look.top, { roughness: 0.9 })

  const L = legMesh(body, look, 1)
  const Rl = legMesh(body, look, -1)

  const torso = group(body, 0, 0, 0)
  const prof = [
    [0, -0.02],
    [0.15, -0.02],
    [0.178, 0.05],
    [0.183, 0.17],
    [0.168, 0.3],
    [0.13, 0.4],
    [0.07, 0.445],
    [0, 0.455],
  ].map(([x, y]) => new THREE.Vector2(x, y))
  put(torso, new THREE.LatheGeometry(prof, 28), top, 0, 0, 0)
  put(torso, new THREE.SphereGeometry(0.075, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(look.inner, { roughness: 0.9 }), 0, 0.4, 0.07, { rx: 0.9, s: [1, 1, 0.5] })
  if (look.style === 'long' && look.ahoge) {
    // Claude's cardigan: an open front over a cream top, with two buttons
    put(torso, rbox(0.1, 0.36, 0.03, 0.014), mat(look.inner, { roughness: 0.9 }), 0, 0.2, 0.168, { rx: -0.05 })
    for (const y of [0.13, 0.25]) put(torso, sph(0.014, 8, 6), mat(P.oakDark), 0.065, y, 0.17)
  }
  if (look.cape) {
    put(torso, new THREE.CylinderGeometry(0.19, 0.34, 0.6, 24, 1, true, Math.PI / 2, Math.PI), mat(look.cape, { side: THREE.DoubleSide, roughness: 0.9 }), 0, 0.13, -0.02)
    put(torso, sph(0.03, 10, 8), mat(P.brass, { metalness: 0.85, roughness: 0.3 }), 0, 0.41, 0.12)
  }
  if (look.hood) put(torso, new THREE.TorusGeometry(0.12, 0.05, 10, 20), top, 0, 0.42, -0.08, { rx: Math.PI / 2 - 0.4 })
  if (look.skirt) {
    const sk = new THREE.LatheGeometry(
      [
        [0.262, -0.21],
        [0.235, -0.12],
        [0.2, -0.02],
        [0.17, 0.06],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
      30,
    )
    put(torso, sk, mat(look.bottom, { roughness: 0.9, side: THREE.DoubleSide }), 0, 0, 0)
  } else put(torso, cyl(0.17, 0.165, 0.1, 24), mat(look.bottom, { roughness: 0.9 }), 0, -0.02, 0)

  const arm = side => {
    const a = group(torso, side * 0.2, 0.36, 0)
    put(a, capsule(0.054, 0.2), top, 0, -0.14, 0)
    put(a, sph(0.055, 14, 10), skin, 0, -0.31, 0)
    return a
  }
  const armA = arm(1)
  const armB = arm(-1)
  // where props sit in each hand: -y runs out along the fingers, +z points forward
  const hands = { A: group(armA, 0, -0.33, 0), B: group(armB, 0, -0.33, 0) }

  const neck = group(torso, 0, 0.43, 0)
  put(neck, cyl(0.055, 0.06, 0.08, 12), skin, 0, 0.02, 0)
  const head = group(neck, 0, 0.25, 0)
  put(head, sph(R, 36, 26), skin, 0, 0, 0)
  for (const s of [-1, 1])
    if (look.ears === 'elf') put(head, new THREE.ConeGeometry(0.04, 0.2, 10), skin, s * 0.3, 0.0, -0.03, { rz: -s * 1.15, rx: -0.35 })
    else put(head, sph(0.05, 10, 8), skin, s * 0.265, -0.03, -0.01, { s: [0.6, 1, 0.8] })
  buildHair(head, look, hairMat)
  const eyes = buildFace(head, look, hairMat)

  const orbs = []
  if (look.orbs)
    for (const c of [0xffd98a, 0x9fe3d6, 0xf3b4c8]) {
      const o = put(object, sph(0.035, 12, 8), mat(c, { emissive: c, emissiveIntensity: 2.2 }), 0, 1.3, 0, { cast: false })
      orbs.push(o)
    }
  object.traverse(o => {
    if (o.isMesh) o.userData.personId = id
  })

  const armX = x => Math.max(-3.0, Math.min(0.7, x))
  let clock = Math.random() * 100
  return {
    object,
    kind: 'chibi',
    hand: side => hands[side],
    anchor(out) {
      head.getWorldPosition(out)
      out.y += 0.6
      return out
    },
    head(out) {
      return head.getWorldPosition(out)
    },
    apply(J, bob, dt, face, closed) {
      clock += dt
      body.position.y = 0.52 - J.drop * 0.12 + bob
      torso.rotation.x = J.lean
      torso.rotation.y = J.twist
      L.leg.rotation.x = J.tL
      Rl.leg.rotation.x = J.tR
      L.knee.rotation.x = J.kL
      Rl.knee.rotation.x = J.kR
      armA.rotation.set(armX(J.aAx - J.eA * 0.55), 0, J.aAz)
      armB.rotation.set(armX(J.aBx - J.eB * 0.55), 0, J.aBz)
      head.rotation.set(J.hX, J.hY, J.hZ)
      const open = 1 - closed * 0.88
      for (const e of eyes) e.scale.y += (open - e.scale.y) * Math.min(1, dt * 40)
      // magic orbs drift around the head
      orbs.forEach((o, i) => {
        const a = clock * 1.3 + i * 2.094
        o.position.set(Math.cos(a) * 0.42, body.position.y + 0.78 + Math.sin(clock * 2.1 + i) * 0.06, Math.sin(a) * 0.42)
      })
    },
    dispose() {},
  }
}
