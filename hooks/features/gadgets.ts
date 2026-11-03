// Desk gadgets: an alarm clock for scheduled runs and a desk phone for MCP tools. (see ./kit.ts)
//
// Alarm clock. A scheduled run is something that will wake the session later:
//   ScheduleWakeup   one wake-up per session (a new one replaces the old; `stop: true` clears it)
//   CronCreate       a cron job (recurring, or once); CronDelete removes it; CronList tells us what exists
// The mod keeps a short list of them, `{ id, kind, at, label }` (`at` is the next run as epoch ms, or null when it
// cannot be worked out). When the time has passed and the main loop starts a turn soon after, the alarm "rang": the
// window shakes the clock. A recurring cron job then moves on to its next time.
//
// Desk phone. A tool call named `mcp__<server>__<tool>` is a call to that service. It starts at tool-start and ends at
// tool-end (ok, or failed). `who` is 'main' or an agent's id. A person's phone stays on their desk once they have used
// an MCP tool (`phones`). Calls that ended stay in `callsDone` for a minute, so the window sees a very short call.
//
// extras() is `{ alarms, rang, calls, callsDone, phones }`, or nothing while the session has used neither gadget.

import type { EngineInterface } from 'claude-code'

import type { Feature, On, Signal, SignalData } from './kit'

type Alarm = { id: string; kind: 'wakeup' | 'cron'; at: number | null; label: string; cron?: string; recurring?: boolean; made: number }
type Call = { id: string; who: string; service: string; since: number }
type Done = { id: string; who: string; service: string; ok: boolean; at: number }

/** A turn that starts this soon after an alarm's time was the alarm ringing. */
const RING_WINDOW_MS = 120_000
const RANG_KEPT_MS = 60_000
const DONE_KEPT_MS = 60_000
const CRON_LIFE_MS = 7 * 24 * 3600_000
const MOST_ALARMS = 8
const MOST_DONE = 8
const MOST_PHONES = 12

let alarms: Alarm[] = []
let rang: { id: string; at: number; label: string } | null = null
const calls = new Map<string, Call>()
let done: Done[] = []
const phones = new Set<string>()
let seq = 0

// ------------------------------------------------------------------------------------------------ cron

type Cron = { minute: number[]; hour: number[]; dom: number[]; month: number[]; dow: number[]; domAny: boolean; dowAny: boolean }

/** One cron field ("*", "*\/5", "1,15", "9-17", "0-30/10") as the sorted values it allows, or null if it makes no sense. */
function parseField(text: string, min: number, max: number): number[] | null {
  const out = new Set<number>()
  for (const part of text.split(',')) {
    const m = /^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part)
    if (!m) return null
    const step = m[4] === undefined ? 1 : Number(m[4])
    if (!(step > 0)) return null
    let from = min
    let to = max
    if (m[1] !== '*') {
      from = Number(m[2])
      to = m[3] === undefined ? (m[4] === undefined ? from : max) : Number(m[3])
    }
    if (from < min || to > max || from > to) return null
    for (let v = from; v <= to; v += step) out.add(v)
  }
  return [...out].sort((a, b) => a - b)
}

/** A standard 5-field cron expression ("M H DoM Mon DoW"), or null when it cannot be read (names like MON are not). */
export function parseCron(text: string): Cron | null {
  const f = text.trim().split(/\s+/)
  if (f.length !== 5) return null
  const minute = parseField(f[0], 0, 59)
  const hour = parseField(f[1], 0, 23)
  const dom = parseField(f[2], 1, 31)
  const month = parseField(f[3], 1, 12)
  const dowRaw = parseField(f[4], 0, 7)
  if (!minute || !hour || !dom || !month || !dowRaw) return null
  const dow = [...new Set(dowRaw.map(d => d % 7))].sort((a, b) => a - b)
  return { minute, hour, dom, month, dow, domAny: f[2] === '*', dowAny: f[4] === '*' }
}

