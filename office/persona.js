// Personas: who each person in the studio is. A persona gives a person the name on their name tag, a colour for that
// tag, a short "about" text (shown when you click them) and the lines they say in speech bubbles at certain moments:
//
//   hello       when they sit down at their desk (Claude: when the window opens)
//   flow        when their work gets into a rhythm (editing files, running commands)
//   thinking    when they stop to think or plan
//   delegating  when Claude hands a task to an agent
//   stressed    when errors start to pile up
//   panic       when their desk catches fire
//   celebrate   when a test passes or a run of errors ends
//   idle        now and then, when nothing much is happening
//   bye         when their agent finishes and they walk out
//
// The person's own personas live with their character models, in ~/.claude/studio-models/models.json (each model's
// "persona"). Anything a persona leaves out falls back to the plain lines below, and a person without a model (the
// built-in chibi figures) gets a plain persona named after their agent type.

export const MOMENTS = ['hello', 'flow', 'thinking', 'delegating', 'stressed', 'panic', 'celebrate', 'idle', 'bye']

const PLAIN = {
  hello: ['Hello! Ready to work.', 'Reporting in.'],
  flow: ['In the zone ♪', 'This is going well.'],
  thinking: ['Hmm, let me think…', 'One moment…'],
  delegating: ['Could you take this one?', 'Over to you!'],
  stressed: ['Not again…', 'Why is this failing?'],
  panic: ['Fire! FIRE!'],
  celebrate: ['It works!', 'Yes!'],
  idle: ['Coffee time?', 'All quiet.'],
  bye: ['Done. Bye!', 'See you!'],
}

/** Name-tag colours for people without a persona of their own, in turn. */
const COLOURS = ['#c8775a', '#5b78c9', '#8e62b8', '#3f8f6f', '#b8634f', '#4f8fa8', '#a8763a']

const text = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : '')
const colour = v => (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v.trim()) ? v.trim() : '')

/**
 * The persona for one person. `model` is the model file they wear (or null), `personas` the map from models.json,
 * `kind` their agent type, `index` a number that picks a fallback colour.
 */
export function personaFor({ isClaude, model, personas, kind, index = 0 }) {
  const own = (model && personas?.[model]) || null
  const lines = {}
  for (const m of MOMENTS) {
    const list = Array.isArray(own?.lines?.[m]) ? own.lines[m].map(s => text(s, 90)).filter(Boolean) : []
    lines[m] = list.length ? list : PLAIN[m]
  }
  const name = text(own?.name, 24) || (isClaude ? 'Claude' : text(kind, 24) || 'Agent')
  return {
    name,
    /** Claude's role is fixed by the persona; an agent's role is its agent type, filled in when the badge draws. */
    role: isClaude ? text(own?.role, 32) || (name === 'Claude' ? 'lead' : 'Claude') : null,
    color: colour(own?.color) || (isClaude ? '#c8775a' : COLOURS[Math.abs(index) % COLOURS.length]),
    about: text(own?.about, 280),
    lines,
    own: !!own,
  }
}

/** A line for `moment`, never the same as the `last` one when there is a choice. */
export function pickLine(persona, moment, last) {
  const list = persona.lines[moment] ?? PLAIN[moment] ?? []
  if (!list.length) return ''
  const choices = list.length > 1 ? list.filter(s => s !== last) : list
  return choices[Math.floor(Math.random() * choices.length)]
}

/** How long a bubble stays up for `line` (seconds): long enough to read, never more than six. */
export const bubbleTime = line => Math.min(6, 2.6 + line.length * 0.045)
