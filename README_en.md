# AI Prompt Helper

> [中文](README.md) | [English](README_EN.md)
>
> Installation Guide: [INSTALL_EN.md](INSTALL_EN.md)

---

## Overview

AI Prompt Helper is a desktop tool for AI video/image generation workflows. It breaks down prompts into dimension-based cards. Content filled into cards is combined in real time into structured prompts, ready to copy to clipboard with one click.

**Runtime**: Electron 34, Windows 64-bit.

---

## Installation

### Portable Edition

Download the `win-unpacked` archive from the Releases page, extract it, enter the `win-unpacked` directory, and double-click `AI提示词助手.exe` to run. No installation required — no registry writes, can be placed anywhere.

### Installer Edition

Download `AI提示词助手 Setup x.x.x.exe` and run the setup wizard. Administrator privileges are required. Default install path: `C:\Program Files\AI提示词助手`. Desktop shortcut and Start Menu entry are created automatically after installation.

Uninstall: Control Panel → Programs and Features → AI提示词助手. Uninstalling also deletes user data under `%APPDATA%\ai-prompt-helper\`.

---

## Launch Arguments

Append to the "Target" field of the shortcut. Multiple arguments separated by spaces.

| Argument | Description |
|----------|-------------|
| `--force` | Skip instance lock check, force launch. Terminates existing process if present first. |
| `--test` | Enable Chrome DevTools remote debugging port (9222), open chrome://tracing window. |
| `--cn` | Force Chromium built-in pages (e.g. DevTools) language to Chinese. Does not affect app UI language. |
| `--no-sandbox` | Disable Electron sandbox. Included by default in dev mode (`npm start`). |

Example (PowerShell):

```powershell
& "C:\Program Files\AI提示词助手\AI提示词助手.exe" --force
```

---

## Instance Lock

Only one instance of the app is allowed at a time.

- **Lock file**: `%APPDATA%\ai-prompt-helper\.app-lock.json`, content: `{"pid":<processID>,"ts":<timestamp>}`.
- **Stale threshold**: If the lock file exists, the corresponding process is alive, but the timestamp exceeds **45 seconds**, it is treated as a zombie process and automatically taken over.
- **Watchdog**: If the window does not fire the `show` event within **15 seconds** after creation, the app auto-exits to prevent invisible zombie processes.

**Manual recovery**: If you see "Another instance is running" but no window is visible, delete the `.app-lock.json` file above and relaunch, or launch with `--force`.

---

## Interface Layout

```
┌─────────────────────────────────────────────────────────┐
│  File  Layout  Settings                  ─  ❐  ✕       │  ← Toolbar
├────────────┬────────────────────────────────────────────┤
│  Task List │  Parse Data  Import Data  Export  + Card   │
│  ────────  │  ┌──────────┐  ┌──────────┐               │
│  ☰ Task1   │  │ ★ Subject │  │ ★ Scene  │               │  ← Card area
│  ☰ Task2   │  │ [content] │  │ [content]│               │
│  ☰ Task3   │  └──────────┘  └──────────┘               │
│  + New     │                                            │
│            │  ┌─────────────────────────┐               │
│            │  │  Prompt Preview          │  [Copy][Clear]│  ← Preview
│            │  │  **Subject**: xxx         │               │
│            │  │  **Scene**: xxx           │               │
│            │  └─────────────────────────┘               │
│            │  Saved ✓  | D:\project | Tasks: 3 | ...   │  ← Status bar
└────────────┴────────────────────────────────────────────┘
```

**Toolbar buttons**:

| Button | Description |
|--------|-------------|
| `[|]` | Collapse/expand sidebar |
| `File` | Dropdown: Open Project, New Window, New Project, Close Project, Import/Export, Tutorial, AI Spec, Quit |
| `Layout` | Dropdown: Reset current task layout, Reset all task layouts |
| `Settings` | Dropdown: Global Search, More Settings |
| `─` / `❐` / `✕` | Minimize, Maximize, Close |

**Workspace buttons**:

| Button | Description |
|--------|-------------|
| `Parse Data` | Paste text in dialog, auto-detect format and import as tasks or cards |
| `Import Data` | Open file picker, import card data from `.md`/`.txt` into current task |
| `Export Task` | Export current task card data as a Markdown file |
| `+ Custom Card` | Add a custom-named card to the current task |

---

## Core Concepts

### Project

A project corresponds to a folder; data is stored in `userData.json`. Only one project can be open at a time.

**Project Templates**: Two options when creating a project:

| Template | Initial State |
|----------|---------------|
| Default | 10 preset cards (Subject, Scene, Lighting, Style, Shot Scale, Camera Movement, Time & Rhythm, Action, Technical, Negative) |
| Empty | 1 custom card, all preset cards hidden |

### Task

Top-level organizational unit within a project. Each project can contain multiple independent tasks. Tasks are isolated from each other. Each task has its own:

- Card data (`fields`)
- Card layout (`layoutData`)
- Hidden fields (`hiddenFields`)
- Rename labels (`fieldLabels`)
- Custom cards (`customCards`)
- Card order (`cardOrder`)

**Auto-save**: Data is automatically saved to `userData.json` on:
- Task switch
- Project close
- Before export
- Before main process requested close (`onSaveBeforeClose`)

Manual save shortcut: `Ctrl+S`.

### Cards

Each card is a labeled text input area. Two types:

**Preset Cards** (10, from `config/fieldConfig.json`):

| Key | Label | Description |
|-----|-------|-------------|
| `subject` | Subject | Subject appearance, ethnicity, build, clothing, pose, material texture, facial details |
| `scene` | Scene | Location type, spatial scale, environmental elements, weather, atmosphere |
| `lighting` | Lighting | Key light direction & type, color temperature, fill light, contrast, special effects |
| `style` | Style | Art style, genre, rendering style, color scheme, reference artists |
| `shotScale` | Shot Scale | Framing range, aspect ratio, camera angle, composition rules |
| `cameraMove` | Camera Movement | Camera motion type, speed and rhythm |
| `time` | Time & Rhythm | Frame rate, slow motion / time-lapse / normal speed, temporal feel |
| `action` | Action | Specific actions, changes, behavioral logic happening in frame |
| `tech` | Technical | Resolution, sampler, CFG, steps, LoRA weights, etc. |
| `negative` | Negative | Elements to exclude, described in negation (no / without / exclude) |

**Custom Cards**: Added via the `+ Custom Card` button in the workspace. Label is user-defined; values stored in the task's custom cards array.

**Card Operations**:

| Operation | How |
|-----------|-----|
| Input content | Click card text field and type |
| Reorder | Drag the `★` handle on the left of card up or down |
| Resize height | Drag the bottom edge handle of the card |
| Hide preset card | Right-click card → Delete (only hides, data preserved) |
| Delete custom card | Right-click card → Delete (permanently removed) |
| Rename | Right-click card → Rename |
| Clear | Right-click card → Clear |
| Export | Right-click card → Export as `.md` file |
| Tab navigation | Tab to next card field, Shift+Tab to previous |

---

## Task Operations

### Basic Operations

| Operation | How |
|-----------|-----|
| Create | Click `+` in sidebar, or `Ctrl+N` |
| Switch | Click task name in sidebar |
| Rename | Right-click task → Rename, or `F2` |
| Duplicate | Right-click task → Duplicate, or `Ctrl+D` |
| Delete | Right-click task → Delete (shows confirmation dialog) |

### Context Menu

Right-clicking a task in the sidebar shows:

| Item | Description |
|------|-------------|
| Reorder | Change task position in list (enter new index) |
| Rename | Edit task name |
| Export Task | Export current task cards as `.md` file |
| Insert Empty Above | Insert an empty-template task above |
| Insert Default Above | Insert a default-template task above |
| Insert Empty Below | Insert an empty-template task below |
| Insert Default Below | Insert a default-template task below |

### Drag-out Export

Hold the index marker of a task item and drag outside the window. On release, the task data is exported as `{TaskName}.md` to the desktop.

---

## Import

The app provides multiple import methods.

### File Import

Entry: File → Import Project Data. Select `.md` or `.txt` file; parsed content is imported as tasks. Existing tasks in the current project are not cleared.

**Import flow**:
1. Parse file content, identify task boundaries by `## TaskName` or `【TaskName】`
2. Parse card data by `**CardName**：content` format
3. If duplicate task names exist, prompt with handling options

