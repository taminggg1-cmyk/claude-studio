// Status strip: one row per session in a corner (busy, waiting, on fire); clicking a row turns the camera to that desk. See ../features.js for the hooks a feature may answer.
//
// A small card at the bottom right. Each row has a dot in the lead's colour, the session name and its state, most urgent
// first: Needs your OK · <tool> (red, pulsing), Your turn (amber, with how long it has waited), On fire, Compacting,
// Coffee break, otherwise what the lead is doing and how many agents work with it. Click a row to turn the camera to that
// session's lead. The card folds into a small pill ("3 sessions · 1 needs you"); the choice is remembered. With one
// session it starts folded. All the data is already in the snapshot (your-turn and paperwork extras, the people, the fires).
//
// Demo: `?strip` forces it open. With `?sessions=3&yourturn` it fakes the waits just like the your-turn feature does.

const CSS = `
#studio-strip {
  position: fixed;
  right: 14px;
  bottom: 34px; /* above the hint line along the bottom edge */
  z-index: 30;
  width: min(270px, calc(100vw - 28px));
  padding: 6px;
  border-radius: 14px;
  background: var(--card, rgba(255, 251, 245, 0.9));
  border: 1px solid var(--card-line, rgba(140, 110, 80, 0.16));
  box-shadow: var(--shadow, 0 6px 18px rgba(110, 80, 50, 0.16));
  color: var(--ink, #4a3b31);
  font-size: 12.5px;
  line-height: 1.35;
  backdrop-filter: blur(6px);
  user-select: none;
}
#studio-strip.folded {
  width: auto;
  padding: 0;
  border-radius: 999px;
}
#studio-strip.hidden {
  display: none;
}
#studio-strip .bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 3px 8px 5px 8px;
  border: 0;
  background: none;
  color: var(--muted, #8a7766);
  font: inherit;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
}
#studio-strip.folded .bar {
  padding: 6px 12px;
  color: var(--ink, #4a3b31);
}
#studio-strip .bar.urgent {
  color: #b8534a;
}
#studio-strip .bar:hover {
  color: var(--ink, #4a3b31);
}
#studio-strip .arrow {
  font-size: 10px;
}
#studio-strip.folded .arrow {
  display: none;
}
#studio-strip .rows {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
#studio-strip.folded .rows {
  display: none;
}
#studio-strip .row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 9px;
  cursor: pointer;
}
#studio-strip .row:hover {
  background: rgba(140, 110, 80, 0.13);
}
#studio-strip .dot {
  flex: none;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--tag, #c8775a);
}
#studio-strip .name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 700;
}
#studio-strip .state {
  flex: none;
  max-width: 62%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  color: var(--muted, #8a7766);
}
#studio-strip .row.ok .state {
  color: #c04a3e;
}
#studio-strip .row.ok {
  animation: strip-pulse 1.6s ease-in-out infinite;
}
#studio-strip .row.turn .state {
  color: #b9801f;
}
#studio-strip .row.fire .state {
  color: #c4572a;
}
@keyframes strip-pulse {
  0%, 100% { background: rgba(200, 74, 62, 0.06); }
  50% { background: rgba(200, 74, 62, 0.2); }
}
`

const KEY = 'studio-strip-folded'
const LABEL = {
  idle: 'Idle',
  thinking: 'Thinking',
  reading: 'Reading',
  searching: 'Searching',
  writing: 'Editing',
  refactoring: 'Refactoring',
  testing: 'Testing',
  terminal: 'Running a command',
  browsing: 'Browsing',
  delegating: 'Delegating',
  planning: 'Planning',
}
const DEMO_DELAY = 4000

