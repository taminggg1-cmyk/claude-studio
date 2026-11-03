// The mailroom feature (see ../features.js for the hooks a feature may answer): a session's git work as outgoing post.
//
//   - Every commit puts an envelope on the desk of that session's Claude: it drops onto a little stack by her screen.
//   - A push: she stands up, picks up the stack, walks it to the red postbox by the door, posts the letters one by one
//     and walks back to her desk.
//   - A pull request goes into the postbox as a parcel with a red bow, with confetti.
//   - Clicking the postbox lists each session's commits that are not pushed yet.
//
// When Claude cannot get up (she is putting out a fire, or has no desk), the letters fly to the postbox by themselves.
// The mod's `mailroom` extras say what happened (hooks/features/mailroom.ts): { waiting, letters: [{ sha, subject,
// branch, repo, at }], events: [{ id, kind: 'commit' | 'push' | 'pr', n, repo, branch?, subject?, number?, title?,
// outside? }], commits, pushes, prs }. Each event id is acted on once; the events already there when the window first
// sees a session are not played again.
//
// Demo: ?mail on a demo page makes up three commits, a push and a pull request for the first session every 50 seconds
// (with ?sessions=2&mail the second session has two letters waiting). ?mail=list also opens the postbox's list.

import * as THREE from 'three'
import { brass, cyl, mat, put, rbox, sph } from '../kit.js'
import { TILE } from '../fx.js'

/** The postbox stands against the left wall just past the door; Claude stands in front of it to post. */
const BOX = { x: -8.62, z: -1.72 }
const STAND = { x: -7.98, z: -1.72 }
/** Just inside the slot, where letters vanish. */
const SLOT = new THREE.Vector3(BOX.x + 0.12, 0.975, BOX.z)
/** The most envelopes a desk stack shows (more letters still count; the list says how many). */
const MOST_ON_DESK = 12
/** How long a trip waits for a busy Claude before the letters go by themselves (seconds). */
const FREE_WAIT = 25
/** Seconds between two letters going into the slot. */
const POST_GAP = 0.24
const DEMO_CYCLE = 50
const DEMO_COMMITS = ['Add the parser', 'Write tests for the parser', 'Fix an off-by-one in the lexer']

