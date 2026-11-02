// Claude's studio, the window: a cosy isometric office loft drawn with three.js. Claude works at her desk; every agent
// Claude summons walks in through the door, takes the nearest free desk, sits down and switches on the screen. A soft
// pill over each head says what that person is doing right now, and their mood shows: music notes in the flow,
// swirling question marks while thinking, confetti when a test passes, sweat and steam when things fail, and, after
// enough failures in a row, smoke and fire at the desk (see chaos.js). A server rack against the back wall shows how
// full the context window and the five-hour usage limit are. Day turns to night with the local clock.
//
// The state comes live from the Claude Code mod through this folder's little server (GET /events). Open the page
// with ?demo to watch a made-up session instead. Other switches, for checking: ?still=N (N agents, frozen),
// ?mood=flow|thinking|stressed|celebrate, ?chaos=1 (a fire at the first agent's desk, or ?chaos=claude),
// ?hour=22 or ?sky=night|day, ?usage=60,90 (context and five-hour percentages), ?models=0 (built-in people only),
// ?chatty (everyone talks often, for checking the speech bubbles), ?sessions=3 (several made-up Claude sessions sharing
// the office).
//
// The office is shared by every Claude session on the computer: each session's lead (the first one wears Claude's own
// model and sits at the big desk) gets a desk pod of its own when one is free, and that session's agents sit with them.
//
// Every person has a persona (persona.js): the name on their name tag, its colour, a short "about" shown when you click
// them, and lines they say in speech bubbles when they sit down, get into the flow, think, hit errors, cheer or leave.

import * as THREE from 'three'
import { RoomEnvironment } from './vendor/RoomEnvironment.js'
import { loadModelConfig, prefetchModels, vrmRig } from './avatars.js'
import { makeChaos } from './chaos.js'
import { TILE, makeFx } from './fx.js'
import { codeScreen } from './kit.js'
import { AGENT_LOOKS, CLAUDE_LOOK, lookFor, makePerson } from './people.js'
import { bubbleTime, personaFor, pickLine } from './persona.js'
import { ROOM, SUN_FROM, buildRoom, wireScreens } from './room.js'

const params = new URLSearchParams(location.search)
const DEMO = params.has('demo') || params.has('lineup') || location.protocol === 'file:'
const CHATTY = params.has('chatty')
const rand = (a, b) => a + Math.random() * (b - a)
const STILL = params.has('still') ? Number(params.get('still')) || 0 : -1
const MODELS = params.get('models') === '0' ? null : await loadModelConfig()
if (MODELS) prefetchModels(MODELS)

// ------------------------------------------------------------------------------------------------ renderer, scene

const canvas = document.getElementById('scene')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: STILL >= 0 })
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
renderer.setSize(window.innerWidth, window.innerHeight, false)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.shadowMap.autoUpdate = false // the sun never moves: redraw shadows every other frame, for the people
renderer.toneMapping = THREE.NeutralToneMapping
renderer.toneMappingExposure = 1.02

const scene = new THREE.Scene()
const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 0.42

const hemi = new THREE.HemisphereLight(0xfff4e8, 0xd6c3a8, 1.05)
scene.add(hemi)
const sun = new THREE.DirectionalLight(0xfff0dc, 1.65)
sun.position.copy(SUN_FROM).multiplyScalar(1.7)
sun.target.position.set(0, 0, 0)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 70 })
sun.shadow.bias = -0.0004
sun.shadow.normalBias = 0.03
scene.add(sun, sun.target)
const fill = new THREE.DirectionalLight(0xfff0e2, 0.75)
fill.position.set(12, 10, 14)
scene.add(fill)

const world = buildRoom(scene)
const screen = codeScreen()
wireScreens(world.seats, screen.texture)
const fx = makeFx(scene)
if (MODELS?.poster)
  new THREE.TextureLoader().load(`/models/${encodeURIComponent(MODELS.poster)}`, tex => {
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    world.poster.set(tex)
  })

// ------------------------------------------------------------------------------------------------ day and night

const DAY = { hemi: new THREE.Color(0xfff4e8), ground: new THREE.Color(0xd6c3a8), sun: new THREE.Color(0xfff0dc) }
const DUSK = { hemi: new THREE.Color(0xffd6b8), ground: new THREE.Color(0xa88a7a), sun: new THREE.Color(0xffa874) }
const NIGHT = { hemi: new THREE.Color(0x8f94c8), ground: new THREE.Color(0x3d3340), sun: new THREE.Color(0xa9b8ff) }
const lerp = (a, b, u) => a + (b - a) * u
let skyMode = params.get('sky') || 'auto'
let liveHour = null
let night = -1 // how dark it is now, 0 to 1 (eased towards the goal)

/** How dark it is outside at `hour` (local, 0 to 24): day 7:00 to 17:30, dusk until 19:30, dawn from 5:00. */
function darkness(hour) {
  if (skyMode === 'day') return 0
  if (skyMode === 'night') return 1
  const h = ((hour % 24) + 24) % 24
  if (h >= 7 && h <= 17.5) return 0
  if (h > 17.5 && h < 19.5) return (h - 17.5) / 2
  if (h > 5 && h < 7) return 1 - (h - 5) / 2
  return 1
}

function nowHour() {
  if (params.has('hour')) return Number(params.get('hour'))
  if (liveHour !== null) return liveHour
  const d = new Date()
  return d.getHours() + d.getMinutes() / 60
}

const tmpCol = new THREE.Color()
function light(dt) {
  const goal = darkness(nowHour())
  night = night < 0 ? goal : night + (goal - night) * (1 - Math.exp(-dt * 0.9))
  const n = night
  const dusk = Math.max(0, 1 - Math.abs(n - 0.45) / 0.45) // warm light around sunset
  const mix = (key, out) => out.copy(DAY[key]).lerp(NIGHT[key], n).lerp(DUSK[key], dusk * 0.6)
  mix('hemi', hemi.color)
  mix('ground', hemi.groundColor)
  mix('sun', sun.color)
  hemi.intensity = lerp(1.05, 0.34, n)
  sun.intensity = lerp(1.65, 0.32, n) * (1 - dusk * 0.15)
  fill.intensity = lerp(0.75, 0.16, n)
  fill.color.copy(tmpCol.set(0xfff0e2).lerp(NIGHT.hemi, n))
  scene.environmentIntensity = lerp(0.42, 0.16, n)
  renderer.toneMappingExposure = lerp(1.02, 1.1, n)
  world.setNight(n)
  document.body.classList.toggle('night', n > 0.5)
}

// ------------------------------------------------------------------------------------------------ camera and view

