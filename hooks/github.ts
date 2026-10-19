// Pure helpers for the GitHub tab: no `$`, so the tests can run them directly.
// They read what `gh ... --json` prints into the shapes the tab draws.
import type { GhComment, GhDetail, GhItem } from '../types'

// How many open items each list asks gh for.
export const LIST_LIMIT = 50

// The most characters a detail view draws for the body and comments together.
export const DETAIL_LIMIT = 60000

export const PR_LIST_FIELDS = 'number,title,author,updatedAt,isDraft,url,labels'
export const ISSUE_LIST_FIELDS = 'number,title,author,updatedAt,url,labels'
export const PR_VIEW_FIELDS = 'body,state,headRefName,baseRefName,reviewDecision,statusCheckRollup,comments'
export const ISSUE_VIEW_FIELDS = 'body,state,comments'

type Raw = Record<string, unknown>

const text = (value: unknown) => (typeof value === 'string' ? value : '')
const loginOf = (value: unknown) => text((value as Raw | null)?.login) || 'ghost'
const labelsOf = (value: unknown) =>
  Array.isArray(value) ? value.map(label => text((label as Raw)?.name)).filter(name => name !== '') : []

// An ISO time as a short age next to `now`: 5m, 2h, 3d, 4mo, 1y.
export const ageSince = (iso: string, now: number) => {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ''

  const minutes = Math.max(0, Math.floor((now - then) / 60000))
  if (minutes < 60) return `${minutes}m`
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h`
  if (minutes < 60 * 24 * 30) return `${Math.floor(minutes / (60 * 24))}d`
  if (minutes < 60 * 24 * 365) return `${Math.floor(minutes / (60 * 24 * 30))}mo`

  return `${Math.floor(minutes / (60 * 24 * 365))}y`
}

const parseJson = (out: string): unknown => {
  try {
    return JSON.parse(out)
  } catch {
    return null
  }
}

export const parseItems = (out: string, kind: GhItem['kind'], now: number): GhItem[] => {
  const list = parseJson(out)
  if (!Array.isArray(list)) return []

  return list.map((raw: Raw) => ({
    kind,
    number: Number(raw.number ?? 0),
    title: text(raw.title),
    author: loginOf(raw.author),
    age: ageSince(text(raw.updatedAt), now),
    url: text(raw.url),
    isDraft: raw.isDraft === true,
    labels: labelsOf(raw.labels),
  }))
}

// Check runs report a conclusion and commit statuses a state; either one sorts it.
const PASSED = ['SUCCESS', 'NEUTRAL', 'SKIPPED']
const FAILED = ['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE']

export const checksSummary = (rollup: unknown) => {
  if (!Array.isArray(rollup) || rollup.length === 0) return ''

  const outcomes = rollup.map((check: Raw) => text(check?.conclusion) || text(check?.state))
  const failed = outcomes.filter(one => FAILED.includes(one)).length
  const passed = outcomes.filter(one => PASSED.includes(one)).length
  const pending = outcomes.length - failed - passed
  const parts = [failed > 0 ? `${failed} failing` : '', pending > 0 ? `${pending} pending` : '', passed > 0 ? `${passed} passed` : '']

  return `checks: ${parts.filter(part => part !== '').join(', ')}`
}

const REVIEW: Record<string, string> = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'changes requested',
  REVIEW_REQUIRED: 'review required',
}

export const parseDetail = (out: string, item: GhItem, now: number): GhDetail => {
  const raw = (parseJson(out) ?? {}) as Raw
  const state = text(raw.state).toLowerCase()
  const isPr = item.kind === 'pr'
  const meta = [
    item.isDraft ? 'draft' : state,
    `by ${item.author}`,
    isPr && raw.headRefName ? `${text(raw.headRefName)} → ${text(raw.baseRefName)}` : '',
    isPr ? REVIEW[text(raw.reviewDecision)] ?? '' : '',
    isPr ? checksSummary(raw.statusCheckRollup) : '',
  ].filter(part => part !== '')

  const comments: GhComment[] = Array.isArray(raw.comments)
    ? raw.comments.map((comment: Raw) => ({
        author: loginOf(comment?.author),
        age: ageSince(text(comment?.createdAt), now),
        body: text(comment?.body),
      }))
    : []

  return { item, meta, body: text(raw.body), comments }
}

// The body and comments as one markdown block, cut to what a drawing can hold.
export const detailMarkdown = (detail: GhDetail) => {
  const body = detail.body.trim() === '' ? '_No description._' : detail.body.trim()
  const thread = detail.comments.map(comment => `---\n\n**${comment.author}** · ${comment.age}\n\n${comment.body.trim()}`)
  const whole = [body, ...thread].join('\n\n').replace(/\r/g, '')

  return whole.length > DETAIL_LIMIT ? `${whole.slice(0, DETAIL_LIMIT)}\n\n_Cut short here. Open it on GitHub for the rest._` : whole
}

// What the prompt box gets for an item: a short reference Claude can look up
// with gh, spaced off what came before the cursor.
export const referenceText = (item: GhItem, before: string) => {
  const lead = before === '' || /\s$/.test(before) ? '' : ' '
  const label = item.kind === 'pr' ? 'PR' : 'Issue'
  const title = item.title.replace(/"/g, "'")

  return `${lead}${label} #${item.number} "${title}" (${item.url}) `
}

// First few lines of gh's complaint, enough to act on in a small pane.
export const ghError = (stderr: string, stdout: string) =>
  (stderr.trim() || stdout.trim() || 'gh failed').split('\n').slice(0, 4).join('\n')
