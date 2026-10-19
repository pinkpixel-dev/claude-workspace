// Draws the History graph as RGBA pixels for terminals that show images
// (kitty, Ghostty). Pure, like graph.ts: the same layout, smooth curves.
import type { Graph } from './graph'
import { C, laneColor } from './theme'

// Pixels per terminal cell. The terminal scales the picture to its own cells,
// so only the 1:2 shape matters; more pixels make smoother curves.
export const CELL_W = 10
export const CELL_H = 20

const STROKE = 1.5
const DOT = 4.6

const rgb = (hex: string) => [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16)) as [number, number, number]

// Holds the strongest line coverage per pixel and the lane it came from, so
// stamps along one curve don't stack into a darker blur.
class Canvas {
  readonly cover: Float32Array
  readonly lane: Int16Array

  constructor(readonly width: number, readonly height: number) {
    this.cover = new Float32Array(width * height)
    this.lane = new Int16Array(width * height)
  }

  stamp(cx: number, cy: number, radius: number, lane: number) {
    const x0 = Math.max(0, Math.floor(cx - radius - 1))
    const x1 = Math.min(this.width - 1, Math.ceil(cx + radius + 1))
    const y0 = Math.max(0, Math.floor(cy - radius - 1))
    const y1 = Math.min(this.height - 1, Math.ceil(cy + radius + 1))

    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const a = Math.min(1, Math.max(0, radius + 0.5 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy)))
        const at = y * this.width + x
        if (a > (this.cover[at] ?? 0)) {
          this.cover[at] = a
          this.lane[at] = lane
        }
      }
    }
  }
}

// Bends late and settles early, so a line leaves a dot straight down, then curves.
const ease = (t: number) => {
  const u = Math.min(1, Math.max(0, (t - 0.15) / 0.7))

  return u * u * (3 - 2 * u)
}

export type GraphPicture = { rgba: Uint8Array; width: number; height: number; columns: number; rows: number }

// Rows `from` to `to` (exclusive) of the graph, two terminal rows per commit,
// two columns per lane: the same grid the Unicode graph uses.
export function drawGraphPicture(graph: Graph, from: number, to: number, background: string = C.bg): GraphPicture {
  const columns = graph.width * 2
  const rows = (to - from) * 2
  const width = columns * CELL_W
  const height = rows * CELL_H
  const canvas = new Canvas(width, height)
  const xOf = (lane: number) => (lane * 2 + 0.5) * CELL_W
  const yOf = (i: number) => ((i - from) * 2 + 0.5) * CELL_H

  // The row above the slice draws too, so lines enter from the top edge.
  for (let i = Math.max(0, from - 1); i < to; i += 1) {
    for (const edge of graph.rows[i]?.edges ?? []) {
      const [x0, y0, x1, y1] = [xOf(edge.from), yOf(i), xOf(edge.to), yOf(i + 1)]
      const steps = Math.ceil((Math.abs(x1 - x0) + Math.abs(y1 - y0)) * 2)
      for (let s = 0; s <= steps; s += 1) {
        const t = s / steps
        canvas.stamp(x0 + (x1 - x0) * ease(t), y0 + (y1 - y0) * t, STROKE, edge.lane)
      }
    }
  }

  const bg = rgb(background)
  const pixels = new Uint8Array(width * height * 4)
  for (let at = 0; at < width * height; at += 1) {
    const a = canvas.cover[at] ?? 0
    const ink = a > 0 ? rgb(laneColor(canvas.lane[at] ?? 0)) : bg
    pixels.set([0, 1, 2].map(c => Math.round((bg[c] ?? 0) + ((ink[c] ?? 0) - (bg[c] ?? 0)) * a)), at * 4)
    pixels[at * 4 + 3] = 255
  }

  // Dots go on top, each with a ring of background so crossing lines stay apart.
  for (let i = from; i < to; i += 1) {
    const row = graph.rows[i]
    if (row !== undefined) dot(pixels, width, height, xOf(row.col), yOf(i), bg, rgb(laneColor(row.col)))
  }

  return { rgba: pixels, width, height, columns, rows }
}

function dot(pixels: Uint8Array, width: number, height: number, cx: number, cy: number, bg: number[], ink: number[]) {
  const outer = DOT + 1.6
  for (let y = Math.max(0, Math.floor(cy - outer - 1)); y <= Math.min(height - 1, Math.ceil(cy + outer + 1)); y += 1) {
    for (let x = Math.max(0, Math.floor(cx - outer - 1)); x <= Math.min(width - 1, Math.ceil(cx + outer + 1)); x += 1) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      const ring = Math.min(1, Math.max(0, outer + 0.5 - d))
      const fill = Math.min(1, Math.max(0, DOT + 0.5 - d))
      if (ring === 0) continue

      const at = (y * width + x) * 4
      for (let c = 0; c < 3; c += 1) {
        const under = pixels[at + c] ?? 0
        const ringed = under + ((bg[c] ?? 0) - under) * ring
        pixels[at + c] = Math.round(ringed + ((ink[c] ?? 0) - ringed) * fill)
      }
    }
  }
}
