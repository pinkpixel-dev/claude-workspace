import { expect, test } from 'claude-code/testing'

import { toBase64 } from './base64'
import { activityCells, parseCommitDays } from './chart'
import { graphLines, layoutGraph, runsOf } from './graph'
import { CELL_H, CELL_W, drawGraphPicture } from './graph-image'
import { hunkStats } from './git'
import { fileIcon } from './icons'
import { C, laneColor, tint } from './theme'

// Newest first, as git log prints them: B merges side branch C-D back into main.
const COMMITS = [
  { sha: 'A', parents: ['B'] },
  { sha: 'B', parents: ['E', 'C'] },
  { sha: 'C', parents: ['D'] },
  { sha: 'D', parents: ['E'] },
  { sha: 'E', parents: [] },
]

const text = (cells: { glyph: string }[]) => cells.map(cell => cell.glyph).join('')

test('layoutGraph puts a merged branch in its own lane and brings it back', () => {
  const { rows, width } = layoutGraph(COMMITS)

  expect(width).toBe(2)
  expect(rows.map(row => row.col)).toEqual([0, 0, 1, 1, 0])
  expect(rows[1]?.edges).toEqual([{ from: 0, to: 0, lane: 0 }, { from: 0, to: 1, lane: 1 }])
  expect(rows[3]?.edges).toEqual([{ from: 0, to: 0, lane: 0 }, { from: 1, to: 0, lane: 1 }])
  // The side lane has bent back in before E, so only main runs through its row.
  expect(rows[4]?.lanes).toEqual([0])
})

test('layoutGraph keeps a straight history in one lane', () => {
  const { rows, width } = layoutGraph([{ sha: 'x', parents: ['y'] }, { sha: 'y', parents: ['z'] }, { sha: 'z', parents: [] }])

  expect(width).toBe(1)
  expect(rows.every(row => row.col === 0)).toBe(true)
})

test('graphLines draws the fork and the join with rounded corners', () => {
  const graph = layoutGraph(COMMITS)
  const [forkTop, forkBottom] = graphLines(graph.rows[1]!, graph.width)
  const [sideTop] = graphLines(graph.rows[2]!, graph.width)
  const [, joinBottom] = graphLines(graph.rows[3]!, graph.width)

  expect(text(forkTop)).toBe('●   ')
  expect(text(forkBottom)).toBe('├─╮ ')
  expect(text(sideTop)).toBe('│ ● ')
  expect(text(joinBottom)).toBe('├─╯ ')
  expect(forkBottom[2]?.color).toBe(laneColor(1))
  expect(forkTop[0]?.color).toBe(C.accent)
})

test('runsOf joins cells of one color and folds spaces into the run before', () => {
  const runs = runsOf([
    { glyph: '│', color: 'a' },
    { glyph: ' ', color: 'x' },
    { glyph: '●', color: 'b' },
    { glyph: ' ', color: 'x' },
  ])

  expect(runs).toEqual([{ glyph: '│ ', color: 'a' }, { glyph: '● ', color: 'b' }])
})

test('drawGraphPicture paints dots in their lane color on the canvas', () => {
  const graph = layoutGraph(COMMITS)
  const picture = drawGraphPicture(graph, 0, COMMITS.length)
  const pixel = (x: number, y: number) => {
    const at = (y * picture.width + x) * 4
    return `#${[0, 1, 2].map(c => (picture.rgba[at + c] ?? 0).toString(16).padStart(2, '0')).join('')}`
  }

  expect(picture.columns).toBe(4)
  expect(picture.rows).toBe(10)
  expect(picture.width).toBe(4 * CELL_W)
  expect(picture.height).toBe(10 * CELL_H)
  // A's dot, at the center of its lane and row.
  expect(pixel(CELL_W / 2, CELL_H / 2)).toBe(C.accent)
  // C's dot sits in the side lane, two rows per commit down.
  expect(pixel(CELL_W * 2 + CELL_W / 2, 2 * 2 * CELL_H + CELL_H / 2)).toBe(laneColor(1))
  // Far right on A's row there is nothing but canvas.
  expect(pixel(picture.width - 1, CELL_H / 2)).toBe(C.bg)
})

test('parseCommitDays counts commits per day back from now, oldest first', () => {
  const now = 1_700_000_000_000
  const out = [now / 1000 - 60, now / 1000 - 120, now / 1000 - 86400 * 2 - 5, now / 1000 - 86400 * 30, 'junk'].join('\n')
  const days = parseCommitDays(out, now, 4)

  expect(days).toEqual([0, 1, 0, 2])
})

test('activityCells packs a bar per day with a gap between', () => {
  const chart = activityCells([0, 2, 4], 2, '#ff0000', '#00ff00', '#000000')
  const bytes = Uint8Array.from(atob(chart.cells), char => char.charCodeAt(0))
  const words = new Uint32Array(bytes.buffer)
  const cell = (row: number, col: number) => {
    const at = (row * chart.columns + col) * 3
    return { glyph: String.fromCodePoint(words[at] ?? 0), fg: words[at + 1] }
  }

  expect(chart.columns).toBe(5)
  expect(chart.rows).toBe(2)
  // An empty day is a baseline in the base color.
  expect(cell(1, 0)).toEqual({ glyph: '▁', fg: 0x00ff00 })
  // The busiest day fills both rows; half of it fills the bottom row only.
  expect(cell(0, 4).glyph).toBe('█')
  expect(cell(1, 2).glyph).toBe('█')
  expect(cell(0, 2).glyph).toBe(' ')
})

test('toBase64 matches the standard padded encoding', () => {
  for (const sample of ['', 'a', 'ab', 'abc', 'hello workspace']) {
    expect(toBase64(new TextEncoder().encode(sample))).toBe(btoa(sample))
  }
})

test('hunkStats reads the new side lines and counts', () => {
  const stats = hunkStats('@@ -10,4 +12,5 @@ function draw() {\n a\n-b\n+c\n+d\n e\n')

  expect(stats).toEqual({ from: 12, to: 16, context: 'function draw() {', added: 2, removed: 1 })
  expect(hunkStats('@@ -1 +1 @@\n-a\n+b\n')).toMatchObject({ from: 1, to: 1, added: 1, removed: 1 })
})

test('fileIcon picks a glyph by kind and tint mixes toward the card', () => {
  expect(fileIcon('register.tsx')).toBe('<>')
  expect(fileIcon('package.json')).toBe('{}')
  expect(fileIcon('README.md')).toBe('¶ ')
  expect(fileIcon('Makefile')).toBe('· ')
  expect(tint('#ffffff', 0, '#000000')).toBe('#000000')
  expect(tint('#ffffff', 1, '#000000')).toBe('#ffffff')
})
