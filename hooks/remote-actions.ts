// The Branches view's Remotes section: adding and removing remotes.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Confirm, RemoteForm } from '../types'
import { confirmed, fail, gitOk, run } from './repo'

const remoteFormState = atom({ plugin: 'workspace', key: 'remoteForm' } as const, null)

type $ = EngineInterface

export function startAddRemote($: $) {
  return update($, remoteFormState, () => ({ name: '', url: '' }))
}

export function setRemoteField($: $, field: keyof RemoteForm, text: string) {
  return update($, remoteFormState, current => (current === null ? null : { ...current, [field]: text }))
}

export function cancelRemoteForm($: $) {
  return update($, remoteFormState, () => null)
}

// Adds the remote and fetches it, so its branches show up right away.
export async function saveRemoteForm($: $) {
  const form = await read($, remoteFormState)
  if (form === null) return

  const name = form.name.trim()
  const url = form.url.trim()
  if (name === '' || url === '') return fail($, new Error('Type a remote name and URL first.'))

  await run($, 'Adding remote', async () => {
    await gitOk($, ['remote', 'add', name, url])
    await cancelRemoteForm($)
    $.ui.toast(`Added ${name}`)
    await gitOk($, ['fetch', name]).catch(() => $.ui.toast(`Added ${name}, but couldn't fetch it yet`))
  })
}

// Removing a remote drops its remote branches from this clone too, so it asks.
export async function removeRemote($: $, name: string) {
  const ask: Confirm = {
    action: 'remove-remote',
    path: name,
    question: `Remove the remote ${name}? Its remote branches go with it. Nothing changes on the server.`,
    yes: 'Yes, remove',
  }
  if (!(await confirmed($, ask))) return

  await run($, 'Removing remote', async () => {
    await gitOk($, ['remote', 'remove', name])
    $.ui.toast(`Removed ${name}`)
  })
}