/** The next time (epoch ms, local time) after `from` that the cron expression fires, or null if it cannot be worked out. */
export function nextCronRun(text: string, from: number = Date.now()): number | null {
  const cron = parseCron(text)
  if (!cron) return null
  const start = new Date(from)
  start.setSeconds(0, 0)
  const after = start.getTime() + 60_000
  for (let offset = 0; offset < 1500; offset++) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset)
    if (!cron.month.includes(day.getMonth() + 1)) continue
    const domOk = cron.dom.includes(day.getDate())
    const dowOk = cron.dow.includes(day.getDay())
    const dayOk = cron.domAny && cron.dowAny ? true : cron.domAny ? dowOk : cron.dowAny ? domOk : domOk || dowOk
    if (!dayOk) continue
    for (const h of cron.hour)
      for (const m of cron.minute) {
        const t = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m).getTime()
        if (t >= after) return t
      }
  }
  return null
}

// ------------------------------------------------------------------------------------------------ names

/** "claude_ai_Slack" -> "Slack", "plugin_playwright_playwright" -> "Playwright", "my-server" -> "My server". */
export function prettyService(server: string): string {
  const s = server.replace(/^claude[_\s-]?ai[_\s-]/i, '').replace(/^plugin[_-]/i, '')
  const words: string[] = []
  for (const w of s.split(/[_\-\s]+/).filter(Boolean)) if (words[words.length - 1]?.toLowerCase() !== w.toLowerCase()) words.push(w)
  const text = words.join(' ')
  return text ? text[0].toUpperCase() + text.slice(1) : 'a service'
}

/** The server part of an `mcp__<server>__<tool>` tool name, or null for any other tool. */
function mcpServer(tool: string | undefined): string | null {
  const m = /^mcp__(.+?)__.+$/.exec(tool ?? '')
  return m ? m[1] : null
}

// ------------------------------------------------------------------------------------------------ helpers

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})

/** What a tool returned: the engine wraps it as `{ result }` (or `{ isError }`). */
function payload(result: unknown): Record<string, unknown> {
  const r = asRecord(result)
  return r.result && typeof r.result === 'object' ? asRecord(r.result) : r
}

const failed = (result: unknown): boolean => asRecord(result).isError === true

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** A short single line for the clock's hover hint. */
function shorten(v: unknown, fallback: string): string {
  const line = typeof v === 'string' ? (v.split('\n').find(l => l.trim()) ?? '').trim() : ''
  if (!line) return fallback
  return line.length > 70 ? `${line.slice(0, 69)}…` : line
}

function addAlarm(a: Alarm): void {
  alarms = alarms.filter(x => x.id !== a.id)
  alarms.push(a)
  if (alarms.length > MOST_ALARMS) alarms = alarms.sort((x, y) => y.made - x.made).slice(0, MOST_ALARMS)
}

/** Drops what is too old: a wake-up nobody heard, a cron job past its week; a recurring cron job moves to its next run. */
function tidy(now: number): void {
  const next: Alarm[] = []
  for (const a of alarms) {
    if (a.kind === 'cron' && now - a.made > CRON_LIFE_MS) continue
    if (a.at !== null && now - a.at > RING_WINDOW_MS) {
      if (a.kind === 'wakeup' || !a.recurring) continue
      a.at = a.cron ? nextCronRun(a.cron, now) : null
    }
    next.push(a)
  }
  alarms = next
  if (rang && now - rang.at > RANG_KEPT_MS) rang = null
  done = done.filter(d => now - d.at < DONE_KEPT_MS).slice(-MOST_DONE)
}

/** The main loop started a turn: an alarm whose time was just before it has rung. */
function ring(now: number): void {
  tidy(now)
  const next: Alarm[] = []
  for (const a of alarms) {
    if (a.at === null || a.at > now) {
      next.push(a)
      continue
    }
    rang = { id: a.id, at: now, label: a.label }
    if (a.kind === 'cron' && a.recurring) {
      a.at = a.cron ? nextCronRun(a.cron, now) : null
      next.push(a)
    }
  }
  alarms = next
}

// ------------------------------------------------------------------------------------------------ the feature

