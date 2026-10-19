import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Change, Repo } from '../types'
import {
  amend,
  commit,
  commitAll,
  discard,
  discardAll,
  fetchRemote,
  flash,
  initRepo,
  pull,
  push,
  setMessage,
  stage,
  stageAll,
  switchBranch,
  unstage,
} from './git-actions'
import { showView } from './branch-actions'
import { drawBranches } from './branches-view'
import { drawDiff } from './diff-view'
import { closeCommit, stashChanges } from './history-actions'
import { drawHistory } from './history-view'
import { drawStash } from './stash-view'
import { badge, bar, card, chip, divider, panel, sectionHeader, segments } from './controls'
import { colorOf, isConflicted, isStaged, isUnstaged, isUntracked, letterOf } from './git'
import { drawConflicts, drawOperationBanner } from './merge-view'
import { drawStatus } from './confirm-view'
import { draftMessage } from './turn-actions'
import { refreshRepo, selectRemote, showDiff } from './repo'
import { EMPTY_REPO } from './state'
import { fileIcon } from './icons'
import { C, tint } from './theme'
import type { UI } from './ui'

const busyState = atom({ plugin: 'workspace', key: 'busy' } as const, null)
const commitDiffState = atom({ plugin: 'workspace', key: 'commitDiff' } as const, null)
const flashState = atom({ plugin: 'workspace', key: 'flash' } as const, null)
const foldedState = atom({ plugin: 'workspace', key: 'folded' } as const, [])
const diffState = atom({ plugin: 'workspace', key: 'diff' } as const, null)
const gitViewState = atom({ plugin: 'workspace', key: 'gitView' } as const, 'changes')
const messageState = atom({ plugin: 'workspace', key: 'message' } as const, '')
const noticeState = atom({ plugin: 'workspace', key: 'notice' } as const, null)
const repoState = atom({ plugin: 'workspace', key: 'repo' } as const, EMPTY_REPO)

type $ = EngineInterface

function drawRow($: $, ui: UI, change: Change, staged: boolean, flashed: string | null) {
  const { Box, Button, Text } = ui
  const letter = letterOf(staged ? change.index : change.work)
  const group = staged ? 'staged' : 'work'
  const cut = change.path.lastIndexOf('/')
  const name = change.path.slice(cut + 1)
  const folder = cut < 0 ? '' : change.path.slice(0, cut)
  const tone = colorOf(letter)
  const isLit = flashed === `${group}:${change.path}`

  return (
    <Box
      key={`${group}:${change.path}`}
      justifyContent="space-between"
      gap={1}
      backgroundColor={isLit ? tint(tone, 0.2) : undefined}
      hover={{ backgroundColor: C.hover }}
    >
      <Box flexShrink={1} height={1} overflow="hidden">
        <Button key={`diff:${group}:${change.path}`} plain onPress={() => showDiff($, change, staged)}>
          <Text color={tone}>{`${fileIcon(name)} `}</Text>
          <Text color={C.text}>{name}</Text>
          <Text color={C.faint}>{folder ? `  ${folder}` : ''}</Text>
        </Button>
      </Box>
      <Box gap={1} flexShrink={0}>
        <Text color={tone} bold>{letter}</Text>
        {!staged && chip(ui, {
          key: `discard:${change.path}`,
          label: '↺',
          kind: 'row',
          onPress: () => discard($, change),
        })}
        {chip(ui, {
          key: `${staged ? 'unstage' : 'stage'}:${change.path}`,
          label: staged ? '−' : '+',
          kind: 'row',
          onPress: async () => {
            await (staged ? unstage($, change.path) : stage($, change.path))
            await flash($, `${staged ? 'work' : 'staged'}:${change.path}`)
          },
        })}
      </Box>
    </Box>
  )
}

function drawSection($: $, ui: UI, title: string, changes: Change[], staged: boolean, isOpen: boolean, flashed: string | null) {
  const { Box, Text } = ui
  const key = staged ? 'staged' : 'work'

  return (
    <Box key={`section:${title}`} flexDirection="column">
      {sectionHeader(ui, {
        key,
        title,
        count: changes.length,
        isOpen,
        onToggle: () => update($, foldedState, list => (list.includes(key) ? list.filter(one => one !== key) : [...list, key])),
        action: !staged && changes.length > 0 && chip(ui, {
          key: 'discard-all',
          label: 'Discard all',
          kind: 'quiet',
          onPress: () => discardAll($),
        }),
      })}
      {isOpen && changes.length === 0 && <Text color={C.faint}>{'  Working tree clean.'}</Text>}
      {isOpen && changes.map(change => drawRow($, ui, change, staged, flashed))}
    </Box>
  )
}

