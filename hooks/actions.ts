// What the Files tab's buttons do. Drawing never runs these: handlers and
// events do, and the state they write redraws the pane. Source Control's
// actions live in git-actions.ts.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Entry } from '../types'
import { CODE_LIMIT } from './git'
import { fail, refreshRepo } from './repo'
import { mentionText } from './tree'

const cwdState = atom({ plugin: 'workspace', key: 'cwd' } as const, '')
const dirState = atom({ plugin: 'workspace', key: 'dir' } as const, '')
const draftState = atom({ plugin: 'workspace', key: 'draft' } as const, '')
const entriesState = atom({ plugin: 'workspace', key: 'entries' } as const, [])
const isEditingState = atom({ plugin: 'workspace', key: 'isEditing' } as const, false)
const openFileState = atom({ plugin: 'workspace', key: 'openFile' } as const, null)

type $ = EngineInterface

const MAX_OPEN_BYTES = 1024 * 1024

const join = (parent: string, name: string) => (parent ? `${parent}/${name}` : name)
const parentOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')

// Files

export async function refreshDir($: $) {
  const current = await read($, dirState)
  const listed = await $.fs.list(current || undefined).catch(() => null)

  if (listed === null && current !== '') {
    await update($, dirState, () => '')
    return refreshDir($)
  }

  const sorted: Entry[] = (listed ?? [])
    .filter(entry => entry.name !== '.git')
    .map(entry => ({ name: entry.name, kind: entry.kind, size: entry.size }))
    .sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : b.kind === 'dir' ? 1 : 0,
    )
  await update($, entriesState, () => sorted)
}

export async function openEntry($: $, entry: Entry) {
  const path = join(await read($, dirState), entry.name)

  if (entry.kind === 'dir') {
    await update($, dirState, () => path)
    return refreshDir($)
  }

  await openPath($, path)
}

export async function openPath($: $, path: string) {
  try {
    const { size } = await $.fs.stat(path)
    if (size > MAX_OPEN_BYTES) {
      await update($, openFileState, () => ({ path, text: '', readOnlyReason: 'Too large to open here.' }))
    } else {
      const text = await $.fs.read(path)
      const isBinary = text.includes('\u0000')
      const isLong = text.length > CODE_LIMIT
      await update($, openFileState, () => ({
        path,
        text: isBinary ? '' : text.slice(0, CODE_LIMIT),
        readOnlyReason: isBinary ? 'Binary file.' : isLong ? 'Too large to edit here, showing the start.' : undefined,
      }))
    }
    await update($, isEditingState, () => false)
  } catch (error) {
    await fail($, error)
  }
}

// Jumps straight to a folder, as the Files tab's path crumbs do; '' is the top.
export async function openDir($: $, path: string) {
  await update($, dirState, () => path)
  await refreshDir($)
}

export async function goUp($: $) {
  await update($, dirState, current => parentOf(current))
  await refreshDir($)
}

export async function closeFile($: $) {
  await update($, openFileState, () => null)
  await update($, isEditingState, () => false)
}

export async function startEdit($: $) {
  const file = await read($, openFileState)
  if (file === null || file.readOnlyReason) return

  await update($, draftState, () => file.text)
  await update($, isEditingState, () => true)
}

export function cancelEdit($: $) {
  return update($, isEditingState, () => false)
}

export async function save($: $, text: string) {
  const file = await read($, openFileState)
  if (file === null) return

  try {
    await $.fs.write(file.path, text)
    await update($, openFileState, () => ({ ...file, text }))
    await update($, isEditingState, () => false)
    $.ui.toast(`Saved ${file.path}`)
    await refreshRepo($)
  } catch (error) {
    await fail($, error)
  }
}

// Picks up what a git step did to the open file: reloads it, or closes it once it's gone.
export async function reloadFile($: $) {
  const file = await read($, openFileState)
  if (file === null || (await read($, isEditingState))) return

  const exists = await $.fs.stat(file.path).then(() => true, () => false)
  if (exists) await openPath($, file.path)
  else await closeFile($)
}

// Puts `@path` in the prompt box at the cursor, so the next prompt names the file.
export async function mention($: $, path: string) {
  const box = await $.prompt.read()
  const filled = await $.prompt.fill({ text: mentionText(path, box.text.slice(0, box.cursor)), mode: 'insert' })
  if (!filled.isFilled) $.ui.toast(`Couldn't add @${path} to the prompt right now.`)
}

export async function refreshAll($: $) {
  const cwd = await $.session.cwd().catch(() => '')
  await update($, cwdState, () => cwd)
  await Promise.all([refreshDir($), refreshRepo($)])
}
