import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const LOCK = 'C:/Users/me/.claude/studio-office.json'
const run = { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }

/** The shared office, already running; `stations()` is the stations extras of the last studio the session sent. */
function officeMocks(on: Parameters<TestBody>[1]) {
  const states: Record<string, any>[] = []
  mock.env(on, { USERPROFILE: 'C:\\Users\\me' })
  on('command.register', () => ({ value: { command: 'office' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.list', () => ({ value: [] }))
  on('session.id', () => ({ value: 'session-one' }))
  on('session.cwd', () => ({ value: 'C:\\work\\app' }))
  on('fs.stat', () => ({ deny: 'ENOENT' }))
  on('fs.read', (_, e) => (e.path.replace(/[\\]/g, '/') === LOCK ? { value: JSON.stringify({ port: 4321, token: 't', pid: 7 }) } : { deny: 'ENOENT' }))
  on('process.run', () => run)
  on('http.fetch', (_, e) => {
    const path = new URL(e.url).pathname
    if (path === '/health') return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ office: 'claude-studio', windows: 1 }) } }
    const body = JSON.parse(String(e.init?.body ?? '{}'))
    if (path === '/state') states.push(body.state)
    return { value: { status: 204, ok: true, headers: {}, text: '' } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  return { stations: () => states[states.length - 1]?.extras?.stations }
}

test('EnterPlanMode puts the plan on the table, and an approved ExitPlanMode ends it as approved', async ($, on) => {
  const clock = mock.clock(on)
  const w = officeMocks(on)
  on('tool.call', () => ({ result: { plan: 'the plan' } }))
  await $.session.start({ cwd: 'C:\\work\\app', surface: 'terminal', isInteractive: true })
  await clock.advance(1500)

  await $.tool.call({ tool: 'EnterPlanMode' })
  await clock.advance(1500)
  let plan = w.stations().plan
  expect(plan).toMatchObject({ who: 'main', phase: 'on' })
  expect(typeof plan.since).toBe('number')

  await $.tool.call({ tool: 'ExitPlanMode', plan: 'Build it' })
  await clock.advance(1500)
  plan = w.stations().plan
  expect(plan).toMatchObject({ who: 'main', phase: 'off', outcome: 'approved' })
  expect(typeof plan.at).toBe('number')
})

test('a refused ExitPlanMode ends the plan as refused', async ($, on) => {
  const clock = mock.clock(on)
  const w = officeMocks(on)
  on('tool.call', (_, e) => (e.tool === 'ExitPlanMode' ? { isError: true as const, result: 'The user rejected the plan', text: 'The user rejected the plan' } : { result: {} }))
  await $.session.start({ cwd: 'C:\\work\\app', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'EnterPlanMode' })
  await $.tool.call({ tool: 'ExitPlanMode', plan: 'Build it' })
  await clock.advance(1500)
  expect(w.stations().plan).toMatchObject({ phase: 'off', outcome: 'refused' })
})

test('a web search and a page fetch show in the research list, and a skill in the skills', async ($, on) => {
  const clock = mock.clock(on)
  const w = officeMocks(on)
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ cwd: 'C:\\work\\app', surface: 'terminal', isInteractive: true })

  await $.tool.call({ tool: 'WebSearch', query: 'three.js canvas texture', mode: 'standard' })
  await $.tool.call({ tool: 'WebFetch', url: 'https://www.threejs.org/docs/', prompt: 'read it', agentId: 'agent-7' })
  await $.tool.call({ tool: 'Skill', skill: 'pdf' })
  await clock.advance(1500)
  const st = w.stations()
  expect(st.research.map((r: { who: string; kind: string; detail: string }) => [r.who, r.kind, r.detail])).toEqual([
    ['main', 'search', 'three.js canvas texture'],
    ['agent-7', 'fetch', 'threejs.org'],
  ])
  expect(st.skills).toEqual([expect.objectContaining({ who: 'main', name: 'pdf' })])
  expect(st.plan).toBe(null)
})

test('plan mode the person switched on shows from the engine reminder, and its end note ends it', async ($, on) => {
  const clock = mock.clock(on)
  const w = officeMocks(on)
  on('prompt.attachment', (_, e) => ({ text: e.text }))
  await $.session.start({ cwd: 'C:\\work\\app', surface: 'terminal', isInteractive: true })

  await $.prompt.attachment({ type: 'plan_mode', text: 'Plan mode is on.', origin: { kind: 'engine' }, detail: { reminder: 'full', planFilePath: 'C:/plans/p.md', hasPlan: false } })
  await clock.advance(1500)
  expect(w.stations().plan).toMatchObject({ who: 'main', phase: 'on' })

  await $.prompt.attachment({ type: 'plan_mode_exit', text: 'Plan mode is over.', origin: { kind: 'engine' }, detail: { planFilePath: 'C:/plans/p.md', hasPlan: false } })
  await clock.advance(1500)
  expect(w.stations().plan).toMatchObject({ phase: 'off', outcome: 'left' })
})
