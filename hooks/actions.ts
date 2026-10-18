// Everything the pane's buttons do. Drawing never runs these: handlers and
// events do, and the state they write redraws the pane.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, ProcessRunInit } from 'claude-code'

import type { Change, Entry } from '../types'
import {
  CODE_LIMIT,
  isProtected,
  isStaged,
  limitDiff,
  parseBranches,
  parseStatus,
  shortError,
} from './git'
import { EMPTY_REPO } from './state'

const busyState = atom({ plugin: 'workspace', key: 'busy' } as const, null)
const confirmState = atom({ plugin: 'workspace', key: 'confirm' } as const, null)
const diffState = atom({ plugin: 'workspace', key: 'diff' } as const, null)
const dirState = atom({ plugin: 'workspace', key: 'dir' } as const, '')
const draftState = atom({ plugin: 'workspace', key: 'draft' } as const, '')
const entriesState = atom({ plugin: 'workspace', key: 'entries' } as const, [])
const isEditingState = atom({ plugin: 'workspace', key: 'isEditing' } as const, false)
const messageState = atom({ plugin: 'workspace', key: 'message' } as const, '')
const noticeState = atom({ plugin: 'workspace', key: 'notice' } as const, null)
const openFileState = atom({ plugin: 'workspace', key: 'openFile' } as const, null)
const repoState = atom({ plugin: 'workspace', key: 'repo' } as const, EMPTY_REPO)

type $ = EngineInterface

const MAX_OPEN_BYTES = 1024 * 1024

const join = (parent: string, name: string) => (parent ? `${parent}/${name}` : name)
const parentOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')

// No shell, no prompts: a push that needs a password fails fast instead of hanging.
async function git($: $, args: string[], init: ProcessRunInit = {}) {
  return $.process.run(['git', ...args], {
    timeoutMs: 120000,
    ...init,
    env: { GIT_TERMINAL_PROMPT: '0', ...init.env },
  })
}

async function gitOk($: $, args: string[]) {
  const { root } = await read($, repoState)
  const ran = await git($, args, { cwd: root })
  if (ran.exitCode !== 0) throw new Error(shortError(ran.stderr, ran.stdout))

  return ran
}

function fail($: $, error: unknown) {
  return update($, noticeState, () => ({
    kind: 'error' as const,
    text: error instanceof Error ? error.message : String(error),
  }))
}

// Runs one git action with a busy label, then refreshes what it may have changed.
async function run($: $, label: string, work: () => Promise<void>) {
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

// Files

export async function refreshDir($: $) {
  const current = await read($, dirState)
  const listed = await $.fs.list(current || undefined).catch(() => null)

  if (listed === null && current !== '') {
    await update($, dirState, () => '')
    return refreshDir($)
  }

  const sorted: Entry[] = (listed ?? [])
    .filter(entry => entry.name !== '.git')
    .map(entry => ({ name: entry.name, kind: entry.kind, size: entry.size }))
    .sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : b.kind === 'dir' ? 1 : 0,
    )
  await update($, entriesState, () => sorted)
}

export async function openEntry($: $, entry: Entry) {
  const path = join(await read($, dirState), entry.name)

  if (entry.kind === 'dir') {
    await update($, dirState, () => path)
    return refreshDir($)
  }

  await openPath($, path)
}

export async function openPath($: $, path: string) {
  try {
    const { size } = await $.fs.stat(path)
    if (size > MAX_OPEN_BYTES) {
      await update($, openFileState, () => ({ path, text: '', readOnlyReason: 'Too large to open here.' }))
    } else {
      const text = await $.fs.read(path)
      const isBinary = text.includes('\u0000')
      const isLong = text.length > CODE_LIMIT
      await update($, openFileState, () => ({
        path,
        text: isBinary ? '' : text.slice(0, CODE_LIMIT),
        readOnlyReason: isBinary ? 'Binary file.' : isLong ? 'Too large to edit here, showing the start.' : undefined,
      }))
    }
    await update($, isEditingState, () => false)
  } catch (error) {
    await fail($, error)
  }
}

export async function goUp($: $) {
  await update($, dirState, current => parentOf(current))
  await refreshDir($)
}