const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 300)
const view = { yaw: 0, zoom: 1, panX: 0, panY: 0 }
const goal = { ...view } // where the view is gliding to (a focus or a reset)
const base = { cx: 0, cy: 0 }
const centre = new THREE.Vector3(0, 0.9, 0)
const UP = new THREE.Vector3(0, 1, 0)
const BASE_DIR = new THREE.Vector3(1, 0.88, 1)
const box = []
for (const x of [ROOM.x0 - 0.5, ROOM.x1 + 0.3]) for (const y of [-0.5, ROOM.h + 0.1]) for (const z of [ROOM.z0 - 0.5, ROOM.z1 + 0.3]) box.push(new THREE.Vector3(x, y, z))

function placeCamera() {
  const dir = BASE_DIR.clone().applyAxisAngle(UP, view.yaw).normalize()
  camera.position.copy(centre).addScaledVector(dir, 80)
  camera.up.copy(UP)
  camera.lookAt(centre)
  camera.updateMatrixWorld(true)
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  const v = new THREE.Vector3()
  for (const p of box) {
    v.copy(p).applyMatrix4(camera.matrixWorldInverse)
    minX = Math.min(minX, v.x)
    maxX = Math.max(maxX, v.x)
    minY = Math.min(minY, v.y)
    maxY = Math.max(maxY, v.y)
  }
  const aspect = window.innerWidth / Math.max(1, window.innerHeight)
  let halfW = ((maxX - minX) / 2) * 1.05
  let halfH = ((maxY - minY) / 2) * 1.1
  if (halfW / halfH < aspect) halfW = halfH * aspect
  else halfH = halfW / aspect
  base.cx = (minX + maxX) / 2
  base.cy = (minY + maxY) / 2 - halfH * 0.03
  const cx = base.cx + view.panX
  const cy = base.cy + view.panY
  camera.left = cx - halfW
  camera.right = cx + halfW
  camera.top = cy + halfH
  camera.bottom = cy - halfH
  camera.zoom = view.zoom
  camera.updateProjectionMatrix()
}
placeCamera()

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight, false)
  placeCamera()
})

// drag to turn, right-drag to pan, wheel to zoom, double-click to reset, click a person for details
let drag = null
canvas.addEventListener('contextmenu', e => e.preventDefault())
canvas.addEventListener('pointerdown', e => {
  drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, button: e.button, moved: false }
  canvas.setPointerCapture(e.pointerId)
})
canvas.addEventListener('pointermove', e => {
  if (!drag) return
  const dx = e.clientX - drag.x
  const dy = e.clientY - drag.y
  drag.x = e.clientX
  drag.y = e.clientY
  if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4) {
    drag.moved = true
    canvas.classList.add('dragging')
  }
  if (!drag.moved) return
  if (drag.button === 0 && !e.shiftKey) view.yaw = Math.max(-0.38, Math.min(0.38, view.yaw + dx * 0.004))
  else {
    const perPx = (camera.right - camera.left) / camera.zoom / window.innerWidth
    view.panX -= dx * perPx
    view.panY += dy * perPx
  }
  Object.assign(goal, view)
  placeCamera()
})
canvas.addEventListener('pointerup', e => {
  if (drag && !drag.moved && drag.button === 0) pick(e.clientX, e.clientY)
  drag = null
  canvas.classList.remove('dragging')
})
canvas.addEventListener(
  'wheel',
  e => {
    e.preventDefault()
    view.zoom = Math.max(0.85, Math.min(4, view.zoom * Math.exp(-e.deltaY * 0.0012)))
    goal.zoom = view.zoom
    placeCamera()
  },
  { passive: false },
)
// double-click someone to look closely at them; double-click the room to see all of it again
canvas.addEventListener('dblclick', e => {
  const entry = personAt(e.clientX, e.clientY)
  if (entry) focusOn(entry, 3)
  else Object.assign(goal, { yaw: 0, zoom: 1, panX: 0, panY: 0 })
})

function focusOn(entry, zoom) {
  focusAt(entry.p.root.position, zoom)
}

function focusAt(spot, zoom) {
  const p = spot.clone()
  p.y = 0.9
  p.applyMatrix4(camera.matrixWorldInverse)
  Object.assign(goal, { zoom, panX: p.x - base.cx, panY: p.y - base.cy, yaw: view.yaw })
}

function glide(dt) {
  let moved = false
  const f = 1 - Math.exp(-dt * 5)
  for (const k of ['yaw', 'zoom', 'panX', 'panY']) {
    const d = goal[k] - view[k]
    if (Math.abs(d) > 1e-4) {
      view[k] += d * f
      moved = true
    }
  }
  if (moved) placeCamera()
}

// ------------------------------------------------------------------------------------------------ people

const LABEL = {
  idle: 'Idle',
  thinking: 'Thinking',
  reading: 'Reading',
  searching: 'Searching',
  writing: 'Writing',
  refactoring: 'Refactoring',
  testing: 'Testing',
  terminal: 'Running a command',
  browsing: 'Browsing',
  delegating: 'Delegating',
  planning: 'Planning',
}
const DOT = {
  idle: '#c9b8a4',
  thinking: '#e8b48f',
  planning: '#b9a6d6',
  reading: '#8fb0c2',
  searching: '#8fb0c2',
  browsing: '#7fa7c9',
  writing: '#d98a6c',
  refactoring: '#c8775a',
  testing: '#7f977a',
  terminal: '#d9a55a',
  delegating: '#e0a98a',
}
const POSE = {
  idle: 'idle',
  thinking: 'think',
  planning: 'think',
  reading: 'read',
  searching: 'read',
  browsing: 'read',
  writing: 'type',
  refactoring: 'type',
  testing: 'type',
  terminal: 'type',
  delegating: 'wave',
}

const badgeLayer = document.getElementById('badges')
const people = new Map()
const waiting = []
const aisleZ = world.doorway.z
const v3 = (x, z) => new THREE.Vector3(x, 0, z)
const seatSpot = seat => v3(seat.x + seat.face * 0.12, seat.z)
const faceYaw = seat => seat.face * (Math.PI / 2)

/**
 * What floats over a person's head, top to bottom: a speech bubble (while they talk), their persona card (when you
 * click them), then one pill: the name tag in the persona's colour followed by what they are doing; under it the file
 * or command. The role (agent type) and the file show for Claude, for whoever you clicked, and for everyone when you
 * zoom in close, so a busy room keeps its labels short.
 */
