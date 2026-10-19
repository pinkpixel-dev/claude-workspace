// Pure git helpers: no `$`, so the tests can run them directly.
import type { Branch, Change, Commit, Operation, Repo, Stash } from '../types'
import { C } from './theme'

export type StatusSummary = {
  branch: string
  upstream?: string
  ahead: number
  behind: number
  changes: Change[]
}

// The most characters the `Code` element draws in one go.
export const CODE_LIMIT = 100000

// Reads `git status --porcelain=v1 -z --branch`.
export const parseStatus = (out: string): StatusSummary => {
  const records = out.split('\0').filter(record => record !== '')
  const summary: StatusSummary = { branch: '', ahead: 0, behind: 0, changes: [] }

  for (let i = 0; i < records.length; i += 1) {
    const record = records[i] ?? ''

    if (record.startsWith('## ')) {
      Object.assign(summary, parseBranchLine(record.slice(3)))
      continue
    }

    // A space is git's "unchanged" letter, so a short record reads as no change.
    const index = record[0] ?? ' '
    const work = record[1] ?? ' '
    summary.changes.push({ path: record.slice(3), index, work })

    // Renames and copies carry the original path as the next record.
    if (index === 'R' || index === 'C') {
      i += 1
    }
  }

  return summary
}

const parseBranchLine = (line: string) => {
  const fresh = line.match(/^(?:No commits yet on|Initial commit on) (.+)$/)
  if (fresh) {
    return { branch: fresh[1], upstream: undefined, ahead: 0, behind: 0 }
  }

  const match = line.match(/^(.+?)(?:\.\.\.(\S+))?(?: \[(.+)\])?$/)
  const track = match?.[3] ?? ''

  return {
    branch: match?.[1] ?? line,
    upstream: match?.[2],
    ahead: Number(track.match(/ahead (\d+)/)?.[1] ?? 0),
    behind: Number(track.match(/behind (\d+)/)?.[1] ?? 0),
  }
}

// The `git branch` format parseBranches reads: name, upstream, tracking, tab separated.
export const BRANCH_FORMAT = '--format=%(refname:short)%09%(upstream:short)%09%(upstream:track)'

export const parseBranches = (out: string): Branch[] =>
  out
    .split('\n')
    .filter(line => line.trim() !== '' && !line.startsWith('('))
    .map(line => {
      const [name = '', upstream = '', track = ''] = line.split('\t')

      return {
        name: name.trim(),
        upstream: upstream.trim() || undefined,
        ahead: Number(track.match(/ahead (\d+)/)?.[1] ?? 0),
        behind: Number(track.match(/behind (\d+)/)?.[1] ?? 0),
        isGone: track.trim() === '[gone]',
      }
    })

export const parseRemotes = (out: string): string[] =>
  out
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '')

// Remote branches with the symref beside each, so the remotes' HEAD pointers drop out.
export const REMOTE_BRANCH_FORMAT = '--format=%(refname:lstrip=2)%09%(symref)'

export const parseRemoteBranches = (out: string): string[] =>
  out
    .split('\n')
    .map(line => line.split('\t'))
    .filter(([name = '', symref = '']) => name.trim() !== '' && symref.trim() === '')
    .map(([name = '']) => name.trim())

// Remote branches you don't have locally yet, by name and by tracking.
export const remoteOnly = (repo: Pick<Repo, 'branches' | 'remoteBranches' | 'remotes'>) =>
  repo.remoteBranches.filter(ref => {
    const remote = repo.remotes.find(one => ref.startsWith(`${one}/`))
    const name = remote === undefined ? ref : ref.slice(remote.length + 1)

    return !repo.branches.some(branch => branch.name === name || branch.upstream === ref)
  })

// `git log` fields, tab separated with the subject last so a tab inside it survives.
export const LOG_FORMAT = '--format=%H%x09%h%x09%P%x09%ar%x09%s'

// "2 hours ago" reads as 2h; "1 year, 2 months ago" keeps its first part.
export const shortAge = (relative: string) => {
  const match = relative.match(/^(\d+) (second|minute|hour|day|week|month|year)/)
  if (!match) return relative

  const unit = { second: 's', minute: 'm', hour: 'h', day: 'd', week: 'w', month: 'mo', year: 'y' }[match[2] ?? 'second']

  return `${match[1]}${unit}`
}

export const parseLog = (out: string): Commit[] =>
  out
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => {
      const [sha = '', short = '', parents = '', age = '', ...subject] = line.split('\t')

      return {
        sha,
        short,
        subject: subject.join('\t'),
        age: shortAge(age),
        isMerge: parents.trim().split(' ').length > 1,
      }
    })

export const STASH_FORMAT = '--format=%gd%x09%cr%x09%gs'