export async function drawGit($: $, ui: UI, width: number) {
  const { Box, Code, Select, Text } = ui
  const repo = await read($, repoState)

  if (!repo.isRepo) {
    const busy = await read($, busyState)
    const notice = await read($, noticeState)

    return (
      <Box flexDirection="column" gap={1}>
        <Text color={C.muted}>This folder isn't a git repository yet.</Text>
        <Box>
          {chip(ui, { key: 'init', label: 'Initialize Repository', kind: 'primary', onPress: () => initRepo($) })}
        </Box>
        {busy !== null && <Text color={C.busy}>{`${busy}...`}</Text>}
        {notice !== null && <Text color={notice.kind === 'error' ? C.deleted : C.added}>{notice.text}</Text>}
      </Box>
    )
  }

  const busy = await read($, busyState)
  const branchNames = repo.branches.some(one => one.name === repo.branch)
    ? repo.branches.map(one => one.name)
    : [repo.branch || 'HEAD', ...repo.branches.map(one => one.name)]

  // The confirm card, busy label and notice, drawn where each view wants them.
  const status = await drawStatus($, ui)

  const diff = await read($, diffState)
  if (diff !== null) {
    const change = repo.changes.find(one => one.path === diff.path)
    return drawDiff($, ui, diff, change !== undefined && isUntracked(change), status)
  }

  const shownCommit = await read($, commitDiffState)
  if (shownCommit !== null) {
    const { commit, text } = shownCommit

    return (
      <Box flexDirection="column" gap={1}>
        <Box gap={1}>
          {chip(ui, { key: 'commit-back', label: '‹ Back', onPress: () => closeCommit($), kind: 'quiet' })}
          <Text color={C.text} bold wrap="truncate-end">{commit.subject}</Text>
          <Text color={C.faint}>{commit.short}</Text>
        </Box>
        {text === ''
          ? <Text color={C.faint}>No text changes to show.</Text>
          : <Code source={text} format="diff" />}
      </Box>
    )
  }

  const view = await read($, gitViewState)
  return (
    <Box flexDirection="column" gap={1}>
      {card(ui, 'sync', [
        <Box key="sync-branch" justifyContent="space-between" gap={1} flexWrap="wrap">
          <Box gap={1}>
            <Text color={C.accent}>●</Text>
            <Select
              key="branch"
              value={repo.branch || 'HEAD'}
              options={branchNames.map(name => ({ value: name }))}
              onSelect={name => switchBranch($, name)}
            />
            {repo.remotes.length > 1 && (
              <Select
                key="remote"
                value={repo.remote}
                options={repo.remotes.map(name => ({ value: name }))}
                onSelect={name => selectRemote($, name)}
              />
            )}
          </Box>
          <Box gap={1}>
            <Text color={repo.ahead > 0 ? C.added : C.faint} bold={repo.ahead > 0}>{`↑ ${repo.ahead}`}</Text>
            <Text color={repo.behind > 0 ? C.modified : C.faint} bold={repo.behind > 0}>{`↓ ${repo.behind}`}</Text>
          </Box>
        </Box>,
        <Box key="sync-actions" gap={1} flexWrap="wrap">
          {syncChip(ui, 'fetch', 'Fetch', 'Fetching', busy, false, () => fetchRemote($))}
          {syncChip(ui, 'pull', 'Pull', 'Pulling', busy, repo.behind > 0, () => pull($))}
          {syncChip(ui, 'push', 'Push ↑', 'Pushing', busy, repo.ahead > 0 && repo.behind === 0, () => push($))}
          {chip(ui, { key: 'refresh', label: '↻', kind: 'quiet', onPress: () => refreshRepo($) })}
        </Box>,
      ], 1)}

      {drawOperationBanner($, ui, repo)}

      {segments(ui, [
        { key: 'view-changes', label: 'Changes', isActive: view === 'changes', onPress: () => showView($, 'changes') },
        { key: 'view-history', label: 'History', isActive: view === 'history', onPress: () => showView($, 'history') },
        { key: 'view-branches', label: `Branches ${repo.branches.length}`, isActive: view === 'branches', onPress: () => showView($, 'branches') },
        {
          key: 'view-stash',
          label: repo.stashes.length > 0 ? `Stash ${repo.stashes.length}` : 'Stash',
          isActive: view === 'stash',
          onPress: () => showView($, 'stash'),
        },
      ])}

      {view === 'history' && await drawHistory($, ui, repo, status)}
      {view === 'branches' && await drawBranches($, ui, repo, status)}
      {view === 'stash' && drawStash($, ui, repo, status)}
      {view === 'changes' && await drawChanges($, ui, repo, status, width)}
    </Box>
  )
}

