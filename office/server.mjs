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
//   POST /stat   {session, add: {k: n}}  adds to the office's lifetime counts (kept in ~/.claude/studio-stats.json)
//   POST /inbox  {session}               what the window asked this session to do since the last time (and clears it)
//
// all with the token in `x-office-token`. The window reads GET /events (server-sent events): one `state` event per
// change, holding every session at once, `{ sessions: [{ id, name, cwd, joined, changed, skyAt, state }], stats }`.
//
// The window itself may ask for things, from this server's own origin and with the page key in `x-page-key`. The key is
// in the lock file, and the session that opens the window passes it in the window's address (after a #, which the
// browser never sends), so only the window a session opened can ask:
//
//   POST /command     {session, kind: 'prompt' | 'agent', text, agentType?}  queued for that session's next /inbox
//   POST /new-session {folder}                                               opens a new terminal running claude there
//
// A session that has not written for 35 seconds has gone (its people walk out). Once no session is left, the server
// waits 45 seconds for a new one, then says goodbye to the window and stops. It has no dependencies beyond Node itself.
//
// Character models live outside this folder, in ~/.claude/studio-models (or $CLAUDE_STUDIO_MODELS), so they can never
// end up in a repository: their licences forbid passing them on. The page reads that folder's models.json and the
// files it names through /models/.

import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { readFile, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, extname, isAbsolute, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import setupCharacters from './server-features/characters.mjs'
import setupDecorate from './server-features/decorate.mjs'
import setupWeather from './server-features/weather.mjs'

const ROOT = dirname(fileURLToPath(import.meta.url))
const MODELS = normalize(process.env.CLAUDE_STUDIO_MODELS || join(homedir(), '.claude', 'studio-models'))
const LOCK = process.env.CLAUDE_STUDIO_LOCK || join(homedir(), '.claude', 'studio-office.json')
const TOKEN = randomBytes(24).toString('hex')
/** The window's own key for asking things of the office (POST /command, /new-session); written to the lock file. */
const PAGE_KEY = randomBytes(24).toString('hex')
const STATS = process.env.CLAUDE_STUDIO_STATS || join(homedir(), '.claude', 'studio-stats.json')
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

/** @type {Map<string, {id: string, name: string, cwd: string, joined: number, changed: number, skyAt: number, seen: number, state: object, key: string}>} */
const sessions = new Map()
let emptySince = Date.now()
let windowClaimed = 0
let port = 0
const watchers = new Set()
/** What the window asked each session to do, waiting for that session's next /inbox. */
const inboxes = new Map()
/** The office's lifetime counts ({ counts: {name: n}, folders: [recent session folders] }), kept in STATS. */
let stats = { counts: {}, folders: [] }
let statsDirty = false

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
  const snap = { sessions: list.map(({ id, name, cwd, joined, changed, skyAt, state }) => ({ id, name, cwd, joined, changed, skyAt, state })), stats }
  for (const [name, get] of parts) {
    try {
      snap[name] = get()
    } catch {
      // leave that part out this time
    }
  }
  return snap
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
  if (!file.startsWith(ROOT + sep) || !TYPES[extname(file)] || file.endsWith('server.mjs') || file.includes(`${sep}server-features${sep}`))
    return send(res, 404, 'not found')
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
  const cwd = typeof data.cwd === 'string' ? data.cwd.slice(0, 400) : ''
  if (cwd && !stats.folders.includes(cwd)) {
    stats.folders = [cwd, ...stats.folders].slice(0, 12)
    statsDirty = true
  }
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
    old.cwd = cwd || old.cwd
    if (old.key === key) return true
    if (old.state.sky !== data.state.sky) old.skyAt = now
    Object.assign(old, { state: data.state, key, changed: now })
  } else {
    sessions.set(data.session, { id: data.session, name, cwd, joined: now, changed: now, skyAt: data.state.sky && data.state.sky !== 'auto' ? now : 0, seen: now, state: data.state, key })
  }
  share()
  return true
}

// ------------------------------------------------------------------------------------------------ counts and asks

async function loadStats() {
  try {
    const got = JSON.parse(await readFile(STATS, 'utf8'))
    if (got && typeof got === 'object')
      stats = {
        counts: { ...(got.counts || {}) },
        folders: Array.isArray(got.folders) ? got.folders.filter(f => typeof f === 'string').slice(0, 12) : [],
      }
  } catch {
    // no counts yet
  }
}

