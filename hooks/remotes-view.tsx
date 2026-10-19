import { atom, read } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Repo } from '../types'
import { chip } from './controls'
import { cancelRemoteForm, removeRemote, saveRemoteForm, setRemoteField, startAddRemote } from './remote-actions'
import { C } from './theme'
import type { UI } from './ui'

const remoteFormState = atom({ plugin: 'workspace', key: 'remoteForm' } as const, null)

type $ = EngineInterface

// The Branches view's last section: the repo's remotes, with Add and Remove.
export async function drawRemotes($: $, ui: UI, repo: Repo) {
  const { Box, Input, Text } = ui
  const form = await read($, remoteFormState)

  return (
    <Box key="remotes" flexDirection="column">
      <Box justifyContent="space-between" gap={1}>
        <Box gap={1}>
          <Text color={C.text} bold>Remotes</Text>
          <Text color={C.faint}>{String(repo.remotes.length)}</Text>
        </Box>
        {form === null && chip(ui, { key: 'remote-add', label: '+ Add', kind: 'quiet', onPress: () => startAddRemote($) })}
      </Box>

      {form !== null && (
        <Box flexDirection="column" gap={1}>
          <Input
            key="remote-name"
            value={form.name}
            placeholder="Name, like upstream"
            submitLabel="add"
            onInput={text => setRemoteField($, 'name', text)}
            onSubmit={() => saveRemoteForm($)}
          />
          <Input
            key="remote-url"
            value={form.url}
            placeholder="URL"
            submitLabel="add"
            onInput={text => setRemoteField($, 'url', text)}
            onSubmit={() => saveRemoteForm($)}
          />
          <Box gap={1}>
            {chip(ui, { key: 'remote-save', label: 'Add', kind: 'primary', onPress: () => saveRemoteForm($) })}
            {chip(ui, { key: 'remote-cancel', label: 'Cancel', onPress: () => cancelRemoteForm($) })}
          </Box>
        </Box>
      )}

      {repo.remotes.length === 0 && form === null && <Text color={C.faint}>No remotes yet.</Text>}
      {repo.remotes.map(name => (
        <Box key={`remote:${name}`} justifyContent="space-between" gap={1} hover={{ backgroundColor: C.hover }}>
          <Box gap={1}>
            <Text color={name === repo.remote ? C.accent : C.faint}>{name === repo.remote ? '●' : ' '}</Text>
            <Text color={C.text}>{name}</Text>
          </Box>
          {chip(ui, { key: `remote-remove:${name}`, label: 'Remove', kind: 'row', onPress: () => removeRemote($, name) })}
        </Box>
      ))}
    </Box>
  )
}
