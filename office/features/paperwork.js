// The paperwork feature (see ../features.js for the hooks a feature may answer). When Claude Code compacts a session's
// conversation, that session's Claude picks up a box of papers, carries it to the paper shredder by the right-hand
// wall and feeds the papers in. While she does, the context strip on the token rack drains. Then she stretches, says
// she is done, and walks back to her desk. The mod's `paperwork` extras say when a compaction runs and ends:
// { state: 'running' | 'done', at, done?, before?, after? } (see hooks/features/paperwork.ts).
//
// ?paperwork on a demo page fakes a compaction for the first session every 40 seconds.

import * as THREE from 'three'
import { P, cyl, group, mat, put, rbox } from '../kit.js'
import { TILE } from '../fx.js'

/** The shredder stands against the right-hand wall; the person stands in front of it, on the open floor by the aisle. */
const SHREDDER = { x: 8.35, z: -1.6 }
const STAND = { x: 7.45, z: -1.6 }
/** Seconds spent feeding papers in, and the longest to wait for the compaction to end after that starts. */
const FEED = 4.2
const MAX_WAIT = 10
const LINE = 'All filed. Fresh start!'
const DEMO_EVERY = 40
const DEMO_LONG = 11
const rnd = (a, b) => a + Math.random() * (b - a)

/** The shredder: a cabinet with a slot in its lid, and a bin below with an open front where the strips drop. */
function makeShredder(scene) {
  const g = group(scene, SHREDDER.x, 0, SHREDDER.z, -Math.PI / 2) // its front looks toward -x, into the room
  const body = mat(0x6d7a84, { roughness: 0.45, metalness: 0.35 })
  const dark = mat(0x2b2624, { roughness: 0.7 })
  put(g, rbox(0.56, 0.46, 0.34, 0.03), mat(P.oakLight ?? 0xd9bf9a, { roughness: 0.6 }), 0, 0.23, 0) // the bin
  put(g, rbox(0.46, 0.3, 0.02, 0.01), dark, 0, 0.23, 0.172, { cast: false }) // its open front, dark inside
  put(g, rbox(0.6, 0.3, 0.38, 0.04), body, 0, 0.62, 0) // the shredder head
  put(g, rbox(0.62, 0.04, 0.4, 0.02), mat(0x4d575f, { roughness: 0.4, metalness: 0.4 }), 0, 0.79, 0) // lid
  put(g, rbox(0.4, 0.012, 0.045, 0.004), dark, 0, 0.805, 0, { cast: false }) // the slot
  put(g, rbox(0.14, 0.02, 0.012, 0.004), mat(0x7fe3a8, { emissive: 0x3fbf78, emissiveIntensity: 0.8 }), 0.2, 0.68, 0.192, { cast: false }) // light
  put(g, cyl(0.016, 0.016, 0.03, 10), mat(0x1b1817), -0.22, 0.68, 0.19, { rx: Math.PI / 2, cast: false }) // knob
  for (const sx of [-0.24, 0.24]) put(g, cyl(0.025, 0.025, 0.04, 10), dark, sx, 0.02, 0.1) // feet
  return g
}

/** A cardboard box heaped with paper, sized to be held in front of the chest. The papers shrink as they are fed in. */
function makeBox() {
  const g = new THREE.Group()
  const card = mat(0xb98e5c, { roughness: 0.85 })
  put(g, rbox(0.3, 0.2, 0.26, 0.012), card, 0, 0, 0)
  put(g, rbox(0.2, 0.03, 0.01, 0.004), mat(0xe9d3a8), 0, 0.02, 0.134, { cast: false }) // a label
  const papers = new THREE.Group()
  papers.position.set(0, 0.1, 0)
  g.add(papers)
  for (let i = 0; i < 5; i++) {
    const sheet = put(papers, rbox(0.24, 0.01, 0.18, 0.002), mat(0xfbf7ee, { roughness: 0.9 }), rnd(-0.015, 0.015), 0.012 + i * 0.016, rnd(-0.015, 0.015), { cast: false })
    sheet.rotation.y = rnd(-0.25, 0.25)
  }
  g.userData.papers = papers
  g.visible = false
  return g
}

