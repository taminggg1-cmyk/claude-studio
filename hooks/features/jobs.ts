// The jobs feature (see ./kit.ts): long and background shell commands show as a little machine by the person's desk
// until they end. The window (office/features/jobs.js) draws the machines.
//
// What counts as a job:
//   - a Bash or PowerShell call: sent from the moment it starts, with its start time. The window shows a machine only
//     once it has run for more than 6 seconds, so quick commands never get one.
//   - a Bash or PowerShell call with `run_in_background` (or one the person moved to the background with Ctrl+B, or
//     that hit its timeout): its call returns at once, with the task's id (`backgroundTaskId` in the result). It stays
//     a job after the call has returned, until the task really ends.
//   - a Monitor call: a "watching" job. Monitor also returns at once with a task id (`taskId`) and watches on in the
//     background until its command exits, its deadline (`timeoutMs`) passes, or it is stopped.
//
// How the mod learns that a background task ended (what this build of the engine offers, most reliable first):
//   1. The task's notification. When a background shell or monitor ends, the engine queues a message for the model:
//      `<task-notification><task-id>…</task-id><tool-use-id>…</tool-use-id><status>completed|failed|killed</status>
//      <summary>… (exit code N)</summary></task-notification>`. It is added to the conversation as a row, which raises
//      `session.append`: with origin `task-notification` when it starts a turn of its own, or origin `engine` when it
//      is delivered into a running turn. Both hooks below have a matcher, so they stand beside any other feature's.
//   2. `classic.Stop` and `classic.SubagentStop` carry `background_tasks`: every background task still in flight in
//      the session. A job whose task is no longer listed has ended (how it went is then unknown).
//   3. A TaskStop (or the older KillShell) call that stopped the task; a BashOutput / TaskOutput call whose result says
//      the task is no longer running (those tools are not in this build, but older ones have them).
//   4. A background shell of a subagent that runs in the foreground ends with that agent's last answer
//      (`backgroundEndsWithFinalResponse` in the result): it ends when the agent is done.
//   5. Last resort: a background job nothing has said anything about for 30 minutes is dropped, a monitor a minute past
//      its deadline, and every job when the session ends.
//
// extras() is { jobs: [{ id, who, kind: 'shell' | 'background' | 'monitor', label, since }], done: [{ id, who, ok, at }] }:
// `who` is 'main' or the agent's id, `since` and `at` epoch milliseconds, `ok` true, false or null (ended, how is not
// known: stopped, or seen gone). A finished job stays in `done` for 15 seconds, so the window can light it green or red.

import type { EngineInterface } from 'claude-code'

import type { Feature, On, Signal, SignalData } from './kit'

type Kind = 'shell' | 'background' | 'monitor'
type Job = {
  /** The id of the call that started it. */
  id: string
  who: string
  kind: Kind
  label: string
  since: number
  /** The background task's id, once the call returned it. */
  task?: string
  /** When anything last said this job is still there. */
  seen: number
  /** A monitor's deadline (plus a minute's grace). */
  until?: number
  /** It ends with its agent's final answer. */
  withOwner?: boolean
}
type Done = { id: string; who: string; ok: boolean | null; at: number }

const SHOWN_AFTER_MS = 6_000
const DONE_KEPT_MS = 15_000
const QUIET_MS = 30 * 60_000
const STUCK_CALL_MS = 15 * 60_000
const MOST_JOBS = 16
const MOST_DONE = 10
const ENDED = /^(completed|complete|done|success|succeeded|failed|failure|error|errored|killed|stopped|cancelled|canceled|timeout|timed_out|expired)$/i

const running = new Map<string, Job>()
let done: Done[] = []
/** Tasks that ended before their call had returned (seldom): task id -> how it went. */
const endedEarly = new Map<string, boolean | null>()

const short = (words: string, max: number) => {
  const one = words.replace(/\s+/g, ' ').trim()
  return one.length > max ? one.slice(0, max - 1) + '…' : one
}
const record = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})
const text = (v: unknown) => (typeof v === 'string' ? v : '')
const isShell = (tool: string) => tool === 'Bash' || tool === 'PowerShell'

