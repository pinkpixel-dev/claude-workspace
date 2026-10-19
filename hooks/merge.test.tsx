import type { On, ProcessRunResult } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

// A repo on `dev`. With `isMerging` a merge waits on two files: one both
// sides edited, one the other side deleted. Its git calls land in these hooks.
const CLEAN = ['## dev...origin/dev', ' M src/app.ts', ''].join('\0')
const MERGING = ['## dev...origin/dev', 'UU src/header.tsx', 'UD old.ts', 'M  ready.ts', ''].join('\0')
const DIFF = [
  'diff --git a/src/app.ts b/src/app.ts',
  '--- a/src/app.ts',
  '+++ b/src/app.ts',
  '@@ -1,1 +1,1 @@',
  '-a',
  '+b',
  '@@ -9,1 +9,1 @@',
  '-c',
  '+d',
  '',
].join('\n')

const ok = (stdout = ''): { value: ProcessRunResult } => ({
  value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})
const failed = (stderr: string): { value: ProcessRunResult } => ({ value: { ...ok().value, exitCode: 1, stderr } })

type Ran = { args: string[]; env?: Record<string, string>; stdin?: string }
type Options = { isMerging?: boolean; markers?: boolean; mergeConflicts?: boolean }

const fakeRepo = (on: On, { isMerging = false, markers = false, mergeConflicts = false }: Options = {}) => {
  const ran: Ran[] = []
  let merging = isMerging

  on('process.run', async ($, e) => {
    const args = e.argv.slice(1)
    const line = args.join(' ')
    ran.push({ args: [...args], env: e.init?.env, stdin: e.init?.stdin })
    if (line === 'rev-parse --absolute-git-dir') return ok('/repo/.git\n')
    if (args[0] === 'rev-parse') return ok('/repo\n')
    if (args[0] === 'status') return ok(merging ? MERGING : CLEAN)
    if (line.startsWith('branch -r')) return ok('origin/main\t\n')
    if (args[0] === 'branch') return ok('dev\torigin/dev\t\nmain\torigin/main\t\n')
    if (args[0] === 'remote') return ok('origin\n')
    if (args[0] === 'diff') return ok(DIFF)
    if (line === 'checkout --theirs -- old.ts') return failed("error: path 'old.ts' does not have their version")
    if (args[0] === 'merge' && args[1] === '--no-edit' && mergeConflicts) {
      merging = true
      return failed('CONFLICT (content): Merge conflict in src/header.tsx')
    }

    return ok()
  })
  on('fs.list', async () => ({ value: [] }))
  on('fs.read', async () => ({ value: markers ? 'a\n<<<<<<< HEAD\nb\n=======\nc\n>>>>>>> main\n' : 'fixed\n' }))
  on('fs.stat', async ($, e) => {
    if (merging && e.path === '/repo/.git/MERGE_HEAD') {
      return { value: { kind: 'file' as const, size: 0, mtimeMs: 0, isLink: false } }
    }
    throw new Error(`ENOENT: ${e.path}`)
  })

  return ran
}

const hasRun = (ran: Ran[], line: string) => ran.some(one => one.args.join(' ') === line)

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
      scroll: { offset: 0, bodyRows: 40 },
      view: {},
    },
  })
  await ui.press({ key: 'tab-git' })
  await ui.press({ key: view })

  return ui
}