function makeBadge(isMain, persona) {
  const el = document.createElement('div')
  el.className = 'badge' + (isMain ? ' main' : '')
  el.innerHTML =
    '<div class="bubble"><span class="say"></span></div>' +
    '<div class="card"></div>' +
    '<div class="pill"><span class="tag"><span class="name"></span><span class="role"></span></span><span class="dot"></span><span class="label"></span></div>' +
    '<div class="detail"></div><div class="stem"></div>'
  el.style.opacity = '0'
  el.style.setProperty('--tag', persona.color)
  badgeLayer.appendChild(el)
  return {
    el,
    bubble: el.querySelector('.bubble'),
    say: el.querySelector('.say'),
    card: el.querySelector('.card'),
    name: el.querySelector('.name'),
    role: el.querySelector('.role'),
    pill: el.querySelector('.pill'),
    label: el.querySelector('.label'),
    detail: el.querySelector('.detail'),
  }
}

/** Sets an element's text only when it changed (so the page does not lay itself out again every frame). */
function setText(el, text) {
  if (el.textContent !== text) el.textContent = text
}

// Seats. The office has three desk pods of four. Every Claude session gets a pod of its own when one is free: its lead
// takes a desk in an empty pod (the first session's lead, wearing Claude's model, takes the big desk, seat 0), and the
// session's agents sit in their lead's pod first, then in a pod no other lead works in, then wherever a desk is free.
// Seat 0 is only ever a lead's.
const podOf = seat => `${seat.pod.x},${seat.pod.z}`
const fromDoor = seat => Math.abs(seat.approach.x - world.doorway.inside.x) + Math.abs(seat.approach.z - aisleZ) + Math.abs(world.doorway.inside.z - aisleZ)

function bestSeat(score) {
  let best = null
  let bestScore = Infinity
  for (const seat of world.seats) {
    if (seat.occupant) continue
    const s = score(seat)
    if (s < bestScore) {
      bestScore = s
      best = seat
    }
  }
  return best
}

/** The pods where a lead other than `except` sits (or is walking to). */
function leadPods(except) {
  return new Set([...people.values()].filter(e => e.isLead && e !== except && e.seat && e.state !== 'leaving').map(e => podOf(e.seat)))
}

function seatForLead(wearsClaude) {
  const main = world.seats[0]
  if (wearsClaude && !main.occupant) return main
  const taken = leadPods(null)
  const crowd = key => world.seats.filter(s => podOf(s) === key && s.occupant).length
  return bestSeat(seat => (taken.has(podOf(seat)) ? 1000 : 0) + crowd(podOf(seat)) * 50 + fromDoor(seat))
}

function seatForAgent(lead) {
  const home = lead?.seat ? podOf(lead.seat) : null
  const others = leadPods(lead)
  return bestSeat(seat => (seat.index === 0 ? Infinity : podOf(seat) === home ? 0 : others.has(podOf(seat)) ? 500 : 100) + fromDoor(seat))
}

function walkToSeat(entry, from) {
  const { p, seat } = entry
  entry.state = 'entering'
  p.walk([...from, v3(seat.approach.x, aisleZ), seat.approach])
    .call(() => (seat.pullWant = 1))
    .turn(faceYaw(seat), 0.3)
    .step(seatSpot(seat), 0.55)
    .sit()
    .call(() => {
      seat.pullWant = 0
      if (entry.state === 'entering') entry.state = 'working'
    })
    .wait(0.35)
    .call(() => (seat.want = 1))
}

let agentArrivals = 0

/**
 * Which model a newcomer wears. A session's lead wears Claude's model when no one in the room has it on (so the first
 * session's lead is Claude's own character); every other lead and every agent wears one nobody in the room has on,
 * else the next in turn.
 */
function modelFor(isLead) {
  if (!MODELS) return null
  const worn = new Set([...people.values()].map(e => e.model))
  if (isLead && MODELS.claude && !worn.has(MODELS.claude)) return MODELS.claude
  const list = MODELS.agents
  if (!list.length) return isLead ? MODELS.claude : null
  const free = list.find(f => !worn.has(f))
  return free ?? list[agentArrivals++ % list.length]
}

function spawn(id, info, instant) {
  const isLead = !!info.isLead || id === 'claude'
  const firstLead = isLead && ![...people.values()].some(e => e.isLead && e.state !== 'leaving')
  const model = modelFor(isLead)
  // the built-in figure (shown until a model loads, or when there are none): Claude's own look for the main lead
  const wearsClaude = isLead && (MODELS?.claude ? model === MODELS.claude : firstLead)
  const taken = new Set([...people.values()].map(e => e.lookIndex))
  const lookIndex = wearsClaude ? -1 : lookFor(info.kind || info.name || 'agent', taken)
  const look = wearsClaude ? CLAUDE_LOOK : AGENT_LOOKS[lookIndex]
  const p = makePerson(look, id)
  scene.add(p.root)
  const persona = personaFor({ isClaude: isLead, model, personas: MODELS?.personas, kind: info.kind || info.name, index: lookIndex })
  const voice = {
    text: '',
    last: '',
    left: 0,
    cool: 3,
    helloIn: 0,
    idleIn: CHATTY ? rand(3, 6) : rand(30, 80),
    seen: { state: null, strikes: Number(info.strikes) || 0, cheer: Number(info.cheer) || 0, mood: 'calm', code: info.code },
  }
  const entry = { id, p, info, isLead, lookIndex, model, persona, voice, ready: !model, seat: null, state: 'working', open: false, badge: makeBadge(isLead, persona), born: performance.now(), cheerSeen: info.cheer ?? 0, fxClock: 0, lift: 0 }
  entry.badge.pill.style.setProperty('--dot', DOT.idle)
  people.set(id, entry)
  if (model) {
    // the chibi stand-in stays hidden until the model is in (or for six seconds, if it never comes)
    p.root.visible = false
    vrmRig(model, id)
      .then(rig => {
        if (people.get(id) !== entry) return rig.dispose()
        p.setRig(rig)
      })
      .catch(err => console.warn(`studio: the model ${model} did not load:`, err))
      .finally(() => (entry.ready = true))
    p.until(() => entry.ready, 6)
  }
  const seat = isLead ? seatForLead(wearsClaude || id === 'claude') : seatForAgent(people.get(info.lead))
  if (seat) {
    seat.occupant = id
    entry.seat = seat
    p.seat = seat
  }
  if (instant && seat) {
    p.root.position.copy(seatSpot(seat))
    p.root.rotation.y = p.yawTarget = faceYaw(seat)
    p.seated = true
    seat.want = 1
    seat.power = 1
  } else {
    p.root.position.copy(world.doorway.outside)
    p.root.rotation.y = p.yawTarget = Math.PI / 2
    if (seat) walkToSeat(entry, [world.doorway.inside])
    else {
      entry.state = 'waiting'
      waiting.push(entry)
      const spot = world.lounge[waiting.length % world.lounge.length]
      p.walk([world.doorway.inside, v3(spot.x, aisleZ), spot]).turn(-Math.PI / 4)
    }
  }
  return entry
}

