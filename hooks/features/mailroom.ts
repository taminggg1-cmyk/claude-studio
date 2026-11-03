// The mailroom feature (see ./kit.ts): a session's git work as outgoing post. Every commit is a letter on the desk of
// the session's Claude; a push takes the letters to the postbox by the door; a pull request goes in as a parcel. The
// window (office/features/mailroom.js) draws all of that, and lists each session's letters when you click the postbox.
//
// The core mod reads git's own output (./git.ts) and announces 'commit', 'push' and 'pull-request'. This file asks git
// which repository each one happened in (`git rev-parse --show-toplevel`) and, after a push, which letters really went
// out (`git log --branches --not --remotes`: the commits no remote has yet). At the start it picks up the commits of
// the session's own repository that are still waiting to be pushed, and every 45 seconds it checks the letters again,
// so a push you make yourself, or a rebase that rewrote them, shows too.
//
// extras() is { waiting, letters: [{ sha, subject, branch, repo, at }], events: [{ id, kind: 'commit' | 'push' | 'pr',
// at, n, repo, branch?, subject?, title?, number?, url?, outside? }], commits, pushes, prs }: `waiting` is how many
// letters wait (the list holds the newest 40 of them); `events` are the last few moments, each with an id the window
// acts on once; `commits`, `pushes` and `prs` are this session's counts.

import type { EngineInterface } from 'claude-code'

import type { Feature, On, Signal, SignalData } from './kit'

/** A commit not pushed yet. `root` is its repository's top folder ('' when git could not say). */
type Letter = { sha: string; subject: string; branch: string; repo: string; root: string; at: number }
type MailEvent = {
  id: string
  kind: 'commit' | 'push' | 'pr'
  at: number
  n: number
  repo: string
  branch?: string
  subject?: string
  title?: string
  number?: number
  url?: string
  /** A push the mod did not see being made (you pushed in your own terminal). */
  outside?: boolean
}

const MOST_LETTERS = 300
const LETTERS_SHOWN = 40
const EVENTS_KEPT = 8
const CHECK_EVERY_MS = 45_000
const GIT_TIMEOUT_MS = 10_000

let letters: Letter[] = []
let events: MailEvent[] = []
/** Event ids start with the module's own start time, so a reloaded mod never repeats an id the window has seen. */
const born = Date.now().toString(36)
let seq = 0
let commits = 0
let pushes = 0
let prs = 0
/** The session's folder, from the 'session-start' signal (used when the session cannot say where it is). */
let home = ''
/** Repository roots already asked for: `[here, dirs]` as JSON -> root. */
const roots = new Map<string, string>()
/** Every change goes through this chain, one at a time, so a push always finds the commits made just before it. */
let chain: Promise<void> = Promise.resolve()

const short = (text: string, max: number) => {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > max ? one.slice(0, max - 1) + '…' : one
}
const slashes = (path: string) => path.replace(/\\/g, '/').replace(/\/+$/, '')
const nameOf = (root: string) => slashes(root).split('/').filter(Boolean).pop() ?? ''
/** Whether a full commit id in `set` starts with the (maybe short) id `sha`. */
const holds = (set: Set<string>, sha: string) => set.has(sha) || [...set].some(full => full.startsWith(sha))

export const mailroom: Feature = {
  name: 'mailroom',
  extras: () => ({
    waiting: letters.length,
    letters: letters.slice(-LETTERS_SHOWN).map(l => ({ sha: l.sha.slice(0, 7), subject: short(l.subject, 90), branch: l.branch, repo: l.repo, at: l.at })),
    events,
    commits,
    pushes,
    prs,
  }),
}

export function installMailroom(on: On): void {
  // No hook of its own: the core mod announces commits, pushes and pull requests as signals.
  void on
}

