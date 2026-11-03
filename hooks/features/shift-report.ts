// The shift-report feature (see ./kit.ts): counts how this session's shift went, so the window can show a card when
// the shift ends. The counts are small numbers; the window decides how to say them.

import type { EngineInterface } from 'claude-code'

import type { Feature, On, Signal, SignalData } from './kit'

let started = 0
const files = new Set<string>()
let edits = 0
let agents = 0
let tests = 0
let errors = 0
let fires = 0
let commits = 0
let pushes = 0
let prs = 0

export const shiftReport: Feature = {
  name: 'shift-report',
  extras: () => ({ started: Math.max(started, 0), files: files.size, edits, agents, tests, errors, fires, commits, pushes, prs }),
}

export function installShiftReport(on: On): void {
  // No hook of its own: the core mod owns session.start and announces it as the 'session-start' signal.
  void on
}

export function signalShiftReport($: EngineInterface, signal: Signal, data: SignalData): void {
  // the shift starts at the first signal (normally 'session-start'); a reload starts the module over, so counts and
  // start stay together
  if (!started) {
    started = -1
    void $.clock.now().then(now => {
      started = now
    })
  }
  if (signal === 'edit') {
    edits++
    if (data.file) files.add(data.file)
  } else if (signal === 'agent-hired') agents++
  else if (signal === 'test-passed') tests++
  else if (signal === 'error') errors++
  else if (signal === 'fire-out') fires++
  else if (signal === 'commit' && !data.commit?.amend) commits++
  else if (signal === 'push' && data.push?.refs.length) pushes++
  else if (signal === 'pull-request') prs++
}
