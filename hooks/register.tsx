// Claude's studio: a cosy isometric office loft that opens in its own window beside the CLI at the start of every
// interactive session. Claude works at her desk; every agent Claude summons walks in through the door, takes the
// nearest free desk and switches on the screen, with a soft badge over each head saying what they are doing.
//
// It also tells the window how everyone is doing: a mood per worker (in the flow while editing, thinking, stressed
// after a failed tool call, panicking after five in a row, which sets their desk on fire), a cheer when a test passes,
// a run of errors ends or an agent finishes, how full the context window and the five-hour usage limit are (the
// window's token rack), and whether the sky should follow the clock (`/office day`, `/office night`, `/office auto`).
//
// The office is shared: every interactive session on this computer works in the same room, in one window. The first
// session starts ../office/server.mjs (a small Node server on 127.0.0.1, run as a process of its own so it outlives that
// session) and opens ../office/index.html from it as an app window in Edge or Chrome; every later session joins that
// server and its lead walks into the room already open. Each session posts its own studio (its lead, its agents) on
// every change. The 3D room itself is drawn by ../office/office.js in that window. Where the window cannot start (no
// Node, no browser), the older terminal pane drawn by ./studio.tsx opens instead; `/office pane` opens it on request.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Mood, SkyMode, StudioInfo, Usage, Worker, WorkerCode } from '../types'
import type { Code as SceneCode, SceneProps } from './studio'
import { FEATURES } from './features'
import { installControl, runControlCommand, signalControl } from './features/control'
import type { Command } from './features/control'
import type { OfficePath, Signal, SignalData } from './features/kit'
import { installPaperwork, signalPaperwork } from './features/paperwork'
import { installProgress, signalProgress, takeProgressStats } from './features/progress'
import { installShiftReport, signalShiftReport } from './features/shift-report'
import { installWhiteboard, signalWhiteboard } from './features/whiteboard'
import { installYourTurn, signalYourTurn } from './features/your-turn'
import { runCharactersCommand } from './features/characters'
import type { InboxCommand } from './features/kit'

const PANE = 'office'
const TITLE = "Claude's studio"
const CLAUDE_ORANGE = '#d97757'
/** Agent statuses that keep someone in the room (`idle` is a teammate waiting for a message). */
const IN_ROOM = new Set(['pending', 'running', 'waiting', 'idle'])

const WORDS: Record<WorkerCode, string> = {
  idle: 'resting with a coffee',
  thinking: 'thinking',
  reading: 'reading',
  searching: 'searching',
  writing: 'writing',
  refactoring: 'refactoring',
  testing: 'running tests',
  terminal: 'running a command',
  browsing: 'on the web',
  delegating: 'working with the team',
  planning: 'planning',
}

/** The words on a worker's badge in the window. */
const LABEL: Record<WorkerCode, string> = {
  idle: 'Idle',
  thinking: 'Thinking',
  reading: 'Reading',
  searching: 'Searching',
  writing: 'Writing',
  refactoring: 'Refactoring',
  testing: 'Testing',
  terminal: 'Running a command',
  browsing: 'Browsing',
  delegating: 'Delegating',
  planning: 'Planning',
}

/** The terminal pane knows fewer animations than the window: the newer codes borrow the nearest one. */
const PANE_CODE: Record<WorkerCode, SceneCode> = {
  idle: 'idle',
  thinking: 'thinking',
  reading: 'reading',
  searching: 'searching',
  writing: 'writing',
  refactoring: 'writing',
  testing: 'terminal',
  terminal: 'terminal',
  browsing: 'browsing',
  delegating: 'delegating',
  planning: 'planning',
}

const BOARD_ICON: Record<WorkerCode, string> = {
  idle: '☕',
  thinking: '💭',
  reading: '📖',
  searching: '🔍',
  writing: '📝',
  refactoring: '🛠️',
  testing: '🧪',
  terminal: '⚡',
  browsing: '🌐',
  delegating: '📣',
  planning: '📋',
}

/** The creature each kind of agent comes as in the terminal pane; a second one of a kind gets the next free one. */
const CREATURE_BY_TYPE: Record<string, string> = {
  Explore: '🦉',
  Plan: '🦊',
  'general-purpose': '🐻',
  teammate: '🐼',
  'claude-code-guide': '🐧',
  'statusline-setup': '🐹',
}
const CREATURES = ['🦉', '🦊', '🐻', '🐼', '🐨', '🐯', '🐸', '🐧', '🐰', '🐹', '🦁', '🐙']
const CHAIRS = ['#3fb8af', '#9b8cf2', '#e07a5f', '#81b29a', '#f2c14e', '#5dade2', '#c38d9e', '#7fb069']

