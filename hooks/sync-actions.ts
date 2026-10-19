// The sync card's second row: Pull (rebase), Sync, Fetch all and Force push.
// Plain Fetch, Pull and Push live in git-actions.ts.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Confirm } from '../types'
import { refreshDir, reloadFile } from './actions'
import { forcePushArgs, isProtected, pullArgs, pushArgs } from './git'
import { confirmed, fail, failedStep, git, gitOk, run } from './repo'
import { EMPTY_REPO } from './state'

const repoState = atom({ plugin: 'workspace', key: 'repo' } as const, EMPTY_REPO)
const syncMoreState = atom({ plugin: 'workspace', key: 'syncMore' } as const, false)

type $ = EngineInterface

// No editor can open from the pane, so a rebase keeps git's messages.
const NO_EDITOR = { env: { GIT_EDITOR: 'true' } }

export function toggleSyncMore($: $) {
  return update($, syncMoreState, isOpen => !isOpen)
}

// Replays your local commits on top of what you pull. A conflict leaves the
// rebase waiting in Merge Changes.
export async function pullRebase($: $) {
  const current = await read($, repoState)
  if (current.remote === '') return fail($, new Error('No remote to pull from.'))

  await run($, 'Pulling', async () => {
    const ran = await git($, pullArgs(current, true), { ...NO_EDITOR, cwd: current.root })
    await reloadFile($)
    await refreshDir($)
    if (ran.exitCode !== 0) await failedStep($, 'Pull (rebase)', ran)

    $.ui.toast(`Pulled ${current.branch} with rebase`)
  })
}

// Pull, then push: VS Code's Sync. Pushing to main or master still asks.
export async function syncBranch($: $) {
  const current = await read($, repoState)
  if (current.remote === '') return fail($, new Error('No remote to sync with.'))
  if (isProtected(current.branch)) {
    const ask: Confirm = { action: 'sync', question: `Sync ${current.branch}? This pushes straight to it.`, yes: 'Yes, sync' }
    if (!(await confirmed($, ask))) return
  }

  await run($, 'Syncing', async () => {
    if (current.upstream !== undefined) {
      const ran = await git($, pullArgs(current), { ...NO_EDITOR, cwd: current.root })
      await reloadFile($)
      await refreshDir($)
      if (ran.exitCode !== 0) await failedStep($, 'Sync', ran)
    }
    await gitOk($, pushArgs(current))
    $.ui.toast(`Synced ${current.branch} with ${current.remote}`)
  })
}

// Every remote, and drops remote branches that were deleted on the server.
export function fetchAll($: $) {
  return run($, 'Fetching', async () => {
    await gitOk($, ['fetch', '--all', '--prune'])
    $.ui.toast('Fetched all remotes')
  })
}

// Overwrites the remote branch with yours. `--force-with-lease` refuses when
// someone else pushed since your last fetch, but it always asks first.
export async function forcePush($: $) {
  const current = await read($, repoState)
  if (current.remote === '') return fail($, new Error('No remote to push to.'))

  const ask: Confirm = {
    action: 'force-push',
    question: `Force push ${current.branch} to ${current.remote}? Commits only on the remote are replaced.`,
    yes: 'Force push',
  }
  if (!(await confirmed($, ask))) return

  await run($, 'Pushing', async () => {
    await gitOk($, forcePushArgs(current))
    $.ui.toast(`Force pushed ${current.branch} to ${current.remote}`)
  })
}
