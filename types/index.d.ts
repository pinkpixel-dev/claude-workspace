export type Tab = 'files' | 'git'

export type GitView = 'changes' | 'history' | 'branches' | 'stash'

export type Entry = { name: string; kind: 'file' | 'dir' | 'other'; size: number }

export type OpenFile = {
  path: string
  text: string
  // Set when the file can only be shown, not edited (binary, too large).
  readOnlyReason?: string
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
}

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
  stashes: Stash[]
  operation: Operation | null
}

export type Diff = { path: string; isStaged: boolean; text: string }

export type CommitDiff = { commit: Commit; text: string }

// The Branches view's name box, for a new branch or renaming `from`.
export type BranchForm = { kind: 'new' | 'rename'; from?: string; text: string }

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

// A question the pane asks before a risky git step; `path` names the file,
// branch, commit or stash the step is for.
export type Confirm = { action: ConfirmAction; question: string; yes: string; path?: string }

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
      historyLimit: number
      commitDiff: CommitDiff | null
      mergeSource: string
    }
  }
}