function leave(entry) {
  if (entry.state === 'leaving') return
  const was = entry.state
  entry.state = 'leaving'
  chaos.release(entry)
  const { p, seat } = entry
  const out = [world.doorway.inside, world.doorway.outside]
  const bye = () => {
    scene.remove(p.root)
    p.rig.dispose?.()
    entry.badge.el.remove()
    people.delete(entry.id)
  }
  if (was === 'waiting' || !seat) {
    if (waiting.includes(entry)) waiting.splice(waiting.indexOf(entry), 1)
    p.call(() => p.walk([v3(p.root.position.x, aisleZ), ...out]).call(bye))
    return
  }
  if (was === 'panic' || was === 'firefighting' || was === 'returning') {
    // up and about (running from a fire, fetching the extinguisher): free the desk and head straight out
    p.clear()
    p.seated = false
    seat.want = 0
    seat.pullWant = 0
    seat.occupant = null
    p.seat = null
    seatFreed(seat)
    p.walk([v3(p.root.position.x, aisleZ), ...out]).call(bye)
    return
  }
  p.call(() => (seat.want = 0))
    .stand()
    .call(() => (seat.pullWant = 1))
    .wait(0.2)
    .step(seat.approach, 0.5)
    .call(() => {
      seat.pullWant = 0
      seat.occupant = null
      p.seat = null
      seatFreed(seat)
    })
    .walk([v3(seat.approach.x, aisleZ), ...out])
    .call(bye)
}

function seatFreed(seat) {
  // the first in the queue takes the desk; the big desk (seat 0) goes only to a lead
  const at = waiting.findIndex(e => seat.index !== 0 || e.isLead)
  if (at < 0) return
  const [next] = waiting.splice(at, 1)
  seat.occupant = next.id
  next.seat = seat
  next.p.seat = seat
  walkToSeat(next, [v3(next.p.root.position.x, aisleZ)])
}

const MOODS = new Set(['calm', 'flow', 'thinking', 'stressed', 'panic', 'celebrate'])

function refreshBadge(entry) {
  const { info, badge, state, p } = entry
  const code = info.code in LABEL ? info.code : 'thinking'
  const strikes = Number(info.strikes) || 0
  let label = info.label || LABEL[code]
  let dot = DOT[code]
  if (state === 'entering') label = 'Arriving'
  if (state === 'leaving') label = 'Heading out'
  if (state === 'waiting') label = `${label} · waiting for a desk`
  if (state === 'panic') label = strikes ? `Panicking · ${strikes} errors in a row` : 'Calming down'
  if (state === 'firefighting') label = 'Fighting the fire'
  if (state === 'working' && strikes >= 2) label = `${label} · ${strikes} errors in a row`
  if (state === 'working' && p.cheer > 0) label = 'Yes!'
  if (strikes) dot = strikes >= 5 ? '#ff4a3d' : '#e98a5a'
  if (state === 'entering' || state === 'leaving') dot = '#d8c6b0'
  setText(badge.label, label)
  const { persona } = entry
  setText(badge.name, persona.name)
  // a lead's role comes from their persona, or names their session's folder when several sessions share the office;
  // an agent's role is its agent type (Explore, Plan...)
  const kind = info.name || info.kind || 'agent'
  const shared = sessionCount > 1 && people.get(info.lead)?.info.sessionName
  const leadRole = sessionCount > 1 && info.sessionName ? `Claude · ${info.sessionName}` : persona.role || 'Claude'
  const agentRole = kind === persona.name ? 'agent' : kind
  setText(badge.role, entry.isLead ? leadRole : shared ? `${agentRole} · ${shared}` : agentRole)
  setText(badge.card, entry.open ? persona.about : '')
  badge.pill.style.setProperty('--dot', dot)
  badge.pill.classList.toggle('busy', code !== 'idle' && state !== 'leaving')
  badge.pill.classList.toggle('alarm', strikes >= 5)
  const words = [info.detail, entry.open && info.task && info.task !== info.detail ? info.task : ''].filter(Boolean).join(' — ')
  setText(badge.detail, words)
  badge.detail.style.display = words ? '' : 'none'
  badge.el.classList.toggle('open', entry.open)
  p.activity = POSE[code] || 'idle'
  const mood = MOODS.has(info.mood) ? info.mood : 'calm'
  p.mood = mood === 'celebrate' ? 'calm' : mood
  // a new cheer from the mod (a test passed, a run of errors ended): a fist pump and confetti over the desk
  const cheer = Number(info.cheer) || 0
  if (cheer !== entry.cheerSeen) {
    entry.cheerSeen = cheer
    if (state !== 'leaving' && state !== 'waiting') {
      p.cheer = 3.2
      const spot = entry.seat && p.seated ? entry.seat.desk.clone().setY(1.35) : p.anchor(new THREE.Vector3())
      fx.confetti(spot)
    }
  }
}

// ------------------------------------------------------------------------------------------------ speech

/** Puts up a speech bubble with one of the person's lines for `moment`, and moves their mouth while they say it. */
function say(entry, moment) {
  const v = entry.voice
  const line = pickLine(entry.persona, moment, v.last)
  if (!line) return
  v.text = v.last = line
  v.left = bubbleTime(line)
  v.cool = CHATTY ? 2 : 10
  entry.p.talking = Math.min(v.left - 0.5, 0.6 + line.length * 0.05)
  setText(entry.badge.say, line)
  entry.badge.bubble.classList.add('show')
}

/**
 * Works out what a person reacts to this moment and lets them say it: sitting down (hello), a new mood (flow,
 * thinking, stressed), a cheer, a run of errors, their desk on fire, Claude handing out a task, leaving (bye), and
 * now and then a line about nothing much. Hello, bye, cheers, errors and fire always get a line; the rest only when
 * the person has not spoken for a while and fewer than two people are talking already.
 */
