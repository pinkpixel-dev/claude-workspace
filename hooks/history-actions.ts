// What the History and Stash views' buttons do, plus the Stash button in Changes.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Commit, Confirm, Stash } from '../types'
import { refreshDir, reloadFile } from './actions'
import { limitDiff, shortError } from './git'
import { confirmed, fail, failedStep, git, gitOk, refreshRepo, run } from './repo'
import { EMPTY_REPO, HISTORY_PAGE } from './state'

const commitDiffState = atom({ plugin: 'workspace', key: 'commitDiff' } as const, null)
const historyLimitState = atom({ plugin: 'workspace', key: 'historyLimit' } as const, HISTORY_PAGE)
const messageState = atom({ plugin: 'workspace', key: 'message' } as const, '')
const repoState = atom({ plugin: 'workspace', key: 'repo' } as const, EMPTY_REPO)

type $ = EngineInterface

// History

export async function showCommit($: $, commit: Commit) {
  const { root } = await read($, repoState)
  // An empty format leaves just the patch, which the Code element draws as a diff.
  const ran = await git($, ['show', '--format=', '--patch', commit.sha], { cwd: root })
  if (ran.exitCode !== 0) return fail($, new Error(shortError(ran.stderr, ran.stdout)))

  await update($, commitDiffState, () => ({ commit, text: limitDiff(ran.stdout) }))
}

export function closeCommit($: $) {
  return update($, commitDiffState, () => null)
}

export async function loadMore($: $) {
  await update($, historyLimitState, limit => limit + HISTORY_PAGE)
  await refreshRepo($)
}

// Makes a new commit that undoes `commit`. A conflict leaves the revert
// waiting in Merge Changes, like a merge does.
export async function revert($: $, commit: Commit) {
  const ask: Confirm = {
    action: 'revert',
    path: commit.sha,
    question: `Revert "${commit.subject}"? This makes a new commit that undoes it.`,
    yes: 'Yes, revert',
  }
  if (!(await confirmed($, ask))) return

  await run($, 'Reverting', async () => {
    const { root } = await read($, repoState)
    const ran = await git($, ['revert', '--no-edit', commit.sha], { cwd: root })

    if (ran.exitCode !== 0) await failedStep($, 'Revert', ran)

    $.ui.toast(`Reverted ${commit.short}`)
    await reloadFile($)
    await refreshDir($)
  })
}

// Stash

// Untracked files go in too. A typed commit message names the stash.
export async function stashChanges($: $) {
  const text = (await read($, messageState)).trim()
  if ((await read($, repoState)).changes.length === 0) return fail($, new Error('Nothing to stash.'))

  await run($, 'Stashing', async () => {
    await gitOk($, ['stash', 'push', '-u', ...(text === '' ? [] : ['-m', text])])
    await update($, messageState, () => '')
    $.ui.toast('Stashed your changes')
    await reloadFile($)
    await refreshDir($)
  })
}

// Pop drops the stash once it applies; on a conflict git keeps it either way.
export function applyStash($: $, stash: Stash, isPop: boolean) {
  return run($, isPop ? 'Popping' : 'Applying', async () => {
    await gitOk($, ['stash', isPop ? 'pop' : 'apply', stash.ref])
    $.ui.toast(`${isPop ? 'Popped' : 'Applied'} ${stash.ref}`)
    await reloadFile($)
    await refreshDir($)
  })
}

export async function dropStash($: $, stash: Stash) {
  const ask: Confirm = {
    action: 'drop-stash',
    path: stash.ref,
    question: `Drop ${stash.ref}? Its changes are gone for good.`,
    yes: 'Yes, drop',
  }
  if (!(await confirmed($, ask))) return

  await run($, 'Dropping', async () => {
    await gitOk($, ['stash', 'drop', stash.ref])
    $.ui.toast(`Dropped ${stash.ref}`)
  })
}
