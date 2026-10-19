import type { On, ProcessRunResult, PromptFillInput } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

declare const setTimeout: (run: () => void, ms: number) => unknown

const ok = (stdout = ''): { value: ProcessRunResult } => ({
  value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})

// The engine hands fs hooks absolute paths; the fake disk is one flat folder, keyed by name.
const nameOf = (path: unknown) => String(path).slice(String(path).lastIndexOf('/') + 1)

const entry = (name: string) => ({ name, kind: 'file' as const, size: 10, mtimeMs: 0, isLink: false })

// A folder at /repo whose files live in `disk`; Edit and Write calls change it
// and hand back the file as it was, the way the real tools do.
const fakeWorkspace = (on: On, disk: Map<string, string>) => {
  const ran: string[][] = []
  const fills: PromptFillInput[] = []
  // What the next Bash call does to the disk, and the result it hands back.
  const bash: { run: () => unknown }[] = []
  mock.clock(on)
  mock.store(on)

  on('process.run', async ($, e) => {
    const args = e.argv.slice(1)
    ran.push([...args])
    if (args[0] === 'rev-parse') return ok('/repo\n/repo/.git\n')
    if (args[0] === 'status') return ok('## main\0')
    if (args[0] === 'clean') disk.delete(args[args.length - 1] ?? '')

    return ok()
  })
  on('fs.list', async () => ({ value: [...disk.keys()].map(entry) }))
  on('fs.stat', async ($, e) => ({ value: { kind: 'file', size: (disk.get(nameOf(e.path)) ?? '').length, mtimeMs: 0, isLink: false } }))
  on('fs.read', async ($, e) => {
    const text = disk.get(nameOf(e.path))
    if (text === undefined) throw new Error('ENOENT')
    return { value: text }
  })
  on('fs.write', async ($, e) => {
    disk.set(nameOf(e.path), String(e.text))
    return { value: undefined }
  })
  on('session.cwd', async () => ({ value: '/repo' }))
  on('session.start', async ($, e) => ({ cwd: e.cwd }))
  on('command.register', async () => ({ value: { command: 'workspace' } }))
  on('prompt.read', async () => ({ value: { text: '', cursor: 0 } }))
  on('prompt.fill', async ($, e) => {
    fills.push(e)
    return { isFilled: true, text: e.text, cursor: e.text.length }
  })
  on('tool.call', async ($, e) => {
    if (e.tool === 'Bash') return { result: { stdout: '', stderr: '', interrupted: false, ...(bash.shift()?.run() as object) } }
    const path = String('file_path' in e ? e.file_path : '').replace('/repo/', '')
    const before = disk.get(path) ?? null
    if (e.tool === 'Write') {
      disk.set(path, String('content' in e ? e.content : ''))
      return { result: { type: before === null ? 'create' : 'update', filePath: path, originalFile: before } }
    }
    disk.set(path, (before ?? '').replace(String('old_string' in e ? e.old_string : ''), String('new_string' in e ? e.new_string : '')))
    return { result: { filePath: path, originalFile: before } }
  })

  return { ran, fills, bash }
}

// Waits for `ready` to draw, since session.start's first refresh isn't awaited.
const mountPane = async ($: Engine, ready = 'tab-turn') => {
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
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
  for (let i = 0; i < 200 && (await ui.find({ key: ready })) === undefined; i += 1) {
    await new Promise<void>(resolve => setTimeout(resolve, 5))
  }

  return ui
}

test('This Turn lists what Claude edited with its line counts and diff', async ($, on) => {
  const disk = new Map([['app.ts', 'one\ntwo\nthree\n']])
  fakeWorkspace(on, disk)
  const ui = await mountPane($)

  await $.tool.call({ tool: 'Edit', file_path: '/repo/app.ts', old_string: 'two', new_string: 'TWO' })
  await $.tool.call({ tool: 'Write', file_path: '/repo/new.ts', content: 'fresh\n' })
  await ui.press({ key: 'tab-turn' })

  expect(await ui.find({ key: 'tab-turn', text: /This Turn 2/ })).toBeDefined()
  expect(await ui.find({ key: 'turn:app.ts' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: ' new ' })).toBeDefined()

  await ui.press({ key: 'turn:app.ts' })

  expect(await ui.find({ type: 'Code', text: /-two\n\+TWO/ })).toBeDefined()
})

test('reverting asks first, then puts the file back', async ($, on) => {
  const disk = new Map([['app.ts', 'one\ntwo\n']])
  fakeWorkspace(on, disk)
  const ui = await mountPane($)

  await $.tool.call({ tool: 'Edit', file_path: '/repo/app.ts', old_string: 'two', new_string: 'TWO' })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/app.ts', old_string: 'one', new_string: 'ONE' })
  await ui.press({ key: 'tab-turn' })
  await ui.press({ key: 'turn-revert:app.ts' })

  expect(await ui.find({ type: 'Text', text: "Undo Claude's changes to app.ts from this turn?" })).toBeDefined()
  expect(disk.get('app.ts')).toBe('ONE\nTWO\n')

  await ui.press({ key: 'confirm-yes' })

  expect(disk.get('app.ts')).toBe('one\ntwo\n')
  expect(await ui.find({ key: 'turn:app.ts' })).toBeUndefined()
})