/** "3:07" from a number of milliseconds. */
export function clockText(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Lower is more urgent. */
const RANK = { ok: 0, turn: 1, fire: 2, compact: 3, coffee: 4, work: 5 }

function readFolded() {
  try {
    const v = localStorage.getItem(KEY)
    return v === '1' ? true : v === '0' ? false : null
  } catch {
    return null
  }
}

function saveFolded(folded) {
  try {
    localStorage.setItem(KEY, folded ? '1' : '0')
  } catch {
    // no storage: the choice only lasts for this visit
  }
}

export function makeStatusStrip(ctx) {
  const forced = ctx.params.has('strip')
  const born = Date.now()
  let box = null
  let bar = null
  let rowsEl = null
  let rows = []
  let choice = readFolded() // true / false once the person chose, else null
  let signature = ''
  let clock = 0

  const ensureBox = () => {
    if (box) return box
    const style = document.createElement('style')
    style.textContent = CSS
    document.head.append(style)
    box = document.createElement('div')
    box.id = 'studio-strip'
    bar = document.createElement('button')
    bar.type = 'button'
    bar.className = 'bar'
    bar.addEventListener('click', () => {
      choice = !isFolded()
      saveFolded(choice)
      signature = ''
      refresh()
    })
    rowsEl = document.createElement('div')
    rowsEl.className = 'rows'
    box.append(rowsEl, bar)
    document.body.append(box)
    return box
  }

  const isFolded = () => (choice !== null ? choice : forced ? false : rows.length < 2)

  /** What waits on the person for this session: { waiting, since, tool } or nothing. Demo pages make it up. */
  const waitOf = (s, i) => {
    const real = s.state?.extras?.['your-turn']
    if (real?.waiting === 'you' || real?.waiting === 'approve') return real
    if (!(ctx.isDemo && ctx.params.has('yourturn')) || Date.now() - born < DEMO_DELAY) return null
    if (i === 0) return { waiting: 'you', since: born + DEMO_DELAY }
    if (i === 1) return { waiting: 'approve', since: born + DEMO_DELAY, tool: 'Bash' }
    return null
  }

  const leadOf = s => ctx.people.get(`lead:${s.id}`) ?? ctx.people.get('claude')

  /** True when the lead or one of the session's agents stands in a fire. */
  const burning = lead => {
    if (!lead) return false
    const fires = ctx.chaos?.state?.() ?? []
    return fires.some(f => !f.out && (f.id === lead.id || ctx.people.get(f.id)?.info?.lead === lead.id))
  }

  /** One row's facts: { id, name, color, kind, text, since }. */
  const describe = (s, i) => {
    const lead = leadOf(s)
    const x = waitOf(s, i)
    const helpers = s.state?.helpers?.length ?? 0
    const row = { id: s.id, name: s.name || 'studio', color: lead?.persona?.color || '#c8775a', kind: 'work', text: '', since: 0 }
    if (x?.waiting === 'approve') {
      row.kind = 'ok'
      row.text = `Needs your OK · ${x.tool || 'a tool'}`
    } else if (x) {
      row.kind = 'turn'
      row.since = Number(x.since) || Date.now()
      row.text = 'Your turn'
    } else if (burning(lead)) {
      row.kind = 'fire'
      row.text = 'On fire'
    } else if (s.state?.extras?.paperwork?.state === 'running') {
      row.kind = 'compact'
      row.text = 'Compacting'
    } else if (lead?.away === 'coffee-break') {
      row.kind = 'coffee'
      row.text = 'Coffee break'
    } else {
      const code = s.state?.main?.code
      row.text = LABEL[code] || 'Working'
      if (helpers) row.text += ` · +${helpers} agent${helpers === 1 ? '' : 's'}`
    }
    return row
  }

  const build = r => {
    const el = document.createElement('div')
    el.className = `row ${r.kind}`
    el.style.setProperty('--tag', r.color)
    const dot = document.createElement('span')
    dot.className = 'dot'
    const name = document.createElement('span')
    name.className = 'name'
    name.textContent = r.name
    name.title = r.name
    const state = document.createElement('span')
    state.className = 'state'
    state.textContent = r.text
    if (r.since) {
      state.dataset.since = String(r.since)
      state.textContent = `${r.text} · ${clockText(Date.now() - r.since)}`
    }
    el.append(dot, name, state)
    el.addEventListener('click', () => {
      const lead = ctx.people.get(`lead:${r.id}`) ?? ctx.people.get('claude')
      if (lead) ctx.focusOn(lead, 3)
    })
    return el
  }

  const pillText = () => {
    const need = rows.filter(r => r.kind === 'ok' || r.kind === 'turn').length
    const n = rows.length
    const base = `${n} session${n === 1 ? '' : 's'}`
    return need ? `${base} · ${need} need${need === 1 ? 's' : ''} you` : base
  }

  /** Rewrites the card, but only when a row (or the fold) has changed. */
  function refresh() {
    const sessions = ctx.sessions?.() ?? []
    rows = sessions.map(describe).sort((a, b) => RANK[a.kind] - RANK[b.kind])
    if (!rows.length) {
      if (box) box.classList.add('hidden')
      return
    }
    ensureBox()
    const folded = isFolded()
    const sig = JSON.stringify([folded, rows.map(r => [r.id, r.name, r.color, r.kind, r.text, !!r.since])])
    if (sig === signature) return
    signature = sig
    box.classList.remove('hidden')
    box.classList.toggle('folded', folded)
    const urgent = rows.some(r => r.kind === 'ok')
    bar.className = urgent ? 'bar urgent' : 'bar'
    const arrow = document.createElement('span')
    arrow.className = 'arrow'
    arrow.textContent = '▾'
    const label = document.createElement('span')
    label.textContent = folded ? pillText() : 'Sessions'
    bar.replaceChildren(label, arrow)
    bar.title = folded ? 'Show the sessions' : 'Fold into a pill'
    rowsEl.replaceChildren(...rows.map(build))
  }

  /** Once a second: the waiting times tick on. */
  function tickClock() {
    if (!rowsEl) return
    for (const el of rowsEl.querySelectorAll('[data-since]')) {
      el.textContent = `Your turn · ${clockText(Date.now() - Number(el.dataset.since))}`
    }
  }
  setInterval(tickClock, 1000)

  return {
    apply() {
      refresh()
    },
    step(dt) {
      clock += dt
      if (clock < 0.5) return
      clock = 0
      refresh() // fires and coffee breaks start between updates
    },
  }
}
