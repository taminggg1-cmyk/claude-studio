// The whiteboard feature (see ./kit.ts). It keeps the main loop's task list (TodoWrite, or TaskCreate / TaskUpdate /
// TaskList) and sends it as extras, so the studio can put the tasks on the room's rolling whiteboard as sticky notes.

import type { EngineInterface } from 'claude-code'

import type { Feature, On, Signal, SignalData } from './kit'

type Status = 'pending' | 'in_progress' | 'completed'
type Task = { id: string; text: string; status: Status }

const MAX_TASKS = 12
const MAX_TEXT = 40

let tasks: Task[] = []
let changed = 0
let counter = 0

export const whiteboard: Feature = {
  name: 'whiteboard',
  extras() {
    if (tasks.length === 0) return undefined
    return { tasks: tasks.map(t => ({ ...t })), changed }
  },
}

function clip(text: unknown): string {
  const one = String(text ?? '').replace(/\s+/g, ' ').trim()
  return one.length > MAX_TEXT ? one.slice(0, MAX_TEXT - 1) + '…' : one
}

function statusOf(v: unknown, fallback: Status): Status {
  return v === 'pending' || v === 'in_progress' || v === 'completed' ? v : fallback
}

function touch(now: number): void {
  tasks = tasks.slice(0, MAX_TASKS)
  changed = now
}

/** Reads the id a created task got from the tool's result: its record, else a "#3" or "task 3" in its text. */
function createdId(result: unknown): string {
  const r = result as { result?: { task?: { id?: unknown } }; text?: unknown } | undefined
  const id = r?.result?.task?.id
  if (typeof id === 'string' || typeof id === 'number') return String(id)
  const m = typeof r?.text === 'string' ? /(?:#|task\s+)(\d+)/i.exec(r.text) : null
  return m?.[1] ?? ''
}

/** Notes one finished tool call of the main loop. Exported for the tests. */
export function noteTaskTool(tool: string, input: Record<string, unknown>, result: unknown, now: number): void {
  const r = result as { deny?: unknown; isError?: unknown; result?: any } | undefined
  if (!r || r.deny !== undefined || r.isError === true) return
  if (tool === 'TodoWrite') {
    const todos = Array.isArray(input.todos) ? (input.todos as Record<string, unknown>[]) : []
    tasks = todos.slice(0, MAX_TASKS).map((t, i) => ({ id: String(i + 1), text: clip(t?.content), status: statusOf(t?.status, 'pending') }))
    touch(now)
  } else if (tool === 'TaskCreate') {
    counter++
    const id = createdId(result) || String(counter)
    tasks = tasks.filter(t => t.id !== id)
    tasks.push({ id, text: clip(input.subject), status: 'pending' })
    // a full board drops its oldest finished note, else its oldest note
    while (tasks.length > MAX_TASKS) {
      const i = tasks.findIndex(t => t.status === 'completed')
      tasks.splice(i >= 0 ? i : 0, 1)
    }
    touch(now)
  } else if (tool === 'TaskUpdate') {
    const id = String(input.taskId ?? '')
    const t = tasks.find(x => x.id === id)
    if (input.status === 'deleted') tasks = tasks.filter(x => x.id !== id)
    else if (t) {
      t.status = statusOf(input.status, t.status)
      if (typeof input.subject === 'string' && input.subject) t.text = clip(input.subject)
    } else return
    touch(now)
  } else if (tool === 'TaskList') {
    const list = r.result?.tasks
    if (!Array.isArray(list)) return
    tasks = list.slice(0, MAX_TASKS).map((t: Record<string, unknown>) => ({ id: String(t.id), text: clip(t.subject), status: statusOf(t.status, 'pending') }))
    touch(now)
  }
}

export function installWhiteboard(on: On): void {
  void on
}

/** The core mod announces each finished tool call; the main loop's task tools change the board. */
export function signalWhiteboard($: EngineInterface, signal: Signal, data: SignalData): void {
  void $
  if (signal !== 'tool-end' || data.agentId || !data.tool) return
  if (!/^(TodoWrite|TaskCreate|TaskUpdate|TaskList)$/.test(data.tool)) return
  const input = data.input && typeof data.input === 'object' ? (data.input as Record<string, unknown>) : {}
  noteTaskTool(data.tool, input, data.result, Date.now())
}
