import type { On, ProcessRunResult } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

// A repo on `dev` with one staged and one unstaged file, two commits, two
// tags, two stashes, and branches on origin. Its git calls land in these hooks.
const STATUS = ['## dev...origin/dev', 'M  app.ts', ' M README.md', ''].join('\0')
const LOG = ['bbb222\tbbb\taaa111\t1 hour ago\tfeat: tags', 'aaa111\taaa\t\t2 days ago\tfirst commit', ''].join('\n')
const TAGS = ['v1.1.0\t2 hours ago\tsecond release', 'v1.0.0\t3 days ago\tfirst release', ''].join('\n')
const STASHES = ['stash@{0}\t1 day ago\tOn dev: half done', 'stash@{1}\t2 days ago\tOn dev: older', ''].join('\n')

const ok = (stdout = ''): { value: ProcessRunResult } => ({
  value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})

type Options = { isPublished?: boolean }

const fakeRepo = (on: On, { isPublished = true }: Options = {}) => {
  const ran: string[][] = []

  on('process.run', async ($, e) => {
    const args = e.argv.slice(1)
    const line = args.join(' ')
    ran.push([...args])
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return ok('/repo\n')
    if (line === 'rev-parse --absolute-git-dir') return ok('/repo/.git\n')
    if (args[0] === 'status') return ok(isPublished ? STATUS : STATUS.replace('dev...origin/dev', 'dev'))
    if (line.startsWith('branch -r')) return ok('origin/dev\t\norigin/old\t\n')
    if (args[0] === 'branch') return ok(isPublished ? 'dev\torigin/dev\t\nmain\torigin/main\t\n' : 'dev\t\t\n')
    if (args[0] === 'remote') return ok('origin\n')
    if (line.startsWith('log -1 --format=%B')) return ok('feat: tags\n')
    if (args[0] === 'log') return ok(LOG)
    if (args[0] === 'tag' && args[1] === '--sort=-creatordate') return ok(TAGS)
    if (line.startsWith('stash list')) return ok(STASHES)

    return ok()
  })
  on('fs.list', async () => ({ value: [] }))
  on('fs.stat', async ($, e) => {
    throw new Error(`ENOENT: ${e.path}`)
  })

  return ran
}

const openView = async ($: Engine, view: string) => {
  const ui = await $.ui.mount({
    plugin: 'workspace',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'workspace',
    props: {
      title: 'Workspace',
      isFocused: true,
      bodyColumns: 100,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 40 },
      view: {},
    },
  })
  await ui.press({ key: 'tab-git' })
  await ui.press({ key: view })

  return ui
}

// Branches

test('a new branch can start from another ref', async ($, on) => {
  const ran = fakeRepo(on)
  const ui = await openView($, 'view-branches')

  await ui.press({ key: 'branch-new' })
  expect((await ui.find({ key: 'branch-base' }))?.props.value).toBe('dev')

  await ui.select({ key: 'branch-base', value: 'v1.0.0' })
  await ui.input({ key: 'branch-name', text: 'hotfix', kind: 'change' })
  await ui.press({ key: 'branch-save' })

  expect(ran).toContainEqual(['switch', '-c', 'hotfix', 'v1.0.0'])
})

test('Branch on a History commit opens the form from that commit', async ($, on) => {
  const ran = fakeRepo(on)
  const ui = await openView($, 'view-history')

  await ui.press({ key: 'commit-branch:aaa111' })
  expect((await ui.find({ key: 'branch-base' }))?.props.value).toBe('aaa111')

  await ui.input({ key: 'branch-name', text: 'from-first', kind: 'change' })
  await ui.press({ key: 'branch-save' })

  expect(ran).toContainEqual(['switch', '-c', 'from-first', 'aaa111'])
})

test('a remote branch is deleted on the remote only after a confirm', async ($, on) => {
  const ran = fakeRepo(on)
  const ui = await openView($, 'view-branches')

  // Tracked remote branches are listed too, just without Check out.
  expect(await ui.find({ key: 'branch-delete-remote:origin/dev' })).toBeDefined()
  expect(await ui.find({ key: 'branch-checkout:origin/dev' })).toBeUndefined()

  await ui.press({ key: 'branch-delete-remote:origin/old' })
  expect(ran.some(args => args.join(' ') === 'push origin --delete old')).toBe(false)

  await ui.press({ key: 'confirm-yes' })
  expect(ran).toContainEqual(['push', 'origin', '--delete', 'old'])
})

test('remotes can be added and removed', async ($, on) => {
  const ran = fakeRepo(on)
  const ui = await openView($, 'view-branches')

  await ui.press({ key: 'remote-add' })
  await ui.input({ key: 'remote-name', text: 'upstream', kind: 'change' })
  await ui.input({ key: 'remote-url', text: 'https://example.com/repo.git', kind: 'change' })
  await ui.press({ key: 'remote-save' })

  expect(ran).toContainEqual(['remote', 'add', 'upstream', 'https://example.com/repo.git'])
  expect(ran).toContainEqual(['fetch', 'upstream'])

  await ui.press({ key: 'remote-remove:origin' })
  await ui.press({ key: 'confirm-yes' })

  expect(ran).toContainEqual(['remote', 'remove', 'origin'])
})

