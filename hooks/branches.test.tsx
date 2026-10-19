import type { On, ProcessRunResult } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

// A repo on `dev` tracking origin, with an unmerged `wip` branch beside it
// and two remotes. The test's hooks sit beneath the mod, so its git calls land here.
const STATUS = ['## dev...origin/dev', ''].join('\0')
const BRANCHES = ['dev\torigin/dev\t', 'main\torigin/main\t[behind 3]', 'wip\t\t', ''].join('\n')

const ok = (stdout = ''): { value: ProcessRunResult } => ({
  value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})

const fakeRepo = (on: On) => {
  const ran: string[][] = []

  on('process.run', async ($, e) => {
    const args = e.argv.slice(1)
    ran.push([...args])
    if (args[0] === 'rev-parse') return ok('/repo\n')
    if (args[0] === 'status') return ok(STATUS)
    if (args[0] === 'branch' && args[1]?.startsWith('--format')) return ok(BRANCHES)
    if (args[0] === 'remote') return ok('origin\nfork\n')
    if (args.join(' ') === 'branch -d wip') {
      return { value: { ...ok().value, exitCode: 1, stderr: "error: the branch 'wip' is not fully merged" } }
    }

    return ok()
  })
  on('fs.list', async () => ({ value: [] }))

  return ran
}

const openBranches = async ($: Engine) => {
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
  await ui.press({ key: 'view-branches' })

  return ui
}

test('the branches view lists local branches with what they track', async ($, on) => {
  fakeRepo(on)
  const ui = await openBranches($)

  expect(await ui.find({ key: 'view-branches', text: 'Branches 3' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'origin/main' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '↑0 ↓3' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'local' })).toBeDefined()
  // The branch you're on can be renamed but not switched to or deleted.
  expect(await ui.find({ key: 'branch-rename:dev' })).toBeDefined()
  expect(await ui.find({ key: 'branch-delete:dev' })).toBeUndefined()
  expect(await ui.find({ key: 'branch-switch:main' })).toBeDefined()
})

test('a new branch is created from where you are and switched to', async ($, on) => {
  const ran = fakeRepo(on)
  const ui = await openBranches($)

  await ui.press({ key: 'branch-new' })
  await ui.input({ key: 'branch-name', text: 'feature/x', kind: 'change' })
  await ui.press({ key: 'branch-save' })

  expect(ran).toContainEqual(['switch', '-c', 'feature/x'])
  expect(await ui.find({ key: 'branch-name' })).toBeUndefined()
})

test('renaming starts from the old name and runs git branch -m', async ($, on) => {
  const ran = fakeRepo(on)
  const ui = await openBranches($)

  await ui.press({ key: 'branch-rename:main' })
  expect((await ui.find({ key: 'branch-name' }))?.text).toBe('main')

  await ui.input({ key: 'branch-name', text: 'trunk', kind: 'change' })
  await ui.press({ key: 'branch-save' })

  expect(ran).toContainEqual(['branch', '-m', 'main', 'trunk'])
})

test('a merged branch deletes with -d and no question', async ($, on) => {
  const ran = fakeRepo(on)
  const ui = await openBranches($)

  await ui.press({ key: 'branch-delete:main' })

  expect(ran).toContainEqual(['branch', '-d', 'main'])
  expect(await ui.find({ key: 'confirm-yes' })).toBeUndefined()
})

test('an unmerged branch offers a force delete, behind a confirm', async ($, on) => {
  const ran = fakeRepo(on)
  const ui = await openBranches($)

  await ui.press({ key: 'branch-delete:wip' })

  expect(await ui.find({ type: 'Text', text: /wip has unmerged commits/ })).toBeDefined()
  expect(ran.some(args => args.join(' ') === 'branch -D wip')).toBe(false)

  await ui.press({ key: 'confirm-yes' })

  expect(ran).toContainEqual(['branch', '-D', 'wip'])
})

test('the picked remote is remembered and push uses it', async ($, on) => {
  mock.store(on)
  const ran = fakeRepo(on)
  const ui = await openBranches($)

  await ui.select({ key: 'remote', value: 'fork' })
  await ui.press({ key: 'refresh' })

  expect((await ui.find({ key: 'remote' }))?.props.value).toBe('fork')

  await ui.press({ key: 'push' })

  expect(ran).toContainEqual(['push', 'fork', 'dev'])
})
