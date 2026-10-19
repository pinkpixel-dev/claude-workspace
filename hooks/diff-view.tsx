import type { EngineInterface } from 'claude-code'

import type { Diff } from '../types'
import { chip } from './controls'
import { splitHunks } from './git'
import { applyHunk } from './git-actions'
import { closeDiff } from './repo'
import { C } from './theme'
import type { UI } from './ui'

type $ = EngineInterface

// One file's diff, split into hunks that each stage or unstage on their own.
// An untracked file has no index version to apply a hunk to, so it shows whole.
export function drawDiff($: $, ui: UI, diff: Diff, isUntracked: boolean, status: JSX.Element | null) {
  const { Box, Code, Text } = ui
  const { header, hunks } = splitHunks(diff.text)
  const canSplit = !isUntracked && hunks.length > 0

  return (
    <Box flexDirection="column" gap={1}>
      <Box gap={1}>
        {chip(ui, { key: 'diff-back', label: '‹ Back', onPress: () => closeDiff($), kind: 'quiet' })}
        <Text color={C.text} bold wrap="truncate-start">{diff.path}</Text>
        <Text color={C.faint}>{diff.isStaged ? 'staged' : 'working tree'}</Text>
      </Box>
      {status}
      {diff.text === '' && <Text color={C.faint}>No text changes to show.</Text>}
      {diff.text !== '' && !canSplit && <Code source={diff.text} format="diff" path={diff.path} />}
      {canSplit && hunks.map((hunk, i) => (
        <Box key={`hunk:${i}`} flexDirection="column">
          <Box justifyContent="space-between" gap={1}>
            <Text color={C.faint}>{`Hunk ${i + 1} of ${hunks.length}`}</Text>
            {chip(ui, {
              key: `hunk-${diff.isStaged ? 'unstage' : 'stage'}:${i}`,
              label: diff.isStaged ? 'Unstage hunk' : 'Stage hunk',
              kind: 'quiet',
              onPress: () => applyHunk($, header, hunk, diff.isStaged),
            })}
          </Box>
          <Code source={hunk} format="diff" path={diff.path} />
        </Box>
      ))}
    </Box>
  )
}
