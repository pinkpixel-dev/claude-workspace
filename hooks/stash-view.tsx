import type { EngineInterface } from 'claude-code'

import type { Repo, Stash } from '../types'
import { chip } from './controls'
import { isStaged } from './git'
import { applyStash, dropAllStashes, dropStash, stashChanges, stashStaged } from './history-actions'
import { C } from './theme'
import type { UI } from './ui'

type $ = EngineInterface

function drawStashRow($: $, ui: UI, stash: Stash) {
  const { Box, Text } = ui

  return (
    <Box key={`stash:${stash.ref}`} justifyContent="space-between" gap={1} hover={{ backgroundColor: C.hover }}>
      <Box gap={1} flexShrink={1}>
        <Text color={C.faint}>{stash.age.padEnd(3)}</Text>
        <Text color={C.text} wrap="truncate-end">{stash.message}</Text>
        <Text color={C.faint}>{stash.ref}</Text>
      </Box>
      <Box gap={1}>
        {chip(ui, { key: `stash-apply:${stash.ref}`, label: 'Apply', kind: 'row', onPress: () => applyStash($, stash, false) })}
        {chip(ui, { key: `stash-pop:${stash.ref}`, label: 'Pop', kind: 'row', onPress: () => applyStash($, stash, true) })}
        {chip(ui, { key: `stash-drop:${stash.ref}`, label: 'Drop', kind: 'row', onPress: () => dropStash($, stash) })}
      </Box>
    </Box>
  )
}

export function drawStash($: $, ui: UI, repo: Repo, status: JSX.Element | null) {
  const { Box, Text } = ui

  return (
    <Box key="stash" flexDirection="column" gap={1}>
      <Box gap={1} flexWrap="wrap">
        {repo.changes.length > 0 && chip(ui, { key: 'stash-all', label: 'Stash all', onPress: () => stashChanges($) })}
        {repo.changes.some(isStaged) && chip(ui, { key: 'stash-staged', label: 'Stash staged', onPress: () => stashStaged($) })}
        {repo.stashes.length > 1 && chip(ui, { key: 'stash-drop-all', label: 'Drop all', kind: 'quiet', onPress: () => dropAllStashes($) })}
      </Box>
      {status}
      <Box flexDirection="column">
        {repo.stashes.length === 0 && <Text color={C.faint}>Nothing stashed. Use Stash in Changes to set work aside.</Text>}
        {repo.stashes.map(stash => drawStashRow($, ui, stash))}
      </Box>
    </Box>
  )
}