const EMPTY: StudioInfo = {
  clock: '',
  hour: 12,
  main: {
    id: 'claude',
    name: 'Claude',
    kind: 'claude',
    emoji: '🧑',
    code: 'idle',
    label: LABEL.idle,
    activity: WORDS.idle,
    detail: '',
    task: '',
    color: CLAUDE_ORANGE,
    mood: 'calm',
    strikes: 0,
    cheer: 0,
  },
  helpers: [],
  usage: { context: null, fiveHour: null },
  sky: 'auto',
}
const info = atom({ plugin: 'pixel-office', key: 'info' } as const, EMPTY, { shape: 'info-4' })

/** A shell command that runs tests or a type check, so the badge can say "Testing". */
const TEST_COMMAND =
  /\b(pytest|jest|vitest|mocha|unittest|tox|nox|rspec|phpunit|ctest|tsc|(npm|pnpm|yarn|bun)( run)? test|cargo test|go test|dotnet test|mvn test|gradle test|plugin test|make test)\b/

function activityOf(tool: string, input: Record<string, unknown>): WorkerCode {
  if (/^(Read|NotebookRead|ArtifactComments)$/.test(tool)) return 'reading'
  if (/^(Grep|Glob|ToolSearch|LS)$/.test(tool)) return 'searching'
  if (/^(Edit|MultiEdit|NotebookEdit)$/.test(tool)) return 'refactoring'
  if (/^(Write|Artifact|ArtifactData|ReportFindings)$/.test(tool)) return 'writing'
  if (/^(Bash|PowerShell)$/.test(tool) && typeof input.command === 'string' && TEST_COMMAND.test(input.command)) return 'testing'
  if (/^(Bash|PowerShell|Monitor|BashOutput|KillShell|TaskStop|EnterWorktree|ExitWorktree)$/.test(tool)) return 'terminal'
  if (/^(WebFetch|WebSearch)$/.test(tool) || /chrome|browser/i.test(tool)) return 'browsing'
  if (/^(Agent|Task|SendMessage|ListAgents|RemoteTrigger)$/.test(tool)) return 'delegating'
  if (/^(TodoWrite|EnterPlanMode|ExitPlanMode|Skill|AskUserQuestion|ScheduleWakeup|CronCreate|CronDelete|CronList)$/.test(tool))
    return 'planning'
  return 'thinking'
}

function short(text: string, max: number): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > max ? one.slice(0, Math.max(1, max - 1)) + '…' : one
}

/** A few words on what a tool call is about: a file name, a command, a pattern, a site. */
function detailOf(input: Record<string, unknown>): string {
  const s = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  const base = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p
  const tool = String(input.tool)
  if (s('file_path')) return base(s('file_path'))
  if (s('notebook_path')) return base(s('notebook_path'))
  if (tool === 'Bash' || tool === 'PowerShell') return s('command').split(/\s+/).slice(0, 3).join(' ')
  if (s('pattern')) return `"${s('pattern')}"`
  if (s('url')) {
    try {
      return new URL(s('url')).hostname
    } catch {
      return s('url')
    }
  }
  if (s('query')) return `"${s('query')}"`
  if (s('description')) return s('description')
  if (s('skill')) return s('skill')
  return tool
}

type Call = { code: WorkerCode; detail: string }
type Helper = {
  name: string
  type: string
  task: string
  detail: string
  isIdle: boolean
  emoji: string
  color: string
  /** When the agent finished its task: it stays a few seconds to cheer, then walks out. */
  doneAt?: number
}

// ------------------------------------------------------------------------------------------------ moods

/** One worker's run of luck: errors in a row, when the last one came, and how many cheers they have had. */
type Streak = { strikes: number; lastError: number; cheer: number }
const MAIN = 'main'
/** A run of errors with nothing new for this long fades by itself (the fire burns out). */
const STREAK_FADES_MS = 180_000
/** How long a finished agent stays at the desk, cheering, before it leaves. */
const DONE_STAY_MS = 3500
/** Tools whose success means a fix landed: an edit made, a command that ran cleanly. */
const FIXES = /^(Edit|MultiEdit|Write|NotebookEdit|Bash|PowerShell)$/

const streaks = new Map<string, Streak>()

function streakOf(who: string): Streak {
  let s = streaks.get(who)
  if (!s) streaks.set(who, (s = { strikes: 0, lastError: 0, cheer: 0 }))
  return s
}

/**
 * Notes how a tool call ended for `who` (`main`, or an agent's id): an error adds a strike; a successful edit or
 * command after errors clears them with a cheer; a passing test run is always worth a cheer. A refused call (a
 * permission denied) counts for nothing, and neither does a failed look-around (a call the engine judged read-only,
 * such as a `grep` that found nothing or a file that is not there).
 */
