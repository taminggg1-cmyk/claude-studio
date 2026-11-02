// Claude's studio, drawn on the terminal: a small office seen from above at an angle, the way the inside of a building
// looks in a handheld adventure game. Coloured cells make the floor tiles, the walls and the desks; emoji are the
// people and the things on the desks. This module runs on the drawing side with a clock of its own: it walks people
// in and out tile by tile and redraws, while the hooks module only says who is in the room and what each one does.

import type { ClientSurface, RenderElement } from 'claude-code'

export type Code =
  | 'idle'
  | 'thinking'
  | 'reading'
  | 'searching'
  | 'writing'
  | 'terminal'
  | 'browsing'
  | 'delegating'
  | 'planning'

export type SceneHelper = { id: string; emoji: string; code: Code; color: string }
export type SceneProps = {
  cols: number
  rows: number
  hour: number
  main: Code
  board: string
  helpers: SceneHelper[]
}

const TICK_MS = 150

/** The emoji in a worker's thought bubble. Thinking is drawn as moving dots instead. */
export const BUBBLE: Record<Code, string> = {
  idle: '',
  thinking: '',
  reading: '📖',
  searching: '🔍',
  writing: '📝',
  terminal: '⚡',
  browsing: '🌐',
  delegating: '📣',
  planning: '📋',
}

// ------------------------------------------------------------------ colours (daytime; night dims them)

const CEIL = 0x3b2f4a
const LIGHTS = [0xffd166, 0xff8fab, 0x8bd3ff, 0xa0e8af]
const WALL_A = 0xf2dcc0
const WALL_B = 0xecd2b2
const WAINSCOT = 0xb98257
const TRIM = 0x8a5a3b
const FRAME = 0xfaf6ef
const SILL = 0xe2d6c6
const BOARD = 0xfbfbf8
const BOARD_FRAME = 0x9a7b5f
const BOARD_INK = 0x3a3a46
const SHELF = 0x8b5a3c
const SHELF_DARK = 0x6b4329
const DOOR = 0x9c6b43
const DOOR_FRAME = 0x6f4a2d
const DOOR_OPEN = 0x2a2233
const MAT = 0x7d9a5b
const FLOOR_A = 0xe6c494
const FLOOR_B = 0xdcb784
const RUG = 0x7fa7d6
const RUG_EDGE = 0x5a83b8
const DESK_TOP = 0xb07a4f
const DESK_FRONT = 0x7c4f30
const DESK_LIP = 0x5e3a22
const CHAIR = 0x5b6c9a
const CLAUDE_CHAIR = 0xd97757
const BUBBLE_BG = 0xffffff
const NIGHT_TINT = 0x161228
const LAMP_GLOW = 0xffcf80
const SCREEN_GLOW = 0x9ad1ff

function mix(a: number, b: number, k: number): number {
  const t = Math.max(0, Math.min(1, k))
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0')
}

/** 0 by day, 1 at night, sliding at dawn and dusk. */
export function nightness(hour: number): number {
  if (hour < 5 || hour >= 20) return 1
  if (hour < 7) return (7 - hour) / 2
  if (hour >= 18) return (hour - 18) / 2
  return 0
}

