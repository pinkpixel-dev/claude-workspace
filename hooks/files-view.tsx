import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { cancelEdit, closeFile, goUp, mention, openDir, openEntry, openPath, save, startEdit } from './actions'
import { confirmCard } from './confirm-view'
import { card, chip } from './controls'
import { DIR_ICON, fileIcon } from './icons'
import { EMPTY_REPO } from './state'
import { C, formatSize } from './theme'
import { letterAt, markOf, toneOf, treeStatus } from './tree'
import { askClaude } from './turn-actions'
import type { UI } from './ui'

// How many touched files the strip names before it sums up the rest.
const STRIP_MAX = 6

const activityState = atom({ plugin: 'workspace', key: 'activity' } as const, [])
const confirmState = atom({ plugin: 'workspace', key: 'confirm' } as const, null)
const cwdState = atom({ plugin: 'workspace', key: 'cwd' } as const, '')
const repoState = atom({ plugin: 'workspace', key: 'repo' } as const, EMPTY_REPO)
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
    const confirm = await read($, confirmState)

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
            {!isEditing && chip(ui, { key: 'explain', label: 'Explain', kind: 'quiet', onPress: () => askClaude($, 'Explain', file.path) })}
            {!isEditing && chip(ui, { key: 'mention-open', label: '@', onPress: () => mention($, file.path) })}
            {!isEditing && !file.readOnlyReason && chip(ui, { key: 'edit', label: 'Edit', onPress: () => startEdit($) })}
          </Box>
        </Box>
        {confirm?.action === 'overwrite' && confirm.path === file.path && confirmCard($, ui, confirm)}
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
  const activity = await read($, activityState)
  const repo = await read($, repoState)
  const status = treeStatus(repo.changes, repo.root, await read($, cwdState))
  const recent = [...activity].reverse()
  const join = (name: string) => (where ? `${where}/${name}` : name)

  const crumbs = where === '' ? [] : where.split('/')

  return (
    <Box flexDirection="column">
      {recent.length > 0 && (
        <Box marginBottom={1}>
          {card(ui, 'strip', (
            <Box gap={1} flexWrap="wrap">
              <Text color={C.muted} bold>Claude</Text>
              {recent.slice(0, STRIP_MAX).flatMap((one, i) => [
                i > 0 && <Text key={`strip-sep:${one.path}`} color={C.line}>─</Text>,
                <Box key={`strip:${one.path}`}>
                  <Button key={`touch:${one.path}`} plain onPress={() => openPath($, one.path)}>
                    <Text color={one.isRunning ? C.busy : one.kind === 'edit' ? C.modified : C.muted} hover={{ color: C.text }}>
                      {`${markOf(one.kind)} ${one.path.slice(one.path.lastIndexOf('/') + 1)}`}
                    </Text>
                  </Button>
                </Box>,
              ])}
              {recent.length > STRIP_MAX && <Text color={C.faint}>{`+${recent.length - STRIP_MAX}`}</Text>}
            </Box>
          ))}
        </Box>
      )}
      <Box justifyContent="space-between" gap={1} marginBottom={1}>
        <Box gap={1} flexShrink={1} flexWrap="wrap">
          {where !== '' && chip(ui, { key: 'up', label: '‹ Up', onPress: () => goUp($), kind: 'quiet' })}
          <Box key="crumb-root">
            <Button key="crumb:" plain onPress={() => openDir($, '')}>
              <Text color={where === '' ? C.text : C.muted} bold={where === ''} hover={{ color: C.text }}>./</Text>
            </Button>
          </Box>
          {crumbs.flatMap((part, i) => {
            const path = crumbs.slice(0, i + 1).join('/')
            const isLast = i === crumbs.length - 1

            return [
              i > 0 && <Text key={`crumb-sep:${path}`} color={C.line}>/</Text>,
              <Box key={`crumb-box:${path}`}>
                <Button key={`crumb:${path}`} plain onPress={() => openDir($, path)}>
                  <Text color={isLast ? C.text : C.muted} bold={isLast} hover={{ color: C.text }}>{part}</Text>
                </Button>
              </Box>,
            ]
          })}
        </Box>
        <Text color={C.faint}>{`${list.length} items`}</Text>
      </Box>
      {list.length === 0 && <Text color={C.faint}>Empty folder.</Text>}
      {list.map(entry => {
        const isDir = entry.kind === 'dir'
        const path = join(entry.name)
        const letter = letterAt(status, path)
        const touch = isDir
          ? activity.find(one => one.path.startsWith(`${path}/`))
          : activity.find(one => one.path === path)
        const isRunning = activity.some(one => one.isRunning && (one.path === path || one.path.startsWith(`${path}/`)))
        const tone = letter === undefined ? undefined : toneOf(letter)

        return (
          <Box
            key={`row:${entry.name}`}
            justifyContent="space-between"
            gap={1}
            backgroundColor={isRunning ? C.raised : undefined}
            hover={{ backgroundColor: C.hover }}
          >
            <Box gap={1} flexShrink={1}>
              <Box flexShrink={1} height={1} overflow="hidden">
                <Button key={`entry:${entry.name}`} plain onPress={() => openEntry($, entry)}>
                  <Text color={tone ?? (isDir ? C.muted : C.faint)}>{`${isDir ? DIR_ICON : fileIcon(entry.name)} `}</Text>
                  <Text color={tone ?? C.text} bold={isDir}>{entry.name}</Text>
                </Button>
              </Box>
              {touch !== undefined && (
                <Text color={isRunning ? C.busy : C.muted}>{markOf(touch.kind)}</Text>
              )}
            </Box>
            <Box gap={1} flexShrink={0}>
              {!isDir && <Text color={C.faint}>{formatSize(entry.size)}</Text>}
              {letter !== undefined && <Text color={toneOf(letter)} bold>{isDir ? '●' : letter}</Text>}
              {chip(ui, { key: `mention:${entry.name}`, label: '@', onPress: () => mention($, path), kind: 'row' })}
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}
