// What the Branches view's buttons do: new (from where you are or another
// ref), rename, delete, and checking out or deleting a remote branch.
// Switching lives with the other Source Control actions in git-actions.ts.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Confirm, GitView } from '../types'
import { closeFile, refreshDir } from './actions'
import { shortError, splitRemoteRef } from './git'
import { confirmed, fail, git, gitOk, run } from './repo'
import { EMPTY_REPO } from './state'

const branchFormState = atom({ plugin: 'workspace', key: 'branchForm' } as const, null)
const confirmState = atom({ plugin: 'workspace', key: 'confirm' } as const, null)
const gitViewState = atom({ plugin: 'workspace', key: 'gitView' } as const, 'changes')
const isEditingState = atom({ plugin: 'workspace', key: 'isEditing' } as const, false)
const repoState = atom({ plugin: 'workspace', key: 'repo' } as const, EMPTY_REPO)

type $ = EngineInterface

export function showView($: $, view: GitView) {
  return update($, gitViewState, () => view)
}

// `base` starts the box on another ref, like a commit picked in History.
export function startNewBranch($: $, base?: string) {
  return update($, branchFormState, () => ({ kind: 'new' as const, base, text: '' }))
}

// History's Branch button: opens the form in Branches, starting from that commit.
export async function branchFromCommit($: $, sha: string) {
  await startNewBranch($, sha)
  await showView($, 'branches')
}

export function setBranchBase($: $, base: string) {
  return update($, branchFormState, current => (current === null ? null : { ...current, base }))
}

export function startRename($: $, name: string) {
  return update($, branchFormState, () => ({ kind: 'rename' as const, from: name, text: name }))
}

export function setBranchName($: $, text: string) {
  return update($, branchFormState, current => (current === null ? null : { ...current, text }))
}

export function cancelBranchForm($: $) {
  return update($, branchFormState, () => null)
}

// Creates the branch from where you are and switches to it, or renames one.
// The box stays open with what you typed if git refuses the name.
export async function saveBranchForm($: $) {
  const form = await read($, branchFormState)
  if (form === null) return

  const name = form.text.trim()
  if (name === '') return fail($, new Error('Type a branch name first.'))
  if (form.kind === 'rename' && name === form.from) return cancelBranchForm($)

  await run($, form.kind === 'new' ? 'Creating' : 'Renaming', async () => {
    if (form.kind === 'new') {
      await gitOk($, ['switch', '-c', name, ...(form.base === undefined ? [] : [form.base])])
      $.ui.toast(form.base === undefined ? `Switched to new branch ${name}` : `Switched to new branch ${name} from ${form.base}`)
    } else {
      await gitOk($, ['branch', '-m', form.from ?? '', name])
      $.ui.toast(`Renamed ${form.from} to ${name}`)
    }
    await cancelBranchForm($)
  })
}

// Tries the safe delete first. Only when git says the branch has unmerged
// commits does the pane offer the force delete, behind a confirm.
export function deleteBranch($: $, name: string) {
  return run($, 'Deleting', async () => {
    const { root } = await read($, repoState)
    const ran = await git($, ['branch', '-d', name], { cwd: root })

    if (ran.exitCode === 0) {
      $.ui.toast(`Deleted ${name}`)
      return
    }
    if (!/not fully merged/.test(ran.stderr)) throw new Error(shortError(ran.stderr, ran.stdout))

    await update($, confirmState, () => ({
      action: 'force-delete' as const,
      path: name,
      question: `${name} has unmerged commits. Force delete it and lose them?`,
      yes: 'Force delete',
    }))
  })
}

export async function forceDeleteBranch($: $, name: string) {
  await update($, confirmState, () => null)
  await run($, 'Deleting', async () => {
    await gitOk($, ['branch', '-D', name])
    $.ui.toast(`Deleted ${name}`)
  })
}

// Makes a local branch that tracks `ref` (like origin/feature) and switches to it.
export function checkoutRemote($: $, ref: string) {
  return run($, 'Checking out', async () => {
    await gitOk($, ['switch', '--track', ref])
    $.ui.toast(`Switched to ${ref.slice(ref.indexOf('/') + 1)}, tracking ${ref}`)
    if (!(await read($, isEditingState))) await closeFile($)
    await refreshDir($)
  })
}

// Deletes the branch on the remote itself, so it always asks first.
export async function deleteRemoteBranch($: $, ref: string) {
  const { remotes } = await read($, repoState)
  const split = splitRemoteRef(ref, remotes)
  if (split === null) return fail($, new Error(`${ref} isn't on a known remote.`))

  const ask: Confirm = {
    action: 'delete-remote-branch',
    path: ref,
    question: `Delete ${split.name} on ${split.remote}? Anyone else using it loses it too.`,
    yes: 'Yes, delete',
  }
  if (!(await confirmed($, ask))) return

  await run($, 'Deleting', async () => {
    await gitOk($, ['push', split.remote, '--delete', split.name])
    $.ui.toast(`Deleted ${ref}`)
  })
}
