import { atom, read } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { GhDetail, GhItem, Review } from '../types'
import { badge, bar, card, chip, segments } from './controls'
import { checksLabel, checksState, detailMarkdown, REVIEW_LABEL } from './github'
import { closeItem, mentionItem, refreshGithub, showGithubView, showItem } from './github-actions'
import { EMPTY_GITHUB } from './state'
import { C } from './theme'
import type { UI } from './ui'

const ghDetailState = atom({ plugin: 'workspace', key: 'ghDetail' } as const, null)
const githubState = atom({ plugin: 'workspace', key: 'github' } as const, EMPTY_GITHUB)
const githubViewState = atom({ plugin: 'workspace', key: 'githubView' } as const, 'pulls')

type $ = EngineInterface

const keyOf = (item: GhItem) => `${item.kind}:${item.number}`

// A glyph and a color per CI outcome and review state, so neither leans on color alone.
const CHECK_MARK = {
  passing: { glyph: '✓', color: C.added },
  failing: { glyph: '✗', color: C.deleted },
  pending: { glyph: '●', color: C.modified },
  none: { glyph: ' ', color: C.faint },
} as const

const REVIEW_MARK: Record<Review, { glyph: string; color: string }> = {
  approved: { glyph: '✓', color: C.added },
  changes: { glyph: '±', color: C.deleted },
  required: { glyph: '○', color: C.muted },
  '': { glyph: ' ', color: C.faint },
}

function drawItemRow($: $, ui: UI, item: GhItem) {
  const { Box, Button, Text } = ui
  const ci = CHECK_MARK[checksState(item.checks)]
  const review = REVIEW_MARK[item.review]

  return (
    <Box key={`gh-row:${keyOf(item)}`} justifyContent="space-between" gap={1} hover={{ backgroundColor: C.hover }}>
      <Box flexShrink={1} height={1} overflow="hidden">
        <Button key={`gh-show:${keyOf(item)}`} plain onPress={() => showItem($, item)}>
          <Text color={item.isDraft ? C.faint : item.kind === 'pr' ? C.added : C.renamed}>{'● '}</Text>
          <Text color={C.faint}>{`#${item.number} `}</Text>
          <Text color={C.text} wrap="truncate-end">{item.title}</Text>
        </Button>
      </Box>
      <Box gap={1} flexShrink={0}>
        <Text color={C.faint}>{`${item.isDraft ? 'draft · ' : ''}${item.author} · ${item.age}`}</Text>
        {item.kind === 'pr' && <Text color={review.color}>{review.glyph}</Text>}
        {item.kind === 'pr' && <Text color={ci.color} bold>{ci.glyph}</Text>}
        {chip(ui, { key: `gh-mention:${keyOf(item)}`, label: '@', kind: 'row', onPress: () => mentionItem($, item) })}
      </Box>
    </Box>
  )
}

// Open pull requests at a glance: how their CI came out and where review stands.
function drawPullSummary(ui: UI, pulls: GhItem[], width: number) {
  const { Box, Text } = ui
  if (pulls.length === 0) return null

  const ci = (['passing', 'failing', 'pending'] as const).map(state => ({
    key: state,
    label: state,
    count: pulls.filter(pull => checksState(pull.checks) === state).length,
    color: CHECK_MARK[state].color,
  }))
  const reviews = (['approved', 'changes', 'required'] as const).map(state => ({
    key: state,
    label: REVIEW_LABEL[state],
    count: pulls.filter(pull => pull.review === state).length,
    color: REVIEW_MARK[state].color,
  }))
  const line = (key: string, title: string, parts: { key: string; label: string; count: number; color: string }[]) => (
    <Box key={key} justifyContent="space-between" gap={2}>
      <Box gap={1} flexShrink={1} flexWrap="wrap">
        <Text color={C.muted} bold>{title}</Text>
        {parts.every(part => part.count === 0) && <Text color={C.faint}>none reported</Text>}
        {parts.filter(part => part.count > 0).map(part => (
          <Text key={`${key}:${part.key}`} color={part.color}>{`${part.count} ${part.label}`}</Text>
        ))}
      </Box>
      {bar(ui, key, parts, Math.min(20, Math.max(0, width - 44)))}
    </Box>
  )

  return card(ui, 'gh-summary', [line('gh-sum-ci', 'Checks', ci), line('gh-sum-review', 'Review', reviews)])
}

const STATE_COLOR: Record<string, string> = { open: C.added, draft: C.faint, merged: C.renamed, closed: C.deleted }

function drawDetail($: $, ui: UI, detail: GhDetail, status: JSX.Element | null) {
  const { Box, Link, Markdown, Text } = ui
  const { item } = detail
  const ci = checksState(detail.checks)

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
      <Box gap={1} flexWrap="wrap">
        {detail.state !== '' && badge(ui, 'gh-state', detail.state, STATE_COLOR[detail.state] ?? C.muted)}
        {detail.review !== '' && badge(ui, 'gh-review', `${REVIEW_MARK[detail.review].glyph} ${REVIEW_LABEL[detail.review]}`, REVIEW_MARK[detail.review].color)}
        {detail.checks !== null && badge(ui, 'gh-checks', `${CHECK_MARK[ci].glyph} ${checksLabel(detail.checks)}`, CHECK_MARK[ci].color)}
        <Text color={C.muted}>{detail.meta.join(' · ')}</Text>
      </Box>
      {item.labels.length > 0 && <Text color={C.faint}>{item.labels.join(' · ')}</Text>}
      {status}
      <Markdown text={detailMarkdown(detail)} />
    </Box>
  )
}

export async function drawGithub($: $, ui: UI, width: number) {
  const { Box, Text } = ui
  const github = await read($, githubState)

  const status = !github.isLoading && github.error === '' ? null : (
    <Box key="gh-status" flexDirection="column">
      {github.isLoading && <Text color={C.busy}>Loading...</Text>}
      {github.error !== '' && <Text color={C.deleted}>{`✗ ${github.error}`}</Text>}
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
        {segments(ui, [
          { key: 'gh-view-pulls', label: `Pull requests ${github.pulls.length}`, isActive: view === 'pulls', onPress: () => showGithubView($, 'pulls') },
          { key: 'gh-view-issues', label: `Issues ${github.issues.length}`, isActive: view === 'issues', onPress: () => showGithubView($, 'issues') },
        ])}
        <Box gap={1}>
          {github.repo !== '' && <Text color={C.faint}>{github.repo}</Text>}
          {chip(ui, { key: 'gh-refresh', label: '↻', kind: 'quiet', onPress: () => refreshGithub($) })}
        </Box>
      </Box>
      {view === 'pulls' && drawPullSummary(ui, github.pulls, width)}
      {status}
      <Box flexDirection="column">
        {isEmpty && <Text color={C.faint}>{view === 'pulls' ? 'No open pull requests.' : 'No open issues.'}</Text>}
        {items.map(item => drawItemRow($, ui, item))}
      </Box>
    </Box>
  )
}
