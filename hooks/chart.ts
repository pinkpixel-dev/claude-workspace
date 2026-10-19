// Pure helpers for the small commit-activity chart: no `$`, so the tests can run them.
import { toBase64 } from './base64'
import { rgbOf } from './theme'

// How many days the chart covers, newest last.
export const ACTIVITY_DAYS = 14

const DAY_MS = 24 * 60 * 60 * 1000

// Reads `git log --format=%ct` (commit times in seconds) into commits per
// 24-hour window back from `now`, oldest first. Lines that aren't times drop out.
export const parseCommitDays = (out: string, now: number, days = ACTIVITY_DAYS) => {
  const counts = new Array<number>(days).fill(0)

  for (const line of out.split('\n')) {
    if (!/^\d+$/.test(line.trim())) continue

    const ago = Math.floor((now - Number(line.trim()) * 1000) / DAY_MS)
    if (ago >= 0 && ago < days) counts[days - 1 - ago] = (counts[days - 1 - ago] ?? 0) + 1
  }

  return counts
}

// Eighth blocks, empty to full: one cell holds eight steps of a bar.
const BLOCKS = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']

// Raster cells for a bar per day, `rows` tall, a gap of one column between
// bars. A day with no commits shows a faint baseline instead of nothing.
export function activityCells(counts: number[], rows: number, ink: string, base: string, background: string) {
  const columns = Math.max(1, counts.length * 2 - 1)
  const top = Math.max(1, ...counts)
  const words = new Uint32Array(columns * rows * 3)
  const bg = rgbOf(background)

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const count = col % 2 === 0 ? counts[col / 2] ?? 0 : 0
      // Eighths of this bar that reach into this row, counted from the bottom row up.
      const eighths = Math.round((count / top) * rows * 8)
      const inRow = Math.min(8, Math.max(0, eighths - (rows - 1 - row) * 8))
      const isBaseline = col % 2 === 0 && count === 0 && row === rows - 1
      const glyph = isBaseline ? '▁' : BLOCKS[count > 0 && row === rows - 1 ? Math.max(1, inRow) : inRow] ?? ' '
      const at = (row * columns + col) * 3
      words[at] = glyph.codePointAt(0) ?? 32
      words[at + 1] = rgbOf(isBaseline ? base : ink)
      words[at + 2] = bg
    }
  }

  return { cells: toBase64(new Uint8Array(words.buffer)), columns, rows }
}
