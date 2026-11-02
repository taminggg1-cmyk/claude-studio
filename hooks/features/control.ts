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
export type Command = { id: string; kind: 'prompt' | 'agent'; text: string; agentType?: string; character?: string; at: number }

/** The character each agent started from the window should wear (agent id to model file), as picked in the panel. */
const wearing = new Map<string, string>()
/** Picks whose agent id is not known yet (the spawn did not say it), by the agent's description, for two minutes. */
const pending = new Map<string, { file: string; at: number }>()

/**
 * The character picked for this agent in the window's panel, if any. An agent whose id the spawn did not report is
 * matched once by its description (what $.agent.list shows as the agent's description).
 */
export function characterFor(agentId: string, description?: string): string | undefined {
  const known = wearing.get(agentId)
  if (known) return known
  const p = description ? pending.get(description) : undefined
  if (!p || !description) return undefined
  pending.delete(description)
  if (Date.now() - p.at > 120_000) return undefined
  wearing.set(agentId, p.file)
  return p.file
}

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
    const started = await $.agent.spawn({ prompt: text, description, ...(command.agentType ? { subagentType: command.agentType } : {}) })
    const character = typeof command.character === 'string' && /^[\w.-]{1,120}\.(vrm|glb)$/i.test(command.character) ? command.character : ''
    if (character && started.agentId) wearing.set(started.agentId, character)
    else if (character) pending.set(description, { file: character, at: Date.now() })
    if (wearing.size > 50) wearing.delete(wearing.keys().next().value as string)
    $.ui.toast(`Claude's studio started an agent: ${description}`)
  }
}