**Duplicate task handling options**:

| Option | Behavior |
|--------|----------|
| Skip | Do not import this task, keep existing data |
| Skip All | Skip all subsequent duplicate-name tasks |
| Overwrite | Completely replace existing task with imported data (cards, layout, custom cards) |
| Overwrite All | Overwrite all subsequent duplicates |
| Rename | Import as "TaskName_1", do not overwrite |
| Rename All | Auto-rename all subsequent duplicates |

### Drag-and-drop Import

Drag `.md` or `.txt` files from file manager into the app window:

| Drop Target | Behavior |
|-------------|----------|
| Sidebar title area | Triggers project-level import (as tasks) |
| Sidebar task list area | Triggers project-level import |
| Workspace "Import Data" button | Imports card data into current active task |
| Workspace blank area | Imports card data into current active task |

### Paste Import

Entry: Workspace "Parse Data" button. Paste text in the dialog; the system auto-detects format:

- **Task-level**: lines with `##` or `【】` task titles + `**`-wrapped card fields → added as tasks
- **Card-level**: lines with `###` section markers + `**content**` fields → imported into current active task

The dialog header displays the detected format type ("Task-level data" or "Card-level data").

---

## Export

### Project Export

Entry: File → Project Data Export → Export as Markdown / Export as Text.

