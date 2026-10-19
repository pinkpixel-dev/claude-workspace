import { atom, read } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Branch, BranchForm, Repo } from '../types'
import {
  cancelBranchForm,
  checkoutRemote,
  deleteBranch,
  deleteRemoteBranch,
  saveBranchForm,
  setBranchBase,
  setBranchName,
  startNewBranch,
  startRename,
} from './branch-actions'
import { chip } from './controls'
import { remoteOnly } from './git'
import { switchBranch } from './git-actions'
import { drawMergeBar } from './merge-view'
import { drawRemotes } from './remotes-view'
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

// What a new branch can start from: where you are, any branch, remote branch
// or tag, plus a commit picked in History. A sha shows as its short form.
function baseOptions(repo: Repo, form: BranchForm) {
  const here = repo.branch || 'HEAD'
  const refs = [
    here,
    ...repo.branches.map(one => one.name).filter(name => name !== here),
    ...repo.remoteBranches,
    ...repo.tags.map(tag => tag.name),
  ]
  const picked = form.base ?? here
  const all = refs.includes(picked) ? refs : [picked, ...refs]

  return {
    value: picked,
    options: all.map(ref => (/^[0-9a-f]{40}$/.test(ref) ? { value: ref, label: ref.slice(0, 7) } : { value: ref })),
  }
}

export async function drawBranches($: $, ui: UI, repo: Repo, status: JSX.Element | null) {
  const { Box, Input, Select, Text } = ui
  const form = await read($, branchFormState)
  const isNew = form?.kind === 'new'
  const notLocal = remoteOnly(repo)
  const base = form !== null && isNew ? baseOptions(repo, form) : null
  const mergeBar = await drawMergeBar($, ui, repo)

  return (
    <Box key="branches" flexDirection="column" gap={1}>
      {mergeBar}
      {form === null
        ? <Box>{chip(ui, { key: 'branch-new', label: '+ New branch', onPress: () => startNewBranch($) })}</Box>
        : (
          <Box flexDirection="column" gap={1}>
            {base !== null && (
              <Select key="branch-base" label="from" value={base.value} options={base.options} onSelect={ref => setBranchBase($, ref)} />
            )}
            <Input
              key="branch-name"
              value={form.text}
              placeholder={isNew ? 'New branch name' : `New name for ${form.from}`}
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

      {repo.remoteBranches.length > 0 && (
        <Box flexDirection="column">
          <Box gap={1}>
            <Text color={C.text} bold>Remote branches</Text>
            <Text color={C.faint}>{String(repo.remoteBranches.length)}</Text>
          </Box>
          {repo.remoteBranches.map(ref => (
            <Box key={`remote-branch:${ref}`} justifyContent="space-between" gap={1} hover={{ backgroundColor: C.hover }}>
              <Text color={C.muted} wrap="truncate-end">{`  ${ref}`}</Text>
              <Box gap={1} flexShrink={0}>
                {notLocal.includes(ref) && chip(ui, { key: `branch-checkout:${ref}`, label: 'Check out', kind: 'row', onPress: () => checkoutRemote($, ref) })}
                {chip(ui, { key: `branch-delete-remote:${ref}`, label: 'Delete', kind: 'row', onPress: () => deleteRemoteBranch($, ref) })}
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {await drawRemotes($, ui, repo)}
    </Box>
  )
}
