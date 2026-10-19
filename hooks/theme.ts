// The pane paints its own dark surface so it reads the same in any theme.
export const C = {
  bg: '#1b1c20',
  raised: '#26272d',
  hover: '#2e3037',
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

export const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