/** A deterministic 0..1 noise from an integer. */
function rand(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

// ------------------------------------------------------------------ the room's plan

type P = [number, number]
export type Desk = { x: number; w: number; seatX: number; aisleY: number; seatY: number; topY: number; frontY: number }
export type Room = {
  C: number
  R: number
  doorX: number
  lane: number
  claude: Desk
  desks: Desk[]
  seatRows: Set<number>
  openTop: number
  waitY: number
  catY: number
}

function deskAt(base: number, x: number, w: number): Desk {
  return { x, w, seatX: x + Math.floor((w - 2) / 2), aisleY: base, seatY: base + 1, topY: base + 2, frontY: base + 3 }
}

/**
 * Where everything stands for a pane of C columns and R rows. Row 0 is the ceiling, rows 1 to 3 the back wall, and
 * the floor starts at row 4. Each desk row takes four rows: the aisle behind the chairs (where thought bubbles float),
 * the chairs, the desk top and the desk front. People come in through the door on the right and walk down the lane.
 */
export function room(C: number, R: number): Room {
  const doorX = C - 8
  const lane = doorX + 1
  const claude = deskAt(4, 2, 9)
  const desks: Desk[] = []
  for (let x = 13; x + 6 <= lane - 3; x += 8) desks.push(deskAt(4, x, 6))
  const twoRows = R >= 16
  if (twoRows) for (let x = 2; x + 6 <= lane - 3; x += 8) desks.push(deskAt(9, x, 6))
  const openTop = twoRows ? 14 : 9
  return {
    C,
    R,
    doorX,
    lane,
    claude,
    desks,
    seatRows: new Set(twoRows ? [5, 10] : [5]),
    openTop,
    waitY: Math.max(openTop, R - 2),
    catY: R - 1,
  }
}

/** The path from one spot to another along the aisles and the lane, one cell per step. */
export function route(L: Room, from: P, to: P): P[] {
  const out: P[] = []
  let [x, y] = from
  const aisleOf = (p: P) => (p[1] <= 3 ? 4 : L.seatRows.has(p[1]) ? p[1] - 1 : p[1])
  const walkY = (target: number) => {
    while (y !== target) {
      y += y < target ? 1 : -1
      out.push([x, y])
    }
  }
  const walkX = (target: number) => {
    while (x !== target) {
      x += x < target ? 1 : -1
      out.push([x, y])
    }
  }
  const a0 = aisleOf(from)
  const a1 = aisleOf(to)
  walkY(a0)
  if (a0 !== a1) {
    walkX(L.lane)
    walkY(a1)
  }
  walkX(to[0])
  walkY(to[1])
  return out
}

// ------------------------------------------------------------------ who is where

type Walker = {
  id: string
  emoji: string
  code: Code
  color: number
  desk: number
  x: number
  y: number
  goal: P
  path: P[]
  phase: 'in' | 'sit' | 'wait' | 'out'
}

export type Sim = {
  t: number
  props: SceneProps
  people: Walker[]
  cat: { x: number; dir: 1 | -1 }
}

export function newSim(props: SceneProps): Sim {
  return { t: 0, props, people: [], cat: { x: 4, dir: 1 } }
}

function parseColor(c: string): number {
  const n = Number.parseInt(c.replace('#', ''), 16)
  return Number.isFinite(n) ? n : CHAIR
}

function setGoal(L: Room, p: Walker, goal: P): void {
  if (p.goal[0] === goal[0] && p.goal[1] === goal[1]) return
  p.goal = goal
  p.path = route(L, [p.x, p.y], goal)
}

/** Brings the people in the room in line with who the hooks module says is working, then moves everyone a step. */
export function advance(sim: Sim): void {
  const { cols, rows } = sim.props
  const L = room(cols, rows)
  sim.t += 1
  const want = new Map(sim.props.helpers.map(h => [h.id, h]))

  for (const p of sim.people) {
    // the pane changed size: keep everyone on the canvas
    p.x = Math.max(0, Math.min(L.C - 2, p.x))
    p.y = Math.max(3, Math.min(L.R - 1, p.y))
    const h = want.get(p.id)
    if (h) {
      p.emoji = h.emoji
      p.code = h.code
      p.color = parseColor(h.color)
    } else if (p.phase !== 'out') {
      p.phase = 'out'
      p.desk = -1
    }
    if (p.desk >= L.desks.length) {
      p.desk = -1
      p.phase = 'wait'
    }
  }
  for (const h of sim.props.helpers) {
    if (sim.people.some(p => p.id === h.id)) continue
    sim.people.push({
      id: h.id,
      emoji: h.emoji,
      code: h.code,
      color: parseColor(h.color),
      desk: -1,
      x: L.lane,
      y: 3,
      goal: [L.lane, 3],
      path: [],
      phase: 'wait',
    })
  }

  // desks for whoever has none; the rest wait in a line on the open floor
  const held = new Set(sim.people.filter(p => p.desk >= 0).map(p => p.desk))
  let waiting = 0
  for (const p of sim.people) {
    if (p.phase === 'out') {
      setGoal(L, p, [L.lane, 3])
      continue
    }
    if (p.desk < 0) {
      const free = L.desks.findIndex((_, k) => !held.has(k))
      if (free >= 0) {
        held.add(free)
        p.desk = free
        p.phase = 'in'
      }
    }
    const d = p.desk >= 0 ? L.desks[p.desk] : undefined
    if (d) {
      setGoal(L, p, [d.seatX, d.seatY])
    } else {
      p.phase = 'wait'
      setGoal(L, p, [Math.max(1, L.lane - 3 - 3 * waiting), L.waitY])
      waiting += 1
    }
  }

  // one step each: a column per tick across, a row every second tick down (rows are twice as tall)
  for (const p of sim.people) {
    const next = p.path[0]
    if (!next) {
      if (p.phase === 'in') p.phase = 'sit'
      continue
    }
    if (next[1] !== p.y && sim.t % 2 === 1) continue
    // come in through the door one at a time
    if (p.y <= 3 && next[1] > p.y) {
      const busy = sim.people.some(q => q !== p && q.phase !== 'sit' && q.y >= 4 && q.y <= 5 && Math.abs(q.x - L.lane) <= 2)
      if (busy) continue
    }
    p.x = next[0]
    p.y = next[1]
    p.path.shift()
  }
  sim.people = sim.people.filter(p => !(p.phase === 'out' && p.path.length === 0 && p.y <= 3))

  // the cat strolls along the front of the room unless it is asleep
  if (!catSleeps(sim) && sim.t % 3 === 0) {
    const c = sim.cat
    c.x += c.dir
    if (c.x >= L.lane - 4) c.dir = -1
    if (c.x <= 3) c.dir = 1
  }
}

function catSleeps(sim: Sim): boolean {
  return sim.props.main === 'idle' || nightness(sim.props.hour) > 0.6
}

// ------------------------------------------------------------------ painting cells

/**
 * The picture as cells: a glyph, its ink (-1: none) and a background each. An emoji covers two cells: its own, marked
 * `wide`, and the one to its right, which is never drawn on its own.
 */
type Grid = { C: number; R: number; ch: string[]; fg: number[]; bg: number[]; wide: boolean[]; lit: boolean[] }

function grid(C: number, R: number): Grid {
  const n = C * R
  return {
    C,
    R,
    ch: new Array<string>(n).fill(' '),
    fg: new Array<number>(n).fill(-1),
    bg: new Array<number>(n).fill(0),
    wide: new Array<boolean>(n).fill(false),
    lit: new Array<boolean>(n).fill(false),
  }
}

function inside(g: Grid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < g.C && y < g.R
}

/** Makes cell (x, y) a plain one-cell glyph again, undoing any emoji that covered it. */
function clear(g: Grid, x: number, y: number): number {
  const k = y * g.C + x
  if (x > 0 && g.wide[k - 1]) {
    g.wide[k - 1] = false
    g.ch[k - 1] = ' '
  }
  g.wide[k] = false
  return k
}

function fill(g: Grid, x: number, y: number, w: number, h: number, bg: number): void {
  for (let j = y; j < y + h; j++)
    for (let i = x; i < x + w; i++)
      if (inside(g, i, j)) {
        const k = clear(g, i, j)
        g.bg[k] = bg
        g.ch[k] = ' '
        g.fg[k] = -1
      }
}

function glyph(g: Grid, x: number, y: number, ch: string, fg: number): void {
  if (!inside(g, x, y)) return
  const k = clear(g, x, y)
  g.ch[k] = ch
  g.fg[k] = fg
}

/** An emoji over two cells, keeping the background under it. */
function emoji(g: Grid, x: number, y: number, e: string): void {
  if (!e || !inside(g, x, y) || !inside(g, x + 1, y)) return
  const k = clear(g, x, y)
  clear(g, x + 1, y)
  g.ch[k] = e
  g.fg[k] = -1
  g.wide[k] = true
  g.bg[k + 1] = g.bg[k] ?? 0
}

function isWide(cp: number): boolean {
  return cp >= 0x1f000 || (cp >= 0x2600 && cp <= 0x27bf) || (cp >= 0x2b00 && cp <= 0x2bff) || cp === 0x23f0
}

/** Text written cell by cell from x, cut at `maxX`; emoji take two cells. */
function write(g: Grid, x: number, y: number, text: string, fg: number, maxX: number): void {
  let cx = x
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 32
    if (cp === 0xfe0f || cp === 0x200d) continue
    const wide = isWide(cp)
    if (cx + (wide ? 1 : 0) > maxX) {
      if (cx > x) glyph(g, Math.min(cx, maxX), y, '…', fg)
      return
    }
    if (wide) {
      emoji(g, cx, y, ch)
      cx += 2
    } else {
      glyph(g, cx, y, ch, fg)
      cx += 1
    }
  }
}

