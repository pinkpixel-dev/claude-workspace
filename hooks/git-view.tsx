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
import { chip, tab } from './controls'
import { colorOf, isStaged, isUnstaged, letterOf } from './git'
import { closeDiff, refreshRepo, selectRemote, showDiff } from './repo'
import { EMPTY_REPO } from './state'
import { C } from './theme'
import type { UI } from './ui'

const busyState = atom({ plugin: 'workspace', key: 'busy' } as const, null)
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

  const diff = await read($, diffState)
  if (diff !== null) {
    return (
      <Box flexDirection="column" gap={1}>
        <Box gap={1}>
          {chip(ui, { key: 'diff-back', label: '‹ Back', onPress: () => closeDiff($), kind: 'quiet' })}
          <Text color={C.text} bold wrap="truncate-start">{diff.path}</Text>
          <Text color={C.faint}>{diff.isStaged ? 'staged' : 'working tree'}</Text>
        </Box>
        {diff.text === ''
          ? <Text color={C.faint}>No text changes to show.</Text>
          : <Code source={diff.text} format="diff" path={diff.path} />}
      </Box>
    )
  }

  const view = await read($, gitViewState)
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

      <Box gap={1}>
        {tab(ui, 'view-changes', 'Changes', view === 'changes', () => showView($, 'changes'))}
        {tab(ui, 'view-branches', `Branches ${repo.branches.length}`, view === 'branches', () => showView($, 'branches'))}
      </Box>

      {view === 'branches' ? await drawBranches($, ui, repo, status) : await drawChanges($, ui, repo, status)}
    </Box>
  )
}

async function drawChanges($: $, ui: UI, repo: Repo, status: JSX.Element | null) {
  const { Box, Input } = ui
  const message = await read($, messageState)
  const staged = repo.changes.filter(isStaged)
  const unstaged = repo.changes.filter(isUnstaged)

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
        </Box>
      </Box>

      {status}

      {staged.length > 0 && drawSection($, ui, 'Staged Changes', staged, true)}
      {drawSection($, ui, 'Changes', unstaged, false)}
    </Box>
  )
}
