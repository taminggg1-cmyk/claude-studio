/** Activity codes: which pose a worker takes and what their badge says. */
export type WorkerCode =
  | 'idle'
  | 'thinking'
  | 'reading'
  | 'searching'
  | 'writing'
  | 'refactoring'
  | 'testing'
  | 'terminal'
  | 'browsing'
  | 'delegating'
  | 'planning'

/**
 * How a worker feels, shown in the window: `flow` (editing, running things: typing, music notes), `thinking`
 * (question marks), `stressed` (one or more errors in a row: sweat and steam), `panic` (five or more: fire), `calm`.
 */
export type Mood = 'calm' | 'flow' | 'thinking' | 'stressed' | 'panic'

/** One worker in the studio: Claude, or an agent Claude summoned. */
export type Worker = {
  id: string
  name: string
  /** `claude`, or the agent's type (`Explore`, `Plan`, ...): the window picks the person's look by it. */
  kind: string
  emoji: string
  code: WorkerCode
  /** The badge's words in the window ("Refactoring", "Testing", ...). */
  label: string
  /** The same in lower case for the terminal pane ("refactoring", "running tests", ...). */
  activity: string
  detail: string
  /** The task the agent was given; empty for Claude. */
  task: string
  color: string
  mood: Mood
  /** Tool errors in a row (reset by the next successful edit or command). */
  strikes: number
  /** Goes up by one for every success worth a cheer (a passing test, a run of errors ended, an agent done). */
  cheer: number
  /** The character model (a file in models.json) the window should dress this agent in: the one picked in the panel. */
  model?: string
}

/** Usage readings for the token rack, as percentages; null where Claude Code has no reading. */
export type Usage = { context: number | null; fiveHour: number | null }

/** `auto` follows the clock; `day` and `night` hold the window's sky. */
export type SkyMode = 'auto' | 'day' | 'night'

export type StudioInfo = {
  clock: string
  hour: number
  main: Worker
  helpers: Worker[]
  usage: Usage
  sky: SkyMode
  /** What each feature module (hooks/features/) tells the window, by the feature's name; plain JSON values. */
  extras?: Record<string, unknown>
  /**
   * What this version of the mod can do for the window (`pick-character`: an agent started from the panel wears the
   * character picked for it). A session started before an update runs the old mod until /reload-plugins, so the
   * window reads this to tell you when a session cannot do what you ask yet.
   */
  can?: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'pixel-office': { info: Shaped<StudioInfo> }
  }
}