function chatter(entry, dt) {
  const v = entry.voice
  if (v.left > 0) {
    v.left -= dt
    if (v.left <= 0) {
      v.text = ''
      entry.badge.bubble.classList.remove('show')
    }
  }
  v.cool -= dt
  const { p, state, info } = entry
  if (!entry.ready || !p.root.visible) return
  const s = v.seen
  const strikes = Number(info.strikes) || 0
  const cheer = Number(info.cheer) || 0
  const mood = p.mood
  let moment = null
  let must = false
  const settled = state === 'working' || state === 'posing'
  if (state !== s.state && settled && (s.state === null || s.state === 'entering')) v.helloIn = rand(0.4, 2.4)
  if (v.helloIn > 0 && (v.helloIn -= dt) <= 0) [moment, must] = ['hello', true]
  else if (state === 'leaving' && s.state !== 'leaving') [moment, must] = ['bye', true]
  else if (state === 'panic' && s.state !== 'panic') [moment, must] = ['panic', true]
  else if (cheer !== s.cheer && state !== 'leaving' && state !== 'waiting') [moment, must] = ['celebrate', true]
  else if (strikes >= 2 && s.strikes < 2 && state !== 'panic') [moment, must] = ['stressed', true]
  else if (mood !== s.mood && ['flow', 'thinking', 'stressed'].includes(mood) && Math.random() < (CHATTY ? 1 : mood === 'stressed' ? 0.7 : 0.4)) moment = mood
  else if (entry.isLead && info.code === 'delegating' && s.code !== 'delegating' && Math.random() < 0.8) moment = 'delegating'
  else if (settled && !strikes && v.left <= 0 && (v.idleIn -= dt) <= 0) {
    v.idleIn = CHATTY ? rand(3, 6) : rand(45, 110)
    moment = 'idle'
  }
  Object.assign(s, { state, strikes, cheer, mood, code: info.code })
  if (!moment) return
  if (!must) {
    if (v.cool > 0 || v.left > 0) return
    let talking = 0
    for (const e of people.values()) if (e.voice.left > 0) talking++
    if (talking >= 2) return
  }
  say(entry, moment)
}

function personAt(x, y) {
  const ray = new THREE.Raycaster()
  ray.setFromCamera(new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1), camera)
  const hits = ray.intersectObjects([...people.values()].map(e => e.p.root), true)
  return people.get(hits[0]?.object.userData.personId)
}

function pick(x, y) {
  const hit = personAt(x, y)
  for (const e of people.values()) e.open = e === hit ? !e.open : false
}

// ------------------------------------------------------------------------------------------------ live state

const hudTeam = document.getElementById('team')
const hudClock = document.getElementById('clock')
const hudLive = document.getElementById('live')
let synced = false
let lastClock = ''
const forcedUsage = params.get('usage')?.split(',').map(Number)

/** How many Claude sessions work in the office right now. */
let sessionCount = 0

/**
 * The sessions in a state. The shared office sends `{ sessions: [{ id, name, changed, skyAt, state }] }`, one per
 * Claude session, each `state` that session's studio (`main` its lead, `helpers` its agents). A demo, or a window
 * fed by an older mod, sends one studio: that is one session, whose lead keeps the id `claude`.
 */
function sessionsOf(state) {
  if (Array.isArray(state?.sessions)) return state.sessions.filter(s => s && typeof s.id === 'string' && s.state?.main)
  if (state?.main) return [{ id: '', name: '', changed: 0, skyAt: 0, state }]
  return null
}
const leadIdOf = session => (session ? `lead:${session}` : 'claude')
const agentIdOf = (session, id) => (session ? `${session}/${id}` : id)

function apply(state) {
  const list = sessionsOf(state)
  if (!list) return
  // every session's lead first, then that session's agents (so the agents can sit down next to their lead)
  const want = new Map()
  for (const s of list) {
    const lead = leadIdOf(s.id)
    want.set(lead, { ...s.state.main, isLead: true, session: s.id, sessionName: s.name })
    for (const h of s.state.helpers || []) want.set(agentIdOf(s.id, h.id), { ...h, isLead: false, session: s.id, lead })
  }
  sessionCount = list.length
  const instant = !synced
  synced = true
  for (const entry of [...people.values()]) if (!want.has(entry.id)) leave(entry)
  for (const [id, info] of want) {
    const entry = people.get(id) ?? spawn(id, info, instant)
    entry.info = info
  }
  // the clock and the context window come from the session that changed last, the sky from the one where it was set
  // last (/office night), and the five-hour limit (the account's) from whichever session read it highest
  let newest = null
  let skyFrom = null
  for (const s of list) {
    if (!newest || (s.changed ?? 0) >= (newest.changed ?? 0)) newest = s
    if ((s.skyAt ?? 0) > (skyFrom?.skyAt ?? 0)) skyFrom = s
  }
  const st = newest?.state
  if (st?.clock) lastClock = st.clock
  if (Number.isFinite(st?.hour)) liveHour = st.hour
  const sky = (skyFrom ?? newest)?.state.sky
  if (!params.has('sky') && ['auto', 'day', 'night'].includes(sky)) skyMode = sky
  const five = list.map(s => s.state.usage?.fiveHour).filter(Number.isFinite)
  const usage = forcedUsage ?? [st?.usage?.context, five.length ? Math.max(...five) : null]
  world.rack.set(usage[0] ?? null, usage[1] ?? null)
}

function connect() {
  // the server goes away when the Claude Code session ends; after 6 seconds without it the window says so and closes
  let downSince = 0
  let isEnded = false
  const es = new EventSource('/events')
  const ended = () => {
    if (isEnded) return
    isEnded = true
    document.getElementById('ended').classList.add('show')
    hudLive.textContent = 'ended'
    hudLive.classList.add('off')
    es.close()
    setTimeout(() => window.close(), 2500)
  }
  es.addEventListener('open', () => {
    downSince = 0
    hudLive.textContent = 'live'
    hudLive.classList.remove('off')
  })
  es.addEventListener('state', e => apply(JSON.parse(e.data)))
  es.addEventListener('bye', ended)
  es.addEventListener('error', () => {
    hudLive.textContent = 'reconnecting'
    hudLive.classList.add('off')
    if (!downSince) downSince = Date.now()
  })
  setInterval(() => {
    if (downSince && Date.now() - downSince > 6000 && es.readyState !== EventSource.OPEN) ended()
  }, 1000)
}

// ------------------------------------------------------------------------------------------------ demo session

