// What the History and Stash views' buttons do, plus the Stash button in Changes.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Commit, Confirm, Stash } from '../types'
import { refreshDir, reloadFile } from './actions'
import { isPushed, isStaged, limitDiff, shortError } from './git'
import { confirmed, fail, failedStep, git, gitOk, refreshRepo, run } from './repo'
import { EMPTY_REPO, HISTORY_PAGE } from './state'

const commitDiffState = atom({ plugin: 'workspace', key: 'commitDiff' } as const, null)
const hasImagesState = atom({ plugin: 'workspace', key: 'hasImages' } as const, false)
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

    if (ran.exitCode !== 0) {
      // A stop on conflicts rewrote files, so pick that up before saying so.
      await reloadFile($)
      await refreshDir($)
      await failedStep($, 'Revert', ran)
    }

    $.ui.toast(`Reverted ${commit.short}`)
    await reloadFile($)
    await refreshDir($)
  })
}

// Takes HEAD back off the branch and leaves its changes staged, with its
// message back in the box if that's empty. Asks once the commit is pushed.
export async function undoCommit($: $) {
  const current = await read($, repoState)
  const head = current.commits[0]
  if (head === undefined) return fail($, new Error('No commit to undo.'))
  if (current.operation !== null) return fail($, new Error('Finish or abort the operation in progress first.'))
  if (isPushed(current)) {
    const ask: Confirm = {
      action: 'undo-commit',
      path: head.sha,
      question: `Undo "${head.subject}"? It's pushed already, so pushing after needs a force push.`,
      yes: 'Yes, undo',
    }
    if (!(await confirmed($, ask))) return
  }

  await run($, 'Undoing', async () => {
    const message = await gitOk($, ['log', '-1', '--format=%B', head.sha])
    // A first commit has no parent to reset to, so the branch ref goes instead.
    await gitOk($, head.parents.length === 0 ? ['update-ref', '-d', 'HEAD'] : ['reset', '--soft', 'HEAD~1'])
    await update($, messageState, text => (text.trim() === '' ? message.stdout.trim() : text))
    $.ui.toast(`Undid ${head.short}. Its changes are staged.`)
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

// Only what's staged goes in; the rest stays in the working tree.
export async function stashStaged($: $) {
  const text = (await read($, messageState)).trim()
  if (!(await read($, repoState)).changes.some(isStaged)) return fail($, new Error('Nothing staged to stash.'))

  await run($, 'Stashing', async () => {
    await gitOk($, ['stash', 'push', '--staged', ...(text === '' ? [] : ['-m', text])])
    await update($, messageState, () => '')
    $.ui.toast('Stashed your staged changes')
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

export async function dropAllStashes($: $) {
  const { stashes } = await read($, repoState)
  if (stashes.length === 0) return

  const count = stashes.length === 1 ? 'the 1 stash' : `all ${stashes.length} stashes`
  const ask: Confirm = { action: 'drop-all-stashes', question: `Drop ${count}? They're gone for good.`, yes: 'Yes, drop all' }
  if (!(await confirmed($, ask))) return

  await run($, 'Dropping', async () => {
    await gitOk($, ['stash', 'clear'])
    $.ui.toast('Dropped every stash')
  })
}

// Graph

// Terminals that draw kitty-protocol pictures. CLAUDE_WORKSPACE_GRAPH set to
// `image` or `text` overrides the guess, for a terminal it gets wrong.
export async function detectImages($: $) {
  const lower = (value: string | undefined) => (value ?? '').toLowerCase()
  const quiet = () => undefined
  const [forced, term, program, kitty] = (await Promise.all([
    $.env.get('CLAUDE_WORKSPACE_GRAPH').catch(quiet),
    $.env.get('TERM').catch(quiet),
    $.env.get('TERM_PROGRAM').catch(quiet),
    $.env.get('KITTY_WINDOW_ID').catch(quiet),
  ])).map(lower)
  const guess = term === 'xterm-kitty' || term === 'xterm-ghostty' || program === 'ghostty' || kitty !== ''
  const hasImages = forced === 'image' ? true : forced === 'text' ? false : guess

  await update($, hasImagesState, () => hasImages)
}
