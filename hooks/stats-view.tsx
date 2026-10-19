// The stats bar under the tabs: usage windows, context, model and cost, from
// the same `session.measure` figures the status line reads. It can be switched
// off, and that choice is kept in $.store across sessions.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, SessionMeasureInput } from 'claude-code'

import type { Limit, Stats } from '../types'
import { fitSegments, SEPARATOR, statSegments } from './stats'
import { C } from './theme'
import type { UI } from './ui'

const showStatsState = atom({ plugin: 'workspace', key: 'showStats' } as const, true)
const statsState = atom({ plugin: 'workspace', key: 'stats' } as const, {})

type $ = EngineInterface

const STORE_KEY = 'statsBar'

export function fromUsage(usage: Omit<SessionMeasureInput, 'changed'>): Partial<Stats> {
  const pick = (kind: string): Limit | undefined => {
    const found = usage.rateLimits.find(one => one.kind === kind)
    return found && { percent: found.percentUsed, resetsAt: found.resetsAt }
  }

  return {
    fiveHour: pick('five_hour'),
    sevenDay: pick('seven_day'),
    contextPercent: usage.context.percent,
    costUsd: usage.cost?.usd,
  }
}

export async function loadStats($: $) {
  const saved = await $.store.get(STORE_KEY).catch(() => undefined)
  if (saved === false) await update($, showStatsState, () => false)

  const [usage, model] = await Promise.all([$.session.usage().catch(() => null), $.session.model().catch(() => '')])
  await update($, statsState, current => ({
    ...current,
    ...(usage === null ? {} : fromUsage(usage)),
    ...(model === '' ? {} : { model }),
  }))
}

export function measure($: $, usage: Omit<SessionMeasureInput, 'changed'>) {
  return update($, statsState, current => ({ ...current, ...fromUsage(usage) }))
}

export function setModel($: $, model: string, effort: string | number | undefined) {
  return update($, statsState, current => ({ ...current, model, effort: effort === undefined ? undefined : String(effort) }))
}

export async function toggleStats($: $) {
  const next = !(await read($, showStatsState))
  await update($, showStatsState, () => next)
  await $.store.set(STORE_KEY, next).catch(() => undefined)
}

export function drawStats(ui: UI, stats: Stats, width: number) {
  const { Box, Text } = ui
  const shown = fitSegments(statSegments(stats, Date.now()), width)

  return (
    <Box key="stats" gap={0} paddingX={2} marginBottom={1} height={1} overflow="hidden">
      {shown.length === 0 && <Text color={C.faint}>No usage reported yet.</Text>}
      {shown.flatMap((segment, i) => [
        i > 0 && <Text key={`stat-sep:${segment.key}`} color={C.line}>{SEPARATOR}</Text>,
        ...segment.runs.map((run, j) => (
          <Text key={`stat:${segment.key}:${j}`} color={run.color} bold={run.bold}>{run.text}</Text>
        )),
      ])}
    </Box>
  )
}
