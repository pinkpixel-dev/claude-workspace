import { describe, expect, test } from 'claude-code/testing'

import { lineDiff } from './diff'

describe('lineDiff', () => {
  test('matching texts have no diff', async () => {
    expect(lineDiff('a.ts', 'one\ntwo\n', 'one\ntwo\n')).toEqual({ text: '', added: 0, removed: 0 })
  })

  test('a changed line shows as one hunk with context around it', async () => {
    const before = ['1', '2', '3', '4', '5', '6', '7', '8', ''].join('\n')
    const after = ['1', '2', '3', '4', 'five', '6', '7', '8', ''].join('\n')
    const diff = lineDiff('src/a.ts', before, after)

    expect(diff.added).toBe(1)
    expect(diff.removed).toBe(1)
    expect(diff.text).toBe([
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -2,7 +2,7 @@',
      '2', '3', '4', '-5', '+five', '6', '7', '8',
      '',
    ].map(line => (/^[-+@]/.test(line) || line === '' ? line : ` ${line}`)).join('\n'))
  })

  test('far-apart edits get their own hunks', async () => {
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i}`)
    const after = [...lines]
    after[2] = 'changed top'
    after[27] = 'changed bottom'
    const diff = lineDiff('a.ts', lines.join('\n'), after.join('\n'))

    expect(diff.text.match(/^@@/gm)?.length).toBe(2)
    expect(diff.added).toBe(2)
    expect(diff.removed).toBe(2)
  })

  test('a new file is all additions against /dev/null', async () => {
    const diff = lineDiff('new.ts', null, 'a\nb')

    expect(diff.added).toBe(2)
    expect(diff.removed).toBe(0)
    expect(diff.text.startsWith('--- /dev/null\n+++ b/new.ts\n@@ -0,0 +1,2 @@\n+a\n+b\n')).toBe(true)
  })

  test('inserted and deleted lines keep the rest in place', async () => {
    const diff = lineDiff('a.ts', 'a\nb\nc\nd', 'a\nx\nb\nd')

    expect(diff.added).toBe(1)
    expect(diff.removed).toBe(1)
    expect(diff.text).toContain('+x')
    expect(diff.text).toContain('-c')
    expect(diff.text).toContain(' b')
  })
})
