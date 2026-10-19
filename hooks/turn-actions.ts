// What the This Turn tab and the "send to Claude" chips do: keeping a copy of
// each file before Claude's first edit to it, showing and undoing that change,
// drafting commit messages, and asking Claude about a file.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Confirm } from '../types'
import { refreshDir, reloadFile } from './actions'
import { lineDiff } from './diff'
import { limitDiff } from './git'
import { confirmed, fail, git, gitOk, run } from './repo'
import { EMPTY_REPO } from './state'
import { modelName } from './stats'
import { askText } from './tree'

const activityState = atom({ plugin: 'workspace', key: 'activity' } as const, [])
const messageState = atom({ plugin: 'workspace', key: 'message' } as const, '')
const repoState = atom({ plugin: 'workspace', key: 'repo' } as const, EMPTY_REPO)
const snapshotsState = atom({ plugin: 'workspace', key: 'snapshots' } as const, [])
const statsState = atom({ plugin: 'workspace', key: 'stats' } as const, {})
const turnDiffState = atom({ plugin: 'workspace', key: 'turnDiff' } as const, null)

type $ = EngineInterface

const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1)

// The file as text, or null when it's gone or binary.
function readText($: $, path: string) {
  return $.fs.read(path).then(text => (typeof text === 'string' ? text : null), () => null)
}

// Called after a successful Edit or Write: the first one this turn sets the
// file's `before`, and every one updates how many lines changed since.
export async function keepSnapshot($: $, path: string, result: unknown) {
  const done = (result ?? {}) as { type?: unknown; originalFile?: unknown }
  const list = await read($, snapshotsState)
  const kept = list.find(one => one.path === path)
  const isNew = kept?.isNew ?? done.type === 'create'
  const before = kept !== undefined ? kept.before : typeof done.originalFile === 'string' ? done.originalFile : null
  const now = await readText($, path)
  const counts = now === null || (before === null && !isNew) ? { added: 0, removed: 0 } : lineDiff(path, isNew ? null : before, now)
  const snapshot = { path, before, isNew, added: counts.added, removed: counts.removed }

  await update($, snapshotsState, current => [...current.filter(one => one.path !== path), snapshot])
}

// A new prompt starts a fresh turn: the copies of the last one go.
export async function clearTurn($: $) {
  await update($, snapshotsState, () => [])
  await update($, turnDiffState, () => null)
}

export async function showTurnDiff($: $, path: string) {
  const snapshot = (await read($, snapshotsState)).find(one => one.path === path)
  if (snapshot === undefined || (snapshot.before === null && !snapshot.isNew)) {
    return fail($, new Error(`No copy of ${nameOf(path)} from before the edit, so there's no diff to show.`))
  }

  const now = (await readText($, path)) ?? ''
  const diff = lineDiff(path, snapshot.isNew ? null : snapshot.before, now)
  await update($, turnDiffState, () => ({ path, ...diff }))
}

export function closeTurnDiff($: $) {
  return update($, turnDiffState, () => null)
}

// Puts the file back the way it was before Claude's first edit this turn;
// a file Claude created gets deleted. Asks first either way.
export async function revertTurn($: $, path: string) {
  const snapshot = (await read($, snapshotsState)).find(one => one.path === path)
  if (snapshot === undefined || (snapshot.before === null && !snapshot.isNew)) return

  const name = nameOf(path)
  const ask: Confirm = snapshot.isNew
    ? { action: 'revert-turn', path, question: `Delete ${name}? Claude created it this turn.`, yes: 'Yes, delete' }
    : { action: 'revert-turn', path, question: `Undo Claude's changes to ${name} from this turn?`, yes: 'Yes, undo' }
  if (!(await confirmed($, ask))) return

  await run($, 'Reverting', async () => {
    if (snapshot.isNew) {
      // The fs API can't delete, so a created file goes the way Discard deletes untracked ones.
      const ran = await git($, ['clean', '-f', '-x', '-q', '--', path])
      if (ran.exitCode !== 0) throw new Error(`Couldn't delete ${name}. Deleting needs a git repository.`)
    } else {
      await $.fs.write(path, snapshot.before ?? '')
    }
    await update($, snapshotsState, list => list.filter(one => one.path !== path))
    await update($, activityState, list => list.filter(one => one.path !== path))
    await update($, turnDiffState, shown => (shown?.path === path ? null : shown))
    $.ui.toast(snapshot.isNew ? `Deleted ${name}` : `Reverted ${name}`)
    await reloadFile($)
    await refreshDir($)
  })
}

// Inserts a request at the cursor, so it joins whatever was already typed.
export async function askClaude($: $, verb: string, path: string) {
  const box = await $.prompt.read()
  const filled = await $.prompt.fill({ text: askText(verb, path, box.text.slice(0, box.cursor)), mode: 'insert' })
  if (!filled.isFilled) $.ui.toast("Couldn't add that to the prompt right now.")
}

const MESSAGE_RULES = [
  'Write a git commit message for the staged diff.',
  'Use Conventional Commits: `type(scope): subject`, where scope is optional, the subject is imperative,',
  'lowercase after the colon, under 72 characters, with no period.',
  'When the change has more than one part, add a blank line and a few short "- " bullets.',
  'Match the style of the recent subjects. Reply with the message only: no code fences, no trailers.',
].join(' ')

const MESSAGE_DIFF_LIMIT = 30000

const stripFences = (text: string) => text.trim().replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()

// Asks a small model for a message from the staged diff and fills the commit box with it.
export function draftMessage($: $) {
  return run($, 'Writing message', async () => {
    const staged = await gitOk($, ['diff', '--cached'])
    if (staged.stdout.trim() === '') throw new Error('Nothing staged. Stage some changes first.')

    const recent = (await read($, repoState)).commits.slice(0, 10).map(one => one.subject)
    const reply = await $.model.complete({
      model: 'haiku',
      system: MESSAGE_RULES,
      prompt: `Recent subjects:\n${recent.join('\n') || '(none yet)'}\n\nStaged diff:\n${limitDiff(staged.stdout, MESSAGE_DIFF_LIMIT)}`,
      maxTokens: 500,
      effort: 'low',
      timeoutMs: 60000,
    })
    if (!reply.isAnswered) throw new Error(`Couldn't write a message (${reply.reason}).`)

    const model = (await read($, statsState)).model ?? (await $.session.model().catch(() => ''))
    const name = modelName(model)
    const author = name.startsWith('claude') || name === '' ? 'Claude' : `Claude ${name}`
    await update($, messageState, () => `${stripFences(reply.text)}\n\nCo-Authored-By: ${author} <noreply@anthropic.com>`)
  })
}