export function signalMailroom($: EngineInterface, signal: Signal, data: SignalData): void {
  if (signal === 'session-start') {
    home = data.cwd ?? home
    later(() => pickUpLetters($))
    $.clock.every(CHECK_EVERY_MS, () => later(() => checkLetters($)))
    return
  }
  if (signal !== 'commit' && signal !== 'push' && signal !== 'pull-request') return
  // the folder is read now, inside the tool call's own hook: a subagent's calls run in the subagent's folder
  const here = folderNow($)
  if (signal === 'commit') later(() => noteCommit($, data, here))
  else if (signal === 'push') later(() => notePush($, data, here))
  else later(() => notePullRequest($, data, here))
}

/** The folder the session (or the subagent whose hook this is) works in, read at once. */
function folderNow($: EngineInterface): Promise<string> {
  return $.session.cwd().catch(() => '')
}

/** Runs `work` after everything queued before it; a failure only skips that one piece of work. */
function later(work: () => Promise<void>): void {
  chain = chain.then(work).catch(() => undefined)
}

function addEvent(event: Omit<MailEvent, 'id' | 'at'>): void {
  events = [...events, { id: `${born}-${++seq}`, at: Date.now(), ...event }].slice(-EVENTS_KEPT)
}

async function git($: EngineInterface, argv: string[]): Promise<string | null> {
  try {
    const ran = await $.process.run(['git', ...argv], { timeoutMs: GIT_TIMEOUT_MS })
    return ran.exitCode === 0 ? ran.stdout : null
  } catch {
    return null
  }
}

/**
 * The repository a command worked in: `folder` (the session's, or the subagent's, read when the command ended), then
 * each folder the command moved to (`cd`, `git -C`).
 * In the main session a `cd` stays in force after the command, so when that path does not lead to a repository the
 * session's folder alone is tried. Without an answer from git, the folder itself stands for the repository.
 */
async function rootOf($: EngineInterface, dirs: readonly string[], folder: Promise<string>): Promise<string> {
  const here = slashes((await folder) || home)
  const key = JSON.stringify([here, dirs])
  const known = roots.get(key)
  if (known !== undefined) return known
  const at = (list: readonly string[]) => [...(here ? ['-C', here] : []), ...list.flatMap(d => ['-C', d])]
  let root = ''
  for (const tryDirs of dirs.length ? [dirs, []] : [[]]) {
    const out = await git($, [...at(tryDirs), 'rev-parse', '--show-toplevel'])
    root = slashes(out?.trim() ?? '')
    if (root) break
  }
  if (!root) root = slashes([here, ...dirs].filter(Boolean).pop() ?? '')
  roots.set(key, root)
  return root
}

/** The full ids of the commits on local branches that no remote has yet, or null when git could not tell. */
async function unpushedIn($: EngineInterface, root: string): Promise<Set<string> | null> {
  if (!root) return null
  const out = await git($, ['-C', root, 'log', '--branches', '--not', '--remotes', '--format=%H', '-n', '1000'])
  return out === null ? null : new Set(out.split(/\s+/).filter(Boolean))
}

