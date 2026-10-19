import { atom, read } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Commit, Repo } from '../types'
import { toBase64 } from './base64'
import { activityCells, ACTIVITY_DAYS } from './chart'
import { badge, card, chip } from './controls'
import { graphLines, layoutGraph, runsOf } from './graph'
import type { Cell, Graph } from './graph'
import { drawGraphPicture } from './graph-image'
import { loadMore, revert, showCommit } from './history-actions'
import { HISTORY_PAGE } from './state'
import { C } from './theme'
import type { UI } from './ui'

const hasImagesState = atom({ plugin: 'workspace', key: 'hasImages' } as const, false)
const historyLimitState = atom({ plugin: 'workspace', key: 'historyLimit' } as const, HISTORY_PAGE)

type $ = EngineInterface

// Commits per graph picture: each Image stays well under the terminal's size limits.
const PICTURE_COMMITS = 25

// Pictures already drawn, by what they show, so a redraw doesn't paint them again.
const pictures = new Map<string, { rgba: string; width: number; height: number; columns: number; rows: number }>()

function pictureOf(graph: Graph, commits: Commit[], from: number, to: number) {
  const id = `${graph.width}:${commits.slice(Math.max(0, from - 1), to + 1).map(one => one.sha).join(',')}`
  const kept = pictures.get(id)
  if (kept !== undefined) return kept

  const drawn = drawGraphPicture(graph, from, to)
  const picture = { ...drawn, rgba: toBase64(drawn.rgba) }
  if (pictures.size > 40) pictures.clear()
  pictures.set(id, picture)

  return picture
}

const drawCells = (ui: UI, key: string, cells: Cell[]) => {
  const { Box, Text } = ui

  return (
    <Box key={key} flexShrink={0}>
      {runsOf(cells).map((run, i) => <Text key={`${key}:${i}`} color={run.color}>{run.glyph}</Text>)}
    </Box>
  )
}

// Two rows per commit: the subject on the first, the short sha and age under
// it. `graph` is the Unicode graph's two rows, or null beside a picture.
function drawCommitRow($: $, ui: UI, commit: Commit, isHead: boolean, graph: [Cell[], Cell[]] | null) {
  const { Box, Button, Text } = ui

  return (
    <Box key={`commit:${commit.sha}`} flexDirection="column" height={2} hover={{ backgroundColor: C.hover }}>
      <Box justifyContent="space-between" gap={1}>
        <Box flexShrink={1} gap={1}>
          {graph !== null && drawCells(ui, `graph-top:${commit.sha}`, graph[0])}
          {/* The frame clips a long subject instead of letting it wrap. */}
          <Box flexShrink={1} height={1} overflow="hidden">
            <Button key={`commit-show:${commit.sha}`} plain onPress={() => showCommit($, commit)}>
              <Text color={C.text} bold={isHead}>{commit.subject}</Text>
            </Button>
          </Box>
          {isHead && <Box flexShrink={0}>{badge(ui, `head:${commit.sha}`, 'HEAD', C.accent)}</Box>}
        </Box>
        <Box gap={1} flexShrink={0}>
          {commit.isMerge
            ? <Text color={C.faint}>{' merge '}</Text>
            : chip(ui, {
              key: `commit-revert:${commit.sha}`,
              label: 'Revert',
              kind: 'row',
              onPress: () => revert($, commit),
            })}
        </Box>
      </Box>
      <Box gap={1}>
        {graph !== null && drawCells(ui, `graph-bottom:${commit.sha}`, graph[1])}
        <Text color={C.faint}>{`${commit.short} · ${commit.age} ago`}</Text>
      </Box>
    </Box>
  )
}

function drawActivity(ui: UI, days: number[]) {
  const { Box, Raster, Text } = ui
  if (Raster === undefined) return null

  const total = days.reduce((sum, count) => sum + count, 0)
  const chart = activityCells(days, 2, C.accent, C.line, C.card)

  return (
    <Box key="activity" gap={2} alignItems="flex-end">
      <Raster key="activity-chart" columns={chart.columns} rows={chart.rows} cells={chart.cells} />
      <Text color={C.faint}>{`${total} ${total === 1 ? 'commit' : 'commits'} · ${ACTIVITY_DAYS}d`}</Text>
    </Box>
  )
}

export async function drawHistory($: $, ui: UI, repo: Repo, status: JSX.Element | null) {
  const { Box, Image, Text } = ui
  const limit = await read($, historyLimitState)
  const hasImages = Image !== undefined && (await read($, hasImagesState))
  const graph = layoutGraph(repo.commits)
  const isHead = (i: number) => i === 0 && repo.operation === null

  const chunks: JSX.Element[] = []
  if (hasImages && Image !== undefined) {
    for (let from = 0; from < repo.commits.length; from += PICTURE_COMMITS) {
      const to = Math.min(repo.commits.length, from + PICTURE_COMMITS)
      const picture = pictureOf(graph, repo.commits, from, to)
      chunks.push(
        <Box key={`commits:${from}`} gap={1}>
          <Box flexShrink={0}>
            <Image
              key={`graph:${from}`}
              source={{ rgba: picture.rgba, width: picture.width, height: picture.height }}
              columns={picture.columns}
              rows={picture.rows}
              alt=" "
            />
          </Box>
          <Box flexDirection="column" flexGrow={1} flexShrink={1}>
            {repo.commits.slice(from, to).map((commit, i) => drawCommitRow($, ui, commit, isHead(from + i), null))}
          </Box>
        </Box>,
      )
    }
  }

  return (
    <Box key="history" flexDirection="column" gap={1}>
      {card(ui, 'history-head', [
        <Box key="history-title" justifyContent="space-between" gap={1}>
          <Text color={C.text} bold>Commit History</Text>
          <Text color={C.faint}>{`${repo.branch || 'HEAD'} · ${repo.commits.length} commits`}</Text>
        </Box>,
        repo.commitDays.length > 0 && drawActivity(ui, repo.commitDays),
      ])}
      {status}
      <Box flexDirection="column">
        {repo.commits.length === 0 && <Text color={C.faint}>No commits yet.</Text>}
        {hasImages
          ? chunks
          : repo.commits.map((commit, i) => {
            const row = graph.rows[i]
            return drawCommitRow($, ui, commit, isHead(i), row === undefined ? null : graphLines(row, graph.width))
          })}
      </Box>
      {repo.commits.length >= limit && (
        <Box>{chip(ui, { key: 'history-more', label: 'Load more', onPress: () => loadMore($) })}</Box>
      )}
    </Box>
  )
}
