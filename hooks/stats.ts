// The stats bar's figures as text runs, and which of them fit a width: no `$`,
// so the tests can run it directly.
import type { Limit, Stats } from '../types'
import { C } from './theme'

export type Run = { text: string; color: string; bold?: boolean }

export type Segment = { key: string; runs: Run[] }

const RING = ['○', '◔', '◑', '◕', '●']

export const ring = (percent: number) => RING[Math.min(4, Math.max(0, Math.round(percent / 25)))] ?? '○'

// Green while there's room, amber past half, red past 80%.
export const levelOf = (percent: number) => (percent >= 80 ? C.deleted : percent >= 50 ? C.modified : C.added)

export function meter(percent: number, cells = 4) {
  const on = Math.min(cells, Math.max(0, Math.round((percent / 100) * cells)))

  return { on: '▰'.repeat(on), off: '▱'.repeat(cells - on) }
}

// Time until an ISO moment, short form: 3d 9h, 2h48m, 12m; '' when unknown.
export function until(iso: string | undefined, now: number) {
  const at = iso === undefined ? Number.NaN : Date.parse(iso)
  if (Number.isNaN(at)) return ''

  const mins = Math.max(0, Math.round((at - now) / 60000))
  const days = Math.floor(mins / 1440)
  const hours = Math.floor((mins % 1440) / 60)

  return days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h${mins % 60}m` : `${mins}m`
}

export const usd = (n: number) => `$${n < 10 ? n.toFixed(2) : n.toFixed(1)}`

// claude-opus-5-5[1m] reads as Opus 5.5; anything else passes through.
export function modelName(id: string) {
  const match = id.replace(/\[.*\]$/, '').match(/^claude-([a-z]+)-(\d+)(?:-(\d+))?/)
  if (match === null) return id

  const [, family = '', major = '', minor] = match
  const name = family.charAt(0).toUpperCase() + family.slice(1)

  return minor !== undefined && minor.length <= 2 ? `${name} ${major}.${minor}` : `${name} ${major}`
}

const limitSegment = (key: string, label: string, limit: Limit, now: number): Segment => {
  const left = until(limit.resetsAt, now)

  return {
    key,
    runs: [
      { text: `${label} `, color: C.faint },
      { text: `${ring(limit.percent)} `, color: levelOf(limit.percent) },
      { text: `${Math.round(limit.percent)}%`, color: C.text, bold: true },
      ...(left === '' ? [] : [{ text: ` ${left}`, color: C.muted }]),
    ],
  }
}

// In the order they give way when the pane narrows: the last one goes first.
export function statSegments(stats: Stats, now: number): Segment[] {
  const segments: Segment[] = []
  if (stats.fiveHour !== undefined) segments.push(limitSegment('5h', '5h', stats.fiveHour, now))
  if (stats.sevenDay !== undefined) segments.push(limitSegment('7d', '7d', stats.sevenDay, now))
  if (stats.contextPercent !== undefined) {
    const fill = meter(stats.contextPercent)
    segments.push({
      key: 'ctx',
      runs: [
        { text: 'ctx ', color: C.faint },
        { text: fill.on, color: levelOf(stats.contextPercent) },
        { text: `${fill.off} `, color: C.line },
        { text: `${Math.round(stats.contextPercent)}%`, color: C.text, bold: true },
      ],
    })
  }
  if (stats.model !== undefined) {
    segments.push({
      key: 'model',
      runs: [
        { text: modelName(stats.model), color: C.accent, bold: true },
        ...(stats.effort === undefined ? [] : [{ text: ` ${stats.effort}`, color: C.muted }]),
      ],
    })
  }
  if (stats.costUsd !== undefined) segments.push({ key: 'cost', runs: [{ text: usd(stats.costUsd), color: C.text }] })

  return segments
}

export const SEPARATOR = ' · '

const widthOf = (segment: Segment) => segment.runs.reduce((sum, run) => sum + run.text.length, 0)

// The leading segments that fit `width` with separators between them.
export function fitSegments(segments: Segment[], width: number) {
  let used = 0

  return segments.filter((segment, i) => {
    const next = used + (i === 0 ? 0 : SEPARATOR.length) + widthOf(segment)
    if (next > width || used < 0) {
      used = -1
      return false
    }
    used = next
    return true
  })
}
