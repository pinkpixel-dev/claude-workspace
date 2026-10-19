import { atom, read } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Change, Repo } from '../types'
import {
  amend,
  cancelConfirm,
  commit,
  commitAll,
  confirmYes,
  discard,
  discardAll,
  fetchRemote,
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
import { chip, tab } from './controls'
import { colorOf, isConflicted, isStaged, isUnstaged, isUntracked, letterOf } from './git'
import { drawConflicts, drawOperationBanner } from './merge-view'
import { refreshRepo, selectRemote, showDiff } from './repo'
import { EMPTY_REPO } from './state'
import { C } from './theme'
import type { UI } from './ui'

const busyState = atom({ plugin: 'workspace', key: 'busy' } as const, null)
const commitDiffState = atom({ plugin: 'workspace', key: 'commitDiff' } as const, null)
const confirmState = atom({ plugin: 'workspace', key: 'confirm' } as const, null)
const diffState = atom({ plugin: 'workspace', key: 'diff' } as const, null)
const gitViewState = atom({ plugin: 'workspace', key: 'gitView' } as const, 'changes')
const messageState = atom({ plugin: 'workspace', key: 'message' } as const, '')
const noticeState = atom({ plugin: 'workspace', key: 'notice' } as const, null)
const repoState = atom({ plugin: 'workspace', key: 'repo' } as const, EMPTY_REPO)

type $ = EngineInterface

function drawRow($: $, ui: UI, change: Change, staged: boolean) {
  const { Box, Button, Text } = ui
  const letter = letterOf(staged ? change.index : change.work)
  const group = staged ? 'staged' : 'work'
  const cut = change.path.lastIndexOf('/')
  const name = change.path.slice(cut + 1)
  const folder = cut < 0 ? '' : change.path.slice(0, cut)

  return (
    <Box key={`${group}:${change.path}`} justifyContent="space-between" gap={1} hover={{ backgroundColor: C.hover }}>
      <Button key={`diff:${group}:${change.path}`} plain onPress={() => showDiff($, change, staged)}>
        <Text color={colorOf(letter)} bold>{`${letter} `}</Text>
        <Text color={C.text}>{name}</Text>
        <Text color={C.faint}>{folder ? `  ${folder}` : ''}</Text>
      </Button>
      <Box gap={1}>
        {!staged && chip(ui, {
          key: `discard:${change.path}`,
          label: '↺',
          kind: 'quiet',
          onPress: () => discard($, change),
        })}
        {chip(ui, {
          key: `${staged ? 'unstage' : 'stage'}:${change.path}`,
          label: staged ? '−' : '+',
          kind: 'quiet',
          onPress: () => (staged ? unstage($, change.path) : stage($, change.path)),
        })}
      </Box>
    </Box>
  )
}

function drawSection($: $, ui: UI, title: string, changes: Change[], staged: boolean) {
  const { Box, Text } = ui

  return (
    <Box key={`section:${title}`} flexDirection="column">
      <Box justifyContent="space-between" gap={1}>
        <Box gap={1}>
          <Text color={C.text} bold>{title}</Text>
          <Text color={C.faint}>{String(changes.length)}</Text>
        </Box>
        {!staged && changes.length > 0 && chip(ui, {
          key: 'discard-all',
          label: 'Discard all',
          kind: 'quiet',
          onPress: () => discardAll($),
        })}
      </Box>
      {changes.length === 0 && <Text color={C.faint}>Working tree clean.</Text>}
      {changes.map(change => drawRow($, ui, change, staged))}
    </Box>
  )
}

export async function drawGit($: $, ui: UI) {
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
  const notice = await read($, noticeState)
  const confirm = await read($, confirmState)
  const branchNames = repo.branches.some(one => one.name === repo.branch)
    ? repo.branches.map(one => one.name)
    : [repo.branch || 'HEAD', ...repo.branches.map(one => one.name)]
  const isRisky = confirm !== null && (confirm.action.startsWith('discard') || confirm.action === 'force-delete')

  // The confirm row, busy label and notice, drawn where each view wants them.
  const status = confirm === null && busy === null && notice === null ? null : (
    <Box key="status" flexDirection="column" gap={1}>
      {confirm !== null && (
        <Box gap={1} flexWrap="wrap">
          <Text color={isRisky ? C.deleted : C.modified}>{confirm.question}</Text>
          {chip(ui, { key: 'confirm-yes', label: confirm.yes, kind: 'primary', onPress: () => confirmYes($) })}
          {chip(ui, { key: 'confirm-no', label: 'Cancel', onPress: () => cancelConfirm($) })}
        </Box>
      )}
      {busy !== null && <Text color={C.busy}>{`${busy}...`}</Text>}
      {notice !== null && <Text color={notice.kind === 'error' ? C.deleted : C.added}>{notice.text}</Text>}
    </Box>
  )

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
      <Box justifyContent="space-between" gap={1} flexWrap="wrap">
        <Box gap={1}>
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
          <Text color={repo.ahead + repo.behind > 0 ? C.busy : C.faint}>{`↑${repo.ahead} ↓${repo.behind}`}</Text>
        </Box>
        <Box gap={1}>
          {chip(ui, { key: 'fetch', label: 'Fetch', onPress: () => fetchRemote($) })}
          {chip(ui, { key: 'pull', label: 'Pull', onPress: () => pull($) })}
          {chip(ui, { key: 'push', label: 'Push', onPress: () => push($) })}
          {chip(ui, { key: 'refresh', label: '↻', kind: 'quiet', onPress: () => refreshRepo($) })}
        </Box>
      </Box>

      {drawOperationBanner($, ui, repo)}

      <Box gap={1}>
        {tab(ui, 'view-changes', 'Changes', view === 'changes', () => showView($, 'changes'))}
        {tab(ui, 'view-history', 'History', view === 'history', () => showView($, 'history'))}
        {tab(ui, 'view-branches', `Branches ${repo.branches.length}`, view === 'branches', () => showView($, 'branches'))}
        {tab(ui, 'view-stash', repo.stashes.length > 0 ? `Stash ${repo.stashes.length}` : 'Stash', view === 'stash', () => showView($, 'stash'))}
      </Box>

      {view === 'history' && await drawHistory($, ui, repo, status)}
      {view === 'branches' && await drawBranches($, ui, repo, status)}
      {view === 'stash' && drawStash($, ui, repo, status)}
      {view === 'changes' && await drawChanges($, ui, repo, status)}
    </Box>
  )
}

