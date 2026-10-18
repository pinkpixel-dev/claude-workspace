import { describe, expect, test } from 'claude-code/testing'

import { discardArgs, isPushed, isStaged, isUnstaged, limitDiff, parseBranches, parseRemotes, parseStatus } from './git'

describe('parseStatus', () => {
  test('reads branch tracking and every kind of change', async () => {
    const out = [
      '## feature/x...origin/feature/x [ahead 2, behind 1]',
      'M  src/staged.ts',
      ' M src/edited.ts',
      'MM src/both.ts',
      'R  src/new-name.ts',
      'src/old-name.ts',
      '?? notes.md',
      '',
    ].join('\0')
    const summary = parseStatus(out)

    expect(summary.branch).toBe('feature/x')
    expect(summary.upstream).toBe('origin/feature/x')
    expect(summary.ahead).toBe(2)
    expect(summary.behind).toBe(1)
    expect(summary.changes.map(one => one.path)).toEqual([
      'src/staged.ts',
      'src/edited.ts',
      'src/both.ts',
      'src/new-name.ts',
      'notes.md',
    ])
    expect(summary.changes.filter(isStaged).map(one => one.path)).toEqual([
      'src/staged.ts',
      'src/both.ts',
      'src/new-name.ts',
    ])
    expect(summary.changes.filter(isUnstaged).map(one => one.path)).toEqual([
      'src/edited.ts',
      'src/both.ts',
      'notes.md',
    ])
  })

  test('handles a branch with no upstream and a fresh repo', async () => {
    expect(parseStatus('## dev\0').upstream).toBeUndefined()
    expect(parseStatus('## dev\0').branch).toBe('dev')
    expect(parseStatus('## No commits yet on main\0').branch).toBe('main')
  })
})

test('parseBranches drops blank lines and detached HEAD', async () => {
  expect(parseBranches('main\n(HEAD detached at 1a2b3c)\ndev\n\n')).toEqual(['main', 'dev'])
})

test('limitDiff cuts on a hunk boundary', async () => {
  const hunk = '@@ -1,1 +1,1 @@\n-a\n+b\n'
  const text = `diff --git a/x b/x\n${hunk}${hunk}${hunk}`
  const cut = limitDiff(text, text.length - 5)

  expect(cut.endsWith('+b\n')).toBe(true)
  expect(cut.split('@@ -1').length - 1).toBe(2)
  expect(limitDiff(text)).toBe(text)
})

test('parseRemotes reads one remote per line', async () => {
  expect(parseRemotes('origin\nupstream\n\n')).toEqual(['origin', 'upstream'])
  expect(parseRemotes('')).toEqual([])
})

test('isPushed only when the branch tracks a remote and nothing is ahead', async () => {
  expect(isPushed({ upstream: 'origin/dev', ahead: 0 })).toBe(true)
  expect(isPushed({ upstream: 'origin/dev', ahead: 2 })).toBe(false)
  expect(isPushed({ upstream: undefined, ahead: 0 })).toBe(false)
})

test('discardArgs restores tracked files and cleans untracked ones', async () => {
  expect(discardArgs({ path: 'src/a.ts', index: ' ', work: 'M' })).toEqual(['restore', '--worktree', '--', 'src/a.ts'])
  expect(discardArgs({ path: 'notes.md', index: '?', work: '?' })).toEqual(['clean', '-f', '-d', '-q', '--', 'notes.md'])
})
