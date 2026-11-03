// The standup feature (see ../features.js for the hooks a feature may answer). Two things:
//
//   The wall calendar. A paper month calendar hangs on the back wall, right of the trophy shelf. The office server keeps
//   the local dates a session was here (stats.days) and sends this month's and last month's, with the streak (days in a
//   row up to today, or up to yesterday while today has no session yet) and the best streak. Each used day gets a red
//   X, today is circled, and the streak is written at the bottom. Hovering over it shows the streak and the best one.
//   It turns gold once the best streak reaches 30 days (progress.js puts a gilded frame round it).
//
//   The daily standup. The first session to join on a new day sets stats.standup = { day, at } on the server, once, so
//   reloads and other windows never replay it. When this page sees a standup that started less than a minute ago,
//   everyone free gathers at the whiteboard in a loose half circle facing it: the leads sitting idle at their desks and
//   the people off duty in the lounge. The first lead says how yesterday went (from stats.yesterday), one or two others
//   answer, there is a little cheer, and everyone goes back: leads to their desks, the people off duty to the exact spot
//   and pose the lounge left them in (the lounge never notices they were gone). Nobody whose desk burns, who fights a
//   fire, is away on something else or waits for an OK comes along, and a lead whose session gets busy goes back at once.
//
// Demo switches: ?standup on a demo page starts a standup about 5 seconds after load with sample "yesterday" counts
// (try ?still=0&lounge&standup; ?standup=look turns to the whiteboard, ?standup=wall to the calendar); ?streak=N fakes
// an N-day streak on the calendar (and the pennant and gold frame, in progress.js).

/** Where the calendar hangs on the back wall (its centre, and its size in metres); progress.js frames it in gold. */
export const CALENDAR = { x: 0.02, y: 2.6, w: 0.66, h: 0.84 }

const STORE = 'studio-standup-v1'
/** A standup that started longer ago than this is not shown (a window opened later in the day). */
const FRESH_MS = 60_000
/** How long the page waits for someone to be free before it lets the day's standup go. */
const WAIT_MS = 90_000
/** How long people may take to walk to the board before the standup starts without the late ones. */
const GATHER_S = 16
/** The most people off duty who come along. */
const MOST_FRIENDS = 4

