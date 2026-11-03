import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { nextCronRun, parseCron, prettyService } from '../hooks/features/gadgets'

const LOCK = 'C:/Users/me/.claude/studio-office.json'

/** Mocks a running shared office and collects every studio state the mod posts to it. */
function officeMocks(on: Parameters<TestBody>[1]) {
  const posts: { path: string; body: Record<string, any> }[] = []
  mock.env(on, { USERPROFILE: 'C:\\Users\\me' })
  on('command.register', () => ({ value: { command: 'office' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.list', () => ({ value: [] }))
  on('session.id', () => ({ value: 'session-one' }))
  on('fs.stat', () => ({ deny: 'ENOENT' }))
  on('fs.read', (_, e) => (e.path.replace(/[\\]/g, '/') === LOCK ? { value: JSON.stringify({ port: 4321, token: 't', pid: 7 }) } : { deny: 'ENOENT' }))
  on('http.fetch', (_, e) => {
    const path = new URL(e.url).pathname
    if (path === '/health') return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ office: 'claude-studio', windows: 1 }) } }
    posts.push({ path, body: JSON.parse(String(e.init?.body ?? '{}')) })
    return { value: { status: 204, ok: true, headers: {}, text: '' } }
  })
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.log', () => ({ value: undefined }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: 'ok' }))
  /** The gadgets extras of the newest studio state. */
  const extras = () => posts.filter(p => p.path === '/state').pop()?.body.state.extras?.gadgets
  return { extras }
}

/** Lets the mod publish what it knows (it does so at least once a second). */
async function settle(clock: ReturnType<typeof mock.clock>) {
  await clock.advance(1500)
  await clock.advance(0)
  await clock.advance(0)
}

test('ScheduleWakeup puts an alarm on the desk with the time the tool gave', async ($, on) => {
  const clock = mock.clock(on)
  const w = officeMocks(on)
  const at = Date.now() + 600_000
  on('tool.call', () => ({ result: { scheduledFor: at, clampedDelaySeconds: 600, wasClamped: false } }))
  await $.session.start({ cwd: 'C:/work/app', surface: 'terminal', isInteractive: true })
  await settle(clock)
  expect(w.extras()).toBeUndefined()

  await $.tool.call({ tool: 'ScheduleWakeup', delaySeconds: 600, reason: 'check the deploy', prompt: '/loop deploy', noop: true })
  await settle(clock)
  expect(w.extras().alarms).toEqual([{ id: 'wakeup', kind: 'wakeup', at, label: 'check the deploy' }])
  expect(w.extras().rang).toBe(null)

  // a new wake-up replaces the old one
  await $.tool.call({ tool: 'ScheduleWakeup', delaySeconds: 1200, reason: 'again', prompt: '/loop deploy', noop: true })
  await settle(clock)
  expect(w.extras().alarms.length).toBe(1)
  expect(w.extras().alarms[0].label).toBe('again')
})

test('without a time in the answer, the delay decides, and stop clears the alarm', async ($, on) => {
  const clock = mock.clock(on)
  const w = officeMocks(on)
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ cwd: 'C:/work/app', surface: 'terminal', isInteractive: true })
  const before = Date.now()
  await $.tool.call({ tool: 'ScheduleWakeup', delaySeconds: 30, reason: 'soon', prompt: 'x', noop: false })
  await settle(clock)
  // the runtime clamps a delay to 60 seconds at least
  const at = w.extras().alarms[0].at as number
  expect(at - before).toBeGreaterThanOrEqual(60_000)
  expect(at - before).toBeLessThan(70_000)

  await $.tool.call({ tool: 'ScheduleWakeup', stop: true })
  await settle(clock)
  expect(w.extras()?.alarms ?? []).toEqual([])
})

test('a cron job is an alarm until it is deleted, and a turn after its time makes it ring', async ($, on) => {
  const clock = mock.clock(on)
  const w = officeMocks(on)
  const soon = Date.now() - 5_000
  on('tool.call', (_, e) => {
    if ((e as { tool?: string }).tool === 'CronCreate') return { result: { id: 'job1', humanSchedule: 'every minute', recurring: true, nextFireAt: soon } }
    return { result: { id: 'job1' } }
  })
  await $.session.start({ cwd: 'C:/work/app', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'CronCreate', cron: '* * * * *', prompt: 'run the tests\nand report', recurring: true })
  await settle(clock)
  expect(w.extras().alarms[0]).toMatchObject({ id: 'job1', kind: 'cron', at: soon, label: 'run the tests' })

  // the main loop starts a turn just after the job's time: it rang, and the recurring job moves on
  await $.turn.start({ text: 'run the tests', turnId: 't1' })
  await settle(clock)
  expect(w.extras().rang).toMatchObject({ id: 'job1', label: 'run the tests' })
  expect(w.extras().alarms[0].at).toBeGreaterThan(Date.now())

  await $.tool.call({ tool: 'CronDelete', id: 'job1' })
  await settle(clock)
  expect(w.extras().alarms).toEqual([])
})

