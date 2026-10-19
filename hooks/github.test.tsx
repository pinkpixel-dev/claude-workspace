import type { On, ProcessRunResult, PromptFillInput } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { ageSince, checksSummary, detailMarkdown, parseDetail, parseItems, referenceText } from './github'

// A repo at /repo whose GitHub remote has one open PR, one draft PR and one issue.
const PULLS = JSON.stringify([
  { number: 42, title: 'Add the GitHub tab', author: { login: 'sizzlebop' }, updatedAt: '2026-10-16T12:00:00Z', isDraft: false, url: 'https://github.com/pinkpixel-dev/claude-workspace/pull/42', labels: [{ name: 'feature' }] },
  { number: 41, title: 'WIP: tidy branches', author: { login: 'friend' }, updatedAt: '2026-10-10T12:00:00Z', isDraft: true, url: 'https://github.com/pinkpixel-dev/claude-workspace/pull/41', labels: [] },
])
const ISSUES = JSON.stringify([
  { number: 7, title: 'Pane flickers on resize', author: { login: 'friend' }, updatedAt: '2026-10-17T12:00:00Z', url: 'https://github.com/pinkpixel-dev/claude-workspace/issues/7', labels: [] },
])
const PR_VIEW = JSON.stringify({
  body: 'Lists PRs and issues.',
  state: 'OPEN',
  headRefName: 'feature/github-tab',
  baseRefName: 'dev',
  reviewDecision: 'APPROVED',
  statusCheckRollup: [{ conclusion: 'SUCCESS' }, { conclusion: 'FAILURE' }, { state: 'PENDING' }],
  comments: [{ author: { login: 'friend' }, createdAt: '2026-10-17T12:00:00Z', body: 'Looks good!' }],
})

const ok = (stdout = ''): { value: ProcessRunResult } => ({
  value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})
const failed = (stderr: string): { value: ProcessRunResult } => ({ value: { ...ok().value, exitCode: 1, stderr } })

type Options = { isLoggedOut?: boolean }

const fakeGithub = (on: On, { isLoggedOut = false }: Options = {}) => {
  const ran: string[][] = []
  const fills: PromptFillInput[] = []
  mock.clock(on)

  on('process.run', async ($, e) => {
    const [tool = '', ...args] = e.argv
    if (tool === 'git') {
      if (args[0] === 'rev-parse') return ok('/repo\n/repo/.git\n')
      if (args[0] === 'status') return ok(['## main', ''].join('\0'))
      return ok()
    }

    ran.push([...args])
    if (isLoggedOut) return failed('To get started with GitHub CLI, please run:  gh auth login')
    if (args[0] === 'repo') return ok('pinkpixel-dev/claude-workspace\n')
    if (args[0] === 'pr' && args[1] === 'list') return ok(PULLS)
    if (args[0] === 'issue' && args[1] === 'list') return ok(ISSUES)
    if (args[0] === 'pr' && args[1] === 'view') return ok(PR_VIEW)

    return ok('{}')
  })
  on('fs.list', async () => ({ value: [] }))
  on('fs.stat', async ($, e) => {
    throw new Error(`ENOENT: ${e.path}`)
  })
  on('prompt.read', async () => ({ value: { text: 'review', cursor: 6 } }))
  on('prompt.fill', async ($, e) => {
    fills.push(e)
    return { isFilled: true, text: `review${e.text}`, cursor: 6 + e.text.length }
  })

  return { ran, fills }
}

const openGithub = async ($: Engine) => {
  const ui = await $.ui.mount({
    plugin: 'workspace',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'workspace',
    props: {
      title: 'Workspace',
      isFocused: true,
      bodyColumns: 90,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 30 },
      view: {},
    },
  })
  await ui.press({ key: 'tab-github' })

  return ui
}

const NOW = Date.parse('2026-10-18T12:00:00Z')

test('ages read short, from minutes to years', () => {
  expect(ageSince('2026-10-18T11:55:00Z', NOW)).toBe('5m')
  expect(ageSince('2026-10-18T09:00:00Z', NOW)).toBe('3h')
  expect(ageSince('2026-10-16T12:00:00Z', NOW)).toBe('2d')
  expect(ageSince('2026-06-18T12:00:00Z', NOW)).toBe('4mo')
  expect(ageSince('2024-10-18T12:00:00Z', NOW)).toBe('2y')
  expect(ageSince('not a date', NOW)).toBe('')
})

