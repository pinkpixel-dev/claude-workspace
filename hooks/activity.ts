// Watches Claude's file tools so the Files tab can mark what it reads and
// edits. The marks stay until the next prompt you send.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, ToolCallInput, ToolCallResult } from 'claude-code'

import { refreshAll } from './actions'
import { FILE_TOOLS, treePathOf, withTouch } from './tree'

const activityState = atom({ plugin: 'workspace', key: 'activity' } as const, [])
const cwdState = atom({ plugin: 'workspace', key: 'cwd' } as const, '')

type $ = EngineInterface

const pathArg = (e: ToolCallInput) => {
  if ('file_path' in e && typeof e.file_path === 'string') return e.file_path
  if ('notebook_path' in e && typeof e.notebook_path === 'string') return e.notebook_path

  return null
}

// Never in the way of the tool: a mark that can't be written is skipped.
export async function trackTool($: $, e: ToolCallInput, next: (e: ToolCallInput) => Promise<ToolCallResult>) {
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
