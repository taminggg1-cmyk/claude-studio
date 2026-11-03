// Desk gadgets (see ../features.js): an alarm clock for scheduled runs and a desk phone for MCP tools. The mod
// (hooks/features/gadgets.ts) sends, for each session, `{ alarms: [{ id, kind, at, label }], rang: { id, at, label } | null,
// calls: [{ id, who, service, since }], callsDone: [{ id, who, service, ok, at }], phones: [who] }` (`who` is 'main' or an
// agent's id).
//
//   - The alarm clock: a brass twin-bell clock on the lead's desk while the session has a scheduled run. Its face counts
//     down to the next one (m:ss under an hour, else h:mm). When the mod says the alarm rang, the clock shakes and
//     blurs its bells, the alarm sounds, and the lead (if she is free) jumps up, taps it off and sits down again.
//   - The desk phone: cream, with a coiled cord. It appears on a person's desk the first time they use an MCP tool and
//     stays. On a call it rings, the person lifts the receiver to their ear and says who they are calling, the badge says
//     "On the phone · <Service>", and when the call ends they hang up (even a very short call gets a quick lift).
//
// Where they sit: on the desk top, at spots no other feature uses (the mug, lamp, plant, bell, letters, folders and the
// napping cat have theirs). `?gadgets` on a demo page fakes it: a wake-up that rings after a 20 second count-down, a cron
// job with a later time, and a phone call every 30 seconds.

import * as THREE from 'three'
import { TILE } from '../fx.js'

const BRASS = 0xc9a05a
const CREAM = 0xefe3c8
const DARK = 0x2e2824
const RING_FRESH_MS = 20000
const RING_MAX_S = 8
const PHONE_RING_S = 1.1
const MIN_TALK_S = 1.4
const HANG_S = 0.45
const PHONE_SCALE = 0.85
/** The receiver is drawn bigger in a hand, so it still reads next to a chibi head. */
const HAND_SCALE = 1.6
const DEMO_WAKE_S = 20
const DEMO_CYCLE_S = 45
const DEMO_CALL_EVERY_S = 30

const rnd = (a, b) => a + Math.random() * (b - a)
const pad = n => String(n).padStart(2, '0')

/** Where each gadget sits on a desk, in the desk's own units: x across (the lamp is at `side`), z towards the sitter. */
const SPOT = {
  clock: seat => ({ x: deskSide(seat) * 1.1, z: 0.27 }),
  phone: seat => ({ x: deskSide(seat) * 1.06, z: 0.06 }),
}
/** Which side of the desk the lamp is on (the same rule as the room): +0.5 or -0.5. */
const deskSide = seat => (seat.index % 2 ? -0.5 : 0.5)

function sound(name) {
  try {
    window.dispatchEvent(new CustomEvent('studio:sound', { detail: { name } }))
  } catch {
    // no window to hear it
  }
}

