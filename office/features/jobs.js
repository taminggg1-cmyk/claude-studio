// The jobs feature (see ../features.js for the hooks a feature may answer): long and background shell commands as
// little machines by the person's desk.
//
//   - While a command runs for more than 6 seconds (a background command or a monitor at once), a small cosy build-bot
//     stands on the floor at the outer end of that person's desk, away from the walking paths: a walnut base, a pastel
//     body (sage for a command, dusty blue for a background command, lavender for a monitor), brass posts, a print head
//     that slides to and fro over a growing print (a monitor has a lens that looks about and a turning dish instead),
//     blinking lights and a status lamp on top. It grows in with a small pop.
//   - Hovering over it shows the command and how long it has run.
//   - When the job ends: a green lamp, a small puff and a 'ding' when it went well, a red lamp and a 'buzz' when it
//     failed (a warm white lamp when nobody knows: it was stopped). Then it folds away after 8 seconds.
//   - At most 3 machines for one person; a small "+N" tag on the last says how many more run.
//   - A background job of an agent who has left (or of anyone with no desk) stands by their lead's desk.
//
// The mod's `jobs` extras say what runs (hooks/features/jobs.ts): { jobs: [{ id, who, kind: 'shell' | 'background' |
// 'monitor', label, since }], done: [{ id, who, ok: true | false | null, at }] }, `who` being 'main' or an agent's id.
//
// Demo: ?jobs on a demo page (best with ?still=2) fakes a dev server that runs on, a long test run, a lint, a monitor
// and a background command that fails, again every 40 seconds.

import * as THREE from 'three'
import { P, brass, cyl, mat, put, rbox, sph } from '../kit.js'
import { TILE } from '../fx.js'

/** A command that ends sooner than this never gets a machine (seconds). */
const SHOW_AFTER = 6
/** How long a finished machine stays before it folds away (seconds). */
const FOLD_AFTER = 8
const MOST_PER_DESK = 3
/** The machines' size (1 = about knee-high to a person). */
const SIZE = 1.15
const DEMO_CYCLE = 40
const BODY = { shell: P.sage, background: P.dustyBlue, monitor: P.lavender }
const LAMP = { running: 0xffb347, ok: 0x58d68d, fail: 0xe5534b, ended: 0xfff1d0 }
const LEDS = [0x7fe0b0, 0xffc28a, 0x9fd0ff]

const ease = u => u * u * (3 - 2 * u)
/** Overshoots a little before it settles: the pop of a machine growing in. */
const popIn = u => {
  const c = 1.9
  return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2)
}
const short = (text, max) => {
  const one = String(text ?? '').replace(/\s+/g, ' ').trim()
  return one.length > max ? one.slice(0, max - 1) + '…' : one
}
/** "40 s", "3 min 5 s", "2 h 10 min". */
function howLong(ms) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ${s % 60} s`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}
const sound = name => window.dispatchEvent(new CustomEvent('studio:sound', { detail: { name } }))

const CSS = `
.job-tip { position: fixed; z-index: 45; pointer-events: none; background: #fff8ec; color: #3f332c; border: 2px solid #9cb0bb;
  border-radius: 10px; padding: 4px 10px 5px; font: 600 12px "Segoe UI", sans-serif; box-shadow: 0 4px 12px rgba(63, 51, 44, 0.22);
  max-width: min(420px, calc(100vw - 24px)); display: none; }
