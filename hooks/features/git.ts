// Reads git's own words out of a shell command Claude ran (Bash or PowerShell): the commits it made, a push, and a pull
// request it opened. Nothing here runs anything: it only reads the command and what it printed. The core mod turns
// what it finds into the 'commit', 'push' and 'pull-request' signals (see ./kit.ts); the mailroom feature
// (./mailroom.ts) asks git itself which repository that was and what is still waiting to be pushed.

/** One commit, from git's summary line `[main 1a2b3c4] Fix the parser`. */
export type Commit = { sha: string; branch: string; subject: string; amend: boolean }
/** One ref a push moved: `main -> main`, a new branch, or a tag. */
export type PushedRef = { from: string; to: string; isNew: boolean; isTag: boolean; forced: boolean }
/** A push that went through (or found everything already up to date). */
export type Push = { refs: PushedRef[]; remote: string; upToDate: boolean }
/** A pull request `gh pr create` opened. */
export type PullRequest = { url: string; number: number; repo: string; title: string }
/**
 * What one shell command did with git. `dirs` are the folders the command moved to before running git, in order
 * (`cd <dir>`, `Set-Location <dir>`, `git -C <dir>`), each absolute or relative to the one before.
 */
export type GitMoments = { commits: Commit[]; push: Push | null; pr: PullRequest | null; dirs: string[] }

const SHELLS = /^(Bash|PowerShell)$/

/** One of git's global options, with its value: `-C <dir>`, `-c key=value`, `--no-pager`... */
const OPT = String.raw`(?:\s+(?:-C|-c|--git-dir|--work-tree|--namespace)\s+(?:"[^"]*"|'[^']*'|[^\s;&|]+)|\s+--?[A-Za-z][\w-]*(?:=[^\s;&|]+)?)`
/** `git`, its global options (captured: the -C folders are among them), then the subcommand. */
const GIT_OPTS = String.raw`\bgit(${OPT}*)\s+`
const MAKES_COMMITS = new RegExp(GIT_OPTS + String.raw`(?:commit|cherry-pick|revert)\b`)
const PUSHES = new RegExp(GIT_OPTS + String.raw`push\b`)
const OPENS_PR = /\bgh\s+pr\s+create\b/

/** git's summary line for a commit it just made: `[main 1a2b3c4] subject`, `[main (root-commit) 1a2b3c4] subject`. */
const SUMMARY = /^\[(.+?)(?: \(root-commit\))? ([0-9a-f]{7,40})\] (.*)$/gm
/** A ref line of `git push`: `   1a2b..3c4d  main -> main`, ` * [new branch]  topic -> topic`, ` + a...b  x -> x (forced update)`. */
const PUSHED = /^\s*([+*=!-])?\s*(\[new branch\]|\[new tag\]|\[new reference\]|[0-9a-f]{4,40}\.\.\.?[0-9a-f]{4,40})\s+(\S+)\s+->\s+(\S+)(.*)$/gm
const PR_URL = /\bhttps?:\/\/[^\s/]+\/([^\s/]+)\/([^\s/]+)\/pull\/(\d+)\b/

/** The text a shell command printed: its standard output and error when the tool kept them apart, else what the model read. */
export function outputOf(result: unknown): string {
  if (!result || typeof result !== 'object') return ''
  const r = result as { text?: unknown; result?: unknown }
  const rec = r.result
  if (rec && typeof rec === 'object') {
    const { stdout, stderr } = rec as { stdout?: unknown; stderr?: unknown }
    if (typeof stdout === 'string' || typeof stderr === 'string') return `${typeof stdout === 'string' ? stdout : ''}\n${typeof stderr === 'string' ? stderr : ''}`
  }
  if (typeof r.text === 'string') return r.text
  return typeof rec === 'string' ? rec : ''
}

function unquote(s: string): string {
  const t = s.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1)
  return t
}

