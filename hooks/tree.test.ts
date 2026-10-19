import { describe, expect, test } from 'claude-code/testing'

import type { Change } from '../types'
import { letterAt, mentionText, relativeTo, treePathOf, treeStatus, withTouch } from './tree'

const change = (path: string, index: string, work: string): Change => ({ path, index, work })

describe('relativeTo', () => {
  test('names a path from a folder, or null outside it', async () => {
    expect(relativeTo('/repo', '/repo/src/app.ts')).toBe('src/app.ts')
    expect(relativeTo('/repo/', '/repo/src')).toBe('src')
    expect(relativeTo('/repo', '/repo')).toBe('')
    expect(relativeTo('/repo', '/repository/a.ts')).toBeNull()
  })
})

describe('treePathOf', () => {
  test('maps a tool path into the tree, skipping ones outside the session folder', async () => {
    expect(treePathOf('/repo', '/repo/hooks/git.ts')).toBe('hooks/git.ts')
    expect(treePathOf('/repo', '/etc/hosts')).toBeNull()
    expect(treePathOf('/repo', './README.md')).toBe('README.md')
    expect(treePathOf('', '/repo/a.ts')).toBeNull()
  })
})

describe('treeStatus', () => {
  test('letters files the way the explorer does and marks folders above them', async () => {
    const status = treeStatus(
      [change('src/app.ts', 'M', ' '), change('src/new.ts', 'A', 'M'), change('notes.md', '?', '?'), change('a.ts', 'U', 'U')],
      '/repo',
      '/repo',
    )

    expect(letterAt(status, 'src/app.ts')).toBe('M')
    expect(letterAt(status, 'src/new.ts')).toBe('M')
    expect(letterAt(status, 'notes.md')).toBe('U')
    expect(letterAt(status, 'a.ts')).toBe('!')
    expect(letterAt(status, 'src')).toBe('M')
    expect(letterAt(status, 'README.md')).toBeUndefined()
  })

  test('maps repo paths when the session runs in a subfolder', async () => {
    const status = treeStatus([change('app/src/x.ts', ' ', 'M'), change('other/y.ts', ' ', 'M')], '/repo', '/repo/app')

    expect(letterAt(status, 'src/x.ts')).toBe('M')
    expect(letterAt(status, 'src')).toBe('M')
    expect(letterAt(status, 'other/y.ts')).toBeUndefined()
  })

  test('everything under an untracked folder reads as untracked', async () => {
    const status = treeStatus([change('drafts/', '?', '?')], '/repo', '/repo')

    expect(letterAt(status, 'drafts')).toBe('U')
    expect(letterAt(status, 'drafts/one.md')).toBe('U')
    expect(letterAt(status, 'drafts/deep/two.md')).toBe('U')
  })

  test('shows nothing when the session folder is outside the repo', async () => {
    const status = treeStatus([change('a.ts', ' ', 'M')], '/repo', '/elsewhere')

    expect(status.letters.size).toBe(0)
  })
})

describe('withTouch', () => {
  test('keeps the newest last and lets an edit outrank a read', async () => {
    const one = withTouch([], 'a.ts', 'edit', true)
    const two = withTouch(one, 'b.ts', 'read', true)
    const three = withTouch(two, 'a.ts', 'read', false)

    expect(three).toEqual([
      { path: 'b.ts', kind: 'read', isRunning: true },
      { path: 'a.ts', kind: 'edit', isRunning: false },
    ])
  })
})

describe('mentionText', () => {
  test('spaces the mention off what came before and quotes paths with spaces', async () => {
    expect(mentionText('src/app.ts', '')).toBe('@src/app.ts ')
    expect(mentionText('src/app.ts', 'look at')).toBe(' @src/app.ts ')
    expect(mentionText('src/app.ts', 'look at ')).toBe('@src/app.ts ')
    expect(mentionText('my notes.md', '')).toBe('@"my notes.md" ')
  })
})
