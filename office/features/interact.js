// The interact feature: things to click and do in the room (see ../features.js for the hooks).
//
//   the cat          click to pet it: it wakes, stretches, purrs (hearts), and sometimes trots to another cosy spot.
//                    It runs off when a desk catches fire. When Claude has worked alone at the big desk for about two
//                    minutes (no agents), it hops up and naps on her desk to keep her company (?catnap: after 8 s).
//   the coffee machine  click to brew; then the cursor carries a cup. Click a person to hand it over: they say thanks
//                    and a stressed person looks calm for a minute. Escape or a click on the floor drops the cup.
//   the plants       click to water; each plant grows new shoots (up to a cap) and slowly shrinks back over days.
//   the lamps        click to switch a pendant, the floor lamp or the side lamp off for a while.
//   a poke           clicking a person still opens their card, and they also wave and say a line.
//   the aquarium     (once unlocked) click to feed the fish. The arcade cabinet opens a 20 second bug-catching game.
//   the bug jar      after a fire a few glowing bugs scurry about the floor for a minute. Catch them: the jar on the
//                    trophy shelf counts them.
//
// Everything here is drawn by the page only. Nothing is sent to the server and no session is touched.
// Demo: ?interact shows a small hint bubble on each clickable thing (add &bugs to see the bugs without a fire).

import * as THREE from 'three'
import { TILE } from '../fx.js'

const STORE = 'studio-interact-v1'
const DAY = 86400000
/** Watering steps up to this, and a plant loses one step every 1.5 days without water. */
const GROW_CAP = 5
const SHRINK_MS = 1.5 * DAY
const BUG_LIFE = 60
const CALM_MS = 60000
const LAMP_OFF_S = 180

const rnd = (a, b) => a + Math.random() * (b - a)
const pick = list => list[Math.floor(Math.random() * list.length)]
const clamp = (x, a, b) => Math.max(a, Math.min(b, x))

const THANKS = ['Oh, lovely. Thank you!', 'Just what I needed, thanks.', 'A warm cup. You are a star.', 'Thank you, that really helps.', 'Mmm, thanks. I feel better already.']
const CALMED = ['Deep breath. Okay. I am fine now.', 'That helped. Thank you.', 'Better already. Thanks for noticing.']
const POKES = ['Oh! Hello.', 'Yes? I am listening.', 'Hi there!', 'You rang?', 'That tickles.', 'Hello! Busy, but hello.', 'Hey, you!']

const CSS = `
.ix-tip { position: fixed; z-index: 45; pointer-events: none; background: #fff8ec; color: #3f332c; border: 2px solid #d97757;
  border-radius: 10px; padding: 3px 9px; font: 700 12px "Segoe UI", sans-serif; box-shadow: 0 4px 12px rgba(63, 51, 44, 0.22);
  white-space: nowrap; display: none; }
.ix-cup { position: fixed; z-index: 46; pointer-events: none; font-size: 34px; line-height: 1; display: none;
  filter: drop-shadow(0 3px 3px rgba(0, 0, 0, 0.3)); }
.ix-hint { position: fixed; z-index: 30; pointer-events: none; transform: translate(-50%, -100%); background: #fff8ec; color: #3f332c;
  border: 2px solid #d97757; border-radius: 10px; padding: 2px 8px; font: 700 11px "Segoe UI", sans-serif; white-space: nowrap;
  box-shadow: 0 3px 8px rgba(63, 51, 44, 0.2); animation: ix-bob 1.6s ease-in-out infinite; }
@keyframes ix-bob { 50% { margin-top: -4px; } }
.ix-game { position: fixed; inset: 0; z-index: 60; background: rgba(30, 22, 18, 0.62); display: flex; align-items: center; justify-content: center; }
.ix-game .card { background: #2b2230; border: 4px solid #d97757; border-radius: 16px; padding: 12px 14px 10px; color: #ffe9c9;
  font: 700 14px "Segoe UI", sans-serif; text-align: center; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5); max-width: 96vw; }
.ix-game canvas { display: block; background: #1d1824; border-radius: 8px; margin: 8px auto; max-width: 100%; touch-action: none; cursor: none; }
.ix-game .sub { font-weight: 600; font-size: 12px; opacity: 0.8; }
`

/** Loads what is kept in the browser (best score, bugs caught, how the plants were watered). */
function load() {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) || '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

