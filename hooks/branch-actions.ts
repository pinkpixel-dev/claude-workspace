// What the Branches view's buttons do: new, rename and delete. Switching
// lives with the other Source Control actions in git-actions.ts.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { GitView } from '../types'
import { shortError } from './git'
import { fail, git, gitOk, run } from './repo'
import { EMPTY_REPO } from './state'

const branchFormState = atom({ plugin: 'workspace', key: 'branchForm' } as const, null)
const confirmState = atom({ plugin: 'workspace', key: 'confirm' } as const, null)
const gitViewState = atom({ plugin: 'workspace', key: 'gitView' } as const, 'changes')
const repoState = atom({ plugin: 'workspace', key: 'repo' } as const, EMPTY_REPO)

type $ = EngineInterface

export function showView($: $, view: GitView) {
  return update($, gitViewState, () => view)
}

export function startNewBranch($: $) {
  return update($, branchFormState, () => ({ kind: 'new' as const, text: '' }))
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
      await gitOk($, ['switch', '-c', name])
      $.ui.toast(`Switched to new branch ${name}`)
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
