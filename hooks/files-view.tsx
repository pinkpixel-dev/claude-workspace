import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { cancelEdit, closeFile, goUp, openEntry, save, startEdit } from './actions'
import { chip } from './controls'
import { C, formatSize } from './theme'
import type { UI } from './ui'

const dirState = atom({ plugin: 'workspace', key: 'dir' } as const, '')
const draftState = atom({ plugin: 'workspace', key: 'draft' } as const, '')
const entriesState = atom({ plugin: 'workspace', key: 'entries' } as const, [])
const isEditingState = atom({ plugin: 'workspace', key: 'isEditing' } as const, false)
const openFileState = atom({ plugin: 'workspace', key: 'openFile' } as const, null)

export async function drawFiles($: EngineInterface, ui: UI, bodyRows: number) {
  const { Box, Button, Code, Input, Text } = ui
  const file = await read($, openFileState)

  if (file !== null) {
    const isEditing = await read($, isEditingState)
    const draft = await read($, draftState)
    const lines = file.text === '' ? 0 : file.text.split('\n').length

    return (
      <Box flexDirection="column" gap={1}>
        <Box justifyContent="space-between" gap={1}>
          <Box gap={1} flexShrink={1}>
            {chip(ui, { key: 'back', label: '‹ Back', onPress: () => closeFile($), kind: 'quiet' })}
            <Text color={C.text} bold wrap="truncate-start">{file.path}</Text>
          </Box>
          <Box gap={1} flexShrink={0}>
            {isEditing && chip(ui, { key: 'cancel', label: 'Cancel', onPress: () => cancelEdit($) })}
            {isEditing && chip(ui, {
              key: 'save',
              label: 'Save',
              kind: 'primary',
              onPress: async () => save($, await read($, draftState)),
            })}
            {!isEditing && !file.readOnlyReason && chip(ui, { key: 'edit', label: 'Edit', onPress: () => startEdit($) })}
          </Box>
        </Box>
        {file.readOnlyReason
          ? <Text color={C.modified}>{file.readOnlyReason}</Text>
          : <Text color={C.faint}>{`${lines} lines${isEditing ? ' · Enter saves' : ''}`}</Text>}
        {isEditing ? (
          <Input
            key="editor"
            value={draft}
            rows={Math.max(5, bodyRows - 6)}
            submitLabel="save"
            autoFocus
            onInput={text => update($, draftState, () => text)}
            onSubmit={text => save($, text)}
          />
        ) : (
          file.text !== '' && <Code source={file.text} path={file.path} startLine={1} />
        )}
      </Box>
    )
  }

  const where = await read($, dirState)
  const list = await read($, entriesState)

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between" gap={1} marginBottom={1}>
        <Box gap={1} flexShrink={1}>
          {where !== '' && chip(ui, { key: 'up', label: '‹ Up', onPress: () => goUp($), kind: 'quiet' })}
          <Text color={C.muted} wrap="truncate-start">{`./${where}`}</Text>
        </Box>
        <Text color={C.faint}>{`${list.length} items`}</Text>
      </Box>
      {list.length === 0 && <Text color={C.faint}>Empty folder.</Text>}
      {list.map(entry => {
        const isDir = entry.kind === 'dir'

        return (
          <Box key={`row:${entry.name}`} justifyContent="space-between" gap={1} hover={{ backgroundColor: C.hover }}>
            <Button key={`entry:${entry.name}`} plain onPress={() => openEntry($, entry)}>
              <Text color={isDir ? C.muted : C.faint}>{isDir ? '▸ ' : '· '}</Text>
              <Text color={C.text} bold={isDir}>{entry.name}</Text>
            </Button>
            {!isDir && <Text color={C.faint}>{formatSize(entry.size)}</Text>}
          </Box>
        )
      })}
    </Box>
  )
}
