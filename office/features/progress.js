// The progress feature: the studio grows like a tycoon game. The office server keeps lifetime counts (agents hired,
// tests passed, fires put out, files edited, sessions, git commits) and sends them with every update. This feature
// shows them on plaques over a trophy shelf on the back wall, and unlocks a prop in the room at each milestone: an
// aquarium, an arcade cabinet, a gold fire safety trophy, a neon sign, a bigger plant and paper planes gliding over the
// desks. The next locked prop shows as a faint outline.
// When a milestone is crossed while the window is open there is confetti at the new prop and a toast at the top.
//
// Three more milestones have no plaque: a commit made after midnight (a night owl figurine on the shelf), and the best
// streak of days in a row the office was used (7: a felt pennant over the shelf; 30: a gold frame round the standup
// feature's wall calendar, which turns gold itself).
//
// Demo switch: ?progress=N fakes the counts as N times a base set (N=0 is the bare room, 3 or more unlocks everything).
// Add &grow and the counts jump to (N+1) times the base after 10 seconds, so a toast can be watched. ?streak=N (on a
// demo page) fakes the best streak.

import * as THREE from 'three'
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js'
import { P, brass, cyl, group, mat, put, rbox, sph, textTexture } from '../kit.js'
import { CALENDAR } from './standup.js'

/** The five counted things, as the mod names them, with the words for a plaque. */
const STATS = [
  { name: 'agents-hired', plaque: 'agents hired' },
  { name: 'tests-passed', plaque: 'tests passed' },
  { name: 'fires-out', plaque: 'fires put out' },
  { name: 'files-edited', plaque: 'files edited' },
  { name: 'sessions', plaque: 'sessions' },
  { name: 'commits', plaque: 'commits' },
]

/**
 * What each count unlocks, and at how many. The last three have no plaque of their own: `night-commits` (commits made
 * between midnight and five in the morning) and `streak-best` (the most days in a row the office was used, from the
 * server's `stats.best`); `why` says what earned them and `more` what is still needed.
 */
const UNLOCKS = [
  { key: 'aquarium', title: 'Aquarium', stat: 'agents-hired', at: 10 },
  { key: 'arcade', title: 'Arcade cabinet', stat: 'tests-passed', at: 25 },
  { key: 'trophy', title: 'Fire safety trophy', stat: 'fires-out', at: 3 },
  { key: 'neon', title: 'Neon sign', stat: 'files-edited', at: 100 },
  { key: 'plant', title: 'Big plant', stat: 'sessions', at: 20 },
  { key: 'planes', title: 'Paper planes', stat: 'commits', at: 50 },
  { key: 'owl', title: 'Night owl', stat: 'night-commits', at: 1, why: () => 'a commit after midnight', more: () => 'a commit between midnight and 5 am' },
  { key: 'pennant', title: 'Streak pennant', stat: 'streak-best', at: 7, why: () => '7 days in a row', more: n => `a 7-day streak (best so far: ${n})` },
  { key: 'gold', title: 'Gold calendar', stat: 'streak-best', at: 30, why: () => '30 days in a row', more: n => `a 30-day streak (best so far: ${n})` },
]

/** Why a milestone was unlocked, for its banner, and what it still needs, for the shelf's "next unlock" line. */
const plaqueOf = u => STATS.find(s => s.name === u.stat)?.plaque ?? u.stat
const whyOf = u => u.why?.() ?? `${u.at} ${plaqueOf(u)}`
const moreOf = (u, n) => u.more?.(n) ?? `${u.at - n} more ${plaqueOf(u)}`

/** The counts ?progress=1 fakes (the scale is multiplied in; 3 or more unlocks everything). */
const DEMO_BASE = { 'agents-hired': 4, 'tests-passed': 10, 'fires-out': 1, 'files-edited': 40, sessions: 8, commits: 20, 'night-commits': 1, 'streak-best': 10 }

const TOAST_SECONDS = 6
const ease = x => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2)

const CSS = `
#progress-toasts { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 40; display: flex;
  flex-direction: column; align-items: center; gap: 8px; pointer-events: none; }
.progress-toast { background: #fff8ec; color: #3f332c; border: 2px solid #d97757; border-radius: 14px; padding: 8px 18px;
  font: 700 14px "Segoe UI", sans-serif; box-shadow: 0 6px 18px rgba(63, 51, 44, 0.25); animation: progress-in 0.45s ease-out;
  transition: opacity 0.5s, transform 0.5s; }
.progress-toast.bye { opacity: 0; transform: translateY(-10px); }
.progress-toast b { color: #c8775a; }
@keyframes progress-in { from { opacity: 0; transform: translateY(-16px) scale(0.9); } to { opacity: 1; transform: none; } }
`