export const gadgets: Feature = {
  name: 'gadgets',
  extras() {
    const now = Date.now()
    tidy(now)
    if (!alarms.length && !rang && !calls.size && !done.length && !phones.size) return undefined
    return {
      alarms: alarms.map(a => ({ id: a.id, kind: a.kind, at: a.at, label: a.label })),
      rang,
      calls: [...calls.values()],
      callsDone: done,
      phones: [...phones],
    }
  },
}

export function installGadgets(on: On): void {
  void on
}

/** A scheduling tool call went through: note the alarm it made or removed. */
function scheduled(data: SignalData): void {
  const input = asRecord(data.input)
  const out = payload(data.result)
  const now = Date.now()
  if (data.tool === 'ScheduleWakeup') {
    alarms = alarms.filter(a => a.kind !== 'wakeup')
    if (input.stop === true) return
    const delay = Math.max(60, Math.min(3600, num(input.delaySeconds) ?? 60))
    addAlarm({ id: 'wakeup', kind: 'wakeup', at: num(out.scheduledFor) ?? now + delay * 1000, label: shorten(input.reason, 'Scheduled wake-up'), made: now })
  } else if (data.tool === 'CronCreate') {
    const cron = typeof input.cron === 'string' ? input.cron : ''
    const id = typeof out.id === 'string' ? out.id : `cron-${++seq}`
    addAlarm({
      id,
      kind: 'cron',
      at: num(out.nextFireAt) ?? nextCronRun(cron, now),
      label: shorten(input.prompt, cron || 'Scheduled job'),
      cron,
      recurring: input.recurring !== false,
      made: now,
    })
  } else if (data.tool === 'CronDelete') {
    alarms = alarms.filter(a => a.id !== input.id)
  } else if (data.tool === 'CronList' && Array.isArray(out.jobs)) {
    // the list is the truth about cron jobs: learn the ones made before we looked, drop the ones that are gone
    const jobs = out.jobs.map(asRecord).filter(j => typeof j.id === 'string')
    const ids = new Set(jobs.map(j => String(j.id)))
    alarms = alarms.filter(a => a.kind !== 'cron' || ids.has(a.id))
    for (const j of jobs) {
      const old = alarms.find(a => a.id === j.id)
      const cron = typeof j.cron === 'string' ? j.cron : ''
      addAlarm({
        id: String(j.id),
        kind: 'cron',
        at: num(j.nextFireAt) ?? old?.at ?? nextCronRun(cron, now),
        label: old?.label ?? shorten(j.prompt, cron || 'Scheduled job'),
        cron,
        recurring: j.recurring !== false,
        made: old?.made ?? now,
      })
    }
  }
}

function endCall(data: SignalData, who: string): void {
  const id = data.toolUseId ?? ''
  const open = calls.get(id)
  const server = mcpServer(data.tool)
  if (!open && server === null) return
  calls.delete(id)
  const service = open?.service ?? prettyService(server ?? '')
  done = [...done.filter(d => d.id !== id), { id, who, service, ok: !failed(data.result), at: Date.now() }].slice(-MOST_DONE)
}

export function signalGadgets($: EngineInterface, signal: Signal, data: SignalData): void {
  void $
  const who = data.agentId ?? 'main'
  if (signal === 'tool-start') {
    const server = mcpServer(data.tool)
    if (server !== null && data.toolUseId) {
      calls.set(data.toolUseId, { id: data.toolUseId, who, service: prettyService(server), since: Date.now() })
      phones.delete(who)
      phones.add(who)
      while (phones.size > MOST_PHONES) phones.delete(phones.values().next().value as string)
    }
  } else if (signal === 'tool-end') {
    endCall(data, who)
    if (!failed(data.result)) scheduled(data)
  } else if (signal === 'turn-start' && !data.agentId) {
    ring(Date.now())
  } else if (signal === 'turn-complete' && !data.agentId) {
    // no call outlives the turn it was made in
    for (const [id, c] of calls) if (c.who === 'main') calls.delete(id)
  } else if (signal === 'agent-done' && data.agentId) {
    for (const [id, c] of calls) if (c.who === data.agentId) calls.delete(id)
  }
}
