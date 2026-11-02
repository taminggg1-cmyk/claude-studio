// The studio's one shared server. Every interactive Claude Code session on this computer works in the same office: the
// first session to start finds no server and starts this one (as a process of its own, so it outlives that session);
// every later session finds it through a small file and joins it.
//
//   node server.mjs
//
// It listens on 127.0.0.1 (the port it had last time, when it is free, so an open window reconnects by itself) and
// writes ~/.claude/studio-office.json (or $CLAUDE_STUDIO_LOCK) with its port, a random token and its process id. A
// session reads that file, then:
//
//   POST /state  {session, name, state}  the session's studio (its lead and agents), every change and every 10 s
//   POST /leave  {session}               the session ended: its people walk out
//   POST /window {session}               may this session open the window? (yes to one session, when none is open)
//
// both with the token in `x-office-token`. The window reads GET /events (server-sent events): one `state` event per
// change, holding every session at once, `{ sessions: [{ id, name, joined, changed, skyAt, state }] }`.
//
// A session that has not written for 35 seconds has gone (its people walk out). Once no session is left, the server
// waits 45 seconds for a new one, then says goodbye to the window and stops. It has no dependencies beyond Node itself.
//
// Character models live outside this folder, in ~/.claude/studio-models (or $CLAUDE_STUDIO_MODELS), so they can never
// end up in a repository: their licences forbid passing them on. The page reads that folder's models.json and the
// files it names through /models/.

import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url))
const MODELS = normalize(process.env.CLAUDE_STUDIO_MODELS || join(homedir(), '.claude', 'studio-models'))
const LOCK = process.env.CLAUDE_STUDIO_LOCK || join(homedir(), '.claude', 'studio-office.json')
const TOKEN = randomBytes(24).toString('hex')
const SESSION_GONE_MS = 35_000
const EMPTY_LIMIT_MS = 45_000
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
}
/** What the models folder may serve: models, their textures and the folder's models.json. */
const MODEL_TYPES = {
  '.vrm': 'model/gltf-binary',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json',
}

/** @type {Map<string, {id: string, name: string, joined: number, changed: number, skyAt: number, seen: number, state: object, key: string}>} */
const sessions = new Map()
let emptySince = Date.now()
let windowClaimed = 0
let port = 0
const watchers = new Set()

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' })
  res.end(body)
}

/** Only pages this server serves may talk to it (a guard against DNS rebinding). */
function hostIsLocal(req) {
  const host = String(req.headers.host || '')
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`
}

function snapshot() {
  const list = [...sessions.values()].sort((a, b) => a.joined - b.joined)
  return { sessions: list.map(({ id, name, joined, changed, skyAt, state }) => ({ id, name, joined, changed, skyAt, state })) }
}

function broadcast(event, data) {
  const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of watchers) res.write(frame)
}

const share = () => broadcast('state', snapshot())

async function serveModel(res, urlPath) {
  const file = normalize(join(MODELS, decodeURIComponent(urlPath.slice('/models/'.length))))
  const type = MODEL_TYPES[extname(file).toLowerCase()]
  if (!file.startsWith(MODELS + sep) || !type) return send(res, 404, 'not found')
  try {
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': type, 'cache-control': 'max-age=600' })
    res.end(body)
  } catch {
    send(res, 404, 'not found')
  }
}

async function serveFile(res, urlPath) {
  if (urlPath.startsWith('/models/')) return serveModel(res, urlPath)
  const wanted = urlPath === '/' ? '/index.html' : decodeURIComponent(urlPath)
  const file = normalize(join(ROOT, wanted))
  if (!file.startsWith(ROOT + sep) || !TYPES[extname(file)] || file.endsWith('server.mjs')) return send(res, 404, 'not found')
  try {
    send(res, 200, await readFile(file), TYPES[extname(file)])
  } catch {
    send(res, 404, 'not found')
  }
}

/** Reads a JSON body (at most a megabyte) and hands it on, or answers 400. */
function readJson(req, res, then) {
  let body = ''
  req.setEncoding('utf8')
  req.on('data', chunk => {
    body += chunk
    if (body.length > 1_000_000) req.destroy()
  })
  req.on('end', () => {
    let data
    try {
      data = JSON.parse(body)
    } catch {
      return send(res, 400, 'bad json')
    }
    if (!data || typeof data.session !== 'string' || !data.session || data.session.length > 128) return send(res, 400, 'no session')
    then(data)
  })
}

/** A session's studio: its lead (`state.main`) and agents (`state.helpers`), with the clock, usage and sky it sees. */
function takeState(data) {
  const now = Date.now()
  const old = sessions.get(data.session)
  const name = typeof data.name === 'string' ? data.name.slice(0, 80) : ''
  if (!data.state || typeof data.state !== 'object' || !data.state.main) {
    // a session the server has not heard from yet (it started after a restart) must send its whole studio
    if (!old) return false
    old.seen = now
    return true
  }
  const key = JSON.stringify(data.state)
  if (old) {
    old.seen = now
    old.name = name || old.name
    if (old.key === key) return true
    if (old.state.sky !== data.state.sky) old.skyAt = now
    Object.assign(old, { state: data.state, key, changed: now })
  } else {
    sessions.set(data.session, { id: data.session, name, joined: now, changed: now, skyAt: data.state.sky && data.state.sky !== 'auto' ? now : 0, seen: now, state: data.state, key })
  }
  share()
  return true
}

const server = createServer((req, res) => {
  if (!hostIsLocal(req)) return send(res, 403, 'forbidden')
  const url = new URL(req.url || '/', `http://127.0.0.1:${port}`)

  if (req.method === 'POST' && (url.pathname === '/state' || url.pathname === '/leave' || url.pathname === '/window')) {
    if (req.headers['x-office-token'] !== TOKEN) return send(res, 403, 'forbidden')
    readJson(req, res, data => {
      if (url.pathname === '/window') {
        // only one session opens the window: the first to ask while none is open (the next may ask 20 s later)
        const open = watchers.size === 0 && Date.now() - windowClaimed > 20_000
        if (open) windowClaimed = Date.now()
        return send(res, 200, JSON.stringify({ open }), 'application/json')
      }
      if (url.pathname === '/leave') {
        if (sessions.delete(data.session)) share()
        if (!sessions.size) emptySince = Date.now()
        return send(res, 204, '')
      }
      // 409 asks the session for its whole studio (the server was restarted and does not know it)
      send(res, takeState(data) ? 204 : 409, '')
    })
    return
  }

  if (req.method === 'GET' && url.pathname === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' })
    res.write('retry: 1500\n\n')
    res.write(`event: state\ndata: ${JSON.stringify(snapshot())}\n\n`)
    watchers.add(res)
    req.on('close', () => watchers.delete(res))
    return
  }

  // who answers on this port, so a session never mistakes another program for the office
  if (req.method === 'GET' && url.pathname === '/health')
    return send(res, 200, JSON.stringify({ office: 'claude-studio', pid: process.pid, sessions: sessions.size, windows: watchers.size }), 'application/json')
  if (req.method === 'GET') return void serveFile(res, url.pathname)
  send(res, 405, 'method not allowed')
})

