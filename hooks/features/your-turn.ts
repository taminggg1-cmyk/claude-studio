// The your-turn feature (see ./kit.ts): tells the office which session is waiting for the person. Two kinds of wait:
//
//   'you'      the main loop finished its turn, so the next move is the person's. It ends when the person sends a
//              prompt or the main loop starts a turn.
//   'approve'  a tool call (the main loop's or a subagent's) is put to a person. It ends when that call goes ahead,
//              is refused, or the turn ends or starts.
//
// What the mod can tell about an approval: a `tool.check` verdict of 'ask' is a hook's ask (a person answers, it carries
// `plugin`) or the mode's own ask (a dialog, or in auto mode possibly a classifier). The mod cannot see the mode or
// the classifier, so it reads `e.approver`: 'host' means the host's callback answers (no person is asked, so no
// wait); 'person' (or unset, with no `plugin`) counts as a person. In auto mode a classifier may still settle an ask
// before any dialog shows, so a short 'approve' flash is possible there. A person's "no" in the dialog is not seen,
// so the wait then ends at the next turn event.
// extras() is `{ waiting: 'you' | 'approve' | null, since: <epoch ms>, tool?: string, agent?: string }`. The
// coffee-break feature reads this shape.

import type { EngineInterface } from 'claude-code'

import type { Feature, On, Signal, SignalData } from './kit'

type Approval = { tool: string; agent?: string; since: number }

let youSince = 0
const approvals = new Map<string, Approval>()

export const yourTurn: Feature = {
  name: 'your-turn',
  extras() {
    // the oldest approval first: it has waited longest
    let first: Approval | undefined
    for (const a of approvals.values()) if (!first || a.since < first.since) first = a
    if (first) {
      const out: { waiting: 'approve'; since: number; tool: string; agent?: string } = { waiting: 'approve', since: first.since, tool: first.tool }
      if (first.agent) out.agent = first.agent
      return out
    }
    if (youSince) return { waiting: 'you', since: youSince }
    return { waiting: null, since: 0 }
  },
}

function clearWaits(): void {
  youSince = 0
  approvals.clear()
}

export function installYourTurn(on: On): void {
  on('prompt.submit', ($, e, next) => {
    clearWaits()
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.check', async ($, e, next) => {
    const r = await next(e)
    try {
      const id = e.tool_use_id
      if (id) {
        const person = r.decision === 'ask' && (Boolean(r.plugin) || e.approver !== 'host')
        if (person) {
          if (!approvals.has(id)) approvals.set(id, { tool: String(e.tool), agent: e.agentId, since: Date.now() })
        } else approvals.delete(id)
      }
    } catch {
      // the studio only watches
    }
    return r
  }).catch(($, e, next) => next(e))
}

export function signalYourTurn($: EngineInterface, signal: Signal, data: SignalData): void {
  void $
  if (signal === 'turn-complete' && !data.agentId) {
    approvals.clear()
    youSince = Date.now()
  }
  if (signal === 'turn-start' && !data.agentId) clearWaits()
  // the call goes ahead (or ends): the person has answered
  if ((signal === 'tool-start' || signal === 'tool-end') && data.toolUseId) approvals.delete(data.toolUseId)
  // an agent that finished no longer waits for anything
  if (signal === 'agent-done' && data.agentId) {
    for (const [id, a] of approvals) if (a.agent === data.agentId) approvals.delete(id)
  }
}
