// The progress feature (see ./kit.ts). It counts this session's moments (agents hired, tests passed, fires put out,
// files edited, sessions joined). The core mod hands the counts to the office every few seconds (takeProgressStats),
// and the office keeps lifetime counts that grow the studio: trophies, a fish tank, an arcade cabinet and more.

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
}

let pending: Record<string, number> = {}

export const progress: Feature = { name: 'progress' }

export function installProgress(on: On): void {
  void on
}

export function signalProgress($: EngineInterface, signal: Signal, data: SignalData): void {
  void $
  void data
  const name = NAMES[signal]
  if (name) pending[name] = (pending[name] ?? 0) + 1
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
