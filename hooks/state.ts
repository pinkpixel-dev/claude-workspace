import type { Repo } from '../types'

export const PANE = 'workspace'

export const EMPTY_REPO: Repo = {
  isRepo: false,
  root: '',
  branch: '',
  ahead: 0,
  behind: 0,
  changes: [],
  branches: [],
  remotes: [],
}