export function noteResult(who: string, tool: string, input: Record<string, unknown>, result: unknown, now: number): Outcome {
  if (!result || typeof result !== 'object') return null
  const r = result as { deny?: unknown; isError?: unknown; isReadOnly?: unknown }
  if (r.deny !== undefined) return null
  if (r.isError === true && r.isReadOnly === true) return null
  const s = streakOf(who)
  if (r.isError === true) {
    s.strikes = Math.min(9, s.strikes + 1)
    s.lastError = now
    return 'error'
  }
  const isTest = /^(Bash|PowerShell)$/.test(tool) && typeof input.command === 'string' && TEST_COMMAND.test(input.command)
  const wasOnFire = s.strikes >= 5
  if (FIXES.test(tool) && s.strikes > 0) {
    s.strikes = 0
    s.cheer++
  } else if (isTest) s.cheer++
  return wasOnFire && s.strikes === 0 ? 'fire-out' : isTest ? 'test-passed' : 'ok'
}

/** How a tool call went, for the features: an error that counts, the end of a desk fire, a passing test, or fine. */
type Outcome = 'error' | 'fire-out' | 'test-passed' | 'ok' | null

export function moodOf(code: WorkerCode, strikes: number): Mood {
  if (strikes >= 5) return 'panic'
  if (strikes >= 1) return 'stressed'
  if (code === 'writing' || code === 'refactoring' || code === 'testing' || code === 'terminal') return 'flow'
  if (code === 'thinking' || code === 'planning') return 'thinking'
  return 'calm'
}

/** The worker's streak as the window sees it, after letting an old run of errors fade. */
function luck(who: string, now: number): { strikes: number; cheer: number } {
  const s = streakOf(who)
  if (s.strikes > 0 && now - s.lastError > STREAK_FADES_MS) s.strikes = 0
  return { strikes: s.strikes, cheer: s.cheer }
}

// ------------------------------------------------------------------------------------------------ usage and sky

let usage: Usage = { context: null, fiveHour: null }
let sky: SkyMode = 'auto'
const SKY_KEY = 'sky'

/** Reads the context window's fill and the five-hour limit (free: these are the status line's own figures). */
async function readUsage($: EngineInterface): Promise<void> {
  try {
    const u = await $.session.usage()
    const five = u.rateLimits.find(r => r.kind === 'five_hour')
    const next: Usage = {
      context: typeof u.context.percent === 'number' ? Math.round(u.context.percent) : null,
      fiveHour: five ? Math.round(five.percentUsed) : null,
    }
    if (next.context === usage.context && next.fiveHour === usage.fiveHour) return
    usage = next
    await publish($)
  } catch {
    // no reading this time
  }
}

// The session's studio. Module variables start over on a reload, which is fine: the next events and the next agent
// poll rebuild them.
let tzMinutes: number | null = null
let inTurn = false
let arrivals = 0
let published = ''
const calls = new Map<string, Call>()
const helperCalls = new Map<string, Map<string, Call>>()
const helpers = new Map<string, Helper>()

function localTime(): { hour: number; text: string } {
  const now = Date.now()
  const offset = tzMinutes ?? -new Date(now).getTimezoneOffset()
  const d = new Date(now + offset * 60000)
  return { hour: d.getUTCHours() + d.getUTCMinutes() / 60, text: d.toISOString().slice(11, 16) }
}

function lastOf(map: Map<string, Call> | undefined): Call | undefined {
  return map ? [...map.values()].pop() : undefined
}

async function publish($: EngineInterface): Promise<void> {
  const mine = lastOf(calls)
  const mainCode: WorkerCode = mine?.code ?? (inTurn ? 'thinking' : 'idle')
  const time = localTime()
  const now = await $.clock.now()
  const mainLuck = luck(MAIN, now)
  const next: StudioInfo = {
    clock: time.text,
    hour: Math.round(time.hour * 4) / 4,
    main: {
      ...EMPTY.main,
      code: mainCode,
      label: LABEL[mainCode],
      activity: WORDS[mainCode],
      detail: mine?.detail ?? '',
      mood: moodOf(mainCode, mainLuck.strikes),
      ...mainLuck,
    },
    helpers: [...helpers.entries()].map(([id, h]) => {
      const last = lastOf(helperCalls.get(id))
      const code: WorkerCode = h.isIdle || h.doneAt ? 'idle' : (last?.code ?? 'thinking')
      const theirs = luck(id, now)
      return {
        id,
        name: h.name,
        kind: h.type,
        emoji: h.emoji,
        code,
        label: h.doneAt ? 'Done' : h.isIdle ? 'Waiting' : LABEL[code],
        activity: h.doneAt ? 'done' : h.isIdle ? 'waiting for a message' : WORDS[code],
        detail: last?.detail || h.detail || h.task,
        task: h.task,
        color: h.color,
        mood: h.doneAt ? 'calm' : moodOf(code, theirs.strikes),
        ...theirs,
      }
    }),
    usage,
    sky,
    extras: featureExtras(),
  }
  const key = JSON.stringify(next)
  if (key === published) return
  published = key
  await update($, info, () => next)
  void sendToOffice($, key)
}

