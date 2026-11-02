// The paperwork feature (see ./kit.ts). When Claude Code compacts the main conversation, the session's lead carries a
// box of papers to the shredder in the office. This file only tells the window when a compaction runs and when it ends.

import type { EngineInterface } from 'claude-code'

import type { Feature, On, Signal, SignalData } from './kit'

/** What the window gets: the last compaction, running or done. Times are epoch milliseconds. */
type Paperwork = {
  state: 'running' | 'done'
  at: number
  trigger?: string
  done?: number
  before?: number
  after?: number
}

let last: Paperwork | undefined

export const paperwork: Feature = {
  name: 'paperwork',
  extras: () => last,
}

export function installPaperwork(on: On): void {
  on('session.compact', async ($, e, next) => {
    // a subagent's own transcript, and a precompute (which installs nothing), are not the session being tidied
    if (e.agentId || e.trigger === 'precompute') return next(e)
    const before = last
    const at = Date.now()
    last = { state: 'running', at, trigger: e.trigger }
    try {
      const result = await next(e)
      const done: Paperwork = { state: 'done', at, trigger: e.trigger, done: Date.now() }
      if (result && result.messages) {
        if (typeof result.tokensBefore === 'number') done.before = result.tokensBefore
        if (typeof result.tokensAfter === 'number') done.after = result.tokensAfter
      }
      last = done
      return result
    } catch (err) {
      last = before
      throw err
    }
  }).catch(($, e, next) => next(e)) // the studio only watches: whatever goes wrong here, the compaction goes on
}

export function signalPaperwork($: EngineInterface, signal: Signal, data: SignalData): void {
  void $
  void signal
  void data
}
