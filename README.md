# Workspace

Workspace is a Claude Code mod that adds a pane with a file browser and a VS Code style source control panel. You can browse your project, read and edit files, look at diffs, stage changes, write a commit message, and commit, push, pull or switch branches without leaving Claude Code.

I made it because I kept jumping out to my editor just to check what changed or to make a quick commit. Now that stuff lives right next to the conversation.

## Features

**Files tab**

- Browse the session's working directory, with folders listed first and file sizes on the right
- Open a file to read it with syntax highlighting and line numbers
- Click **Edit** to change it in place, then **Save** (or press Enter) to write it back to disk
- The open file reloads after each Claude turn, so you see edits Claude made

**Source Control tab**

- Staged and unstaged changes, colored the way VS Code does it (added, modified, deleted, renamed)
- Click a file to see its diff, and use `+` and `−` to stage or unstage it
- **Stage all** for everything at once
- A commit message box with a **Commit** button (Enter commits too)
- **Pull**, **Push** and a refresh button, plus ahead/behind counts for your branch
- A branch picker that switches branches for you
- A confirm step before committing or pushing straight to `main` or `master`

The pane draws its own dark theme, so it looks the same no matter which Claude Code theme you use.

## Installation

You need Claude Code in a terminal. Installing goes through this repo, which doubles as a plugin marketplace.

At the Claude Code prompt:

```text
/plugin install workspace --marketplace pinkpixel-dev/claude-workspace
```

Answer `y` when it asks to add the `github:pinkpixel-dev/claude-workspace` marketplace, then pick a scope (the user scope is first, press Enter for it). The mod is active right away.

From a regular shell instead:

```bash
claude plugin install workspace --marketplace pinkpixel-dev/claude-workspace
```

If you'd rather add the marketplace first and install the plugin as a separate step:

```text
/plugin marketplace add pinkpixel-dev/claude-workspace
/plugin install workspace@claude-workspace
```

In the Claude Code desktop app, where `/plugin` doesn't run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `pinkpixel-dev/claude-workspace`, then **Add plugin**.

## Usage

Open the pane with:

```text
/workspace
```

Click the tabs at the top, or focus the pane and use Tab, the arrow keys and Enter. Esc takes you back to the prompt.

A few things worth knowing:

- In the editor, Enter saves. You get a new line the same way you do in the Claude Code prompt box.
- Commit only commits what's staged. If nothing is staged, the pane tells you instead of guessing.
- If your branch has no upstream yet, Push runs `git push -u origin <branch>` for you.
- Pull runs `git pull --no-edit`, so a merge never stops to open an editor.

## Limitations

- **Git hooks don't run.** Claude Code runs git for mods with repo hooks turned off, so things like husky or pre-commit checks get skipped for commits made from the pane.
- **Push and pull won't ask for a password.** They need an SSH key or a git credential helper already set up. Without one they fail fast and show git's error instead of hanging.
- **The editor is a plain text box.** It's good for quick edits, but there's no highlighting while you type, no multi-cursor and no real undo history.
- **Big and binary files are view only.** Files over 1 MB don't open, binary files show a note, and very long files show the start and can't be edited.
- **No discard button.** I left it out on purpose because it throws work away. I might add one later with a confirm step.
- **Mobile isn't supported.** The pane needs text inputs, which the mobile app doesn't have.
- The pane opens at any width when you run `/workspace`, but it's way nicer with a wide terminal.

The Claude Code mod API is still early access. I built this on Claude Code 2.1.303, so a future release could change something the mod relies on.

## How it works

It's a single hooks module. `/workspace` opens a pane, and the pane is drawn from state the mod keeps for the session. Buttons call git through Claude Code's process API (no shell involved) and read or write files through its file API. After each Claude turn, the mod refreshes the file list and git status so the pane stays in sync with whatever Claude just did.

```text
hooks/
  register.tsx     /workspace command, refresh after each turn, the pane frame and tabs
  files-view.tsx   file browser, viewer and editor
  git-view.tsx     branch picker, commit box, change lists and diffs
  actions.ts       what the buttons do: file reads and writes, git commands
  git.ts           parses git output (no Claude Code calls, so it's easy to test)
  controls.tsx     shared chip buttons, tabs and divider
  theme.ts         color tokens
  *.test.ts(x)     tests
types/index.d.ts   the shape of the session state
```

## Development

Clone the repo and start Claude Code with the folder loaded:

```bash
git clone https://github.com/pinkpixel-dev/claude-workspace.git
claude --plugin-dir ./claude-workspace
```

Edits to the folder reload while that session runs. To check your changes:

```bash
claude plugin validate ./claude-workspace
claude plugin test ./claude-workspace
```

The tests run against Claude Code's own test kit. The git tests feed real `git status` output through the parser, and the pane tests draw the pane and press its buttons against a fake repo, so they don't touch your actual git setup.

## License

Apache 2.0. See [LICENSE](LICENSE).

---

Made with 💖 by [Pink Pixel](https://pinkpixel.dev)
