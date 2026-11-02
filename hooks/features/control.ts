// The control feature: the office window can ask a session to do something. Its panel (office/features/control.js)
// sends a prompt or a new agent for one session to the office server (POST /command, which only the window may call);
// the core mod picks it up from the server's inbox every 1.5 s and hands it here. A prompt goes in as the person's own
// words, as if typed at this session's prompt (it waits until the session is idle); an agent starts in the background.
// Starting a new session in a folder is the server's own job (POST /new-session opens a terminal running claude).

import type { EngineInterface } from 'claude-code'

import type { Feature, On, Signal, SignalData } from './kit'

export const control: Feature = { name: 'control' }

export function installControl(on: On): void {
  void on
}

export function signalControl($: EngineInterface, signal: Signal, data: SignalData): void {
  void $
  void signal
  void data
}

/** One thing the window asked this session to do (see office/server.mjs, POST /command). */
export type Command = { id: string; kind: 'prompt' | 'agent'; text: string; agentType?: string; at: number }

/** Asks the window for nothing older than this: a command that waited longer (the session was busy elsewhere) is dropped. */
const STALE_MS = 10 * 60_000

/** Does what the window asked (the core mod polls the office for it). */
export async function runControlCommand($: EngineInterface, command: Command): Promise<void> {
  const text = typeof command.text === 'string' ? command.text.trim() : ''
  if (!text) return
  if (typeof command.at === 'number' && Date.now() - command.at > STALE_MS) return
  if (command.kind === 'prompt') {
    await $.prompt.submit({ text, asUser: true })
    return
  }
  if (command.kind === 'agent') {
    const description = text.length > 48 ? `${text.slice(0, 45).trimEnd()}…` : text
    await $.agent.spawn({ prompt: text, description, ...(command.agentType ? { subagentType: command.agentType } : {}) })
    $.ui.toast(`Claude's studio started an agent: ${description}`)
  }
}
