# Changelog

## Unreleased

### ✨ Source Control

- `↺` button on each changed file to discard its changes, plus **Discard all**. Both ask before throwing anything away, and untracked files get deleted.
- **Amend** folds staged changes into the last commit. An empty message keeps the old one, and amending a commit that's already pushed warns you first.
- **Commit all** stages everything (untracked files too) and commits in one step.
- **Fetch** button, plus a quiet background fetch every 3 minutes while the pane is showing.
- Source Control now has **Changes** and **Branches** views.
- The Branches view lists local branches with their upstream and ahead/behind counts, and can create, rename and delete them. Delete tries the safe `-d` first and only offers a force delete, behind a confirm, when git refuses.
- A remote picker shows up when a repo has more than one remote. Push, Pull and Fetch use it, and the choice is remembered per repo.
- Pull on a branch with no upstream now pulls the same-named branch from the picked remote instead of failing.
- **History** view with the last 50 commits (**Load more** for older ones). Click a commit to see its diff, or **Revert** it after a confirm.
- **Stash** button in Changes (untracked files included, the message box names it), plus a **Stash** view with Apply, Pop and Drop.
- Remote branches you don't have locally show up in Branches with a **Check out** button that makes a tracking branch.
- **Merge** and **Rebase** (plain, not interactive) from the Branches view. Merging into `main`/`master` asks first, and rebase always asks.
- A banner with **Continue** and **Abort** while a merge, rebase, revert or cherry-pick is waiting on you, including ones started outside the pane.
- **Merge Changes** section for conflicted files with **Ours**, **Theirs** and **Resolved**. Resolved asks first if conflict markers are still in the file, and clicking a conflict opens it in the Files tab.
- Per-hunk **Stage hunk** and **Unstage hunk** buttons in the file diff view.

### 🧹 Maintenance

- Split the git code out of `actions.ts` into `repo.ts` (shared plumbing) and `git-actions.ts` (Source Control actions), with branch actions in `branch-actions.ts`, history and stash actions in `history-actions.ts`, and a view file for each sub-tab.

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
