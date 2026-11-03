// A scripted HTTP check for the days the office was used: the stats file's `days` and `daily`, and the snapshot's
// streak, best streak, days, `yesterday` and the day's standup (set once, by the first session to join on a new day).
// It starts the office server on throwaway files (an old-style stats file with a few days added), then restarts it on
// the same files. Run: node tests/standup-http.mjs [port]
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const port = Number(process.argv[2]) || 47867
const work = mkdtempSync(join(process.env.CLAUDE_STUDIO_TMP || tmpdir(), 'standup-http-'))
const lock = join(work, 'lock.json')
const statsFile = join(work, 'stats.json')
const base = `http://127.0.0.1:${port}`
const sleep = ms => new Promise(r => setTimeout(r, ms))

// local dates, the way the server writes them
const pad = n => String(n).padStart(2, '0')
const dayOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const ago = n => {
  const d = new Date()
  return dayOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() - n))
}
const today = ago(0)

function start() {
  const server = spawn(process.execPath, [join(import.meta.dirname, '..', 'office', 'server.mjs')], {
    env: {
      ...process.env,
      CLAUDE_STUDIO_LOCK: lock,
      CLAUDE_STUDIO_STATS: statsFile,
      CLAUDE_STUDIO_MODELS: join(work, 'models'),
      CLAUDE_STUDIO_ROOM: join(work, 'room.json'),
      CLAUDE_STUDIO_WEATHER: join(work, 'weather.json'),
      OFFICE_PORT: String(port),
    },
    stdio: 'ignore',
  })
  return server
}

async function office(old) {
  for (let i = 0; i < 50; i++) {
    await sleep(200)
    try {
      const got = JSON.parse(readFileSync(lock, 'utf8'))
      if (got.pid !== old) {
        const res = await fetch(`${base}/health`)
        if (res.ok) return got
      }
    } catch {}
  }
  throw new Error('the server did not start')
}

/** The stats part of the window's first snapshot. */
const stats = () =>
  new Promise((done, fail) => {
    const ctl = new AbortController()
    fetch(`${base}/events`, { signal: ctl.signal })
      .then(async res => {
        let text = ''
        for await (const chunk of res.body) {
          text += Buffer.from(chunk).toString('utf8')
          const m = text.match(/data: ?(.*)\n/)
          if (m) {
            ctl.abort()
            return done(JSON.parse(m[1]).stats)
          }
        }
      })
      .catch(err => (err.name === 'AbortError' ? undefined : fail(err)))
  })

const studio = { main: { code: 'idle' }, helpers: [] }
const poster = token => (path, body) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-office-token': token }, body: JSON.stringify(body) })

// an old stats file (no days, daily or standup) still loads; days of use are added here by hand: a run of three days
// up to yesterday, and an older run of five
const older = [12, 11, 10, 9, 8].map(ago)
writeFileSync(statsFile, JSON.stringify({ counts: { commits: 7 }, folders: ['/work/a'], days: [...older, ago(3), ago(2), ago(1), 'nonsense'], daily: { [ago(1)]: { commits: 4, 'files-edited': 9, odd: 3 }, [ago(20)]: { commits: 1 } } }))

let server = start()
try {
  let lockData = await office()
  let post = poster(lockData.token)

  let s = await stats()
  assert.equal(s.counts.commits, 7, 'old counts kept')
  assert.equal(s.today, today, "the server's own date")
  assert.equal(s.streak, 3, 'no session today yet: the streak runs up to yesterday')
  assert.equal(s.best, 5, 'the best streak')
  assert.ok(!s.days.includes('nonsense'), 'bad dates dropped')
  assert.deepEqual(s.yesterday, { day: ago(1), counts: { commits: 4, 'files-edited': 9 } }, "yesterday's counts, only known names")
  assert.equal(s.standup, null, 'no standup before a session joins')

  // the first session of the day joins: today is used, the streak grows, the standup is set
  assert.equal((await post('/state', { session: 'one', name: 'a', cwd: '/work/a', state: studio })).status, 204)
  s = await stats()
  assert.equal(s.streak, 4, 'today counts')
  assert.ok(s.days.includes(today), 'today in the days')
  assert.equal(s.standup?.day, today, "today's standup")
  const at = s.standup.at
  assert.ok(Math.abs(Date.now() - at) < 10_000, 'set just now')
  assert.equal(s.yesterday.day, ago(1), 'yesterday is still the last earlier day')

  // counts go to today's line too (only the daily names); a second session does not start another standup
  assert.equal((await post('/stat', { session: 'one', add: { commits: 2, 'night-commits': 1, pushes: 1 } })).status, 204)
  await sleep(300)
  assert.equal((await post('/state', { session: 'two', name: 'b', cwd: '/work/b', state: studio })).status, 204)
  s = await stats()
  assert.equal(s.standup.at, at, 'the standup is set once')
  assert.equal(s.counts['night-commits'], 1, 'night commits are counted like the rest')

  // the file is written within five seconds
  let file
  for (let i = 0; i < 40; i++) {
    await sleep(250)
    file = JSON.parse(readFileSync(statsFile, 'utf8'))
    if (file.daily?.[today]) break
  }
  assert.deepEqual(file.daily[today], { commits: 2, pushes: 1 }, "today's daily counts")
  assert.equal(file.daily[ago(20)], undefined, 'daily counts older than two weeks are dropped')
  assert.equal(file.days.at(-1), today)
  assert.deepEqual(file.standup, { day: today, at })

  // a restart on the same files keeps it all: a session joining again replays nothing
  server.kill()
  await sleep(400)
  server = start()
  lockData = await office(lockData.pid)
  post = poster(lockData.token)
  assert.equal((await post('/state', { session: 'three', name: 'c', cwd: '/work/c', state: studio })).status, 204)
  s = await stats()
  assert.equal(s.standup.at, at, 'no second standup after a restart')
  assert.equal(s.streak, 4)
  assert.equal(s.days.filter(d => d === today).length, 1, 'today only once')
  console.log('standup-http: all checks passed')
} finally {
  server.kill()
}
