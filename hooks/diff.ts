// A line diff of two texts as unified diff text: no `$`, so the tests can run it directly.
// The This Turn tab compares a file's before-edit snapshot to the disk with it,
// since git only diffs what it has stored.

type Op = { kind: ' ' | '-' | '+'; text: string }

export type LineDiff = { text: string; added: number; removed: number }

// Past this many edits the diff stops searching and shows the middle as replaced whole.
const MAX_EDITS = 1000
const CONTEXT = 3

// Myers' shortest edit script between two line lists; null when it needs more than MAX_EDITS.
function editScript(a: string[], b: string[]): Op[] | null {
  const n = a.length
  const m = b.length
  const max = n + m
  const offset = max + 1
  const v = new Int32Array(2 * max + 3)
  // Each step keeps the slice of `v` it started from, k = -d-1 to d+1, to walk back through.
  const trace: Int32Array[] = []
  const at = (row: Int32Array, d: number, k: number) => row[k + d + 1] ?? 0

  let found = -1
  for (let d = 0; d <= Math.min(max, MAX_EDITS) && found < 0; d += 1) {
    trace.push(v.slice(offset - d - 1, offset + d + 2))
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && (v[offset + k - 1] ?? 0) < (v[offset + k + 1] ?? 0))
      let x = down ? v[offset + k + 1] ?? 0 : (v[offset + k - 1] ?? 0) + 1
      let y = x - k
      while (x < n && y < m && a[x] === b[y]) {
        x += 1
        y += 1
      }
      v[offset + k] = x
      if (x >= n && y >= m) {
        found = d
        break
      }
    }
  }
  if (found < 0) return null

  const ops: Op[] = []
  let x = n
  let y = m
  for (let d = found; d >= 0; d -= 1) {
    const row = trace[d] ?? new Int32Array(0)
    const k = x - y
    const prevK = k === -d || (k !== d && at(row, d, k - 1) < at(row, d, k + 1)) ? k + 1 : k - 1
    const prevX = at(row, d, prevK)
    const prevY = prevX - prevK
    while (x > prevX && y > prevY) {
      ops.push({ kind: ' ', text: a[x - 1] ?? '' })
      x -= 1
      y -= 1
    }
    if (d > 0) {
      if (x === prevX) ops.push({ kind: '+', text: b[y - 1] ?? '' })
      else ops.push({ kind: '-', text: a[x - 1] ?? '' })
    }
    x = prevX
    y = prevY
  }

  return ops.reverse()
}

function opsOf(a: string[], b: string[]): Op[] {
  // Most edits touch a small middle; only that part goes through the search.
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1
  let end = 0
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end += 1

  const midA = a.slice(start, a.length - end)
  const midB = b.slice(start, b.length - end)
  const middle = editScript(midA, midB) ?? [
    ...midA.map(text => ({ kind: '-' as const, text })),
    ...midB.map(text => ({ kind: '+' as const, text })),
  ]
  const same = (lines: string[]) => lines.map(text => ({ kind: ' ' as const, text }))

  return [...same(a.slice(0, start)), ...middle, ...same(a.slice(a.length - end))]
}

const linesOf = (text: string) => (text === '' ? [] : text.split('\n'))

// `before` is null for a file that didn't exist yet.
export function lineDiff(path: string, before: string | null, after: string): LineDiff {
  const ops = opsOf(linesOf(before ?? ''), linesOf(after))
  const added = ops.filter(op => op.kind === '+').length
  const removed = ops.filter(op => op.kind === '-').length
  if (added === 0 && removed === 0) return { text: '', added, removed }

  // Line numbers on each side before every op, so a hunk can name where it starts.
  const oldAt: number[] = []
  const newAt: number[] = []
  let oldLine = 0
  let newLine = 0
  for (const op of ops) {
    oldAt.push(oldLine)
    newAt.push(newLine)
    if (op.kind !== '+') oldLine += 1
    if (op.kind !== '-') newLine += 1
  }

  // Changed ops, grouped into hunks wherever the unchanged run between them is short.
  const changed = ops.flatMap((op, i) => (op.kind === ' ' ? [] : [i]))
  const groups: [number, number][] = []
  for (const i of changed) {
    const last = groups[groups.length - 1]
    if (last !== undefined && i - last[1] <= CONTEXT * 2 + 1) last[1] = i
    else groups.push([i, i])
  }

  const hunks = groups.map(([first, last]) => {
    const from = Math.max(0, first - CONTEXT)
    const to = Math.min(ops.length - 1, last + CONTEXT)
    const slice = ops.slice(from, to + 1)
    const oldCount = slice.filter(op => op.kind !== '+').length
    const newCount = slice.filter(op => op.kind !== '-').length
    const oldStart = (oldAt[from] ?? 0) + (oldCount === 0 ? 0 : 1)
    const newStart = (newAt[from] ?? 0) + (newCount === 0 ? 0 : 1)
    const body = slice.map(op => `${op.kind}${op.text}`).join('\n')

    return `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@\n${body}\n`
  })

  const header = `--- ${before === null ? '/dev/null' : `a/${path}`}\n+++ b/${path}\n`

  return { text: header + hunks.join(''), added, removed }
}

// One hunk of a tool's structured patch: lines start with ' ', '-' or '+'.
export type Hunk = { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] }

const NO_NEWLINE = '\\'

// The text before a change, rebuilt by undoing its hunks on the text after it.
// Null when the hunks don't line up with `after`, as when the file moved on since.
export function unapplyHunks(after: string, hunks: Hunk[], isDeleted = false): string | null {
  const lines = after === '' ? [] : after.split('\n')
  const ordered = [...hunks].sort((a, b) => b.newStart - a.newStart)

  for (const hunk of ordered) {
    const body = hunk.lines.filter(line => !line.startsWith(NO_NEWLINE))
    const newSide = body.filter(line => !line.startsWith('-')).map(line => line.slice(1))
    const oldSide = body.filter(line => !line.startsWith('+')).map(line => line.slice(1))
    const at = hunk.newLines === 0 ? hunk.newStart : hunk.newStart - 1
    const current = lines.slice(at, at + newSide.length)
    if (at < 0 || current.length !== newSide.length || current.some((line, i) => line !== newSide[i])) return null

    lines.splice(at, newSide.length, ...oldSide)
  }

  // A deleted file's hunks only hold its lines, so its last newline comes back
  // unless the patch says the file had none.
  const hadNoNewline = hunks.some(hunk => hunk.lines.some(line => line.startsWith(NO_NEWLINE)))

  return isDeleted && lines.length > 0 && !hadNoNewline ? `${lines.join('\n')}\n` : lines.join('\n')
}