export function makePaperwork(ctx) {
  const { scene, world, people, fx, params, v3, aisleZ, standUp, sitDown, sayText } = ctx
  makeShredder(scene)
  const jobs = new Map() // person id -> the trip to the shredder
  const seen = new Map() // session id -> the `at` of the last compaction acted on
  let clock = 0
  let demoAt = null
  // the rack hold: while set, the context strip shows this value instead of the real reading
  let hold = null // { from, to, start, dur }

  const lead = s => [...people.values()].find(e => e.isLead && e.info.session === s.id && e.state !== 'leaving')
  const burning = entry => ctx.chaos.state().some(f => f.id === entry.id && !f.out)

  /** The compaction a session reports (or, with ?paperwork, a made-up one for the first session). */
  function extrasOf(s, index) {
    if (params.has('paperwork') && ctx.isDemo && index === 0) {
      if (demoAt === null || clock - demoAt.start > DEMO_EVERY) demoAt = { start: clock, at: Date.now() }
      const age = clock - demoAt.start
      if (age < 6) return undefined // quiet at first
      const done = age > 6 + DEMO_LONG
      return { state: done ? 'done' : 'running', at: demoAt.at, done: done ? demoAt.at + (6 + DEMO_LONG) * 1000 : undefined, before: 160000, after: 24000 }
    }
    return s.state?.extras?.paperwork
  }

  function start(entry, ex) {
    const { p, seat } = entry
    const ax = seat.approach.x
    const box = makeBox()
    p.root.add(box)
    box.position.set(0, 0.78, 0.3)
    const job = { entry, at: ex.at, ex, box, phase: 'out', fed: 0, feedStart: 0, ended: false, particle: 0 }
    jobs.set(entry.id, job)
    entry.away = 'paperwork'
    standUp(entry)
    p.call(() => {
      box.visible = true
      p.action = 'carry'
    })
      .walk([v3(ax, aisleZ), v3(STAND.x, aisleZ), v3(STAND.x, STAND.z)])
      .turn(Math.PI / 2, 0.3)
      .call(() => {
        job.phase = 'feed'
        job.feedStart = clock
        const now = world.rack.reading().context
        const from = Number.isFinite(now) ? now : 70
        const ratio = job.ex.before > 0 && job.ex.after >= 0 ? job.ex.after / job.ex.before : 0.1
        hold = { from, to: Math.max(0, Math.min(from * ratio, from - 15, from * 0.8)), start: clock, dur: FEED + 1.5 }
      })
      .until(() => job.phase === 'fed', MAX_WAIT + 8)
      .call(() => {
        job.phase = 'stretch'
        box.visible = false
        p.action = 'stretch'
        sayText(entry, LINE)
      })
      .wait(2.3)
      .call(() => {
        p.action = null
        job.phase = 'back'
      })
      .walk([v3(STAND.x, aisleZ), v3(ax, aisleZ), seat.approach])
    sitDown(entry)
    p.call(() => end(job))
  }

  function end(job) {
    if (job.ended) return
    job.ended = true
    job.box.removeFromParent()
    if (job.entry.p.action === 'carry' || job.entry.p.action === 'stretch') job.entry.p.action = null
    jobs.delete(job.entry.id)
    if (!jobs.size) hold = null // the next real reading takes over
  }

  /** Papers going in at the slot, and strips coming out of the bin. */
  function shred(job, dt) {
    job.particle += dt * 38
    for (; job.particle >= 1; job.particle--) {
      fx.emit(TILE.confetti, { x: SHREDDER.x - 0.02 + rnd(-0.03, 0.03), y: 0.82, z: SHREDDER.z + rnd(-0.18, 0.18) }, {
        vel: [rnd(-0.1, 0.1), rnd(0.2, 0.5), rnd(-0.2, 0.2)],
        gravity: 1.8,
        life: 0.5,
        size: 0.06,
        color: 0xffffff,
        spin: rnd(0, 3),
        spinRate: rnd(-6, 6),
      })
      fx.emit(TILE.confetti, { x: SHREDDER.x - 0.27, y: rnd(0.3, 0.42), z: SHREDDER.z + rnd(-0.2, 0.2) }, {
        vel: [rnd(-0.5, -0.1), 0, rnd(-0.1, 0.1)],
        gravity: 2.4,
        life: 0.7,
        size: 0.04,
        color: 0xf2eee4,
        spin: rnd(0, 3),
        spinRate: rnd(-8, 8),
      })
    }
  }

  /** Shows the drained value on the context strip (the five-hour strip keeps its real reading). */
  function drain() {
    if (!hold) return
    const u = Math.min(1, (clock - hold.start) / hold.dur)
    const e = u * u * (3 - 2 * u)
    world.rack.set(hold.from + (hold.to - hold.from) * e, world.rack.reading().fiveHour)
  }

  return {
    apply(snapshot, sessions) {
      sessions.forEach((s, i) => {
        const ex = extrasOf(s, i)
        if (!ex) return
        const entry = lead(s)
        const job = entry && jobs.get(entry.id)
        if (job && ex.at === job.at) {
          job.ex = ex
          return
        }
        if (ex.state !== 'running' || seen.get(s.id) === ex.at) return
        seen.set(s.id, ex.at)
        if (!entry || entry.state !== 'working' || entry.away || !entry.seat || !entry.p.seated || burning(entry) || jobs.has(entry.id)) return
        start(entry, ex)
      })
      drain()
    },

    step(dt) {
      clock += dt
      for (const job of [...jobs.values()]) {
        const { entry } = job
        if (entry.away !== 'paperwork' || entry.state === 'leaving' || !entry.seat) {
          // they were sent away or left: drop the trip
          end(job)
          continue
        }
        if (job.phase === 'feed') {
          const spent = clock - job.feedStart
          shred(job, dt)
          job.box.userData.papers.scale.y = Math.max(0.05, 1 - spent / FEED)
          job.box.userData.papers.position.y = 0.1 + Math.min(1, spent / FEED) * -0.06
          const finished = job.ex.state === 'done' || spent >= MAX_WAIT
          if (spent >= FEED && finished) job.phase = 'fed'
        }
      }
      drain()
    },

    label(entry) {
      if (entry.away === 'paperwork' && entry.state === 'working') return 'Filing paperwork'
    },

    gone(entry) {
      const job = jobs.get(entry.id)
      if (job) end(job)
    },
  }
}
