export type Tab = 'files' | 'git' | 'turn' | 'github'

export type GitView = 'changes' | 'history' | 'branches' | 'tags' | 'stash'

export type Entry = { name: string; kind: 'file' | 'dir' | 'other'; size: number }

export type OpenFile = {
  path: string
  text: string
  // Set when the file can only be shown, not edited (binary, too large).
  readOnlyReason?: string
}

// A file Claude read or edited since your last prompt, by its path in the tree.
export type Touch = { path: string; kind: 'read' | 'edit'; isRunning: boolean }

// A file as it stood before Claude's first edit to it this turn, so the change can be shown and undone.
// `before` is null for a file Claude created, and for one too large for the tool to hand back.
// `added` and `removed` count the lines changed since then, as of Claude's last edit to it.
export type Snapshot = { path: string; before: string | null; isNew: boolean; added: number; removed: number }

// The This Turn tab's open diff: a file's snapshot against what's on disk now.
export type TurnDiff = { path: string; text: string; added: number; removed: number }

// One usage window, as `session.measure` reports it.
export type Limit = { percent: number; resetsAt?: string }

// What the stats bar shows; each figure is missing until the engine reports it.
export type Stats = {
  fiveHour?: Limit
  sevenDay?: Limit
  contextPercent?: number
  costUsd?: number
  model?: string
  effort?: string
}

export type Change = {
  path: string
  // Porcelain status letters: index (staged) side and worktree side.
  index: string
  work: string
}

export type Branch = {
  name: string
  upstream?: string
  ahead: number
  behind: number
  // The upstream branch was deleted on the remote.
  isGone: boolean
}

export type Commit = {
  sha: string
  short: string
  subject: string
  // How long ago, short form: 5m, 2h, 3d.
  age: string
  isMerge: boolean
  // Parent shas, first parent first; the History graph draws from them.
  parents: string[]
}

// One tag, newest first; `message` is an annotated tag's message, else its commit's subject.
export type Tag = { name: string; age: string; message: string }

// One `git stash list` entry; `ref` is what git calls it, like stash@{0}.
export type Stash = { ref: string; age: string; message: string }

// A multi-step git command waiting on you, usually because of conflicts.
export type Operation = 'merge' | 'rebase' | 'revert' | 'cherry-pick'

export type Repo = {
  isRepo: boolean
  root: string
  branch: string
  upstream?: string
  ahead: number
  behind: number
  changes: Change[]
  branches: Branch[]
  remotes: string[]
  // The remote Push, Pull and Fetch use; '' when the repo has none.
  remote: string
  // Remote branches as `<remote>/<name>`, without the remotes' HEAD pointers.
  remoteBranches: string[]
  commits: Commit[]
  // Commits per day for the last two weeks, oldest first.
  commitDays: number[]
  stashes: Stash[]
  tags: Tag[]
  operation: Operation | null
}

export type Diff = { path: string; isStaged: boolean; text: string }

export type CommitDiff = { commit: Commit; text: string }

// The Branches view's name box, for a new branch or renaming `from`.
// `base` is what a new branch starts from; missing means where you are.
export type BranchForm = { kind: 'new' | 'rename'; from?: string; base?: string; text: string }

// The Tags view's form: a name, an optional message (which makes it annotated), and what it points at.
export type TagForm = { text: string; message: string; base: string }

// The Branches view's Add remote form.
export type RemoteForm = { name: string; url: string }

export type Notice = { kind: 'ok' | 'error'; text: string }

export type ConfirmAction =
  | 'commit'
  | 'commit-all'
  | 'amend'
  | 'push'
  | 'discard'
  | 'discard-all'
  | 'force-delete'
  | 'revert'
  | 'drop-stash'
  | 'merge'
  | 'rebase'
  | 'abort'
  | 'resolve'
  | 'revert-turn'
  | 'overwrite'
  | 'delete-remote-branch'
  | 'force-push'
  | 'sync'
  | 'undo-commit'
  | 'drop-all-stashes'
  | 'remove-remote'

// A question the pane asks before a risky git step; `path` names the file,
// branch, commit or stash the step is for.
export type Confirm = { action: ConfirmAction; question: string; yes: string; path?: string }

export type GithubView = 'pulls' | 'issues'

// One open pull request or issue, as the GitHub tab lists it.
export type GhItem = {
  kind: 'pr' | 'issue'
  number: number
  title: string
  author: string
  // How long since it was last updated, short form: 5m, 2h, 3d.
  age: string
  url: string
  isDraft: boolean
  labels: string[]
  // Pull requests only: CI results and where review stands; null and '' when there are none.
  checks: Checks | null
  review: Review
}

// How a pull request's check runs and commit statuses came out.
export type Checks = { passed: number; failed: number; pending: number }

export type Review = 'approved' | 'changes' | 'required' | ''

export type GhComment = { author: string; age: string; body: string }

// A pull request or issue opened from the list; `meta` is its one-line facts.
export type GhDetail = {
  item: GhItem
  meta: string[]
  state: string
  review: Review
  checks: Checks | null
  body: string
  comments: GhComment[]
}

export type Github = {
  isLoading: boolean
  // gh's complaint from the last call, '' when it went fine.
  error: string
  // owner/name of the repo gh resolved, '' until it has.
  repo: string
  pulls: GhItem[]
  issues: GhItem[]
}

declare module 'claude-code' {
  interface PluginState {
    workspace: {
      tab: Tab
      dir: string
      entries: Entry[]
      openFile: OpenFile | null
      isEditing: boolean
      draft: string
      repo: Repo
      diff: Diff | null
      message: string
      busy: string | null
      notice: Notice | null
      confirm: Confirm | null
      gitView: GitView
      branchForm: BranchForm | null
      tagForm: TagForm | null
      remoteForm: RemoteForm | null
      // The sync card's second row: Pull (rebase), Sync, Fetch all, Force push.
      syncMore: boolean
      historyLimit: number
      commitDiff: CommitDiff | null
      mergeSource: string
      // The session's folder, absolute; '' until it's read.
      cwd: string
      activity: Touch[]
      github: Github
      githubView: GithubView
      ghDetail: GhDetail | null
      // The Source Control sections folded shut, by key.
      folded: string[]
      // The row a stage or unstage just moved, as `staged:path` or `work:path`, lit for a moment.
      flash: string | null
      // The terminal draws pictures (kitty, Ghostty), so the History graph can be one.
      hasImages: boolean
      // Before-edit copies of the files Claude edited since your last prompt.
      snapshots: Snapshot[]
      turnDiff: TurnDiff | null
      stats: Stats
      // The stats strip at the top of the pane; the choice is kept in $.store.
      showStats: boolean
    }
  }
}