test('reverting a file Claude created deletes it through git clean', async ($, on) => {
  const disk = new Map<string, string>()
  const { ran } = fakeWorkspace(on, disk)
  const ui = await mountPane($)

  await $.tool.call({ tool: 'Write', file_path: '/repo/new.ts', content: 'fresh\n' })
  await ui.press({ key: 'tab-turn' })
  await ui.press({ key: 'turn-revert:new.ts' })

  expect(await ui.find({ type: 'Text', text: 'Delete new.ts? Claude created it this turn.' })).toBeDefined()

  await ui.press({ key: 'confirm-yes' })

  expect(ran).toContainEqual(['clean', '-f', '-x', '-q', '--', 'new.ts'])
})

test('Review and Explain put a request for Claude in the prompt box', async ($, on) => {
  const disk = new Map([['app.ts', 'one\n']])
  const { fills } = fakeWorkspace(on, disk)
  const ui = await mountPane($)

  await $.tool.call({ tool: 'Edit', file_path: '/repo/app.ts', old_string: 'one', new_string: 'ONE' })
  await ui.press({ key: 'tab-turn' })
  await ui.press({ key: 'turn-review:app.ts' })
  await ui.press({ key: 'tab-files' })
  await ui.press({ key: 'entry:app.ts' })
  await ui.press({ key: 'explain' })

  expect(fills.map(one => one.text)).toEqual(['Review the changes you made to @app.ts ', 'Explain @app.ts '])
})

test('saving over a file that changed on disk asks first', async ($, on) => {
  const disk = new Map([['app.ts', 'one\n']])
  fakeWorkspace(on, disk)
  const ui = await mountPane($, 'entry:app.ts')

  await ui.press({ key: 'entry:app.ts' })
  await ui.press({ key: 'edit' })
  disk.set('app.ts', 'claude was here\n')
  await ui.input({ key: 'editor', text: 'mine\n', kind: 'submit' })

  expect(await ui.find({ type: 'Text', text: 'app.ts changed on disk since you opened it. Save over it?' })).toBeDefined()
  expect(disk.get('app.ts')).toBe('claude was here\n')

  await ui.press({ key: 'confirm-yes' })

  expect(disk.get('app.ts')).toBe('mine\n')
})

test('the stats bar starts on and the toggle hides it', async ($, on) => {
  fakeWorkspace(on, new Map())
  const ui = await mountPane($)

  expect(await ui.find({ key: 'stats' })).toBeDefined()

  await ui.press({ key: 'stats-toggle' })

  expect(await ui.find({ key: 'stats' })).toBeUndefined()
})

test('files a Bash command changed show up with a diff and can be reverted', async ($, on) => {
  const disk = new Map([['README.md', '# Title\ntext\n']])
  const { bash } = fakeWorkspace(on, disk)
  const ui = await mountPane($)

  bash.push({
    run: () => {
      disk.set('README.md', '<p>\n</p>\n# Title\ntext\n')
      disk.set('notes.md', 'hi\n')
      return {
        bashEditDiff: {
          moreFiles: 0,
          files: [
            { filePath: '/repo/README.md', hunks: [{ oldStart: 1, oldLines: 2, newStart: 1, newLines: 4, lines: ['+<p>', '+</p>', ' # Title', ' text'] }] },
            { filePath: '/repo/notes.md', created: true, hunks: [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: 1, lines: ['+hi'] }] },
          ],
        },
      }
    },
  })
  await $.tool.call({ tool: 'Bash', command: "sed -i '1i <p>' README.md" })
  await ui.press({ key: 'tab-turn' })

  expect(await ui.find({ key: 'tab-turn', text: /This Turn 2/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: ' new ' })).toBeDefined()

  await ui.press({ key: 'turn:README.md' })
  expect(await ui.find({ type: 'Code', text: /\+<p>\n\+<\/p>/ })).toBeDefined()

  await ui.press({ key: 'turn-revert' })
  await ui.press({ key: 'confirm-yes' })

  expect(disk.get('README.md')).toBe('# Title\ntext\n')
})

test('a Bash change with no hunks is listed without a copy', async ($, on) => {
  const disk = new Map([['big.bin', 'x']])
  const { bash } = fakeWorkspace(on, disk)
  const ui = await mountPane($)

  bash.push({ run: () => ({ bashEditDiff: { moreFiles: 1, files: [], changedFiles: ['/repo/big.bin'] } }) })
  await $.tool.call({ tool: 'Bash', command: 'make' })
  await ui.press({ key: 'tab-turn' })

  expect(await ui.find({ key: 'turn:big.bin' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'no copy' })).toBeDefined()
  expect(await ui.find({ key: 'turn-revert:big.bin' })).toBeUndefined()
})
