import { describe, expect, test } from 'claude-code/testing'

import {
  discardArgs,
  hasConflictMarkers,
  isConflicted,
  isPushed,
  isStaged,
  isUnstaged,
  limitDiff,
  operationArgs,
  parseBranches,
  parseLog,
  parseRemoteBranches,
  parseRemotes,
  parseStashes,
  parseStatus,
  pickRemote,
  pullArgs,
  pushArgs,
  remoteOnly,
  shortAge,
  splitHunks,
} from './git'

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

test('parseBranches reads tracking and drops blank lines and detached HEAD', async () => {
  const out = [
    '(HEAD detached at 1a2b3c)\t\t',
    'main\torigin/main\t[ahead 1, behind 2]',
    'dev\t\t',
    'old\torigin/old\t[gone]',
    '',
  ].join('\n')

  expect(parseBranches(out)).toEqual([
    { name: 'main', upstream: 'origin/main', ahead: 1, behind: 2, isGone: false },
    { name: 'dev', upstream: undefined, ahead: 0, behind: 0, isGone: false },
    { name: 'old', upstream: 'origin/old', ahead: 0, behind: 0, isGone: true },
  ])
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

test('pickRemote prefers the saved choice, then the upstream, then origin', async () => {
  expect(pickRemote(['origin', 'fork'], 'fork', 'origin/dev')).toBe('fork')
  expect(pickRemote(['origin', 'fork'], 'gone', 'fork/dev')).toBe('fork')
  expect(pickRemote(['fork', 'origin'], undefined)).toBe('origin')
  expect(pickRemote(['fork'], undefined)).toBe('fork')
  expect(pickRemote([], undefined)).toBe('')
})

test('push and pull name the remote unless it is the upstream one', async () => {
  const repo = { branch: 'dev', remotes: ['origin', 'fork'], upstream: 'origin/dev', remote: 'origin' }

  expect(pushArgs(repo)).toEqual(['push'])
  expect(pullArgs(repo)).toEqual(['pull', '--no-edit'])
  expect(pushArgs({ ...repo, remote: 'fork' })).toEqual(['push', 'fork', 'dev'])
  expect(pullArgs({ ...repo, remote: 'fork' })).toEqual(['pull', '--no-edit', 'fork', 'dev'])
  expect(pushArgs({ ...repo, upstream: undefined, remote: 'fork' })).toEqual(['push', '-u', 'fork', 'dev'])
})

test('shortAge squeezes git\'s relative dates', async () => {
  expect(shortAge('5 minutes ago')).toBe('5m')
  expect(shortAge('2 hours ago')).toBe('2h')
  expect(shortAge('3 months ago')).toBe('3mo')
  expect(shortAge('1 year, 2 months ago')).toBe('1y')
  expect(shortAge('in the future')).toBe('in the future')
})

test('parseLog reads commits, keeps tabs in subjects and spots merges', async () => {
  const out = [
    'aaa111\taaa\tp1 p2\t2 hours ago\tMerge branch dev',
    'bbb222\tbbb\tp1\t3 days ago\tfix:\ttabbed subject',
    'ccc333\tccc\t\t1 week ago\tfirst commit',
    '',
  ].join('\n')

  expect(parseLog(out)).toEqual([
    { sha: 'aaa111', short: 'aaa', subject: 'Merge branch dev', age: '2h', isMerge: true },
    { sha: 'bbb222', short: 'bbb', subject: 'fix:\ttabbed subject', age: '3d', isMerge: false },
    { sha: 'ccc333', short: 'ccc', subject: 'first commit', age: '1w', isMerge: false },
  ])
})

test('parseStashes reads ref, age and message', async () => {
  expect(parseStashes('stash@{0}\t10 minutes ago\tOn dev: half done\n')).toEqual([
    { ref: 'stash@{0}', age: '10m', message: 'On dev: half done' },
  ])
})

test('remote branches drop HEAD pointers, and remoteOnly hides ones you have', async () => {
  const remoteBranches = parseRemoteBranches(
    ['origin/HEAD\trefs/remotes/origin/main', 'origin/main\t', 'origin/feature\t', 'fork/dev\t', ''].join('\n'),
  )
  expect(remoteBranches).toEqual(['origin/main', 'origin/feature', 'fork/dev'])

  const branches = [
    { name: 'main', upstream: 'origin/main', ahead: 0, behind: 0, isGone: false },
    { name: 'dev', upstream: undefined, ahead: 0, behind: 0, isGone: false },
  ]
  expect(remoteOnly({ branches, remoteBranches, remotes: ['origin', 'fork'] })).toEqual(['origin/feature'])
})

test('isConflicted knows every unmerged status pair', async () => {
  for (const pair of ['UU', 'AA', 'DD', 'AU', 'UA', 'DU', 'UD']) {
    expect(isConflicted({ path: 'x', index: pair[0] ?? '', work: pair[1] ?? '' })).toBe(true)
  }
  expect(isConflicted({ path: 'x', index: 'M', work: 'M' })).toBe(false)
})

test('operationArgs finishes a merge with a commit and the rest with --continue', async () => {
  expect(operationArgs('merge', 'continue')).toEqual(['commit', '--no-edit'])
  expect(operationArgs('merge', 'abort')).toEqual(['merge', '--abort'])
  expect(operationArgs('rebase', 'continue')).toEqual(['rebase', '--continue'])
  expect(operationArgs('cherry-pick', 'abort')).toEqual(['cherry-pick', '--abort'])
})

test('hasConflictMarkers spots git markers but not look-alikes', async () => {
  expect(hasConflictMarkers('a\n<<<<<<< HEAD\nb\n=======\nc\n>>>>>>> dev\n')).toBe(true)
  expect(hasConflictMarkers('a\n// <<<<<<< not at line start\n')).toBe(false)
  expect(hasConflictMarkers('<<<<<<<<< nine\n')).toBe(false)
})

test('splitHunks keeps the header and splits each hunk off whole', async () => {
  const header = 'diff --git a/x b/x\nindex 1..2 100644\n--- a/x\n+++ b/x\n'
  const one = '@@ -1,2 +1,2 @@\n-a\n+b\n c\n'
  const two = '@@ -10,1 +10,1 @@\n-d\n+e\n'
  const split = splitHunks(`${header}${one}${two}`)

  expect(split.header).toBe(header)
  expect(split.hunks).toEqual([one, two])
  expect(splitHunks('Binary files a/x and b/x differ\n').hunks).toEqual([])
})
