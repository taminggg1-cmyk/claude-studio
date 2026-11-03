// A scripted HTTP check for who hangs out in the lounge: the `lounge` flag on each character in the window's snapshot,
// and POST /characters/lounge, which saves the choice in models.json. It starts the office server on a throwaway models
// folder (a models.json naming made-up files; no real models needed). Run: node tests/lounge-http.mjs [port]
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const port = Number(process.argv[2]) || 47866
const work = mkdtempSync(join(process.env.CLAUDE_STUDIO_TMP || tmpdir(), 'lounge-http-'))
const models = join(work, 'models')
mkdirSync(models)
const config = {
  claude: { file: 'lead.vrm', persona: { name: 'Lead', color: '#c8775a', about: 'The lead.' } },
  agents: ['a1.vrm', 'a2.vrm', { file: 'a3.vrm' }, 'a4.vrm', 'a5.vrm'].map(e => (typeof e === 'string' ? { file: e } : e)),
  unused: [{ file: 'off.vrm' }],
}
writeFileSync(join(models, 'models.json'), JSON.stringify(config, null, 2))
const lock = join(work, 'lock.json')
const server = spawn(process.execPath, [join(import.meta.dirname, '..', 'office', 'server.mjs')], {
  env: {
    ...process.env,
    CLAUDE_STUDIO_MODELS: models,
    CLAUDE_STUDIO_LOCK: lock,
    CLAUDE_STUDIO_STATS: join(work, 'stats.json'),
    CLAUDE_STUDIO_ROOM: join(work, 'room.json'),
    CLAUDE_STUDIO_WEATHER: join(work, 'weather.json'),
    OFFICE_PORT: String(port),
  },
  stdio: 'ignore',
})
try {
  let office
  for (let i = 0; i < 50 && !office; i++) {
    await new Promise(r => setTimeout(r, 200))
    try {
      office = JSON.parse(readFileSync(lock, 'utf8'))
    } catch {}
  }
  assert.ok(office?.pageKey, 'the server did not start')
  const base = `http://127.0.0.1:${port}`
  const post = (body, headers = {}) =>
    fetch(`${base}/characters/lounge`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base, 'x-page-key': office.pageKey, ...headers }, body: JSON.stringify(body) })
  const snapshot = () =>
    new Promise((done, fail) => {
      const ctl = new AbortController()
      fetch(`${base}/events`, { headers: { origin: base, 'x-page-key': office.pageKey }, signal: ctl.signal })
        .then(async res => {
          let text = ''
          for await (const chunk of res.body) {
            text += Buffer.from(chunk).toString('utf8')
            const m = text.match(/data: ?(.*)\n/)
            if (m) {
              ctl.abort()
              return done(JSON.parse(m[1]))
            }
          }
        })
        .catch(err => (err.name === 'AbortError' ? undefined : fail(err)))
    })
  /** file -> lounge flag, from the window's snapshot (waits for the first scan of the folder). */
  const flags = async () => {
    for (let i = 0; i < 30; i++) {
      const list = (await snapshot()).characters?.list ?? []
      if (list.length >= 7) return Object.fromEntries(list.map(r => [r.file, r.lounge]))
      await new Promise(r => setTimeout(r, 150))
    }
    throw new Error('the characters list never filled')
  }
  const stored = () => JSON.parse(readFileSync(join(models, 'models.json'), 'utf8')).lounge

  // nobody has chosen yet: the first three agents hang out; Claude's own model and switched-off ones never do
  assert.deepEqual(await flags(), { 'lead.vrm': false, 'a1.vrm': true, 'a2.vrm': true, 'a3.vrm': true, 'a4.vrm': false, 'a5.vrm': false, 'off.vrm': false }, 'the first three agents by default')

  assert.equal((await post({ file: 'a4.vrm', on: true }, { 'x-page-key': 'wrong' })).status, 403, 'needs the page key')
  for (const body of [{}, { file: 'a4.vrm' }, { file: 'a4.vrm', on: 'yes' }, { on: true }, { file: '../a4.vrm', on: true }]) assert.equal((await post(body)).status, 400, `refuses ${JSON.stringify(body)}`)
  assert.equal((await post({ file: 'lead.vrm', on: true })).status, 400, "Claude's own model cannot lounge")
  assert.equal((await post({ file: 'off.vrm', on: true })).status, 400, 'a switched-off model cannot lounge')
  assert.equal((await post({ file: 'nope.vrm', on: true })).status, 404, 'an unknown file')
  assert.equal(stored(), undefined, 'refused requests change nothing')

  // the first choice writes the whole list down (the default three, plus or minus the change)
  assert.equal((await post({ file: 'a4.vrm', on: true })).status, 200)
  assert.deepEqual(stored(), ['a1.vrm', 'a2.vrm', 'a3.vrm', 'a4.vrm'], 'adding one keeps the default three')
  assert.equal((await post({ file: 'a1.vrm', on: false })).status, 200)
  assert.deepEqual(stored(), ['a2.vrm', 'a3.vrm', 'a4.vrm'], 'taking one out')
  assert.equal((await post({ file: 'a2.vrm', on: true })).status, 200)
  assert.deepEqual(stored(), ['a2.vrm', 'a3.vrm', 'a4.vrm'], 'adding one already in changes nothing')
  assert.deepEqual(await flags(), { 'lead.vrm': false, 'a1.vrm': false, 'a2.vrm': true, 'a3.vrm': true, 'a4.vrm': true, 'a5.vrm': false, 'off.vrm': false }, 'the snapshot follows')

  // an empty list means nobody, not the default
  for (const file of ['a2.vrm', 'a3.vrm', 'a4.vrm']) assert.equal((await post({ file, on: false })).status, 200)
  assert.deepEqual(stored(), [], 'everyone out')
  assert.equal(Object.values(await flags()).some(Boolean), false, 'nobody in the lounge')

  // switching a lounging model off, or making it Claude, takes it out of the lounge flags (the list keeps it, so it is
  // back in the lounge when it is an agent again); removing a model drops it from the list
  await post({ file: 'a5.vrm', on: true })
  await post({ file: 'a3.vrm', on: true })
  const role = (file, r) => fetch(`${base}/characters/role`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base, 'x-page-key': office.pageKey }, body: JSON.stringify({ file, role: r }) })
  assert.equal((await role('a5.vrm', 'off')).status, 200)
  assert.equal((await flags())['a5.vrm'], false, 'switched off: not in the lounge')
  assert.equal((await role('a5.vrm', 'agent')).status, 200)
  assert.equal((await flags())['a5.vrm'], true, 'an agent again: back in the lounge')
  assert.equal((await fetch(`${base}/characters/remove`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base, 'x-page-key': office.pageKey }, body: JSON.stringify({ file: 'a3.vrm' }) })).status, 200)
  assert.deepEqual(stored(), ['a5.vrm'], 'a removed model leaves the list')
  console.log('lounge-http: all checks passed')
} finally {
  server.kill()
}
