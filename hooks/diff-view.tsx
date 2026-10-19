import type { EngineInterface } from 'claude-code'

import type { Diff } from '../types'
import { badge, chip } from './controls'
import { hunkStats, splitHunks } from './git'
import { applyHunk } from './git-actions'
import { fileIcon } from './icons'
import { closeDiff } from './repo'
import { C } from './theme'
import { askClaude } from './turn-actions'
import type { UI } from './ui'

type $ = EngineInterface

// One file's diff, split into hunks that each stage or unstage on their own.
// An untracked file has no index version to apply a hunk to, so it shows whole.
export function drawDiff($: $, ui: UI, diff: Diff, isUntracked: boolean, status: JSX.Element | null) {
  const { Box, Code, Text } = ui
  const { header, hunks } = splitHunks(diff.text)
  const canSplit = !isUntracked && hunks.length > 0
  const name = diff.path.slice(diff.path.lastIndexOf('/') + 1)

  return (
    <Box flexDirection="column" gap={1}>
      <Box justifyContent="space-between" gap={1}>
        <Box gap={1} flexShrink={1}>
          {chip(ui, { key: 'diff-back', label: '‹ Back', onPress: () => closeDiff($), kind: 'quiet' })}
          <Text color={C.muted}>{fileIcon(name)}</Text>
          <Text color={C.text} bold wrap="truncate-start">{diff.path}</Text>
        </Box>
        <Box gap={1} flexShrink={0}>
          {chip(ui, {
            key: 'diff-review',
            label: 'Review',
            kind: 'quiet',
            onPress: () => askClaude($, diff.isStaged ? 'Review my staged changes to' : 'Review my changes to', diff.path),
          })}
          {badge(ui, 'diff-side', diff.isStaged ? 'staged' : 'working tree', diff.isStaged ? C.added : C.modified)}
        </Box>
      </Box>
      {status}
      {diff.text === '' && <Text color={C.faint}>No text changes to show.</Text>}
      {diff.text !== '' && !canSplit && <Code source={diff.text} format="diff" path={diff.path} />}
      {canSplit && hunks.map((hunk, i) => {
        const stats = hunkStats(hunk)

        return (
          <Box key={`hunk:${i}`} flexDirection="column">
            <Box justifyContent="space-between" gap={1} backgroundColor={C.card} paddingX={1}>
              <Box gap={1} flexShrink={1} height={1} overflow="hidden">
                <Text color={C.muted} bold>{stats.from === stats.to ? `Line ${stats.from}` : `Lines ${stats.from}–${stats.to}`}</Text>
                {stats.added > 0 && <Text color={C.added}>{`+${stats.added}`}</Text>}
                {stats.removed > 0 && <Text color={C.deleted}>{`−${stats.removed}`}</Text>}
                {stats.context !== '' && <Text color={C.faint}>{stats.context}</Text>}
              </Box>
              <Box gap={1} flexShrink={0}>
                <Text color={C.faint}>{`${i + 1}/${hunks.length}`}</Text>
                {chip(ui, {
                  key: `hunk-${diff.isStaged ? 'unstage' : 'stage'}:${i}`,
                  label: diff.isStaged ? '− Unstage' : '+ Stage',
                  kind: 'quiet',
                  onPress: () => applyHunk($, header, hunk, diff.isStaged),
                })}
              </Box>
            </Box>
            <Code source={hunk} format="diff" path={diff.path} />
          </Box>
        )
      })}
    </Box>
  )
}
