# <u>**Changelog**</u>

> [中文](CHANGELOG.md) | [English](CHANGELOG_EN.md)

---

## v1.1.0

### Project Management

- **New Project Wizard** — Modal dialog guiding creation: parent directory selection, folder name validation, template choice (Default: 10 cards / Empty: 1 card), open in current or new window
- **Project Templates** — Two built-in: Default (all 10 preset cards), Empty (1 custom card, from scratch)
- **Pre-open Validation** — Validates `userData.json` before opening

### Data Import

- **File Import** — Import project data from `.md`/`.txt`, auto-detects task boundaries (`##` / `【】`) and card fields (`**CardName**：`), duplicate handling with skip/overwrite/rename options
- **Drag-and-drop Import** — Drag `.md`/`.txt` onto sidebar for project-level import, onto workspace for card-level import
- **Paste Import (Parse Data)** — Paste text, auto-detect format (task/card level), one-click import

### Data Export

- **Project Export** — Export all tasks as Markdown / plain text, default filename `{ProjectName}_{Date}_{Timestamp}`
- **Task Export** — Right-click task → export current task as `.md`
- **Card Export** — Right-click card → export single card as `.md`
- **Drag-out Card Export** — Drag card body outside window, release to export to desktop
- **Drag-out Task Export** — Drag task index marker outside window, release to export to desktop

### Task Management

- **Context Menu** — Right-click task items: Rename / Delete / Duplicate / Export Task / Insert Empty Above / Insert Default Above / Insert Empty Below / Insert Default Below / Reorder
- **Auto-save** — Saves on task switch, project close, before export, before main process requests close

### Shortcut System

- **23 Configurable Operations** — Key binding/unbinding, enable/disable, per-item reset, reset all to defaults
- **Coverage** — File (save/open/new/close/import/export), Task (new/delete/rename/duplicate), Edit (copy preview/clear/add custom card), Navigation (task switch/card switch/sidebar), Tools (search/settings), Layout (reset)

### Global Search

- `Ctrl+Shift+F` full-text search across all tasks' card content
- Results grouped by task, click to jump with 2-second highlight

### Card Context Menu

- Right-click card menu: Rename / Clear / Delete (hide preset / delete custom) / Export
- Custom cards support dynamic add/remove

### AI Spec Document

- File → AI Spec, semi-modal window viewing AI data output format specification
- Chinese/English toggle at top, one-click copy raw text at bottom

### Theme

- Dark / Light / Default / Follow System (4 modes)
- Real-time switching

### Instance Lock & Process Management

- **Single Instance Lock** — `%APPDATA%\ai-prompt-helper\.app-lock.json` prevents multi-launch
- **Zombie Detection** — Stale lock > 45s triggers auto-takeover
- **Watchdog** — Window not shown within 15s triggers auto-exit
- **`--force` Argument** — Force-terminate old process and relaunch

### Logging System

- **4 Log Levels** — ERROR / WARN / INFO / DEBUG
- **17 Categories** — LIFECYCLE / FILE / TASK / UI / IPC / ERROR / LOCK / CONFIG / WINDOW / THEME / LANGUAGE / SETTINGS / SHORTCUT / PROJECT / IMPORT / EXPORT / SEARCH
- **7-day Auto-cleanup** — One file per language per day (`yyyy-MM-dd_zh-CN.txt` / `yyyy-MM-dd_en.txt`)
- **Debug Preview** — Terminal-style live log viewer with color-coded levels

### Language

- Chinese / English switching, restart to apply
- `--cn` argument forces Chromium built-in pages to Chinese

### Close Behavior

- Three modes: Quit / Hide to Tray / Hide to Taskbar
- Tray: double-click to restore, right-click to quit

### Recent Projects

- Last 20 projects, individually removable, missing paths grayed out

### UI Improvements

- Start page optimization with guidance when no project is open
- Card layout: drag reorder, collapse/expand, height adjustment
- Status bar: save status, path, task count, card count
- Multi-window support (File → New Window)

### Performance & Stability

- Module splitting — `projectImport.js`, `globalSearch.js`, `settingsDialog.js`, `createProjectDialog.js`, `shortcuts.js`, `aiSpecContent.js`, `mdToHtml.js` as independent modules
- Show window after first frame composite to avoid white flash
- Close-save timeout protection to prevent zombie processes
- Debounced window display to prevent message backlog

### Launch Arguments

- `--force` — Force launch, skip instance lock
- `--test` — Enable Chrome DevTools remote debugging (9222) + chrome://tracing
- `--cn` — Force Chromium built-in pages to Chinese
- `--no-sandbox` — Disable sandbox (default in dev mode)