export const parseStashes = (out: string): Stash[] =>
  out
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => {
      const [ref = '', age = '', ...message] = line.split('\t')

      return { ref, age: shortAge(age), message: message.join('\t') }
    })

// Which remote the branch's upstream lives on, if it has one.
export const upstreamRemote = (repo: Pick<Repo, 'upstream' | 'remotes'>) =>
  repo.remotes.find(remote => repo.upstream?.startsWith(`${remote}/`))

// The remote to use: the one picked last for this repo, else the upstream's, else origin.
export const pickRemote = (remotes: string[], saved: unknown, upstream?: string) => {
  if (typeof saved === 'string' && remotes.includes(saved)) return saved

  return upstreamRemote({ upstream, remotes }) ?? (remotes.includes('origin') ? 'origin' : remotes[0] ?? '')
}

// A branch tracking the picked remote pushes plainly; any other push names it.
export const pushArgs = (repo: Pick<Repo, 'upstream' | 'remotes' | 'remote' | 'branch'>) => {
  if (repo.upstream === undefined) return ['push', '-u', repo.remote, repo.branch]
  if (upstreamRemote(repo) === repo.remote) return ['push']

  return ['push', repo.remote, repo.branch]
}

export const pullArgs = (repo: Pick<Repo, 'upstream' | 'remotes' | 'remote' | 'branch'>) =>
  upstreamRemote(repo) === repo.remote
    ? ['pull', '--no-edit']
    : ['pull', '--no-edit', repo.remote, repo.branch]

export const isStaged = (change: Change) =>
  change.index !== ' ' && change.index !== '?'

export const isUnstaged = (change: Change) => change.work !== ' '

// The letter VS Code would show, untracked files reading as `U`.
export const letterOf = (status: string) => (status === '?' ? 'U' : status)

export const colorOf = (letter: string) => {
  if (letter === 'A' || letter === 'U') return C.added
  if (letter === 'D') return C.deleted
  if (letter === 'R' || letter === 'C') return C.renamed

  return C.modified
}

// Cuts a diff at a hunk boundary so the part shown still parses as a diff.
export const limitDiff = (text: string, max = CODE_LIMIT) => {
  if (text.length <= max) return text

  const cut = text.lastIndexOf('\n@@', max)

  return cut > 0 ? text.slice(0, cut + 1) : text.slice(0, text.lastIndexOf('\n', max) + 1)
}

export const isProtected = (branch: string) => branch === 'main' || branch === 'master'

// The last commit is on the remote already, so amending it rewrites shared history.
export const isPushed = (repo: Pick<Repo, 'upstream' | 'ahead'>) => repo.upstream !== undefined && repo.ahead === 0

export const isUntracked = (change: Change) => change.work === '?'

// The status pairs git uses for a file both sides changed (or one side deleted).
const CONFLICT_PAIRS = ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']

export const isConflicted = (change: Change) => CONFLICT_PAIRS.includes(`${change.index}${change.work}`)

// What's in `.git` while each operation waits on you, checked in this order.
export const OPERATION_MARKERS: [Operation, string][] = [
  ['rebase', 'rebase-merge'],
  ['rebase', 'rebase-apply'],
  ['merge', 'MERGE_HEAD'],
  ['revert', 'REVERT_HEAD'],
  ['cherry-pick', 'CHERRY_PICK_HEAD'],
]

export const operationArgs = (operation: Operation, step: 'continue' | 'abort') => {
  // A merge finishes by committing with the message git already wrote.
  if (operation === 'merge') return step === 'continue' ? ['commit', '--no-edit'] : ['merge', '--abort']

  return [operation, `--${step}`]
}

// A line git writes at the start or end of a conflict block.
export const hasConflictMarkers = (text: string) => /^(<{7}|>{7})( |$)/m.test(text)

// Splits one file's diff into its header and hunks, so each hunk can be
// applied by itself as header + hunk.
export const splitHunks = (diff: string) => {
  const first = diff.indexOf('\n@@')
  if (!diff.startsWith('@@') && first < 0) return { header: diff, hunks: [] }

  const header = diff.startsWith('@@') ? '' : diff.slice(0, first + 1)
  const body = diff.slice(header.length)
  const hunks = body.split(/\n(?=@@ )/).map((hunk, i, all) => (i < all.length - 1 ? `${hunk}\n` : hunk))

  return { header, hunks: hunks.filter(hunk => hunk.startsWith('@@')) }
}

// Throws away a file's working tree changes; an untracked file is deleted outright.
export const discardArgs = (change: Change) =>
  isUntracked(change)
    ? ['clean', '-f', '-d', '-q', '--', change.path]
    : ['restore', '--worktree', '--', change.path]

// First few lines of git's complaint, enough to act on in a small pane.
export const shortError = (stderr: string, stdout: string) =>
  (stderr.trim() || stdout.trim() || 'git failed').split('\n').slice(0, 4).join('\n')