function drawCeiling(g: Grid, t: number, night: number): void {
  fill(g, 0, 0, g.C, 1, CEIL)
  for (let x = 1; x < g.C; x += 3) {
    const k = Math.floor(x / 3)
    const on = rand(k * 7 + Math.floor(t / 6)) > 0.25
    const c = LIGHTS[k % LIGHTS.length] ?? 0xffd166
    glyph(g, x, 0, '•', on ? mix(c, 0xffffff, 0.2 * night) : mix(c, CEIL, 0.6))
    g.lit[x] = true
  }
}

function drawWall(g: Grid): void {
  for (let x = 0; x < g.C; x++) fill(g, x, 1, 1, 2, Math.floor(x / 4) % 2 === 0 ? WALL_A : WALL_B)
  fill(g, 0, 3, g.C, 1, WAINSCOT)
  for (let x = 0; x < g.C; x++) glyph(g, x, 3, '▔', TRIM)
}

function drawWindow(g: Grid, t: number, hour: number): void {
  // frame at columns 1, 6 and 11; sky in 2..5 and 7..10; a sill under it
  const night = nightness(hour)
  let sky = 0x9fd8ff
  if (hour >= 5 && hour < 7.5) sky = mix(0x2a3570, 0xffc8a8, Math.min(1, (hour - 5) / 1.5))
  else if (hour >= 17 && hour < 20) sky = mix(0xff9e7a, 0x2a2f66, (hour - 17) / 3)
  else if (night >= 1) sky = 0x1d2452
  fill(g, 1, 1, 11, 2, FRAME)
  fill(g, 2, 1, 4, 2, sky)
  fill(g, 7, 1, 4, 2, sky)
  for (let x = 1; x <= 11; x++) for (let y = 1; y <= 2; y++) g.lit[y * g.C + x] = true
  if (night >= 1) {
    emoji(g, 2, 1, '🌙')
    emoji(g, 7, 2, Math.floor(t / 10) % 2 === 0 ? '⭐' : '✨')
    emoji(g, 9, 1, Math.floor(t / 13) % 2 === 0 ? '✨' : '⭐')
  } else if (hour >= 17) {
    emoji(g, 7, 2, '🌇')
  } else if (hour < 7.5) {
    emoji(g, 2, 2, '🌅')
  } else {
    emoji(g, 2, 1, '🌞')
    const spots: P[] = [
      [4, 2],
      [7, 1],
      [9, 2],
      [7, 2],
    ]
    const s = spots[Math.floor(t / 40) % spots.length] ?? [7, 1]
    emoji(g, s[0], s[1], '⛅')
  }
  fill(g, 0, 3, 13, 1, SILL)
}

