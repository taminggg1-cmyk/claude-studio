import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const LOCK = 'C:/Users/me/.claude/studio-office.json'
const run = (stdout = '', exitCode = 0) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
const shell = (stdout: string, stderr = '') => ({ result: { stdout, stderr, interrupted: false } })
const failed = (text: string) => ({ isError: true as const, result: text, text })

/** What git answers in the tests: the repository's root, its remote, and which commits no remote has yet. */
type Repo = { unpushed: string[]; onRemote: string[]; waiting: string }

function officeMocks(on: Parameters<TestBody>[1], repo: Repo) {
  const states: Record<string, any>[] = []
  const stats: Record<string, number>[] = []
  const gitCalls: string[][] = []
  mock.env(on, { USERPROFILE: 'C:\\Users\\me' })
  on('command.register', () => ({ value: { command: 'office' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.list', () => ({ value: [] }))
  on('session.id', () => ({ value: 'session-one' }))
  on('session.cwd', () => ({ value: 'C:\\work\\app' }))
  on('fs.stat', () => ({ deny: 'ENOENT' }))
  on('fs.read', (_, e) => (e.path.replace(/[\\]/g, '/') === LOCK ? { value: JSON.stringify({ port: 4321, token: 't', pid: 7 }) } : { deny: 'ENOENT' }))
  on('process.run', (_, e) => {
    const argv = [...e.argv]
    if (argv[0] !== 'git') return run()
    gitCalls.push(argv)
    if (argv.includes('rev-parse')) {
      // `git -C <here> -C <dir> ... rev-parse --show-toplevel`: the last folder named is where it ran
      const dirs = argv.filter((_, i) => argv[i - 1] === '-C')
      const last = (dirs[dirs.length - 1] ?? '').replace(/\\/g, '/')
      return run(last.includes('other') ? 'C:/work/other\n' : 'C:/work/app\n')
    }
    if (argv.includes('remote')) return run('origin\n')
    if (argv.includes('--source')) return run(repo.waiting)
    if (argv.includes('log')) return run(repo.unpushed.join('\n'))
    if (argv.includes('rev-list')) return run(repo.onRemote.join('\n'))
    return run()
  })
  on('http.fetch', (_, e) => {
    const path = new URL(e.url).pathname
    if (path === '/health') return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ office: 'claude-studio', windows: 1 }) } }
    const body = JSON.parse(String(e.init?.body ?? '{}'))
    if (path === '/state') states.push(body.state)
    if (path === '/stat') stats.push(body.add)
    return { value: { status: 204, ok: true, headers: {}, text: '' } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  return {
    mail: () => states[states.length - 1]?.extras?.mailroom,
    shift: () => states[states.length - 1]?.extras?.['shift-report'],
    total: (name: string) => stats.reduce((sum, add) => sum + (add[name] ?? 0), 0),
    gitCalls,
  }
}

test('a commit puts a letter on the desk, a push sends it, and a pull request goes in as a parcel', async ($, on) => {
  const clock = mock.clock(on)
  const repo: Repo = { unpushed: [], onRemote: [], waiting: '' }
  const w = officeMocks(on, repo)
  on('tool.call', (_, e) => {
    const command = String((e as { command?: unknown }).command ?? '')
    if (/git commit/.test(command)) return shell('[main 1a2b3c4] Add the parser\n 1 file changed, 3 insertions(+)\n')
    if (/git push/.test(command)) return shell('', 'To https://github.com/me/app.git\n   0a0a0a0..1a2b3c4  main -> main\n')
    if (/gh pr create/.test(command)) return shell('https://github.com/me/app/pull/7\n')
    return shell('')
  })

  await $.session.start({ cwd: 'C:\\work\\app', surface: 'terminal', isInteractive: true })
  await clock.advance(1500)

  repo.unpushed = ['1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b']
  await $.tool.call({ tool: 'Bash', command: 'git add -A && git commit -m "Add the parser"' })
  await clock.advance(1500)
  let mail = w.mail()
  expect(mail.waiting).toBe(1)
  expect(mail.letters[0]).toMatchObject({ sha: '1a2b3c4', subject: 'Add the parser', branch: 'main', repo: 'app' })
  expect(mail.events.map((e: { kind: string }) => e.kind)).toEqual(['commit'])
  expect(mail.commits).toBe(1)

  // the push: git now says no commit is waiting, so the letter went out
  repo.unpushed = []
  await $.tool.call({ tool: 'Bash', command: 'git push' })
  await clock.advance(1500)
  mail = w.mail()
  expect(mail.waiting).toBe(0)
  expect(mail.events[mail.events.length - 1]).toMatchObject({ kind: 'push', n: 1, repo: 'app', branch: 'main' })
  expect(mail.pushes).toBe(1)

  await $.tool.call({ tool: 'Bash', command: 'gh pr create --title "Add the parser" --body "It parses."' })
  await clock.advance(1500)
  mail = w.mail()
  expect(mail.events[mail.events.length - 1]).toMatchObject({ kind: 'pr', number: 7, repo: 'app', title: 'Add the parser', url: 'https://github.com/me/app/pull/7' })
  expect(mail.prs).toBe(1)
  // every event has its own id, so the window acts on each once
  expect(new Set(mail.events.map((e: { id: string }) => e.id)).size).toBe(3)

  // the counts reach the shift report and the office's lifetime counts
  expect(w.shift()).toMatchObject({ commits: 1, pushes: 1, prs: 1 })
  await clock.advance(6000)
  expect(w.total('commits')).toBe(1)
  expect(w.total('pushes')).toBe(1)
  expect(w.total('pull-requests')).toBe(1)
})

test("only git's own words count: no letter for git log, an echo, a dry run, a rejected push or an amend", async ($, on) => {
  const clock = mock.clock(on)
  const repo: Repo = { unpushed: [], onRemote: [], waiting: '' }
  const w = officeMocks(on, repo)
  on('tool.call', (_, e) => {
    const command = String((e as { command?: unknown }).command ?? '')
    if (/--amend/.test(command)) return shell('[main 9f9f9f9] Add the parser, properly\n')
    if (/git commit/.test(command) && !/echo/.test(command)) return shell('[main 1a2b3c4] Add the parser\n')
    if (/git log/.test(command)) return shell('1a2b3c4 Add the parser\n')
    if (/--dry-run/.test(command)) return shell('', 'To https://github.com/me/app.git\n   0a0a0a0..1a2b3c4  main -> main\n')
    if (/git push/.test(command)) return failed(' ! [rejected]        main -> main (fetch first)\nerror: failed to push some refs')
    return shell('git commit')
  })

  await $.session.start({ cwd: 'C:\\work\\app', surface: 'terminal', isInteractive: true })
  await clock.advance(1500)
  await $.tool.call({ tool: 'Bash', command: 'git log --oneline -5' })
  await $.tool.call({ tool: 'Bash', command: 'echo "git commit"' })
  repo.unpushed = ['1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b']
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "Add the parser"' })
  await $.tool.call({ tool: 'Bash', command: 'git commit --amend -m "Add the parser, properly"' })
  await $.tool.call({ tool: 'Bash', command: 'git push --dry-run' })
  await $.tool.call({ tool: 'Bash', command: 'git push' })
  await clock.advance(1500)

  const mail = w.mail()
  // one letter, carrying the amended commit
  expect(mail.waiting).toBe(1)
  expect(mail.letters[0]).toMatchObject({ sha: '9f9f9f9', subject: 'Add the parser, properly' })
  expect(mail.events.map((e: { kind: string }) => e.kind)).toEqual(['commit'])
  expect(mail.commits).toBe(1)
  expect(mail.pushes).toBe(0)
  expect(w.shift()).toMatchObject({ commits: 1, pushes: 0, prs: 0 })
})

test('a commit made in another folder is that repository’s letter', async ($, on) => {
  const clock = mock.clock(on)
  const repo: Repo = { unpushed: [], onRemote: [], waiting: '' }
  const w = officeMocks(on, repo)
  on('tool.call', () => shell('[feature 2b2b2b2] Tidy the docs\n'))

  await $.session.start({ cwd: 'C:\\work\\app', surface: 'terminal', isInteractive: true })
  await clock.advance(1500)
  await $.tool.call({ tool: 'PowerShell', command: 'git -C C:/work/other commit -am "Tidy the docs"' })
  await clock.advance(1500)

  expect(w.mail().letters[0]).toMatchObject({ sha: '2b2b2b2', branch: 'feature', repo: 'other' })
  expect(w.gitCalls.some(argv => argv.includes('C:/work/other') && argv.includes('rev-parse'))).toBe(true)
})

test('commits already waiting are picked up, and a push made elsewhere sends them', async ($, on) => {
  const clock = mock.clock(on)
  const old = '3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c'
  const repo: Repo = { unpushed: [old], onRemote: [], waiting: `${old}\trefs/heads/main\t1700000000\tOld work\n` }
  const w = officeMocks(on, repo)
  on('tool.call', () => shell(''))

  await $.session.start({ cwd: 'C:\\work\\app', surface: 'terminal', isInteractive: true })
  await clock.advance(1500)
  let mail = w.mail()
  expect(mail.waiting).toBe(1)
  expect(mail.letters[0]).toMatchObject({ sha: '3c3c3c3', subject: 'Old work', branch: 'main', repo: 'app', at: 1700000000000 })
  // picked-up letters are not new commits: no envelope flies in for them
  expect(mail.events).toEqual([])

  // you push in your own terminal: the next check finds the commit on the remote
  repo.unpushed = []
  repo.onRemote = [old]
  await clock.advance(46000)
  mail = w.mail()
  expect(mail.waiting).toBe(0)
  expect(mail.events[mail.events.length - 1]).toMatchObject({ kind: 'push', n: 1, outside: true })
  // a push Claude did not make is not one of hers
  expect(mail.pushes).toBe(0)
})
