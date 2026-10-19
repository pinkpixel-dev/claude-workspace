// Watches Claude's file tools, and the files its Bash commands change, so the
// Files tab can mark what it reads and edits. The marks stay until the next prompt you send.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, ToolCallInput, ToolCallResult } from 'claude-code'

import { refreshAll } from './actions'
import { FILE_TOOLS, treePathOf, withTouch } from './tree'
import { keepBashSnapshot, keepSnapshot } from './turn-actions'
import type { BashFileChange } from './turn-actions'

const activityState = atom({ plugin: 'workspace', key: 'activity' } as const, [])
const cwdState = atom({ plugin: 'workspace', key: 'cwd' } as const, '')

type $ = EngineInterface

// The tools whose results carry the file as it was before the call.
const SNAPSHOT_TOOLS = new Set(['Edit', 'Write'])

const pathArg = (e: ToolCallInput) => {
  if ('file_path' in e && typeof e.file_path === 'string') return e.file_path
  if ('notebook_path' in e && typeof e.notebook_path === 'string') return e.notebook_path

  return null
}

// What a Bash result says it changed. `bashEditDiff` is marked internal in
// Claude Code's types, so if it goes away Bash edits just stop being tracked.
type BashEditDiff = { files: BashFileChange[]; changedFiles?: string[] }

// Marks every file a Bash command changed and keeps a copy from before it.
async function trackBash($: $, e: ToolCallInput, next: (e: ToolCallInput) => Promise<ToolCallResult>) {
  const done = await next(e)
  const result = ('result' in done ? done.result : undefined) as { bashEditDiff?: BashEditDiff } | undefined
  const changes = result?.bashEditDiff
  if (changes === undefined || !Array.isArray(changes.files)) return done

  try {
    const cwd = await read($, cwdState)
    const shown = new Map(changes.files.map(file => [file.filePath, file]))
    const changed = new Set([...shown.keys(), ...(changes.changedFiles ?? [])])
    for (const raw of changed) {
      const path = treePathOf(cwd, raw)
      if (path === null) continue
      await update($, activityState, list => withTouch(list, path, 'edit', false))
      await keepBashSnapshot($, path, shown.get(raw) ?? null)
    }
    if (changed.size > 0) void refreshAll($).catch(() => undefined)
  } catch {
    // A mark that can't be written is skipped; the command's result still goes back.
  }

  return done
}

// Never in the way of the tool: a mark that can't be written is skipped.
export async function trackTool($: $, e: ToolCallInput, next: (e: ToolCallInput) => Promise<ToolCallResult>) {
  if (e.tool === 'Bash') return trackBash($, e, next)

  const kind = FILE_TOOLS[e.tool]
  const raw = kind === undefined ? null : pathArg(e)
  if (kind === undefined || raw === null) return next(e)

  const path = treePathOf(await read($, cwdState).catch(() => ''), raw)
  if (path === null) return next(e)

  const isNew = await read($, activityState).then(list => !list.some(one => one.path === path), () => false)
  await update($, activityState, list => withTouch(list, path, kind, true)).catch(() => undefined)

  let isDone = false
  try {
    const done = await next(e)
    isDone = !('deny' in done && done.deny !== undefined) && done.isError !== true
    if (isDone && SNAPSHOT_TOOLS.has(e.tool)) {
      await keepSnapshot($, path, 'result' in done ? done.result : undefined).catch(() => undefined)
    }
    return done
  } finally {
    // A refused or failed call never touched the file, so a first mark goes away again.
    await update($, activityState, list =>
      !isDone && isNew ? list.filter(one => one.path !== path) : withTouch(list, path, kind, false),
    ).catch(() => undefined)
    if (isDone && kind === 'edit') void refreshAll($).catch(() => undefined)
  }
}

export function clearActivity($: $) {
  return update($, activityState, () => [])
}
