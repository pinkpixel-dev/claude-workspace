import { atom, read } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { GhDetail, GhItem } from '../types'
import { chip, tab } from './controls'
import { detailMarkdown } from './github'
import { closeItem, mentionItem, refreshGithub, showGithubView, showItem } from './github-actions'
import { EMPTY_GITHUB } from './state'
import { C } from './theme'
import type { UI } from './ui'

const ghDetailState = atom({ plugin: 'workspace', key: 'ghDetail' } as const, null)
const githubState = atom({ plugin: 'workspace', key: 'github' } as const, EMPTY_GITHUB)
const githubViewState = atom({ plugin: 'workspace', key: 'githubView' } as const, 'pulls')

type $ = EngineInterface

const keyOf = (item: GhItem) => `${item.kind}:${item.number}`

function drawItemRow($: $, ui: UI, item: GhItem) {
  const { Box, Button, Text } = ui

  return (
    <Box key={`gh-row:${keyOf(item)}`} justifyContent="space-between" gap={1} hover={{ backgroundColor: C.hover }}>
      <Box flexShrink={1}>
        <Button key={`gh-show:${keyOf(item)}`} plain onPress={() => showItem($, item)}>
          <Text color={item.isDraft ? C.faint : item.kind === 'pr' ? C.added : C.renamed}>{'● '}</Text>
          <Text color={C.faint}>{`#${item.number} `}</Text>
          <Text color={C.text} wrap="truncate-end">{item.title}</Text>
        </Button>
      </Box>
      <Box gap={1} flexShrink={0}>
        <Text color={C.faint}>{`${item.isDraft ? 'draft · ' : ''}${item.author} · ${item.age}`}</Text>
        {chip(ui, { key: `gh-mention:${keyOf(item)}`, label: '@', kind: 'quiet', onPress: () => mentionItem($, item) })}
      </Box>
    </Box>
  )
}

function drawDetail($: $, ui: UI, detail: GhDetail, status: JSX.Element | null) {
  const { Box, Link, Markdown, Text } = ui
  const { item } = detail

  return (
    <Box flexDirection="column" gap={1}>
      <Box justifyContent="space-between" gap={1}>
        <Box gap={1} flexShrink={1}>
          {chip(ui, { key: 'gh-back', label: '‹ Back', onPress: () => closeItem($), kind: 'quiet' })}
          <Text color={C.faint}>{`#${item.number}`}</Text>
          <Text color={C.text} bold wrap="truncate-end">{item.title}</Text>
        </Box>
        <Box gap={1} flexShrink={0}>
          <Link href={item.url} label="Open" />
          {chip(ui, { key: 'gh-mention-open', label: '@', onPress: () => mentionItem($, item) })}
        </Box>
      </Box>
      <Text color={C.muted}>{detail.meta.join(' · ')}</Text>
      {item.labels.length > 0 && <Text color={C.faint}>{item.labels.join(' · ')}</Text>}
      {status}
      <Markdown text={detailMarkdown(detail)} />
    </Box>
  )
}

export async function drawGithub($: $, ui: UI) {
  const { Box, Text } = ui
  const github = await read($, githubState)

  const status = !github.isLoading && github.error === '' ? null : (
    <Box key="gh-status" flexDirection="column">
      {github.isLoading && <Text color={C.busy}>Loading...</Text>}
      {github.error !== '' && <Text color={C.deleted}>{github.error}</Text>}
    </Box>
  )

  const detail = await read($, ghDetailState)
  if (detail !== null) return drawDetail($, ui, detail, status)

  const view = await read($, githubViewState)
  const items = view === 'pulls' ? github.pulls : github.issues
  const isEmpty = !github.isLoading && github.error === '' && github.repo !== '' && items.length === 0

  return (
    <Box flexDirection="column" gap={1}>
      <Box justifyContent="space-between" gap={1}>
        <Box gap={1}>
          {tab(ui, 'gh-view-pulls', `Pull requests ${github.pulls.length}`, view === 'pulls', () => showGithubView($, 'pulls'))}
          {tab(ui, 'gh-view-issues', `Issues ${github.issues.length}`, view === 'issues', () => showGithubView($, 'issues'))}
        </Box>
        <Box gap={1}>
          {github.repo !== '' && <Text color={C.faint}>{github.repo}</Text>}
          {chip(ui, { key: 'gh-refresh', label: '↻', kind: 'quiet', onPress: () => refreshGithub($) })}
        </Box>
      </Box>
      {status}
      <Box flexDirection="column">
        {isEmpty && <Text color={C.faint}>{view === 'pulls' ? 'No open pull requests.' : 'No open issues.'}</Text>}
        {items.map(item => drawItemRow($, ui, item))}
      </Box>
    </Box>
  )
}
