# GitNova — AI-Powered Git & GitHub CLI

> **GitNova** turns Git into a conversation. Type plain English, press `/` for a power menu, or run a single command to auto-commit and push — all backed by AI and built-in security scanning.

---

## Table of Contents

1. [Features Overview](#-features-overview)
2. [Requirements](#-requirements)
3. [Installation](#-installation)
4. [First Launch & Onboarding](#-first-launch--onboarding)
5. [CLI Flags (run from your terminal)](#-cli-flags)
   - [`gitnova` — Interactive Mode](#gitnova--interactive-mode)
   - [`gitnova --auto` — Auto Mode](#gitnova---auto--auto-mode)
   - [`gitnova --auto "message"` — Auto Mode with Custom Message](#gitnova---auto-message)
   - [`gitnova --version` / `-v`](#gitnova---version---v)
   - [`gitnova --uninstall`](#gitnova---uninstall)
6. [Interactive Chat — Natural Language Commands](#-interactive-chat--natural-language-commands)
   - [What the AI understands](#what-the-ai-understands)
   - [All supported actions](#all-supported-actions)
7. [Slash Commands (`/` Menu)](#-slash-commands--menu)
   - [General Tools](#general-tools)
   - [Configuration](#configuration)
   - [AI Workflows](#ai-workflows)
8. [AI Providers & Models](#-ai-providers--models)
9. [Security & Safety System](#-security--safety-system)
10. [Auto Mode Settings](#-auto-mode-settings)
11. [Config File Reference](#-config-file-reference)
12. [Project Structure](#-project-structure)
13. [Contributing](#-contributing)
14. [License](#-license)

---

## ✨ Features Overview

| Feature | Description |
|---|---|
| 🗣️ **Natural Language Git** | Type "push my changes", "create branch hotfix" or "undo last commit" — AI does the rest |
| ⚡ **Auto Mode** | One command stages, AI-commits and pushes everything — zero prompts |
| 📝 **AI Commit Messages** | Analyses your staged diff and writes a conventional commit message |
| 🛡️ **Security Scanning** | Detects `.env`, secrets, `node_modules`, databases before staging AND before pushing |
| 🩹 **AI Auto-Healing** | When Git fails, the error is auto-sent back to the AI which proposes a fix |
| 🔗 **Auto GitHub Setup** | Detects missing remotes and walks you through linking or creating repos via `gh` |
| 🤖 **Multi-Provider AI** | Gemini · DeepSeek · Groq · Anthropic Claude — switch any time |
| 🧭 **Repo Onboarding** | AI explains your whole codebase architecture in seconds |
| 🌿 **Branch Renaming** | Renames locally AND on the remote in one step |
| 🐛 **In-app Bug Reports** | Submit a GitHub Issue to the developer without leaving the terminal |

---

## 📋 Requirements

| Dependency | Minimum Version | Notes |
|---|---|---|
| **Node.js** | `>= 18.0.0` | Required |
| **Git** | Any recent version | GitNova will offer to install it if missing |
| **GitHub CLI (`gh`)** | Any recent version | Required for GitHub features; auto-install offered on Windows |
| **An AI API Key** | — | Gemini (free tier available), DeepSeek, Groq (free), or Anthropic Claude |

---

## 🚀 Installation

### Global install from npm (recommended)

```bash
npm install -g gitnova
```

After install, run `gitnova` from **any folder**.

### From source

```bash
git clone https://github.com/nourddinak/GitNova.git
cd GitNova
npm install
node bin/gitnova.js
```

---

## 🏁 First Launch & Onboarding

When you run `gitnova` for the first time, it automatically:

1. **Checks for Git** — if missing on Windows, offers to open the Git Desktop installer.
2. **Checks for a Git repository** — if the current folder isn't a repo, offers to `git init`.
3. **Checks for GitHub CLI (`gh`)** — if missing, offers to install it via `winget`.
4. **Checks GitHub authentication** — if not logged in, opens `gh auth login`.
5. **Shows your logged-in GitHub & Git user** — confirms the correct account.
6. **Prompts for an API key** — one-time setup, saved to `~/.gitnova-config.json`.
7. **GitHub star prompt** — verifies via GitHub API whether you've starred the repo. If not, asks once.

Once setup is complete, you land in the **interactive chat session**.

---

## 🖥️ CLI Flags

All flags are passed at the shell level, before GitNova opens its interactive session.

---

### `gitnova` — Interactive Mode

```bash
gitnova
```

Launches the full interactive AI assistant. You'll see the animated banner, version info, download stats, and then enter the chat prompt where you can type natural language or press `/` for the command menu.

---

### `gitnova "<your prompt>"` — Inline First Prompt

```bash
gitnova "read my code and tell me what it does"
gitnova "create a branch called feature-login"
gitnova "what files have I changed?"
```

Pass any text right after `gitnova` and it becomes **the first message** sent to the AI the moment the session starts — no waiting, no typing. GitNova boots up normally (banner, auth checks, pro tip) then immediately fires your prompt as if you typed it yourself.

Works with anything the chat session supports — Git commands, questions, tasks, or anything else.

---

### `gitnova --auto` — Auto Mode

```bash
gitnova --auto
# Alias:
gitnova -auto
```

**What it does — fully automated, no prompts:**

1. Checks for a valid Git repository (exits if not found).
2. Checks for uncommitted changes (exits cleanly if working directory is clean).
3. **Runs an AI security scan** on your project's root-level files against your `.gitignore`. Flags secrets, `node_modules`, databases, etc.
   - Behaviour depends on your [Auto Mode Settings](#-auto-mode-settings).
4. **Stages all changes** (`git add .`).
5. **Generates an AI commit message** from your staged diff using the active model.
6. **Commits** with the generated message.
7. **Pushes** to `origin/<current-branch>`.

> ⚠️ If the push is rejected because the remote has newer commits, Auto Mode exits with an error — it will **not** force-push without your permission.

---

### `gitnova --auto "message"` {#gitnova---auto-message}

```bash
gitnova --auto "feat: add dark mode toggle"
# Alias:
gitnova -auto "your message here"
```

Same as `--auto` but **skips AI message generation** and uses your custom string as the commit message. Everything else (security scan, staging, committing, pushing) still happens.

---

### `gitnova --version` / `-v`

```bash
gitnova --version
gitnova -v
```

Prints version info immediately — no banner, no startup checks:

```
GitNova  v1.0.7
Git      git version 2.49.0.windows.1
GitHub   gh version 2.68.1 (2025-03-04)
Node.js  v22.14.0
OS       Windows_NT 10.0.22631 (x64)
```

---

### `gitnova --uninstall`

```bash
gitnova --uninstall
```

**Safely cleans up before uninstalling:**

1. Shows the path to your config file (`~/.gitnova-config.json`) which holds all API keys.
2. Asks for confirmation.
3. If confirmed, **deletes the config file** (removes all stored API keys).
4. Instructs you to run `npm uninstall -g gitnova` to complete removal.

> Always run this before `npm uninstall -g gitnova` to avoid leaving API keys on disk.

---

## 💬 Interactive Chat — Natural Language Commands

Once GitNova is running, you see the animated prompt:

```
╭─ 🚀 GitNova
╰─❯ 
```

Type anything in plain English. The AI parses your intent and maps it to the correct Git action.

### What the AI understands

GitNova uses your active AI provider to understand intent. It is also aware of:
- Your **current OS and shell** (Windows/PowerShell, macOS/zsh, Linux/bash) — shell commands it suggests will be correct for your platform.
- Your **current Git status** — branch name, how many files are modified/staged, whether you're ahead/behind remote.
- Your **last 10 conversation turns** — context is maintained per session.

### All Supported Actions

| What you type | What GitNova does |
|---|---|
| `"status"`, `"what changed"` | Shows current branch, modified files, staged files |
| `"stage everything"`, `"add all"` | Runs AI security scan, then `git add .` |
| `"commit"`, `"commit my work"` | Stages if needed → generates AI message → lets you accept or edit → commits → asks if you want to push |
| `"commit with message fix button"` | Commits with your literal message, skipping AI generation |
| `"push"`, `"push my changes"` | Pushes to `origin/<branch>`. Runs security scan on unpushed files first. |
| `"force push"` | Pushes with `--force` |
| `"pull"` | Runs `git pull` |
| `"sync"`, `"sync with origin"` | Pulls with `--rebase` then pushes (safe merge-first approach) |
| `"create branch feature-x"` | `git checkout -b feature-x` |
| `"switch to main"` | `git checkout main` |
| `"install dependencies"` (or any non-Git task) | AI proposes shell commands appropriate for your OS. You review and confirm before they run. |
| `"explain this error"` / any question | AI answers conversationally |
| **Anything else — just ask!** | Not sure if GitNova can do it? Try it anyway. The AI will find a way to get it done for you — whether that means running shell commands, fixing errors, or walking you through it step by step. |

#### Auto-Healing Loop

If a Git command fails (e.g. push rejected, merge conflict), GitNova automatically:
1. Captures the raw error output.
2. Sends it back to the AI with context.
3. The AI proposes a corrective action (e.g. `SYNC` if the remote has newer commits).
4. This loops until resolved or you exit.

#### Push Conflict Handling

When the remote has commits you don't have locally:
- GitNova **will not** silently force-push.
- It asks: "Do you want to Force Push and overwrite them, or Abort?"
- Only if you explicitly say "force push" will it run `git push --force`.

#### Missing Remote Detection

If no `origin` remote is configured, GitNova detects this before any push/commit/sync and guides you to either:
- **Connect to an existing GitHub repo** (enter repo name, `Username/Repo`, or full URL — it verifies the connection before linking).
- **Create a brand new private GitHub repo** (names it after your folder by default, creates it via `gh`, and immediately pushes).

---

## ⚙️ Slash Commands (`/` Menu)

At the prompt, press `/` (as the very first character) to open the interactive command menu. Use arrow keys to navigate, `Enter` to select, `Esc` to go back.

```
╭─ 🚀 GitNova
╰─❯ /
```

---

### General Tools

#### `/info` — Repository Info

Displays a summary box with:
- Current branch name
- Total commit count
- Number of pending (modified + staged) files
- Remote URL
- **Live GitHub data** (repo name, public/private, ⭐ star count, description) — fetched via `gh`

---

#### `/stats` — Repository Statistics

Displays:
- Total commits across all history
- Total lines added (`+`) and removed (`-`) across all commits
- Commits per author (sorted by contribution count)

---

#### `/bugs` — Report a Bug

Submits a GitHub Issue directly to the GitNova repository without leaving your terminal:

1. You enter a short bug title.
2. You describe what happened.
3. You optionally describe what you were doing.
4. GitNova auto-collects: OS, Node.js version, Git version, GitHub CLI version, GitNova version.
5. Posts the issue to `nourddinak/GitNova` via `gh issue create`.
6. Returns a direct link to your submitted issue.

> Your code, API keys, and file contents are **never** included in bug reports.

---

#### `/privacy` — Privacy Info

Shows a full breakdown of:
- What data GitNova sends to AI providers (git diffs, file names — sent to **your** chosen provider, not the developer)
- What GitNova **never** collects (no telemetry, no analytics, no account data)
- What bug reports include (auto-collected env info only)
- Where your API keys are stored (`~/.gitnova-config.json`, never transmitted)

---

#### `/clear` — Clear Terminal

Clears the terminal screen (`console.clear()`).

---

#### `/help` — Help Reference

Prints the full list of slash commands and CLI flags inline in the terminal.

---

### Configuration

#### `/settings` — Auto Mode Behaviour

Controls what GitNova does when it detects dangerous files (secrets, `node_modules`, etc.) during `--auto` mode:

| Setting | What happens |
|---|---|
| **Ask me (Default)** | Pauses, shows the list of flagged files, asks whether to add them to `.gitignore` before pushing |
| **Warn me after pushing** | Pushes anyway, then shows a warning listing the risky files |
| **Auto-ignore silently** | Automatically adds flagged files to `.gitignore` without asking |
| **Do nothing (Push anyway)** | Skips all scanning — never blocks the push |

The active setting is marked with a ✔ in the menu. Your choice is saved to `~/.gitnova-config.json`.

---

#### `/config` — View Current Config

Shows everything stored in your config file in a formatted box:

- **GitHub Account** — live `gh api user` call (e.g. `@nourddinak`)
- **Git User** — `git config user.name` and `git config user.email`
- **AI Provider** — active provider (gemini / deepseek / groq / claude)
- **AI Model** — active model name
- **Auto Mode Setting** — your chosen behaviour from `/settings`
- **API Keys** — shown as `***last4chars` (never fully exposed)
- Config file path on disk

---

#### `/provider` — Change AI Provider

Switch between:

| Provider | Default Model |
|---|---|
| **Google Gemini** (default) | `gemini-2.5-flash` |
| **DeepSeek (Native)** | `deepseek-chat` |
| **Groq (Fast Inference)** | `llama-3.3-70b-versatile` |
| **Anthropic Claude** | `claude-opus-4-5` |

When you switch providers, the model resets to that provider's default and you are immediately prompted to enter an API key for the new provider if one is not already saved.

---

#### `/model` — Change AI Model

Select a specific model for the **active provider**:

**Gemini models:**
- `gemini-3.1-pro-preview`
- `gemini-3.1-flash-lite-preview`
- `gemma-4-31b-it`
- `gemma-4-26b-a4b-it`
- `gemini-3.0-pro`
- `gemini-3.0-flash`
- `gemini-2.5-flash` *(default)*
- `gemini-2.5-pro`
- `gemini-1.5-flash`
- `gemini-1.5-pro`

**DeepSeek models:**
- `deepseek-chat` *(default)*
- `deepseek-reasoner`

**Groq models:**
- `llama-3.3-70b-versatile` *(default)*
- `llama-3.1-8b-instant`
- `llama3-70b-8192`
- `llama3-8b-8192`
- `mixtral-8x7b-32768`
- `gemma2-9b-it`
- `compound-beta`
- `compound-beta-mini`

**Claude models:**
- `claude-opus-4-5` *(default)*
- `claude-sonnet-4-5`
- `claude-haiku-4-5`
- `claude-3-5-sonnet-20241022`
- `claude-3-5-haiku-20241022`
- `claude-3-opus-20240229`

You can also select **Custom** to type any model name manually. The selection is saved immediately.

---

#### `/key` — Change API Key

Updates the API key for the currently active provider. The new key is saved to `~/.gitnova-config.json` and takes effect immediately.

---

#### `/ignore` — Manage `.gitignore`

Four sub-options:

| Option | What it does |
|---|---|
| **✨ AI Codebase Scan** | Reads your root directory, cross-references with `.gitignore`, flags any dangerous/heavy files NOT currently ignored. Offers to add them and scrub them from Git history. |
| **View current `.gitignore`** | Prints the full contents of your `.gitignore` to the terminal |
| **Add standard defaults** | Appends missing items from a full default list: `node_modules/`, `dist/`, `build/`, `.env`, `.env.local`, `*.log`, `npm-debug.log*`, `coverage/`, `.DS_Store`, `Thumbs.db`, `*.sqlite`, `*.db`, `.vscode/`, `.idea/` — only adds what's missing |
| **Add custom pattern** | Type any glob pattern OR drag-and-drop files/folders from Windows Explorer. Supports quoted paths, multiple items, and auto-converts absolute Windows paths to relative Git paths. |

---

#### `/rename-branch` — Rename Current Branch

1. Shows the current branch name.
2. Asks for the new name.
3. Renames locally (`git branch -m`).
4. If the old branch exists on the remote, deletes it there (`git push origin --delete`).
5. Pushes the new branch name to remote (`git push -u origin <new-name>`).

One command, local and remote both updated.

---

### AI Workflows

#### `/onboard` — Repository Onboarding

Scans your project's root directory (excluding `.git/` and `node_modules/`) and reads your `package.json`, then asks the AI to generate a structured markdown summary explaining:

- What the project likely does
- Its architecture and key folders
- Where a developer should start reading

Output is printed inline in the terminal.

---

## 🤖 AI Providers & Models

GitNova supports four AI providers. You can switch freely with `/provider`.

Your API key for each provider is stored locally in `~/.gitnova-config.json` and never shared.

| Provider | Where to get an API Key |
|---|---|
| **Google Gemini** | [aistudio.google.com](https://aistudio.google.com/) — free tier available |
| **DeepSeek** | [platform.deepseek.com](https://platform.deepseek.com/) |
| **Groq** | [console.groq.com/keys](https://console.groq.com/keys) — free tier available |
| **Anthropic Claude** | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |

You can also override the provider and model at startup using environment variables:

```bash
AI_PROVIDER=groq AI_MODEL=llama-3.3-70b-versatile gitnova
```

Or set them in a `.env` file in your project root:

```env
AI_PROVIDER=gemini
AI_MODEL=gemini-2.5-pro
GEMINI_API_KEY=your_key_here
```

---

## 🛡️ Security & Safety System

GitNova has **three layers** of security scanning, all powered by AI:

### Layer 1 — Staging Scan (before `git add .`)

Triggered when you use chat commands like "stage everything" or "commit my work" (if nothing is staged yet).

- Reads your root directory file list.
- Sends file names (not contents) to the AI.
- AI flags: `.env` files, database files, `node_modules/`, `dist/`, `.vscode/`, etc.
- You choose which flagged files to guard (add to `.gitignore`) before staging continues.
- Files already in `.gitignore` are pre-filtered and never re-flagged.

### Layer 2 — Push Scan (before `git push`)

Triggered before any manual push in interactive mode.

- Checks the list of files in unpushed commits.
- AI reviews for secrets, credentials, or binary bloat.
- If risks are found, you can select which files to add to `.gitignore` and scrub from the commit history (via `git rm --cached` + `git commit --amend --no-edit`).

### Layer 3 — Auto Mode Scan (before `--auto` pushes)

Triggered at the start of every `gitnova --auto` run.

- Same AI scan as Layer 1.
- Behaviour depends on your `/settings` choice:
  - `ask_me` — pauses and asks (default)
  - `auto_ignore` — silently adds to `.gitignore`
  - `notify` — pushes, then warns you afterwards
  - `push_anyway` — skips scanning entirely

> **Important:** Security scans send *file names only*, never file contents, to the AI provider.

---

## 🔧 Auto Mode Settings

Configure via `/settings` in the chat. Saved to `~/.gitnova-config.json` under `autoIgnoreBehavior`.

| Value | Behaviour in `--auto` mode |
|---|---|
| `ask_me` | Pauses run, shows flagged files, prompts whether to ignore |
| `notify` | Completes the push, shows a warning after |
| `auto_ignore` | Silently adds all flagged files to `.gitignore` before staging |
| `push_anyway` | Never scans. Stages and pushes without any checks |

---

## 📁 Config File Reference

GitNova stores all state in a single JSON file at `~/.gitnova-config.json`:

```json
{
  "provider": "gemini",
  "model": "gemini-2.5-flash",
  "geminiApiKey": "AIza...",
  "deepseekApiKey": "sk-...",
  "groqApiKey": "gsk_...",
  "claudeApiKey": "sk-ant-...",
  "autoIgnoreBehavior": "ask_me",
  "hasStarred": true
}
```

| Key | Description |
|---|---|
| `provider` | Active AI provider (`gemini` / `deepseek` / `groq` / `claude`) |
| `model` | Active model name |
| `geminiApiKey` | Stored Gemini key |
| `deepseekApiKey` | Stored DeepSeek key |
| `groqApiKey` | Stored Groq key |
| `claudeApiKey` | Stored Anthropic key |
| `autoIgnoreBehavior` | Auto Mode scan behaviour (see above) |
| `hasStarred` | Whether you've starred the GitHub repo (verified live each run) |

To delete this file and all stored keys, run `gitnova --uninstall`.

---

## 📂 Project Structure

```text
GitNova/
├── bin/
│   └── gitnova.js          # Thin entry point — calls src/index.js main()
├── src/
│   ├── index.js            # Startup orchestrator: checks Git, gh, auth, API key, launches session
│   ├── chat/
│   │   └── session.js      # Interactive REPL, all slash commands, auto mode, AI intent loop
│   └── utils/
│       ├── ai.js           # Multi-provider AI client, prompt engineering, all AI calls
│       ├── git.js          # simple-git wrapper, repo status, diffs, branch helpers
│       ├── github.js       # gh auth check and login flow
│       ├── system.js       # Git & gh install detection, Windows auto-install helpers
│       └── update.js       # npm update check, changelog display, download stats
└── package.json
```

---

## 🤝 Contributing

Contributions are welcome!

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m "feat: add my feature"`
4. Push to your branch: `git push origin feature/my-feature`
5. Open a Pull Request.

Found a bug? Use `/bugs` inside GitNova to report it directly — or open an issue at [github.com/nourddinak/GitNova/issues](https://github.com/nourddinak/GitNova/issues).

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

Developed with ❤️ by **[nourddinak](https://github.com/nourddinak)**