function drawBoard(g: Grid, L: Room, text: string, t: number): void {
  const x0 = 14
  const x1 = L.doorX - 9
  if (x1 - x0 + 1 < 12) return
  fill(g, x0, 1, x1 - x0 + 1, 2, BOARD)
  for (let y = 1; y <= 2; y++) {
    glyph(g, x0, y, '▌', BOARD_FRAME)
    glyph(g, x1, y, '▐', BOARD_FRAME)
  }
  write(g, x0 + 2, 1, text, BOARD_INK, x1 - 2)
  // a little progress bar under the words, moving while Claude works
  const w = x1 - x0 - 3
  const k = Math.floor(t / 2) % Math.max(1, w)
  for (let i = 0; i < w; i++) glyph(g, x0 + 2 + i, 2, '▁', i === k ? 0xd97757 : 0xd9d4cc)
}

function drawShelf(g: Grid, L: Room): void {
  const x0 = L.doorX - 7
  if (x0 < 14) return
  fill(g, x0, 1, 6, 3, SHELF)
  emoji(g, x0, 1, '📚')
  emoji(g, x0 + 2, 1, '🏆')
  emoji(g, x0 + 4, 1, '📚')
  emoji(g, x0, 2, '📒')
  emoji(g, x0 + 2, 2, '📚')
  emoji(g, x0 + 4, 2, '🌵')
  fill(g, x0, 3, 6, 1, SHELF_DARK)
  glyph(g, x0 + 1, 3, '╶', 0xe0b070)
  glyph(g, x0 + 4, 3, '╴', 0xe0b070)
}