const P = (x, z) => ({ x, z })
const pick = list => list[Math.floor(Math.random() * list.length)]
const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z)
const pad = n => String(n).padStart(2, '0')
const dayOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const dayPlus = (day, n) => {
  const [y, m, d] = day.split('-').map(Number)
  return dayOf(new Date(y, m - 1, d + n))
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/** What each daily count is called in the lead's line, in the order they are worth mentioning. */
const WORDS = [
  ['commits', 'commit', 'commits'],
  ['files-edited', 'file', 'files'],
  ['fires-out', 'fire', 'fires'],
  ['tests-passed', 'green test run', 'green test runs'],
  ['agents-hired', 'agent', 'agents'],
  ['pushes', 'push', 'pushes'],
  ['pull-requests', 'pull request', 'pull requests'],
]
const REPLIES = ['Morning, everyone!', 'Sounds good to me.', 'Ready when you are!', "Let's make it a good one.", 'Coffee first, then code.', 'I can take a task today.', 'Nice work yesterday!']
const CHEERS = ["Let's go!", 'Team!', 'Here we go!']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** The sample stats ?standup and ?streak=N show on a demo page. */
function demoStats(streak, standupAt) {
  const today = dayOf(new Date())
  const days = Array.from({ length: streak }, (_, i) => dayPlus(today, -i)).reverse()
  return {
    today,
    days,
    streak,
    best: streak,
    yesterday: { day: dayPlus(today, -1), counts: { commits: 12, 'files-edited': 30, 'tests-passed': 6, 'fires-out': 2 } },
    standup: standupAt ? { day: today, at: standupAt } : null,
  }
}

/** The first lead's line: how the last day with a session went. */
function yesterdayLine(y, today) {
  if (!y?.day) return "First day here! Let's build something."
  const when = y.day === dayPlus(today, -1) ? 'Yesterday' : 'Last time'
  const parts = WORDS.filter(([k]) => Number(y.counts?.[k]) > 0)
    .slice(0, 3)
    .map(([k, one, many]) => plural(Number(y.counts[k]), one, many))
  if (!parts.length) return `${when} was a quiet one. Fresh start today!`
  return `${when}: ${parts.join(', ')}.`
}

export function makeStandup(ctx) {
  const { THREE, scene, people, world, aisleZ, v3, params, ROOM } = ctx
  const z0 = ROOM.z0
  const demoStandup = !!ctx.isDemo && params.has('standup')
  const demoStreak = ctx.isDemo && params.has('streak') ? Math.max(0, Math.round(Number(params.get('streak')) || 0)) : null
  const loadedAt = Date.now()
  const demo = demoStandup || demoStreak !== null ? demoStats(demoStreak ?? 4, demoStandup ? loadedAt + 5000 : 0) : null

  // ---------------------------------------------------------------- the wall calendar
  const { x: cx, y: cy, w: cw, h: ch } = CALENDAR
  const cal = new THREE.Group()
  cal.position.set(cx, cy, z0 + 0.012)
  scene.add(cal)
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 660
  const g = canvas.getContext('2d')
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  const paper = new THREE.Mesh(
    new THREE.PlaneGeometry(cw, ch),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0.22 }),
  )
  paper.position.z = 0.006
  paper.receiveShadow = true
  cal.add(paper)
  // a thin card behind the pages, and the nail it hangs on
  const card = new THREE.Mesh(new THREE.BoxGeometry(cw + 0.02, ch + 0.02, 0.008), new THREE.MeshStandardMaterial({ color: 0x8f7a64, roughness: 0.9 }))
  card.castShadow = true
  cal.add(card)
  const nail = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshStandardMaterial({ color: 0xb08d57, metalness: 0.8, roughness: 0.35 }))
  nail.position.set(0, ch / 2 + 0.035, 0.01)
  cal.add(nail)

  let view = demo // the stats the calendar and the standup read (the server's, or the demo's)
  let painted = ''

  function paint() {
    const today = dayOf(new Date())
    const streak = Number(view?.streak) || 0
    const best = Math.max(streak, Number(view?.best) || 0)
    const days = new Set(Array.isArray(view?.days) ? view.days : [])
    const gold = best >= 30
    const key = JSON.stringify([today, [...days].filter(d => d.startsWith(today.slice(0, 7))), streak, gold])
    if (key === painted) return
    painted = key
    const W = canvas.width
    const H = canvas.height
    const [year, month] = today.split('-').map(Number)
    g.fillStyle = gold ? '#f4dc8e' : '#fbf7ee'
    g.fillRect(0, 0, W, H)
    // the binding strip with two rings
    g.fillStyle = gold ? '#b8892a' : '#b5523a'
    g.fillRect(0, 0, W, 54)
    g.fillStyle = gold ? '#f8e7a8' : '#f3e3d0'
    for (const x of [W * 0.3, W * 0.7]) {
      g.beginPath()
      g.arc(x, 27, 9, 0, Math.PI * 2)
      g.fill()
    }
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillStyle = '#3f332c'
    g.font = '800 46px "Segoe UI", sans-serif'
    g.fillText(`${MONTHS[month - 1]} ${year}`, W / 2, 98, W - 40)
    // the weeks start on Monday
    const left = 22
    const colW = (W - 2 * left) / 7
    const top = 150
    const rowH = 66
    g.font = '700 22px "Segoe UI", sans-serif'
    g.fillStyle = '#8a6a50'
    ;['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((d, i) => g.fillText(d, left + colW * (i + 0.5), top))
    const first = (new Date(year, month - 1, 1).getDay() + 6) % 7
    const length = new Date(year, month, 0).getDate()
    for (let d = 1; d <= length; d++) {
      const cell = first + d - 1
      const x = left + colW * ((cell % 7) + 0.5)
      const y = top + 44 + rowH * Math.floor(cell / 7)
      const date = `${year}-${pad(month)}-${pad(d)}`
      g.font = '700 30px "Segoe UI", sans-serif'
      g.fillStyle = date > today ? '#b9aa98' : '#3f332c'
      g.fillText(String(d), x, y)
      if (days.has(date)) {
        g.strokeStyle = 'rgba(200, 40, 30, 0.85)'
        g.lineWidth = 5
        g.lineCap = 'round'
        g.beginPath()
        g.moveTo(x - 17, y - 17)
        g.lineTo(x + 17, y + 17)
        g.moveTo(x + 17, y - 17)
        g.lineTo(x - 17, y + 17)
        g.stroke()
      }
      if (date === today) {
        g.strokeStyle = gold ? '#7a5510' : '#2f6f8f'
        g.lineWidth = 4
        g.beginPath()
        g.ellipse(x, y, 27, 25, -0.15, 0, Math.PI * 2)
        g.stroke()
      }
    }
    g.fillStyle = gold ? '#7a5510' : '#a95f45'
    g.font = '800 38px "Segoe UI", sans-serif'
    g.fillText(`Streak: ${plural(streak, 'day', 'days')}`, W / 2, H - 40, W - 40)
    texture.needsUpdate = true
  }
  paint()
  // ?standup=look turns to the whiteboard, ?standup=wall to the calendar (for checking the page)
  const look = { look: [new THREE.Vector3(-0.9, 0, -5.3), 2.2], wall: [new THREE.Vector3(cx - 0.6, 0, z0 - 1.2), 5] }[params.get('standup')]
  if (demoStandup && look) setTimeout(() => ctx.focusOn?.({ p: { root: { position: look[0] } } }, Number(params.get('zoom')) || look[1]), 600)

  // the hover hint
  const tip = document.createElement('div')
  tip.style.cssText =
    'position:fixed;z-index:45;pointer-events:none;background:#fff8ec;color:#3f332c;border:2px solid #d97757;border-radius:10px;padding:3px 9px;font:700 12px "Segoe UI",sans-serif;box-shadow:0 4px 12px rgba(63,51,44,0.22);white-space:nowrap;display:none'
  document.body.appendChild(tip)
  function showTip(text, x, y) {
    if (!text) return void (tip.style.display = 'none')
    tip.textContent = text
    tip.style.display = 'block'
    tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 8, x + 16) + 'px'
    tip.style.top = y + 20 + 'px'
  }
  function tipText() {
    const streak = Number(view?.streak) || 0
    const best = Math.max(streak, Number(view?.best) || 0)
    return `Wall calendar · streak: ${plural(streak, 'day', 'days')} in a row · best: ${plural(best, 'day', 'days')}`
  }

  // ---------------------------------------------------------------- the standup
  let shown = ''
  try {
    shown = localStorage.getItem(STORE) || ''
  } catch {}
  let pending = null // { key, at, until, yesterday, today }
  let meeting = null
  let readyFor = 0 // how long someone has been free to come, in seconds
  let clock = 0

  const sessionOf = entry => ctx.sessions().find(s => s.id === entry.info?.session)
  const burning = entry => ctx.chaos.state().some(f => f.id === entry.id && !f.out)
  const anyFire = () => ctx.chaos.state().some(f => !f.out)
  const needsOk = entry => sessionOf(entry)?.state?.extras?.['your-turn']?.waiting === 'approve'
  /** A lead's session is working (a turn or a tool call is under way); a demo lead is never too busy. */
  const busy = entry => !demo && entry.info?.code !== 'idle'

  function freeLead(e) {
    return e.isLead && !e.friend && e.state === 'working' && e.seat && e.p.seated && !e.away && !e.p.isBusy() && !burning(e) && !needsOk(e) && !busy(e)
  }
  function freeFriend(e) {
    return e.friend && e.state === 'off' && e.p.root.visible && !e.p.isBusy()
  }

  /** Where each person stands: a loose half circle in front of the board, the first in the middle. */
  function spots(n) {
    const board = world.whiteboard.group
    board.updateWorldMatrix(true, false)
    const at = new THREE.Vector3()
    board.getWorldPosition(at)
    const a0 = board.rotation.y
    const centre = P(at.x, at.z)
    const offsets = [0, -0.42, 0.42, -0.84, 0.84, -1.22, 1.22, -1.55]
    return offsets.slice(0, n).map((o, i) => {
      const r = 1.45 + (i % 2) * 0.12
      const spot = P(at.x + Math.sin(a0 + o) * r, at.z + Math.cos(a0 + o) * r)
      return { ...spot, yaw: yawTo(spot, centre) }
    })
  }

  // People off duty step out of the lounge the way the lounge walks them (round the sofas, not through them).
  const inLounge = pos => pos.x < -1.0 && pos.z > 1.95
  function loungeExit(front) {
    if (!inLounge(front)) return []
    return front.x < -6.2 ? [P(-7.55, 2.2)] : [P(-3.45, 4.3), P(-2.85, 3.4), P(-2.85, 2.1)]
  }
  const V = pts => pts.map(q => v3(q.x, q.z))

  function begin(p0) {
    shown = p0.key
    try {
      localStorage.setItem(STORE, shown)
    } catch {}
    pending = null
    const leads = [...people.values()].filter(freeLead).sort((a, b) => (a.id === 'claude' ? -1 : b.id === 'claude' ? 1 : 0))
    const friends = [...people.values()].filter(freeFriend).slice(0, MOST_FRIENDS)
    const who = [...leads, ...friends]
    const places = spots(who.length)
    meeting = { t: 0, phase: 'gather', over: false, yesterday: p0.yesterday, today: p0.today, parts: [] }
    who.forEach((entry, i) => (entry.friend ? fetchFriend : fetchLead)(entry, places[i]))
  }

  function fetchLead(entry, spot) {
    const part = { entry, spot, lead: true, phase: 'rising', arrived: false }
    meeting.parts.push(part)
    const { p, seat } = entry
    entry.away = 'standup'
    ctx.standUp(entry)
    p.call(() => {
      part.phase = 'out'
      if (part.wantBack) goBack(part)
    })
      .walk(V([P(seat.approach.x, aisleZ), P(spot.x, aisleZ), spot]))
      .turn(spot.yaw, 0.4)
      .call(() => (part.arrived = true))
      .until(() => meeting?.over !== false || part.phase === 'back', 60)
  }

  function fetchFriend(entry, spot) {
    const { p } = entry
    const pos = p.root.position
    const yaw = p.root.rotation.y
    const back = { pos: pos.clone(), yaw, seated: !!p.seated, activity: p.activity }
    // the spot in front of their seat, where the lounge steps them out to
    back.front = back.seated ? P(pos.x + Math.sin(yaw) * 0.45, pos.z + Math.cos(yaw) * 0.45) : P(pos.x, pos.z)
    back.exit = loungeExit(back.front)
    const part = { entry, spot, lead: false, phase: 'rising', arrived: false, back }
    meeting.parts.push(part)
    p.call(() => (p.activity = 'idle'))
    if (back.seated) p.stand().step(v3(back.front.x, back.front.z), 0.5)
    const out = back.exit.length ? [...back.exit, P(back.exit.at(-1).x, aisleZ)] : [P(back.front.x, aisleZ)]
    p.call(() => {
      part.phase = 'out'
      if (part.wantBack) goBack(part)
    })
      .walk(V([...out, P(spot.x, aisleZ), spot]))
      .turn(spot.yaw, 0.4)
      .call(() => (part.arrived = true))
      .until(() => meeting?.over !== false || part.phase === 'back', 60)
  }

  /** Walks someone back: a lead to their desk, someone off duty to the very spot and pose they came from. */
  function goBack(part) {
    if (part.phase === 'back' || part.phase === 'dropped') return
    if (part.phase === 'rising') return void (part.wantBack = true) // still getting up: back as soon as they stand
    part.phase = 'back'
    const { entry } = part
    const { p } = entry
    p.clear()
    const at = p.root.position
    if (part.lead) {
      const seat = entry.seat
      if (!seat) return void (entry.away = null)
      p.walk(V([P(at.x, aisleZ), P(seat.approach.x, aisleZ), P(seat.approach.x, seat.approach.z)]))
      ctx.sitDown(entry)
      return
    }
    const b = part.back
    const route = [P(at.x, aisleZ), ...[...b.exit].reverse(), b.front]
    if (!b.exit.length) route.splice(1, 0, P(b.front.x, aisleZ))
    p.walk(V(route))
    if (b.seated)
      p.turn(b.yaw, 0.3)
        .step(b.pos, 0.55)
        .sit()
    else p.turn(b.yaw, 0.3)
    p.call(() => (p.activity = b.activity))
  }

  /** Lets go of someone without walking them anywhere (they left, or the lounge took them back). */
  function drop(part) {
    part.phase = 'dropped'
    if (part.lead && part.entry.away === 'standup') part.entry.away = null
  }

  function stepMeeting(dt) {
    const m = meeting
    // who can no longer take part
    for (const part of m.parts) {
      if (part.phase === 'back' || part.phase === 'dropped') continue
      const e = part.entry
      if (people.get(e.id) !== e || e.state === 'leaving') {
        drop(part)
        continue
      }
      if (part.lead) {
        if (e.state !== 'working' || burning(e) || needsOk(e) || busy(e)) goBack(part)
      } else if (!e.friend || e.state !== 'off') drop(part)
    }
    const here = m.parts.filter(q => q.phase !== 'back' && q.phase !== 'dropped')
    // no lead left (their sessions got busy), or a fire: everyone goes back
    if (!here.some(q => q.lead) || anyFire()) return end()
    m.t += dt
    if (m.phase === 'gather') {
      if (here.every(q => q.arrived) || m.t > GATHER_S) {
        m.phase = 'talk'
        m.t = 0
        m.script = script(here.filter(q => q.arrived))
      }
      return
    }
    while (m.script.length && m.t >= m.script[0].at) m.script.shift().run()
    if (!m.script.length) end()
  }

  /** What happens once everyone is there: the first lead's line, a reply or two, a cheer, and back to work. */
  function script(here) {
    const steps = []
    const speaker = here.find(q => q.lead) ?? here[0]
    if (!speaker) return [{ at: 0, run: () => undefined }]
    const others = here.filter(q => q !== speaker).sort(() => Math.random() - 0.5)
    steps.push({ at: 0.3, run: () => ctx.sayText(speaker.entry, yesterdayLine(meeting.yesterday, meeting.today)) })
    let at = 2.9
    for (const q of others.slice(0, 2)) {
      const folder = q.lead ? q.entry.info?.sessionName : ''
      const line = folder ? `I'll keep going on ${folder}.` : pick(REPLIES)
      steps.push({ at, run: () => ctx.sayText(q.entry, line) })
      at += 2.2
    }
    steps.push({
      at,
      run: () => {
        for (const q of here) if (q.phase === 'out') q.entry.p.cheer = 2.2
        ctx.sayText(speaker.entry, pick(CHEERS))
        try {
          const board = world.whiteboard.group
          const spot = new THREE.Vector3()
          board.getWorldPosition(spot)
          ctx.fx.confetti(spot.setY(2.1), 60)
        } catch {}
        window.dispatchEvent(new CustomEvent('studio:sound', { detail: { name: 'cheer' } }))
      },
    })
    steps.push({ at: at + 2.2, run: () => undefined })
    return steps
  }

  function end() {
    const m = meeting
    if (!m || m.over) return
    m.over = true
    for (const part of m.parts) goBack(part)
    meeting = null
  }

  /** Reads the day's standup from the stats, and starts it once someone is free to come. */
  function stepPending(dt) {
    const s = view?.standup
    const now = Date.now()
    const today = dayOf(new Date())
    if (!pending && s && s.day === today && now - s.at < FRESH_MS && `${s.day}|${s.at}` !== shown)
      pending = { key: `${s.day}|${s.at}`, at: s.at, until: s.at + WAIT_MS, yesterday: view.yesterday, today }
    if (!pending || meeting) return
    if (now > pending.until) {
      pending = null
      return
    }
    if (now < pending.at || anyFire()) return
    const someone = [...people.values()].some(freeLead)
    readyFor = someone ? readyFor + dt : 0
    // a lead who just sat down says hello first
    if (readyFor > 1.5) begin(pending)
  }

  return {
    apply(snapshot) {
      if (demo) return
      const stats = snapshot?.stats
      if (stats && typeof stats === 'object') view = stats
    },

    step(dt) {
      clock += dt
      if (clock < 0.25) return
      const d = clock
      clock = 0
      paint() // (only redraws when the day, the days used or the streak changed: at midnight it rolls over)
      if (meeting) stepMeeting(d)
      else stepPending(d)
    },

    label(entry) {
      if (entry.away === 'standup') return 'Morning standup'
    },

    hire(entry) {
      // the lounge called someone to work while they were at the standup: they go straight from where they stand
      const part = meeting?.parts.find(q => q.entry === entry && q.phase !== 'dropped' && q.phase !== 'back')
      if (!part) return undefined
      part.phase = 'dropped'
      const { p } = entry
      p.clear()
      p.seated = false
      p.activity = 'idle'
      const pos = p.root.position
      pos.y = 0
      return [v3(pos.x, aisleZ)]
    },

    gone(entry) {
      // (also called when someone off duty only changes id: they are still in the room then)
      if (people.get(entry.id) === entry) return
      const part = meeting?.parts.find(q => q.entry === entry)
      if (part) part.phase = 'dropped'
    },

    hover(hit) {
      if (hit.person || !hit.ray.intersectObject(paper, false).length) {
        showTip('', 0, 0)
        return ''
      }
      showTip(tipText(), hit.x, hit.y)
      return 'default'
    },
  }
}