Exports all task data to a single file. Auto-generated default filename: `{ProjectName}_{DateTime}_{Timestamp}.md` (or `.txt`).

**Markdown format**:
```markdown
## N. TaskName

**CardLabel**：content
```

**Text format**:
```
【TaskName】

CardLabel：content
```

**Export rules**:
- Hidden preset cards are not exported
- Empty cards are not exported
- Cards are ordered by configuration (preset cards first, then custom; custom cards follow `cardOrder`)
- Labels use localized text matching current interface language

After successful export, a file path prompt is shown — one-click copy available.

### Drag-out Card Export

Hold the card body area (not the `★` handle, buttons, or text field) and drag outside the window. On release, card content is exported as `{CardLabel}.md`. Save to desktop or folder.

Dragging the `★` handle for reordering: if the ghost card is dragged outside the window and released, card export is triggered; if the mouse returns inside the window before release, reordering completes normally.

Dragging an empty-content card triggers a toast: "Card is empty, not exported".

### Task Export

Entry: Right-click task → Export Task. Exports all card data of the selected task as `.md` file.

### Card Right-click Export

Entry: Right-click card → Export. Exports the label and content of a single card as `.md` file.

---

## Preview & Copy

The preview area at the bottom of the workspace combines all visible card content in real time, matching the Markdown export format. Each card is displayed as:

```
**CardLabel**：content
```

**Copy** button (shortcut `Ctrl+Shift+C`) writes preview content to clipboard. **Clear** button (shortcut `Ctrl+Shift+A`) clears all card input fields in the current task.

---

## Global Search

Entry: Shortcut `Ctrl+Shift+F`, or Settings → Global Search.

Opens a search panel that searches across **all card content in all tasks** of the current project. Results grouped by task; click results to jump to the corresponding card input position.

---

## More Settings

