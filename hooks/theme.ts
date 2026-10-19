// The pane paints its own dark surface so it reads the same in any theme.
export const C = {
  // Layers, darkest first: the canvas, cards on it, chips and bars on cards.
  bg: '#18191d',
  card: '#212228',
  raised: '#2a2b32',
  hover: '#32343c',
  line: '#34363d',
  text: '#ececf1',
  muted: '#9b9da8',
  faint: '#6c6e79',
  // The one accent: the active tab, the current branch, the main action.
  accent: '#e58fa2',
  accentHover: '#f0b3c0',
  added: '#62d394',
  modified: '#e6b45a',
  deleted: '#f2727c',
  renamed: '#a9b8f5',
  busy: '#8fc7f2',
} as const

// History graph lanes only: the first is the accent, the rest tell side branches apart.
export const LANES = [C.accent, '#7cc9c1', '#b8a6ee', '#d8b98c', '#8fb3e8'] as const

export const laneColor = (lane: number) => LANES[lane % LANES.length] ?? C.accent

const channels = (hex: string) => [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16))

// `color` mixed into `base` by `amount` (0 to 1): a badge's fill, a flashed row.
export const tint = (color: string, amount = 0.22, base: string = C.card) => {
  const [r1 = 0, g1 = 0, b1 = 0] = channels(color)
  const [r2 = 0, g2 = 0, b2 = 0] = channels(base)
  const mix = (a: number, b: number) => Math.round(b + (a - b) * amount).toString(16).padStart(2, '0')

  return `#${mix(r1, r2)}${mix(g1, g2)}${mix(b1, b2)}`
}

// A `#rrggbb` token as the 0x00RRGGBB number Raster cells take.
export const rgbOf = (hex: string) => parseInt(hex.slice(1, 7), 16)

export const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