/** The session's own repository may already have commits waiting to be pushed: they are letters too. */
async function pickUpLetters($: EngineInterface): Promise<void> {
  const root = await rootOf($, [], folderNow($))
  if (!root) return
  // a repository with no remote has nowhere to send letters to
  const remotes = await git($, ['-C', root, 'remote'])
  if (!remotes?.trim()) return
  const out = await git($, ['-C', root, 'log', '--branches', '--not', '--remotes', '--source', '--format=%H%x09%S%x09%ct%x09%s', '-n', '50'])
  if (!out) return
  const repo = nameOf(root)
  const found: Letter[] = []
  for (const line of out.split('\n')) {
    const [sha = '', source = '', time = '', ...rest] = line.split('\t')
    if (!/^[0-9a-f]{7,40}$/.test(sha) || letters.some(l => l.root === root && l.sha.startsWith(sha.slice(0, 7)))) continue
    found.push({ sha, subject: rest.join('\t').trim(), branch: source.replace(/^refs\/heads\//, ''), repo, root, at: (Number(time) || 0) * 1000 })
  }
  // git lists the newest first; the desk stack grows oldest first
  letters = [...found.reverse(), ...letters].slice(-MOST_LETTERS)
}

async function noteCommit($: EngineInterface, data: SignalData, folder: Promise<string>): Promise<void> {
  const c = data.commit
  if (!c) return
  const root = await rootOf($, data.dirs ?? [], folder)
  const repo = nameOf(root)
  const now = Date.now()
  if (c.amend) {
    // the commit it rewrote is the newest letter of that repository: the new one takes its place
    for (let i = letters.length - 1; i >= 0; i--) {
      const l = letters[i]
      if (l && l.root === root) {
        letters[i] = { ...l, sha: c.sha, subject: c.subject, branch: c.branch, at: now }
        return
      }
    }
  }
  if (letters.some(l => l.root === root && (l.sha.startsWith(c.sha) || c.sha.startsWith(l.sha)))) return
  letters = [...letters, { sha: c.sha, subject: c.subject, branch: c.branch, repo, root, at: now }].slice(-MOST_LETTERS)
  if (!c.amend) commits++
  addEvent({ kind: 'commit', n: 1, repo, branch: c.branch, subject: short(c.subject, 80) })
}

async function notePush($: EngineInterface, data: SignalData, folder: Promise<string>): Promise<void> {
  const p = data.push
  if (!p) return
  const root = await rootOf($, data.dirs ?? [], folder)
  const mine = letters.filter(l => l.root === root)
  const unpushed = await unpushedIn($, root)
  let sent: Letter[]
  if (unpushed) sent = mine.filter(l => !holds(unpushed, l.sha))
  else {
    // git could not say: the letters of the branches the push named went out (all of that repository's, if it named none)
    const branches = new Set(p.refs.filter(r => !r.isTag).map(r => r.from))
    sent = branches.size ? mine.filter(l => branches.has(l.branch)) : mine
  }
  letters = letters.filter(l => !sent.includes(l))
  const moved = p.refs.length > 0
  if (moved) pushes++
  if (!moved && !sent.length) return
  const branch = p.refs.find(r => !r.isTag)?.to ?? sent[sent.length - 1]?.branch ?? ''
  addEvent({ kind: 'push', n: sent.length, repo: nameOf(root), branch })
}

async function notePullRequest($: EngineInterface, data: SignalData, folder: Promise<string>): Promise<void> {
  const pr = data.pr
  if (!pr) return
  const root = await rootOf($, data.dirs ?? [], folder)
  prs++
  addEvent({ kind: 'pr', n: 1, repo: pr.repo || nameOf(root), number: pr.number, title: short(pr.title, 80), url: pr.url })
}

/**
 * Checks the letters against git: one a remote has now went out (a push made elsewhere: the window shows it as a
 * push); one that is on no branch any more was rewritten (a rebase, a reset) and is dropped quietly.
 */
async function checkLetters($: EngineInterface): Promise<void> {
  const byRoot = new Map<string, Letter[]>()
  for (const l of letters) if (l.root) byRoot.set(l.root, [...(byRoot.get(l.root) ?? []), l])
  for (const [root, mine] of byRoot) {
    const unpushed = await unpushedIn($, root)
    if (!unpushed) continue
    const gone = mine.filter(l => !holds(unpushed, l.sha))
    if (!gone.length) continue
    const out = await git($, ['-C', root, 'rev-list', '--remotes', '-n', '3000'])
    if (out === null) continue
    const remote = new Set(out.split(/\s+/).filter(Boolean))
    const sent = gone.filter(l => holds(remote, l.sha))
    letters = letters.filter(l => !gone.includes(l))
    if (sent.length) addEvent({ kind: 'push', n: sent.length, repo: nameOf(root), branch: sent[sent.length - 1]?.branch ?? '', outside: true })
  }
}