function creatureFor(type: string): string {
  const taken = new Set([...helpers.values()].map(h => h.emoji))
  const own = CREATURE_BY_TYPE[type]
  if (own && !taken.has(own)) return own
  return CREATURES.find(c => !taken.has(c)) ?? CREATURES[arrivals % CREATURES.length] ?? '🐻'
}

async function syncAgents($: EngineInterface): Promise<void> {
  let list
  try {
    list = await $.agent.list()
  } catch {
    return
  }
  const live = new Map(list.filter(a => IN_ROOM.has(a.status)).map(a => [a.id, a]))
  const completed = new Set(list.filter(a => a.status === 'completed').map(a => a.id))
  const now = await $.clock.now()
  for (const [id, a] of live) {
    const name = a.type === 'teammate' ? (a.teammateId?.split('@')[0] ?? 'teammate') : a.type
    const old = helpers.get(id)
    if (old) {
      old.task = a.description
      old.isIdle = a.status === 'idle'
      continue
    }
    const k = arrivals++
    emit($, 'agent-hired', { agentId: id, agentType: a.type, task: a.description })
    helpers.set(id, {
      name,
      type: a.type,
      task: a.description,
      detail: '',
      isIdle: a.status === 'idle',
      emoji: creatureFor(a.type),
      color: CHAIRS[k % CHAIRS.length] ?? '#3fb8af',
    })
  }
  for (const [id, h] of [...helpers])
    if (!live.has(id)) {
      // an agent that finished its task stays a moment to cheer; one that failed or was stopped just leaves
      if (completed.has(id) && !h.doneAt) {
        emit($, 'agent-done', { agentId: id, agentType: h.type })
        h.doneAt = now
        streakOf(id).cheer++
        streakOf(id).strikes = 0
        continue
      }
      if (h.doneAt && now - h.doneAt < DONE_STAY_MS) continue
      helpers.delete(id)
      helperCalls.delete(id)
      streaks.delete(id)
    }
  await publish($)
}

/** Which kind of computer this is: Windows, a Mac, or Linux (and other Unix-likes). */
let platform: 'win' | 'mac' | 'linux' | '' = ''

async function platformOf($: EngineInterface): Promise<'win' | 'mac' | 'linux'> {
  if (platform) return platform
  if (/^[A-Za-z]:[\\/]/.test($.plugin.root)) return (platform = 'win')
  const ran = await $.process.run(['uname', '-s'], { timeoutMs: 5000 }).catch(() => undefined)
  return (platform = ran?.stdout.trim() === 'Darwin' ? 'mac' : 'linux')
}

/** The local time zone's offset from UTC, in minutes, from the system itself (Windows: PowerShell; elsewhere: date). */
async function findTimezone($: EngineInterface): Promise<void> {
  try {
    const isWin = (await platformOf($)) === 'win'
    const ran = await $.process.run(
      isWin ? ['powershell', '-NoProfile', '-Command', '[int][TimeZoneInfo]::Local.GetUtcOffset([DateTime]::Now).TotalMinutes'] : ['date', '+%z'],
      { timeoutMs: 8000 },
    )
    const out = ran.stdout.trim()
    const zone = /^([+-])(\d\d)(\d\d)$/.exec(out)
    const minutes = isWin ? Number.parseInt(out, 10) : zone ? (zone[1] === '-' ? -1 : 1) * (Number(zone[2]) * 60 + Number(zone[3])) : Number.NaN
    if (ran.exitCode === 0 && Number.isFinite(minutes)) {
      tzMinutes = minutes
      await publish($)
    }
  } catch {
    // keep the environment's own time zone
  }
}

// ------------------------------------------------------------------------------------------------ the window

/** Browsers that open a page as a window of its own (an "app" window, with no tabs or address bar). */
const APP_BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
]

// The office is shared: one server for every session on this computer (../office/server.mjs). The first session starts
// it as a process of its own, so it outlives that session; it writes ~/.claude/studio-office.json with its port and
// token, and every later session joins it through that file. Each session sends its own studio (its lead and agents)
// under its own id, and the window shows all of them in one room.
type Office = { port: number; token: string; pageKey: string; windows: number }
let office: Office | null = null
let joining = false
/** This session's id in the office (the session id, which a reload of the mod keeps). */
let officeId = ''
let interactive = false

async function lockPath($: EngineInterface): Promise<string> {
  const own = await $.env.get('CLAUDE_STUDIO_LOCK').catch(() => undefined)
  if (own) return own
  const home = (await $.env.get('USERPROFILE').catch(() => undefined)) || (await $.env.get('HOME').catch(() => undefined)) || ''
  return `${home.replace(/\\/g, '/').replace(/\/+$/, '')}/.claude/studio-office.json`
}