function demo() {
  hudLive.textContent = 'demo'
  const kinds = [
    ['Explore', 'map the repository'],
    ['Plan', 'design the cache layer'],
    ['general-purpose', 'fix the flaky test'],
    ['Explore', 'find every caller of parse()'],
    ['general-purpose', 'update the docs'],
  ]
  const codes = ['thinking', 'reading', 'refactoring', 'testing', 'searching', 'writing', 'terminal', 'planning']
  const files = ['auth.ts', 'cache.py', 'README.md', 'server.mjs', 'npm test', '"parse("', 'office.test.tsx', 'schema.sql']
  const state = { main: { id: 'claude', name: 'Claude', code: 'thinking', detail: '', strikes: 0, cheer: 0 }, helpers: [], clock: '', usage: { context: 18, fiveHour: 34 } }
  let n = 0
  const addHelper = (code = 'thinking') => {
    const [kind, task] = kinds[n % kinds.length]
    state.helpers.push({ id: `demo-${n}`, name: kind, kind, code, detail: files[n % files.length], task, born: Date.now(), strikes: 0, cheer: 0 })
    n++
  }
  // the same moods the mod works out: editing is flow, thinking is thinking, errors in a row are stress
  const moodOf = w => (w.strikes >= 5 ? 'panic' : w.strikes ? 'stressed' : /writing|refactoring|testing/.test(w.code) ? 'flow' : /thinking|planning/.test(w.code) ? 'thinking' : 'calm')
  const withMoods = s => {
    const forced = params.get('mood')
    const set = w => ({ ...w, mood: forced && !w.strikes ? forced : moodOf(w) })
    return { ...s, main: set(s.main), helpers: s.helpers.map(set) }
  }
  if (params.has('lineup')) return lineup(state, addHelper, withMoods)
  if (STILL >= 0) {
    for (let i = 0; i < STILL; i++) addHelper(codes[(i * 3 + 1) % codes.length])
    state.main = { ...state.main, code: 'refactoring', detail: 'office.js' }
    const chaosAt = params.get('chaos')
    if (chaosAt === 'claude' || (chaosAt && !state.helpers.length)) state.main.strikes = 5
    else if (chaosAt) state.helpers[0].strikes = 5
    apply(withMoods(state))
    if (STILL > 0) {
      addHelper('thinking')
      apply(withMoods(state))
    }
    if (params.get('mood') === 'celebrate') setTimeout(() => apply(withMoods({ ...state, main: { ...state.main, cheer: 1 }, helpers: state.helpers.map(h => ({ ...h, cheer: 1 })) })), 1500)
    return
  }
  apply(withMoods(state))
  let tick = 0
  setInterval(() => {
    tick++
    const roll = Math.random()
    state.main = { ...state.main, code: codes[Math.floor(Math.random() * codes.length)], detail: files[Math.floor(Math.random() * files.length)] }
    if (roll < 0.35 && state.helpers.length < 5) {
      addHelper()
      state.main.code = 'delegating'
    } else if (roll < 0.5 && state.helpers.length > 1) {
      const old = state.helpers.filter((h, i) => i > 0 && Date.now() - h.born > 15000)
      if (old.length) state.helpers = state.helpers.filter(h => h !== old[0])
    }
    state.helpers = state.helpers.map(h => ({ ...h, code: Math.random() < 0.5 ? codes[Math.floor(Math.random() * codes.length)] : h.code }))
    // every 26 ticks the first agent hits a run of errors: stress, smoke, fire, the extinguisher, then the fix
    const phase = tick % 26
    const first = state.helpers[0]
    if (first) {
      if (phase >= 6 && phase <= 11) first.strikes = phase - 5
      if (phase === 19) {
        first.strikes = 0
        first.cheer++
      }
    }
    if (tick % 9 === 4) state.main.cheer++ // a passing test now and then
    const u = state.usage
    state.usage = { context: u.context >= 96 ? 12 : u.context + 3, fiveHour: Math.min(99, u.fiveHour + 0.8) }
    apply(withMoods(structuredClone(state)))
  }, 3500)
}

/**
 * ?sessions=N: N made-up Claude sessions sharing the office (default 3). They join a few seconds apart, each with a
 * couple of agents that come and go; after a minute the second session ends and its people walk out, then it comes
 * back. For checking the shared office without starting real sessions.
 */
function multiDemo() {
  hudLive.textContent = 'demo'
  const count = Math.max(1, Math.min(4, Number(params.get('sessions')) || 3))
  const names = ['fed_news', 'pixel-office', 'thb_lstm_v3', 'gold_gpt2']
  const kinds = ['Explore', 'Plan', 'general-purpose']
  const codes = ['thinking', 'reading', 'refactoring', 'testing', 'searching', 'writing', 'terminal', 'planning']
  const moodOf = w => (w.strikes >= 5 ? 'panic' : w.strikes ? 'stressed' : /writing|refactoring|testing/.test(w.code) ? 'flow' : /thinking|planning/.test(w.code) ? 'thinking' : 'calm')
  const worker = (id, kind, code) => ({ id, name: kind, kind, code, detail: `${kind.toLowerCase()} work`, task: 'a made-up task', strikes: 0, cheer: 0, mood: 'calm' })
  const sessions = []
  let n = 0
  let tick = 0
  const join = i => sessions.push({ id: `demo-session-${i}`, name: names[i], joined: Date.now(), changed: Date.now(), skyAt: 0, state: { main: worker('claude', 'Claude', 'thinking'), helpers: [], clock: '', usage: { context: 20 + i * 15, fiveHour: 40 } } })
  const send = () => apply(structuredClone({ sessions: sessions.map(s => ({ ...s, state: { ...s.state, main: { ...s.state.main, mood: moodOf(s.state.main) }, helpers: s.state.helpers.map(h => ({ ...h, mood: moodOf(h) })) } })) }))
  join(0)
  send()
  setInterval(() => {
    tick++
    if (tick % 2 === 0 && sessions.length < count) join(sessions.length)
    if (tick === 18) sessions.splice(1, 1) // the second session ends
    if (tick === 26) join(1)
    for (const s of sessions) {
      const st = s.state
      st.main = { ...st.main, code: codes[Math.floor(Math.random() * codes.length)] }
      if (Math.random() < 0.3 && st.helpers.length < 3) {
        st.helpers.push(worker(`a${n}`, kinds[n % kinds.length], 'thinking'))
        n++
        st.main.code = 'delegating'
      } else if (Math.random() < 0.15 && st.helpers.length > 1) st.helpers.shift()
      st.helpers = st.helpers.map(h => ({ ...h, code: Math.random() < 0.5 ? codes[Math.floor(Math.random() * codes.length)] : h.code }))
      s.changed = Date.now()
    }
    send()
  }, 3000)
}

const chaos = makeChaos(scene, { world, people, fx, seatSpot, faceYaw, aisleZ })
if (MODELS?.credits.length) document.getElementById('hud').title = `Characters: ${MODELS.credits.join(' · ')}`

/**
 * ?lineup: everyone stands in a row in the open floor by the lounge, facing the camera, one of each character model,
 * and they go through the moods together every few seconds (flow, thinking, a cheer, stressed, calm).
 */
