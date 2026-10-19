import { atom, read } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Commit, Repo } from '../types'
import { chip } from './controls'
import { loadMore, revert, showCommit } from './history-actions'
import { HISTORY_PAGE } from './state'
import { C } from './theme'
import type { UI } from './ui'

const historyLimitState = atom({ plugin: 'workspace', key: 'historyLimit' } as const, HISTORY_PAGE)

type $ = EngineInterface

function drawCommitRow($: $, ui: UI, commit: Commit) {
  const { Box, Button, Text } = ui

  // One row per commit: the frame clips a long subject instead of letting it wrap.
  return (
    <Box key={`commit:${commit.sha}`} justifyContent="space-between" gap={1} hover={{ backgroundColor: C.hover }}>
      <Box flexShrink={1} height={1} overflow="hidden">
        <Button key={`commit-show:${commit.sha}`} plain onPress={() => showCommit($, commit)}>
          <Text color={C.faint}>{`${commit.age.padEnd(4)}`}</Text>
          <Text color={C.text} wrap="truncate-end">{commit.subject}</Text>
        </Button>
      </Box>
      <Box gap={1} flexShrink={0}>
        <Text color={C.faint}>{commit.short}</Text>
        {commit.isMerge
          ? <Text color={C.faint}>{' merge  '}</Text>
          : chip(ui, {
            key: `commit-revert:${commit.sha}`,
            label: 'Revert',
            kind: 'row',
            onPress: () => revert($, commit),
          })}
      </Box>
    </Box>
  )
}

export async function drawHistory($: $, ui: UI, repo: Repo, status: JSX.Element | null) {
  const { Box, Text } = ui
  const limit = await read($, historyLimitState)

  return (
    <Box key="history" flexDirection="column" gap={1}>
      {status}
      <Box flexDirection="column">
        {repo.commits.length === 0 && <Text color={C.faint}>No commits yet.</Text>}
        {repo.commits.map(commit => drawCommitRow($, ui, commit))}
      </Box>
      {repo.commits.length >= limit && (
        <Box>{chip(ui, { key: 'history-more', label: 'Load more', onPress: () => loadMore($) })}</Box>
      )}
    </Box>
  )
}
