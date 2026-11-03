// The shift-report feature (see ../features.js for the hooks a feature may answer). When a session ends and its lead
// walks out, a small card at the bottom left says how the shift went: how long it ran, files changed, agents hired,
// tests passed, fires put out, commits made (and pushes, pull requests, commits not pushed yet and errors, when there
// were any). The numbers come from the mod (hooks/features/shift-report.ts) as extras['shift-report'] of each
// session; the commits still waiting come from the mailroom's extras.
//
// Demo: `?sessions=2&shift` makes up numbers for the demo sessions, and `?shift=now` shows a sample card at once.

const CSS = `
#shift-reports {
  position: fixed;
  left: 14px;
  bottom: 14px;
  z-index: 30;
  display: flex;
  flex-direction: column-reverse;
  gap: 8px;
  max-width: min(280px, calc(100vw - 28px));
  pointer-events: none;
}
.shift-card {
  pointer-events: auto;
  cursor: pointer;
  padding: 9px 13px 10px;
  border-radius: 14px;
  background: var(--card, rgba(255, 251, 245, 0.9));
  border: 1px solid var(--card-line, rgba(140, 110, 80, 0.16));
  border-top: 3px solid var(--tag, #c8775a);
  box-shadow: var(--shadow, 0 6px 18px rgba(110, 80, 50, 0.16));
  color: var(--ink, #4a3b31);
  font-size: 12.5px;
  line-height: 1.4;
  backdrop-filter: blur(6px);
  animation: shift-in 0.35s ease both;
  transition: opacity 0.6s ease, transform 0.6s ease;
}
.shift-card.out {
  opacity: 0;
  transform: translateY(8px);
}
.shift-card .head {
  font-weight: 700;
  letter-spacing: 0.01em;
}
.shift-card .who {
  margin-top: 1px;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--tag, #c8775a);
}
.shift-card .who span {
  font-weight: 600;
  color: var(--muted, #8a7766);
}
.shift-card ul {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
}
.shift-card li {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  font-weight: 600;
}
.shift-card li span {
  color: var(--muted, #8a7766);
  font-weight: 500;
}
.shift-card li.bad b {
  color: #b8534a;
}
@keyframes shift-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: none; }
}
`

const SHOW_MS = 25000
const FADE_MS = 600

/** "2 h 14 min", "14 min" or "under a minute". */
export function shiftLength(ms) {
  const mins = Math.max(0, Math.round(ms / 60000))
  if (mins < 1) return 'under a minute'
  const h = Math.floor(mins / 60)
  return h ? `${h} h ${mins % 60} min` : `${mins} min`
}

const num = v => (Number.isFinite(v) && v > 0 ? Math.round(v) : 0)