Entry: Settings → More Settings. Left sidebar menu, right content area. Dialog can be moved by dragging the title bar, resized by dragging the bottom-right corner.

### 1. Close Behavior

| Option | Behavior |
|--------|----------|
| Quit | Close button exits the entire application |
| Hide to Tray | Close button minimizes to system tray, runs in background |
| Hide to Taskbar | Close button minimizes to taskbar |

### 2. Theme

| Option | Description |
|--------|-------------|
| Light | Light color scheme |
| Dark | Dark color scheme |
| Default | Built-in default theme |
| Follow System | Auto-switch via `prefers-color-scheme` |

### 3. Shortcut Settings

Lists all **23** configurable operations. Each item displays:

- Operation name and description
- Current key binding (click to record new keys)
- Enable/Disable toggle

Supports per-item reset to default and reset all to defaults.

### 4. Language

Dropdown: Chinese or English. Requires app restart to take effect.

### 5. Logs

Lists log files from the last **7 days**, showing filename, date, time, language, file size, and status label. Each entry can be opened with the system default text editor via the "Open" button. Log directory path is copyable via click.

Log levels: ERROR, WARN, INFO, DEBUG. One file per language per day (format: `yyyy-MM-dd_zh-CN.txt`, `yyyy-MM-dd_en.txt`).

The app writes logs via `logger.js`, with 17 categories (LIFECYCLE, FILE, TASK, UI, IPC, ERROR, LOCK, CONFIG, WINDOW, THEME, LANGUAGE, SETTINGS, SHORTCUT, PROJECT, IMPORT, EXPORT, SEARCH).

### 6. About

Displays app name, version, description, and links (repository, docs, Issues). Links are copyable via click.

### 7. Debug Preview

Terminal-style real-time log viewer. Dark background, monospace font, read-only. Displays debug logs generated by the `DebugLog` module at runtime, each formatted as:

```
HH:MM:SS.mmm  [Level]  filename#method : message
```

Four log levels are color-coded: DEBUG (green), INFO (blue), WARN (orange), ERROR (red).

Includes "Clear" button and "Auto-scroll" checkbox.

---

## AI Spec

Entry: File → AI Spec. Opens a semi-modal window displaying the AI data output format specification. Top bar has Chinese/English toggle; content area shows rendered Markdown text; bottom "Copy" button copies raw text to clipboard.

Spec documents at project root:

- Chinese: [AI数据输出格式规范.md](AI数据输出格式规范.md)
- English: [AI_Data_Output_Format_Spec.md](AI_Data_Output_Format_Spec.md)

---

## Tutorial

Entry: File → Tutorial. Opens a standalone tutorial window explaining app usage.

---

## Shortcut Reference

All 23 operations with their default bindings. Unbound operations require manual assignment in Settings.

| Category | Operation | Default Shortcut | Default Status |
|----------|-----------|-----------------|----------------|
| File | Save All Data | `Ctrl+S` | On |
| File | Open Project | `Ctrl+O` | On |
| File | New Project | `Ctrl+Shift+N` | On |
| File | Close Project | `Ctrl+W` | On |
| File | Import Project Data | — | Unbound |
| File | Export as Markdown | — | Unbound |
| File | Export as Text | — | Unbound |
| Task | New Task | `Ctrl+N` | On |
| Task | Delete Current Task | `Delete` | Unbound |
| Task | Rename Current Task | `F2` | On |
| Task | Duplicate Current Task | `Ctrl+D` | On |
| Edit | Copy Preview | `Ctrl+Shift+C` | On |
| Edit | Clear All Inputs | `Ctrl+Shift+A` | Unbound |
| Edit | Add Custom Card | — | Unbound |
| Navigation | Focus Next Task | `Ctrl+↓` | On |
| Navigation | Focus Previous Task | `Ctrl+↑` | On |
| Navigation | Focus Next Input | `Ctrl+→` | On |
| Navigation | Focus Previous Input | `Ctrl+←` | On |
| Navigation | Toggle Sidebar | `Ctrl+B` | On |
| Tool | Global Search | `Ctrl+Shift+F` | On |
| Tool | Open Settings | `Ctrl+,` | On |
| Layout | Reset Current Task Layout | — | Unbound |
| Layout | Reset All Layouts | — | Unbound |

