// Watches Claude's task list tools, so This Turn can show the plan and check
// items off as they finish. Like the edit marks, the list starts over with each prompt.
import { atom, update } from 'claude-code'
import type { EngineInterface, ToolCallInput, ToolCallResult } from 'claude-code'

import type { Task, TaskStatus } from '../types'

const tasksState = atom({ plugin: 'workspace', key: 'tasks' } as const, [])

type $ = EngineInterface

export const TASK_TOOLS = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate'])

type Todo = { content: string; status: TaskStatus; activeForm: string }

// TodoWrite sends the whole list each time, so its items are keyed by position.
const fromTodos = (todos: Todo[]): Task[] =>
  todos.map((one, i) => ({ id: `todo:${i}`, text: one.content, active: one.activeForm, status: one.status }))

// Only the main thread's list counts; a subagent's own plan stays out of it.
export async function trackTasks($: $, e: ToolCallInput, next: (e: ToolCallInput) => Promise<ToolCallResult>) {
  const done = await next(e)
  if (e.agentId !== undefined || ('deny' in done && done.deny !== undefined) || done.isError === true) return done

  try {
    if (e.tool === 'TodoWrite') {
      await update($, tasksState, () => fromTodos(e.todos))
    } else if (e.tool === 'TaskCreate') {
      const created = ('result' in done ? done.result : undefined) as { task?: { id?: unknown } } | undefined
      const id = created?.task?.id
      if (typeof id === 'string') {
        const task: Task = { id, text: e.subject, active: e.activeForm ?? e.subject, status: 'pending' }
        await update($, tasksState, list => [...list.filter(one => one.id !== id), task])
      }
    } else if (e.tool === 'TaskUpdate') {
      const { taskId, subject, activeForm, status } = e
      await update($, tasksState, list =>
        status === 'deleted'
          ? list.filter(one => one.id !== taskId)
          : list.map(one =>
              one.id !== taskId
                ? one
                : { ...one, text: subject ?? one.text, active: activeForm ?? one.active, status: status ?? one.status },
            ),
      )
    }
  } catch {
    // A list that can't be written is skipped; the tool's result still goes back.
  }

  return done
}

export function clearTasks($: $) {
  return update($, tasksState, () => [])
}