export function makeInteract(ctx) {
  const { scene, camera, world, people, fx, chaos, params, ROOM, sayText } = ctx
  const x0 = ROOM.x0
  const z0 = ROOM.z0
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.appendChild(style)

  const saved = load()
  saved.plants ||= {}
  const save = () => {
    try {
      localStorage.setItem(STORE, JSON.stringify(saved))
    } catch {}
  }

  // ---------------------------------------------------------------- the tooltip, the cup, the hints
  const tip = document.createElement('div')
  tip.className = 'ix-tip'
  document.body.appendChild(tip)
  const cupEl = document.createElement('div')
  cupEl.className = 'ix-cup'
  cupEl.textContent = '☕'
  document.body.appendChild(cupEl)
  let pointer = { x: -100, y: -100 }
  let cup = false
  const placeCup = () => {
    cupEl.style.left = pointer.x + 10 + 'px'
    cupEl.style.top = pointer.y + 8 + 'px'
  }
  window.addEventListener('pointermove', e => {
    pointer = { x: e.clientX, y: e.clientY }
    if (cup) placeCup()
  })
  const showTip = (text, x, y) => {
    if (!text) {
      tip.style.display = 'none'
      return
    }
    tip.textContent = text
    tip.style.display = 'block'
    tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 8, x + 16) + 'px'
    tip.style.top = y + (cup ? 44 : 20) + 'px'
  }
  const pickUpCup = () => {
    cup = true
    cupEl.style.display = 'block'
    placeCup()
  }
  const dropCup = () => {
    cup = false
    cupEl.style.display = 'none'
  }
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && cup) dropCup()
  })

  // ---------------------------------------------------------------- little hearts
  const heartTex = (() => {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')
    g.fillStyle = '#ff6f9c'
    g.strokeStyle = '#fff0f4'
    g.lineWidth = 4
    g.beginPath()
    g.moveTo(32, 56)
    g.bezierCurveTo(4, 36, 8, 10, 24, 10)
    g.bezierCurveTo(30, 10, 32, 16, 32, 18)
    g.bezierCurveTo(32, 16, 34, 10, 40, 10)
    g.bezierCurveTo(56, 10, 60, 36, 32, 56)
    g.closePath()
    g.fill()
    g.stroke()
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  })()
  const hearts = []
  function heart(at) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthTest: false, depthWrite: false }))
    s.position.copy(at)
    s.position.x += rnd(-0.12, 0.12)
    s.position.z += rnd(-0.12, 0.12)
    s.renderOrder = 20
    scene.add(s)
    hearts.push({ s, age: 0, life: rnd(1.2, 1.7), vx: rnd(-0.08, 0.08), wob: rnd(0, 6) })
  }
  function stepHearts(dt) {
    for (let i = hearts.length - 1; i >= 0; i--) {
      const h = hearts[i]
      h.age += dt
      const u = h.age / h.life
      if (u >= 1) {
        scene.remove(h.s)
        h.s.material.dispose()
        hearts.splice(i, 1)
        continue
      }
      h.s.position.y += dt * 0.42
      h.s.position.x += Math.sin(h.age * 4 + h.wob) * dt * 0.1 + h.vx * dt
      h.s.scale.setScalar(0.1 + Math.min(u * 4, 1) * 0.16)
      h.s.material.opacity = Math.min(1, (1 - u) * 2.5)
    }
  }

  // ---------------------------------------------------------------- the cat
  const cat = world.cat
  const seats = world.seats
  const lastSeat = seats[seats.length - 1]
  const SPOTS = [
    { name: 'sofa', pos: new THREE.Vector3(x0 + 0.62, 0.36, 3.75), ry: 0.4, up: new THREE.Vector3(x0 + 1.5, 0.02, 3.75) },
    { name: 'rug', pos: new THREE.Vector3(-2.75, 0.05, 5.55), ry: 2.0 },
    { name: 'sill', pos: new THREE.Vector3(7.6, 0.8, z0 + 0.1), ry: 0, up: new THREE.Vector3(7.6, 0.02, z0 + 1.1) },
    { name: 'desk', pos: new THREE.Vector3(lastSeat?.desk.x ?? 4.4, 0.03, lastSeat?.desk.z ?? 4.2), ry: 1.2 },
  ]
  // the big desk (seat 0, the first Claude's): on the desk top, at the end away from the other row, beside the laptop
  const bigSeat = seats[0]
  const CLAUDE_DESK = bigSeat ? SPOTS.length : -1
  if (bigSeat) {
    const away = Math.sign(bigSeat.z - (bigSeat.pod?.z ?? bigSeat.z)) || -1
    SPOTS.push({
      name: 'claude-desk',
      pos: new THREE.Vector3(bigSeat.desk.x, 0.62, bigSeat.z + away * 0.4),
      ry: Math.PI / 2,
      up: new THREE.Vector3(bigSeat.desk.x, 0.02, bigSeat.z + away * 0.95),
    })
  }
  const CAT_NAP_S = params.has('catnap') ? 8 : 120
  let aloneFor = 0
  const cs = { mode: 'sleep', t: 0, spot: 0, segs: [], seg: null, speed: 0.9, nextWander: 90 + Math.random() * 150, bob: 0, ryGoal: cat?.rotation.y ?? 0 }
  const fires = () => {
    try {
      return chaos.state().filter(f => !f.out)
    } catch {
      return []
    }
  }
  const catTmp = new THREE.Vector3()

  function planTrot(to, speed) {
    const from = SPOTS[cs.spot]
    const segs = []
    const here = cat.position.clone()
    // down from a high spot first, then across the floor, then up onto the new one
    if (from.up && cat.position.y > 0.2) segs.push({ to: from.up.clone(), hop: true })
    const target = SPOTS[to]
    if (target.up) {
      segs.push({ to: target.up.clone(), hop: false })
      segs.push({ to: target.pos.clone(), hop: true })
    } else segs.push({ to: target.pos.clone(), hop: false })
    cs.segs = segs
    cs.seg = null
    cs.speed = speed
    cs.dest = to
    cs.mode = 'trot'
    cs.from = here
  }
  function startSeg() {
    const s = cs.segs.shift()
    if (!s) return false
    const from = cat.position.clone()
    const len = Math.hypot(s.to.x - from.x, s.to.z - from.z)
    cs.seg = { from, to: s.to, hop: s.hop, t: 0, dur: s.hop ? 0.7 : Math.max(0.25, len / cs.speed) }
    if (len > 0.05) cs.ryGoal = Math.atan2(-(s.to.z - from.z), s.to.x - from.x)
    return true
  }
  function otherSpot() {
    const choices = SPOTS.map((_, i) => i).filter(i => i !== cs.spot)
    return pick(choices)
  }
  function fleeSpot(fire) {
    const e = people.get(fire.id)
    const at = e?.seat?.desk
    if (!at) return otherSpot()
    let best = -1
    let far = -1
    SPOTS.forEach((s, i) => {
      const d = Math.hypot(s.pos.x - at.x, s.pos.z - at.z)
      if (i !== cs.spot && d > far) [best, far] = [i, d]
    })
    return best < 0 ? otherSpot() : best
  }
  function petCat() {
    if (!cat) return
    if (fires().length) return
    if (cs.mode === 'sleep' || cs.mode === 'settle') {
      cs.mode = 'wake'
      cs.t = 0
    } else if (cs.mode === 'purr' || cs.mode === 'stretch' || cs.mode === 'wake') {
      cs.petted = true
      for (let i = 0; i < 3; i++) heart(catTmp.copy(cat.position).setY(cat.position.y + 0.35))
      if (cs.mode === 'purr') cs.t = Math.min(cs.t, 0.8)
    } else if (cs.mode === 'trot' && !cs.seg?.hop && !cs.fleeing) {
      cs.segs = []
      cs.seg = null
      cs.spot = nearestSpot()
      cs.mode = 'purr'
      cs.t = 0
    }
    cs.nextWander = 120 + Math.random() * 180
  }
  function nearestSpot() {
    let best = cs.spot
    let d0 = 1e9
    SPOTS.forEach((s, i) => {
      const d = s.pos.distanceTo(cat.position)
      if (d < d0) [best, d0] = [i, d]
    })
    return best
  }
  const angleStep = (a, goal, k) => {
    let d = goal - a
    d = Math.atan2(Math.sin(d), Math.cos(d))
    return a + d * k
  }
  /** Claude alone at the big desk for a while (no agents working): the cat comes over and naps on her desk. */
  function catCompany(dt) {
    if (CLAUDE_DESK < 0) return
    let lead = null
    let working = false
    for (const e of people.values()) {
      if (e.isLead && e.seat === bigSeat) lead = e
      else if (!e.isLead && !e.friend && e.state !== 'leaving') working = true
    }
    const atDesk = !!lead && lead.state === 'working' && lead.p.seated && !lead.away
    aloneFor = atDesk && !working ? aloneFor + dt : 0
    if (aloneFor > CAT_NAP_S && cs.mode === 'sleep' && cs.spot !== CLAUDE_DESK && !cs.fleeing && !fires().length) {
      cs.nextWander = 150 + Math.random() * 150
      planTrot(CLAUDE_DESK, 0.9)
    }
  }

  function stepCat(dt) {
    if (!cat) return
    catCompany(dt)
    const onFire = fires()
    if (onFire.length && !cs.fleeing && cs.mode !== 'flee-wait') {
      const target = fleeSpot(onFire[0])
      if (SPOTS[target].pos.distanceTo(cat.position) > 1) {
        cs.fleeing = true
        cs.mode = 'trot'
        planTrot(target, 3)
      }
    }
    if (!onFire.length) cs.fleeing = false
    cs.t += dt
    const base = cs.mode
    let sx = 1
    let sy = 1
    let sz = 1
    if (base === 'sleep') {
      cs.nextWander -= dt
      if (cs.nextWander <= 0 && !onFire.length) {
        cs.nextWander = 150 + Math.random() * 200
        cs.mode = 'stretch'
        cs.t = 0
        cs.wander = true
      }
    } else if (base === 'wake') {
      const u = clamp(cs.t / 0.6, 0, 1)
      sy = 1 + 0.35 * Math.sin(u * Math.PI)
      sx = 1 - 0.08 * Math.sin(u * Math.PI)
      if (u >= 1) {
        cs.mode = 'stretch'
        cs.t = 0
      }
    } else if (base === 'stretch') {
      const u = clamp(cs.t / 1.6, 0, 1)
      const bell = Math.sin(u * Math.PI)
      sx = 1 + 0.38 * bell
      sy = 1 - 0.24 * bell
      cat.rotation.z = -0.1 * bell
      if (u >= 1) {
        cat.rotation.z = 0
        if (cs.wander) {
          cs.wander = false
          planTrot(otherSpot(), 0.9)
        } else {
          cs.mode = 'purr'
          cs.t = 0
          cs.hearted = 0
        }
      }
    } else if (base === 'purr') {
      sy = 1 + 0.025 * Math.sin(cs.t * 38)
      cs.hearted = (cs.hearted ?? 0) - dt
      if (cs.hearted <= 0) {
        cs.hearted = 0.4
        heart(catTmp.copy(cat.position).setY(cat.position.y + 0.3))
      }
      if (cs.t > 2.8) {
        if (Math.random() < 0.5) planTrot(otherSpot(), 0.9)
        else {
          cs.mode = 'settle'
          cs.t = 0
          cs.ryGoal = SPOTS[cs.spot].ry
        }
      }
    } else if (base === 'settle') {
      const u = clamp(cs.t / 0.8, 0, 1)
      sy = 1 + 0.18 * (1 - u)
      if (u >= 1) cs.mode = 'sleep'
    } else if (base === 'trot') {
      if (!cs.seg && !startSeg()) {
        cs.spot = cs.dest
        cs.mode = cs.fleeing ? 'sleep' : 'settle'
        cs.t = 0
        cs.ryGoal = SPOTS[cs.spot].ry
        cs.nextWander = 150 + Math.random() * 150
        if (cs.fleeing) cat.position.copy(SPOTS[cs.spot].pos)
      } else if (cs.seg) {
        const s = cs.seg
        s.t += dt
        const u = clamp(s.t / s.dur, 0, 1)
        cat.position.lerpVectors(s.from, s.to, u)
        if (s.hop) cat.position.y += 4 * u * (1 - u) * 0.38
        else {
          cs.bob += dt * (cs.speed > 2 ? 22 : 12)
          cat.position.y += Math.abs(Math.sin(cs.bob)) * 0.035
          sx = 1 + Math.sin(cs.bob * 2) * 0.05
        }
        if (u >= 1) {
          cat.position.copy(s.to)
          cs.seg = null
        }
      }
    }
    cat.rotation.y = angleStep(cat.rotation.y, cs.ryGoal, 1 - Math.exp(-dt * 9))
    cat.scale.set(sx, sy, sz)
  }

  // ---------------------------------------------------------------- the coffee machine
  const COFFEE_BOX = new THREE.Box3(new THREE.Vector3(-7.2, 0.78, z0 + 0.0), new THREE.Vector3(-6.5, 1.32, z0 + 0.5))
  const spout = new THREE.Vector3(-6.85, 1.1, z0 + 0.38)
  let brew = 0 // seconds of brewing left
  function brewCoffee() {
    if (brew > 0 || cup) return
    brew = 4
  }
  function stepCoffee(dt) {
    if (brew <= 0) return
    brew -= dt
    if (Math.random() < dt * 14) fx.emit(TILE.steam, catTmp.copy(spout).add(new THREE.Vector3(rnd(-0.15, 0.15), 0.1, rnd(-0.05, 0.1))), { vel: [0, 0.35, 0], life: 1.2, size: 0.1, grow: 0.28, alpha: 0.6, fade: 'out' })
    if (brew <= 0) {
      brew = 0
      pickUpCup()
    }
  }

  // ---------------------------------------------------------------- calm people
  const calm = new Map() // person id -> until (ms)
  function giveCup(entry) {
    dropCup()
    const stressed = entry.p.mood === 'stressed' || entry.p.mood === 'panic'
    calm.set(entry.id, Date.now() + CALM_MS)
    sayText(entry, stressed ? pick(CALMED) : pick(THANKS))
    entry.p.cheer = Math.max(entry.p.cheer, 1.2)
    entry.p.sip = Math.max(entry.p.sip, 4)
    const head = new THREE.Vector3()
    entry.p.headPos(head)
    for (let i = 0; i < 3; i++) heart(head.clone().setY(head.y + 0.25))
  }
  function stepCalm() {
    const now = Date.now()
    for (const [id, until] of calm) {
      const e = people.get(id)
      if (!e || now > until) {
        calm.delete(id)
        continue
      }
      if (e.p.mood === 'stressed' || e.p.mood === 'panic') e.p.mood = 'calm'
    }
  }

  // ---------------------------------------------------------------- the poke
  const pokeAt = new Map()
  function poke(entry) {
    const p = entry.p
    const now = Date.now()
    if (now - (pokeAt.get(entry.id) ?? 0) < 4000) return
    pokeAt.set(entry.id, now)
    if (entry.state === 'working' || entry.state === 'waiting' || entry.state === 'returning' || entry.state === 'off') {
      if (!p.action) {
        const seated = p.seated
        const prev = seated ? p.activity : null
        if (seated) p.activity = 'wave'
        else p.action = 'wave'
        setTimeout(() => {
          if (seated && p.activity === 'wave') p.activity = prev ?? 'idle'
          else if (!seated && p.action === 'wave') p.action = null
        }, 1500)
      }
    }
    sayText(entry, pick(POKES))
  }

  // ---------------------------------------------------------------- the plants
  const leafGeo = new THREE.SphereGeometry(1, 8, 6).scale(0.05, 0.25, 0.014).translate(0, 0.25, 0)
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x93d36a, roughness: 0.6 })
  const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x6fb85a, roughness: 0.6 })
  const PLANTS = [
    { id: 'fig-a', x: x0 + 0.55, z: z0 + 0.6, y: 0.55, r: 0.15, h: 2.4, big: 1 },
    { id: 'monstera-a', x: ROOM.x1 - 0.55, z: z0 + 0.6, y: 0.5, r: 0.18, h: 2.4, big: 1 },
    { id: 'fig-b', x: -0.15, z: z0 + 0.55, y: 0.55, r: 0.15, h: 1.9, big: 1 },
    { id: 'monstera-b', x: -1.5, z: 6.4, y: 0.5, r: 0.18, h: 1.6, big: 1 },
    { id: 'door-pot', x: x0 + 0.4, z: 1.55, y: 0.42, r: 0.12, h: 1.3, big: 0.8 },
    { id: 'sill-1', x: 1.3, z: z0 + 0.08, y: 0.9, r: 0.05, h: 0.45, big: 0.3 },
    { id: 'sill-2', x: 5.4, z: z0 + 0.08, y: 0.9, r: 0.05, h: 0.45, big: 0.3 },
    { id: 'sill-3', x: 4.3, z: z0 + 0.08, y: 0.92, r: 0.04, h: 0.45, big: 0.3 },
  ]
  const grown = p => {
    const s = saved.plants[p.id]
    if (!s) return 0
    return clamp(s.lvl - (Date.now() - s.t) / SHRINK_MS, 0, GROW_CAP)
  }
  for (const p of PLANTS) {
    p.box = new THREE.Box3(new THREE.Vector3(p.x - p.r - 0.18, p.y - 0.5 > 0 ? p.y - 0.5 : 0, p.z - p.r - 0.18), new THREE.Vector3(p.x + p.r + 0.18, p.y + p.h, p.z + p.r + 0.18))
    p.shoots = new THREE.Group()
    p.shoots.position.set(p.x, p.y, p.z)
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rnd(0, 0.5)
      const pivot = new THREE.Group()
      pivot.rotation.set(0, a, 0)
      pivot.position.set(Math.cos(a) * p.r * 0.5, 0, -Math.sin(a) * p.r * 0.5)
      const tilt = new THREE.Group()
      tilt.rotation.z = 0.35 + rnd(0, 0.5)
      const leaf = new THREE.Mesh(leafGeo, i % 2 ? leafMat : leafMat2)
      leaf.scale.setScalar(rnd(0.75, 1.05))
      leaf.castShadow = true
      tilt.add(leaf)
      pivot.add(tilt)
      p.shoots.add(pivot)
    }
    p.size = grown(p)
    p.shoots.visible = false
    scene.add(p.shoots)
  }
  const plantScale = (p, lvl) => (lvl <= 0.02 ? 0 : (0.2 + 0.2 * lvl) * p.big)
  const drops = [] // { at: Vector3, left: seconds }
  function water(p) {
    const lvl = Math.min(GROW_CAP, grown(p) + 1)
    saved.plants[p.id] = { lvl, t: Date.now() }
    save()
    drops.push({ at: new THREE.Vector3(p.x, p.y + Math.min(p.h * 0.4, 0.9) + 0.35, p.z), left: 1.0, spread: Math.max(p.r, 0.06) })
  }
  function stepPlants(dt) {
    for (const d of drops) {
      d.left -= dt
      for (let n = Math.floor(dt * 40 + Math.random()); n > 0; n--)
        fx.emit(TILE.water, catTmp.set(d.at.x + rnd(-d.spread, d.spread), d.at.y, d.at.z + rnd(-d.spread, d.spread)), { vel: [0, -0.4, 0], gravity: 5, life: 0.55, size: 0.045, alpha: 0.8 })
    }
    for (let i = drops.length - 1; i >= 0; i--) if (drops[i].left <= 0) drops.splice(i, 1)
    for (const p of PLANTS) {
      const want = plantScale(p, grown(p))
      p.size += (want - p.size) * (1 - Math.exp(-dt * 2))
      p.shoots.visible = p.size > 0.03
      p.shoots.scale.setScalar(Math.max(0.001, p.size))
    }
  }

  // ---------------------------------------------------------------- the lamps
  const LAMPS = [
    { name: 'pendant', pos: [-4.9, 2.75, 4.7], r: 0.42, squash: 0.92 },
    { name: 'pendant', pos: [-6.0, 2.6, -5.9], r: 0.3, squash: 0.92 },
    { name: 'pendant', pos: [-5.9, 2.45, -3.9], r: 0.26, squash: 0.92 },
    { name: 'pendant', pos: [1.8, 2.7, -3.8], r: 0.38, squash: 0.92 },
    { name: 'pendant', pos: [6.0, 2.7, -3.8], r: 0.38, squash: 0.92 },
    { name: 'pendant', pos: [4.4, 2.7, 4.2], r: 0.38, squash: 0.92 },
    { name: 'floor lamp', pos: [x0 + 0.5 + 1.25 * Math.cos(0.45), 1.82, 6.45 - 1.25 * Math.sin(0.45)], r: 0.11, squash: 1 },
    { name: 'side lamp', pos: [x0 + 0.5, 0.88, 2.55], r: 0.17, squash: 0.8 },
  ]
  const coverMat = new THREE.MeshBasicMaterial({ color: 0x5f564c, transparent: true, opacity: 0, depthWrite: false })
  // a value that a lamp's glow or light can be scaled by, however often the day/night code writes to it
  const scaled = (obj, key, lamp) => {
    let v = obj[key]
    Object.defineProperty(obj, key, {
      get: () => v * lamp.k,
      set: x => (v = x),
      configurable: true,
    })
  }
  const lampPos = new THREE.Vector3()
  for (const l of LAMPS) {
    l.k = 1
    l.on = true
    l.offLeft = 0
    l.at = new THREE.Vector3(...l.pos)
    l.cover = new THREE.Mesh(new THREE.SphereGeometry(l.r * 1.04, 20, 14), coverMat.clone())
    l.cover.position.copy(l.at)
    l.cover.scale.y = l.squash
    l.cover.renderOrder = 3
    l.cover.visible = false
    scene.add(l.cover)
    let bestD = 0.7
    for (const s of world.lampGlows ?? []) {
      s.getWorldPosition(lampPos)
      const d = lampPos.distanceTo(l.at)
      if (d < bestD) [l.glow, bestD] = [s, d]
    }
    if (l.glow && !l.glow.material.__ix) {
      scaled(l.glow.material, 'opacity', l)
      l.glow.material.__ix = true
    }
    let bestL = 1.0
    for (const light of world.lights ?? []) {
      light.getWorldPosition(lampPos)
      const d = lampPos.distanceTo(l.at)
      if (d < bestL && !light.__ix) [l.light, bestL] = [light, d]
    }
    if (l.light) {
      scaled(l.light, 'intensity', l)
      l.light.__ix = true
    }
  }
  function stepLamps(dt) {
    for (const l of LAMPS) {
      if (!l.on) {
        l.offLeft -= dt
        if (l.offLeft <= 0) l.on = true
      }
      l.k += ((l.on ? 1 : 0) - l.k) * (1 - Math.exp(-dt * 6))
      if (Math.abs(l.k - (l.on ? 1 : 0)) < 0.004) l.k = l.on ? 1 : 0
      l.cover.visible = l.k < 0.99
      l.cover.material.opacity = (1 - l.k) * 0.45
    }
  }

  // ---------------------------------------------------------------- the aquarium
  const group = key => scene.children.find(o => o.userData.clickable === key && o.visible)
  let feed = 0 // seconds the fish are rushing
  const flakeAt = new THREE.Vector3()
  let fishMesh = null
  const m4 = new THREE.Matrix4()
  const fp = new THREE.Vector3()
  const fq = new THREE.Quaternion()
  const fs = new THREE.Vector3()
  function feedFish() {
    const g = group('aquarium')
    if (!g) return
    feed = 6
    flakeAt.set(rnd(-0.3, 0.3), 1.3, rnd(-0.08, 0.08))
    for (let i = 0; i < 16; i++) {
      const w = g.localToWorld(new THREE.Vector3(flakeAt.x + rnd(-0.12, 0.12), 1.33 + rnd(0, 0.06), flakeAt.z + rnd(-0.06, 0.06)))
      fx.emit(TILE.confetti, w, { vel: [rnd(-0.03, 0.03), -0.05, 0], gravity: 0.05, drag: 1.2, life: rnd(2.2, 3.2), size: 0.028, color: pick([0xe8b04a, 0xd9803c, 0xf0d070, 0xc86a4a]), alpha: 0.9 })
    }
  }
  function stepFish(dt) {
    if (feed <= 0) return
    feed -= dt
    const g = group('aquarium')
    if (!g) return
    fishMesh ||= (() => {
      let f = null
      g.traverse(o => {
        if (o.isInstancedMesh && o.count === 6) f = o
      })
      return f
    })()
    if (!fishMesh) return
    const w = clamp(Math.min((6 - feed) / 0.5, feed / 1.5, 1), 0, 1)
    for (let i = 0; i < fishMesh.count; i++) {
      fishMesh.getMatrixAt(i, m4)
      m4.decompose(fp, fq, fs)
      fp.x += (flakeAt.x + (i - 2.5) * 0.07 - fp.x) * w * 0.85
      fp.y += (1.22 + (i % 2) * 0.05 - fp.y) * w * 0.85
      fp.z += (flakeAt.z - fp.z) * w * 0.5
      fp.y += Math.sin(performance.now() * 0.02 + i) * 0.006 * w
      m4.compose(fp, fq, fs)
      fishMesh.setMatrixAt(i, m4)
    }
    fishMesh.instanceMatrix.needsUpdate = true
  }

  // ---------------------------------------------------------------- the arcade game
  let game = null
  function playArcade() {
    if (game) return
    const W = 420
    const H = 380
    const overlay = document.createElement('div')
    overlay.className = 'ix-game'
    const card = document.createElement('div')
    card.className = 'card'
    const title = document.createElement('div')
    title.textContent = 'BUG CATCHER'
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const sub = document.createElement('div')
    sub.className = 'sub'
    card.append(title, canvas, sub)
    overlay.appendChild(card)
    document.body.appendChild(overlay)
    const g = canvas.getContext('2d')
    const s = { x: W / 2, score: 0, left: 20, bugs: [], spawn: 0, over: false, keys: {}, last: performance.now(), raf: 0, started: false }
    game = s
    const best = () => Number(saved.best) || 0
    const finish = () => {
      s.over = true
      const newBest = s.score > best()
      if (newBest) {
        saved.best = s.score
        save()
      }
      s.msg = newBest ? `Time! ${s.score} caught. New best!` : `Time! ${s.score} caught. Best: ${best()}`
    }
    const close = () => {
      cancelAnimationFrame(s.raf)
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      overlay.remove()
      game = null
    }
    const down = e => {
      if (e.key === 'Escape') return close()
      if (e.key === 'Enter' && s.over) {
        close()
        return playArcade()
      }
      if (e.key.startsWith('Arrow')) {
        s.keys[e.key] = true
        e.preventDefault()
      }
    }
    const up = e => {
      s.keys[e.key] = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    canvas.addEventListener('pointermove', e => {
      const r = canvas.getBoundingClientRect()
      s.x = clamp(((e.clientX - r.left) / r.width) * W, 30, W - 30)
    })
    overlay.addEventListener('pointerdown', e => {
      if (s.over && !card.contains(e.target)) close()
    })
    canvas.addEventListener('pointerdown', () => {
      if (s.over) close()
    })
    const frame = now => {
      const dt = Math.min(0.05, (now - s.last) / 1000)
      s.last = now
      if (!s.over) {
        s.left -= dt
        if (s.left <= 0) finish()
        if (s.keys.ArrowLeft) s.x -= 360 * dt
        if (s.keys.ArrowRight) s.x += 360 * dt
        s.x = clamp(s.x, 30, W - 30)
        s.spawn -= dt
        if (s.spawn <= 0) {
          s.spawn = rnd(0.25, 0.6) * (s.left < 8 ? 0.7 : 1)
          s.bugs.push({ x: rnd(20, W - 20), y: -10, v: rnd(110, 210) + (20 - s.left) * 5, gold: Math.random() < 0.12, a: rnd(0, 6) })
        }
        for (const b of s.bugs) {
          b.y += b.v * dt
          b.x += Math.sin(now * 0.004 + b.a) * 20 * dt
          if (b.y > H - 52 && b.y < H - 20 && Math.abs(b.x - s.x) < 40 && !b.got) {
            b.got = true
            s.score += b.gold ? 3 : 1
          }
        }
        s.bugs = s.bugs.filter(b => !b.got && b.y < H + 20)
      }
      g.fillStyle = '#1d1824'
      g.fillRect(0, 0, W, H)
      g.fillStyle = '#2f2638'
      g.fillRect(0, H - 14, W, 14)
      g.font = '24px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      for (const b of s.bugs) g.fillText(b.gold ? '✨' : '🐞', b.x, b.y)
      g.font = '34px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'
      g.fillText('🫙', s.x, H - 34)
      g.font = '700 16px "Segoe UI", sans-serif'
      g.fillStyle = '#ffe9c9'
      g.textAlign = 'left'
      g.fillText('Caught: ' + s.score, 10, 18)
      g.textAlign = 'right'
      g.fillText(s.over ? 'Time!' : Math.ceil(s.left) + ' s', W - 10, 18)
      if (s.over) {
        g.textAlign = 'center'
        g.font = '800 22px "Segoe UI", sans-serif'
        g.fillText(s.msg, W / 2, H / 2 - 8)
        g.font = '600 14px "Segoe UI", sans-serif'
        g.fillText('Enter to play again, Esc to close', W / 2, H / 2 + 22)
      }
      sub.textContent = s.over ? '' : `Move the mouse or use the arrow keys. Best: ${best()}`
      s.raf = requestAnimationFrame(frame)
    }
    s.raf = requestAnimationFrame(frame)
  }

  // ---------------------------------------------------------------- the bugs and the jar
  const bugs = []
  const bugGlow = (() => {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30)
    grad.addColorStop(0, 'rgba(220,255,120,1)')
    grad.addColorStop(0.35, 'rgba(160,255,80,0.5)')
    grad.addColorStop(1, 'rgba(160,255,80,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 64, 64)
    return new THREE.CanvasTexture(c)
  })()
  const bugBody = new THREE.SphereGeometry(0.045, 8, 6).scale(1.3, 0.8, 1)
  const bugBodyMat = new THREE.MeshStandardMaterial({ color: 0x2f4a22, emissive: 0xb6ff5a, emissiveIntensity: 0.9 })
  function spawnBugs(n = Math.floor(rnd(3, 7))) {
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group()
      g.add(new THREE.Mesh(bugBody, bugBodyMat))
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: bugGlow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
      s.scale.setScalar(0.32)
      g.add(s)
      g.position.set(rnd(-6, 6), 0.06, rnd(-4, 5))
      scene.add(g)
      bugs.push({ g, s, to: g.position.clone(), age: 0, pause: 0, life: BUG_LIFE + rnd(-5, 5), ph: rnd(0, 6) })
    }
  }
  function stepBugs(dt) {
    for (let i = bugs.length - 1; i >= 0; i--) {
      const b = bugs[i]
      b.age += dt
      const p = b.g.position
      if (b.age > b.life || b.caught) {
        b.fade = (b.fade ?? 1) - dt * 3
        b.s.material.opacity = Math.max(0, b.fade)
        b.g.scale.setScalar(Math.max(0.01, b.fade))
        if (b.fade <= 0) {
          scene.remove(b.g)
          b.s.material.dispose()
          bugs.splice(i, 1)
        }
        continue
      }
      if (b.pause > 0) b.pause -= dt
      else {
        const dx = b.to.x - p.x
        const dz = b.to.z - p.z
        const d = Math.hypot(dx, dz)
        if (d < 0.1) {
          b.pause = rnd(0.2, 1.4)
          b.to.set(clamp(p.x + rnd(-2.5, 2.5), ROOM.x0 + 1, ROOM.x1 - 1), 0.06, clamp(p.z + rnd(-2.5, 2.5), z0 + 1.2, ROOM.z1 - 1))
        } else {
          const v = 1.1 * dt
          p.x += (dx / d) * v
          p.z += (dz / d) * v
          b.g.rotation.y = Math.atan2(-dz, dx)
        }
      }
      b.g.position.y = 0.06 + Math.abs(Math.sin(b.age * 18 + b.ph)) * 0.012
      b.s.material.opacity = 0.65 + Math.sin(b.age * 5 + b.ph) * 0.3
    }
  }
  // the jar on the trophy shelf's ledge
  const JAR = new THREE.Vector3(-2.3 - 1.0, 1.805, z0 + 0.14)
  const jar = new THREE.Group()
  jar.position.copy(JAR)
  scene.add(jar)
  jar.add(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.2, 18), new THREE.MeshStandardMaterial({ color: 0xdff0f0, transparent: true, opacity: 0.28, roughness: 0.05, depthWrite: false })))
  jar.children[0].position.y = 0.1
  jar.children[0].renderOrder = 2
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.025, 14), new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.6, roughness: 0.4 }))
  lid.position.y = 0.212
  jar.add(lid)
  const jarBugs = []
  for (let i = 0; i < 24; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 5), new THREE.MeshBasicMaterial({ color: 0xc8ff5a }))
    const layer = Math.floor(i / 6)
    m.position.set(Math.cos(i * 2.4) * 0.04, 0.03 + layer * 0.035, Math.sin(i * 2.4) * 0.04)
    m.visible = false
    jar.add(m)
    jarBugs.push(m)
  }
  const jarGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: bugGlow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }))
  jarGlow.scale.setScalar(0.4)
  jarGlow.position.y = 0.1
  jar.add(jarGlow)
  const refreshJar = () => {
    const n = Number(saved.bugs) || 0
    jarBugs.forEach((m, i) => (m.visible = i < Math.min(24, n)))
    jarGlow.userData.n = n
  }
  refreshJar()
  const jarBox = new THREE.Box3(new THREE.Vector3(JAR.x - 0.12, JAR.y - 0.02, JAR.z - 0.12), new THREE.Vector3(JAR.x + 0.12, JAR.y + 0.3, JAR.z + 0.12))
  function catchBug(b) {
    if (b.caught) return
    b.caught = true
    saved.bugs = (Number(saved.bugs) || 0) + 1
    save()
    refreshJar()
    for (let i = 0; i < 6; i++) fx.emit(TILE.star, b.g.position.clone().setY(0.2), { vel: [rnd(-0.5, 0.5), rnd(0.3, 0.9), rnd(-0.5, 0.5)], gravity: 1.5, life: 0.7, size: 0.07, color: 0xc8ff5a, additive: true })
    jarGlow.userData.pulse = 1
  }

  // ---------------------------------------------------------------- finding what is under the pointer
  const tmp = new THREE.Vector3()
  const boxDist = (hit, box) => (hit.ray.ray.intersectBox(box, tmp) ? tmp.distanceTo(hit.ray.ray.origin) : null)
  const sphereDist = (hit, c, r) => {
    const s = new THREE.Sphere(c, r)
    return hit.ray.ray.intersectSphere(s, tmp) ? tmp.distanceTo(hit.ray.ray.origin) : null
  }
  const groupDist = (hit, key) => {
    const g = group(key)
    if (!g) return null
    const h = hit.ray.intersectObject(g, true)[0]
    return h ? h.distance : null
  }
  const catBox = new THREE.Box3()
  const unlocked = key => !!group(key)

  /** Everything clickable: how to hit it, what a click says, what it does, and where its hint bubble sits. */
  const TARGETS = [
    {
      id: 'cat',
      hit: hit => {
        if (!cat) return null
        const p = cat.position
        catBox.min.set(p.x - 0.32, p.y - 0.02, p.z - 0.32)
        catBox.max.set(p.x + 0.32, p.y + 0.36, p.z + 0.32)
        return boxDist(hit, catBox)
      },
      label: () => (cs.fleeing ? null : 'Pet the cat'),
      click: petCat,
      anchor: out => out.copy(cat.position).setY(cat.position.y + 0.5),
    },
    {
      id: 'coffee',
      hit: hit => boxDist(hit, COFFEE_BOX),
      label: () => (cup ? 'You already have a cup' : brew > 0 ? 'Brewing...' : 'Brew a coffee'),
      click: brewCoffee,
      anchor: out => out.set(-6.85, 1.45, z0 + 0.4),
    },
    ...PLANTS.map(p => ({
      id: 'plant-' + p.id,
      hit: hit => boxDist(hit, p.box),
      label: () => (grown(p) >= GROW_CAP - 0.01 ? 'Water the plant (fully grown)' : 'Water the plant'),
      click: () => water(p),
      anchor: out => out.set(p.x, p.y + Math.min(p.h, 1.2) + 0.2, p.z),
      hint: p.big > 0.5,
    })),
    ...LAMPS.map((l, i) => ({
      id: 'lamp-' + i,
      hit: hit => sphereDist(hit, l.at, l.r + 0.12),
      label: () => (l.on ? 'Switch the lamp off' : 'Switch the lamp on'),
      click: () => {
        l.on = !l.on
        l.offLeft = l.on ? 0 : LAMP_OFF_S
      },
      anchor: out => out.copy(l.at).setY(l.at.y + l.r + 0.15),
      hint: i === 0,
    })),
    {
      id: 'aquarium',
      hit: hit => groupDist(hit, 'aquarium'),
      label: () => (feed > 0 ? 'The fish are eating' : 'Feed the fish'),
      click: () => feed <= 0 && feedFish(),
      anchor: out => out.set(-2.3, 1.55, z0 + 0.42),
      avail: () => unlocked('aquarium'),
    },
    {
      id: 'arcade',
      hit: hit => groupDist(hit, 'arcade'),
      label: () => 'Play Bug Catcher (20 s)',
      click: playArcade,
      anchor: out => out.set(x0 + 0.5, 2.2, -5.2),
      avail: () => unlocked('arcade'),
    },
    {
      id: 'jar',
      hit: hit => boxDist(hit, jarBox),
      label: () => `Bug jar: ${Number(saved.bugs) || 0} caught`,
      click: () => {},
      anchor: out => out.set(JAR.x, JAR.y + 0.4, JAR.z),
    },
  ]
  const bugTarget = {
    id: 'bug',
    label: () => 'Catch the bug',
  }

  function targetAt(hit) {
    let best = null
    let bestD = Infinity
    for (const t of TARGETS) {
      if (t.avail && !t.avail()) continue
      if (t.label() === null) continue
      const d = t.hit(hit)
      if (d !== null && d < bestD) [best, bestD] = [t, d]
    }
    // bugs are tiny, so they get a generous reach and win over what lies behind them
    let bug = null
    let bugD = Infinity
    for (const b of bugs) {
      if (b.caught) continue
      const d = sphereDist(hit, tmp.copy(b.g.position).setY(0.1).clone(), 0.24)
      if (d !== null && d < bugD) [bug, bugD] = [b, d]
    }
    if (bug && bugD < bestD + 3) return { ...bugTarget, bug, click: () => catchBug(bug) }
    return best
  }
  const personRay = new THREE.Raycaster()
  function personUnder(hit) {
    if (hit.person) return hit.person
    const roots = [...people.values()].map(e => e.p.root).filter(r => r.visible)
    const h = hit.ray.intersectObjects(roots, true)[0]
    return people.get(h?.object.userData.personId)
  }

  // ---------------------------------------------------------------- hint bubbles (?interact)
  const hints = []
  if (params.has('interact')) {
    for (const t of TARGETS) {
      if (t.hint === false) continue
      const el = document.createElement('div')
      el.className = 'ix-hint'
      document.body.appendChild(el)
      hints.push({ t, el })
    }
  }
  const hv = new THREE.Vector3()
  function placeHints() {
    for (const { t, el } of hints) {
      const text = (!t.avail || t.avail()) && t.label()
      if (!text) {
        el.style.display = 'none'
        continue
      }
      t.anchor(hv)
      hv.project(camera)
      const ok = hv.z < 1 && Math.abs(hv.x) < 1.05 && Math.abs(hv.y) < 1.05
      el.style.display = ok ? 'block' : 'none'
      if (ok) {
        el.textContent = text
        el.style.left = (hv.x * 0.5 + 0.5) * window.innerWidth + 'px'
        el.style.top = (-hv.y * 0.5 + 0.5) * window.innerHeight + 'px'
      }
    }
  }

  // ---------------------------------------------------------------- the hooks
  let prevFires = 0
  let demoBugs = params.has('bugs') ? 4 : -1
  let hintTick = 0
  return {
    step(dt, t) {
      try {
        stepCat(dt)
        stepCoffee(dt)
        stepCalm()
        stepPlants(dt)
        stepLamps(dt)
        stepFish(dt)
        stepBugs(dt)
        stepHearts(dt)
        const n = fires().length
        if (prevFires > 0 && n === 0) spawnBugs()
        prevFires = n
        if (demoBugs > 0) {
          demoBugs -= dt
          if (demoBugs <= 0) spawnBugs()
        }
        if (jarGlow.userData.pulse > 0) jarGlow.userData.pulse = Math.max(0, jarGlow.userData.pulse - dt * 1.5)
        jarGlow.material.opacity = Math.min(0.55, (jarGlow.userData.n ?? 0) * 0.04) * (0.7 + 0.3 * Math.sin(t * 3)) + (jarGlow.userData.pulse ?? 0) * 0.5
        if (hints.length && (hintTick += dt) > 0.05) {
          hintTick = 0
          placeHints()
        }
      } catch (err) {
        console.warn('studio: interact step failed:', err)
      }
    },
    gone(entry) {
      calm.delete(entry.id)
      pokeAt.delete(entry.id)
    },
    click(hit) {
      const person = personUnder(hit)
      if (cup) {
        if (person) giveCup(person)
        else dropCup()
        return true
      }
      if (person) {
        poke(person)
        return undefined
      }
      const t = targetAt(hit)
      if (!t) return undefined
      t.click()
      return true
    },
    hover(hit) {
      const t = targetAt(hit)
      if (cup) {
        const person = personUnder(hit)
        const who = person?.persona?.name
        showTip(who ? `Hand the coffee to ${who}` : 'Click the floor or press Esc to put the cup down', hit.x, hit.y)
        return person ? 'pointer' : ''
      }
      if (!t) {
        showTip('', 0, 0)
        return ''
      }
      if (personUnder(hit)) {
        showTip('', 0, 0)
        return ''
      }
      showTip(t.label(), hit.x, hit.y)
      return 'pointer'
    },
  }
}