/** The office server named in the lock file, when it is really there and really the office. */
async function findOffice($: EngineInterface): Promise<Office | null> {
  try {
    const lock = JSON.parse(await $.fs.read(await lockPath($))) as { port?: unknown; token?: unknown; pageKey?: unknown }
    if (typeof lock.port !== 'number' || typeof lock.token !== 'string') return null
    const res = await $.http.fetch(`http://127.0.0.1:${lock.port}/health`)
    const health = JSON.parse(res.text) as { office?: unknown; windows?: unknown }
    if (!res.ok || health.office !== 'claude-studio') return null
    return { port: lock.port, token: lock.token, pageKey: typeof lock.pageKey === 'string' ? lock.pageKey : '', windows: Number(health.windows) || 0 }
  } catch {
    return null
  }
}

/** Starts the office server as a process of its own (not this session's child, which would die with the session). */
async function startOffice($: EngineInterface): Promise<void> {
  const script = `${$.plugin.root}/office/server.mjs`
  const argv = /^[A-Za-z]:[\\/]/.test($.plugin.root)
    ? ['powershell', '-NoProfile', '-NonInteractive', '-Command', `Start-Process -FilePath node -ArgumentList '"${script.replace(/'/g, "''")}"' -WindowStyle Hidden`]
    : // setsid puts the server in a session of its own, so it outlives the terminal and the session that started it
      ['sh', '-c', 'if command -v setsid >/dev/null 2>&1; then setsid nohup node "$0" >/dev/null 2>&1 & else nohup node "$0" >/dev/null 2>&1 & fi', script]
  await $.process.run(argv, { timeoutMs: 20000 })
}