async function drawChanges($: $, ui: UI, repo: Repo, status: JSX.Element | null) {
  const { Box, Input } = ui
  const message = await read($, messageState)
  const conflicts = repo.changes.filter(isConflicted)
  const staged = repo.changes.filter(one => !isConflicted(one) && isStaged(one))
  const unstaged = repo.changes.filter(one => !isConflicted(one) && isUnstaged(one))

  return (
    <Box key="changes" flexDirection="column" gap={1}>
      <Box flexDirection="column" gap={1}>
        <Input
          key="message"
          value={message}
          rows={3}
          placeholder={`Message (Enter to commit on ${repo.branch})`}
          submitLabel="commit"
          onInput={text => setMessage($, text)}
          onSubmit={() => commit($)}
        />
        <Box gap={1}>
          {chip(ui, { key: 'commit', label: 'Commit', kind: 'primary', onPress: () => commit($) })}
          {chip(ui, { key: 'amend', label: 'Amend', onPress: () => amend($) })}
          {unstaged.length > 0 && chip(ui, { key: 'commit-all', label: 'Commit all', onPress: () => commitAll($) })}
          {unstaged.length > 0 && chip(ui, { key: 'stage-all', label: 'Stage all', onPress: () => stageAll($) })}
          {repo.changes.length > 0 && chip(ui, { key: 'stash', label: 'Stash', onPress: () => stashChanges($) })}
        </Box>
      </Box>

      {status}

      {drawConflicts($, ui, conflicts)}
      {staged.length > 0 && drawSection($, ui, 'Staged Changes', staged, true)}
      {drawSection($, ui, 'Changes', unstaged, false)}
    </Box>
  )
}
