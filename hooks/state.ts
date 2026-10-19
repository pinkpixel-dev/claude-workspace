import type { Github, Repo } from '../types'

export const PANE = 'workspace'

// How many commits History shows at first, and how many each Load more adds.
export const HISTORY_PAGE = 50

export const EMPTY_REPO: Repo = {
  isRepo: false,
  root: '',
  branch: '',
  ahead: 0,
  behind: 0,
  changes: [],
  branches: [],
  remotes: [],
  remote: '',
  remoteBranches: [],
  commits: [],
  stashes: [],
  operation: null,
}

export const EMPTY_GITHUB: Github = { isLoading: false, error: '', repo: '', pulls: [], issues: [] }
