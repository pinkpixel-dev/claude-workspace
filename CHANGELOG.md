# Changelog

## Unreleased

### ✎ This Turn

- Files Claude changes through Bash (a `sed -i`, a script that writes files) now show up in This Turn with a diff, line counts and revert, and get the `✎` mark in Files. Before, only the Edit and Write tools were tracked.

## 0.8.0 - October 19, 2026

### ✎ This Turn

- A new **This Turn** tab lists every file Claude edited since your last prompt, with lines added and removed and a **new** badge for files Claude created.
- Click a file to see its diff against how it looked before Claude's first edit this turn.
- `↺` puts a file back the way it was before the turn, or deletes it if Claude created it. It asks first.

### 💬 Send to Claude

- **✦ Message** in the commit box drafts a Conventional Commits message from the staged diff with Haiku, ending in a `Co-Authored-By` line for the session's model.
- **Review** on Source Control diffs and This Turn files, and **Explain** in the file viewer, put a request with the file's `@path` in your prompt box.

### 📊 Stats bar

- A strip at the top of the pane shows 5 hour and 7 day usage with reset times, context fill, model and effort, and session cost. Pieces drop off from the right when the pane is narrow.
- **Stats** in the title row hides or shows it, and the choice is kept across sessions.

### 🐛 Fixes

- Saving a file that changed on disk since you opened it now asks before writing over it, so an edit Claude made while you were editing doesn't get silently lost.

## 0.7.0 - October 19, 2026

### 🌳 History graph

- History draws a branch graph next to your commits. Each commit sits in a lane, merges fork out to their own colored lane and curve back in, and the main line stays rose.
- In kitty and Ghostty the graph is a real picture with smooth curves. Every other terminal gets the same graph in Unicode box characters. Set `CLAUDE_WORKSPACE_GRAPH` to `image` or `text` if the guess is wrong for your terminal.
- Commit rows are two lines now: the subject on top, the short hash and age underneath. The newest commit gets a **HEAD** badge.
- A small bar chart at the top of History shows how many commits landed each day over the last two weeks.

### 🎨 Look and feel

- The pane has layers now: a darker canvas, raised cards for the branch header, the change lists and the History header, and a raised bar for the top tabs. A **Workspace** title row shows the repo name.
- The active sub-view sits on a small raised pill.
- Files and changed files get a glyph for their kind (`<>` for web and TypeScript code, `{}` for config, `¶` for docs, and a few more), colored by their git status.
- The Files tab path is clickable crumbs, so you can jump straight up to any folder.
- The Claude strip in Files is a small timeline card, with edits in amber and reads in gray.

### ✨ Source Control

- The branch card shows ahead and behind as separate counts, green when you're ahead and amber when you're behind. **Pull** or **Push** lights up as the main button when it's the one to press.
- While Fetch, Pull or Push runs, its button reads **Fetching…**, **Pulling…** or **Pushing…** and the other two go inert.
- A summary row above the lists counts the changed files by kind (`+` added, `~` modified, `→` renamed, `−` deleted) with a bar showing how they split.
- The commit box has a footer with the staged file count and the commit buttons.
- A file you stage or unstage lights up for a moment in its new section.
- Confirm questions get their own framed card with the buttons underneath. A question that throws work away has a red frame and a red yes button.
- Notices start with `✓` or `✗`, so they don't rely on color alone.
- Diff hunks have a header with their line range, `+` and `−` counts and the function they're in, with a smaller **+ Stage** or **− Unstage** button.

### 🐙 GitHub

- Pull request rows show CI (`✓` passing, `✗` failing, `●` pending) and review status (`✓` approved, `±` changes requested, `○` review required). This comes from the same `gh pr list` call as before, just with two more fields.
- A status card above the pull requests counts checks and reviews across all open PRs, with a bar for each.
- The detail view shows state, review and checks as colored badges.

## 0.6.0 - October 18, 2026

### 🎨 Look and feel

- The pane has an accent color now (a muted rose). It shows up on the active tab, the current branch dot, the **Commit** button and the commit box once you start typing.
- Top tabs are plain labels with the active one underlined, and the sub-views (Changes, History, Branches, Stash, plus Pull requests and Issues) sit in one row split by dots.
- The branch picker, ahead/behind counts and Fetch, Pull and Push sit together in a rounded frame, and the commit message box gets a frame too.
- Per-row buttons like `@`, `+`, `−`, `↺`, **Revert**, **Switch**, **Rename**, **Delete**, **Apply**, **Pop**, **Drop** and the conflict buttons are faint until you hover or focus them, so long lists are easier to read.

### ✨ Source Control

- **Changes** and **Staged Changes** fold shut with the `▾` next to their title.

### 🐛 Fixes

- History rows stay on one line. A long commit subject used to wrap across several rows, and the short hash now sits in its own column next to **Revert**.

## 0.5.0 - October 18, 2026

### ✨ GitHub

- New **GitHub** tab listing the repo's open pull requests and issues through the GitHub CLI, with **Pull requests** and **Issues** views and a refresh button.
- Click an item to read its description and comments in the pane, plus state, author, branches, review status, a checks summary and labels.
- `@` on each item, and in its detail view, puts a short reference with the URL into the prompt box at the cursor.
- The lists reload after each Claude turn while the tab is showing.

## 0.4.0 - October 18, 2026

### ✨ Files

- The file list shows git status: a colored letter on changed files (`!` for conflicts) and a `●` on folders with changes inside.
- Files Claude reads get a `◆` and files it edits get a `✎`, with the row highlighted while the tool runs. A strip at the top lists what Claude touched this turn, and clicking a name opens the file. The marks clear when you send your next prompt.
- `@` buttons on each file and folder, and in the file viewer, put `@path` into the prompt box at the cursor.

## 0.3.0 - October 18, 2026

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