export function makeShiftReport(ctx) {
  const wanted = ctx.params.has('shift')
  const seen = new Map() // session id -> what we last knew of it while it was in the room
  let box = null
  let sampled = false

  const ensureBox = () => {
    if (box) return box
    const style = document.createElement('style')
    style.textContent = CSS
    document.head.append(style)
    box = document.createElement('div')
    box.id = 'shift-reports'
    document.body.append(box)
    return box
  }

  const line = (text, value, cls) => {
    const li = document.createElement('li')
    if (cls) li.className = cls
    const a = document.createElement('span')
    a.textContent = text
    const b = document.createElement('b')
    b.textContent = value
    li.append(a, b)
    return li
  }

  /** Puts up one card. `shift` is { folder, name, color, ms, files, agents, tests, fires, errors, commits, pushes, prs, unpushed }. */
  const show = shift => {
    const card = document.createElement('div')
    card.className = 'shift-card'
    card.style.setProperty('--tag', shift.color || '#c8775a')
    const head = document.createElement('div')
    head.className = 'head'
    head.textContent = `Shift report · ${shift.folder || 'studio'}`
    const who = document.createElement('div')
    who.className = 'who'
    who.textContent = shift.name || 'Claude'
    const sub = document.createElement('span')
    sub.textContent = ' signing off'
    who.append(sub)
    const list = document.createElement('ul')
    list.append(line('Shift ran', shiftLength(shift.ms)), line('Files changed', String(shift.files)), line('Agents hired', String(shift.agents)), line('Tests passed', String(shift.tests)), line('Fires put out', String(shift.fires)))
    list.append(line('Commits made', String(num(shift.commits))))
    if (shift.pushes) list.append(line('Pushes', String(shift.pushes)))
    if (shift.prs) list.append(line('Pull requests', String(shift.prs)))
    if (shift.unpushed) list.append(line('Commits not pushed', String(shift.unpushed), 'bad'))
    if (shift.errors) list.append(line('Errors', String(shift.errors), 'bad'))
    card.append(head, who, list)
    let timer = 0
    const close = () => {
      clearTimeout(timer)
      if (!card.isConnected || card.classList.contains('out')) return
      card.classList.add('out')
      setTimeout(() => card.remove(), FADE_MS)
    }
    card.addEventListener('click', close)
    timer = setTimeout(close, SHOW_MS)
    ensureBox().append(card)
  }

  /** Made-up numbers that grow the longer a demo session has been in the room. */
  const fake = (s, k) => {
    const e = seen.get(s.id)
    const secs = (performance.now() - (e?.since ?? performance.now())) / 1000
    return {
      started: Date.now() - (2 * 3600 + 14 * 60 - k * 1900) * 1000,
      files: 4 + k * 3 + Math.floor(secs / 4),
      edits: 11 + k * 5 + Math.floor(secs / 2),
      agents: 2 + k + Math.floor(secs / 9),
      tests: 3 + k + Math.floor(secs / 8),
      errors: k % 2 ? 0 : 2,
      fires: k % 2 ? 1 : 0,
      commits: 3 + k * 2 + Math.floor(secs / 12),
      pushes: 1 + (k % 2),
      prs: k % 2,
    }
  }

  return {
    apply(snapshot, sessions) {
      if (wanted && ctx.params.get('shift') === 'now' && !sampled) {
        sampled = true
        show({ folder: 'pixel-office', name: 'Claude', color: '#c8775a', ms: (2 * 3600 + 14 * 60) * 1000, files: 7, agents: 3, tests: 5, fires: 1, errors: 2, commits: 6, pushes: 2, prs: 1, unpushed: 1 })
      }
      const here = new Set()
      sessions.forEach((s, k) => {
        here.add(s.id)
        const old = seen.get(s.id)
        const lead = ctx.people.get(`lead:${s.id}`) ?? ctx.people.get('claude')
        const entry = old ?? { since: performance.now(), firstSeen: Date.now() }
        entry.folder = s.name || entry.folder || ''
        if (lead?.persona) {
          entry.name = lead.persona.name
          entry.color = lead.persona.color
        }
        seen.set(s.id, entry)
        const real = s.state?.extras?.['shift-report']
        const x = wanted && ctx.isDemo && !real ? fake(s, k) : real
        if (x) entry.extras = x
        // the commits still waiting to be pushed (the mailroom's count)
        const mail = s.state?.extras?.mailroom
        entry.unpushed = wanted && ctx.isDemo && !mail ? (k % 2 ? 0 : 2) : num(mail?.waiting)
      })
      for (const [id, e] of [...seen]) {
        if (here.has(id)) continue
        seen.delete(id)
        const x = e.extras ?? {}
        const started = Number.isFinite(x.started) && x.started > 0 ? x.started : e.firstSeen
        show({ folder: e.folder, name: e.name, color: e.color, ms: Date.now() - started, files: num(x.files), agents: num(x.agents), tests: num(x.tests), fires: num(x.fires), errors: num(x.errors), commits: num(x.commits), pushes: num(x.pushes), prs: num(x.prs), unpushed: num(e.unpushed) })
      }
    },
  }
}
