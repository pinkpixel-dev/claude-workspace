// The git plumbing every Source Control action shares: running git, showing
// its errors, and reading the repo back into state.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, ProcessRunInit, ProcessRunResult } from 'claude-code'

import type { Change, Confirm } from '../types'
import { ACTIVITY_DAYS, parseCommitDays } from './chart'
import {
  BRANCH_FORMAT,
  isStaged,
  limitDiff,
  LOG_FORMAT,
  OPERATION_MARKERS,
  parseBranches,
  parseLog,
  parseRemoteBranches,
  parseRemotes,
  parseStashes,
  parseStatus,
  pickRemote,
  REMOTE_BRANCH_FORMAT,
  shortError,
  STASH_FORMAT,
} from './git'
import { EMPTY_REPO, HISTORY_PAGE } from './state'

const busyState = atom({ plugin: 'workspace', key: 'busy' } as const, null)
const confirmState = atom({ plugin: 'workspace', key: 'confirm' } as const, null)
const diffState = atom({ plugin: 'workspace', key: 'diff' } as const, null)
const gitViewState = atom({ plugin: 'workspace', key: 'gitView' } as const, 'changes')
const historyLimitState = atom({ plugin: 'workspace', key: 'historyLimit' } as const, HISTORY_PAGE)
const noticeState = atom({ plugin: 'workspace', key: 'notice' } as const, null)
const repoState = atom({ plugin: 'workspace', key: 'repo' } as const, EMPTY_REPO)

type $ = EngineInterface

// No shell, no prompts: a push that needs a password fails fast instead of hanging.
export async function git($: $, args: string[], init: ProcessRunInit = {}) {
  return $.process.run(['git', ...args], {
    timeoutMs: 120000,
    ...init,
    env: { GIT_TERMINAL_PROMPT: '0', ...init.env },
  })
}

export async function gitOk($: $, args: string[], init: ProcessRunInit = {}) {
  const { root } = await read($, repoState)
  const ran = await git($, args, { ...init, cwd: root })
  if (ran.exitCode !== 0) throw new Error(shortError(ran.stderr, ran.stdout))

  return ran
}

// Where the remote picked for a repo is kept, so the choice outlives the session.
const remoteKey = (root: string) => `remote:${root}`

// Asks the question the first time; true once the person said yes to this same step.
export async function confirmed($: $, ask: Confirm) {
  const current = await read($, confirmState)
  if (current !== null && current.action === ask.action && current.path === ask.path) {
    await update($, confirmState, () => null)
    return true
  }

  await update($, confirmState, () => ask)
  return false
}

export function fail($: $, error: unknown) {
  return update($, noticeState, () => ({
    kind: 'error' as const,
    text: error instanceof Error ? error.message : String(error),
  }))
}

// Runs one git action with a busy label, then refreshes what it may have changed.
export async function run($: $, label: string, work: () => Promise<void>) {
  if ((await read($, busyState)) !== null) return

  await update($, busyState, () => label)
  await update($, noticeState, () => null)
  try {
    await work()
  } catch (error) {
    await fail($, error)
  } finally {
    await update($, busyState, () => null)
    await refreshRepo($)
  }
}

// Which operation is waiting on you, from what it leaves in the git folder.
export async function readOperation($: $, gitDir: string) {
  const found = await Promise.all(
    OPERATION_MARKERS.map(([, marker]) => $.fs.stat(`${gitDir}/${marker}`).then(() => true, () => false)),
  )
  const index = found.indexOf(true)

  return index < 0 ? null : OPERATION_MARKERS[index]?.[0] ?? null
}

// For a step that failed: when git stopped partway with conflicts, point at
// them in Changes; otherwise show git's own complaint. Either way it throws.
export async function failedStep($: $, label: string, ran: ProcessRunResult): Promise<never> {
  const { root } = await read($, repoState)
  const dir = await git($, ['rev-parse', '--absolute-git-dir'], { cwd: root })
  const operation = dir.exitCode === 0 ? await readOperation($, dir.stdout.trim()) : null
  if (operation === null) throw new Error(shortError(ran.stderr, ran.stdout))

  await update($, gitViewState, () => 'changes' as const)
  throw new Error(`${label} stopped on conflicts. Resolve them in Merge Changes.`)
}

export async function refreshRepo($: $) {
  const top = await git($, ['rev-parse', '--show-toplevel', '--absolute-git-dir']).catch(() => null)

  if (top === null || top.exitCode !== 0) {
    await update($, repoState, current => ({ ...current, isRepo: false, changes: [] }))
    return
  }

  const [root = '', gitDir = `${root}/.git`] = top.stdout.trim().split('\n')
  const limit = await read($, historyLimitState)
  // A repo with no commits yet fails `log`, which reads as an empty history.
  const [status, branches, remotes, remoteBranches, log, stashes, recent, now] = await Promise.all([
    git($, ['status', '--porcelain=v1', '-z', '--branch'], { cwd: root }),
    git($, ['branch', BRANCH_FORMAT], { cwd: root }),
    git($, ['remote'], { cwd: root }),
    git($, ['branch', '-r', REMOTE_BRANCH_FORMAT], { cwd: root }),
    git($, ['log', '-n', String(limit), LOG_FORMAT], { cwd: root }),
    git($, ['stash', 'list', STASH_FORMAT], { cwd: root }),
    // Commit times for the activity chart, read apart from the paged log so it covers the whole window.
    git($, ['log', `--since=${ACTIVITY_DAYS}.days.ago`, '--format=%ct'], { cwd: root }),
    $.clock.now().catch(() => null),
  ])
  const summary = parseStatus(status.stdout)
  const remoteNames = parseRemotes(remotes.stdout)
  const saved = await $.store.get(remoteKey(root)).catch(() => undefined)
  const operation = await readOperation($, gitDir)
  await update($, repoState, () => ({
    isRepo: true,
    root,
    ...summary,
    branches: parseBranches(branches.stdout),
    remotes: remoteNames,
    remote: pickRemote(remoteNames, saved, summary.upstream),
    remoteBranches: parseRemoteBranches(remoteBranches.stdout),
    commits: log.exitCode === 0 ? parseLog(log.stdout) : [],
    commitDays: recent.exitCode === 0 && now !== null ? parseCommitDays(recent.stdout, now) : [],
    stashes: parseStashes(stashes.stdout),
    operation,
  }))

  // Keep an open diff in step, or close it once the file has no changes left.
  const shown = await read($, diffState)
  if (shown !== null) {
    const change = summary.changes.find(one => one.path === shown.path)
    const isStill = change !== undefined && (shown.isStaged ? isStaged(change) : change.work !== ' ')
    if (isStill) await showDiff($, change, shown.isStaged)
    else await update($, diffState, () => null)
  }
}

export async function selectRemote($: $, name: string) {
  const { root } = await read($, repoState)
  await update($, repoState, current => ({ ...current, remote: name }))
  await $.store.set(remoteKey(root), name).catch(() => undefined)
}

export async function showDiff($: $, change: Change, staged: boolean) {
  const { root } = await read($, repoState)
  const args = change.index === '?'
    ? ['diff', '--no-index', '--', '/dev/null', change.path]
    : ['diff', ...(staged ? ['--cached'] : []), '--', change.path]
  // `--no-index` exits 1 when the files differ, so the exit code is not checked.
  const ran = await git($, args, { cwd: root })
  await update($, diffState, () => ({ path: change.path, isStaged: staged, text: limitDiff(ran.stdout) }))
}

export function closeDiff($: $) {
  return update($, diffState, () => null)
}
