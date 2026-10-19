// What the GitHub tab's buttons do: reading pull requests and issues through
// the GitHub CLI, and handing a reference to the prompt box.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { GhItem, GithubView } from '../types'
import {
  ghError,
  ISSUE_LIST_FIELDS,
  ISSUE_VIEW_FIELDS,
  LIST_LIMIT,
  parseDetail,
  parseItems,
  PR_LIST_FIELDS,
  PR_VIEW_FIELDS,
  referenceText,
} from './github'
import { EMPTY_GITHUB, EMPTY_REPO } from './state'

const ghDetailState = atom({ plugin: 'workspace', key: 'ghDetail' } as const, null)
const githubState = atom({ plugin: 'workspace', key: 'github' } as const, EMPTY_GITHUB)
const githubViewState = atom({ plugin: 'workspace', key: 'githubView' } as const, 'pulls')
const repoState = atom({ plugin: 'workspace', key: 'repo' } as const, EMPTY_REPO)

type $ = EngineInterface

// Runs gh in the repo with its prompts off, so a missing login fails instead of waiting.
async function gh($: $, args: string[]) {
  const { root } = await read($, repoState)
  const ran = await $.process
    .run(['gh', ...args], {
      ...(root ? { cwd: root } : {}),
      timeoutMs: 30000,
      env: { GH_PROMPT_DISABLED: '1', NO_COLOR: '1' },
    })
    .catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(`Couldn't run gh (${reason}). Is the GitHub CLI installed?`)
    })
  if (ran.exitCode !== 0) throw new Error(ghError(ran.stderr, ran.stdout))

  return ran.stdout
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

export async function refreshGithub($: $) {
  if ((await read($, githubState)).isLoading) return

  await update($, githubState, current => ({ ...current, isLoading: true, error: '' }))
  try {
    const repo = (await gh($, ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'])).trim()
    const limit = String(LIST_LIMIT)
    const [pulls, issues] = await Promise.all([
      gh($, ['pr', 'list', '--state', 'open', '--limit', limit, '--json', PR_LIST_FIELDS]),
      gh($, ['issue', 'list', '--state', 'open', '--limit', limit, '--json', ISSUE_LIST_FIELDS]),
    ])
    const now = await $.clock.now()
    await update($, githubState, () => ({
      isLoading: false,
      error: '',
      repo,
      pulls: parseItems(pulls, 'pr', now),
      issues: parseItems(issues, 'issue', now),
    }))
  } catch (error) {
    await update($, githubState, current => ({ ...current, isLoading: false, error: message(error) }))
  }
}

export function showGithubView($: $, view: GithubView) {
  return update($, githubViewState, () => view)
}

export async function showItem($: $, item: GhItem) {
  await update($, githubState, current => ({ ...current, isLoading: true, error: '' }))
  try {
    const out = item.kind === 'pr'
      ? await gh($, ['pr', 'view', String(item.number), '--json', PR_VIEW_FIELDS])
      : await gh($, ['issue', 'view', String(item.number), '--json', ISSUE_VIEW_FIELDS])
    const now = await $.clock.now()
    await update($, ghDetailState, () => parseDetail(out, item, now))
    await update($, githubState, current => ({ ...current, isLoading: false }))
  } catch (error) {
    await update($, githubState, current => ({ ...current, isLoading: false, error: message(error) }))
  }
}

export function closeItem($: $) {
  return update($, ghDetailState, () => null)
}

// Puts a short reference to the item in the prompt box at the cursor.
export async function mentionItem($: $, item: GhItem) {
  const box = await $.prompt.read()
  const filled = await $.prompt.fill({ text: referenceText(item, box.text.slice(0, box.cursor)), mode: 'insert' })
  if (!filled.isFilled) $.ui.toast(`Couldn't add #${item.number} to the prompt right now.`)
}
