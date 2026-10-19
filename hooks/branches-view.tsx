import { atom, read } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Branch, Repo } from '../types'
import {
  cancelBranchForm,
  checkoutRemote,
  deleteBranch,
  saveBranchForm,
  setBranchName,
  startNewBranch,
  startRename,
} from './branch-actions'
import { chip } from './controls'
import { remoteOnly } from './git'
import { switchBranch } from './git-actions'
import { drawMergeBar } from './merge-view'
import { C } from './theme'
import type { UI } from './ui'

const branchFormState = atom({ plugin: 'workspace', key: 'branchForm' } as const, null)

type $ = EngineInterface

function drawBranchRow($: $, ui: UI, branch: Branch, isCurrent: boolean) {
  const { Box, Text } = ui
  const counts = branch.ahead + branch.behind > 0 ? `↑${branch.ahead} ↓${branch.behind}` : ''

  return (
    <Box key={`branch:${branch.name}`} justifyContent="space-between" gap={1} hover={{ backgroundColor: C.hover }}>
      <Box gap={1} flexShrink={1}>
        <Text color={isCurrent ? C.accent : C.faint}>{isCurrent ? '●' : ' '}</Text>
        <Text color={C.text} bold={isCurrent} wrap="truncate-end">{branch.name}</Text>
        <Text color={C.faint} wrap="truncate-end">{branch.upstream ?? 'local'}</Text>
        {branch.isGone && <Text color={C.deleted}>gone</Text>}
        {counts !== '' && <Text color={C.busy}>{counts}</Text>}
      </Box>
      <Box gap={1}>
        {!isCurrent && chip(ui, {
          key: `branch-switch:${branch.name}`,
          label: 'Switch',
          kind: 'row',
          onPress: () => switchBranch($, branch.name),
        })}
        {chip(ui, {
          key: `branch-rename:${branch.name}`,
          label: 'Rename',
          kind: 'row',
          onPress: () => startRename($, branch.name),
        })}
        {!isCurrent && chip(ui, {
          key: `branch-delete:${branch.name}`,
          label: 'Delete',
          kind: 'row',
          onPress: () => deleteBranch($, branch.name),
        })}
      </Box>
    </Box>
  )
}

export async function drawBranches($: $, ui: UI, repo: Repo, status: JSX.Element | null) {
  const { Box, Input, Text } = ui
  const form = await read($, branchFormState)
  const isNew = form?.kind === 'new'
  const remote = remoteOnly(repo)
  const mergeBar = await drawMergeBar($, ui, repo)

  return (
    <Box key="branches" flexDirection="column" gap={1}>
      {mergeBar}
      {form === null
        ? <Box>{chip(ui, { key: 'branch-new', label: '+ New branch', onPress: () => startNewBranch($) })}</Box>
        : (
          <Box flexDirection="column" gap={1}>
            <Input
              key="branch-name"
              value={form.text}
              placeholder={isNew ? `New branch from ${repo.branch || 'HEAD'}` : `New name for ${form.from}`}
              submitLabel={isNew ? 'create' : 'rename'}
              onInput={text => setBranchName($, text)}
              onSubmit={() => saveBranchForm($)}
            />
            <Box gap={1}>
              {chip(ui, { key: 'branch-save', label: isNew ? 'Create' : 'Rename', kind: 'primary', onPress: () => saveBranchForm($) })}
              {chip(ui, { key: 'branch-cancel', label: 'Cancel', onPress: () => cancelBranchForm($) })}
            </Box>
          </Box>
        )}

      {status}

      <Box flexDirection="column">
        {repo.branches.length === 0 && <Text color={C.faint}>No branches yet. Make a first commit.</Text>}
        {repo.branches.map(branch => drawBranchRow($, ui, branch, branch.name === repo.branch))}
      </Box>

      {remote.length > 0 && (
        <Box flexDirection="column">
          <Box gap={1}>
            <Text color={C.text} bold>Remote branches</Text>
            <Text color={C.faint}>{String(remote.length)}</Text>
          </Box>
          {remote.map(ref => (
            <Box key={`remote-branch:${ref}`} justifyContent="space-between" gap={1} hover={{ backgroundColor: C.hover }}>
              <Text color={C.muted} wrap="truncate-end">{`  ${ref}`}</Text>
              {chip(ui, { key: `branch-checkout:${ref}`, label: 'Check out', kind: 'row', onPress: () => checkoutRemote($, ref) })}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
