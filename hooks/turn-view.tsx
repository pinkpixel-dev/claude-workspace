// The This Turn tab: Claude's task list since your last prompt, then every file
// it edited, how much changed, its diff against the before-edit copy, and a way to undo it.
import { atom, read } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Snapshot, Task, TurnDiff } from '../types'
import { drawStatus } from './confirm-view'
import { badge, card, chip } from './controls'
import { fileIcon } from './icons'
import { C } from './theme'
import { askClaude, closeTurnDiff, revertTurn, showTurnDiff } from './turn-actions'
import type { UI } from './ui'

const activityState = atom({ plugin: 'workspace', key: 'activity' } as const, [])
const snapshotsState = atom({ plugin: 'workspace', key: 'snapshots' } as const, [])
const tasksState = atom({ plugin: 'workspace', key: 'tasks' } as const, [])
const turnDiffState = atom({ plugin: 'workspace', key: 'turnDiff' } as const, null)

type $ = EngineInterface

const REVIEW = 'Review the changes you made to'

// A copy exists to diff and undo against: a created file, or one the tool handed back whole.
const canUndo = (snapshot: Snapshot | undefined): snapshot is Snapshot =>
  snapshot !== undefined && (snapshot.isNew || snapshot.before !== null)

function counts(ui: UI, key: string, added: number, removed: number) {
  const { Text } = ui

  return [
    <Text key={`${key}:added`} color={added > 0 ? C.added : C.faint}>{`+${added}`}</Text>,
    <Text key={`${key}:removed`} color={removed > 0 ? C.deleted : C.faint}>{`−${removed}`}</Text>,
  ]
}

// A section's title and count on the left, an optional summary on the right.
function heading(ui: UI, key: string, title: string, count: string, right?: JSX.Element[]) {
  const { Box, Text } = ui

  return (
    <Box key={`turn-head:${key}`} justifyContent="space-between" gap={1}>
      <Box gap={1}>
        <Text color={C.text} bold>{title}</Text>
        <Text color={C.faint}>{count}</Text>
      </Box>
      {right && <Box gap={1}>{right}</Box>}
    </Box>
  )
}

const TASK_MARK = { completed: '✓', in_progress: '●', pending: '○' } as const

function drawTask(ui: UI, task: Task) {
  const { Box, Text } = ui
  const isActive = task.status === 'in_progress'
  const color = task.status === 'completed' ? C.added : isActive ? C.busy : C.faint

  return (
    <Box key={`task:${task.id}`} gap={1} height={1} overflow="hidden">
      <Text color={color}>{TASK_MARK[task.status]}</Text>
      <Text color={task.status === 'completed' ? C.muted : C.text} bold={isActive} wrap="truncate-end">
        {isActive ? task.active : task.text}
      </Text>
    </Box>
  )
}

function drawTurnDiff($: $, ui: UI, diff: TurnDiff, snapshot: Snapshot | undefined, status: JSX.Element | null) {
  const { Box, Code, Text } = ui
  const name = diff.path.slice(diff.path.lastIndexOf('/') + 1)

  return (
    <Box flexDirection="column" gap={1}>
      <Box justifyContent="space-between" gap={1}>
        <Box gap={1} flexShrink={1}>
          {chip(ui, { key: 'turn-back', label: '‹ Back', onPress: () => closeTurnDiff($), kind: 'quiet' })}
          <Text color={C.muted}>{fileIcon(name)}</Text>
          <Text color={C.text} bold wrap="truncate-start">{diff.path}</Text>
        </Box>
        <Box gap={1} flexShrink={0}>
          {counts(ui, 'turn-diff', diff.added, diff.removed)}
          {chip(ui, { key: 'turn-review', label: 'Review', kind: 'quiet', onPress: () => askClaude($, REVIEW, diff.path) })}
          {canUndo(snapshot) && chip(ui, { key: 'turn-revert', label: '↺ Revert', onPress: () => revertTurn($, diff.path) })}
        </Box>
      </Box>
      {status}
      {diff.text === ''
        ? <Text color={C.faint}>No changes left. The file matches its copy from before the edit.</Text>
        : <Code source={diff.text} format="diff" path={diff.path} />}
    </Box>
  )
}

export async function drawTurn($: $, ui: UI) {
  const { Box, Button, Text } = ui
  const status = await drawStatus($, ui)
  const snapshots = await read($, snapshotsState)
  const diff = await read($, turnDiffState)

  if (diff !== null) return drawTurnDiff($, ui, diff, snapshots.find(one => one.path === diff.path), status)

  const edits = [...(await read($, activityState))].filter(one => one.kind === 'edit').reverse()
  const tasks = await read($, tasksState)
  if (edits.length === 0 && tasks.length === 0) {
    return (
      <Box flexDirection="column" gap={1}>
        {status}
        <Text color={C.faint}>Claude hasn't edited anything since your last prompt.</Text>
      </Box>
    )
  }

  const added = snapshots.reduce((sum, one) => sum + one.added, 0)
  const removed = snapshots.reduce((sum, one) => sum + one.removed, 0)

  const finished = tasks.filter(one => one.status === 'completed').length

  return (
    <Box flexDirection="column" gap={1}>
      {status}
      {tasks.length > 0 && heading(ui, 'tasks', 'Tasks', `${finished}/${tasks.length}`)}
      {tasks.length > 0 && card(ui, 'turn-tasks', tasks.map(task => drawTask(ui, task)))}
      {heading(ui, 'files', 'Edited Files', String(edits.length), edits.length > 0 ? counts(ui, 'turn-total', added, removed) : undefined)}
      {edits.length === 0 && <Text color={C.faint}>Nothing edited yet.</Text>}
      {edits.length > 0 && card(ui, 'turn-list', edits.map(edit => {
        const snapshot = snapshots.find(one => one.path === edit.path)
        const cut = edit.path.lastIndexOf('/')
        const name = edit.path.slice(cut + 1)
        const folder = cut < 0 ? '' : edit.path.slice(0, cut)
        const isUndoable = canUndo(snapshot)

        return (
          <Box key={`turn-row:${edit.path}`} justifyContent="space-between" gap={1} hover={{ backgroundColor: C.hover }}>
            <Box flexShrink={1} height={1} overflow="hidden">
              <Button key={`turn:${edit.path}`} plain onPress={() => showTurnDiff($, edit.path)}>
                <Text color={edit.isRunning ? C.busy : C.modified}>{`${fileIcon(name)} `}</Text>
                <Text color={C.text}>{name}</Text>
                <Text color={C.faint}>{folder ? `  ${folder}` : ''}</Text>
              </Button>
            </Box>
            <Box gap={1} flexShrink={0}>
              {edit.isRunning && <Text color={C.busy}>editing</Text>}
              {snapshot?.isNew === true && badge(ui, `new:${edit.path}`, 'new', C.added)}
              {isUndoable ? counts(ui, `turn:${edit.path}`, snapshot.added, snapshot.removed) : <Text color={C.faint}>no copy</Text>}
              {chip(ui, { key: `turn-review:${edit.path}`, label: 'Review', kind: 'row', onPress: () => askClaude($, REVIEW, edit.path) })}
              {isUndoable && chip(ui, { key: `turn-revert:${edit.path}`, label: '↺', kind: 'row', onPress: () => revertTurn($, edit.path) })}
            </Box>
          </Box>
        )
      }))}
    </Box>
  )
}