// Fetch, Pull and Push: lit as the main action when it's the one to press,
// shown as running while its step runs, and inert while another one does.
function syncChip(ui: UI, key: string, label: string, running: string, busy: string | null, isMain: boolean, onPress: () => unknown) {
  const state = busy === null ? undefined : busy === running ? 'busy' : 'disabled'

  return chip(ui, { key, label: state === 'busy' ? running : label, kind: isMain ? 'primary' : 'secondary', state, onPress })
}

const SUMMARY = [
  { key: 'added', letters: ['A', 'U'], sign: '+', color: C.added },
  { key: 'modified', letters: ['M', 'T'], sign: '~', color: C.modified },
  { key: 'renamed', letters: ['R', 'C'], sign: '→', color: C.renamed },
  { key: 'deleted', letters: ['D'], sign: '−', color: C.deleted },
]

// Changed files by kind: a count per letter and a bar of how they split.
function drawSummary(ui: UI, changes: Change[], width: number) {
  const { Box, Text } = ui
  const letters = changes.map(one => letterOf(one.work !== ' ' ? one.work : one.index))
  const parts = SUMMARY.map(part => ({ ...part, count: letters.filter(one => part.letters.includes(one)).length }))
  const files = new Set(changes.map(one => one.path)).size

  return (
    <Box key="summary" justifyContent="space-between" gap={2}>
      <Box gap={1} flexShrink={0}>
        {badge(ui, 'files', files === 1 ? '1 file' : `${files} files`, C.muted)}
        {parts.filter(part => part.count > 0).map(part => (
          <Text key={`sum:${part.key}`} color={part.color}>{`${part.sign}${part.count}`}</Text>
        ))}
      </Box>
      {bar(ui, 'changes', parts, Math.min(24, Math.max(0, width - 24)))}
    </Box>
  )
}

async function drawChanges($: $, ui: UI, repo: Repo, status: JSX.Element | null, width: number) {
  const { Box, Input, Text } = ui
  const busy = await read($, busyState)
  const message = await read($, messageState)
  const folded = await read($, foldedState)
  const flashed = await read($, flashState)
  const conflicts = repo.changes.filter(isConflicted)
  const staged = repo.changes.filter(one => !isConflicted(one) && isStaged(one))
  const unstaged = repo.changes.filter(one => !isConflicted(one) && isUnstaged(one))

  return (
    <Box key="changes" flexDirection="column" gap={1}>
      {panel(ui, 'message-frame', [
        <Input
          key="message"
          value={message}
          rows={3}
          placeholder={`Message (Enter to commit on ${repo.branch})`}
          submitLabel="commit"
          onInput={text => setMessage($, text)}
          onSubmit={() => commit($)}
        />,
        <Box key="message-rule">{divider(ui, width - 4)}</Box>,
        <Box key="message-footer" justifyContent="space-between" gap={1} flexWrap="wrap">
          <Text color={C.faint}>{staged.length === 1 ? '1 staged file' : `${staged.length} staged files`}</Text>
          <Box gap={1} flexWrap="wrap">
            {staged.length > 0 && chip(ui, {
              key: 'draft-message',
              label: '✦ Message',
              kind: 'quiet',
              state: busy === 'Writing message' ? 'busy' : undefined,
              onPress: () => draftMessage($),
            })}
            {repo.changes.length > 0 && chip(ui, { key: 'stash', label: 'Stash', kind: 'quiet', onPress: () => stashChanges($) })}
            {unstaged.length > 0 && chip(ui, { key: 'stage-all', label: 'Stage all', kind: 'quiet', onPress: () => stageAll($) })}
            {unstaged.length > 0 && chip(ui, { key: 'commit-all', label: 'Commit all', onPress: () => commitAll($) })}
            {chip(ui, { key: 'amend', label: 'Amend', onPress: () => amend($) })}
            {chip(ui, { key: 'commit', label: 'Commit →', kind: 'primary', onPress: () => commit($) })}
          </Box>
        </Box>,
      ], message.trim() === '' ? C.line : C.accent)}

      {status}

      {repo.changes.length > 0 && drawSummary(ui, repo.changes, width)}

      {drawConflicts($, ui, conflicts)}
      {card(ui, 'change-lists', [
        staged.length > 0 && drawSection($, ui, 'Staged Changes', staged, true, !folded.includes('staged'), flashed),
        staged.length > 0 && <Box key="lists-rule">{divider(ui, width - 2)}</Box>,
        drawSection($, ui, 'Changes', unstaged, false, !folded.includes('work'), flashed),
      ])}
    </Box>
  )
}
