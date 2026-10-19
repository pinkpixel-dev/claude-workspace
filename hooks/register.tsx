import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { openPath, refreshAll } from './actions'
import { clearActivity, trackTool } from './activity'
import { autoFetch, FETCH_EVERY_MS } from './git-actions'
import { refreshRepo } from './repo'
import { drawFiles } from './files-view'
import { drawGit } from './git-view'
import { refreshGithub } from './github-actions'
import { drawGithub } from './github-view'
import { tab as navTab } from './controls'
import { detectImages } from './history-actions'
import { isStaged, isUnstaged } from './git'
import { C } from './theme'
import { PANE, EMPTY_REPO } from './state'

const isEditingState = atom({ plugin: 'workspace', key: 'isEditing' } as const, false)
const openFileState = atom({ plugin: 'workspace', key: 'openFile' } as const, null)
const repoState = atom({ plugin: 'workspace', key: 'repo' } as const, EMPTY_REPO)
const tabState = atom({ plugin: 'workspace', key: 'tab' } as const, 'files')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'workspace',
      description: 'Open the file browser and source control pane',
    })
    void refreshAll($)
    void detectImages($)
    $.clock.every(FETCH_EVERY_MS, () => void autoFetch($))

    return next(e)
  })

  on('command.run', { command: 'workspace' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: 'Workspace' })
    void refreshAll($)

    return { text: opened.isPlaced ? 'Workspace opened.' : 'Workspace will show once there is room.' }
  })

  // Marks the files Claude reads and edits in the Files tab.
  on('tool.call', ($, e, next) => trackTool($, e, next))

  // A new prompt starts a fresh set of marks; slash commands keep them.
  on('prompt.submit', async ($, e, next) => {
    if (e.command === undefined && e.isMeta !== true) await clearActivity($).catch(() => undefined)

    return next(e)
  })

  // Claude may have edited files or made commits during the turn.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    void (async () => {
      await refreshAll($)
      // Claude may have opened a pull request or issue too.
      if ((await read($, tabState)) === 'github') await refreshGithub($)
      const file = await read($, openFileState)
      if (file !== null && !(await read($, isEditingState)) && !file.readOnlyReason) {
        await openPath($, file.path)
      }
    })()

    return done
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    if (e.surface === 'mobile') {
      const { Text } = $.ui.resolve(e)
      return <Text color={C.muted}>The workspace needs a keyboard surface.</Text>
    }

    const ui = $.ui.resolve(e)
    const { Box, Text } = ui
    const tab = await read($, tabState)
    const repo = await read($, repoState)
    const count = new Set(repo.changes.filter(one => isStaged(one) || isUnstaged(one)).map(one => one.path)).size
    const width = e.props.bodyColumns
    const name = repo.root.slice(repo.root.lastIndexOf('/') + 1)

    const body = tab === 'files'
      ? await drawFiles($, ui, e.props.scroll.bodyRows)
      : tab === 'git'
        ? await drawGit($, ui, width - 2)
        : await drawGithub($, ui, width - 2)

    return (
      <Box flexDirection="column" width={width} minHeight={e.props.scroll.bodyRows} backgroundColor={C.bg} paddingX={1}>
        <Box justifyContent="space-between" gap={1} paddingTop={1} paddingX={1}>
          <Text color={C.text} bold>Workspace</Text>
          {name !== '' && <Text color={C.faint} wrap="truncate-end">{name}</Text>}
        </Box>
        <Box justifyContent="space-between" gap={2} backgroundColor={C.card} paddingX={2} marginY={1}>
          {navTab(ui, 'tab-files', 'Files', tab === 'files', () => update($, tabState, () => 'files' as const))}
          {navTab(ui, 'tab-git', count > 0 ? `Source Control ${count}` : 'Source Control', tab === 'git', async () => {
            await update($, tabState, () => 'git' as const)
            await refreshRepo($)
          })}
          {navTab(ui, 'tab-github', 'GitHub', tab === 'github', async () => {
            await update($, tabState, () => 'github' as const)
            await refreshGithub($)
          })}
        </Box>
        {body}
      </Box>
    )
  })
}