/** "12 min", "2 h 5 min", "3 days": how long until `ms` from now, in words. */
export function inWords(ms) {
  const min = Math.round(ms / 60000)
  if (min < 1) return 'less than a minute'
  if (min < 60) return `${min} min`
  if (min < 24 * 60) return min % 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${Math.floor(min / 60)} h`
  const days = Math.round(min / 1440)
  return `${days} ${days === 1 ? 'day' : 'days'}`
}

/** The count-down on the clock's face: { text: "12:05", unit: "min : sec" }. */
export function countdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  if (s < 3600) return { text: `${Math.floor(s / 60)}:${pad(s % 60)}`, unit: 'min : sec' }
  const h = Math.floor(s / 3600)
  if (h > 99) return { text: '99h+', unit: 'hours' }
  return { text: `${h}:${pad(Math.floor((s % 3600) / 60))}`, unit: 'hr : min' }
}

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...opts })

function disposeTree(root) {
  root.traverse(o => {
    o.geometry?.dispose()
    const m = o.material
    if (m) {
      m.map?.dispose()
      m.dispose?.()
    }
  })
}

// ------------------------------------------------------------------------------------------------ the alarm clock

function drawFace(canvas, text, unit, ringing) {
  const g = canvas.getContext('2d')
  const c = canvas.width / 2
  g.clearRect(0, 0, canvas.width, canvas.height)
  g.fillStyle = ringing ? '#fff1d6' : '#f7efdc'
  g.beginPath()
  g.arc(c, c, c - 2, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = '#5b3d2a'
  g.lineWidth = 5
  g.stroke()
  g.strokeStyle = '#8a6a50'
  g.lineWidth = 3
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    g.beginPath()
    g.moveTo(c + Math.sin(a) * (c - 10), c - Math.cos(a) * (c - 10))
    g.lineTo(c + Math.sin(a) * (c - (i % 3 ? 16 : 22)), c - Math.cos(a) * (c - (i % 3 ? 16 : 22)))
    g.stroke()
  }
  g.fillStyle = ringing ? '#d8341c' : '#3a2a22'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = `800 ${text.length > 4 ? 34 : 40}px "Segoe UI", sans-serif`
  g.fillText(text, c, c - 2)
  g.fillStyle = '#8a6a50'
  g.font = '700 13px "Segoe UI", sans-serif'
  g.fillText(unit, c, c + 26)
}

/** A brass twin-bell alarm clock: body and face, two bells with a hammer between them, two feet. */
function makeClock() {
  const root = new THREE.Group()
  const shake = new THREE.Group() // everything that jumps about when it rings
  root.add(shake)
  const brass = mat(BRASS, { metalness: 0.7, roughness: 0.35 })
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.034, 28), brass)
  body.rotation.x = Math.PI / 2
  body.position.y = 0.075
  body.castShadow = true
  shake.add(body)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.046, 32), new THREE.MeshBasicMaterial({ map: tex, transparent: true }))
  face.position.set(0, 0.075, 0.0175)
  shake.add(face)
  for (const dx of [-0.032, 0.032]) {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), brass)
    foot.position.set(dx, 0.012, 0)
    shake.add(foot)
  }
  // two bells (half spheres), the hammer between them, and a ghost of each bell that shows when it blurs
  const bells = []
  const ghosts = []
  for (const side of [-1, 1]) {
    const bell = new THREE.Group()
    bell.position.set(side * 0.032, 0.123, 0)
    bell.rotation.z = -side * 0.55
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.026, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), brass)
    dome.castShadow = true
    bell.add(dome)
    const ghost = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
    )
    bell.add(ghost)
    shake.add(bell)
    bells.push(bell)
    ghosts.push(ghost)
  }
  const hammer = new THREE.Group()
  hammer.position.set(0, 0.138, 0)
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.05, 6), mat(0x55504c))
  rod.position.y = 0.015
  hammer.add(rod)
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 6), brass)
  ball.position.y = 0.042
  hammer.add(ball)
  shake.add(hammer)
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.02, 6), brass)
  post.position.set(0, 0.13, 0)
  shake.add(post)
  root.scale.setScalar(1.15)
  return { root, shake, bells, ghosts, hammer, canvas, tex, shown: '' }
}

// ------------------------------------------------------------------------------------------------ the desk phone

function dialTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 96
  const g = c.getContext('2d')
  g.fillStyle = '#f7efdc'
  g.beginPath()
  g.arc(48, 48, 46, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#4a3b32'
  for (let i = 0; i < 10; i++) {
    const a = (0.55 + i * 0.52) * Math.PI
    g.beginPath()
    g.arc(48 + Math.cos(a) * 30, 48 + Math.sin(a) * 30, 7, 0, Math.PI * 2)
    g.fill()
  }
  g.beginPath()
  g.arc(48, 48, 10, 0, Math.PI * 2)
  g.fill()
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** A cream desk phone: a base with a dial, a cradle with the receiver on it, and a coiled cord from base to receiver. */
function makePhone() {
  const root = new THREE.Group()
  const cream = mat(CREAM, { roughness: 0.4 })
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.04, 0.13), cream)
  base.position.y = 0.02
  base.castShadow = true
  root.add(base)
  const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.03, 0.06), cream)
  shoulder.position.set(0, 0.055, -0.03)
  shoulder.castShadow = true
  root.add(shoulder)
  const dial = new THREE.Mesh(new THREE.CircleGeometry(0.035, 24), new THREE.MeshBasicMaterial({ map: dialTexture() }))
  dial.rotation.x = -Math.PI / 2 + 0.0
  dial.position.set(0, 0.0412, 0.04)
  root.add(dial)
  for (const dx of [-0.065, 0.065]) {
    const prong = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.03, 8), mat(DARK))
    prong.position.set(dx, 0.085, -0.03)
    root.add(prong)
  }
  // the receiver: a long handle with an ear piece and a mouth piece; its long side is along y
  const handset = new THREE.Group()
  const handle = new THREE.Mesh(new THREE.CapsuleGeometry(0.0125, 0.1, 4, 10), cream)
  handle.castShadow = true
  handset.add(handle)
  for (const dy of [-0.068, 0.068]) {
    const cup = new THREE.Mesh(new THREE.SphereGeometry(0.024, 12, 8), cream)
    cup.scale.set(1, 0.7, 1)
    cup.position.y = dy
    handset.add(cup)
  }
  root.add(handset)
  // the coiled cord: a helix along y, 1 long, stretched to fit between the base and the receiver
  const pts = []
  const turns = 16
  for (let i = 0; i <= turns * 12; i++) {
    const u = i / (turns * 12)
    const a = u * turns * Math.PI * 2
    pts.push(new THREE.Vector3(Math.cos(a) * 0.012, u, Math.sin(a) * 0.012))
  }
  const cord = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 12, 0.0032, 5), mat(DARK, { roughness: 0.7 }))
  cord.frustumCulled = false
  root.add(cord)
  return { root, handset, cord, dial }
}

// ------------------------------------------------------------------------------------------------ the feature

export function makeGadgets(ctx) {
  const { scene, people, fx, camera, params } = ctx
  const clocks = new Map() // lead id -> { clock, seat, appear, ring, ringing, shown, seed }
  const phones = new Map() // person id -> { phone, seat, appear, ring, seed }
  const calls = new Map() // person id -> { state: 'ring' | 'talk' | 'hang', id, service, t, talkT, ending, ok }
  const extras = new Map() // lead id -> the session's gadgets extras
  const rangSeen = new Map() // lead id -> the last rang.at handled
  const seenCalls = new Set()
  const seenDone = new Set()
  const ringing = new Map() // lead id -> { t, tapped }
  const upVec = new THREE.Vector3(0, 1, 0)
  let demoStart = 0
  let demoTick = 0
  let sparkle = 0

  const wantDemo = () => ctx.isDemo && params.has('gadgets')
  const leadIdOf = id => (id ? `lead:${id}` : 'claude')
  const personIdOf = (session, who) => (who === 'main' || !who ? leadIdOf(session) : session ? `${session}/${who}` : who)
  const burning = entry => ctx.chaos.state().some(f => f.id === entry.id && !f.out)

  // ---------------------------------------------------------------- tooltip
  const tip = document.createElement('div')
  tip.style.cssText =
    'position:fixed;z-index:45;pointer-events:none;background:#fff8ec;color:#3f332c;border:2px solid #d97757;border-radius:10px;padding:3px 9px;' +
    'font:700 12px "Segoe UI",sans-serif;box-shadow:0 4px 12px rgba(63,51,44,0.22);white-space:nowrap;display:none'
  document.body.appendChild(tip)
  const showTip = (text, x, y) => {
    if (!text) {
      tip.style.display = 'none'
      return
    }
    tip.textContent = text
    tip.style.display = 'block'
    tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 8, x + 16) + 'px'
    tip.style.top = y + 20 + 'px'
  }

  // ---------------------------------------------------------------- where things sit
  /** The room position of a spot on a desk (the desk is turned so its +z points at the sitter). */
  function deskPoint(seat, spot) {
    const a = (-seat.face * Math.PI) / 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    return new THREE.Vector3(seat.desk.x + spot.x * c + spot.z * s, seat.desk.y, seat.desk.z - spot.x * s + spot.z * c)
  }

  /** Puts a gadget at a spot, turned to face the camera (the lower-right corner of the room), not the sitter. */
  function place(obj, seat, spot) {
    obj.position.copy(deskPoint(seat, spot))
    obj.rotation.y = Math.PI / 4
  }

  // ---------------------------------------------------------------- poses
  /** Lets a feature-owned pose (`gx`) change the arms after the usual pose is worked out. Works for every kind of body. */
  function wrapPose(p) {
    if (p.gxWrapped) return
    p.gxWrapped = true
    const usual = p.pose
    p.pose = function (T, k, dt) {
      const bob = usual.call(this, T, k, dt)
      const g = this.gx
      if (g === 'phone' && this.seated && !this.walking) {
        // the receiver to the ear: right arm up, elbow bent, head tipped towards it
        T.aBx = -1.3
        T.aBz = -0.5
        T.eB = 2.3
        T.hZ = -0.15
        T.hY = 0.12
        T.hX = 0
        this.sip = 0
        this.nextSip = Math.max(this.nextSip, 3)
      } else if (g === 'startle' && !this.seated) {
        T.aAx = T.aBx = -1.5
        T.aAz = 0.55
        T.aBz = -0.55
        T.eA = T.eB = 1.1
        T.hX = -0.18
        T.lean = -0.12
      } else if (g === 'tap' && !this.seated) {
        T.aBx = -1.45
        T.aBz = 0
        T.eB = 0.25 + Math.abs(Math.sin(k * 14)) * 0.2
        T.lean = 0.22
        T.hX = 0.3
      }
      return bob
    }
  }

  // ---------------------------------------------------------------- taking the mod's word
  function take(session, x) {
    const leadId = leadIdOf(session)
    extras.set(leadId, x || {})
    for (const who of x?.phones ?? []) phoneFor(personIdOf(session, who))
    const live = new Set()
    for (const c of x?.calls ?? []) {
      live.add(c.id)
      const id = personIdOf(session, c.who)
      phoneFor(id)
      callStarted(id, c, session)
    }
    for (const d of x?.callsDone ?? []) {
      live.add(d.id)
      callDone(personIdOf(session, d.who), d, session)
    }
    // a call the mod no longer lists, with no word of its end, is over
    for (const [id, st] of calls) if (!st.ending && st.session === session && !live.has(st.id)) st.ending = true
    const r = x?.rang
    if (r && rangSeen.get(leadId) !== `${r.id}:${r.at}`) {
      rangSeen.set(leadId, `${r.id}:${r.at}`)
      if (Date.now() - r.at < RING_FRESH_MS) startRing(leadId)
    }
  }

  function apply(snapshot, sessions) {
    if (wantDemo()) return
    for (const s of sessions) take(s.id, s.state?.extras?.gadgets)
    const here = new Set(sessions.map(s => leadIdOf(s.id)))
    for (const id of [...extras.keys()]) if (!here.has(id)) extras.delete(id)
  }

  function callStarted(id, c, session) {
    if (seenCalls.has(c.id)) return
    seenCalls.add(c.id)
    const st = calls.get(id)
    if (st && st.state !== 'hang') {
      st.id = c.id
      st.service = c.service
      st.ending = false
      return
    }
    calls.set(id, { state: 'ring', id: c.id, service: c.service, t: 0, talkT: 0, ending: false, ok: true, session })
    sound('ring')
  }

  function callDone(id, d, session) {
    if (seenDone.has(d.id)) return
    seenDone.add(d.id)
    const st = calls.get(id)
    if (st && st.id === d.id) {
      st.ending = true
      st.ok = d.ok
    } else if (!seenCalls.has(d.id) && Date.now() - d.at < 15000) {
      // a call that began and ended between two updates: a quick lift all the same
      seenCalls.add(d.id)
      calls.set(id, { state: 'ring', id: d.id, service: d.service, t: 0, talkT: 0, ending: true, ok: d.ok, session })
      sound('ring')
    }
  }

  // ---------------------------------------------------------------- the alarm clock
  function nextAlarm(x) {
    let best = null
    for (const a of x?.alarms ?? []) if (typeof a.at === 'number' && (!best || a.at < best.at)) best = a
    return best
  }

  function clockFor(entry) {
    let c = clocks.get(entry.id)
    if (c && c.seat === entry.seat) return c
    if (!entry.seat?.desk) return c ?? null
    if (!c) {
      c = { clock: makeClock(), seat: null, appear: 0, seed: Math.random() * 10, shown: '' }
      scene.add(c.clock.root)
      clocks.set(entry.id, c)
    }
    c.seat = entry.seat
    place(c.clock.root, c.seat, SPOT.clock(c.seat))
    return c
  }

  function dropClock(id) {
    const c = clocks.get(id)
    if (!c) return
    scene.remove(c.clock.root)
    disposeTree(c.clock.root)
    clocks.delete(id)
  }

  function startRing(leadId) {
    if (ringing.has(leadId)) return
    const r = { t: 0, tapped: false, again: 2 }
    ringing.set(leadId, r)
    sound('alarm')
    const entry = people.get(leadId)
    if (entry) startle(entry, r)
  }

  const canStand = e => !!e && e.state === 'working' && !e.away && !!e.seat && e.p.seated && !e.p.isBusy() && !e.p.walking && !burning(e)

  /** The lead jumps up, taps the clock off and sits down again; someone who cannot get up just lets it ring. */
  function startle(entry, r) {
    if (!canStand(entry)) return
    const { p, seat } = entry
    wrapPose(p)
    entry.away = 'gadgets'
    try {
      ctx.standUp(entry)
      const near = seat.approach.clone().add(new THREE.Vector3(seat.face * 0.55, 0, 0))
      p.call(() => {
        p.gx = 'startle'
        ctx.sayText(entry, 'Oh! The alarm!')
      })
        .wait(0.9)
        .step(near, 0.4)
        .call(() => (p.gx = 'tap'))
        .wait(0.5)
        .call(() => {
          r.tapped = true
          p.gx = null
        })
        .wait(0.3)
      ctx.sitDown(entry)
    } catch {
      entry.away = null
      p.gx = null
    }
  }

  function stepClocks(dt, t) {
    for (const [leadId, x] of extras) {
      const entry = people.get(leadId)
      if (!entry?.isLead) continue
      const has = (x.alarms?.length ?? 0) > 0 || ringing.has(leadId)
      if (has && entry.seat) clockFor(entry)
    }
    for (const [id, c] of [...clocks]) {
      const entry = people.get(id)
      const x = extras.get(id)
      const r = ringing.get(id)
      const want = !!entry && entry.seat === c.seat && ((x?.alarms?.length ?? 0) > 0 || !!r)
      c.appear += ((want ? 1 : 0) - c.appear) * (1 - Math.exp(-dt * 8))
      if (!want && c.appear < 0.02) {
        dropClock(id)
        continue
      }
      const k = c.clock
      k.root.visible = !!entry?.p.root.visible
      k.root.scale.setScalar(1.15 * Math.max(0.001, c.appear))
      // the face
      const next = nextAlarm(x)
      const left = next ? next.at - Date.now() : null
      const face = r ? { text: '0:00', unit: 'wake up!' } : left === null ? { text: '--:--', unit: 'scheduled' } : countdown(left)
      const key = `${face.text}|${!!r}`
      if (key !== k.shown) {
        k.shown = key
        drawFace(k.canvas, face.text, face.unit, !!r)
        k.tex.needsUpdate = true
      }
      ringClock(c, r, dt, t)
    }
    for (const [id, r] of [...ringing]) {
      r.t += dt
      if (r.t > r.again && !r.tapped) {
        r.again += 2
        sound('alarm')
      }
      if (r.tapped || r.t > RING_MAX_S) ringing.delete(id)
    }
  }

  /** Shakes the clock, blurs its bells and throws a few sparkles while it rings; settles when it stops. */
  function ringClock(c, r, dt, t) {
    const k = c.clock
    const amount = r ? 1 : 0
    k.shake.rotation.z = amount * Math.sin(t * 70 + c.seed) * 0.05
    k.shake.position.x = amount * Math.sin(t * 83 + c.seed) * 0.003
    k.shake.position.y = amount * Math.abs(Math.sin(t * 61)) * 0.004
    k.bells.forEach((b, i) => {
      const side = i ? 1 : -1
      b.rotation.z = -side * (0.55 + amount * Math.sin(t * 55 + i * 2) * 0.22)
    })
    k.ghosts.forEach((g, i) => {
      g.material.opacity = amount * (0.35 + 0.2 * Math.sin(t * 40 + i))
      g.scale.setScalar(1 + amount * 0.25 * Math.abs(Math.sin(t * 33 + i)))
    })
    k.hammer.rotation.z = amount * Math.sin(t * 50) * 0.55
    sparkle -= dt
    if (r && sparkle <= 0) {
      sparkle = 0.12
      const at = new THREE.Vector3()
      k.root.getWorldPosition(at)
      at.y += 0.17
      fx.emit(TILE.star, at, { vel: [rnd(-0.6, 0.6), rnd(0.5, 1.1), rnd(-0.6, 0.6)], drag: 1.5, life: 0.6, size: 0.08, color: 0xffd070, additive: true })
    }
  }

  // ---------------------------------------------------------------- the phone
  function phoneFor(id) {
    if (phones.has(id)) return phones.get(id)
    const p = { phone: makePhone(), seat: null, appear: 0, seed: Math.random() * 10, wanted: true, inHand: false }
    p.phone.root.visible = false
    scene.add(p.phone.root)
    phones.set(id, p)
    return p
  }

  function dropPhone(id) {
    const ph = phones.get(id)
    if (!ph) return
    ph.phone.handset.removeFromParent()
    scene.remove(ph.phone.root)
    disposeTree(ph.phone.root)
    phones.delete(id)
  }

  /** The receiver goes to the person's hand, or back on its cradle. */
  function holdReceiver(ph, entry, inHand) {
    const h = ph.phone.handset
    if (inHand) {
      const hand = entry.p.rig.hand('B')
      if (h.parent !== hand) hand.add(h)
      h.position.set(0, -0.08, 0.04)
      h.rotation.set(0, 0, 0)
      h.scale.setScalar(HAND_SCALE)
      ph.inHand = true
    } else {
      if (h.parent !== ph.phone.root) ph.phone.root.add(h)
      h.position.set(0, 0.087, -0.03)
      h.rotation.set(0, 0, Math.PI / 2)
      h.scale.setScalar(1)
      ph.inHand = false
    }
  }

  function stepPhones(dt, t) {
    for (const [id, ph] of [...phones]) {
      const entry = people.get(id)
      if (!entry) continue
      const seat = entry.seat
      const k = ph.phone
      if (seat && seat !== ph.seat) {
        ph.seat = seat
        place(k.root, seat, SPOT.phone(seat))
      }
      const show = !!seat && entry.p.root.visible
      ph.appear += ((show ? 1 : 0) - ph.appear) * (1 - Math.exp(-dt * 6))
      k.root.visible = ph.appear > 0.02
      k.root.scale.setScalar(PHONE_SCALE * Math.max(0.001, ph.appear))
      const st = calls.get(id)
      if (st) stepCall(id, st, ph, entry, dt, t)
      else if (ph.inHand) {
        holdReceiver(ph, entry, false)
        if (entry.p.gx === 'phone') entry.p.gx = null
      }
      if (!ph.inHand) {
        // on its cradle the receiver shakes while the phone rings
        const ringingNow = st?.state === 'ring'
        k.handset.rotation.z = Math.PI / 2 + (ringingNow ? Math.sin(t * 60) * 0.06 : 0)
        k.handset.position.y = 0.087 + (ringingNow ? Math.abs(Math.sin(t * 30)) * 0.004 : 0)
      }
      stretchCord(ph)
    }
  }

  function stepCall(id, st, ph, entry, dt, t) {
    const { p } = entry
    wrapPose(p)
    st.t += dt
    if (st.state === 'ring' && st.t >= PHONE_RING_S) {
      st.state = 'talk'
      st.talkT = 0
      ctx.sayText(entry, `Calling ${st.service}…`)
    }
    if (st.state === 'talk') {
      st.talkT += dt
      const up = p.seated && !p.walking && !burning(entry)
      if (up !== ph.inHand) holdReceiver(ph, entry, up)
      if (!p.gx || p.gx === 'phone') p.gx = up ? 'phone' : null
      if (up) p.talking = Math.max(p.talking, 0.3)
      if (st.ending && st.talkT >= MIN_TALK_S) {
        st.state = 'hang'
        st.t = 0
        holdReceiver(ph, entry, false)
        if (p.gx === 'phone') p.gx = null
        if (!st.ok) ctx.sayText(entry, `No answer from ${st.service}.`)
      }
    } else if (st.state === 'hang' && st.t >= HANG_S) {
      calls.delete(id)
    }
  }

  const cordB = new THREE.Vector3()
  const cordDir = new THREE.Vector3()

  /** Stretches the coiled cord from the side of the base to the receiver, wherever the receiver is (in the phone's own space). */
  function stretchCord(ph) {
    const { root, handset, cord } = ph.phone
    root.updateMatrixWorld(true)
    handset.getWorldPosition(cordB)
    root.worldToLocal(cordB)
    cord.position.set(0.075, 0.03, 0.02)
    cordDir.subVectors(cordB, cord.position)
    const len = Math.max(0.02, cordDir.length())
    cord.quaternion.setFromUnitVectors(upVec, cordDir.normalize())
    cord.scale.set(1, len, 1)
  }

  // ---------------------------------------------------------------- the demo
  /** ?gadgets: a wake-up every 45 seconds that rings after 20, a cron job a while off, a call every 30 seconds. */
  function demoExtras(i) {
    const t = (Date.now() - demoStart) / 1000
    const cycle = Math.floor(t / DEMO_CYCLE_S)
    const phase = t - cycle * DEMO_CYCLE_S
    const wakeAt = demoStart + (cycle * DEMO_CYCLE_S + DEMO_WAKE_S) * 1000
    const alarms = []
    let rang = null
    if (i === 0) {
      alarms.push({ id: 'wakeup', kind: 'wakeup', at: wakeAt, label: 'check the deploy' })
      if (phase >= DEMO_WAKE_S) {
        alarms.length = 0
        rang = { id: `wakeup-${cycle}`, at: wakeAt, label: 'check the deploy' }
      }
      alarms.push({ id: 'job', kind: 'cron', at: demoStart + 25 * 60000, label: 'run the nightly tests' })
    } else if (i === 1) {
      alarms.push({ id: 'job2', kind: 'cron', at: demoStart + 3 * 3600000 + 5 * 60000, label: 'sync the docs' })
    }
    // a call every 30 seconds, 6 seconds long, on the lead; the first agent calls halfway between
    const calls = []
    const callsDone = []
    const spot = (who, offset, length, service) => {
      const n = Math.floor((t - offset) / DEMO_CALL_EVERY_S)
      if (n < 0) return
      const began = offset + n * DEMO_CALL_EVERY_S
      const id = `demo-${who}-${i}-${n}`
      const since = demoStart + began * 1000
      if (t - began < length) calls.push({ id, who, service, since })
      else callsDone.push({ id, who, service, ok: n % 3 !== 2, at: demoStart + (began + length) * 1000 })
    }
    spot('main', 6 + i * 7, 6, i % 2 ? 'Notion' : 'Slack')
    const helper = lastHelper(i)
    if (helper) spot(helper, 21 + i * 7, 3, 'Google Calendar')
    const phones = ['main', ...(helper ? [helper] : [])]
    return { alarms, rang, calls, callsDone, phones }
  }

  const lastHelper = i => ctx.sessions()[i]?.state?.helpers?.[0]?.id ?? null

  // ---------------------------------------------------------------- hooks
  function step(dt, t) {
    if (wantDemo()) {
      if (!demoStart) demoStart = Date.now()
      demoTick -= dt
      if (demoTick <= 0) {
        demoTick = 0.25
        ctx.sessions().forEach((s, i) => take(s.id, demoExtras(i)))
      }
    }
    stepClocks(dt, t)
    stepPhones(dt, t)
  }

  function label(entry, words) {
    const st = calls.get(entry.id)
    if (!st || st.state !== 'talk' || entry.state !== 'working') return undefined
    if (/^Needs your OK/.test(words)) return undefined
    return `On the phone · ${st.service}`
  }

  function gone(entry) {
    dropClock(entry.id)
    dropPhone(entry.id)
    calls.delete(entry.id)
    ringing.delete(entry.id)
    extras.delete(entry.id)
    rangSeen.delete(entry.id)
    if (entry.p) entry.p.gx = null
  }

  function hover(hit) {
    if (hit.person || !hit.ray) {
      showTip('', 0, 0)
      return undefined
    }
    for (const [id, c] of clocks) {
      if (!c.clock.root.visible || !hit.ray.intersectObject(c.clock.root, true).length) continue
      const x = extras.get(id)
      const next = nextAlarm(x)
      const first = (x?.alarms ?? [])[0]
      const text = next ? `Next run in ${inWords(next.at - Date.now())}: ${next.label}` : first ? `Scheduled: ${first.label}` : 'The alarm clock'
      showTip(text, hit.x, hit.y)
      return 'pointer'
    }
    for (const [id, ph] of phones) {
      if (!ph.phone.root.visible || !hit.ray.intersectObject(ph.phone.root, true).length) continue
      const st = calls.get(id)
      const name = people.get(id)?.persona?.name ?? 'Someone'
      showTip(st && st.state !== 'hang' ? `${name} is on the phone with ${st.service}` : `Desk phone: it rings when ${name} uses an MCP tool`, hit.x, hit.y)
      return 'pointer'
    }
    showTip('', 0, 0)
    return undefined
  }

  if (params.has('debug')) window.__gadgets = { clocks, phones, calls, extras, ringing, camera }
  return { apply, step, label, gone, hover }
}
