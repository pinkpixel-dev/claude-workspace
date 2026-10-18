import { atom, read } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Change } from '../types'
import {
  cancelConfirm,
  closeDiff,
  commit,
  pull,
  push,
  refreshRepo,
  setMessage,
  showDiff,
  stage,
  stageAll,
  switchBranch,
  unstage,
} from './actions'
import { chip } from './controls'
import { colorOf, isStaged, isUnstaged, letterOf } from './git'
import { EMPTY_REPO } from './state'
import { C } from './theme'
import type { UI } from './ui'

const busyState = atom({ plugin: 'workspace', key: 'busy' } as const, null)
const confirmState = atom({ plugin: 'workspace', key: 'confirm' } as const, null)
const diffState = atom({ plugin: 'workspace', key: 'diff' } as const, null)
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
      {chip(ui, {
        key: `${staged ? 'unstage' : 'stage'}:${change.path}`,
        label: staged ? '−' : '+',
        kind: 'quiet',
        onPress: () => (staged ? unstage($, change.path) : stage($, change.path)),
      })}
    </Box>
  )
}

function drawSection($: $, ui: UI, title: string, changes: Change[], staged: boolean) {
  const { Box, Text } = ui

  return (
    <Box key={`section:${title}`} flexDirection="column">
      <Box gap={1}>
        <Text color={C.text} bold>{title}</Text>
        <Text color={C.faint}>{String(changes.length)}</Text>
      </Box>
      {changes.length === 0 && <Text color={C.faint}>Working tree clean.</Text>}
      {changes.map(change => drawRow($, ui, change, staged))}
    </Box>
  )
}

export async function drawGit($: $, ui: UI) {
  const { Box, Code, Input, Select, Text } = ui
  const repo = await read($, repoState)

  if (!repo.isRepo) {
    return <Text color={C.faint}>Not a git repository.</Text>
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

  const message = await read($, messageState)
  const busy = await read($, busyState)
  const notice = await read($, noticeState)
  const confirm = await read($, confirmState)
  const staged = repo.changes.filter(isStaged)
  const unstaged = repo.changes.filter(isUnstaged)
  const branchNames = repo.branches.includes(repo.branch) ? repo.branches : [repo.branch || 'HEAD', ...repo.branches]

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
          <Text color={repo.ahead + repo.behind > 0 ? C.busy : C.faint}>{`↑${repo.ahead} ↓${repo.behind}`}</Text>
        </Box>
        <Box gap={1}>
          {chip(ui, { key: 'pull', label: 'Pull', onPress: () => pull($) })}
          {chip(ui, { key: 'push', label: 'Push', onPress: () => push($) })}
          {chip(ui, { key: 'refresh', label: '↻', kind: 'quiet', onPress: () => refreshRepo($) })}
        </Box>
      </Box>

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
          {unstaged.length > 0 && chip(ui, { key: 'stage-all', label: 'Stage all', onPress: () => stageAll($) })}
        </Box>
      </Box>

      {confirm !== null && (
        <Box gap={1} flexWrap="wrap">
          <Text color={C.modified}>{`${confirm === 'commit' ? 'Commit' : 'Push'} straight to ${repo.branch}?`}</Text>
          {chip(ui, {
            key: 'confirm-yes',
            label: confirm === 'commit' ? 'Yes, commit' : 'Yes, push',
            kind: 'primary',
            onPress: () => (confirm === 'commit' ? commit($) : push($)),
          })}
          {chip(ui, { key: 'confirm-no', label: 'Cancel', onPress: () => cancelConfirm($) })}
        </Box>
      )}
      {busy !== null && <Text color={C.busy}>{`${busy}...`}</Text>}
      {notice !== null && <Text color={notice.kind === 'error' ? C.deleted : C.added}>{notice.text}</Text>}

      {staged.length > 0 && drawSection($, ui, 'Staged Changes', staged, true)}
      {drawSection($, ui, 'Changes', unstaged, false)}
    </Box>
  )
}
