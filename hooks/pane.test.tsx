import type { On, ProcessRunResult } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

// A small repo on `main` with one staged and one unstaged file. The test's
// hooks sit beneath the mod, so the mod's real git calls land here.
const STATUS = ['## main...origin/main [ahead 1]', 'M  src/app.ts', ' M README.md', ''].join('\0')

// A hook on a call on `$` answers in its place with `{ value }`.
const ok = (stdout = ''): { value: ProcessRunResult } => ({
  value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})

const fakeRepo = (on: On, status = STATUS) => {
  const ran: string[][] = []

  on('process.run', async ($, e) => {
    const args = e.argv.slice(1)
    ran.push([...args])
    if (args[0] === 'rev-parse') return ok('/repo\n')
    if (args[0] === 'status') return ok(status)
    if (args[0] === 'branch') return ok('main\ndev\n')
    if (args[0] === 'remote') return ok('origin\n')
    if (args[0] === 'commit') return ok('[main 1a2b3c4] fix: header spacing\n')

    return ok()
  })
  on('fs.list', async () => ({ value: [] }))

  return ran
}

const mountPane = ($: Engine) =>
  $.ui.mount({
    plugin: 'workspace',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'workspace',
    props: {
      title: 'Workspace',
      isFocused: true,
      bodyColumns: 60,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 30 },
      view: {},
    },
  })

const openSourceControl = async ($: Engine) => {
  const ui = await mountPane($)
  await ui.press({ key: 'tab-git' })

  return ui
}

