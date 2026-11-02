// The server side of the characters feature (see the 'server features' section of ../server.mjs for the api). People
// upload their own .vrm models from the window; this turns each into a character: it checks the file, keeps it in the
// models folder (never in this repository: their licences forbid passing them on), adds it to models.json, and asks a
// live Claude session to write a persona for it (hooks/features/characters.ts does the writing).
//
//   POST /characters/upload?name=<file name>&rights=yes   the raw .vrm bytes (the name may also come as x-file-name)
//   POST /characters/role     {file, role: 'claude' | 'agent' | 'off'}
//   POST /characters/persona  {file, persona: {name, color, about, lines?}}   a manual edit
//   POST /characters/rewrite  {file}                                          ask Claude for a new persona
//   POST /characters/scale    {file, scale: 0.7 to 2}                         how big the character stands (1 = as built)
//   POST /characters/remove   {file}                                          moves the file to removed/, never deletes
//
// The list reaches the window as snapshot.characters. models.json keeps one backup (models.json.bak) before every change.
// Models switched off live in models.json's "unused" list, which the window's loader ignores.

import { copyFile, mkdir, open, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

const MOMENTS = ['hello', 'flow', 'thinking', 'delegating', 'stressed', 'panic', 'celebrate', 'idle', 'bye']
const COLOURS = ['#e0457b', '#5b78c9', '#8e62b8', '#3f8f6f', '#b8634f', '#4f8fa8', '#a8763a', '#c8775a']
const UPLOAD_LIMIT = 100 * 1024 * 1024
const WRITING_MS = 3 * 60 * 1000
export const SCALE = { min: 0.7, max: 2 }
const RESERVED = new Set(['models', 'poster'])

// ------------------------------------------------------------------------------------------------ the file

const clean = (v, max) =>
  typeof v === 'string'
    ? v
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : ''

/**
 * Reads a model's glTF binary header and JSON chunk from `head` (at least the first 20 bytes) and `readJson(length)`.
 * Returns { json } or { error }.
 */
function checkHeader(head, total) {
  if (head.length < 20 || head.toString('latin1', 0, 4) !== 'glTF') return { error: 'That is not a glTF binary (.vrm) file.' }
  if (head.readUInt32LE(4) !== 2) return { error: 'Only glTF version 2 files are supported.' }
  const jsonLength = head.readUInt32LE(12)
  if (head.toString('latin1', 16, 20) !== 'JSON') return { error: 'The file has no model description in it.' }
  if (jsonLength > 32 * 1024 * 1024 || 20 + jsonLength > total) return { error: 'The file looks damaged.' }
  return { jsonLength }
}

/** The VRM meta of a parsed glTF JSON, in one shape for both VRM versions, or { error }. */
export function readMeta(json) {
  const v0 = json?.extensions?.VRM?.meta
  const v1 = json?.extensions?.VRMC_vrm?.meta
  if (v1 && typeof v1 === 'object') {
    const authors = Array.isArray(v1.authors) ? v1.authors.map(a => clean(a, 80)).filter(Boolean) : []
    const limits = []
    if (v1.avatarPermission === 'onlyAuthor') limits.push('only the author may use it')
    else if (v1.avatarPermission === 'onlyAuthorized') limits.push('only people the author has allowed may use it')
    if (v1.allowExcessivelyViolentUsage !== true) limits.push('no violent use')
    if (v1.allowExcessivelySexualUsage !== true) limits.push('no sexual use')
    if (v1.commercialUsage === 'personalNonProfit') limits.push('personal, non-profit use only')
    else if (v1.commercialUsage === 'personalProfit') limits.push('no company use')
    if (v1.allowRedistribution !== true) limits.push('no redistribution')
    return {
      version: '1.0',
      title: clean(v1.name, 80),
      author: authors.join(', '),
      licence: clean(v1.licenseUrl, 120) || 'VRM 1.0 licence',
      limits,
    }
  }
  if (v0 && typeof v0 === 'object') {
    const limits = []
    if (v0.allowedUserName === 'OnlyAuthor') limits.push('only the author may use it')
    else if (v0.allowedUserName === 'ExplicitlyLicensedPerson') limits.push('only people the author has allowed may use it')
    if (v0.violentUssageName !== 'Allow') limits.push('no violent use')
    if (v0.sexualUssageName !== 'Allow') limits.push('no sexual use')
    if (v0.commercialUssageName !== 'Allow') limits.push('personal, non-profit use only')
    const licence = clean(v0.licenseName, 60).replace(/_/g, ' ').toLowerCase()
    if (/redistribution prohibited/.test(licence)) limits.push('no redistribution')
    return {
      version: '0.x',
      title: clean(v0.title, 80),
      author: clean(v0.author, 80),
      licence: licence || 'licence not stated',
      limits,
    }
  }
  return { error: 'That is a glTF file, but not a VRM model.' }
}

/** Checks a whole upload (a Buffer) and returns its meta, or { error }. */
export function inspectBuffer(buf) {
  const h = checkHeader(buf, buf.length)
  if (h.error) return h
  let json
  try {
    json = JSON.parse(buf.toString('utf8', 20, 20 + h.jsonLength))
  } catch {
    return { error: 'The model description in the file cannot be read.' }
  }
  return readMeta(json)
}

/** The same for a file on disk, reading only its first part. */
async function inspectFile(path) {
  let fh
  try {
    fh = await open(path, 'r')
    const { size } = await fh.stat()
    const head = Buffer.alloc(20)
    await fh.read(head, 0, 20, 0)
    const h = checkHeader(head, size)
    if (h.error) return h
    const body = Buffer.alloc(h.jsonLength)
    await fh.read(body, 0, h.jsonLength, 20)
    return readMeta(JSON.parse(body.toString('utf8')))
  } catch {
    return { error: 'unreadable' }
  } finally {
    await fh?.close().catch(() => undefined)
  }
}

/** A safe file name stem: lower-case letters, digits and dashes. */
function safeStem(name) {
  const stem = basename(String(name || ''), extname(String(name || '')))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return stem && !RESERVED.has(stem) ? stem : 'model'
}

// ------------------------------------------------------------------------------------------------ personas

/**
 * Checks a persona. `strict` refuses anything too long (a person's edit); otherwise long text is cut short (Claude's
 * writing). Returns { persona } or { error }. `lines` is optional when `needLines` is false.
 */
export function checkPersona(raw, { strict = false, needLines = false } = {}) {
  if (!raw || typeof raw !== 'object') return { error: 'There is no persona.' }
  const fit = (v, max, what) => {
    const text = clean(v, strict ? 100_000 : max)
    if (!text) return { error: `The ${what} is empty.` }
    if (text.length > max) return { error: `The ${what} is longer than ${max} characters.` }
    return { text }
  }
  const name = fit(raw.name, 24, 'name')
  if (name.error) return name
  const about = fit(raw.about, 200, 'about text')
  if (about.error) return about
  const color = typeof raw.color === 'string' ? raw.color.trim() : ''
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return { error: 'The colour must look like #c8775a.' }
  const persona = { name: name.text, color: color.toLowerCase(), about: about.text }
  if (raw.lines !== undefined || needLines) {
    if (!raw.lines || typeof raw.lines !== 'object' || Array.isArray(raw.lines)) return { error: 'The lines are missing.' }
    const lines = {}
    for (const m of MOMENTS) {
      const list = raw.lines[m]
      if (list === undefined) continue
      if (!Array.isArray(list)) return { error: `The lines for "${m}" must be a list.` }
      if (strict && list.length > 6) return { error: `At most 6 lines for "${m}".` }
      const kept = []
      for (const line of list.slice(0, 6)) {
        const one = clean(line, strict ? 100_000 : 90)
        if (!one) continue
        if (one.length > 90) return { error: `A line for "${m}" is longer than 90 characters.` }
        kept.push(one)
      }
      if (kept.length) lines[m] = kept
    }
    if (needLines && !Object.keys(lines).length) return { error: 'There are no usable lines.' }
    if (Object.keys(lines).length) persona.lines = lines
  }
  return { persona }
}

// ------------------------------------------------------------------------------------------------ setup

export default function setup(api) {
  const dir = api.MODELS
  const configPath = join(dir, 'models.json')
  /** @type {Map<string, {size: number, mtime: number, meta: object}>} */
  const metaCache = new Map()
  /** file -> { id, at } while a persona is being written. */
  const pending = new Map()
  /** file -> a short note about the last persona that did not work out. */
  const notes = new Map()
  let list = []
  let scannedAt = 0
  let scanning = null
  let chain = Promise.resolve()

  const readConfig = async () => {
    try {
      const config = JSON.parse(await readFile(configPath, 'utf8'))
      return config && typeof config === 'object' && !Array.isArray(config) ? config : {}
    } catch {
      return {}
    }
  }
  const fileOf = e => (typeof e === 'string' ? e : e?.file)
  const entries = config => [
    ...(config.claude ? [['claude', config.claude]] : []),
    ...(Array.isArray(config.agents) ? config.agents.map(e => ['agent', e]) : []),
    ...(Array.isArray(config.unused) ? config.unused.map(e => ['off', e]) : []),
  ]

  /** Runs `fn(config)` on models.json one change at a time, keeping one backup, then refreshes and shares the list. */
  function change(fn) {
    const run = async () => {
      const config = await readConfig()
      const before = JSON.stringify(config)
      const result = await fn(config)
      if (JSON.stringify(config) === before) return result
      await mkdir(dir, { recursive: true })
      await copyFile(configPath, `${configPath}.bak`).catch(() => undefined)
      const tmp = `${configPath}.tmp`
      await writeFile(tmp, `${JSON.stringify(config, null, 2)}\n`)
      await rename(tmp, configPath)
      await refresh()
      api.share()
      return result
    }
    const next = chain.then(run, run)
    chain = next.catch(() => undefined)
    return next
  }

  async function metaOf(file) {
    const path = join(dir, file)
    try {
      const s = await stat(path)
      const hit = metaCache.get(file)
      if (hit && hit.size === s.size && hit.mtime === s.mtimeMs) return hit.meta
      const meta = await inspectFile(path)
      metaCache.set(file, { size: s.size, mtime: s.mtimeMs, meta })
      return meta
    } catch {
      return { error: 'missing' }
    }
  }

  /** Looks at the models folder again; a scan already running is followed by a fresh one. */
  function refresh() {
    if (scanning) return scanning.then(refresh)
    scanning = scan().finally(() => (scanning = null))
    return scanning
  }

  async function scan() {
    {
      const config = await readConfig()
      const rows = []
      const seen = new Set()
      for (const [role, e] of entries(config)) {
        const file = fileOf(e)
        if (!file || seen.has(file)) continue
        seen.add(file)
        rows.push(await row(file, role, typeof e === 'object' ? e : {}))
      }
      let names = []
      try {
        names = await readdir(dir)
      } catch {
        // no models folder yet
      }
      for (const name of names.sort())
        if (/\.vrm$/i.test(name) && !seen.has(name)) rows.push(await row(name, 'off', {}))
      list = rows
      scannedAt = Date.now()
    }
  }

  async function row(file, role, e) {
    const meta = await metaOf(file)
    const persona = e.persona && typeof e.persona === 'object' ? e.persona : {}
    const limits = meta.error ? [] : meta.limits
    const hasPersona = !!(persona.lines && Object.keys(persona.lines).length)
    return {
      file,
      name: clean(persona.name, 24) || clean(e.name, 24) || file.replace(/\.[^.]+$/, ''),
      color: /^#[0-9a-f]{6}$/i.test(persona.color || '') ? persona.color : '#c8775a',
      about: clean(persona.about, 200),
      role,
      credit: clean(e.credit, 300),
      scale: Number.isFinite(e.scale) ? Math.max(SCALE.min, Math.min(SCALE.max, e.scale)) : 1,
      licence: meta.error ? 'The licence could not be read from the file.' : `${meta.licence}${limits.length ? `: ${limits.join(', ')}` : ': no limits stated'}`,
      warning: limits.length ? `The licence limits how this model may be used (${limits.join(', ')}). Use it only in ways it allows.` : '',
      hasPersona,
      writing: false,
      note: '',
    }
  }

  api.part('characters', () => {
    if (Date.now() - scannedAt > 5000) void refresh().catch(() => undefined)
    const sessions = api.sessions()
    return {
      hasSession: sessions.length > 0,
      list: list.map(r => {
        const p = pending.get(r.file)
        return { ...r, writing: !!p && Date.now() - p.at < WRITING_MS, note: notes.get(r.file) || '' }
      }),
    }
  })
  void refresh().catch(() => undefined)

  // ---------------------------------------------------------------------------------------------- asking Claude

  /** Queues a persona to be written for `file`; returns a sentence about what happened. */
  function askForPersona(file, meta, { rewrite = false, previous = '' } = {}) {
    const session = api.sessions()[0]
    if (!session) return 'No Claude session is in the office, so the plain persona stays for now. Use "Rewrite persona" when one is.'
    const id = api.queue(session.id, 'persona', {
      file,
      name: meta.title || file.replace(/\.[^.]+$/, ''),
      author: meta.author,
      meta: { title: meta.title, author: meta.author, version: meta.version, licence: meta.licence, limits: meta.limits },
      rewrite,
      previous,
    })
    if (!id) return 'The session is too busy to take the request. Try "Rewrite persona" in a moment.'
    pending.set(file, { id, at: Date.now() })
    notes.delete(file)
    return 'Claude is writing a persona. It appears here in a few seconds.'
  }

  api.onReply('persona', async reply => {
    const file = typeof reply?.file === 'string' ? reply.file : ''
    if (!file || !pending.has(file)) return
    pending.delete(file)
    if (reply.error) {
      notes.set(file, 'Claude could not write a persona this time. The plain one stays.')
      api.share()
      return
    }
    const checked = checkPersona(reply.persona, { needLines: true })
    if (checked.error) {
      notes.set(file, `Claude's persona was not usable (${checked.error}) The plain one stays.`)
      api.share()
      return
    }
    try {
      await change(config => {
        const hit = entries(config).find(([, e]) => fileOf(e) === file)
        if (!hit || typeof hit[1] !== 'object') return
        // keep the lead's role label if it had one
        hit[1].persona = { ...checked.persona, ...(hit[1].persona?.role ? { role: hit[1].persona.role } : {}) }
      })
    } catch (err) {
      api.log('could not save a persona:', String(err))
    }
  })

  // ---------------------------------------------------------------------------------------------- routes

  const fail = (res, status, text) => api.send(res, status, text)
  /** Finds the entry for a request's file and answers 404 when there is none. */
  async function find(config, file) {
    const hit = entries(config).find(([, e]) => fileOf(e) === file)
    if (hit) return hit
    return null
  }
  const fileName = body => (typeof body?.file === 'string' && !/[\\/]/.test(body.file) ? body.file : '')

  api.route(
    'POST',
    '/characters/upload',
    async (req, res, body, url) => {
      const meta = inspectBuffer(body)
      if (meta.error) return fail(res, 400, meta.error)
      if (meta.limits.length && url.searchParams.get('rights') !== 'yes' && req.headers['x-rights'] !== 'yes')
        return fail(res, 400, `This model's licence limits its use (${meta.limits.join(', ')}). Confirm that you have the right to use it here.`)
      const given = url.searchParams.get('name') || String(req.headers['x-file-name'] || '')
      let decoded = given
      try {
        decoded = decodeURIComponent(given)
      } catch {
        // keep it as it came
      }
      const stem = safeStem(decoded || meta.title)
      await mkdir(dir, { recursive: true })
      let file = ''
      for (let n = 1; n < 200 && !file; n++) {
        const candidate = `${stem}${n > 1 ? `-${n}` : ''}.vrm`
        try {
          await writeFile(join(dir, candidate), body, { flag: 'wx' })
          file = candidate
        } catch (err) {
          if (err?.code !== 'EEXIST') throw err
        }
      }
      if (!file) return fail(res, 500, 'No free name for the file.')
      const title = meta.title || stem
      const author = meta.author || 'an unknown author'
      await change(config => {
        if (!Array.isArray(config.agents)) config.agents = []
        const colour = COLOURS[config.agents.length % COLOURS.length]
        config.agents.push({
          file,
          name: title,
          credit: `${title} by ${author} (${meta.licence})`,
          persona: { name: clean(title, 24) || 'New friend', color: colour, about: `A new character: ${title} by ${author}.` },
        })
      })
      metaCache.delete(file)
      const note = askForPersona(file, meta)
      await refresh()
      api.share()
      api.json(res, 200, { ok: true, file, writing: pending.has(file), note })
    },
    { auth: 'page', raw: true, limit: UPLOAD_LIMIT },
  )

  api.route('POST', '/characters/role', async (req, res, body) => {
    const file = fileName(body)
    const role = body?.role
    if (!file || !['claude', 'agent', 'off'].includes(role)) return fail(res, 400, 'Say which model and which role.')
    let problem = ''
    await change(async config => {
      const known = (await find(config, file)) ?? null
      let entry = known?.[1]
      if (!known) {
        // a model file in the folder that models.json does not list yet
        const meta = await metaOf(file)
        if (meta.error || !/\.vrm$/i.test(file)) return void (problem = 'That model is not in the folder.')
        entry = { file, name: meta.title || file, credit: `${meta.title || file} by ${meta.author || 'an unknown author'} (${meta.licence})` }
      }
      if (typeof entry === 'string') entry = { file: entry }
      const wasClaude = fileOf(config.claude) === file
      if (wasClaude && role !== 'claude') {
        problem = 'Make another model Claude first, then change this one.'
        return
      }
      const keep = e => fileOf(e) !== file
      if (Array.isArray(config.agents)) config.agents = config.agents.filter(keep)
      if (Array.isArray(config.unused)) config.unused = config.unused.filter(keep)
      if (role === 'claude') {
        const old = config.claude
        if (old && fileOf(old) !== file) config.agents = [...(config.agents ?? []), old]
        config.claude = entry
      } else if (role === 'agent') {
        config.agents = [...(config.agents ?? []), entry]
      } else {
        config.unused = [...(config.unused ?? []), entry]
      }
    })
    if (problem) return fail(res, 400, problem)
    api.json(res, 200, { ok: true })
  })

  api.route('POST', '/characters/persona', async (req, res, body) => {
    const file = fileName(body)
    const checked = checkPersona(body?.persona, { strict: true })
    if (!file) return fail(res, 400, 'Say which model.')
    if (checked.error) return fail(res, 400, checked.error)
    let found = false
    await change(async config => {
      const hit = await find(config, file)
      if (!hit || typeof hit[1] !== 'object') return
      found = true
      const old = hit[1].persona && typeof hit[1].persona === 'object' ? hit[1].persona : {}
      hit[1].persona = { ...old, ...checked.persona, lines: checked.persona.lines ?? old.lines }
      if (!hit[1].persona.lines) delete hit[1].persona.lines
    })
    if (!found) return fail(res, 404, 'That model is not listed in models.json.')
    pending.delete(file)
    notes.delete(file)
    api.json(res, 200, { ok: true })
  })

  api.route('POST', '/characters/rewrite', async (req, res, body) => {
    const file = fileName(body)
    if (!file) return fail(res, 400, 'Say which model.')
    const p = pending.get(file)
    if (p && Date.now() - p.at < WRITING_MS) return fail(res, 409, 'Claude is already writing this one.')
    const config = await readConfig()
    const hit = await find(config, file)
    const meta = await metaOf(file)
    if (meta.error) return fail(res, 400, 'The licence and credits could not be read from that file.')
    const previous = hit && typeof hit[1] === 'object' ? clean(hit[1].persona?.name, 24) : ''
    const note = askForPersona(file, meta, { rewrite: true, previous })
    api.share()
    api.json(res, 200, { ok: true, writing: pending.has(file), note })
  })

  api.route('POST', '/characters/scale', async (req, res, body) => {
    const file = fileName(body)
    const scale = body?.scale
    if (!file) return fail(res, 400, 'Say which model.')
    if (typeof scale !== 'number' || !Number.isFinite(scale) || scale < SCALE.min || scale > SCALE.max) return fail(res, 400, 'The size must be a number from 0.7 to 2.')
    const value = Math.round(scale * 100) / 100
    let found = false
    await change(async config => {
      let hit = await find(config, file)
      if (!hit && /\.vrm$/i.test(file) && !(await metaOf(file)).error) {
        // a model in the folder that models.json does not list yet: list it (switched off) so it can keep a size
        config.unused = [...(Array.isArray(config.unused) ? config.unused : []), { file }]
        hit = ['off', config.unused[config.unused.length - 1]]
      }
      if (!hit) return
      found = true
      let entry = hit[1]
      if (typeof entry === 'string') {
        // a bare file name becomes an entry so it can carry a size
        entry = { file: entry }
        if (hit[0] === 'claude') config.claude = entry
        else {
          const list = hit[0] === 'agent' ? config.agents : config.unused
          list[list.indexOf(hit[1])] = entry
        }
      }
      if (value === 1) delete entry.scale
      else entry.scale = value
    })
    if (!found) return fail(res, 404, 'That model is not listed in models.json.')
    api.json(res, 200, { ok: true, scale: value })
  })

  api.route('POST', '/characters/remove', async (req, res, body) => {
    const file = fileName(body)
    if (!file || !/\.vrm$/i.test(file)) return fail(res, 400, 'Say which model.')
    let problem = ''
    await change(config => {
      if (fileOf(config.claude) === file) return void (problem = 'Make another model Claude first, then remove this one.')
      const keep = e => fileOf(e) !== file
      if (Array.isArray(config.agents)) config.agents = config.agents.filter(keep)
      if (Array.isArray(config.unused)) config.unused = config.unused.filter(keep)
    })
    if (problem) return fail(res, 400, problem)
    // the file moves aside, it is never deleted
    try {
      await mkdir(join(dir, 'removed'), { recursive: true })
      let target = join(dir, 'removed', file)
      for (let n = 2; n < 200; n++) {
        const taken = await stat(target).then(
          () => true,
          () => false,
        )
        if (!taken) break
        target = join(dir, 'removed', file.replace(/\.vrm$/i, `-${n}.vrm`))
      }
      await rename(join(dir, file), target)
    } catch (err) {
      api.log('could not move a model aside:', String(err))
    }
    metaCache.delete(file)
    pending.delete(file)
    await refresh()
    api.share()
    api.json(res, 200, { ok: true })
  })
}
