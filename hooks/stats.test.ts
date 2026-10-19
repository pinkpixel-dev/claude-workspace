import { describe, expect, test } from 'claude-code/testing'

import { fitSegments, modelName, statSegments, until } from './stats'

const NOW = Date.parse('2026-10-19T12:00:00Z')

const textOf = (segments: ReturnType<typeof statSegments>) =>
  segments.map(segment => segment.runs.map(run => run.text).join('')).join(' · ')

describe('stats', () => {
  test('model ids read as their family and version', async () => {
    expect(modelName('claude-opus-5-5')).toBe('Opus 5.5')
    expect(modelName('claude-sonnet-5-5[1m]')).toBe('Sonnet 5.5')
    expect(modelName('claude-haiku-5-20261001')).toBe('Haiku 5')
    expect(modelName('gpt-x')).toBe('gpt-x')
  })

  test('reset times read short', async () => {
    expect(until('2026-10-19T14:48:00Z', NOW)).toBe('2h48m')
    expect(until('2026-10-22T21:00:00Z', NOW)).toBe('3d 9h')
    expect(until('2026-10-19T12:12:00Z', NOW)).toBe('12m')
    expect(until(undefined, NOW)).toBe('')
  })

  test('the bar lists usage, context, model and cost in order', async () => {
    const segments = statSegments({
      fiveHour: { percent: 9, resetsAt: '2026-10-19T14:48:00Z' },
      sevenDay: { percent: 51 },
      contextPercent: 9,
      model: 'claude-opus-5-5',
      effort: 'high',
      costUsd: 0.66,
    }, NOW)

    expect(textOf(segments)).toBe('5h ○ 9% 2h48m · 7d ◑ 51% · ctx ▱▱▱▱ 9% · Opus 5.5 high · $0.66')
  })

  test('a narrow pane drops segments from the right', async () => {
    const segments = statSegments({ fiveHour: { percent: 9 }, sevenDay: { percent: 51 }, model: 'claude-opus-5-5', costUsd: 1 }, NOW)

    expect(fitSegments(segments, 200).map(one => one.key)).toEqual(['5h', '7d', 'model', 'cost'])
    expect(fitSegments(segments, 20).map(one => one.key)).toEqual(['5h', '7d'])
    expect(fitSegments(segments, 3)).toEqual([])
  })
})
