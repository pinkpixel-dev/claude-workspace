// The git plumbing every Source Control action shares: running git, showing
// its errors, and reading the repo back into state.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, ProcessRunInit } from 'claude-code'

import type { Change } from '../types'
import { isStaged, limitDiff, parseBranches, parseRemotes, parseStatus, shortError } from './git'
import { EMPTY_REPO } from './state'

const busyState = atom({ plugin: 'workspace', key: 'busy' } as const, null)
const diffState = atom({ plugin: 'workspace', key: 'diff' } as const, null)
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

export async function gitOk($: $, args: string[]) {
  const { root } = await read($, repoState)
  const ran = await git($, args, { cwd: root })
  if (ran.exitCode !== 0) throw new Error(shortError(ran.stderr, ran.stdout))

  return ran
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

export async function refreshRepo($: $) {
  const top = await git($, ['rev-parse', '--show-toplevel']).catch(() => null)

  if (top === null || top.exitCode !== 0) {
    await update($, repoState, current => ({ ...current, isRepo: false, changes: [] }))
    return
  }

  const root = top.stdout.trim()
  const [status, branches, remotes] = await Promise.all([
    git($, ['status', '--porcelain=v1', '-z', '--branch'], { cwd: root }),
    git($, ['branch', '--format=%(refname:short)'], { cwd: root }),
    git($, ['remote'], { cwd: root }),
  ])
  const summary = parseStatus(status.stdout)
  await update($, repoState, () => ({
    isRepo: true,
    root,
    ...summary,
    branches: parseBranches(branches.stdout),
    remotes: parseRemotes(remotes.stdout),
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
