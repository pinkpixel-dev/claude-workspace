export type Tab = 'files' | 'git'

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

export type Repo = {
  isRepo: boolean
  root: string
  branch: string
  upstream?: string
  ahead: number
  behind: number
  changes: Change[]
  branches: string[]
  remotes: string[]
}

export type Diff = { path: string; isStaged: boolean; text: string }

export type Notice = { kind: 'ok' | 'error'; text: string }

export type ConfirmAction = 'commit' | 'commit-all' | 'amend' | 'push' | 'discard' | 'discard-all'

// A question the pane asks before a risky git step; `path` names the file a discard is for.
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
    }
  }
}