export const jobs: Feature = {
  name: 'jobs',
  extras: () => {
    const now = Date.now()
    const list = [...running.values()].slice(-MOST_JOBS).map(j => ({ id: j.id, who: j.who, kind: j.kind, label: j.label, since: j.since }))
    return { jobs: list, done: done.filter(d => now - d.at < DONE_KEPT_MS) }
  },
}

export function installJobs(on: On): void {
  // a background task's notification: it starts a turn of its own, or is delivered into a running one
  on('session.append', { origin: { kind: 'task-notification' } }, ($, e, next) => {
    readRow(e.message?.content)
    return next(e)
  }).catch(($, e, next) => next(e))
  on('session.append', { origin: { kind: 'engine' } }, ($, e, next) => {
    readRow(e.message?.content)
    return next(e)
  }).catch(($, e, next) => next(e))

  // every stop lists the background work still in flight
  on('classic.Stop', { hook_event_name: 'Stop' }, ($, e, next) => {
    stillRunning(e.background_tasks)
    return next(e)
  }).catch(($, e, next) => next(e))
  on('classic.SubagentStop', { hook_event_name: 'SubagentStop' }, ($, e, next) => {
    stillRunning(e.background_tasks)
    return next(e)
  }).catch(($, e, next) => next(e))

  // the session ends: its jobs end with it (a /clear keeps them: the same session carries on)
  on('classic.SessionEnd', { hook_event_name: 'SessionEnd' }, ($, e, next) => {
    if (e.reason !== 'clear') {
      running.clear()
      done = []
    }
    return next(e)
  }).catch(($, e, next) => next(e))
}

export function signalJobs($: EngineInterface, signal: Signal, data: SignalData): void {
  if (signal === 'session-start') {
    $.clock.every(5000, () => sweep())
    return
  }
  if (signal === 'tool-start') startCall(data)
  else if (signal === 'tool-end') endCall(data)
  else if (signal === 'agent-done' && data.agentId) {
    for (const j of [...running.values()]) if (j.withOwner && j.who === data.agentId) finish(j, null)
  }
}

function startCall(data: SignalData): void {
  const tool = data.tool ?? ''
  const id = data.toolUseId
  if (!id || (!isShell(tool) && tool !== 'Monitor')) return
  const input = data.input ?? {}
  const now = Date.now()
  const kind: Kind = tool === 'Monitor' ? 'monitor' : input.run_in_background === true ? 'background' : 'shell'
  running.set(id, { id, who: data.agentId ?? 'main', kind, label: labelOf(tool, input), since: now, seen: now })
}

function labelOf(tool: string, input: Record<string, unknown>): string {
  const command = text(input.command)
  if (tool === 'Monitor') return short(text(input.description) || command || 'a watch', 80)
  return short(command || text(input.description) || tool, 80)
}

function endCall(data: SignalData): void {
  const tool = data.tool ?? ''
  if (isShell(tool) || tool === 'Monitor') return endJobCall(tool, data)
  if (/^(TaskStop|KillShell|BashOutput|TaskOutput)$/.test(tool)) return taskTool(tool, data)
}

function endJobCall(tool: string, data: SignalData): void {
  const id = data.toolUseId
  if (!id) return
  const res = record(data.result)
  const out = record(res.result)
  const failed = res.isError === true || 'deny' in res
  const task = text(out.backgroundTaskId) || (tool === 'Monitor' ? text(out.taskId) : '')
  const now = Date.now()
  let job = running.get(id)
  if (task && !failed) {
    // it runs on in the background
    if (!job) job = { id, who: data.agentId ?? 'main', kind: 'background', label: labelOf(tool, data.input ?? {}), since: now, seen: now }
    if (job.kind === 'shell') job.kind = 'background'
    job.task = task
    job.seen = now
    if (job.who !== 'main' && out.backgroundEndsWithFinalResponse === true) job.withOwner = true
    const timeout = Number(out.timeoutMs)
    if (tool === 'Monitor' && timeout > 0) job.until = now + timeout + 60_000
    running.set(id, job)
    if (endedEarly.has(task)) {
      finish(job, endedEarly.get(task) ?? null)
      endedEarly.delete(task)
    }
    return
  }
  if (!job) return
  running.delete(id)
  // a quick command never showed a machine: nothing to light up
  if (job.kind === 'shell' && now - job.since <= SHOWN_AFTER_MS) return
  addDone(job, !failed && out.interrupted !== true)
}

