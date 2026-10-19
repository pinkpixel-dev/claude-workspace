// The confirm card, busy label and last notice, shared by every tab that runs steps.
import { atom, read } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Confirm } from '../types'
import { chip } from './controls'
import { cancelConfirm, confirmYes } from './git-actions'
import { C } from './theme'
import type { UI } from './ui'

const busyState = atom({ plugin: 'workspace', key: 'busy' } as const, null)
const confirmState = atom({ plugin: 'workspace', key: 'confirm' } as const, null)
const noticeState = atom({ plugin: 'workspace', key: 'notice' } as const, null)

type $ = EngineInterface

// Steps that throw work away get the red card and the danger yes.
const RISKY = [
  'discard',
  'discard-all',
  'force-delete',
  'revert-turn',
  'overwrite',
  'delete-remote-branch',
  'force-push',
  'drop-all-stashes',
  'remove-remote',
]

export function confirmCard($: $, ui: UI, confirm: Confirm) {
  const { Box, Text } = ui
  const isRisky = RISKY.includes(confirm.action)

  return (
    <Box key="confirm" flexDirection="column" borderStyle="round" borderColor={isRisky ? C.deleted : C.modified} paddingX={1}>
      <Box gap={1}>
        <Text color={isRisky ? C.deleted : C.modified} bold>{isRisky ? '!' : '?'}</Text>
        <Text color={C.text}>{confirm.question}</Text>
      </Box>
      <Box gap={1} marginTop={1}>
        {chip(ui, { key: 'confirm-yes', label: confirm.yes, kind: isRisky ? 'danger' : 'primary', onPress: () => confirmYes($) })}
        {chip(ui, { key: 'confirm-no', label: 'Cancel', onPress: () => cancelConfirm($) })}
      </Box>
    </Box>
  )
}

export async function drawStatus($: $, ui: UI) {
  const { Box, Text } = ui
  const busy = await read($, busyState)
  const notice = await read($, noticeState)
  const confirm = await read($, confirmState)
  if (confirm === null && busy === null && notice === null) return null

  return (
    <Box key="status" flexDirection="column" gap={1}>
      {confirm !== null && confirmCard($, ui, confirm)}
      {busy !== null && <Text color={C.busy}>{`${busy}...`}</Text>}
      {notice !== null && (
        <Text color={notice.kind === 'error' ? C.deleted : C.added}>{`${notice.kind === 'error' ? '✗' : '✓'} ${notice.text}`}</Text>
      )}
    </Box>
  )
}
