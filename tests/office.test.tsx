import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const PANE = {
  plugin: 'pixel-office',
  component: 'Pane',
  requestId: 'office',
  props: {
    title: "Claude's studio",
    isFocused: false,
    bodyColumns: 64,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 24 },
    view: {},
  },
} as const

type Agent = { id: string; type: string; description: string; status: 'running' | 'completed' }
const EXPLORER: Agent = { id: 'a1', type: 'Explore', description: 'map the repository', status: 'running' }
/** `$.command.run` as the person typing a command calls it (the engine stamps the rest). */
const typed = (args: string) => ({ command: 'office', args }) as Parameters<Parameters<TestBody>[0]['command']['run']>[0]

test('the studio shows Claude on every surface, and the office picture in a terminal', async ($, on) => {
  mock.clock(on)
  on('command.register', () => ({ value: { command: 'office' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.blit', () => ({ value: {} }))
  on('agent.list', () => ({ value: [] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: false })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const name = surface === 'terminal' ? /^Claude$/ : /🧑 Claude/
    expect((await ui.find({ type: 'Text', text: name }))?.text).toContain('Claude')
    if (surface === 'terminal') {
      // the room itself: Claude sits at the big desk
      expect((await ui.find({ type: 'Text', text: /🧑/, in: 'office' }))?.text).toContain('🧑')
      expect((await ui.find({ type: 'Text', text: /just Claude today/ }))?.text).toContain('/office')
    }
    await ui.unmount()
  }
})

test('a summoned agent walks in, is listed, and leaves when done', async ($, on) => {
  const clock = mock.clock(on)
  let agents: Agent[] = [EXPLORER]
  on('command.register', () => ({ value: { command: 'office' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.blit', () => ({ value: {} }))
  on('agent.list', () => ({ value: agents }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: false })
  await clock.advance(1000)

  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /Explore/ }))?.text).toContain('Explore')
  // in the terminal pane an Explore agent comes in as an owl
  expect((await ui.find({ type: 'Text', text: /🦉/ }))?.text).toContain('🦉')
  expect((await ui.find({ type: 'Text', text: /team of 2/ }))?.text).toContain('team of 2')
  await ui.unmount()

  // the agent finishes: it walks back out through the door
  agents = []
  await clock.advance(30000)
  ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Explore/ })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /just Claude today/ }))?.text).toContain('just Claude today')
  await ui.unmount()
})