const rnd = (a, b) => a + Math.random() * (b - a)
const ease = u => u * u * (3 - 2 * u)
const short = (text, max) => {
  const one = String(text ?? '').replace(/\s+/g, ' ').trim()
  return one.length > max ? one.slice(0, max - 1) + '…' : one
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
/** "just now", "5 min ago", "3 h ago", "2 days ago". */
function ago(at) {
  const mins = Math.round((Date.now() - at) / 60000)
  if (!Number.isFinite(mins) || mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const h = Math.round(mins / 60)
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`
}

const CSS = `
.mail-card { position: fixed; z-index: 35; width: min(340px, calc(100vw - 24px)); max-height: min(70vh, 520px); overflow: auto;
  padding: 11px 14px 12px; border-radius: 16px; background: var(--card, rgba(255, 251, 245, 0.94));
  border: 1px solid var(--card-line, rgba(140, 110, 80, 0.16)); border-top: 3px solid #c4473b;
  box-shadow: var(--shadow, 0 6px 18px rgba(110, 80, 50, 0.16)); color: var(--ink, #4a3b31); font-size: 12.5px; line-height: 1.4;
  backdrop-filter: blur(6px); animation: mail-in 0.22s ease both; }
.mail-card .top { display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 14px; }
.mail-card .top .x { margin-left: auto; border: 0; background: transparent; color: var(--muted, #8a7766); font: 700 18px/1 "Segoe UI", sans-serif;
  cursor: pointer; padding: 0 2px; }
.mail-card .sub { color: var(--muted, #8a7766); font-size: 11.5px; margin-top: 1px; }
.mail-card .session { margin-top: 9px; padding-top: 8px; border-top: 1px dashed var(--card-line, rgba(140, 110, 80, 0.25)); }
.mail-card .who { font-weight: 800; color: var(--tag, #c8775a); }
.mail-card .who span { color: var(--muted, #8a7766); font-weight: 600; }
.mail-card .group { display: flex; justify-content: space-between; align-items: center; margin-top: 5px; font-weight: 700; }
.mail-card .group b { background: #c4473b; color: #fff; border-radius: 9px; padding: 0 7px; font-size: 11px; }
.mail-card ul { list-style: none; margin: 2px 0 0; padding: 0; }
.mail-card li { display: flex; gap: 7px; align-items: baseline; padding: 1px 0; }
.mail-card li code { font: 600 11px Consolas, ui-monospace, monospace; color: #a95f45; }
.mail-card li .s { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mail-card li .ago { color: var(--muted, #8a7766); font-size: 11px; white-space: nowrap; }
.mail-card .none { color: #5c7557; font-weight: 600; margin-top: 3px; }
.mail-card .more, .mail-card .sent { color: var(--muted, #8a7766); font-size: 11.5px; margin-top: 3px; }
.mail-tip { position: fixed; z-index: 45; pointer-events: none; background: #fff8ec; color: #3f332c; border: 2px solid #c4473b;
  border-radius: 10px; padding: 3px 9px; font: 700 12px "Segoe UI", sans-serif; box-shadow: 0 4px 12px rgba(63, 51, 44, 0.22);
  white-space: nowrap; display: none; }
@keyframes mail-in { from { opacity: 0; transform: translateY(6px) scale(0.98); } to { opacity: 1; transform: none; } }
`

// ------------------------------------------------------------------------------------------------ the things

/** An envelope seen from above: cream paper, the flap's fold lines and a red wax seal. */
function envelopeTexture() {
  const c = document.createElement('canvas')
  c.width = 160
  c.height = 104
  const g = c.getContext('2d')
  g.fillStyle = '#fbf4e6'
  g.fillRect(0, 0, 160, 104)
  g.fillStyle = '#f1e2c6'
  g.beginPath()
  g.moveTo(0, 0)
  g.lineTo(80, 60)
  g.lineTo(160, 0)
  g.closePath()
  g.fill()
  g.strokeStyle = '#d6bd96'
  g.lineWidth = 3
  g.beginPath()
  g.moveTo(2, 2)
  g.lineTo(80, 60)
  g.lineTo(158, 2)
  g.stroke()
  g.strokeRect(1.5, 1.5, 157, 101)
  g.fillStyle = '#c0453a'
  g.beginPath()
  g.arc(80, 58, 11, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#e07a6c'
  g.beginPath()
  g.arc(76.5, 54.5, 3.5, 0, Math.PI * 2)
  g.fill()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** The small cream plate on the postbox. */
function plateTexture() {
  const c = document.createElement('canvas')
  c.width = 192
  c.height = 120
  const g = c.getContext('2d')
  g.fillStyle = '#f4ead6'
  g.fillRect(0, 0, 192, 120)
  g.strokeStyle = '#c9a05a'
  g.lineWidth = 6
  g.strokeRect(3, 3, 186, 114)
  g.fillStyle = '#3f332c'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = '700 25px "Segoe UI", sans-serif'
  g.fillText('OUTGOING', 96, 40)
  g.font = '800 34px "Segoe UI", sans-serif'
  g.fillText('MAIL', 96, 80)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** A round red pillar box on a dark plinth, its slot and plate facing into the room. `body` squashes as post goes in. */
function makePostbox(scene) {
  const g = new THREE.Group()
  g.position.set(BOX.x, 0, BOX.z)
  g.rotation.y = Math.PI / 2 // local +z (its front) looks into the room
  scene.add(g)
  const body = new THREE.Group()
  g.add(body)
  const red = mat(0xc4473b, { roughness: 0.48 })
  const redDeep = mat(0xa5362d, { roughness: 0.5 })
  const ink = mat(0x2d2724, { roughness: 0.7 })
  put(g, cyl(0.235, 0.255, 0.08, 28), ink, 0, 0.04, 0)
  put(body, cyl(0.19, 0.19, 1.0, 32), red, 0, 0.58, 0)
  put(body, cyl(0.205, 0.205, 0.07, 32), redDeep, 0, 1.06, 0)
  put(body, cyl(0.215, 0.208, 0.04, 32), red, 0, 1.115, 0)
  put(body, sph(0.2, 28, 14), red, 0, 1.13, 0, { s: [1, 0.55, 1] })
  put(body, rbox(0.21, 0.035, 0.05, 0.012), ink, 0, 0.97, 0.172, { cast: false })
  put(body, rbox(0.25, 0.025, 0.07, 0.01), redDeep, 0, 1.006, 0.182)
  put(body, rbox(0.2, 0.34, 0.012, 0.006), redDeep, 0, 0.45, 0.181, { cast: false })
  put(body, sph(0.014, 10, 8), brass(), 0.065, 0.5, 0.19, { cast: false })
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.1), new THREE.MeshStandardMaterial({ map: plateTexture(), roughness: 0.6 }))
  plate.position.set(0, 0.835, 0.186)
  body.add(plate)
  return { group: g, body, wobble: 0, phase: 0 }
}

/** A brown paper parcel tied with string, with a red bow on top. */
function makeParcel() {
  const g = new THREE.Group()
  put(g, rbox(0.24, 0.15, 0.19, 0.012), mat(0xc39668, { roughness: 0.85 }), 0, 0, 0)
  const string = mat(0xf4eee4, { roughness: 0.8 })
  put(g, rbox(0.246, 0.156, 0.02, 0.004), string, 0, 0, 0, { cast: false })
  put(g, rbox(0.02, 0.156, 0.196, 0.004), string, 0, 0, 0, { cast: false })
  put(g, rbox(0.08, 0.004, 0.055, 0.002), mat(0xfbf7ee), 0.065, 0.077, 0.05, { cast: false })
  const bow = mat(0xd9453d, { roughness: 0.5 })
  put(g, sph(0.026, 10, 8), bow, -0.022, 0.085, 0, { s: [1.3, 0.55, 0.8], cast: false })
  put(g, sph(0.026, 10, 8), bow, 0.022, 0.085, 0, { s: [1.3, 0.55, 0.8], cast: false })
  return g
}

export function makeMailroom(ctx) {
  const { scene, camera, people, fx, params, v3, aisleZ, standUp, sitDown, sayText } = ctx
  const demo = !!ctx.isDemo && params.has('mail')

  const style = document.createElement('style')
  style.textContent = CSS
  document.head.appendChild(style)
  const tip = document.createElement('div')
  tip.className = 'mail-tip'
  document.body.appendChild(tip)

  const box = makePostbox(scene)
  const envGeo = new THREE.BoxGeometry(0.2, 0.008, 0.13)
  const envMat = new THREE.MeshStandardMaterial({ map: envelopeTexture(), roughness: 0.85 })
  const stackY = i => 0.0045 + i * 0.0085

  /** An instanced pile of envelopes, each turned a little, showing `count` of them. */
  function makePile() {
    const mesh = new THREE.InstancedMesh(envGeo, envMat, MOST_ON_DESK)
    const m4 = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    for (let i = 0; i < MOST_ON_DESK; i++) {
      q.setFromAxisAngle(up, Math.sin(i * 2.7) * 0.16)
      m4.compose(new THREE.Vector3(Math.sin(i * 1.9) * 0.008, stackY(i), Math.cos(i * 2.3) * 0.008), q, new THREE.Vector3(1, 1, 1))
      mesh.setMatrixAt(i, m4)
    }
    mesh.count = 0
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    return mesh
  }

  // ---------------------------------------------------------------- per session
  /**
   * session id -> { id, extras, seen (event ids acted on), queue (drops and trips waiting their turn), trip (the one
   * running), count (envelopes on the desk), drops (envelopes still falling), nextDropAt, desk (group), pile }
   */
  const mail = new Map()
  /** Envelopes and parcels in the air: { obj, from, to, t, dur, arc, spin, shrink, done }. */
  const fliers = []
  let clock = 0
  let lastSessions = []
  let demoStart = null

  const leadOf = id => people.get(id ? `lead:${id}` : 'claude')
  const burning = entry => ctx.chaos.state().some(f => f.id === entry.id && !f.out)
  const free = e => !!e && e.state === 'working' && !e.away && !!e.seat && e.p.seated && !e.p.isBusy() && !burning(e)

  function sessionState(id) {
    let st = mail.get(id)
    if (st) return st
    const desk = new THREE.Group()
    const pile = makePile()
    desk.add(pile)
    desk.visible = false
    scene.add(desk)
    st = { id, extras: null, seen: null, queue: [], trip: null, count: 0, drops: 0, nextDropAt: 0, desk, pile, seat: null }
    mail.set(id, st)
    return st
  }

  function dropSession(st) {
    if (st.trip) endTrip(st.trip)
    st.desk.removeFromParent()
    mail.delete(st.id)
  }

  /** Puts the session's pile on its lead's desk (beside the screen, away from the mug), or hides it. */
  function placePile(st, lead) {
    const seat = lead?.seat ?? null
    if (seat !== st.seat) {
      st.seat = seat
      if (seat) {
        st.desk.position.set(seat.desk.x, seat.desk.y, seat.desk.z)
        st.desk.rotation.y = -seat.face * (Math.PI / 2)
        st.pile.position.set(seat.index % 2 ? -0.34 : 0.34, 0, -0.06)
      }
    }
    st.pile.count = Math.max(0, Math.min(MOST_ON_DESK, st.count))
    st.desk.visible = !!seat && st.pile.count > 0
  }

  /** Where the top of a session's pile is, in the room. */
  function pileTop(st, n = st.count) {
    st.desk.updateMatrixWorld(true)
    return st.pile.localToWorld(new THREE.Vector3(0, stackY(Math.min(n, MOST_ON_DESK)), 0))
  }

  // ---------------------------------------------------------------- things in the air
  function launch(obj, from, to, dur, { arc = 0, spin = 0, shrink = 1, turnTo = null, done = null } = {}) {
    obj.position.copy(from)
    scene.add(obj)
    fliers.push({ obj, from: from.clone(), to: to.clone(), t: 0, dur, arc, spin, shrink, turnTo, startYaw: obj.rotation.y, done })
  }

  function stepFliers(dt) {
    for (let i = fliers.length - 1; i >= 0; i--) {
      const f = fliers[i]
      f.t += dt
      const u = Math.min(1, f.t / f.dur)
      const e = ease(u)
      f.obj.position.lerpVectors(f.from, f.to, e)
      f.obj.position.y += f.arc * 4 * u * (1 - u)
      if (f.spin) f.obj.rotation.y += f.spin * dt
      else if (f.turnTo !== null) f.obj.rotation.y = f.startYaw + (f.turnTo - f.startYaw) * e
      // vanishing into the slot: shrink over the last third
      if (f.shrink !== 1) f.obj.scale.setScalar(1 + (f.shrink - 1) * Math.max(0, (u - 0.66) / 0.34))
      if (u >= 1) {
        fliers.splice(i, 1)
        f.obj.removeFromParent()
        try {
          f.done?.()
        } catch (err) {
          console.warn('studio: mailroom flier failed:', err)
        }
      }
    }
  }

  const envelope = () => new THREE.Mesh(envGeo, envMat)

  function sparkle(at, n = 6) {
    for (let k = 0; k < n; k++)
      fx.emit(TILE.star, at, { vel: [rnd(-0.4, 0.4), rnd(0.3, 0.8), rnd(-0.4, 0.4)], gravity: 0.8, life: 0.7, size: 0.07, color: 0xffe08a, additive: true, spin: rnd(0, 3), spinRate: rnd(-4, 4) })
  }

  /** The postbox takes something: it squashes a little and springs back. */
  const gulp = (amount = 1) => (box.wobble = Math.min(1.6, box.wobble + amount))

  // ---------------------------------------------------------------- a commit: an envelope drops onto the desk
  function drop(st, lead, item) {
    if (!st.seat || !lead) {
      st.count++
      return
    }
    const top = pileTop(st, st.count + st.drops)
    const env = envelope()
    env.rotation.y = st.desk.rotation.y + rnd(-0.4, 0.4)
    st.drops++
    launch(env, top.clone().add(new THREE.Vector3(0, 0.75, 0)), top, 0.6, {
      turnTo: st.desk.rotation.y + rnd(-0.15, 0.15),
      done: () => {
        st.drops = Math.max(0, st.drops - 1)
        st.count++
        sparkle(top, 5)
        // she reads out the last commit of a burst, if nothing else is about to happen
        const quiet = !st.queue.length && !st.drops && !st.trip
        if (quiet && item.subject && lead.state === 'working' && !lead.away && people.get(lead.id) === lead) sayText(lead, `Committed: ${short(item.subject, 40)}`)
      },
    })
  }

  // ---------------------------------------------------------------- a push or a pull request: a trip to the postbox
  /** A trip: { st, entry, letters, parcel, outside, branch, phase, carry, toPost, postClock, parcelGone, inAir, ended } */
  function newTrip(st, item) {
    return {
      st,
      entry: null,
      letters: item.letters,
      parcel: item.parcel ?? null,
      outside: !!item.outside,
      branch: item.branch || '',
      phase: 'waiting',
      carry: null,
      toPost: 0,
      postClock: 0,
      parcelGone: false,
      inAir: 0,
      ended: false,
    }
  }

  /** The letters (and parcel) she holds out in front of her, like the paperwork box. */
  function makeCarry(trip, letters) {
    const g = new THREE.Group()
    const pile = makePile()
    pile.count = letters
    g.add(pile)
    g.position.set(0, 0.8, 0.27)
    g.userData.pile = pile
    if (trip.parcel) addParcelTo(g, false)
    return g
  }

  function addParcelTo(carry, pop) {
    const parcel = makeParcel()
    parcel.position.y = stackY(carry.userData.pile.count) + 0.08
    carry.add(parcel)
    carry.userData.parcel = parcel
    if (pop) {
      parcel.scale.setScalar(0.01)
      parcel.userData.pop = 0
    }
  }

  function lineFor(trip) {
    const n = trip.letters
    const commits = plural(n, 'commit', 'commits')
    const pr = trip.parcel
    if (trip.outside) return `Your push went out: ${commits} sent!`
    if (pr && n) return `Posted! ${commits} and pull request #${pr.number}.`
    if (pr) return `Pull request #${pr.number} is in the post!`
    return trip.branch ? `Posted! ${commits} pushed to ${trip.branch}.` : `Posted! ${commits} pushed.`
  }

  function startTrip(st, entry, item) {
    const trip = newTrip(st, item)
    trip.entry = entry
    st.trip = trip
    const { p, seat } = entry
    const ax = seat.approach.x
    entry.away = 'mailroom'
    trip.phase = 'out'
    standUp(entry)
    p.call(() => {
      // she picks the letters up off the desk
      const take = Math.min(MOST_ON_DESK, Math.max(trip.letters, 0))
      st.count = Math.max(0, st.count - trip.letters)
      trip.carry = makeCarry(trip, take)
      trip.toPost = take
      p.root.add(trip.carry)
      p.action = 'carry'
    })
      .walk([v3(ax, aisleZ), v3(STAND.x, aisleZ), v3(STAND.x, STAND.z)])
      .turn(-Math.PI / 2, 0.3)
      .call(() => {
        trip.phase = 'post'
        trip.postClock = POST_GAP
      })
      .until(() => trip.phase === 'posted', 14)
      .call(() => {
        trip.phase = 'back'
        dropCarry(trip)
        p.action = null
        if (trip.parcel) p.cheer = Math.max(p.cheer, 2.4)
        sayText(entry, lineFor(trip))
      })
      .wait(trip.parcel ? 2.2 : 1.4)
      .walk([v3(STAND.x, aisleZ), v3(ax, aisleZ), seat.approach])
    sitDown(entry)
    p.call(() => endTrip(trip))
  }

  /** No one can carry them: the letters fly from the desk to the postbox by themselves. */
  function startFlight(st, lead, item) {
    const trip = newTrip(st, item)
    trip.entry = lead && people.get(lead.id) === lead ? lead : null
    st.trip = trip
    trip.phase = 'fly'
    trip.toPost = Math.min(MOST_ON_DESK, Math.max(trip.letters, 0))
    trip.postClock = 0
  }

  function dropCarry(trip) {
    trip.carry?.removeFromParent()
    trip.carry = null
  }

  function endTrip(trip) {
    if (trip.ended) return
    trip.ended = true
    dropCarry(trip)
    const e = trip.entry
    if (e && e.away === 'mailroom') e.away = null
    if (e && e.p.action === 'carry') e.p.action = null
    if (trip.st.trip === trip) trip.st.trip = null
  }

  /** Letters go into the slot one at a time, then the parcel; when all are in, the trip is 'posted'. */
  function postStep(trip, dt) {
    const fromHands = trip.phase === 'post'
    trip.postClock += dt
    const gap = fromHands ? POST_GAP : POST_GAP * 1.4
    while (trip.toPost > 0 && trip.postClock >= gap) {
      trip.postClock -= gap
      trip.toPost--
      let from
      if (fromHands && trip.carry) {
        const pile = trip.carry.userData.pile
        pile.count = Math.max(0, pile.count - 1)
        from = pile.localToWorld(new THREE.Vector3(0, stackY(pile.count), 0))
        if (trip.carry.userData.parcel) trip.carry.userData.parcel.position.y = stackY(pile.count) + 0.08
      } else if (trip.st.seat && trip.st.count > 0) {
        trip.st.count--
        from = pileTop(trip.st)
      } else from = new THREE.Vector3(BOX.x + 0.9, 1.6, BOX.z + rnd(-0.3, 0.3))
      const env = envelope()
      env.rotation.set(rnd(-0.3, 0.3), rnd(0, Math.PI), 0)
      trip.inAir++
      launch(env, from, SLOT, fromHands ? 0.5 : 1.5, {
        arc: fromHands ? 0.22 : 1.1,
        turnTo: Math.PI / 2,
        shrink: 0.25,
        done: () => {
          trip.inAir--
          gulp(0.35)
        },
      })
    }
    if (trip.toPost > 0 || trip.parcelGone) {
      if (!trip.toPost && trip.parcelGone && !trip.inAir) trip.phase = trip.phase === 'fly' ? 'flown' : 'posted'
      return
    }
    if (trip.parcel) {
      if (trip.inAir || trip.postClock < gap) return
      trip.parcelGone = true
      let parcel = trip.carry?.userData.parcel
      const from = parcel ? parcel.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(BOX.x + 0.7, 1.7, BOX.z)
      parcel?.removeFromParent()
      parcel = makeParcel()
      parcel.rotation.y = Math.PI / 2
      trip.inAir++
      launch(parcel, from, SLOT.clone().add(new THREE.Vector3(0.04, 0.02, 0)), fromHands ? 0.75 : 1.4, {
        arc: fromHands ? 0.3 : 0.9,
        shrink: 0.12,
        done: () => {
          trip.inAir--
          gulp(1.2)
          fx.confetti(new THREE.Vector3(BOX.x + 0.1, 1.45, BOX.z), 90)
        },
      })
      return
    }
    if (!trip.inAir) trip.phase = trip.phase === 'fly' ? 'flown' : 'posted'
  }

  function stepTrip(trip, dt) {
    const e = trip.entry
    if (trip.phase === 'out' || trip.phase === 'post' || trip.phase === 'back') {
      // sent away, on fire, or gone: the trip ends where it is (the letters already went in, or are lost in the post)
      if (!e || people.get(e.id) !== e || e.away !== 'mailroom' || e.state === 'leaving' || !e.seat) return endTrip(trip)
    }
    if (trip.phase === 'post' || trip.phase === 'fly') postStep(trip, dt)
    if (trip.phase === 'flown') {
      if (e && people.get(e.id) === e && e.state === 'working') sayText(e, trip.parcel ? lineFor(trip) : 'Off they go!')
      endTrip(trip)
    }
    // a parcel added on the way pops into her hands
    const parcel = trip.carry?.userData.parcel
    if (parcel && parcel.userData.pop !== undefined && parcel.userData.pop < 1) {
      parcel.userData.pop = Math.min(1, parcel.userData.pop + dt / 0.35)
      parcel.scale.setScalar(Math.max(0.01, ease(parcel.userData.pop)))
    }
  }

  // ---------------------------------------------------------------- what the mod says
  function enqueue(st, ev) {
    if (ev.kind === 'commit') st.queue.push({ kind: 'drop', subject: ev.subject })
    else if (ev.kind === 'push') {
      // a push that moved refs but carried none of her letters still sends one (her own work went out)
      const letters = Number(ev.n) > 0 ? Number(ev.n) : ev.outside ? 0 : 1
      if (letters) st.queue.push({ kind: 'trip', letters, parcel: null, outside: !!ev.outside, branch: ev.branch })
    } else if (ev.kind === 'pr') {
      const pr = { number: Number(ev.number) || 0, title: ev.title || '', repo: ev.repo || '' }
      // the parcel joins a trip on its way, or one still waiting, when there is one
      const t = st.trip
      if (t && !t.parcel && !t.parcelGone && (t.phase === 'out' || t.phase === 'post' || t.phase === 'fly')) {
        t.parcel = pr
        if (t.carry) addParcelTo(t.carry, true)
        return
      }
      const last = st.queue[st.queue.length - 1]
      if (last?.kind === 'trip' && !last.parcel) last.parcel = pr
      else st.queue.push({ kind: 'trip', letters: 0, parcel: pr })
    }
  }

  /** The mailroom extras of a session (or, with ?mail, made-up ones for the first two demo sessions). */
  function extrasOf(s, index) {
    if (demo) {
      if (demoStart === null) demoStart = clock
      if (index === 0) return demoExtras(clock - demoStart)
      if (index === 1)
        return {
          waiting: 2,
          letters: [
            { sha: '5e5e5e5', subject: 'Draft the landing page', branch: 'redesign', repo: 'website', at: Date.now() - 26 * 60000 },
            { sha: '6f6f6f6', subject: 'Warmer colours for the header', branch: 'redesign', repo: 'website', at: Date.now() - 9 * 60000 },
          ],
          events: [],
          commits: 2,
          pushes: 0,
          prs: 0,
        }
    }
    return s.state?.extras?.mailroom
  }

  /** The made-up first session: commits at 5, 11 and 17 seconds into each cycle, a push at 24, a pull request at 34. */
  function demoExtras(t) {
    const cycle = Math.floor(t / DEMO_CYCLE)
    const u = t % DEMO_CYCLE
    const events = []
    let letters = []
    ;[5, 11, 17].forEach((at, k) => {
      if (u < at) return
      const subject = DEMO_COMMITS[k]
      events.push({ id: `demo-${cycle}-c${k}`, kind: 'commit', n: 1, repo: 'my-app', branch: 'main', subject })
      letters.push({ sha: ['1a2b3c4', '5d6e7f8', '9a0b1c2'][k], subject, branch: 'main', repo: 'my-app', at: Date.now() - (u - at) * 1000 })
    })
    if (u >= 24) {
      events.push({ id: `demo-${cycle}-p`, kind: 'push', n: 3, repo: 'my-app', branch: 'main' })
      letters = []
    }
    if (u >= 34) events.push({ id: `demo-${cycle}-r`, kind: 'pr', n: 1, repo: 'my-app', number: 12 + cycle, title: 'Add the parser' })
    return { waiting: letters.length, letters, events, commits: cycle * 3 + letters.length + (u >= 24 ? 3 : 0), pushes: cycle + (u >= 24 ? 1 : 0), prs: cycle + (u >= 34 ? 1 : 0) }
  }

  function ingest(sessions) {
    lastSessions = sessions
    const here = new Set()
    sessions.forEach((s, i) => {
      here.add(s.id)
      const ex = extrasOf(s, i)
      const st = sessionState(s.id)
      st.extras = ex ?? null
      st.name = s.name
      if (!ex || !Array.isArray(ex.events)) return
      if (st.seen === null) {
        // first sight: what is waiting is already on the desk; old moments are not played again
        st.count = Math.min(MOST_ON_DESK, Number(ex.waiting) || 0)
      } else for (const ev of ex.events) if (ev && ev.id && !st.seen.has(ev.id)) enqueue(st, ev)
      st.seen = new Set(ex.events.map(ev => ev?.id))
    })
    for (const st of [...mail.values()]) if (!here.has(st.id)) dropSession(st)
    if (card.isConnected && cardKey() !== shownKey) renderCard()
  }

  // ---------------------------------------------------------------- the list behind the postbox
  const card = document.createElement('div')
  card.className = 'mail-card'
  let cardAt = { x: 0, y: 0 }
  let closedAt = -1
  /** What the open list shows, so an update that changes nothing does not redraw it (and lose its scroll). */
  let shownKey = ''
  const cardKey = () =>
    JSON.stringify([
      Math.floor(Date.now() / 30000),
      lastSessions.map(s => {
        const ex = mail.get(s.id)?.extras
        return [s.id, s.name, leadOf(s.id)?.persona?.name, ex?.waiting, ex?.letters, ex?.commits, ex?.pushes, ex?.prs]
      }),
    ])

  const el = (tag, cls, text) => {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (text !== undefined) e.textContent = text
    return e
  }

  function renderCard() {
    shownKey = cardKey()
    const scroll = card.scrollTop
    card.replaceChildren()
    const top = el('div', 'top')
    top.append(el('span', '', '📮 Outgoing mail'))
    const x = el('button', 'x', '×')
    x.title = 'Close'
    x.addEventListener('click', closeCard)
    top.append(x)
    card.append(top, el('div', 'sub', 'Commits each session has made and not pushed yet.'))
    if (!lastSessions.length) card.append(el('div', 'more', 'No sessions are in the office.'))
    for (const s of lastSessions) {
      const st = mail.get(s.id)
      const ex = st?.extras
      const lead = leadOf(s.id)
      const box = el('div', 'session')
      box.style.setProperty('--tag', lead?.persona?.color || '#c8775a')
      const who = el('div', 'who', lead?.persona?.name || 'Claude')
      who.append(el('span', '', ` · ${s.name || 'studio'}`))
      box.append(who)
      if (!ex) box.append(el('div', 'more', 'No mail news from this session yet.'))
      else {
        const letters = Array.isArray(ex.letters) ? ex.letters : []
        const waiting = Number(ex.waiting) || 0
        if (!waiting) box.append(el('div', 'none', 'Nothing waiting: everything is pushed.'))
        const groups = new Map()
        for (const l of letters) {
          const key = `${l.repo || '?'} · ${l.branch || '?'}`
          if (!groups.has(key)) groups.set(key, [])
          groups.get(key).push(l)
        }
        for (const [key, list] of groups) {
          const head = el('div', 'group', key)
          head.append(el('b', '', String(list.length)))
          const ul = el('ul')
          // newest first: what was just made is what you look for
          for (const l of list.slice(-6).reverse()) {
            const li = el('li')
            li.append(el('code', '', l.sha || '·······'), el('span', 's', l.subject || '(no message)'), el('span', 'ago', ago(l.at)))
            li.title = l.subject || ''
            ul.append(li)
          }
          box.append(head, ul)
          if (list.length > 6) box.append(el('div', 'more', `and ${plural(list.length - 6, 'older one', 'older ones')}`))
        }
        if (waiting > letters.length) box.append(el('div', 'more', `${plural(waiting - letters.length, 'more letter', 'more letters')} not listed`))
        const sent = []
        if (ex.commits) sent.push(plural(ex.commits, 'commit', 'commits'))
        if (ex.pushes) sent.push(plural(ex.pushes, 'push', 'pushes'))
        if (ex.prs) sent.push(plural(ex.prs, 'pull request', 'pull requests'))
        if (sent.length) box.append(el('div', 'sent', `This session so far: ${sent.join(' · ')}`))
      }
      card.append(box)
    }
    placeCard()
    card.scrollTop = scroll
  }

  function placeCard() {
    const w = card.offsetWidth || 340
    const h = card.offsetHeight || 200
    card.style.left = Math.max(12, Math.min(window.innerWidth - w - 12, cardAt.x + 18)) + 'px'
    card.style.top = Math.max(12, Math.min(window.innerHeight - h - 12, cardAt.y - 40)) + 'px'
  }

  function openCard(x, y) {
    cardAt = { x, y }
    document.body.appendChild(card)
    renderCard()
  }

  function closeCard() {
    if (!card.isConnected) return
    card.remove()
    closedAt = performance.now()
  }

  // a press anywhere else closes the list (a press on the postbox itself closes it too, and the click then does not
  // open it again)
  window.addEventListener(
    'pointerdown',
    e => {
      if (card.isConnected && !card.contains(e.target)) closeCard()
    },
    true,
  )
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeCard()
  })

  const onBox = hit => !hit.person && hit.ray.intersectObject(box.group, true).length > 0

  function showTip(text, x, y) {
    if (!text) {
      tip.style.display = 'none'
      return
    }
    tip.textContent = text
    tip.style.display = 'block'
    tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 8, x + 16) + 'px'
    tip.style.top = y + 20 + 'px'
  }

  function tipText() {
    let n = 0
    for (const st of mail.values()) n += Number(st.extras?.waiting) || 0
    return n ? `Outgoing mail · ${plural(n, 'commit', 'commits')} not pushed yet · click for the list` : 'Outgoing mail · everything is pushed · click for the list'
  }

  // ?mail=look: look at the postbox; ?mail=list: and open the list (for checking the page)
  if (demo && (params.get('mail') === 'list' || params.get('mail') === 'look'))
    setTimeout(() => {
      ctx.focusOn?.({ p: { root: { position: new THREE.Vector3(-7.4, 0, -0.6) } } }, Number(params.get('zoom')) || 2.2)
      if (params.get('mail') === 'list')
        setTimeout(() => {
          const v = new THREE.Vector3(BOX.x, 1.2, BOX.z).project(camera)
          openCard(((v.x + 1) / 2) * window.innerWidth, ((1 - v.y) / 2) * window.innerHeight)
        }, 1600)
    }, 1500)

  let sinceDemo = 0

  return {
    apply(snapshot, sessions) {
      ingest(sessions)
    },

    step(dt) {
      clock += dt
      // a still demo page gets no updates: the made-up mail moves on by itself
      if (demo && (sinceDemo += dt) > 0.5) {
        sinceDemo = 0
        ingest(ctx.sessions())
      }
      stepFliers(dt)
      for (const st of mail.values()) {
        const lead = leadOf(st.id)
        if (st.trip) stepTrip(st.trip, dt)
        if (!st.trip) {
          const next = st.queue[0]
          if (next?.kind === 'drop') {
            if (clock >= st.nextDropAt) {
              st.queue.shift()
              drop(st, lead, next)
              st.nextDropAt = clock + 0.4
            }
          } else if (next?.kind === 'trip') {
            // the letters still falling land first
            if (!st.drops) {
              if (free(lead)) {
                st.queue.shift()
                startTrip(st, lead, next)
              } else if (!lead || !lead.seat || (next.waited = (next.waited ?? 0) + dt) > FREE_WAIT) {
                st.queue.shift()
                startFlight(st, lead, next)
              }
            }
          } else if (!st.drops) st.count = Math.min(MOST_ON_DESK, Number(st.extras?.waiting) || 0)
        }
        placePile(st, lead)
      }
      // the postbox squashes and springs back
      if (box.wobble > 0.001) {
        box.phase += dt * 22
        box.wobble *= Math.exp(-dt * 4.5)
        const s = Math.sin(box.phase) * 0.045 * box.wobble
        box.body.scale.set(1 + s * 0.6, 1 - s, 1 + s * 0.6)
      } else box.body.scale.set(1, 1, 1)
    },

    label(entry) {
      if (entry.away !== 'mailroom' || entry.state !== 'working') return
      const trip = [...mail.values()].find(st => st.trip?.entry === entry)?.trip
      return trip?.parcel && !trip.letters ? 'Sending a pull request' : 'Posting the mail'
    },

    gone(entry) {
      for (const st of mail.values()) if (st.trip?.entry === entry) endTrip(st.trip)
    },

    click(hit) {
      if (!onBox(hit)) return undefined
      if (performance.now() - closedAt < 400) return true // that press just closed it
      showTip('', 0, 0)
      openCard(hit.x, hit.y)
      return true
    },

    hover(hit) {
      if (!onBox(hit)) {
        showTip('', 0, 0)
        return ''
      }
      showTip(tipText(), hit.x, hit.y)
      return 'pointer'
    },
  }
}