function lineup(state, addHelper, withMoods) {
  hudLive.textContent = 'line-up'
  const count = Math.max(3, MODELS?.agents.length ?? 0)
  for (let i = 0; i < count; i++) addHelper('thinking')
  apply(withMoods(state))
  const ids = ['claude', ...state.helpers.map(h => h.id)]
  const PER_ROW = 5
  const rows = Math.ceil(ids.length / PER_ROW)
  // one row of up to five fits between the sofa and the extinguisher post; more people stand closer together
  const centre = rows > 1 ? new THREE.Vector3(-3.3, 0, 0.35) : new THREE.Vector3(-3.2, 0, 0.8)
  const across = new THREE.Vector3(1, 0, -1).multiplyScalar(rows > 1 ? 0.82 : 0.95) // square to the camera's view
  const back = new THREE.Vector3(-1, 0, -1).multiplyScalar(0.62) // away from the camera: the next row stands here
  ids.forEach((id, i) => {
    const e = people.get(id)
    if (!e) return
    if (e.seat) {
      e.seat.occupant = null
      e.seat.want = 0
      e.seat = null
      e.p.seat = null
    }
    e.p.clear()
    e.p.seated = false
    // five to a row; the row behind stands in the gaps of the row in front, so every face shows
    const row = Math.floor(i / PER_ROW)
    const inRow = Math.min(PER_ROW, ids.length - row * PER_ROW)
    const col = (i % PER_ROW) - (inRow - 1) / 2 + (inRow === PER_ROW && row % 2 ? 0.5 : 0)
    e.p.root.position.copy(centre).addScaledVector(across, col).addScaledVector(back, row)
    e.p.root.rotation.y = e.p.yawTarget = Math.PI / 4
    e.state = 'posing'
    if (e.model) e.p.until(() => e.ready, 8)
  })
  focusAt(centre.clone().addScaledVector(back, (rows - 1) / 2), rows > 1 ? 2.9 : 3.3)
  Object.assign(view, goal)
  placeCamera()
  const moods = [
    ['flow', 'Writing'],
    ['thinking', 'Thinking'],
    ['celebrate', 'Yes!'],
    ['stressed', 'Frustrated'],
    ['calm', 'Idle'],
  ]
  let k = 0
  setInterval(() => {
    const [mood, label] = moods[k++ % moods.length]
    for (const e of people.values()) {
      if (mood === 'celebrate') e.info = { ...e.info, cheer: (Number(e.info.cheer) || 0) + 1, mood: 'calm', label }
      else e.info = { ...e.info, mood, label }
    }
  }, 4500)
}

// in a demo Claude is at her desk from the first frame; the live office fills from the server's first state, which
// comes the moment the page connects
if (params.has('sessions')) multiDemo()
else if (DEMO || STILL >= 0) {
  spawn('claude', { id: 'claude', name: 'Claude', code: 'idle', detail: '' }, true)
  demo()
} else connect()
if (params.has('focus')) {
  // for close-up checks: ?focus=claude&zoom=3 starts looking at one person
  // (or at a thing: ?focus=rack, ?focus=poster, ?focus=fire for the extinguisher post)
  const things = { rack: new THREE.Vector3(6.4, 0.6, -6.4), poster: new THREE.Vector3(3.4, 1.6, -6.9), fire: world.extinguisher.spot }
  const thing = things[params.get('focus')]
  if (thing) focusAt(thing, Number(params.get('zoom')) || 3)
  else focusOn(people.get(params.get('focus')) ?? [...people.values()][0], Number(params.get('zoom')) || 3)
  Object.assign(view, goal)
  placeCamera()
}

// the window's title names the session's folder (the mod finds and places the window by it)
if (params.get('session')) {
  document.title = `Claude's studio · ${params.get('session')}`
  document.getElementById('session').textContent = `${params.get('session')} · `
}

// ------------------------------------------------------------------------------------------------ frame loop

const clock = new THREE.Clock()
const tmp = new THREE.Vector3()
let screenTimer = 0
let frameCount = 0
const doorSpot = new THREE.Vector3(ROOM.x0, 0, world.doorway.z)

function placeBadges(dt) {
  const W = window.innerWidth
  const H = window.innerHeight
  const placed = []
  for (const entry of people.values()) {
    entry.p.anchor(tmp).project(camera)
    const x = ((tmp.x + 1) / 2) * W
    const y = ((1 - tmp.y) / 2) * H
    const outside = entry.p.root.position.x < ROOM.x0 - 0.1
    const el = entry.badge.el
    placed.push({ entry, x, y, top: y, w: el.offsetWidth || 120, h: el.offsetHeight || 40, outside })
  }
  // keep badges in the same pod from sitting on top of each other: the one higher on screen moves up, smoothly
  placed.sort((a, b) => b.y - a.y)
  for (let i = 0; i < placed.length; i++)
    for (let j = 0; j < i; j++) {
      const a = placed[i]
      const b = placed[j]
      if (a.outside || b.outside) continue
      const across = Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 6
      const overlap = a.top > b.top - b.h - 4 && a.top - a.h < b.top
      if (across && overlap) a.top = b.top - b.h - 4
    }
  document.body.classList.toggle('close', view.zoom >= 2.2)
  const ease = 1 - Math.exp(-dt * 10)
  for (const { entry, x, y, top, outside } of placed) {
    entry.lift += (top - y - entry.lift) * ease
    const el = entry.badge.el
    const yy = y + entry.lift
    el.style.transform = `translate(${x.toFixed(1)}px, ${yy.toFixed(1)}px) translate(-50%, -100%)`
    el.style.zIndex = String(Math.round(y))
    el.style.opacity = outside ? '0' : '1'
  }
}

let lastHud = ''
function updateHud() {
  const here = [...people.values()].filter(e => e.state !== 'leaving')
  const team = here.length
  const now = new Date()
  const time = lastClock || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const key = `${team}/${sessionCount}/${time}`
  if (key === lastHud) return
  lastHud = key
  const lead = here.find(e => e.isLead)
  hudTeam.textContent =
    sessionCount > 1 ? `${sessionCount} Claude sessions · ${team} people` : team === 0 ? 'nobody in yet' : team === 1 ? `just ${lead?.persona.name ?? 'Claude'} today` : `team of ${team}`
  hudClock.textContent = time
}

// ?warp=n runs n steps of a thirtieth of a second per frame (for checking walks in a slow headless browser)
const WARP = Number(params.get('warp')) || 0
let simTime = 0

const head = new THREE.Vector3()
const at = new THREE.Vector3()
const NOTE_COLOURS = [0xff7aa8, 0x7fc8ff, 0xffd166, 0x9be7a8, 0xc9a0ff]