/** TaskStop / KillShell stopped a task; BashOutput / TaskOutput may say one has ended. */
function taskTool(tool: string, data: SignalData): void {
  const input = data.input ?? {}
  const res = record(data.result)
  const out = record(res.result)
  const task = text(out.task_id) || text(input.task_id) || text(input.shell_id) || text(input.bash_id) || text(input.taskId)
  const job = task ? byTask(task) : undefined
  if (!job || res.isError === true) return
  if (tool === 'TaskStop' || tool === 'KillShell') return finish(job, null)
  const inner = record(out.task)
  const status = text(out.status) || text(inner.status)
  const code = out.exitCode ?? out.exit_code ?? inner.exitCode ?? inner.exit_code
  if (status && ENDED.test(status)) finish(job, verdict(status, typeof code === 'number' ? code : null))
  else job.seen = Date.now()
}

const byTask = (task: string) => [...running.values()].find(j => j.task === task)

/** How a task went, from its status word and exit code: true, false, or null when it was stopped. */
function verdict(status: string, exit: number | null): boolean | null {
  const s = status.toLowerCase()
  if (/fail|error|timeout|timed_out/.test(s)) return false
  if (/kill|stop|cancel|expired/.test(s)) return null
  return exit === null ? true : exit === 0
}

/** Reads a conversation row for task notifications. */
function readRow(content: unknown): void {
  let all = ''
  if (typeof content === 'string') all = content
  else if (Array.isArray(content)) for (const block of content) all += text(record(block).text) + '\n'
  if (!all.includes('<task-notification')) return
  for (const m of all.matchAll(/<task-notification>([\s\S]*?)<\/task-notification>/g)) {
    const body = m[1] ?? ''
    const tag = (name: string) => new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(body)?.[1]?.trim() ?? ''
    const task = tag('task-id') || tag('shell-id')
    const call = tag('tool-use-id')
    const status = tag('status')
    const exit = /exit code:? (-?\d+)/i.exec(tag('summary') || body)
    const job = (call && running.get(call)) || (task ? byTask(task) : undefined)
    if (!status || !ENDED.test(status)) {
      // news from a task that runs on (a monitor's event): it is still there
      if (job) job.seen = Date.now()
      continue
    }
    const ok = verdict(status, exit ? Number(exit[1]) : null)
    if (job && (job.task || job.kind !== 'shell')) finish(job, ok)
    else if (task) {
      endedEarly.set(task, ok)
      while (endedEarly.size > 20) endedEarly.delete(endedEarly.keys().next().value as string)
    }
  }
}

/** A stop's list of the background work still in flight: the jobs it no longer lists have ended. */
function stillRunning(list: unknown): void {
  if (!Array.isArray(list)) return
  const ids = new Set(list.map(t => text(record(t).id)).filter(Boolean))
  const now = Date.now()
  for (const j of [...running.values()]) {
    if (!j.task) continue
    if (ids.has(j.task)) j.seen = now
    else finish(j, null)
  }
}

function finish(job: Job, ok: boolean | null): void {
  if (!running.delete(job.id)) {
    // already ended (seen gone at a stop): a notification that comes after says how it went
    const d = done.find(x => x.id === job.id)
    if (d && d.ok === null && ok !== null) d.ok = ok
    return
  }
  addDone(job, ok)
}

function addDone(job: Job, ok: boolean | null): void {
  const now = Date.now()
  done = [...done.filter(d => d.id !== job.id && now - d.at < DONE_KEPT_MS), { id: job.id, who: job.who, ok, at: now }].slice(-MOST_DONE)
}

/** The last resort: jobs nothing has spoken of for a long time, and monitors past their deadline. */
function sweep(): void {
  const now = Date.now()
  for (const j of [...running.values()]) {
    if (j.until && now > j.until) finish(j, null)
    else if (j.task && now - j.seen > QUIET_MS) finish(j, null)
    else if (!j.task && j.kind === 'shell' && now - j.since > STUCK_CALL_MS) running.delete(j.id)
  }
  done = done.filter(d => now - d.at < DONE_KEPT_MS)
}