test('opens on the files tab', async ($, on) => {
  fakeRepo(on)
  const ui = await mountPane($)

  expect(await ui.find({ key: 'tab-files' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Empty folder.' })).toBeDefined()
})

test('source control lists staged and unstaged changes', async ($, on) => {
  fakeRepo(on)
  const ui = await openSourceControl($)

  expect(await ui.find({ key: 'tab-git', text: 'Source Control 2' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Staged Changes' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '↑1 ↓0' })).toBeDefined()
  expect(await ui.find({ key: 'unstage:src/app.ts' })).toBeDefined()
  expect(await ui.find({ key: 'stage:README.md' })).toBeDefined()
})

test('staging a file runs git add on that path', async ($, on) => {
  const ran = fakeRepo(on)
  const ui = await openSourceControl($)

  await ui.press({ key: 'stage:README.md' })

  expect(ran).toContainEqual(['add', '-A', '--', 'README.md'])
})

test('folding a section hides its rows and unfolding brings them back', async ($, on) => {
  fakeRepo(on)
  const ui = await openSourceControl($)

  await ui.press({ key: 'fold:work' })
  expect(await ui.find({ key: 'stage:README.md' })).toBeUndefined()
  expect(await ui.find({ key: 'unstage:src/app.ts' })).toBeDefined()

  await ui.press({ key: 'fold:work' })
  expect(await ui.find({ key: 'stage:README.md' })).toBeDefined()
})

test('commit without a message explains what is missing', async ($, on) => {
  const ran = fakeRepo(on)
  const ui = await openSourceControl($)

  await ui.press({ key: 'commit' })

  expect(await ui.find({ type: 'Text', text: 'Type a commit message first.' })).toBeDefined()
  expect(ran.some(args => args[0] === 'commit')).toBe(false)
})

test('committing on main asks first, then commits and clears the box', async ($, on) => {
  const ran = fakeRepo(on)
  const ui = await openSourceControl($)

  await ui.input({ key: 'message', text: 'fix: header spacing', kind: 'change' })
  await ui.press({ key: 'commit' })

  expect(await ui.find({ type: 'Text', text: 'Commit straight to main?' })).toBeDefined()
  expect(ran.some(args => args[0] === 'commit')).toBe(false)

  await ui.press({ key: 'confirm-yes' })

  expect(ran).toContainEqual(['commit', '-m', 'fix: header spacing'])
  expect((await ui.find({ key: 'message' }))?.text).toBe('')
  expect(await ui.find({ key: 'confirm-yes' })).toBeUndefined()
})

test('picking a branch switches to it', async ($, on) => {
  const ran = fakeRepo(on)
  const ui = await openSourceControl($)

  await ui.select({ key: 'branch', value: 'dev' })

  expect(ran).toContainEqual(['switch', 'dev'])
})

test('a folder with no repo offers to initialize one', async ($, on) => {
  const ran: string[][] = []
  let isRepo = false

  on('process.run', async ($, e) => {
    const args = e.argv.slice(1)
    ran.push([...args])
    if (args[0] === 'init') isRepo = true
    if (args[0] === 'rev-parse' && !isRepo) {
      return { value: { ...ok('').value, exitCode: 128, stderr: 'fatal: not a git repository' } }
    }
    if (args[0] === 'rev-parse') return ok('/repo\n')
    if (args[0] === 'status') return ok('## No commits yet on main\0')

    return ok()
  })
  on('fs.list', async () => ({ value: [] }))
  const ui = await openSourceControl($)

  expect(await ui.find({ type: 'Text', text: "This folder isn't a git repository yet." })).toBeDefined()

  await ui.press({ key: 'init' })

  expect(ran).toContainEqual(['init', '-b', 'main'])
  expect(await ui.find({ key: 'init' })).toBeUndefined()
  expect(await ui.find({ key: 'commit' })).toBeDefined()
})

test('discarding a file asks first, then restores it', async ($, on) => {
  const ran = fakeRepo(on)
  const ui = await openSourceControl($)

  await ui.press({ key: 'discard:README.md' })

  expect(await ui.find({ type: 'Text', text: 'Discard changes to README.md?' })).toBeDefined()
  expect(ran.some(args => args[0] === 'restore')).toBe(false)

  await ui.press({ key: 'confirm-yes' })

  expect(ran).toContainEqual(['restore', '--worktree', '--', 'README.md'])
})

test('discard all restores tracked files and deletes untracked ones', async ($, on) => {
  const ran = fakeRepo(on, ['## dev', ' M README.md', '?? notes.md', ''].join('\0'))
  const ui = await openSourceControl($)

  await ui.press({ key: 'discard-all' })

  expect(await ui.find({ type: 'Text', text: 'Discard all 2 changes? Untracked files get deleted.' })).toBeDefined()

  await ui.press({ key: 'confirm-yes' })

  expect(ran).toContainEqual(['restore', '--worktree', '--', 'README.md'])
  expect(ran).toContainEqual(['clean', '-f', '-d', '-q', '--', 'notes.md'])
})

test('amending a pushed commit warns, then keeps the old message', async ($, on) => {
  const ran = fakeRepo(on, ['## dev...origin/dev', 'M  src/app.ts', ''].join('\0'))
  const ui = await openSourceControl($)

  await ui.press({ key: 'amend' })

  expect(await ui.find({ type: 'Text', text: /Amend a pushed commit\?/ })).toBeDefined()
  expect(ran.some(args => args[0] === 'commit')).toBe(false)

  await ui.press({ key: 'confirm-yes' })

  expect(ran).toContainEqual(['commit', '--amend', '--no-edit'])
})

test('commit all stages everything before committing', async ($, on) => {
  const ran = fakeRepo(on, ['## dev', ' M README.md', '?? notes.md', ''].join('\0'))
  const ui = await openSourceControl($)

  await ui.input({ key: 'message', text: 'docs: notes', kind: 'change' })
  await ui.press({ key: 'commit-all' })

  const added = ran.findIndex(args => args.join(' ') === 'add -A')
  const committed = ran.findIndex(args => args.join(' ') === 'commit -m docs: notes')
  expect(added).toBeGreaterThan(-1)
  expect(committed).toBeGreaterThan(added)
})

test('fetch runs git fetch', async ($, on) => {
  const ran = fakeRepo(on)
  const ui = await openSourceControl($)

  await ui.press({ key: 'fetch' })

  expect(ran).toContainEqual(['fetch', 'origin'])
})

test('the pane fetches on its own every few minutes while it is shown', async ($, on) => {
  const clock = mock.clock(on)
  const ran = fakeRepo(on)
  on('session.start', async ($, e) => ({ cwd: e.cwd }))
  on('command.register', async () => ({ value: { command: 'workspace' } }))
  on('ui.panes', async () => ({
    value: [{ id: 'workspace', title: 'Workspace', isShown: true, isFocused: false, isPlaced: true, plugin: 'workspace' }],
  }))

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await clock.advance(60 * 1000)
  expect(ran).not.toContainEqual(['fetch', '--quiet', 'origin'])

  await clock.advance(2 * 60 * 1000)
  expect(ran).toContainEqual(['fetch', '--quiet', 'origin'])
})