/** The little effects over each person's head that show how they feel. */
function moodEffects(entry, dt) {
  const { p, state } = entry
  if (!p.root.visible || state === 'leaving' || state === 'entering' || state === 'waiting') return
  entry.fxClock += dt
  const every = (key, s) => {
    entry[key] = (entry[key] ?? Math.random() * s) - dt
    if (entry[key] > 0) return false
    entry[key] += s
    return true
  }
  p.headPos(head)
  const yaw = p.root.rotation.y
  const left = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw))
  const ear = p.rig.kind === 'vrm' ? 0.1 : 0.28
  const busy = state === 'firefighting' || state === 'returning'
  const mood = p.cheer > 0 ? 'celebrate' : p.action === 'panic' ? 'panic' : busy ? 'calm' : p.mood
  if (mood === 'flow' && every('tNote', 0.55)) {
    const side = Math.random() < 0.5 ? -1 : 1
    fx.emit(Math.random() < 0.5 ? TILE.note : TILE.note2, at.copy(head).addScaledVector(left, side * 0.18).setY(head.y + 0.22), {
      vel: [left.x * side * 0.15, 0.42, left.z * side * 0.15],
      life: 2.2,
      size: 0.17,
      color: NOTE_COLOURS[Math.floor(Math.random() * NOTE_COLOURS.length)],
      fade: 'inout',
      wobble: 0.08,
      spin: rand(-0.3, 0.3),
    })
  }
  if (mood === 'thinking' && every('tThink', 1.0))
    fx.emit(TILE.question, at.copy(head).setY(head.y + 0.42), {
      vel: [0, 0.16, 0],
      life: 2.6,
      size: 0.2,
      color: Math.random() < 0.5 ? 0xb48cff : 0xffb36b,
      fade: 'inout',
      orbit: { r: 0.26, rate: 2.2 },
      spin: rand(-0.3, 0.3),
    })
  if (mood === 'stressed' || mood === 'panic') {
    if (every('tSweat', mood === 'panic' ? 0.22 : 0.8)) {
      const side = Math.random() < 0.5 ? -1 : 1
      fx.emit(TILE.sweat, at.copy(head).addScaledVector(left, side * (ear + 0.04)).setY(head.y + 0.08), {
        vel: [left.x * side * 0.5, 0.6, left.z * side * 0.5],
        gravity: 3.2,
        life: 0.9,
        size: 0.1,
        spin: -side * 0.5,
      })
    }
    // steam from the ears comes in angry little bursts
    const burst = entry.fxClock % 2.4 < 0.9
    if (burst && every('tSteam', 0.07))
      for (const side of [-1, 1])
        fx.emit(TILE.steam, at.copy(head).addScaledVector(left, side * ear).setY(head.y + 0.02), {
          vel: [left.x * side * 0.7, 0.35, left.z * side * 0.7],
          drag: 1.5,
          life: 0.8,
          size: 0.05,
          grow: 0.24,
          alpha: 0.85,
        })
    if (mood === 'stressed' && every('tAnger', 3.2)) fx.emit(TILE.anger, at.copy(head).addScaledVector(left, 0.16).setY(head.y + 0.3), { life: 1.2, size: 0.17, fade: 'inout' })
    if (mood === 'panic' && every('tBang', 1.4)) fx.emit(TILE.bang, at.copy(head).setY(head.y + 0.45), { vel: [0, 0.3, 0], life: 1, size: 0.22, color: 0xffd23f, fade: 'inout' })
  }
  if (mood === 'celebrate' && every('tSpark', 0.25))
    fx.emit(TILE.star, at.copy(head).add(new THREE.Vector3(rand(-0.3, 0.3), rand(0.2, 0.5), rand(-0.3, 0.3))), { vel: [0, 0.4, 0], life: 0.8, size: 0.14, grow: 0.02, color: 0xfff1a8, additive: true, spinRate: 3 })
}

function step(dt) {
  simTime += dt
  const t = simTime
  world.update(t, dt)
  chaos.update(dt, t)
  let nearDoor = false
  for (const entry of people.values()) {
    if (!entry.ready && performance.now() - entry.born > 6500) entry.ready = true
    entry.p.root.visible = entry.ready
    entry.p.update(dt, t)
    moodEffects(entry, dt)
    chatter(entry, dt)
    if (entry.p.root.position.distanceTo(doorSpot) < 2.0) nearDoor = true
  }
  world.door.target = nearDoor ? 1 : 0
  fx.update(dt, renderer.domElement.height / ((camera.top - camera.bottom) / camera.zoom))
}

function frame() {
  const real = Math.min(0.1, clock.getDelta())
  if (WARP) for (let i = 0; i < WARP; i++) step(1 / 30)
  else step(real)
  const dt = real
  glide(dt)
  light(dt)
  for (const entry of people.values()) refreshBadge(entry)
  screenTimer += dt
  if (screenTimer > 0.12) {
    screenTimer = 0
    screen.tick()
  }
  frameCount++
  if (frameCount % 2 === 1) renderer.shadowMap.needsUpdate = true
  renderer.render(scene, camera)
  placeBadges(dt)
  updateHud()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

// for checking the scene from outside (a headless screenshot waits for this)
window.__studio = {
  ready: true,
  people,
  world,
  chaos,
  fx,
  models: MODELS,
  apply,
  /** A one-line summary per person, for checks. */
  rows: () => [...people.values()].map(e => ({ id: e.id, name: e.persona.name, state: e.state, rig: e.p.rig.kind, mood: e.p.mood, action: e.p.action, holding: e.p.holding, x: +e.p.root.position.x.toFixed(2), z: +e.p.root.position.z.toFixed(2), cheer: +e.p.cheer.toFixed(1), say: e.voice.text })),
}
if (params.has('debug')) {
  window.addEventListener('error', e => console.log('STUDIO-ERROR ' + e.message + ' @' + e.filename + ':' + e.lineno))
  window.addEventListener('unhandledrejection', e => console.log('STUDIO-ERROR (promise) ' + (e.reason?.stack || e.reason)))
}
if (params.has('debug'))
  setInterval(() => {
    const rows = [...people.values()].map(
      e => `${e.id}:${e.state}:${e.p.rig.kind}:${e.p.mood}${e.p.action ? '/' + e.p.action : ''}:${e.p.root.position.x.toFixed(2)},${e.p.root.position.z.toFixed(2)}:q${e.p.queue.length}:${e.p.current?.type ?? '-'}${e.p.current ? '@' + e.p.current.t?.toFixed(1) : ''}:r${e.ready ? 1 : 0}${e.p.rig.info ? ':' + e.p.rig.info : ''}`,
    )
    console.log(
      'STUDIO ' + performance.now().toFixed(0) + ' calls=' + renderer.info.render.calls + ' tris=' + renderer.info.render.triangles + ' fx=' + fx.count() + ' night=' + night.toFixed(2) + ' fires=' + JSON.stringify(chaos.state()) + ' ' + rows.join(' | '),
    )
  }, 1000)