test('gh list output reads into items, and junk reads as none', () => {
  const [first, second] = parseItems(PULLS, 'pr', NOW)

  expect(first).toEqual({
    kind: 'pr',
    number: 42,
    title: 'Add the GitHub tab',
    author: 'sizzlebop',
    age: '2d',
    url: 'https://github.com/pinkpixel-dev/claude-workspace/pull/42',
    isDraft: false,
    labels: ['feature'],
  })
  expect(second?.isDraft).toBe(true)
  expect(parseItems('not json', 'issue', NOW)).toEqual([])
})

test('a PR detail sums up branches, review and checks', () => {
  const [item] = parseItems(PULLS, 'pr', NOW)
  const detail = parseDetail(PR_VIEW, item!, NOW)

  expect(detail.meta).toEqual(['open', 'by sizzlebop', 'feature/github-tab → dev', 'approved', 'checks: 1 failing, 1 pending, 1 passed'])
  expect(detailMarkdown(detail)).toContain('**friend** · 1d\n\nLooks good!')
  expect(checksSummary([])).toBe('')
})

test('the reference names the item and its URL, spaced off the text before it', () => {
  const [item] = parseItems(PULLS, 'pr', NOW)

  expect(referenceText(item!, 'look at')).toBe(' PR #42 "Add the GitHub tab" (https://github.com/pinkpixel-dev/claude-workspace/pull/42) ')
  expect(referenceText({ ...item!, kind: 'issue', title: 'say "hi"' }, '')).toMatch(/^Issue #42 "say 'hi'"/)
})

test('the tab lists open pull requests and issues from gh', async ($, on) => {
  const { ran } = fakeGithub(on)
  const ui = await openGithub($)

  expect(ran).toContainEqual(['pr', 'list', '--state', 'open', '--limit', '50', '--json', 'number,title,author,updatedAt,isDraft,url,labels'])
  expect(await ui.find({ type: 'Text', text: 'pinkpixel-dev/claude-workspace' })).toBeDefined()
  expect(await ui.find({ key: 'gh-view-pulls', text: /Pull requests 2/ })).toBeDefined()
  expect(await ui.find({ key: 'gh-show:pr:42' })).toBeDefined()
  expect(await ui.find({ key: 'gh-show:issue:7' })).toBeUndefined()

  await ui.press({ key: 'gh-view-issues' })

  expect(await ui.find({ key: 'gh-show:issue:7' })).toBeDefined()
  expect(await ui.find({ key: 'gh-show:pr:42' })).toBeUndefined()
})

test('@ puts a reference to the PR in the prompt box at the cursor', async ($, on) => {
  const { fills } = fakeGithub(on)
  const ui = await openGithub($)

  await ui.press({ key: 'gh-mention:pr:42' })

  expect(fills).toEqual([expect.objectContaining({
    text: ' PR #42 "Add the GitHub tab" (https://github.com/pinkpixel-dev/claude-workspace/pull/42) ',
    mode: 'insert',
  })])
})

test('clicking a PR opens its detail, and back returns to the list', async ($, on) => {
  const { ran } = fakeGithub(on)
  const ui = await openGithub($)

  await ui.press({ key: 'gh-show:pr:42' })

  expect(ran).toContainEqual(['pr', 'view', '42', '--json', 'body,state,headRefName,baseRefName,reviewDecision,statusCheckRollup,comments'])
  expect(await ui.find({ type: 'Text', text: /feature\/github-tab → dev/ })).toBeDefined()
  expect(await ui.find({ key: 'gh-mention-open' })).toBeDefined()

  await ui.press({ key: 'gh-back' })

  expect(await ui.find({ key: 'gh-show:pr:42' })).toBeDefined()
})

test('a gh that is not logged in shows its complaint instead of a list', async ($, on) => {
  fakeGithub(on, { isLoggedOut: true })
  const ui = await openGithub($)

  expect(await ui.find({ type: 'Text', text: /gh auth login/ })).toBeDefined()
  expect(await ui.find({ key: 'gh-show:pr:42' })).toBeUndefined()
})
