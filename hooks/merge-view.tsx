import { atom, read } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Change, Repo } from '../types'
import { chip } from './controls'
import { isConflicted } from './git'
import {
  abortOperation,
  continueOperation,
  markResolved,
  merge,
  openConflict,
  rebase,
  setMergeSource,
  takeSide,
} from './merge-actions'
import { C } from './theme'
import type { UI } from './ui'

const mergeSourceState = atom({ plugin: 'workspace', key: 'mergeSource' } as const, '')

type $ = EngineInterface

const OPERATION_LABEL = {
  merge: 'Merge',
  rebase: 'Rebase',
  revert: 'Revert',
  'cherry-pick': 'Cherry-pick',
} as const

// The bar above the sub-tabs while a merge, rebase, revert or cherry-pick waits on you.
export function drawOperationBanner($: $, ui: UI, repo: Repo) {
  const { Box, Text } = ui
  if (repo.operation === null) return null

  const count = repo.changes.filter(isConflicted).length
  const detail = count === 0 ? 'ready to continue' : count === 1 ? '1 conflict' : `${count} conflicts`

  return (
    <Box key="operation" justifyContent="space-between" gap={1} flexWrap="wrap" backgroundColor={C.raised} paddingX={1}>
      <Box gap={1}>
        <Text color={C.modified} bold>{`${OPERATION_LABEL[repo.operation]} in progress`}</Text>
        <Text color={count === 0 ? C.added : C.deleted}>{`· ${detail}`}</Text>
      </Box>
      <Box gap={1}>
        {chip(ui, { key: 'operation-continue', label: 'Continue', kind: count === 0 ? 'primary' : 'quiet', onPress: () => continueOperation($) })}
        {chip(ui, { key: 'operation-abort', label: 'Abort', kind: 'quiet', onPress: () => abortOperation($) })}
      </Box>
    </Box>
  )
}

function drawConflictRow($: $, ui: UI, change: Change) {
  const { Box, Button, Text } = ui
  const cut = change.path.lastIndexOf('/')

  return (
    <Box key={`conflict:${change.path}`} justifyContent="space-between" gap={1} hover={{ backgroundColor: C.hover }}>
      <Box flexShrink={1}>
        <Button key={`conflict-open:${change.path}`} plain onPress={() => openConflict($, change)}>
          <Text color={C.deleted} bold>{'! '}</Text>
          <Text color={C.text} wrap="truncate-end">{change.path.slice(cut + 1)}</Text>
          <Text color={C.faint}>{cut < 0 ? '' : `  ${change.path.slice(0, cut)}`}</Text>
        </Button>
      </Box>
      <Box gap={1}>
        {chip(ui, { key: `conflict-ours:${change.path}`, label: 'Ours', kind: 'row', onPress: () => takeSide($, change, 'ours') })}
        {chip(ui, { key: `conflict-theirs:${change.path}`, label: 'Theirs', kind: 'row', onPress: () => takeSide($, change, 'theirs') })}
        {chip(ui, { key: `conflict-resolved:${change.path}`, label: 'Resolved', kind: 'row', onPress: () => markResolved($, change) })}
      </Box>
    </Box>
  )
}

export function drawConflicts($: $, ui: UI, conflicts: Change[]) {
  const { Box, Text } = ui
  if (conflicts.length === 0) return null

  return (
    <Box key="section:Merge Changes" flexDirection="column">
      <Box gap={1}>
        <Text color={C.text} bold>Merge Changes</Text>
        <Text color={C.faint}>{String(conflicts.length)}</Text>
      </Box>
      {conflicts.map(change => drawConflictRow($, ui, change))}
    </Box>
  )
}

// The Branches view's top row: pick a branch, then merge it in or rebase onto it.
export async function drawMergeBar($: $, ui: UI, repo: Repo) {
  const { Box, Select } = ui
  const others = [
    ...repo.branches.map(one => one.name).filter(name => name !== repo.branch),
    ...repo.remoteBranches,
  ]
  if (others.length === 0 || repo.operation !== null) return null

  const picked = await read($, mergeSourceState)
  const source = others.includes(picked) ? picked : others[0] ?? ''

  return (
    <Box key="merge-bar" gap={1} flexWrap="wrap">
      <Select
        key="merge-source"
        value={source}
        options={others.map(name => ({ value: name }))}
        onSelect={name => setMergeSource($, name)}
      />
      {chip(ui, { key: 'merge', label: 'Merge', onPress: () => merge($, source) })}
      {chip(ui, { key: 'rebase', label: 'Rebase', onPress: () => rebase($, source) })}
    </Box>
  )
}
