# Changelog

## Unreleased

### ✨ Source Control

- `↺` button on each changed file to discard its changes, plus **Discard all**. Both ask before throwing anything away, and untracked files get deleted.
- **Amend** folds staged changes into the last commit. An empty message keeps the old one, and amending a commit that's already pushed warns you first.
- **Commit all** stages everything (untracked files too) and commits in one step.
- **Fetch** button, plus a quiet background fetch every 3 minutes while the pane is showing.

### 🧹 Maintenance

- Split the git code out of `actions.ts` into `repo.ts` (shared plumbing) and `git-actions.ts` (Source Control actions).

## 0.2.0 - October 18, 2026

### ✨ Source Control

- Added an **Initialize Repository** button. When the session folder isn't a git repo yet, the Source Control tab offers it, and one click runs `git init -b main` and switches to the normal view.

## 0.1.0 - October 18, 2026

### ✨ First release

- `/workspace` pane with a Files tab for browsing, reading and editing files
- Source Control tab with diffs, stage and unstage, commit, push, pull and branch switching
- Confirm step before committing or pushing straight to `main` or `master`
- Dark theme drawn by the pane itself
- Marketplace file for installing from `pinkpixel-dev/claude-workspace`
