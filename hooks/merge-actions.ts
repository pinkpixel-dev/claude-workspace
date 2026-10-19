// Merge, rebase, and everything for finishing one: the banner's Continue and
// Abort, and the Merge Changes rows' Ours, Theirs, Resolved and open.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Change, Confirm } from '../types'
import { openPath, refreshDir, reloadFile } from './actions'
import { hasConflictMarkers, isConflicted, isProtected, operationArgs } from './git'
import { confirmed, fail, failedStep, git, gitOk, run } from './repo'
import { EMPTY_REPO } from './state'

const mergeSourceState = atom({ plugin: 'workspace', key: 'mergeSource' } as const, '')
const repoState = atom({ plugin: 'workspace', key: 'repo' } as const, EMPTY_REPO)
const tabState = atom({ plugin: 'workspace', key: 'tab' } as const, 'files')

type $ = EngineInterface

// No editor can open from the pane, so steps that would ask for a message keep git's.
const NO_EDITOR = { env: { GIT_EDITOR: 'true' } }

export function setMergeSource($: $, name: string) {
  return update($, mergeSourceState, () => name)
}

export async function merge($: $, source: string) {
  const current = await read($, repoState)
  if (source === '') return fail($, new Error('Pick a branch to merge first.'))
  if (isProtected(current.branch)) {
    const ask: Confirm = { action: 'merge', path: source, question: `Merge ${source} into ${current.branch}?`, yes: 'Yes, merge' }
    if (!(await confirmed($, ask))) return
  }

  await run($, 'Merging', async () => {
    const ran = await git($, ['merge', '--no-edit', source], { ...NO_EDITOR, cwd: current.root })
    if (ran.exitCode !== 0) await failedStep($, 'Merge', ran)

    $.ui.toast(ran.stdout.split('\n')[0] || `Merged ${source}`)
    await reloadFile($)
    await refreshDir($)
  })
}

// Replays your branch's commits on top of `onto`, which rewrites them, so it always asks.
export async function rebase($: $, onto: string) {
  const current = await read($, repoState)
  if (onto === '') return fail($, new Error('Pick a branch to rebase onto first.'))

  const ask: Confirm = {
    action: 'rebase',
    path: onto,
    question: current.upstream !== undefined
      ? `Rebase ${current.branch} onto ${onto}? This rewrites its commits, and pushing after needs a force push.`
      : `Rebase ${current.branch} onto ${onto}? This rewrites its commits.`,
    yes: 'Yes, rebase',
  }
  if (!(await confirmed($, ask))) return

  await run($, 'Rebasing', async () => {
    const ran = await git($, ['rebase', onto], { ...NO_EDITOR, cwd: current.root })
    if (ran.exitCode !== 0) await failedStep($, 'Rebase', ran)

    $.ui.toast(`Rebased ${current.branch} onto ${onto}`)
    await reloadFile($)
    await refreshDir($)
  })
}

export async function continueOperation($: $) {
  const current = await read($, repoState)
  const { operation } = current
  if (operation === null) return
  if (current.changes.some(isConflicted)) return fail($, new Error('Resolve every conflict first.'))

  await run($, 'Continuing', async () => {
    // A rebase can stop again on the next commit; that lands back in Merge Changes.
    const ran = await git($, operationArgs(operation, 'continue'), { ...NO_EDITOR, cwd: current.root })
    const label = `${operation.charAt(0).toUpperCase()}${operation.slice(1)}`
    if (ran.exitCode !== 0) await failedStep($, label, ran)

    $.ui.toast(`Finished the ${operation}`)
    await reloadFile($)
    await refreshDir($)
  })
}

export async function abortOperation($: $) {
  const { operation } = await read($, repoState)
  if (operation === null) return

  const ask: Confirm = {
    action: 'abort',
    question: `Abort the ${operation}? Everything goes back to how it was, and any conflicts you resolved are lost.`,
    yes: 'Yes, abort',
  }
  if (!(await confirmed($, ask))) return

  await run($, 'Aborting', async () => {
    await gitOk($, operationArgs(operation, 'abort'))
    $.ui.toast(`Aborted the ${operation}`)
    await reloadFile($)
    await refreshDir($)
  })
}

// Keeps one side's whole file. When that side deleted it, the file goes.
export function takeSide($: $, change: Change, side: 'ours' | 'theirs') {
  return run($, 'Resolving', async () => {
    const { root } = await read($, repoState)
    const picked = await git($, ['checkout', `--${side}`, '--', change.path], { cwd: root })

    if (picked.exitCode === 0) await gitOk($, ['add', '--', change.path])
    else if (/does not have (our|their) version/.test(picked.stderr)) await gitOk($, ['rm', '-q', '--', change.path])
    else throw new Error(picked.stderr.trim() || `Couldn't take ${side} for ${change.path}`)

    await reloadFile($)
  })
}

// Stages the file as resolved, asking first if it still has conflict markers.
export async function markResolved($: $, change: Change) {
  const { root } = await read($, repoState)
  const text = await $.fs.read(`${root}/${change.path}`).catch(() => '')

  if (hasConflictMarkers(text)) {
    const name = change.path.slice(change.path.lastIndexOf('/') + 1)
    const ask: Confirm = {
      action: 'resolve',
      path: change.path,
      question: `${name} still has conflict markers. Mark it resolved anyway?`,
      yes: 'Yes, resolved',
    }
    if (!(await confirmed($, ask))) return
  }

  await run($, 'Resolving', async () => {
    await gitOk($, ['add', '--', change.path])
  })
}

// Opens the conflicted file in the Files tab to fix it by hand.
export async function openConflict($: $, change: Change) {
  const { root } = await read($, repoState)
  await update($, tabState, () => 'files' as const)
  await openPath($, `${root}/${change.path}`)
}
