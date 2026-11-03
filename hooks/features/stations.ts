// The stations feature (see ./kit.ts): two corners of the office where work happens away from the desk.
//
//   - The blueprint table: plan mode. It starts when Claude calls EnterPlanMode, or when a request of the main loop
//     carries the engine's plan-mode reminder (the person pressed shift+tab into plan mode). ExitPlanMode puts the plan
//     to the person ('asking'); its end says whether they approved it (an answer without error) or refused it (an
//     error or a refusal). The engine's note that plan mode has ended (shift+tab out again) ends it too ('left').
//   - The library corner: web research (WebSearch, WebFetch and browser tools, with the query or the site) and skills
//     (the Skill tool, with the skill's name).
//
// The window (office/features/stations.js) sends the session's Claude to the table, and whoever researches to the
// bookcase.
//
// extras() is { plan: { id, who, since, phase: 'on' | 'asking' | 'off', outcome?: 'approved' | 'refused' | 'left',
// at? } | null, research: [{ id, who, kind: 'search' | 'fetch' | 'browser', detail, at }], skills: [{ id, who, name,
// at }] }. `who` is 'main' for the lead, else the agent's id. A plan that ended stays (phase 'off', with its outcome
// and when) until the next one starts, so the window can play the ending once.

import type { EngineInterface } from 'claude-code'

import type { Feature, On, Signal, SignalData } from './kit'

type Plan = {
  id: string
  who: string
  since: number
  phase: 'on' | 'asking' | 'off'
  outcome?: 'approved' | 'refused' | 'left'
  at?: number
}
type Research = { id: string; who: string; kind: 'search' | 'fetch' | 'browser'; detail: string; at: number }
type SkillUse = { id: string; who: string; name: string; at: number }

const RESEARCH_KEPT = 8
const SKILLS_KEPT = 6
/** The same look-up again this soon only moves its time on, so a busy browser tool does not fill the list. */
const SAME_WITHIN_MS = 5000

let plan: Plan | null = null
let research: Research[] = []
let skills: SkillUse[] = []
/** Ids start with the module's own start time, so a reloaded mod never repeats an id the window has seen. */
const born = Date.now().toString(36)
let seq = 0
const nextId = () => `${born}-${++seq}`

const short = (text: string, max: number) => {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > max ? one.slice(0, max - 1) + '…' : one
}

export const stations: Feature = {
  name: 'stations',
  extras: () => ({ plan, research, skills }),
}

/** A web tool's kind, or null for any other tool (the same tools the core mod calls 'browsing'). */
export function webKind(tool: string): Research['kind'] | null {
  if (tool === 'WebSearch') return 'search'
  if (tool === 'WebFetch') return 'fetch'
  if (/chrome|browser/i.test(tool)) return 'browser'
  return null
}

/** The site of an address ('docs.python.org'), or the address cut short when it is not one. */
function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return short(url, 40)
  }
}

/** A few words on a web call: the query, the site, or what a browser tool does. */
export function webDetail(tool: string, input: Record<string, unknown>): string {
  const s = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  if (tool === 'WebSearch') return short(s('query'), 60)
  if (s('url')) return siteOf(s('url'))
  if (tool === 'WebFetch') return ''
  // a browser tool: its own name, without the server's prefix (mcp__claude-in-chrome__navigate -> navigate)
  const name = tool.split('__').pop() ?? tool
  return short(name.replace(/[_-]+/g, ' '), 30)
}

/** Whether a tool call's result says it went wrong (an error, or the call was refused). */
function failed(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false
  const r = result as { deny?: unknown; isError?: unknown }
  return r.deny !== undefined || r.isError === true
}

function startPlan(who: string): void {
  plan = { id: nextId(), who, since: Date.now(), phase: 'on' }
}

function endPlan(outcome: NonNullable<Plan['outcome']>): void {
  if (!plan || plan.phase === 'off') return
  plan = { ...plan, phase: 'off', outcome, at: Date.now() }
}

const planOn = () => !!plan && plan.phase !== 'off'

function noteResearch(who: string, kind: Research['kind'], detail: string): void {
  const now = Date.now()
  const last = research[research.length - 1]
  if (last && last.who === who && last.kind === kind && last.detail === detail && now - last.at < SAME_WITHIN_MS) {
    research = [...research.slice(0, -1), { ...last, at: now }]
    return
  }
  research = [...research, { id: nextId(), who, kind, detail, at: now }].slice(-RESEARCH_KEPT)
}

function noteSkill(who: string, name: string): void {
  if (!name) return
  skills = [...skills, { id: nextId(), who, name: short(name, 40), at: Date.now() }].slice(-SKILLS_KEPT)
}

export function installStations(on: On): void {
  // Plan mode the person switched on (shift+tab) shows only as the engine's reminder on the main loop's requests, and
  // its end as the engine's note that plan mode is over. Nothing else hooks these attachments; each hook has a matcher.
  on('prompt.attachment', { type: 'plan_mode' }, ($, e, next) => {
    try {
      if (!e.agentId && !planOn()) startPlan('main')
    } catch {
      // the studio only watches
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('prompt.attachment', { type: 'plan_mode_exit' }, ($, e, next) => {
    try {
      // while ExitPlanMode is put to the person, its own answer says how the plan ended
      if (!e.agentId && plan?.phase === 'on') endPlan('left')
    } catch {
      // the studio only watches
    }
    return next(e)
  }).catch(($, e, next) => next(e))
}

export function signalStations($: EngineInterface, signal: Signal, data: SignalData): void {
  void $
  if (signal !== 'tool-start' && signal !== 'tool-end') return
  const tool = data.tool ?? ''
  const who = data.agentId ?? 'main'
  const input = data.input ?? {}
  if (signal === 'tool-start') {
    if (tool === 'EnterPlanMode' && !planOn()) startPlan(who)
    else if (tool === 'ExitPlanMode') {
      if (!planOn()) startPlan(who) // plan mode began before the mod could see it
      if (plan) plan = { ...plan, phase: 'asking' }
    } else if (tool === 'Skill') noteSkill(who, typeof input.skill === 'string' ? input.skill : '')
    else {
      const kind = webKind(tool)
      if (kind) noteResearch(who, kind, webDetail(tool, input))
    }
    return
  }
  // tool-end
  if (tool === 'EnterPlanMode' && failed(data.result) && plan?.phase === 'on') endPlan('left')
  else if (tool === 'ExitPlanMode' && plan?.phase === 'asking') endPlan(failed(data.result) ? 'refused' : 'approved')
  else if (webKind(tool) && !failed(data.result)) {
    // a long fetch or page load: the research went on until it ended
    const last = [...research].reverse().find(r => r.who === who)
    if (last) research = research.map(r => (r === last ? { ...r, at: Date.now() } : r))
  }
}