test("Claude's row says what it is doing while a tool runs, and edits read as refactoring", async ($, on) => {
  mock.clock(on)
  on('command.register', () => ({ value: { command: 'office' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.list', () => ({ value: [] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  const seen: string[] = []
  on('tool.call', async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    seen.push((await ui.find({ type: 'Text', text: /🧑 Claude/ }))?.text ?? '')
    await ui.unmount()
    return { result: {} }
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: false })
  await $.tool.call({ tool: 'Read', file_path: '/work/notes/plan.md' })
  await $.tool.call({ tool: 'Edit', file_path: '/work/src/cache.ts', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Bash', command: 'npm test -- --watch=false' })

  expect(seen[0]).toContain('reading')
  expect(seen[0]).toContain('plan.md')
  expect(seen[1]).toContain('refactoring')
  expect(seen[1]).toContain('cache.ts')
  expect(seen[2]).toContain('running tests')
})

const LOCK = 'C:/Users/me/.claude/studio-office.json'
const OK_RUN = { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }

/**
 * Mocks the shared office: the lock file (there from the start when `running`, else once the mod has started the
 * server), the server's /health, /window and /state, and the browser. Collects every studio the mod posts.
 */
function officeMocks(on: Parameters<TestBody>[1], agents: () => Agent[], opts: { running?: boolean; windows?: number } = {}) {
  const posts: { path: string; body: Record<string, any>; token: string }[] = []
  const runs: string[][] = []
  const store = new Map<string, unknown>()
  let serverUp = opts.running ?? false
  mock.env(on, { USERPROFILE: 'C:\\Users\\me' })
  on('command.register', () => ({ value: { command: 'office' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.list', () => ({ value: agents() }))
  on('session.id', () => ({ value: 'session-one' }))
  on('fs.stat', (_, e) => (e.path.includes('msedge') ? { value: { kind: 'file', size: 1, mtimeMs: 0, isLink: false } } : { deny: 'ENOENT' }))
  on('fs.read', (_, e) => (e.path.replace(/\\/g, '/') === LOCK && serverUp ? { value: JSON.stringify({ port: 4321, token: 'secret-token', pid: 7 }) } : { deny: 'ENOENT' }))
  on('process.run', (_, e) => {
    runs.push([...e.argv])
    if (e.argv.some(a => a.includes('Start-Process') && a.includes('server.mjs'))) serverUp = true
    return OK_RUN
  })
  on('http.fetch', (_, e) => {
    const path = new URL(e.url).pathname
    if (path === '/health') return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ office: 'claude-studio', windows: opts.windows ?? 0 }) } }
    const headers = (e.init?.headers ?? {}) as Record<string, string>
    posts.push({ path, body: JSON.parse(String(e.init?.body ?? '{}')), token: headers['x-office-token'] ?? '' })
    if (path === '/window') return { value: { status: 200, ok: true, headers: {}, text: '{"open":true}' } }
    return { value: { status: 204, ok: true, headers: {}, text: '' } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  const states = () => posts.filter(p => p.path === '/state').map(p => p.body.state)
  return { posts, runs, store, states, last: () => states().pop() }
}

test('the first session starts the shared office on its own, opens the one window and sends its studio', async ($, on) => {
  const clock = mock.clock(on)
  const w = officeMocks(on, () => [EXPLORER])

  await $.session.start({ cwd: 'C:/work/my-app', surface: 'terminal', isInteractive: true })
  await clock.advance(1500)

  // no office yet: the server is started as a process of its own (so it outlives this session), hidden
  const started = w.runs.find(argv => argv.some(a => a.includes('Start-Process')))
  expect(started?.join(' ')).toContain('server.mjs')
  expect(started?.join(' ')).toContain('-WindowStyle Hidden')
  // the placing helper opens the one office window on the server's port, top right
  const opened = w.runs.find(argv => argv.some(a => a.endsWith('place-window.ps1')))
  const arg = (name: string) => opened?.[opened.indexOf(name) + 1]
  expect(arg('-Url')).toBe('http://127.0.0.1:4321/')
  expect(arg('-Browser')).toContain('msedge.exe')
  expect(arg('-Place')).toBe('top-right')
  expect(arg('-Title')).toBe("Claude's studio")
  expect(opened).toContain('-Launch')
  // the studio reaches the office with the token from the lock file, under this session's id and folder
  const post = w.posts.filter(p => p.path === '/state').pop()
  expect(post?.token).toBe('secret-token')
  expect(post?.body.session).toBe('session-one')
  expect(post?.body.name).toBe('my-app')
  expect(post?.body.state.helpers[0].kind).toBe('Explore')
  expect(post?.body.state.helpers[0].label).toBe('Thinking')

  // `/office right` moves the office window to the right half, and the choice is kept for next time
  w.runs.length = 0
  const answer = await $.command.run(typed('right'))
  const moved = w.runs.find(argv => argv.some(a => a.endsWith('place-window.ps1')))
  expect(moved?.[moved.indexOf('-Place') + 1]).toBe('right')
  expect(moved).not.toContain('-Launch')
  expect(w.store.get('window-place')).toBe('right')
  expect(JSON.stringify(answer)).toContain('right half')

  // the session ends: its people walk out of the office
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 'session-one', resume: { id: 'session-one' } } as Parameters<typeof $.session.end>[0])
  expect(w.posts.some(p => p.path === '/leave' && p.body.session === 'session-one')).toBe(true)
})

test('a later session joins the office that is already open: no second server, no second window', async ($, on) => {
  const clock = mock.clock(on)
  const w = officeMocks(on, () => [], { running: true, windows: 1 })

  await $.session.start({ cwd: 'C:/work/other', surface: 'terminal', isInteractive: true })
  await clock.advance(1500)

  expect(w.runs.some(argv => argv.some(a => a.includes('Start-Process')))).toBe(false)
  expect(w.runs.some(argv => argv.some(a => a.endsWith('place-window.ps1')))).toBe(false)
  expect(w.last()?.main.code).toBe('idle')
  expect(w.posts.filter(p => p.path === '/state').pop()?.body.name).toBe('other')
  // and it keeps telling the office it is still there
  const before = w.posts.length
  await clock.advance(10000)
  expect(w.posts.slice(before).some(p => p.path === '/state' && p.body.session === 'session-one')).toBe(true)
})

/** Mocks the shared office and browser, and collects every studio state the mod posts to it. */
function windowMocks(on: Parameters<TestBody>[1], _clock: ReturnType<typeof mock.clock>, agents: () => Agent[]) {
  const w = officeMocks(on, agents, { running: true, windows: 1 })
  return { store: w.store, last: () => w.last() }
}

test('errors in a row stress Claude, five set the desk on fire, and the next good command clears them with a cheer', async ($, on) => {
  const clock = mock.clock(on)
  const w = windowMocks(on, clock, () => [])
  let failing = true
  on('tool.call', (_, e) =>
    e.tool === 'Grep'
      ? { isError: true as const, isReadOnly: true as const, result: 'no matches', text: 'no matches' }
      : failing
        ? { isError: true as const, result: 'exit code 1', text: 'exit code 1' }
        : { result: {} },
  )

  await $.session.start({ cwd: 'C:/work/app', surface: 'terminal', isInteractive: true })
  await clock.advance(1500)

  // a search that finds nothing is no failure
  await $.tool.call({ tool: 'Grep', pattern: 'nothing here' })
  await clock.advance(0)
  expect(w.last()?.main.strikes).toBe(0)
  await $.tool.call({ tool: 'Bash', command: 'npm run build' })
  await clock.advance(0)
  expect(w.last()?.main.strikes).toBe(1)
  expect(w.last()?.main.mood).toBe('stressed')
  for (let i = 0; i < 4; i++) await $.tool.call({ tool: 'Bash', command: 'npm run build' })
  await clock.advance(0)
  await clock.advance(0)
  expect(w.last()?.main.strikes).toBe(5)
  expect(w.last()?.main.mood).toBe('panic')
  // reading a file is no fix: the fire burns on
  failing = false
  await $.tool.call({ tool: 'Read', file_path: 'C:/work/app/build.log' })
  await clock.advance(0)
  expect(w.last()?.main.strikes).toBe(5)
  // a command that runs cleanly is: the strikes go and a cheer comes
  await $.tool.call({ tool: 'Bash', command: 'npm run build' })
  await clock.advance(0)
  expect(w.last()?.main.strikes).toBe(0)
  expect(w.last()?.main.cheer).toBe(1)
  // and a passing test run is always worth a cheer
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await clock.advance(0)
  expect(w.last()?.main.cheer).toBe(2)
})

test('a run of errors fades by itself after three quiet minutes', async ($, on) => {
  const clock = mock.clock(on)
  const w = windowMocks(on, clock, () => [])
  on('tool.call', () => ({ isError: true as const, result: 'no', text: 'no' }))

  await $.session.start({ cwd: 'C:/work/app', surface: 'terminal', isInteractive: true })
  await clock.advance(1500)
  for (let i = 0; i < 3; i++) await $.tool.call({ tool: 'Edit', file_path: 'a.ts', old_string: 'x', new_string: 'y' })
  await clock.advance(0)
  await clock.advance(0)
  expect(w.last()?.main.strikes).toBe(3)
  await clock.advance(200_000)
  expect(w.last()?.main.strikes).toBe(0)
  expect(w.last()?.main.cheer).toBe(0)
})

test('the token rack gets the context fill and the five-hour limit, and /office night holds the sky', async ($, on) => {
  const clock = mock.clock(on)
  const w = windowMocks(on, clock, () => [])
  on('session.usage', () => ({
    value: { startedAt: 0, context: { tokens: 84000, window: 200000, percent: 42 }, rateLimits: [{ kind: 'five_hour', percentUsed: 87.5 }] },
  }))

  await $.session.start({ cwd: 'C:/work/app', surface: 'terminal', isInteractive: true })
  await clock.advance(6000)
  expect(w.last()?.usage).toEqual({ context: 42, fiveHour: 88 })
  expect(w.last()?.sky).toBe('auto')

  const answer = await $.command.run(typed('night'))
  expect(JSON.stringify(answer)).toContain('night-time')
  expect(w.last()?.sky).toBe('night')
  expect(w.store.get('sky')).toBe('night')
  await $.command.run(typed('auto'))
  expect(w.last()?.sky).toBe('auto')
})

test('an agent that finishes its task stays a moment to cheer, then leaves', async ($, on) => {
  const clock = mock.clock(on)
  let agents: Agent[] = [{ ...EXPLORER }]
  const w = windowMocks(on, clock, () => agents)

  await $.session.start({ cwd: 'C:/work/app', surface: 'terminal', isInteractive: true })
  await clock.advance(1500)
  expect(w.last()?.helpers[0]?.kind).toBe('Explore')

  agents = [{ ...EXPLORER, status: 'completed' }]
  await clock.advance(1000)
  const done = w.last()?.helpers[0]
  expect(done?.label).toBe('Done')
  expect(done?.cheer).toBe(1)

  await clock.advance(5000)
  expect(w.last()?.helpers).toEqual([])
})