/** Adds a session's counts (names like `agents-hired`, at most 100 at a time) to the office's lifetime counts. */
function addStats(add) {
  if (!add || typeof add !== 'object') return false
  let changed = false
  for (const [k, n] of Object.entries(add)) {
    if (!/^[a-z][a-z0-9-]{0,39}$/.test(k) || !Number.isInteger(n) || n < 1 || n > 100) continue
    stats.counts[k] = (Number(stats.counts[k]) || 0) + n
    changed = true
  }
  if (changed) statsDirty = true
  return changed
}

/** Whether a request comes from the window: from this server's own page (its origin) with the page key. */
function fromPage(req) {
  const origin = String(req.headers.origin || '')
  const ours = origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`
  return ours && req.headers['x-page-key'] === PAGE_KEY
}

/** Reads a JSON body (at most 64 KB) from the window and hands it on, or answers 400. */
function readPageJson(req, res, then) {
  let body = ''
  req.setEncoding('utf8')
  req.on('data', chunk => {
    body += chunk
    if (body.length > 65_536) req.destroy()
  })
  req.on('end', () => {
    let data
    try {
      data = JSON.parse(body) || {}
    } catch {
      return send(res, 400, 'bad json')
    }
    then(data)
  })
}

/** A folder a new session may start in: an absolute path to a folder, with nothing a shell would read specially. */
async function usableFolder(folder) {
  if (typeof folder !== 'string' || !folder || folder.length > 400 || !isAbsolute(folder) || /["%^&|<>;`$\r\n]/.test(folder)) return false
  try {
    return (await stat(folder)).isDirectory()
  } catch {
    return false
  }
}

/**
 * Opens a new terminal window in `folder` running Claude Code (Windows Terminal when it is there, else a console);
 * with `remote`, the session starts with Remote Control on, so it can be reached from the Claude app on a phone.
 */
async function openTerminal(folder, remote) {
  const opts = { detached: true, stdio: 'ignore', cwd: folder, windowsHide: false }
  const claude = remote ? ['claude', '--remote-control'] : ['claude']
  if (process.platform === 'win32') {
    const wt = join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps', 'wt.exe')
    const hasWt = await stat(wt).then(
      () => true,
      () => false,
    )
    if (hasWt) spawn(wt, ['-w', 'new', 'new-tab', '-d', folder, 'cmd', '/k', ...claude], opts).unref()
    else spawn('cmd.exe', ['/c', 'start', '/D', folder, 'cmd', '/k', ...claude], opts).unref()
    return
  }
  if (process.platform === 'darwin') {
    // Terminal.app runs a script file: a tiny one that goes to the folder and starts Claude Code
    const script = join(featureApi.HOME, 'studio-new-session.command')
    await writeFile(script, `#!/bin/sh\ncd ${JSON.stringify(folder)} && exec ${claude.join(' ')}\n`, { mode: 0o700 })
    spawn('open', ['-a', 'Terminal', script], opts).unref()
    return
  }
  // Linux: a new window in the person's tmux when tmux is running, else the first terminal there is
  const has = cmd => spawnSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' }).status === 0
  if (has('tmux') && spawnSync('tmux', ['list-sessions'], { stdio: 'ignore' }).status === 0) {
    spawn('tmux', ['new-window', '-c', folder, '-n', 'claude', ...claude], opts).unref()
    return
  }
  const terminals = [
    ['x-terminal-emulator', ['-e', ...claude]],
    ['gnome-terminal', [`--working-directory=${folder}`, '--', ...claude]],
    ['konsole', ['--workdir', folder, '-e', ...claude]],
    ['xfce4-terminal', ['--working-directory', folder, '-x', ...claude]],
    ['alacritty', ['--working-directory', folder, '-e', ...claude]],
    ['kitty', ['--directory', folder, ...claude]],
    ['wezterm', ['start', '--cwd', folder, '--', ...claude]],
    ['foot', ['--working-directory', folder, ...claude]],
    ['i3-sensible-terminal', ['-e', ...claude]],
    ['xterm', ['-e', ...claude]],
  ]
  const found = terminals.find(([cmd]) => has(cmd))
  if (!found) throw new Error('no terminal found')
  spawn(found[0], found[1], opts).unref()
}

