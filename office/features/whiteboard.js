// The whiteboard feature (see ../features.js for the hooks a feature may answer). Each session's task list is drawn as
// sticky notes on the room's rolling whiteboard: one column per session, headed by its folder name, the notes in its
// lead's colour. A finished task is faded and ticked, a task in progress has a dot. When a session's tasks change, its
// lead gets up, walks to the board, writes for a moment and walks back (at most one trip every 40 seconds).
//
// The mod sends `extras.whiteboard = { tasks: [{ id, text, status }], changed }` (hooks/features/whiteboard.ts).
// `?whiteboard` on a demo page fakes a few tasks per session that tick off over time.

const W = 1280
const H = 853
const MAX_COLUMNS = 4
const TRIP_GAP = 40000
const WRITE_SECONDS = 2.5

const DEMO_TASKS = ['Read the failing test', 'Fix the cache bug', 'Add a regression test', 'Run the type check', 'Update the docs']

export function makeWhiteboard(ctx) {
  const { THREE, world, people } = ctx
  const board = world.whiteboard
  if (!board) return {}
  const demo = ctx.params.has('whiteboard') && ctx.isDemo

  // the drawing sits just in front of the board's face and stays hidden until there is something to show
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(board.width - 0.04, board.height - 0.04),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0.25 }),
  )
  plane.position.set(0, board.face.position.y, 0.0185)
  plane.visible = false
  plane.receiveShadow = true
  board.group.add(plane)

  /** session id -> { name, tasks, key, lastTrip, pending } */
  const sessions = new Map()
  let dirty = false
  let demoClock = 0

  const leadOf = id => {
    for (const e of people.values()) if (e.isLead && e.info?.session === id) return e
    return null
  }
  const colourOf = id => leadOf(id)?.persona?.color || '#d9a441'

  // ---------------------------------------------------------------- drawing

  function wrap(text, width, maxLines) {
    const lines = []
    let line = ''
    for (const word of String(text).split(/\s+/)) {
      const test = line ? `${line} ${word}` : word
      if (line && g.measureText(test).width > width) {
        lines.push(line)
        line = word
      } else line = test
    }
    if (line) lines.push(line)
    if (lines.length > maxLines) {
      lines.length = maxLines
      lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,2}$/, '…')
    }
    return lines
  }

  function note(x, y, w, h, colour, t, tilt) {
    const done = t.status === 'completed'
    g.save()
    g.translate(x + w / 2, y + h / 2)
    g.rotate(tilt)
    g.globalAlpha = done ? 0.45 : 1
    g.shadowColor = 'rgba(60,40,20,0.3)'
    g.shadowBlur = 6
    g.shadowOffsetY = 3
    g.fillStyle = colour
    g.fillRect(-w / 2, -h / 2, w, h)
    g.shadowColor = 'transparent'
    g.fillStyle = 'rgba(0,0,0,0.06)'
    g.fillRect(-w / 2, -h / 2, w, 10)
    g.fillStyle = '#2b2622'
    const size = Math.max(14, Math.min(24, h * 0.24))
    g.font = `600 ${size}px "Segoe Print", "Bradley Hand", "Comic Sans MS", "Segoe UI", sans-serif`
    g.textBaseline = 'top'
    const lines = wrap(t.text, w - 44, 3)
    lines.forEach((line, i) => g.fillText(line, -w / 2 + 12, -h / 2 + 18 + i * size * 1.2))
    if (done) {
      g.strokeStyle = '#2f7d4f'
      g.lineWidth = 5
      g.lineCap = 'round'
      g.lineJoin = 'round'
      g.beginPath()
      g.moveTo(w / 2 - 34, h / 2 - 22)
      g.lineTo(w / 2 - 24, h / 2 - 12)
      g.lineTo(w / 2 - 8, h / 2 - 34)
      g.stroke()
    } else if (t.status === 'in_progress') {
      g.fillStyle = '#d4432f'
      g.beginPath()
      g.arc(w / 2 - 16, -h / 2 + 24, 8, 0, Math.PI * 2)
      g.fill()
    }
    g.restore()
  }

  function draw() {
    const cols = [...sessions.entries()].filter(([, s]) => s.tasks.length).slice(0, MAX_COLUMNS)
    plane.visible = cols.length > 0
    if (!cols.length) return
    g.clearRect(0, 0, W, H)
    g.fillStyle = '#fbf8f3'
    g.fillRect(0, 0, W, H)
    const colW = W / cols.length
    const per = cols.length === 1 ? 3 : cols.length === 2 ? 2 : 1
    cols.forEach(([id, s], c) => {
      const x0 = c * colW
      const colour = colourOf(id)
      if (c) {
        g.strokeStyle = 'rgba(80,70,60,0.25)'
        g.lineWidth = 3
        g.setLineDash([10, 10])
        g.beginPath()
        g.moveTo(x0, 24)
        g.lineTo(x0, H - 24)
        g.stroke()
        g.setLineDash([])
      }
      g.fillStyle = colour
      g.fillRect(x0 + 24, 20, colW - 48, 8)
      g.fillStyle = '#2b2622'
      g.font = '700 38px "Segoe UI", sans-serif'
      g.textBaseline = 'top'
      let head = s.name || id
      while (head.length > 3 && g.measureText(head).width > colW - 48) head = head.slice(0, -2) + '…'
      g.fillText(head, x0 + 24, 38)
      const top = 100
      const rows = Math.ceil(s.tasks.length / per)
      const gap = 14
      const nw = (colW - 48 - gap * (per - 1)) / per
      const nh = Math.min(120, (H - top - 24 - gap * (rows - 1)) / rows)
      s.tasks.forEach((t, i) => {
        const r = Math.floor(i / per)
        const k = i % per
        const tilt = (((i * 7 + c * 3) % 5) - 2) * 0.012
        note(x0 + 24 + k * (nw + gap), top + r * (nh + gap), nw, nh, colour, t, tilt)
      })
    })
    texture.needsUpdate = true
  }

  // ---------------------------------------------------------------- the trip to the board

  function boardSpot() {
    const spot = new THREE.Vector3()
    board.group.updateWorldMatrix(true, false)
    board.group.getWorldPosition(spot)
    const ry = board.group.rotation.y
    const nx = Math.sin(ry)
    const nz = Math.cos(ry)
    return { stand: ctx.v3(spot.x + nx * 0.85, spot.z + nz * 0.85), yaw: Math.atan2(-nx, -nz) }
  }

  function canGo(entry) {
    if (!entry || !entry.seat || entry.state !== 'working' || entry.away || entry.p.isBusy()) return false
    if (ctx.chaos.state().some(f => f.id === entry.id && !f.out)) return false
    return true
  }

  function trip(entry) {
    const { p, seat } = entry
    const { stand, yaw } = boardSpot()
    const lane = ctx.v3(seat.approach.x, ctx.aisleZ)
    entry.away = 'whiteboard'
    ctx.standUp(entry)
    p.walk([lane, ctx.v3(stand.x, ctx.aisleZ), stand])
      .turn(yaw, 0.4)
      .call(() => {
        p.yawTarget = yaw
        p.action = 'write'
      })
      .wait(WRITE_SECONDS)
      .call(() => {
        if (p.action === 'write') p.action = null
      })
      .walk([ctx.v3(stand.x, ctx.aisleZ), lane, seat.approach])
    ctx.sitDown(entry)
  }

  // ---------------------------------------------------------------- the hooks

  function take(id, name, tasks) {
    const key = JSON.stringify(tasks)
    let s = sessions.get(id)
    if (!s) sessions.set(id, (s = { name, tasks: [], key: '', lastTrip: -Infinity, pending: false }))
    s.name = name
    if (s.key === key) return
    const first = s.key === ''
    s.key = key
    s.tasks = tasks
    dirty = true
    // the board is redrawn at once; only a change after the first sight of the list sends the lead to write
    if (!first && tasks.length) s.pending = true
  }

  function fakeTasks(index) {
    const n = 3 + (index % 3)
    const done = Math.floor(demoClock / 5 + index * 2) % (n * 2 + 2)
    return Array.from({ length: n }, (_, i) => ({
      id: String(i + 1),
      text: DEMO_TASKS[(i + index) % DEMO_TASKS.length],
      status: i < done ? 'completed' : i === done ? 'in_progress' : 'pending',
    }))
  }

  return {
    apply(snapshot, list) {
      const seen = new Set()
      list.forEach((s, index) => {
        seen.add(s.id)
        const extra = s.state?.extras?.whiteboard
        take(s.id, s.name, demo ? fakeTasks(index) : Array.isArray(extra?.tasks) ? extra.tasks : [])
      })
      for (const id of [...sessions.keys()]) {
        if (!seen.has(id)) {
          sessions.delete(id)
          dirty = true
        }
      }
    },

    step(dt) {
      if (demo) {
        const before = Math.floor(demoClock / 5)
        demoClock += dt
        if (Math.floor(demoClock / 5) !== before) ctx.sessions().forEach((s, i) => take(s.id, s.name, fakeTasks(i)))
      }
      if (dirty) {
        dirty = false
        draw()
      }
      const now = performance.now()
      for (const [id, s] of sessions) {
        if (!s.pending || now - s.lastTrip < TRIP_GAP) continue
        const entry = leadOf(id)
        if (!canGo(entry)) continue
        s.pending = false
        s.lastTrip = now
        trip(entry)
      }
    },

    label(entry) {
      if (entry.away === 'whiteboard') return 'Updating the board'
    },

    gone(entry) {
      if (entry.isLead && entry.p.action === 'write') entry.p.action = null
    },
  }
}