async function post($: EngineInterface, path: OfficePath, body: string): Promise<{ status: number; text: string } | null> {
  const o = office
  if (!o) return null
  try {
    const res = await $.http.fetch(`http://127.0.0.1:${o.port}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-office-token': o.token },
      body,
    })
    return { status: res.status, text: res.text }
  } catch {
    return null
  }
}

/**
 * Sends this session's studio to the office. `state` is the studio as JSON, or '' for a heartbeat (which still sends
 * the last studio, so a server that was restarted learns it at once). When the office has gone away, this session
 * finds or starts it again.
 */
async function sendToOffice($: EngineInterface, state: string): Promise<boolean> {
  if (!office || !officeId) return false
  const whole = state || published || JSON.stringify(await read($, info))
  const res = await post($, '/state', `{"session":${JSON.stringify(officeId)},"name":${JSON.stringify(sessionName)},"cwd":${JSON.stringify(sessionCwd)},"state":${whole}}`)
  if (res && res.status < 300) return true
  if (!res || res.status === 403) {
    // the office stopped (or another one took its place): join whichever is there now
    office = null
    void joinOffice($, interactive)
  }
  return false
}

/** Asks the office whether this session should open the window: yes only when none is open and no other session is opening one. */
async function mayOpenWindow($: EngineInterface): Promise<boolean> {
  const res = await post($, '/window', `{"session":${JSON.stringify(officeId)}}`)
  if (!res) return false
  try {
    return (JSON.parse(res.text) as { open?: unknown }).open === true
  } catch {
    return false
  }
}

/** Where the window sits: the top-right quarter of the screen, or the whole right half. */
type Place = 'top-right' | 'right'
const PLACE_KEY = 'window-place'

async function placeOf($: EngineInterface): Promise<Place> {
  const stored = await $.store.get(PLACE_KEY).catch(() => undefined)
  return stored === 'right' ? 'right' : 'top-right'
}

/** The session's folder: the office shows it on the session's lead, so two sessions can be told apart. */
let sessionName = ''
/** The session's whole working folder (the window offers it when you start a new session from there). */
let sessionCwd = ''
/** The one office window's title (the page sets it); the placing helper finds the window by it. */
const windowTitle = () => TITLE

/**
 * Opens the studio page as an app window (Edge or Chrome) and places it at the right of the screen, or opens it in the
 * default browser when neither is there. `launch` always opens a new window; otherwise the office window that is
 * already open is moved and raised.
 */
async function openWindow($: EngineInterface, launch: boolean): Promise<string | null> {
  const s = office
  if (!s) return 'the studio server is not running'
  // the page key rides after the #, which the browser keeps to itself: it lets the window ask things of the office
  const url = `http://127.0.0.1:${s.port}/${s.pageKey ? `#key=${s.pageKey}` : ''}`
  if (/^[A-Za-z]:[\\/]/.test($.plugin.root)) {
    let browser = ''
    for (const path of APP_BROWSERS) {
      const found = await $.fs.stat(path).catch(() => undefined)
      if (found?.kind === 'file') {
        browser = path
        break
      }
    }
    // the helper starts the browser through Start-Process, which hands it off, so the window lives on by itself
    const argv = [
      'powershell',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      `${$.plugin.root}/office/place-window.ps1`,
      '-Url',
      url,
      '-Place',
      await placeOf($),
      '-Title',
      windowTitle(),
      ...(browser ? ['-Browser', browser] : []),
      ...(launch ? ['-Launch'] : []),
    ]
    const ran = await $.process
      .run(argv, { timeoutMs: 60000 })
      .catch((err: unknown) => ({ exitCode: 1, stdout: '', stderr: String(err) }))
    return ran.exitCode === 0 ? null : ran.stderr.trim().split('\n')[0] || 'the browser did not start'
  }
  if ((await platformOf($)) === 'mac') {
    for (const argv of [['open', '-na', 'Google Chrome', '--args', `--app=${url}`], ['open', url]]) {
      const ran = await $.process.run(argv, { timeoutMs: 15000 }).catch(() => undefined)
      if (ran?.exitCode === 0) return null
    }
    return 'no browser could be started'
  }
  // Linux: bring the open window forward (i3, or any window manager wmctrl knows), else open an app window in the
  // first Chromium-family browser there is (each in a session of its own, so it outlives this one), else the default
  const ran = await $.process.run(['sh', '-c', LINUX_WINDOW, url, launch ? 'launch' : 'raise', windowTitle()], { timeoutMs: 15000 }).catch(() => undefined)
  if (ran?.exitCode === 0) return null
  return ran?.stderr.trim().split('\n')[0] || 'no browser could be started'
}

/**
 * The Linux window script: $0 the address, $1 'launch' or 'raise', $2 the window's title. Raising tries i3 and wmctrl
 * first and falls through to opening a window when neither finds it.
 */
const LINUX_WINDOW = [
  'url="$0"; mode="$1"; title="$2"',
  'bg() { if command -v setsid >/dev/null 2>&1; then setsid "$@" >/dev/null 2>&1 & else nohup "$@" >/dev/null 2>&1 & fi; }',
  'if [ "$mode" = raise ]; then',
  '  if command -v i3-msg >/dev/null 2>&1 && i3-msg "[title=\"^$title\"] focus" 2>/dev/null | grep -q \'"success":true\'; then exit 0; fi',
  '  if command -v wmctrl >/dev/null 2>&1 && wmctrl -a "$title" 2>/dev/null; then exit 0; fi',
  'fi',
  'for b in google-chrome google-chrome-stable chromium chromium-browser microsoft-edge microsoft-edge-stable brave-browser vivaldi; do',
  '  if command -v "$b" >/dev/null 2>&1; then bg "$b" --new-window --app="$url"; exit 0; fi',
  'done',
  'if command -v xdg-open >/dev/null 2>&1; then bg xdg-open "$url"; exit 0; fi',
  'echo "no browser found (install Chrome, Chromium, Edge or Brave)" >&2; exit 1',
].join('\n')

/** The terminal pane, for when the window cannot open or on `/office pane`. */
async function openPane($: EngineInterface): Promise<string | null> {
  try {
    const opened = await $.ui.open({ id: PANE, title: TITLE, columns: 64 })
    return opened.isPlaced ? null : opened.reason || 'the terminal has no room for it'
  } catch (err) {
    return String(err)
  }
}

/**
 * Joins the shared office: finds its server (or starts it and waits for it), sends it this session's studio and, when
 * `open` and no office window is open yet, opens the window. A session that joins an office whose window is already
 * open opens nothing: its lead simply walks into that room.
 */
async function joinOffice($: EngineInterface, open: boolean): Promise<void> {
  if (office || joining) return
  joining = true
  try {
    let found = await findOffice($)
    if (!found) {
      await startOffice($).catch((err: unknown) => $.ui.log(`Claude's studio server did not start: ${String(err)}`, { to: 'debug' }))
      for (let i = 0; i < 40 && !found; i++) {
        await $.clock.sleep(250)
        found = await findOffice($)
      }
    }
    if (!found) {
      $.ui.log("Claude's studio server did not start", { to: 'debug' })
      if (open) void openPane($)
      return
    }
    office = found
    await sendToOffice($, '')
    emit($, 'session-ready', {})
    if (open && found.windows === 0 && (await mayOpenWindow($))) {
      const problem = await openWindow($, true)
      if (problem) {
        $.ui.log(`Claude's studio window did not open: ${problem}`, { to: 'debug' })
        void openPane($)
      }
    }
  } finally {
    joining = false
  }
}

// ------------------------------------------------------------------------------------------------ features

/** Tells the features about a moment of this session (see hooks/features/kit.ts); one feature's trouble is not the session's. */
function emit($: EngineInterface, signal: Signal, data: SignalData): void {
  try {
    signalYourTurn($, signal, data)
  } catch {}
  try {
    signalWhiteboard($, signal, data)
  } catch {}
  try {
    signalProgress($, signal, data)
  } catch {}
  try {
    signalPaperwork($, signal, data)
  } catch {}
  try {
    signalShiftReport($, signal, data)
  } catch {}
  try {
    signalControl($, signal, data)
  } catch {}
}

function featureExtras(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of FEATURES) {
    try {
      const v = f.extras?.()
      if (v !== undefined) out[f.name] = v
    } catch {
      // leave that feature's extras out this time
    }
  }
  return out
}

/** Adds what the progress feature counted to the office's lifetime counts. */
async function sendStats($: EngineInterface): Promise<void> {
  if (!office) return
  let add: Record<string, number> | null = null
  try {
    add = takeProgressStats()
  } catch {
    return
  }
  if (add && Object.keys(add).length) await post($, '/stat', JSON.stringify({ session: officeId, add }))
}

let polling = false

/** Picks up what the window asked this session to do (a prompt, a new agent) and does it. */
async function pollInbox($: EngineInterface): Promise<void> {
  if (!office || polling) return
  polling = true
  try {
    const res = await post($, '/inbox', JSON.stringify({ session: officeId }))
    if (!res || res.status !== 200) return
    const { commands } = JSON.parse(res.text) as { commands?: InboxCommand[] }
    for (const command of commands ?? []) {
      try {
        if (command.kind === 'prompt' || command.kind === 'agent') await runControlCommand($, command as Command)
        else {
          // a command a server feature queued (a persona to write...): its answer goes back to the server
          const reply = await runCharactersCommand($, command)
          if (reply !== undefined) await post($, '/reply', JSON.stringify({ session: officeId, id: command.id, kind: command.kind, reply }))
        }
      } catch (err) {
        $.ui.log(`Claude's studio could not do what the window asked: ${String(err)}`, { to: 'debug' })
      }
    }
  } catch {
    // try again at the next poll
  } finally {
    polling = false
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'office',
      description:
        "Open Claude's studio window: `/office right` for the right half of the screen, `/office corner` for the top-right quarter, `/office day`, `/office night` or `/office auto` for the sky, `/office pane` for the small terminal version",
    })
    sessionName = e.cwd.split(/[\\/]/).filter(Boolean).pop() ?? ''
    sessionCwd = e.cwd
    emit($, 'session-start', { cwd: e.cwd })
    officeId = (await $.session.id().catch(() => '')) || officeId || `s${Math.random().toString(36).slice(2, 12)}`
    const storedSky = await $.store.get(SKY_KEY).catch(() => undefined)
    if (storedSky === 'day' || storedSky === 'night' || storedSky === 'auto') sky = storedSky
    if (tzMinutes === null && new Date().getTimezoneOffset() === 0) void findTimezone($)
    $.clock.every(1000, () => void syncAgents($))
    $.clock.every(20000, () => void publish($).catch(() => undefined))
    $.clock.every(5000, () => void readUsage($))
    // a heartbeat, so the office knows this session is still here (it lets a session go after 35 quiet seconds)
    $.clock.every(10000, () => void sendToOffice($, ''))
    // the progress feature's counts, and what the window asks of this session (a prompt, a new agent)
    $.clock.every(5000, () => void sendStats($))
    $.clock.every(1500, () => void pollInbox($))
    // only where a person is at the prompt: a `claude -p` run or an SDK host joins no office
    interactive = e.isInteractive
    if (e.isInteractive) void joinOffice($, true)
    return next(e)
  })

  // the session's lead and agents walk out of the office (a /clear keeps them: the same person carries on)
  on('session.end', async ($, e, next) => {
    if (e.reason !== 'clear' && office) {
      await post($, '/leave', `{"session":${JSON.stringify(officeId)}}`)
      office = null
    }
    return next(e)
  })

  on('command.run', { command: 'office' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'pane') {
      const problem = await openPane($)
      return { text: problem ? `The studio pane could not open: ${problem}` : "Claude's studio pane is open beside the chat." }
    }
    let where = ''
    if (/^(right|half|right half)$/.test(arg)) {
      await $.store.set(PLACE_KEY, 'right')
      where = ' It sits on the right half of the screen from now on.'
    } else if (/^(corner|top-right|top right|quarter)$/.test(arg)) {
      await $.store.set(PLACE_KEY, 'top-right')
      where = ' It sits in the top-right quarter of the screen from now on.'
    } else if (/^(day|night|auto)$/.test(arg)) {
      sky = arg as SkyMode
      await $.store.set(SKY_KEY, sky)
      await publish($)
      const words = sky === 'auto' ? 'follows your clock again' : `stays ${sky === 'day' ? 'daytime' : 'night-time'} until you type /office auto`
      return { text: `The studio's sky ${words}.` }
    } else if (arg) return { text: 'Try /office, /office right, /office corner, /office day, /office night, /office auto or /office pane.' }
    if (!office) {
      void joinOffice($, true)
      return { text: `Starting Claude's studio window…${where}` }
    }
    const problem = await openWindow($, false)
    return { text: problem ? `The studio window could not open: ${problem}. Try /office pane.` : `Claude's studio window is open.${where}` }
  })

  on('turn.start', ($, e, next) => {
    emit($, 'turn-start', e.agentId ? { agentId: e.agentId } : {})
    if (!e.agentId) {
      inTurn = true
      void publish($).catch(() => undefined)
    }
    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    emit($, 'turn-complete', e.agentId ? { agentId: e.agentId } : {})
    if (!e.agentId) {
      inTurn = false
      calls.clear()
      void publish($).catch(() => undefined)
      void readUsage($)
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const input = e as unknown as Record<string, unknown>
    const call: Call = { code: activityOf(String(e.tool), input), detail: detailOf(input) }
    const id = e.tool_use_id
    const agent = e.agentId
    if (agent) {
      const mine = helperCalls.get(agent) ?? new Map<string, Call>()
      mine.set(id, call)
      helperCalls.set(agent, mine)
      const h = helpers.get(agent)
      if (h) h.detail = call.detail
    } else calls.set(id, call)
    emit($, 'tool-start', { tool: String(e.tool), toolUseId: id, input, ...(agent ? { agentId: agent } : {}) })
    // written before the tool runs, so the badges already say what it is doing
    await publish($).catch(() => undefined)
    let result: unknown
    try {
      result = await next(e)
      return result as Awaited<ReturnType<typeof next>>
    } finally {
      if (agent) helperCalls.get(agent)?.delete(id)
      else calls.delete(id)
      const who = agent ?? MAIN
      emit($, 'tool-end', { tool: String(e.tool), toolUseId: id, input, result, ...(agent ? { agentId: agent } : {}) })
      const outcome = noteResult(who, String(e.tool), input, result, await $.clock.now())
      if (outcome === 'error') emit($, 'error', { who, tool: String(e.tool), strikes: streakOf(who).strikes })
      if (outcome === 'fire-out') emit($, 'fire-out', { who })
      if (outcome === 'test-passed') emit($, 'test-passed', { who })
      const file = typeof input.file_path === 'string' ? input.file_path : typeof input.notebook_path === 'string' ? input.notebook_path : ''
      if (outcome && outcome !== 'error' && /^(Edit|MultiEdit|Write|NotebookEdit)$/.test(String(e.tool)) && file) emit($, 'edit', { who, tool: String(e.tool), file })
      void publish($).catch(() => undefined)
    }
  }).catch(($, e, next) => next(e)) // the studio only watches: whatever goes wrong here, the tool call goes on

  // the feature modules add their own hooks after the core mod's (hooks/features/)
  installYourTurn(on)
  installWhiteboard(on)
  installProgress(on)
  installPaperwork(on)
  installShiftReport(on)
  installControl(on)

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const data = await read($, info)
    const shown = data.helpers.slice(0, 4)
    const extra = data.helpers.length - shown.length
    const textRows = 2 + shown.length + (extra > 0 ? 1 : 0)
    const bodyRows = e.props.scroll?.bodyRows || e.viewport?.rows || 24
    const cols = Math.max(30, Math.min(120, e.props.bodyColumns))
    const rows = Math.max(11, Math.min(20, bodyRows - textRows))
    const clock = data.clock || localTime().text
    const team = data.helpers.length === 0 ? 'just Claude today' : `team of ${data.helpers.length + 1}`

    const detailFor = (w: Worker) => {
      const room = Math.max(4, cols - w.name.length - w.activity.length - 8)
      return w.detail ? ' · ' + short(w.detail, room) : ''
    }

    if (e.surface === 'terminal') {
      const { Box, Text, Client } = $.ui.resolve(e)
      const m = data.main
      const scene: SceneProps = {
        cols,
        rows,
        hour: data.hour,
        main: PANE_CODE[m.code] ?? 'thinking',
        board: `${BOARD_ICON[m.code] ?? '💭'} ${m.activity}${m.detail ? ' · ' + m.detail : ''}`,
        helpers: data.helpers.map(h => ({ id: h.id, emoji: h.emoji, code: PANE_CODE[h.code] ?? 'thinking', color: h.color })),
      }
      const row = (w: Worker, key: string) => (
        <Box key={key} flexDirection="row">
          <Text>{w.emoji} </Text>
          <Text color={w.color} bold>
            {w.name}
          </Text>
          <Text> {w.activity}</Text>
          <Text dimColor>{detailFor(w)}</Text>
        </Box>
      )
      return (
        <Box flexDirection="column">
          <Client key="office" module="./studio.tsx" props={scene} width={cols} height={rows} />
          {row(data.main, 'main')}
          {shown.map((w, i) => row(w, `helper-${i}`))}
          {extra > 0 && <Text dimColor>+{extra} more {extra === 1 ? 'helper' : 'helpers'}</Text>}
          <Text dimColor>
            {clock} · {team} · /office
          </Text>
        </Box>
      )
    }

    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Text bold>{TITLE}</Text>
        {[data.main, ...data.helpers].map(w => (
          <Text>
            {w.emoji} {w.name} {w.activity}
            {detailFor(w)}
          </Text>
        ))}
        <Text dimColor>
          {clock} · {team}
        </Text>
      </Box>
    )
  })
}