// Tags

test('the tags view lists tags and makes annotated ones from a message', async ($, on) => {
  const ran = fakeRepo(on)
  const ui = await openView($, 'view-tags')

  expect(await ui.find({ key: 'view-tags', text: 'Tags 2' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'second release' })).toBeDefined()

  await ui.press({ key: 'tag-new' })
  await ui.input({ key: 'tag-name', text: 'v1.2.0', kind: 'change' })
  await ui.input({ key: 'tag-message', text: 'third release', kind: 'change' })
  await ui.press({ key: 'tag-save' })

  expect(ran).toContainEqual(['tag', '-a', 'v1.2.0', '-m', 'third release', 'HEAD'])
})

test('Tag on a History commit tags that commit', async ($, on) => {
  const ran = fakeRepo(on)
  const ui = await openView($, 'view-history')

  await ui.press({ key: 'commit-tag:aaa111' })
  await ui.input({ key: 'tag-name', text: 'v0.1.0', kind: 'change' })
  await ui.press({ key: 'tag-save' })

  expect(ran).toContainEqual(['tag', 'v0.1.0', 'aaa111'])
})

test('a tag can be checked out detached, pushed and deleted', async ($, on) => {
  const ran = fakeRepo(on)
  const ui = await openView($, 'view-tags')

  await ui.press({ key: 'tag-checkout:v1.0.0' })
  await ui.press({ key: 'tag-push:v1.0.0' })
  await ui.press({ key: 'tag-push-all' })
  await ui.press({ key: 'tag-delete:v1.0.0' })

  expect(ran).toContainEqual(['switch', '--detach', 'v1.0.0'])
  expect(ran).toContainEqual(['push', 'origin', 'refs/tags/v1.0.0'])
  expect(ran).toContainEqual(['push', 'origin', '--tags'])
  expect(ran).toContainEqual(['tag', '-d', 'v1.0.0'])
})

// Commit and changes

test('undoing a pushed HEAD asks, then soft resets and puts the message back', async ($, on) => {
  const ran = fakeRepo(on)
  const ui = await openView($, 'view-history')

  // Only the HEAD commit gets Undo.
  expect(await ui.find({ key: 'commit-undo:aaa111' })).toBeUndefined()

  await ui.press({ key: 'commit-undo:bbb222' })
  expect(ran.some(args => args[0] === 'reset')).toBe(false)

  await ui.press({ key: 'confirm-yes' })
  expect(ran).toContainEqual(['reset', '--soft', 'HEAD~1'])

  await ui.press({ key: 'view-changes' })
  expect((await ui.find({ key: 'message' }))?.props.value).toBe('feat: tags')
})

test('Unstage all sits on the staged section', async ($, on) => {
  const ran = fakeRepo(on)
  const ui = await openView($, 'view-changes')

  await ui.press({ key: 'unstage-all' })

  expect(ran).toContainEqual(['restore', '--staged', '--', '.'])
})

// Sync

test('a branch with no upstream offers Publish', async ($, on) => {
  const ran = fakeRepo(on, { isPublished: false })
  const ui = await openView($, 'view-changes')

  expect(await ui.find({ key: 'push', text: /Publish/ })).toBeDefined()
  await ui.press({ key: 'push' })

  expect(ran).toContainEqual(['push', '-u', 'origin', 'dev'])
})

test('More opens pull rebase, sync, fetch all and a confirmed force push', async ($, on) => {
  const ran = fakeRepo(on)
  const ui = await openView($, 'view-changes')

  expect(await ui.find({ key: 'force-push' })).toBeUndefined()
  await ui.press({ key: 'sync-more' })

  await ui.press({ key: 'pull-rebase' })
  await ui.press({ key: 'sync' })
  await ui.press({ key: 'fetch-all' })
  await ui.press({ key: 'force-push' })
  expect(ran.some(args => args.includes('--force-with-lease'))).toBe(false)
  await ui.press({ key: 'confirm-yes' })

  expect(ran).toContainEqual(['pull', '--no-edit', '--rebase'])
  expect(ran).toContainEqual(['push'])
  expect(ran).toContainEqual(['fetch', '--all', '--prune'])
  expect(ran).toContainEqual(['push', '--force-with-lease', 'origin', 'dev'])
})

// Stash

test('the stash view can stash staged changes and drop every stash', async ($, on) => {
  const ran = fakeRepo(on)
  const ui = await openView($, 'view-stash')

  await ui.press({ key: 'stash-staged' })
  expect(ran).toContainEqual(['stash', 'push', '--staged'])

  await ui.press({ key: 'stash-drop-all' })
  expect(ran.some(args => args.join(' ') === 'stash clear')).toBe(false)
  await ui.press({ key: 'confirm-yes' })

  expect(ran).toContainEqual(['stash', 'clear'])
})
