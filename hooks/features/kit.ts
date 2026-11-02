// What a feature module of the mod looks like. A feature lives in its own file in this folder and exports:
//
//   - a `Feature` (listed in ./index.ts): its name and `extras()`, what the window should know, as plain JSON. That
//     value reaches the page as `state.extras[<name>]` of this session, where the page feature of the same name
//     (office/features/<name>.js) reads it. The core mod sends the studio at least once a second when anything in it
//     (extras included) changed, so a feature never has to send it itself.
//   - `install<Name>(on)`, which adds the feature's own hooks. Every hook must call `next(e)` and end in
//     `.catch(($, e, next) => next(e))`: the studio only watches, it never changes what a session does. The engine
//     takes only one hook without a matcher per event and module: the core mod already hooks session.start,
//     session.end, turn.start, turn.complete, tool.call and command.run, so a feature hears of those through signals
//     (below) instead; a feature hooks another event (tool.check, prompt.submit, session.compact) only if no other
//     feature does, or with a matcher.
//   - `signal<Name>($, signal, data)`, called at each moment the core mod announces (below).
//
// ../register.tsx calls install<Name> and signal<Name> by name: the engine lets `on` and `$` be handed only to functions
// named at the top of a file of the mod (never kept in a variable, an object or a list).

import type { Register } from 'claude-code'

export type On = Parameters<Register>[0]

/**
 * Moments the core mod announces, so features need not watch for them again:
 *   agent-hired    a new agent walked in (data: agentId, agentType, task)
 *   agent-done     an agent finished its task (data: agentId, agentType)
 *   edit           a file was changed successfully (data: who, tool, file)
 *   test-passed    a test or type-check command ran cleanly (data: who)
 *   error          a tool call failed and counts as a strike (data: who, tool, strikes)
 *   fire-out       a run of five or more errors ended (the desk fire is out) (data: who)
 *   session-ready  this session joined the office (data: none)
 *   session-start  the session started, or the mod was reloaded (data: cwd)
 *   turn-start     a loop's turn began (data: agentId for a subagent's loop, else none: the main loop)
 *   turn-complete  a loop's turn ended (data: agentId as above)
 *   tool-start     a tool call is about to run (data: tool, toolUseId, agentId, input)
 *   tool-end       a tool call ended (data: tool, toolUseId, agentId, input, result); also after a refused call
 * `who` is 'main' for the session's lead, else the agent's id.
 */
export type Signal =
  | 'agent-hired'
  | 'agent-done'
  | 'edit'
  | 'test-passed'
  | 'error'
  | 'fire-out'
  | 'session-ready'
  | 'session-start'
  | 'turn-start'
  | 'turn-complete'
  | 'tool-start'
  | 'tool-end'
export type SignalData = {
  who?: string
  tool?: string
  file?: string
  agentId?: string
  agentType?: string
  task?: string
  strikes?: number
  /** session-start: the session's folder. */
  cwd?: string
  /** tool-start, tool-end: the call's id, its input, and (tool-end) what it returned (`isError` set on a failure). */
  toolUseId?: string
  input?: Record<string, unknown>
  result?: unknown
}

/** The office server's paths a session may post to (with its token); see office/server.mjs. */
export type OfficePath = '/state' | '/leave' | '/window' | '/stat' | '/inbox' | '/reply'

/**
 * A command waiting in the office server's inbox for this session. 'prompt' and 'agent' come from the window's panel
 * (control.ts runs them); any other kind was queued by a server feature (office/server-features/) and goes to the mod
 * feature that answers it (characters.ts for 'persona'); its return value is posted back to the server (POST /reply).
 */
export type InboxCommand = { id: string; kind: string; text: string; agentType?: string; character?: string; data?: unknown; at: number }

export type Feature = {
  name: string
  extras?(): unknown
}