function drawDoor(g: Grid, L: Room, isOpen: boolean): void {
  const x = L.doorX
  fill(g, x, 1, 4, 3, DOOR_FRAME)
  fill(g, x + 1, 1, 2, 3, isOpen ? DOOR_OPEN : DOOR)
  if (!isOpen) emoji(g, x + 1, 2, '🚪')
  // a doormat on the floor in front
  fill(g, x + 1, 4, 2, 1, MAT)
  emoji(g, x + 4, 3, '🪴')
}

function drawFloor(g: Grid, L: Room): void {
  for (let y = 4; y < g.R; y++)
    for (let x = 0; x < g.C; x++) fill(g, x, y, 1, 1, (Math.floor(x / 2) + y) % 2 === 0 ? FLOOR_A : FLOOR_B)
  // a rug on the open floor at the front
  const y0 = L.openTop
  const h = g.R - y0
  const room = L.lane - 4 - 13
  const w = Math.min(32, room)
  const x0 = 13 + Math.floor((room - w) / 2)
  if (h >= 2 && w >= 10) {
    fill(g, x0, y0, w, h, RUG_EDGE)
    if (h >= 3) {
      fill(g, x0 + 2, y0 + 1, w - 4, h - 1, RUG)
      for (let y = y0 + 1; y < g.R; y++)
        for (let x = x0 + 3; x < x0 + w - 3; x++) if ((x + 2 * y) % 6 === 0) glyph(g, x, y, '◆', 0x9dbde3)
    }
  }
  emoji(g, 0, g.R - 1, '🪴')
}

function shadow(g: Grid, x: number, y: number, w: number): void {
  for (let i = x; i < x + w; i++)
    if (inside(g, i, y)) {
      const k = y * g.C + i
      g.bg[k] = mix(g.bg[k] ?? FLOOR_A, 0x5a3a20, 0.28)
    }
}

const SIDE_ITEMS = ['📄', '☕', '🍵', '🧃', '🍪']

