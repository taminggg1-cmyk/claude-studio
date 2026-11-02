import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const LOCK = 'C:/Users/me/.claude/studio-office.json'
const OK_RUN = { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }

/** The shared office, already running, with the page key in its lock file and `inbox` waiting for this session. */
function officeWithInbox(on: Parameters<TestBody>[1], inbox: unknown[]) {
  const runs: string[][] = []
  const prompts: string[] = []
  const spawns: { prompt: string; subagentType?: string; description?: string }[] = []
  mock.env(on, { USERPROFILE: 'C:\\Users\\me' })
  on('command.register', () => ({ value: { command: 'office' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', () => ({ value: undefined }))
  on('agent.list', () => ({ value: [] }))
  on('session.id', () => ({ value: 'session-one' }))
  on('fs.stat', (_, e) => (e.path.includes('msedge') ? { value: { kind: 'file', size: 1, mtimeMs: 0, isLink: false } } : { deny: 'ENOENT' }))
  on('fs.read', (_, e) =>
    e.path.replace(/\\/g, '/') === LOCK ? { value: JSON.stringify({ port: 4321, token: 'secret-token', pageKey: 'abcdef0123456789', pid: 7 }) } : { deny: 'ENOENT' },
  )
  on('process.run', (_, e) => {
    runs.push([...e.argv])
    return OK_RUN
  })
  on('http.fetch', (_, e) => {
    const path = new URL(e.url).pathname
    if (path === '/health') return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ office: 'claude-studio', windows: 0 }) } }
    if (path === '/window') return { value: { status: 200, ok: true, headers: {}, text: '{"open":true}' } }
    if (path === '/inbox') {
      const commands = inbox.splice(0)
      return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ commands }) } }
    }
    return { value: { status: 204, ok: true, headers: {}, text: '' } }
  })
  on('prompt.submit', (_, e) => {
    prompts.push(e.text)
    return { text: e.text }
  })
  on('agent.spawn', (_, e) => {
    // the testing kit hands the hook the Agent tool's own input, where the kind is `subagent_type`
    const raw = e as unknown as { subagent_type?: string }
    spawns.push({ prompt: e.prompt, subagentType: e.subagentType ?? raw.subagent_type, description: e.description })
    return { model: 'test-model', agentId: 'new-agent' }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  return { runs, prompts, spawns }
}

test('the window opens with its page key after the #, so only it can ask the office for things', async ($, on) => {
  const clock = mock.clock(on)
  const w = officeWithInbox(on, [])
  await $.session.start({ cwd: 'C:/work/my-app', surface: 'terminal', isInteractive: true })
  await clock.advance(1500)
  const opened = w.runs.find(argv => argv.some(a => a.endsWith('place-window.ps1')))
  expect(opened?.[opened.indexOf('-Url') + 1]).toBe('http://127.0.0.1:4321/#key=abcdef0123456789')
})

test('a prompt and an agent asked for in the window reach this session', async ($, on) => {
  const clock = mock.clock(on)
  const now = Date.now()
  const w = officeWithInbox(on, [
    { id: 'c1', kind: 'prompt', text: 'Summarise the README', at: now },
    { id: 'c2', kind: 'agent', text: 'Find every TODO in src', agentType: 'Explore', at: now },
  ])
  await $.session.start({ cwd: 'C:/work/my-app', surface: 'terminal', isInteractive: true })
  await clock.advance(4000)
  // the prompt goes in as the person's own words
  expect(w.prompts).toEqual(['Summarise the README'])
  // the agent starts with the task as its prompt, of the kind asked for
  expect(w.spawns.length).toBe(1)
  expect(w.spawns[0]?.prompt).toBe('Find every TODO in src')
  expect(w.spawns[0]?.subagentType).toBe('Explore')
  // each command runs once, not again at the next poll
  await clock.advance(4000)
  expect(w.prompts.length).toBe(1)
  expect(w.spawns.length).toBe(1)
})
