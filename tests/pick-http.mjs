// A scripted HTTP check that a character picked in the panel ends up on the agent, even when the session's mod knows
// nothing about picks (an old mod that drops `character` and sends no `model`). It starts the office server on throwaway
// files (no character models needed) and plays a session: join, take a command with a pick, list the agent, and checks
// the window's snapshot. Run: node tests/pick-http.mjs [port]
import { spawn } from 'node:child_process'
import { readFileSync, mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const port = Number(process.argv[2]) || 47864
const work = mkdtempSync(join(process.env.CLAUDE_STUDIO_TMP || tmpdir(), 'pick-http-'))
mkdirSync(join(work, 'models'))
const lock = join(work, 'lock.json')
const server = spawn(process.execPath, [join(import.meta.dirname, '..', 'office', 'server.mjs')], {
  env: {
    ...process.env,
    CLAUDE_STUDIO_MODELS: join(work, 'models'),
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
  const asSession = (path, body) =>
    fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-office-token': office.token }, body: JSON.stringify(body) })
  const asPage = (path, body) =>
    fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base, 'x-page-key': office.pageKey }, body: JSON.stringify(body) })
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
  const session = 'test-session'
  const main = { name: 'Claude', state: 'idle' }
  const studio = helpers => ({ session, name: 'test', cwd: work, state: { main, helpers, sky: 'auto' } })
  const helperIn = async id => (await snapshot()).sessions.find(s => s.id === session).state.helpers.find(h => h.id === id)

  assert.equal((await asSession('/state', studio([]))).status < 300, true, 'the session joins')
  const text = 'hi mochi, please look at the README and tell me what it says about installing'
  assert.equal((await asPage('/command', { session, kind: 'agent', text, character: 'mochi.vrm' })).status, 202, 'the command is taken')
  const task = `${text.slice(0, 45).trimEnd()}…`
  // an old mod: it lists the agent with its description and no model
  await asSession('/state', studio([{ id: 'a1', task, state: 'working' }, { id: 'a2', task: 'something else', state: 'working' }]))
  assert.equal((await helperIn('a1')).model, 'mochi.vrm', 'the picked character is on the agent')
  assert.equal((await helperIn('a2')).model, undefined, 'another agent is left alone')
  // the next update still carries the pick
  await asSession('/state', studio([{ id: 'a1', task, state: 'done' }]))
  assert.equal((await helperIn('a1')).model, 'mochi.vrm', 'the pick stays on the agent')
  // a pick is used once: a second agent with the same words gets no pick
  await asSession('/state', studio([{ id: 'a1', task, state: 'done' }, { id: 'a3', task, state: 'working' }]))
  assert.equal((await helperIn('a3')).model, undefined, 'a pick dresses one agent only')
  // a short text is its own description
  await asPage('/command', { session, kind: 'agent', text: 'hi mochi', character: 'catchua.vrm' })
  await asSession('/state', studio([{ id: 'a4', task: 'hi mochi', state: 'working' }]))
  assert.equal((await helperIn('a4')).model, 'catchua.vrm', 'a short text matches too')
  // a bad file name is not kept
  assert.equal((await asPage('/command', { session, kind: 'agent', text: 'bad one', character: '../x.vrm' })).status, 202)
  await asSession('/state', studio([{ id: 'a5', task: 'bad one', state: 'working' }]))
  assert.equal((await helperIn('a5')).model, undefined, 'a bad file name is dropped')
  console.log('pick-http: all checks passed')
} finally {
  server.kill()
}
