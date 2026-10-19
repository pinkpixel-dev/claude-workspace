import type { On, ProcessRunResult, PromptFillInput } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

// The test environment has timers, but the mod's lib (no DOM) doesn't declare them.
declare const setTimeout: (run: () => void, ms: number) => unknown

// A repo at /repo with one modified file in src/, opened from the repo root.
const STATUS = ['## main', ' M src/app.ts', '?? notes.md', ''].join('\0')

const ok = (stdout = ''): { value: ProcessRunResult } => ({
  value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})

const entry = (name: string, kind: 'file' | 'dir', size = 0) => ({ name, kind, size, mtimeMs: 0, isLink: false })

const fakeWorkspace = (on: On) => {
  const fills: PromptFillInput[] = []
  mock.clock(on)

  on('process.run', async ($, e) => {
    const args = e.argv.slice(1)
    if (args[0] === 'rev-parse') return ok('/repo\n/repo/.git\n')
    if (args[0] === 'status') return ok(STATUS)

    return ok()
  })
  on('fs.list', async ($, e) => ({
    value: !String(e.path ?? '').endsWith('src')
      ? [entry('src', 'dir'), entry('README.md', 'file', 120), entry('notes.md', 'file', 40)]
      : [entry('app.ts', 'file', 300)],
  }))
  on('session.cwd', async () => ({ value: '/repo' }))
  on('session.start', async ($, e) => ({ cwd: e.cwd }))
  on('command.register', async () => ({ value: { command: 'workspace' } }))
  on('prompt.read', async () => ({ value: { text: 'look at', cursor: 7 } }))
  on('prompt.fill', async ($, e) => {
    fills.push(e)
    return { isFilled: true, text: `look at${e.text}`, cursor: 7 + e.text.length }
  })
  on('tool.call', async () => ({ result: { ok: true } }))

  return fills
}

const mountPane = async ($: Engine) => {
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({
    plugin: 'workspace',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'workspace',
    props: {
      title: 'Workspace',
      isFocused: true,
      bodyColumns: 70,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 30 },
      view: {},
    },
  })

  // session.start kicks off the first refresh without waiting on it.
  for (let i = 0; i < 200 && (await ui.find({ key: 'mention:README.md' })) === undefined; i += 1) {
    await new Promise<void>(resolve => setTimeout(resolve, 5))
  }

  return ui
}

test('the file list shows git status for files and folders', async ($, on) => {
  fakeWorkspace(on)
  const ui = await mountPane($)

  expect(await ui.find({ type: 'Text', text: 'U' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '●' })).toBeDefined()
})

test('files Claude reads and edits get marked and listed in the strip', async ($, on) => {
  fakeWorkspace(on)
  const ui = await mountPane($)

  await $.tool.call({ tool: 'Read', file_path: '/repo/README.md' })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/src/app.ts', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Read', file_path: '/etc/hosts' })

  expect(await ui.find({ key: 'touch:README.md', text: /◆ README\.md/ })).toBeDefined()
  expect(await ui.find({ key: 'touch:src/app.ts', text: /✎ app\.ts/ })).toBeDefined()
  expect(await ui.find({ key: 'touch:/etc/hosts' })).toBeUndefined()
})

test('a new prompt clears the marks', async ($, on) => {
  fakeWorkspace(on)
  on('prompt.submit', async ($, e) => ({ text: e.text }))
  const ui = await mountPane($)

  await $.tool.call({ tool: 'Read', file_path: '/repo/README.md' })
  expect(await ui.find({ key: 'touch:README.md' })).toBeDefined()

  await $.prompt.submit({ text: 'next thing', wait: false, origin: { kind: 'composer' } })
  expect(await ui.find({ key: 'touch:README.md' })).toBeUndefined()
})

test('@ puts the path in the prompt box at the cursor', async ($, on) => {
  const fills = fakeWorkspace(on)
  const ui = await mountPane($)

  await ui.press({ key: 'mention:README.md' })

  expect(fills).toEqual([expect.objectContaining({ text: ' @README.md ', mode: 'insert' })])
})
