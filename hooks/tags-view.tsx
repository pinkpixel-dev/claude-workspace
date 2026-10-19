import { atom, read } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Repo, Tag } from '../types'
import { chip } from './controls'
import { cancelTagForm, checkoutTag, deleteTag, pushTags, saveTagForm, setTagField, startTag } from './tag-actions'
import { C } from './theme'
import type { UI } from './ui'

const tagFormState = atom({ plugin: 'workspace', key: 'tagForm' } as const, null)

type $ = EngineInterface

function drawTagRow($: $, ui: UI, tag: Tag, hasRemote: boolean) {
  const { Box, Text } = ui

  return (
    <Box key={`tag:${tag.name}`} justifyContent="space-between" gap={1} hover={{ backgroundColor: C.hover }}>
      <Box gap={1} flexShrink={1} height={1} overflow="hidden">
        <Text color={C.text} bold>{tag.name}</Text>
        <Text color={C.faint}>{tag.age}</Text>
        <Text color={C.muted} wrap="truncate-end">{tag.message}</Text>
      </Box>
      <Box gap={1} flexShrink={0}>
        {chip(ui, { key: `tag-checkout:${tag.name}`, label: 'Check out', kind: 'row', onPress: () => checkoutTag($, tag.name) })}
        {hasRemote && chip(ui, { key: `tag-push:${tag.name}`, label: 'Push', kind: 'row', onPress: () => pushTags($, tag.name) })}
        {chip(ui, { key: `tag-delete:${tag.name}`, label: 'Delete', kind: 'row', onPress: () => deleteTag($, tag.name) })}
      </Box>
    </Box>
  )
}

export async function drawTags($: $, ui: UI, repo: Repo, status: JSX.Element | null) {
  const { Box, Input, Text } = ui
  const form = await read($, tagFormState)
  const hasRemote = repo.remote !== ''
  const target = form === null || form.base === 'HEAD' ? repo.branch || 'HEAD' : form.base.slice(0, 7)

  return (
    <Box key="tags" flexDirection="column" gap={1}>
      {form === null
        ? (
          <Box gap={1}>
            {chip(ui, { key: 'tag-new', label: '+ New tag', onPress: () => startTag($) })}
            {hasRemote && repo.tags.length > 0 && chip(ui, { key: 'tag-push-all', label: 'Push all', kind: 'quiet', onPress: () => pushTags($) })}
          </Box>
        )
        : (
          <Box flexDirection="column" gap={1}>
            <Input
              key="tag-name"
              value={form.text}
              placeholder={`Tag name, on ${target}`}
              submitLabel="create"
              onInput={text => setTagField($, 'text', text)}
              onSubmit={() => saveTagForm($)}
            />
            <Input
              key="tag-message"
              value={form.message}
              placeholder="Message (optional, makes it annotated)"
              submitLabel="create"
              onInput={text => setTagField($, 'message', text)}
              onSubmit={() => saveTagForm($)}
            />
            <Box gap={1}>
              {chip(ui, { key: 'tag-save', label: 'Create', kind: 'primary', onPress: () => saveTagForm($) })}
              {chip(ui, { key: 'tag-cancel', label: 'Cancel', onPress: () => cancelTagForm($) })}
            </Box>
          </Box>
        )}

      {status}

      <Box flexDirection="column">
        {repo.tags.length === 0 && <Text color={C.faint}>No tags yet.</Text>}
        {repo.tags.map(tag => drawTagRow($, ui, tag, hasRemote))}
      </Box>
    </Box>
  )
}
