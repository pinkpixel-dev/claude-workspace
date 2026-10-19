import type { Repo } from '../types'

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