export async function closeFile($: $) {
  await update($, openFileState, () => null)
  await update($, isEditingState, () => false)
}

export async function startEdit($: $) {
  const file = await read($, openFileState)
  if (file === null || file.readOnlyReason) return

  await update($, draftState, () => file.text)
  await update($, isEditingState, () => true)
}

export function cancelEdit($: $) {
  return update($, isEditingState, () => false)
}

export async function save($: $, text: string) {
  const file = await read($, openFileState)
  if (file === null) return

  try {
    await $.fs.write(file.path, text)
    await update($, openFileState, () => ({ ...file, text }))
    await update($, isEditingState, () => false)
    $.ui.toast(`Saved ${file.path}`)
    await refreshRepo($)
  } catch (error) {
    await fail($, error)
  }
}

// Source control

export async function refreshRepo($: $) {
  const top = await git($, ['rev-parse', '--show-toplevel']).catch(() => null)

  if (top === null || top.exitCode !== 0) {
    await update($, repoState, current => ({ ...current, isRepo: false, changes: [] }))
    return
  }

  const root = top.stdout.trim()
  const [status, branches] = await Promise.all([
    git($, ['status', '--porcelain=v1', '-z', '--branch'], { cwd: root }),
    git($, ['branch', '--format=%(refname:short)'], { cwd: root }),
  ])
  const summary = parseStatus(status.stdout)
  await update($, repoState, () => ({
    isRepo: true,
    root,
    ...summary,
    branches: parseBranches(branches.stdout),
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

export function stage($: $, path: string) {
  return run($, 'Staging', async () => {
    await gitOk($, ['add', '-A', '--', path])
  })
}

export function stageAll($: $) {
  return run($, 'Staging', async () => {
    await gitOk($, ['add', '-A'])
  })
}

export function unstage($: $, path: string) {
  return run($, 'Unstaging', async () => {
    // `restore --staged` needs a first commit; `rm --cached` covers a fresh repo.
    await gitOk($, ['restore', '--staged', '--', path])
      .catch(() => gitOk($, ['rm', '--cached', '-r', '-q', '--', path]))
  })
}

export function setMessage($: $, text: string) {
  return update($, messageState, () => text)
}

export function cancelConfirm($: $) {
  return update($, confirmState, () => null)
}

export async function commit($: $) {
  const text = (await read($, messageState)).trim()
  const current = await read($, repoState)

  if (text === '') return fail($, new Error('Type a commit message first.'))
  if (!current.changes.some(isStaged)) return fail($, new Error('Nothing staged. Stage some changes first.'))
  if (isProtected(current.branch) && (await read($, confirmState)) !== 'commit') {
    return update($, confirmState, () => 'commit' as const)
  }

  await update($, confirmState, () => null)
  await run($, 'Committing', async () => {
    const ran = await gitOk($, ['commit', '-m', text])
    await update($, messageState, () => '')
    $.ui.toast(ran.stdout.split('\n')[0] || 'Committed')
  })
}

export async function push($: $) {
  const current = await read($, repoState)

  if (isProtected(current.branch) && (await read($, confirmState)) !== 'push') {
    return update($, confirmState, () => 'push' as const)
  }

  await update($, confirmState, () => null)
  await run($, 'Pushing', async () => {
    await gitOk($, current.upstream ? ['push'] : ['push', '-u', 'origin', current.branch])
    $.ui.toast(`Pushed ${current.branch}`)
  })
}

export function pull($: $) {
  return run($, 'Pulling', async () => {
    const ran = await gitOk($, ['pull', '--no-edit'])
    $.ui.toast(ran.stdout.split('\n')[0] || 'Pulled')
    await refreshDir($)
  })
}

export async function switchBranch($: $, name: string) {
  const current = await read($, repoState)
  if (name === current.branch) return

  await run($, 'Switching', async () => {
    await gitOk($, ['switch', name])
    $.ui.toast(`Switched to ${name}`)
    if (!(await read($, isEditingState))) await closeFile($)
    await refreshDir($)
  })
}

export async function refreshAll($: $) {
  await Promise.all([refreshDir($), refreshRepo($)])
}
