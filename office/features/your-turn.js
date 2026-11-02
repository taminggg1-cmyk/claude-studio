// The your-turn feature (see ../features.js): with many sessions in one office, the person sees at a glance which
// session waits for them. The mod (hooks/features/your-turn.ts) sends `{ waiting: 'you' | 'approve' | null, since,
// tool?, agent? }` for each session. For a lead that waits:
//
//   - a small brass bell on the desk: it glows softly when the session waits for the person ('you'), and rings
//     (swings, bright red-orange, with sparkles) when a tool call waits for an OK ('approve');
//   - the lead stands up, waves at the camera for about three seconds, says a short line and sits back down. For an
//     approval the wave comes again every 25 seconds while it lasts;
//   - the badge says "Your turn" or "Needs your OK · <tool>";
//   - while any session waits for an OK, the page title starts with "(!) ".
//
// A lead that another feature has taken away from the desk (entry.away) is left alone, but the bell stays on the desk.
// `?yourturn` on a demo page fakes it: session 0 waits for you and session 1 for an OK to Bash, a few seconds in.

import * as THREE from 'three'
import { TILE } from '../fx.js'

const WAVE_SECONDS = 3
const REWAVE_SECONDS = 25
const DEMO_DELAY = 4
const PREFIX = '(!) '
const BRASS = 0xc9a05a
const RING = 0xff5a2a

const rnd = (a, b) => a + Math.random() * (b - a)

/** A bell standing on the desk: a dome, a knob and a clapper in a group that swings, on a small base. */
function makeBell() {
  const root = new THREE.Group()
  const metal = new THREE.MeshStandardMaterial({ color: BRASS, metalness: 0.7, roughness: 0.35, emissive: 0x000000 })
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.015, 20), new THREE.MeshStandardMaterial({ color: 0x55504c, roughness: 0.6 }))
  base.position.y = 0.008
  root.add(base)
  const swing = new THREE.Group()
  swing.position.y = 0.17
  root.add(swing)
  const profile = [
    [0.0, 0.0],
    [0.075, 0.0],
    [0.07, 0.025],
    [0.058, 0.07],
    [0.04, 0.11],
    [0.02, 0.14],
    [0.0, 0.15],
  ].map(([x, y]) => new THREE.Vector2(x, y - 0.15))
  const dome = new THREE.Mesh(new THREE.LatheGeometry(profile, 24), metal)
  dome.castShadow = true
  swing.add(dome)
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), metal)
  knob.position.y = 0.005
  swing.add(knob)
  const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 8), metal)
  clapper.position.y = -0.16
  swing.add(clapper)
  // a soft glow disc on the desk that shows when the bell glows
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(0.16, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
  )
  glow.rotation.x = -Math.PI / 2
  glow.position.y = 0.02
  root.add(glow)
  return { root, swing, metal, glow }
}

