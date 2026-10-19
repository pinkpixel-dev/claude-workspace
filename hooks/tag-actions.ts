// What the Tags view's buttons do: create, check out, push and delete tags.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Confirm, TagForm } from '../types'
import { closeFile, refreshDir } from './actions'
import { showView } from './branch-actions'
import { confirmed, fail, gitOk, run } from './repo'
import { EMPTY_REPO } from './state'

const isEditingState = atom({ plugin: 'workspace', key: 'isEditing' } as const, false)
const repoState = atom({ plugin: 'workspace', key: 'repo' } as const, EMPTY_REPO)
const tagFormState = atom({ plugin: 'workspace', key: 'tagForm' } as const, null)

type $ = EngineInterface

// Opens the form on HEAD, or on `base`, like a commit picked in History.
export function startTag($: $, base = 'HEAD') {
  return update($, tagFormState, () => ({ text: '', message: '', base }))
}

// History's Tag button: opens the form in Tags, pointing at that commit.
export async function tagCommit($: $, sha: string) {
  await startTag($, sha)
  await showView($, 'tags')
}

export function setTagField($: $, field: keyof TagForm, text: string) {
  return update($, tagFormState, current => (current === null ? null : { ...current, [field]: text }))
}

export function cancelTagForm($: $) {
  return update($, tagFormState, () => null)
}

// A message makes an annotated tag; without one it's a lightweight tag.
export async function saveTagForm($: $) {
  const form = await read($, tagFormState)
  if (form === null) return

  const name = form.text.trim()
  const message = form.message.trim()
  if (name === '') return fail($, new Error('Type a tag name first.'))

  await run($, 'Tagging', async () => {
    await gitOk($, message === '' ? ['tag', name, form.base] : ['tag', '-a', name, '-m', message, form.base])
    await cancelTagForm($)
    $.ui.toast(`Tagged ${form.base === 'HEAD' ? 'HEAD' : form.base.slice(0, 7)} as ${name}`)
  })
}

// Leaves you on the tagged commit with no branch, like VS Code's detached checkout.
export function checkoutTag($: $, name: string) {
  return run($, 'Checking out', async () => {
    await gitOk($, ['switch', '--detach', name])
    $.ui.toast(`Checked out ${name} (detached)`)
    if (!(await read($, isEditingState))) await closeFile($)
    await refreshDir($)
  })
}

// Local only: a tag that was pushed stays on the remote.
export function deleteTag($: $, name: string) {
  return run($, 'Deleting', async () => {
    await gitOk($, ['tag', '-d', name])
    $.ui.toast(`Deleted tag ${name}`)
  })
}

// One tag, or every tag when `name` is missing.
export async function pushTags($: $, name?: string) {
  const { remote } = await read($, repoState)
  if (remote === '') return fail($, new Error('No remote to push to.'))

  await run($, 'Pushing', async () => {
    await gitOk($, ['push', remote, ...(name === undefined ? ['--tags'] : [`refs/tags/${name}`])])
    $.ui.toast(name === undefined ? `Pushed all tags to ${remote}` : `Pushed ${name} to ${remote}`)
  })
}

// Deletes the tag on the remote for everyone, so it always asks. Your local copy stays.
export async function deleteRemoteTag($: $, name: string) {
  const { remote } = await read($, repoState)
  if (remote === '') return fail($, new Error('No remote to delete it from.'))

  const ask: Confirm = {
    action: 'delete-remote-tag',
    path: name,
    question: `Delete ${name} on ${remote}? Your local tag stays.`,
    yes: 'Yes, delete',
  }
  if (!(await confirmed($, ask))) return

  await run($, 'Deleting', async () => {
    await gitOk($, ['push', remote, '--delete', `refs/tags/${name}`])
    $.ui.toast(`Deleted ${name} on ${remote}`)
  })
}