// ------------------------------------------------------------------------------------------------ server features
//
// Each feature of the office that needs the server (the room's design, the weather, your own characters) lives in
// ./server-features/<name>.mjs and exports `setup(api)`. With the api it adds routes, a part of every snapshot the
// window gets, and answers to the commands it queued for a session. Routes are checked before the static files.

/** @type {Array<{method: string, path: string, prefix: boolean, auth: 'token' | 'page' | 'none', raw: boolean, limit: number, handler: Function}>} */
const routes = []
/** @type {Map<string, () => unknown>} */
const parts = new Map()
/** @type {Map<string, Function>} */
const replyHandlers = new Map()

const featureApi = {
  /** This folder (office/), the models folder, and the ~/.claude folder where a feature keeps its own files. */
  ROOT,
  MODELS,
  HOME: join(homedir(), '.claude'),
  /**
   * Adds a route. `path` matches exactly, or as a prefix when it ends in '*'. `auth`: 'page' (the window, with its page
   * key: anything that changes something), 'token' (a session), or 'none' (a plain read the window makes). A POST body is
   * read as JSON (at most `limit` bytes, 64 KB by default) or, with `raw`, handed over as a Buffer. The handler gets
   * (req, res, body, url) and answers with api.send or api.json.
   */
  route(method, path, handler, { auth = 'page', raw = false, limit = 65_536 } = {}) {
    const prefix = path.endsWith('*')
    routes.push({ method, path: prefix ? path.slice(0, -1) : path, prefix, auth, raw, limit, handler })
  },
  send,
  json: (res, status, data) => send(res, status, JSON.stringify(data), 'application/json'),
  /** Sends every window the snapshot again (after a part changed). */
  share: () => share(),
  /** Adds `name` to every snapshot the window gets, as `get()` returns it (plain JSON). */
  part(name, get) {
    parts.set(name, get)
  },
  /** The sessions in the office now: [{ id, name, cwd, joined, changed }]. */
  sessions: () => [...sessions.values()].map(({ id, name, cwd, joined, changed }) => ({ id, name, cwd, joined, changed })),
  /**
   * Queues a command for a session's next /inbox (the mod hands it to its features; see hooks/features/kit.ts). Returns
   * the command's id, or '' when that session is not here or has too many waiting.
   */
  queue(session, kind, data) {
    if (!sessions.has(session)) return ''
    const list = inboxes.get(session) ?? []
    if (list.length >= 20) return ''
    const id = randomBytes(6).toString('hex')
    list.push({ id, kind, text: '', data, at: Date.now() })
    inboxes.set(session, list)
    return id
  },
  /** Calls `fn(reply, command id, session)` when a session answers a command of this kind (POST /reply). */
  onReply(kind, fn) {
    replyHandlers.set(kind, fn)
  },
  log: (...words) => process.stderr.write(`studio: ${words.join(' ')}\n`),
}

for (const setup of [setupDecorate, setupWeather, setupCharacters]) {
  try {
    await setup(featureApi)
  } catch (err) {
    featureApi.log('a server feature did not start:', String(err?.stack || err))
  }
}

/** Reads a raw body up to `limit` bytes, or answers 413. */
function readRaw(req, res, limit, then) {
  const chunks = []
  let size = 0
  let tooBig = false
  req.on('data', chunk => {
    size += chunk.length
    if (size > limit) {
      tooBig = true
      req.destroy()
      return
    }
    chunks.push(chunk)
  })
  req.on('end', () => (tooBig ? send(res, 413, 'too big') : then(Buffer.concat(chunks))))
  req.on('close', () => {
    if (tooBig && !res.writableEnded) send(res, 413, 'too big')
  })
}

/** Answers a request one of the server features routes; false when none does. */
function featureRoute(req, res, url) {
  const route = routes.find(r => r.method === req.method && (r.prefix ? url.pathname.startsWith(r.path) : url.pathname === r.path))
  if (!route) return false
  if (route.auth === 'page' && !fromPage(req)) return send(res, 403, 'forbidden'), true
  if (route.auth === 'token' && req.headers['x-office-token'] !== TOKEN) return send(res, 403, 'forbidden'), true
  const run = body =>
    Promise.resolve()
      .then(() => route.handler(req, res, body, url))
      .catch(err => {
        featureApi.log(`${route.path} failed:`, String(err?.stack || err))
        if (!res.headersSent) send(res, 500, 'the office could not do that')
      })
  if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'DELETE') return void run(undefined), true
  if (route.raw) readRaw(req, res, route.limit, run)
  else
    readRaw(req, res, route.limit, buf => {
      let data
      try {
        data = buf.length ? JSON.parse(buf.toString('utf8')) : {}
      } catch {
        return send(res, 400, 'bad json')
      }
      void run(data)
    })
  return true
}