export function makeYourTurn(ctx) {
  const { scene, people, fx, camera } = ctx
  const bells = new Map() // lead id -> { bell, seed }
  const waits = new Map() // lead id -> { waiting, since, tool, agent }
  const waved = new Map() // lead id -> { key, at }: the wait the lead last waved for, and when
  const demoStart = {}
  let demoClock = 0
  let sparkle = 0

  const wantDemo = () => ctx.isDemo && ctx.params.has('yourturn')
  const leadIdOfSession = id => (id ? `lead:${id}` : 'claude')
  const demoSince = i => (demoStart[i] ??= Date.now())

  function apply(snapshot, sessions) {
    waits.clear()
    sessions.forEach((s, i) => {
      let x = s.state?.extras?.['your-turn']
      if (wantDemo() && demoClock > DEMO_DELAY) {
        if (i === 0) x = { waiting: 'you', since: demoSince(0) }
        if (i === 1) x = { waiting: 'approve', since: demoSince(1), tool: 'Bash' }
      }
      if (x && (x.waiting === 'you' || x.waiting === 'approve')) waits.set(leadIdOfSession(s.id), x)
    })
    setTitle([...waits.values()].some(x => x.waiting === 'approve'))
  }

  /** Puts "(!) " in front of the page title while a tool call waits for an OK, and takes it off again after. */
  function setTitle(on) {
    try {
      const t = document.title
      if (on && !t.startsWith(PREFIX)) document.title = PREFIX + t
      else if (!on && t.startsWith(PREFIX)) document.title = t.slice(PREFIX.length)
    } catch {
      // no document: nothing to do
    }
  }

  const burning = entry => ctx.chaos.state().some(f => f.id === entry.id && !f.out)

  function bellFor(entry) {
    let b = bells.get(entry.id)
    if (b) return b
    const seat = entry.seat
    if (!seat?.desk) return null
    const bell = makeBell()
    // on the far corner of the desk, a little towards the sitter
    bell.root.position.set(seat.desk.x + seat.face * 0.08, seat.desk.y, seat.desk.z + 0.46)
    scene.add(bell.root)
    b = { bell, seed: Math.random() * 10 }
    bells.set(entry.id, b)
    return b
  }

  function dropBell(id) {
    const b = bells.get(id)
    if (!b) return
    scene.remove(b.bell.root)
    b.bell.root.traverse(o => {
      o.geometry?.dispose()
      if (o.material) o.material.dispose?.()
    })
    bells.delete(id)
  }

  /** Stands up, waves at the camera, says a line and sits back down. */
  function wave(entry, x) {
    const { p } = entry
    const line = x.waiting === 'approve' ? `Need your OK for ${x.tool || 'a tool'}` : 'Your turn!'
    const yaw = Math.atan2(camera.position.x - p.root.position.x, camera.position.z - p.root.position.z)
    entry.away = 'your-turn'
    ctx.standUp(entry)
    p.turn(yaw, 0.35)
      .wait(0.3)
      .call(() => {
        p.action = 'wave'
        ctx.sayText(entry, line)
      })
      .wait(WAVE_SECONDS)
      .call(() => (p.action = null))
    ctx.sitDown(entry)
  }

  function step(dt, t) {
    if (wantDemo()) demoClock += dt
    sparkle -= dt
    for (const [id, entry] of people) {
      if (!entry.isLead) continue
      const x = waits.get(id)
      if (!x) continue
      const b = bellFor(entry)
      if (!b) continue
      tick(b, x, dt, t)
      const w = waved.get(id)
      const key = `${x.waiting}:${x.since}:${x.tool ?? ''}`
      const due = !w || w.key !== key || (x.waiting === 'approve' && Date.now() - w.at > REWAVE_SECONDS * 1000)
      const idle = !entry.p.current && entry.p.queue.length === 0
      if (due && idle && entry.state === 'working' && !entry.away && entry.p.seated && entry.seat && !burning(entry)) {
        waved.set(id, { key, at: Date.now() })
        try {
          wave(entry, x)
        } catch {
          entry.away = null
        }
      }
    }
    for (const id of [...bells.keys()]) if (!waits.has(id)) dropBell(id)
    for (const id of [...waved.keys()]) if (!waits.has(id)) waved.delete(id)
  }

  /** Glow softly for 'you'; swing, turn bright red-orange and throw sparkles for 'approve'. */
  function tick(b, x, dt, t) {
    const { metal, glow, swing } = b.bell
    if (x.waiting === 'approve') {
      swing.rotation.z = Math.sin(t * 16 + b.seed) * 0.32 * (0.6 + 0.4 * Math.sin(t * 3))
      metal.emissive.setHex(RING)
      metal.emissiveIntensity = 0.7 + 0.3 * Math.sin(t * 8)
      metal.color.setHex(0xe8743a)
      glow.material.color.setHex(RING)
      glow.material.opacity = 0.5 + 0.2 * Math.sin(t * 8)
      if (sparkle <= 0) {
        sparkle = 0.18
        const at = new THREE.Vector3()
        b.bell.root.getWorldPosition(at)
        at.y += 0.12
        fx.emit(TILE.star, at, {
          vel: [rnd(-0.5, 0.5), rnd(0.5, 1.1), rnd(-0.5, 0.5)],
          drag: 1.5,
          life: 0.7,
          size: 0.1,
          color: 0xff8a4a,
          additive: true,
        })
      }
    } else {
      swing.rotation.z *= Math.max(0, 1 - dt * 6)
      metal.emissive.setHex(0xffc860)
      metal.emissiveIntensity = 0.25 + 0.2 * Math.sin(t * 2.2 + b.seed)
      metal.color.setHex(BRASS)
      glow.material.color.setHex(0xffd98a)
      glow.material.opacity = 0.22 + 0.1 * Math.sin(t * 2.2 + b.seed)
    }
  }

  function label(entry) {
    if (!entry.isLead) return undefined
    const x = waits.get(entry.id)
    if (!x) return undefined
    return x.waiting === 'approve' ? `Needs your OK · ${x.tool || 'a tool'}` : 'Your turn'
  }

  function gone(entry) {
    dropBell(entry.id)
    waits.delete(entry.id)
    waved.delete(entry.id)
    if (![...waits.values()].some(x => x.waiting === 'approve')) setTitle(false)
  }

  return { apply, step, label, gone }
}