/** Merges the still, opaque meshes of a group into one mesh per material (and shadow setting), to save draw calls. */
function bake(root) {
  root.updateMatrixWorld(true)
  const inverse = root.matrixWorld.clone().invert()
  const buckets = new Map()
  const merged = []
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || o.userData.keep) return
    const m = o.material
    if (Array.isArray(m) || m.transparent) return
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name)
    if (!g.attributes.normal || !g.attributes.uv) return
    g.clearGroups()
    g.applyMatrix4(inverse.clone().multiply(o.matrixWorld))
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

export function makeProgress(ctx) {
  const { scene, fx, params, ROOM } = ctx
  const z0 = ROOM.z0
  const x0 = ROOM.x0

  const style = document.createElement('style')
  style.textContent = CSS
  document.head.appendChild(style)
  const toasts = document.createElement('div')
  toasts.id = 'progress-toasts'
  document.body.appendChild(toasts)

  // ---------------------------------------------------------------- the demo switch
  const demoScale = params.has('progress') ? (params.get('progress') === '' ? 1 : Math.max(0, Number(params.get('progress')) || 0)) : null
  const growing = demoScale !== null && params.has('grow')
  const demoStart = performance.now()
  const demoCounts = () => {
    const k = growing && performance.now() - demoStart > 10000 ? demoScale + 1 : demoScale
    return Object.fromEntries(Object.entries(DEMO_BASE).map(([name, n]) => [name, Math.round(n * k)]))
  }

  // ---------------------------------------------------------------- the trophy shelf on the back wall
  // (six plaques: the board sits a little left of the aquarium, clear of the coffee corner's shelves and the fig)
  const SHELF_X = -2.3
  const shelf = group(scene, SHELF_X - 0.15, 0, z0)
  put(shelf, rbox(3.19, 0.94, 0.05, 0.02), mat(P.oakLight), 0, 2.5, 0.03)
  put(shelf, rbox(3.4, 0.05, 0.26, 0.02), mat(P.oak), 0, 1.78, 0.14)
  for (const dx of [-1.45, 1.45]) put(shelf, rbox(0.04, 0.16, 0.2, 0.01), brass(), dx, 1.68, 0.1)
  // the plaques are one picture, redrawn when a count changes
  const board = document.createElement('canvas')
  board.width = 1536
  board.height = 440
  const boardTexture = new THREE.CanvasTexture(board)
  boardTexture.colorSpace = THREE.SRGBColorSpace
  boardTexture.anisotropy = 4
  const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.07, 0.84), new THREE.MeshBasicMaterial({ map: boardTexture }))
  boardMesh.position.set(0, 2.5, 0.062)
  shelf.add(boardMesh)
  bake(shelf)

  function paintBoard(counts, next) {
    const g = board.getContext('2d')
    const W = board.width
    const H = board.height
    g.fillStyle = '#f3ead9'
    g.fillRect(0, 0, W, H)
    g.fillStyle = '#3f332c'
    g.font = '800 38px "Segoe UI", sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('STUDIO MILESTONES', W / 2, 38)
    const colW = (W - 60) / STATS.length
    STATS.forEach((s, i) => {
      const x = 30 + i * colW + 8
      const w = colW - 16
      const n = Number(counts[s.name]) || 0
      const unlock = UNLOCKS.find(u => u.stat === s.name)
      g.fillStyle = '#c9a05a'
      g.beginPath()
      g.roundRect(x, 76, w, 270, 16)
      g.fill()
      g.fillStyle = '#fbf6ec'
      g.beginPath()
      g.roundRect(x + 8, 84, w - 16, 254, 11)
      g.fill()
      const cx = x + w / 2
      g.fillStyle = '#3f332c'
      g.font = '800 82px "Segoe UI", sans-serif'
      g.fillText(n >= 10000 ? Math.round(n / 1000) + 'k' : String(n), cx, 150, w - 24)
      g.font = '700 28px "Segoe UI", sans-serif'
      g.fillStyle = '#6b5a4c'
      g.fillText(s.plaque, cx, 214, w - 24)
      // a bar towards the prop this count unlocks
      const done = n >= unlock.at
      g.fillStyle = '#e4d8c4'
      g.beginPath()
      g.roundRect(x + 24, 248, w - 48, 16, 8)
      g.fill()
      g.fillStyle = done ? '#7f977a' : '#d97757'
      g.beginPath()
      g.roundRect(x + 24, 248, Math.max(16, (w - 48) * Math.min(1, n / unlock.at)), 16, 8)
      g.fill()
      g.font = '700 25px "Segoe UI", sans-serif'
      g.fillStyle = done ? '#5c7557' : '#8a6a50'
      g.fillText(done ? unlock.title : `${Math.min(n, unlock.at)} / ${unlock.at}  ${unlock.title}`, cx, 304, w - 24)
    })
    g.font = '700 32px "Segoe UI", sans-serif'
    g.fillStyle = '#a95f45'
    g.fillText(next ? `Next unlock: ${next.title}, ${moreOf(next, next.n)}` : 'Everything is unlocked. Nice studio!', W / 2, 394, W - 60)
    boardTexture.needsUpdate = true
  }

  // ---------------------------------------------------------------- the props
  /** An aquarium on an oak cabinet by the back wall, with fish swimming and bubbles rising. */
  function buildAquarium() {
    const g = group(scene, SHELF_X, 0, z0 + 0.42)
    put(g, rbox(1.4, 0.72, 0.5, 0.03), mat(P.oak), 0, 0.36, 0)
    for (const dx of [-0.34, 0.34]) {
      put(g, rbox(0.6, 0.6, 0.02, 0.01), mat(P.sage, { roughness: 0.75 }), dx, 0.36, 0.255, { cast: false })
      put(g, sph(0.022, 8, 6), brass(), dx > 0 ? 0.06 : -0.06, 0.36, 0.28, { cast: false })
    }
    put(g, rbox(1.34, 0.04, 0.46, 0.01), mat(P.graphite), 0, 0.74, 0)
    put(g, rbox(1.24, 0.07, 0.38, 0.02), mat(0xe9d6a8), 0, 0.79, 0)
    for (const [x, z, r, c] of [[-0.35, 0.05, 0.09, 0x9a948c], [0.3, -0.06, 0.07, 0xb3ada3], [0.42, 0.08, 0.05, 0x8c867e]]) put(g, sph(r, 10, 8), mat(c), x, 0.84, z, { s: [1.2, 0.7, 1] })
    for (let i = 0; i < 7; i++) {
      const x = -0.5 + i * 0.16 + (i % 2) * 0.04
      put(g, new THREE.ConeGeometry(0.025, 0.3 + (i % 3) * 0.1, 5), mat(i % 2 ? P.leafDeep : P.leafLight, { roughness: 0.6 }), x, 0.95 + (i % 3) * 0.05, -0.1 + (i % 3) * 0.08, { rz: i % 2 ? 0.1 : -0.1 })
    }
    const frame = mat(P.graphite)
    for (const dx of [-0.64, 0.64]) for (const dz of [-0.19, 0.19]) put(g, rbox(0.03, 0.54, 0.03, 0.008), frame, dx, 1.04, dz)
    put(g, rbox(1.34, 0.06, 0.46, 0.015), frame, 0, 1.33, 0)
    put(g, rbox(1.1, 0.012, 0.28, 0.004), mat(0xffffff, { emissive: 0xdff4ff, emissiveIntensity: 1.3 }), 0, 1.295, 0, { cast: false })
    bake(g)
    // the water, see-through
    const water = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.52, 0.4), new THREE.MeshStandardMaterial({ color: 0x7fc4d6, transparent: true, opacity: 0.3, roughness: 0.1, depthWrite: false }))
    water.position.y = 1.04
    water.renderOrder = 2
    g.add(water)
    // the fish are one instanced mesh
    const body = new THREE.SphereGeometry(0.06, 10, 8).scale(1.5, 0.9, 0.5).toNonIndexed()
    const tail = new THREE.ConeGeometry(0.045, 0.09, 4).rotateZ(-Math.PI / 2).translate(-0.1, 0, 0).toNonIndexed()
    const fishGeo = mergeGeometries([body, tail], false)
    const FISH = [0xf08a3c, 0xe85d4a, 0xf3cf4a, 0xf2b488, 0x6aa8d8, 0xf09ac0]
    const fish = new THREE.InstancedMesh(fishGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }), FISH.length)
    fish.frustumCulled = false
    FISH.forEach((c, i) => fish.setColorAt(i, new THREE.Color(c)))
    g.add(fish)
    const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.014, 6, 5), new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.7 }), 8)
    bubbles.frustumCulled = false
    g.add(bubbles)
    const m4 = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const qz = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const fwd = new THREE.Vector3(0, 0, 1)
    const pos = new THREE.Vector3()
    const scl = new THREE.Vector3(1, 1, 1)
    const anim = t => {
      FISH.forEach((_, i) => {
        const speed = 0.35 + (i % 3) * 0.12
        const ph = i * 1.7
        pos.set(Math.sin(t * speed + ph) * (0.45 - (i % 2) * 0.1), 1.0 + Math.sin(t * 0.8 + i) * 0.1 + (i % 3) * 0.04, ((i % 3) - 1) * 0.1)
        q.setFromAxisAngle(up, Math.cos(t * speed + ph) >= 0 ? 0 : Math.PI).multiply(qz.setFromAxisAngle(fwd, Math.sin(t * 6 + i) * 0.08))
        m4.compose(pos, q, scl.set(1, 1, 1))
        fish.setMatrixAt(i, m4)
      })
      fish.instanceMatrix.needsUpdate = true
      q.identity()
      for (let i = 0; i < 8; i++) {
        const f = (t * 0.25 + i * 0.37) % 1
        pos.set(-0.52 + (i % 2) * 0.05 + Math.sin(t * 3 + i) * 0.01, 0.85 + f * 0.42, 0.02 + (i % 3) * 0.03)
        m4.compose(pos, q, scl.setScalar(0.6 + f * 0.6))
        bubbles.setMatrixAt(i, m4)
      }
      bubbles.instanceMatrix.needsUpdate = true
    }
    return { group: g, anim, size: [1.4, 1.36, 0.5], center: [SHELF_X, 0.68, z0 + 0.42], top: 1.4 }
  }

  /** An arcade cabinet on the left wall, with a screen that plays a tiny invaders game. */
  function buildArcade() {
    const g = group(scene, x0 + 0.5, 0, -5.2, Math.PI / 2)
    const body = mat(P.terracotta)
    const dark = mat(P.ink)
    put(g, rbox(0.66, 0.92, 0.66, 0.03), body, 0, 0.46, 0)
    put(g, rbox(0.66, 0.8, 0.5, 0.03), body, 0, 1.32, -0.08)
    put(g, rbox(0.62, 0.07, 0.36, 0.02), mat(P.oat), 0, 0.96, 0.3, { rx: -0.2 })
    put(g, rbox(0.52, 0.44, 0.04, 0.015), mat(P.graphite), 0, 1.3, 0.19, { rx: -0.1 })
    put(g, rbox(0.4, 0.14, 0.02, 0.01), dark, 0, 0.55, 0.335, { cast: false })
    put(g, rbox(0.12, 0.02, 0.02, 0.005), brass(), 0, 0.55, 0.348, { cast: false })
    put(g, rbox(0.68, 0.2, 0.52, 0.03), mat(0x2a1f3d), 0, 1.84, -0.08)
    for (const dx of [-0.333, 0.333]) put(g, rbox(0.01, 0.78, 0.4, 0.004), mat(P.apricot), dx, 0.46, 0, { cast: false })
    put(g, cyl(0.012, 0.012, 0.1, 8), dark, -0.12, 1.02, 0.31)
    put(g, sph(0.035, 10, 8), mat(0xd9453d), -0.12, 1.08, 0.31)
    ;[0xf3cf4a, 0x6aa8d8, 0x7fb069].forEach((c, i) => put(g, cyl(0.03, 0.03, 0.02, 12), mat(c), 0.06 + i * 0.09, 0.99, 0.3 + (i % 2) * 0.03, { rx: -0.2 }))
    bake(g)
    const screen = document.createElement('canvas')
    screen.width = 56
    screen.height = 44
    const sg = screen.getContext('2d')
    const tex = new THREE.CanvasTexture(screen)
    tex.magFilter = THREE.NearestFilter
    tex.minFilter = THREE.NearestFilter
    tex.colorSpace = THREE.SRGBColorSpace
    const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.35), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }))
    screenMesh.position.set(0, 1.3, 0.213)
    screenMesh.rotation.x = -0.1
    g.add(screenMesh)
    const marquee = document.createElement('canvas')
    marquee.width = 256
    marquee.height = 56
    const mg = marquee.getContext('2d')
    mg.fillStyle = '#2a1f3d'
    mg.fillRect(0, 0, 256, 56)
    mg.font = '900 34px "Segoe UI", sans-serif'
    mg.textAlign = 'center'
    mg.textBaseline = 'middle'
    mg.shadowColor = '#ff9ad0'
    mg.shadowBlur = 10
    mg.fillStyle = '#ffd86b'
    mg.fillText('CLAUDE-MAN', 128, 30)
    const marqueeTex = new THREE.CanvasTexture(marquee)
    marqueeTex.colorSpace = THREE.SRGBColorSpace
    const marqueeMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.14), new THREE.MeshBasicMaterial({ map: marqueeTex, toneMapped: false }))
    marqueeMesh.position.set(0, 1.84, 0.186)
    g.add(marqueeMesh)
    let last = -1
    const anim = t => {
      const frame = Math.floor(t * 4)
      if (frame === last) return
      last = frame
      sg.fillStyle = '#10121f'
      sg.fillRect(0, 0, 56, 44)
      const shift = Math.round(Math.sin(frame * 0.35) * 6)
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 6; c++) {
          sg.fillStyle = ['#7fe3a0', '#f3cf4a', '#f08a8a'][r]
          const x = 8 + c * 7 + shift + (frame % 2 ? 1 : 0)
          sg.fillRect(x, 6 + r * 7, 5, 4)
          sg.fillRect(x + 1, 10 + r * 7, 1, 1)
          sg.fillRect(x + 3, 10 + r * 7, 1, 1)
        }
      const sx = 26 + Math.round(Math.sin(frame * 0.5) * 14)
      sg.fillStyle = '#9ad0ff'
      sg.fillRect(sx, 38, 5, 3)
      sg.fillRect(sx + 2, 36, 1, 2)
      sg.fillStyle = '#ffffff'
      sg.fillRect(sx + 2, 38 - ((frame * 5) % 28), 1, 3)
      tex.needsUpdate = true
    }
    anim(0)
    return { group: g, anim, size: [0.7, 2.0, 0.7], center: [x0 + 0.5, 1.0, -5.2], top: 2.0 }
  }

  /** A gold fire safety trophy on the right end of the shelf's ledge. */
  function buildTrophy() {
    const g = group(scene, SHELF_X + 1.05, 1.805, z0 + 0.16)
    const gold = mat(0xe3b53f, { metalness: 0.55, roughness: 0.32, emissive: 0x5a3a00, emissiveIntensity: 0.4, side: THREE.DoubleSide })
    put(g, rbox(0.2, 0.05, 0.16, 0.012), mat(P.ink), 0, 0.025, 0)
    put(g, rbox(0.1, 0.022, 0.006, 0.003), brass(), 0, 0.03, 0.082, { cast: false })
    put(g, cyl(0.07, 0.08, 0.025, 20), gold, 0, 0.0625, 0)
    put(g, cyl(0.016, 0.026, 0.1, 12), gold, 0, 0.125, 0)
    put(g, sph(0.03, 10, 8), gold, 0, 0.18, 0)
    const cup = new THREE.LatheGeometry([[0.03, 0], [0.07, 0.03], [0.1, 0.09], [0.105, 0.14], [0.095, 0.17], [0.085, 0.17], [0.09, 0.14], [0.06, 0.07], [0.02, 0.02]].map(([x, y]) => new THREE.Vector2(x, y)), 20)
    put(g, cup, gold, 0, 0.2, 0)
    for (const s of [-1, 1]) put(g, new THREE.TorusGeometry(0.045, 0.01, 6, 14, Math.PI), gold, s * 0.115, 0.3, 0, { rz: s > 0 ? -Math.PI / 2 : Math.PI / 2 })
    // a little flame on the cup
    put(g, new THREE.ConeGeometry(0.035, 0.1, 8), mat(0xff7a2a, { emissive: 0xff5a10, emissiveIntensity: 0.9 }), 0, 0.31, 0.101, { cast: false, s: [1, 1, 0.3] })
    put(g, new THREE.ConeGeometry(0.018, 0.055, 8), mat(0xffd34a, { emissive: 0xffc030, emissiveIntensity: 1 }), 0, 0.295, 0.108, { cast: false, s: [1, 1, 0.3] })
    bake(g)
    return { group: g, anim: null, size: [0.3, 0.45, 0.2], center: [SHELF_X + 1.05, 2.02, z0 + 0.16], top: 2.2 }
  }

  /** A pink neon sign over the door, with a faint flicker. */
  function buildNeon() {
    const g = group(scene, x0 + 0.07, 3.1, 0.2, Math.PI / 2)
    put(g, rbox(1.1, 0.46, 0.04, 0.02), mat(P.graphite), 0, 0, 0)
    const tube = new THREE.MeshBasicMaterial({ color: 0xff6fa8, toneMapped: false })
    for (const [w, h, x, y] of [[1.0, 0.016, 0, 0.2], [1.0, 0.016, 0, -0.2], [0.016, 0.4, -0.5, 0], [0.016, 0.4, 0.5, 0]]) put(g, rbox(w, h, 0.016, 0.004), tube, x, y, 0.03, { cast: false, receive: false })
    const text = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.28),
      new THREE.MeshBasicMaterial({ map: textTexture('SHIP IT', { width: 512, height: 160, font: '900 120px "Segoe UI", sans-serif', glow: 22 }), color: 0xff8fbc, transparent: true, toneMapped: false, depthWrite: false }),
    )
    text.position.z = 0.032
    text.renderOrder = 3
    g.add(text)
    const anim = t => {
      const dip = Math.sin(t * 23) > 0.96 && Math.sin(t * 1.3) > 0.5 ? 0.45 : 1
      text.material.opacity = (0.88 + 0.12 * Math.sin(t * 3)) * dip
    }
    return { group: g, anim, size: [0.15, 0.5, 1.1], center: [x0 + 0.1, 3.1, 0.2], top: 3.4 }
  }

  /** A big leafy plant in a terracotta pot, in the open corner on the right. */
  function buildPlant() {
    const px = 8.2
    const pz = 2.3
    const g = group(scene, px, 0, pz)
    put(g, cyl(0.36, 0.27, 0.55, 20), mat(P.terracotta, { roughness: 0.7 }), 0, 0.275, 0)
    put(g, cyl(0.39, 0.37, 0.06, 20), mat(P.terracottaDeep, { roughness: 0.7 }), 0, 0.58, 0)
    put(g, cyl(0.33, 0.33, 0.02, 20), mat(0x5a4636), 0, 0.57, 0)
    put(g, cyl(0.03, 0.045, 1.5, 8), mat(0x6b5a44), 0, 1.3, 0)
    const leafGeo = new THREE.SphereGeometry(1, 10, 8).scale(0.2, 0.04, 0.42).translate(0, 0, 0.42)
    const colours = [P.leaf, P.leafDeep, P.leafLight]
    for (let i = 0; i < 40; i++) {
      const f = i / 40
      const m = new THREE.Mesh(leafGeo, mat(colours[i % 3], { roughness: 0.6 }))
      m.position.set(Math.cos(i * 2.4) * 0.04, 0.8 + f * 1.2, Math.sin(i * 2.4) * 0.04)
      m.rotation.order = 'YXZ'
      m.rotation.y = i * 2.4
      m.rotation.x = -0.5 + f * 0.2 + (i % 4) * 0.22
      m.scale.setScalar(1.15 - f * 0.4)
      m.castShadow = true
      m.receiveShadow = true
      g.add(m)
    }
    bake(g)
    return { group: g, anim: null, size: [1.3, 2.2, 1.3], center: [px, 1.1, pz], top: 2.2 }
  }

  /** A paper plane, its nose along +z: two wings folded up from a keel. */
  function paperPlane(scale = 1) {
    const s = scale
    const nose = [0, 0, 0.17 * s]
    const tailMid = [0, 0.012 * s, -0.11 * s]
    const left = [-0.11 * s, 0.03 * s, -0.12 * s]
    const right = [0.11 * s, 0.03 * s, -0.12 * s]
    const keel = [0, -0.045 * s, -0.1 * s]
    const tris = [nose, left, tailMid, nose, tailMid, right, nose, tailMid, keel]
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3))
    geo.computeVertexNormals()
    return geo
  }

  /** Paper planes: a few folded planes gliding in slow, banked loops high over the desks. */
  function buildPlanes() {
    const g = group(scene, 0, 0, 0)
    const COLS = [0xfffdf8, 0xf6e7b8, 0xd8e6f0, 0xf6d5c4, 0xe3efd9]
    const planes = new THREE.InstancedMesh(paperPlane(2.2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, side: THREE.DoubleSide }), COLS.length)
    planes.frustumCulled = false
    planes.castShadow = true
    COLS.forEach((c, i) => planes.setColorAt(i, new THREE.Color(c)))
    g.add(planes)
    const PATHS = COLS.map((_, i) => ({ cx: -1.2 + (i % 3) * 2.3, cz: -0.6 + (i % 2) * 1.4, r: 2.3 + i * 0.45, y: 2.8 + (i % 3) * 0.2, w: (i % 2 ? -1 : 1) * (0.3 + i * 0.035), ph: i * 1.3 }))
    const m4 = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler(0, 0, 0, 'YXZ')
    const pos = new THREE.Vector3()
    const one = new THREE.Vector3(1, 1, 1)
    const anim = t => {
      PATHS.forEach((f, i) => {
        const a = f.ph + f.w * t
        const bob = Math.sin(t * 1.1 + i * 2) * 0.12
        pos.set(f.cx + f.r * Math.cos(a), f.y + bob, f.cz + f.r * Math.sin(a))
        // heading along the circle, banked into the turn, nose following the bob
        e.set(-Math.cos(t * 1.1 + i * 2) * 0.13, Math.atan2(-f.r * f.w * Math.sin(a), f.r * f.w * Math.cos(a)), Math.sign(f.w) * 0.38)
        m4.compose(pos, q.setFromEuler(e), one)
        planes.setMatrixAt(i, m4)
      })
      planes.instanceMatrix.needsUpdate = true
    }
    anim(0)
    return { group: g, anim, size: [1, 1, 1], center: [0.6, 3.0, 0.2], top: 3.2, ghostGeo: paperPlane(5) }
  }

  /** A little owl figurine at the left end of the shelf's ledge, for a commit made after midnight. It looks about. */
  function buildOwl() {
    const ox = SHELF_X - 1.55
    const g = group(scene, ox, 1.805, z0 + 0.15)
    const feathers = mat(0x8a6446, { roughness: 0.8 })
    put(g, rbox(0.16, 0.035, 0.12, 0.01), mat(P.oakDark), 0, 0.0175, 0)
    put(g, sph(0.06, 14, 10), feathers, 0, 0.095, 0, { s: [1, 1.15, 0.9] })
    put(g, sph(0.045, 12, 8), mat(0xe8d3b0, { roughness: 0.85 }), 0, 0.09, 0.03, { s: [1, 1.2, 0.6], cast: false })
    for (const s of [-1, 1]) put(g, sph(0.012, 6, 5), mat(0xd9a441), s * 0.02, 0.04, 0.035, { s: [1.3, 0.6, 1.3], cast: false })
    const head = group(g, 0, 0.17, 0)
    const keepPut = (geo, m, x, y, z, o) => {
      const mesh = put(head, geo, m, x, y, z, o)
      mesh.userData.keep = true // the head turns, so it stays out of the bake
      return mesh
    }
    keepPut(sph(0.052, 14, 10), feathers, 0, 0, 0, { s: [1.1, 0.95, 1] })
    for (const s of [-1, 1]) {
      keepPut(new THREE.ConeGeometry(0.014, 0.04, 6), feathers, s * 0.032, 0.05, 0, { rz: -s * 0.35 })
      keepPut(new THREE.CircleGeometry(0.019, 16), mat(0xfbf3df), s * 0.022, 0.004, 0.049, { cast: false })
      keepPut(new THREE.CircleGeometry(0.009, 12), mat(0x2b2018), s * 0.022, 0.004, 0.0505, { cast: false })
    }
    keepPut(new THREE.ConeGeometry(0.009, 0.022, 6), mat(0xe0a03a), 0, -0.016, 0.055, { rx: Math.PI / 2 + 0.4, cast: false })
    bake(g)
    // now and then the head turns to look at the room, then back
    const anim = t => {
      const k = (t % 9) / 9
      head.rotation.y = k > 0.75 ? Math.sin((k - 0.75) * 4 * Math.PI) * 0.9 : 0
    }
    return { group: g, anim, size: [0.18, 0.26, 0.14], center: [ox, 1.935, z0 + 0.15], top: 2.1 }
  }

  /** A felt pennant on the wall above the trophy shelf, for a 7-day streak, hanging from a little dowel. */
  function buildPennant() {
    const px = SHELF_X - 0.15
    const py = 3.38
    const g = group(scene, px, py, z0 + 0.03)
    const W = 1.15
    const H = 0.4
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 180
    const pg = c.getContext('2d')
    // the felt: a long triangle pointing right, with a darker band down its left edge
    pg.fillStyle = '#b5523a'
    pg.beginPath()
    pg.moveTo(0, 0)
    pg.lineTo(512, 90)
    pg.lineTo(0, 180)
    pg.closePath()
    pg.fill()
    pg.fillStyle = '#8f3d2b'
    pg.fillRect(0, 0, 46, 180)
    pg.fillStyle = '#f6ead2'
    pg.font = '900 50px "Segoe UI", sans-serif'
    pg.textBaseline = 'middle'
    pg.fillText('7-DAY', 70, 66, 300)
    pg.font = '800 34px "Segoe UI", sans-serif'
    pg.fillText('STREAK', 74, 114, 230)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    put(g, new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, roughness: 0.95 }), W / 2, 0, 0.012, { cast: false })
    put(g, cyl(0.014, 0.014, H + 0.12, 8), mat(P.oak), -0.01, 0, 0.02)
    for (const s of [-1, 1]) put(g, sph(0.022, 10, 8), brass(), -0.01, s * (H / 2 + 0.07), 0.02)
    // the cord it hangs from, up to a nail
    put(g, cyl(0.004, 0.004, 0.2, 4), mat(0x6b5a44), -0.01, H / 2 + 0.16, 0.012, { cast: false })
    bake(g)
    return { group: g, anim: null, size: [W + 0.1, H + 0.3, 0.06], center: [px + W / 2, py + 0.08, z0 + 0.04], top: py + 0.3 }
  }

  /** A gilded frame round the wall calendar, with a gold rosette, for a 30-day streak (the page turns gold too). */
  function buildGold() {
    const { x, y, w, h } = CALENDAR
    const g = group(scene, x, y, z0 + 0.03)
    const gold = mat(0xe3b53f, { metalness: 0.6, roughness: 0.3, emissive: 0x5a3a00, emissiveIntensity: 0.35 })
    const t = 0.04
    put(g, rbox(w + 2 * t, t, 0.03, 0.01), gold, 0, h / 2 + t / 2, 0)
    put(g, rbox(w + 2 * t, t, 0.03, 0.01), gold, 0, -h / 2 - t / 2, 0)
    for (const s of [-1, 1]) put(g, rbox(t, h, 0.03, 0.01), gold, s * (w / 2 + t / 2), 0, 0)
    // a rosette with two ribbon tails at the top right corner
    put(g, cyl(0.07, 0.07, 0.02, 18), gold, w / 2, h / 2, 0.03, { rx: Math.PI / 2 })
    put(g, cyl(0.045, 0.045, 0.022, 14), mat(0xc0392b), w / 2, h / 2, 0.032, { rx: Math.PI / 2 })
    for (const s of [-1, 1]) put(g, rbox(0.035, 0.12, 0.006, 0.003), mat(0xc0392b), w / 2 + s * 0.025, h / 2 - 0.1, 0.025, { rz: s * 0.25 })
    bake(g)
    return { group: g, anim: null, size: [w + 0.12, h + 0.12, 0.06], center: [x, y, z0 + 0.04], top: y + h / 2 + 0.1 }
  }

  const BUILDERS = { aquarium: buildAquarium, arcade: buildArcade, trophy: buildTrophy, neon: buildNeon, plant: buildPlant, planes: buildPlanes, owl: buildOwl, pennant: buildPennant, gold: buildGold }
  const props = {}
  for (const u of UNLOCKS) {
    const p = BUILDERS[u.key]()
    p.group.visible = false
    p.group.userData.clickable = u.key // the interact feature finds the aquarium and the arcade by this
    p.pop = 1 // 0 to 1 while it pops in
    p.unlocked = false
    // a faint outline of where it will stand
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(p.ghostGeo ?? new THREE.BoxGeometry(...p.size)), new THREE.LineBasicMaterial({ color: 0x8a6a50, transparent: true, opacity: 0.4, depthWrite: false }))
    edges.position.set(...p.center)
    edges.visible = false
    scene.add(edges)
    p.ghost = edges
    props[u.key] = p
  }

  // ---------------------------------------------------------------- toasts and the unlock check
  function toast(title, why) {
    const el = document.createElement('div')
    el.className = 'progress-toast'
    const b = document.createElement('b')
    b.textContent = 'Unlocked: ' + title
    const span = document.createElement('span')
    span.textContent = ' · ' + why
    el.append(b, span)
    toasts.appendChild(el)
    while (toasts.children.length > 3) toasts.firstChild.remove()
    setTimeout(() => el.classList.add('bye'), (TOAST_SECONDS - 0.5) * 1000)
    setTimeout(() => el.remove(), TOAST_SECONDS * 1000)
  }

  // an empty board until the first counts come (a demo page gets none)
  paintBoard({}, { ...UNLOCKS[0], n: 0, left: 1 })
  let counts = null // the counts last sent by the server (null before the first update)
  let best = null // the best streak the server sent
  const demoStreak = ctx.isDemo && params.has('streak') ? Math.max(0, Math.round(Number(params.get('streak')) || 0)) : null
  let shown = '' // what the plaques show now, to redraw only on a change
  let known = false // whether the starting unlocks are set (those get no confetti)
  let sinceCheck = 0

  function refresh() {
    let c = demoScale !== null ? demoCounts() : counts
    // the best streak of days in a row, from the server (or ?streak=N on a demo page)
    if (c && best !== null) c = { ...c, 'streak-best': best }
    if (demoStreak !== null) c = { ...c, 'streak-best': demoStreak }
    if (!c) return
    const key = JSON.stringify(c)
    if (key === shown) return
    shown = key
    let next = null
    for (const u of UNLOCKS) {
      const n = Number(c[u.stat]) || 0
      const p = props[u.key]
      const has = n >= u.at
      if (has && !p.unlocked) {
        p.unlocked = true
        p.group.visible = true
        if (known) {
          p.pop = 0
          p.group.scale.setScalar(0.001)
          try {
            fx.confetti(new THREE.Vector3(p.center[0], p.top, p.center[2]), 90)
          } catch {}
          toast(u.title, whyOf(u))
          window.dispatchEvent(new CustomEvent('studio:sound', { detail: { name: 'cheer' } }))
        }
      }
      if (!has) {
        const left = (u.at - n) / u.at
        if (!next || left < next.left) next = { ...u, n, left }
      }
    }
    known = true
    for (const u of UNLOCKS) props[u.key].ghost.visible = !props[u.key].unlocked && next?.key === u.key
    paintBoard(c, next)
  }

  return {
    apply(snapshot) {
      const stats = snapshot?.stats?.counts
      if (stats && typeof stats === 'object') counts = stats
      if (Number.isFinite(snapshot?.stats?.best)) best = snapshot.stats.best
      refresh()
    },
    step(dt, t) {
      sinceCheck += dt
      if (demoScale !== null && sinceCheck > 0.5) {
        sinceCheck = 0
        refresh()
      }
      for (const u of UNLOCKS) {
        const p = props[u.key]
        if (!p.unlocked) continue
        if (p.pop < 1) {
          p.pop = Math.min(1, p.pop + dt / 0.9)
          p.group.scale.setScalar(Math.max(0.001, ease(p.pop)))
        }
        p.anim?.(t, dt)
      }
    },
  }
}
