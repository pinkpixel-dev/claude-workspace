import type { On, ProcessRunResult } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

// A repo on `dev` with three commits (one a merge), one stash, one edited
// file, and a teammate's branch on origin. Its git calls land in these hooks.
const STATUS = ['## dev...origin/dev', ' M README.md', ''].join('\0')
const LOG = [
  'aaa111\taaa\tp1 p2\t1 hour ago\tMerge branch feature',
  'bbb222\tbbb\tp1\t2 hours ago\tfix: header spacing',
  'ccc333\tccc\t\t3 days ago\tfirst commit',
  '',
].join('\n')

const ok = (stdout = ''): { value: ProcessRunResult } => ({
  value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})
const failed = (stderr: string): { value: ProcessRunResult } => ({ value: { ...ok().value, exitCode: 1, stderr } })

type Options = { isRevertStuck?: boolean }

const fakeRepo = (on: On, { isRevertStuck = false }: Options = {}) => {
  const ran: string[][] = []

  on('process.run', async ($, e) => {
    const args = e.argv.slice(1)
    const line = args.join(' ')
    ran.push([...args])
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return ok('/repo\n')
    if (line === 'rev-parse -q --verify REVERT_HEAD') return isRevertStuck ? ok('ddd444\n') : failed('')
    if (args[0] === 'status') return ok(STATUS)
    if (line.startsWith('branch -r')) return ok('origin/HEAD\trefs/remotes/origin/dev\norigin/dev\t\norigin/feature\t\n')
    if (args[0] === 'branch') return ok('dev\torigin/dev\t\n')
    if (args[0] === 'remote') return ok('origin\n')
    if (args[0] === 'log') return ok(LOG)
    if (line.startsWith('stash list')) return ok('stash@{0}\t1 day ago\tOn dev: half done\n')
    if (args[0] === 'show') return ok('diff --git a/x b/x\n@@ -1 +1 @@\n-a\n+b\n')
    if (args[0] === 'revert' && args[1] === '--no-edit' && isRevertStuck) return failed('error: could not revert bbb')

    return ok()
  })
  on('fs.list', async () => ({ value: [] }))

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
      bodyColumns: 80,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 30 },
      view: {},
    },
  })
  await ui.press({ key: 'tab-git' })
  await ui.press({ key: view })

  return ui
}

test('history lists commits, and merges have no revert button', async ($, on) => {
  fakeRepo(on)
  const ui = await openView($, 'view-history')

  expect(await ui.find({ type: 'Text', text: 'fix: header spacing' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '2h ' })).toBeDefined()
  expect(await ui.find({ key: 'commit-revert:bbb222' })).toBeDefined()
  expect(await ui.find({ key: 'commit-revert:aaa111' })).toBeUndefined()
})

test('clicking a commit shows its diff, and back returns to the list', async ($, on) => {
  const ran = fakeRepo(on)
  const ui = await openView($, 'view-history')

  await ui.press({ key: 'commit-show:bbb222' })

  expect(ran).toContainEqual(['show', '--format=', '--patch', 'bbb222'])
  expect(await ui.find({ key: 'commit-back' })).toBeDefined()

  await ui.press({ key: 'commit-back' })

  expect(await ui.find({ key: 'commit-show:bbb222' })).toBeDefined()
})

test('revert asks first, then makes the undo commit', async ($, on) => {
  const ran = fakeRepo(on)
  const ui = await openView($, 'view-history')

  await ui.press({ key: 'commit-revert:bbb222' })

  expect(await ui.find({ type: 'Text', text: /Revert "fix: header spacing"\?/ })).toBeDefined()
  expect(ran.some(args => args[0] === 'revert')).toBe(false)

  await ui.press({ key: 'confirm-yes' })

  expect(ran).toContainEqual(['revert', '--no-edit', 'bbb222'])
})

test('a revert that conflicts is rolled back and explained', async ($, on) => {
  const ran = fakeRepo(on, { isRevertStuck: true })
  const ui = await openView($, 'view-history')

  await ui.press({ key: 'commit-revert:bbb222' })
  await ui.press({ key: 'confirm-yes' })

  expect(ran).toContainEqual(['revert', '--abort'])
  expect(await ui.find({ type: 'Text', text: /conflicts with later changes, so it was rolled back/ })).toBeDefined()
})

test('stash in Changes takes untracked files and the typed name', async ($, on) => {
  const ran = fakeRepo(on)
  const ui = await openView($, 'view-changes')

  await ui.input({ key: 'message', text: 'half done', kind: 'change' })
  await ui.press({ key: 'stash' })

  expect(ran).toContainEqual(['stash', 'push', '-u', '-m', 'half done'])
  expect((await ui.find({ key: 'message' }))?.text).toBe('')
})

test('the stash view applies, pops, and drops only after a confirm', async ($, on) => {
  const ran = fakeRepo(on)
  const ui = await openView($, 'view-stash')

  expect(await ui.find({ key: 'view-stash', text: 'Stash 1' })).toBeDefined()

  await ui.press({ key: 'stash-apply:stash@{0}' })
  await ui.press({ key: 'stash-pop:stash@{0}' })
  expect(ran).toContainEqual(['stash', 'apply', 'stash@{0}'])
  expect(ran).toContainEqual(['stash', 'pop', 'stash@{0}'])

  await ui.press({ key: 'stash-drop:stash@{0}' })
  expect(ran.some(args => args.join(' ') === 'stash drop stash@{0}')).toBe(false)

  await ui.press({ key: 'confirm-yes' })
  expect(ran).toContainEqual(['stash', 'drop', 'stash@{0}'])
})

test('a remote-only branch can be checked out as a tracking branch', async ($, on) => {
  const ran = fakeRepo(on)
  const ui = await openView($, 'view-branches')

  expect(await ui.find({ key: 'branch-checkout:origin/dev' })).toBeUndefined()

  await ui.press({ key: 'branch-checkout:origin/feature' })

  expect(ran).toContainEqual(['switch', '--track', 'origin/feature'])
})