// ------------------------------------------------------------------------------------------------ one office only

async function readLock() {
  try {
    return JSON.parse(await readFile(LOCK, 'utf8'))
  } catch {
    return null
  }
}

/** Whether another office server already answers at the port the lock file names. */
async function otherOfficeAlive(lock) {
  if (!lock?.port || lock.pid === process.pid) return false
  try {
    const res = await fetch(`http://127.0.0.1:${lock.port}/health`, { signal: AbortSignal.timeout(1500) })
    const body = await res.json()
    return body?.office === 'claude-studio' && body.pid !== process.pid
  } catch {
    return false
  }
}

async function releaseLock() {
  const lock = await readLock()
  if (lock?.pid === process.pid) await rm(LOCK, { force: true }).catch(() => undefined)
}

function listen(wanted) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(wanted, '127.0.0.1', () => {
      server.off('error', reject)
      resolve(server.address().port)
    })
  })
}

async function start() {
  const lock = await readLock()
  if (await otherOfficeAlive(lock)) process.exit(0) // the office is already open: nothing to do
  const wanted = Number(process.env.OFFICE_PORT || lock?.port || 0)
  try {
    port = await listen(wanted)
  } catch {
    port = await listen(0) // last time's port is taken by something else
  }
  await writeFile(LOCK, JSON.stringify({ port, token: TOKEN, pid: process.pid, started: Date.now() }), { mode: 0o600 })
  // two sessions starting at the same moment may start two servers: the one whose lock was written last stays
  await new Promise(r => setTimeout(r, 400))
  const after = await readLock()
  if (after?.pid !== process.pid && (await otherOfficeAlive(after))) {
    server.close()
    process.exit(0)
  }
  process.stdout.write(`OFFICE_PORT=${port}\n`)
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK'])
  process.on(signal, () => {
    broadcast('bye', {})
    void releaseLock().finally(() => process.exit(0))
  })

await start()

// keep the window's connection warm, let go of sessions that went quiet, and stop once the office has been empty a while
setInterval(() => {
  for (const res of watchers) res.write(': ping\n\n')
  const now = Date.now()
  let gone = false
  for (const [id, s] of sessions)
    if (now - s.seen > SESSION_GONE_MS) {
      sessions.delete(id)
      gone = true
    }
  if (gone) {
    share()
    if (!sessions.size) emptySince = now
  }
  if (!sessions.size && now - emptySince > EMPTY_LIMIT_MS) {
    broadcast('bye', {})
    void releaseLock().finally(() => setTimeout(() => process.exit(0), 300))
  }
}, 5000)
