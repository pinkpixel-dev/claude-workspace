// Pure layout for the History graph: no `$`, so the tests can run it directly.
// Each commit sits in a lane; lanes carry the sha they wait for down the list.
import type { Commit } from '../types'
import { C, laneColor } from './theme'

// A line from one commit's row to the next: `from` and `to` are lanes, `lane`
// is the one whose color it takes.
export type GraphEdge = { from: number; to: number; lane: number }

export type GraphRow = {
  // The commit's own lane.
  col: number
  // Lanes with a line through the commit's row, its own included.
  lanes: number[]
  // Lines from this row down to the next one.
  edges: GraphEdge[]
}

export type Graph = { rows: GraphRow[]; width: number }

export function layoutGraph(commits: Pick<Commit, 'sha' | 'parents'>[]): Graph {
  let lanes: (string | null)[] = []
  const rows: GraphRow[] = []
  let width = 1

  const claim = (sha: string) => {
    const free = lanes.indexOf(null)
    const at = free < 0 ? lanes.length : free
    lanes[at] = sha

    return at
  }

  commits.forEach((commit, i) => {
    const found = lanes.indexOf(commit.sha)
    const col = found < 0 ? claim(commit.sha) : found

    // Other lanes waiting on this commit end here: their lines already bent in.
    lanes = lanes.map((sha, k) => (k !== col && sha === commit.sha ? null : sha))
    const through = lanes.flatMap((sha, k) => (sha === null ? [] : [k]))

    // The first parent carries on in this lane; the others join a lane or open one.
    const fed = new Set<number>()
    const [first, ...others] = commit.parents
    lanes[col] = first ?? null
    if (first !== undefined) fed.add(col)
    const joined = others.map(parent => {
      const at = lanes.indexOf(parent)
      if (at >= 0) return at

      const opened = claim(parent)
      fed.add(opened)

      return opened
    })

    const next = commits[i + 1]
    const nextCol = next === undefined ? -1 : lanes.indexOf(next.sha)
    const target = (k: number) => (next !== undefined && lanes[k] === next.sha ? nextCol : k)

    const edges: GraphEdge[] = []
    lanes.forEach((sha, k) => {
      if (sha !== null && !fed.has(k)) edges.push({ from: k, to: target(k), lane: k })
    })
    for (const k of [...fed, ...joined.filter(k => !fed.has(k))]) {
      edges.push({ from: col, to: target(k), lane: k })
    }

    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop()
    width = Math.max(width, col + 1, lanes.length)
    rows.push({ col, lanes: through, edges })
  })

  return { rows, width }
}

// One drawn cell of the Unicode graph: a box glyph and its lane color.
export type Cell = { glyph: string; color: string }

const UP = 1
const DOWN = 2
const LEFT = 4
const RIGHT = 8

const GLYPHS: Record<number, string> = {
  [UP | DOWN]: '│',
  [LEFT | RIGHT]: '─',
  [UP | RIGHT]: '╰',
  [UP | LEFT]: '╯',
  [DOWN | RIGHT]: '╭',
  [DOWN | LEFT]: '╮',
  [UP | DOWN | RIGHT]: '├',
  [UP | DOWN | LEFT]: '┤',
  [LEFT | RIGHT | DOWN]: '┬',
  [LEFT | RIGHT | UP]: '┴',
  [UP | DOWN | LEFT | RIGHT]: '┼',
  [UP]: '╵',
  [DOWN]: '╷',
}

const blank = (columns: number): Cell[] => Array.from({ length: columns }, () => ({ glyph: ' ', color: C.faint }))

// The commit's row (its dot and the lines passing it) and the row under it
// (lines bending toward the next commit), two cells to a lane.
export function graphLines(row: GraphRow, width: number, dot = '●'): [Cell[], Cell[]] {
  const columns = width * 2
  const top = blank(columns)
  for (const k of row.lanes) top[k * 2] = { glyph: k === row.col ? dot : '│', color: laneColor(k) }

  const dirs = new Array<number>(columns).fill(0)
  const tones = new Array<number>(columns).fill(-1)
  const mark = (at: number, dir: number, lane: number) => {
    dirs[at] = (dirs[at] ?? 0) | dir
    tones[at] = Math.max(tones[at] ?? -1, lane)
  }

  for (const edge of row.edges) {
    const a = edge.from * 2
    const b = edge.to * 2
    if (a === b) {
      mark(a, UP | DOWN, edge.lane)
      continue
    }

    const step = a < b ? 1 : -1
    mark(a, UP | (step > 0 ? RIGHT : LEFT), edge.lane)
    for (let at = a + step; at !== b; at += step) mark(at, LEFT | RIGHT, edge.lane)
    mark(b, DOWN | (step > 0 ? LEFT : RIGHT), edge.lane)
  }

  const bottom = dirs.map((dir, at): Cell =>
    dir === 0 ? { glyph: ' ', color: C.faint } : { glyph: GLYPHS[dir] ?? '┼', color: laneColor(tones[at] ?? 0) },
  )

  return [top, bottom]
}

// Cells as runs of one color, so a row draws as a few Texts instead of one per cell.
export const runsOf = (cells: Cell[]) =>
  cells.reduce<Cell[]>((runs, cell) => {
    const last = runs[runs.length - 1]
    if (last !== undefined && (last.color === cell.color || cell.glyph === ' ')) last.glyph += cell.glyph
    else runs.push({ ...cell })

    return runs
  }, [])
