// The progress feature (see ./kit.ts). It counts this session's moments (agents hired, tests passed, fires put out,
// files edited, sessions joined, git commits, pushes and pull requests, and commits made at night). The core mod hands
// the counts to the office every few seconds (takeProgressStats), and the office keeps lifetime counts that grow the
// studio: trophies, a fish tank, an arcade cabinet and more.

import type { EngineInterface } from 'claude-code'

import type { Feature, On, Signal, SignalData } from './kit'

/** The office takes whole numbers from 1 to 100 for one name in one post. */
const MOST_PER_POST = 100

/** What the office calls each counted moment. */
const NAMES: Partial<Record<Signal, string>> = {
  'agent-hired': 'agents-hired',
  'test-passed': 'tests-passed',
  'fire-out': 'fires-out',
  edit: 'files-edited',
  'session-ready': 'sessions',
  commit: 'commits',
  push: 'pushes',
  'pull-request': 'pull-requests',
}

/** A commit counts as a night commit from midnight until 4:59 local time (the night owl milestone). */
const NIGHT_ENDS = 5

let pending: Record<string, number> = {}
/** The local time zone's offset from UTC in minutes, when the core mod found it (else the engine's own zone). */
let zoneMinutes: number | null = null

export const progress: Feature = { name: 'progress' }

export function installProgress(on: On): void {
  void on
}

/** The core mod found the computer's time zone (the engine may run in UTC). */
export function setProgressTimezone(minutes: number): void {
  if (Number.isFinite(minutes)) zoneMinutes = minutes
}

/** The local hour (0 to 23) at `ms`. */
function localHour(ms: number): number {
  if (zoneMinutes === null) return new Date(ms).getHours()
  return new Date(ms + zoneMinutes * 60_000).getUTCHours()
}

function count(name: string): void {
  pending[name] = (pending[name] ?? 0) + 1
}

export function signalProgress($: EngineInterface, signal: Signal, data: SignalData): void {
  // a rewritten commit (`--amend`) is not a new one, and a push that moved nothing sent nothing
  if (signal === 'commit' && data.commit?.amend) return
  if (signal === 'push' && !data.push?.refs.length) return
  const name = NAMES[signal]
  if (name) count(name)
  if (signal === 'commit')
    void $.clock
      .now()
      .then(now => {
        if (localHour(now) < NIGHT_ENDS) count('night-commits')
      })
      .catch(() => undefined)
}

/** The counts to add to the office's lifetime counts since the last call (the core mod posts them), or null. */
export function takeProgressStats(): Record<string, number> | null {
  const out: Record<string, number> = {}
  const rest: Record<string, number> = {}
  for (const [name, n] of Object.entries(pending)) {
    if (n < 1) continue
    out[name] = Math.min(n, MOST_PER_POST)
    // anything over one post's limit waits for the next call
    if (n > MOST_PER_POST) rest[name] = n - MOST_PER_POST
  }
  pending = rest
  return Object.keys(out).length ? out : null
}
