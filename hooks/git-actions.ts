// What the Source Control tab's buttons do. Each git step runs through `run`,
// which shows a busy label and refreshes the repo once it's done.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Change, Confirm } from '../types'
import { closeFile, refreshDir, reloadFile } from './actions'
import {
  discardArgs,
  isProtected,
  isPushed,
  isStaged,
  isUnstaged,
  isUntracked,
  pullArgs,
  pushArgs,
  shortError,
} from './git'
import { forceDeleteBranch } from './branch-actions'
import { dropStash, revert } from './history-actions'
import { confirmed, fail, git, gitOk, refreshRepo, run } from './repo'
import { EMPTY_REPO, PANE } from './state'

const busyState = atom({ plugin: 'workspace', key: 'busy' } as const, null)
const confirmState = atom({ plugin: 'workspace', key: 'confirm' } as const, null)
const isEditingState = atom({ plugin: 'workspace', key: 'isEditing' } as const, false)
const messageState = atom({ plugin: 'workspace', key: 'message' } as const, '')
const repoState = atom({ plugin: 'workspace', key: 'repo' } as const, EMPTY_REPO)

type $ = EngineInterface

export const FETCH_EVERY_MS = 3 * 60 * 1000

const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1)

async function commitWith($: $, label: string, args: string[], fallback: string) {
  await update($, confirmState, () => null)
  await run($, label, async () => {
    const ran = await gitOk($, args)
    await update($, messageState, () => '')
    $.ui.toast(ran.stdout.split('\n')[0] || fallback)
  })
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

export async function discard($: $, change: Change) {
  const name = nameOf(change.path)
  const ask: Confirm = isUntracked(change)
    ? { action: 'discard', path: change.path, question: `Delete untracked ${name}?`, yes: 'Yes, delete' }
    : { action: 'discard', path: change.path, question: `Discard changes to ${name}?`, yes: 'Yes, discard' }
  if (!(await confirmed($, ask))) return

  await run($, 'Discarding', async () => {
    await gitOk($, discardArgs(change))
    await reloadFile($)
    await refreshDir($)
  })
}

export async function discardAll($: $) {
  const changes = (await read($, repoState)).changes.filter(isUnstaged)
  if (changes.length === 0) return

  const tracked = changes.filter(one => !isUntracked(one)).map(one => one.path)
  const fresh = changes.filter(isUntracked).map(one => one.path)
  const count = changes.length === 1 ? '1 change' : `${changes.length} changes`
  const ask: Confirm = {
    action: 'discard-all',
    question: fresh.length > 0 ? `Discard all ${count}? Untracked files get deleted.` : `Discard all ${count}?`,
    yes: 'Yes, discard',
  }
  if (!(await confirmed($, ask))) return

  await run($, 'Discarding', async () => {
    if (tracked.length > 0) await gitOk($, ['restore', '--worktree', '--', ...tracked])
    if (fresh.length > 0) await gitOk($, ['clean', '-f', '-d', '-q', '--', ...fresh])
    await reloadFile($)
    await refreshDir($)
  })
}

export function setMessage($: $, text: string) {
  return update($, messageState, () => text)
}

export function cancelConfirm($: $) {
  return update($, confirmState, () => null)
}

// The confirm row's yes button: runs again the step that asked.
export async function confirmYes($: $) {
  const ask = await read($, confirmState)
  if (ask === null) return

  switch (ask.action) {
    case 'commit':
      return commit($)
    case 'commit-all':
      return commitAll($)
    case 'amend':
      return amend($)
    case 'push':
      return push($)
    case 'discard-all':
      return discardAll($)
    case 'force-delete':
      return forceDeleteBranch($, ask.path ?? '')
    case 'revert': {
      const commit = (await read($, repoState)).commits.find(one => one.sha === ask.path)
      if (commit !== undefined) return revert($, commit)
      return cancelConfirm($)
    }
    case 'drop-stash': {
      const stash = (await read($, repoState)).stashes.find(one => one.ref === ask.path)
      if (stash !== undefined) return dropStash($, stash)
      return cancelConfirm($)
    }
    case 'discard': {
      const change = (await read($, repoState)).changes.find(one => one.path === ask.path)
      if (change !== undefined) return discard($, change)
      return cancelConfirm($)
    }
  }
}

export async function commit($: $) {
  const text = (await read($, messageState)).trim()
  const current = await read($, repoState)

  if (text === '') return fail($, new Error('Type a commit message first.'))
  if (!current.changes.some(isStaged)) return fail($, new Error('Nothing staged. Stage some changes first.'))
  if (isProtected(current.branch)) {
    const ask: Confirm = { action: 'commit', question: `Commit straight to ${current.branch}?`, yes: 'Yes, commit' }
    if (!(await confirmed($, ask))) return
  }

  await commitWith($, 'Committing', ['commit', '-m', text], 'Committed')
}

// Stages everything, untracked files too, and commits it in one go.
export async function commitAll($: $) {
  const text = (await read($, messageState)).trim()
  const current = await read($, repoState)

  if (text === '') return fail($, new Error('Type a commit message first.'))
  if (current.changes.length === 0) return fail($, new Error('Nothing to commit.'))
  if (isProtected(current.branch)) {
    const ask: Confirm = {
      action: 'commit-all',
      question: `Commit all changes straight to ${current.branch}?`,
      yes: 'Yes, commit',
    }
    if (!(await confirmed($, ask))) return
  }

  await update($, confirmState, () => null)
  await run($, 'Committing', async () => {
    await gitOk($, ['add', '-A'])
    const ran = await gitOk($, ['commit', '-m', text])
    await update($, messageState, () => '')
    $.ui.toast(ran.stdout.split('\n')[0] || 'Committed')
  })
}

// Folds staged changes into the last commit. A typed message replaces its
// message; an empty box keeps the old one.
export async function amend($: $) {
  const text = (await read($, messageState)).trim()
  const current = await read($, repoState)

  if (isPushed(current) || isProtected(current.branch)) {
    const ask: Confirm = isPushed(current)
      ? { action: 'amend', question: 'Amend a pushed commit? Pushing it again needs a force push.', yes: 'Yes, amend' }
      : { action: 'amend', question: `Amend the last commit on ${current.branch}?`, yes: 'Yes, amend' }
    if (!(await confirmed($, ask))) return
  }

  const args = text === '' ? ['commit', '--amend', '--no-edit'] : ['commit', '--amend', '-m', text]
  await commitWith($, 'Amending', args, 'Amended')
}

export async function push($: $) {
  const current = await read($, repoState)

  if (current.remote === '') return fail($, new Error('No remote to push to.'))
  if (isProtected(current.branch)) {
    const ask: Confirm = { action: 'push', question: `Push straight to ${current.branch}?`, yes: 'Yes, push' }
    if (!(await confirmed($, ask))) return
  }

  await update($, confirmState, () => null)
  await run($, 'Pushing', async () => {
    await gitOk($, pushArgs(current))
    $.ui.toast(`Pushed ${current.branch} to ${current.remote}`)
  })
}

export async function pull($: $) {
  const current = await read($, repoState)
  if (current.remote === '') return fail($, new Error('No remote to pull from.'))

  await run($, 'Pulling', async () => {
    const ran = await gitOk($, pullArgs(current))
    $.ui.toast(ran.stdout.split('\n')[0] || 'Pulled')
    await refreshDir($)
  })
}

export async function fetchRemote($: $) {
  const { remote } = await read($, repoState)
  if (remote === '') return fail($, new Error('No remote to fetch from.'))

  await run($, 'Fetching', async () => {
    await gitOk($, ['fetch', remote])
    $.ui.toast(`Fetched ${remote}`)
  })
}

// The fetch timer's tick: a quiet fetch while the pane is on screen, so ↑↓
// stays current. It never shows errors, since nobody asked for it.
export async function autoFetch($: $) {
  const panes = await $.ui.panes().catch(() => [])
  const current = await read($, repoState)
  const isShown = panes.some(pane => pane.id === PANE && pane.isShown)

  if (!isShown || !current.isRepo || current.remote === '') return
  if ((await read($, busyState)) !== null) return

  const ran = await git($, ['fetch', '--quiet', current.remote], { cwd: current.root }).catch(() => null)
  if (ran !== null && ran.exitCode === 0) await refreshRepo($)
}

// Runs in the session's folder, since there is no repo root to run from yet.
export function initRepo($: $) {
  return run($, 'Initializing', async () => {
    const ran = await git($, ['init', '-b', 'main'])
    if (ran.exitCode !== 0) throw new Error(shortError(ran.stderr, ran.stdout))
    $.ui.toast('Initialized an empty git repository')
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