/** A folder git can be pointed at as written (not a variable, `~` or `cd -`). */
const plainDir = (dir: string) => !!dir && dir !== '-' && !/[$`%~]/.test(dir)

/**
 * The folders a command moves to before the git call at `at` (its index in the command): every `cd`, `Set-Location`
 * or `pushd` before it, then the `-C` options among that call's global options (`gitOptions`). A folder named
 * through a variable or `~` cannot be followed, so the list starts over after it (the session's own folder is used
 * instead).
 */
export function dirsOf(command: string, at: number, gitOptions = ''): string[] {
  const dirs: string[] = []
  const CD = /(?:^|[;&|(]|\n)\s*(?:cd|chdir|pushd|Set-Location|Push-Location|sl)\s+(?:-(?:Path|LiteralPath)\s+)?("[^"]*"|'[^']*'|[^\s;&|)]+)/gi
  for (const m of command.slice(0, at).matchAll(CD)) {
    const dir = unquote(m[1] ?? '')
    if (plainDir(dir)) dirs.push(dir)
    else dirs.length = 0
  }
  for (const m of gitOptions.matchAll(/\s-C\s+("[^"]*"|'[^']*'|[^\s;&|]+)/g)) {
    const dir = unquote(m[1] ?? '')
    if (plainDir(dir)) dirs.push(dir)
  }
  return dirs
}

/** The `--title` of `gh pr create`, when it was written out in quotes. */
function titleOf(command: string): string {
  const m = /\s(?:--title|-t)(?:\s+|=)("([^"]*)"|'([^']*)')/.exec(command)
  return (m?.[2] ?? m?.[3] ?? '').trim()
}

/** The part of a command from `at` to the end of that one command (the next `;`, `&&`, `|` or line). */
const callAt = (command: string, at: number) => command.slice(at).split(/[;&|\n]/)[0] ?? ''

/**
 * What a finished shell call did with git, or null when it did nothing worth a letter. A commit counts when git
 * printed its summary line (so it really happened, even if a later part of the command failed); a push counts when
 * git listed the refs it moved or said everything was up to date; a pull request counts when `gh pr create`
 * succeeded and printed the pull request's address.
 */
export function gitMomentsOf(tool: string, input: Record<string, unknown>, result: unknown): GitMoments | null {
  if (!SHELLS.test(tool) || typeof input.command !== 'string') return null
  const command = input.command
  if (!/\b(git|gh)\b/.test(command)) return null
  if (!result || typeof result !== 'object' || (result as { deny?: unknown }).deny !== undefined) return null
  const failed = (result as { isError?: unknown }).isError === true
  const out = outputOf(result)
  const moments: GitMoments = { commits: [], push: null, pr: null, dirs: [] }
  /** The first git call that did something: the folders are read from the command up to it. */
  let first: { at: number; options: string } | null = null
  const callOf = (re: RegExp) => {
    const m = re.exec(command)
    return m ? { at: m.index, options: m[1] ?? '' } : null
  }

  const commitCall = callOf(MAKES_COMMITS)
  if (commitCall) {
    const amend = /\s--amend\b/.test(command)
    const seen = new Set<string>()
    for (const m of out.matchAll(SUMMARY)) {
      const sha = m[2] ?? ''
      if (!sha || seen.has(sha)) continue
      seen.add(sha)
      moments.commits.push({ sha, branch: (m[1] ?? '').trim(), subject: (m[3] ?? '').trim(), amend })
    }
    if (moments.commits.length) first = commitCall
  }

  const pushCall = callOf(PUSHES)
  if (pushCall && !/\s(?:--dry-run|-n)\b/.test(callAt(command, pushCall.at))) {
    const refs: PushedRef[] = []
    for (const m of out.matchAll(PUSHED)) {
      const flag = m[1] ?? ' '
      const what = m[2] ?? ''
      // '!' is a rejected ref, '=' one that was already there
      if (flag === '!' || flag === '=') continue
      refs.push({ from: m[3] ?? '', to: m[4] ?? '', isNew: what.startsWith('[new'), isTag: what === '[new tag]', forced: flag === '+' || /forced update/.test(m[5] ?? '') })
    }
    const upToDate = /^Everything up-to-date\s*$/m.test(out)
    const quiet = /\s(?:-q|--quiet|--porcelain)\b/.test(callAt(command, pushCall.at))
    if (refs.length || upToDate || (quiet && !failed)) {
      moments.push = { refs, remote: /^To (\S+)/m.exec(out)?.[1] ?? '', upToDate: upToDate && !refs.length }
      first ??= pushCall
    }
  }

  const prAt = command.search(OPENS_PR)
  if (prAt >= 0 && !failed) {
    const m = PR_URL.exec(out)
    if (m) {
      moments.pr = { url: m[0], number: Number(m[3]), repo: m[2] ?? '', title: titleOf(command) }
      first ??= { at: prAt, options: '' }
    }
  }

  if (!moments.commits.length && !moments.push && !moments.pr) return null
  moments.dirs = first ? dirsOf(command, first.at, first.options) : []
  return moments
}