.job-tip b { display: block; font: 600 11.5px Consolas, ui-monospace, monospace; color: #6b4a36; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; }
.job-tip span { color: #8a7766; font-size: 11.5px; }
`

/** A small cream pill with brown words, for the "+N" tag over a desk's last machine. */
function pillTexture(words) {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 64
  const g = c.getContext('2d')
  g.fillStyle = '#fff8ec'
  g.strokeStyle = '#9cb0bb'
  g.lineWidth = 6
  g.beginPath()
  g.roundRect(4, 4, 120, 56, 28)
  g.fill()
  g.stroke()
  g.fillStyle = '#6b4a36'
  g.font = '800 38px "Segoe UI", sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(words, 64, 35)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** One machine: the meshes, and the parts that move. Its front faces local +z. */
function makeMachine(kind) {
  const g = new THREE.Group()
  const walnut = mat(P.oakDark, { roughness: 0.55 })
  const body = mat(BODY[kind] ?? P.sage, { roughness: 0.7 })
  for (const [x, z] of [[-0.12, -0.1], [0.12, -0.1], [-0.12, 0.1], [0.12, 0.1]]) put(g, sph(0.018, 10, 8), brass(), x, 0.016, z)
  put(g, rbox(0.3, 0.05, 0.26, 0.02), walnut, 0, 0.055, 0)
  put(g, rbox(0.28, 0.15, 0.24, 0.045), body, 0, 0.155, 0)
  // the front panel with its three little lights
  put(g, rbox(0.17, 0.07, 0.012, 0.006), mat(P.boucle, { roughness: 0.5 }), -0.02, 0.16, 0.121, { cast: false })
  const leds = LEDS.map((c, i) => {
    const m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.3, roughness: 0.4 })
    put(g, sph(0.011, 8, 6), m, -0.07 + i * 0.045, 0.16, 0.129, { cast: false })
    return m
  })
  put(g, cyl(0.016, 0.016, 0.012, 14), brass(), 0.1, 0.16, 0.124, { rx: Math.PI / 2, cast: false })
  // the bed, the brass posts and the gantry
  put(g, rbox(0.22, 0.014, 0.18, 0.006), mat(P.travertine, { roughness: 0.5 }), 0, 0.237, 0)
  for (const x of [-0.13, 0.13]) put(g, cyl(0.009, 0.009, 0.2, 8), brass(), x, 0.33, -0.06)
  put(g, rbox(0.28, 0.022, 0.022, 0.008), brass(), 0, 0.43, -0.06)
  const head = new THREE.Group()
  head.position.set(0, 0.43, -0.06)
  g.add(head)
  let print = null
  let dish = null
  if (kind === 'monitor') {
    // a lens that looks about, and a small turning dish on top
    put(head, rbox(0.06, 0.05, 0.05, 0.015), mat(P.terracotta, { roughness: 0.6 }), 0, -0.01, 0.035)
    put(head, cyl(0.02, 0.02, 0.02, 16), mat(0x2d2a2e, { roughness: 0.15, metalness: 0.3 }), 0, -0.01, 0.065, { rx: Math.PI / 2 })
    dish = new THREE.Group()
    dish.position.set(0.13, 0.44, -0.06)
    g.add(dish)
    put(dish, cyl(0.004, 0.004, 0.05, 6), brass(), 0, 0.025, 0)
    put(dish, new THREE.SphereGeometry(0.035, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), mat(P.boucle, { side: THREE.DoubleSide }), 0, 0.06, 0.012, { rx: -1.2 })
  } else {
    put(head, rbox(0.06, 0.05, 0.06, 0.015), mat(P.terracotta, { roughness: 0.6 }), 0, -0.005, 0.05)
    put(head, new THREE.ConeGeometry(0.012, 0.03, 10), brass(), 0, -0.045, 0.05, { rx: Math.PI })
    print = put(g, cyl(0.03, 0.035, 0.07, 16), mat(P.apricot, { roughness: 0.75 }), 0, 0.244, 0.0)
    print.geometry = print.geometry.clone()
    print.geometry.translate(0, 0.035, 0)
  }
  // the status lamp on its brass cup
  put(g, cyl(0.022, 0.016, 0.014, 14), brass(), -0.13, 0.44, -0.06)
  const lamp = new THREE.MeshStandardMaterial({ color: LAMP.running, emissive: LAMP.running, emissiveIntensity: 1, roughness: 0.3, transparent: true, opacity: 0.95 })
  put(g, sph(0.028, 14, 10), lamp, -0.13, 0.468, -0.06, { cast: false })
  return { group: g, head, print, dish, lamp, leds }
}

export function makeJobs(ctx) {
  const { scene, camera, people, fx, params } = ctx
  const demo = !!ctx.isDemo && params.has('jobs')

  const style = document.createElement('style')
  style.textContent = CSS
  document.head.appendChild(style)
  const tip = document.createElement('div')
  tip.className = 'job-tip'
  document.body.appendChild(tip)
  // a move of the pointer hides the tip first; hover() shows it again while the pointer is on a machine (a feature
  // before this one that answers hover would otherwise leave it standing)
  window.addEventListener('pointermove', () => (tip.style.display = 'none'), true)

  /** session id + job id -> { key, sid, id, who, kind, label, since, ended, ok, endedAt, born, m (the machine), at } */
  const jobs = new Map()
  /** The "+N" tags, one per desk that has more jobs than machines. */
  const tags = new Map()
  const tagTextures = new Map()
  let clock = 0
  let hovered = null
  let tipAt = { x: 0, y: 0 }
  let demoStart = null
  let demoWho = null
  let sinceDemo = 0

  const leadIdOf = sid => (sid ? `lead:${sid}` : 'claude')
  const agentIdOf = (sid, who) => (sid ? `${sid}/${who}` : who)
  const here = entry => entry && entry.seat && entry.state !== 'leaving' && !entry.friend

  /** The desk a job's machine stands by: its person's, else their lead's. */
  function seatOf(job) {
    const lead = people.get(leadIdOf(job.sid))
    const person = job.who === 'main' ? lead : people.get(agentIdOf(job.sid, job.who))
    if (here(person)) return { seat: person.seat, person }
    if (here(lead)) return { seat: lead.seat, person: lead }
    return null
  }

  /**
   * Where machine number `slot` stands by a desk: at the end of the desk away from the other row, out of everyone's way.
   * Behind a back row it stands further out, so the desk and its screen do not hide it from the camera.
   */
  function slotSpot(seat, slot) {
    const out = Math.sign(seat.z - seat.pod.z) || 1
    const along = [0.16, -0.22, -0.6][slot] ?? 0
    return new THREE.Vector3(seat.desk.x + seat.face * along, 0, seat.z + out * (out > 0 ? 0.97 : 1.42))
  }

  // ---------------------------------------------------------------- what the mod says
  function ingest(sessions) {
    const seen = new Set()
    sessions.forEach((s, i) => {
      const ex = extrasOf(s, i)
      if (!ex) return
      const list = Array.isArray(ex.jobs) ? ex.jobs : []
      const done = new Map((Array.isArray(ex.done) ? ex.done : []).filter(d => d?.id).map(d => [d.id, d]))
      for (const j of list) {
        if (!j?.id) continue
        const key = `${s.id}|${j.id}`
        seen.add(key)
        const job = jobs.get(key)
        if (!job) jobs.set(key, { key, sid: s.id, id: j.id, who: String(j.who || 'main'), kind: j.kind, label: short(j.label, 140), since: Number(j.since) || Date.now(), ended: false, ok: null, m: null })
        else if (!job.ended) Object.assign(job, { who: String(j.who || 'main'), kind: j.kind, label: short(j.label, 140) })
      }
      for (const job of jobs.values()) {
        if (job.sid !== s.id || job.ended || seen.has(job.key)) continue
        const d = done.get(job.id)
        end(job, d ? (d.ok === true ? true : d.ok === false ? false : null) : null)
      }
    })
    // a session that left takes its jobs with it
    const ids = new Set(sessions.map(s => s.id))
    for (const job of jobs.values()) if (!ids.has(job.sid) && !job.ended) end(job, null)
  }

  /** A job ended: the machine lights up (or, never shown, simply goes). */
  function end(job, ok) {
    job.ended = true
    job.ok = ok
    job.endedAt = clock
    if (!job.m) {
      jobs.delete(job.key)
      return
    }
    const at = job.m.group.position.clone().setY(0.5)
    if (ok === true) {
      sound('ding')
      for (let i = 0; i < 7; i++)
        fx.emit(TILE.steam, at, { vel: [(Math.random() - 0.5) * 0.4, 0.35 + Math.random() * 0.25, (Math.random() - 0.5) * 0.4], drag: 1.5, life: 1.1, size: 0.08, grow: 0.2, alpha: 0.75, color: 0xffffff })
      for (let i = 0; i < 4; i++) fx.emit(TILE.star, at, { vel: [(Math.random() - 0.5) * 0.6, 0.6 + Math.random() * 0.4, (Math.random() - 0.5) * 0.6], gravity: 1.4, life: 0.8, size: 0.06, color: 0x8ff0b0, additive: true })
    } else if (ok === false) {
      sound('buzz')
      for (let i = 0; i < 5; i++) fx.emit(TILE.smoke, at, { vel: [(Math.random() - 0.5) * 0.2, 0.3 + Math.random() * 0.2, (Math.random() - 0.5) * 0.2], drag: 1, life: 1.4, size: 0.08, grow: 0.22, alpha: 0.55, color: 0x8a817a })
    }
  }

  function extrasOf(s, index) {
    if (demo && index === 0) return demoExtras(s)
    return s.state?.extras?.jobs
  }

  /**
   * The made-up first session: a dev server running all along; each 40-second cycle a test run of the first agent
   * (1 s to 19 s, passes), a background `docker compose up` that fails (4 s to 16 s), a monitor (6 s to 30 s) and a
   * lint (8 s to 26 s): from 14 s to 16 s Claude has four jobs, so her desk shows "+1".
   */
  function demoExtras(s) {
    if (demoStart === null) demoStart = Date.now()
    const t = (Date.now() - demoStart) / 1000
    const cycle = Math.floor(t / DEMO_CYCLE)
    const u = t % DEMO_CYCLE
    const cycleAt = demoStart + cycle * DEMO_CYCLE * 1000
    if (demoWho?.cycle !== cycle) demoWho = { cycle, who: s.state?.helpers?.[0]?.id ?? 'main' }
    const jobs = [{ id: 'demo-dev', who: 'main', kind: 'background', label: 'npm run dev', since: demoStart }]
    const done = []
    const plan = [
      { id: 'test', who: demoWho.who, kind: 'shell', label: 'npm test -- --coverage', from: 1, to: 19, ok: true },
      { id: 'docker', who: 'main', kind: 'background', label: 'docker compose up db', from: 4, to: 16, ok: false },
      { id: 'watch', who: 'main', kind: 'monitor', label: 'Watch the CI run for main', from: 6, to: 30, ok: true },
      { id: 'lint', who: 'main', kind: 'shell', label: 'npm run lint -- --max-warnings 0', from: 8, to: 26, ok: true },
    ]
    for (const p of plan) {
      const id = `demo-${cycle}-${p.id}`
      if (u >= p.from && u < p.to) jobs.push({ id, who: p.who, kind: p.kind, label: p.label, since: cycleAt + p.from * 1000 })
      else if (u >= p.to && u < p.to + 15) done.push({ id, who: p.who, ok: p.ok, at: cycleAt + p.to * 1000 })
    }
    return { jobs, done }
  }

  // ---------------------------------------------------------------- machines in the room
  function grow(job, spot) {
    job.m = makeMachine(job.kind)
    job.born = clock
    job.phase = Math.random() * 6
    job.m.group.position.copy(spot)
    job.m.group.rotation.y = Math.PI / 4 // the front towards the camera
    job.m.group.scale.setScalar(0.001)
    job.m.group.traverse(c => (c.userData.jobKey = job.key))
    scene.add(job.m.group)
    if (clock > 3) sound('pop')
  }

  function drop(job) {
    if (job.m) {
      job.m.group.removeFromParent()
      job.m.lamp.dispose()
      for (const l of job.m.leds) l.dispose()
    }
    if (hovered === job) hovered = null
    jobs.delete(job.key)
  }

  function tagFor(seatKey, n) {
    let tag = tags.get(seatKey)
    if (!tag) {
      tag = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }))
      tag.scale.set(0.22, 0.11, 1)
      tag.renderOrder = 3
      scene.add(tag)
      tags.set(seatKey, tag)
    }
    if (tag.userData.n !== n) {
      if (!tagTextures.has(n)) tagTextures.set(n, pillTexture(`+${n}`))
      tag.material.map = tagTextures.get(n)
      tag.material.needsUpdate = true
      tag.userData.n = n
    }
    return tag
  }

  function place(dt) {
    const now = Date.now()
    // the jobs worth a machine, by desk, oldest first
    const byDesk = new Map()
    for (const job of jobs.values()) {
      const shown = job.m || (!job.ended && (job.kind !== 'shell' || now - job.since > SHOW_AFTER * 1000))
      if (!shown) continue
      const where = seatOf(job)
      if (!where) {
        if (job.m) job.m.group.visible = false
        continue
      }
      const key = where.seat.index
      if (!byDesk.has(key)) byDesk.set(key, { seat: where.seat, list: [] })
      byDesk.get(key).list.push(job)
    }
    const tagged = new Set()
    for (const [key, { seat, list }] of byDesk) {
      // machines already standing keep their place before newer ones
      list.sort((a, b) => (a.m ? a.born : Infinity) - (b.m ? b.born : Infinity) || a.since - b.since)
      list.forEach((job, slot) => {
        if (slot >= MOST_PER_DESK) {
          if (job.m) job.m.group.visible = false
          return
        }
        const spot = slotSpot(seat, slot)
        if (!job.m) grow(job, spot)
        job.m.group.visible = true
        job.m.group.position.lerp(spot, 1 - Math.exp(-dt * 4))
      })
      const more = list.length - MOST_PER_DESK
      if (more > 0) {
        const tag = tagFor(key, more)
        tag.position.copy(slotSpot(seat, MOST_PER_DESK - 1)).setY(0.74)
        tag.visible = true
        tagged.add(key)
      }
    }
    for (const [key, tag] of tags) if (!tagged.has(key)) tag.visible = false
  }

  function animate(job, dt) {
    const m = job.m
    if (!m) return
    const age = clock - job.born
    let s = popIn(Math.min(1, age / 0.45))
    if (job.ended) {
      const fold = (clock - job.endedAt - FOLD_AFTER) / 0.5
      if (fold >= 1) return drop(job)
      if (fold > 0) s *= 1 - ease(fold)
    }
    m.group.scale.setScalar(Math.max(0.001, s * SIZE))
    const t = clock + job.phase
    if (!job.ended) {
      const speed = job.kind === 'background' ? 1.4 : 2.6
      m.head.position.x = Math.sin(t * speed) * 0.085
      if (m.print) m.print.scale.y = 0.08 + ((t * 0.12) % 1) * 0.92
      if (m.dish) m.dish.rotation.y += dt * 1.6
      m.leds.forEach((l, i) => (l.emissiveIntensity = Math.sin(t * (5 + i * 1.7) + i * 2) > 0.2 ? 1.6 : 0.15))
      m.lamp.emissiveIntensity = 1 + 0.7 * Math.max(0, Math.sin(t * 3))
    } else {
      const colour = job.ok === true ? LAMP.ok : job.ok === false ? LAMP.fail : LAMP.ended
      m.lamp.color.setHex(colour)
      m.lamp.emissive.setHex(colour)
      // a quick blink, then a steady light
      const since = clock - job.endedAt
      m.lamp.emissiveIntensity = since < 1.2 ? (Math.sin(since * 18) > 0 ? 2.2 : 0.4) : 1.6
      m.leds.forEach(l => (l.emissiveIntensity = 0.1))
    }
  }

  // ---------------------------------------------------------------- the hover hint
  function tipText(job) {
    const owner = people.get(job.who === 'main' ? leadIdOf(job.sid) : agentIdOf(job.sid, job.who))
    const name = owner?.persona?.name || (job.who === 'main' ? 'Claude' : '')
    const kind = job.kind === 'monitor' ? 'Watching' : job.kind === 'background' ? 'Running in the background' : 'Running'
    let state
    if (!job.ended) state = `${kind} for ${howLong(Date.now() - job.since)}`
    else state = job.ok === true ? 'Done ✓' : job.ok === false ? 'Failed ✗' : 'Ended'
    // a background job whose agent has left stands by the lead's desk
    const whose = here(owner) ? (name ? ` · ${name}` : '') : ' · its agent has left'
    return { command: job.label || 'a command', line: state + whose }
  }

  function showTip() {
    if (!hovered || !hovered.m) {
      tip.style.display = 'none'
      return
    }
    const { command, line } = tipText(hovered)
    tip.replaceChildren()
    const b = document.createElement('b')
    b.textContent = command
    const span = document.createElement('span')
    span.textContent = line
    tip.append(b, span)
    tip.style.borderColor = hovered.ended ? (hovered.ok === false ? '#e5534b' : hovered.ok === true ? '#58b884' : '#c9a05a') : '#9cb0bb'
    tip.style.display = 'block'
    tip.style.left = Math.max(8, Math.min(window.innerWidth - tip.offsetWidth - 8, tipAt.x + 16)) + 'px'
    tip.style.top = tipAt.y + 20 + 'px'
  }

  function machineAt(hit) {
    const groups = [...jobs.values()].filter(j => j.m?.group.visible).map(j => j.m.group)
    if (!groups.length) return null
    const key = hit.ray.intersectObjects(groups, true)[0]?.object.userData.jobKey
    return key ? jobs.get(key) ?? null : null
  }

  // for checking the page: window.__studioJobs.list(), and .hoverAt(n) moves the pointer onto the n-th machine
  window.__studioJobs = {
    hoverAt(n = 0) {
      const job = [...jobs.values()].filter(j => j.m?.group.visible)[n]
      if (!job) return false
      const v = job.m.group.position.clone().setY(0.2).project(camera)
      const x = ((v.x + 1) / 2) * window.innerWidth
      const y = ((1 - v.y) / 2) * window.innerHeight
      const target = document.elementFromPoint(x, y) ?? document.body
      target.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true, pointerType: 'mouse' }))
      return job.label
    },
    list: () => [...jobs.values()].map(j => ({ key: j.key, who: j.who, kind: j.kind, label: j.label, shown: !!j.m, visible: !!j.m?.group.visible, ended: j.ended, ok: j.ok, at: j.m ? j.m.group.position.toArray().map(v => +v.toFixed(2)) : null })),
  }

  return {
    apply(snapshot, sessions) {
      ingest(sessions)
    },

    step(dt) {
      clock += dt
      // a still demo page gets no updates: the made-up jobs move on by themselves
      if (demo && (sinceDemo += dt) > 0.5) {
        sinceDemo = 0
        ingest(ctx.sessions())
      }
      place(dt)
      for (const job of [...jobs.values()]) animate(job, dt)
      if (hovered && tip.style.display === 'block') showTip()
    },

    hover(hit) {
      const job = hit.person ? null : machineAt(hit)
      hovered = job
      tipAt = { x: hit.x, y: hit.y }
      showTip()
      return job ? 'help' : ''
    },
  }
}