test('an agent turn does not ring the alarm', async ($, on) => {
  const clock = mock.clock(on)
  const w = officeMocks(on)
  on('tool.call', () => ({ result: { scheduledFor: Date.now() - 1000 } }))
  await $.session.start({ cwd: 'C:/work/app', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'ScheduleWakeup', delaySeconds: 60, reason: 'later', prompt: 'x', noop: true })
  await $.turn.start({ text: 'agent work', turnId: 't2', agentId: 'a1' })
  await settle(clock)
  expect(w.extras().rang).toBe(null)
  expect(w.extras().alarms.length).toBe(1)
})

test('an MCP tool call is a phone call to the prettified service, and it ends with the tool', async ($, on) => {
  const clock = mock.clock(on)
  const w = officeMocks(on)
  let release: () => void = () => undefined
  const gate = new Promise<void>(resolve => (release = resolve))
  on('tool.call', async (_, e) => {
    const tool = (e as { tool?: string }).tool
    if (tool === 'mcp__claude_ai_Slack__slack_send_message') {
      await gate
      return { result: 'sent' }
    }
    if (tool === 'mcp__claude_ai_Claude_Docs__read') return { isError: true as const, result: 'no such doc', text: 'no such doc' }
    return { result: {} }
  })
  await $.session.start({ cwd: 'C:/work/app', surface: 'terminal', isInteractive: true })
  await settle(clock)

  // a call that has not come back yet
  const slack = $.tool.call({ tool: 'mcp__claude_ai_Slack__slack_send_message', text: 'hi' })
  await settle(clock)
  let x = w.extras()
  expect(x.calls.length).toBe(1)
  expect(x.calls[0]).toMatchObject({ who: 'main', service: 'Slack' })
  expect(x.phones).toEqual(['main'])

  release()
  await slack
  await settle(clock)
  x = w.extras()
  expect(x.calls).toEqual([])
  expect(x.callsDone).toMatchObject([{ who: 'main', service: 'Slack', ok: true }])
  expect(x.phones).toEqual(['main'])

  // a call that failed
  await $.tool.call({ tool: 'mcp__claude_ai_Claude_Docs__read', id: 'x' })
  await settle(clock)
  expect(w.extras().callsDone[1]).toMatchObject({ service: 'Claude Docs', ok: false })

  // an ordinary tool is not a phone call
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await settle(clock)
  expect(w.extras().callsDone.length).toBe(2)
})

test('server names are made readable', () => {
  expect(prettyService('claude_ai_Slack')).toBe('Slack')
  expect(prettyService('claude_ai_Claude_Docs')).toBe('Claude Docs')
  expect(prettyService('plugin_playwright_playwright')).toBe('Playwright')
  expect(prettyService('github')).toBe('Github')
  expect(prettyService('my-server')).toBe('My server')
  expect(prettyService('')).toBe('a service')
})

test('the cron parser reads numbers, stars, steps, lists and ranges, in local time', () => {
  const at = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi).getTime()
  // 2026-11-03 is a Tuesday
  const from = at(2026, 11, 3, 14, 7)
  expect(nextCronRun('* * * * *', from)).toBe(at(2026, 11, 3, 14, 8))
  expect(nextCronRun('*/5 * * * *', from)).toBe(at(2026, 11, 3, 14, 10))
  expect(nextCronRun('30 14 * * *', from)).toBe(at(2026, 11, 3, 14, 30))
  expect(nextCronRun('0 9 * * *', from)).toBe(at(2026, 11, 4, 9, 0))
  expect(nextCronRun('0,30 9-17 * * 1-5', from)).toBe(at(2026, 11, 3, 14, 30))
  // weekdays only: after Friday evening comes Monday
  expect(nextCronRun('0 9 * * 1-5', at(2026, 11, 6, 18, 0))).toBe(at(2026, 11, 9, 9, 0))
  // Sunday is 0 and 7
  expect(nextCronRun('0 12 * * 7', from)).toBe(at(2026, 11, 8, 12, 0))
  expect(nextCronRun('0 12 * * 0', from)).toBe(at(2026, 11, 8, 12, 0))
  // a date: once a year
  expect(nextCronRun('30 14 28 2 *', from)).toBe(at(2027, 2, 28, 14, 30))
  // a step from a start, and from a range
  expect(nextCronRun('10/20 * * * *', at(2026, 11, 3, 14, 31))).toBe(at(2026, 11, 3, 14, 50))
  expect(nextCronRun('0-20/10 15 * * *', from)).toBe(at(2026, 11, 3, 15, 0))
  // the day of the month or the weekday, when both are named
  expect(nextCronRun('0 8 15 * 1', from)).toBe(at(2026, 11, 9, 8, 0))
  // text it cannot read
  expect(parseCron('every day')).toBe(null)
  expect(parseCron('61 * * * *')).toBe(null)
  expect(parseCron('* * * *')).toBe(null)
  expect(parseCron('*/0 * * * *')).toBe(null)
  expect(parseCron('0 9 * * MON')).toBe(null)
  expect(nextCronRun('nonsense', from)).toBe(null)
})
