// Pure helpers for the Files tab's markers: no `$`, so the tests can run them directly.
// Git names paths from the repo root and tools name them absolutely, while the
// tree names them from the session's folder; these map one onto the other.
import type { Change, Touch } from '../types'
import { colorOf, isConflicted, letterOf } from './git'
import { C } from './theme'

// The tools whose calls mark a file, and how.
export const FILE_TOOLS: Record<string, Touch['kind']> = {
  Read: 'read',
  Edit: 'edit',
  Write: 'edit',
  NotebookEdit: 'edit',
}

// `path` relative to the folder `base`: '' for the folder itself, null outside it.
export const relativeTo = (base: string, path: string) => {
  const from = base.replace(/\/+$/, '')
  if (path === from) return ''

  return path.startsWith(`${from}/`) ? path.slice(from.length + 1) : null
}

// A tool's path as the tree names it; null when it lies outside the session's folder.
export const treePathOf = (cwd: string, path: string) => {
  if (!path.startsWith('/')) return path.replace(/^\.\//, '') || null
  if (cwd === '') return null

  const relative = relativeTo(cwd, path)

  return relative === '' ? null : relative
}

export type TreeStatus = {
  // A letter for each changed file and each folder above one, by tree path.
  letters: Map<string, string>
  // Untracked folders git lists whole, so every path under them reads as `U`.
  untrackedDirs: string[]
}

// The letter VS Code's explorer shows: a conflict, else the worktree side, else the index side.
const letterFor = (change: Change) =>
  isConflicted(change) ? '!' : letterOf(change.work !== ' ' ? change.work : change.index)

export const treeStatus = (changes: Change[], root: string, cwd: string): TreeStatus => {
  const status: TreeStatus = { letters: new Map(), untrackedDirs: [] }
  const prefix = root === '' || cwd === '' ? null : relativeTo(root, cwd)
  if (prefix === null) return status

  for (const change of changes) {
    const path = prefix === '' ? change.path : relativeTo(prefix, change.path)
    if (path === null || path === '') continue

    const letter = letterFor(change)
    const clean = path.replace(/\/$/, '')
    if (path.endsWith('/')) status.untrackedDirs.push(clean)
    status.letters.set(clean, letter)

    // Folders above it take the first letter that reaches them.
    const parts = clean.split('/')
    for (let i = 1; i < parts.length; i += 1) {
      const dir = parts.slice(0, i).join('/')
      if (!status.letters.has(dir)) status.letters.set(dir, letter)
    }
  }

  return status
}

export const letterAt = (status: TreeStatus, path: string) =>
  status.letters.get(path) ??
  (status.untrackedDirs.some(dir => path.startsWith(`${dir}/`)) ? 'U' : undefined)

export const toneOf = (letter: string) => (letter === '!' ? C.deleted : colorOf(letter))

export const markOf = (kind: Touch['kind']) => (kind === 'edit' ? '✎' : '◆')

// Records a touch, keeping the newest last; an edit outranks a read of the same file.
export const withTouch = (list: Touch[], path: string, kind: Touch['kind'], isRunning: boolean) => {
  const before = list.find(one => one.path === path)
  const rest = list.filter(one => one.path !== path)
  const merged = before?.kind === 'edit' ? 'edit' : kind

  return [...rest, { path, kind: merged, isRunning }]
}

// What the prompt box gets for a path: quoted when it has spaces, spaced off what came before.
export const mentionText = (path: string, before: string) => {
  const lead = before === '' || /\s$/.test(before) ? '' : ' '
  const name = /\s/.test(path) ? `"${path}"` : path

  return `${lead}@${name} `
}