test('a merge in progress shows the banner and its conflicts apart from other changes', async ($, on) => {
  fakeRepo(on, { isMerging: true })
  const ui = await openView($, 'view-changes')

  expect(await ui.find({ type: 'Text', text: 'Merge in progress' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '· 2 conflicts' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Merge Changes' })).toBeDefined()
  expect(await ui.find({ key: 'conflict-ours:src/header.tsx' })).toBeDefined()
  // Conflicted files don't double up in the staged or unstaged lists.
  expect(await ui.find({ key: 'unstage:src/header.tsx' })).toBeUndefined()
  expect(await ui.find({ key: 'unstage:ready.ts' })).toBeDefined()
})

test('ours checks out that side and stages it; a deleted side removes the file', async ($, on) => {
  const ran = fakeRepo(on, { isMerging: true })
  const ui = await openView($, 'view-changes')

  await ui.press({ key: 'conflict-ours:src/header.tsx' })
  expect(hasRun(ran, 'checkout --ours -- src/header.tsx')).toBe(true)
  expect(hasRun(ran, 'add -- src/header.tsx')).toBe(true)

  await ui.press({ key: 'conflict-theirs:old.ts' })
  expect(hasRun(ran, 'rm -q -- old.ts')).toBe(true)
})

test('resolved asks first while conflict markers are still in the file', async ($, on) => {
  const ran = fakeRepo(on, { isMerging: true, markers: true })
  const ui = await openView($, 'view-changes')

  await ui.press({ key: 'conflict-resolved:src/header.tsx' })

  expect(await ui.find({ type: 'Text', text: 'header.tsx still has conflict markers. Mark it resolved anyway?' })).toBeDefined()
  expect(hasRun(ran, 'add -- src/header.tsx')).toBe(false)

  await ui.press({ key: 'confirm-yes' })

  expect(hasRun(ran, 'add -- src/header.tsx')).toBe(true)
})

test('continue waits for every conflict, then commits without an editor', async ($, on) => {
  const ran = fakeRepo(on, { isMerging: true })
  const ui = await openView($, 'view-changes')

  await ui.press({ key: 'operation-continue' })
  expect(await ui.find({ type: 'Text', text: 'Resolve every conflict first.' })).toBeDefined()
  expect(hasRun(ran, 'commit --no-edit')).toBe(false)
})

test('abort asks first, then runs merge --abort', async ($, on) => {
  const ran = fakeRepo(on, { isMerging: true })
  const ui = await openView($, 'view-changes')

  await ui.press({ key: 'operation-abort' })
  expect(await ui.find({ type: 'Text', text: /Abort the merge\?/ })).toBeDefined()
  expect(hasRun(ran, 'merge --abort')).toBe(false)

  await ui.press({ key: 'confirm-yes' })
  expect(hasRun(ran, 'merge --abort')).toBe(true)
})

test('merging from the branches view runs with no editor and lands on conflicts', async ($, on) => {
  const ran = fakeRepo(on, { mergeConflicts: true })
  const ui = await openView($, 'view-branches')

  await ui.select({ key: 'merge-source', value: 'origin/main' })
  await ui.press({ key: 'merge' })

  const merged = ran.find(one => one.args.join(' ') === 'merge --no-edit origin/main')
  expect(merged?.env?.GIT_EDITOR).toBe('true')
  expect(await ui.find({ type: 'Text', text: 'Merge stopped on conflicts. Resolve them in Merge Changes.' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Merge in progress' })).toBeDefined()
  expect(await ui.find({ key: 'message' })).toBeDefined()
})

test('rebase always asks first and warns about the force push', async ($, on) => {
  const ran = fakeRepo(on)
  const ui = await openView($, 'view-branches')

  await ui.press({ key: 'rebase' })
  expect(await ui.find({ type: 'Text', text: /Rebase dev onto main\? .*force push/ })).toBeDefined()
  expect(hasRun(ran, 'rebase main')).toBe(false)

  await ui.press({ key: 'confirm-yes' })
  expect(hasRun(ran, 'rebase main')).toBe(true)
})

test('a file diff splits into hunks that stage one at a time', async ($, on) => {
  const ran = fakeRepo(on)
  const ui = await openView($, 'view-changes')

  await ui.press({ key: 'diff:work:src/app.ts' })
  expect(await ui.find({ type: 'Text', text: '2/2' })).toBeDefined()

  await ui.press({ key: 'hunk-stage:1' })

  const applied = ran.find(one => one.args[0] === 'apply')
  expect(applied?.args).toEqual(['apply', '--cached', '--recount', '-'])
  expect(applied?.stdin).toBe(
    'diff --git a/src/app.ts b/src/app.ts\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -9,1 +9,1 @@\n-c\n+d\n',
  )
})
