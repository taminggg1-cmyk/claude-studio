// A scripted HTTP check for POST /characters/scale. It starts the office server on a COPY of the models folder (pass
// its path as the first argument; never the real ~/.claude/studio-models) and checks that bad sizes are refused and a
// good one is stored. Run: node tests/scale-http.mjs <models copy> [port]
import { spawn } from 'node:child_process'
import { readFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const models = resolve(process.argv[2] || '')
const port = Number(process.argv[3]) || 47862
if (!process.argv[2] || /[\/]\.claude[\/]studio-models[\/]?$/.test(models)) throw new Error('Give the path of a copy of the models folder.')
const work = mkdtempSync(join(tmpdir(), 'scale-http-'))
const lock = join(work, 'lock.json')
const server = spawn(process.execPath, [join(import.meta.dirname, '..', 'office', 'server.mjs')], {
  env: { ...process.env, CLAUDE_STUDIO_MODELS: models, CLAUDE_STUDIO_LOCK: lock, CLAUDE_STUDIO_STATS: join(work, 'stats.json'), CLAUDE_STUDIO_ROOM: join(work, 'room.json'), OFFICE_PORT: String(port) },
  stdio: 'ignore',
})
try {
  let key = ''
  for (let i = 0; i < 50 && !key; i++) {
    await new Promise(r => setTimeout(r, 200))
    try {
      key = JSON.parse(readFileSync(lock, 'utf8')).pageKey
    } catch {}
  }
  assert.ok(key, 'the server did not start')
  const base = `http://127.0.0.1:${port}`
  const post = (body, headers = {}) =>
    fetch(`${base}/characters/scale`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base, 'x-page-key': key, ...headers }, body: JSON.stringify(body) })
  const file = JSON.parse(readFileSync(join(models, 'models.json'), 'utf8')).claude.file

  assert.equal((await post({ file, scale: 1.2 }, { 'x-page-key': 'wrong' })).status, 403, 'needs the page key')
  for (const scale of [0.5, 1.5, -1, 0, '1.2', null, NaN, 'big', [1]]) assert.equal((await post({ file, scale })).status, 400, `refuses ${JSON.stringify(scale)}`)
  assert.equal((await post({ file: 'nope.vrm', scale: 1.1 })).status, 404, 'unknown file')
  assert.equal((await post({ file: '../x.vrm', scale: 1.1 })).status, 400, 'path in the name')
  assert.equal((await post({ scale: 1.1 })).status, 400, 'no file')
  const ok = await post({ file, scale: 1.234 })
  assert.equal(ok.status, 200)
  assert.equal((await ok.json()).scale, 1.23)
  const stored = JSON.parse(readFileSync(join(models, 'models.json'), 'utf8'))
  assert.equal(stored.claude.scale, 1.23, 'stored in models.json')
  assert.ok(readFileSync(join(models, 'models.json.bak'), 'utf8'), 'a backup was kept')
  assert.equal((await post({ file, scale: 1 })).status, 200)
  assert.equal('scale' in JSON.parse(readFileSync(join(models, 'models.json'), 'utf8')).claude, false, 'size 1 removes the field')
  console.log('scale-http: all checks passed')
} finally {
  server.kill()
}