function drawDesk(g: Grid, d: Desk, items: [number, string][], chair: number, chairShown: boolean): void {
  if (chairShown) fill(g, d.seatX - 1, d.seatY, 4, 1, chair)
  fill(g, d.x, d.topY, d.w, 1, DESK_TOP)
  fill(g, d.x, d.frontY, d.w, 1, DESK_FRONT)
  for (let i = d.x; i < d.x + d.w; i++) glyph(g, i, d.frontY, '▔', DESK_LIP)
  shadow(g, d.x + 1, d.frontY + 1, d.w)
  for (const [dx, e] of items) emoji(g, d.x + dx, d.topY, e)
}

function drawBubble(g: Grid, x: number, y: number, code: Code, t: number, seed: number): void {
  if (code === 'idle') return
  fill(g, x - 1, y, 4, 1, BUBBLE_BG)
  if (code === 'thinking') {
    const n = Math.floor((t + seed) / 3) % 5
    for (let i = 0; i < 4; i++) glyph(g, x - 1 + i, y, i < n ? '•' : '·', 0x6b5a85)
    return
  }
  emoji(g, x, y, BUBBLE[code])
}

function drawPeople(g: Grid, L: Room, sim: Sim, night: number): void {
  const { t } = sim
  const main = sim.props.main

  // Claude's big desk: a lamp, a laptop, a mug
  const c = L.claude
  drawDesk(
    g,
    c,
    [
      [0, '💡'],
      [3, '💻'],
      [6, '☕'],
    ],
    CLAUDE_CHAIR,
    true,
  )
  emoji(g, c.seatX, c.seatY, '🧑')
  if (main === 'idle') {
    if (night > 0.6) emoji(g, c.seatX + 2, c.aisleY, '💤')
    else if (Math.floor(t / 20) % 3 === 0) emoji(g, c.seatX + 2, c.aisleY, '🎵')
  } else drawBubble(g, c.seatX, c.aisleY, main, t, 0)
  // the lamp and screens light the room at night
  if (night > 0) {
    for (let y = c.aisleY; y <= c.frontY + 2; y++)
      for (let x = 0; x < c.x + c.w + 4; x++) {
        if (!inside(g, x, y)) continue
        const d = Math.hypot((x - (c.x + 1)) / 7, (y - c.topY) / 2.2)
        if (d < 1) {
          const k = y * g.C + x
          g.bg[k] = mix(g.bg[k] ?? 0, LAMP_GLOW, 0.45 * (1 - d))
          g.lit[k] = true
        }
      }
  }

  // helper desks, with whoever sits there
  L.desks.forEach((d, k) => {
    const sitter = sim.people.find(p => p.desk === k && p.phase === 'sit')
    const items: [number, string][] = sitter
      ? [
          [2, '💻'],
          [4, SIDE_ITEMS[k % SIDE_ITEMS.length] ?? '📄'],
        ]
      : [[2, '🌱']]
    drawDesk(g, d, items, sitter ? sitter.color : CHAIR, true)
    if (sitter) {
      emoji(g, d.seatX, d.seatY, sitter.emoji)
      if (sitter.code === 'idle') emoji(g, d.seatX + 2, d.aisleY, '💤')
      else drawBubble(g, d.seatX, d.aisleY, sitter.code, t, k * 5)
      if (night > 0) {
        for (let x = d.seatX - 1; x < d.seatX + 3; x++)
          if (inside(g, x, d.seatY)) {
            const i = d.seatY * g.C + x
            g.bg[i] = mix(g.bg[i] ?? 0, SCREEN_GLOW, 0.3 * night)
            g.lit[i] = true
          }
      }
    }
  })
}

function drawWalkers(g: Grid, sim: Sim): void {
  for (const p of sim.people) {
    if (p.phase === 'sit') continue
    if (p.y <= 3) continue // still in the doorway
    emoji(g, p.x, p.y, p.emoji)
    if (p.phase === 'wait' && p.path.length === 0 && p.code !== 'idle') {
      const e = BUBBLE[p.code] || '💭'
      if (Math.floor((sim.t + p.x) / 12) % 2 === 0) emoji(g, p.x + 2, p.y, e)
    }
  }
}