const server = createServer((req, res) => {
  if (!hostIsLocal(req)) return send(res, 403, 'forbidden')
  const url = new URL(req.url || '/', `http://127.0.0.1:${port}`)

  if (req.method === 'POST' && ['/state', '/leave', '/window', '/stat', '/inbox', '/reply'].includes(url.pathname)) {
    if (req.headers['x-office-token'] !== TOKEN) return send(res, 403, 'forbidden')
    readJson(req, res, data => {
      if (url.pathname === '/reply') {
        // a session's answer to a command a server feature queued (a persona Claude wrote for a new character...)
        const fn = replyHandlers.get(String(data.kind))
        if (fn)
          Promise.resolve()
            .then(() => fn(data.reply, String(data.id || ''), data.session))
            .catch(err => featureApi.log('a reply failed:', String(err)))
        return send(res, 204, '')
      }
      if (url.pathname === '/stat') {
        if (addStats(data.add)) share()
        return send(res, 204, '')
      }
      if (url.pathname === '/inbox') {
        const waiting = inboxes.get(data.session) ?? []
        inboxes.delete(data.session)
        return send(res, 200, JSON.stringify({ commands: waiting }), 'application/json')
      }
      if (url.pathname === '/window') {
        // only one session opens the window: the first to ask while none is open (the next may ask 20 s later)
        const open = watchers.size === 0 && Date.now() - windowClaimed > 20_000
        if (open) windowClaimed = Date.now()
        return send(res, 200, JSON.stringify({ open }), 'application/json')
      }
      if (url.pathname === '/leave') {
        inboxes.delete(data.session)
        if (sessions.delete(data.session)) share()
        if (!sessions.size) emptySince = Date.now()
        return send(res, 204, '')
      }
      // 409 asks the session for its whole studio (the server was restarted and does not know it)
      send(res, takeState(data) ? 204 : 409, '')
    })
    return
  }

  // the window's own asks: a prompt or a new agent for one session, or a new session in a folder
  if (req.method === 'POST' && (url.pathname === '/command' || url.pathname === '/new-session')) {
    if (!fromPage(req)) return send(res, 403, 'forbidden')
    readPageJson(req, res, async data => {
      if (url.pathname === '/new-session') {
        if (!(await usableFolder(data.folder))) return send(res, 400, 'not a folder')
        try {
          await openTerminal(data.folder, data.remote === true)
          return send(res, 204, '')
        } catch {
          return send(res, 500, 'the terminal did not start')
        }
      }
      const kind = data.kind
      const text = typeof data.text === 'string' ? data.text.trim().slice(0, 8000) : ''
      if (!sessions.has(data.session) || !['prompt', 'agent'].includes(kind) || !text) return send(res, 400, 'bad command')
      const agentType = typeof data.agentType === 'string' && /^[\w:.-]{1,64}$/.test(data.agentType) ? data.agentType : undefined
      // the character the new agent should wear (a model file name from models.json), picked in the panel
      const character = kind === 'agent' && typeof data.character === 'string' && /^[\w.-]{1,120}\.(vrm|glb)$/i.test(data.character) ? data.character : undefined
      const list = inboxes.get(data.session) ?? []
      if (list.length >= 20) return send(res, 429, 'too many waiting')
      list.push({ id: randomBytes(6).toString('hex'), kind, text, ...(agentType ? { agentType } : {}), ...(character ? { character } : {}), at: Date.now() })
      inboxes.set(data.session, list)
      send(res, 202, '')
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
  if (featureRoute(req, res, url)) return
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
  await writeFile(LOCK, JSON.stringify({ port, token: TOKEN, pageKey: PAGE_KEY, pid: process.pid, started: Date.now() }), { mode: 0o600 })
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

await loadStats()
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
  if (statsDirty) {
    statsDirty = false
    void writeFile(STATS, JSON.stringify(stats)).catch(() => undefined)
  }
  if (!sessions.size && now - emptySince > EMPTY_LIMIT_MS) {
    broadcast('bye', {})
    void releaseLock().finally(() => setTimeout(() => process.exit(0), 300))
  }
}, 5000)