---

## Data Storage

### Project Data

Each project's data is stored in `userData.json` inside the project folder, alongside other project files. Data structure:

```json
{
  "tasks": [
    {
      "id": "task_unique_id",
      "name": "Task Name",
      "fields": {
        "subject": "Subject content",
        "scene": "Scene content",
        "...": "..."
      },
      "layoutData": { "subject": 80, "scene": 120 },
      "hiddenFields": ["shotScale", "cameraMove"],
      "fieldLabels": { "subject": "Custom Label" },
      "customCards": [{ "key": "custom_xxx", "label": "Extra Dimension" }],
      "cardOrder": ["subject", "scene", "custom_xxx"]
    }
  ]
}
```

### User Configuration

Stored in `%APPDATA%\ai-prompt-helper\config\`, copied from `app.asar` defaults on first launch. Files:

| File | Content |
|------|---------|
| `settings.json` | Close behavior and general settings |
| `theme.json` | Theme selection |
| `shortcuts.json` | Shortcut key bindings |
| `language.json` | Interface language |
| `recent-projects.json` | Recent project path records (up to 20) |

### Logs

Stored in `%APPDATA%\ai-prompt-helper\logs\`. Files older than 7 days are auto-cleaned.

---

## Development

**Requirements**: Node.js 18+.

```bash
# Install dependencies
npm install

# Start dev mode (with --no-sandbox)
npm start

# Build installer
npm run build:win
```

**Tech Stack**:

| Item | Value |
|------|-------|
| Framework | Electron 34 |
| UI | Vanilla HTML / CSS / JavaScript |
| Packaging | electron-builder 26, NSIS installer |
| Icon | `assets/H.ico` |

---

## Directory Structure

**Source**:

```
AI_Helper/
├── main.js                       # Main process
├── preload.js                    # Preload script
├── logger.js                     # Logging module
├── aiSpecContent.js              # AI spec content (CN/EN)
├── mdToHtml.js                   # Markdown to HTML converter
├── package.json                  # Project config
├── config/                       # Default configuration
│   ├── fieldConfig.json          # Card field definitions
│   ├── promptTemplates.json      # Project templates
│   ├── strings.json              # Chinese UI strings
│   ├── strings_en.json           # English UI strings
│   ├── window.json               # Window defaults
│   └── urls.json                 # Official URLs
├── renderer/                     # Renderer process
│   ├── index.html                # Main page (CN)
│   ├── index_en.html             # Main page (EN)
│   ├── tutorial.html             # Tutorial page
│   ├── styles/main.css           # Stylesheet
│   └── scripts/
│       ├── app.js                # App entry & coordination
│       ├── sidebar.js            # Sidebar task management
│       ├── content.js            # Card rendering & interaction
│       ├── toolbar.js            # Toolbar menus
│       ├── shortcuts.js          # Shortcut management
│       ├── exportManager.js      # Project export
│       ├── projectImport.js      # Project import & parsing
│       ├── import.js             # Card drag-drop import
│       ├── settingsDialog.js     # More Settings dialog
│       ├── globalSearch.js       # Global search
│       ├── aiSpecDialog.js       # AI Spec dialog
│       ├── createProjectDialog.js # New project wizard
│       ├── debugLog.js           # Debug log utility
│       ├── fileManager.js        # File read/write
│       ├── mdToHtml.js           # Markdown to HTML (renderer)
│       └── aiSpecContent.js      # AI spec content (renderer)
├── assets/H.ico                  # App icon
└── scripts/update-asar.js        # Build script
```

---

## License

MIT