function drawCat(g: Grid, L: Room, sim: Sim): void {
  if (catSleeps(sim)) {
    const x = Math.max(3, Math.min(L.lane - 6, Math.floor((13 + L.lane - 4) / 2)))
    emoji(g, x, L.catY, '🐈')
    if (Math.floor(sim.t / 8) % 2 === 0) emoji(g, x + 2, L.catY, '💤')
    return
  }
  emoji(g, sim.cat.x, L.catY, '🐈')
}

function applyNight(g: Grid, night: number): void {
  if (night <= 0) return
  for (let k = 0; k < g.bg.length; k++) {
    if (g.lit[k]) continue
    g.bg[k] = mix(g.bg[k] ?? 0, NIGHT_TINT, 0.5 * night)
    const f = g.fg[k] ?? -1
    if (f >= 0) g.fg[k] = mix(f, NIGHT_TINT, 0.35 * night)
  }
}

/** The whole picture for one frame. */
export function paint(sim: Sim): Grid {
  const { cols, rows, hour, board } = sim.props
  const L = room(cols, rows)
  const g = grid(cols, rows)
  const night = nightness(hour)
  drawCeiling(g, sim.t, night)
  drawWall(g)
  drawWindow(g, sim.t, hour)
  drawBoard(g, L, board, sim.t)
  drawShelf(g, L)
  const nearDoor = sim.people.some(p => p.phase !== 'sit' && Math.abs(p.x - L.lane) <= 2 && p.y <= 5)
  drawDoor(g, L, nearDoor)
  drawFloor(g, L)
  drawPeople(g, L, sim, night)
  drawCat(g, L, sim)
  drawWalkers(g, sim)
  applyNight(g, night)
  return g
}

/** One row as runs of the same colours, ready to be Text. */
export type Run = { text: string; fg: number; bg: number }

export function runs(g: Grid): Run[][] {
  const out: Run[][] = []
  for (let y = 0; y < g.R; y++) {
    const row: Run[] = []
    let cur: Run | null = null
    for (let x = 0; x < g.C; x++) {
      const k = y * g.C + x
      const ch = g.ch[k] ?? ' '
      const wide = g.wide[k] === true
      const bg = g.bg[k] ?? 0
      const fg = wide || ch === ' ' ? -1 : (g.fg[k] ?? -1)
      if (cur && cur.bg === bg && (fg === -1 || cur.fg === -1 || cur.fg === fg)) {
        cur.text += ch
        if (cur.fg === -1) cur.fg = fg
      } else {
        cur = { text: ch, fg, bg }
        row.push(cur)
      }
      if (wide) x += 1
    }
    out.push(row)
  }
  return out
}

// ------------------------------------------------------------------ the surface module

type State = { sim: Sim; frame: number }

export default function Studio(props: SceneProps, surface: ClientSurface<State>): RenderElement {
  const { Box, Text } = surface.elements
  let st = surface.state
  if (!st) {
    st = { sim: newSim(props), frame: 0 }
    surface.setState(st)
    surface.every(TICK_MS, () => {
      const s = surface.state
      if (!s) return
      advance(s.sim)
      surface.setState({ sim: s.sim, frame: s.frame + 1 })
    })
  }
  st.sim.props = props
  const lines = runs(paint(st.sim))
  return (
    <Box flexDirection="column">
      {lines.map(line => (
        <Text wrap="truncate-end">
          {line.map(r => (
            <Text backgroundColor={hex(r.bg)} color={r.fg >= 0 ? hex(r.fg) : undefined}>
              {r.text}
            </Text>
          ))}
        </Text>
      ))}
    </Box>
  )
}
